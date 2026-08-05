// src/utils/backupArchive.js
// 사진까지 담는 백업 아카이브(zip) 만들기/풀기.
//
// 왜 필요한가: 오답노트 첨부는 앱 폴더에만 있고 **어떤 백업 경로로도 안전하게 옮겨지지 않았다**.
//   · 기존 JSON 백업(storage.js BACKUP_KEYS)은 노트 기록만 담고 이미지 파일은 안 담는다
//   · 안드 클라우드 자동 백업은 25MB 상한이라 첨부가 쌓이면 백업이 통째로 실패했고,
//     그래서 첨부 폴더를 백업에서 제외했다(plugins/withAttachmentsNotBackedUp)
//   · 남은 경로는 '같은 OS끼리 기기 간 직접 전송'뿐 — 안드↔아이폰 기종 변경은 방법이 없었다
// → 백업 파일 하나(zip) 안에 JSON + 사진을 함께 담아 기존 흐름(내보내기 → 저장 → 새 폰에서
//   파일 선택)을 그대로 쓰면서 기종 변경까지 해결한다.
//
// ★핵심 전제: 노트는 첨부의 **파일명만** 저장한다(attachments.js).
//   그래서 같은 이름으로 새 폰의 앱 폴더에 되돌려 놓기만 하면 링크가 그대로 살아난다.
//   경로를 저장했다면 이 방식이 성립하지 않는다 — 그 설계를 바꾸지 말 것.
//
// 압축은 react-native-zip-archive(New Arch TurboModule)가 **파일 경로로 직접** 처리한다.
// 순수 JS zip(jszip/fflate)은 파일을 base64로 메모리에 올려야 해서, 정작 사진이 많은
// 사용자(= 이 기능이 가장 필요한 사람)에게서 메모리가 터진다.

import { ATTACH_SUBDIR, collectReferencedFiles } from './attachments';

export const ARCHIVE_DIR = 'attachments/';   // zip 내부의 사진 폴더
export const ARCHIVE_JSON = 'backup.json';   // zip 내부의 기록 파일

// ── 순수 헬퍼 (테스트 대상) ──

// zip 파일인지 매직바이트로 판별. 확장자로 판단하면 카톡·드라이브를 거치며 이름이 바뀐
// 파일에서 틀린다. zip은 항상 'PK\x03\x04'로 시작하고 그 base64는 'UEsDB'로 시작한다.
export const looksLikeZip = (base64Head) =>
  typeof base64Head === 'string' && base64Head.startsWith('UEsDB');

// 백업 파일명 — 사진 포함 여부에 따라 확장자가 다르다(복원 쪽은 매직바이트로 판별하므로
// 이름은 사용자가 알아보기 위한 것)
export const backupFileName = (dateStr, withPhotos) => {
  const d = String(dateStr || '').replace(/-/g, '');
  return withPhotos ? `yeolgong_backup_${d}.zip` : `yeolgong_backup_${d}.json`;
};

// 아카이브에 담을 첨부 파일명 목록 — 노트가 실제로 참조하는 것만.
// 고아 파일(삭제된 노트가 남긴 것)까지 담으면 백업만 쓸데없이 커진다.
export const filesToArchive = (notes) => Array.from(collectReferencedFiles(notes));

// 복원 시 실제로 되돌릴 파일 목록 — 아카이브에 들어 있으면서 복원할 노트가 참조하는 것만.
// 남의 백업이나 손상된 아카이브에서 엉뚱한 파일이 앱 폴더로 들어오는 것을 막는다.
export const filesToRestore = (archiveFiles, notes) => {
  const ref = collectReferencedFiles(notes);
  return (Array.isArray(archiveFiles) ? archiveFiles : []).filter((f) => ref.has(f));
};

// ── 네이티브 (lazy require — Jest 안전) ──

const FS = () => require('expo-file-system/legacy');
const Zip = () => require('react-native-zip-archive');

// react-native-zip-archive는 URI가 아니라 경로를 받는다
const toPath = (uri) => String(uri || '').replace(/^file:\/\//, '');

const rmrf = async (dir) => {
  try { await FS().deleteAsync(dir, { idempotent: true }); } catch {}
};

// 사진까지 담은 zip을 만들어 그 URI를 반환한다.
// data: exportBackupData() 결과, notes: 첨부 참조를 훑을 노트 배열
export const buildArchive = async (data, notes, fileName) => {
  const fs = FS();
  const stage = `${fs.cacheDirectory}backup_stage/`;
  const outUri = `${fs.cacheDirectory}${fileName}`;
  await rmrf(stage);
  await rmrf(outUri);
  // 지난 백업 아카이브 정리 — 사진을 담으면 수십~수백 MB라 캐시에 쌓이면 부담이다
  // (파일명에 날짜가 들어가 날짜가 바뀌면 이름이 달라진다)
  try {
    for (const f of await fs.readDirectoryAsync(fs.cacheDirectory)) {
      if (/^yeolgong_backup_.*\.zip$/.test(f)) await rmrf(fs.cacheDirectory + f);
    }
  } catch {}
  await fs.makeDirectoryAsync(stage + ARCHIVE_DIR, { intermediates: true });

  await fs.writeAsStringAsync(stage + ARCHIVE_JSON, JSON.stringify(data, null, 2), {
    encoding: fs.EncodingType.UTF8,
  });

  const srcDir = fs.documentDirectory + ATTACH_SUBDIR;
  let copied = 0;
  for (const f of filesToArchive(notes)) {
    // 파일이 사라졌어도 백업 전체를 실패시키지 않는다
    try {
      await fs.copyAsync({ from: srcDir + f, to: stage + ARCHIVE_DIR + f });
      copied += 1;
    } catch {}
  }

  await Zip().zip(toPath(stage), toPath(outUri));
  await rmrf(stage);
  return { uri: outUri, photoCount: copied };
};

// 압축을 푼 자리에서 backup.json이 있는 폴더를 찾는다.
// ★zip 구현이 '폴더 이름'을 엔트리 경로에 포함하는지는 플랫폼/버전마다 다를 수 있다★ —
// 루트에 없으면 한 겹 안쪽까지 본다. 여기에 의존하지 않는 게 목적
const findRoot = async (stage) => {
  const fs = FS();
  const hasJson = async (dir) => {
    try { return (await fs.getInfoAsync(dir + ARCHIVE_JSON)).exists; } catch { return false; }
  };
  if (await hasJson(stage)) return stage;
  try {
    for (const entry of await fs.readDirectoryAsync(stage)) {
      const sub = `${stage}${entry}/`;
      if (await hasJson(sub)) return sub;
    }
  } catch {}
  return stage;   // 못 찾으면 원래 자리 — 아래 읽기에서 에러로 드러난다
};

// zip 백업을 풀어 내용을 돌려준다. 실제 복원(스토리지 쓰기)은 호출부 몫.
// stage는 호출부가 finishRestore로 정리한다 — 파일 복사가 끝나기 전에 지우면 안 되므로.
export const openArchive = async (uri) => {
  const fs = FS();
  const stage = `${fs.cacheDirectory}restore_stage/`;
  await rmrf(stage);
  await fs.makeDirectoryAsync(stage, { intermediates: true });
  await Zip().unzip(toPath(uri), toPath(stage));

  const root = await findRoot(stage);
  const raw = await fs.readAsStringAsync(root + ARCHIVE_JSON, { encoding: fs.EncodingType.UTF8 });
  const data = JSON.parse(raw);

  let archiveFiles = [];
  try { archiveFiles = await fs.readDirectoryAsync(root + ARCHIVE_DIR); } catch {}
  return { data, archiveFiles, root, stage };
};

// 아카이브에서 꺼낸 사진을 앱 폴더로 옮긴다. 이름이 같으면 덮어쓴다
// (파일명이 시각+난수라 충돌은 사실상 없고, 같은 백업을 두 번 복원해도 결과가 같아야 한다)
export const restoreFiles = async (root, files) => {
  const fs = FS();
  const destDir = fs.documentDirectory + ATTACH_SUBDIR;
  try { await fs.makeDirectoryAsync(destDir, { intermediates: true }); } catch {}
  let restored = 0;
  for (const f of files) {
    try {
      await fs.deleteAsync(destDir + f, { idempotent: true });
      await fs.copyAsync({ from: root + ARCHIVE_DIR + f, to: destDir + f });
      restored += 1;
    } catch {}
  }
  return restored;
};

export const finishRestore = async (stage) => { await rmrf(stage); };

// 파일 앞부분만 base64로 읽어 zip 여부 판별 (전체를 읽지 않는다 — 100MB 백업도 안전)
export const isZipFile = async (uri) => {
  try {
    const fs = FS();
    const head = await fs.readAsStringAsync(uri, {
      encoding: fs.EncodingType.Base64,
      position: 0,
      length: 8,
    });
    return looksLikeZip(head);
  } catch {
    return false;
  }
};
