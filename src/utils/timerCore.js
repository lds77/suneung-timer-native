// src/utils/timerCore.js — 타이머 핵심 계산 (순수 함수, 부수효과 없음)
//
// useAppState.js에서 분리한 데이터 정확성의 핵심부. CLAUDE.md '타이머·세션 불변식'의
// 1(벽시계 기준 경과), 2(페이즈 전환 시각은 resumedAt 기반), 3(dedupeKey 규칙)이 여기 구현되어 있다.
// 이 파일은 React/RN에 의존하지 않으므로 Jest로 직접 검증한다 (__tests__/timerCore.test.js).
//
// 부수효과(세션 기록, 진동, 알림, 모달)는 호출부(useAppState)가 반환값을 해석해서 수행한다.

import { pomoBreakMinOf, pomoPhaseTargetSec } from './pomo';
import { calculateDensity } from './density';
import { getTier } from '../constants/presets';
import { toDateStr, generateId } from './format';

// 벽시계 기준 실제 경과 초 (정수, 틱과 동일 규칙).
// elapsedSec 필드는 표시용 캐시일 뿐 — 경과는 항상 이 함수로 계산해야 백그라운드에서 안 어긋난다.
export const wallElapsedSec = (t, nowMs = Date.now()) =>
  t.resumedAt
    ? (t.elapsedSecAtResume || 0) + Math.floor((nowMs - t.resumedAt) / 1000)
    : t.elapsedSec;

// 카운트업(자유/랩) 상한 — 도달 시 카운트다운 완료와 동일하게 자동 종료.
// 잊힌 타이머 방어: 방치된 카운트업이 수백 시간짜리 세션으로 기록되면 통계가 오염된다
// (2026-07 아이패드 311시간 방치 사례). 일시정지 시간은 경과에 포함되지 않으므로
// 실공부 중 밥/화장실 일시정지 사용자는 상한에 실질적으로 닿지 않는다.
export const COUNTUP_MAX_SEC = 5 * 60 * 60;

// 실제 남은 초 정밀 계산 (소수점 포함 — 알림 예약용).
// countdown은 전체 목표, pomodoro는 현재 페이즈 목표, 자유/랩은 상한(COUNTUP_MAX_SEC) 기준.
// sequence는 0 (페이즈 알림은 buildPhaseNotifSpecs가 별도 계산).
export const realRemainingSec = (t, nowMs = Date.now()) => {
  const realElapsedSec = t.resumedAt
    ? (t.elapsedSecAtResume || 0) + (nowMs - t.resumedAt) / 1000
    : t.elapsedSec;
  if (t.type === 'countdown') return Math.max(0, t.totalSec - realElapsedSec);
  if (t.type === 'pomodoro') return Math.max(0, pomoPhaseTargetSec(t) - realElapsedSec);
  if (t.type === 'free' || t.type === 'lap') return Math.max(0, COUNTUP_MAX_SEC - realElapsedSec);
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
    const workPhaseEndAt = phaseEndAtMs(t, t.pomoWorkMin * 60, nowMs);
    const workSession = {
      subjectId: t.subjectId, label: t.label,
      // 페이즈 실제 종료 시각 기준 역산 — nowMs 기준이면 bg/복원 캐치업 플립에서
      // 몇 시간 전 세트가 전부 '지금' 시각으로 기록됨 (자정 걸치면 날짜 귀속도 틀어짐)
      startedAt: workPhaseEndAt - t.pomoWorkMin * 60 * 1000,
      durationSec: t.pomoWorkMin * 60, mode: 'pomodoro',
      pauseCount: t.pauseCount, timerType: 'pomodoro',
      pomoSets: t.pomoSet + 1,
      dedupeKey: `pomo|${t.id}|${t.startedAt}|${t.pomoSet}`,
    };
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

// 타이머 완료/종료 시 결과(밀도·티어·인증) 계산 — 순수 계산부.
// focusMode/exitCount/ultraFocusLevel 게이팅(screen_on일 때만 반영)은 호출부 책임.
// 연속모드는 전체 항목 합산 + countdown 기준으로 계산 (불변식 6).
export const calcTimerResult = (t, dur, { focusMode = 'screen_off', exitCount = 0, schoolLevel = 'high', ultraFocusLevel = 'normal' } = {}) => {
  let timerType = t.type;
  let totalSec = dur;
  let completionRatio = t.type === 'countdown' ? Math.min(1, dur / Math.max(1, t.totalSec)) : 1;
  if (t.type === 'sequence') {
    timerType = 'countdown';
    totalSec = (t.seqItems || []).reduce((s, it) => s + (it.totalSec || 0), 0);
    completionRatio = Math.min(1, ((t.seqIndex || 0) + 1) / Math.max(1, t.seqTotal || 1));
  }
  const densityInputs = {
    pausedCount: t.pauseCount, totalSec,
    timerType, completionRatio,
    pomoSets: t.pomoSet || 0, focusMode,
    exitCount, schoolLevel, ultraFocusLevel,
  };
  const d = calculateDensity(densityInputs);
  return {
    density: d, tier: getTier(d), focusMode, exitCount,
    verified: focusMode === 'screen_on' && exitCount === 0,
    durationSec: totalSec,
    densityInputs, // 결과 모달 점수 상세(getDensityBreakdown)용 — selfRating은 표시 시점에 합성
  };
};

// 세션 레코드 생성 — 순수 계산부 (id 생성 제외하면 결정적).
// 불변식 4: date는 '시작한 날' 기준 (자정 걸친 세션은 시작일 귀속).
// endedAt = startedAt + durationSec (Date.now()면 일시정지/백그라운드 때문에 집중시간과 어긋남).
export const buildSessionRecord = (spec, ctx = {}) => {
  const {
    subjectId = null, label = '', startedAt = null, durationSec, mode = 'free',
    pauseCount = 0, memo = '', exitCount = 0, focusMode: fm = 'screen_off',
    timerType = 'free', completionRatio = 1, pomoSets = 0, selfRating = null,
    planId = null, todoId = null, densityOverride = null, dedupeKey = null,
  } = spec;
  const { schoolLevel = 'high', ultraFocusLevel = 'normal', nowMs = Date.now() } = ctx;
  const density = densityOverride ?? calculateDensity({
    pausedCount: pauseCount, totalSec: durationSec, timerType, completionRatio, pomoSets,
    focusMode: fm, exitCount, selfRating,
    schoolLevel,
    ultraFocusLevel: fm === 'screen_on' ? ultraFocusLevel : 'normal',
  });
  const sessStart = startedAt ?? nowMs - durationSec * 1000;
  return {
    id: generateId('sess_'), date: toDateStr(new Date(sessStart)), subjectId, label: label.trim(),
    startedAt: sessStart, endedAt: sessStart + durationSec * 1000,
    durationSec, mode, focusDensity: density, tier: getTier(density).id,
    pausedCount: pauseCount, exitCount, focusMode: fm,
    verified: fm === 'screen_on' && exitCount === 0,
    selfRating, memo: memo.trim(), planId: planId || null, todoId: todoId || null,
    schoolLevel,
    ultraFocusLevel: fm === 'screen_on' ? ultraFocusLevel : null,
    timerType, completionRatio, pomoSets,
    // 레코드에 보존 — 인메모리 dedupe 맵은 앱 재시작에 유실되므로,
    // 스냅샷 복원 캐치업이 같은 세트/항목을 재기록하는 걸 영속 키로 막는다
    dedupeKey,
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

// ─── 콜드스타트 스냅샷 복원 (불변식 8·9의 복원 경로) ───
// 강제종료 후 재실행 시 스냅샷 타이머 하나를 어떻게 살릴지 결정하는 순수 함수.
// 부수효과 없음 — 호출부(useAppState)가 kind에 따라 세션 기록/토스트/페이즈 전진을 수행한다.
//   gapSec: 스냅샷 저장 시각 ~ 지금 사이의 경과 초 (running만 가산)
// 반환 kind:
//   'complete'    죽어 있는 동안 목표/상한 도달 → 타이머 제거. record면 세션 기록
//                 (durationSec/timerType 포함, dedupe는 호출부가 complete|id|startedAt).
//                 capped=true는 카운트업 5시간 상한 (토스트 문구 구분용)
//   'fastforward' running 뽀모/연속 — timer.elapsedSec에 벽시계 경과를 넣었으니
//                 호출부가 fastForwardPhases(중간 세션 기록 포함)로 페이즈를 전진시킬 것
//   'resume'      running 유지 — resumedAt을 지금으로 재앵커한 timer 반환
//   'pause'       paused 유지 — resumedAt null로 정리한 timer 반환
export const restoreTimerCore = (t, gapSec, nowMs = Date.now()) => {
  const addedSec = t.status === 'running' ? gapSec : 0;
  const newElapsed = t.elapsedSec + addedSec;
  if (t.type === 'countdown') {
    const e = Math.min(newElapsed, t.totalSec);
    if (e >= t.totalSec) {
      // 불변식 7: 5분(계획·할일 연결 시 30초) 미만은 미기록
      const record = t.totalSec >= 300 || (!!(t.planId || t.todoId) && t.totalSec >= 30);
      return { kind: 'complete', record, durationSec: t.totalSec, timerType: 'countdown', capped: false };
    }
    if (t.status === 'running') return { kind: 'resume', timer: { ...t, elapsedSec: e, status: 'running', resumedAt: nowMs, elapsedSecAtResume: e } };
    return { kind: 'pause', timer: { ...t, elapsedSec: e, status: 'paused', resumedAt: null, elapsedSecAtResume: e } };
  }
  // 불변식 9: 카운트업 상한 — 자유는 기록 후 제거, 랩은 조용히 제거. paused는 상한 미적용(경과 정지 상태)
  if ((t.type === 'free' || t.type === 'lap') && t.status === 'running' && newElapsed >= COUNTUP_MAX_SEC) {
    return { kind: 'complete', record: t.type === 'free', durationSec: COUNTUP_MAX_SEC, timerType: 'free', capped: true };
  }
  if (t.status === 'running') {
    // 뽀모/연속: stale 페이즈로 재앵커하면 페이즈 알림 스펙이 0개가 되고 틱 캐치업이 페이즈마다
    // 진동을 울린다 → 벽시계 경과(resumedAt은 epoch라 프로세스가 죽어도 유효)로 전진 대상 표시
    if ((t.type === 'pomodoro' || t.type === 'sequence') && t.resumedAt) {
      const wallElapsed = (t.elapsedSecAtResume || 0) + Math.floor((nowMs - t.resumedAt) / 1000);
      return { kind: 'fastforward', timer: { ...t, elapsedSec: wallElapsed } };
    }
    return { kind: 'resume', timer: { ...t, elapsedSec: newElapsed, status: 'running', resumedAt: nowMs, elapsedSecAtResume: newElapsed } };
  }
  return { kind: 'pause', timer: { ...t, elapsedSec: newElapsed, status: 'paused', resumedAt: null, elapsedSecAtResume: newElapsed } };
};
