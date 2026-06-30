const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

module.exports = {
  expo: {
    name: IS_PREVIEW ? '열공메이트(테스트)' : '열공메이트',
    slug: 'yeolgong-timer',
    version: '1.0.31',
    scheme: 'yeolgong',           // 위젯 딥링크용 (yeolgong://start?subjectId=...)
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
      buildNumber: '37',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      allowBackup: false,
      softwareKeyboardLayoutMode: 'pan',
      adaptiveIcon: {
        foregroundImage: './assets/icons/adaptive-icon.png',
        backgroundColor: '#E4ECF7',
      },
      package: IS_PREVIEW ? 'com.yeolgong.timer.preview' : 'com.yeolgong.timer',
      versionCode: 34,
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
      [
        'react-native-android-widget',
        {
          widgets: [
            {
              name: 'StudyTime',                  // 코드에서 참조하는 위젯 이름
              label: '오늘 공부시간',
              description: '오늘 공부한 시간과 목표 달성률을 보여줘요',
              minWidth: '70dp',                   // 1x1까지 축소 가능
              minHeight: '70dp',
              targetCellWidth: 2,                 // 기본 2x1
              targetCellHeight: 1,
              maxResizeWidth: '320dp',            // 2x2까지 리사이즈 허용
              maxResizeHeight: '200dp',
              resizeMode: 'horizontal|vertical',
              updatePeriodMillis: 1800000,        // 30분 주기 보조 갱신(자정 리셋 등)
            },
            {
              name: 'DDay',
              label: 'D-Day (시험 카운트다운)',
              description: '시험까지 남은 날을 임박한 순으로 보여줘요',
              minWidth: '70dp',                   // 1x1까지 축소 가능
              minHeight: '70dp',
              targetCellWidth: 2,
              targetCellHeight: 2,                // 기본 2x2 (여러 시험 노출)
              maxResizeWidth: '320dp',
              maxResizeHeight: '260dp',           // 세로로 키워 더 많이 노출 가능
              resizeMode: 'horizontal|vertical',
              updatePeriodMillis: 1800000,
            },
            {
              name: 'SubjectLauncher',
              label: '과목 바로 시작',
              description: '즐겨찾는 과목을 눌러 바로 타이머를 시작해요',
              minWidth: '70dp',                   // 1x1까지 축소 가능
              minHeight: '70dp',
              targetCellWidth: 2,
              targetCellHeight: 2,                // 기본 2x2 (칩 그리드)
              maxResizeWidth: '320dp',
              maxResizeHeight: '200dp',
              resizeMode: 'horizontal|vertical',
              updatePeriodMillis: 1800000,
            },
          ],
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
