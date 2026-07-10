// 할일 기한(dueDate) 순수 로직 테스트
import { isTodayVisible, isUpcoming, dueBadge, diffDays, nextDates, dateChipLabel, buildMonthCells } from '../todoUtils';

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
