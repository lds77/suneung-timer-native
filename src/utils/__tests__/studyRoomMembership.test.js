// 유령 정리로 명단에서 빠진 사용자의 복귀 (2026-11-04 제보).
// Firebase 연결만 메모리로 바꾸고 studyRoom.js의 실제 흐름을 돌린다.
// 규칙은 docs/firebase-database.rules.json 중 이 흐름이 닿는 부분만 옮겼다. 진짜 규칙은 실기기로 본다.

const mockDb = { tree: {}, me: 'kid', offline: false, writes: [] };

const mockRead = (path) => path.split('/').filter(Boolean)
  .reduce((node, key) => (node == null ? undefined : node[key]), mockDb.tree);

const mockWrite = (path, value) => {
  const keys = path.split('/').filter(Boolean);
  const parents = [];
  let node = mockDb.tree;
  keys.slice(0, -1).forEach((key) => {
    if (node[key] == null) node[key] = {};
    parents.push([node, key]);
    node = node[key];
  });
  const last = keys[keys.length - 1];
  if (value == null) delete node[last];
  else node[last] = value;
  // RTDB에는 빈 노드가 없다
  parents.reverse().forEach(([parent, key]) => {
    if (Object.keys(parent[key]).length === 0) delete parent[key];
  });
};

const mockIsMember = (roomId) => !!mockRead(`rooms/${roomId}/members/${mockDb.me}`);

const mockAllowed = (path, value) => {
  const [top, roomId, uid, field] = path.split('/');
  if (top === 'users') return roomId === mockDb.me;
  if (top === 'status') return value == null ? true : uid === mockDb.me && mockIsMember(roomId);
  if (top === 'cheers') return value == null;
  if (top === 'rooms' && uid === 'members') {
    const target = field;
    if (target !== mockDb.me) return false;
    if (value == null) return true;
    return !!mockRead(`rooms/${roomId}`) && !!value.nickname && !!value.joinedAt;
  }
  if (top === 'rooms' && uid === undefined) {
    const room = mockRead(`rooms/${roomId}`);
    if (value == null) return !room?.members;
    return !room && value.ownerUid === mockDb.me;
  }
  return false;
};

const mockCommit = (entries) => {
  if (mockDb.offline) throw new Error('offline');
  if (!entries.every(([path, value]) => mockAllowed(path, value))) throw new Error('PERMISSION_DENIED');
  entries.forEach(([path, value]) => {
    mockWrite(path, value);
    mockDb.writes.push(path);
  });
};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { firebase: { databaseURL: 'https://fake' } } } },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));
jest.mock('../durableAuthStorage', () => ({ durableAuthStorage: {} }));
jest.mock('firebase/app', () => ({
  initializeApp: () => ({}), getApps: () => [], getApp: () => ({}),
}));
jest.mock('firebase/auth', () => ({
  initializeAuth: () => ({
    get currentUser() { return { uid: mockDb.me }; },
    onAuthStateChanged: () => () => {},
  }),
  getAuth: () => ({}),
  getReactNativePersistence: () => ({}),
  signInAnonymously: async () => ({ user: { uid: mockDb.me } }),
}));
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path = '') => ({ path }),
  serverTimestamp: () => Date.now(),
  get: async ({ path }) => {
    if (mockDb.offline) throw new Error('offline');
    const value = mockRead(path);
    return { exists: () => value != null, val: () => value ?? null };
  },
  set: async ({ path }, value) => mockCommit([[path, value]]),
  remove: async ({ path }) => mockCommit([[path, null]]),
  update: async ({ path }, patch) => mockCommit(Object.entries(patch).map(
    ([key, value]) => [path ? `${path}/${key}` : key, value]
  )),
  onValue: ({ path }, ok, cancel) => {
    const [top, roomId] = path.split('/');
    if ((top === 'status' || top === 'cheers') && !mockIsMember(roomId)) {
      cancel?.(new Error('PERMISSION_DENIED'));
      return () => {};
    }
    if (path !== '.info/connected') ok({ val: () => mockRead(path) ?? null });
    return () => {};
  },
  onDisconnect: () => ({ update: async () => {}, cancel: async () => {} }),
  push: async () => {},
}));

const LONG_AGO = () => Date.now() - 30 * 24 * 60 * 60 * 1000;
const member = (nickname) => ({ nickname, character: 'toru', joinedAt: LONG_AGO() });
const filledRoom = (name, count) => ({
  name,
  ownerUid: 'owner',
  createdAt: 1,
  theme: 'cafe',
  members: Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`m${i}`, { ...member(`사람${i}`), joinedAt: Date.now() }])
  ),
});

let api;
beforeEach(() => {
  jest.resetModules();
  mockDb.me = 'kid';
  mockDb.offline = false;
  mockDb.writes = [];
  mockDb.tree = {
    users: { kid: { nickname: '아이', character: 'toru', roomId: 'STUDY2' } },
    rooms: { STUDY2: { name: '열공 라운지', ownerUid: 'owner', createdAt: 1, theme: 'cafe', members: { mate: member('친구') } } },
    status: { STUDY2: { mate: { state: 'studying', updatedAt: Date.now() } } },
  };
  api = require('../studyRoom');
});

describe('reconcileMembership', () => {
  test('명단에 있으면 아무것도 쓰지 않는다', async () => {
    mockDb.tree.rooms.STUDY2.members.kid = member('아이');
    await expect(api.reconcileMembership()).resolves.toEqual({ roomId: 'STUDY2', known: true });
    expect(mockDb.writes).toEqual([]);
  });

  test('스스로 나간 사람은 돌아가지 않는다', async () => {
    delete mockDb.tree.users.kid.roomId;
    await expect(api.reconcileMembership()).resolves.toEqual({ roomId: null, known: true });
    expect(mockRead('rooms/STUDY2/members/kid')).toBeUndefined();
  });

  test('★정리된 사람은 같은 라운지로 돌아오고 다른 사람은 그대로다', async () => {
    const before = Date.now();
    const r = await api.reconcileMembership();
    expect(r).toEqual({ roomId: 'STUDY2', known: true, rejoined: true });
    expect(mockRead('rooms/STUDY2/members/kid').nickname).toBe('아이');
    expect(mockRead('rooms/STUDY2/members/kid').joinedAt).toBeGreaterThanOrEqual(before);
    expect(mockRead('users/kid/roomId')).toBe('STUDY2');
    expect(mockRead('rooms/STUDY2/members/mate').nickname).toBe('친구');
    expect(api.takeMembershipNotice()).toBeNull();
  });

  test('돌아온 뒤에는 내 상태가 다시 올라간다', async () => {
    await api.syncPresence({ state: 'studying', updatedAt: 1 });
    expect(mockRead('status/STUDY2/kid')).toBeUndefined();
    await api.reconcileMembership();
    await api.syncPresence({ state: 'studying', updatedAt: 2 });
    expect(mockRead('status/STUDY2/kid').updatedAt).toBe(2);
  });

  test('있던 라운지가 찼으면 다음 호점으로 간다', async () => {
    mockDb.tree.rooms.STUDY2 = filledRoom('열공 라운지', 30);
    const r = await api.reconcileMembership();
    expect(r.roomId).toBe('STUDY3');
    expect(mockRead('users/kid/roomId')).toBe('STUDY3');
    expect(mockRead('rooms/STUDY3/members/kid').nickname).toBe('아이');
  });

  test('라운지가 전부 찼으면 로비로 가고 이유를 한 번 알린다', async () => {
    ['STUDY2', 'STUDY3', 'STUDY4', 'STUDY5'].forEach((code) => {
      mockDb.tree.rooms[code] = filledRoom('열공 라운지', 30);
    });
    await expect(api.reconcileMembership()).resolves.toEqual({ roomId: null, known: true });
    expect(mockRead('users/kid/roomId')).toBeUndefined();
    expect(api.takeMembershipNotice()).toContain('라운지 자리가 정리됐어요');
    expect(api.takeMembershipNotice()).toBeNull();
  });

  test('★코드 방에서 정리된 사람도 같은 방으로 돌아온다', async () => {
    mockDb.tree.users.kid.roomId = 'ABCDEF';
    mockDb.tree.rooms.ABCDEF = filledRoom('우리 반', 3);
    await expect(api.reconcileMembership()).resolves.toEqual({ roomId: 'ABCDEF', known: true, rejoined: true });
    expect(mockRead('rooms/ABCDEF/members/kid').nickname).toBe('아이');
  });

  test('코드 방이 찼으면 내 방을 비우고 코드를 알려 준다', async () => {
    mockDb.tree.users.kid.roomId = 'ABCDEF';
    mockDb.tree.rooms.ABCDEF = filledRoom('우리 반', 30);
    await expect(api.reconcileMembership()).resolves.toEqual({ roomId: null, known: true });
    expect(mockRead('users/kid/roomId')).toBeUndefined();
    expect(api.takeMembershipNotice()).toContain('방(ABCDEF) 자리가 정리됐어요');
  });

  test('코드 방이 사라졌으면 내 방을 비운다', async () => {
    mockDb.tree.users.kid.roomId = 'ABCDEF';
    await expect(api.reconcileMembership()).resolves.toEqual({ roomId: null, known: true });
    expect(mockRead('users/kid/roomId')).toBeUndefined();
    expect(api.takeMembershipNotice()).toContain('찾지 못했어요');
  });

  test('★네트워크 실패는 정리로 치지 않는다', async () => {
    mockDb.offline = true;
    const r = await api.reconcileMembership();
    expect(r.known).toBe(false);
    expect(mockDb.writes).toEqual([]);
    expect(mockRead('users/kid/roomId')).toBe('STUDY2');
    expect(api.takeMembershipNotice()).toBeNull();
  });

  test('앱 시작과 방 화면이 겹쳐도 한 번만 돌아온다', async () => {
    const [a, b] = await Promise.all([api.reconcileMembership(), api.reconcileMembership()]);
    expect(a).toBe(b);
    expect(mockDb.writes.filter((path) => path === 'rooms/STUDY2/members/kid')).toHaveLength(2);
    // 나가기 정리 1번 + 입장 1번. 입장이 두 번이면 3번이 된다
  });
});

describe('subscribeRoom', () => {
  const firstEmit = (roomId) => new Promise((resolve) => {
    let last;
    api.subscribeRoom(roomId, (data) => { last = data; });
    resolve(last);
  });

  test('명단 밖이면 status가 undefined로 남아 유령 판정을 하지 않는다', async () => {
    await api.ensureSignedIn();
    const data = await firstEmit('STUDY2');
    expect(data.room.name).toBe('열공 라운지');
    expect(data.status).toBeUndefined();
  });

  test('명단 안이면 status를 받는다', async () => {
    mockDb.tree.rooms.STUDY2.members.kid = member('아이');
    await api.ensureSignedIn();
    const data = await firstEmit('STUDY2');
    expect(data.status.mate.state).toBe('studying');
  });
});
