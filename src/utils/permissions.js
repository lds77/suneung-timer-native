// src/utils/permissions.js
// Android 알림 관련 권한/설정 화면 바로가기 헬퍼 (온보딩·설정탭 공용)

import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';

// 빌드 변형(preview 포함)에 맞는 실제 패키지명 — 하드코딩 시 preview 빌드에서 설정 화면이 안 열림
const PKG = Constants.expoConfig?.android?.package || 'com.yeolgong.timer';

// 정확한 알람 권한 설정 화면 (Android 12+/API 31+)
// 권한이 꺼져 있으면 expo-notifications가 비정확 알람으로 떨어져 Doze 중 알림이 몰려서 옴
export const openExactAlarmSettings = () => {
  if (Platform.OS !== 'android') return;
  IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', { data: `package:${PKG}` })
    .catch(() => {
      // 일부 기기는 해당 화면 미지원 → 앱 상세 설정으로 폴백
      IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, { data: `package:${PKG}` }).catch(() => {});
    });
};

// 앱 알림 설정 화면 (안드 8+) — 알림 권한이 꺼져 있을 때 바로 보내 준다.
// 미지원 기기는 앱 상세 설정으로 폴백
export const openAppNotifSettings = () => {
  if (Platform.OS !== 'android') return;
  IntentLauncher.startActivityAsync('android.settings.APP_NOTIFICATION_SETTINGS', {
    extra: { 'android.provider.extra.APP_PACKAGE': PKG },
  }).catch(() => {
    IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, { data: `package:${PKG}` }).catch(() => {});
  });
};

// 특정 알림 채널 설정 화면 (안드 8+) — 채널만 꺼 둔 경우 그 화면으로 바로 보낸다.
// 채널이 아직 만들어지지 않았으면(타이머를 한 번도 안 돌림) 열리지 않으므로 앱 알림 설정으로 폴백
export const openChannelSettings = (channelId) => {
  if (Platform.OS !== 'android' || !channelId) return;
  IntentLauncher.startActivityAsync('android.settings.CHANNEL_NOTIFICATION_SETTINGS', {
    extra: { 'android.provider.extra.APP_PACKAGE': PKG, 'android.provider.extra.CHANNEL_ID': channelId },
  }).catch(() => openAppNotifSettings());
};
