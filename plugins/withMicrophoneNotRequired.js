// 마이크를 '있으면 쓰는' 선택 기능으로 선언 (Play 배포 대상 기기 축소 방지).
//
// withCameraNotRequired와 완전히 같은 계열의 문제다 — 안드로이드는 RECORD_AUDIO 권한을 보고
// android.hardware.microphone을 **필수 하드웨어로 암시**한다. CAMERA 때는 이걸 모르고 올렸다가
// 1.0.38(vc66) 검토에서 기기 402대(전화 68, 태블릿 263 등)가 배포 대상에서 빠졌다.
// 마이크는 카메라보다 빠지는 기기가 적겠지만, 같은 함정을 두 번 밟을 이유가 없다.
//
// 음성 메모는 없으면 안 쓰면 그만인 부가 기능이라(사진·텍스트로 대체 가능) required="false"가 맞다.
// 런타임에서 권한 요청이 거부되거나 마이크가 없으면 녹음 버튼만 동작하지 않는다.
//
// ★권한을 새로 추가했으면 Play 검토 화면의 '지원 기기 변경사항'을 반드시 확인할 것★ (규칙 12)
//
// android/는 prebuild 생성물이라 여기(config 플러그인)에 둬야 로컬/EAS 모두에 적용된다.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = ['android.hardware.microphone'];

module.exports = function withMicrophoneNotRequired(config) {
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
