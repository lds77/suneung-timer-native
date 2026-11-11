// 스터디룸 presence 전송 순서 — 실제 studyRoom.syncPresence에 Firebase만 대역으로 둔다 (2026-11-11 아스트라 W-01·W-05)
// 늦게 돌아온 실패가 새 상태를 덮지 않는지, endedAt을 빼고 보낸 것을 다 보낸 것으로 기억하지 않는지 본다.
const mockDb = { calls: [], pending: [], tree: {} };

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { firebase: { databaseURL: 'https://fake' } } } },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));
jest.mock('../durableAuthStorage', () => ({ durableAuthStorage: {} }));
jest.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [], getApp: () => ({}) }));
jest.mock('firebase/auth', () => ({
  initializeAuth: () => ({ get currentUser() { return { uid: 'kid' }; }, onAuthStateChanged: () => () => {} }),
  getAuth: () => ({}),
  getReactNativePersistence: () => ({}),
  signInAnonymously: async () => ({ user: { uid: 'kid' } }),
}));
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path = '') => ({ path }),
  serverTimestamp: () => Date.now(),
  get: async ({ path }) => {
    const v = path.split('/').filter(Boolean).reduce((n, k) => (n == null ? undefined : n[k]), mockDb.tree);
    return { exists: () => v != null, val: () => v ?? null };
  },
  // update는 손으로 끝낸다 — 늦게 돌아오는 거부를 만들기 위해
  update: ({ path }, patch) => new Promise((resolve, reject) => {
    mockDb.calls.push({ path, patch });
    mockDb.pending.push({ patch, resolve, reject });
  }),
  set: async () => {},
  remove: async () => {},
  onValue: () => () => {},
  onDisconnect: () => ({ update: async () => {}, cancel: async () => {} }),
  push: async () => {},
}));

const flush = () => new Promise(r => setImmediate(r));
const denied = () => Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });

let api; let core;
beforeEach(async () => {
  jest.resetModules();
  mockDb.calls = [];
  mockDb.pending = [];
  mockDb.tree = { users: { kid: { roomId: 'STUDY2' } } };
  api = require('../studyRoom');
  core = require('../studyRoomCore');
  await api.ensureSignedIn(); // 앱에서는 스터디룸 화면이 로그인시킨다 — 그 전에는 syncPresence가 아무것도 안 보낸다
  await api.fetchMyRoomId();
});

const T0 = 1_800_000_000_000;
const idle = (endedAt) => core.buildPresence(null, { today: '2027-01-15', nowMs: T0, endedAt });
const studying = () => core.buildPresence({ type: 'free', status: 'running', label: '수학', startedAt: T0 + 5000 }, { today: '2027-01-15', nowMs: T0 + 5000 });

describe('syncPresence 전송 순서', () => {
  test('W-01: 늦게 거부된 옛 쉬는 중 전송은 다시 보내지 않는다 — 그사이 나간 공부 중을 덮지 않는다', async () => {
    const a = api.syncPresence(idle(T0)); // A: 쉬는 중 + endedAt (대기)
    await flush();
    const b = api.syncPresence(studying()); // B: 다시 공부 시작
    await flush();
    expect(mockDb.calls.map(c => c.patch.state)).toEqual(['idle', 'studying']);
    mockDb.pending[1].resolve(); // B 성공
    mockDb.pending[0].reject(denied()); // A가 늦게 거부
    await a; await b; await flush();
    // A를 줄여 다시 보내면 B를 덮는다 — 보내지 않아야 한다
    expect(mockDb.calls.length).toBe(2);
    // B의 기억도 지우지 않는다: 같은 B를 다시 불러도 보낼 것이 없다
    await api.syncPresence(studying());
    expect(mockDb.calls.length).toBe(2);
  });

  test('W-05: 권한 거부로 endedAt을 빼고 보냈으면, 그 판을 보낸 것으로 기억하고 이후로는 처음부터 뺀다', async () => {
    const a = api.syncPresence(idle(T0));
    await flush();
    mockDb.pending[0].reject(denied());
    await flush();
    expect(mockDb.calls.length).toBe(2);
    expect('endedAt' in mockDb.calls[1].patch).toBe(false); // 줄인 판
    mockDb.pending[1].resolve();
    await a;
    // 같은 상태 — 줄인 판이 이미 갔으니 안 보낸다
    await api.syncPresence(idle(T0));
    expect(mockDb.calls.length).toBe(2);
    // 끝난 시각만 다른 같은 상태 — 서버가 그 칸을 안 받으니 보낼 것이 없다
    await api.syncPresence(idle(T0 + 60000));
    expect(mockDb.calls.length).toBe(2);
    // 다른 것(오늘 누적)이 바뀌면 — 처음부터 endedAt 없이 한 번만 (거부를 되풀이하지 않는다)
    const more = core.buildPresence(null, { today: '2027-01-15', nowMs: T0 + 90000, endedAt: T0 + 90000, todaySec: 1200 });
    const c = api.syncPresence(more);
    await flush();
    expect(mockDb.calls.length).toBe(3);
    expect('endedAt' in mockDb.calls[2].patch).toBe(false);
    expect(mockDb.calls[2].patch.todaySec).toBe(1200);
    mockDb.pending[2].resolve();
    await c;
  });

  test('권한 거부가 아닌 실패는 endedAt을 빼지 않고, 다음 호출에서 그대로 다시 보낸다', async () => {
    const a = api.syncPresence(idle(T0));
    await flush();
    mockDb.pending[0].reject(new Error('network'));
    await a; await flush();
    expect(mockDb.calls.length).toBe(1); // 줄여서 다시 보내지 않았다
    const b = api.syncPresence(idle(T0));
    await flush();
    expect(mockDb.calls.length).toBe(2);
    expect(mockDb.calls[1].patch.endedAt).toBe(T0);
    mockDb.pending[1].resolve();
    await b;
  });

  test('공부 시작의 endedAt: null(서버 값 삭제)은 그대로 보낸다', async () => {
    const b = api.syncPresence(studying());
    await flush();
    expect(mockDb.calls[0].patch.endedAt).toBeNull();
    mockDb.pending[0].resolve();
    await b;
  });
});
