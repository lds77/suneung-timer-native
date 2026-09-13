// 평가 대기는 세션과 같은 레코드에 저장한다. 별도 저장 키와의 복원 순서 경쟁을 피한다.
export const resultSessionId = data => data?.sessionId || data?.seqSessionIds?.slice(-1)[0] || data?.resultId;

// 기록 기준 미만의 항목만 완주해도 완료 화면은 타이머에 연결해 보존한다.
export const sequenceResultData = (timer, result, seqSessionIds) => ({
  timerId: timer.id, resultId: `sequence|${timer.id}|${timer.startedAt}`,
  label: timer.seqName || '연속모드', result, isSeq: true, seqTotal: timer.seqTotal, seqSessionIds,
});

export const enqueueResult = (sessions, data) => {
  const id = resultSessionId(data);
  if (!id) return sessions;
  return sessions.map(s => s.id === id && !s.reviewResolved && !s.pendingResult
    ? { ...s, pendingResult: data } : s);
};

export const nextPendingResult = (sessions, timers, preferredId = null) => {
  const eligible = s => {
    const data = s.pendingResult;
    if (!data) return false;
    // 뽀모도로는 공부/휴식을 진행하는 동안 보류하고 종료 후 세트별로 평가한다.
    return !data.deferUntilTimerStops || !timers.some(t =>
      t.id === data.timerId && t.startedAt === data.timerStartedAt
      && (t.status === 'running' || t.status === 'paused'));
  };
  // 이미 입력 중인 평가를 새로 종료된 뽀모도로의 오래된 세션이 밀어내지 않는다.
  const entries = [...sessions, ...timers.filter(t => t.pendingResult)];
  const entry = entries.find(s => resultSessionId(s.pendingResult) === preferredId && eligible(s)) || entries.find(eligible);
  return entry?.pendingResult || null;
};

export const updatePendingResult = (sessions, id, update) => sessions.map(s => {
  if (!s.pendingResult || resultSessionId(s.pendingResult) !== id) return s;
  const next = typeof update === 'function' ? update(s.pendingResult) : update;
  if (next) return { ...s, pendingResult: next };
  const { pendingResult, ...rest } = s;
  return { ...rest, reviewResolved: true };
});
