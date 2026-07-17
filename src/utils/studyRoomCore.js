// 스터디룸(같이 공부) — 순수 로직부. 설계: docs/realtime-study-design.md
// Firebase 의존 없음 — 방코드/닉네임 검증, presence 페이로드, 표시 규칙, 정렬.
// 부수효과(네트워크)는 studyRoom.js가 담당. 테스트: __tests__/studyRoomCore.test.js

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

// 닉네임: 2~12자, 앞뒤 공백 제거. 금칙어는 포함 검사(간단 목록 — 아는 사이 전제의 최소 방어)
const BAD_WORDS = ['시발', '씨발', '병신', '개새', '지랄', '좆', '섹스', 'fuck', 'sex'];
export const validateNickname = (raw) => {
  const v = String(raw || '').trim();
  if (v.length < 2) return { ok: false, reason: '닉네임은 2자 이상이어야 해요' };
  if (v.length > 12) return { ok: false, reason: '닉네임은 12자 이하여야 해요' };
  const low = v.toLowerCase();
  if (BAD_WORDS.some(w => low.includes(w))) return { ok: false, reason: '사용할 수 없는 단어가 있어요' };
  return { ok: true, value: v };
};

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

export const buildPresence = (activeTimer, { todaySec = 0, today, nowMs = Date.now(), focusMode = null, ultraFocusLevel = 'normal' } = {}) => {
  const t = activeTimer;
  const running = !!t && t.type !== 'lap' && t.status === 'running';
  const inBreak = running && (
    (t.type === 'pomodoro' && t.pomoPhase !== 'work') ||
    (t.type === 'sequence' && t.seqPhase === 'break')
  );
  return {
    state: running ? 'studying' : 'idle',
    subjectLabel: running ? (inBreak ? '휴식 중' : (t.label || '')) : '',
    startedAt: running ? (t.startedAt ?? null) : null,
    // 공부 모드 3단계 — 친구에게 공부 강도 전달:
    // book = 편하게(screen_off) / fire = 집중(screen_on 잠금) / ultra = 울트라집중(screen_on + 시험 강도)
    mode: !running ? null
      : focusMode === 'screen_on' ? (ultraFocusLevel === 'exam' ? 'ultra' : 'fire')
      : 'book',
    plannedEndAt: running ? plannedEndAtOf(t, nowMs) : null,
    todaySec: Math.max(0, Math.min(86400, Math.round(todaySec))),
    date: today ?? null,
    updatedAt: nowMs,
  };
};

// presence 시그니처 — 같은 값 재전송 방지용 (elapsed 틱 제외, 상태 변화만)
export const presenceSig = (p) => `${p.state}|${p.subjectLabel}|${p.startedAt || 0}|${p.mode || ''}|${p.plannedEndAt || 0}|${p.todaySec}|${p.date}`;

// 서버 status → 표시 상태.
// 규칙(설계 8): studying은 updatedAt 기준 30분까지 신뢰(스테일 소켓 방어).
// 'bg'(onDisconnect가 남김)는 자리비움 가능성 — 30분까지는 공부 중으로 표시.
// 예외: plannedEndAt(카운트다운/연속의 예정 종료)이 있으면 그 시각+5분까지 신뢰 연장 —
//   iOS 백그라운드는 하트비트가 불가능해 updatedAt이 멈추지만 타이머는 벽시계로 계속 돈다.
// 장시간 자유모드는 안드로이드 하트비트(10분)가 updatedAt을 갱신해 커버.
// date가 오늘이 아니면 todaySec은 0으로 표시 (자정 리셋은 클라이언트 몫)
export const STALE_MS = 30 * 60 * 1000;
export const PLANNED_END_GRACE_MS = 5 * 60 * 1000;
export const displayStatus = (status, { nowMs = Date.now(), today } = {}) => {
  const s = status || {};
  const fresh = (nowMs - (s.updatedAt || 0)) < STALE_MS
    || (!!s.plannedEndAt && nowMs < s.plannedEndAt + PLANNED_END_GRACE_MS);
  const studying = (s.state === 'studying' || s.state === 'bg') && fresh && !!s.startedAt;
  return {
    studying,
    maybeAway: studying && s.state === 'bg',
    startedAt: studying ? s.startedAt : null,
    mode: studying ? (s.mode || 'book') : null,
    todaySec: s.date === today ? (s.todaySec || 0) : 0,
  };
};

// 멤버 정렬: 공부 중 우선 → 오늘 누적 내림차순 → 닉네임 (안정적 표시)
export const sortMembers = (rows) => [...rows].sort((a, b) => {
  if (a.studying !== b.studying) return a.studying ? -1 : 1;
  if (a.todaySec !== b.todaySec) return b.todaySec - a.todaySec;
  return String(a.nickname || '').localeCompare(String(b.nickname || ''));
});

// 오늘 공부 합계(초) — 세션 date 기준 (불변식 4: date는 시작일 귀속)
export const todayStudySec = (sessions, today) =>
  (sessions || []).reduce((sum, s) => sum + (s.date === today ? (s.durationSec || 0) : 0), 0);
