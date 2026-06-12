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
 * Date → YYYY-MM-DD (로컬 시간대 기준)
 * toISOString()은 UTC라 KST 00:00~08:59에 하루 전 날짜가 나옴 — 날짜 문자열은 반드시 이 함수 사용
 */
export const toDateStr = (d) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 오늘 날짜를 YYYY-MM-DD 형태로
 */
export const getToday = () => toDateStr(new Date());

/**
 * 어제 날짜를 YYYY-MM-DD 형태로 (로컬 기준)
 */
export const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
};

/**
 * 주 시작일(일요일, 로컬)을 YYYY-MM-DD로 — weekOffset만큼 주 단위 이동
 * 플래너의 주 식별자('이번 주만' 계획, 임시 배치 저장 키)로 사용
 */
export const getWeekStartStr = (weekOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + weekOffset * 7);
  return toDateStr(d);
};

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
