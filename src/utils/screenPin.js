// src/utils/screenPin.js
// 안드로이드 화면 고정(App Pinning) 래퍼 — iOS/Expo Go에서는 모든 함수가 no-op.
// 울트라집중 '시험' 강도에서 홈/최근앱 버튼을 OS 차원에서 차단해 무의식적 이탈을 막는다.
// 해제: 사용자가 뒤로+최근앱 버튼을 동시에 길게 누르거나, 세션 종료 시 unpinScreen().

import { Platform } from 'react-native';

let mod = null;
if (Platform.OS === 'android') {
  try { mod = require('../../modules/screen-pin').default; } catch { mod = null; }
}

// 고정 요청 디바운스 — 시작 직후 activateScreenOnMode와 잠금화면 점등(setScreenLocked)이
// 연달아 pin을 호출할 수 있는데, OS 확인 다이얼로그가 떠 있는 동안 isPinned()는 false라
// 중복 요청을 못 거른다 → 짧은 간격의 재요청은 무시
let lastPinRequestAt = 0;

export const pinScreen = async () => {
  if (!mod) return false;
  const now = Date.now();
  if (now - lastPinRequestAt < 2000) return false;
  lastPinRequestAt = now;
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

// 타이머 종료 시각에 홈 위젯 강제 갱신 알람 — 앱이 죽어 있어도 위젯의 '집중 중' 표시와
// 오늘 합계가 종료 순간 갱신된다 (AlarmReceiver가 APPWIDGET_UPDATE 브로드캐스트 →
// react-native-android-widget 헤드리스 렌더 → widgetData.js 좀비 가드/잠정 가산 반영).
// 같은 id로 재예약하면 기존 알람을 대체한다.
export const scheduleWidgetRefresh = async (id, atMs) => {
  if (!mod) return false;
  try { return await mod.scheduleWidgetRefresh(id, atMs); } catch { return false; }
};

export const cancelWidgetRefresh = async (id) => {
  if (!mod) return false;
  try { return await mod.cancelWidgetRefresh(id); } catch { return false; }
};
