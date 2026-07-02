/** @type {import('@bacons/apple-targets/app.plugin').Config} */
// iOS 홈 화면 위젯(WidgetKit) 익스텐션 타겟 설정.
// App Group은 app.config.js 의 APP_GROUP('group.com.yeolgong.timer')과 반드시 일치해야 함.
module.exports = {
  type: 'widget',
  name: '열공메이트 위젯',
  // containerBackground / 최신 WidgetKit API 사용을 위해 iOS 17 이상 대상
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.yeolgong.timer'],
  },
};
