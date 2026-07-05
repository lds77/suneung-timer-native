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
export const presentShieldPicker = async () => {
  if (!mod) return -1;
  try { return await mod.presentPicker(); } catch { return -1; }
};

export const getShieldBlockedCount = () => {
  if (!mod) return 0;
  try { return mod.getBlockedCount(); } catch { return 0; }
};

export const setShield = (on) => {
  if (!mod) return false;
  try { return mod.setShield(on); } catch { return false; }
};
