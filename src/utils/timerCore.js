// src/utils/timerCore.js — 타이머 핵심 계산 (순수 함수, 부수효과 없음)
//
// useAppState.js에서 분리한 데이터 정확성의 핵심부. CLAUDE.md '타이머·세션 불변식'의
// 1(벽시계 기준 경과), 2(페이즈 전환 시각은 resumedAt 기반), 3(dedupeKey 규칙)이 여기 구현되어 있다.
// 이 파일은 React/RN에 의존하지 않으므로 Jest로 직접 검증한다 (__tests__/timerCore.test.js).
//
// 부수효과(세션 기록, 진동, 알림, 모달)는 호출부(useAppState)가 반환값을 해석해서 수행한다.

import { pomoBreakMinOf, pomoPhaseTargetSec } from './pomo';

// 벽시계 기준 실제 경과 초 (정수, 틱과 동일 규칙).
// elapsedSec 필드는 표시용 캐시일 뿐 — 경과는 항상 이 함수로 계산해야 백그라운드에서 안 어긋난다.
export const wallElapsedSec = (t, nowMs = Date.now()) =>
  t.resumedAt
    ? (t.elapsedSecAtResume || 0) + Math.floor((nowMs - t.resumedAt) / 1000)
    : t.elapsedSec;

// 실제 남은 초 정밀 계산 (소수점 포함 — 알림 예약용).
// countdown은 전체 목표, pomodoro는 현재 페이즈 목표 기준. 그 외 타입은 0.
export const realRemainingSec = (t, nowMs = Date.now()) => {
  const realElapsedSec = t.resumedAt
    ? (t.elapsedSecAtResume || 0) + (nowMs - t.resumedAt) / 1000
    : t.elapsedSec;
  if (t.type === 'countdown') return Math.max(0, t.totalSec - realElapsedSec);
  if (t.type === 'pomodoro') return Math.max(0, pomoPhaseTargetSec(t) - realElapsedSec);
  return 0;
};

// 현재 페이즈의 정확한 종료 시각(ms) — Date.now()가 아니라 resumedAt 기반.
// 틱은 페이즈 목표를 지나친 뒤(오버슈트) 실행되므로, Date.now()를 쓰면 매 전환마다
// 오버슈트가 다음 페이즈 시작점에 누적된다. 종료 시각을 역산하면 누적이 없다.
export const phaseEndAtMs = (t, targetSec, nowMs = Date.now()) =>
  (t.resumedAt || nowMs) + (targetSec - (t.elapsedSecAtResume || 0)) * 1000;

// 뽀모도로 페이즈 전환 — 순수 계산부.
// 반환: {
//   endedPhase: 'work' | 'break'   (방금 끝난 페이즈 — 진동 패턴 선택용)
//   workSession: 세션 스펙 | null   (work 종료 시 기록할 세션 — focusMode/exitCount는 호출부가 채움)
//   next: 다음 타이머 상태
// }
export const pomoFlipCore = (t, nowMs = Date.now()) => {
  if (t.pomoPhase === 'work') {
    const workSession = {
      subjectId: t.subjectId, label: t.label,
      startedAt: nowMs - t.pomoWorkMin * 60 * 1000,
      durationSec: t.pomoWorkMin * 60, mode: 'pomodoro',
      pauseCount: t.pauseCount, timerType: 'pomodoro',
      pomoSets: t.pomoSet + 1,
      dedupeKey: `pomo|${t.id}|${t.startedAt}|${t.pomoSet}`,
    };
    const workPhaseEndAt = phaseEndAtMs(t, t.pomoWorkMin * 60, nowMs);
    return {
      endedPhase: 'work',
      workSession,
      next: {
        ...t, elapsedSec: 0,
        pomoPhase: (t.pomoSet + 1) % 4 === 0 ? 'longbreak' : 'break',
        pomoSet: t.pomoSet + 1, pauseCount: 0,
        resumedAt: workPhaseEndAt, elapsedSecAtResume: 0,
      },
    };
  }
  // 휴식(break/longbreak) 끝 → 다음 work. 긴 휴식 길이는 pomoBreakMinOf가 처리(4세트마다 15분)
  const breakPhaseEndAt = phaseEndAtMs(t, pomoBreakMinOf(t) * 60, nowMs);
  return {
    endedPhase: 'break',
    workSession: null,
    next: {
      ...t, elapsedSec: 0, pomoPhase: 'work', pauseCount: 0,
      resumedAt: breakPhaseEndAt, elapsedSecAtResume: 0,
    },
  };
};
