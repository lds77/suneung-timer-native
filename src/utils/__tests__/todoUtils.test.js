// 할일 기한(dueDate) 순수 로직 테스트
import { isTodayVisible, isUpcoming, dueBadge, diffDays, nextDates, dateChipLabel, buildMonthCells, applyReorder, computeDropIndex, applyDailyTodoReset } from '../todoUtils';

const TODAY = '2026-07-10';

describe('diffDays', () => {
  it('같은 날은 0', () => expect(diffDays(TODAY, TODAY)).toBe(0));
  it('다음날은 1', () => expect(diffDays(TODAY, '2026-07-11')).toBe(1));
  it('전날은 -1', () => expect(diffDays(TODAY, '2026-07-09')).toBe(-1));
  it('월 경계', () => expect(diffDays('2026-07-31', '2026-08-01')).toBe(1));
  it('연 경계', () => expect(diffDays('2026-12-31', '2027-01-01')).toBe(1));
});

describe('isTodayVisible — 오늘 목록 소속', () => {
  it('기한 없는 오늘 항목은 표시', () => {
    expect(isTodayVisible({ scope: 'today', dueDate: null }, TODAY)).toBe(true);
  });
  it('scope null(레거시)도 오늘 취급', () => {
    expect(isTodayVisible({ scope: null, dueDate: null }, TODAY)).toBe(true);
  });
  it('미래 기한이면 숨김 (예정으로 분리)', () => {
    expect(isTodayVisible({ scope: 'today', dueDate: '2026-07-12' }, TODAY)).toBe(false);
  });
  it('기한이 오늘이면 표시', () => {
    expect(isTodayVisible({ scope: 'today', dueDate: TODAY }, TODAY)).toBe(true);
  });
  it('기한이 지났으면 표시 (이월)', () => {
    expect(isTodayVisible({ scope: 'today', dueDate: '2026-07-08' }, TODAY)).toBe(true);
  });
  it('템플릿은 항상 숨김', () => {
    expect(isTodayVisible({ scope: 'today', isTemplate: true }, TODAY)).toBe(false);
  });
});

describe('isTodayVisible — 다른 목록 소속 (기한 도래 시 오늘 등장)', () => {
  it('기한 없는 커스텀 목록 항목은 오늘 탭에 안 나옴', () => {
    expect(isTodayVisible({ scope: 'week', dueDate: null }, TODAY)).toBe(false);
  });
  it('기한이 오늘인 커스텀 항목은 오늘 탭에 등장', () => {
    expect(isTodayVisible({ scope: 'week', dueDate: TODAY }, TODAY)).toBe(true);
  });
  it('기한 지난 미완료 커스텀 항목도 등장', () => {
    expect(isTodayVisible({ scope: 'list_x', dueDate: '2026-07-08', done: false }, TODAY)).toBe(true);
  });
  it('기한 지난 완료 항목은 완료한 날에만 표시', () => {
    const doneToday = { scope: 'week', dueDate: '2026-07-08', done: true, completedAt: new Date('2026-07-10T14:00:00').getTime() };
    const doneOld = { scope: 'week', dueDate: '2026-07-08', done: true, completedAt: new Date('2026-07-09T14:00:00').getTime() };
    expect(isTodayVisible(doneToday, TODAY)).toBe(true);
    expect(isTodayVisible(doneOld, TODAY)).toBe(false);
  });
  it('시험대비(exam)도 기한 도래 시 등장', () => {
    expect(isTodayVisible({ scope: 'exam', dueDate: TODAY }, TODAY)).toBe(true);
  });
});

describe('isUpcoming', () => {
  it('오늘 소속 + 미래 기한만 예정', () => {
    expect(isUpcoming({ scope: 'today', dueDate: '2026-07-12' }, TODAY)).toBe(true);
    expect(isUpcoming({ scope: 'today', dueDate: TODAY }, TODAY)).toBe(false);
    expect(isUpcoming({ scope: 'week', dueDate: '2026-07-12' }, TODAY)).toBe(false);
    expect(isUpcoming({ scope: 'today', dueDate: null }, TODAY)).toBe(false);
    expect(isUpcoming({ scope: 'today', dueDate: '2026-07-12', isTemplate: true }, TODAY)).toBe(false);
  });
});

describe('dueBadge', () => {
  it('기한 없으면 null', () => expect(dueBadge({ dueDate: null }, TODAY)).toBeNull());
  it('오늘까지', () => expect(dueBadge({ dueDate: TODAY }, TODAY)).toEqual({ label: '오늘까지', tone: 'due' }));
  it('내일까지', () => expect(dueBadge({ dueDate: '2026-07-11' }, TODAY)).toEqual({ label: '내일까지', tone: 'normal' }));
  it('이후 날짜는 M/D까지', () => expect(dueBadge({ dueDate: '2026-07-15' }, TODAY)).toEqual({ label: '7/15까지', tone: 'normal' }));
  it('지난 미완료는 n일 지남 (overdue)', () => {
    expect(dueBadge({ dueDate: '2026-07-08', done: false }, TODAY)).toEqual({ label: '2일 지남', tone: 'overdue' });
  });
  it('지난 완료는 날짜만 (normal)', () => {
    expect(dueBadge({ dueDate: '2026-07-08', done: true }, TODAY)).toEqual({ label: '7/8', tone: 'normal' });
  });
});

describe('nextDates / dateChipLabel', () => {
  it('내일부터 n일', () => {
    expect(nextDates(TODAY, 3)).toEqual(['2026-07-11', '2026-07-12', '2026-07-13']);
  });
  it('월 경계 넘김', () => {
    expect(nextDates('2026-07-31', 2)).toEqual(['2026-08-01', '2026-08-02']);
  });
  it('내일 라벨', () => expect(dateChipLabel('2026-07-11', TODAY)).toBe('내일'));
  it('요일 라벨', () => {
    // 2026-07-12는 일요일
    expect(dateChipLabel('2026-07-12', TODAY)).toBe('7/12(일)');
  });
});

describe('applyReorder — 드래그 정렬 커밋', () => {
  const mk = (...ids) => ids.map(id => ({ id }));
  const ids = (list) => list.map(t => t.id);

  it('그룹 항목들을 기존 슬롯 자리에 새 순서로 재배치', () => {
    const list = mk('a', 'b', 'c', 'd');
    expect(ids(applyReorder(list, ['c', 'a', 'b']))).toEqual(['c', 'a', 'b', 'd']);
  });
  it('그룹 밖 항목(중간에 끼어 있어도)의 위치는 그대로', () => {
    // b, d만 그룹 — a, c, e 자리는 유지
    const list = mk('a', 'b', 'c', 'd', 'e');
    expect(ids(applyReorder(list, ['d', 'b']))).toEqual(['a', 'd', 'c', 'b', 'e']);
  });
  it('없는 id가 섞이면 원본 그대로 (삭제 레이스 방어)', () => {
    const list = mk('a', 'b');
    expect(applyReorder(list, ['a', 'x'])).toBe(list);
  });
  it('항목 객체는 참조 유지', () => {
    const list = mk('a', 'b');
    const next = applyReorder(list, ['b', 'a']);
    expect(next[0]).toBe(list[1]);
    expect(next[1]).toBe(list[0]);
  });
});

describe('computeDropIndex — 드래그 목표 인덱스', () => {
  const H = [40, 40, 60, 40]; // 표시 순서의 행 높이

  it('이동 없으면 제자리', () => expect(computeDropIndex(H, 1, 0)).toBe(1));
  it('아래 이웃 절반 미만이면 제자리', () => expect(computeDropIndex(H, 0, 19)).toBe(0));
  it('아래 이웃 절반 이상이면 한 칸 아래', () => expect(computeDropIndex(H, 0, 20)).toBe(1));
  it('가변 높이 누적: 40 + 60/2 = 70 이상이면 두 칸', () => {
    expect(computeDropIndex(H, 0, 69)).toBe(1);
    expect(computeDropIndex(H, 0, 70)).toBe(2);
  });
  it('위로 이동도 동일 규칙', () => {
    expect(computeDropIndex(H, 2, -19)).toBe(2);
    expect(computeDropIndex(H, 2, -20)).toBe(1);
    expect(computeDropIndex(H, 2, -60)).toBe(0);
  });
  it('끝을 넘어가면 경계에서 멈춤', () => {
    expect(computeDropIndex(H, 0, 9999)).toBe(3);
    expect(computeDropIndex(H, 3, -9999)).toBe(0);
  });
});

describe('applyDailyTodoReset — 일일 리셋 파이프라인', () => {
  // 2026-07-10은 금요일 (7/1 수요일 기준). getDay() === 5
  const D = { today: TODAY, needsReset: true };
  const ids = (r) => r.todos.map(t => t.id);

  it('리셋: 오늘 목록의 완료된 일반 항목만 삭제, 커스텀/시험/미완료는 유지', () => {
    const r = applyDailyTodoReset([
      { id: 'a', scope: 'today', done: true, completedAt: 1 },   // 삭제
      { id: 'b', scope: 'today', done: false },                   // 유지
      { id: 'c', scope: 'list_x', done: true },                   // 유지 (커스텀 목록)
      { id: 'd', scope: 'exam', done: true },                     // 유지 (시험)
      { id: 'e', scope: null, done: true },                       // 삭제 (레거시 오늘)
      { id: 'f', scope: 'today', done: false, dueDate: '2099-01-01' }, // 유지 (예정)
    ], D);
    expect(ids(r)).toEqual(['b', 'c', 'd', 'f']);
    expect(r.changed).toBe(true);
  });

  it('리셋: repeat(고정) 항목은 삭제 대신 done만 초기화', () => {
    const r = applyDailyTodoReset([{ id: 'a', scope: 'today', repeat: true, done: true, completedAt: 1 }], D);
    expect(r.todos).toEqual([expect.objectContaining({ id: 'a', done: false, completedAt: null })]);
  });

  it('지난날 미완료 반복 인스턴스는 리셋 여부와 무관하게 정리 (이월 중복 방지)', () => {
    const stale = { id: 's', scope: 'today', done: false, templateId: 'tm', createdDate: '2026-07-09' };
    expect(ids(applyDailyTodoReset([stale], { today: TODAY, needsReset: false }))).toEqual([]);
    expect(ids(applyDailyTodoReset([stale], D))).toEqual([]);
  });

  it('반복 템플릿: 오늘 요일이면 인스턴스 1개 생성 (필드/멱등 확인)', () => {
    const tmpl = { id: 'tm', isTemplate: true, repeatDays: [5], text: '단어 외우기', subjectId: 's1', subjectLabel: '영어', subjectColor: '#111', priority: 'high', memo: 'm' };
    const r = applyDailyTodoReset([tmpl], D);
    expect(r.todos.length).toBe(2);
    const inst = r.todos[1];
    expect(inst).toEqual(expect.objectContaining({
      templateId: 'tm', createdDate: TODAY, scope: 'today', done: false,
      text: '단어 외우기', subjectId: 's1', subjectLabel: '영어', priority: 'high', memo: 'm',
      isTemplate: false, repeatDays: null,
    }));
    // 멱등: 이미 오늘 인스턴스가 있으면 재생성 안 함
    const r2 = applyDailyTodoReset(r.todos, { today: TODAY, needsReset: false });
    expect(r2.todos.length).toBe(2);
    expect(r2.changed).toBe(false);
  });

  it('반복 템플릿: 오늘 요일이 아니면 생성 안 함', () => {
    const r = applyDailyTodoReset([{ id: 'tm', isTemplate: true, repeatDays: [0, 6], text: 'x' }], D);
    expect(r.todos.length).toBe(1);
  });

  it('리셋: 어제 완료된 반복 인스턴스도 오늘 목록 규칙으로 삭제되고 새 인스턴스가 생성된다', () => {
    const tmpl = { id: 'tm', isTemplate: true, repeatDays: [5], text: 'x' };
    const doneYesterday = { id: 'y', scope: 'today', done: true, templateId: 'tm', createdDate: '2026-07-09' };
    const r = applyDailyTodoReset([tmpl, doneYesterday], D);
    expect(r.todos.length).toBe(2); // 템플릿 + 오늘 새 인스턴스
    expect(r.todos[1].createdDate).toBe(TODAY);
  });

  it('리셋 아님(같은 날 재실행): 완료 항목 유지, 무변경이면 changed=false', () => {
    const list = [
      { id: 'a', scope: 'today', done: true, completedAt: 1 },
      { id: 'b', scope: 'today', done: false },
    ];
    const r = applyDailyTodoReset(list, { today: TODAY, needsReset: false });
    expect(ids(r)).toEqual(['a', 'b']);
    expect(r.changed).toBe(false);
  });
});

describe('buildMonthCells', () => {
  it('2026년 7월: 1일이 수요일 → 앞 빈칸 3개 + 31일', () => {
    const cells = buildMonthCells(2026, 6);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells.length).toBe(3 + 31);
    expect(cells[3]).toEqual({ date: '2026-07-01', day: 1 });
    expect(cells[cells.length - 1]).toEqual({ date: '2026-07-31', day: 31 });
  });
  it('일요일로 시작하는 달은 빈칸 없음 (2026-11-01 일요일)', () => {
    const cells = buildMonthCells(2026, 10);
    expect(cells[0]).toEqual({ date: '2026-11-01', day: 1 });
    expect(cells.length).toBe(30);
  });
  it('윤년 2월', () => {
    const cells = buildMonthCells(2028, 1).filter(Boolean);
    expect(cells.length).toBe(29);
  });
});
