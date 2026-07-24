// 스터디룸 순수 로직 테스트 — 설계: docs/realtime-study-design.md

const {
  genRoomCode, isValidRoomCode, normalizeRoomCode, validateNickname,
  buildPresence, presenceSig, displayStatus, sortMembers, todayStudySec,
  plannedEndAtOf, STALE_MS, PLANNED_END_GRACE_MS,
  buildFocusSession, focusSessionView, fmtClock, FOCUS_SESSION_COMPLETE_MS,
} = require('../studyRoomCore');

const NOW = 1_800_000_000_000;

describe('방 코드', () => {
  test('6자, 혼동 문자(0/O/1/I/L) 없음, 검증 통과', () => {
    for (let i = 0; i < 50; i++) {
      const c = genRoomCode();
      expect(c).toHaveLength(6);
      expect(c).not.toMatch(/[0O1IL]/);
      expect(isValidRoomCode(c)).toBe(true);
    }
  });

  test('정규화: 소문자/공백 입력 허용', () => {
    expect(normalizeRoomCode(' a3k 9qz ')).toBe('A3K9QZ');
  });

  test('잘못된 코드는 거부 (길이/문자)', () => {
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDE0')).toBe(false); // 0은 코드셋에 없음
    expect(isValidRoomCode(null)).toBe(false);
  });

  test('공개 라운지 고정 코드는 전부 유효한 코드 형식 + 호점별 이름', () => {
    const { LOUNGE_CODES, loungeNameFor, isLoungeCode } = require('../studyRoomCore');
    LOUNGE_CODES.forEach(c => expect(isValidRoomCode(c)).toBe(true));
    expect(loungeNameFor(LOUNGE_CODES[0])).toBe('열공 라운지');
    expect(loungeNameFor(LOUNGE_CODES[1])).toBe('열공 라운지 2');
    expect(isLoungeCode(LOUNGE_CODES[0])).toBe(true);
    expect(isLoungeCode('ABCDEF')).toBe(false);
  });
});

describe('validateNickname', () => {
  test('2~12자 트림, 경계값', () => {
    expect(validateNickname('  공부왕  ')).toEqual({ ok: true, value: '공부왕' });
    expect(validateNickname('a').ok).toBe(false);
    expect(validateNickname('a'.repeat(13)).ok).toBe(false);
    expect(validateNickname('ab').ok).toBe(true);
    expect(validateNickname('a'.repeat(12)).ok).toBe(true);
  });

  test('금칙어 포함 거부 (대소문자 무시)', () => {
    expect(validateNickname('Fuck공부').ok).toBe(false);
    expect(validateNickname('시발이').ok).toBe(false);
  });
});

describe('buildPresence', () => {
  const base = { todaySec: 3600, today: '2027-01-15', nowMs: NOW };

  test('running 타이머 → studying + 과목 라벨 + startedAt + 예정 종료', () => {
    const t = { type: 'countdown', status: 'running', label: '수학', startedAt: NOW - 60000, totalSec: 7200, resumedAt: NOW - 60000, elapsedSecAtResume: 0 };
    expect(buildPresence(t, base)).toEqual({
      state: 'studying', subjectLabel: '수학', startedAt: NOW - 60000, mode: 'book',
      plannedEndAt: NOW - 60000 + 7200_000, // 시작 + 2시간 (10초 반올림)
      todaySec: 3600, date: '2027-01-15', updatedAt: NOW,
    });
  });

  test('plannedEndAtOf: 카운트다운/연속은 종료 시각, 자유/뽀모는 null', () => {
    // 카운트다운 2시간, 30분 경과 → 90분 뒤 종료
    const cd = { type: 'countdown', status: 'running', totalSec: 7200, resumedAt: NOW - 1800_000, elapsedSecAtResume: 0 };
    expect(plannedEndAtOf(cd, NOW)).toBe(NOW + 5400_000);
    // 연속: 항목1(40분) work 10분 지점 + 휴식 10분 + 항목2(30분) → 잔여 30+10+30 = 70분
    const seq = {
      type: 'sequence', status: 'running', seqPhase: 'work', seqIndex: 0, totalSec: 2400,
      seqBreakSec: 600, seqItems: [{ totalSec: 2400 }, { totalSec: 1800 }],
      resumedAt: NOW - 600_000, elapsedSecAtResume: 0,
    };
    expect(plannedEndAtOf(seq, NOW)).toBe(NOW + (1800 + 600 + 1800) * 1000);
    expect(plannedEndAtOf({ type: 'free', status: 'running', resumedAt: NOW }, NOW)).toBeNull();
    expect(plannedEndAtOf({ type: 'pomodoro', status: 'running', pomoPhase: 'work', resumedAt: NOW }, NOW)).toBeNull();
    expect(plannedEndAtOf(null, NOW)).toBeNull();
  });

  test('공부 모드 3단계: 편하게(book)/집중(fire)/울트라집중(ultra), 미실행 시 null', () => {
    const t = { type: 'countdown', status: 'running', label: '수학', startedAt: NOW };
    expect(buildPresence(t, base).mode).toBe('book'); // focusMode 없음(screen_off) = 편하게
    expect(buildPresence(t, { ...base, focusMode: 'screen_off' }).mode).toBe('book');
    expect(buildPresence(t, { ...base, focusMode: 'screen_on' }).mode).toBe('fire');
    expect(buildPresence(t, { ...base, focusMode: 'screen_on', ultraFocusLevel: 'focus' }).mode).toBe('fire');
    expect(buildPresence(t, { ...base, focusMode: 'screen_on', ultraFocusLevel: 'exam' }).mode).toBe('ultra');
    // screen_off면 시험 강도여도 편하게 (앱의 screen_on 게이팅과 일관)
    expect(buildPresence(t, { ...base, focusMode: 'screen_off', ultraFocusLevel: 'exam' }).mode).toBe('book');
    expect(buildPresence(null, base).mode).toBeNull();
  });

  test('일시정지/타이머 없음/랩만 → idle (공부 중 신뢰 우선)', () => {
    expect(buildPresence({ type: 'countdown', status: 'paused', label: '수학' }, base).state).toBe('idle');
    expect(buildPresence(null, base).state).toBe('idle');
    expect(buildPresence({ type: 'lap', status: 'running', label: '랩' }, base).state).toBe('idle');
    expect(buildPresence(null, base).startedAt).toBeNull();
  });

  test('뽀모/연속 휴식 페이즈는 studying 유지 + 휴식 중 라벨', () => {
    const pomo = { type: 'pomodoro', status: 'running', label: '영어', pomoPhase: 'break', startedAt: NOW };
    expect(buildPresence(pomo, base).subjectLabel).toBe('휴식 중');
    expect(buildPresence(pomo, base).state).toBe('studying');
    const seq = { type: 'sequence', status: 'running', label: '국어', seqPhase: 'work', startedAt: NOW };
    expect(buildPresence(seq, base).subjectLabel).toBe('국어');
  });

  test('todaySec 클램프(0~86400) + undefined 없음 (RTDB 제약)', () => {
    const p = buildPresence(null, { ...base, todaySec: 999999 });
    expect(p.todaySec).toBe(86400);
    expect(Object.values(p).every(v => v !== undefined)).toBe(true);
    const q = buildPresence({ type: 'free', status: 'running' }, base); // label 없는 타이머
    expect(Object.values(q).every(v => v !== undefined)).toBe(true);
  });

  test('presenceSig: 같은 상태는 같은 시그니처 (updatedAt 무시 — 재전송 방지)', () => {
    const t = { type: 'free', status: 'running', label: '수학', startedAt: 123 };
    const a = buildPresence(t, { ...base, nowMs: NOW });
    const b = buildPresence(t, { ...base, nowMs: NOW + 5000 });
    expect(presenceSig(a)).toBe(presenceSig(b));
  });
});

describe('displayStatus', () => {
  const today = '2027-01-15';

  test('신선한 studying은 공부 중', () => {
    const d = displayStatus({ state: 'studying', startedAt: NOW - 100, updatedAt: NOW - 1000, todaySec: 600, date: today }, { nowMs: NOW, today });
    expect(d.studying).toBe(true);
    expect(d.maybeAway).toBe(false);
  });

  test('화면켬(집중) bg는 잠금 이탈 = 자리비움 가능성 표시', () => {
    const s = { state: 'bg', mode: 'fire', startedAt: NOW - 100, updatedAt: NOW - STALE_MS + 60_000, todaySec: 0, date: today };
    const d = displayStatus(s, { nowMs: NOW, today });
    expect(d.studying).toBe(true);
    expect(d.maybeAway).toBe(true);
    expect(d.screenOff).toBe(false);
  });

  test('울트라집중 bg도 자리비움 가능성 (screenOff 아님)', () => {
    const s = { state: 'bg', mode: 'ultra', startedAt: NOW - 100, updatedAt: NOW - 1000, todaySec: 0, date: today };
    const d = displayStatus(s, { nowMs: NOW, today });
    expect(d.maybeAway).toBe(true);
    expect(d.screenOff).toBe(false);
  });

  test('화면끔(📖 book) bg는 자리비움이 아니라 화면끔 몰입으로 승격', () => {
    const s = { state: 'bg', mode: 'book', startedAt: NOW - 100, updatedAt: NOW - 1000, todaySec: 0, date: today };
    const d = displayStatus(s, { nowMs: NOW, today });
    expect(d.studying).toBe(true);
    expect(d.screenOff).toBe(true);
    expect(d.maybeAway).toBe(false); // 흐려지지 않음
  });

  test('mode 불명 bg는 관대하게 화면끔(present)으로 해석', () => {
    const s = { state: 'bg', startedAt: NOW - 100, updatedAt: NOW - 1000, todaySec: 0, date: today };
    const d = displayStatus(s, { nowMs: NOW, today });
    expect(d.screenOff).toBe(true);
    expect(d.maybeAway).toBe(false);
  });

  test('신뢰창(60분) 넘게 갱신 없으면 공부 중 아님 (스테일 방어)', () => {
    const s = { state: 'studying', startedAt: NOW, updatedAt: NOW - STALE_MS - 1, todaySec: 0, date: today };
    expect(displayStatus(s, { nowMs: NOW, today }).studying).toBe(false);
  });

  test('예정 종료(plannedEndAt)까지는 30분 넘어도 공부 중 유지 — iOS 백그라운드 장시간 카운트다운', () => {
    // 2시간 카운트다운을 켜고 화면 끔: updatedAt은 1시간 전에 멈췄지만 종료 예정은 1시간 뒤
    const s = {
      state: 'bg', startedAt: NOW - 3600_000, updatedAt: NOW - 3600_000,
      plannedEndAt: NOW + 3600_000, todaySec: 0, date: today,
    };
    expect(displayStatus(s, { nowMs: NOW, today }).studying).toBe(true);
    // 종료 예정 + 유예(5분) 지나면 내려감
    expect(displayStatus(s, { nowMs: s.plannedEndAt + PLANNED_END_GRACE_MS + 1, today }).studying).toBe(false);
  });

  test('어제 date의 todaySec은 0으로 표시 (자정 리셋은 클라이언트 몫)', () => {
    const s = { state: 'idle', updatedAt: NOW, todaySec: 7200, date: '2027-01-14' };
    expect(displayStatus(s, { nowMs: NOW, today }).todaySec).toBe(0);
  });

  test('status 없음(신규 멤버)도 안전', () => {
    expect(displayStatus(null, { nowMs: NOW, today })).toEqual({ studying: false, screenOff: false, maybeAway: false, startedAt: null, mode: null, todaySec: 0 });
  });
});

describe('다같이 집중 세션 (focusSessionView)', () => {
  test('buildFocusSession: 분 클램프 + 필드', () => {
    const fs = buildFocusSession(25, 'uidA', '지민', NOW);
    expect(fs).toEqual({ startedAt: NOW, durationMin: 25, by: 'uidA', byNick: '지민' });
    expect(buildFocusSession(999, 'u', 'n', NOW).durationMin).toBe(180); // 상한
    expect(buildFocusSession(0, 'u', 'n', NOW).durationMin).toBe(1); // 하한
    expect(buildFocusSession(25, 'u', '가나다라마바사아자차카타파', NOW).byNick.length).toBe(12); // 닉 12자 클램프
  });

  test('진행 중: active + 남은 초 계산', () => {
    const fs = { startedAt: NOW, durationMin: 25, by: 'u', byNick: '지민' };
    const v = focusSessionView(fs, NOW + 10 * 60 * 1000);
    expect(v.active).toBe(true);
    expect(v.finished).toBe(false);
    expect(v.remainingSec).toBe(15 * 60); // 25분 중 10분 경과 → 15분
  });

  test('종료 직후: 완주 축하창 유지 (finished)', () => {
    const fs = { startedAt: NOW, durationMin: 25 };
    const v = focusSessionView(fs, NOW + 25 * 60 * 1000 + 1000);
    expect(v.active).toBe(true);
    expect(v.finished).toBe(true);
    expect(v.remainingSec).toBe(0);
  });

  test('완주창(90초) 이후: 만료 (정리 대상)', () => {
    const fs = { startedAt: NOW, durationMin: 25 };
    const v = focusSessionView(fs, NOW + 25 * 60 * 1000 + FOCUS_SESSION_COMPLETE_MS + 1);
    expect(v.active).toBe(false);
    expect(v.expired).toBe(true);
  });

  test('세션 없음/불완전은 비활성', () => {
    expect(focusSessionView(null).active).toBe(false);
    expect(focusSessionView({ durationMin: 25 }).active).toBe(false); // startedAt 없음
    expect(focusSessionView({ startedAt: NOW }).active).toBe(false); // durationMin 없음
  });

  test('fmtClock: mm:ss (음수/소수 방어)', () => {
    expect(fmtClock(754)).toBe('12:34');
    expect(fmtClock(5)).toBe('00:05');
    expect(fmtClock(-3)).toBe('00:00');
    expect(fmtClock(90.9)).toBe('01:30');
  });
});

describe('findGhostMembers', () => {
  const { findGhostMembers, GHOST_MS } = require('../studyRoomCore');

  test('마지막 생존 신호(가입/상태 갱신) 14일 경과 시 유령', () => {
    const members = {
      ghost: { nickname: '유령', joinedAt: NOW - GHOST_MS - 1000 },
      aliveByStatus: { nickname: '상태갱신', joinedAt: NOW - GHOST_MS - 1000 },
      aliveByJoin: { nickname: '신규', joinedAt: NOW - 1000 },
    };
    const status = {
      aliveByStatus: { updatedAt: NOW - 1000 }, // 가입은 오래됐지만 최근 활동
      ghost: { updatedAt: NOW - GHOST_MS - 1000 },
    };
    expect(findGhostMembers(members, status, NOW)).toEqual(['ghost']);
  });

  test('status 없는 오래된 멤버도 유령, 빈 입력 안전', () => {
    const members = { g: { joinedAt: NOW - GHOST_MS - 1 } };
    expect(findGhostMembers(members, null, NOW)).toEqual(['g']);
    expect(findGhostMembers(null, null, NOW)).toEqual([]);
  });

  test('staleJoinCandidates: 입장 전(status 접근 불가) joinedAt 기준 후보만 — 만석 방 잠금 방지용', () => {
    const { staleJoinCandidates } = require('../studyRoomCore');
    const members = {
      old: { joinedAt: NOW - GHOST_MS - 1 },
      fresh: { joinedAt: NOW - 1000 },
    };
    expect(staleJoinCandidates(members, NOW)).toEqual(['old']);
    expect(staleJoinCandidates(null, NOW)).toEqual([]);
  });
});

describe('sortMembers', () => {
  test('공부 중 우선 → 오늘 누적 내림차순 → 닉네임', () => {
    const rows = [
      { nickname: '다', studying: false, todaySec: 9000 },
      { nickname: '가', studying: true, todaySec: 100 },
      { nickname: '나', studying: true, todaySec: 500 },
      { nickname: '라', studying: false, todaySec: 9000 },
    ];
    expect(sortMembers(rows).map(r => r.nickname)).toEqual(['나', '가', '다', '라']);
  });
});

describe('assignSeats', () => {
  const { assignSeats } = require('../studyRoomCore');

  test('입장 순서(joinedAt)대로 앞자리부터, 동률은 uid 타이브레이크 — 결정적', () => {
    const rows = [
      { uid: 'c', joinedAt: 300 },
      { uid: 'b', joinedAt: 100 },
      { uid: 'z', joinedAt: 200 },
      { uid: 'a', joinedAt: 200 },
    ];
    expect(assignSeats(rows).map(r => r.uid)).toEqual(['b', 'a', 'z', 'c']);
    // 원본 불변
    expect(rows[0].uid).toBe('c');
  });
});

describe('좌석 도면 (ROOM_THEMES/resolveSeats)', () => {
  const { ROOM_THEMES, themeOf, TOTAL_SEATS, resolveSeats } = require('../studyRoomCore');

  test('모든 테마 도면에 1~30번 좌석이 정확히 한 번씩 (0=통로 제외)', () => {
    Object.entries(ROOM_THEMES).forEach(([key, th]) => {
      const all = th.zones.flatMap(z => z.rows.flat()).filter(n => n !== 0).sort((a, b) => a - b);
      expect(all).toEqual(Array.from({ length: TOTAL_SEATS }, (_, i) => i + 1));
    });
  });

  test('themeOf: 미지정/알 수 없는 테마는 카페 폴백 (구버전 방 호환)', () => {
    expect(themeOf(undefined)).toBe(ROOM_THEMES.cafe);
    expect(themeOf('weird')).toBe(ROOM_THEMES.cafe);
    expect(themeOf('library')).toBe(ROOM_THEMES.library);
  });

  test('본인이 고른 자리 우선, 중복 선택은 먼저 입장한 사람 승, 미선택/밀린 사람은 앞번호 자동 착석', () => {
    const rows = [
      { uid: 'a', joinedAt: 100, seat: 7 },
      { uid: 'b', joinedAt: 200, seat: 7 },  // a와 중복 → 밀림
      { uid: 'c', joinedAt: 300 },           // 미선택
      { uid: 'd', joinedAt: 400, seat: 99 }, // 범위 밖 → 미선택 취급
    ];
    const bySeat = resolveSeats(rows);
    expect(bySeat[7].uid).toBe('a');
    expect(bySeat[1].uid).toBe('b'); // 밀린 b가 빈 앞번호
    expect(bySeat[2].uid).toBe('c');
    expect(bySeat[3].uid).toBe('d');
  });
});

describe('withNicknameTags', () => {
  const { withNicknameTags } = require('../studyRoomCore');

  test('중복 닉네임만 uid 끝 4자 꼬리표, 유일하면 그대로', () => {
    const rows = [
      { uid: 'abcd1234', nickname: '토루' },
      { uid: 'efgh5678', nickname: '토루' },
      { uid: 'ijkl9012', nickname: '공부왕' },
    ];
    const out = withNicknameTags(rows);
    expect(out[0].displayName).toBe('토루 #1234');
    expect(out[1].displayName).toBe('토루 #5678');
    expect(out[2].displayName).toBe('공부왕');
  });
});

describe('todayStudySec', () => {
  test('오늘 세션만 합산 (date 기준 — 불변식 4)', () => {
    const sessions = [
      { date: '2027-01-15', durationSec: 1800 },
      { date: '2027-01-15', durationSec: 600 },
      { date: '2027-01-14', durationSec: 99999 },
      { date: '2027-01-15' }, // durationSec 없음 방어
    ];
    expect(todayStudySec(sessions, '2027-01-15')).toBe(2400);
    expect(todayStudySec(null, '2027-01-15')).toBe(0);
  });
});

describe('heartbeatEligible (좀비 스냅샷 방어)', () => {
  const { heartbeatEligible } = require('../studyRoomCore');

  test('카운트다운: 예정 종료+1분까지만 — 지난 스냅샷은 좀비', () => {
    const cd = { type: 'countdown', status: 'running', totalSec: 3600, resumedAt: NOW - 1800_000, elapsedSecAtResume: 0 };
    expect(heartbeatEligible(cd, NOW)).toBe(true); // 30분 경과, 30분 남음
    expect(heartbeatEligible(cd, NOW + 1800_000 + 30_000)).toBe(true); // 종료 후 30초 (유예 내)
    expect(heartbeatEligible(cd, NOW + 1800_000 + 120_000)).toBe(false); // 종료 후 2분 → 좀비
  });

  test('자유/뽀모(끝없는 타이머): 벽시계 경과 5시간 상한 — 강제종료된 앱의 무한 공부 중 방지', () => {
    const mk = (type, elapsedHr) => ({
      type, status: 'running', pomoPhase: 'work',
      resumedAt: NOW - elapsedHr * 3600_000, elapsedSecAtResume: 0,
    });
    expect(heartbeatEligible(mk('free', 4.9), NOW)).toBe(true);
    expect(heartbeatEligible(mk('free', 5.1), NOW)).toBe(false);
    expect(heartbeatEligible(mk('pomodoro', 4.9), NOW)).toBe(true);
    expect(heartbeatEligible(mk('pomodoro', 5.1), NOW)).toBe(false); // 뽀모 좀비도 차단 (페이즈 전환엔 앱 JS 필요)
  });

  test('미실행/랩/null은 자격 없음', () => {
    expect(heartbeatEligible(null, NOW)).toBe(false);
    expect(heartbeatEligible({ type: 'lap', status: 'running', resumedAt: NOW }, NOW)).toBe(false);
    expect(heartbeatEligible({ type: 'free', status: 'paused', elapsedSec: 100 }, NOW)).toBe(false);
  });
});

describe('subjectLabel 클램프', () => {
  test('60자 초과 라벨은 잘라서 전송 (서버 규칙 subjectLabel<=60과 쌍)', () => {
    const t = { type: 'free', status: 'running', label: '가'.repeat(100), startedAt: NOW };
    const p = buildPresence(t, { todaySec: 0, today: '2027-01-15', nowMs: NOW });
    expect(p.subjectLabel).toHaveLength(60);
  });
});

describe('extractRoomCode — 클립보드 텍스트에서 초대 코드 추출', () => {
  const { extractRoomCode, genRoomCode } = require('../studyRoomCore');

  test('공유 메시지 전체에서 코드만 찾는다 (스토어 URL의 영숫자 런은 무시)', () => {
    const msg = '[열공메이트] "우리방" 스터디룸에 초대해요!\n앱에서 통계탭 > 스터디룸 > 코드 입력: XK7P2M\n\niPhone: https://apps.apple.com/app/id6759892516\nAndroid: https://play.google.com/store/apps/details?id=com.yeolgong.timer';
    expect(extractRoomCode(msg)).toBe('XK7P2M');
  });

  test('코드 단독/소문자/앞뒤 공백도 인식', () => {
    expect(extractRoomCode('XK7P2M')).toBe('XK7P2M');
    expect(extractRoomCode('  xk7p2m \n')).toBe('XK7P2M');
  });

  test('제외 문자(0/O/1/I/L) 포함 6자 단어나 길이 다른 토큰은 거부', () => {
    expect(extractRoomCode('IPHONE')).toBe(null);   // I, O 미포함 문자셋
    expect(extractRoomCode('ABC12')).toBe(null);    // 5자
    expect(extractRoomCode('ABCD123')).toBe(null);  // 7자 런
    expect(extractRoomCode('')).toBe(null);
    expect(extractRoomCode(null)).toBe(null);
    expect(extractRoomCode('x'.repeat(3000))).toBe(null); // 과대 입력 가드
  });

  test('생성된 코드는 항상 추출 가능 (라운드트립)', () => {
    for (let i = 0; i < 20; i++) {
      const c = genRoomCode();
      expect(extractRoomCode(`초대 코드: ${c} 입니다`)).toBe(c);
    }
  });
});
