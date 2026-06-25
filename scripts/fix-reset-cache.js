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
    process.exit(0);
  }
  let src = fs.readFileSync(target, 'utf8');
  if (src.includes('// add("--reset-cache")')) {
    console.log('[fix-reset-cache] 이미 패치됨');
    process.exit(0);
  }
  if (src.includes('add("--reset-cache")')) {
    src = src.replace(
      'add("--reset-cache")',
      '// add("--reset-cache") // removed: crashes Metro on this Windows setup (exit 0xC0000409)'
    );
    fs.writeFileSync(target, src);
    console.log('[fix-reset-cache] BundleHermesCTask.kt 패치 완료 (--reset-cache 제거)');
  } else {
    console.log('[fix-reset-cache] --reset-cache 라인을 못 찾음 (RN 버전 변경?), 건너뜀');
  }
} catch (e) {
  // 빌드/설치를 막지 않도록 실패해도 통과
  console.log('[fix-reset-cache] 오류(무시):', e.message);
}
