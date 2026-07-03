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

const seed = ({ sessions = [], subjects = [], settings = {}, ddays = [] }) => {
  mockStore = {
    '@yeolgong/sessions': JSON.stringify(sessions),
    '@yeolgong/subjects': JSON.stringify(subjects),
    '@yeolgong/settings': JSON.stringify(settings),
    '@yeolgong/ddays': JSON.stringify(ddays),
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
