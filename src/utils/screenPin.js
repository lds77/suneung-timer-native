// src/utils/screenPin.js
// 안드로이드 화면 고정(App Pinning) 래퍼 — iOS/Expo Go에서는 모든 함수가 no-op.
// 울트라집중 '시험' 강도에서 홈/최근앱 버튼을 OS 차원에서 차단해 무의식적 이탈을 막는다.
// 해제: 사용자가 뒤로+최근앱 버튼을 동시에 길게 누르거나, 세션 종료 시 unpinScreen().

import { Platform } from 'react-native';

let mod = null;
if (Platform.OS === 'android') {
  try { mod = require('../../modules/screen-pin').default; } catch { mod = null; }
}

export const pinScreen = async () => {
  if (!mod) return false;
  try { return await mod.pin(); } catch { return false; }
};

export const unpinScreen = async () => {
  if (!mod) return false;
  try { return await mod.unpin(); } catch { return false; }
};

export const isScreenPinned = () => {
  if (!mod) return false;
  try { return mod.isPinned(); } catch { return false; }
};

// 고정 중에는 OS가 알림 소리/진동을 차단하므로, 완료/페이즈 시각에 네이티브 알람으로
// 직접 진동+알림음을 울린다. 리시버가 고정 중일 때만 울리므로(자체 게이트) 중복 걱정 없음.
export const scheduleLockAlarm = async (id, atMs) => {
  if (!mod) return false;
  try { return await mod.scheduleAlarm(id, atMs); } catch { return false; }
};

export const cancelLockAlarm = async (id) => {
  if (!mod) return false;
  try { return await mod.cancelAlarm(id); } catch { return false; }
};
