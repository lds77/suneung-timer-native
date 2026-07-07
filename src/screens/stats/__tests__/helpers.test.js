// stats/helpers.js 단위 테스트 — 날짜 경계, 과목 매칭, 표시 헬퍼
import {
  dateStr, addDays, darkenColor, stripLeadingEmoji,
  getSessionSubject, fmtDiff, getStreakTitle, BUILTIN_SUBJECTS,
  buildHeatmapWeeks, calcLongestStreak, calcPersonalBests,
  analyzeTimeZones, buildMonthCalendarCells, buildHourlyDetail, aggregateSubjectTotals,
  calcWeekPlanRate,
} from '../helpers';
import { getTier } from '../../../constants/presets';

describe('dateStr / addDays — 로컬 날짜 경계', () => {
  test('dateStr는 로컬 연-월-일', () => {
    expect(dateStr(new Date(2026, 5, 12))).toBe('2026-06-12');
    expect(dateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  test('addDays 월/연 경계 넘기기', () => {
    expect(dateStr(addDays(new Date(2026, 5, 30), 1))).toBe('2026-07-01');
    expect(dateStr(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
    expect(dateStr(addDays(new Date(2024, 1, 28), 1))).toBe('2024-02-29'); // 윤년
  });
  test('addDays는 원본을 변경하지 않음', () => {
    const d = new Date(2026, 5, 12);
    addDays(d, 7);
    expect(dateStr(d)).toBe('2026-06-12');
  });
});

describe('darkenColor', () => {
  test('30% 어둡게', () => {
    expect(darkenColor('#FFFFFF', 0.3)).toBe('#b3b3b3');
    expect(darkenColor('#000000', 0.3)).toBe('#000000');
  });
});

describe('stripLeadingEmoji', () => {
  test('앞쪽 이모지/기호 제거, 한글 유지', () => {
    expect(stripLeadingEmoji('📘 국어')).toBe('국어');
    expect(stripLeadingEmoji('국어')).toBe('국어');
    expect(stripLeadingEmoji('🔥🔥 수학 심화')).toBe('수학 심화');
  });
  test('빈 값 방어', () => {
    expect(stripLeadingEmoji('')).toBe('');
    expect(stripLeadingEmoji(null)).toBe(null);
  });
});

describe('getSessionSubject — 세션→과목 매칭 우선순위', () => {
  const subjects = [
    { id: 's1', name: '국어', color: '#E8575A' },
    { id: 's2', name: '수학', color: '#4A90D9' },
    { id: 's3', name: '수학 심화', color: '#123456' },
  ];

  test('1순위: subjectId 직접 매칭', () => {
    expect(getSessionSubject({ subjectId: 's1', label: '수학' }, subjects).id).toBe('s1');
  });
  test('2순위: 라벨 정확 일치 (이모지 제거 후)', () => {
    expect(getSessionSubject({ subjectId: null, label: '📘 국어' }, subjects).id).toBe('s1');
  });
  test('3순위: 부분 일치는 긴 과목명 우선 (수학 심화 > 수학)', () => {
    expect(getSessionSubject({ subjectId: null, label: '수학 심화 문제풀이' }, subjects).id).toBe('s3');
  });
  test('4순위: 내장 과목 매칭', () => {
    const r = getSessionSubject({ subjectId: null, label: '한국사 인강' }, subjects);
    expect(r.id).toBe('builtin_한국사');
  });
  test('내장 과목도 긴 이름 우선 (지구과학이 과학보다 먼저)', () => {
    const r = getSessionSubject({ subjectId: null, label: '지구과학 기출' }, []);
    expect(r.name).toBe('지구과학');
  });
  test('5순위: 라벨 자체를 과목으로 (해시 색상 결정적)', () => {
    const a = getSessionSubject({ subjectId: null, label: '논술' }, subjects);
    const b = getSessionSubject({ subjectId: null, label: '논술' }, subjects);
    expect(a.id).toBe('lbl_논술');
    expect(a.color).toBe(b.color);
  });
  test('라벨 없으면 미지정', () => {
    expect(getSessionSubject({ subjectId: null, label: '' }, subjects).name).toBe('미지정');
  });
});

describe('fmtDiff', () => {
  const fmt = (n) => `${n}분`;
  test('증가/감소/동일', () => {
    expect(fmtDiff(10, fmt)).toEqual({ text: '↑ +10분', up: true });
    expect(fmtDiff(-10, fmt)).toEqual({ text: '↓ -10분', up: false });
    expect(fmtDiff(0, fmt)).toEqual({ text: '= 동일', up: null });
  });
});

describe('getStreakTitle', () => {
  test('경계값', () => {
    expect(getStreakTitle(0)).toBe(null);
    expect(getStreakTitle(1)).toBe('씨앗 심는 중');
    expect(getStreakTitle(3)).toBe('작심삼일 돌파!');
    expect(getStreakTitle(7)).toBe('일주일의 기적');
    expect(getStreakTitle(365)).toBe('전설');
  });
});

describe('getTier — 티어 경계 (presets)', () => {
  test('등급 경계값', () => {
    expect(getTier(103).id).toBe('SS');
    expect(getTier(100).id).toBe('SS');
    expect(getTier(99).id).toBe('S+');
    expect(getTier(93).id).toBe('S+');
    expect(getTier(92).id).toBe('S');
    expect(getTier(86).id).toBe('S');
    expect(getTier(85).id).toBe('A');
    expect(getTier(76).id).toBe('A');
    expect(getTier(75).id).toBe('B');
    expect(getTier(66).id).toBe('B');
    expect(getTier(65).id).toBe('C');
    expect(getTier(56).id).toBe('C');
    expect(getTier(0).id).toBe('C'); // 최저 폴백
  });
});

describe('buildHeatmapWeeks — 잔디 히트맵', () => {
  // 기준일 고정: 2026-07-01(수)
  const NOW = new Date(2026, 6, 1, 12, 0, 0);

  test('주 수·요일 구조: hmWeeks개 주 × 7일, 마지막 주 토요일로 끝남', () => {
    const weeks = buildHeatmapWeeks([], 16, NOW);
    expect(weeks).toHaveLength(16);
    weeks.forEach(w => expect(w).toHaveLength(7));
    const last = weeks[15][6];
    expect(new Date(last.date + 'T00:00:00').getDay()).toBe(6); // 토
    expect(last.date).toBe('2026-07-04'); // 이번 주 토요일
  });

  test('세션 합산 + 오늘/미래 플래그', () => {
    const weeks = buildHeatmapWeeks([
      { date: '2026-07-01', durationSec: 600 },
      { date: '2026-07-01', durationSec: 300 },
      { date: '2026-06-30', durationSec: 60 },
    ], 2, NOW);
    const days = weeks.flat();
    const todayCell = days.find(d => d.date === '2026-07-01');
    expect(todayCell).toEqual(expect.objectContaining({ sec: 900, isToday: true, isFuture: false }));
    expect(days.find(d => d.date === '2026-06-30').sec).toBe(60);
    // 오늘(정오) 이후인 7/2~7/4은 미래
    expect(days.find(d => d.date === '2026-07-02').isFuture).toBe(true);
    expect(days.find(d => d.date === '2026-07-04').isFuture).toBe(true);
  });
});

describe('calcLongestStreak', () => {
  const mk = (secs) => [secs.map((sec, i) => ({ date: `d${i}`, sec, isFuture: false }))];

  test('중간 공백으로 끊긴 연속을 정확히 센다', () => {
    expect(calcLongestStreak(mk([100, 100, 0, 100, 100, 100]))).toBe(3);
    expect(calcLongestStreak(mk([0, 0, 0]))).toBe(0);
    expect(calcLongestStreak(mk([100]))).toBe(1);
  });

  test('미래 칸은 연속 계산에서 제외', () => {
    const weeks = [[
      { date: 'a', sec: 100, isFuture: false },
      { date: 'b', sec: 0, isFuture: true },   // 미래 0은 끊김 아님
      { date: 'c', sec: 100, isFuture: false },
    ]];
    expect(calcLongestStreak(weeks)).toBe(2);
  });
});

describe('calcPersonalBests — 역대 기록', () => {
  test('세션 없으면 null', () => {
    expect(calcPersonalBests([])).toBeNull();
    expect(calcPersonalBests(null)).toBeNull();
  });

  test('하루 최장/최다 세션/최장 단일/최고 밀도(10분 이상만)', () => {
    const bests = calcPersonalBests([
      { date: '2026-07-01', durationSec: 3600, focusDensity: 90 },
      { date: '2026-07-01', durationSec: 1800, focusDensity: 80 },
      { date: '2026-07-02', durationSec: 4000, focusDensity: 70 },
      { date: '2026-07-03', durationSec: 120, focusDensity: 103 }, // 10분 미만 → 밀도 기록 제외
    ]);
    expect(bests.bestDayDate).toBe('2026-07-01'); // 5400초
    expect(bests.bestDaySec).toBe(5400);
    expect(bests.mostSessDate).toBe('2026-07-01');
    expect(bests.mostSessCount).toBe(2);
    expect(bests.longestSess.durationSec).toBe(4000);
    expect(bests.bestDensitySess.focusDensity).toBe(90); // 103짜리는 120초라 제외
  });
});

describe('analyzeTimeZones — 시간대별 집중력', () => {
  const at = (h) => new Date(2026, 6, 1, h, 30).getTime();

  test('시간대별로 세션을 분류하고 합계/개수를 계산', () => {
    const zones = analyzeTimeZones([
      { startedAt: at(7), durationSec: 600, focusDensity: 90 },   // 아침
      { startedAt: at(15), durationSec: 1200, focusDensity: 80 }, // 오후
      { startedAt: at(15), durationSec: 299, focusDensity: 70 },  // 오후 (5분 미만 — 밀도 평균 제외 대상)
      { startedAt: null, durationSec: 999 },                       // startedAt 없음 → 제외
    ]);
    const total = zones.reduce((s, z) => s + z.totalSec, 0);
    expect(total).toBe(2099);
    const afternoon = zones.find(z => z.sessions.length === 2);
    expect(afternoon.totalSec).toBe(1499);
    expect(afternoon.count).toBe(2);
    // 5분 미만 세션은 calcAverageDensity에서 제외 → 평균은 80
    expect(afternoon.avgDensity).toBe(80);
    // 세션 없는 시간대는 tier null
    expect(zones.some(z => z.count === 0 && z.tier === null)).toBe(true);
  });
});

describe('buildMonthCalendarCells — 월간 캘린더', () => {
  test('2026년 7월: 1일(수) 앞 패딩 3칸 + 31일 + 뒤 패딩, 7의 배수', () => {
    const cells = buildMonthCalendarCells([{ date: '2026-07-15', durationSec: 1800 }], 2026, 6, '2026-07-04');
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 3)).toEqual([null, null, null]); // 일~화 패딩
    expect(cells[3]).toEqual(expect.objectContaining({ day: 1, date: '2026-07-01' }));
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.find(c => c && c.day === 15).sec).toBe(1800);
    expect(cells.find(c => c && c.day === 4).isToday).toBe(true);
  });
});

describe('buildHourlyDetail — 시간 경계 분 단위 분배', () => {
  test('두 시간에 걸친 세션이 시간별로 정확히 나뉜다', () => {
    // 9:30 시작 60분 세션 → 9시대 30분 + 10시대 30분
    const start = new Date(2026, 6, 1, 9, 30, 0).getTime();
    const hours = buildHourlyDetail([{ startedAt: start, durationSec: 3600, label: '수학', subjectId: null }], []);
    expect(hours[9].sec).toBe(1800);
    expect(hours[10].sec).toBe(1800);
    expect(hours[8].sec).toBe(0);
    expect(hours[9].subjects[0].sec).toBe(1800);
  });
});

describe('aggregateSubjectTotals — 과목 합계/비율', () => {
  test('과목별 합산 + 비율 + 내림차순 정렬', () => {
    const subjects = [{ id: 's1', name: '국어', color: '#111111' }];
    const rows = aggregateSubjectTotals([
      { subjectId: 's1', durationSec: 900 },
      { subjectId: 's1', durationSec: 600 },
      { subjectId: null, label: '수학', durationSec: 3000 },
    ], subjects);
    // 수학 3000 > 국어 1500 내림차순, 비율 67/33
    expect(rows[0]).toEqual(expect.objectContaining({ name: '수학', sec: 3000, pct: 67 }));
    expect(rows[1]).toEqual(expect.objectContaining({ name: '국어', sec: 1500, pct: 33 }));
  });

  test('빈 입력이면 빈 배열', () => {
    expect(aggregateSubjectTotals([], [])).toEqual([]);
  });
});

describe('calcWeekPlanRate — 주간 플래너 달성률 onlyWeek/skipWeeks 필터', () => {
  // 2026-07-08 = 수요일, 속한 주(일요일 시작) = 2026-07-05
  const WED = '2026-07-08';
  const WEEK = '2026-07-05';
  const OTHER_WEEK = '2026-06-28';
  const wed = (plans) => ({ enabled: true, wed: { plans } });

  test('반복 계획: 목표/실행 정상 합산 (60분 목표, 30분 실행 → 50%)', () => {
    const ws = wed([{ id: 'p1', targetMin: 60 }]);
    const sessions = [{ date: WED, planId: 'p1', durationSec: 1800 }];
    expect(calcWeekPlanRate([WED], ws, sessions)).toBe(50);
  });

  test('다른 주의 onlyWeek 계획은 분모에서 제외 (목표 0 → null)', () => {
    const ws = wed([{ id: 'p1', targetMin: 60, onlyWeek: OTHER_WEEK }]);
    expect(calcWeekPlanRate([WED], ws, [])).toBeNull();
  });

  test('해당 주의 onlyWeek 계획은 포함 (60분 목표, 60분 실행 → 100%)', () => {
    const ws = wed([{ id: 'p1', targetMin: 60, onlyWeek: WEEK }]);
    const sessions = [{ date: WED, planId: 'p1', durationSec: 3600 }];
    expect(calcWeekPlanRate([WED], ws, sessions)).toBe(100);
  });

  test('이번 주 휴무(skipWeeks) 계획은 분모에서 제외 (목표 0 → null)', () => {
    const ws = wed([{ id: 'p1', targetMin: 60, skipWeeks: [WEEK] }]);
    const sessions = [{ date: WED, planId: 'p1', durationSec: 1800 }];
    expect(calcWeekPlanRate([WED], ws, sessions)).toBeNull();
  });

  test('휴무 계획은 빼고 반복 계획만 집계 (제외되지 않았다면 25%였을 것 → 50%)', () => {
    const ws = wed([
      { id: 'p1', targetMin: 60 },                        // 반복: 30분 실행
      { id: 'p2', targetMin: 60, skipWeeks: [WEEK] },     // 이번 주 휴무: 목표에서 빠져야 함
    ]);
    const sessions = [{ date: WED, planId: 'p1', durationSec: 1800 }];
    // p2가 제외되면 목표 3600 / 실행 1800 = 50%. (버그 시 목표 7200 → 25%)
    expect(calcWeekPlanRate([WED], ws, sessions)).toBe(50);
  });

  test('달성률은 100 상한으로 클램프', () => {
    const ws = wed([{ id: 'p1', targetMin: 30 }]);
    const sessions = [{ date: WED, planId: 'p1', durationSec: 9999 }];
    expect(calcWeekPlanRate([WED], ws, sessions)).toBe(100);
  });

  test('플래너 비활성/미사용이면 null', () => {
    expect(calcWeekPlanRate([WED], { enabled: false, wed: { plans: [{ id: 'p1', targetMin: 60 }] } }, [])).toBeNull();
    expect(calcWeekPlanRate([WED], null, [])).toBeNull();
  });
});
