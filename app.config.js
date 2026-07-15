const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

// iOS 위젯(WidgetKit) ↔ 앱 데이터 공유용 App Group.
// preview/prod 공통으로 하나만 사용 (App Group은 bundleId와 독립적으로 팀에 등록됨).
const APP_GROUP = 'group.com.yeolgong.timer';

module.exports = {
  expo: {
    name: IS_PREVIEW ? '열공메이트(테스트)' : '열공메이트',
    slug: 'yeolgong-timer',
    version: '1.0.34',
    platforms: ['ios', 'android'], // web 제외 — SDK 56 eas update가 web 번들까지 export 시도하는 것 방지
    scheme: 'yeolgong',           // 위젯 딥링크용 (yeolgong://start?subjectId=...)
    // OTA(EAS Update): JS-only 수정을 스토어 심사 없이 배포.
    // 이 설정이 포함된 빌드(안드 1.0.33+, iOS 빌드 42+)부터 동작.
    // 배포: eas update --channel production --message "..." (같은 앱 버전에만 적용됨 — appVersion 정책)
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      url: 'https://u.expo.dev/ff1ee02a-77f5-4799-96d9-accb8eab8b36',
      fallbackToCacheTimeout: 0, // OTA 확인이 느려도 기존 번들로 즉시 시작 (시작 지연 없음)
    },
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
      buildNumber: '49', // 48은 2열 그리드 이전 버전 (TestFlight 업로드됨, 미사용)
      // 위젯 익스텐션 타겟 서명을 위해 필요 (Apple Developer 팀 ID)
      appleTeamId: process.env.APPLE_TEAM_ID || undefined,
      entitlements: {
        // iOS 홈 화면 위젯 데이터 공유 (App Group)
        'com.apple.security.application-groups': [APP_GROUP],
        // ※ 아래 두 entitlement는 프로비저닝 프로파일에 capability가 있어야 서명됨 —
        //   Apple 로그인(2FA) 상태의 eas build에서 capability 동기화 + 프로파일 재생성 필요 (빌드 44에서 수행)
        // 이탈 넛지의 방해금지 뚫기 (Time Sensitive 알림):
        'com.apple.developer.usernotifications.time-sensitive': true,
        // 울트라집중 앱 차단 (Screen Time / FamilyControls — 2026-07-05 계정 승인):
        'com.apple.developer.family-controls': true,
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // 집중 타이머 Live Activity (자체 ActivityKit — modules/live-activity + targets/widgets)
        NSSupportsLiveActivities: true,
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
      versionCode: 56, // 짝수 관행 + 로컬 테스트 APK(vc54)보다 커야 기기에서 스토어 빌드로 업그레이드 가능
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
      // SDK 56: compileSdk/targetSdk는 SDK 기본값(36) 사용 — 16KB 페이지 정렬도 기본 지원됨.
      // (구 expo-build-properties android 핀은 제거. Play 정책상 2026-08까지 target 36 필요)
      [
        'expo-notifications',
        {
          icon: './assets/icons/app-icon.png',
          color: '#FF6B9D',
        },
      ],
      'expo-asset',
      'expo-font',
      'expo-sharing',
      'expo-status-bar',
      // Live Activity는 자체 ActivityKit 구현 사용: modules/live-activity(네이티브 모듈) +
      // targets/widgets/FocusLiveActivity.swift(UI — 홈 위젯과 같은 익스텐션).
      // ※expo-widgets는 빌드46 실기기에서 렌더 불가(빈 카드)로 폐기 (2026-07-09)
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
            {
              name: 'TodayPlan',
              label: '오늘 계획',
              description: '플래너의 오늘 계획을 확인하고 눌러서 바로 시작해요',
              minWidth: '70dp',                   // 1x1까지 축소 가능
              minHeight: '70dp',
              targetCellWidth: 2,
              targetCellHeight: 2,                // 기본 2x2 (계획 목록)
              maxResizeWidth: '320dp',
              maxResizeHeight: '320dp',           // 세로로 키워 계획 더 노출 가능
              resizeMode: 'horizontal|vertical',
              updatePeriodMillis: 1800000,
            },
            {
              name: 'TodayTodo',
              label: '오늘 할 일',
              description: '오늘 할 일을 확인하고 위젯에서 바로 체크해요',
              minWidth: '70dp',                   // 1x1까지 축소 가능
              minHeight: '70dp',
              targetCellWidth: 2,
              targetCellHeight: 2,                // 기본 2x2 (할 일 목록)
              maxResizeWidth: '320dp',
              maxResizeHeight: '320dp',           // 세로로 키워 할 일 더 노출 가능
              resizeMode: 'horizontal|vertical',
              updatePeriodMillis: 1800000,        // 30분 주기 보조 갱신(자정 리셋 등)
            },
          ],
        },
      ],
      // iOS 홈 화면 위젯 (WidgetKit) — targets/widgets/ 의 Swift 코드를 익스텐션 타겟으로 추가.
      // Android에는 영향 없음(iOS prebuild 전용 플러그인).
      '@bacons/apple-targets',
      // androidx.work 중복 클래스 정렬 (SDK 56에서 발생 — 파일 주석 참고)
      './plugins/withAndroidWorkManagerFix',
    ],
    extra: {
      eas: {
        projectId: 'ff1ee02a-77f5-4799-96d9-accb8eab8b36',
      },
    },
  },
};
