// format.js 단위 테스트 — 날짜/시간 포맷의 자정·시간대 경계 회귀 방지
import {
  formatTime, formatDuration, formatShort,
  toDateStr, getToday, getYesterday, getWeekStartStr,
  calcDDay, formatDDay, generateId,
} from '../format';

describe('getWeekStartStr — 일요일 시작, 로컬 기준', () => {
  afterEach(() => { jest.useRealTimers(); });

  test('목요일 기준 이번 주 일요일', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 11, 14, 0, 0)); // 2026-06-11(목)
    expect(getWeekStartStr(0)).toBe('2026-06-07');
    expect(getWeekStartStr(1)).toBe('2026-06-14');
    expect(getWeekStartStr(-1)).toBe('2026-05-31');
  });

  test('일요일 당일은 자기 자신', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 14, 0, 30, 0)); // 일요일 새벽
    expect(getWeekStartStr(0)).toBe('2026-06-14');
  });
});

describe('formatTime', () => {
  test('1시간 미만은 MM:SS', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(59)).toBe('00:59');
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(3599)).toBe('59:59');
  });
  test('1시간 이상은 H:MM:SS', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(36000)).toBe('10:00:00');
  });
  test('음수/소수 방어', () => {
    expect(formatTime(-5)).toBe('00:00');
    expect(formatTime(61.9)).toBe('01:01');
  });
});

describe('formatDuration / formatShort', () => {
  test('시간+분 조합', () => {
    expect(formatDuration(0)).toBe('0분');
    expect(formatDuration(59)).toBe('0분');
    expect(formatDuration(60)).toBe('1분');
    expect(formatDuration(3600)).toBe('1시간');
    expect(formatDuration(3660)).toBe('1시간 1분');
  });
  test('formatShort 영문 약어', () => {
    expect(formatShort(0)).toBe('0m');
    expect(formatShort(3600)).toBe('1h');
    expect(formatShort(3660)).toBe('1h 1m');
  });
});

describe('toDateStr / getToday / getYesterday — 로컬 시간대 기준 (UTC 오프셋 무관)', () => {
  afterEach(() => { jest.useRealTimers(); });

  test('toDateStr는 로컬 연-월-일 그대로', () => {
    expect(toDateStr(new Date(2026, 5, 12))).toBe('2026-06-12');
    expect(toDateStr(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  test('새벽 00:30에도 getToday는 로컬 오늘 날짜 (toISOString이면 KST에서 하루 전이 나옴)', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 12, 0, 30, 0));
    expect(getToday()).toBe('2026-06-12');
    expect(getYesterday()).toBe('2026-06-11');
  });

  test('월 경계: 7월 1일 새벽의 어제는 6월 30일', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 1, 1, 0, 0));
    expect(getYesterday()).toBe('2026-06-30');
  });

  test('연 경계: 1월 1일의 어제는 작년 12월 31일', () => {
    jest.useFakeTimers().setSystemTime(new Date(2027, 0, 1, 0, 10, 0));
    expect(getYesterday()).toBe('2026-12-31');
  });
});

describe('calcDDay / formatDDay', () => {
  afterEach(() => { jest.useRealTimers(); });

  test('D-Day 계산 — 당일/미래/과거', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 12, 14, 0, 0)); // 오후여도 일수는 동일해야 함
    expect(calcDDay('2026-06-12')).toBe(0);
    expect(formatDDay('2026-06-12')).toBe('D-Day');
    expect(calcDDay('2026-06-13')).toBe(1);
    expect(formatDDay('2026-06-13')).toBe('D-1');
    expect(calcDDay('2026-06-11')).toBe(-1);
    expect(formatDDay('2026-06-11')).toBe('D+1');
  });

  test('빈 값 방어', () => {
    expect(calcDDay(null)).toBe(null);
    expect(formatDDay(null)).toBe('');
  });
});

describe('generateId', () => {
  test('prefix 적용 + 연속 호출 중복 없음', () => {
    const a = generateId('sess_');
    const b = generateId('sess_');
    expect(a.startsWith('sess_')).toBe(true);
    expect(a).not.toBe(b);
  });
});
