// src/utils/attachments.js
// 오답노트 사진 첨부 파일 관리. 사진은 앱 전용 폴더(documentDirectory/reviewNotes)에만 저장되고
// 노트에는 파일명(상대경로)만 담는다 — iOS는 재설치/업데이트 때 documentDirectory 절대경로가
// 바뀌므로 절대 URI를 저장하면 링크가 깨진다. 읽을 때 resolveUri로 합친다.
//
// 순수 헬퍼(formatBytes/collectReferencedFiles/orphanFiles/canAddMore)는 top-level에 두어 테스트 대상.
// expo-file-system·expo-image-manipulator는 네이티브라 함수 안에서 lazy require (Jest 안전).

export const MAX_ATTACH = 5;              // 노트당 사진 최대 장수
export const ATTACH_SUBDIR = 'reviewNotes/';
const MAX_DIM = 1600;                     // 리사이즈 상한(px) — 저장공간 절약
const JPEG_QUALITY = 0.6;

// ── 순수 헬퍼 (테스트 대상) ──

export const formatBytes = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
};

// 노트 배열이 참조하는 모든 첨부 파일명 Set
export const collectReferencedFiles = (notes) => {
  const set = new Set();
  (Array.isArray(notes) ? notes : []).forEach((n) => {
    (n && Array.isArray(n.attachments) ? n.attachments : []).forEach((a) => {
      if (a && typeof a.file === 'string' && a.file) set.add(a.file);
    });
  });
  return set;
};

// 폴더에 있으나 어떤 노트도 참조하지 않는 고아 파일명 배열
export const orphanFiles = (allFiles, notes) => {
  const ref = collectReferencedFiles(notes);
  return (Array.isArray(allFiles) ? allFiles : []).filter((f) => !ref.has(f));
};

// 첨부 추가 가능 여부 (상한 가드)
export const canAddMore = (attachments, adding = 1) =>
  (Array.isArray(attachments) ? attachments.length : 0) + adding <= MAX_ATTACH;

// ── 네이티브 파일 연산 (lazy require) ──

// SDK 56: 함수형 API(documentDirectory/getInfoAsync/moveAsync 등)는 /legacy에 있음
const FS = () => require('expo-file-system/legacy');
const IM = () => require('expo-image-manipulator');

export const attachDir = () => FS().documentDirectory + ATTACH_SUBDIR;

export const resolveUri = (file) => (file ? attachDir() + file : null);

const ensureDir = async () => {
  const fs = FS();
  const dir = attachDir();
  const info = await fs.getInfoAsync(dir);
  if (!info.exists) await fs.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
};

const genName = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

// 촬영/선택한 이미지를 리사이즈·압축해 앱 폴더에 저장. 성공 시 파일명(상대경로) 반환, 실패 시 null.
export const saveImage = async (uri) => {
  try {
    await ensureDir();
    const manipulated = await IM().manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIM } }],   // 가로 기준 축소 (세로 사진은 aspect 유지). 이미 작으면 확대 안 함은 아니나 무해
      { compress: JPEG_QUALITY, format: IM().SaveFormat.JPEG },
    );
    const name = genName();
    await FS().moveAsync({ from: manipulated.uri, to: attachDir() + name });
    return name;
  } catch {
    return null;
  }
};

// 파일명 배열에 해당하는 실제 파일 삭제 (없어도 조용히 무시)
export const deleteFiles = async (files) => {
  const fs = FS();
  const dir = attachDir();
  await Promise.all(
    (Array.isArray(files) ? files : []).filter(Boolean).map((f) =>
      fs.deleteAsync(dir + f, { idempotent: true }).catch(() => {})),
  );
};

// 폴더 내 전체 파일명 목록 (폴더 없으면 [])
export const listAllFiles = async () => {
  try {
    const fs = FS();
    const dir = attachDir();
    const info = await fs.getInfoAsync(dir);
    if (!info.exists) return [];
    return await fs.readDirectoryAsync(dir);
  } catch {
    return [];
  }
};

// 노트가 참조하는 사진의 개수·총 용량 (설정 화면 표시용)
export const usageStats = async (notes) => {
  const fs = FS();
  const dir = attachDir();
  const files = Array.from(collectReferencedFiles(notes));
  let bytes = 0;
  await Promise.all(files.map(async (f) => {
    try {
      const info = await fs.getInfoAsync(dir + f);
      if (info.exists && info.size) bytes += info.size;
    } catch {}
  }));
  return { count: files.length, bytes };
};

// 삭제된 노트가 남긴 고아 파일 정리. { removed, bytes } 반환.
export const cleanupOrphans = async (notes) => {
  const fs = FS();
  const dir = attachDir();
  const all = await listAllFiles();
  const orphans = orphanFiles(all, notes);
  let bytes = 0;
  await Promise.all(orphans.map(async (f) => {
    try {
      const info = await fs.getInfoAsync(dir + f);
      if (info.exists && info.size) bytes += info.size;
    } catch {}
  }));
  await deleteFiles(orphans);
  return { removed: orphans.length, bytes };
};
