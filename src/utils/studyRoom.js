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
  genRoomCode, isValidRoomCode, MAX_ROOM_MEMBERS, presenceSig, PRESENCE_MODES,
  LOUNGE_CODES, isLoungeCode, loungeNameFor, todayStudySec, staleJoinCandidates, heartbeatEligible,
  buildFocusSession, buildReport, buildCheer,
} from './studyRoomCore';
import { getToday } from './format';
import { durableAuthStorage } from './durableAuthStorage';

// firebase는 정적 import — 순수 JS라 번들 포함 비용뿐, 네트워크는 initApp() 전까지 없음
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, signInAnonymously } from 'firebase/auth';
import {
  getDatabase, ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp, push,
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
let reconciling = null; // 진행 중인 멤버십 확인 (앱 시작과 방 화면이 겹쳐도 한 번만)
let membershipNotice = null; // 복귀에 실패했을 때 방 화면이 한 번 보여줄 안내

// roomId를 storage에도 영속 — 위젯 헤드리스(별도 JS 컨텍스트)가 서버 조회 없이 읽는다
const ROOM_ID_KEY = '@yeolgong/studyRoomId';
const HEARTBEAT_AT_KEY = '@yeolgong/studyRoomLastHb';
// 온기용 — 마지막으로 공부를 멈춘 벽시계 시각과 그때 공부하던 모드(로컬). 앱을 다시 켜도 같은 값을 보내려고 둔다 (2026-11-11)
// ★모드도 같이 둔다 (2026-11-12). 시각만 두면 다시 켠 앱이 모드를 모르는데, 그때 '지금 설정'으로 채우면
//   집중으로 공부한 자리가 재시작 한 번에 녹색으로 바뀐다. 모르면 buildPresence가 칸을 안 싣는다(서버 값 유지)
const ENDED_AT_KEY = '@yeolgong/studyRoomEndedAt';
// 0·null이면 지운다 — 다시 공부를 시작하면 옛 멈춘 시각이 재시작 뒤에 되살아나지 않게
export const saveMyEnded = (ms, mode = null) => {
  (ms > 0
    ? AsyncStorage.setItem(ENDED_AT_KEY, JSON.stringify({ at: ms, mode: PRESENCE_MODES.includes(mode) ? mode : null }))
    : AsyncStorage.removeItem(ENDED_AT_KEY)).catch(() => {});
};
// → { at, mode } | null. 숫자만 적던 판(미리보기 2026-11-11~12)의 값도 읽는다 — 그때는 mode를 모른다(null)
export const loadMyEnded = async () => {
  try {
    const raw = await AsyncStorage.getItem(ENDED_AT_KEY);
    if (!raw) return null;
    const v = String(raw).trim().startsWith('{') ? JSON.parse(raw) : { at: Number(raw), mode: null };
    const at = Number(v?.at);
    if (!Number.isFinite(at) || at <= 0) return null;
    return { at, mode: PRESENCE_MODES.includes(v?.mode) ? v.mode : null };
  } catch { return null; }
};
const persistRoomId = (id) => {
  cachedRoomId = id;
  if (id) AsyncStorage.setItem(ROOM_ID_KEY, id).catch(() => {});
  else AsyncStorage.removeItem(ROOM_ID_KEY).catch(() => {});
};

const initApp = () => {
  if (app) return true;
  const cfg = getConfig();
  if (!cfg?.databaseURL) return false;
  app = getApps().length ? getApp() : initializeApp(cfg);
  try {
    // RN 영속화 필수 — 기본 메모리 영속이면 재시작마다 새 익명 uid가 생겨 유령 유저가 쌓임 (설계 3.1)
    // durableAuthStorage: iOS는 키체인 복제로 재설치에도 uid 생존, 안드/구빌드는 AsyncStorage 동일 동작
    auth = initializeAuth(app, { persistence: getReactNativePersistence(durableAuthStorage) });
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
export const getMyUid = () => uidOrNull(); // 화면에서 '내 자리' 표시용

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
    // createdAt은 최초 1회만 — 매번 덮어쓰면 '가입 시점'이 사라진다 (유령 판정/추적의 기준값)
    const has = await get(ref(db, `users/${uid}/createdAt`)).catch(() => null);
    await update(ref(db, `users/${uid}`), {
      nickname, character: character || 'toru',
      ...(has?.exists() ? {} : { createdAt: serverTimestamp() }),
    });
    return true;
  } catch { return false; }
};

// 프로필 수정 — 닉네임/캐릭터는 users와 rooms/{id}/members 두 곳에 중복 저장되므로
// 멀티패스 update로 원자 갱신 (한쪽만 바뀌면 방 화면엔 옛 닉네임이 남는다).
// seat/joinedAt은 건드리지 않음 — 재작성하면 자리와 입장 순번이 초기화된다 (재입장 버그 전례)
export const updateProfile = async ({ nickname, character }) => {
  const uid = await ensureSignedIn();
  if (!uid) return false;
  const roomId = cachedRoomId !== undefined ? cachedRoomId : await fetchMyRoomId();
  const patch = {
    [`users/${uid}/nickname`]: nickname,
    [`users/${uid}/character`]: character || 'toru',
  };
  if (roomId) {
    patch[`rooms/${roomId}/members/${uid}/nickname`] = nickname;
    patch[`rooms/${roomId}/members/${uid}/character`] = character || 'toru';
  }
  try {
    await update(ref(db), patch);
    return true;
  } catch { return false; }
};

// ── 방 ──
export const fetchMyRoomId = async () => {
  const uid = await ensureSignedIn();
  if (!uid) return null;
  try {
    const snap = await get(ref(db, `users/${uid}/roomId`));
    persistRoomId(snap.exists() ? snap.val() : null);
    return cachedRoomId;
  } catch { return null; }
};

// 입장/개설 전 이전 방 정리 — 네트워크 오류로 fetchMyRoomId가 null을 돌려줘 로비에 떨어진 유저가
// 다른 방에 들어가면 이전 방에 14일짜리 고아 멤버십이 남는다 (서버 roomId를 진실로 재확인 후 퇴장)
const leavePrevRoomIfAny = async (exceptCode = null) => {
  try {
    const prev = await fetchMyRoomId();
    if (prev && prev !== exceptCode) await leaveRoom();
  } catch {}
};

export const createRoom = async (name, profile, theme = 'cafe') => {
  const uid = await ensureSignedIn();
  if (!uid) return { ok: false, reason: '연결에 실패했어요' };
  await leavePrevRoomIfAny();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genRoomCode();
    try {
      const roomRef = ref(db, `rooms/${code}`);
      const existing = await get(roomRef);
      if (existing.exists()) continue; // 코드 충돌 → 재생성
      await set(roomRef, {
        name: String(name || '').trim().slice(0, 16) || '스터디룸',
        ownerUid: uid, createdAt: serverTimestamp(), theme,
        members: { [uid]: { nickname: profile.nickname, character: profile.character || 'toru', joinedAt: serverTimestamp() } },
      });
      await set(ref(db, `users/${uid}/roomId`), code);
      persistRoomId(code);
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
  await leavePrevRoomIfAny(code);
  try {
    let snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) return { ok: false, gone: true, reason: '그 코드의 방을 찾지 못했어요' };
    let room = snap.val();
    const alreadyIn = !!room.members?.[uid];
    if (alreadyIn) {
      // 재입장 — 멤버 레코드를 다시 쓰면 joinedAt(자리 순번)과 seat 선택이 초기화되므로 그대로 둔다
      await set(ref(db, `users/${uid}/roomId`), code);
      persistRoomId(code);
      return { ok: true, roomId: code, roomName: room.name };
    }
    if (Object.keys(room.members || {}).length >= MAX_ROOM_MEMBERS) {
      // 만석: 유령 후보 정리 시도 후 재확인 (전원 유령 방 잠금 방지 — 진짜 유령만 규칙이 삭제 허용)
      await sweepGhostMembers(code, staleJoinCandidates(room.members));
      snap = await get(ref(db, `rooms/${code}`));
      room = snap.val() || room;
      if (Object.keys(room.members || {}).length >= MAX_ROOM_MEMBERS) {
        return { ok: false, full: true, reason: `방이 가득 찼어요 (최대 ${MAX_ROOM_MEMBERS}명)` };
      }
    }
    await update(ref(db), {
      [`rooms/${code}/members/${uid}`]: { nickname: profile.nickname, character: profile.character || 'toru', joinedAt: serverTimestamp() },
      [`users/${uid}/roomId`]: code,
    });
    persistRoomId(code);
    return { ok: true, roomId: code, roomName: room.name };
  } catch {
    return { ok: false, reason: '참여에 실패했어요. 네트워크를 확인해 주세요' };
  }
};

// 공개 라운지 입장 — 자리가 있는 첫 호점에 참여, 방이 없으면 생성(첫 입장자가 개설)
export const joinLounge = async (profile) => {
  const uid = await ensureSignedIn();
  if (!uid) return { ok: false, reason: '연결에 실패했어요' };
  const prevId = await fetchMyRoomId();
  if (prevId) {
    if (isLoungeCode(prevId)) {
      // 이미 라운지 소속 — 있던 호점으로 재입장 (자리 순번/선택 보존, 다른 호점으로 중복 가입 방지)
      try {
        const snap = await get(ref(db, `rooms/${prevId}`));
        if (snap.exists() && snap.val().members?.[uid]) {
          persistRoomId(prevId);
          return { ok: true, roomId: prevId };
        }
      } catch {}
    }
    await leaveRoom();
  }
  for (const code of LOUNGE_CODES) {
    try {
      let snap = await get(ref(db, `rooms/${code}`));
      if (!snap.exists()) {
        try {
          await set(ref(db, `rooms/${code}`), {
            name: loungeNameFor(code), ownerUid: uid, createdAt: serverTimestamp(),
            theme: 'cafe', // 라운지는 스터디카페 테마 고정
            members: { [uid]: { nickname: profile.nickname, character: profile.character || 'toru', joinedAt: serverTimestamp() } },
          });
          await set(ref(db, `users/${uid}/roomId`), code);
          persistRoomId(code);
          return { ok: true, roomId: code };
        } catch {
          // 동시 첫 입장 레이스 — 다른 사람이 먼저 만들었으면 아래 일반 참여로 진행
          snap = await get(ref(db, `rooms/${code}`));
          if (!snap.exists()) continue;
        }
      }
      let room = snap.val();
      if (room.members?.[uid]) {
        // 이미 이 호점 멤버 (방어적 — 위 prevId 처리로 보통 도달 안 함). 레코드 재작성 없이 복귀
        await set(ref(db, `users/${uid}/roomId`), code);
        persistRoomId(code);
        return { ok: true, roomId: code };
      }
      if (Object.keys(room.members || {}).length >= MAX_ROOM_MEMBERS) {
        // 만석 호점: 유령 후보 정리 후 재확인 — 자리가 나면 이 호점을 우선 채운다
        await sweepGhostMembers(code, staleJoinCandidates(room.members));
        const re = await get(ref(db, `rooms/${code}`));
        room = re.val() || room;
        if (Object.keys(room.members || {}).length >= MAX_ROOM_MEMBERS) continue; // 여전히 만석 → 다음 호점
      }
      await update(ref(db), {
        [`rooms/${code}/members/${uid}`]: { nickname: profile.nickname, character: profile.character || 'toru', joinedAt: serverTimestamp() },
        [`users/${uid}/roomId`]: code,
      });
      persistRoomId(code);
      return { ok: true, roomId: code };
    } catch {
      // 생성 레이스(동시 첫 입장) 등 — 다음 호점 시도
    }
  }
  return { ok: false, reason: '라운지가 모두 가득 찼어요. 잠시 후 다시 시도해 주세요' };
};

export const leaveRoom = async () => {
  const uid = uidOrNull();
  if (!uid) return;
  const roomId = cachedRoomId ?? await fetchMyRoomId();
  teardownPresence();
  if (!roomId) return;
  try {
    // 마지막 멤버인지 퇴장 전에 판정 — 마지막이면 방 노드째 삭제 (빈 유령 방이 영구히 쌓이는 것 방지)
    let lastMember = false;
    try {
      const m = await get(ref(db, `rooms/${roomId}/members`));
      lastMember = Object.keys(m.val() || {}).every(k => k === uid);
    } catch {}
    await update(ref(db), {
      [`rooms/${roomId}/members/${uid}`]: null,
      [`status/${roomId}/${uid}`]: null,
      [`users/${uid}/roomId`]: null,
    });
    // 내가 받은 응원 정리 — 멤버십과 별개 경로라 leave update에 섞지 않는다
    // (멀티패스는 원자적이라 한 경로가 거부되면 퇴장 자체가 실패함)
    try { await remove(ref(db, `cheers/${roomId}/${uid}`)); } catch {}
    if (lastMember) {
      // 규칙이 '멤버 0명'을 재검증 — 판정~삭제 사이에 누가 입장했으면 거부돼 방이 유지됨.
      // 라운지도 삭제 대상 (다음 입장자가 joinLounge에서 재생성)
      try { await remove(ref(db, `rooms/${roomId}`)); } catch {}
      // status/cheers 잔재 정리 — 규칙상 방이 사라진 뒤에만 허용되므로 방 삭제가 거부되면 같이 거부됨
      try { await remove(ref(db, `status/${roomId}`)); } catch {}
      try { await remove(ref(db, `cheers/${roomId}`)); } catch {}
    }
  } catch {}
  persistRoomId(null);
  lastPresenceSig = null;
};

// '내 방'이 실제 명단과 맞는지 확인하고, 명단에서 빠졌으면 다시 넣는다.
//
// ★유령 정리는 rooms/{id}/members/{uid}만 지운다. users/{uid}는 규칙상 본인만 쓸 수 있어 '내 방'이 남는다.★
// 그대로 두면 앱은 방에 있는 줄 알고 방 화면을 보여주는데, 규칙상 status를 읽지도 쓰지도 못한다.
// 내 공부는 남에게 안 보이고, 남은 전부 쉬는 중으로 보인다 (2026-11-04 제보).
//
// 앱을 쓰는 사람은 유령이 아니므로 묻지 않고 되돌린다. 나가기는 '내 방'을 함께 지우므로
// '내 방은 있는데 명단에 없다'는 정리된 경우뿐이다 — 스스로 나간 사람이 되돌아오는 일은 없다.
// 네트워크 실패는 정리로 치지 않는다 (known: false — 다음 기회에 다시 확인).
const doReconcile = async () => {
  const uid = await ensureSignedIn();
  if (!uid) return { roomId: null, known: false };
  let roomId;
  try {
    const pointer = await get(ref(db, `users/${uid}/roomId`));
    roomId = pointer.exists() ? pointer.val() : null;
  } catch {
    return { roomId: cachedRoomId ?? null, known: false };
  }
  persistRoomId(roomId);
  if (!roomId) return { roomId: null, known: true };

  let profile;
  try {
    // 대부분 여기서 끝나므로 방 전체가 아니라 내 줄만 읽는다
    const me = await get(ref(db, `rooms/${roomId}/members/${uid}`));
    if (me.exists()) return { roomId, known: true };
    profile = (await get(ref(db, `users/${uid}`))).val();
  } catch {
    return { roomId, known: false };
  }
  if (!profile?.nickname) return { roomId, known: false };

  // 정리된 동안 걸어 둔 onDisconnect와 전송 기록은 거부된 것이라 새로 시작한다
  teardownPresence();
  lastPresenceSig = null;
  const lounge = isLoungeCode(roomId);
  const r = lounge ? await joinLounge(profile) : await joinRoom(roomId, profile);
  if (r.ok) return { roomId: r.roomId, known: true, rejoined: true };
  // 방 코드의 네트워크 실패는 '내 방'을 지우지 않는다. 라운지는 joinLounge가 이미 나왔다
  if (!lounge && !r.gone && !r.full) return { roomId, known: false };
  if (!lounge) await leaveRoom();
  const where = lounge ? '라운지' : `방(${roomId})`;
  membershipNotice = `오랫동안 사용하지 않아 ${where} 자리가 정리됐어요.\n${r.reason}`;
  return { roomId: null, known: true };
};

export const reconcileMembership = () => {
  if (!reconciling) reconciling = doReconcile().finally(() => { reconciling = null; });
  return reconciling;
};

// 방 화면이 한 번만 띄울 안내를 꺼낸다 (앱 시작 때 실패했어도 방을 열 때 알 수 있게)
export const takeMembershipNotice = () => {
  const notice = membershipNotice;
  membershipNotice = null;
  return notice;
};

// 자리 선택 — 빈 좌석 탭 시 내 멤버 레코드에 seat 저장 (표시 배치는 resolveSeats가 결정)
export const setMySeat = async (roomId, seat) => {
  const uid = uidOrNull();
  if (!uid || !roomId) return false;
  try {
    await update(ref(db, `rooms/${roomId}/members/${uid}`), { seat });
    return true;
  } catch { return false; }
};

// 유령 멤버 정리 — 14일 무활동 멤버를 명단/상태에서 제거 (규칙이 무활동 검증을 서버측 강제).
// uid별 개별 update: 동시 정리 레이스에서 한 건이 거부돼도 나머지는 진행되도록
export const sweepGhostMembers = async (roomId, ghostUids) => {
  const uid = uidOrNull();
  if (!uid || !roomId || !ghostUids?.length) return;
  for (const g of ghostUids.slice(0, 20)) {
    if (g === uid) continue;
    try {
      await update(ref(db), {
        [`rooms/${roomId}/members/${g}`]: null,
        [`status/${roomId}/${g}`]: null,
      });
    } catch {
      // 이미 다른 멤버가 정리했거나 규칙 거부(방금 활동 재개) — 무시
    }
  }
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
  let status; // undefined = 아직 못 받았거나 읽을 권한이 없음. null은 받았는데 아무도 없다는 뜻
  let cheers = null;
  const emit = () => cb({ room, status, cheers });
  const u1 = onValue(ref(db, `rooms/${roomId}`), s => { room = s.val(); emit(); }, () => {});
  const u2 = onValue(ref(db, `status/${roomId}`), s => { status = s.val(); emit(); }, () => {});
  const u3 = onValue(ref(db, `cheers/${roomId}`), s => { cheers = s.val(); emit(); }, () => {});
  return () => { u1(); u2(); u3(); };
};

// ── 응원 보내기 (D) ──
// /cheers/{roomId}/{targetUid}/{senderUid} — 보낸이 uid가 키라 연타해도 자기 것만 덮어씀(스팸 억제).
// 익명: 값에는 시각만 저장하고 보낸 사람 이름은 담지 않는다 (studyRoomCore.buildCheer 주석 참고).
// 규칙: 같은 방 멤버만, 본인 sender 키에만, 자기 자신에겐 불가 (docs/firebase-database.rules.json — 콘솔 배포 필요)
export const sendCheer = async (roomId, targetUid) => {
  const uid = uidOrNull();
  if (!uid || !roomId || !targetUid || targetUid === uid) return false;
  try {
    await set(ref(db, `cheers/${roomId}/${targetUid}/${uid}`), buildCheer());
    return true;
  } catch { return false; }
};

// 내가 받은 응원만 구독 (방 화면 밖 토스트용 — 경량, 남의 응원은 안 읽음)
export const subscribeMyCheers = (roomId, cb) => {
  if (!initApp() || !roomId) return () => {};
  const uid = uidOrNull();
  if (!uid) return () => {};
  return onValue(ref(db, `cheers/${roomId}/${uid}`), s => cb(s.val()), () => cb(null));
};

// 다같이 집중 세션만 구독 (방 화면 밖 인지용 — rooms/{id}/focusSession 노드 하나).
// rooms는 auth 유저 read 허용이라 규칙 변경 불필요
export const subscribeFocusSession = (roomId, cb) => {
  if (!initApp() || !roomId) return () => {};
  return onValue(ref(db, `rooms/${roomId}/focusSession`), s => cb(s.val()), () => cb(null));
};

// ── 다같이 집중 세션 (B) ──
// 멤버 누구나 시작 가능(방 노드에 focusSession 기록). 방 구독(subscribeRoom)이 room.focusSession으로 전달.
// 규칙: rooms/$id/focusSession에 멤버 write 허용 필요 (docs/firebase-database.rules.json — 콘솔 배포 필수).
export const startFocusSession = async (roomId, durationMin, profile) => {
  const uid = uidOrNull();
  if (!uid || !roomId) return { ok: false, reason: '연결에 실패했어요' };
  try {
    await set(ref(db, `rooms/${roomId}/focusSession`), buildFocusSession(durationMin, uid, profile?.nickname || ''));
    return { ok: true };
  } catch { return { ok: false, reason: '시작에 실패했어요. 잠시 후 다시 시도해 주세요' }; }
};

// 만료 세션 정리 — 어떤 멤버든 지운다 (다음 세션이 덮어쓰기도 하지만 노드 위생용).
export const clearFocusSession = async (roomId) => {
  const uid = uidOrNull();
  if (!uid || !roomId) return;
  try { await remove(ref(db, `rooms/${roomId}/focusSession`)); } catch {}
};

// 신고 — /reports에 append (create-only, 본인 것만). 콘솔에서 검토. 실패는 조용히 false.
export const reportMember = async (roomId, reportedUid, reportedNick, byNick) => {
  const uid = uidOrNull();
  if (!uid || !roomId || !reportedUid) return false;
  try {
    await push(ref(db, 'reports'), buildReport(roomId, reportedUid, reportedNick, uid, byNick));
    return true;
  } catch { return false; }
};

// status만 구독 (방 화면 밖에서 '우리 방 N명 집중 중' 인원 계산용 — 경량, room/members 안 읽음).
// 켠 유저 1인당 리스너 1개. 방이 없으면 즉시 no-op.
// 취소(방 나가기로 read 권한 상실 등) 시 cb(null) — 옛 방 스냅샷이 카운트에 잔존하는 것 방지
export const subscribeRoomStatus = (roomId, cb) => {
  if (!initApp() || !roomId) return () => {};
  return onValue(ref(db, `status/${roomId}`), s => cb(s.val()), () => cb(null));
};

// 모듈 캐시 roomId 노출 — useAppState의 카운트 구독이 방 이동/나가기를 폴링 없이 감지
// (leave/join/create가 같은 JS 컨텍스트에서 persistRoomId로 갱신). undefined = 아직 미조회
export const getCachedRoomId = () => cachedRoomId;

// ── Presence ──
// 연결될 때마다 onDisconnect 재등록 (설계 8: 한 번 등록으로 영구가 아님).
// onDisconnect는 state를 'bg'로 — 클라이언트 표시 규칙(displayStatus)이 60분까지 공부 중으로 그려줌
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
// 가장 최근 syncPresence 호출의 세대 — 늦게 돌아온 실패가 그사이 나간 새 상태를 덮지 못하게 한다
let presenceGen = 0;
// 규칙이 endedAt을 거부한 적이 있으면(게시 전이거나 콘솔에서 되돌린 경우) 이 실행 동안은 싣지 않는다
let endedAtUnsupported = false;
const isPermissionDenied = (e) => /permission[_ ]denied/i.test(`${e?.code || ''} ${e?.message || ''}`);
const withoutEndedAt = (p) => { const r = { ...p }; delete r.endedAt; return r; };

export const syncPresence = async (payload) => {
  if (!isStudyRoomAvailable()) return;
  const uid = uidOrNull();
  if (!uid) return; // 화면에서 로그인하기 전에는 전송하지 않음 (자동 가입 방지)
  const roomId = cachedRoomId !== undefined ? cachedRoomId : await fetchMyRoomId();
  if (!roomId) return;
  // 공부 시작의 endedAt: null(삭제)은 규칙 검증을 받지 않으므로 그대로 둔다 — 빼는 것은 숫자일 때뿐
  const send = endedAtUnsupported && payload?.endedAt != null ? withoutEndedAt(payload) : payload;
  const sig = presenceSig(send);
  if (sig === lastPresenceSig) return;
  lastPresenceSig = sig;
  const gen = ++presenceGen;
  const target = ref(db, `status/${roomId}/${uid}`);
  try {
    setupPresence(roomId, uid);
    await update(target, send);
  } catch (e) {
    // ★늦게 돌아온 실패는 아무것도 하지 않는다 (2026-11-11 아스트라 W-01).
    //   쉬는 중 전송 A가 늦게 거부되는 사이 다시 공부를 시작해 B가 나갔다면, A를 줄여 다시 보내는 순간
    //   B의 '공부 중'을 '쉬는 중'으로 덮는다. 그 뒤엔 같은 B를 다시 불러도 sig가 같아 고쳐지지도 않았다
    if (gen !== presenceGen) return;
    // ★권한 거부일 때만 endedAt을 뺀다. 다른 오류까지 칸 미지원으로 보면 안 된다.
    //   실제로 보낸 것(endedAt 없는 판)을 기억한다 — 다 보낸 것으로 기억하면 같은 상태에서 다시 안 보낸다 (W-05)
    if (send.endedAt != null && isPermissionDenied(e)) {
      const rest = withoutEndedAt(send);
      lastPresenceSig = presenceSig(rest);
      try {
        await update(target, rest);
        // ★줄인 판이 받아들여졌을 때만 '칸 미지원'으로 굳힌다 (2026-11-12).
        //   줄인 판까지 거부됐다면 이유는 endedAt이 아니다 — 방 명단에서 빠진 경우다(14일 정리 뒤, 자동 복귀 전).
        //   거부 한 번으로 굳히면 명단에 돌아온 뒤에도 앱을 다시 켤 때까지 그 사람의 온기가 안 나간다
        endedAtUnsupported = true;
      } catch { if (gen === presenceGen) lastPresenceSig = null; }
      return;
    }
    lastPresenceSig = null; // 실패 시 다음 호출에서 재전송
  }
};

// 화면에서 방 입장/개설 직후 presence 준비 (구독 전 1회)
export const armPresence = () => {
  const uid = uidOrNull();
  if (uid && cachedRoomId) setupPresence(cachedRoomId, uid);
};

// 포그라운드 복귀 시 시그니처 캐시 비우기 — bg 진입 때 onDisconnect가 서버에 'bg'를 남기는데,
// 로컬 시그니처는 여전히 'studying'이라 재전송이 스킵돼 '자리비움일 수 있음'이 계속 남는다
export const forcePresenceResync = () => { lastPresenceSig = null; };

// 하트비트(포그라운드용) — 앱이 떠 있는 동안 10분 간격 updatedAt 갱신.
// ※JS 인터벌은 백그라운드에서 멈추므로(실기기 확인) bg 커버는 아래 headlessHeartbeat가 담당.
// 마지막 전송이 studying일 때만 (쉬는 중인데 갱신하면 의미 없는 쓰기)
export const heartbeatPresence = async () => {
  if (!isStudyRoomAvailable()) return;
  const uid = uidOrNull();
  if (!uid || !lastPresenceSig || !lastPresenceSig.startsWith('studying')) return;
  const roomId = cachedRoomId !== undefined ? cachedRoomId : await fetchMyRoomId();
  if (!roomId) return;
  try { await update(ref(db, `status/${roomId}/${uid}`), { updatedAt: Date.now() }); } catch {}
};

// 헤드리스 하트비트 — 위젯 갱신 이벤트(30분 주기 updatePeriodMillis)에 실려 백그라운드에서 실행.
// 앱 JS의 인터벌이 bg에서 멈추기 때문에, 안드 장시간 공부 유지는 이 경로가 유일하다.
// 별도 JS 컨텍스트라 모듈 상태(cachedRoomId 등)가 비어 있음 — 전부 storage에서 읽는다.
// 타이머 스냅샷(5초 스로틀 저장)의 running 타이머가 있을 때만: resumedAt이 epoch 기준이라
// bg에서도 벽시계로 유효 = 실제로 아직 공부 중. state를 studying으로 되돌려 bg 마킹도 해제.
// mode/subjectLabel/startedAt은 건드리지 않음(RTDB update 머지) — 마지막 전체 전송값 유지
export const headlessHeartbeat = async () => {
  try {
    if (!isStudyRoomAvailable()) return;
    const roomId = await AsyncStorage.getItem(ROOM_ID_KEY);
    if (!roomId) return;
    const now = Date.now();
    const lastHb = Number(await AsyncStorage.getItem(HEARTBEAT_AT_KEY)) || 0;
    if (now - lastHb < 15 * 60 * 1000) return; // 위젯 여러 개가 연달아 호출해도 15분 스로틀
    const snapRaw = await AsyncStorage.getItem('@yeolgong/timerSnapshot');
    const snap = snapRaw ? JSON.parse(snapRaw) : null;
    const running = (snap?.timers || []).find(t => t && t.type !== 'lap' && t.status === 'running');
    if (!running) return;
    // 좀비 스냅샷 방어 — 앱이 살아 있었으면 이미 끝났을 타이머면 하트비트 중단.
    // 안 하면 강제종료된 앱의 running 스냅샷이 방 화면 '공부 중'을 무한 연장한다.
    // countdown/연속은 예정 종료+1분, 끝없는 타이머(자유/뽀모)는 벽시계 경과 5시간 상한
    if (!heartbeatEligible(running, now)) return;
    const uid = await ensureSignedIn(); // AsyncStorage 영속 세션 복원 (같은 익명 uid)
    if (!uid) return;
    let todaySec = 0;
    try {
      const sessRaw = await AsyncStorage.getItem('@yeolgong/sessions');
      todaySec = todayStudySec(sessRaw ? JSON.parse(sessRaw) : [], getToday());
    } catch {}
    await update(ref(db, `status/${roomId}/${uid}`), {
      state: 'studying', updatedAt: now,
      todaySec: Math.max(0, Math.min(86400, Math.round(todaySec))), date: getToday(),
    });
    await AsyncStorage.setItem(HEARTBEAT_AT_KEY, String(now));
  } catch {
    // 헤드리스 실패는 조용히 — 다음 위젯 갱신 주기에 재시도되는 셈
  }
};
