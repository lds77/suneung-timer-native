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
