// src/screens/StatsScreen.js  —  v25 (코드 분리)
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Pressable, Alert,
  Dimensions, Share, StyleSheet, TextInput, Platform, KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../hooks/useAppState';
import { getTheme } from '../constants/colors';
import { CHARACTERS } from '../constants/characters';
import { getTier, TIERS } from '../constants/presets';
import { formatDuration, formatShort, formatDDay, getToday } from '../utils/format';
import RunningTimersBar from '../components/RunningTimersBar';
import { calcAverageDensity, getDensityBreakdown } from '../utils/density';
import CharacterAvatar from '../components/CharacterAvatar';
import { Ionicons } from '@expo/vector-icons';

// 분리된 모듈
import {
  DAYS_KR, dateStr, addDays, CHEER_MSGS, getInsight, TIME_ZONES,
  buildReportText, buildDayReportText, buildMonthReportText, buildHeatReportText,
  getSessionSubject, fmtDiff, getStreakTitle, stripLeadingEmoji,
} from './stats/helpers';
import GoalRing from './stats/components/GoalRing';
import SubjectDonut from './stats/components/SubjectDonut';
import {
  ReportGradientHeader, SubjectProportionBar, ReportFooterMessage, ReportWatermark,
} from './stats/components/ReportComponents';
import { createStyles, HM_WEEKS, HM_GAP } from './stats/styles';

const { width: SW } = Dimensions.get('window');
const isTablet = SW >= 600;
const TABLET_MAX_W = 680;

// ═══════════════════════════════════════════════════════════════════
export default function StatsScreen() {
  const { width: winW, height: winH } = useWindowDimensions();
  const tabletMaxW = isTablet ? Math.round(winW * 0.83) : winW;
  const isLandscape = isTablet && winW > winH;
  const contentW = isTablet ? Math.min(winW, TABLET_MAX_W) - 32 : winW - 32;
  const CELL = useMemo(() => Math.floor((contentW - 28 - 12) / 7), [contentW]);
  const HM_CELL = useMemo(() => Math.max(8, Math.floor((winW - 72 - (HM_WEEKS - 1) * HM_GAP) / HM_WEEKS)), [winW]);
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const fs = T.fontScale * (isTablet ? 1.1 : 1.0);
  const S = useMemo(() => createStyles(fs), [fs]);
  const [tab, setTab] = useState('daily');
  const today = getToday();
  const [activeCard, setActiveCard] = useState(null);
  const activeCardTimer = useRef(null);
  const tapCard = useCallback((key) => {
    if (activeCardTimer.current) clearTimeout(activeCardTimer.current);
    setActiveCard(key);
    activeCardTimer.current = setTimeout(() => setActiveCard(null), 2000);
  }, []);

  // 메모 수정 모달
  const [editMemo, setEditMemo] = useState(null); // { sessionId, memo }
  const [editMemoText, setEditMemoText] = useState('');
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  useEffect(() => {
    if (isEditingMemo) {
      setTimeout(() => sessionDetailScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [isEditingMemo]);

  // 세션 상세 모달
  const [sessionDetail, setSessionDetail] = useState(null); // session object

  // 월간 탭 네비게이션
  const [monthOffset, setMonthOffset] = useState(0);
  const viewMonth = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset); return d;
  }, [monthOffset]);
  const viewMonthStr = `${viewMonth.getFullYear()}.${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;

  // 리포트 카드 모달
  const [showReport, setShowReport] = useState(false);
  const [showDayReport, setShowDayReport] = useState(false);
  const [showMonthReport, setShowMonthReport] = useState(false);
  const [showHeatReport, setShowHeatReport] = useState(false);
  // 리포트 응원메시지 고정 (모달 열릴 때 1회 생성, 리렌더 시 변경 방지)
  const [reportCheer, setReportCheer] = useState('');

  // 주간 탭 이전/다음 주 탐색 (0 = 이번주, -1 = 지난주, ...)
  const [weekOffset, setWeekOffset] = useState(0);

  // 날짜 클릭 상세 모달
  const [dayDetailDate, setDayDetailDate] = useState(null);

  // 시간대 상세 모달
  const [tzDetail, setTzDetail] = useState(null); // { zone, periodLabel }

  // 타임라인 시간대 상세 모달
  const [showTimelineModal, setShowTimelineModal] = useState(false);

  // 일간 상세 팝업
  const [showGoalDetail, setShowGoalDetail] = useState(false);
  const [showDensityDetail, setShowDensityDetail] = useState(false);

  // 과목 탭
  const [subjPeriod, setSubjPeriod] = useState('30d'); // '7d' | '30d' | 'all'
  const [subjDetail, setSubjDetail] = useState(null);  // subject id → 상세 시트 트리거


  // 헬퍼: HH:MM 포맷
  const formatHM = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  // 헬퍼: 날짜 상세 포맷 (모달 제목용)
  const formatDetailDate = (ds) => {
    if (!ds) return '';
    const d = new Date(ds + 'T00:00:00');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS_KR[d.getDay()]})`;
  };

  // ─── 오늘 데이터 ───────────────────────────────────────────────
  const todaySessions = app.todaySessions;
  const todayTotalSec = app.todayTotalSec;
  const todayAvgDensity = calcAverageDensity(todaySessions);
  const todayTier = getTier(todayAvgDensity);

  // ─── 어제 데이터 (일간 카드 비교용) ──────────────────────────
  const yesterdayData = useMemo(() => {
    const yd = dateStr(addDays(new Date(), -1));
    const sess = app.sessions.filter(s => s.date === yd);
    const sec = sess.reduce((s, x) => s + (x.durationSec || 0), 0);
    return { sec, avgDensity: calcAverageDensity(sess) };
  }, [app.sessions]);

  // ─── 7일 데이터 ───────────────────────────────────────────────
  const weekData = useMemo(() => {
    const data = [];
    const base = addDays(new Date(), weekOffset * 7);
    for (let i = 6; i >= 0; i--) {
      const d = addDays(base, -i); const ds = dateStr(d);
      const sess = app.sessions.filter(s => s.date === ds);
      data.push({ date: ds, day: DAYS_KR[d.getDay()], sec: sess.reduce((s, x) => s + (x.durationSec || 0), 0), density: calcAverageDensity(sess), isToday: ds === today, sessions: sess.length });
    }
    return data;
  }, [app.sessions, today, weekOffset]);
  const weekMax = Math.max(...weekData.map(d => d.sec), 3600);
  const weekTotal = weekData.reduce((s, d) => s + d.sec, 0);
  const weekStudyDays = weekData.filter(d => d.sec > 0).length;

  // 지난주 데이터 (리포트용)
  const weekPrevTotal = useMemo(() => {
    let total = 0;
    const base = addDays(new Date(), weekOffset * 7);
    for (let i = 13; i >= 7; i--) {
      const ds = dateStr(addDays(base, -i));
      total += app.sessions.filter(s => s.date === ds).reduce((s, x) => s + (x.durationSec || 0), 0);
    }
    return total;
  }, [app.sessions, weekOffset]);

  // 주간 평균 밀도 (리포트용)
  const weekAvgDensity = useMemo(() => {
    const allSess = weekData.flatMap(d => app.sessions.filter(s => s.date === d.date));
    return calcAverageDensity(allSess);
  }, [weekData, app.sessions]);

  // 지난주 공부일수 + 평균밀도 (카드 비교용)
  const weekPrevData = useMemo(() => {
    const base = addDays(new Date(), weekOffset * 7);
    const days = [];
    for (let i = 13; i >= 7; i--) days.push(dateStr(addDays(base, -i)));
    const sess = app.sessions.filter(s => days.includes(s.date));
    const studyDays = new Set(sess.map(s => s.date)).size;
    return { studyDays, avgDensity: calcAverageDensity(sess) };
  }, [app.sessions, weekOffset]);

  // 주간 과목별
  const weekSubjects = useMemo(() => {
    const weekDates = new Set(weekData.map(d => d.date));
    const map = {};
    app.sessions.filter(s => weekDates.has(s.date)).forEach(s => {
      const { id, name, color } = getSessionSubject(s, app.subjects);
      if (!map[id]) map[id] = { sec: 0, name, color };
      map[id].sec += (s.durationSec || 0);
    });
    const total = Object.values(map).reduce((a, b) => a + b.sec, 0);
    return Object.values(map).map(({ sec, name, color }) => ({
      name, color, sec, pct: total > 0 ? Math.round((sec / total) * 100) : 0,
    })).sort((a, b) => b.sec - a.sec);
  }, [weekData, app.sessions, app.subjects]);
  const topSubject = weekSubjects[0]?.name || '';

  // 주간 투명성 통계
  const weekFocusStats = useMemo(() => {
    const weekDates = new Set(weekData.map(d => d.date));
    const ws = app.sessions.filter(s => weekDates.has(s.date));
    const screenOnSessions = ws.filter(s => s.focusMode === 'screen_on').length;
    const screenOffSessions = ws.filter(s => s.focusMode === 'screen_off' || !s.focusMode).length;
    const verifiedSessions = ws.filter(s => s.verified).length;
    const totalExits = ws.reduce((sum, s) => sum + (s.exitCount || 0), 0);
    return { screenOnSessions, screenOffSessions, verifiedSessions, totalExits, totalSessions: ws.length };
  }, [weekData, app.sessions]);

  // 일간 과목별
  const daySubjects = useMemo(() => {
    const map = {};
    todaySessions.forEach(s => {
      const { id, name, color } = getSessionSubject(s, app.subjects);
      if (!map[id]) map[id] = { sec: 0, name, color };
      map[id].sec += (s.durationSec || 0);
    });
    const total = Object.values(map).reduce((a, b) => a + b.sec, 0);
    return Object.values(map).map(({ sec, name, color }) => ({
      name, color, sec, pct: total > 0 ? Math.round((sec / total) * 100) : 0,
    })).sort((a, b) => b.sec - a.sec);
  }, [todaySessions, todayTotalSec]);

  // 타임라인 (시간별 24칸)
  const timeline = useMemo(() => {
    const hours = new Array(24).fill(0);
    todaySessions.forEach(s => { if (s.startedAt) hours[new Date(s.startedAt).getHours()] += s.durationSec || 0; });
    return hours;
  }, [todaySessions]);
  const timelineMax = Math.max(...timeline, 1800);

  // 시간대별 상세 (타임라인 팝업) — 세션이 여러 시간에 걸쳐도 분 단위로 정확히 분배
  const hourlyDetail = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => {
      const hourSessMap = {};
      let totalSec = 0;
      todaySessions.filter(s => s.startedAt).forEach(s => {
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
          const sesSubj = getSessionSubject(s, app.subjects);
          const k = sesSubj.id;
          if (!hourSessMap[k]) hourSessMap[k] = { name: sesSubj.name, color: sesSubj.color, sec: 0 };
          hourSessMap[k].sec += overlapSec;
        }
      });
      const subjects = Object.values(hourSessMap).sort((a, b) => b.sec - a.sec);
      return { hour: h, sec: totalSec, subjects };
    });
  }, [todaySessions, app.subjects]);

  // ─── 시간대별 집중력 분석 (주간 탭 — 해당 주 7일) ──────────────
  const timeZoneAnalysis = useMemo(() => {
    const weekDates = new Set(weekData.map(d => d.date));
    const recent = app.sessions.filter(s => weekDates.has(s.date) && s.startedAt);
    return TIME_ZONES.map(zone => {
      const zoneSess = recent.filter(s => zone.hours.includes(new Date(s.startedAt).getHours()));
      const totalSec = zoneSess.reduce((s, x) => s + (x.durationSec || 0), 0);
      const avgDensity = calcAverageDensity(zoneSess);
      const tier = zoneSess.length > 0 ? getTier(avgDensity) : null;
      return { ...zone, totalSec, avgDensity, tier, count: zoneSess.length, sessions: zoneSess };
    });
  }, [weekData, app.sessions]);
  const bestZone = [...timeZoneAnalysis].filter(z => z.count > 0).sort((a, b) => b.avgDensity - a.avgDensity)[0];

  // ─── 시간대별 집중력 분석 (월간 탭 — 선택된 월) ─────────────────
  const monthTimeZoneAnalysis = useMemo(() => {
    const monthPrefix = viewMonthStr.replace('.', '-');
    const recent = app.sessions.filter(s => s.date?.startsWith(monthPrefix) && s.startedAt);
    return TIME_ZONES.map(zone => {
      const zoneSess = recent.filter(s => zone.hours.includes(new Date(s.startedAt).getHours()));
      const totalSec = zoneSess.reduce((s, x) => s + (x.durationSec || 0), 0);
      const avgDensity = calcAverageDensity(zoneSess);
      const tier = zoneSess.length > 0 ? getTier(avgDensity) : null;
      return { ...zone, totalSec, avgDensity, tier, count: zoneSess.length, sessions: zoneSess };
    });
  }, [app.sessions, viewMonthStr]);
  const monthBestZone = [...monthTimeZoneAnalysis].filter(z => z.count > 0).sort((a, b) => b.avgDensity - a.avgDensity)[0];

  // ─── 취약 과목 분석 ────────────────────────────────────────────
  const weakSubjects = useMemo(() => {
    const start7 = dateStr(addDays(new Date(), -7));
    const recent7 = new Set(app.sessions.filter(s => s.date >= start7 && s.subjectId).map(s => s.subjectId));
    return app.subjects.filter(s => !recent7.has(s.id) && (s.totalElapsedSec || 0) > 0);
  }, [app.sessions, app.subjects]);

  // ─── 월간 캘린더 히트맵 ───────────────────────────────────────
  const calendarData = useMemo(() => {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sess = app.sessions.filter(s => s.date === ds);
      cells.push({ day: d, date: ds, sec: sess.reduce((s, x) => s + (x.durationSec || 0), 0), sessions: sess.length, density: calcAverageDensity(sess), isToday: ds === today });
    }
    return cells;
  }, [app.sessions, viewMonth, today]);
  const monthTotalSec = calendarData.filter(Boolean).reduce((s, d) => s + d.sec, 0);
  const monthStudyDays = calendarData.filter(d => d && d.sec > 0).length;
  const monthTotalDays = calendarData.filter(Boolean).length;
  const monthMaxSec = Math.max(...calendarData.filter(Boolean).map(d => d.sec), 1);
  const getHeatColor = (sec) => {
    if (sec === 0) return T.surface2;
    const r = Math.min(1, sec / Math.max(monthMaxSec, 3600));
    if (r < 0.25) return T.accent + '66'; if (r < 0.5) return T.accent + '99';
    if (r < 0.75) return T.accent + 'CC'; return T.accent;
  };

  // ─── 365일 히트맵 (깃허브 잔디) ──────────────────────────────
  const heatmap365 = useMemo(() => {
    const data = {};
    app.sessions.forEach(s => {
      if (!s.date) return;
      if (!data[s.date]) data[s.date] = { sec: 0, hasScreenOn: false, hasVerified: false };
      data[s.date].sec += (s.durationSec || 0);
      if (s.focusMode === 'screen_on') data[s.date].hasScreenOn = true;
      if (s.verified) data[s.date].hasVerified = true;
    });
    const end = new Date();
    const endDow = end.getDay();
    const endSat = addDays(end, 6 - endDow);
    const startSun = addDays(endSat, -HM_WEEKS * 7 + 1);
    const weeks = [];
    let cur = new Date(startSun);
    while (cur <= endSat) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const ds = dateStr(cur);
        const dd = data[ds] || { sec: 0, hasScreenOn: false, hasVerified: false };
        const isFuture = cur > end;
        week.push({ date: ds, sec: dd.sec, isFuture, isToday: ds === today, hasScreenOn: dd.hasScreenOn, hasVerified: dd.hasVerified });
        cur = addDays(cur, 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, [app.sessions, today]);
  const heatmap365Max = useMemo(() => Math.max(...heatmap365.flat().map(d => d.sec), 1), [heatmap365]);

  // 잔디 색상: 편하게모드 = accent 계열, 집중도전모드 = 초록, Verified = 골드
  // 잔디 색상 — 고정 시간 기준 (30분/1시간/2시간/4시간)
  const HEAT_STEPS = [1800, 3600, 7200, 14400]; // 30m, 1h, 2h, 4h
  const getHeat365Color = (day) => {
    if (day.isFuture) return 'transparent';
    if (day.sec === 0) return T.surface2;
    const sec = day.sec;
    const level = sec >= HEAT_STEPS[3] ? 3 : sec >= HEAT_STEPS[2] ? 2 : sec >= HEAT_STEPS[1] ? 1 : 0;
    if (day.hasVerified) {
      return ['#FFF3C4', '#F6D55C', '#F0C030', '#E6AC00'][level];
    }
    if (day.hasScreenOn) {
      return ['#C8E6C9', '#66BB6A', '#388E3C', '#1B5E20'][level];
    }
    return [T.heat1, T.heat2, T.heat3, T.heat4][level];
  };
  const totalStudyDays365 = useMemo(() => heatmap365.flat().filter(d => d.sec > 0 && !d.isFuture).length, [heatmap365]);

  // 히트맵 월 라벨
  const heatmapMonthLabels = useMemo(() => {
    const labels = [];
    heatmap365.forEach((week, wi) => {
      const firstDay = week[0];
      if (firstDay && firstDay.date) {
        const d = new Date(firstDay.date);
        if (d.getDate() <= 7) {
          labels.push({ wi, label: `${d.getMonth() + 1}월` });
        }
      }
    });
    return labels;
  }, [heatmap365]);

  // 월간 과목별
  const monthSubjects = useMemo(() => {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const map = {};
    app.sessions.filter(s => s.date?.startsWith(prefix)).forEach(s => {
      const { id, name, color } = getSessionSubject(s, app.subjects);
      if (!map[id]) map[id] = { sec: 0, name, color };
      map[id].sec += (s.durationSec || 0);
    });
    const total = Object.values(map).reduce((a, b) => a + b.sec, 0);
    return Object.values(map).map(({ sec, name, color }) => ({
      name, color, sec, pct: total > 0 ? Math.round((sec / total) * 100) : 0,
    })).sort((a, b) => b.sec - a.sec);
  }, [app.sessions, viewMonth, app.subjects]);

  // ─── 날짜 클릭 상세 모달 데이터 ──────────────────────────────
  const dayDetail = useMemo(() => {
    if (!dayDetailDate) return null;
    const sess = app.sessions.filter(s => s.date === dayDetailDate).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    const totalSec = sess.reduce((s, x) => s + (x.durationSec || 0), 0);
    const avgDensity = calcAverageDensity(sess);
    const tier = getTier(avgDensity);
    const map = {};
    sess.forEach(s => {
      const { id, name, color } = getSessionSubject(s, app.subjects);
      if (!map[id]) map[id] = { sec: 0, name, color };
      map[id].sec += (s.durationSec || 0);
    });
    const subjects = Object.values(map).map(({ sec, name, color }) => ({
      name, color, sec, pct: totalSec > 0 ? Math.round((sec / totalSec) * 100) : 0,
    })).sort((a, b) => b.sec - a.sec);
    return { date: dayDetailDate, sessions: sess, totalSec, avgDensity, tier, subjects };
  }, [dayDetailDate, app.sessions, app.subjects]);

  // ─── 잔디 요약: 최장 연속 ─────────────────────────────────────
  const longestStreak = useMemo(() => {
    let max = 0, cur = 0;
    heatmap365.flat().filter(d => !d.isFuture).forEach(d => {
      if (d.sec > 0) { cur++; max = Math.max(max, cur); } else cur = 0;
    });
    return max;
  }, [heatmap365]);

  // ─── 잔디 요약: 올해 총 공부시간 + 평균밀도 ──────────────────
  const yearTotalSec = useMemo(() => {
    const thisYear = new Date().getFullYear().toString();
    return app.sessions.filter(s => s.date?.startsWith(thisYear)).reduce((s, x) => s + (x.durationSec || 0), 0);
  }, [app.sessions]);
  const yearAvgDensity = useMemo(() => {
    const thisYear = new Date().getFullYear().toString();
    const ySess = app.sessions.filter(s => s.date?.startsWith(thisYear) && (s.focusDensity || 0) > 0);
    return ySess.length > 0 ? Math.round(ySess.reduce((s, x) => s + (x.focusDensity || 0), 0) / ySess.length) : 0;
  }, [app.sessions]);

  // ─── 역대 기록 (Personal Bests) ─────────────────────────────
  const personalBests = useMemo(() => {
    const sessions = app.sessions || [];
    if (sessions.length === 0) return null;

    // 날짜별 집계
    const byDate = {};
    sessions.forEach(s => {
      if (!s.date) return;
      if (!byDate[s.date]) byDate[s.date] = { sec: 0, count: 0 };
      byDate[s.date].sec += (s.durationSec || 0);
      byDate[s.date].count++;
    });

    // 하루 최장 공부시간
    let bestDayDate = null, bestDaySec = 0;
    Object.entries(byDate).forEach(([date, v]) => {
      if (v.sec > bestDaySec) { bestDaySec = v.sec; bestDayDate = date; }
    });

    // 하루 최다 세션
    let mostSessDate = null, mostSessCount = 0;
    Object.entries(byDate).forEach(([date, v]) => {
      if (v.count > mostSessCount) { mostSessCount = v.count; mostSessDate = date; }
    });

    // 최장 단일 세션
    let longestSess = null;
    sessions.forEach(s => {
      if ((s.durationSec || 0) > (longestSess?.durationSec || 0)) longestSess = s;
    });

    // 최고 집중밀도 세션 (최소 10분 이상)
    let bestDensitySess = null;
    sessions.forEach(s => {
      if ((s.durationSec || 0) >= 600 && (s.focusDensity || 0) > (bestDensitySess?.focusDensity || 0)) bestDensitySess = s;
    });

    return { bestDayDate, bestDaySec, mostSessDate, mostSessCount, longestSess, bestDensitySess };
  }, [app.sessions]);

  // ─── 오늘 플래너 달성률 ──────────────────────────────────────
  const todayPlanRate = app.weeklySchedule?.enabled ? app.getTodayPlanRate?.() : null;

  // ─── 이번 주 플래너 달성률 ───────────────────────────────────
  const weekPlanRate = useMemo(() => {
    if (!app.weeklySchedule?.enabled) return null;
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    let totalTargetSec = 0;
    let totalDoneSec = 0;
    weekData.forEach(({ date }) => {
      const d = new Date(date + 'T00:00:00');
      const dayData = app.weeklySchedule[dayKeys[d.getDay()]];
      if (!dayData?.plans?.length) return;
      dayData.plans.forEach(plan => {
        totalTargetSec += (plan.targetMin || 0) * 60;
        totalDoneSec += app.sessions
          .filter(s => s.date === date && s.planId === plan.id)
          .reduce((sum, s) => sum + (s.durationSec || 0), 0);
      });
    });
    if (totalTargetSec === 0) return null;
    return Math.min(100, Math.round(totalDoneSec / totalTargetSec * 100));
  }, [app.weeklySchedule, weekData, app.sessions]);

  // ─── 주간 베스트 날 인덱스 ────────────────────────────────────
  const weekBestDayIdx = useMemo(() => {
    if (weekData.every(d => d.sec === 0)) return -1;
    return weekData.reduce((bestIdx, d, i) => d.sec > weekData[bestIdx].sec ? i : bestIdx, 0);
  }, [weekData]);

  // ─── 과목 탭: 기간별 과목 집계 ──────────────────────────────
  // lbl_ 접두사 or _none = 과목 미매칭(뽀모도로·학습법 등 타이머 이름) → '기타'로 통합
  const subjectAllStats = useMemo(() => {
    const now = new Date();
    const cutoff = subjPeriod === '7d'
      ? new Date(now - 7 * 864e5).toISOString().slice(0, 10)
      : subjPeriod === '30d'
      ? new Date(now - 30 * 864e5).toISOString().slice(0, 10)
      : null;
    const filtered = cutoff ? app.sessions.filter(s => s.date >= cutoff) : app.sessions;
    const map = {};
    filtered.forEach(s => {
      const { id, name, color } = getSessionSubject(s, app.subjects);
      const isUnmatched = id.startsWith('lbl_') || id === '_none';
      const groupId = isUnmatched ? '__기타__' : id;
      const groupName = isUnmatched ? '기타' : name;
      const groupColor = isUnmatched ? '#B2BEC3' : color;
      if (!map[groupId]) map[groupId] = { id: groupId, name: groupName, color: groupColor, sec: 0, sessions: 0, densitySum: 0, lastDate: '' };
      map[groupId].sec += (s.durationSec || 0);
      map[groupId].sessions += 1;
      map[groupId].densitySum += (s.focusDensity || 0);
      if (!map[groupId].lastDate || s.date > map[groupId].lastDate) map[groupId].lastDate = s.date;
    });
    const total = Object.values(map).reduce((a, b) => a + b.sec, 0);
    return Object.values(map).map(m => ({
      ...m,
      pct: total > 0 ? Math.round((m.sec / total) * 100) : 0,
      avgDensity: m.sessions > 0 ? Math.round(m.densitySum / m.sessions) : 0,
    })).sort((a, b) => b.sec - a.sec);
  }, [app.sessions, app.subjects, subjPeriod]);

  // ─── 과목 상세 시트 데이터 ──────────────────────────────────
  const subjDetailData = useMemo(() => {
    if (!subjDetail) return null;
    const stat = subjectAllStats.find(s => s.id === subjDetail);
    if (!stat) return null;
    const now = new Date();
    const cutoff = subjPeriod === '7d'
      ? new Date(now - 7 * 864e5).toISOString().slice(0, 10)
      : subjPeriod === '30d'
      ? new Date(now - 30 * 864e5).toISOString().slice(0, 10)
      : null;
    const filtered = cutoff ? app.sessions.filter(s => s.date >= cutoff) : app.sessions;
    const isEtc = subjDetail === '__기타__';
    const recentSess = filtered
      .filter(s => {
        const { id } = getSessionSubject(s, app.subjects);
        return isEtc ? (id.startsWith('lbl_') || id === '_none') : id === subjDetail;
      })
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : (b.startedAt || 0) - (a.startedAt || 0)))
      .slice(0, 5);
    return { ...stat, recentSess };
  }, [subjDetail, subjectAllStats, app.sessions, app.subjects, subjPeriod]);


  // 과목 비율 렌더
  const renderSubjects = (data, label) => {
    if (data.length === 0) return null;
    const sideBySide = data.length <= 4;
    return (
      <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[S.secLabel, { color: T.sub }]}>{label}</Text>
        {sideBySide ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SubjectDonut data={data} T={T} />
            <View style={{ flex: 1 }}>
              {data.map((s, i) => (
                <View key={i} style={S.subjRow}>
                  <View style={[S.subjDot, { backgroundColor: s.color }]} />
                  <Text style={[S.subjName, { color: T.text }]}>{s.name}</Text>
                  <Text style={[S.subjPct, { color: T.sub }]}>{s.pct}%</Text>
                  <Text style={[S.subjTime, { color: T.text }]}>{formatShort(s.sec)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <SubjectDonut data={data} T={T} size={130} />
            </View>
            {data.map((s, i) => (
              <View key={i} style={S.subjRow}>
                <View style={[S.subjDot, { backgroundColor: s.color }]} />
                <Text style={[S.subjName, { color: T.text }]}>{s.name}</Text>
                <Text style={[S.subjPct, { color: T.sub }]}>{s.pct}%</Text>
                <Text style={[S.subjTime, { color: T.text }]}>{formatShort(s.sec)}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  // 날짜 상세 인라인 렌더 (랜드스케이프 마스터-디테일용)
  const renderDayDetailInline = () => {
    if (!dayDetail) return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
        <Ionicons name="calendar-outline" size={36} color={T.sub} style={{ marginBottom: 12 }} />
        <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center' }}>날짜를 탭하면{'\n'}상세 기록이 여기 표시됩니다</Text>
      </View>
    );
    return (
      <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>{formatDetailDate(dayDetail.date)}</Text>
          <TouchableOpacity onPress={() => setDayDetailDate(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 16, color: T.sub }}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
            <Text style={[S.sLabel, { color: T.sub }]}>총 공부시간</Text>
            <Text style={[S.sVal, { color: T.accent }]}>{formatDuration(dayDetail.totalSec)}</Text>
            {dayDetail.avgDensity > 0 && dayDetail.totalSec > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                <Ionicons name="flame" size={11} color="#E17055" />
                <Text style={{ fontSize: 11, color: T.sub }}>순공 {formatShort(Math.round(dayDetail.totalSec * dayDetail.avgDensity / 100))}</Text>
              </View>
            )}
          </View>
          <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
            <Text style={[S.sLabel, { color: T.sub }]}>집중밀도</Text>
            <Text style={[S.sVal, { color: dayDetail.tier.color }]}>
              {dayDetail.sessions.length > 0 ? `${dayDetail.tier.label} ${dayDetail.avgDensity}점` : '-'}
            </Text>
          </View>
          <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
            <Text style={[S.sLabel, { color: T.sub }]}>세션</Text>
            <Text style={[S.sVal, { color: T.text }]}>{dayDetail.sessions.length}회</Text>
          </View>
        </View>
        {dayDetail.subjects.length > 0 && renderSubjects(dayDetail.subjects, '과목 비율')}
        {dayDetail.sessions.length > 0 && (
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>세션 기록</Text>
            {dayDetail.sessions.map(sess => {
              const subj = app.subjects.find(s => s.id === sess.subjectId);
              const tier = getTier(sess.focusDensity || 0);
              const startH = sess.startedAt ? formatHM(sess.startedAt) : '';
              const endH = sess.endedAt ? formatHM(sess.endedAt) : '';
              return (
                <View key={sess.id} style={[S.sessCard, { borderLeftColor: subj ? subj.color : '#B2BEC3' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subj ? subj.color : '#B2BEC3' }} />
                      <Text style={{ fontSize: 14, fontWeight: subj ? '700' : '400', color: subj ? T.text : T.sub }}>{subj ? subj.name : (stripLeadingEmoji(sess.label) || '—')}</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: T.sub }}>{startH}{endH ? ` ~ ${endH}` : ''}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, color: T.accent, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
                    <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '25' }]}>
                      <Text style={{ fontSize: 13, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
                    </View>
                    {sess.verified && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Ionicons name="trophy" size={11} color="#F5A623" />
                        <Text style={{ fontSize: 11, color: '#F5A623', fontWeight: '700' }}>인증</Text>
                      </View>
                    )}
                  </View>
                  {sess.memo && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Ionicons name="chatbubble-outline" size={11} color={T.sub} />
                      <Text style={{ fontSize: 13, color: T.sub }}>{sess.memo}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        {dayDetail.sessions.length === 0 && (
          <Text style={[S.emptyText, { color: T.sub }]}>이 날은 공부 기록이 없어요</Text>
        )}
      </>
    );
  };

  // 월간 평균 집중밀도
  const monthAvgDensity = useMemo(() => {
    const prefix = viewMonthStr.replace('.', '-');
    return calcAverageDensity(app.sessions.filter(s => s.date?.startsWith(prefix)));
  }, [app.sessions, viewMonthStr]);

  // 이전 달 데이터 (월간 카드 비교용)
  const prevMonthData = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset - 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const sess = app.sessions.filter(s => s.date?.startsWith(prefix));
    const sec = sess.reduce((s, x) => s + (x.durationSec || 0), 0);
    const studyDays = new Set(sess.map(s => s.date)).size;
    return { sec, studyDays, avgDensity: calcAverageDensity(sess) };
  }, [app.sessions, monthOffset]);

  // 리포트 카드 캡처용 ref
  const reportRef = useRef();
  const dayReportRef = useRef();
  const monthReportRef = useRef();
  const heatReportRef = useRef();
  const memoInputRef = useRef(null);
  const sessionDetailScrollRef = useRef(null);

  const handleShareReport = async () => {
    try {
      // 이미지 캡처 시도
      if (reportRef.current) {
        const uri = await reportRef.current.capture();
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '주간 리포트 공유' });
          return;
        }
      }
    } catch {}
    // 이미지 공유 실패 시 텍스트 공유 폴백
    const weekTodosAll = app.todos.filter(t => !t.isTemplate && (t.scope === 'today' || t.scope == null));
    const weekTodoRate = weekTodosAll.length > 0
      ? Math.round((weekTodosAll.filter(t => t.done).length / weekTodosAll.length) * 100)
      : null;
    const text = buildReportText({
      weekTotal, weekPrev: weekPrevTotal, topSubject,
      avgDensity: weekAvgDensity, streak: app.settings.streak, studyDays: weekStudyDays,
      focusStats: weekFocusStats, todoRate: weekTodoRate,
    });
    try { await Share.share({ message: text }); } catch (e) {}
  };

  const handleShareDayReport = async () => {
    try {
      if (dayReportRef.current) {
        const uri = await dayReportRef.current.capture();
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) { await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '오늘 리포트 공유' }); return; }
      }
    } catch (e) {}
    const text = buildDayReportText({
      date: today, totalSec: todayTotalSec, goalSec: app.settings.dailyGoalMin * 60,
      avgDensity: todayAvgDensity, sessions: todaySessions.length,
      topSubject: daySubjects[0]?.name || '', streak: app.settings.streak,
    });
    try { await Share.share({ message: text }); } catch (e) {}
  };

  const handleShareMonthReport = async () => {
    try {
      if (monthReportRef.current) {
        const uri = await monthReportRef.current.capture();
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) { await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '월간 리포트 공유' }); return; }
      }
    } catch (e) {}
    const text = buildMonthReportText({
      monthStr: viewMonthStr, totalSec: monthTotalSec, studyDays: monthStudyDays,
      totalDays: calendarData.filter(Boolean).length, avgDensity: monthAvgDensity,
      topSubject: monthSubjects[0]?.name || '',
    });
    try { await Share.share({ message: text }); } catch (e) {}
  };

  const handleShareHeatReport = async () => {
    try {
      if (heatReportRef.current) {
        const uri = await heatReportRef.current.capture();
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) { await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '공부 기록 공유' }); return; }
      }
    } catch (e) {}
    const text = buildHeatReportText({
      studyDays: totalStudyDays365, streak: app.settings.streak,
      longestStreak, yearTotal: yearTotalSec,
    });
    try { await Share.share({ message: text }); } catch (e) {}
  };

  // 인사이트 메시지 (세션 수 기반 안정화)
  const insightMsg = useMemo(
    () => getInsight(todayTotalSec, todayAvgDensity, app.settings.streak),
    [todaySessions.length, Math.floor(todayTotalSec / 300)],
  );

  // ═══ RENDER ═══════════════════════════════════════════════════
  return (
    <View style={[S.container, { backgroundColor: T.bg }]}>
      <RunningTimersBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[S.scroll, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center', width: '100%' }]}>

        {/* ── 헤더 ── */}
        <View style={S.header}>
          <View style={[S.tabRow, { backgroundColor: T.surface2 }]}>
            {[{ id: 'daily', l: '일간' }, { id: 'weekly', l: '주간' }, { id: 'monthly', l: '월간' }, { id: 'heatmap', l: '잔디' }, { id: 'subject', l: '과목' }].map(t => (
              <TouchableOpacity
                key={t.id}
                style={[S.tabBtn, tab === t.id && { backgroundColor: T.accent }]}
                onPress={() => setTab(t.id)}
                hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
                activeOpacity={0.7}
              >
                <Text style={[S.tabText, { color: tab === t.id ? 'white' : T.sub }]}>{t.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 요약 카드 (탭별 맞춤) ── */}
        {tab !== 'subject' && (
          <View style={S.summaryRow}>
            {(() => {
              const UP = '#00B894'; const DN = '#E17055';
              const diffColor = (d) => d.up === true ? UP : d.up === false ? DN : T.sub;
              const SCard = ({ cardKey, onPress, label, val, valColor, sub, subColor, activeVal, activeValColor, activeSub }) => {
                const isActive = activeCard === cardKey;
                return (
                  <TouchableOpacity
                    style={[S.summaryCard, { backgroundColor: isActive ? T.surface2 : T.card, borderColor: isActive ? T.accent : T.border }]}
                    onPress={onPress || (() => tapCard(cardKey))}
                    activeOpacity={0.7}
                  >
                    <Text style={[S.sLabel, { color: T.sub }]}>{label}</Text>
                    <Text style={[S.sVal, { color: isActive ? activeValColor : valColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {isActive ? activeVal : val}
                    </Text>
                    <Text style={[S.sSub, { color: isActive ? (activeValColor || T.sub) : (subColor || T.sub) }]}>
                      {isActive ? (activeSub || ' ') : (sub || ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              };

              if (tab === 'daily') {
                const todayPct = Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100));
                const yPct = Math.min(100, Math.round(yesterdayData.sec / Math.max(1, app.settings.dailyGoalMin * 60) * 100));
                const d1 = fmtDiff(todayTotalSec - yesterdayData.sec, formatShort);
                const d2 = fmtDiff(todayAvgDensity - yesterdayData.avgDensity, n => `${n}점`);
                const d3 = fmtDiff(todayPct - yPct, n => `${n}%`);
                return (<>
                  <SCard cardKey="d_time"
                    label="오늘" val={formatDuration(todayTotalSec)} valColor={T.accent}
                    sub={todayAvgDensity > 0 && todayTotalSec > 0 ? `순공 ${formatShort(Math.round(todayTotalSec * todayAvgDensity / 100))}` : null}
                    activeVal={d1.text} activeValColor={diffColor(d1)}
                    activeSub={`어제 ${formatShort(yesterdayData.sec)}`}
                  />
                  <SCard cardKey="d_density"
                    label="집중밀도"
                    val={todaySessions.length > 0 ? `${todayTier.label} ${todayAvgDensity}점` : '-'}
                    valColor={todaySessions.length > 0 ? todayTier.color : T.sub}
                    activeVal={d2.text} activeValColor={diffColor(d2)}
                    activeSub={`어제 ${yesterdayData.avgDensity}점`}
                  />
                  <SCard cardKey="d_goal"
                    label="목표달성" val={`${todayPct}%`} valColor={T.accent}
                    sub={`목표 ${formatShort(app.settings.dailyGoalMin * 60)}`}
                    activeVal={d3.text} activeValColor={diffColor(d3)}
                    activeSub={`어제 ${yPct}%`}
                  />
                </>);
              }
              if (tab === 'weekly') {
                const d1 = fmtDiff(weekTotal - weekPrevTotal, formatShort);
                const d2 = fmtDiff(weekStudyDays - weekPrevData.studyDays, n => `${n}일`);
                const d3 = fmtDiff(weekAvgDensity - weekPrevData.avgDensity, n => `${n}점`);
                const wLabel = weekOffset === 0 ? '이번주' : weekOffset === -1 ? '지난주' : `${Math.abs(weekOffset)}주 전`;
                return (<>
                  <SCard cardKey="w_time"
                    label={wLabel} val={formatDuration(weekTotal)} valColor={T.accent}
                    sub={weekAvgDensity > 0 && weekTotal > 0 ? `순공 ${formatShort(Math.round(weekTotal * weekAvgDensity / 100))}` : null}
                    activeVal={d1.text} activeValColor={diffColor(d1)}
                    activeSub={`전주 ${formatShort(weekPrevTotal)}`}
                  />
                  <SCard cardKey="w_days"
                    label="공부일" val={`${weekStudyDays}/7일`} valColor={T.text}
                    activeVal={d2.text} activeValColor={diffColor(d2)}
                    activeSub={`전주 ${weekPrevData.studyDays}일`}
                  />
                  <SCard cardKey="w_density"
                    label="집중밀도"
                    val={weekAvgDensity > 0 ? `${getTier(weekAvgDensity).label} ${weekAvgDensity}점` : '-'}
                    valColor={weekAvgDensity > 0 ? getTier(weekAvgDensity).color : T.sub}
                    activeVal={d3.text} activeValColor={diffColor(d3)}
                    activeSub={`전주 ${weekPrevData.avgDensity}점`}
                  />
                </>);
              }
              if (tab === 'monthly') {
                const d1 = fmtDiff(monthTotalSec - prevMonthData.sec, formatShort);
                const d2 = fmtDiff(monthStudyDays - prevMonthData.studyDays, n => `${n}일`);
                const d3 = fmtDiff(monthAvgDensity - prevMonthData.avgDensity, n => `${n}점`);
                return (<>
                  <SCard cardKey="m_time"
                    label={viewMonthStr} val={formatDuration(monthTotalSec)} valColor={T.accent}
                    sub={monthAvgDensity > 0 && monthTotalSec > 0 ? `순공 ${formatShort(Math.round(monthTotalSec * monthAvgDensity / 100))}` : null}
                    activeVal={d1.text} activeValColor={diffColor(d1)}
                    activeSub={`전달 ${formatShort(prevMonthData.sec)}`}
                  />
                  <SCard cardKey="m_days"
                    label="공부일" val={`${monthStudyDays}/${monthTotalDays}일`} valColor={T.text}
                    activeVal={d2.text} activeValColor={diffColor(d2)}
                    activeSub={`전달 ${prevMonthData.studyDays}일`}
                  />
                  <SCard cardKey="m_density"
                    label="평균밀도"
                    val={monthAvgDensity > 0 ? `${getTier(monthAvgDensity).label} ${monthAvgDensity}점` : '-'}
                    valColor={monthAvgDensity > 0 ? getTier(monthAvgDensity).color : T.sub}
                    activeVal={d3.text} activeValColor={diffColor(d3)}
                    activeSub={`전달 ${prevMonthData.avgDensity}점`}
                  />
                </>);
              }
              if (tab === 'heatmap') {
                const streak = app.settings.streak;
                return (<>
                  <SCard cardKey="h_year"
                    label="올해 총" val={formatShort(yearTotalSec)} valColor={T.accent}
                    sub={yearAvgDensity > 0 && yearTotalSec > 0 ? `순공 ${formatShort(Math.round(yearTotalSec * yearAvgDensity / 100))}` : null}
                    activeVal={yearAvgDensity > 0 ? `순공 ${formatShort(Math.round(yearTotalSec * yearAvgDensity / 100))}` : '-'}
                    activeValColor={T.accent}
                    activeSub={yearAvgDensity > 0 ? `밀도 ${yearAvgDensity}점` : ' '}
                  />
                  <SCard cardKey="h_streak"
                    label="현재연속" val={`${streak}일`} valColor="#E17055"
                    sub={getStreakTitle(streak) || ' '} subColor={T.text}
                    activeVal={getStreakTitle(streak) || `${streak}일`} activeValColor={T.text}
                    activeSub={longestStreak > streak ? `최장 ${longestStreak - streak}일 남음` : '신기록 중!'}
                  />
                  <SCard cardKey="h_best"
                    label="최장연속" val={`${longestStreak}일`} valColor="#F5A623"
                    sub={longestStreak > 0 && streak < longestStreak ? `현재 ${longestStreak - streak}일 남음` : longestStreak > 0 ? '신기록 중!' : ' '}
                    activeVal={longestStreak > 0 && streak < longestStreak ? `${longestStreak - streak}일 남음` : '신기록!'}
                    activeValColor={streak >= longestStreak ? UP : T.text}
                    activeSub={`현재 ${streak}일 연속`}
                  />
                </>);
              }
              return null;
            })()}
          </View>
        )}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 일간 */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'daily' && (
          <View style={isLandscape ? { flexDirection: 'row', gap: 10, alignItems: 'flex-start' } : {}}>
          <View style={isLandscape ? { flex: 1 } : {}}>

          {/* ── 집중밀도 + 목표달성률 2열 ── */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {todaySessions.length > 0 && (
              <TouchableOpacity style={[S.card, { backgroundColor: T.card, borderColor: T.border, flex: 1, marginBottom: 0, alignItems: 'center' }]}
                onPress={() => setShowDensityDetail(true)} activeOpacity={0.8}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>평균 집중밀도</Text>
                  <Text style={{ fontSize: 11, color: T.sub }}>탭 ▸</Text>
                </View>
                <View style={[S.tierBig, { backgroundColor: todayTier.color + '20', width: 52, height: 52, borderRadius: 16, marginBottom: 5 }]}>
                  <Text style={[S.tierBigT, { color: todayTier.color }]}>{todayTier.label}</Text>
                </View>
                <Text style={[S.tierScore, { color: T.text, fontSize: 18 }]}>{todayAvgDensity}점</Text>
                <Text style={[S.tierMsg, { color: todayTier.color, textAlign: 'center', marginTop: 2 }]}>{todayTier.message}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[S.card, { backgroundColor: T.card, borderColor: T.border, flex: 1, marginBottom: 0, alignItems: 'center' }]}
              onPress={() => setShowGoalDetail(true)} activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', alignItems: 'center', marginBottom: 4 }}>
                <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>목표 달성률</Text>
                <Text style={{ fontSize: 11, color: T.sub }}>탭 ▸</Text>
              </View>
              <GoalRing
                pct={Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100))}
                size={74} color={T.accent} bgColor={T.surface2}
              />
              <Text style={[S.sVal, { color: T.accent, fontSize: 16, marginTop: 5 }]}>{formatDuration(todayTotalSec)}</Text>
              {todayAvgDensity > 0 && todayTotalSec > 0 && (
                <Text style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>순공 {formatDuration(Math.round(todayTotalSec * todayAvgDensity / 100))}</Text>
              )}
              <Text style={[S.sLabel, { color: T.sub, marginTop: 2 }]}>목표 {formatDuration(app.settings.dailyGoalMin * 60)}</Text>
              {todayTotalSec >= app.settings.dailyGoalMin * 60 && (
                <Text style={{ fontSize: 13, color: T.accent, fontWeight: '700', marginTop: 4 }}>달성!</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── 오늘 플래너 달성률 ── */}
          {todayPlanRate !== null && (
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }]}>
              <Ionicons name="calendar-outline" size={20} color={T.sub} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>오늘 계획 달성률</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: todayPlanRate >= 100 ? T.gold || '#FFD700' : T.accent }}>{todayPlanRate}%</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: T.surface2, overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${todayPlanRate}%`, backgroundColor: todayPlanRate >= 100 ? T.gold || '#FFD700' : T.accent }} />
                </View>
              </View>
            </View>
          )}

          {/* ── Gantt 타임라인 ── */}
          {todaySessions.length > 0 && (
            <TouchableOpacity style={[S.card, { backgroundColor: T.card, borderColor: T.border }]} onPress={() => setShowTimelineModal(true)} activeOpacity={0.85}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>오늘 공부 타임라인</Text>
                <Text style={{ fontSize: 12, color: T.sub, lineHeight: 14 }}>탭: 시간대 상세 ▸</Text>
              </View>
              <View style={{ height: 52, position: 'relative', backgroundColor: T.surface2, borderRadius: 6, overflow: 'hidden', marginBottom: 5 }}>
                {/* 6시간 주요 구분선 */}
                {[6, 12, 18].map(h => (
                  <View key={h} style={{ position: 'absolute', left: `${h / 24 * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: T.sub + '40' }} />
                ))}
                {/* 3시간 보조 구분선 */}
                {[3, 9, 15, 21].map(h => (
                  <View key={h} style={{ position: 'absolute', left: `${h / 24 * 100}%`, top: 0, bottom: 0, width: 0.5, backgroundColor: T.sub + '18' }} />
                ))}
                {/* 세션 블록 */}
                {todaySessions.filter(s => s.startedAt).map(s => {
                  const d = new Date(s.startedAt);
                  const startPct = (d.getHours() * 3600 + d.getMinutes() * 60) / 86400 * 100;
                  const durPct = Math.min(100 - startPct, s.durationSec / 86400 * 100);
                  const sesSubj = getSessionSubject(s, app.subjects);
                  return (
                    <View key={s.id} style={{ position: 'absolute', left: `${startPct}%`, width: `${Math.max(0.6, durPct)}%`, height: '100%', backgroundColor: sesSubj.color, borderRadius: 3, overflow: 'hidden' }}>
                      {durPct > 5 && (
                        <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.95)', marginTop: 3, marginLeft: 3, marginRight: 2 }} numberOfLines={1}>{sesSubj.name}</Text>
                      )}
                      {durPct > 4 && (
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginLeft: 3 }} numberOfLines={1}>{Math.round(s.durationSec / 60)}분</Text>
                      )}
                    </View>
                  );
                })}
              </View>
              {/* 시간 레이블: 주요(0,6,12,18,24)는 크게, 보조(3,9,15,21)는 작게 */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 1 }}>
                {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
                  <Text key={h} style={{ fontSize: h % 6 === 0 ? 7 : 6, color: T.sub, opacity: h % 6 === 0 ? 1 : 0.45, marginTop: 1 }}>
                    {h % 6 === 0 ? `${h}시` : h}
                  </Text>
                ))}
              </View>
            </TouchableOpacity>
          )}

          {renderSubjects(daySubjects, '과목 비율')}

          </View><View style={isLandscape ? { flex: 1 } : {}}>
          {/* ── TODO 카드 ── */}
          {(() => {
            const todayTodos = app.todos.filter(t => !t.isTemplate && (t.scope === 'today' || t.scope == null));
            if (todayTodos.length === 0) return null;
            const doneCnt = todayTodos.filter(t => t.done).length;
            const pct = Math.round((doneCnt / todayTodos.length) * 100);
            const allDone = doneCnt === todayTodos.length;
            // 과목별 현황
            const subjectMap = {};
            todayTodos.forEach(t => {
              const key = t.subjectId || '__none__';
              if (!subjectMap[key]) subjectMap[key] = { label: t.subjectLabel || '미분류', color: t.subjectColor || T.sub, total: 0, done: 0 };
              subjectMap[key].total++;
              if (t.done) subjectMap[key].done++;
            });
            const subjKeys = Object.keys(subjectMap).filter(k => k !== '__none__');
            if (subjectMap['__none__']) subjKeys.push('__none__');
            return (
              <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={T.sub} />
                    <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>오늘 할 일</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: allDone ? '#27AE60' : T.accent }}>
                    {doneCnt}/{todayTodos.length}
                  </Text>
                </View>
                {/* 진행률 바 */}
                <View style={{ height: 6, backgroundColor: T.surface2, borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: allDone ? '#27AE60' : T.accent, width: `${pct}%` }} />
                </View>
                <Text style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>{pct}% 완료</Text>
                {/* 과목별 현황 */}
                {subjKeys.length > 1 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {subjKeys.map(k => {
                      const s = subjectMap[k];
                      return (
                        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: (s.color || T.sub) + '18', borderWidth: 1, borderColor: (s.color || T.sub) + '40' }}>
                          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: s.color || T.sub }} />
                          <Text style={{ fontSize: 12, color: s.color || T.sub, fontWeight: '700' }}>{s.label} {s.done}/{s.total}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                {/* 미완료 상위 3개 미리보기 */}
                {todayTodos.filter(t => !t.done).slice(0, 3).map(t => (
                  <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}>
                    {t.priority === 'high' && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#E17055' }} />}
                    {t.priority !== 'high' && <View style={{ width: 5 }} />}
                    <Text style={{ fontSize: 14, color: T.text, flex: 1 }} numberOfLines={1}>{t.text}</Text>
                    {t.subjectColor && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.subjectColor }} />}
                  </View>
                ))}
                {todayTodos.filter(t => !t.done).length > 3 && (
                  <Text style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>+ {todayTodos.filter(t => !t.done).length - 3}개 더</Text>
                )}
                {allDone && todayTodos.length > 0 && (
                  <Text style={{ fontSize: 14, color: '#27AE60', fontWeight: '800', textAlign: 'center', marginTop: 4 }}>오늘 할 일 올클리어!</Text>
                )}
              </View>
            );
          })()}

          {/* ── 세션 리스트 ── */}
          {todaySessions.length > 0 && (
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
              <Text style={[S.secLabel, { color: T.sub }]}>세션 기록 ({todaySessions.length}회)</Text>
              {todaySessions.slice().sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)).map(sess => {
                const subj = app.subjects.find(s => s.id === sess.subjectId);
                const startH = sess.startedAt ? formatHM(sess.startedAt) : '';
                const endH = sess.endedAt ? formatHM(sess.endedAt) : '';
                const tier = getTier(sess.focusDensity || 0);
                return (
                  <TouchableOpacity key={sess.id}
                    onPress={() => setSessionDetail(sess)}
                    style={[S.sessCard, { borderLeftColor: subj ? subj.color : '#B2BEC3' }]}
                    activeOpacity={0.75}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subj ? subj.color : '#B2BEC3' }} />
                        <Text style={{ fontSize: 14, fontWeight: subj ? '700' : '400', color: subj ? T.text : T.sub }}>{subj ? subj.name : (stripLeadingEmoji(sess.label) || '—')}</Text>
                      </View>
                      <Text style={{ fontSize: 14, color: T.sub }}>{startH}{endH ? ` ~ ${endH}` : ''}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, color: T.accent, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
                      <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '25' }]}>
                        <Text style={{ fontSize: 13, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
                      </View>
                      {sess.verified && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                          <Ionicons name="trophy" size={11} color="#F5A623" />
                          <Text style={{ fontSize: 11, color: '#F5A623', fontWeight: '700' }}>인증</Text>
                        </View>
                      )}
                    </View>
                    {sess.memo
                      ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Ionicons name="chatbubble-outline" size={11} color={T.sub} />
                          <Text style={{ fontSize: 13, color: T.sub }}>{sess.memo}</Text>
                        </View>
                      )
                      : <Text style={{ fontSize: 12, color: T.surface2, marginTop: 2 }}>+ 메모 추가</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* 취약 과목 알림 */}
          {weakSubjects.length > 0 && (
            <View style={[S.weakCard, { backgroundColor: T.accent + '18', borderColor: T.accent + '40' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Ionicons name="warning-outline" size={14} color={T.accent} />
                <Text style={[S.weakTitle, { color: T.accent, marginBottom: 0 }]}>최근 7일간 안 한 과목</Text>
              </View>
              <View style={S.weakChips}>
                {weakSubjects.map(s => (
                  <View key={s.id} style={[S.weakChip, { backgroundColor: T.surface2, borderColor: T.border, flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: s.color }} />
                    <Text style={[S.weakChipT, { color: T.text }]}>{s.name}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => {
                  const names = weakSubjects.map(s => s.name).join(', ');
                  Alert.alert(
                    '할일에 추가할까요?',
                    `${names}\n\n위 과목을 할일 목록에 추가합니다.`,
                    [
                      { text: '취소', style: 'cancel' },
                      {
                        text: '추가하기',
                        onPress: () => {
                          weakSubjects.forEach(s => app.addTodo({ text: `${s.name} 공부하기`, subjectId: s.id, subjectLabel: s.name, subjectColor: s.color }));
                          app.showToastCustom(`${weakSubjects.length}개 할일이 추가됐어요!`, 'taco');
                        },
                      },
                    ]
                  );
                }}
                style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: T.accent + '30', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="add-circle-outline" size={14} color={T.accent} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: T.accent }}>할일에 추가하기</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* ── 오늘 리포트 카드 버튼 ── */}
          <TouchableOpacity
            style={[S.reportBtn, { backgroundColor: T.accent }]}
            onPress={() => { setReportCheer(getInsight(todayTotalSec, todayAvgDensity, app.settings.streak)); setShowDayReport(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="clipboard-outline" size={24} color="white" />
            <View>
              <Text style={S.reportBtnTitle}>오늘 리포트 카드</Text>
              <Text style={S.reportBtnSub}>공유하고 기록으로 남기기</Text>
            </View>
            <Text style={S.reportBtnArrow}>→</Text>
          </TouchableOpacity>


          {/* 집중밀도 한 줄 가이드 */}
          {!app.settings.guideDensity && todaySessions.length > 0 && (
            <TouchableOpacity onPress={() => app.updateSettings({ guideDensity: true })}
              style={[S.card, { backgroundColor: T.accent + '10', borderColor: T.accent + '30', paddingVertical: 10 }]}>
              <Text style={{ fontSize: 13, color: T.accent, fontWeight: '700', textAlign: 'center' }}>
                집중밀도 = 같은 시간이라도 얼마나 집중했는지! 자세한 건 설정 &gt; 사용 가이드
              </Text>
            </TouchableOpacity>
          )}

          </View></View>
        )}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 주간 */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'weekly' && (
          <View style={isLandscape ? { flexDirection: 'row', gap: 10, alignItems: 'flex-start' } : {}}>
          <View style={isLandscape ? { flex: 1 } : {}}>

          {/* ── 주 탐색 헤더 ── */}
          <View style={[S.weekNavRow, { backgroundColor: T.card, borderColor: T.border }]}>
            <TouchableOpacity onPress={() => setWeekOffset(p => p - 1)} style={S.weekNavBtn} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}>
              <Text style={[S.weekNavArrow, { color: T.accent }]}>◀</Text>
            </TouchableOpacity>
            <Text style={[S.weekNavTitle, { color: T.text }]}>
              {weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난 주' : `${Math.abs(weekOffset)}주 전`}
            </Text>
            <TouchableOpacity onPress={() => setWeekOffset(p => Math.min(0, p + 1))} disabled={weekOffset >= 0} style={S.weekNavBtn} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}>
              <Text style={[S.weekNavArrow, { color: weekOffset >= 0 ? T.border : T.accent }]}>▶</Text>
            </TouchableOpacity>
          </View>

          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>7일간 공부량</Text>
            {weekData.map((d, i) => (
              <TouchableOpacity key={i} onPress={() => d.sec > 0 && setDayDetailDate(d.date)} activeOpacity={d.sec > 0 ? 0.7 : 1}>
                <View style={S.barRow}>
                  <Text style={[S.barDay, { color: d.isToday ? T.accent : T.sub }]}>{d.day}</Text>
                  <View style={[S.barTrack, { backgroundColor: T.surface2 }]}>
                    <View style={[S.barFill, { width: `${Math.max(1, (d.sec / weekMax) * 100)}%`, backgroundColor: d.isToday ? T.accent : T.purple || '#6C5CE7' }]} />
                  </View>
                  <Text style={[S.barTime, { color: d.sec > 0 ? T.text : T.sub }]}>{d.sec > 0 ? formatShort(d.sec) : '-'}</Text>
                  {i === weekBestDayIdx && d.sec > 0 && <Ionicons name="trophy" size={13} color={T.gold} style={{ marginLeft: 3 }} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── 주간 플래너 달성률 ── */}
          {weekPlanRate !== null && (
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }]}>
              <Ionicons name="calendar-outline" size={20} color={T.sub} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>주간 계획 달성률</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: weekPlanRate >= 100 ? T.gold || '#FFD700' : T.accent }}>{weekPlanRate}%</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: T.surface2, overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${weekPlanRate}%`, backgroundColor: weekPlanRate >= 100 ? T.gold || '#FFD700' : T.accent }} />
                </View>
              </View>
              {weekPlanRate >= 100 && <Ionicons name="checkmark-circle" size={18} color={T.gold || '#FFD700'} />}
            </View>
          )}

          </View><View style={isLandscape ? { flex: 1 } : {}}>
          {isLandscape ? renderDayDetailInline() : null}
          {(!isLandscape || !dayDetailDate) && (<>
          {/* ── 시간대별 집중력 분석 ── */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>시간대별 집중력 패턴 <Text style={{ fontSize: 11 }}>{weekOffset === 0 ? '(이번 주)' : weekOffset === -1 ? '(지난 주)' : `(${Math.abs(weekOffset)}주 전)`}</Text></Text>
            {timeZoneAnalysis.every(z => z.count === 0) ? (
              <Text style={[S.emptyText, { color: T.sub }]}>데이터가 더 쌓이면 패턴을 알 수 있어요</Text>
            ) : (
              <>
                {timeZoneAnalysis.map((zone, i) => {
                  const maxSec = Math.max(...timeZoneAnalysis.map(z => z.totalSec), 1);
                  const barW = zone.count > 0 ? Math.max(8, (zone.totalSec / maxSec) * 100) : 4;
                  const periodLabel = weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난 주' : `${Math.abs(weekOffset)}주 전`;
                  return (
                    <TouchableOpacity key={i} style={S.tzRow} onPress={() => zone.count > 0 && setTzDetail({ zone, periodLabel })} activeOpacity={zone.count > 0 ? 0.7 : 1}>
                      <Ionicons name={zone.icon} size={14} color={T.sub} style={{ width: 20 }} />
                      <Text style={[S.tzLabel, { color: T.sub }]}>{zone.label}</Text>
                      <View style={S.tzBarWrap}>
                        <View style={[S.tzBarTrack, { backgroundColor: T.surface2 }]}>
                          <View style={[S.tzBarFill, { width: `${barW}%`, backgroundColor: zone.tier ? zone.tier.color : T.surface2 }]} />
                        </View>
                        {zone.count > 0 && (
                          <Text style={[S.tzTime, { color: T.sub }]}>{formatShort(zone.totalSec)}</Text>
                        )}
                      </View>
                      {zone.count > 0 && zone.tier && (
                        <View style={[S.tzTierBadge, { backgroundColor: zone.tier.color + '25' }]}>
                          <Text style={[S.tzTierT, { color: zone.tier.color }]}>{zone.tier.label}</Text>
                        </View>
                      )}
                      {zone.count === 0 && (
                        <Text style={[S.tzEmpty, { color: T.surface2 }]}>-</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {bestZone && (
                  <View style={[S.bestZoneBanner, { backgroundColor: bestZone.tier ? bestZone.tier.color + '18' : T.surface2, borderColor: bestZone.tier ? bestZone.tier.color + '40' : T.border }]}>
                    <Ionicons name={bestZone.icon} size={14} color={bestZone.tier ? bestZone.tier.color : T.sub} />
                    <Text style={[S.bestZoneT, { color: bestZone.tier ? bestZone.tier.color : T.text, flex: 1 }]}>
                      {bestZone.label}에 집중력이 가장 높아요!
                    </Text>
                    {bestZone.tier && (
                      <Text style={{ fontSize: 13, fontWeight: '800', color: bestZone.tier.color }}>{bestZone.tier.label}</Text>
                    )}
                  </View>
                )}
              </>
            )}
          </View>

          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>집중 밀도 추이</Text>
            <View style={S.densityChart}>
              {weekData.map((d, i) => {
                const h = d.density > 0 ? Math.max(8, (d.density / 120) * 60) : 4;
                const tier = d.density > 0 ? getTier(d.density) : null;
                return (
                  <TouchableOpacity key={i} onPress={() => d.density > 0 && setDayDetailDate(d.date)} activeOpacity={d.density > 0 ? 0.7 : 1} style={S.densityCol}>
                    <View style={[S.densityBar, { height: h, backgroundColor: tier ? tier.color : T.surface2 }]} />
                    <Text style={[S.densityDay, { color: d.isToday ? T.accent : T.sub }]}>{d.day}</Text>
                    {tier && <Text style={[S.densityTier, { color: tier.color }]}>{tier.label}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {renderSubjects(weekSubjects, '주간 과목 비율')}

          {/* 주간 리포트 카드 버튼 */}
          <TouchableOpacity
            style={[S.reportBtn, { backgroundColor: T.accent }]}
            onPress={() => { setReportCheer(getInsight(weekTotal, weekAvgDensity, app.settings.streak)); setShowReport(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="clipboard-outline" size={24} color="white" />
            <View>
              <Text style={S.reportBtnTitle}>주간 리포트 카드</Text>
              <Text style={S.reportBtnSub}>공유하고 기록으로 남기기</Text>
            </View>
            <Text style={S.reportBtnArrow}>→</Text>
          </TouchableOpacity>
          </>)}
          </View></View>
        )}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 월간 */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'monthly' && (
          <View style={isLandscape ? { flexDirection: 'row', gap: 10, alignItems: 'flex-start' } : {}}>
          <View style={isLandscape ? { flex: 1 } : {}}>

          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={S.monthNav}>
              <TouchableOpacity onPress={() => setMonthOffset(p => p - 1)} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}>
                <Text style={[S.monthArrow, { color: T.accent }]}>◀</Text>
              </TouchableOpacity>
              <Text style={[S.monthTitle, { color: T.text }]}>{viewMonthStr}</Text>
              <TouchableOpacity onPress={() => setMonthOffset(p => Math.min(0, p + 1))} disabled={monthOffset >= 0} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}>
                <Text style={[S.monthArrow, { color: monthOffset >= 0 ? T.border : T.accent }]}>▶</Text>
              </TouchableOpacity>
            </View>
            <View style={S.calWeekRow}>
              {DAYS_KR.map(d => <Text key={d} style={[S.calWeekDay, { color: T.sub }]}>{d}</Text>)}
            </View>
            <View style={S.calGrid}>
              {calendarData.map((cell, i) => {
                if (!cell) return <View key={`e${i}`} style={S.calCell} />;
                return (
                  <TouchableOpacity key={cell.date} style={[S.calCell, cell.isToday && { borderWidth: 1.5, borderColor: T.accent, borderRadius: 6 }]} onPress={() => cell.sec > 0 && setDayDetailDate(cell.date)} activeOpacity={cell.sec > 0 ? 0.7 : 1}>
                    <View style={[S.calDot, { width: CELL, height: CELL, backgroundColor: getHeatColor(cell.sec) }]}>
                      <Text style={[S.calDay, { color: cell.sec > 0 ? (cell.sec / monthMaxSec > 0.5 ? 'white' : T.text) : T.sub }]}>{cell.day}</Text>
                    </View>
                    {cell.sec > 0 && <Text style={[S.calTime, { color: T.sub }]}>{cell.sec >= 3600 ? `${Math.floor(cell.sec / 3600)}h` : `${Math.floor(cell.sec / 60)}m`}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={S.heatLegend}>
              <Text style={[S.heatLegendT, { color: T.sub }]}>적음</Text>
              {[T.surface2, T.accent + '66', T.accent + '99', T.accent + 'CC', T.accent].map((c, i) => (
                <View key={i} style={[S.heatBox, { backgroundColor: c }]} />
              ))}
              <Text style={[S.heatLegendT, { color: T.sub }]}>많음</Text>
            </View>
          </View>
          </View><View style={isLandscape ? { flex: 1 } : {}}>
          {isLandscape ? renderDayDetailInline() : null}
          {(!isLandscape || !dayDetailDate) && (<>
          {renderSubjects(monthSubjects, `${viewMonthStr} 과목 비율`)}

          {/* ── 시간대별 집중력 분석 (월간) ── */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>시간대별 집중력 패턴 <Text style={{ fontSize: 11 }}>({viewMonthStr})</Text></Text>
            {monthTimeZoneAnalysis.every(z => z.count === 0) ? (
              <Text style={[S.emptyText, { color: T.sub }]}>데이터가 더 쌓이면 패턴을 알 수 있어요</Text>
            ) : (
              <>
                {monthTimeZoneAnalysis.map((zone, i) => {
                  const maxSec = Math.max(...monthTimeZoneAnalysis.map(z => z.totalSec), 1);
                  const barW = zone.count > 0 ? Math.max(8, (zone.totalSec / maxSec) * 100) : 4;
                  return (
                    <TouchableOpacity key={i} style={S.tzRow} onPress={() => zone.count > 0 && setTzDetail({ zone, periodLabel: viewMonthStr })} activeOpacity={zone.count > 0 ? 0.7 : 1}>
                      <Ionicons name={zone.icon} size={14} color={T.sub} style={{ width: 20 }} />
                      <Text style={[S.tzLabel, { color: T.sub }]}>{zone.label}</Text>
                      <View style={S.tzBarWrap}>
                        <View style={[S.tzBarTrack, { backgroundColor: T.surface2 }]}>
                          <View style={[S.tzBarFill, { width: `${barW}%`, backgroundColor: zone.tier ? zone.tier.color : T.surface2 }]} />
                        </View>
                        {zone.count > 0 && <Text style={[S.tzTime, { color: T.sub }]}>{formatShort(zone.totalSec)}</Text>}
                      </View>
                      {zone.count > 0 && zone.tier ? (
                        <View style={[S.tzTierBadge, { backgroundColor: zone.tier.color + '25' }]}>
                          <Text style={[S.tzTierT, { color: zone.tier.color }]}>{zone.tier.label}</Text>
                        </View>
                      ) : <Text style={[S.tzEmpty, { color: T.surface2 }]}>-</Text>}
                    </TouchableOpacity>
                  );
                })}
                {monthBestZone && (
                  <View style={[S.bestZoneBanner, { backgroundColor: monthBestZone.tier ? monthBestZone.tier.color + '18' : T.surface2, borderColor: monthBestZone.tier ? monthBestZone.tier.color + '40' : T.border }]}>
                    <Ionicons name={monthBestZone.icon} size={14} color={monthBestZone.tier ? monthBestZone.tier.color : T.sub} />
                    <Text style={[S.bestZoneT, { color: monthBestZone.tier ? monthBestZone.tier.color : T.text, flex: 1 }]}>
                      {monthBestZone.label}에 집중력이 가장 높아요!
                    </Text>
                    {monthBestZone.tier && (
                      <Text style={{ fontSize: 13, fontWeight: '800', color: monthBestZone.tier.color }}>{monthBestZone.tier.label}</Text>
                    )}
                  </View>
                )}
              </>
            )}
          </View>

          {/* ── 월간 리포트 카드 버튼 ── */}
          <TouchableOpacity
            style={[S.reportBtn, { backgroundColor: T.accent }]}
            onPress={() => { setReportCheer(getInsight(monthTotalSec, monthAvgDensity, app.settings.streak)); setShowMonthReport(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="clipboard-outline" size={24} color="white" />
            <View>
              <Text style={S.reportBtnTitle}>{viewMonthStr} 월간 리포트 카드</Text>
              <Text style={S.reportBtnSub}>공유하고 기록으로 남기기</Text>
            </View>
            <Text style={S.reportBtnArrow}>→</Text>
          </TouchableOpacity>
          </>)}
          </View></View>
        )}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 잔디 (365일 히트맵) */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'heatmap' && (
          <View style={isLandscape ? { flexDirection: 'row', gap: 10, alignItems: 'flex-start' } : {}}>
          <View style={isLandscape ? { flex: 1 } : {}}>

          {/* 잔디 한 줄 가이드 */}
          {!app.settings.guideHeatmap && (
            <TouchableOpacity onPress={() => app.updateSettings({ guideHeatmap: true })}
              style={[S.card, { backgroundColor: T.accent + '10', borderColor: T.accent + '30', paddingVertical: 10 }]}>
              <Text style={{ fontSize: 13, color: T.accent, fontWeight: '700', textAlign: 'center' }}>
                매일 공부하면 칸이 채워져요! 365일 초록색으로 채워보세요!
              </Text>
            </TouchableOpacity>
          )}

          {/* 365일 히트맵 */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={S.hmHeader}>
              <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>최근 6개월 공부 잔디</Text>
              <View style={[S.hmBadge, { backgroundColor: T.accent + '20' }]}>
                <Text style={[S.hmBadgeT, { color: T.accent }]}>{totalStudyDays365}일</Text>
              </View>
            </View>

            {/* 잔디 그리드 + 월 라벨 */}
            <View>
              <View>
                {/* 월 라벨 행 — 잔디 열 위치와 동일 기준으로 */}
                <View style={{ flexDirection: 'row', marginLeft: 16 + HM_GAP, marginBottom: 3 }}>
                  {heatmap365.map((week, wi) => {
                    const label = heatmapMonthLabels.find(ml => ml.wi === wi);
                    return (
                      <View key={wi} style={{ width: HM_CELL + HM_GAP }}>
                        {label && (
                          <Text style={[S.hmMonthLabel, { color: T.sub }]}>{label.label}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* 요일라벨 + 잔디 */}
                <View style={S.hmGrid}>
                  <View style={S.hmDayLabels}>
                    {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                      <Text key={i} style={[S.hmDayLabel, { color: T.sub, height: HM_CELL, lineHeight: HM_CELL }]}>{d}</Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: HM_GAP }}>
                    {heatmap365.map((week, wi) => (
                      <View key={wi} style={{ flexDirection: 'column', gap: HM_GAP }}>
                        {week.map((day, di) => (
                          <TouchableOpacity
                            key={di}
                            onPress={() => !day.isFuture && setDayDetailDate(day.date)}
                            activeOpacity={!day.isFuture ? 0.6 : 1}
                            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          >
                            <View
                              style={[
                                S.hmCell,
                                {
                                  width: HM_CELL,
                                  height: HM_CELL,
                                  backgroundColor: getHeat365Color(day),
                                  borderWidth: day.isToday ? 1.5 : 0,
                                  borderColor: day.isToday ? T.accent : 'transparent',
                                },
                              ]}
                            >
                              {day.hasVerified && !day.isFuture && (
                                <Ionicons name="star" size={8} color="#FFF" />
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            {/* 범례 — 시간 기준 표시 */}
            <View style={S.heatLegend}>
              <View style={[S.heatBox, { backgroundColor: T.surface2 }]} />
              <Text style={[S.heatLegendT, { color: T.sub }]}>0</Text>
              {[T.heat1, T.heat2, T.heat3, T.heat4].map((c, i) => (
                <React.Fragment key={i}>
                  <View style={[S.heatBox, { backgroundColor: c }]} />
                  <Text style={[S.heatLegendT, { color: T.sub }]}>{['30분', '1시간', '2시간', '4시간+'][i]}</Text>
                </React.Fragment>
              ))}
            </View>
            <View style={[S.heatLegend, { marginTop: 6 }]}>
              <View style={[S.heatBox, { backgroundColor: T.heat3 }]} /><Ionicons name="book-outline" size={12} color={T.sub} style={{ marginLeft: 2 }} /><Text style={[S.heatLegendT, { color: T.sub }]}>편하게</Text>
              <View style={[S.heatBox, { backgroundColor: '#388E3C', marginLeft: 8 }]} /><Ionicons name="flame" size={12} color={T.sub} style={{ marginLeft: 2 }} /><Text style={[S.heatLegendT, { color: T.sub }]}>집중</Text>
              <View style={[S.heatBox, { backgroundColor: '#F0C030', marginLeft: 8 }]} /><Ionicons name="trophy" size={12} color={T.sub} style={{ marginLeft: 2 }} /><Text style={[S.heatLegendT, { color: T.sub }]}>Verified</Text>
            </View>
            <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', marginTop: 10, opacity: 0.6 }}>
              잔디를 탭하면 날짜별 상세 통계를 볼 수 있어요
            </Text>
          </View>

          </View><View style={isLandscape ? { flex: 1 } : {}}>
          {isLandscape ? renderDayDetailInline() : null}
          {(!isLandscape || !dayDetailDate) && (<>
          {/* 공부 일기 (메모 있는 세션 전체, 날짜별 그룹) */}
          {(() => {
            const memoed = [...app.sessions]
              .filter(s => s.memo && s.memo.trim())
              .sort((a, b) => (b.date > a.date ? 1 : -1));
            if (memoed.length === 0) return (
              <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="journal-outline" size={13} color={T.sub} />
                  <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>공부 일기</Text>
                </View>
                <Text style={[S.emptyText, { color: T.sub }]}>타이머 완료 후 메모를 남기면{'\n'}날짜별로 여기 쌓여요</Text>
              </View>
            );
            const grouped = {};
            memoed.forEach(s => { if (!grouped[s.date]) grouped[s.date] = []; grouped[s.date].push(s); });
            return (
              <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>공부 일기</Text>
                  <Text style={[{ fontSize: 11, color: T.sub }]}>탭하면 수정</Text>
                </View>
                {Object.entries(grouped).map(([date, sess]) => {
                  const d = new Date(date);
                  const dateLabel = date === today ? '오늘' : `${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '/' : ''}${d.getMonth() + 1}/${d.getDate()}(${DAYS_KR[d.getDay()]})`;
                  return (
                    <View key={date} style={S.diaryGroup}>
                      <Text style={[S.diaryDate, { color: T.accent }]}>{dateLabel}</Text>
                      {sess.map(s => {
                        const subj = app.subjects.find(sub => sub.id === s.subjectId);
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={[S.diaryRow, { borderLeftColor: subj ? subj.color : T.accent }]}
                            onPress={() => { setEditMemo({ sessionId: s.id, memo: s.memo }); setEditMemoText(s.memo || ''); }}
                            activeOpacity={0.7}
                          >
                            <Text style={[S.diaryMemo, { color: T.text }]}>{s.memo}</Text>
                            <Text style={[S.diaryMeta, { color: T.sub }]}>
                              {subj ? subj.name : (stripLeadingEmoji(s.label) || '—')} · {formatShort(s.durationSec)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* ── 역대 기록 ── */}
          {personalBests && personalBests.bestDaySec > 0 && (
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                <Ionicons name="trophy-outline" size={14} color={T.accent} />
                <Text style={[S.secLabel, { color: T.accent, marginBottom: 0 }]}>역대 기록</Text>
              </View>

              {/* 2열 그리드 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {/* 하루 최장 공부 */}
                <View style={{ flex: 1, minWidth: '45%', backgroundColor: T.surface2, borderRadius: 10, padding: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Ionicons name="flame" size={12} color="#E17055" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>하루 최장</Text>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: T.text }}>{formatDuration(personalBests.bestDaySec)}</Text>
                  {personalBests.bestDayDate && (
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>
                      {(() => { const d = new Date(personalBests.bestDayDate); return `${d.getMonth()+1}/${d.getDate()}(${DAYS_KR[d.getDay()]})`; })()}
                    </Text>
                  )}
                </View>

                {/* 최장 단일 세션 */}
                {personalBests.longestSess && (
                  <View style={{ flex: 1, minWidth: '45%', backgroundColor: T.surface2, borderRadius: 10, padding: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <Ionicons name="timer-outline" size={12} color="#4A90D9" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>최장 세션</Text>
                    </View>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: T.text }}>{formatDuration(personalBests.longestSess.durationSec)}</Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>
                      {(() => { const s = personalBests.longestSess; const subj = app.subjects.find(x => x.id === s.subjectId); return subj ? subj.name : (stripLeadingEmoji(s.label) || '—'); })()}
                    </Text>
                  </View>
                )}

                {/* 최고 집중밀도 */}
                {personalBests.bestDensitySess && (
                  <View style={{ flex: 1, minWidth: '45%', backgroundColor: T.surface2, borderRadius: 10, padding: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <Ionicons name="sparkles-outline" size={12} color="#FFD700" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>최고 밀도</Text>
                    </View>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: getTier(personalBests.bestDensitySess.focusDensity).color }}>
                      {personalBests.bestDensitySess.focusDensity}점
                    </Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>
                      {getTier(personalBests.bestDensitySess.focusDensity).label}
                    </Text>
                  </View>
                )}

                {/* 하루 최다 세션 */}
                <View style={{ flex: 1, minWidth: '45%', backgroundColor: T.surface2, borderRadius: 10, padding: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Ionicons name="layers-outline" size={12} color="#6C5CE7" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>최다 세션</Text>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: T.text }}>{personalBests.mostSessCount}회</Text>
                  {personalBests.mostSessDate && (
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>
                      {(() => { const d = new Date(personalBests.mostSessDate); return `${d.getMonth()+1}/${d.getDate()}(${DAYS_KR[d.getDay()]})`; })()}
                    </Text>
                  )}
                </View>
              </View>

              {/* 최장 연속 + 총 공부일 */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <View style={{ flex: 1, backgroundColor: '#FF7F5010', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="flame" size={18} color="#FF7F50" />
                  <View>
                    <Text style={{ fontSize: 10, color: T.sub, fontWeight: '600' }}>최장 연속</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#FF7F50' }}>{longestStreak}일</Text>
                  </View>
                </View>
                <View style={{ flex: 1, backgroundColor: T.accent + '10', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar" size={18} color={T.accent} />
                  <View>
                    <Text style={{ fontSize: 10, color: T.sub, fontWeight: '600' }}>총 공부일</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: T.accent }}>{totalStudyDays365}일</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ── 잔디 리포트 카드 버튼 ── */}
          <TouchableOpacity
            style={[S.reportBtn, { backgroundColor: T.accent }]}
            onPress={() => { setReportCheer(getInsight(yearTotalSec, 0, app.settings.streak)); setShowHeatReport(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="leaf-outline" size={24} color="white" />
            <View>
              <Text style={S.reportBtnTitle}>공부 기록 카드</Text>
              <Text style={S.reportBtnSub}>잔디 기록 공유하기</Text>
            </View>
            <Text style={S.reportBtnArrow}>→</Text>
          </TouchableOpacity>
          </>)}
          </View></View>
        )}

        {/* ── 과목 탭 ── */}
        {tab === 'subject' && (<>
          {/* 기간 선택 */}
          <View style={S.subjPeriodRow}>
            {[['7d', '7일'], ['30d', '30일'], ['all', '전체']].map(([val, label]) => (
              <TouchableOpacity
                key={val}
                style={[S.subjPeriodBtn, {
                  backgroundColor: subjPeriod === val ? T.accent : T.surface2,
                  borderColor: subjPeriod === val ? T.accent : T.border,
                }]}
                onPress={() => setSubjPeriod(val)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={[S.subjPeriodBtnT, { color: subjPeriod === val ? 'white' : T.sub }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {subjectAllStats.length === 0 ? (
            <Text style={[S.emptyText, { color: T.sub, marginTop: 40 }]}>아직 공부 기록이 없어요</Text>
          ) : (<>
            {/* 요약 카드 */}
            {(() => {
              const allSec = subjectAllStats.reduce((s, x) => s + x.sec, 0);
              const totalSess = subjectAllStats.reduce((s, x) => s + x.sessions, 0);
              const avgD = totalSess > 0 ? Math.round(subjectAllStats.reduce((s, x) => s + x.densitySum, 0) / totalSess) : 0;
              const avgTier = getTier(avgD);
              const pureSec = avgD > 0 && allSec > 0 ? Math.round(allSec * avgD / 100) : 0;
              const UP = '#00B894'; const DN = '#E17055';
              const mkCard = (key, label, val, valColor, sub, activeVal, activeValColor, activeSub) => {
                const isActive = activeCard === key;
                return (
                  <TouchableOpacity
                    style={[S.summaryCard, { flex: 1, backgroundColor: isActive ? T.surface2 : T.card, borderColor: isActive ? T.accent : T.border }]}
                    onPress={() => tapCard(key)} activeOpacity={0.7}
                  >
                    <Text style={[S.sLabel, { color: T.sub }]}>{label}</Text>
                    <Text style={[S.sVal, { color: isActive ? activeValColor : valColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {isActive ? activeVal : val}
                    </Text>
                    <Text style={[S.sSub, { color: isActive ? (activeValColor || T.sub) : T.sub }]}>
                      {isActive ? (activeSub || ' ') : (sub || ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              };
              return (
                <View style={[S.summaryRow, { marginBottom: 12 }]}>
                  {mkCard('s_count', '공부 과목', `${subjectAllStats.length}개`, T.text, null,
                    `${subjectAllStats.length}개`, T.text, `세션 ${totalSess}회`)}
                  {mkCard('s_time', '총 공부시간', formatDuration(allSec), T.accent,
                    pureSec > 0 ? `순공 ${formatShort(pureSec)}` : null,
                    pureSec > 0 ? `순공 ${formatShort(pureSec)}` : '-', T.accent,
                    pureSec > 0 ? `전체의 ${Math.round(pureSec / allSec * 100)}%` : ' ')}
                  {mkCard('s_density', '평균 밀도',
                    avgD > 0 ? `${avgTier.label} ${avgD}점` : '-', avgD > 0 ? avgTier.color : T.sub, null,
                    avgD > 0 ? `${avgD}점` : '-', avgD > 0 ? avgTier.color : T.sub,
                    avgD > 0 ? avgTier.message : ' ')}
                </View>
              );
            })()}

            {/* 스택 비율 바 + 과목 리스트 */}
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
              <Text style={[S.secLabel, { color: T.sub }]}>과목별 비율</Text>
              <View style={[S.stackBar, { backgroundColor: T.surface2, marginBottom: 14 }]}>
                {subjectAllStats.map((s, i) => (
                  <View key={i} style={[S.stackSeg, { width: `${Math.max(2, s.pct)}%`, backgroundColor: s.color }]} />
                ))}
              </View>
              {subjectAllStats.map((s, i) => {
                const sTier = getTier(s.avgDensity);
                return (
                  <TouchableOpacity key={i} style={S.subjListItem} onPress={() => setSubjDetail(s.id)} activeOpacity={0.7}>
                    <View style={[S.subjDot, { backgroundColor: s.color }]} />
                    <Text style={[S.subjName, { color: T.text, flex: 1 }]} numberOfLines={1}>{s.name}</Text>
                    <View style={S.subjListBarTrack}>
                      <View style={[S.subjListBarFill, { width: `${Math.max(2, s.pct)}%`, backgroundColor: s.color + 'CC' }]} />
                    </View>
                    <Text style={[S.subjPct, { color: T.sub, minWidth: 28, textAlign: 'right' }]}>{s.pct}%</Text>
                    {s.avgDensity > 0 && (
                      <View style={{ backgroundColor: sTier.color + '20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: sTier.color }}>{sTier.label}</Text>
                      </View>
                    )}
                    <Text style={[S.subjTime, { color: T.text, minWidth: 46, textAlign: 'right' }]}>{formatShort(s.sec)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 균형 지표 카드 */}
            {subjectAllStats.length >= 2 && (() => {
              const top = subjectAllStats[0];
              const neglected = [...subjectAllStats].sort((a, b) => a.lastDate.localeCompare(b.lastDate))[0];
              const daysSince = neglected.lastDate
                ? Math.floor((new Date(today) - new Date(neglected.lastDate)) / 864e5)
                : null;
              return (
                <View style={[S.subjInsightCard, { backgroundColor: T.card, borderColor: T.border, borderWidth: 1 }]}>
                  <Text style={[S.secLabel, { color: T.sub }]}>균형 지표</Text>
                  <View style={S.subjInsightRow}>
                    <Ionicons name="trending-up-outline" size={20} color={T.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: T.sub, marginBottom: 2 }}>가장 집중한 과목</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>
                        {top.name}
                        <Text style={{ fontSize: 14, fontWeight: '400', color: T.accent }}>  {formatShort(top.sec)} ({top.pct}%)</Text>
                      </Text>
                    </View>
                  </View>
                  <View style={[S.subjInsightRow, { borderTopWidth: 1, borderTopColor: T.border, paddingTop: 10 }]}>
                    <Ionicons name="time-outline" size={20} color={T.sub} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: T.sub, marginBottom: 2 }}>가장 소홀한 과목</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>
                        {neglected.name}
                        {daysSince !== null && daysSince > 0 && (
                          <Text style={{ fontSize: 14, fontWeight: '400', color: '#E17055' }}>  ({daysSince}일째 미공부)</Text>
                        )}
                        {daysSince === 0 && (
                          <Text style={{ fontSize: 14, fontWeight: '400', color: '#00B894' }}>  (오늘 공부함)</Text>
                        )}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })()}
          </>)}
        </>)}


        {/* ── 인사이트 (오늘 세션 있을 때) ── */}
        {todaySessions.length > 0 && (
          <View style={[S.insightCard, { backgroundColor: T.card, borderColor: T.accent + '40' }]}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={38} mood={app.mood} />
            <Text style={[S.insightText, { color: T.text }]}>{insightMsg}</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── 메모 수정 모달 ── */}
      <Modal visible={!!editMemo} transparent animationType="none" onRequestClose={() => setEditMemo(null)} onShow={() => { memoInputRef.current?.focus(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={S.mo}>
          <View style={S.moScroll}>
            <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border, borderRadius: 20, padding: 16, margin: 20 }, isTablet && { width: 540, alignSelf: 'center', marginHorizontal: 0 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Ionicons name="document-text-outline" size={16} color={T.text} />
                <Text style={[S.modalTitle, { color: T.text, marginBottom: 0 }]}>메모 수정</Text>
              </View>
              <TextInput
                ref={memoInputRef}
                value={editMemoText}
                onChangeText={setEditMemoText}
                style={[S.memoEditInput, { borderColor: T.border, backgroundColor: T.surface2, color: T.text }]}
                maxLength={50}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (editMemo) {
                    app.updateSessionMemo(editMemo.sessionId, editMemoText);
                    if (sessionDetail && sessionDetail.id === editMemo.sessionId) setSessionDetail(prev => ({ ...prev, memo: editMemoText }));
                  }
                  setEditMemo(null);
                }}
              />
              <Text style={[{ fontSize: 11, color: T.sub, textAlign: 'right', marginBottom: 14 }]}>{editMemoText.length}/50</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[S.mCancel, { borderColor: T.border, flex: 1 }]} onPress={() => setEditMemo(null)}>
                  <Text style={[S.mCancelT, { color: T.sub }]}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.mConfirm, { backgroundColor: T.accent, flex: 1 }]}
                  onPress={() => {
                    if (editMemo) {
                      app.updateSessionMemo(editMemo.sessionId, editMemoText);
                      if (sessionDetail && sessionDetail.id === editMemo.sessionId) setSessionDetail(prev => ({ ...prev, memo: editMemoText }));
                    }
                    setEditMemo(null);
                  }}
                >
                  <Text style={S.mConfirmT}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 주간 리포트 카드 모달 ── */}
      <Modal visible={showReport} transparent animationType="fade">
        <View style={S.mo}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={S.moScroll}>
            <ViewShot ref={reportRef} options={{ format: 'png', quality: 1 }}>
              <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540, alignSelf: 'center' }]}>
                <ReportGradientHeader accent={T.accent} icon="bar-chart-outline" title="주간 리포트" subtitle={`${dateStr(addDays(new Date(), -6))} ~ ${today}`} characterId={app.settings.mainCharacter} />

                {/* 히어로 지표 — 총 공부시간 강조 */}
                <View style={{ alignItems: 'center', paddingTop: 18, paddingBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub, letterSpacing: 1, textTransform: 'uppercase' }}>총 공부시간</Text>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: T.accent, marginTop: 2 }}>{formatDuration(weekTotal)}</Text>
                </View>

                {/* 밀도 + 공부일 */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 14, gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: getTier(weekAvgDensity).color + '14', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <View style={{ backgroundColor: getTier(weekAvgDensity).color + '28', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: getTier(weekAvgDensity).color }}>{getTier(weekAvgDensity).label}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: getTier(weekAvgDensity).color }}>{weekAvgDensity}점</Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>집중밀도</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: T.surface2, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: T.text }}>{weekStudyDays}<Text style={{ fontSize: 14, color: T.sub }}>/7</Text></Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 4 }}>공부일</Text>
                  </View>
                </View>

                {/* 7일 공부량 바 차트 */}
                <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 56 }}>
                    {weekData.map((d, i) => {
                      const barH = d.sec > 0 ? Math.max(8, Math.round((d.sec / weekMax) * 40)) : 4;
                      const goalMet = d.sec >= (app.settings.dailyGoalMin || 0) * 60 && d.sec > 0;
                      return (
                        <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 56 }}>
                          {d.sec > 0 && <Text style={{ fontSize: 8, color: T.sub, marginBottom: 2 }}>{formatShort(d.sec)}</Text>}
                          <View style={{ width: '68%', height: barH, backgroundColor: d.sec === 0 ? T.surface2 : goalMet ? T.accent : T.accent + '88', borderRadius: 4 }} />
                          <Text style={{ fontSize: 10, color: d.isToday ? T.accent : T.sub, marginTop: 3, fontWeight: d.isToday ? '800' : '400' }}>{d.day}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* 지난주 대비 + 연속 */}
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, flex: 1 }]}>
                    {(() => {
                      const diff = weekTotal - weekPrevTotal;
                      const isUp = diff >= 0;
                      return (<>
                        <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>지난주 대비</Text>
                        <Text style={{ fontSize: 17, fontWeight: '900', color: isUp ? '#00C781' : '#FF6B6B', marginTop: 3 }}>
                          {isUp ? '▲' : '▼'} {formatShort(Math.abs(diff))}
                        </Text>
                      </>);
                    })()}
                  </View>
                  <View style={[S.reportMiniCard, { backgroundColor: '#FF7F5010', flex: 1 }]}>
                    <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>연속 공부</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Ionicons name="flame" size={16} color="#E17055" />
                      <Text style={{ fontSize: 17, fontWeight: '900', color: '#FF7F50' }}>{app.settings.streak}일</Text>
                    </View>
                  </View>
                </View>

                {/* 과목 비율 바 */}
                <SubjectProportionBar subjects={weekSubjects} T={T} />

                {/* 이번 주 플래너 달성률 */}
                {weekPlanRate !== null && (
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, marginHorizontal: 16, marginBottom: 12 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="calendar-outline" size={12} color={T.sub} />
                      <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>이번 주 계획 달성률</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <View style={{ flex: 1, height: 7, borderRadius: 3.5, backgroundColor: T.border, overflow: 'hidden' }}>
                        <View style={{ height: 7, borderRadius: 3.5, width: `${weekPlanRate}%`, backgroundColor: weekPlanRate >= 100 ? T.gold || '#FFD700' : T.accent }} />
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: weekPlanRate >= 100 ? T.gold || '#FFD700' : T.accent }}>{weekPlanRate}%</Text>
                    </View>
                  </View>
                )}

                {/* 이번 주 할일 완료율 */}
                {(() => {
                  const wTodos = app.todos.filter(t => !t.isTemplate && (t.scope === 'today' || t.scope == null));
                  if (wTodos.length === 0) return null;
                  const wDone = wTodos.filter(t => t.done).length;
                  const wPct = Math.round((wDone / wTodos.length) * 100);
                  return (
                    <View style={[S.reportMiniCard, { backgroundColor: T.surface2, marginHorizontal: 16, marginBottom: 12 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="checkmark-circle-outline" size={12} color={T.sub} />
                        <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>이번 주 할 일 완료율</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <View style={{ flex: 1, height: 7, borderRadius: 3.5, backgroundColor: T.border, overflow: 'hidden' }}>
                          <View style={{ height: 7, borderRadius: 3.5, width: `${wPct}%`, backgroundColor: wPct >= 100 ? '#27AE60' : T.accent }} />
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: wPct >= 100 ? '#27AE60' : T.accent }}>
                          {wDone}/{wTodos.length} ({wPct}%)
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                {/* 투명성 리포트 */}
                {(weekFocusStats.screenOnSessions > 0 || weekFocusStats.screenOffSessions > 0) && (
                  <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 12 }}>
                    <View style={[S.reportMiniCard, { backgroundColor: '#FF6B6B10', flex: 1, alignItems: 'center' }]}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: '#FF6B6B' }}>{weekFocusStats.screenOnSessions}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Ionicons name="flame" size={11} color="#E17055" />
                        <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>집중</Text>
                      </View>
                    </View>
                    <View style={[S.reportMiniCard, { backgroundColor: '#4CAF5010', flex: 1, alignItems: 'center' }]}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: '#4CAF50' }}>{weekFocusStats.screenOffSessions}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Ionicons name="book-outline" size={11} color={T.sub} />
                        <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>편하게</Text>
                      </View>
                    </View>
                    <View style={[S.reportMiniCard, { backgroundColor: '#FFD70010', flex: 1, alignItems: 'center' }]}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFD700' }}>{weekFocusStats.verifiedSessions}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Ionicons name="trophy" size={11} color="#F5A623" />
                        <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>Verified</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* 캐릭터 응원 메시지 */}
                <ReportFooterMessage message={reportCheer} characterId={app.settings.mainCharacter} T={T} />

                <ReportWatermark T={T} tag="#공부스타그램" />
              </View>
            </ViewShot>

            {/* 공유/닫기 버튼 (캡처 영역 밖) */}
            <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 8, paddingBottom: 20 }}>
              <TouchableOpacity style={[S.shareBtn, { backgroundColor: T.accent }]} onPress={handleShareReport} activeOpacity={0.85}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="share-outline" size={16} color="white" />
                  <Text style={S.shareBtnT}>이미지로 공유</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowReport(false)} style={[S.shareBtn, { backgroundColor: T.accent }]} activeOpacity={0.85}>
                <Text style={S.shareBtnT}>닫기</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── 오늘 리포트 카드 모달 ── */}
      <Modal visible={showDayReport} transparent animationType="fade">
        <View style={S.mo}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={S.moScroll}>
            <ViewShot ref={dayReportRef} options={{ format: 'png', quality: 1 }}>
              <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540, alignSelf: 'center' }]}>
                <ReportGradientHeader accent={T.accent} icon="today-outline" title="오늘 리포트" subtitle={today} characterId={app.settings.mainCharacter} />

                {/* 히어로 — 총 공부시간 */}
                <View style={{ alignItems: 'center', paddingTop: 18, paddingBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub, letterSpacing: 1, textTransform: 'uppercase' }}>총 공부시간</Text>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: T.accent, marginTop: 2 }}>{formatDuration(todayTotalSec)}</Text>
                </View>

                {/* 밀도 + 목표달성 */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 14, gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: getTier(todayAvgDensity).color + '14', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <View style={{ backgroundColor: getTier(todayAvgDensity).color + '28', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: getTier(todayAvgDensity).color }}>{getTier(todayAvgDensity).label}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: getTier(todayAvgDensity).color }}>{todayAvgDensity}점</Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>집중밀도</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: T.surface2, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    {(() => {
                      const goalPct = Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100));
                      return (<>
                        <Text style={{ fontSize: 24, fontWeight: '900', color: goalPct >= 100 ? '#27AE60' : T.accent }}>{goalPct}%</Text>
                        <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>목표 {formatDuration(app.settings.dailyGoalMin * 60)}</Text>
                      </>);
                    })()}
                  </View>
                </View>

                {/* 미니 Gantt 타임라인 */}
                {todaySessions.filter(s => s.startedAt).length > 0 && (() => {
                  return (
                    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                        <Ionicons name="time-outline" size={11} color={T.sub} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>타임라인</Text>
                      </View>
                      <View style={{ height: 16, position: 'relative', backgroundColor: T.surface2, borderRadius: 5, overflow: 'hidden', marginBottom: 3 }}>
                        {[6, 12, 18].map(h => (
                          <View key={h} style={{ position: 'absolute', left: `${h / 24 * 100}%`, top: 0, bottom: 0, width: 0.5, backgroundColor: T.sub + '40' }} />
                        ))}
                        {todaySessions.filter(s => s.startedAt).map(s => {
                          const d = new Date(s.startedAt);
                          const startPct = (d.getHours() * 3600 + d.getMinutes() * 60) / 86400 * 100;
                          const durPct = Math.min(100 - startPct, (s.durationSec || 0) / 86400 * 100);
                          const sesSubj = getSessionSubject(s, app.subjects);
                          return <View key={s.id} style={{ position: 'absolute', left: `${startPct}%`, width: `${Math.max(0.8, durPct)}%`, height: '100%', backgroundColor: sesSubj.color, borderRadius: 3 }} />;
                        })}
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        {['0시', '6시', '12시', '18시', '24시'].map(l => (
                          <Text key={l} style={{ fontSize: 9, color: T.sub }}>{l}</Text>
                        ))}
                      </View>
                    </View>
                  );
                })()}

                {/* 연속 공부 */}
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
                  <View style={[S.reportMiniCard, { backgroundColor: '#FF7F5010', flex: 1 }]}>
                    <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>연속 공부</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Ionicons name="flame" size={16} color="#E17055" />
                      <Text style={{ fontSize: 17, fontWeight: '900', color: '#FF7F50' }}>{app.settings.streak}일</Text>
                    </View>
                  </View>
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, flex: 1 }]}>
                    <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>세션</Text>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: T.text, marginTop: 3 }}>{todaySessions.length}회</Text>
                  </View>
                </View>

                {/* 과목 비율 바 */}
                <SubjectProportionBar subjects={daySubjects} T={T} />

                {/* 캐릭터 응원 메시지 */}
                <ReportFooterMessage message={reportCheer} characterId={app.settings.mainCharacter} T={T} />

                <ReportWatermark T={T} tag="#공부스타그램" />
              </View>
            </ViewShot>
            <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 8, paddingBottom: 20 }}>
              <TouchableOpacity style={[S.shareBtn, { backgroundColor: T.accent }]} onPress={handleShareDayReport} activeOpacity={0.85}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="share-outline" size={16} color="white" />
                  <Text style={S.shareBtnT}>이미지로 공유</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowDayReport(false)} style={[S.shareBtn, { backgroundColor: T.accent }]} activeOpacity={0.85}>
                <Text style={S.shareBtnT}>닫기</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── 월간 리포트 카드 모달 ── */}
      <Modal visible={showMonthReport} transparent animationType="fade">
        <View style={S.mo}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={S.moScroll}>
            <ViewShot ref={monthReportRef} options={{ format: 'png', quality: 1 }}>
              <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540, alignSelf: 'center' }]}>
                <ReportGradientHeader accent={T.accent} icon="calendar-outline" title={`${viewMonthStr} 월간 리포트`} subtitle={`공부일 ${monthStudyDays}일 / ${calendarData.filter(Boolean).length}일`} characterId={app.settings.mainCharacter} />

                {/* 히어로 — 총 공부시간 */}
                <View style={{ alignItems: 'center', paddingTop: 18, paddingBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub, letterSpacing: 1, textTransform: 'uppercase' }}>총 공부시간</Text>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: T.accent, marginTop: 2 }}>{formatDuration(monthTotalSec)}</Text>
                </View>

                {/* 밀도 + 공부일 */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 14, gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: getTier(monthAvgDensity).color + '14', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <View style={{ backgroundColor: getTier(monthAvgDensity).color + '28', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: getTier(monthAvgDensity).color }}>{getTier(monthAvgDensity).label}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: getTier(monthAvgDensity).color }}>{monthAvgDensity}점</Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>집중밀도</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: T.surface2, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: T.accent }}>
                      {calendarData.filter(Boolean).length > 0 ? Math.round(monthStudyDays / calendarData.filter(Boolean).length * 100) : 0}%
                    </Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 4 }}>공부 비율</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#FF7F5010', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="flame" size={16} color="#E17055" />
                      <Text style={{ fontSize: 20, fontWeight: '900', color: '#FF7F50' }}>{app.settings.streak}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 4 }}>연속 공부</Text>
                  </View>
                </View>

                {/* 이달 최고 기록일 + 요일별 패턴 */}
                {(() => {
                  const studiedDays = calendarData.filter(d => d && d.sec > 0);
                  if (studiedDays.length === 0) return null;
                  const bestDay = [...studiedDays].sort((a, b) => b.sec - a.sec)[0];
                  const wdSecs = [0,0,0,0,0,0,0];
                  studiedDays.forEach(d => { wdSecs[new Date(d.date).getDay()] += d.sec; });
                  const wdMax = Math.max(...wdSecs, 1);
                  const bestTier = getTier(bestDay.density || 0);
                  return (
                    <>
                      <View style={[S.reportMiniCard, { backgroundColor: T.surface2, marginHorizontal: 16, marginBottom: 10 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="trophy" size={12} color={T.gold || '#FFD700'} />
                          <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>이달 최고 기록일</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                          <Text style={{ fontSize: 15, fontWeight: '900', color: T.text }}>
                            {bestDay.date.slice(5).replace('-', '/')}({DAYS_KR[new Date(bestDay.date).getDay()]})
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>{formatShort(bestDay.sec)}</Text>
                          {bestDay.density > 0 && (
                            <View style={{ backgroundColor: bestTier.color + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 'auto' }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: bestTier.color }}>{bestTier.label}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 7 }}>
                          <Ionicons name="calendar-outline" size={11} color={T.sub} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>요일별 공부량</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 56 }}>
                          {DAYS_KR.map((label, i) => {
                            const barH = wdSecs[i] > 0 ? Math.max(8, Math.round((wdSecs[i] / wdMax) * 40)) : 4;
                            return (
                              <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 56 }}>
                                <View style={{ width: '72%', height: barH, backgroundColor: wdSecs[i] > 0 ? T.accent : T.surface2, borderRadius: 4 }} />
                                <Text style={{ fontSize: 10, color: T.sub, marginTop: 3, fontWeight: (i === 0 || i === 6) ? '700' : '400' }}>{label}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  );
                })()}

                {/* 과목 비율 바 */}
                <SubjectProportionBar subjects={monthSubjects} T={T} />

                {/* 캐릭터 응원 메시지 */}
                <ReportFooterMessage message={reportCheer} characterId={app.settings.mainCharacter} T={T} />

                <ReportWatermark T={T} tag="#공부스타그램" />
              </View>
            </ViewShot>
            <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 8, paddingBottom: 20 }}>
              <TouchableOpacity style={[S.shareBtn, { backgroundColor: T.accent }]} onPress={handleShareMonthReport} activeOpacity={0.85}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="share-outline" size={16} color="white" />
                  <Text style={S.shareBtnT}>이미지로 공유</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowMonthReport(false)} style={[S.shareBtn, { backgroundColor: T.accent }]} activeOpacity={0.85}>
                <Text style={S.shareBtnT}>닫기</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── 잔디 리포트 카드 모달 ── */}
      <Modal visible={showHeatReport} transparent animationType="fade">
        <View style={S.mo}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={S.moScroll}>
            <ViewShot ref={heatReportRef} options={{ format: 'png', quality: 1 }}>
              <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540, alignSelf: 'center' }]}>
                <ReportGradientHeader accent={T.accent} icon="leaf-outline" title="공부 기록" subtitle={`${new Date().getFullYear()}년 누적`} characterId={app.settings.mainCharacter} />

                {/* 히어로 — 올해 총 공부시간 */}
                <View style={{ alignItems: 'center', paddingTop: 18, paddingBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub, letterSpacing: 1, textTransform: 'uppercase' }}>올해 총 공부시간</Text>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: T.accent, marginTop: 2 }}>{formatDuration(yearTotalSec)}</Text>
                </View>

                {/* 공부일 + 현재연속 + 최장연속 */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 14, gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: T.surface2, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: T.text }}>{totalStudyDays365}</Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 3 }}>공부일</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#FF7F5010', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="flame" size={16} color="#E17055" />
                      <Text style={{ fontSize: 22, fontWeight: '900', color: '#FF7F50' }}>{app.settings.streak}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 3 }}>현재 연속</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: (T.gold || '#FFD700') + '14', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="trophy" size={14} color={T.gold || '#FFD700'} />
                      <Text style={{ fontSize: 22, fontWeight: '900', color: T.gold || '#F0B429' }}>{longestStreak}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: T.sub, marginTop: 3 }}>최장 연속</Text>
                  </View>
                </View>

                {/* 잔디 미니 그리드 */}
                {(() => {
                  const MG = 2;
                  const MC = Math.max(6, Math.floor((SW - 40 - 32 - (HM_WEEKS - 1) * MG) / HM_WEEKS));
                  return (
                    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                        <Ionicons name="grid-outline" size={11} color={T.sub} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>최근 {HM_WEEKS}주</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: MG }}>
                        {heatmap365.map((week, wi) => (
                          <View key={wi} style={{ flexDirection: 'column', gap: MG }}>
                            {week.map((day, di) => (
                              <View
                                key={di}
                                style={{ width: MC, height: MC, borderRadius: 2.5, backgroundColor: getHeat365Color(day) }}
                              />
                            ))}
                          </View>
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 7, flexWrap: 'wrap' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: T.surface2 }} />
                        <Text style={{ fontSize: 9, color: T.sub }}>0</Text>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: T.heat1, marginLeft: 3 }} />
                        <Text style={{ fontSize: 9, color: T.sub }}>30분</Text>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: T.heat2, marginLeft: 3 }} />
                        <Text style={{ fontSize: 9, color: T.sub }}>1h</Text>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: T.heat3, marginLeft: 3 }} />
                        <Text style={{ fontSize: 9, color: T.sub }}>2h</Text>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: T.heat4, marginLeft: 3 }} />
                        <Text style={{ fontSize: 9, color: T.sub }}>4h+</Text>
                      </View>
                    </View>
                  );
                })()}

                {/* 캐릭터 응원 메시지 */}
                <ReportFooterMessage message={reportCheer} characterId={app.settings.mainCharacter} T={T} />

                <ReportWatermark T={T} tag="#공부스타그램 #공부잔디" />
              </View>
            </ViewShot>
            <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 8, paddingBottom: 20 }}>
              <TouchableOpacity style={[S.shareBtn, { backgroundColor: T.accent }]} onPress={handleShareHeatReport} activeOpacity={0.85}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="share-outline" size={16} color="white" />
                  <Text style={S.shareBtnT}>이미지로 공유</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowHeatReport(false)} style={[S.shareBtn, { backgroundColor: T.accent }]} activeOpacity={0.85}>
                <Text style={S.shareBtnT}>닫기</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── 타임라인 시간대 상세 모달 ── */}
      <Modal visible={showTimelineModal} transparent animationType="slide" onRequestClose={() => setShowTimelineModal(false)}>
        <View style={S.moBottom}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowTimelineModal(false)} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center' }]}>
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time-outline" size={16} color={T.text} />
                <Text style={[S.modalTitle, { color: T.text, fontSize: 16, textAlign: 'left', marginBottom: 0 }]}>시간대별 공부 현황</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTimelineModal(false)} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* 미니 Gantt 바 (전체 맥락) */}
            <View style={{ height: 18, position: 'relative', backgroundColor: T.surface2, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
              {[6, 12, 18].map(h => (
                <View key={h} style={{ position: 'absolute', left: `${h / 24 * 100}%`, top: 0, bottom: 0, width: 0.5, backgroundColor: T.sub + '40' }} />
              ))}
              {todaySessions.filter(s => s.startedAt).map(s => {
                const d = new Date(s.startedAt);
                const startPct = (d.getHours() * 3600 + d.getMinutes() * 60) / 86400 * 100;
                const durPct = Math.min(100 - startPct, s.durationSec / 86400 * 100);
                const sesSubj = getSessionSubject(s, app.subjects);
                return <View key={s.id} style={{ position: 'absolute', left: `${startPct}%`, width: `${Math.max(0.5, durPct)}%`, height: '100%', backgroundColor: sesSubj.color, borderRadius: 2 }} />;
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 1, marginBottom: 14 }}>
              {[0, 6, 12, 18, 24].map(h => (
                <Text key={h} style={{ fontSize: 11, color: T.sub }}>{h}시</Text>
              ))}
            </View>
            {/* 시간대별 리스트 */}
            <ScrollView style={{ maxHeight: winH * 0.88 - 110 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {hourlyDetail.filter(h => h.sec > 0).length === 0 ? (
                <Text style={[S.emptyText, { color: T.sub }]}>오늘 공부 기록이 없어요</Text>
              ) : (
                hourlyDetail.map(({ hour, sec, subjects }) => {
                  if (sec === 0) return null;
                  // 60분(3600초) = 100% 기준 고정 바
                  return (
                    <View key={hour} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: T.sub, width: 34 }}>{String(hour).padStart(2, '0')}시</Text>
                        <View style={{ flex: 1, height: 14, backgroundColor: T.surface2, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }}>
                          {subjects.map((subj, si) => {
                            const subjPct = Math.min(100, (subj.sec / 3600) * 100);
                            return <View key={si} style={{ width: `${subjPct}%`, height: '100%', backgroundColor: subj.color }} />;
                          })}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, width: 35, textAlign: 'right' }}>{Math.round(sec / 60)}분</Text>
                      </View>
                      {subjects.length > 1 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 42, marginTop: 3 }}>
                          {subjects.map((subj, si) => (
                            <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: subj.color }} />
                              <Text style={{ fontSize: 11, color: T.sub }}>{subj.name} {Math.round(subj.sec / 60)}분</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 날짜 상세 모달 (폰/세로모드만) ── */}
      <Modal visible={!!dayDetailDate && !editMemo && !isLandscape} transparent animationType="slide" onRequestClose={() => setDayDetailDate(null)}>
        <View style={S.moBottom}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDayDetailDate(null)} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center' }]}>
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>{dayDetail ? formatDetailDate(dayDetail.date) : ''}</Text>
              <TouchableOpacity onPress={() => setDayDetailDate(null)} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: winH * 0.88 - 110 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              {dayDetail && (<>
                {/* 요약 3개 카드 */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                    <Text style={[S.sLabel, { color: T.sub }]}>총 공부시간</Text>
                    <Text style={[S.sVal, { color: T.accent }]}>{formatDuration(dayDetail.totalSec)}</Text>
                    {dayDetail.avgDensity > 0 && dayDetail.totalSec > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Ionicons name="flame" size={11} color="#E17055" />
                        <Text style={{ fontSize: 11, color: T.sub }}>순공 {formatShort(Math.round(dayDetail.totalSec * dayDetail.avgDensity / 100))}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                    <Text style={[S.sLabel, { color: T.sub }]}>집중밀도</Text>
                    <Text style={[S.sVal, { color: dayDetail.tier.color }]}>
                      {dayDetail.sessions.length > 0 ? `${dayDetail.tier.label} ${dayDetail.avgDensity}점` : '-'}
                    </Text>
                  </View>
                  <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                    <Text style={[S.sLabel, { color: T.sub }]}>세션</Text>
                    <Text style={[S.sVal, { color: T.text }]}>{dayDetail.sessions.length}회</Text>
                  </View>
                </View>
                {/* 과목 비율 */}
                {dayDetail.subjects.length > 0 && renderSubjects(dayDetail.subjects, '과목 비율')}
                {/* 세션 리스트 */}
                {dayDetail.sessions.length > 0 && (
                  <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                    <Text style={[S.secLabel, { color: T.sub }]}>세션 기록</Text>
                    {dayDetail.sessions.map(sess => {
                      const subj = app.subjects.find(s => s.id === sess.subjectId);
                      const tier = getTier(sess.focusDensity || 0);
                      const startH = sess.startedAt ? formatHM(sess.startedAt) : '';
                      const endH = sess.endedAt ? formatHM(sess.endedAt) : '';
                      return (
                        <View key={sess.id} style={[S.sessCard, { borderLeftColor: subj ? subj.color : '#B2BEC3' }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subj ? subj.color : '#B2BEC3' }} />
                              <Text style={{ fontSize: 14, fontWeight: subj ? '700' : '400', color: subj ? T.text : T.sub }}>{subj ? subj.name : (stripLeadingEmoji(sess.label) || '—')}</Text>
                            </View>
                            <Text style={{ fontSize: 14, color: T.sub }}>{startH}{endH ? ` ~ ${endH}` : ''}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 14, color: T.accent, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
                            <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '25' }]}>
                              <Text style={{ fontSize: 13, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
                            </View>
                            {sess.verified && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Ionicons name="trophy" size={11} color="#F5A623" />
                                <Text style={{ fontSize: 11, color: '#F5A623', fontWeight: '700' }}>인증</Text>
                              </View>
                            )}
                          </View>
                          {sess.memo && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                              <Ionicons name="chatbubble-outline" size={11} color={T.sub} />
                              <Text style={{ fontSize: 13, color: T.sub }}>{sess.memo}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
                {dayDetail.sessions.length === 0 && (
                  <Text style={[S.emptyText, { color: T.sub }]}>이 날은 공부 기록이 없어요</Text>
                )}
              </>)}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 시간대 상세 모달 ── */}
      <Modal visible={!!tzDetail} transparent animationType="slide" onRequestClose={() => setTzDetail(null)}>
        <View style={S.moBottom}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setTzDetail(null)} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center' }]}>
            {tzDetail && (() => {
              const { zone, periodLabel } = tzDetail;
              const firstH = zone.hours[0];
              const lastH = zone.hours[zone.hours.length - 1] + 1;
              const hoursLabel = `${firstH}~${lastH}시`;
              const sortedSess = [...zone.sessions].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
              const subjMap = {};
              sortedSess.forEach(s => {
                const { id, name, color } = getSessionSubject(s, app.subjects);
                if (!subjMap[id]) subjMap[id] = { name, color, sec: 0 };
                subjMap[id].sec += (s.durationSec || 0);
              });
              const subjList = Object.values(subjMap).sort((a, b) => b.sec - a.sec);
              const subjTotal = subjList.reduce((s, x) => s + x.sec, 0);
              return (
                <>
                  {/* 헤더 */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name={zone.icon} size={22} color={T.sub} />
                      <View>
                        <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>{zone.label} <Text style={{ fontSize: 13, fontWeight: '400', color: T.sub }}>{hoursLabel}</Text></Text>
                        <Text style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{periodLabel}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setTzDetail(null)} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: winH * 0.88 - 110 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                    {/* 요약 3개 카드 */}
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                      <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                        <Text style={[S.sLabel, { color: T.sub }]}>총 시간</Text>
                        <Text style={[S.sVal, { color: T.accent }]}>{formatDuration(zone.totalSec)}</Text>
                      </View>
                      <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                        <Text style={[S.sLabel, { color: T.sub }]}>세션 수</Text>
                        <Text style={[S.sVal, { color: T.text }]}>{zone.count}회</Text>
                      </View>
                      <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                        <Text style={[S.sLabel, { color: T.sub }]}>평균 밀도</Text>
                        <Text style={[S.sVal, { color: zone.tier ? zone.tier.color : T.sub }]}>{zone.tier ? zone.tier.label : '-'}</Text>
                        {zone.tier && <Text style={{ fontSize: 11, color: zone.tier.color, fontWeight: '700' }}>{zone.avgDensity}점</Text>}
                      </View>
                    </View>
                    {/* 과목 비율 */}
                    {subjList.length > 0 && (() => {
                      const tzSubjData = subjList.map(s => ({ ...s, pct: Math.round((s.sec / subjTotal) * 100) }));
                      const sideBySide = subjList.length <= 4;
                      return (
                        <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                          <Text style={[S.secLabel, { color: T.sub }]}>과목별 비율</Text>
                          {sideBySide ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <SubjectDonut data={tzSubjData} T={T} />
                              <View style={{ flex: 1 }}>
                                {tzSubjData.map((s, i) => (
                                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                                    <Text style={{ flex: 1, fontSize: 13, color: T.text }}>{s.name}</Text>
                                    <Text style={{ fontSize: 12, color: T.sub }}>{s.pct}%</Text>
                                    <Text style={{ fontSize: 13, color: T.text, fontWeight: '600', minWidth: 46, textAlign: 'right' }}>{formatShort(s.sec)}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          ) : (
                            <>
                              <View style={{ alignItems: 'center', marginBottom: 10 }}>
                                <SubjectDonut data={tzSubjData} T={T} size={130} />
                              </View>
                              {tzSubjData.map((s, i) => (
                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                                  <Text style={{ flex: 1, fontSize: 13, color: T.text }}>{s.name}</Text>
                                  <Text style={{ fontSize: 12, color: T.sub }}>{s.pct}%</Text>
                                  <Text style={{ fontSize: 13, color: T.text, fontWeight: '600', minWidth: 46, textAlign: 'right' }}>{formatShort(s.sec)}</Text>
                                </View>
                              ))}
                            </>
                          )}
                        </View>
                      );
                    })()}
                    {/* 세션 리스트 */}
                    <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                      <Text style={[S.secLabel, { color: T.sub }]}>세션 기록</Text>
                      {sortedSess.map(sess => {
                        const subj = app.subjects.find(s => s.id === sess.subjectId);
                        const tier = getTier(sess.focusDensity || 0);
                        const startH = sess.startedAt ? formatHM(sess.startedAt) : '';
                        const endH = sess.endedAt ? formatHM(sess.endedAt) : '';
                        return (
                          <View key={sess.id} style={[S.sessCard, { borderLeftColor: subj ? subj.color : '#B2BEC3' }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subj ? subj.color : '#B2BEC3' }} />
                                <Text style={{ fontSize: 14, fontWeight: subj ? '700' : '400', color: subj ? T.text : T.sub }}>{subj ? subj.name : (stripLeadingEmoji(sess.label) || '—')}</Text>
                              </View>
                              <Text style={{ fontSize: 12, color: T.sub }}>{sess.date}  {startH}{endH ? ` ~ ${endH}` : ''}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 14, color: T.accent, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
                              <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '25' }]}>
                                <Text style={{ fontSize: 13, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
                              </View>
                              {sess.verified && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Ionicons name="trophy" size={11} color="#F5A623" />
                                <Text style={{ fontSize: 11, color: '#F5A623', fontWeight: '700' }}>인증</Text>
                              </View>
                            )}
                            </View>
                            {sess.memo && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                <Ionicons name="chatbubble-outline" size={11} color={T.sub} />
                                <Text style={{ fontSize: 13, color: T.sub }}>{sess.memo}</Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
                );
              })()}
          </View>
        </View>
      </Modal>

      {/* ── 과목 상세 모달 ── */}
      <Modal visible={!!subjDetail && !editMemo && !sessionDetail} transparent animationType="slide" onRequestClose={() => setSubjDetail(null)}>
        <View style={S.moBottom}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSubjDetail(null)} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center' }]}>
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {subjDetailData && <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: subjDetailData.color }} />}
                <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>{subjDetailData ? subjDetailData.name : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => setSubjDetail(null)} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: winH * 0.88 - 110 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              {subjDetailData && (<>
                {/* 요약 3개 카드 */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                    <Text style={[S.sLabel, { color: T.sub }]}>총 시간</Text>
                    <Text style={[S.sVal, { color: T.accent }]}>{formatDuration(subjDetailData.sec)}</Text>
                  </View>
                  <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                    <Text style={[S.sLabel, { color: T.sub }]}>세션 수</Text>
                    <Text style={[S.sVal, { color: T.text }]}>{subjDetailData.sessions}회</Text>
                  </View>
                  <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                    <Text style={[S.sLabel, { color: T.sub }]}>평균 밀도</Text>
                    <Text style={[S.sVal, { color: getTier(subjDetailData.avgDensity).color }]}>{subjDetailData.avgDensity}점</Text>
                  </View>
                </View>
                {/* 마지막 공부일 */}
                {subjDetailData.lastDate && (() => {
                  const d = Math.floor((new Date(today) - new Date(subjDetailData.lastDate)) / 864e5);
                  return (
                    <View style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, color: T.sub }}>마지막 공부일</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>{formatDetailDate(subjDetailData.lastDate)}</Text>
                      {d === 0
                        ? <Text style={{ fontSize: 14, color: '#00B894' }}>· 오늘</Text>
                        : <Text style={{ fontSize: 14, color: T.sub }}>· {d}일 전</Text>}
                    </View>
                  );
                })()}
                {/* 최근 세션 리스트 */}
                {subjDetailData.recentSess.length > 0 && (
                  <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                    <Text style={[S.secLabel, { color: T.sub }]}>최근 세션</Text>
                    {subjDetailData.recentSess.map(sess => {
                      const tier = getTier(sess.focusDensity || 0);
                      const startH = sess.startedAt ? formatHM(sess.startedAt) : '';
                      return (
                        <TouchableOpacity key={sess.id} onPress={() => setSessionDetail(sess)} activeOpacity={0.75}
                          style={[S.sessCard, { borderLeftColor: subjDetailData.color }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>{sess.date}</Text>
                            <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '20' }]}>
                              <Text style={{ fontSize: 13, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 14, color: T.sub }}>{startH ? `${startH} 시작` : ''}</Text>
                            <Text style={{ fontSize: 14, color: T.text, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
                          </View>
                          {sess.memo ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                              <Ionicons name="chatbubble-outline" size={11} color={T.sub} />
                              <Text style={{ fontSize: 13, color: T.sub }}>{sess.memo}</Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>)}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 목표 달성률 상세 팝업 ── */}
      <Modal visible={showGoalDetail} transparent animationType="slide" onRequestClose={() => setShowGoalDetail(false)}>
        <View style={S.moBottom}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowGoalDetail(false)} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center' }]}>
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="trophy-outline" size={17} color={T.text} />
                <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>오늘 목표 달성률</Text>
              </View>
              <TouchableOpacity onPress={() => setShowGoalDetail(false)} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: winH * 0.88 - 110 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 큰 링 + 시간 */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <GoalRing
                  pct={Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100))}
                  size={120} color={T.accent} bgColor={T.surface2}
                />
                <Text style={{ fontSize: 22, fontWeight: '900', color: T.text, marginTop: 10 }}>{formatDuration(todayTotalSec)}</Text>
                <Text style={{ fontSize: 14, color: T.sub, marginTop: 3 }}>목표 {formatDuration(app.settings.dailyGoalMin * 60)}</Text>
                {todayTotalSec >= app.settings.dailyGoalMin * 60 ? (
                  <View style={{ backgroundColor: T.accent + '18', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="checkmark-circle-outline" size={15} color={T.accent} />
                      <Text style={{ fontSize: 15, fontWeight: '800', color: T.accent }}>오늘 목표 달성!</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ backgroundColor: T.surface2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.sub }}>
                      남은 시간 {formatDuration(Math.max(0, app.settings.dailyGoalMin * 60 - todayTotalSec))}
                    </Text>
                  </View>
                )}
              </View>
              {/* 이번 주 달성 현황 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ionicons name="calendar-outline" size={14} color={T.sub} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>이번 주 달성 현황</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {weekData.map(d => {
                    const met = d.sec >= app.settings.dailyGoalMin * 60;
                    const isToday = d.date === today;
                    return (
                      <View key={d.date} style={{ alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 11, color: isToday ? T.accent : T.sub, fontWeight: isToday ? '800' : '600' }}>{d.day}</Text>
                        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: d.sec === 0 ? T.surface2 : met ? T.accent + '20' : T.surface2, borderWidth: 1.5, borderColor: d.sec === 0 ? T.border : met ? T.accent : T.border, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 12 }}>{d.sec === 0 ? '' : met ? '✓' : '·'}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: T.sub }}>{d.sec > 0 ? formatShort(d.sec) : '-'}</Text>
                      </View>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: T.accent }}>{weekData.filter(d => d.sec >= app.settings.dailyGoalMin * 60).length}일</Text>
                    <Text style={{ fontSize: 11, color: T.sub }}>이번 주 달성</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: T.border }} />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: T.accent }}>{app.settings.streak || 0}일</Text>
                    <Text style={{ fontSize: 11, color: T.sub }}>연속 달성</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: T.border }} />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: T.accent }}>{weekData.filter(d => d.sec > 0).length}일</Text>
                    <Text style={{ fontSize: 11, color: T.sub }}>이번 주 공부</Text>
                  </View>
                </View>
              </View>
              {/* 목표 시간 안내 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="bulb-outline" size={13} color={T.text} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>목표 달성 팁</Text>
                </View>
                {(() => {
                  const pct = Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100));
                  const tips = pct >= 100
                    ? ['오늘 목표를 달성했어요! 꾸준히 이어가세요', '연속 달성 기록을 이어가 보세요']
                    : pct >= 70
                    ? ['조금만 더! 거의 다 왔어요', '짧은 세션을 추가해 목표를 채워보세요']
                    : pct >= 40
                    ? ['오늘 아직 시간이 있어요. 파이팅!', '과목별 타이머로 집중적으로 공부해보세요']
                    : ['목표를 작게 쪼개 시작해보세요', '일단 15분부터 타이머를 시작해보세요'];
                  return tips.map((t, i) => (
                    <Text key={i} style={{ fontSize: 13, color: T.sub, marginBottom: 4 }}>• {t}</Text>
                  ));
                })()}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 세션 상세 모달 ── */}
      <Modal visible={!!sessionDetail && !editMemo} transparent animationType="slide" onRequestClose={() => { setSessionDetail(null); setIsEditingMemo(false); }}>
        <KeyboardAvoidingView style={S.moBottom} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setSessionDetail(null); setIsEditingMemo(false); }} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center' }]}>
            {sessionDetail && (() => {
              const sess = sessionDetail;
              const subj = app.subjects.find(s => s.id === sess.subjectId);
              const subjColor = subj ? subj.color : '#B2BEC3';
              const tier = getTier(sess.focusDensity || 0);
              const startH = sess.startedAt ? formatHM(sess.startedAt) : null;
              const endH = sess.endedAt ? formatHM(sess.endedAt) : null;
              const bd = getDensityBreakdown({
                pausedCount: sess.pausedCount || 0,
                totalSec: sess.durationSec || 0,
                timerType: sess.timerType || 'free',
                completionRatio: sess.completionRatio ?? 1,
                pomoSets: sess.pomoSets || 0,
                focusMode: sess.focusMode || 'screen_off',
                exitCount: sess.exitCount || 0,
                selfRating: sess.selfRating || null,
                schoolLevel: sess.schoolLevel || app.settings.schoolLevel || 'high',
              });
              const bdItems = [
                { label: '완료 점수', max: 40, val: bd.completionScore, color: '#4A90D9' },
                { label: '습관 점수', max: 30, val: bd.habitScore,      color: '#27AE60' },
                { label: '지속력 보너스', max: 15, val: bd.persistenceBonus, color: '#F39C12' },
                { label: '선언 보너스', max: 15, val: bd.declarationBonus, color: '#9B59B6' },
                { label: '자가평가 보너스', max: 3, val: bd.selfBonus, color: '#E84393' },
              ];
              const timerTypeLabel = { countdown: '카운트다운', free: '자유 모드', pomodoro: '뽀모도로' }[sess.timerType] || '자유 모드';
              const focusModeIcon = sess.focusMode === 'screen_on' ? 'flame-outline' : 'book-outline';
              const focusModeLabel = sess.focusMode === 'screen_on' ? '집중 도전' : '편하게 공부';
              const selfRating = { fire: { icon: 'flame-outline', label: '집중됨' }, perfect: { icon: 'star-outline', label: '완벽' }, neutral: { icon: 'remove-outline', label: '보통' }, tired: { icon: 'moon-outline', label: '피곤' } }[sess.selfRating] || null;
              return (
                <>
                  {/* 헤더 */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: subjColor }} />
                      <Text style={{ fontSize: 17, fontWeight: '900', color: subj ? T.text : T.sub }}>{subj ? subj.name : (stripLeadingEmoji(sess.label) || '—')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setSessionDetail(null); setIsEditingMemo(false); }} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView ref={sessionDetailScrollRef} style={{ maxHeight: winH * 0.88 - 110 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
                  {/* 시간 정보 + 티어 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <View>
                      <Text style={{ fontSize: 26, fontWeight: '900', color: T.accent }}>{formatShort(sess.durationSec)}</Text>
                      {startH && (
                        <Text style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>
                          {startH}{endH ? ` ~ ${endH}` : ''}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <View style={{ backgroundColor: tier.color + '20', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ fontSize: 20, fontWeight: '900', color: tier.color }}>{tier.label}</Text>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: tier.color }}>{sess.focusDensity || 0}점</Text>
                      {sess.verified && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="trophy" size={14} color="#F5A623" />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#F1C40F' }}>Verified!</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* 세션 정보 태그들 */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    <View style={{ backgroundColor: T.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="timer-outline" size={12} color={T.sub} />
                      <Text style={{ fontSize: 12, color: T.sub }}>{timerTypeLabel}</Text>
                    </View>
                    <View style={{ backgroundColor: T.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name={focusModeIcon} size={12} color={T.sub} />
                      <Text style={{ fontSize: 12, color: T.sub }}>{focusModeLabel}</Text>
                    </View>
                    {(sess.pausedCount || 0) > 0 && (
                      <View style={{ backgroundColor: T.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="pause-outline" size={12} color={T.sub} />
                        <Text style={{ fontSize: 12, color: T.sub }}>일시정지 {sess.pausedCount}회</Text>
                      </View>
                    )}
                    {sess.focusMode === 'screen_on' && (sess.exitCount || 0) > 0 && (
                      <View style={{ backgroundColor: T.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="phone-portrait-outline" size={12} color={T.sub} />
                        <Text style={{ fontSize: 12, color: T.sub }}>이탈 {sess.exitCount}회</Text>
                      </View>
                    )}
                    {selfRating && (
                      <View style={{ backgroundColor: T.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={selfRating.icon} size={12} color={T.sub} />
                        <Text style={{ fontSize: 12, color: T.sub }}>{selfRating.label}</Text>
                      </View>
                    )}
                  </View>

                  {/* 밀도 점수 내역 */}
                  <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                      <Ionicons name="analytics-outline" size={13} color={T.text} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>밀도 점수 내역</Text>
                    </View>
                    {bdItems.map(item => (
                      <View key={item.label} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ fontSize: 12, color: T.sub }}>{item.label}</Text>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: item.val > 0 ? item.color : T.sub }}>
                            {item.val}<Text style={{ fontWeight: '400', color: T.sub }}>/{item.max}</Text>
                          </Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: T.surface2, borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{ height: 6, width: `${Math.round(item.val / item.max * 100)}%`, backgroundColor: item.color, borderRadius: 3 }} />
                        </View>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>합계</Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: tier.color }}>{sess.focusDensity || bd.total}점</Text>
                    </View>
                  </View>

                  {/* 메모 */}
                  <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="document-text-outline" size={13} color={T.text} />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>메모</Text>
                      </View>
                      {!isEditingMemo && (
                        <TouchableOpacity
                          onPress={() => { setEditMemoText(sess.memo || ''); setIsEditingMemo(true); }}
                          style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: T.accent + '20', borderRadius: 8 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: T.accent }}>수정</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {isEditingMemo ? (
                      <>
                        <TextInput
                          ref={memoInputRef}
                          value={editMemoText}
                          onChangeText={setEditMemoText}
                          style={[S.memoEditInput, { borderColor: T.border, backgroundColor: T.surface2, color: T.text }]}
                          maxLength={50}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={() => {
                            app.updateSessionMemo(sess.id, editMemoText);
                            setSessionDetail(prev => ({ ...prev, memo: editMemoText }));
                            setIsEditingMemo(false);
                          }}
                        />
                        <Text style={{ fontSize: 11, color: T.sub, textAlign: 'right', marginBottom: 10 }}>{editMemoText.length}/50</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity style={[S.mCancel, { borderColor: T.border, flex: 1, marginHorizontal: 0, marginBottom: 0 }]} onPress={() => setIsEditingMemo(false)}>
                            <Text style={[S.mCancelT, { color: T.sub }]}>취소</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[S.mConfirm, { backgroundColor: T.accent, flex: 1, marginHorizontal: 0, marginBottom: 0 }]}
                            onPress={() => {
                              app.updateSessionMemo(sess.id, editMemoText);
                              setSessionDetail(prev => ({ ...prev, memo: editMemoText }));
                              setIsEditingMemo(false);
                            }}
                          >
                            <Text style={S.mConfirmT}>저장</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      sess.memo
                        ? <Text style={{ fontSize: 14, color: T.text }}>{sess.memo}</Text>
                        : <Text style={{ fontSize: 13, color: T.sub }}>메모 없음 · 수정을 눌러 추가하세요</Text>
                    )}
                  </View>
                  <View style={{ height: 24 }} />
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 집중밀도 상세 팝업 ── */}
      <Modal visible={showDensityDetail} transparent animationType="slide" onRequestClose={() => setShowDensityDetail(false)}>
        <View style={S.moBottom}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDensityDetail(false)} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center' }]}>
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flash-outline" size={17} color={T.text} />
                <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>집중밀도 상세</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDensityDetail(false)} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: winH * 0.88 - 110 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 큰 티어 뱃지 + 점수 */}
              <View style={{ alignItems: 'center', marginBottom: 18 }}>
                <View style={{ backgroundColor: todayTier.color + '20', borderRadius: 24, width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 28, fontWeight: '900', color: todayTier.color }}>{todayTier.label}</Text>
                </View>
                <Text style={{ fontSize: 26, fontWeight: '900', color: T.text }}>{todayAvgDensity}점</Text>
                <Text style={{ fontSize: 14, color: todayTier.color, fontWeight: '700', marginTop: 3 }}>{todayTier.message}</Text>
              </View>
              {/* 티어 구간 — 가로 한 줄 */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                {TIERS.map(tier => {
                  const isCurrentTier = todayTier.id === tier.id;
                  return (
                    <View key={tier.id} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, backgroundColor: isCurrentTier ? tier.color + '25' : T.card, borderWidth: isCurrentTier ? 2 : 1, borderColor: isCurrentTier ? tier.color : T.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: tier.color }}>{tier.label}</Text>
                      <Text style={{ fontSize: 11, color: isCurrentTier ? tier.color : T.sub, marginTop: 2 }}>
                        {tier.max >= 120 ? `${tier.min}+` : `${tier.min}~`}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {/* 오늘 세션별 밀도 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                  <Ionicons name="stats-chart-outline" size={13} color={T.text} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>오늘 세션별 밀도</Text>
                </View>
                {todaySessions.length === 0 ? (
                  <Text style={{ fontSize: 13, color: T.sub }}>세션 기록이 없어요</Text>
                ) : (
                  todaySessions.map((s, i) => {
                    const sesSubj = getSessionSubject(s, app.subjects);
                    const sesTier = getTier(s.focusDensity || 0);
                    return (
                      <View key={s.id || i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: i < todaySessions.length - 1 ? 1 : 0, borderBottomColor: T.border }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sesSubj.color }} />
                        <Text style={{ fontSize: 13, color: T.text, flex: 1 }} numberOfLines={1}>{sesSubj.name}</Text>
                        <Text style={{ fontSize: 12, color: T.sub }}>{formatShort(s.durationSec || 0)}</Text>
                        <View style={{ backgroundColor: sesTier.color + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: sesTier.color }}>{sesTier.label} {s.focusDensity || 0}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
              {/* 점수 계산 기준 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="bulb-outline" size={13} color={T.text} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>밀도 점수 기준 (최대 103점)</Text>
                </View>
                {[
                  { iconName: 'checkmark-circle-outline', label: '완료 점수 (최대 40점)', desc: '타이머 완주할수록 높아요 · 자유모드는 학교급별 기준 시간 적용' },
                  { iconName: 'pause-circle-outline', label: '습관 점수 (최대 30점)', desc: '일시정지를 적게 할수록 높아요' },
                  { iconName: 'timer-outline', label: '지속력 보너스 (최대 15점)', desc: '학교급에 맞는 기준으로 자동 조정 · 내 기준 최대 시간 달성 시 +15점' },
                  { iconName: 'flame-outline', label: '선언 보너스 (최대 15점)', descEl: (s) => <Text style={{ fontSize: 11, color: s }}><Ionicons name="flame-outline" size={11} color={s} />모드 이탈 0회 Verified +15 / <Ionicons name="book-outline" size={11} color={s} />모드 완료율에 따라 +2~+5</Text> },
                  { iconName: 'star-outline', label: '자가평가 보너스 (0~+3점)', descEl: (s) => <Text style={{ fontSize: 11, color: s }}><Ionicons name="flash-outline" size={11} color={s} /> 선택 시 +3점! <Ionicons name="moon-outline" size={11} color={s} /> 선택해도 패널티 없어요</Text> },
                ].map(item => (
                  <View key={item.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <Ionicons name={item.iconName} size={14} color={T.text} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: T.text }}>{item.label}</Text>
                      {item.descEl ? item.descEl(T.sub) : <Text style={{ fontSize: 11, color: T.sub }}>{item.desc}</Text>}
                    </View>
                  </View>
                ))}
                {/* 현재 학교급 기준 표시 */}
                {(() => {
                  const sl = app.settings.schoolLevel || 'high';
                  const info = {
                    elementary_lower: { label: '초등 저학년', persist: '20분', free: '25분' },
                    elementary_upper: { label: '초등 고학년', persist: '30분', free: '40분' },
                    middle:           { label: '중학생',      persist: '60분', free: '80분' },
                    high:             { label: '고등학생',    persist: '90분', free: '120분' },
                    nsuneung:         { label: 'N수생',       persist: '90분', free: '120분' },
                    university:       { label: '대학생',      persist: '90분', free: '120분' },
                    exam_prep:        { label: '공시생/자격증', persist: '90분', free: '120분' },
                  }[sl] || { label: '고등학생', persist: '90분', free: '120분' };
                  return (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: T.surface2, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, color: T.sub }}>
                        내 기준 ({info.label}) — 지속력 만점 {info.persist} · 자유모드 만점 {info.free}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

