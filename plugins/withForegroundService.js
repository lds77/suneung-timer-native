const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Config Plugin: Android Foreground Service 지원
 *
 * - FOREGROUND_SERVICE 권한 추가
 * - FOREGROUND_SERVICE_DATA_SYNC 권한 추가 (Android 14+)
 * - expo-notifications 서비스에 foregroundServiceType 속성 추가
 *   → sticky 알림 + 이 권한 조합으로 Android가 앱을 Foreground Service 앱으로 인식
 */
module.exports = function withForegroundService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // 1. uses-permission 목록 가져오기 (없으면 생성)
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const permissions = manifest['uses-permission'];

    const addPermission = (name) => {
      const exists = permissions.some((p) => p.$?.['android:name'] === name);
      if (!exists) {
        permissions.push({ $: { 'android:name': name } });
      }
    };

    addPermission('android.permission.FOREGROUND_SERVICE');
    addPermission('android.permission.FOREGROUND_SERVICE_DATA_SYNC');

    // 2. <application> 내 expo-notifications 서비스에 foregroundServiceType 추가
    const application = manifest.application?.[0];
    if (application?.service) {
      application.service = application.service.map((service) => {
        const serviceName = service.$?.['android:name'] || '';
        // expo-notifications 관련 서비스에 foregroundServiceType 적용
        if (
          serviceName.includes('expo.modules.notifications') ||
          serviceName.includes('ExpoNotifications') ||
          serviceName.includes('NotificationsService')
        ) {
          service.$ = {
            ...service.$,
            'android:foregroundServiceType': 'dataSync',
          };
        }
        return service;
      });
    }

    return config;
  });
};
