// src/utils/focusShield.js
// iOS Screen Time(FamilyControls) 앱 차단 래퍼 — Android/Expo Go/미지원 기기에서는 no-op.
// 울트라집중(시험) 세션 시작 시 사용자가 고른 앱에 방패를 걸고, 세션 종료 시 해제한다.
// ※ 'com.apple.developer.family-controls' entitlement가 포함된 빌드에서만 실제 동작
//   (없으면 인증 요청이 거부되고 전 기능이 조용히 무력화됨 — 크래시 없음)

import { Platform } from 'react-native';

let mod = null;
if (Platform.OS === 'ios') {
  try { mod = require('../../modules/focus-shield').default; } catch { mod = null; }
}

// ─── 화면 잠금 감지 (🔥모드 이탈 판정용) ───────────────────────────────────
// iOS는 화면 잠금과 앱 전환이 같은 이벤트라 즉시 구분이 안 된다. 네이티브가 백그라운드에서
// isProtectedDataAvailable을 지켜보다 잠금을 감지하면(약 10초 뒤) 시각을 기록해 둔다.
// 구 네이티브 빌드에는 이 함수들이 없어 조용히 무시됨 → 기존 동작 유지 (OTA 안전).
export const lockDetectSupported = () => !!mod && typeof mod.consumeLockedAt === 'function';

// 🔥모드 세션 동안만 감시 켜기 (세션 밖에서 백그라운드 태스크를 쓰지 않도록)
export const setLockWatch = (on) => {
  if (!mod || typeof mod.setLockWatch !== 'function') return;
  try { mod.setLockWatch(!!on); } catch {}
};

// 직전 백그라운드가 '화면 잠금'이었으면 감지 시각(ms), 아니면 0. 읽으면 초기화된다.
export const consumeScreenLock = () => {
  if (!mod || typeof mod.consumeLockedAt !== 'function') return 0;
  try { return mod.consumeLockedAt() || 0; } catch { return 0; }
};

// ─── 전화 수신·통화 감지 (iOS, 2026-08-01) ─────────────────────────────────
// 안드 screenPin의 isInCall()/msSinceCall()과 같은 계약 — useAppState가 두 플랫폼을
// 같은 모양으로 다룰 수 있게 맞췄다. 구 네이티브 빌드에는 없으므로 조용히 no-op (OTA 안전).
export const callDetectSupported = () => !!mod && typeof mod.msSinceCall === 'function';

// 지금 통화 중인가 (호출만 해도 네이티브의 통화 기준 시각이 갱신된다)
export const isInCallIOS = () => {
  if (!mod || typeof mod.isInCall !== 'function') return false;
  try { return !!mod.isInCall(); } catch { return false; }
};

// 마지막 통화 관측 이후 경과(ms). 기록이 없으면 -1
export const msSinceCallIOS = () => {
  if (!mod || typeof mod.msSinceCall !== 'function') return -1;
  try {
    const v = mod.msSinceCall();
    return typeof v === 'number' && Number.isFinite(v) ? v : -1;
  } catch { return -1; }
};

// 백그라운드 관측이 끊길 때 통화가 진행 중이었는가 (읽으면 초기화).
// true면 통화가 언제 끝났는지 알 수 없어 그 배경 구간을 통째로 면제한다 — iOS 고유의 양보.
export const consumeCallHeldIOS = () => {
  if (!mod || typeof mod.consumeCallHeld !== 'function') return false;
  try { return !!mod.consumeCallHeld(); } catch { return false; }
};

export const shieldSupported = () => {
  if (!mod) return false;
  try { return mod.isSupported(); } catch { return false; }
};

// 'approved' | 'denied' | 'notDetermined' | 'unsupported'
export const getShieldAuthStatus = () => {
  if (!mod) return 'unsupported';
  try { return mod.getAuthorizationStatus(); } catch { return 'unsupported'; }
};

export const requestShieldAuth = async () => {
  if (!mod) return 'unsupported';
  try { return await mod.requestAuthorization(); } catch { return 'denied'; }
};

// 차단 앱 선택 모달 → 선택 항목 수 resolve (-1: 미지원/실패)
// ※ 인자 없이 호출 유지 — 구 네이티브(빌드 44/45)에 OTA로 내려가도 차단 피커는 계속 동작해야 함
export const presentShieldPicker = async () => {
  if (!mod) return -1;
  try { return await mod.presentPicker(); } catch { return -1; }
};

// 허용 앱 선택 모달 (전체 차단의 예외 목록) → 선택 항목 수 resolve (-1: 미지원/실패)
export const presentAllowPicker = async () => {
  if (!mod) return -1;
  try { return await mod.presentPicker('allow'); } catch { return -1; }
};

export const getShieldBlockedCount = () => {
  if (!mod) return 0;
  try { return mod.getBlockedCount(); } catch { return 0; }
};

export const getShieldAllowedCount = () => {
  if (!mod) return 0;
  try { return mod.getAllowedCount(); } catch { return 0; }
};

// 전체 차단(allowAll) 모드 지원 여부 — 구 네이티브 빌드에는 getAllowedCount가 없음
export const allowAllSupported = () => {
  return !!mod && typeof mod.getAllowedCount === 'function';
};

// mode: 'block'(선택한 앱만 차단, 기본) | 'allowAll'(허용 앱 빼고 전부 차단)
// 구 네이티브에는 setShieldMode가 없어 조용히 무시됨 → 항상 block으로 동작 (OTA 안전)
export const setShield = (on, mode = 'block') => {
  if (!mod) return false;
  if (on) { try { mod.setShieldMode(mode); } catch {} }
  try { return mod.setShield(on); } catch { return false; }
};
