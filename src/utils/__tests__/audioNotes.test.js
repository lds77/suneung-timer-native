// 오답노트 음성 메모 — 순수 로직 테스트
import {
  MAX_AUDIO, MAX_AUDIO_MS, VOICE_RECORDING_OPTIONS,
  isAudioAttachment, photoAttachments, audioAttachments, canAddAudio,
  remainingMs, reachedLimit, fmtClock, isTooShort, normalizeAttachments,
  checkAudioPick, audioExt, MAX_CLIP_BYTES,
} from '../audioNotes';

describe('첨부 종류 구분 — type이 없으면 사진(기존 데이터 호환)', () => {
  const list = [
    { file: 'a.jpg' },                                  // 1.0.38부터 쌓인 옛 사진 항목
    { file: 'b.m4a', type: 'audio', durationMs: 5000 },
    { file: 'c.jpg' },
  ];

  test('사진/음성이 갈린다', () => {
    expect(photoAttachments(list).map(a => a.file)).toEqual(['a.jpg', 'c.jpg']);
    expect(audioAttachments(list).map(a => a.file)).toEqual(['b.m4a']);
  });

  test('★type 없는 옛 항목을 음성으로 오인하지 않는다★', () => {
    expect(isAudioAttachment({ file: 'a.jpg' })).toBe(false);
    expect(isAudioAttachment(null)).toBe(false);
    expect(isAudioAttachment(undefined)).toBe(false);
  });

  test('빈 입력 방어', () => {
    expect(photoAttachments(null)).toEqual([]);
    expect(audioAttachments(undefined)).toEqual([]);
  });
});

describe('canAddAudio — 노트당 개수 상한', () => {
  const audio = (n) => Array.from({ length: n }, (_, i) => ({ file: `${i}.m4a`, type: 'audio' }));

  test(`음성 ${MAX_AUDIO}개까지만`, () => {
    expect(canAddAudio([])).toBe(true);
    expect(canAddAudio(audio(MAX_AUDIO - 1))).toBe(true);
    expect(canAddAudio(audio(MAX_AUDIO))).toBe(false);
  });

  test('사진은 음성 상한을 잡아먹지 않는다', () => {
    const photos = Array.from({ length: 5 }, (_, i) => ({ file: `${i}.jpg` }));
    expect(canAddAudio(photos)).toBe(true);
  });
});

describe('길이 상한', () => {
  test('남은 시간', () => {
    expect(remainingMs(0)).toBe(MAX_AUDIO_MS);
    expect(remainingMs(60000)).toBe(MAX_AUDIO_MS - 60000);
    expect(remainingMs(MAX_AUDIO_MS + 5000)).toBe(0);
    expect(remainingMs(-5)).toBe(MAX_AUDIO_MS);
  });

  test('상한 도달 판정 (자동 정지 기준)', () => {
    expect(reachedLimit(MAX_AUDIO_MS - 1)).toBe(false);
    expect(reachedLimit(MAX_AUDIO_MS)).toBe(true);
    expect(reachedLimit(MAX_AUDIO_MS + 1)).toBe(true);
  });

  test('3분', () => {
    expect(MAX_AUDIO_MS).toBe(180000);
  });
});

describe('fmtClock / isTooShort', () => {
  test('mm:ss', () => {
    expect(fmtClock(0)).toBe('00:00');
    expect(fmtClock(5000)).toBe('00:05');
    expect(fmtClock(65000)).toBe('01:05');
    expect(fmtClock(180000)).toBe('03:00');
    expect(fmtClock(null)).toBe('00:00');
  });

  test('1초 미만은 실수로 누른 것 — 저장하지 않는다', () => {
    expect(isTooShort(0)).toBe(true);
    expect(isTooShort(999)).toBe(true);
    expect(isTooShort(1000)).toBe(false);
  });
});

describe('★normalizeAttachments — 편집기 왕복에서 음성 필드가 살아남아야 한다★', () => {
  // 편집기는 노트를 열 때와 저장할 때 첨부 배열을 다시 만든다.
  // 예전처럼 { file }만 뽑으면 음성이 사진으로 변해 썸네일 자리에 빈 칸이 뜬다
  test('음성은 type·durationMs를 유지한다', () => {
    const list = [{ file: 'a.m4a', type: 'audio', durationMs: 12345 }];
    expect(normalizeAttachments(list)).toEqual([{ file: 'a.m4a', type: 'audio', durationMs: 12345 }]);
  });

  test('사진은 file만 남는다 (군더더기 필드 제거)', () => {
    expect(normalizeAttachments([{ file: 'a.jpg', junk: 1 }])).toEqual([{ file: 'a.jpg' }]);
  });

  test('durationMs가 없거나 이상해도 숫자로 정규화', () => {
    expect(normalizeAttachments([{ file: 'a.m4a', type: 'audio' }])[0].durationMs).toBe(0);
    expect(normalizeAttachments([{ file: 'a.m4a', type: 'audio', durationMs: -5 }])[0].durationMs).toBe(0);
    expect(normalizeAttachments([{ file: 'a.m4a', type: 'audio', durationMs: 10.6 }])[0].durationMs).toBe(11);
  });

  test('file 없는 항목·빈 입력 방어', () => {
    expect(normalizeAttachments([null, { type: 'audio' }, { file: 'ok.jpg' }])).toEqual([{ file: 'ok.jpg' }]);
    expect(normalizeAttachments(null)).toEqual([]);
  });
});

describe('checkAudioPick — 파일에서 오디오 첨부 검증', () => {
  const ok = (over) => ({ uri: 'file:///x/a.m4a', name: 'a.m4a', size: 1000, ...over });

  test('m4a·mp3·aac·wav는 받는다', () => {
    for (const ext of ['m4a', 'mp3', 'aac', 'wav']) {
      expect(checkAudioPick(ok({ name: `x.${ext}` })).ok).toBe(true);
    }
  });

  test('★안드만 재생되는 포맷은 막는다★ (기종 변경에서 안 들리게 되므로)', () => {
    for (const ext of ['ogg', 'flac', 'amr', '3gp']) {
      const r = checkAudioPick(ok({ name: `x.${ext}` }));
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('아이폰');
    }
  });

  test('확장자가 없으면 막는다', () => {
    expect(checkAudioPick(ok({ name: 'noext' })).ok).toBe(false);
  });

  test('10MB 초과는 막는다 (백업 파일이 커지는 것 방지)', () => {
    expect(checkAudioPick(ok({ size: MAX_CLIP_BYTES })).ok).toBe(true);
    const over = checkAudioPick(ok({ size: MAX_CLIP_BYTES + 1 }));
    expect(over.ok).toBe(false);
    expect(over.reason).toContain('10MB');
  });

  test('size를 모르면 통과시킨다 (일부 기기가 size를 안 준다)', () => {
    expect(checkAudioPick(ok({ size: undefined })).ok).toBe(true);
  });

  test('빈 입력 방어', () => {
    expect(checkAudioPick(null).ok).toBe(false);
    expect(checkAudioPick({}).ok).toBe(false);
  });

  test('audioExt — 대소문자·경로 방어', () => {
    expect(audioExt('a.M4A')).toBe('m4a');
    expect(audioExt('/x/y/b.mp3')).toBe('mp3');
    expect(audioExt('noext')).toBe('');
    expect(audioExt(null)).toBe('');
  });
});

describe('★녹음 포맷은 양 플랫폼 동일해야 한다★', () => {
  // expo-audio의 LOW_QUALITY 프리셋은 안드에서 .3gp+AMR로 녹음하는데 iOS가 재생을 못 한다.
  // 갤럭시 백업을 아이폰에서 복원하면 녹음이 안 들리게 되므로 프리셋을 쓰지 않는다.
  test('m4a(AAC) 모노 — 안드 전용 확장자/코덱이 끼어들지 않았는지', () => {
    expect(VOICE_RECORDING_OPTIONS.extension).toBe('.m4a');
    expect(VOICE_RECORDING_OPTIONS.numberOfChannels).toBe(1);
    expect(VOICE_RECORDING_OPTIONS.android.audioEncoder).toBe('aac');
    expect(VOICE_RECORDING_OPTIONS.android.outputFormat).toBe('mpeg4');
    expect(VOICE_RECORDING_OPTIONS.android.extension).toBeUndefined();
  });

  test('분당 약 0.5MB (64kbps) — 상한 3분이면 노트당 최대 약 3MB', () => {
    expect(VOICE_RECORDING_OPTIONS.bitRate).toBe(64000);
    const bytesPerMin = (64000 / 8) * 60;
    expect(Math.round(bytesPerMin / 1024 / 1024 * 10) / 10).toBe(0.5);
  });
});
