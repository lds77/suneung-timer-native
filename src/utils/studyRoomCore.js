// 스터디룸(같이 공부) — 순수 로직부. 설계: docs/realtime-study-design.md
// Firebase 의존 없음 — 방코드/닉네임 검증, presence 페이로드, 표시 규칙, 정렬.
// 부수효과(네트워크)는 studyRoom.js가 담당. 테스트: __tests__/studyRoomCore.test.js

import { COUNTUP_MAX_SEC, wallElapsedSec } from './timerCore';

// 방 코드: 혼동 문자(0/O/1/I/L) 제외 6자
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LEN = 6;
export const MAX_ROOM_MEMBERS = 30;

export const genRoomCode = (rand = Math.random) =>
  Array.from({ length: ROOM_CODE_LEN }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('');

export const isValidRoomCode = (s) =>
  typeof s === 'string' && s.length === ROOM_CODE_LEN && [...s].every(c => CODE_CHARS.includes(c));

// 코드 입력 정규화: 대문자화 + 공백 제거 (0/O/1/I/L은 코드에 없어 검증에서 걸러짐)
export const normalizeRoomCode = (raw) =>
  String(raw || '').toUpperCase().replace(/\s/g, '').slice(0, ROOM_CODE_LEN);

// 텍스트에서 초대 코드 추출 — 클립보드에 공유 메시지 전체가 들어 있어도 코드만 찾는다.
// 영숫자 연속 토큰 중 정확히 6자이고 CODE_CHARS만으로 된 첫 번째를 반환 (없으면 null).
// 스토어 URL의 긴 영숫자 런(길이≠6)이나 IPHONE 같은 단어(제외 문자 포함)는 걸러진다
export const extractRoomCode = (text) => {
  if (typeof text !== 'string' || !text || text.length > 2000) return null;
  const tokens = text.toUpperCase().match(/[A-Z0-9]+/g) || [];
  for (const tok of tokens) {
    if (tok.length === ROOM_CODE_LEN && isValidRoomCode(tok)) return tok;
  }
  return null;
};

// 공개 라운지 — 고정 코드의 전체 공개방. 코드가 없는 유저도 스터디룸을 체험하는 통로.
// 첫 입장자가 방을 생성(lazy), 가득 차면(30명) 다음 호점으로 자동 안내.
// 코드는 CODE_CHARS 부분집합이어야 함 (테스트로 강제)
export const LOUNGE_CODES = ['STUDY2', 'STUDY3', 'STUDY4', 'STUDY5'];
export const loungeNameFor = (code) => {
  const idx = LOUNGE_CODES.indexOf(code);
  return idx <= 0 ? '열공 라운지' : `열공 라운지 ${idx + 1}`;
};
export const isLoungeCode = (code) => LOUNGE_CODES.includes(code);

// 닉네임: 2~12자, 앞뒤 공백 제거. 금칙어 포함 검사 — 완벽하진 않고(공개 라운지 UGC 1차 방어),
// 우회(띄어쓰기/구분자 삽입) 대응 위해 정규화 문자열도 함께 검사. 최종 방어는 숨기기/신고.
const BAD_WORDS = [
  '시발', '씨발', '시바', '씨바', '시팔', '씨팔', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '개색', '개세',
  '지랄', 'ㅈㄹ', '좆', '존나', 'ㅈㄴ', '썅', '씹', 'ㅆㅂ', '자지', '보지', '섹스', '섹스', '창녀', '걸레', '느금',
  'fuck', 'fuk', 'fck', 'shit', 'sex', 'bitch', 'pussy', 'dick', 'asshole', 'nigger',
];
// 공백·구분자(_.-·) 제거 + 소문자화 — "시 발", "s.e.x" 같은 우회 차단
export const normalizeForFilter = (s) => String(s || '').toLowerCase().replace(/[\s_.\-·*]/g, '');
export const validateNickname = (raw) => {
  const v = String(raw || '').trim();
  if (v.length < 2) return { ok: false, reason: '닉네임은 2자 이상이어야 해요' };
  if (v.length > 12) return { ok: false, reason: '닉네임은 12자 이하여야 해요' };
  const low = v.toLowerCase();
  const norm = normalizeForFilter(v);
  if (BAD_WORDS.some(w => low.includes(w) || norm.includes(w))) return { ok: false, reason: '사용할 수 없는 단어가 있어요' };
  return { ok: true, value: v };
};

// 신고 페이로드 — 서버 /reports에 쌓아 콘솔에서 검토 (자동 처리는 약속하지 않음: 검토 인력 없음).
export const buildReport = (roomId, reportedUid, reportedNick, byUid, byNick, nowMs = Date.now()) => ({
  roomId: String(roomId || '').slice(0, 6),
  reportedUid: String(reportedUid || '').slice(0, 64),
  reportedNick: String(reportedNick || '').slice(0, 12),
  byUid: String(byUid || '').slice(0, 64),
  byNick: String(byNick || '').slice(0, 12),
  at: nowMs,
});

// 활성 타이머 → presence 페이로드.
// 규칙(설계 3.2): running만 studying, 일시정지는 idle('공부 중' 신뢰 우선),
// 뽀모/연속 휴식 페이즈는 studying 유지 + '휴식 중' 라벨. RTDB는 undefined 금지 — null 정규화
// 예정 종료 시각(ms) — 끝이 정해진 타이머만 (countdown/연속). 자유·뽀모(무한 반복)·랩은 null.
// iOS는 백그라운드에서 하트비트가 불가능하므로, 친구 화면이 이 시각까지 '공부 중'을 유지하는 근거가 된다.
// 10초 단위 반올림 — presence 시그니처가 호출 시각에 따라 매번 달라지는 것 방지 (재전송 억제)
export const plannedEndAtOf = (t, nowMs = Date.now()) => {
  if (!t || t.status !== 'running') return null;
  const elapsed = t.resumedAt
    ? (t.elapsedSecAtResume || 0) + (nowMs - t.resumedAt) / 1000
    : (t.elapsedSec || 0);
  let remainSec = null;
  if (t.type === 'countdown') {
    remainSec = Math.max(0, (t.totalSec || 0) - elapsed);
  } else if (t.type === 'sequence') {
    const items = t.seqItems || [];
    const idx = t.seqIndex || 0;
    const breakSec = t.seqBreakSec || 0;
    // 현재 페이즈 잔여 + 이후 항목들(각 항목 앞에 휴식) 합산
    remainSec = t.seqPhase === 'work'
      ? Math.max(0, (t.totalSec || 0) - elapsed)
      : Math.max(0, breakSec - elapsed);
    for (let i = idx + 1; i < items.length; i++) {
      if (t.seqPhase === 'work' || i > idx + 1) remainSec += breakSec; // 남은 경계 수만큼 휴식
      remainSec += items[i].totalSec || 0;
    }
  }
  if (remainSec === null) return null;
  return Math.round((nowMs + remainSec * 1000) / 10000) * 10000;
};

// 하트비트 자격 — 강제종료된 앱의 running 스냅샷(좀비)이 친구 화면 '공부 중'을 무한 연장하는 것 방지.
// 끝이 정해진 타이머(카운트다운/연속)는 예정 종료+1분까지, 끝이 없는 타이머는 벽시계 경과
// 5시간(COUNTUP_MAX_SEC)까지만 인정. 자유는 불변식 9의 자동 종료와 같은 기준이고,
// 뽀모도로는 페이즈 전환에 앱 JS가 필요하므로 5시간 무접촉이면 죽은 스냅샷으로 간주
export const heartbeatEligible = (t, nowMs = Date.now()) => {
  if (!t || t.type === 'lap' || t.status !== 'running') return false;
  // 예정 종료는 '지금'이 아니라 재개 시점 기준으로 계산해야 한다 — nowMs 기준이면 잔여가
  // 0으로 클램프돼 이미 지난 타이머도 '지금 종료 예정'이 되어 좀비 판별이 영원히 안 된다
  const end = plannedEndAtOf(t, t.resumedAt || nowMs);
  if (end !== null) return nowMs <= end + 60 * 1000;
  return wallElapsedSec(t, nowMs) < COUNTUP_MAX_SEC;
};

// 공부 모드 3단계 — 친구에게 공부 강도 전달:
// book = 편하게(screen_off) / fire = 집중(screen_on 잠금) / ultra = 울트라집중(screen_on + 시험 강도)
export const PRESENCE_MODES = ['book', 'fire', 'ultra'];
export const presenceModeOf = (focusMode, ultraFocusLevel = 'normal') =>
  focusMode === 'screen_on' ? (ultraFocusLevel === 'exam' ? 'ultra' : 'fire') : 'book';

// endedAt — 마지막으로 공부를 멈춘(종료·일시정지) 벽시계 시각. 다른 사람 화면의 '방금 전까지'(온기) 판정에 쓴다.
//   공부 중에는 null(RTDB update에서 null = 삭제)이라 공부 중인 사람에게는 남지 않는다.
//   2026-11-11 추가 — 규칙(status/$uid/endedAt)을 먼저 게시해야 한다. 안 하면 $other 거부로 전송 전체가 실패한다
// endedMode — 멈추기 직전까지 공부하던 모드. trackPresence가 기억해 넘긴다 (아래 mode 주석)
export const buildPresence = (activeTimer, { todaySec = 0, today, nowMs = Date.now(), focusMode = null, ultraFocusLevel = 'normal', endedAt = null, endedMode = null } = {}) => {
  const t = activeTimer;
  const running = !!t && t.type !== 'lap' && t.status === 'running';
  const inBreak = running && (
    (t.type === 'pomodoro' && t.pomoPhase !== 'work') ||
    (t.type === 'sequence' && t.seqPhase === 'break')
  );
  const endKnown = !running && Number.isFinite(endedAt) && endedAt > 0;
  return {
    state: running ? 'studying' : 'idle',
    // 라벨은 60자 클램프 — 서버 규칙(subjectLabel ≤ 60)과 쌍. 입력 maxLength(50)보다 넉넉한 안전판
    subjectLabel: running ? (inBreak ? '휴식 중' : String(t.label || '').slice(0, 60)) : '',
    startedAt: running ? (t.startedAt ?? null) : null,
    // ★멈춘 뒤에도 끝난 시각을 알면 마지막 모드를 남긴다 — 식어 가는 자리를 공부하던 그 색으로 옅게 칠한다
    //   (2026-11-11 사용자: 주황 온기가 집중·울트라와 헷갈린다 → 그 사람의 모드 색을 옅게).
    // ★멈춘 뒤의 모드는 '지금 설정'(focusMode)으로 계산하지 않는다 — **공부하던 때의 모드**(endedMode)를 받는다.
    //   타이머가 끝나면 앱이 곧바로 focusMode를 null로 되돌려서(deactivateFocusMode), 1초 뒤에 나가는
    //   '멈춤' 전송은 늘 book이 됐다 — 집중·울트라로 공부해도 온기가 녹색이었다 (2026-11-12 사용자 실기기).
    //   끝난 시각이나 그때의 모드를 모르면 칸을 건드리지 않는다 — null은 서버 값을 지우고, 짐작은 틀린 색을 칠한다
    ...(running ? { mode: presenceModeOf(focusMode, ultraFocusLevel) }
      : endKnown && PRESENCE_MODES.includes(endedMode) ? { mode: endedMode } : {}),
    plannedEndAt: running ? plannedEndAtOf(t, nowMs) : null,
    todaySec: Math.max(0, Math.min(86400, Math.round(todaySec))),
    date: today ?? null,
    // ★끝난 시각을 모르면 칸을 아예 싣지 않는다 — null을 실으면 RTDB update가 서버의 값을 지운다.
    //   스터디룸 화면이 입장할 때 endedAt 없이 한 번 보내는 바람에, 집중 탭에서 끝내고 라운지를 여는 순간
    //   방금 남긴 온기가 지워졌다 (2026-11-11 사용자 실기기). 지우는 것은 공부 중일 때뿐이다
    ...(running ? { endedAt: null } : endKnown ? { endedAt: Math.round(endedAt) } : {}),
    updatedAt: nowMs,
  };
};

// presence 시그니처 — 같은 값 재전송 방지용 (elapsed 틱 제외, 상태 변화만)
export const presenceSig = (p) => `${p.state}|${p.subjectLabel}|${p.startedAt || 0}|${p.mode || ''}|${p.plannedEndAt || 0}|${p.todaySec}|${p.date}|${p.endedAt || 0}`;

// 공부를 멈춘 순간의 벽시계 시각 — '실행 중 → 멈춤'을 본 그때 부른다. lastActive는 마지막으로 본 실행 중 타이머.
// ★끝이 정해진 타이머가 앱이 멈춰 있는 동안 스스로 끝났으면 지금이 아니라 예정 종료가 끝난 시각이다.
//   지금을 쓰면 100분 전에 끝난 공부가 복귀하는 순간 '방금 전까지'로 30분간 되살아난다 (2026-11-11 아스트라 W-03).
//   사람이 직접 멈춘 경우(예정 종료 전)와 끝이 없는 타이머는 지금이다.
// ※세션 기록의 endedAt(시작 + 실공부시간)은 쓰지 않는다 — 일시정지만큼 이르고 날짜도 시작일이라
//   맞는 값을 더 이른 값으로 덮었다 (W-04). 앱을 다시 켜면 저장해 둔 이 값을 되살린다(useAppState)
export const stopMomentOf = (lastActive, nowMs = Date.now()) => {
  const planned = lastActive ? plannedEndAtOf(lastActive, lastActive.resumedAt || nowMs) : null;
  return Number.isFinite(planned) && planned < nowMs ? planned : nowMs;
};

// 공부 → 멈춤을 따라가는 기억 (순수). 타이머 상태가 바뀔 때마다 부르고, 돌려준 값을 다음 호출에 넘긴다.
//   wasRunning  직전에 실행 중이었나
//   endedAt     마지막으로 멈춘 시각 — 공부 중이면 null
//   endedMode   그때 공부하던 모드 — buildPresence가 멈춘 뒤의 mode로 싣는다
//   runningMode 공부 중에 마지막으로 본 모드. 멈추는 순간 endedMode가 된다
//   lastActive  마지막으로 본 실행 중 타이머 — 스스로 끝났으면 예정 종료를 끝난 시각으로 쓴다(stopMomentOf)
// ★모드는 **실행 중일 때 본 값**을 쓴다. 멈춘 뒤에 focusMode를 읽으면 이미 null이다 (buildPresence의 mode 주석).
// ★멈춘 시각은 **멈춘 것을 본 그 호출의 nowMs**다. 그래서 전송(1초 지연)이 아니라 타이머가 바뀐 그때 불러야 한다 —
//   멈추자마자 앱이 내려갔다가 한참 뒤에 돌아오면, 전송 시각으로 정한 값은 '돌아온 시각'이 되어
//   오래전에 끝난 공부가 '방금 전까지'로 되살아난다 (W-03과 같은 부류).
export const EMPTY_PRESENCE_TRACK = Object.freeze({ wasRunning: false, endedAt: null, endedMode: null, runningMode: null, lastActive: null });
export const trackPresence = (prev, activeTimer, { nowMs = Date.now(), focusMode = null, ultraFocusLevel = 'normal' } = {}) => {
  const p = prev || EMPTY_PRESENCE_TRACK;
  const t = activeTimer;
  const running = !!t && t.type !== 'lap' && t.status === 'running';
  if (running) {
    return { wasRunning: true, endedAt: null, endedMode: null, runningMode: presenceModeOf(focusMode, ultraFocusLevel), lastActive: t };
  }
  if (p.wasRunning) {
    return { wasRunning: false, endedAt: stopMomentOf(p.lastActive, nowMs), endedMode: p.runningMode, runningMode: p.runningMode, lastActive: p.lastActive };
  }
  return p;
};

// 오늘 공부한 양을 '책 더미'로 — 숫자 대신 넓은 3단계 (2026-11-11 사용자 결정).
// 1시간마다 한 권이면 오래 공부하는 사람끼리 다시 줄이 선다 → 위쪽을 넓게 묶는다. 0이면 아무것도 안 그린다
export const STACK_STEPS_SEC = [3600, 3 * 3600]; // 1권: ~1시간 미만 / 2권: 1~3시간 / 3권: 3시간 이상
export const todayStack = (todaySec) => {
  const s = Number(todaySec) || 0;
  if (s <= 0) return 0;
  if (s < STACK_STEPS_SEC[0]) return 1;
  if (s < STACK_STEPS_SEC[1]) return 2;
  return 3;
};

// 온기(방금 전까지 공부한 자리) — 끝난 뒤 30분 동안, 시간이 지날수록 옅어진다 (2026-11-11 사용자 아이디어)
export const WARM_MS = 30 * 60 * 1000;
const WARM_SKEW_MS = 60 * 1000; // 기기 시계가 조금 빠른 사람의 endedAt이 '미래'로 와도 1분까지는 막 끝난 것으로 본다
export const warmLevel = (endMs, nowMs = Date.now()) => {
  if (!Number.isFinite(endMs) || endMs <= 0) return 0;
  const age = nowMs - endMs;
  if (age < -WARM_SKEW_MS || age >= WARM_MS) return 0;
  return Math.min(1, Math.max(0, 1 - Math.max(0, age) / WARM_MS));
};

// 서버 status → 표시 상태.
// 규칙(설계 8): studying/bg는 updatedAt 기준 60분까지 신뢰.
//   30분에서 연장(2026-07-18 사용자 결정) — iOS는 bg에서 하트비트가 불가능해 카운트업
//   장시간 공부가 일찍 내려가는 문제. 유령 표시(끄는 걸 잊은 채 방치)는 최대 1시간 수용.
// 예외: plannedEndAt(카운트다운/연속의 예정 종료)이 있으면 그 시각+5분까지 신뢰 연장.
// 안드로이드 장시간 자유모드는 위젯 헤드리스 하트비트(15분 스로틀)가 updatedAt을 갱신해 커버
//   (JS 인터벌은 bg에서 멈추므로 헤드리스 이벤트에 실어야 함 — 실기기 확인된 사실).
// date가 오늘이 아니면 todaySec은 0으로 표시 (자정 리셋은 클라이언트 몫)
export const STALE_MS = 60 * 60 * 1000;
export const PLANNED_END_GRACE_MS = 5 * 60 * 1000;
export const displayStatus = (status, { nowMs = Date.now(), today } = {}) => {
  const s = status || {};
  // plannedEndAt은 신뢰창을 늘리기만 하는 게 아니라 **상한**이기도 하다.
  // 예전엔 연장 조건으로만 써서, 50분 카운트다운이 끝나도 updatedAt이 60분 신뢰창 안이면
  // 친구 화면에 '공부 중'이 최대 60분까지 남았다 (iOS는 백그라운드에서 종료를 못 알리므로
  // 상대가 앱을 열 때까지 계속 공부 중으로 보였다 — 2026-08-02 실기기 제보).
  // 끝이 정해진 타이머(카운트다운/연속)만 plannedEndAt이 있으므로(plannedEndAtOf)
  // 자유·뽀모처럼 끝이 없는 타이머의 60분 신뢰창은 그대로다.
  const fresh = s.plannedEndAt
    ? nowMs < s.plannedEndAt + PLANNED_END_GRACE_MS
    : (nowMs - (s.updatedAt || 0)) < STALE_MS;
  const studying = (s.state === 'studying' || s.state === 'bg') && fresh && !!s.startedAt;
  const bg = studying && s.state === 'bg';
  // 화면끔(📖 book/일반 모드)은 모드 자체가 screen_off이므로 bg 여부와 무관하게 항상 '화면끔' 표식.
  //   (안드는 타이머 포그라운드 서비스가 소켓을 살려둬 화면을 꺼도 state가 'studying'으로 유지됨 —
  //    bg 기준이면 안드에서 책 뱃지가 안 떠서, 모드 기준으로 판정한다.)
  // 화면켬(집중/울트라)에서 소켓이 끊긴(bg) 경우만 잠금 이탈 = 자리비움 가능성 → 흐리게.
  // mode 불명 시엔 '공부 중을 신뢰' 철학에 따라 화면끔(present)으로 관대하게 해석.
  const screenOff = studying && (s.mode || 'book') === 'book';
  // 온기의 끝 시각 — 공부 중이 아닐 때만.
  //   ① 새 앱이 남긴 endedAt. 공부를 끝내고 앱을 닫으면 onDisconnect가 state를 'bg'로 바꾸므로
  //     state가 아니라 '시작 시각 없음'(공부 중이 아니라는 뜻)으로 본다
  //   ② 끝이 정해진 타이머가 백그라운드에서 끝나 알리지 못한 경우 — 예정 종료가 곧 끝난 시각이다.
  //     예전엔 예정 종료+5분까지 공부 중으로 보이다가 갑자기 꺼졌다
  //   끝이 없는 타이머가 60분 신뢰창을 넘겨 내려간 경우는 언제 끝났는지 모르므로 온기를 주지 않는다
  let endMs = null;
  if (!studying) {
    if (Number.isFinite(s.endedAt) && !s.startedAt) endMs = s.endedAt;
    else if ((s.state === 'studying' || s.state === 'bg') && s.startedAt && Number.isFinite(s.plannedEndAt) && s.plannedEndAt <= nowMs) endMs = s.plannedEndAt;
  }
  return {
    studying,
    screenOff,
    maybeAway: bg && !screenOff,
    startedAt: studying ? s.startedAt : null,
    mode: studying ? (s.mode || 'book') : null,
    todaySec: s.date === today ? (s.todaySec || 0) : 0,
    warm: warmLevel(endMs, nowMs),
    // 식어 가는 자리의 색 — 마지막 공부 모드. 모르면(옛 기록) 기본 모드 색
    warmMode: endMs !== null && warmLevel(endMs, nowMs) > 0 ? (s.mode || 'book') : null,
  };
};

// 유령 멤버 판정 — 익명 계정은 앱 삭제 시 영영 못 돌아오는데 명단에는 남아
// 방 정원(30)을 잠식한다. 마지막 생존 신호(가입 or 상태 갱신) 후 14일 무소식이면 정리 대상.
// 정리돼도 앱을 다시 켜면 자동으로 돌아오므로(studyRoom.reconcileMembership) 오탐 피해는 없음
export const GHOST_MS = 14 * 24 * 60 * 60 * 1000;
export const findGhostMembers = (members, status, nowMs = Date.now()) =>
  Object.entries(members || {})
    .filter(([uid, m]) => {
      const lastAlive = Math.max(m?.joinedAt || 0, status?.[uid]?.updatedAt || 0);
      return (nowMs - lastAlive) > GHOST_MS;
    })
    .map(([uid]) => uid);

// 화면에 보일 멤버 — 유령은 정리가 반영되기 전에도 뺀다.
// ★status가 undefined면 아직 못 받았거나 읽을 권한이 없다는 뜻이라 거르지 않는다.★
// 거르면 joinedAt만 남아 '들어온 지 14일 지난 사람'이 활동 중이어도 전부 사라진다
// (2026-11-04 제보: 정리된 폰에서만 인원이 줄어 라운지가 사람마다 따로 있는 것처럼 보였다)
export const visibleMemberEntries = (members, status, nowMs = Date.now()) => {
  const entries = Object.entries(members || {});
  if (status === undefined) return entries;
  const ghosts = new Set(findGhostMembers(members, status, nowMs));
  return entries.filter(([uid]) => !ghosts.has(uid));
};

// 만석 방 입장 시 유령 '후보' — 입장 전엔 status를 읽을 권한이 없어 joinedAt만으로 추림.
// 실제 삭제 가능 여부는 서버 규칙이 status 무활동(14일)까지 검증 — 활동 중인 장기 멤버 삭제는 거부됨.
// 전원 유령이 된 방이 영구 잠기는 것 방지 (정리해줄 활동 멤버가 없는 경우)
export const staleJoinCandidates = (members, nowMs = Date.now()) =>
  Object.entries(members || {})
    .filter(([, m]) => (nowMs - (m?.joinedAt || 0)) > GHOST_MS)
    .map(([uid]) => uid);

// 닉네임 중복 구분 — 같은 닉네임이 2명 이상일 때만 계정 ID 끝 4자를 꼬리표로.
// 시스템 식별은 어차피 uid 기준이라 표시 전용 (겹치지 않으면 꼬리표 없이 깔끔하게)
export const withNicknameTags = (rows) => {
  const counts = {};
  rows.forEach(r => { counts[r.nickname] = (counts[r.nickname] || 0) + 1; });
  return rows.map(r => ({
    ...r,
    displayName: counts[r.nickname] > 1 ? `${r.nickname} #${String(r.uid).slice(-4)}` : r.nickname,
  }));
};

// 자리 배정 — 입장 순서(joinedAt)대로 앞자리부터. 데이터 변경 없이 모든 클라이언트가
// 같은 결과를 계산하는 결정적 규칙 (동시 입장 동률은 uid로 타이브레이크).
// 자리는 먼저 온 멤버가 나가지 않는 한 고정 — '내 자리' 소속감의 근거
export const assignSeats = (rows) =>
  [...rows].sort((a, b) => ((a.joinedAt || 0) - (b.joinedAt || 0)) || String(a.uid).localeCompare(String(b.uid)));

// ── 방 테마 도면 ──
// 구역별 좌석 배치 (0 = 통로/빈 공간). 각 테마마다 좌석 번호 1~30이 정확히 한 번씩 (테스트 강제).
// partition: 칸막이(독서실 부스), board: 칠판(교실). desk: 책상 상판 색
export const TOTAL_SEATS = 30;
export const ROOM_THEMES = {
  cafe: {
    // 사설독서실 홀 느낌: 좌우 벽면 1인석 + 중앙 2인 아일랜드 (통로로 분리) + 상단 창가석.
    // aisleFlex 1 = 통로가 좌석 1칸 폭 → 모든 줄이 6칸 합으로 좌석 크기 통일
    label: '스터디카페', icon: 'cafe-outline', desk: '#B08954', partition: false, board: false, aisleFlex: 1,
    zones: [
      { label: '창가석', rows: [[1, 2, 3, 4, 5, 6]] },
      {
        label: '',
        rows: [
          [7, 0, 8, 9, 0, 10],
          [11, 0, 12, 13, 0, 14],
          [15, 0, 16, 17, 0, 18],
          [19, 0, 20, 21, 0, 22],
          [23, 0, 24, 25, 0, 26],
          [27, 0, 28, 29, 0, 30],
        ],
      },
    ],
  },
  library: {
    label: '독서실', icon: 'book-outline', desk: '#8B7355', partition: true, board: false, aisleFlex: 0.5,
    zones: [
      {
        label: '',
        rows: [
          [1, 2, 3, 0, 4, 5, 6], [7, 8, 9, 0, 10, 11, 12], [13, 14, 15, 0, 16, 17, 18],
          [19, 20, 21, 0, 22, 23, 24], [25, 26, 27, 0, 28, 29, 30],
        ],
      },
    ],
  },
  classroom: {
    label: '교실', icon: 'school-outline', desk: '#D8C9A3', partition: false, board: true, aisleFlex: 0.5,
    zones: [
      {
        label: '',
        rows: [
          [1, 2, 0, 3, 4, 0, 5, 6], [7, 8, 0, 9, 10, 0, 11, 12], [13, 14, 0, 15, 16, 0, 17, 18],
          [19, 20, 0, 21, 22, 0, 23, 24], [25, 26, 0, 27, 28, 0, 29, 30],
        ],
      },
    ],
  },
};
export const themeOf = (t) => ROOM_THEMES[t] || ROOM_THEMES.cafe;

// 좌석 확정: 본인이 고른 seat(멤버 레코드 저장값) 우선 — 중복 선택 레이스는 먼저 입장한
// 사람이 이기고, 밀린 사람/미선택자는 빈 좌석 앞번호부터 자동 착석 (결정적 — 모든 클라이언트 동일)
export const resolveSeats = (rows, totalSeats = TOTAL_SEATS) => {
  const ordered = assignSeats(rows);
  const bySeat = {};
  const pending = [];
  ordered.forEach(r => {
    const s = Number.isInteger(r.seat) && r.seat >= 1 && r.seat <= totalSeats ? r.seat : null;
    if (s && !bySeat[s]) bySeat[s] = r;
    else pending.push(r);
  });
  let cursor = 1;
  pending.forEach(r => {
    while (cursor <= totalSeats && bySeat[cursor]) cursor++;
    if (cursor <= totalSeats) bySeat[cursor] = r;
  });
  return bySeat; // { 좌석번호: 멤버 }
};

// 멤버 정렬('오늘 이 방'): 공부 중 → 방금 전까지(온기) → 나머지, 각 묶음 안에서는 자리 번호 순.
//   2026-11-11 — 오늘 누적 내림차순(+순번·시상대)은 순위표로 읽혀 '부담 없이 함께'와 어긋났다.
//   자리 번호(seatNo)가 없으면 닉네임으로 안정 정렬한다
export const sortMembers = (rows) => [...rows].sort((a, b) => {
  if (!!a.studying !== !!b.studying) return a.studying ? -1 : 1;
  const aw = (a.warm || 0) > 0; const bw = (b.warm || 0) > 0;
  if (aw !== bw) return aw ? -1 : 1;
  const as = Number.isInteger(a.seatNo) ? a.seatNo : Infinity;
  const bs = Number.isInteger(b.seatNo) ? b.seatNo : Infinity;
  if (as !== bs) return as - bs;
  return String(a.nickname || '').localeCompare(String(b.nickname || ''));
});

// 오늘 공부 합계(초) — 세션 date 기준 (불변식 4: date는 시작일 귀속)
export const todayStudySec = (sessions, today) =>
  (sessions || []).reduce((sum, s) => sum + (s.date === today ? (s.durationSec || 0) : 0), 0);

// ── 다같이 집중 세션 (B) ──
// 방에서 한 명이 시작하면 모두가 같은 카운트다운을 본다 (벽시계 startedAt 기준 — 서버 틱 없음).
// 타이머를 강제로 켜지 않음: 배너 + '나도 시작'으로 각자 자기 카운트다운을 켠다 (타이머 불변식과 분리).
export const FOCUS_SESSION_OPTIONS = [25, 50]; // 분 — 뽀모(25)·롱세션(50)
export const FOCUS_SESSION_COMPLETE_MS = 90 * 1000; // 종료 후 '다같이 완주'를 잠깐 유지
export const FOCUS_SESSION_MAX_MIN = 180;

export const buildFocusSession = (durationMin, uid, nick, nowMs = Date.now()) => ({
  startedAt: nowMs,
  durationMin: Math.max(1, Math.min(FOCUS_SESSION_MAX_MIN, Math.round(durationMin))),
  by: uid,
  byNick: String(nick || '').slice(0, 12),
});

// focusSession 노드 → 표시 상태.
//   active=배너 노출, finished=완주 직후 축하창, remainingSec=남은 초, expired=만료(정리 대상).
export const focusSessionView = (fs, nowMs = Date.now()) => {
  if (!fs || !fs.startedAt || !fs.durationMin) return { active: false };
  const endsAt = fs.startedAt + fs.durationMin * 60 * 1000;
  const base = { endsAt, durationMin: fs.durationMin, by: fs.by, byNick: fs.byNick || '', startedAt: fs.startedAt };
  if (nowMs >= endsAt) {
    if (nowMs < endsAt + FOCUS_SESSION_COMPLETE_MS) return { ...base, active: true, finished: true, remainingSec: 0 };
    return { ...base, active: false, expired: true };
  }
  return { ...base, active: true, finished: false, remainingSec: Math.ceil((endsAt - nowMs) / 1000) };
};

// ── 응원 보내기 (D) ──
// /cheers/{roomId}/{targetUid}/{senderUid} = { at }
// 보낸이 uid가 키라 연타해도 자기 것만 덮어씀 = 스팸이 구조적으로 억제됨(별도 스로틀 불필요).
// **익명**: 보낸 사람 이름을 저장하지도 표시하지도 않는다 — 누가 보냈는지 남으면 아는 사이끼리만
// 주고받게 되어 '모르는 사람에게 부담 없이'라는 기능의 핵심이 죽는다 (2026-07-25 사용자 결정).
// 표시는 5분간만 — 지나간 응원이 좌석에 계속 붙어 있으면 '지금 받았다'는 신호가 죽는다.
export const CHEER_FRESH_MS = 5 * 60 * 1000;

export const buildCheer = (nowMs = Date.now()) => ({ at: nowMs });

// 한 사람이 받은 응원 노드 → 표시 상태 { count, latestAt }
// count는 최근 5분 내 보낸 사람 수 (같은 사람의 재응원은 1로 합쳐짐 — uid 키라 자연스럽게)
export const cheerView = (node, nowMs = Date.now()) => {
  const fresh = Object.values(node || {})
    .filter(c => c && typeof c.at === 'number' && (nowMs - c.at) < CHEER_FRESH_MS);
  if (!fresh.length) return { count: 0, latestAt: 0 };
  return { count: fresh.length, latestAt: fresh.reduce((m, c) => (c.at > m ? c.at : m), 0) };
};

// mm:ss (다같이 집중 남은시간 — 라이브 카운트다운 전용)
export const fmtClock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
