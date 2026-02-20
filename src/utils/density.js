// src/utils/density.js
// 집중 밀도 점수 계산 엔진

import { getTier } from '../constants/presets';

/**
 * 집중 밀도 점수 계산
 * @param {Object} params
 * @param {number} params.pausedCount - 일시정지 횟수
 * @param {number} params.appExitCount - 앱 이탈 횟수
 * @param {number} params.quickReturnCount - 빠른 복귀 횟수 (45초 내)
 * @param {number} params.totalSec - 총 공부 시간 (초)
 * @param {boolean} params.ultraFocusCompleted - 울트라 포커스 완주 여부
 * @returns {number} 밀도 점수 (40~120)
 */
export const calculateDensity = ({
  pausedCount = 0,
  appExitCount = 0,
  quickReturnCount = 0,
  totalSec = 0,
  ultraFocusCompleted = false,
}) => {
  // 30초 미만은 측정 의미 없음
  if (totalSec < 30) return 100;

  let score = 100;

  // 감점
  score -= pausedCount * 3;       // 일시정지마다 -3
  score -= appExitCount * 6;      // 앱 이탈마다 -6

  // 가점
  score += quickReturnCount * 8;  // 45초 내 빠른 복귀 +8
  if (ultraFocusCompleted) score += 5;  // 울트라 포커스 완주 +5

  // 장시간 보너스
  const totalMin = totalSec / 60;
  if (totalMin > 60) score += 3;  // 1시간 이상
  if (totalMin > 120) score += 3; // 2시간 이상

  // 범위 제한 (40~120)
  return Math.max(40, Math.min(120, Math.round(score)));
};

/**
 * 밀도 점수 → 티어 정보 반환
 */
export const getDensityTier = (density) => getTier(density);

/**
 * 오늘 평균 밀도 계산
 */
export const calcAverageDensity = (sessions) => {
  if (!sessions || sessions.length === 0) return 0;
  const total = sessions.reduce((sum, s) => sum + (s.focusDensity || 0), 0);
  return Math.round(total / sessions.length);
};
