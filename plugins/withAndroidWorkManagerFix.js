// androidx.work 중복 클래스 수정 (SDK 56/RN 0.85에서 발생 — checkReleaseDuplicateClasses 실패):
// react-native-android-widget이 work-runtime 2.8.1을 쓰는데 다른 의존성이 work-runtime-ktx 2.7.1을
// 전이로 끌어온다. WorkManager 2.8부터 ktx 클래스가 본체에 병합돼 두 아티팩트의 클래스가 중복됨.
// → ktx를 2.8.1로 강제해 정렬 (2.8.1 ktx는 본체 위임 껍데기라 안전).
// android/는 prebuild 생성물이라 여기(config 플러그인)에 둬야 로컬/EAS 모두에 적용된다.
const { withProjectBuildGradle } = require('expo/config-plugins');

const FIX_MARKER = '// withAndroidWorkManagerFix';
const FIX_BLOCK = `
${FIX_MARKER} (plugins/withAndroidWorkManagerFix.js): androidx.work 중복 클래스 정렬
allprojects {
  configurations.all {
    resolutionStrategy {
      force 'androidx.work:work-runtime-ktx:2.8.1'
    }
  }
}
`;

module.exports = function withAndroidWorkManagerFix(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(FIX_MARKER)) {
      cfg.modResults.contents += FIX_BLOCK;
    }
    return cfg;
  });
};
