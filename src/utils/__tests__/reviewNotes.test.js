// 오답노트 순수 로직 테스트 — 설계: docs/review-notes-design.md

const {
  makeNoteFromTodo, chapterSuggestions, groupBySubjectChapter, noteSorter, UNCATEGORIZED,
} = require('../reviewNotes');

describe('makeNoteFromTodo', () => {
  test('할일 필드를 노트 콘텐츠로 매핑 (제목=text, 본문=memo, sourceTodoId)', () => {
    const todo = {
      id: 'todo_1', text: '  이차함수 오답  ', memo: '  판별식 부호 실수  ',
      subjectId: 's1', subjectLabel: '수학', subjectColor: '#f00', subjectIcon: 'calc',
    };
    const n = makeNoteFromTodo(todo);
    expect(n).toEqual({
      subjectId: 's1', subjectLabel: '수학', subjectColor: '#f00', subjectIcon: 'calc',
      chapter: '', title: '이차함수 오답', body: '판별식 부호 실수', color: null, sourceTodoId: 'todo_1',
    });
  });

  test('과목 없는 할일 → subject 필드 null, id/timestamp는 넣지 않음', () => {
    const n = makeNoteFromTodo({ id: 't', text: 'x' });
    expect(n.subjectId).toBeNull();
    expect(n.subjectLabel).toBeNull();
    expect(n.id).toBeUndefined();
    expect(n.createdAt).toBeUndefined();
  });

  test('null/undefined 입력에도 안전', () => {
    expect(makeNoteFromTodo(null).title).toBe('');
    expect(makeNoteFromTodo(undefined).sourceTodoId).toBeNull();
  });
});

describe('chapterSuggestions', () => {
  const notes = [
    { subjectId: 's1', chapter: '2단원' },
    { subjectId: 's1', chapter: '1단원' },
    { subjectId: 's1', chapter: '1단원' },   // 중복
    { subjectId: 's1', chapter: '   ' },      // 공백만 → 제외
    { subjectId: 's2', chapter: '독해' },
    { subjectId: null, chapter: '기타메모' },
  ];
  test('해당 과목의 비어있지 않은 챕터만, 중복 제거·정렬', () => {
    expect(chapterSuggestions(notes, 's1')).toEqual(['1단원', '2단원']);
  });
  test('미분류(subjectId null) 챕터', () => {
    expect(chapterSuggestions(notes, null)).toEqual(['기타메모']);
  });
  test('노트 없으면 빈 배열', () => {
    expect(chapterSuggestions([], 's1')).toEqual([]);
    expect(chapterSuggestions(null, 's1')).toEqual([]);
  });
});

describe('groupBySubjectChapter', () => {
  const subjects = [
    { id: 's1', name: '수학', color: '#f00' },
    { id: 's2', name: '영어', color: '#00f' },
  ];
  const notes = [
    { id: 'n1', subjectId: 's2', chapter: '독해', updatedAt: 10 },
    { id: 'n2', subjectId: 's1', chapter: '2단원', updatedAt: 20 },
    { id: 'n3', subjectId: 's1', chapter: '2단원', updatedAt: 30 },
    { id: 'n4', subjectId: 's1', chapter: '', updatedAt: 40 },       // 미분류 챕터
    { id: 'n5', subjectId: 'gone', chapter: 'x', updatedAt: 50, subjectLabel: '삭제과목' }, // 삭제된 과목
    { id: 'n6', subjectId: null, chapter: '', updatedAt: 60 },        // 미분류 과목
  ];

  test('과목은 subjects 순서, 미분류/삭제 과목은 끝', () => {
    const g = groupBySubjectChapter(notes, subjects);
    expect(g.map(x => x.subjectId)).toEqual(['s1', 's2', 'gone', null]);
    expect(g[0].subjectLabel).toBe('수학');
    expect(g[3].subjectLabel).toBe(UNCATEGORIZED);
  });

  test('삭제된 과목은 노트의 비정규화 라벨로 표시', () => {
    const g = groupBySubjectChapter(notes, subjects);
    const gone = g.find(x => x.subjectId === 'gone');
    expect(gone.subjectLabel).toBe('삭제과목');
  });

  test('챕터는 이름순 + 미분류 맨 끝, 노트는 updatedAt desc', () => {
    const g = groupBySubjectChapter(notes, subjects);
    const math = g[0];
    expect(math.count).toBe(3);
    expect(math.chapters.map(c => c.name)).toEqual(['2단원', UNCATEGORIZED]);
    expect(math.chapters[0].notes.map(n => n.id)).toEqual(['n3', 'n2']); // 30 > 20
  });

  test('빈 입력 안전', () => {
    expect(groupBySubjectChapter([], subjects)).toEqual([]);
    expect(groupBySubjectChapter(null, null)).toEqual([]);
  });

  test('sort:review — 안 본 것 먼저, 그다음 오래 전 복습 순', () => {
    const ns = [
      { id: 'x', subjectId: 's1', chapter: '', updatedAt: 5, lastReviewedAt: 200 }, // 최근 복습
      { id: 'y', subjectId: 's1', chapter: '', updatedAt: 5, lastReviewedAt: 100 }, // 오래 전 복습
      { id: 'z', subjectId: 's1', chapter: '', updatedAt: 5 },                        // 안 봄
    ];
    const g = groupBySubjectChapter(ns, subjects, { sort: 'review' });
    expect(g[0].chapters[0].notes.map(n => n.id)).toEqual(['z', 'y', 'x']);
  });
});

describe('noteSorter', () => {
  test('recent(기본)은 updatedAt desc', () => {
    const arr = [{ updatedAt: 1 }, { updatedAt: 3 }, { updatedAt: 2 }];
    expect(arr.slice().sort(noteSorter('recent')).map(n => n.updatedAt)).toEqual([3, 2, 1]);
  });
  test('review는 안 본 것(-) 먼저', () => {
    const arr = [{ lastReviewedAt: 50 }, {}, { lastReviewedAt: 10 }];
    expect(arr.slice().sort(noteSorter('review')).map(n => n.lastReviewedAt ?? 'none'))
      .toEqual(['none', 10, 50]);
  });
});
