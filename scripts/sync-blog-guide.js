#!/usr/bin/env node
// 블로그 지침서 동기화 — 저장소 원본 → 코워크 폴더 사본
//
// 왜 있나: 지침서가 두 곳에 있고 세션도 둘(앱 작업/블로그 작성)이라 조용히 갈라진다.
// 2026-08-04·08-05 이틀 연속으로 갈라져 있었고, 그때마다 사본에만 있는 내용이 있어
// 그냥 덮어쓰면 잃을 뻔했다. 그래서 이 스크립트는 **다르면 먼저 멈춘다**.
//
// 소유권(2026-08-05 정리):
//   CLAUDE.md   ← 앱 저장소가 주인. 코워크는 읽기만  → 이 스크립트가 덮어쓴다
//   발행대장.md ← 코워크가 주인. 앱 세션은 읽기만    → 저장소로 스냅샷만 복사(백업)
//
// 사용법:
//   node scripts/sync-blog-guide.js            원본 → 사본 (다르면 내용 보여주고 확인 요구)
//   node scripts/sync-blog-guide.js --check    비교만 (갈라졌으면 exit 1) — 세션 시작 훅용
//   node scripts/sync-blog-guide.js --force    묻지 않고 덮어쓴다

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_GUIDE = path.join(__dirname, '..', 'docs', 'blog-guide.md');
const COWORK_DIR = path.join(
  os.homedir(), 'OneDrive', '문서', '카카오톡 받은 파일', '구글열공'
);
const COPY_GUIDE = path.join(COWORK_DIR, 'CLAUDE.md');
const COWORK_LOG = path.join(COWORK_DIR, '발행대장.md');
const LOG_SNAPSHOT = path.join(__dirname, '..', 'docs', 'blog-log-snapshot.md');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const force = args.includes('--force');

// 줄바꿈(CRLF/LF)만 다른 것은 갈라진 게 아니다 — Windows 편집기가 자동으로 바꾼다
const norm = (s) => s.replace(/\r\n/g, '\n').trimEnd();

function readOrNull(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

/** 사본에만 있는 줄 — 코워크가 지침서에 직접 적었다는 뜻이라 잃으면 안 된다 */
function linesOnlyInCopy(repo, copy) {
  const repoLines = new Set(norm(repo).split('\n').map(l => l.trim()));
  return norm(copy).split('\n')
    .map(l => l.trim())
    .filter(l => l && !repoLines.has(l));
}

const repo = readOrNull(REPO_GUIDE);
if (repo === null) {
  console.error(`[blog-guide] 원본이 없다: ${REPO_GUIDE}`);
  process.exit(2);
}

const copy = readOrNull(COPY_GUIDE);

// 코워크 폴더 자체가 없으면(다른 PC 등) 조용히 넘어간다 — 훅에서 매번 시끄러우면 안 된다
if (copy === null) {
  if (!fs.existsSync(COWORK_DIR)) {
    if (!checkOnly) console.log('[blog-guide] 코워크 폴더가 없어 건너뜀');
    process.exit(0);
  }
}

const same = copy !== null && norm(repo) === norm(copy);

if (same) {
  if (!checkOnly) console.log('[blog-guide] 이미 같음 — 할 일 없음');
  syncLogSnapshot(true);
  process.exit(0);
}

// ── 여기부터는 갈라진 상태 ──
const uniqueInCopy = copy === null ? [] : linesOnlyInCopy(repo, copy);

console.log('');
console.log('[blog-guide] ★사본이 원본과 다르다★');
console.log(`  원본: ${REPO_GUIDE}`);
console.log(`  사본: ${COPY_GUIDE}`);

if (uniqueInCopy.length) {
  console.log('');
  console.log(`  ⚠ 사본에만 있는 줄 ${uniqueInCopy.length}개 — 덮어쓰면 사라진다:`);
  uniqueInCopy.slice(0, 20).forEach(l => console.log(`    | ${l.slice(0, 110)}`));
  if (uniqueInCopy.length > 20) console.log(`    | … 외 ${uniqueInCopy.length - 20}줄`);
  console.log('');
  console.log('  → 먼저 원본(docs/blog-guide.md)에 반영한 뒤 다시 실행할 것.');
  console.log('  → 코워크가 남긴 발행 기록이라면 발행대장.md로 옮겨야 한다(지침서에 적으면 안 된다).');
} else {
  console.log('  (사본에만 있는 줄은 없다 — 원본이 앞서 있을 뿐이니 그대로 덮어쓰면 된다)');
}

if (checkOnly) {
  console.log('');
  console.log('  덮어쓰려면: npm run sync:blog-guide');
  process.exit(1);
}

if (uniqueInCopy.length && !force) {
  console.log('');
  console.log('  중단했다. 확인 후 --force 로 다시 실행하면 덮어쓴다.');
  process.exit(1);
}

fs.writeFileSync(COPY_GUIDE, repo);
console.log('');
console.log('[blog-guide] 사본을 원본으로 덮어썼다.');
syncLogSnapshot(false);

/** 코워크가 쓰는 발행대장을 저장소에 백업(읽기 전용 스냅샷) — 이력이 git에 남는다 */
function syncLogSnapshot(quiet) {
  const log = readOrNull(COWORK_LOG);
  if (log === null) return;
  const prev = readOrNull(LOG_SNAPSHOT);
  const header = '<!-- 코워크 폴더 발행대장.md의 스냅샷(백업). 원본은 그쪽이고 여기서 고치지 말 것. -->\n\n';
  const next = header + log;
  if (prev !== null && norm(prev) === norm(next)) return;
  fs.writeFileSync(LOG_SNAPSHOT, next);
  if (!quiet) console.log('[blog-guide] 발행대장 스냅샷 갱신 → docs/blog-log-snapshot.md');
}
