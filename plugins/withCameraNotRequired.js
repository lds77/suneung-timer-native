// 카메라를 '있으면 쓰는' 선택 기능으로 선언 (Play 배포 대상 기기 축소 방지).
//
// 문제: 오답노트 사진 첨부(expo-image-picker)가 android.permission.CAMERA를 선언하는데,
// 안드로이드는 이 권한을 보고 android.hardware.camera(+autofocus)를 **필수 하드웨어로 암시**한다.
// 그 결과 Play가 카메라·오토포커스 없는 기기를 배포 대상에서 제외한다 —
// 1.0.38(vc66) 검토에서 기기 402대(전화 68, 태블릿 263 등) 지원 중단 경고로 드러남.
// 카메라 없는 저가 태블릿이 다수라 태블릿이 -4%였다.
//
// 해결: uses-feature를 required="false"로 명시. 촬영은 없으면 앨범 선택으로 대체 가능한
// 부가 기능이므로 앱 동작에 문제 없다(expo-image-picker가 권한/기능 유무를 런타임에 확인).
// android/는 prebuild 생성물이라 여기(config 플러그인)에 둬야 로컬/EAS 모두에 적용된다.
const { withAndroidManifest } = require('expo/config-plugins');

// autofocus도 함께 — CAMERA 권한은 오토포커스까지 암시한다
const OPTIONAL_FEATURES = ['android.hardware.camera', 'android.hardware.camera.autofocus'];

module.exports = function withCameraNotRequired(config) {
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
