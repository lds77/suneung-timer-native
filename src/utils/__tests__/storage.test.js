// 백업/복원 안전성 테스트
// 핵심: 손상된 백업(비배열 SESSIONS 등)을 복원해도 로드 경로가 크래시하지 않도록
// 형태가 안 맞는 키는 복원에서 제외한다.

let mockStore = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k) => Promise.resolve(mockStore[k] ?? null)),
    setItem: jest.fn((k, v) => { mockStore[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k) => { delete mockStore[k]; return Promise.resolve(); }),
    multiRemove: jest.fn((keys) => { keys.forEach(k => delete mockStore[k]); return Promise.resolve(); }),
  },
}));

const { exportBackupData, importBackupData, loadSessions } = require('../storage');

beforeEach(() => { mockStore = {}; });

describe('exportBackupData', () => {
  test('저장된 키만 포함하고 _meta를 붙인다', async () => {
    mockStore['@yeolgong/sessions'] = JSON.stringify([{ id: 's1' }]);
    mockStore['@yeolgong/settings'] = JSON.stringify({ darkMode: true });
    const data = await exportBackupData();
    expect(data.SESSIONS).toEqual([{ id: 's1' }]);
    expect(data.SETTINGS).toEqual({ darkMode: true });
    expect(data.SUBJECTS).toBeUndefined();
    expect(data._meta.app).toBe('yeolgong');
  });

  test('한 키가 손상(JSON 파싱 불가)돼도 나머지는 백업된다', async () => {
    mockStore['@yeolgong/sessions'] = '{corrupt!!';
    mockStore['@yeolgong/subjects'] = JSON.stringify([{ id: 'sub1' }]);
    const data = await exportBackupData();
    expect(data.SESSIONS).toBeUndefined();
    expect(data.SUBJECTS).toEqual([{ id: 'sub1' }]);
  });
});

describe('importBackupData', () => {
  const meta = { _meta: { version: 1, app: 'yeolgong' } };

  test('열공메이트 백업이 아니면 거부한다', async () => {
    await expect(importBackupData({ SESSIONS: [] })).rejects.toThrow('invalid_backup');
    await expect(importBackupData(null)).rejects.toThrow('invalid_backup');
  });

  test('정상 백업은 저장소에 기록된다', async () => {
    await importBackupData({ ...meta, SESSIONS: [{ id: 's1', durationSec: 60 }], SETTINGS: { streak: 3 } });
    expect(JSON.parse(mockStore['@yeolgong/sessions'])).toEqual([{ id: 's1', durationSec: 60 }]);
    expect(JSON.parse(mockStore['@yeolgong/settings'])).toEqual({ streak: 3 });
  });

  test('형태가 잘못된 키는 복원에서 제외된다 (앱 먹통 방지)', async () => {
    await importBackupData({
      ...meta,
      SESSIONS: { not: 'an array' },   // 배열이어야 함 → 제외
      SETTINGS: ['not', 'object'],     // 객체여야 함 → 제외
      SUBJECTS: [{ id: 'sub1' }],      // 정상 → 복원
    });
    expect(mockStore['@yeolgong/sessions']).toBeUndefined();
    expect(mockStore['@yeolgong/settings']).toBeUndefined();
    expect(JSON.parse(mockStore['@yeolgong/subjects'])).toEqual([{ id: 'sub1' }]);
    // 복원 후 로드 경로가 배열을 기대해도 안전
    expect(await loadSessions()).toEqual([]);
  });
});
