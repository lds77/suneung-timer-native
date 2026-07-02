/** @type {import('@bacons/apple-targets/app.plugin').Config} */
// iOS 홈 화면 위젯(WidgetKit) 익스텐션 타겟 설정.
// App Group은 app.config.js 의 APP_GROUP('group.com.yeolgong.timer')과 반드시 일치해야 함.
module.exports = {
  type: 'widget',
  // 타겟 이름은 반드시 디렉터리명과 동일한 ASCII('widgets')여야 함.
  // EAS가 프로비저닝을 붙일 때 이 이름으로 pbxproj 타겟을 찾음(한글/공백 금지).
  // 사용자에게 보이는 위젯 이름은 각 Swift 위젯의 configurationDisplayName(한글)에 있음.
  name: 'widgets',
  // 이미 등록된 번들ID 유지: 메인앱 번들ID + '.widget' (preview 변형도 자동 대응)
  bundleIdentifier: '.widget',
  // containerBackground / 최신 WidgetKit API 사용을 위해 iOS 17 이상 대상
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.yeolgong.timer'],
  },
};
