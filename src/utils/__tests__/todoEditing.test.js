const { editTodoInPlace, applyDailyTodoReset } = require('../todoUtils');
const TODAY = '2026-09-14'; // 월요일
const fields = { text: '수학 복습', subjectId: 'math', scope: 'today', isTemplate: true,
  repeatDays: [1, 2, 3, 4, 5], memo: '새 메모' };
const template = { ...fields, id: 'template', isTemplate: true, memo: '이전 메모' };
const instance = { ...fields, id: 'instance', isTemplate: false, repeatDays: null,
  templateId: 'template', createdDate: TODAY, done: true, completedAt: 1000, memo: '이전 메모' };

test.each(['instance', 'template'])('%s 편집: 공부 기록이 연결된 실행 ID·완료 상태·순서를 보존한다', id => {
  const before = [{ id: 'first' }, template, instance, { id: 'last' }];
  const after = editTodoInPlace(before, id, fields, TODAY);
  expect(after.map(t => t.id)).toEqual(before.map(t => t.id));
  expect(after.find(t => t.id === 'instance')).toMatchObject({
    isTemplate: false, templateId: 'template', done: true, completedAt: 1000, memo: '새 메모',
  });
  expect(after.find(t => t.id === 'template').memo).toBe('새 메모');
  const sessions = [{ todoId: 'instance', durationSec: 600 }];
  const visible = after.find(t => !t.isTemplate && t.id === sessions[0].todoId);
  expect(sessions.filter(s => s.todoId === visible.id).reduce((n, s) => n + s.durationSec, 0)).toBe(600);
  expect(instance.memo).toBe('이전 메모');
});

test.each(['instance', 'template'])('%s 반복 해제: 오늘 실행 항목을 유지하고 템플릿만 제거한다', id => {
  const after = editTodoInPlace([template, instance], id, { ...fields, isTemplate: false, repeatDays: null }, TODAY);
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ id: 'instance', templateId: null, isTemplate: false, done: true });
});

test('일반 할 일을 반복으로 바꿔도 실행 ID를 새 템플릿에 빼앗기지 않는다', () => {
  const after = editTodoInPlace([{ ...instance, templateId: null }], 'instance', fields, TODAY);
  expect(after).toHaveLength(2);
  const createdTemplate = after.find(t => t.isTemplate);
  expect(createdTemplate.id).not.toBe('instance');
  expect(after[0]).toMatchObject({ id: 'instance', isTemplate: false, templateId: createdTemplate.id });
});

test('오늘 실행 항목이 없는 템플릿은 오늘 요일일 때만 하나 생성한다', () => {
  const after = editTodoInPlace([template], 'template', fields, TODAY);
  expect(after.filter(t => !t.isTemplate)).toHaveLength(1);
  const again = editTodoInPlace(after, 'template', fields, TODAY);
  expect(again.map(t => t.id)).toEqual(after.map(t => t.id));
  expect(applyDailyTodoReset(again, { today: TODAY, needsReset: false }).todos.map(t => t.id))
    .toEqual(after.map(t => t.id));
  expect(editTodoInPlace([template], 'template', { ...fields, repeatDays: [6] }, TODAY)).toHaveLength(1);
});

test('중복 때문에 편집이 거부돼도 원본 템플릿과 실행 항목을 모두 보존한다', () => {
  const before = [template, instance, { id: 'other', text: '중복', subjectId: 'math', scope: 'today', done: false }];
  const after = editTodoInPlace(before, 'instance', { ...fields, text: '중복', isTemplate: false }, TODAY);
  expect(after).toBe(before);
});

test('일반 할 일의 메모 수정도 ID·완료 상태를 유지한다', () => {
  const after = editTodoInPlace([{ ...instance, templateId: null }], 'instance', {
    ...fields, isTemplate: false, repeatDays: null,
  }, TODAY);
  expect(after[0]).toMatchObject({ id: 'instance', done: true, completedAt: 1000, memo: '새 메모' });
});

test.each(['instance', 'template'])('%s 편집으로 오늘을 반복 요일에서 빼도 기존 오늘 항목은 보존한다', id => {
  const before = [template, instance];
  const after = editTodoInPlace(before, id, { ...fields, repeatDays: [6] }, TODAY);
  expect(after.map(t => t.id)).toEqual(before.map(t => t.id));
  expect(after.find(t => t.id === 'template').repeatDays).toEqual([6]);
  expect(after.find(t => t.id === 'instance')).toMatchObject({
    id: 'instance', templateId: 'template', createdDate: TODAY, done: true, completedAt: 1000,
  });
  const reset = applyDailyTodoReset(after, { today: TODAY, needsReset: false });
  expect(reset.todos.map(t => t.id)).toEqual(after.map(t => t.id));
  expect(before[0].repeatDays).toEqual([1, 2, 3, 4, 5]);
});

test.each([false, true])('자정 후 템플릿 편집: 전날 항목을 재사용하며 중복하지 않는다 (done=%s)', done => {
  const yesterday = { ...instance, createdDate: '2026-09-13', done };
  const before = [template, yesterday];
  const after = editTodoInPlace(before, 'template', fields, TODAY);
  expect(after.map(t => t.id)).toEqual(['template', 'instance']);
  expect(after[1]).toMatchObject({ id: 'instance', createdDate: TODAY, memo: '새 메모', done });
  expect(yesterday.createdDate).toBe('2026-09-13');
  expect(applyDailyTodoReset(after, { today: TODAY, needsReset: false }).todos.map(t => t.id))
    .toEqual(['template', 'instance']);
  if (!done) {
    expect(applyDailyTodoReset(after, { today: TODAY, needsReset: true }).todos.map(t => t.id))
      .toEqual(['template', 'instance']);
  }
});

test('자정 후 반복 해제도 전날 항목을 자기 자신과의 중복으로 거부하지 않는다', () => {
  const yesterday = { ...instance, createdDate: '2026-09-13', done: false };
  const after = editTodoInPlace([template, yesterday], 'template', {
    ...fields, isTemplate: false, repeatDays: null,
  }, TODAY);
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ id: 'instance', isTemplate: false, templateId: null });
});
