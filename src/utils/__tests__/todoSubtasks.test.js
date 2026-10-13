const { normalizeSubtasks, getSubtasks, toggleTodoSubtask, editTodoInPlace, applyDailyTodoReset, syncSubtaskRows } = require('../todoUtils');
const { makeNoteFromTodo } = require('../reviewNotes');
const { generateId, getToday } = require('../format');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const TODAY = '2026-10-13';
const steps = [
  { id: 'pages', text: '문제집 p12–17 풀기', done: true },
  { id: 'review', text: '전에 오답 복습하기', done: false },
];
const parent = { id: 'math', text: '수학 공부', scope: 'today', done: false, subtasks: steps };

describe('폼의 끝 빈 칸 유지', () => {
  const empty = id => ({ id, text: '', done: false });
  const filled = count => Array.from({ length: count }, (_, i) => ({ id: `row_${i}`, text: `항목 ${i}`, done: i === 0 }));

  test('빈 목록은 빈 칸 하나로 시작하고 재동기화해도 ID가 바뀌지 않는다', () => {
    const makeId = jest.fn(() => 'new');
    const rows = syncSubtaskRows([], 20, makeId);
    expect(rows).toEqual([empty('new')]);
    expect(syncSubtaskRows(rows, 20, makeId)).toBe(rows);
    expect(makeId).toHaveBeenCalledTimes(1);
  });

  test('마지막 칸을 채우면 빈 칸을 하나 추가하고 기존 객체·ID·체크는 유지한다', () => {
    const rows = filled(2);
    const result = syncSubtaskRows(rows, 20, () => 'new');
    expect(result).toHaveLength(3);
    rows.forEach((row, index) => expect(result[index]).toBe(row));
    expect(result[2]).toEqual(empty('new'));
    expect(rows).toHaveLength(2);
  });

  test('끝 빈 칸 3개는 앞쪽 빈 칸 하나만 남기고 중간 빈 칸은 보존한다', () => {
    const rows = [steps[0], empty('middle'), steps[1], empty('first'), empty('second'), empty('third')];
    const makeId = jest.fn();
    const result = syncSubtaskRows(rows, 20, makeId);
    expect(result).toHaveLength(4);
    result.forEach((row, index) => expect(row).toBe(rows[index]));
    expect(makeId).not.toHaveBeenCalled();
    expect(rows).toHaveLength(6);
  });

  test('공백만 있는 마지막 칸을 지우듯 취급하며 그 입력 행의 ID는 유지한다', () => {
    const editing = { id: 'editing', text: '  ', done: false };
    const rows = [steps[0], editing, empty('tail')];
    expect(syncSubtaskRows(rows, 20, () => 'unused')).toEqual([steps[0], editing]);
    expect(syncSubtaskRows(rows, 20, () => 'unused')[1]).toBe(editing);
    expect(syncSubtaskRows([editing, empty('tail')], 20, () => 'unused')).toEqual([editing]);
  });

  test.each([20, 21])('채운 칸 %i개는 잘라내지 않고 끝 빈 칸만 제거한다', count => {
    const rows = filled(count);
    const makeId = jest.fn();
    expect(syncSubtaskRows(rows, 20, makeId)).toBe(rows);
    const result = syncSubtaskRows([...rows, empty('tail')], 20, makeId);
    expect(result).toEqual(rows);
    result.forEach((row, index) => expect(row).toBe(rows[index]));
    expect(makeId).not.toHaveBeenCalled();
  });

  test('상한은 채운 칸 수로 판단하며, 상한 상태에서도 중간 빈 칸은 보존한다', () => {
    const rows = [empty('middle'), ...filled(19)];
    const result = syncSubtaskRows(rows, 20, () => 'tail');
    expect(result).toHaveLength(21);
    const full = [...rows, { id: 'last', text: '20번째', done: false }, empty('tail')];
    expect(syncSubtaskRows(full, 20, () => 'unused')).toEqual(full.slice(0, -1));
  });

  test('상한에서 한 항목 삭제 후 빈 칸을 복원하고, 빈 칸은 저장 결과에 남지 않는다', () => {
    const rows = filled(20).slice(0, -1);
    const result = syncSubtaskRows(rows, 20, () => 'tail');
    expect(result[result.length - 1]).toEqual(empty('tail'));
    expect(normalizeSubtasks(result)).toEqual(rows);
    expect(normalizeSubtasks(syncSubtaskRows([], 20, () => 'empty'))).toEqual([]);
  });
});

// 네이티브 렌더러 없이 실제 폼 핸들러의 상태 변경·포커스 분기를 실행한다.
describe('세부 입력 폼 핸들러', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../screens/focus/TodoFormSheet.js'), 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const component = ast.program.body.find(n => n.type === 'ExportDefaultDeclaration').declaration;
  const handler = (name, bindings) => {
    const fn = component.body.body.flatMap(n => n.declarations || []).find(n => n.id.name === name).init;
    return new Function(...Object.keys(bindings), `return (${source.slice(fn.start, fn.end)});`)(...Object.values(bindings));
  };

  test('입력 변경은 자동 빈 칸을 만들되 포커스를 이동하지 않고 상한 우회도 막는다', () => {
    let rows = [{ id: 'first', text: '', done: false }];
    let sequence = 0;
    const change = handler('changeSubtaskText', {
      setSubtasks: update => { rows = update(rows); }, syncSubtaskRows,
      MAX_SUBTASKS: 20, makeSubtaskId: () => `new_${sequence++}`,
    });
    change('first', '수학');
    expect(rows).toEqual([{ id: 'first', text: '수학', done: false }, { id: 'new_0', text: '', done: false }]);
    // 중간 빈 칸을 남긴 상태에서 마지막 빈 칸들을 채워 상한에 도달한 상황.
    rows = [{ id: 'empty', text: '', done: false }, ...Array.from({ length: 20 }, (_, i) => ({ id: `full_${i}`, text: '공부', done: false }))];
    const before = rows;
    change('empty', '21번째');
    expect(rows).toBe(before);
    change('full_0', '내용 수정');
    expect(rows[1].text).toBe('내용 수정');
    change('full_0', '');
    expect(rows[1].id).toBe('full_0');
    expect(rows[rows.length - 1].text).toBe('');
  });

  test('다음 키는 바로 아래 중간 빈 칸으로 이동하며, 마지막 빈 칸에서는 키보드를 닫는다', () => {
    const focus = jest.fn();
    const dismiss = jest.fn();
    const next = handler('focusNextSubtask', {
      subtasks: [{ id: 'first', text: '수학' }, { id: 'middle', text: '' }, { id: 'last', text: '' }],
      subtaskInputs: { current: new Map([['middle', { focus }]]) }, Keyboard: { dismiss },
    });
    next('first');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
    next('last');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  test('20번째 채운 칸의 다음 키도 새 행 없이 키보드를 닫는다', () => {
    const dismiss = jest.fn();
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `row_${i}`, text: '공부' }));
    handler('focusNextSubtask', {
      subtasks: rows, subtaskInputs: { current: new Map() }, Keyboard: { dismiss },
    })('row_19');
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(20);
  });
});

test.each([true, false])('템플릿에서 수정해도 오늘 체크를 유지한다 (반복 유지=%s)', keepRepeat => {
  const template = { ...parent, id: 'template', isTemplate: true,
    repeatDays: [0, 1, 2, 3, 4, 5, 6], subtasks: normalizeSubtasks(steps, true) };
  const instance = { ...parent, templateId: template.id, createdDate: TODAY, done: true, completedAt: 1234 };
  const fields = { text: template.text, scope: template.scope, repeatDays: keepRepeat ? template.repeatDays : null,
    isTemplate: keepRepeat, subtasks: [
    { ...template.subtasks[0], text: '문제집 p12–20 풀기' },
    { id: 'new', text: '새 항목', done: false },
  ] };
  const after = editTodoInPlace([template, instance], template.id, fields, TODAY);
  const edited = after.find(t => t.id === instance.id);
  expect(edited).toMatchObject({ id: instance.id, done: true, completedAt: 1234 });
  expect(edited.subtasks).toEqual([
    { id: 'pages', text: '문제집 p12–20 풀기', done: true },
    { id: 'new', text: '새 항목', done: false },
  ]);
  if (keepRepeat) expect(after.find(t => t.isTemplate).subtasks.every(s => !s.done)).toBe(true);
  else expect(after).toHaveLength(1);
  expect(instance.subtasks).toEqual(steps);
});

test('폼의 오래된 체크 값 대신 저장 시점의 실행 항목 상태를 보존한다', () => {
  const reset = { ...parent, repeat: true, subtasks: normalizeSubtasks(steps, true) };
  const edited = editTodoInPlace([reset], parent.id, { text: parent.text, subtasks: steps }, TODAY)[0];
  expect(edited.subtasks.every(s => !s.done)).toBe(true);
});

test.each([undefined, null, 'broken', { length: 2 }, [null, 1, 'bad', {}, { id: 'bad', text: {} }]]
  .map(value => [value]))('손상된 세부 항목은 조회·토글·리셋·노트에서 안전하게 무시한다: %j', subtasks => {
  const todo = { ...parent, repeat: true, subtasks };
  expect(getSubtasks(todo)).toEqual([]);
  expect(toggleTodoSubtask([todo], todo.id, 'pages')[0]).toBe(todo);
  expect(() => applyDailyTodoReset([todo], { today: TODAY, needsReset: true })).not.toThrow();
  expect(makeNoteFromTodo(todo).body).toBe('');
});

test('읽기 헬퍼는 유효한 ID만 유지하고 데이터를 변경하거나 새 ID를 만들지 않는다', () => {
  const todo = { ...parent, subtasks: [null, steps[0], { ...steps[0], text: '중복 ID' },
    { text: 'ID 없음' }, { id: 'empty', text: ' ' }, steps[1]] };
  expect(getSubtasks(todo)).toEqual(steps);
  expect(getSubtasks(todo)[0]).toBe(steps[0]);
  expect(getSubtasks(todo)).toEqual(getSubtasks(todo));
  expect(todo.subtasks).toHaveLength(6);
  const toggled = toggleTodoSubtask([todo], todo.id, 'review')[0];
  expect(toggled.subtasks).toHaveLength(todo.subtasks.length);
  expect(toggled.subtasks.slice(0, 5)).toEqual(todo.subtasks.slice(0, 5));
  expect(toggled.subtasks[5]).toEqual({ ...steps[1], done: true });
  expect(normalizeSubtasks(toggled.subtasks).map(s => s.text)).toContain('ID 없음');
});

test('중복 ID를 체크해도 화면에 표시된 첫 유효 항목만 바꾸고 나머지는 보존한다', () => {
  const invalid = { id: 'pages', text: null, done: false };
  const duplicate = { id: 'pages', text: '복원 가능한 중복 항목', done: true };
  const todo = { ...parent, subtasks: [invalid, steps[0], duplicate, null] };
  const toggled = toggleTodoSubtask([todo], todo.id, 'pages')[0];
  expect(toggled.subtasks).toEqual([invalid, { ...steps[0], done: false }, duplicate, null]);
  expect(toggled.subtasks[0]).toBe(invalid);
  expect(toggled.subtasks[2]).toBe(duplicate);
  expect(todo.subtasks[1].done).toBe(true);
});

test('오답노트는 기존 메모 뒤에 세부 내용과 완료 상태를 보존한다', () => {
  const todo = { ...parent, memo: ' 복습 메모 ' };
  expect(makeNoteFromTodo(todo).body).toBe('복습 메모\n\n· 문제집 p12–17 풀기 (완료)\n· 전에 오답 복습하기 (미완료)');
  expect(makeNoteFromTodo(parent).body).toBe('· 문제집 p12–17 풀기 (완료)\n· 전에 오답 복습하기 (미완료)');
  expect(makeNoteFromTodo({ ...parent, memo: ' 메모 ', subtasks: [] }).body).toBe('메모');
  expect(todo.subtasks).toEqual(steps);
});

test('빈 입력은 제외하고 기존 세부 ID와 완료 상태를 보존한다', () => {
  const result = normalizeSubtasks([...steps, { text: '   ' }, null, { id: 'pages', text: ' 새 항목 ' }]);
  expect(result.slice(0, 2)).toEqual(steps);
  expect(result).toHaveLength(3);
  expect(result[2]).toMatchObject({ text: '새 항목', done: false });
  expect(new Set(result.map(s => s.id)).size).toBe(3);
  expect(normalizeSubtasks(undefined)).toEqual([]);
});

test('세부 체크는 해당 부모 아래에만 적용되고 부모 완료·통계 상태는 바꾸지 않는다', () => {
  const other = { ...parent, id: 'other' };
  const before = [parent, other];
  const after = toggleTodoSubtask(before, 'math', 'review');
  expect(after[0].subtasks.every(s => s.done)).toBe(true);
  expect(after[0].done).toBe(false);
  expect(after[1]).toBe(other);
  expect(steps[1].done).toBe(false);
  expect(toggleTodoSubtask(after, 'math', 'review')).toEqual(before);
  expect(toggleTodoSubtask(before, 'math', 'missing')).toEqual(before);
});

test('수정 시 세부 이름 변경·삭제·추가를 저장하고 부모 ID와 완료 이력을 유지한다', () => {
  const original = { ...parent, done: true, completedAt: 1234 };
  const after = editTodoInPlace([original], 'math', {
    text: '수학 공부', isTemplate: false,
    subtasks: [{ ...steps[0], text: '문제집 p12–20 풀기' }, { text: '개념 복습' }],
  }, TODAY)[0];
  expect(after).toMatchObject({ id: 'math', done: true, completedAt: 1234 });
  expect(after.subtasks).toHaveLength(2);
  expect(after.subtasks[0]).toEqual({ ...steps[0], text: '문제집 p12–20 풀기' });
  expect(after.subtasks[1]).toMatchObject({ text: '개념 복습', done: false });
  expect(editTodoInPlace([after], 'math', { text: '수학', isTemplate: false, subtasks: [] }, TODAY)[0].subtasks).toEqual([]);
  expect(original.subtasks).toEqual(steps);
});

test('메모만 수정할 때 세부 항목을 보존하고 구형 데이터도 편집할 수 있다', () => {
  expect(editTodoInPlace([parent], 'math', { text: '수학 공부', memo: '메모' }, TODAY)[0].subtasks).toEqual(steps);
  expect(editTodoInPlace([{ id: 'old', text: '영어' }], 'old', { text: '영어 복습' }, TODAY)[0].subtasks).toEqual([]);
});

test('반복 편집은 오늘 체크를 보존하고 다음날에는 수정된 항목들을 미완료로 생성한다', () => {
  const template = { ...parent, id: 'template', isTemplate: true, repeatDays: [0, 1, 2, 3, 4, 5, 6] };
  const instance = { ...parent, templateId: 'template', createdDate: TODAY };
  const editedSteps = [...steps, { id: 'concept', text: '개념 복습', done: false }];
  const edited = editTodoInPlace([template, instance], 'math', {
    text: parent.text, isTemplate: true, repeatDays: template.repeatDays, subtasks: editedSteps,
  }, TODAY);
  expect(edited.find(t => t.id === 'math').subtasks).toEqual(editedSteps);
  expect(edited.find(t => t.isTemplate).subtasks.every(s => !s.done)).toBe(true);
  const next = applyDailyTodoReset(edited, { today: '2026-10-14', needsReset: true }).todos;
  const tomorrow = next.find(t => !t.isTemplate);
  expect(tomorrow.id).not.toBe('math');
  expect(tomorrow.subtasks.map(s => s.text)).toEqual(editedSteps.map(s => s.text));
  expect(tomorrow.subtasks.every(s => !s.done)).toBe(true);
  expect(applyDailyTodoReset(next, { today: '2026-10-14', needsReset: false }).changed).toBe(false);
  expect(steps[0].done).toBe(true);
});

test('일반 미완료 항목은 다음날 체크를 보존하고 고정 반복 항목은 세부 체크를 초기화한다', () => {
  const fixed = { ...parent, id: 'fixed', repeat: true };
  const next = applyDailyTodoReset([parent, fixed], { today: TODAY, needsReset: true }).todos;
  expect(next[0]).toBe(parent);
  expect(next[1].subtasks.every(s => !s.done)).toBe(true);
});

// 실제 훅의 생성·체크·수정 경로를 실행해 UI에서 넘기는 필드가 누락되지 않는지 확인한다.
test.each([false, true])('실제 addTodo → 체크 → 수정 경로 (반복=%s)', isTemplate => {
  const source = fs.readFileSync(path.join(__dirname, '../../hooks/useAppState.js'), 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const provider = ast.program.body.find(n => n.declaration?.id?.name === 'AppProvider').declaration;
  let todos = [];
  const bindings = { generateId, getToday, normalizeSubtasks, editTodoInPlace, toggleTodoSubtask,
    setTodos: update => { todos = update(todos); } };
  const callback = name => {
    const declaration = provider.body.body.flatMap(n => n.declarations || []).find(n => n.id.name === name);
    const fn = declaration.init.arguments[0];
    return new Function(...Object.keys(bindings), `return (${source.slice(fn.start, fn.end)});`)(...Object.values(bindings));
  };
  const fields = { text: parent.text, subtasks: steps, isTemplate, repeatDays: isTemplate ? [0, 1, 2, 3, 4, 5, 6] : null };
  callback('addTodo')(fields);
  expect(todos).toHaveLength(isTemplate ? 2 : 1);
  const instance = todos.find(t => !t.isTemplate);
  expect(instance.subtasks.every(s => !s.done)).toBe(true);
  callback('toggleSubtask')(instance.id, 'pages');
  const checked = todos.find(t => t.id === instance.id);
  callback('addTodo')({ ...fields, replaceId: instance.id, subtasks: checked.subtasks, memo: '새 메모' });
  const stored = JSON.parse(JSON.stringify(todos)).find(t => t.id === instance.id);
  expect(stored.subtasks).toEqual(steps);
  expect(stored.memo).toBe('새 메모');
  expect(stored.done).toBe(false);
});
