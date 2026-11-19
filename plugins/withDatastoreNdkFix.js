// androidx.datastore를 1.3.0으로 올린다 (2026-11-19, Play 콘솔 경고 「16KB 기기에서 앱이 비정상 종료될 수 있음 —
// 16KB용으로 컴파일됐지만 일부 라이브러리가 이전 Android NDK로 컴파일됨」).
//
// expo-notifications → firebase-messaging 25.0.1 → firebase-common이 datastore 1.1.7을 끌어온다.
// 그 안의 libdatastore_shared_counter.so만 NDK r25c로 지어졌다(16KB 정렬은 통과 — NDK가 옛것이라 경고).
// 앱의 나머지 .so 20개는 전부 r27이다(vc78 AAB를 llvm-readelf로 확인).
//
// AAR을 열어 본 shared counter의 NDK 표식: 1.1.7 = r25c / 1.2.1 = r20 / 1.3.0 = r27.
// → 1.2.x로는 안 고쳐진다. 1.3.0이어야 한다.
//
// ★ 그룹 전체를 함께 올린다. 1.3.0의 모듈끼리는 서로를 [1.3.0]으로 엄격히 묶어서 일부만 올리면
//   의존성 해석이 실패한다.
// ★ 1.3.0보다 낮게 요청된 것만 올린다. 나중에 Firebase·Expo가 더 새 버전을 직접 끌어오면 그대로 둔다 —
//   그때는 이 플러그인을 지워도 된다. 확인: AAB의 base/root/META-INF/androidx.datastore_datastore-core.version
//   그리고 llvm-readelf -n으로 base/lib/arm64-v8a/libdatastore_shared_counter.so의 NDK 표식.
//
// android/는 prebuild 생성물이라 여기(config 플러그인)에 둬야 로컬·EAS 모두에 적용된다
// (withAndroidWorkManagerFix와 같은 방식).
const { withProjectBuildGradle } = require('expo/config-plugins');

const FIX_MARKER = '// withDatastoreNdkFix';
const FIX_BLOCK = `
${FIX_MARKER} (plugins/withDatastoreNdkFix.js): androidx.datastore 1.3.0 — shared counter .so를 NDK r27판으로
allprojects {
  configurations.all {
    resolutionStrategy.eachDependency { details ->
      def v = details.requested.version
      if (details.requested.group == 'androidx.datastore' && v != null && v ==~ /1\\.[0-2]\\..*/) {
        details.useVersion '1.3.0'
        details.because 'libdatastore_shared_counter.so: 1.1.x r25c, 1.2.x r20, 1.3.0 r27 (Play 16KB warning)'
      }
    }
  }
}
`;

module.exports = function withDatastoreNdkFix(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(FIX_MARKER)) {
      cfg.modResults.contents += FIX_BLOCK;
    }
    return cfg;
  });
};
// 이미 prebuild된 android/에 손으로 붙여 의존성 해석만 확인할 때 쓴다.
module.exports.FIX_MARKER = FIX_MARKER;
module.exports.FIX_BLOCK = FIX_BLOCK;
