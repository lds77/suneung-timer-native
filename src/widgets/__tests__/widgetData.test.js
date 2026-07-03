// getWidgetData의 과목 합산 로직 테스트
// 핵심: subjectId가 없어도 라벨이 과목명과 일치하면 그 과목으로 합산 (연속모드 세션 대응)

let mockStore = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn((k) => Promise.resolve(mockStore[k] ?? null)) },
}));

const { getWidgetData } = require('../widgetData');

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const seed = ({ sessions = [], subjects = [], settings = {}, ddays = [], weekly = null }) => {
  mockStore = {
    '@yeolgong/sessions': JSON.stringify(sessions),
    '@yeolgong/subjects': JSON.stringify(subjects),
    '@yeolgong/settings': JSON.stringify(settings),
    '@yeolgong/ddays': JSON.stringify(ddays),
    '@yeolgong/weeklySchedule': weekly === null ? null : JSON.stringify(weekly),
  };
};

const SUBJECTS = [
  { id: 's-kor', name: '국어', color: '#E74C3C' },
  { id: 's-math', name: '수학', color: '#4A90D9' },
];

describe('getWidgetData 과목 합산', () => {
  const today = todayStr();

  test('subjectId 있는 세션은 그대로 합산된다', async () => {
    seed({
      subjects: SUBJECTS,
      sessions: [{ id: '1', date: today, subjectId: 's-kor', label: '아무거나', durationSec: 1500 }],
    });
    const d = await getWidgetData();
    expect(d.totalSec).toBe(1500);
    expect(d.subjects).toEqual([expect.objectContaining({ name: '국어', sec: 1500 })]);
    expect(d.launcherSubjects.find(s => s.id === 's-kor').weekSec).toBe(1500);
  });

  test('subjectId 없어도 라벨=과목명이면 그 과목으로 합산된다 (연속모드 세션)', async () => {
    seed({
      subjects: SUBJECTS,
      sessions: [
        { id: '1', date: today, subjectId: 's-math', label: '수학', durationSec: 600 },
        { id: '2', date: today, subjectId: null, label: '수학', durationSec: 900 },   // 연속모드 항목
        { id: '3', date: today, label: ' 국어 ', durationSec: 300 },                   // 공백 트림 매칭
      ],
    });
    const d = await getWidgetData();
    expect(d.totalSec).toBe(1800);
    expect(d.subjects.find(s => s.name === '수학').sec).toBe(1500);
    expect(d.subjects.find(s => s.name === '국어').sec).toBe(300);
    expect(d.launcherSubjects.find(s => s.id === 's-math').weekSec).toBe(1500);
    expect(d.launcherSubjects.find(s => s.id === 's-kor').weekSec).toBe(300);
  });

  test('라벨이 어떤 과목명과도 다르면 과목별에서는 빠지고 총합에는 포함된다', async () => {
    seed({
      subjects: SUBJECTS,
      sessions: [{ id: '1', date: today, label: '자유공부', durationSec: 500 }],
    });
    const d = await getWidgetData();
    expect(d.totalSec).toBe(500);
    expect(d.subjects).toEqual([]);
  });

  test('스냅샷 기준일(date)이 오늘로 포함된다 — iOS 자정 리셋 감지용', async () => {
    seed({ subjects: SUBJECTS });
    const d = await getWidgetData();
    expect(d.date).toBe(today);
  });
});

describe('getWidgetData 오늘 계획', () => {
  const today = todayStr();
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  // widgetData.js와 동일 규칙의 이번 주 시작(일요일)
  const wkStart = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  test('오늘 계획을 order 순으로 반환하고 planId 세션으로 달성률을 계산한다', async () => {
    seed({
      subjects: SUBJECTS,
      weekly: {
        enabled: true,
        [dayKey]: {
          plans: [
            { id: 'p2', label: '영어 단어', targetMin: 30, order: 2, color: '#27AE60' },
            { id: 'p1', label: '수학 문제집', targetMin: 60, order: 1, color: '#4A90D9' },
          ],
        },
      },
      sessions: [{ id: '1', date: today, planId: 'p1', durationSec: 1800 }], // 30분/60분
    });
    const d = await getWidgetData();
    expect(d.plans.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(d.plans[0]).toEqual(expect.objectContaining({ doneSec: 1800, done: false, targetMin: 60 }));
    expect(d.plans[1]).toEqual(expect.objectContaining({ doneSec: 0, done: false }));
    // 전체: 30분 / 90분 = 33%
    expect(d.planPct).toBe(33);
  });

  test('80% 이상이면 done — 집중탭 계획 카드와 동일 기준', async () => {
    seed({
      subjects: SUBJECTS,
      weekly: { enabled: true, [dayKey]: { plans: [{ id: 'p1', label: '국어', targetMin: 10, order: 1 }] } },
      sessions: [{ id: '1', date: today, planId: 'p1', durationSec: 8 * 60 }],
    });
    const d = await getWidgetData();
    expect(d.plans[0].done).toBe(true);
    expect(d.planPct).toBe(80);
  });

  test('onlyWeek가 다른 주면 제외, 이번 주면 포함된다', async () => {
    seed({
      subjects: SUBJECTS,
      weekly: {
        enabled: true,
        [dayKey]: {
          plans: [
            { id: 'p-old', label: '지난주 일회성', targetMin: 30, order: 1, onlyWeek: '2020-01-05' },
            { id: 'p-now', label: '이번주 일회성', targetMin: 30, order: 2, onlyWeek: wkStart },
            { id: 'p-skip', label: '이번주 휴무', targetMin: 30, order: 3, skipWeeks: [wkStart] },
          ],
        },
      },
    });
    const d = await getWidgetData();
    expect(d.plans.map(p => p.id)).toEqual(['p-now']);
  });

  test('플래너 미사용/계획 없음이면 plans 빈 배열 + planPct -1', async () => {
    seed({ subjects: SUBJECTS });
    const d = await getWidgetData();
    expect(d.plans).toEqual([]);
    expect(d.planPct).toBe(-1);

    seed({ subjects: SUBJECTS, weekly: { enabled: false, [dayKey]: { plans: [{ id: 'p1', label: 'x', targetMin: 30 }] } } });
    const d2 = await getWidgetData();
    expect(d2.plans).toEqual([]);
  });
});
