// 계정 영속 어댑터 — 재설치 복구/미러/실패 내성 (설계: docs/account-persistence-design.md)
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }), { virtual: true });
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }), { virtual: true });
jest.mock('expo-secure-store', () => ({}), { virtual: true });

const { createDurableStorage } = require('../durableAuthStorage');

// Firebase 인증 영속 키 실제 형태 (':'와 '[' ']'는 SecureStore 금지 문자)
const FB_KEY = 'firebase:authUser:AIzaXXX:[DEFAULT]';
const SAFE_KEY = 'firebase_authUser_AIzaXXX__DEFAULT_';

const makePrimary = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: jest.fn(async (k) => (m.has(k) ? m.get(k) : null)),
    setItem: jest.fn(async (k, v) => { m.set(k, v); }),
    removeItem: jest.fn(async (k) => { m.delete(k); }),
  };
};
const makeSecure = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItemAsync: jest.fn(async (k) => (m.has(k) ? m.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => { m.set(k, v); }),
    deleteItemAsync: jest.fn(async (k) => { m.delete(k); }),
  };
};
const flush = () => new Promise(r => setTimeout(r, 0));

describe('durableAuthStorage — iOS 키체인 영속', () => {
  test('재설치 복구: primary 비고 키체인에 있으면 반환 + primary 되채움', async () => {
    const primary = makePrimary();
    const secure = makeSecure({ [SAFE_KEY]: 'TOKEN' });
    const s = createDurableStorage(primary, secure);
    expect(await s.getItem(FB_KEY)).toBe('TOKEN');
    expect(primary.m.get(FB_KEY)).toBe('TOKEN'); // 이후 읽기는 primary에서
  });

  test('기존 사용자 마이그레이션: primary 히트 시 키체인에 미러', async () => {
    const primary = makePrimary({ [FB_KEY]: 'TOKEN' });
    const secure = makeSecure();
    const s = createDurableStorage(primary, secure);
    expect(await s.getItem(FB_KEY)).toBe('TOKEN');
    await flush(); // 미러는 fire-and-forget
    expect(secure.m.get(SAFE_KEY)).toBe('TOKEN');
  });

  test('setItem/removeItem은 양쪽에 반영 (키는 금지 문자 치환)', async () => {
    const primary = makePrimary();
    const secure = makeSecure();
    const s = createDurableStorage(primary, secure);
    await s.setItem(FB_KEY, 'V');
    expect(primary.m.get(FB_KEY)).toBe('V');
    expect(secure.setItemAsync).toHaveBeenCalledWith(SAFE_KEY, 'V');
    await s.removeItem(FB_KEY);
    expect(primary.m.has(FB_KEY)).toBe(false);
    expect(secure.m.has(SAFE_KEY)).toBe(false);
  });

  test('SecureStore 실패는 인증을 깨지 않음 (읽기/쓰기/삭제 전부)', async () => {
    const primary = makePrimary({ [FB_KEY]: 'TOKEN' });
    const secure = {
      getItemAsync: jest.fn(async () => { throw new Error('keychain'); }),
      setItemAsync: jest.fn(async () => { throw new Error('keychain'); }),
      deleteItemAsync: jest.fn(async () => { throw new Error('keychain'); }),
    };
    const s = createDurableStorage(primary, secure);
    expect(await s.getItem(FB_KEY)).toBe('TOKEN');
    await expect(s.setItem(FB_KEY, 'V2')).resolves.toBeUndefined();
    expect(primary.m.get(FB_KEY)).toBe('V2');
    await expect(s.removeItem(FB_KEY)).resolves.toBeUndefined();
    // primary까지 비고 secure도 던지면 null (크래시 금지)
    expect(await s.getItem(FB_KEY)).toBe(null);
  });

  test('secure=null(안드/구빌드)이면 primary 단독 passthrough', async () => {
    const primary = makePrimary();
    const s = createDurableStorage(primary, null);
    expect(await s.getItem(FB_KEY)).toBe(null);
    await s.setItem(FB_KEY, 'V');
    expect(await s.getItem(FB_KEY)).toBe('V');
    await s.removeItem(FB_KEY);
    expect(await s.getItem(FB_KEY)).toBe(null);
  });
});
