// 시간 타이핑 입력 정규화 테스트
import { clampInt, splitHm, hmToMin, minToHm, commitTimeText, commitNumberText } from '../timeInput';

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

  test('범위를 벗어나면 클램프한다 (기본 상한은 23시)', () => {
    expect(commitTimeText('99', '99', { prev: '08:00' })).toBe('23:59');
    expect(commitTimeText('12', '77', { prev: '08:00' })).toBe('12:59');
  });

  test('allowEndOfDay(maxHour 24)에서만 24시를 받고, 그때 분은 0으로 강제한다', () => {
    expect(commitTimeText('24', '30', { prev: '08:00', maxHour: 24 })).toBe('24:00');
    expect(commitTimeText('99', '99', { prev: '08:00', maxHour: 24 })).toBe('24:00');
  });

  // ★회귀 방지★ 2026-08-03: 시 칸에 오타로 '25'를 치면 24로 잘리면서 `h===24` 규칙이
  // 분을 0으로 지웠고, 시를 09로 고쳐도 분은 이미 사라진 뒤라 복구되지 않았다.
  // 기본 상한을 23으로 낮춰 '친 적 없는 값이 날아가는' 경로를 없앤다.
  test('시에 24 이상을 쳐도 분이 지워지지 않는다', () => {
    expect(commitTimeText('25', '30', { prev: '08:30' })).toBe('23:30');
    expect(commitTimeText('24', '30', { prev: '08:30' })).toBe('23:30');
  });

  // ★회귀 방지★ 리마인더를 24시로 저장하면 설정 화면은 '오후 12시'(정오)로 표시하는데
  // setHours(24)는 다음 날 00:00으로 롤오버해 자정에 알림이 울렸다.
  test('종료 시각이 아닌 칸(리마인더 등)은 24시를 만들 수 없다', () => {
    expect(commitTimeText('24', '00', { prev: '20:00' })).toBe('23:00');
  });

  test('직전 값이 24:00이어도 상한 23인 칸에서는 23시로 내려온다', () => {
    expect(commitTimeText('', '30', { prev: '24:00' })).toBe('23:30');
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

// NumberField의 라이브 커밋 정책 — 컴포넌트가 아니라 여기서 고정한다.
// ★blur에 min 보정을 미루면 안 된다★: 입력 모달은 keyboardShouldPersistTaps="handled"라
// 키보드가 뜬 채 '시작'을 누르면 blur가 아예 일어나지 않는다(2026-08-03 버그헌트).
describe('commitNumberText', () => {
  test('하한을 즉시 적용한다 — 0분 타이머가 만들어지던 경로', () => {
    expect(commitNumberText('0', { min: 1, max: 300 })).toBe(1);   // 카운트다운 시간
    expect(commitNumberText('0', { min: 5, max: 90 })).toBe(5);    // 뽀모 집중
    expect(commitNumberText('0', { min: 1, max: 30 })).toBe(1);    // 뽀모 휴식
  });

  test('상한도 그대로 적용한다', () => {
    expect(commitNumberText('999', { min: 1, max: 300 })).toBe(300);
  });

  test('정상 입력은 건드리지 않는다', () => {
    expect(commitNumberText('45', { min: 1, max: 300 })).toBe(45);
    expect(commitNumberText('7', { min: 5, max: 90 })).toBe(7);
  });

  // 하한을 즉시 걸어도 사용자에겐 안 보인다 — 입력칸은 draft(친 그대로)를 그리기 때문.
  // 여기서는 '1을 치는 도중 min으로 튀어도 최종 결과는 친 값'임을 확인한다.
  test('두 자리를 이어 쳐도 최종 값은 친 그대로다', () => {
    expect(commitNumberText('1', { min: 5, max: 90 })).toBe(5);    // 치는 도중
    expect(commitNumberText('15', { min: 5, max: 90 })).toBe(15);  // 다 친 뒤
  });
});
