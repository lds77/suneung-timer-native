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

// 실행 중 뽀모/연속 타이머의 남은 페이즈 전환 알림 스펙 목록 — 순수 계산부.
// 반환: [{ absMs: 발송 절대시각, title, body }] (nowMs 이후 것만, 뽀모는 최대 16개)
// 기준 시각은 resumedAt(페이즈 실제 시작) — Date.now() 기준이면 오버슈트만큼 알림이 밀린다 (불변식 2).
export const buildPhaseNotifSpecs = (timer, nowMs = Date.now()) => {
  const baseTime = timer.resumedAt || nowMs;
  const specs = [];
  if (timer.type === 'pomodoro') {
    const firstTarget = pomoPhaseTargetSec(timer);
    let absMs = baseTime + (firstTarget - (timer.elapsedSecAtResume || 0)) * 1000;
    let phase = timer.pomoPhase;
    let set = timer.pomoSet;
    let count = 0;
    while (absMs > nowMs && count < 16) {
      if (phase === 'work') {
        // 휴식 길이: 4세트마다 긴 휴식(15분) — 틱/표시/LA와 동일하게 pomoBreakMinOf 사용
        phase = (set + 1) % 4 === 0 ? 'longbreak' : 'break';
        set++;
        specs.push({ absMs, title: `${timer.label} 집중 완료!`, body: phase === 'longbreak' ? '긴 휴식이에요, 푹 쉬자!' : '기지개 한 번 펴자!' });
        absMs += pomoBreakMinOf({ pomoPhase: phase, pomoBreakMin: timer.pomoBreakMin }) * 60 * 1000;
      } else {
        specs.push({ absMs, title: `${timer.label} 휴식 끝!`, body: '다시 달려보자!' });
        phase = 'work';
        absMs += timer.pomoWorkMin * 60 * 1000;
      }
      count++;
    }
  } else if (timer.type === 'sequence') {
    const firstTarget = timer.seqPhase === 'work' ? timer.totalSec : timer.seqBreakSec;
    let absMs = baseTime + (firstTarget - (timer.elapsedSecAtResume || 0)) * 1000;
    let idx = timer.seqIndex;
    let phase = timer.seqPhase;
    while (absMs > nowMs) {
      if (phase === 'work') {
        const nextIdx = idx + 1;
        if (nextIdx >= timer.seqTotal) {
          specs.push({ absMs, title: '연속 실행 완료!', body: '모든 과목을 끝냈어!' });
          break;
        }
        if (timer.seqBreakSec > 0) {
          specs.push({ absMs, title: `${timer.seqItems[idx].label} 완료!`, body: `물 한 잔 마시고 와요 (${Math.round(timer.seqBreakSec / 60)}분)` });
        }
        phase = 'break';
        absMs += timer.seqBreakSec * 1000;
      } else {
        idx++;
        if (idx >= timer.seqTotal) break;
        const ni = timer.seqItems[idx];
        const niSec = ni.totalSec || ((ni.min || 0) * 60);
        specs.push({ absMs, title: `▶ ${ni.label} 시작!`, body: '다음 과목 시작! 집중!' });
        phase = 'work';
        absMs += niSec * 1000;
      }
    }
  }
  return specs;
};

// 연속모드 페이즈 전환 — 순수 계산부.
// 반환: {
//   kind: 'completed' | 'toBreak' | 'toWork'
//   endedPhase: 'work' | 'break'    (completed일 때 result 계산 기준: work 완주=totalSec, break 안전장치=0)
//   session: 세션 스펙 | null        (work 종료 시 기록 — focusMode/exitCount/densityOverride는 호출부가 채움)
//   notif: { title, body } | null   (즉시 발송할 알림 — 발송 여부/조건은 호출부 담당)
//   next: 다음 타이머 상태            (completed의 result/seqSessionIds는 호출부가 채움)
// }
// 세션은 5분(300초) 이상 + 쉬는시간 항목(isBreak)이 아닐 때만 (불변식 5·7).
// 연속모드 세션은 timerType 'countdown'으로 기록 (불변식 6).
export const seqFlipCore = (t, nowMs = Date.now()) => {
  if (t.seqPhase === 'work') {
    const currentItem = (t.seqItems || [])[t.seqIndex];
    const isLastItem = t.seqIndex + 1 >= t.seqTotal;
    const session = (t.elapsedSec >= 300 && !currentItem?.isBreak) ? {
      subjectId: t.subjectId, label: t.label, startedAt: t.startedAt,
      durationSec: t.totalSec, mode: 'countdown', pauseCount: t.pauseCount,
      timerType: 'countdown', completionRatio: 1,
      dedupeKey: `seq|${t.id}|${t.seqIndex}|${t.startedAt}`,
    } : null;
    if (isLastItem) {
      return {
        kind: 'completed', endedPhase: 'work', session, notif: null,
        next: { ...t, elapsedSec: 0, status: 'completed' },
      };
    }
    const nextItem = t.seqItems[t.seqIndex + 1];
    return {
      kind: 'toBreak', endedPhase: 'work', session,
      notif: nextItem ? {
        title: `${t.label} 완료!`,
        body: `다음: ${nextItem.isBreak ? `${Math.round((nextItem.totalSec || 60) / 60)}분 휴식` : nextItem.label}`,
      } : null,
      next: {
        ...t, elapsedSec: 0, seqPhase: 'break', pauseCount: 0,
        resumedAt: phaseEndAtMs(t, t.totalSec, nowMs), elapsedSecAtResume: 0,
      },
    };
  }
  // 쉬는시간 끝 → 다음 항목 시작
  const nextItem = (t.seqItems || [])[t.seqIndex + 1];
  if (!nextItem) {
    // 안전장치 (정상 흐름에선 도달하지 않음)
    return {
      kind: 'completed', endedPhase: 'break', session: null, notif: null,
      next: { ...t, status: 'completed' },
    };
  }
  const breakPhaseEndAt = phaseEndAtMs(t, t.seqBreakSec, nowMs);
  return {
    kind: 'toWork', endedPhase: 'break', session: null,
    // seqBreakSec > 0인 실제 쉬는시간 종료 시만 알림 (0이면 work→break에서 이미 발송)
    notif: t.seqBreakSec > 0 ? { title: `${nextItem.label} 시작!`, body: '집중!' } : null,
    next: {
      ...t, elapsedSec: 0, seqPhase: 'work', seqIndex: t.seqIndex + 1,
      label: nextItem.label, color: nextItem.color, totalSec: nextItem.totalSec,
      subjectId: nextItem.subjectId || null, startedAt: breakPhaseEndAt, pauseCount: 0,
      resumedAt: breakPhaseEndAt, elapsedSecAtResume: 0,
    },
  };
};
