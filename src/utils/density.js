// src/utils/density.js
// 집중 밀도 점수 계산 엔진 v2
// 투명한 공식: 누구나 검증 가능

import { getTier } from '../constants/presets';

/**
 * 집중밀도 공식 (총 100점 + 보너스 최대 18점 = 최대 118점)
 *
 * ━━━ 완료 점수 (0~40) ━━━
 *   카운트다운 완료              = 40
 *   카운트다운 80%+ 중지         = 30
 *   카운트다운 50%+ 중지         = 20
 *   카운트다운 50% 미만 중지     = 10
 *   자유 모드 30분+              = 25
 *   자유 모드 1시간+             = 35
 *   자유 모드 2시간+ (상한)      = 40
 *   뽀모도로 1세트 완료          = 35
 *   뽀모도로 2세트+              = 40
 *
 * ━━━ 습관 점수 (0~30) ━━━
 *   일시정지 0회 = 30
 *   1회 = 25, 2회 = 20, 3회 = 15, 4회+ = 10
 *
 * ━━━ 꾸준함 보너스 (0~15) ━━━
 *   오늘 2세션 이상 = +5
 *   오늘 3세션 이상 = +10
 *   연속 공부 3일+  = +5
 *
 * ━━━ 선언 보너스 (0~15, 🔥모드 전용) ━━━
 *   📖 편하게 공부 모드          = +0
 *   🔥 집중 도전 모드 선택       = +5 (기본)
 *   🔥 + 이탈 0회 완료          = +15 (Verified!)
 *   🔥 + 이탈 1~2회             = +8
 *   🔥 + 이탈 3회+              = +3
 *
 * ━━━ 자가평가 보너스 (-5~+3) ━━━
 *   🔥 또는 ⚡ 선택 시           = +3
 *   😐 선택 시                  = +0
 *   😴 선택 시                  = -5
 *   선택 안 함                  = +0
 */

export const calculateDensity = ({
  pausedCount = 0,
  totalSec = 0,
  timerType = 'free',
  completionRatio = 1,
  pomoSets = 0,
  focusMode = 'screen_off',
  exitCount = 0,
  selfRating = null,
  todaySessionCount = 0,
  streak = 0,
}) => {
  if (totalSec < 30) return 100;

  const totalMin = totalSec / 60;

  // 1. 완료 점수 (0~40)
  let completionScore = 0;
  if (timerType === 'countdown') {
    if (completionRatio >= 1) completionScore = 40;
    else if (completionRatio >= 0.8) completionScore = 30;
    else if (completionRatio >= 0.5) completionScore = 20;
    else completionScore = 10;
  } else if (timerType === 'pomodoro') {
    if (pomoSets >= 2) completionScore = 40;
    else if (pomoSets >= 1) completionScore = 35;
    else completionScore = 20;
  } else {
    if (totalMin >= 120) completionScore = 40;
    else if (totalMin >= 60) completionScore = 35;
    else if (totalMin >= 30) completionScore = 25;
    else if (totalMin >= 10) completionScore = 15;
    else completionScore = 10;
  }

  // 2. 습관 점수 (0~30)
  let habitScore = 30;
  if (pausedCount === 1) habitScore = 25;
  else if (pausedCount === 2) habitScore = 20;
  else if (pausedCount === 3) habitScore = 15;
  else if (pausedCount >= 4) habitScore = 10;

  // 3. 꾸준함 보너스 (0~15)
  let consistencyBonus = 0;
  if (todaySessionCount >= 3) consistencyBonus += 10;
  else if (todaySessionCount >= 2) consistencyBonus += 5;
  if (streak >= 3) consistencyBonus += 5;

  // 4. 선언 보너스 (0~15)
  let declarationBonus = 0;
  if (focusMode === 'screen_on') {
    if (exitCount === 0) declarationBonus = 15;
    else if (exitCount <= 2) declarationBonus = 8;
    else declarationBonus = 3;
  }

  // 5. 자가평가 보너스 (-5~+3)
  let selfBonus = 0;
  if (selfRating === 'fire' || selfRating === 'perfect') selfBonus = 3;
  else if (selfRating === 'sleepy') selfBonus = -5;

  const total = completionScore + habitScore + consistencyBonus + declarationBonus + selfBonus;
  return Math.max(40, Math.min(118, Math.round(total)));
};

export const getDensityTier = (density) => getTier(density);

export const calcAverageDensity = (sessions) => {
  if (!sessions || sessions.length === 0) return 0;
  const total = sessions.reduce((sum, s) => sum + (s.focusDensity || 0), 0);
  return Math.round(total / sessions.length);
};

/** 밀도 점수 상세 내역 (투명성 리포트용) */
export const getDensityBreakdown = (params) => {
  const { pausedCount = 0, totalSec = 0, timerType = 'free', completionRatio = 1, pomoSets = 0, focusMode = 'screen_off', exitCount = 0, selfRating = null, todaySessionCount = 0, streak = 0 } = params;
  const totalMin = totalSec / 60;

  let cs = timerType === 'countdown' ? (completionRatio >= 1 ? 40 : completionRatio >= 0.8 ? 30 : completionRatio >= 0.5 ? 20 : 10) : timerType === 'pomodoro' ? (pomoSets >= 2 ? 40 : pomoSets >= 1 ? 35 : 20) : (totalMin >= 120 ? 40 : totalMin >= 60 ? 35 : totalMin >= 30 ? 25 : totalMin >= 10 ? 15 : 10);
  let hs = pausedCount === 0 ? 30 : pausedCount === 1 ? 25 : pausedCount === 2 ? 20 : pausedCount === 3 ? 15 : 10;
  let cb = (todaySessionCount >= 3 ? 10 : todaySessionCount >= 2 ? 5 : 0) + (streak >= 3 ? 5 : 0);
  let db = focusMode === 'screen_on' ? (exitCount === 0 ? 15 : exitCount <= 2 ? 8 : 3) : 0;
  let sb = selfRating === 'fire' || selfRating === 'perfect' ? 3 : selfRating === 'sleepy' ? -5 : 0;

  return {
    completionScore: cs, habitScore: hs, consistencyBonus: cb, declarationBonus: db, selfBonus: sb,
    total: Math.max(40, Math.min(118, cs + hs + cb + db + sb)),
    focusMode, exitCount, verified: focusMode === 'screen_on' && exitCount === 0,
  };
};
