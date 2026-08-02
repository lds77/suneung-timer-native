// 시간 타이핑 입력 정규화 테스트
import { clampInt, splitHm, hmToMin, minToHm, commitTimeText } from '../timeInput';

describe('clampInt', () => {
  test('숫자만 뽑아낸다', () => {
    expect(clampInt('45', { min: 1, max: 300, fallback: 25 })).toBe(45);
    expect(clampInt('45분', { min: 1, max: 300, fallback: 25 })).toBe(45);
  });

  test('빈 값·해석 불가는 직전 값을 유지한다', () => {
    expect(clampInt('', { min: 1, max: 300, fallback: 25 })).toBe(25);
    expect(clampInt('   ', { min: 1, max: 300, fallback: 25 })).toBe(25);
    expect(clampInt('분', { min: 1, max: 300, fallback: 25 })).toBe(25);
    expect(clampInt(null, { min: 1, max: 300, fallback: 25 })).toBe(25);
    expect(clampInt(undefined, { min: 1, max: 300, fallback: 25 })).toBe(25);
  });

  test('범위를 벗어나면 클램프한다', () => {
    expect(clampInt('999', { min: 1, max: 300, fallback: 25 })).toBe(300);
    expect(clampInt('0', { min: 1, max: 300, fallback: 25 })).toBe(1);
  });

  test('0을 허용하는 범위에서는 0이 fallback으로 새지 않는다', () => {
    // '0'은 falsy 문자열이 아니므로 fallback으로 빠지면 안 된다
    expect(clampInt('0', { min: 0, max: 59, fallback: 30 })).toBe(0);
  });

  test('숫자 입력도 받는다', () => {
    expect(clampInt(37, { min: 0, max: 59, fallback: 0 })).toBe(37);
  });
});

describe('splitHm / hmToMin / minToHm', () => {
  test('기본 파싱', () => {
    expect(splitHm('08:30')).toEqual({ h: 8, m: 30 });
    expect(hmToMin('08:30')).toBe(510);
    expect(minToHm(510)).toBe('08:30');
  });

  test('24:00을 보존한다', () => {
    expect(hmToMin('24:00')).toBe(1440);
    expect(minToHm(1440)).toBe('24:00');
  });

  test('깨진 값은 0시 0분', () => {
    expect(splitHm(undefined)).toEqual({ h: 0, m: 0 });
    expect(splitHm('')).toEqual({ h: 0, m: 0 });
    expect(splitHm('abc')).toEqual({ h: 0, m: 0 });
  });

  test('minToHm은 하루 범위로 클램프한다', () => {
    expect(minToHm(-10)).toBe('00:00');
    expect(minToHm(9999)).toBe('24:00');
  });
});

describe('commitTimeText', () => {
  test('타이핑한 시/분을 그대로 확정한다', () => {
    expect(commitTimeText('9', '5', { prev: '08:00' })).toBe('09:05');
    expect(commitTimeText('13', '45', { prev: '08:00' })).toBe('13:45');
  });

  test('5분 단위가 아닌 분도 허용한다 (타이핑의 핵심)', () => {
    expect(commitTimeText('08', '37', { prev: '08:00' })).toBe('08:37');
  });

  test('범위를 벗어나면 클램프한다', () => {
    expect(commitTimeText('99', '99', { prev: '08:00' })).toBe('24:00');
    expect(commitTimeText('12', '77', { prev: '08:00' })).toBe('12:59');
  });

  test('24시는 분을 0으로 강제한다', () => {
    expect(commitTimeText('24', '30', { prev: '08:00' })).toBe('24:00');
  });

  test('빈 칸은 직전 값을 유지한다', () => {
    expect(commitTimeText('', '30', { prev: '08:15' })).toBe('08:30');
    expect(commitTimeText('10', '', { prev: '08:15' })).toBe('10:15');
    expect(commitTimeText('', '', { prev: '08:15' })).toBe('08:15');
  });

  test('시작보다 이른 종료 시각도 그대로 둔다 (자정 넘김 일정은 허용된 기능)', () => {
    // 23:00~07:00 같은 고정 일정을 막지 않는다 — 관계 검증은 저장 시점 화면의 몫
    expect(commitTimeText('07', '00', { prev: '10:00' })).toBe('07:00');
  });
});
