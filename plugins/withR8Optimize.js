const { withAppBuildGradle } = require('expo/config-plugins');

// SDK 56의 기본 proguard-android.txt에는 -dontoptimize가 있다.
// 실제 proguardFiles 선언만 바꾼다. 템플릿이 달라지면 prebuild에서 바로 알린다.
function useOptimizedProguard(gradle) {
  const declaration = /^(\s*proguardFiles\s+getDefaultProguardFile\(\s*)(["'])proguard-android(?:-optimize)?\.txt\2(\s*\))/gm;
  if (!declaration.test(gradle)) {
    throw new Error('withR8Optimize: android/app/build.gradle의 proguardFiles 선언을 확인하세요. Expo 템플릿에서 기본 ProGuard 파일을 찾지 못했습니다.');
  }
  return gradle.replace(declaration, '$1$2proguard-android-optimize.txt$2$3');
}

module.exports = function withR8Optimize(config) {
  return withAppBuildGradle(config, cfg => {
    cfg.modResults.contents = useOptimizedProguard(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.useOptimizedProguard = useOptimizedProguard;
