// planner/helpers.js — PlannerScreen 순수 배치/시간 로직 (코드 무변경 이동, 테스트 대상)
// 미루기/자동배치 버그가 나왔던 영역이라 회귀 안전망 목적.
import { toDateStr } from '../../utils/format';

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const START_HOUR = 6;      // 06:00 부터
export const END_HOUR = 24;       // 24:00 (자정)

export const parseTimeToMin = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const minToStr = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// 임시배치(tempAssignments) 키: 절대 주차(weekStart='YYYY-MM-DD') + 계획 id
// 같은 매주반복 계획을 서로 다른 주에 독립적으로 배치할 수 있도록 복합키 사용
// (과거: planId만 키로 써서 여러 주 배치가 서로 덮어쓰여 랜덤하게 풀리는 버그)
export const TKEY_SEP = '@@';
export const makeTKey = (weekStart, planId) => `${weekStart}${TKEY_SEP}${planId}`;
export const tkeyWeek = (k) => k.slice(0, k.indexOf(TKEY_SEP));
export const tkeyPlan = (k) => k.slice(k.indexOf(TKEY_SEP) + TKEY_SEP.length);

// 임의 날짜('YYYY-MM-DD')가 속한 주의 시작(일요일) 문자열
export const weekStartOf = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return toDateStr(d);
};
// 과거 이름 호환 (PlannerScreen에 동일 구현이 두 이름으로 존재했음)
export const weekStartOfDateStr = weekStartOf;

// '이번 주만'(onlyWeek) 계획이 해당 주에 표시돼야 하는지 + 반복 계획의 '이번 주만 삭제'(skipWeeks) 반영
export const isPlanInWeek = (p, weekStartStr) =>
  (!p.onlyWeek || p.onlyWeek === weekStartStr) && !(p.skipWeeks && p.skipWeeks.includes(weekStartStr));

// 자정 넘는 일정 여부 (end <= start)
export const isMidnightCrossing = (start, end) => parseTimeToMin(end) <= parseTimeToMin(start);

// 특정 날짜(요일+주시작)에 이미 점유된 시간대(분 단위 구간) 목록
// excludeId: 옮기는 계획 자신은 점유에서 제외 (같은 요일 다른 주로 옮길 때 자기충돌 방지)
export const occupiedIntervalsForDay = (ws, dayKey, weekStartStr, excludeId) => {
  const dd = ws[dayKey] || { fixed: [], plans: [] };
  const prevKey = DAY_KEYS[(DAY_KEYS.indexOf(dayKey) - 1 + 7) % 7];
  const prevDd = ws[prevKey] || { fixed: [], plans: [] };
  const toIv = (it) => ({ start: parseTimeToMin(it.start), end: isMidnightCrossing(it.start, it.end) ? 24 * 60 : parseTimeToMin(it.end) });
  // 전날 자정 넘어온 일정 → 이 날 오전 점유.
  // 일요일의 전날(토)은 '이전 주' 소속이므로 onlyWeek/skipWeeks 판정도 이전 주 기준으로
  const carryWeekStart = dayKey === 'sun'
    ? toDateStr((() => { const d = new Date(weekStartStr + 'T00:00:00'); d.setDate(d.getDate() - 7); return d; })())
    : weekStartStr;
  const carry = [...(prevDd.fixed || []), ...(prevDd.plans || [])]
    .filter(it => it.start && it.end && isMidnightCrossing(it.start, it.end) && isPlanInWeek(it, carryWeekStart))
    .map(it => ({ start: 0, end: parseTimeToMin(it.end) }));
  return [
    ...carry,
    ...(dd.fixed || []).filter(f => f.start && f.end && isPlanInWeek(f, weekStartStr)).map(toIv),
    ...(dd.plans || []).filter(p => p.start && p.end && p.id !== excludeId && isPlanInWeek(p, weekStartStr)).map(toIv),
  ];
};

// 구간 [s,e)가 점유 구간들과 겹치는지
export const intervalsOverlap = (s, e, intervals) => intervals.some(it => s < it.end && e > it.start);

// durationMin 길이가 들어갈 빈 시간의 시작(분)을 preferStart에 가장 가깝게 찾기. 없으면 null
export const findFreeStartMin = (durationMin, intervals, preferStart) => {
  const dayStart = START_HOUR * 60, dayEnd = END_HOUR * 60;
  const merged = [];
  [...intervals].sort((a, b) => a.start - b.start).forEach(it => {
    const s = Math.max(it.start, dayStart), e = Math.min(it.end, dayEnd);
    if (e <= s) return;
    const lastIv = merged[merged.length - 1];
    if (lastIv && s <= lastIv.end) lastIv.end = Math.max(lastIv.end, e);
    else merged.push({ start: s, end: e });
  });
  const gaps = [];
  let cur = dayStart;
  for (const it of merged) {
    if (it.start - cur >= durationMin) gaps.push({ start: cur, end: it.start });
    cur = Math.max(cur, it.end);
  }
  if (dayEnd - cur >= durationMin) gaps.push({ start: cur, end: dayEnd });
  if (!gaps.length) return null;
  let best = null, bestDist = Infinity;
  for (const g of gaps) {
    const cand = Math.min(Math.max(preferStart, g.start), g.end - durationMin);
    const dist = Math.abs(cand - preferStart);
    if (dist < bestDist) { bestDist = dist; best = cand; }
  }
  return best;
};
