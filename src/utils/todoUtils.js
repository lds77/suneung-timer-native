// src/utils/todoUtils.js
// 할일 순수 로직 — 오늘 탭 표시 판정(My Day), 기한 뱃지, 날짜 칩, 드래그 정렬, 일일 리셋 파이프라인.
// 날짜 문자열은 전부 'YYYY-MM-DD' (KST 로컬, format.js toDateStr 규칙). UTC 파싱 금지.

import { toDateStr, generateId } from './format';

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

// 드래그 정렬 커밋: orderedIds에 해당하는 항목들을 배열 내 기존 자리(슬롯)에 새 순서로 재배치.
// 그룹 밖 항목들의 위치는 그대로 유지 — 과목 그룹 안에서만 순서를 바꾸는 용도
export const applyReorder = (list, orderedIds) => {
  const idSet = new Set(orderedIds);
  const slots = [];
  list.forEach((t, i) => { if (idSet.has(t.id)) slots.push(i); });
  if (slots.length !== orderedIds.length) return list; // id 불일치(삭제 등) 시 무시
  const byId = new Map(list.filter(t => idSet.has(t.id)).map(t => [t.id, t]));
  const next = [...list];
  slots.forEach((slot, k) => { next[slot] = byId.get(orderedIds[k]); });
  return next;
};

// 드래그 중 목표 인덱스: 행 높이 배열(표시 순서)과 드래그 이동량(dy)으로 계산.
// 이웃 행의 절반을 넘게 지나면 한 칸 이동 — 가변 높이 행 대응
export const computeDropIndex = (heights, fromIndex, dy) => {
  let idx = fromIndex;
  let acc = 0;
  if (dy > 0) {
    while (idx < heights.length - 1 && dy - acc >= heights[idx + 1] / 2) {
      acc += heights[idx + 1];
      idx++;
    }
  } else {
    while (idx > 0 && -dy - acc >= heights[idx - 1] / 2) {
      acc += heights[idx - 1];
      idx--;
    }
  }
  return idx;
};

// ── 일일 리셋 파이프라인 ──
// useAppState 로드 시와 자정 넘김 감지(AppState active) 시 공용. 규칙:
// 1) 지난날 미완료 반복 인스턴스는 항상 정리 — 템플릿이 매일 새로 생성하므로 미완료 이월과
//    겹치면 못 한 날마다 하나씩 쌓인다 (완료된 지난 인스턴스는 리셋 때 오늘 목록 규칙으로 정리)
// 2) needsReset(마지막 리셋일 != today)이면: 오늘 목록의 완료된 일반 항목 삭제
//    (커스텀 목록/시험/템플릿은 유지), repeat(고정) 항목은 done만 리셋
// 3) 오늘 요일에 해당하는 반복 템플릿의 인스턴스 생성 (같은 날 것이 이미 있으면 스킵 — 멱등)
// 반환: { todos, changed } — changed면 저장 필요
export const applyDailyTodoReset = (list, { today, needsReset }) => {
  const todayDay = new Date(today + 'T00:00:00').getDay();
  const isStaleTemplateInstance = (t) =>
    !t.isTemplate && t.templateId && t.createdDate !== today && !t.done;

  let next = list.filter(t => !isStaleTemplateInstance(t));
  if (needsReset) {
    next = next
      .filter(t => t.isTemplate || !t.done || t.repeat || (t.scope != null && t.scope !== 'today'))
      .map(t => (!t.isTemplate && t.repeat && t.done) ? { ...t, done: false, completedAt: null } : t);
  }
  const generated = [];
  next.forEach(tmpl => {
    if (!(tmpl.isTemplate && tmpl.repeatDays && tmpl.repeatDays.length > 0)) return;
    if (!tmpl.repeatDays.includes(todayDay)) return;
    if (next.some(t => !t.isTemplate && t.templateId === tmpl.id && t.createdDate === today)) return;
    generated.push({
      id: generateId('todo_'), text: tmpl.text, done: false, completedAt: null,
      repeat: false, subjectId: tmpl.subjectId ?? null, subjectLabel: tmpl.subjectLabel ?? null,
      subjectColor: tmpl.subjectColor ?? null, subjectIcon: tmpl.subjectIcon ?? null,
      priority: tmpl.priority ?? 'normal', scope: 'today', ddayId: null,
      memo: tmpl.memo ?? '', isTemplate: false, repeatDays: null,
      templateId: tmpl.id, createdDate: today,
    });
  });
  const todos = generated.length > 0 ? [...next, ...generated] : next;
  const changed = todos.length !== list.length || todos.some((t, i) => t !== list[i]);
  return { todos, changed };
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
