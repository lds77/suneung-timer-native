/*
 * postinstall 패치: RN gradle 플러그인이 하드코딩한 `--reset-cache` 플래그를 제거한다.
 *
 * 이 플래그가 붙으면 release 빌드의 JS 번들 단계에서 Metro가 "Starting Metro Bundler"
 * 직후 네이티브 크래시(exit 0xC0000409)로 죽어 로컬 APK 빌드가 불가능하다.
 * (이 환경: Windows + 한글 사용자명. CI/macOS에는 영향 없음.)
 *
 * node_modules는 npm install 때마다 초기화되므로, install 후 자동으로 다시 적용되도록
 * package.json의 "postinstall"에서 이 스크립트를 호출한다. 멱등(idempotent)하게 작성됨.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native',
  'gradle-plugin',
  'react-native-gradle-plugin',
  'src',
  'main',
  'kotlin',
  'com',
  'facebook',
  'react',
  'tasks',
  'BundleHermesCTask.kt'
);

try {
  if (!fs.existsSync(target)) {
    console.log('[fix-reset-cache] 대상 파일 없음, 건너뜀:', target);
  } else {
    let src = fs.readFileSync(target, 'utf8');
    if (src.includes('// add("--reset-cache")')) {
      console.log('[fix-reset-cache] 이미 패치됨');
    } else if (src.includes('add("--reset-cache")')) {
      src = src.replace(
        'add("--reset-cache")',
        '// add("--reset-cache") // removed: crashes Metro on this Windows setup (exit 0xC0000409)'
      );
      fs.writeFileSync(target, src);
      console.log('[fix-reset-cache] BundleHermesCTask.kt 패치 완료 (--reset-cache 제거)');
    } else {
      console.log('[fix-reset-cache] --reset-cache 라인을 못 찾음 (RN 버전 변경?), 건너뜀');
    }
  }
} catch (e) {
  // 빌드/설치를 막지 않도록 실패해도 통과
  console.log('[fix-reset-cache] 오류(무시):', e.message);
}

/*
 * 패치 2: RN gradle-plugin이 동봉한 foojay-resolver-convention 0.5.0은 Gradle 9와 비호환
 * (FoojayToolchainsPlugin 클래스가 Gradle 9.0에서 제거됨 → settings.gradle.kts 컴파일 실패,
 *  "Unresolved reference 'plugins'"). 0.8.0+로 올리면 해결.
 * https://github.com/facebook/react-native/issues/56287 (RN 0.83~0.85에서 0.5.0 동봉)
 */
const foojayTarget = path.join(
  __dirname, '..', 'node_modules', '@react-native', 'gradle-plugin', 'settings.gradle.kts'
);

try {
  if (!fs.existsSync(foojayTarget)) {
    console.log('[fix-foojay] 대상 파일 없음, 건너뜀:', foojayTarget);
  } else {
    let src = fs.readFileSync(foojayTarget, 'utf8');
    const oldRef = '"org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")';
    const newRef = '"org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")';
    if (src.includes(newRef)) {
      console.log('[fix-foojay] 이미 패치됨');
    } else if (src.includes(oldRef)) {
      fs.writeFileSync(foojayTarget, src.replace(oldRef, newRef));
      console.log('[fix-foojay] settings.gradle.kts 패치 완료 (foojay 0.5.0 → 1.0.0)');
    } else {
      console.log('[fix-foojay] foojay 0.5.0 라인을 못 찾음 (RN에서 수정됐을 수 있음), 건너뜀');
    }
  }
} catch (e) {
  console.log('[fix-foojay] 오류(무시):', e.message);
}
