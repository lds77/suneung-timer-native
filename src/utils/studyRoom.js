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
  LOUNGE_CODES, isLoungeCode, loungeNameFor, todayStudySec, staleJoinCandidates, heartbeatEligible,
  buildFocusSession,
} from './studyRoomCore';
import { getToday } from './format';
import { durableAuthStorage } from './durableAuthStorage';

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

// roomId를 storage에도 영속 — 위젯 헤드리스(별도 JS 컨텍스트)가 서버 조회 없이 읽는다
const ROOM_ID_KEY = '@yeolgong/studyRoomId';
const HEARTBEAT_AT_KEY = '@yeolgong/studyRoomLastHb';
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
    if (!snap.exists()) return { ok: false, reason: '그 코드의 방을 찾지 못했어요' };
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
        return { ok: false, reason: `방이 가득 찼어요 (최대 ${MAX_ROOM_MEMBERS}명)` };
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
    if (lastMember) {
      // 규칙이 '멤버 0명'을 재검증 — 판정~삭제 사이에 누가 입장했으면 거부돼 방이 유지됨.
      // 라운지도 삭제 대상 (다음 입장자가 joinLounge에서 재생성)
      try { await remove(ref(db, `rooms/${roomId}`)); } catch {}
      // status 잔재(스윕 잔여 등) 정리 — 규칙상 방이 사라진 뒤에만 허용되므로 방 삭제가 거부되면 같이 거부됨
      try { await remove(ref(db, `status/${roomId}`)); } catch {}
    }
  } catch {}
  persistRoomId(null);
  lastPresenceSig = null;
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
  let status = null;
  const emit = () => cb({ room, status });
  const u1 = onValue(ref(db, `rooms/${roomId}`), s => { room = s.val(); emit(); }, () => {});
  const u2 = onValue(ref(db, `status/${roomId}`), s => { status = s.val(); emit(); }, () => {});
  return () => { u1(); u2(); };
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

// status만 구독 (방 화면 밖에서 '우리 방 N명 집중 중' 인원 계산용 — 경량, room/members 안 읽음).
// 켠 유저 1인당 리스너 1개. 방이 없으면 즉시 no-op.
export const subscribeRoomStatus = (roomId, cb) => {
  if (!initApp() || !roomId) return () => {};
  return onValue(ref(db, `status/${roomId}`), s => cb(s.val()), () => {});
};

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
