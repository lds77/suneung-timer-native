const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

module.exports = {
  expo: {
    name: IS_PREVIEW ? '열공메이트(테스트)' : '열공메이트',
    slug: 'yeolgong-timer',
    version: '1.0.27',
    orientation: 'portrait',
    icon: './assets/icons/app-icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#F8F5FC',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_PREVIEW ? 'com.yeolgong.timer.preview' : 'com.yeolgong.timer',
      buildNumber: '28',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      allowBackup: false,
      softwareKeyboardLayoutMode: 'pan',
      adaptiveIcon: {
        foregroundImage: './assets/icons/adaptive-icon.png',
        backgroundColor: '#FFF0F5',
      },
      package: IS_PREVIEW ? 'com.yeolgong.timer.preview' : 'com.yeolgong.timer',
      versionCode: 20,
      permissions: [
        'VIBRATE',
        'RECEIVE_BOOT_COMPLETED',
        'SCHEDULE_EXACT_ALARM',
        'android.permission.USE_EXACT_ALARM',
        'android.permission.MODIFY_AUDIO_SETTINGS',
      ],
      blockedPermissions: ['android.permission.ACTIVITY_RECOGNITION'],
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            buildToolsVersion: '35.0.0',
            enablePageAlignedJniLibs: true,
          },
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icons/app-icon.png',
          color: '#FF6B9D',
        },
      ],
      'expo-av',
      'expo-font',
      [
        'expo-live-activity',
        {
          // iOS 16.2 미만 기기에서는 throw 대신 조용히 no-op
          silentOnUnsupportedOS: true,
        },
      ],
    ],
    extra: {
      eas: {
        projectId: 'ff1ee02a-77f5-4799-96d9-accb8eab8b36',
      },
    },
  },
};
