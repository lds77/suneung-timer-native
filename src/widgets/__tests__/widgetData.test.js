// getWidgetData의 과목 합산 로직 테스트
// 핵심: subjectId가 없어도 라벨이 과목명과 일치하면 그 과목으로 합산 (연속모드 세션 대응)

let mockStore = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn((k) => Promise.resolve(mockStore[k] ?? null)) },
}));

const { getWidgetData, activeRunningInfo } = require('../widgetData');

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const seed = ({ sessions = [], subjects = [], settings = {}, ddays = [], weekly = null, timerSnap = null, todos = [] }) => {
  mockStore = {
    '@yeolgong/sessions': JSON.stringify(sessions),
    '@yeolgong/subjects': JSON.stringify(subjects),
    '@yeolgong/settings': JSON.stringify(settings),
    '@yeolgong/ddays': JSON.stringify(ddays),
    '@yeolgong/weeklySchedule': weekly === null ? null : JSON.stringify(weekly),
    '@yeolgong/timerSnapshot': timerSnap === null ? null : JSON.stringify(timerSnap),
    '@yeolgong/todos': JSON.stringify(todos),
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

describe('getWidgetData 오늘 할 일', () => {
  const today = todayStr();

  test('오늘 탭 판정(My Day)과 동일 — 오늘 목록 + 기한 도래분, 미래 기한/템플릿 제외, 미완료 먼저', async () => {
    seed({
      subjects: SUBJECTS,
      todos: [
        { id: 'a', text: '완료한 것', scope: 'today', done: true, completedAt: Date.now() },
        { id: 'b', text: '오늘 목록', scope: 'today', done: false },
        { id: 'c', text: '미래 기한', scope: 'today', done: false, dueDate: '2099-01-01' },     // 예정 → 제외
        { id: 'd', text: '기한 도래 커스텀', scope: 'list_x', done: false, dueDate: today },     // 오늘 등장
        { id: 'e', text: '기한 없는 커스텀', scope: 'list_x', done: false },                     // 제외
        { id: 'f', text: '템플릿', scope: 'today', done: false, isTemplate: true, repeatDays: [0,1,2,3,4,5,6] },
      ],
    });
    const d = await getWidgetData();
    expect(d.todos.map(t => t.id)).toEqual(['b', 'd', 'a']); // 미완료 먼저, 완료 뒤
    expect(d.todoDone).toBe(1);
    expect(d.todoTotal).toBe(3);
  });

  test('8개 초과는 잘리지만 카운트는 전체 기준', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `t${i}`, text: `할일${i}`, scope: 'today', done: i < 2, completedAt: i < 2 ? Date.now() : null }));
    seed({ subjects: SUBJECTS, todos: many });
    const d = await getWidgetData();
    expect(d.todos.length).toBe(8);
    expect(d.todoTotal).toBe(11);
    expect(d.todoDone).toBe(2);
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

describe('실행 중 타이머 (집중 중 표시)', () => {
  test('activeRunningInfo: 실행 중 work 페이즈만 벽시계 기준 경과 계산', () => {
    const NOW = 1_800_000_000_000;
    // 10분 전 재개 + 재개 시점까지 5분
    expect(activeRunningInfo({ status: 'running', type: 'free', resumedAt: NOW - 600_000, elapsedSecAtResume: 300 }, NOW))
      .toEqual({ sec: 900, label: '' });
    expect(activeRunningInfo({ status: 'paused', type: 'free', resumedAt: NOW }, NOW)).toBeNull();
    expect(activeRunningInfo({ status: 'running', type: 'lap', resumedAt: NOW }, NOW)).toBeNull();
    expect(activeRunningInfo({ status: 'running', type: 'pomodoro', pomoPhase: 'break', resumedAt: NOW }, NOW)).toBeNull();
    // 24시간 초과 좀비 스냅샷 방어
    expect(activeRunningInfo({ status: 'running', type: 'free', resumedAt: NOW - 25 * 3600 * 1000 }, NOW)).toBeNull();
  });

  test('getWidgetData: 타이머 스냅샷에서 runningSec/runningLabel 계산 (헤드리스 갱신용)', async () => {
    seed({
      subjects: SUBJECTS,
      timerSnap: {
        savedAt: Date.now(),
        timers: [{ id: 't1', type: 'free', status: 'running', label: '수학', resumedAt: Date.now() - 120_000, elapsedSecAtResume: 60 }],
      },
    });
    const d = await getWidgetData();
    expect(d.runningSec).toBeGreaterThanOrEqual(180);
    expect(d.runningSec).toBeLessThan(190);
    expect(d.runningLabel).toBe('수학');

    seed({ subjects: SUBJECTS });
    const d2 = await getWidgetData();
    expect(d2.runningSec).toBe(0);
    expect(d2.runningLabel).toBe('');
  });
});
