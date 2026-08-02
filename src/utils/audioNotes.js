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

// ── 네이티브 (lazy require — Jest 안전) ──

const FS = () => require('expo-file-system/legacy');

const genName = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.m4a`;

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
