// stats/helpers.js — StatsScreen 공통 유틸/상수
import { getTier } from '../../constants/presets';
import { formatDuration, formatShort } from '../../utils/format';
import { calcAverageDensity } from '../../utils/density';
import { DAY_KEYS, weekStartOf, isPlanInWeek } from '../planner/helpers';

export const DAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];
export const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// 주간 플래너 달성률(%) — weekDates('YYYY-MM-DD'[])의 각 날짜를 그 날이 속한 일요일-주 기준으로
// onlyWeek/skipWeeks 필터해 목표/실행을 합산. getTodayPlanRate·위젯 planPct와 규칙 통일.
// (버그: 과거 StatsScreen 인라인 계산은 필터가 없어 '이번 주만' 타 주 계획·'휴무' 계획이
//  분모에 잡혀 달성률이 부당하게 낮게 나왔음.) 목표 총합 0이면 null.
export function calcWeekPlanRate(weekDates, weeklySchedule, sessions) {
  if (!weeklySchedule || !weeklySchedule.enabled) return null;
  let totalTargetSec = 0;
  let totalDoneSec = 0;
  (weekDates || []).forEach(date => {
    const d = new Date(date + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    const dayData = weeklySchedule[DAY_KEYS[d.getDay()]];
    if (!dayData || !dayData.plans || !dayData.plans.length) return;
    const ws = weekStartOf(date);
    dayData.plans.forEach(plan => {
      if (!isPlanInWeek(plan, ws)) return;
      totalTargetSec += (plan.targetMin || 0) * 60;
      totalDoneSec += (sessions || [])
        .filter(s => s.date === date && s.planId === plan.id)
        .reduce((sum, s) => sum + (s.durationSec || 0), 0);
    });
  });
  if (totalTargetSec === 0) return null;
  return Math.min(100, Math.round((totalDoneSec / totalTargetSec) * 100));
}

// ─── 잔디(히트맵) 계산 — StatsScreen에서 코드 무변경 이동 (순수 함수, 테스트 대상) ───

// 최근 hmWeeks주(끝은 이번 주 토요일) 히트맵 주 배열: [[{date, sec, isFuture, isToday} ×7] ×hmWeeks]
export function buildHeatmapWeeks(sessions, hmWeeks, now = new Date()) {
  const data = {};
  (sessions || []).forEach(s => {
    if (!s.date) return;
    if (!data[s.date]) data[s.date] = { sec: 0 };
    data[s.date].sec += (s.durationSec || 0);
  });
  const today = dateStr(now);
  const end = now;
  const endDow = end.getDay();
  const endSat = addDays(end, 6 - endDow);
  const startSun = addDays(endSat, -hmWeeks * 7 + 1);
  const weeks = [];
  let cur = new Date(startSun);
  while (cur <= endSat) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const ds = dateStr(cur);
      const dd = data[ds] || { sec: 0 };
      const isFuture = cur > end;
      week.push({ date: ds, sec: dd.sec, isFuture, isToday: ds === today });
      cur = addDays(cur, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// 히트맵 기간 내 최장 연속 공부일
export function calcLongestStreak(heatmapWeeks) {
  let max = 0, cur = 0;
  heatmapWeeks.flat().filter(d => !d.isFuture).forEach(d => {
    if (d.sec > 0) { cur++; max = Math.max(max, cur); } else cur = 0;
  });
  return max;
}

// 시간대별 집중력 분석 — 주간/월간 탭 공용 (호출부가 기간 필터링한 세션을 전달)
export function analyzeTimeZones(sessions) {
  const withStart = (sessions || []).filter(s => s.startedAt);
  return TIME_ZONES.map(zone => {
    const zoneSess = withStart.filter(s => zone.hours.includes(new Date(s.startedAt).getHours()));
    const totalSec = zoneSess.reduce((s, x) => s + (x.durationSec || 0), 0);
    const avgDensity = calcAverageDensity(zoneSess);
    const tier = zoneSess.length > 0 ? getTier(avgDensity) : null;
    return { ...zone, totalSec, avgDensity, tier, count: zoneSess.length, sessions: zoneSess };
  });
}

// 월간 캘린더 히트맵 셀 (앞뒤 null 패딩으로 7의 배수, 일요일 시작)
export function buildMonthCalendarCells(sessions, year, month, todayStr) {
  const firstDay = new Date(year, month, 1).getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const sess = (sessions || []).filter(s => s.date === ds);
    cells.push({ day: d, date: ds, sec: sess.reduce((s, x) => s + (x.durationSec || 0), 0), sessions: sess.length, density: calcAverageDensity(sess), isToday: ds === todayStr });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// 시간대별 상세 (타임라인 팝업) — 세션이 여러 시간에 걸쳐도 분 단위로 정확히 분배
export function buildHourlyDetail(sessions, subjects) {
  return Array.from({ length: 24 }, (_, h) => {
    const hourSessMap = {};
    let totalSec = 0;
    (sessions || []).filter(s => s.startedAt).forEach(s => {
      const startDate = new Date(s.startedAt);
      const midnightMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
      const sessStartSec = (s.startedAt - midnightMs) / 1000;
      const sessEndSec = sessStartSec + (s.durationSec || 0);
      const hStartSec = h * 3600;
      const hEndSec = (h + 1) * 3600;
      const overlapStart = Math.max(sessStartSec, hStartSec);
      const overlapEnd = Math.min(sessEndSec, hEndSec);
      if (overlapEnd > overlapStart) {
        const overlapSec = overlapEnd - overlapStart;
        totalSec += overlapSec;
        const sesSubj = getSessionSubject(s, subjects);
        const k = sesSubj.id;
        if (!hourSessMap[k]) hourSessMap[k] = { name: sesSubj.name, color: sesSubj.color, sec: 0 };
        hourSessMap[k].sec += overlapSec;
      }
    });
    const subjectsSorted = Object.values(hourSessMap).sort((a, b) => b.sec - a.sec);
    return { hour: h, sec: totalSec, subjects: subjectsSorted };
  });
}

// 과목별 합계 집계 (일간/주간/월간 공용) — [{name, color, sec, pct}] 시간 내림차순
export function aggregateSubjectTotals(sessions, subjects) {
  const map = {};
  (sessions || []).forEach(s => {
    const { id, name, color } = getSessionSubject(s, subjects);
    if (!map[id]) map[id] = { sec: 0, name, color };
    map[id].sec += (s.durationSec || 0);
  });
  const total = Object.values(map).reduce((a, b) => a + b.sec, 0);
  return Object.values(map).map(({ sec, name, color }) => ({
    name, color, sec, pct: total > 0 ? Math.round((sec / total) * 100) : 0,
  })).sort((a, b) => b.sec - a.sec);
}

// 역대 기록 (하루 최장/최다 세션/최장 단일 세션/최고 밀도(10분 이상))
export function calcPersonalBests(sessions) {
  const list = sessions || [];
  if (list.length === 0) return null;

  const byDate = {};
  list.forEach(s => {
    if (!s.date) return;
    if (!byDate[s.date]) byDate[s.date] = { sec: 0, count: 0 };
    byDate[s.date].sec += (s.durationSec || 0);
    byDate[s.date].count++;
  });

  let bestDayDate = null, bestDaySec = 0;
  Object.entries(byDate).forEach(([date, v]) => {
    if (v.sec > bestDaySec) { bestDaySec = v.sec; bestDayDate = date; }
  });

  let mostSessDate = null, mostSessCount = 0;
  Object.entries(byDate).forEach(([date, v]) => {
    if (v.count > mostSessCount) { mostSessCount = v.count; mostSessDate = date; }
  });

  let longestSess = null;
  list.forEach(s => {
    if ((s.durationSec || 0) > (longestSess?.durationSec || 0)) longestSess = s;
  });

  let bestDensitySess = null;
  list.forEach(s => {
    if ((s.durationSec || 0) >= 600 && (s.focusDensity || 0) > (bestDensitySess?.focusDensity || 0)) bestDensitySess = s;
  });

  return { bestDayDate, bestDaySec, mostSessDate, mostSessCount, longestSess, bestDensitySess };
}

// ─── 리포트 카드 색상 헬퍼 ───
export const darkenColor = (hex, amount = 0.3) => {
  const c = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(c.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(c.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(c.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// ─── 응원 메시지 풀 ───
export const CHEER_MSGS = {
  godlike:    ['혹시 천재야? 곰인 내가 봐도 대단해!','완벽 그 자체야... 너 진짜 다른 레벨이다','이 정도면 전교 1등 각이야!'],
  excellent:  ['집중력 끝판왕! 이 페이스 유지하면 무적이야','오늘 집중도 미쳤어! 자랑스러워','너의 밀도 점수 보고 감동받았어...'],
  streak:     ['일 연속! 대단해, 습관이 만들어지고 있어','일째 이어가는 중! 멈추지 마','일 연속 공부! 이게 진짜 실력이 되는 거야'],
  longStudy:  ['5시간 넘겼어! 오늘은 푹 쉬어도 돼','오늘 정말 열심히 했다! 맛있는 거 먹어','대단한 하루였어! 내일도 이렇게만 하자'],
  good:       ['좋은 하루였어! 내일은 밀도를 조금 더 올려볼까?','오늘도 잘했어! 꾸준함이 진짜 실력이야','착실하게 공부했네! 이런 날이 쌓이면 큰 차이가 돼'],
  struggling: ['힘든 날도 있지! 괜찮아, 내일 다시 하면 돼','오늘은 컨디션이 안 좋았나봐. 푹 자고 내일 다시!','집중이 어려운 날이었지? 그래도 자리에 앉은 게 대단해'],
  justStarted:['시작한 것만으로도 대단해! 조금씩 늘려가자','첫 발을 뗐어! 내일은 10분만 더 해볼까?','오늘 공부한 너, 어제의 너보다 앞서있어'],
  default:    ['오늘도 수고했어! 내일도 함께하자','매일 조금씩, 그게 비결이야! 화이팅','넌 잘하고 있어. 믿어!','오늘 하루도 고생 많았어! 내가 응원할게'],
};

export function getInsight(sec, density, streak) {
  const h = sec / 3600;
  let pool;
  if (density >= 100 && h >= 3) pool = CHEER_MSGS.godlike;
  else if (density >= 86) pool = CHEER_MSGS.excellent;
  else if (streak >= 7) {
    pool = CHEER_MSGS.streak;
    return `${streak}${pool[Math.floor(Math.random() * pool.length)]}`;
  } else if (h >= 5) pool = CHEER_MSGS.longStudy;
  else if (h >= 2) pool = CHEER_MSGS.good;
  else if (density < 66 && h > 0.5) pool = CHEER_MSGS.struggling;
  else if (h > 0 && h < 1) pool = CHEER_MSGS.justStarted;
  else pool = CHEER_MSGS.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── 시간대 라벨 ───
export const TIME_ZONES = [
  { label: '새벽', hours: [0,1,2,3,4,5],       icon: 'moon-outline' },
  { label: '오전', hours: [6,7,8,9,10,11],      icon: 'partly-sunny-outline' },
  { label: '오후', hours: [12,13,14,15,16,17],  icon: 'sunny-outline' },
  { label: '저녁', hours: [18,19,20,21,22,23],  icon: 'cloudy-night-outline' },
];

// ─── 리포트 텍스트 생성 ───
export function buildReportText({ weekTotal, weekPrev, topSubject, avgDensity, streak, studyDays, focusStats, todoRate }) {
  const tier = getTier(avgDensity);
  const diff = weekTotal - weekPrev;
  const diffStr = diff === 0 ? '지난주와 동일' : diff > 0 ? `지난주보다 +${formatShort(diff)}` : `지난주보다 ${formatShort(Math.abs(diff))} 적음`;
  const fsl = focusStats || {};
  const fsLine = fsl.screenOnSessions ? `집중 도전: ${fsl.screenOnSessions}세션 (Verified: ${fsl.verifiedSessions})` : '';
  const fsLine2 = fsl.screenOffSessions ? `편하게 공부: ${fsl.screenOffSessions}세션` : '';
  const todoLine = todoRate !== null && todoRate !== undefined ? `이번 주 할 일 완료율: ${todoRate}%` : '';
  return `열공메이트 주간 리포트

이번 주 공부시간: ${formatDuration(weekTotal)}
${diffStr}
집중밀도: ${tier.label} (${avgDensity}점)
최다 과목: ${topSubject || '미지정'}
공부일수: ${studyDays}일 / 7일
연속 공부: ${streak}일
${todoLine ? '\n' + todoLine : ''}${fsLine ? '\n' + fsLine : ''}${fsLine2 ? '\n' + fsLine2 : ''}

#열공멀티타이머 #공부스타그램 #수험생`;
}

export function buildDayReportText({ date, totalSec, goalSec, avgDensity, sessions, topSubject, streak }) {
  const tier = getTier(avgDensity);
  const pct = Math.min(100, Math.round(totalSec / Math.max(1, goalSec) * 100));
  return `열공메이트 오늘 리포트 (${date})

공부시간: ${formatDuration(totalSec)}
목표 달성: ${pct}% (목표 ${formatDuration(goalSec)})
집중밀도: ${tier.label} ${avgDensity}점
세션: ${sessions}회
${topSubject ? `최다 과목: ${topSubject}` : ''}
연속 공부: ${streak}일

#열공멀티타이머 #공부스타그램 #수험생`;
}

export function buildMonthReportText({ monthStr, totalSec, studyDays, totalDays, avgDensity, topSubject }) {
  const tier = getTier(avgDensity);
  return `열공메이트 ${monthStr} 월간 리포트

총 공부시간: ${formatDuration(totalSec)}
공부일: ${studyDays}/${totalDays}일
평균 집중밀도: ${tier.label} ${avgDensity}점
${topSubject ? `최다 과목: ${topSubject}` : ''}

#열공멀티타이머 #공부스타그램 #월간리포트`;
}

export function buildHeatReportText({ studyDays, streak, longestStreak, yearTotal }) {
  return `열공메이트 공부 기록

공부일 (최근 4개월): ${studyDays}일
현재 연속: ${streak}일
최장 연속: ${longestStreak}일
올해 총 공부: ${formatDuration(yearTotal)}

#열공멀티타이머 #공부스타그램 #공부잔디`;
}

// ─── 과목 레이블 색상 ───
export const LABEL_PALETTE = ['#4A90D9', '#E8575A', '#5CB85C', '#F5A623', '#9B6FC3', '#00B894', '#E17055', '#74B9FF', '#A29BFE', '#FD79A8'];
export function hashLabelColor(label) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = label.charCodeAt(i) + ((h << 5) - h);
  return LABEL_PALETTE[Math.abs(h) % LABEL_PALETTE.length];
}

export const BUILTIN_SUBJECTS = [
  { name: '지구과학', color: '#00CEC9' },
  { name: '제2외국어', color: '#6C5CE7' },
  { name: '한국사', color: '#9B6FC3' },
  { name: '국어', color: '#E8575A' },
  { name: '수학', color: '#4A90D9' },
  { name: '영어', color: '#5CB85C' },
  { name: '과학', color: '#F5A623' },
  { name: '사회', color: '#00B894' },
  { name: '탐구', color: '#E17055' },
  { name: '물리', color: '#74B9FF' },
  { name: '화학', color: '#A29BFE' },
  { name: '생물', color: '#55EFC4' },
  { name: '지리', color: '#FDCB6E' },
  { name: '역사', color: '#D63031' },
  { name: '경제', color: '#BADC58' },
  { name: '윤리', color: '#6C5CE7' },
].sort((a, b) => b.name.length - a.name.length);

export function stripLeadingEmoji(label) {
  if (!label) return label;
  return label.replace(/^[^\w\uAC00-\uD7A3]+\s*/, '');
}

export function getSessionSubject(sess, subjects) {
  const subj = subjects.find(s => s.id === sess.subjectId);
  if (subj) return { id: sess.subjectId, name: subj.name, color: subj.color };

  if (sess.label) {
    const cleanLabel = stripLeadingEmoji(sess.label);
    const exact = subjects.find(s => s.name === cleanLabel);
    if (exact) return { id: exact.id, name: exact.name, color: exact.color };
    const sortedUser = [...subjects].sort((a, b) => b.name.length - a.name.length);
    const partial = sortedUser.find(s => cleanLabel.includes(s.name));
    if (partial) return { id: partial.id, name: partial.name, color: partial.color };
    const builtin = BUILTIN_SUBJECTS.find(s => cleanLabel.includes(s.name));
    if (builtin) return { id: `builtin_${builtin.name}`, name: builtin.name, color: builtin.color };
    return { id: `lbl_${cleanLabel}`, name: cleanLabel, color: hashLabelColor(cleanLabel) };
  }

  return { id: '_none', name: '미지정', color: '#B2BEC3' };
}

// ─── 기간 대비 변화 포맷 ───
export function fmtDiff(diff, fmt) {
  if (diff === 0) return { text: '= 동일', up: null };
  return diff > 0
    ? { text: `↑ +${fmt(diff)}`, up: true }
    : { text: `↓ -${fmt(Math.abs(diff))}`, up: false };
}

// ─── Streak 칭호 ───
export function getStreakTitle(streak) {
  if (streak >= 365) return '전설';
  if (streak >= 100) return '백일의 기적';
  if (streak >= 30)  return '습관이 된 자';
  if (streak >= 14)  return '2주 파이터';
  if (streak >= 7)   return '일주일의 기적';
  if (streak >= 3)   return '작심삼일 돌파!';
  if (streak >= 1)   return '씨앗 심는 중';
  return null;
}
