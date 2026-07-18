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

// 공개 라운지 — 고정 코드의 전체 공개방. 코드가 없는 유저도 스터디룸을 체험하는 통로.
// 첫 입장자가 방을 생성(lazy), 가득 차면(30명) 다음 호점으로 자동 안내.
// 코드는 CODE_CHARS 부분집합이어야 함 (테스트로 강제)
export const LOUNGE_CODES = ['STUDY2', 'STUDY3', 'STUDY4', 'STUDY5'];
export const loungeNameFor = (code) => {
  const idx = LOUNGE_CODES.indexOf(code);
  return idx <= 0 ? '열공 라운지' : `열공 라운지 ${idx + 1}`;
};
export const isLoungeCode = (code) => LOUNGE_CODES.includes(code);

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

// 유령 멤버 판정 — 익명 계정은 앱 삭제 시 영영 못 돌아오는데 명단에는 남아
// 방 정원(30)을 잠식한다. 마지막 생존 신호(가입 or 상태 갱신) 후 14일 무소식이면 정리 대상.
// 정리돼도 코드로 재입장 가능하므로 오탐 피해는 없음
export const GHOST_MS = 14 * 24 * 60 * 60 * 1000;
export const findGhostMembers = (members, status, nowMs = Date.now()) =>
  Object.entries(members || {})
    .filter(([uid, m]) => {
      const lastAlive = Math.max(m?.joinedAt || 0, status?.[uid]?.updatedAt || 0);
      return (nowMs - lastAlive) > GHOST_MS;
    })
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

// 멤버 정렬: 공부 중 우선 → 오늘 누적 내림차순 → 닉네임 (안정적 표시)
export const sortMembers = (rows) => [...rows].sort((a, b) => {
  if (a.studying !== b.studying) return a.studying ? -1 : 1;
  if (a.todaySec !== b.todaySec) return b.todaySec - a.todaySec;
  return String(a.nickname || '').localeCompare(String(b.nickname || ''));
});

// 오늘 공부 합계(초) — 세션 date 기준 (불변식 4: date는 시작일 귀속)
export const todayStudySec = (sessions, today) =>
  (sessions || []).reduce((sum, s) => sum + (s.date === today ? (s.durationSec || 0) : 0), 0);
