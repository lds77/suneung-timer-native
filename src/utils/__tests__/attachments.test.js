// 오답노트 첨부 순수 헬퍼 테스트 (네이티브 파일 연산은 lazy require라 여기 미포함)
import { formatBytes, collectReferencedFiles, orphanFiles, canAddMore, MAX_ATTACH } from '../attachments';

describe('formatBytes', () => {
  it('바이트/KB/MB 단위 변환', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2048)).toBe('2KB');
    expect(formatBytes(1024 * 1024 * 3.2)).toBe('3.2MB');
  });
  it('잘못된 입력은 0B', () => {
    expect(formatBytes(undefined)).toBe('0B');
    expect(formatBytes(null)).toBe('0B');
    expect(formatBytes('x')).toBe('0B');
  });
});

describe('collectReferencedFiles', () => {
  it('모든 노트의 첨부 파일명을 모은다 (중복 제거)', () => {
    const notes = [
      { id: 'a', attachments: [{ file: '1.jpg' }, { file: '2.jpg' }] },
      { id: 'b', attachments: [{ file: '2.jpg' }] }, // 중복
      { id: 'c' },                                   // attachments 없음
      { id: 'd', attachments: [] },
    ];
    const set = collectReferencedFiles(notes);
    expect(set.size).toBe(2);
    expect(set.has('1.jpg')).toBe(true);
    expect(set.has('2.jpg')).toBe(true);
  });
  it('빈/이상 입력에 안전', () => {
    expect(collectReferencedFiles(null).size).toBe(0);
    expect(collectReferencedFiles([{ attachments: [{ file: '' }, {}] }]).size).toBe(0);
  });
});

describe('orphanFiles', () => {
  it('노트가 참조하지 않는 파일만 반환', () => {
    const notes = [{ id: 'a', attachments: [{ file: 'keep.jpg' }] }];
    const all = ['keep.jpg', 'orphan1.jpg', 'orphan2.jpg'];
    expect(orphanFiles(all, notes).sort()).toEqual(['orphan1.jpg', 'orphan2.jpg']);
  });
  it('모두 참조되면 빈 배열', () => {
    const notes = [{ id: 'a', attachments: [{ file: 'x.jpg' }] }];
    expect(orphanFiles(['x.jpg'], notes)).toEqual([]);
  });
});

describe('canAddMore', () => {
  it('상한(MAX_ATTACH) 이내면 true', () => {
    expect(canAddMore([], 1)).toBe(true);
    expect(canAddMore(new Array(MAX_ATTACH - 1), 1)).toBe(true);
  });
  it('상한을 넘기면 false', () => {
    expect(canAddMore(new Array(MAX_ATTACH), 1)).toBe(false);
    expect(canAddMore(new Array(MAX_ATTACH - 1), 2)).toBe(false);
  });
});
