// planner/helpers.js 단위 테스트 — 배치/겹침/빈슬롯/주차 규칙
// 미루기·자동배치 실사용 버그가 나왔던 영역의 회귀 안전망.
import {
  parseTimeToMin, minToStr, makeTKey, tkeyWeek, tkeyPlan,
  weekStartOf, isPlanInWeek, isMidnightCrossing,
  occupiedIntervalsForDay, intervalsOverlap, findFreeStartMin,
} from '../helpers';

describe('시간 변환', () => {
  test('parseTimeToMin / minToStr 왕복', () => {
    expect(parseTimeToMin('06:00')).toBe(360);
    expect(parseTimeToMin('23:30')).toBe(1410);
    expect(parseTimeToMin(null)).toBe(0);
    expect(minToStr(360)).toBe('06:00');
    expect(minToStr(1410)).toBe('23:30');
  });

  test('isMidnightCrossing: end <= start면 자정 넘김', () => {
    expect(isMidnightCrossing('23:00', '07:00')).toBe(true);
    expect(isMidnightCrossing('09:00', '10:00')).toBe(false);
    expect(isMidnightCrossing('10:00', '10:00')).toBe(true);
  });
});

describe('임시배치 복합키 (주차@@계획id)', () => {
  test('만들고 분해하면 원값 유지 — 계획 id에 구분자 유사 문자가 없을 때', () => {
    const k = makeTKey('2026-06-28', 'blk_abc123');
    expect(tkeyWeek(k)).toBe('2026-06-28');
    expect(tkeyPlan(k)).toBe('blk_abc123');
  });
});

describe('weekStartOf — 일요일 시작 주차', () => {
  test('아무 요일이나 그 주 일요일로', () => {
    expect(weekStartOf('2026-07-04')).toBe('2026-06-28'); // 토 → 그 주 일요일
    expect(weekStartOf('2026-06-28')).toBe('2026-06-28'); // 일 → 자기 자신
    expect(weekStartOf('2026-07-01')).toBe('2026-06-28'); // 수
  });
});

describe('isPlanInWeek — onlyWeek/skipWeeks 규칙', () => {
  const W = '2026-06-28';
  test('반복 계획은 항상, onlyWeek는 해당 주만, skipWeeks는 제외', () => {
    expect(isPlanInWeek({}, W)).toBe(true);
    expect(isPlanInWeek({ onlyWeek: W }, W)).toBe(true);
    expect(isPlanInWeek({ onlyWeek: '2026-07-05' }, W)).toBe(false);
    expect(isPlanInWeek({ skipWeeks: [W] }, W)).toBe(false);
    expect(isPlanInWeek({ skipWeeks: ['2026-07-05'] }, W)).toBe(true);
  });
});

describe('occupiedIntervalsForDay — 점유 구간', () => {
  const W = '2026-06-28';
  const ws = {
    mon: {
      fixed: [{ id: 'f1', start: '09:00', end: '15:00' }],
      plans: [
        { id: 'p1', start: '16:00', end: '17:00' },
        { id: 'p2', start: '18:00', end: '19:00', skipWeeks: [W] }, // 이번 주 휴무 → 제외
        { id: 'p3', targetMin: 60 },                                 // 미배치(start 없음) → 제외
      ],
    },
    sun: {
      fixed: [{ id: 'n1', start: '23:00', end: '07:00' }], // 전날 자정 넘김 → 월요일 오전 점유
      plans: [],
    },
  };

  test('고정+계획+전날 자정 넘김을 합치고, 휴무/미배치/자기자신은 제외', () => {
    const ivs = occupiedIntervalsForDay(ws, 'mon', W);
    expect(ivs).toContainEqual({ start: 0, end: 420 });     // 전날 캐리 (0~07:00)
    expect(ivs).toContainEqual({ start: 540, end: 900 });   // 고정 09~15
    expect(ivs).toContainEqual({ start: 960, end: 1020 });  // p1 16~17
    expect(ivs).toHaveLength(3);                            // p2(휴무)/p3(미배치) 제외

    const excl = occupiedIntervalsForDay(ws, 'mon', W, 'p1');
    expect(excl).toHaveLength(2); // 자기 자신 제외
  });

  test('자정 넘는 당일 일정은 24:00까지 점유로 취급', () => {
    const ws2 = { tue: { fixed: [{ id: 'x', start: '22:00', end: '02:00' }], plans: [] } };
    const ivs = occupiedIntervalsForDay(ws2, 'tue', W);
    expect(ivs).toContainEqual({ start: 1320, end: 1440 });
  });
});

describe('intervalsOverlap / findFreeStartMin', () => {
  const ivs = [{ start: 540, end: 900 }, { start: 960, end: 1020 }]; // 09~15, 16~17

  test('겹침 판정 (경계 접촉은 겹침 아님)', () => {
    expect(intervalsOverlap(600, 660, ivs)).toBe(true);
    expect(intervalsOverlap(900, 960, ivs)).toBe(false); // 15~16 빈틈
    expect(intervalsOverlap(420, 540, ivs)).toBe(false); // 07~09
  });

  test('선호 시작에서 앞뒤 양방향으로 가장 가까운 빈 슬롯', () => {
    // 60분짜리, 선호 10:00(600): 앞쪽 틈(06~09)의 끝인 08:00 시작(480, 2시간 차)이
    // 뒤쪽 15:00(300분 차)보다 가까움 → 480
    expect(findFreeStartMin(60, ivs, 600)).toBe(480);
    // 선호 17:30 → 17:00 이후 자유 구간에서 그대로 17:30
    expect(findFreeStartMin(60, ivs, 1050)).toBe(1050);
  });

  test('빈틈이 부족하면 들어가는 슬롯 중 최근접, 하루 종일 차면 null', () => {
    // 90분짜리는 15~16 틈(60분)에 못 들어감 → 앞쪽 틈에서 07:30 시작(450)이 최근접
    expect(findFreeStartMin(90, ivs, 600)).toBe(450);
    // 06:00~24:00 전체 점유 → null
    expect(findFreeStartMin(30, [{ start: 360, end: 1440 }], 600)).toBeNull();
  });

  test('그리드 시작(06:00) 이전은 배치 후보에서 제외', () => {
    // 점유 없음, 선호 05:00 → 06:00으로 클램프
    expect(findFreeStartMin(60, [], 300)).toBe(360);
  });
});
