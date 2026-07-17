// 스터디룸 순수 로직 테스트 — 설계: docs/realtime-study-design.md

const {
  genRoomCode, isValidRoomCode, normalizeRoomCode, validateNickname,
  buildPresence, presenceSig, displayStatus, sortMembers, todayStudySec, STALE_MS,
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

  test('running 타이머 → studying + 과목 라벨 + startedAt', () => {
    const t = { type: 'countdown', status: 'running', label: '수학', startedAt: NOW - 60000 };
    expect(buildPresence(t, base)).toEqual({
      state: 'studying', subjectLabel: '수학', startedAt: NOW - 60000,
      todaySec: 3600, date: '2027-01-15', updatedAt: NOW,
    });
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

  test('bg(소켓 끊김)는 30분까지 공부 중 취급 + 자리비움 표시', () => {
    const s = { state: 'bg', startedAt: NOW - 100, updatedAt: NOW - STALE_MS + 60_000, todaySec: 0, date: today };
    const d = displayStatus(s, { nowMs: NOW, today });
    expect(d.studying).toBe(true);
    expect(d.maybeAway).toBe(true);
  });

  test('30분 넘게 갱신 없으면 공부 중 아님 (스테일 방어)', () => {
    const s = { state: 'studying', startedAt: NOW, updatedAt: NOW - STALE_MS - 1, todaySec: 0, date: today };
    expect(displayStatus(s, { nowMs: NOW, today }).studying).toBe(false);
  });

  test('어제 date의 todaySec은 0으로 표시 (자정 리셋은 클라이언트 몫)', () => {
    const s = { state: 'idle', updatedAt: NOW, todaySec: 7200, date: '2027-01-14' };
    expect(displayStatus(s, { nowMs: NOW, today }).todaySec).toBe(0);
  });

  test('status 없음(신규 멤버)도 안전', () => {
    expect(displayStatus(null, { nowMs: NOW, today })).toEqual({ studying: false, maybeAway: false, startedAt: null, todaySec: 0 });
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
