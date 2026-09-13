const { enqueueResult, nextPendingResult, updatePendingResult, resultSessionId } = require('../pendingResults');
const { restoreTimerCore, pomoFlipCore } = require('../timerCore');

const result = id => ({ sessionId: id, timerId: 'timer', result: { durationSec: 600 } });
const roundTrip = data => JSON.parse(JSON.stringify(data));

test('동시 완료는 모두 보관하고 한 건씩 평가/건너뛰기한다', () => {
  let sessions = [{ id: 'a' }, { id: 'b' }];
  sessions = enqueueResult(sessions, result('a'));
  sessions = enqueueResult(sessions, result('b'));
  expect(nextPendingResult(sessions, []).sessionId).toBe('a');
  sessions = updatePendingResult(sessions, 'a', null);
  expect(nextPendingResult(sessions, []).sessionId).toBe('b');
  sessions = updatePendingResult(sessions, 'b', null);
  expect(nextPendingResult(sessions, [])).toBeNull();
});

test('미평가 결과와 시간 수정값은 세션 저장/복원 후 유지된다', () => {
  let sessions = enqueueResult([{ id: 'a' }], result('a'));
  sessions = updatePendingResult(sessions, 'a', data => ({ ...data, result: { durationSec: 1200 } }));
  expect(nextPendingResult(roundTrip(sessions), []).result.durationSec).toBe(1200);
});

test('스냅샷 재처리로 평가 완료/건너뛰기한 결과가 되살아나지 않는다', () => {
  let sessions = enqueueResult([{ id: 'a' }], result('a'));
  sessions = updatePendingResult(sessions, 'a', null);
  sessions = enqueueResult(roundTrip(sessions), result('a'));
  expect(nextPendingResult(sessions, [])).toBeNull();
});

test('동일 완료 이벤트 재실행은 수정한 대기 결과를 덮어쓰지 않는다', () => {
  let sessions = enqueueResult([{ id: 'a' }], result('a'));
  sessions = updatePendingResult(sessions, 'a', data => ({ ...data, result: { durationSec: 900 } }));
  sessions = enqueueResult(sessions, result('a'));
  expect(nextPendingResult(sessions, []).result.durationSec).toBe(900);
});

test('이전에 보류된 세트가 평가 가능해져도 입력 중인 다른 결과를 밀어내지 않는다', () => {
  let sessions = enqueueResult([{ id: 'a' }, { id: 'b' }], {
    ...result('a'), deferUntilTimerStops: true, timerStartedAt: 100,
  });
  sessions = enqueueResult(sessions, result('b'));
  expect(nextPendingResult(sessions, [], 'b').sessionId).toBe('b');
  sessions = updatePendingResult(sessions, 'b', null);
  expect(nextPendingResult(sessions, [], 'b').sessionId).toBe('a');
});

test.each(['running', 'paused'])('뽀모도로 %s 중에는 보류하고 다른 완료 결과는 표시한다', status => {
  let sessions = enqueueResult([{ id: 'a' }, { id: 'b' }], {
    ...result('a'), deferUntilTimerStops: true, timerStartedAt: 100,
  });
  sessions = enqueueResult(sessions, result('b'));
  expect(nextPendingResult(sessions, [{ id: 'timer', startedAt: 100, status }]).sessionId).toBe('b');
  expect(nextPendingResult(sessions, [{ id: 'timer', startedAt: 100, status: 'completed' }]).sessionId).toBe('a');
});

test('복원 후 타이머가 없거나 새로 시작한 경우 이전 뽀모도로 평가를 표시한다', () => {
  const sessions = roundTrip(enqueueResult([{ id: 'a' }], {
    ...result('a'), deferUntilTimerStops: true, timerStartedAt: 100,
  }));
  expect(nextPendingResult(sessions, []).sessionId).toBe('a');
  expect(nextPendingResult(sessions, [{ id: 'timer', startedAt: 200, status: 'running' }]).sessionId).toBe('a');
});

test('뽀모도로 공부 완료 기록은 휴식 종료 후 개별 평가와 시간 수정 대상이 된다', () => {
  const timer = { id: 'timer', type: 'pomodoro', startedAt: 100, resumedAt: 100,
    elapsedSecAtResume: 0, pomoPhase: 'work', pomoWorkMin: 25, pomoBreakMin: 5, pomoSet: 0 };
  const { workSession, next } = pomoFlipCore(timer, 1500100);
  const sessions = enqueueResult([{ ...workSession, id: 'a' }], {
    ...result('a'), timerStartedAt: 100, deferUntilTimerStops: true,
    result: { durationSec: workSession.durationSec },
  });
  expect(nextPendingResult(sessions, [{ ...next, status: 'running' }])).toBeNull();
  const pending = nextPendingResult(roundTrip(sessions), [{ ...next, status: 'completed' }]);
  expect(pending.sessionId).toBe('a');
  expect(pending.result.durationSec).toBe(1500);
});

test('앱 종료 중 완료된 카운트다운은 복원된 기록에 평가를 연결할 수 있다', () => {
  const plan = restoreTimerCore({ type: 'countdown', status: 'running', totalSec: 600,
    elapsedSec: 100 }, 600, Date.now());
  expect(plan.kind).toBe('complete');
  expect(plan.record).toBe(true);
  const sessions = enqueueResult([{ id: 'a', durationSec: plan.durationSec }], result('a'));
  expect(nextPendingResult(roundTrip(sessions), []).sessionId).toBe('a');
});

test('연속모드 묶음은 마지막 세션에 연결되고 기록 삭제 시 대기도 제거된다', () => {
  const data = { seqSessionIds: ['a', 'b'], isSeq: true };
  expect(resultSessionId(data)).toBe('b');
  const sessions = enqueueResult([{ id: 'a' }, { id: 'b' }], data);
  expect(nextPendingResult(sessions, [])).toEqual(data);
  expect(nextPendingResult(sessions.filter(s => s.id !== 'b'), [])).toBeNull();
});

test('기존 기록이나 5분 미만으로 모달 등록이 생략된 기록은 자동 평가 대상으로 만들지 않는다', () => {
  expect(nextPendingResult([{ id: 'old', durationSec: 600 }, { id: 'short', durationSec: 30 }], [])).toBeNull();
});
