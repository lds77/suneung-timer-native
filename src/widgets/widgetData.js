// src/widgets/widgetData.js
// 안드로이드 위젯 전용 데이터 헬퍼.
// 헤드리스(앱 꺼짐) 컨텍스트에서 돌기 때문에 앱 코드(useAppState/colors 등)를
// 무겁게 import하지 않고 AsyncStorage(@yeolgong/*)만 직접 읽는다.

import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  SETTINGS: '@yeolgong/settings',
  SUBJECTS: '@yeolgong/subjects',
  SESSIONS: '@yeolgong/sessions',
  DDAYS: '@yeolgong/ddays',
  WEEKLY: '@yeolgong/weeklySchedule',
};

// 로컬 기준 YYYY-MM-DD (format.js의 toDateStr와 동일 규칙 — UTC 사용 금지)
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 앱 테마 액센트 색상만 발췌 (colors.js ACCENT_COLORS와 동기화)
const ACCENT = {
  pink: '#FF6B9D', purple: '#6C5CE7', blue: '#4A90D9',
  mint: '#00B894', navy: '#2C5F9E', coral: '#E07050', slate: '#64748B',
};

// 초 → "Xh Ym" (format.js의 formatShort와 동일)
export const formatShort = (totalSec) => {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

const loadJSON = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

// 자정 기준 날짜 차이(일). 양수=미래, 0=오늘, 음수=과거
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

// D-Day 라벨: D-142 / D-DAY / D+3
export const ddayLabel = (n) => {
  if (n === null || n === undefined) return '';
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
};

/**
 * 위젯 렌더에 필요한 모든 '오늘' 데이터 묶음을 AsyncStorage에서 직접 계산.
 * 세 위젯(StudyTime/DDay/SubjectLauncher)이 공유한다.
 */
export const getWidgetData = async () => {
  const [sessions, settings, subjects, ddays, weekly] = await Promise.all([
    loadJSON(K.SESSIONS, []),
    loadJSON(K.SETTINGS, null),
    loadJSON(K.SUBJECTS, []),
    loadJSON(K.DDAYS, []),
    loadJSON(K.WEEKLY, null),
  ]);

  const today = todayStr();
  const subjArr = Array.isArray(subjects) ? subjects : [];
  const sessArr = Array.isArray(sessions) ? sessions : [];
  const todaySessions = sessArr.filter(s => s && s.date === today);
  const totalSec = todaySessions.reduce((acc, s) => acc + (s.durationSec || 0), 0);

  // 세션 → 과목 매칭: subjectId 우선, 없으면 라벨=과목명 폴백.
  // 연속모드 항목은 subjectId 없이 라벨만 있어서(예: '국어') 폴백 없이는 과목별 합산에서 빠진다.
  const subjById = {};
  const subjIdByName = {};
  subjArr.forEach(sub => {
    if (!sub?.id) return;
    subjById[sub.id] = sub;
    const nm = (sub.name || '').trim();
    if (nm && !subjIdByName[nm]) subjIdByName[nm] = sub.id;
  });
  const sessionSubjectId = (s) => {
    if (s.subjectId && subjById[s.subjectId]) return s.subjectId;
    return subjIdByName[(s.label || '').trim()] || null;
  };

  const goalMin = settings?.dailyGoalMin || 0;
  const goalSec = goalMin * 60;
  const goalPct = goalSec > 0 ? Math.min(999, Math.round((totalSec / goalSec) * 100)) : 0;

  const accent = ACCENT[settings?.accentColor] || ACCENT.pink;
  const darkMode = !!settings?.darkMode;
  const streak = settings?.streak || 0;

  // 과목별 오늘 합계 top3 (StudyTime 중형용)
  const subjMap = {};
  todaySessions.forEach(s => {
    const sid = sessionSubjectId(s);
    if (!sid) return;
    const sub = subjById[sid];
    if (!subjMap[sid]) subjMap[sid] = { name: sub.name, color: sub.color, sec: 0 };
    subjMap[sid].sec += (s.durationSec || 0);
  });
  const topSubjects = Object.values(subjMap).sort((a, b) => b.sec - a.sec).slice(0, 3);

  // D-Day 목록: 대표(isPrimary) 먼저 → 임박한 미래 순 → 과거(가까운 순). 최대 6개.
  const ddSorted = (Array.isArray(ddays) ? ddays : [])
    .filter(d => d && d.date)
    .map(d => ({ label: d.label || '', date: d.date, n: daysUntil(d.date), isPrimary: !!d.isPrimary }))
    .filter(d => d.n !== null)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1; // 대표 최상단
      const au = a.n >= 0, bu = b.n >= 0;
      if (au !== bu) return au ? -1 : 1;                            // 미래 우선
      return au ? a.n - b.n : b.n - a.n;                            // 임박/최근 순
    })
    .slice(0, 6);
  const dday = ddSorted[0] || null;

  // 이번 주(일요일 시작) 합계 — 총량/하루평균 + 과목별
  const wkStart = new Date(); wkStart.setHours(0, 0, 0, 0); wkStart.setDate(wkStart.getDate() - wkStart.getDay());
  const wkStartStr = `${wkStart.getFullYear()}-${String(wkStart.getMonth() + 1).padStart(2, '0')}-${String(wkStart.getDate()).padStart(2, '0')}`;
  const weekSecBySubj = {};
  let weekTotalSec = 0;
  sessArr.forEach(s => {
    if (!s?.date || s.date < wkStartStr || s.date > today) return;
    weekTotalSec += (s.durationSec || 0);
    const sid = sessionSubjectId(s);
    if (sid) weekSecBySubj[sid] = (weekSecBySubj[sid] || 0) + (s.durationSec || 0);
  });
  const daysElapsed = new Date().getDay() + 1;          // 일=1 … 토=7 (이번 주 경과 일수)
  const weekAvgSec = Math.round(weekTotalSec / daysElapsed);

  // 과목 바로 시작: 즐겨찾기 우선, 없으면 앞에서부터 (최대 6개, 2열×3행). 순서 고정(탭 위치 안정).
  const favs = subjArr.filter(s => s?.id && s.isFavorite);
  const launcherSubjects = (favs.length ? favs : subjArr)
    .slice(0, 6)
    .map(s => ({ id: s.id, name: s.name, color: s.color, weekSec: weekSecBySubj[s.id] || 0 }));

  // 오늘 계획 (플래너) — useAppState.getTodaySchedule과 동일 규칙
  // (onlyWeek '이번 주만' 노출 + skipWeeks '이번 주만 삭제/휴무' 제외, order 정렬)
  let plans = [];
  let planPct = -1; // -1 = 계획 없음/플래너 미사용
  if (weekly && weekly.enabled) {
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
    const inWeek = (b) => (!b.onlyWeek || b.onlyWeek === wkStartStr) && !(b.skipWeeks && b.skipWeeks.includes(wkStartStr));
    const rawPlans = ((weekly[dayKey] && weekly[dayKey].plans) || [])
      .filter(p => p && p.id && inWeek(p))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const doneByPlan = {};
    todaySessions.forEach(s => {
      if (s.planId) doneByPlan[s.planId] = (doneByPlan[s.planId] || 0) + (s.durationSec || 0);
    });
    plans = rawPlans.slice(0, 6).map(p => {
      const targetSec = (p.targetMin || 0) * 60;
      const doneSec = doneByPlan[p.id] || 0;
      return {
        id: p.id, label: p.label || '', color: p.color || '',
        targetMin: p.targetMin || 0, doneSec,
        done: targetSec > 0 && doneSec >= targetSec * 0.8, // 집중탭 계획 카드와 동일 기준
      };
    });
    const totalTargetSec = rawPlans.reduce((s, p) => s + (p.targetMin || 0) * 60, 0);
    if (totalTargetSec > 0) {
      const totalDoneSec = rawPlans.reduce((s, p) => s + (doneByPlan[p.id] || 0), 0);
      planPct = Math.min(100, Math.round((totalDoneSec / totalTargetSec) * 100));
    }
  }

  return {
    date: today,          // 스냅샷 계산 기준일 — iOS 위젯이 자정 경과 감지에 사용
    totalSec, goalSec, goalPct, accent, darkMode, streak,
    subjects: topSubjects,
    weekTotalSec,         // 이번 주(일~오늘) 누적
    weekAvgSec,           // 이번 주 하루 평균(경과일 기준)
    dday,                 // { label, date, n } | null (목록 첫 항목 = 대표/최근접)
    ddays: ddSorted,      // [{ label, date, n, isPrimary }] 정렬·최대 6
    launcherSubjects,     // [{ id, name, color, weekSec }]
    plans,                // 오늘 계획 [{ id, label, color, targetMin, doneSec, done }] 최대 6
    planPct,              // 오늘 계획 전체 달성률 0~100, -1이면 계획 없음
  };
};
