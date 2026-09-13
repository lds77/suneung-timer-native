// RN 렌더러 없이 실제 AppProvider 콜백을 실행한다. 계산 함수를 재구현하지 않고
// AST로 콜백만 가져와 네이티브/React 상태 경계에 테스트 대역을 주입한다.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const source = fs.readFileSync(path.join(__dirname, '../../hooks/useAppState.js'), 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
const provider = ast.program.body.find(n => n.declaration?.id?.name === 'AppProvider').declaration;
const callback = (name, bindings) => {
  const declaration = provider.body.body.flatMap(n => n.declarations || []).find(n => n.id.name === name);
  const fn = declaration.init.type === 'CallExpression' ? declaration.init.arguments[0] : declaration.init;
  return new Function(...Object.keys(bindings), `return (${source.slice(fn.start, fn.end)});`)(...Object.values(bindings));
};
const { seqFlipCore, pomoFlipCore, restoreTimerCore, calcTimerResult, buildSessionRecord } = require('../timerCore');
const { sequenceResultData, nextPendingResult, resultSessionId, updatePendingResult } = require('../pendingResults');

test.each([true, false])('실제 seqFlip: 짧은 항목 완료 결과 보존 (skipNotif=%s)', skipNotif => {
  const record = jest.fn();
  const enqueue = jest.fn();
  const vibrate = jest.fn();
  const flip = callback('seqFlip', {
    seqFlipCore, sequenceResultData, focusModeRef: { current: 'screen_off' }, ultraRef: { current: {} },
    calcResult: calcTimerResult, recordSessionInternal: record, setCompletedResultData: enqueue,
    phaseNotifMap: { current: new Map() },
    settingsRef: { current: { notifEnabled: true } }, Vibration: { vibrate },
  });
  const timer = { id: 'seq', type: 'sequence', startedAt: 100, resumedAt: 100,
    elapsedSecAtResume: 0, elapsedSec: 60, seqPhase: 'work', seqIndex: 1,
    seqTotal: 2, totalSec: 60, seqBreakSec: 0, seqSessionIds: [],
    seqItems: [{ label: 'A', totalSec: 60 }, { label: 'B', totalSec: 60 }] };
  const completed = flip(timer, skipNotif);
  expect(vibrate).toHaveBeenCalledTimes(skipNotif ? 0 : 1);
  expect(record).not.toHaveBeenCalled();
  expect(enqueue).not.toHaveBeenCalled();
  expect(completed.status).toBe('completed');
  const timers = JSON.parse(JSON.stringify([completed]));
  const payload = nextPendingResult([], timers);
  expect(resultSessionId(payload)).toBeTruthy();
  expect(payload.seqSessionIds).toEqual([]);
  expect(nextPendingResult([], updatePendingResult(timers, resultSessionId(payload), null))).toBeNull();
});

// payload의 ID가 단지 truthy인 데서 그치지 않고 실제 생성된 기록을 가리키는지 확인.
const completionBindings = timer => {
  const records = [];
  const enqueue = jest.fn();
  const timersRef = { current: [timer] };
  return {
    records, enqueue, timersRef,
    bindings: {
      timersRef, setTimers: update => { timersRef.current = update(timersRef.current); },
      recordSessionInternal: spec => {
        const record = buildSessionRecord(spec);
        records.push(record);
        return record.id;
      },
      setCompletedResultData: enqueue, calcResult: calcTimerResult,
      focusModeRef: { current: 'screen_off' }, ultraRef: { current: {} },
      RESULT_MODAL_MIN_SEC: 300, cancelTimerNotif: jest.fn(), stopFeedbackToast: jest.fn(),
      planResultExtras: () => ({}),
    },
  };
};
const expectLinkedResult = harness => {
  expect(harness.enqueue).toHaveBeenCalledTimes(1);
  const payload = harness.enqueue.mock.calls[0][0];
  const id = resultSessionId(payload);
  expect(id).toBeTruthy();
  expect(harness.records.some(s => s.id === id)).toBe(true);
  return payload;
};

test('실제 pomoFlip: 공부 구간의 기록 ID와 종료까지 보류 조건이 연결된다', () => {
  const timer = { id: 'pomo', type: 'pomodoro', startedAt: 100, resumedAt: 100,
    pomoPhase: 'work', pomoWorkMin: 25, pomoBreakMin: 5, pomoSet: 0, pauseCount: 0 };
  const harness = completionBindings(timer);
  const vibrate = jest.fn();
  const next = callback('pomoFlip', { ...harness.bindings, pomoFlipCore,
    settingsRef: { current: { notifEnabled: true } }, Vibration: { vibrate } })(timer, false);
  const payload = expectLinkedResult(harness);
  expect(payload.deferUntilTimerStops).toBe(true);
  expect(payload.timerStartedAt).toBe(timer.startedAt);
  expect(next.pomoPhase).toBe('break');
  expect(vibrate).toHaveBeenCalledTimes(1);
});

test.each(['stopTimer', 'removeTimer'])('실제 %s: 종료 기록에 유효한 평가 ID를 연결한다', name => {
  const timer = { id: 'timer', type: 'countdown', status: 'running', startedAt: 100,
    elapsedSec: 600, totalSec: 1200, pauseCount: 0, todoId: 'todo' };
  const harness = completionBindings(timer);
  callback(name, harness.bindings)(timer.id);
  const payload = expectLinkedResult(harness);
  expect(payload.todoId).toBe('todo');
  expect(payload.result.durationSec).toBe(600);
});

test('실제 stopTimer: 30초 이상 5분 미만 할 일은 기록만 저장한다', () => {
  const timer = { id: 'timer', type: 'countdown', status: 'running', startedAt: 100,
    elapsedSec: 120, totalSec: 600, pauseCount: 0, todoId: 'todo' };
  const harness = completionBindings(timer);
  callback('stopTimer', harness.bindings)(timer.id);
  expect(harness.records).toHaveLength(1);
  expect(harness.enqueue).not.toHaveBeenCalled();
});

test('실제 콜드스타트 restored.map 콜백: 완료 복원 기록에 평가 ID를 연결한다', () => {
  // 초기 로드 effect 안의 실제 map 콜백을 추출한다. 경로가 없어지면 명시적으로 실패한다.
  const findRestored = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'VariableDeclarator' && node.id.name === 'restored') return node;
    for (const value of Object.values(node)) {
      if (!value || typeof value !== 'object') continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        const found = findRestored(child);
        if (found) return found;
      }
    }
    return null;
  };
  const declaration = findRestored(provider);
  expect(declaration).not.toBeNull();
  const fn = declaration.init.callee.object.arguments[0]; // activeTimers.map(callback).filter(Boolean)
  expect(fn.type).toBe('ArrowFunctionExpression');
  const timer = { id: 'timer', type: 'countdown', status: 'running', startedAt: 100,
    elapsedSec: 100, totalSec: 600, pauseCount: 0, todoId: 'todo' };
  const harness = completionBindings(timer);
  const bindings = { ...harness.bindings, restoreTimerCore, calcTimerResult,
    gap: 600, now: 700100, mergedSettings: { schoolLevel: 'high' }, showToastCustom: jest.fn() };
  const restore = new Function(...Object.keys(bindings), `return (${source.slice(fn.start, fn.end)});`)(...Object.values(bindings));
  expect(restore(timer)).toBeNull();
  expect(expectLinkedResult(harness).result.durationSec).toBe(600);
});

test('콜드스타트 screen_off 복원은 exam 설정이어도 저장/모달 밀도가 일치한다', () => {
  const timer = { type: 'countdown', totalSec: 600, elapsedSec: 600, pauseCount: 0 };
  const session = buildSessionRecord({ durationSec: 600, timerType: 'countdown',
    completionRatio: 1, focusMode: 'screen_off' }, { schoolLevel: 'high', ultraFocusLevel: 'exam' });
  const result = calcTimerResult(timer, 600, { focusMode: 'screen_off', schoolLevel: 'high' });
  expect(result.density).toBe(session.focusDensity);
});

test('실제 시간 수정 콜백: 중복 호출/복원 후 재수정과 삭제를 막는다', () => {
  let sessions = [{ id: 's', subjectId: 'sub', durationSec: 600 }];
  let subjects = [{ id: 'sub', totalElapsedSec: 600 }];
  const ref = { current: sessions };
  const bindings = { sessionsRef: ref,
    setSessions: update => { sessions = update(sessions); ref.current = sessions; },
    setSubjects: update => { subjects = update(subjects); } };
  const edit = callback('updateSessionDuration', bindings);
  expect(edit('s', 1200)).toBe(true);
  expect(edit('s', 1800)).toBe(false);
  expect(subjects[0].totalElapsedSec).toBe(1200);
  sessions = JSON.parse(JSON.stringify(sessions));
  ref.current = sessions;
  expect(callback('updateSessionDuration', bindings)('s', 900)).toBe(false);
  callback('deleteSessions', bindings)(['s']);
  expect(sessions).toHaveLength(1);
});

// 복원 플래그는 loading과 분리돼 있어야 한다. loading을 쓰면 App.js의 app.loading 분기가
// 화면 전체를 언마운트해 보고 있던 탭이 초기화된다. setLoading을 바인딩에서 빼 두었으므로
// 콜백이 loading을 다시 건드리면 ReferenceError로 시끄럽게 실패한다.
const restoreCallbacks = timers => {
  const timersRef = { current: timers };
  const setRestoring = jest.fn();
  const saveRef = { current: 42 };
  const cleared = [];
  const canRestoreBackup = callback('canRestoreBackup', { timersRef });
  const begin = callback('beginBackupRestore', { canRestoreBackup, setRestoring, saveRef,
    clearTimeout: id => cleared.push(id) });
  const finish = callback('finishBackupRestore', { setRestoring });
  return { begin, finish, setRestoring, cleared };
};

test.each(['running', 'paused'])('실제 복원 시작 콜백: %s 타이머가 있으면 저장 변경 전에 거부한다', status => {
  const { begin, setRestoring, cleared } = restoreCallbacks([{ status }]);
  expect(begin()).toBe(false);
  expect(setRestoring).not.toHaveBeenCalled();
  expect(cleared).toEqual([]);
});

test('실제 복원 시작/종료 콜백: 화면이 아니라 복원 플래그만 세우고 성공·실패 모두 해제한다', () => {
  const { begin, finish, setRestoring, cleared } = restoreCallbacks([{ status: 'completed' }]);
  expect(begin()).toBe(true);
  expect(setRestoring).toHaveBeenCalledWith(true);
  expect(cleared).toEqual([42]); // 예약된 자동 저장 디바운스를 먼저 취소한다
  finish();
  expect(setRestoring).toHaveBeenLastCalledWith(false);
});

test('실제 reloadAllData: 복원 전 dedupe id를 폐기하고 복원 세션을 ref에도 반영한다', async () => {
  const restored = [{ id: 'restored' }];
  const sessionDedupeRef = { current: new Map([['key', 'old-session']]) };
  const sessionsRef = { current: [{ id: 'old-session' }] };
  const bindings = { sessionDedupeRef, sessionsRef, DEFAULT_SETTINGS: {} };
  for (const name of ['Settings', 'Subjects', 'Sessions', 'DDays', 'Todos', 'CountupFavs', 'Favs',
    'TodoLog', 'WeeklySchedule', 'ReviewNotes']) {
    bindings[`load${name}`] = async () => name === 'Sessions' ? restored : [];
    bindings[`set${name}`] = jest.fn();
  }
  bindings.setTimers = jest.fn();
  await callback('reloadAllData', bindings)();
  expect(sessionDedupeRef.current.size).toBe(0);
  expect(sessionsRef.current).toBe(restored);
  expect(bindings.setSessions).toHaveBeenCalledWith(restored);
  expect(bindings.setTimers).toHaveBeenCalledWith([]);
  expect(bindings.setFavs).toHaveBeenCalledWith([]); // 비어 있는 백업도 기존 즐겨찾기를 지운다.
});

test('실제 addTodo 편집 경로: 반복 실행 항목의 ID를 템플릿으로 바꾸지 않는다', () => {
  const { editTodoInPlace } = require('../todoUtils');
  const fields = { text: '복습', isTemplate: true, repeatDays: [0, 1, 2, 3, 4, 5, 6] };
  let todos = [{ ...fields, id: 'template' }, { ...fields, id: 'instance',
    isTemplate: false, templateId: 'template', done: true }];
  const add = callback('addTodo', { editTodoInPlace, setTodos: fn => { todos = fn(todos); } });
  add({ ...fields, memo: '수정', replaceId: 'instance' });
  expect(todos).toHaveLength(2);
  expect(todos.find(t => t.id === 'instance')).toMatchObject({ isTemplate: false, done: true, memo: '수정' });
});

test('실제 리마인더 effect: 전체 알림 OFF→ON만 변경해도 예약이 돌아온다', async () => {
  jest.useFakeTimers();
  try {
    const { getToday, toDateStr } = require('../format');
    let settings = { notifEnabled: true, dailyReminderEnabled: true, dailyReminderHour: 20,
      dailyReminderMin: 0, streakReminderEnabled: false, streak: 0 };
    const settingsRef = { current: settings };
    const Notifications = { cancelScheduledNotificationAsync: jest.fn(async () => {}),
      scheduleNotificationAsync: jest.fn(async () => {}), SchedulableTriggerInputTypes: { DATE: 'date' } };
    const scheduleStudyReminders = callback('scheduleStudyReminders', { settingsRef,
      sessionsRef: { current: [] }, Notifications, getToday, toDateStr, Platform: { OS: 'android' } });
    const node = provider.body.body.find(n => n.type === 'ExpressionStatement'
      && n.expression.callee?.name === 'useEffect'
      && source.slice(n.start, n.end).includes('scheduleStudyReminders();')).expression;
    const fn = node.arguments[0];
    const deps = node.arguments[1];
    const effect = new Function('loading', 'studyReminderDebounceRef', 'scheduleStudyReminders',
      `return (${source.slice(fn.start, fn.end)});`)(false, { current: null }, scheduleStudyReminders);
    const dependencies = new Function('settings', 'sessions', 'loading', `return (${source.slice(deps.start, deps.end)});`);
    let previous;
    let cleanup;
    const renderEffect = () => {
      const current = dependencies(settings, [], false);
      if (!previous || current.some((value, i) => !Object.is(value, previous[i]))) {
        cleanup?.(); cleanup = effect(); previous = current;
      }
    };
    renderEffect();
    await jest.advanceTimersByTimeAsync(2000);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    settings = { ...settings, notifEnabled: false }; settingsRef.current = settings;
    renderEffect();
    await jest.advanceTimersByTimeAsync(2000);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    settings = { ...settings, notifEnabled: true }; settingsRef.current = settings;
    renderEffect();
    await jest.advanceTimersByTimeAsync(2000);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.scheduleNotificationAsync.mock.calls[1][0].identifier).toBe('reminder-daily');
    cleanup?.();
  } finally {
    jest.useRealTimers();
  }
});
