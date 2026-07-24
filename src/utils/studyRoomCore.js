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

export const buildPresence = (activeTimer, { todaySec = 0, today, nowMs = Date.now(), focusMode = null, ultraFocusLevel = 'normal' } = {}) => {
  const t = activeTimer;
  const running = !!t && t.type !== 'lap' && t.status === 'running';
  const inBreak = running && (
    (t.type === 'pomodoro' && t.pomoPhase !== 'work') ||
    (t.type === 'sequence' && t.seqPhase === 'break')
  );
  return {
    state: running ? 'studying' : 'idle',
    // 라벨은 60자 클램프 — 서버 규칙(subjectLabel ≤ 60)과 쌍. 입력 maxLength(50)보다 넉넉한 안전판
    subjectLabel: running ? (inBreak ? '휴식 중' : String(t.label || '').slice(0, 60)) : '',
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
  const bg = studying && s.state === 'bg';
  // 화면끔(📖 book)은 백그라운드가 정상 동작 — 화면을 끄고 몰입 중이므로 자리비움으로 취급하지 않는다.
  //   (성실한 screen_off 공부가 소켓 단절로 흐려 보이던 문제 — 오히려 '화면끔' 뱃지로 승격)
  // 화면켬(집중/울트라)에서의 bg는 잠금 이탈 = 자리비움 가능성 → 흐리게 유지.
  // mode 불명 시엔 '공부 중을 신뢰' 철학에 따라 화면끔(present)으로 관대하게 해석.
  const screenOff = bg && (s.mode || 'book') === 'book';
  return {
    studying,
    screenOff,
    maybeAway: bg && !screenOff,
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

// 멤버 정렬: 공부 중 우선 → 오늘 누적 내림차순 → 닉네임 (안정적 표시)
export const sortMembers = (rows) => [...rows].sort((a, b) => {
  if (a.studying !== b.studying) return a.studying ? -1 : 1;
  if (a.todaySec !== b.todaySec) return b.todaySec - a.todaySec;
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

// mm:ss (다같이 집중 남은시간 — 라이브 카운트다운 전용)
export const fmtClock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
