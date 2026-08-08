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
const HELP = path.join(__dirname, '..', 'help.html');
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

// ── 1-A절 앵커 표를 help.html에서 다시 만든다 ──────────────────────────
// 코워크가 60개 항목 전체에서 고를 수 있어야 하는데, 손으로 옮겨 적으면 도움말이
// 늘어날 때마다 조용히 낡는다(표에 없는 항목은 코워크가 아예 못 쓴다).
const CAT_LABEL = {
  start: '시작', timer: '타이머', focus: '집중', record: '기록', plan: '계획',
  subject: '과목', stats: '통계', room: '스터디룸', widget: '위젯·알림', data: '데이터',
};

function buildAnchorTable(helpHtml) {
  const re = /<details[^>]*id="([a-z0-9-]+)"[^>]*data-cat="([a-z]+)"[^>]*>\s*<summary>([\s\S]*?)<\/summary>/g;
  const rows = [];
  let m;
  while ((m = re.exec(helpHtml))) {
    const [, id, cat, rawTitle] = m;
    let mark = '';
    if (/class="tag ios"/.test(rawTitle)) mark = ' ※iOS';
    else if (/class="tag aos"/.test(rawTitle)) mark = ' ※안드';
    // 플랫폼 배지는 ※표시로 옮겼으므로 제목에서 통째로 뺀다(안 그러면 "…앱 막기 iOS"가 된다)
    const title = rawTitle
      .replace(/<span class="tag[^"]*">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    rows.push(`| ${CAT_LABEL[cat] || cat} | \`#${id}\`${mark} | ${title} |`);
  }
  return { table: ['| 분류 | 앵커 | 항목 제목 |', '|------|------|-----------|', ...rows].join('\n'), count: rows.length };
}

// toISOString()은 UTC라 KST 새벽 0~9시에 하루 밀린다 (CLAUDE.md 규칙 7과 같은 부류)
function localDateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function refreshGuide(text, helpHtml) {
  const { table, count } = buildAnchorTable(helpHtml);
  if (!count) throw new Error('help.html에서 항목을 하나도 못 읽었다 — 선택자를 확인할 것');
  // 원본이 CRLF로 저장돼 있어 줄바꿈은 \r?\n 으로 받는다
  const begin = /(<!-- HELP-ANCHORS:BEGIN[^>]*-->\r?\n)[\s\S]*?(\r?\n<!-- HELP-ANCHORS:END -->)/;
  if (!begin.test(text)) throw new Error('HELP-ANCHORS 표식이 blog-guide.md에 없다');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text
    .replace(begin, (_, a, b) => a + table.split('\n').join(eol) + b)
    .replace(/기능별 사용법 \d+개 항목/, `기능별 사용법 ${count}개 항목`)
    .replace(/### 앵커 목록 \(\d+개 전체 — [^)]*\)/,
      `### 앵커 목록 (${count}개 전체 — ${localDateStr()} 기준)`);
}

let src = fs.readFileSync(SRC, 'utf8');
if (fs.existsSync(HELP)) {
  const refreshed = refreshGuide(src, fs.readFileSync(HELP, 'utf8'));
  if (norm(refreshed) !== norm(src)) {
    fs.writeFileSync(SRC, refreshed, 'utf8');
    src = refreshed;
    console.log('앵커 표를 help.html 기준으로 다시 만들었다 (docs/blog-guide.md).');
  }
}
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
  // 차이가 있으면 무조건 1 — SessionStart 훅(--check)이 종료 코드로 판단한다
  console.log('\n덮어쓰려면: npm run sync:blog-guide -- --write');
  process.exit(1);
}

if (onlyInDest.length && !force) {
  console.error('\n중단했다 — 사본에만 있는 줄이 있다. 원본에 반영한 뒤 다시 실행할 것.');
  console.error('(버려도 되는 내용이라면 --force)');
  process.exit(1);
}

fs.writeFileSync(DEST, src, 'utf8');
console.log('\n사본을 덮어썼다: ' + DEST);
