// src/utils/format.js
// 시간 포맷 헬퍼

/**
 * 초를 HH:MM:SS 또는 MM:SS 형태로 변환
 */
export const formatTime = (totalSec) => {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * 초를 "Xh Ym" 형태로 변환 (통계용)
 */
export const formatDuration = (totalSec) => {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  if (m > 0) return `${m}분`;
  return '0분';
};

/**
 * 초를 간단하게 "Xh Ym" (영문 약어)
 */
export const formatShort = (totalSec) => {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

/**
 * 오늘 날짜를 YYYY-MM-DD 형태로
 */
export const getToday = () => new Date().toISOString().slice(0, 10);

/**
 * D-Day 계산 (남은 일수)
 */
export const calcDDay = (dateStr) => {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
};

/**
 * D-Day 표시 문자열
 */
export const formatDDay = (dateStr) => {
  const days = calcDDay(dateStr);
  if (days === null) return '';
  if (days === 0) return 'D-Day';
  if (days > 0) return `D-${days}`;
  return `D+${Math.abs(days)}`;
};

/**
 * 고유 ID 생성
 */
export const generateId = (prefix = '') => {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};
