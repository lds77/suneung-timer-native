// src/utils/audioNotes.js
// 오답노트 음성 메모 — 녹음 옵션·상한·파일 저장.
// 사진과 같은 폴더(documentDirectory/reviewNotes)에 저장하고 노트의 attachments 배열을 공유한다.
// 사진 항목은 { file }, 음성 항목은 { file, type: 'audio', durationMs } — type이 없으면 사진.
// 덕분에 백업 zip 담기(backupArchive.collectReferencedFiles)와 고아 정리(attachments.cleanupOrphans)가
// 손대지 않아도 음성까지 함께 처리된다.

import { ATTACH_SUBDIR } from './attachments';

export const MAX_AUDIO = 2;                 // 노트당 음성 메모 개수
export const MAX_AUDIO_MS = 3 * 60 * 1000;  // 3분 — "왜 틀렸는지" 설명은 대개 30초~1분.
                                            // 상한은 예산이 아니라 폭주 방지용이다

// ★프리셋(RecordingPresets)을 쓰지 말 것★
// expo-audio의 LOW_QUALITY는 **안드에서 .3gp + AMR-NB**로 녹음하는데 iOS가 AMR 재생을
// 지원하지 않는다 → 갤럭시에서 만든 백업을 아이폰에서 복원하면 녹음이 안 들린다
// (백업 zip으로 기종 변경을 커버한 의미가 사라진다).
// 그래서 양 플랫폼 모두 m4a(AAC)로 직접 지정한다. 모노 64kbps = 분당 약 0.5MB로 음성엔 충분.
export const VOICE_RECORDING_OPTIONS = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: 'aac ',           // IOSOutputFormat.MPEG4AAC
    audioQuality: 64,               // AudioQuality.MEDIUM
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

// ── 순수 헬퍼 (테스트 대상) ──

export const isAudioAttachment = (a) => !!a && a.type === 'audio';
export const photoAttachments = (list) => (Array.isArray(list) ? list : []).filter((a) => a && !isAudioAttachment(a));
export const audioAttachments = (list) => (Array.isArray(list) ? list : []).filter(isAudioAttachment);

export const canAddAudio = (list) => audioAttachments(list).length < MAX_AUDIO;

// 사진을 몇 장 더 넣을 수 있는가. ★음성은 세지 않는다★ —
// 음성이 attachments 배열을 함께 쓰게 되면서, 전체 개수로 남은 자리를 계산하던 곳이
// **음성 2개면 사진 상한을 5장에서 3장으로 조용히 깎고 있었다**(추가 버튼은 그대로 보이는데
// 누르면 "최대 5장" 토스트만 떴다). photoAttachments 기준으로 세는 것이 유일한 정답.
export const photoSlotsLeft = (list, maxPhotos) =>
  Math.max(0, maxPhotos - photoAttachments(list).length);

// 첨부 항목을 저장 형태로 정규화한다.
// ★편집기는 노트를 열고 저장할 때 첨부를 다시 만든다 — 여기서 필드를 흘리면
//   음성이 사진으로 변해버린다(type·durationMs 유실 → 썸네일 자리에 빈 칸).
//   그래서 '아는 필드만 남기되, 음성의 필드는 반드시 지킨다'를 한 곳에서 정한다★
export const normalizeAttachment = (a) => (isAudioAttachment(a)
  ? { file: a.file, type: 'audio', durationMs: Math.max(0, Math.round(a.durationMs || 0)) }
  : { file: a.file });

export const normalizeAttachments = (list) =>
  (Array.isArray(list) ? list : []).filter(a => a && a.file).map(normalizeAttachment);

// 남은 녹음 시간(ms). 상한을 넘으면 0
export const remainingMs = (elapsedMs) => Math.max(0, MAX_AUDIO_MS - Math.max(0, elapsedMs || 0));

// 상한 도달 판정 — 녹음 화면이 이 값으로 자동 정지한다
export const reachedLimit = (elapsedMs) => (elapsedMs || 0) >= MAX_AUDIO_MS;

// mm:ss (녹음 경과·재생 위치 표시)
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// 너무 짧은 녹음은 실수로 누른 것에 가깝다 — 저장하지 않는다
export const MIN_AUDIO_MS = 1000;
export const isTooShort = (ms) => (ms || 0) < MIN_AUDIO_MS;

// ── 파일에서 오디오 첨부 ──
// 녹음과 같은 칸(MAX_AUDIO)을 나눠 쓴다 — 사용자에겐 '음성 N개'로 하나의 개념이어야 한다.

// 첨부 파일 용량 상한. 녹음은 3분(약 1.5MB)으로 묶여 있지만 남의 파일은 몇십 분짜리도 들어온다.
// 백업 zip에 그대로 담기므로(= 카톡·드라이브로 옮기는 파일) 여기서 막지 않으면 백업이 못 쓰게 커진다
export const MAX_CLIP_BYTES = 10 * 1024 * 1024;

// ★양 플랫폼에서 재생되는 포맷만 받는다★
// 안드는 ogg·flac·amr을 재생하지만 iOS는 못 한다. 백업 zip으로 기종을 바꾸면
// 안드에서 붙인 .ogg가 아이폰에서 재생 불가가 되므로 아예 첨부 단계에서 막는다
// (녹음을 m4a로 고정한 것과 같은 이유 — 위 VOICE_RECORDING_OPTIONS 주석 참고)
export const PLAYABLE_EXTS = ['m4a', 'mp3', 'aac', 'wav', 'mp4'];

export const audioExt = (name) => {
  const s = String(name || '');
  const i = s.lastIndexOf('.');
  return i < 0 ? '' : s.slice(i + 1).toLowerCase();
};

// 고른 파일을 받아도 되는지 판단. { ok } 또는 { ok:false, reason }
export const checkAudioPick = (asset) => {
  if (!asset || !asset.uri) return { ok: false, reason: '파일을 읽지 못했어요.' };
  const ext = audioExt(asset.name || asset.uri);
  if (!PLAYABLE_EXTS.includes(ext)) {
    return {
      ok: false,
      reason: `${ext ? `.${ext}는` : '이 형식은'} 아이폰에서 재생되지 않을 수 있어요.\nm4a · mp3 · aac · wav 파일을 골라주세요.`,
    };
  }
  if (typeof asset.size === 'number' && asset.size > MAX_CLIP_BYTES) {
    const mb = Math.round(asset.size / 1024 / 1024);
    return {
      ok: false,
      reason: `파일이 너무 커요 (${mb}MB).\n백업 파일이 감당하기 어려워져서 10MB까지만 붙일 수 있어요.`,
    };
  }
  return { ok: true, ext };
};

// ── 네이티브 (lazy require — Jest 안전) ──

const FS = () => require('expo-file-system/legacy');

const genName = (ext = 'm4a') => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

// 녹음이 끝난 임시 파일을 앱 폴더로 옮기고 첨부 항목을 만든다.
// 실패하면 null (호출부가 토스트로 알린다)
export const saveRecording = async (uri, durationMs) => {
  try {
    const fs = FS();
    const dir = fs.documentDirectory + ATTACH_SUBDIR;
    const info = await fs.getInfoAsync(dir);
    if (!info.exists) await fs.makeDirectoryAsync(dir, { intermediates: true });
    const name = genName();
    await fs.moveAsync({ from: uri, to: dir + name });
    return { file: name, type: 'audio', durationMs: Math.round(durationMs || 0) };
  } catch {
    return null;
  }
};

// 고른 오디오 파일을 앱 폴더로 복사한다(원본은 그대로 둔다 — 남의 파일을 옮기면 안 된다).
// 길이는 지금 알 수 없어 0으로 두고, 재생 행이 로드 후 실제 길이를 보여준다
export const saveAudioFile = async (uri, ext) => {
  try {
    const fs = FS();
    const dir = fs.documentDirectory + ATTACH_SUBDIR;
    const info = await fs.getInfoAsync(dir);
    if (!info.exists) await fs.makeDirectoryAsync(dir, { intermediates: true });
    const name = genName(ext || 'm4a');
    await fs.copyAsync({ from: uri, to: dir + name });
    return { file: name, type: 'audio', durationMs: 0 };
  } catch {
    return null;
  }
};
