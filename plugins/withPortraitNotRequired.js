// 세로 화면을 '있으면 쓰는' 선택 기능으로 선언 (Play 배포 대상 기기 축소 방지, 2026-11-24).
//
// 열공메이트는 세로 고정 앱이다(app.config.js orientation: 'portrait' — 그대로 둔다). 안드로이드는 액티비티가
// 세로 고정이면 android.hardware.screen.portrait를 **필수 하드웨어로 암시**한다. 그러면 세로 화면이 없는
// 기기(일부 크롬북·TV·XR 등)가 배포 대상에서 빠진다.
//
// 1.0.44(vc79) 제출 때 Play 빠른 검사가 「필수 하드웨어 기능 선언으로 앱의 사용 가능 여부가 제한됨 —
// android.hardware.screen.portrait」로 제출을 막았다(그 전 판들도 같은 선언이었다). 사용자 결정으로 「이미 이
// 문제를 해결할 계획이 있음」을 사유로 무시하고 냈다 → **다음 안드 빌드에 이 플러그인이 실려야 한다.**
// 에버보드 plugins/withOptionalCamera.js가 같은 일을 한다(1.0.13).
//
// 선언만 선택으로 바꾸는 것이다 — 화면 방향 잠금(screenOrientation)은 그대로라 앱은 계속 세로로만 뜬다.
//
// ★빌드 뒤 확인: aapt dump badging에서 screen.portrait가 uses-feature-not-required인지,
//   업로드 때 Play 「지원 기기 변경사항」(빠지는 기기 0, 새로 지원 기기는 늘 수 있다) (규칙 12)
//
// android/는 prebuild 생성물이라 여기(config 플러그인)에 둬야 로컬/EAS 모두에 적용된다.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = ['android.hardware.screen.portrait'];

module.exports = function withPortraitNotRequired(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] || [];

    for (const name of OPTIONAL_FEATURES) {
      const existing = manifest['uses-feature'].find((f) => f.$?.['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        manifest['uses-feature'].push({
          $: { 'android:name': name, 'android:required': 'false' },
        });
      }
    }
    return cfg;
  });
};
