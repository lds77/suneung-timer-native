#!/usr/bin/env node
/**
 * 블로그 지침서 동기화 — 원본(docs/blog-guide.md) → 코워크 사본(구글열공/CLAUDE.md)
 *
 * 두 벌이 갈라지면 틀린 글이 나간다(08-04·08-05 이틀 연속으로 갈라진 전례).
 * 원본이 주인이므로 항상 원본 → 사본 방향으로만 덮어쓴다.
 *
 *   npm run sync:blog-guide            차이만 보여준다(쓰지 않음)
 *   npm run sync:blog-guide -- --write 사본을 덮어쓴다
 *
 * ★사본에만 있는 줄이 있으면 --write를 거부한다★ — 코워크가 사본에 적어둔 것을
 * 원본에 먼저 반영하지 않으면 그대로 사라지기 때문이다. 확인 후에도 버릴 것이면 --force.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SRC = path.join(__dirname, '..', 'docs', 'blog-guide.md');
const DEST = path.join(
  os.homedir(),
  'OneDrive', '문서', '카카오톡 받은 파일', '구글열공', 'CLAUDE.md'
);

const args = process.argv.slice(2);
const write = args.includes('--write');
const force = args.includes('--force');

const norm = (s) => s.replace(/\r\n/g, '\n');
const lines = (s) => norm(s).split('\n');

if (!fs.existsSync(SRC)) {
  console.error('원본이 없다: ' + SRC);
  process.exit(2);
}
if (!fs.existsSync(DEST)) {
  console.error('사본 경로가 없다: ' + DEST);
  console.error('(OneDrive 폴더가 이 PC에 동기화돼 있는지 확인할 것)');
  process.exit(2);
}

const src = fs.readFileSync(SRC, 'utf8');
const dest = fs.readFileSync(DEST, 'utf8');

if (norm(src) === norm(dest)) {
  console.log('동일하다 — 할 일 없음.');
  process.exit(0);
}

// 줄 단위 집합 비교(순서는 무시) — 어느 쪽에만 있는 내용인지만 알면 된다
const meaningful = (l) => l.trim() !== '' && l.trim() !== '---';
const srcSet = new Set(lines(src).filter(meaningful));
const destSet = new Set(lines(dest).filter(meaningful));
const onlyInDest = [...destSet].filter((l) => !srcSet.has(l));
const onlyInSrc = [...srcSet].filter((l) => !destSet.has(l));

console.log('원본에만 있는 줄: ' + onlyInSrc.length + ' / 사본에만 있는 줄: ' + onlyInDest.length);

if (onlyInDest.length) {
  console.log('\n★사본에만 있는 줄 (덮어쓰면 사라진다 — 원본에 먼저 반영할 것)');
  onlyInDest.slice(0, 40).forEach((l) => console.log('  | ' + l));
  if (onlyInDest.length > 40) console.log('  … 외 ' + (onlyInDest.length - 40) + '줄');
}

if (!write) {
  console.log('\n덮어쓰려면: npm run sync:blog-guide -- --write');
  process.exit(onlyInDest.length ? 1 : 0);
}

if (onlyInDest.length && !force) {
  console.error('\n중단했다 — 사본에만 있는 줄이 있다. 원본에 반영한 뒤 다시 실행할 것.');
  console.error('(버려도 되는 내용이라면 --force)');
  process.exit(1);
}

fs.writeFileSync(DEST, src, 'utf8');
console.log('\n사본을 덮어썼다: ' + DEST);
