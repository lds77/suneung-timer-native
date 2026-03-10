// src/utils/density.js
// 집중 밀도 점수 계산 엔진 v7

import { getTier } from '../constants/presets';

/**
 * 집중밀도 공식 v7 (최대 103점)
 * — 학교급별 지속력/자유모드 기준 차별화
 *
 * ━━━ 학교급별 기준 시간 ━━━
 *   초등 저학년 (elementary_lower): 지속력 만점 20분, 자유모드 만점 25분
 *   초등 고학년 (elementary_upper): 지속력 만점 30분, 자유모드 만점 40분
 *   중등        (middle):           지속력 만점 60분, 자유모드 만점 80분
 *   고등/수능/대학/기타:             지속력 만점 90분, 자유모드 만점 120분 (현재 기준)
 *
 * ━━━ 완료 점수 (0~40) ━━━
 *   카운트다운 완료              = 40   ← 완료율 기반, 학교급 무관 (이미 공평)
 *   카운트다운 80%+ 중지         = 36
 *   카운트다운 50%+ 중지         = 32
 *   카운트다운 50% 미만 중지     = 28
 *   뽀모도로 1세트 완료          = 35   ← 세트 기반, 학교급 무관
 *   뽀모도로 2세트+              = 40
 *   자유모드 (학교급별 시간 기준 — 아래 getFreeCompletionScore 참고)
 *
 * ━━━ 습관 점수 (0~30) ━━━
 *   일시정지 0회 = 30
 *   1회 = 25, 2회 = 20, 3회 = 15, 4회+ = 10
 *
 * ━━━ 지속력 보너스 (0~15) — 학교급별 ━━━
 *   초등 저학년: 2/3/7/13/20분+ → +3/+6/+9/+12/+15
 *   초등 고학년: 3/5/10/20/30분+ → +3/+6/+9/+12/+15
 *   중등:        7/10/20/40/60분+ → +3/+6/+9/+12/+15
 *   고등/기타:  10/15/30/60/90분+ → +3/+6/+9/+12/+15
 *
 * ━━━ 선언 보너스 (0~15) ━━━
 *   📖 편하게 공부 모드 완료(100%)  = +5
 *   📖 편하게 공부 모드 80%+ 중지   = +3
 *   📖 편하게 공부 모드 50%+ 중지   = +2
 *   📖 편하게 공부 모드 50% 미만    = 0
 *   📖 편하게 공부 자유/뽀모 완료   = +5
 *   🔥 집중 도전 모드 이탈 0회      = +15 (Verified!)
 *   🔥 집중 도전 모드 이탈 1~2회    = +8
 *   🔥 집중 도전 모드 이탈 3회+     = +3
 *
 * ━━━ 자가평가 보너스 (0~+3) ━━━
 *   🔥 또는 ⚡ 선택 시           = +3
 *   😐 선택 시                  = +0
 *   😴 선택 시                  = +0  (패널티 제거 — 솔직한 선택 존중)
 *   선택 안 함                  = +0
 *
 * 최저 보장: 56점 (C등급 이상 보장)
 * 이론 최대: 40+30+15+15+3 = 103
 */

/**
 * schoolLevel → 'elem_lower' | 'elem_upper' | 'mid' | 'high'
 *   elementary_lower → 'elem_lower' (초등 저학년 1~3학년)
 *   elementary_upper → 'elem_upper' (초등 고학년 4~6학년)
 *   middle           → 'mid'
 *   그 외            → 'high' (고등/수능/대학/공시생 등, 현재 기준)
 */
const getSchoolTier = (schoolLevel) => {
  if (schoolLevel === 'elementary_lower') return 'elem_lower';
  if (schoolLevel === 'elementary_upper') return 'elem_upper';
  if (schoolLevel === 'middle') return 'mid';
  return 'high';
};

/**
 * 자유모드(카운트업) 완료점수 — 학교급별 시간 기준 적용
 * 카운트다운/포모도로는 완료율·세트 기반이므로 학교급 무관
 */
const getFreeCompletionScore = (totalMin, tier) => {
  if (tier === 'elem_lower') {
    // 만점 기준: 25분 (지속력 만점 20분의 1.25배)
    if (totalMin >= 25) return 40;
    if (totalMin >= 13) return 35;
    if (totalMin >= 7)  return 28;
    if (totalMin >= 2)  return 20;
    if (totalMin >= 1)  return 15;
    return 10;
  }
  if (tier === 'elem_upper') {
    // 만점 기준: 40분 (지속력 만점 30분의 1.33배)
    if (totalMin >= 40) return 40;
    if (totalMin >= 20) return 35;
    if (totalMin >= 10) return 28;
    if (totalMin >= 5)  return 20;
    if (totalMin >= 2)  return 15;
    return 10;
  }
  if (tier === 'mid') {
    // 만점 기준: 80분 (지속력 만점 60분의 1.33배)
    if (totalMin >= 80) return 40;
    if (totalMin >= 40) return 35;
    if (totalMin >= 20) return 28;
    if (totalMin >= 7)  return 20;
    if (totalMin >= 3)  return 15;
    return 10;
  }
  // high (default) — 만점 기준: 120분 (지속력 만점 90분의 1.33배)
  if (totalMin >= 120) return 40;
  if (totalMin >= 60)  return 35;
  if (totalMin >= 30)  return 28;
  if (totalMin >= 10)  return 20;
  if (totalMin >= 5)   return 15;
  return 10;
};

/**
 * 지속력 보너스 — 학교급별 시간 기준 적용
 */
const getPersistenceBonus = (totalMin, tier) => {
  if (tier === 'elem_lower') {
    if (totalMin >= 20) return 15;
    if (totalMin >= 13) return 12;
    if (totalMin >= 7)  return 9;
    if (totalMin >= 3)  return 6;
    if (totalMin >= 2)  return 3;
    return 0;
  }
  if (tier === 'elem_upper') {
    if (totalMin >= 30) return 15;
    if (totalMin >= 20) return 12;
    if (totalMin >= 10) return 9;
    if (totalMin >= 5)  return 6;
    if (totalMin >= 3)  return 3;
    return 0;
  }
  if (tier === 'mid') {
    if (totalMin >= 60) return 15;
    if (totalMin >= 40) return 12;
    if (totalMin >= 20) return 9;
    if (totalMin >= 10) return 6;
    if (totalMin >= 7)  return 3;
    return 0;
  }
  // high (default)
  if (totalMin >= 90) return 15;
  if (totalMin >= 60) return 12;
  if (totalMin >= 30) return 9;
  if (totalMin >= 15) return 6;
  if (totalMin >= 10) return 3;
  return 0;
};

export const calculateDensity = ({
  pausedCount = 0,
  totalSec = 0,
  timerType = 'free',
  completionRatio = 1,
  pomoSets = 0,
  focusMode = 'screen_off',
  exitCount = 0,
  selfRating = null,
  schoolLevel = 'high',
}) => {
  if (totalSec < 30) return 100;

  const totalMin = totalSec / 60;
  const tier = getSchoolTier(schoolLevel);

  // 1. 완료 점수 (0~40)
  let completionScore = 0;
  if (timerType === 'countdown') {
    // 완료율 기반 → 학교급 무관 (목표를 얼마나 달성했냐로 측정)
    if (completionRatio >= 1)   completionScore = 40;
    else if (completionRatio >= 0.8) completionScore = 36;
    else if (completionRatio >= 0.5) completionScore = 32;
    else completionScore = 28;
  } else if (timerType === 'pomodoro') {
    // 세트 기반 → 학교급 무관
    if (pomoSets >= 2)      completionScore = 40;
    else if (pomoSets >= 1) completionScore = 35;
    else                    completionScore = 20;
  } else {
    // 자유모드 → 학교급별 시간 기준 적용
    completionScore = getFreeCompletionScore(totalMin, tier);
  }

  // 2. 습관 점수 (0~30)
  let habitScore = 30;
  if (pausedCount === 1)      habitScore = 25;
  else if (pausedCount === 2) habitScore = 20;
  else if (pausedCount === 3) habitScore = 15;
  else if (pausedCount >= 4)  habitScore = 10;

  // 3. 지속력 보너스 (0~15) — 학교급별 시간 기준 적용
  const persistenceBonus = getPersistenceBonus(totalMin, tier);

  // 4. 선언 보너스 (0~15)
  let declarationBonus = 0;
  if (focusMode === 'screen_on') {
    if (exitCount === 0)       declarationBonus = 15;
    else if (exitCount <= 2)   declarationBonus = 8;
    else                       declarationBonus = 3;
  } else if (focusMode === 'screen_off') {
    // 📖 편하게공부 모드: 자유/뽀모는 항상 +5, 카운트다운은 완료율에 따라 부분 보너스
    if (timerType !== 'countdown')       declarationBonus = 5;
    else if (completionRatio >= 1)       declarationBonus = 5;
    else if (completionRatio >= 0.8)     declarationBonus = 3;
    else if (completionRatio >= 0.5)     declarationBonus = 2;
  }

  // 5. 자가평가 보너스 (0~+3) — 패널티 없음, 솔직한 선택 존중
  const selfBonus = (selfRating === 'fire' || selfRating === 'perfect') ? 3 : 0;

  const total = completionScore + habitScore + persistenceBonus + declarationBonus + selfBonus;
  return Math.max(56, Math.min(103, Math.round(total))); // 최저 56점(C) 보장
};

export const getDensityTier = (density) => getTier(density);

export const calcAverageDensity = (sessions) => {
  if (!sessions || sessions.length === 0) return 0;
  const total = sessions.reduce((sum, s) => sum + (s.focusDensity || 0), 0);
  return Math.round(total / sessions.length);
};

/** 밀도 점수 상세 내역 (투명성 리포트용) */
export const getDensityBreakdown = (params) => {
  const {
    pausedCount = 0, totalSec = 0, timerType = 'free', completionRatio = 1,
    pomoSets = 0, focusMode = 'screen_off', exitCount = 0, selfRating = null,
    schoolLevel = 'high',
  } = params;
  const totalMin = totalSec / 60;
  const tier = getSchoolTier(schoolLevel);

  const cs = timerType === 'countdown'
    ? (completionRatio >= 1 ? 40 : completionRatio >= 0.8 ? 36 : completionRatio >= 0.5 ? 32 : 28)
    : timerType === 'pomodoro'
    ? (pomoSets >= 2 ? 40 : pomoSets >= 1 ? 35 : 20)
    : getFreeCompletionScore(totalMin, tier);

  const hs = pausedCount === 0 ? 30 : pausedCount === 1 ? 25 : pausedCount === 2 ? 20 : pausedCount === 3 ? 15 : 10;

  const pb = getPersistenceBonus(totalMin, tier);

  const db = focusMode === 'screen_on'
    ? (exitCount === 0 ? 15 : exitCount <= 2 ? 8 : 3)
    : focusMode === 'screen_off'
    ? (timerType !== 'countdown' ? 5 : completionRatio >= 1 ? 5 : completionRatio >= 0.8 ? 3 : completionRatio >= 0.5 ? 2 : 0)
    : 0;

  const sb = selfRating === 'fire' || selfRating === 'perfect' ? 3 : 0;

  return {
    completionScore: cs,
    habitScore: hs,
    persistenceBonus: pb,
    declarationBonus: db,
    selfBonus: sb,
    total: Math.max(56, Math.min(103, cs + hs + pb + db + sb)),
    focusMode, exitCount, verified: focusMode === 'screen_on' && exitCount === 0,
  };
};
