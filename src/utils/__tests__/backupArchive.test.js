// 사진 포함 백업 아카이브 — 순수 로직 테스트
import { looksLikeZip, backupFileName, filesToArchive, filesToRestore } from '../backupArchive';

describe('looksLikeZip — 확장자가 아니라 매직바이트로 판별', () => {
  test('zip의 base64는 UEsDB로 시작한다', () => {
    // 'PK\x03\x04' + 4바이트 → base64
    const head = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).toString('base64');
    expect(head.startsWith('UEsDB')).toBe(true);
    expect(looksLikeZip(head)).toBe(true);
  });

  test('JSON 백업은 zip이 아니다', () => {
    const head = Buffer.from('{"_meta"').toString('base64');
    expect(looksLikeZip(head)).toBe(false);
  });

  test('빈 값·비문자열 방어', () => {
    expect(looksLikeZip('')).toBe(false);
    expect(looksLikeZip(null)).toBe(false);
    expect(looksLikeZip(undefined)).toBe(false);
    expect(looksLikeZip(123)).toBe(false);
  });
});

describe('backupFileName', () => {
  test('사진을 담으면 zip, 기록만이면 json', () => {
    expect(backupFileName('2026-08-02', true)).toBe('yeolgong_backup_20260802.zip');
    expect(backupFileName('2026-08-02', false)).toBe('yeolgong_backup_20260802.json');
  });

  test('날짜가 없어도 깨지지 않는다', () => {
    expect(backupFileName(null, false)).toBe('yeolgong_backup_.json');
  });
});

describe('filesToArchive — 노트가 참조하는 사진만 담는다', () => {
  const notes = [
    { id: 'n1', attachments: [{ file: 'a.jpg' }, { file: 'b.jpg' }] },
    { id: 'n2', attachments: [{ file: 'c.jpg' }] },
    { id: 'n3' },                       // 첨부 없음
    { id: 'n4', attachments: [] },
  ];

  test('참조된 파일만, 중복 없이', () => {
    expect(filesToArchive(notes).sort()).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  test('같은 파일을 두 노트가 참조해도 한 번만', () => {
    const dup = [{ attachments: [{ file: 'x.jpg' }] }, { attachments: [{ file: 'x.jpg' }] }];
    expect(filesToArchive(dup)).toEqual(['x.jpg']);
  });

  test('빈 입력 방어', () => {
    expect(filesToArchive([])).toEqual([]);
    expect(filesToArchive(null)).toEqual([]);
  });
});

describe('filesToRestore — 아카이브에 있고 노트가 참조하는 것만', () => {
  const notes = [{ attachments: [{ file: 'a.jpg' }, { file: 'gone.jpg' }] }];

  test('아카이브에 없는 참조는 건너뛴다 (파일이 사라진 백업)', () => {
    expect(filesToRestore(['a.jpg'], notes)).toEqual(['a.jpg']);
  });

  test('★노트가 참조하지 않는 파일은 앱 폴더로 들이지 않는다★', () => {
    // 손상되거나 조작된 아카이브가 엉뚱한 파일을 앱 폴더에 심는 것 방지
    expect(filesToRestore(['a.jpg', 'evil.jpg'], notes)).toEqual(['a.jpg']);
  });

  test('빈 입력 방어', () => {
    expect(filesToRestore([], notes)).toEqual([]);
    expect(filesToRestore(null, notes)).toEqual([]);
    expect(filesToRestore(['a.jpg'], [])).toEqual([]);
  });
});
