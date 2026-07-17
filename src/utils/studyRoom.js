// 스터디룸(같이 공부) — Firebase 래퍼 (부수효과 담당). 설계: docs/realtime-study-design.md
// 순수 로직은 studyRoomCore.js. 전부 순수 JS(firebase SDK)라 네이티브 빌드 불필요.
//
// 설정 주입: app.config.js extra.firebase (null이면 기능 전체 비활성 — UI 진입점도 숨김).
// 웹 API 키는 공개 전제(보안은 RTDB rules가 담당)라 JS 번들에 포함돼도 무방.
//
// 모든 공개 함수는 설정 없음/미로그인 상태에서 조용히 no-op 또는 null 반환 — 호출부 가드 불필요.

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  genRoomCode, isValidRoomCode, MAX_ROOM_MEMBERS, presenceSig,
} from './studyRoomCore';

// firebase는 정적 import — 순수 JS라 번들 포함 비용뿐, 네트워크는 initApp() 전까지 없음
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, signInAnonymously } from 'firebase/auth';
import {
  getDatabase, ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp,
} from 'firebase/database';

const getConfig = () => Constants.expoConfig?.extra?.firebase || null;
export const isStudyRoomAvailable = () => !!getConfig()?.databaseURL;

// ── 내부 상태 (모듈 싱글턴) ──
let app = null;
let auth = null;
let db = null;
let cachedRoomId; // undefined = 미조회, null = 방 없음
let lastPresenceSig = null;
let disconnectArmed = false;
let connectedUnsub = null;

const initApp = () => {
  if (app) return true;
  const cfg = getConfig();
  if (!cfg?.databaseURL) return false;
  app = getApps().length ? getApp() : initializeApp(cfg);
  try {
    // RN 영속화 필수 — 기본 메모리 영속이면 재시작마다 새 익명 uid가 생겨 유령 유저가 쌓임 (설계 3.1)
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    auth = getAuth(app); // 이미 초기화된 경우 (핫리로드 등)
  }
  db = getDatabase(app);
  return true;
};

// 익명 로그인 보장 → uid 반환 (실패/비활성 시 null)
export const ensureSignedIn = async () => {
  if (!initApp()) return null;
  try {
    if (auth.currentUser) return auth.currentUser.uid;
    // 영속된 세션 복원 대기 (첫 프레임에 currentUser가 아직 null일 수 있음)
    const restored = await new Promise(resolve => {
      const unsub = auth.onAuthStateChanged(u => { unsub(); resolve(u); });
      setTimeout(() => { unsub(); resolve(null); }, 4000);
    });
    if (restored) return restored.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch {
    return null;
  }
};

const uidOrNull = () => auth?.currentUser?.uid || null;

// ── 프로필 ──
export const fetchProfile = async () => {
  const uid = await ensureSignedIn();
  if (!uid) return null;
  try {
    const snap = await get(ref(db, `users/${uid}`));
    return snap.exists() ? snap.val() : null;
  } catch { return null; }
};

export const saveProfile = async ({ nickname, character }) => {
  const uid = await ensureSignedIn();
  if (!uid) return false;
  try {
    await update(ref(db, `users/${uid}`), {
      nickname, character: character || 'toru',
      createdAt: serverTimestamp(),
    });
    return true;
  } catch { return false; }
};

// ── 방 ──
export const fetchMyRoomId = async () => {
  const uid = await ensureSignedIn();
  if (!uid) return null;
  try {
    const snap = await get(ref(db, `users/${uid}/roomId`));
    cachedRoomId = snap.exists() ? snap.val() : null;
    return cachedRoomId;
  } catch { return null; }
};

export const createRoom = async (name, profile) => {
  const uid = await ensureSignedIn();
  if (!uid) return { ok: false, reason: '연결에 실패했어요' };
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genRoomCode();
    try {
      const roomRef = ref(db, `rooms/${code}`);
      const existing = await get(roomRef);
      if (existing.exists()) continue; // 코드 충돌 → 재생성
      await set(roomRef, {
        name: String(name || '').trim().slice(0, 16) || '스터디룸',
        ownerUid: uid, createdAt: serverTimestamp(),
        members: { [uid]: { nickname: profile.nickname, character: profile.character || 'toru', joinedAt: serverTimestamp() } },
      });
      await set(ref(db, `users/${uid}/roomId`), code);
      cachedRoomId = code;
      return { ok: true, roomId: code };
    } catch {
      // 권한 거부(동시 생성 레이스) 포함 — 다음 시도
    }
  }
  return { ok: false, reason: '방 생성에 실패했어요. 잠시 후 다시 시도해 주세요' };
};

export const joinRoom = async (codeRaw, profile) => {
  const uid = await ensureSignedIn();
  if (!uid) return { ok: false, reason: '연결에 실패했어요' };
  const code = codeRaw;
  if (!isValidRoomCode(code)) return { ok: false, reason: '코드 형식이 맞지 않아요 (6자)' };
  try {
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) return { ok: false, reason: '그 코드의 방을 찾지 못했어요' };
    const room = snap.val();
    const memberCount = Object.keys(room.members || {}).length;
    const alreadyIn = !!room.members?.[uid];
    if (!alreadyIn && memberCount >= MAX_ROOM_MEMBERS) return { ok: false, reason: `방이 가득 찼어요 (최대 ${MAX_ROOM_MEMBERS}명)` };
    await update(ref(db), {
      [`rooms/${code}/members/${uid}`]: { nickname: profile.nickname, character: profile.character || 'toru', joinedAt: serverTimestamp() },
      [`users/${uid}/roomId`]: code,
    });
    cachedRoomId = code;
    return { ok: true, roomId: code, roomName: room.name };
  } catch {
    return { ok: false, reason: '참여에 실패했어요. 네트워크를 확인해 주세요' };
  }
};

export const leaveRoom = async () => {
  const uid = uidOrNull();
  if (!uid) return;
  const roomId = cachedRoomId ?? await fetchMyRoomId();
  teardownPresence();
  if (!roomId) return;
  try {
    await update(ref(db), {
      [`rooms/${roomId}/members/${uid}`]: null,
      [`status/${roomId}/${uid}`]: null,
      [`users/${uid}/roomId`]: null,
    });
  } catch {}
  cachedRoomId = null;
  lastPresenceSig = null;
};

// 기능 끄기(탈퇴): 방 나가기 + 서버 프로필 삭제 (설계 6 — 계정 삭제 정책 대응)
export const deleteMyData = async () => {
  const uid = uidOrNull();
  if (!uid) return;
  await leaveRoom();
  try { await remove(ref(db, `users/${uid}`)); } catch {}
};

// ── 구독 (방 화면용) ──
// cb({ room, status }) — room: /rooms/{id} 값, status: /status/{id} 값. 반환: 해제 함수
export const subscribeRoom = (roomId, cb) => {
  if (!initApp() || !roomId) return () => {};
  let room = null;
  let status = null;
  const emit = () => cb({ room, status });
  const u1 = onValue(ref(db, `rooms/${roomId}`), s => { room = s.val(); emit(); }, () => {});
  const u2 = onValue(ref(db, `status/${roomId}`), s => { status = s.val(); emit(); }, () => {});
  return () => { u1(); u2(); };
};

// ── Presence ──
// 연결될 때마다 onDisconnect 재등록 (설계 8: 한 번 등록으로 영구가 아님).
// onDisconnect는 state를 'bg'로 — 클라이언트 표시 규칙(displayStatus)이 30분까지 공부 중으로 그려줌
let armedStatusRef = null;
const setupPresence = (roomId, uid) => {
  if (disconnectArmed) return;
  disconnectArmed = true;
  armedStatusRef = ref(db, `status/${roomId}/${uid}`);
  const target = armedStatusRef;
  connectedUnsub = onValue(ref(db, '.info/connected'), snap => {
    if (snap.val() === true) {
      onDisconnect(target).update({ state: 'bg', updatedAt: serverTimestamp() }).catch(() => {});
    }
  }, () => {});
};

const teardownPresence = () => {
  if (connectedUnsub) { connectedUnsub(); connectedUnsub = null; }
  // 서버측 잔존 onDisconnect 취소 — 안 하면 방 이동 후 이전 방 status에 유령 'bg'가 남음
  if (armedStatusRef) { onDisconnect(armedStatusRef).cancel().catch(() => {}); armedStatusRef = null; }
  disconnectArmed = false;
};

// 타이머 상태 → 서버 반영. useAppState의 presence effect가 호출 (시그니처 변화 시에만 — 초당 쓰기 금지).
// 방이 없거나 비활성이면 no-op. 실패는 조용히 무시 (다음 상태 변화 때 재시도되는 셈)
export const syncPresence = async (payload) => {
  if (!isStudyRoomAvailable()) return;
  const uid = uidOrNull();
  if (!uid) return; // 화면에서 로그인하기 전에는 전송하지 않음 (자동 가입 방지)
  const roomId = cachedRoomId !== undefined ? cachedRoomId : await fetchMyRoomId();
  if (!roomId) return;
  const sig = presenceSig(payload);
  if (sig === lastPresenceSig) return;
  lastPresenceSig = sig;
  try {
    setupPresence(roomId, uid);
    await update(ref(db, `status/${roomId}/${uid}`), payload);
  } catch {
    lastPresenceSig = null; // 실패 시 다음 호출에서 재전송
  }
};

// 화면에서 방 입장/개설 직후 presence 준비 (구독 전 1회)
export const armPresence = () => {
  const uid = uidOrNull();
  if (uid && cachedRoomId) setupPresence(cachedRoomId, uid);
};
