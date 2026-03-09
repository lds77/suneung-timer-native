// src/utils/density.js
// 집중 밀도 점수 계산 엔진 v6

import { getTier } from '../constants/presets';

/**
 * 집중밀도 공식 v6 (최대 103점)
 * — 꾸준함 보너스 제거: 밀도는 한 세션의 집중도만 측정
 *
 * ━━━ 완료 점수 (0~40) ━━━
 *   카운트다운 완료              = 40
 *   카운트다운 80%+ 중지         = 36  (10% 감소)
 *   카운트다운 50%+ 중지         = 32  (10% 감소)
 *   카운트다운 50% 미만 중지     = 28  (10% 감소)
 *   자유 모드 5분 미만           = 10
 *   자유 모드 5분~10분           = 15
 *   자유 모드 10분~30분          = 20
 *   자유 모드 30분~60분          = 28
 *   자유 모드 1시간~2시간        = 35
 *   자유 모드 2시간+ (상한)      = 40
 *   뽀모도로 1세트 완료          = 35
 *   뽀모도로 2세트+              = 40
 *
 * ━━━ 습관 점수 (0~30) ━━━
 *   일시정지 0회 = 30
 *   1회 = 25, 2회 = 20, 3회 = 15, 4회+ = 10
 *
 * ━━━ 지속력 보너스 (0~15) ━━━
 *   10분 미만   = +0
 *   10분~15분   = +3
 *   15분~30분   = +6
 *   30분~60분   = +9
 *   60분~90분   = +12
 *   90분 이상   = +15
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

export const calculateDensity = ({
  pausedCount = 0,
  totalSec = 0,
  timerType = 'free',
  completionRatio = 1,
  pomoSets = 0,
  focusMode = 'screen_off',
  exitCount = 0,
  selfRating = null,
}) => {
  if (totalSec < 30) return 100;

  const totalMin = totalSec / 60;

  // 1. 완료 점수 (0~40)
  let completionScore = 0;
  if (timerType === 'countdown') {
    if (completionRatio >= 1) completionScore = 40;
    else if (completionRatio >= 0.8) completionScore = 36;
    else if (completionRatio >= 0.5) completionScore = 32;
    else completionScore = 28;
  } else if (timerType === 'pomodoro') {
    if (pomoSets >= 2) completionScore = 40;
    else if (pomoSets >= 1) completionScore = 35;
    else completionScore = 20;
  } else {
    if (totalMin >= 120) completionScore = 40;
    else if (totalMin >= 60) completionScore = 35;
    else if (totalMin >= 30) completionScore = 28;
    else if (totalMin >= 10) completionScore = 20;
    else if (totalMin >= 5) completionScore = 15;
    else completionScore = 10;
  }

  // 2. 습관 점수 (0~30)
  let habitScore = 30;
  if (pausedCount === 1) habitScore = 25;
  else if (pausedCount === 2) habitScore = 20;
  else if (pausedCount === 3) habitScore = 15;
  else if (pausedCount >= 4) habitScore = 10;

  // 3. 지속력 보너스 (0~15) — 10분부터 인정
  let persistenceBonus = 0;
  if (totalMin >= 90) persistenceBonus = 15;
  else if (totalMin >= 60) persistenceBonus = 12;
  else if (totalMin >= 30) persistenceBonus = 9;
  else if (totalMin >= 15) persistenceBonus = 6;
  else if (totalMin >= 10) persistenceBonus = 3;

  // 4. 선언 보너스 (0~15)
  let declarationBonus = 0;
  if (focusMode === 'screen_on') {
    if (exitCount === 0) declarationBonus = 15;
    else if (exitCount <= 2) declarationBonus = 8;
    else declarationBonus = 3;
  } else if (focusMode === 'screen_off') {
    // 📖 편하게공부 모드: 자유/뽀모는 항상 +5, 카운트다운은 완료율에 따라 부분 보너스
    if (timerType !== 'countdown') declarationBonus = 5;
    else if (completionRatio >= 1) declarationBonus = 5;
    else if (completionRatio >= 0.8) declarationBonus = 3;
    else if (completionRatio >= 0.5) declarationBonus = 2;
  }

  // 5. 자가평가 보너스 (0~+3) — 패널티 없음, 솔직한 선택 존중
  let selfBonus = 0;
  if (selfRating === 'fire' || selfRating === 'perfect') selfBonus = 3;

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
  } = params;
  const totalMin = totalSec / 60;

  const cs = timerType === 'countdown'
    ? (completionRatio >= 1 ? 40 : completionRatio >= 0.8 ? 36 : completionRatio >= 0.5 ? 32 : 28)
    : timerType === 'pomodoro'
    ? (pomoSets >= 2 ? 40 : pomoSets >= 1 ? 35 : 20)
    : (totalMin >= 120 ? 40 : totalMin >= 60 ? 35 : totalMin >= 30 ? 28 : totalMin >= 10 ? 20 : totalMin >= 5 ? 15 : 10);

  const hs = pausedCount === 0 ? 30 : pausedCount === 1 ? 25 : pausedCount === 2 ? 20 : pausedCount === 3 ? 15 : 10;

  const pb = totalMin >= 90 ? 15 : totalMin >= 60 ? 12 : totalMin >= 30 ? 9 : totalMin >= 15 ? 6 : totalMin >= 10 ? 3 : 0;

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
