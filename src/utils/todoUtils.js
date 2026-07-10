// src/utils/todoUtils.js
// 할일 기한(dueDate) 관련 순수 로직 — 오늘 탭 표시 판정, 기한 뱃지, 날짜 칩.
// 날짜 문자열은 전부 'YYYY-MM-DD' (KST 로컬, format.js toDateStr 규칙). UTC 파싱 금지.

import { toDateStr } from './format';

export const DAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];

// 두 날짜 문자열의 일수 차 (to - from)
export const diffDays = (fromStr, toStr) => {
  const a = new Date(fromStr + 'T00:00:00');
  const b = new Date(toStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
};

// '오늘' 탭 표시 판정 (My Day 모델):
// - 오늘 목록 소속(scope today/null)은 기한이 없거나 도래했을 때 표시 (미래 기한은 '예정' 섹션으로 분리)
// - 다른 목록 소속은 기한이 도래(지남 포함)하면 오늘 탭에도 등장.
//   완료된 것은 완료한 그날만 표시 (오래전 완료가 계속 쌓이는 것 방지)
export const isTodayVisible = (t, todayStr) => {
  if (t.isTemplate) return false;
  const inTodayList = t.scope === 'today' || t.scope == null;
  if (inTodayList) return !t.dueDate || t.dueDate <= todayStr;
  if (!t.dueDate || t.dueDate > todayStr) return false;
  if (t.done) return !!t.completedAt && toDateStr(new Date(t.completedAt)) === todayStr;
  return true;
};

// '오늘' 탭의 예정 섹션: 오늘 목록 소속인데 기한이 미래인 항목
export const isUpcoming = (t, todayStr) =>
  !t.isTemplate && (t.scope === 'today' || t.scope == null) && !!t.dueDate && t.dueDate > todayStr;

// 기한 뱃지 스펙 — dueDate 없으면 null. tone: 'overdue' | 'due' | 'normal'
export const dueBadge = (t, todayStr) => {
  if (!t.dueDate) return null;
  const diff = diffDays(todayStr, t.dueDate);
  const md = `${parseInt(t.dueDate.slice(5, 7), 10)}/${parseInt(t.dueDate.slice(8, 10), 10)}`;
  if (diff < 0) return t.done ? { label: md, tone: 'normal' } : { label: `${-diff}일 지남`, tone: 'overdue' };
  if (diff === 0) return { label: '오늘까지', tone: 'due' };
  if (diff === 1) return { label: '내일까지', tone: 'normal' };
  return { label: `${md}까지`, tone: 'normal' };
};

// 날짜 선택 칩용: 내일부터 n일치 'YYYY-MM-DD' 배열
export const nextDates = (todayStr, n) => {
  const base = new Date(todayStr + 'T00:00:00');
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i + 1);
    return toDateStr(d);
  });
};

// 날짜 칩 라벨: 내일은 '내일', 그 외 'M/D(요일)'
export const dateChipLabel = (dateStr, todayStr) => {
  if (diffDays(todayStr, dateStr) === 1) return '내일';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${DAYS_KR[d.getDay()]})`;
};

// 월 캘린더 셀: 앞쪽 빈칸(null) + { date: 'YYYY-MM-DD', day: n } — 일요일 시작
export const buildMonthCells = (year, monthIdx) => {
  const first = new Date(year, monthIdx, 1);
  const cells = Array.from({ length: first.getDay() }, () => null);
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ date: toDateStr(new Date(year, monthIdx, d)), day: d });
  }
  return cells;
};
