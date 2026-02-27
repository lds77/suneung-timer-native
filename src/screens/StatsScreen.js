// src/screens/StatsScreen.js  —  v24
// 추가: 히트맵(365일 잔디) · 주간 리포트 카드 · 시간대별 집중력 분석 · 취약 과목 알림
import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Dimensions, Share, Animated, TextInput, Platform,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../hooks/useAppState';
import { getTheme } from '../constants/colors';
import { CHARACTERS } from '../constants/characters';
import { getTier } from '../constants/presets';
import { formatDuration, formatShort, formatDDay, getToday } from '../utils/format';
import { calcAverageDensity } from '../utils/density';
import CharacterAvatar from '../components/CharacterAvatar';

const { width: SW } = Dimensions.get('window');
const DAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];
const CELL = Math.floor((SW - 32 - 28 - 12) / 7);
const dateStr = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// ─── 응원 메시지 풀 ───────────────────────────────────────────────
const CHEER_MSGS = {
  godlike:    ['혹시 천재야? 곰인 내가 봐도 대단해! 🐻👑','완벽 그 자체야... 너 진짜 다른 레벨이다 🌟','이 정도면 전교 1등 각이야! 👑✨'],
  excellent:  ['집중력 끝판왕! 이 페이스 유지하면 무적이야 💪','오늘 집중도 미쳤어! 자랑스러워 🎯','너의 밀도 점수 보고 감동받았어... 🥹'],
  streak:     ['일 연속! 대단해, 습관이 만들어지고 있어 🔥','일째 이어가는 중! 멈추지 마 🔥💪','일 연속 공부! 이게 진짜 실력이 되는 거야 🔥'],
  longStudy:  ['5시간 넘겼어! 오늘은 푹 쉬어도 돼 💕','오늘 정말 열심히 했다! 맛있는 거 먹어 🍰','대단한 하루였어! 내일도 이렇게만 하자 ✨'],
  good:       ['좋은 하루였어! 내일은 밀도를 조금 더 올려볼까? ✨','오늘도 잘했어! 꾸준함이 진짜 실력이야 💕','착실하게 공부했네! 이런 날이 쌓이면 큰 차이가 돼 📚'],
  struggling: ['힘든 날도 있지! 괜찮아, 내일 다시 하면 돼 💧','오늘은 컨디션이 안 좋았나봐. 푹 자고 내일 다시! 🌙','집중이 어려운 날이었지? 그래도 자리에 앉은 게 대단해 💪'],
  justStarted:['시작한 것만으로도 대단해! 조금씩 늘려가자 💕','첫 발을 뗐어! 내일은 10분만 더 해볼까? 🐣','오늘 공부한 너, 어제의 너보다 앞서있어 ✨'],
  default:    ['오늘도 수고했어! 내일도 함께하자 💕','매일 조금씩, 그게 비결이야! 화이팅 🌈','넌 잘하고 있어. 믿어! 💝','오늘 하루도 고생 많았어! 내가 응원할게 🐻'],
};

function getInsight(sec, density, streak) {
  const h = sec / 3600;
  let pool;
  if (density >= 95 && h >= 3) pool = CHEER_MSGS.godlike;
  else if (density >= 85) pool = CHEER_MSGS.excellent;
  else if (streak >= 7) {
    pool = CHEER_MSGS.streak;
    return `${streak}${pool[Math.floor(Math.random() * pool.length)]}`;
  } else if (h >= 5) pool = CHEER_MSGS.longStudy;
  else if (h >= 2) pool = CHEER_MSGS.good;
  else if (density < 60 && h > 0.5) pool = CHEER_MSGS.struggling;
  else if (h > 0 && h < 1) pool = CHEER_MSGS.justStarted;
  else pool = CHEER_MSGS.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── 시간대 라벨 ────────────────────────────────────────────────
const TIME_ZONES = [
  { label: '새벽', hours: [0,1,2,3,4,5],       icon: '🌙' },
  { label: '오전', hours: [6,7,8,9,10,11],      icon: '🌅' },
  { label: '오후', hours: [12,13,14,15,16,17],  icon: '☀️' },
  { label: '저녁', hours: [18,19,20,21,22,23],  icon: '🌆' },
];

// ─── 주간 리포트 텍스트 생성 ─────────────────────────────────────
function buildReportText({ weekTotal, weekPrev, topSubject, avgDensity, streak, studyDays, focusStats }) {
  const tier = getTier(avgDensity);
  const diff = weekTotal - weekPrev;
  const diffStr = diff === 0 ? '지난주와 동일' : diff > 0 ? `지난주보다 +${formatShort(diff)}` : `지난주보다 ${formatShort(Math.abs(diff))} 적음`;
  const fsl = focusStats || {};
  const fsLine = fsl.screenOnSessions ? `🔥 집중 도전: ${fsl.screenOnSessions}세션 (Verified: ${fsl.verifiedSessions})` : '';
  const fsLine2 = fsl.screenOffSessions ? `📖 편하게 공부: ${fsl.screenOffSessions}세션` : '';
  return `📊 열공 멀티타이머 주간 리포트

⏱️ 이번 주 공부시간: ${formatDuration(weekTotal)}
📈 ${diffStr}
🎯 집중밀도: ${tier.label} (${avgDensity}점)
📚 최다 과목: ${topSubject || '미지정'}
📅 공부일수: ${studyDays}일 / 7일
🔥 연속 공부: ${streak}일
${fsLine ? '\n' + fsLine : ''}${fsLine2 ? '\n' + fsLine2 : ''}

#열공멀티타이머 #공부스타그램 #수험생`;
}

// ═══════════════════════════════════════════════════════════════════
export default function StatsScreen() {
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);
  const [tab, setTab] = useState('daily');
  const today = getToday();

  // 메모 수정 모달
  const [editMemo, setEditMemo] = useState(null); // { sessionId, memo }
  const [editMemoText, setEditMemoText] = useState('');

  // 월간 탭 네비게이션
  const [monthOffset, setMonthOffset] = useState(0);
  const viewMonth = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset); return d;
  }, [monthOffset]);
  const viewMonthStr = `${viewMonth.getFullYear()}.${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;

  // 리포트 카드 모달
  const [showReport, setShowReport] = useState(false);

  // ─── 오늘 데이터 ───────────────────────────────────────────────
  const todaySessions = app.todaySessions;
  const todayTotalSec = app.todayTotalSec;
  const todayAvgDensity = calcAverageDensity(todaySessions);
  const todayTier = getTier(todayAvgDensity);

  // ─── 7일 데이터 ───────────────────────────────────────────────
  const weekData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(new Date(), -i); const ds = dateStr(d);
      const sess = app.sessions.filter(s => s.date === ds);
      data.push({ date: ds, day: DAYS_KR[d.getDay()], sec: sess.reduce((s, x) => s + (x.durationSec || 0), 0), density: calcAverageDensity(sess), isToday: ds === today, sessions: sess.length });
    }
    return data;
  }, [app.sessions, today]);
  const weekMax = Math.max(...weekData.map(d => d.sec), 3600);
  const weekTotal = weekData.reduce((s, d) => s + d.sec, 0);
  const weekStudyDays = weekData.filter(d => d.sec > 0).length;

  // 지난주 데이터 (리포트용)
  const weekPrevTotal = useMemo(() => {
    let total = 0;
    for (let i = 13; i >= 7; i--) {
      const ds = dateStr(addDays(new Date(), -i));
      total += app.sessions.filter(s => s.date === ds).reduce((s, x) => s + (x.durationSec || 0), 0);
    }
    return total;
  }, [app.sessions]);

  // 주간 평균 밀도 (리포트용)
  const weekAvgDensity = useMemo(() => {
    const allSess = weekData.flatMap((_, i) => {
      const ds = dateStr(addDays(new Date(), -(6 - i)));
      return app.sessions.filter(s => s.date === ds);
    });
    return calcAverageDensity(allSess);
  }, [weekData, app.sessions]);

  // 주간 과목별
  const weekSubjects = useMemo(() => {
    const map = {}; const start = dateStr(addDays(new Date(), -6));
    app.sessions.filter(s => s.date >= start).forEach(s => {
      const k = s.subjectId || '_none'; map[k] = (map[k] || 0) + (s.durationSec || 0);
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map).map(([id, sec]) => {
      const subj = app.subjects.find(s => s.id === id);
      return { name: subj ? subj.name : '미지정', color: subj ? subj.color : '#B2BEC3', sec, pct: total > 0 ? Math.round((sec / total) * 100) : 0 };
    }).sort((a, b) => b.sec - a.sec);
  }, [app.sessions, app.subjects]);
  const topSubject = weekSubjects[0]?.name || '';

  // 주간 투명성 통계
  const weekFocusStats = useMemo(() => {
    const start = dateStr(addDays(new Date(), -6));
    const ws = app.sessions.filter(s => s.date >= start);
    const screenOnSessions = ws.filter(s => s.focusMode === 'screen_on').length;
    const screenOffSessions = ws.filter(s => s.focusMode === 'screen_off' || !s.focusMode).length;
    const verifiedSessions = ws.filter(s => s.verified).length;
    const totalExits = ws.reduce((sum, s) => sum + (s.exitCount || 0), 0);
    return { screenOnSessions, screenOffSessions, verifiedSessions, totalExits, totalSessions: ws.length };
  }, [app.sessions]);

  // 일간 과목별
  const daySubjects = useMemo(() => {
    const map = {};
    todaySessions.forEach(s => { const k = s.subjectId || '_none'; map[k] = (map[k] || 0) + (s.durationSec || 0); });
    return Object.entries(map).map(([id, sec]) => {
      const subj = app.subjects.find(s => s.id === id);
      return { name: subj ? subj.name : '미지정', color: subj ? subj.color : '#B2BEC3', sec, pct: todayTotalSec > 0 ? Math.round((sec / todayTotalSec) * 100) : 0 };
    }).sort((a, b) => b.sec - a.sec);
  }, [todaySessions, todayTotalSec]);

  // 타임라인 (시간별 24칸)
  const timeline = useMemo(() => {
    const hours = new Array(24).fill(0);
    todaySessions.forEach(s => { if (s.startedAt) hours[new Date(s.startedAt).getHours()] += s.durationSec || 0; });
    return hours;
  }, [todaySessions]);
  const timelineMax = Math.max(...timeline, 1800);

  // ─── 시간대별 집중력 분석 ──────────────────────────────────────
  // 지난 30일 세션 기반으로 시간대별 평균 집중밀도 계산
  const timeZoneAnalysis = useMemo(() => {
    const start30 = dateStr(addDays(new Date(), -30));
    const recent = app.sessions.filter(s => s.date >= start30 && s.startedAt);
    return TIME_ZONES.map(zone => {
      const zoneSess = recent.filter(s => zone.hours.includes(new Date(s.startedAt).getHours()));
      const totalSec = zoneSess.reduce((s, x) => s + (x.durationSec || 0), 0);
      const avgDensity = calcAverageDensity(zoneSess);
      const tier = zoneSess.length > 0 ? getTier(avgDensity) : null;
      return { ...zone, totalSec, avgDensity, tier, count: zoneSess.length };
    });
  }, [app.sessions]);
  const bestZone = [...timeZoneAnalysis].filter(z => z.count > 0).sort((a, b) => b.avgDensity - a.avgDensity)[0];

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
  const monthMaxSec = Math.max(...calendarData.filter(Boolean).map(d => d.sec), 1);
  const getHeatColor = (sec) => {
    if (sec === 0) return T.surface2;
    const r = Math.min(1, sec / Math.max(monthMaxSec, 3600));
    if (r < 0.25) return T.accent + '30'; if (r < 0.5) return T.accent + '60';
    if (r < 0.75) return T.accent + 'A0'; return T.accent;
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
    const startSun = addDays(endSat, -52 * 7 + 1);
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

  // 잔디 색상: 📖모드 = 연한 초록, 🔥모드 = 진한 초록, Verified = 골드
  const getHeat365Color = (day) => {
    if (day.isFuture) return 'transparent';
    if (day.sec === 0) return T.surface2;
    const r = Math.min(1, day.sec / Math.max(heatmap365Max * 0.8, 3600));
    if (day.hasVerified) {
      // 🏆 Verified 있는 날: 골드 계열
      if (r < 0.25) return '#FFD70035'; if (r < 0.5) return '#FFD70065';
      if (r < 0.75) return '#FFD700A5'; return '#FFD700';
    }
    if (day.hasScreenOn) {
      // 🔥모드 있는 날: 진한 초록
      if (r < 0.25) return '#4CAF5045'; if (r < 0.5) return '#4CAF5075';
      if (r < 0.75) return '#4CAF50B5'; return '#4CAF50';
    }
    // 📖모드만: 기본 accent 연한 색
    if (r < 0.25) return T.accent + '35'; if (r < 0.5) return T.accent + '65';
    if (r < 0.75) return T.accent + 'A5'; return T.accent;
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
      const k = s.subjectId || '_none'; map[k] = (map[k] || 0) + (s.durationSec || 0);
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map).map(([id, sec]) => {
      const subj = app.subjects.find(s => s.id === id);
      return { name: subj ? subj.name : '미지정', color: subj ? subj.color : '#B2BEC3', sec, pct: total > 0 ? Math.round((sec / total) * 100) : 0 };
    }).sort((a, b) => b.sec - a.sec);
  }, [app.sessions, viewMonth, app.subjects]);

  // 과목 비율 렌더
  const renderSubjects = (data, label) => {
    if (data.length === 0) return null;
    return (
      <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[S.secLabel, { color: T.sub }]}>{label}</Text>
        <View style={[S.stackBar, { backgroundColor: T.surface2 }]}>
          {data.map((s, i) => <View key={i} style={[S.stackSeg, { width: `${Math.max(2, s.pct)}%`, backgroundColor: s.color }]} />)}
        </View>
        {data.map((s, i) => (
          <View key={i} style={S.subjRow}>
            <View style={[S.subjDot, { backgroundColor: s.color }]} />
            <Text style={[S.subjName, { color: T.text }]}>{s.name}</Text>
            <Text style={[S.subjPct, { color: T.sub }]}>{s.pct}%</Text>
            <Text style={[S.subjTime, { color: T.text }]}>{formatShort(s.sec)}</Text>
          </View>
        ))}
      </View>
    );
  };

  // 리포트 공유
  // 리포트 카드 캡처용 ref
  const reportRef = useRef();

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
    } catch (e) {
      console.log('이미지 공유 실패, 텍스트로 대체:', e);
    }
    // 이미지 공유 실패 시 텍스트 공유 폴백
    const text = buildReportText({
      weekTotal, weekPrev: weekPrevTotal, topSubject,
      avgDensity: weekAvgDensity, streak: app.settings.streak, studyDays: weekStudyDays,
      focusStats: weekFocusStats,
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.scroll}>

        {/* ── 헤더 ── */}
        <View style={S.header}>
          <Text style={[S.headerTitle, { color: T.text }]}>📊 통계</Text>
          <View style={[S.tabRow, { backgroundColor: T.surface2 }]}>
            {[{ id: 'daily', l: '일간' }, { id: 'weekly', l: '주간' }, { id: 'monthly', l: '월간' }, { id: 'heatmap', l: '잔디' }].map(t => (
              <TouchableOpacity key={t.id} style={[S.tabBtn, tab === t.id && { backgroundColor: T.card }]} onPress={() => setTab(t.id)}>
                <Text style={[S.tabText, { color: tab === t.id ? T.text : T.sub }]}>{t.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 요약 카드 ── */}
        <View style={S.summaryRow}>
          <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.sLabel, { color: T.sub }]}>{tab === 'daily' ? '오늘' : tab === 'weekly' ? '이번주' : tab === 'heatmap' ? '공부일수' : viewMonthStr}</Text>
            <Text style={[S.sVal, { color: T.accent }]}>
              {tab === 'heatmap' ? `${totalStudyDays365}일` : formatDuration(tab === 'daily' ? todayTotalSec : tab === 'weekly' ? weekTotal : monthTotalSec)}
            </Text>
          </View>
          <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.sLabel, { color: T.sub }]}>세션</Text>
            <Text style={[S.sVal, { color: T.text }]}>
              {tab === 'daily' ? todaySessions.length
                : tab === 'weekly' ? weekData.reduce((s, d) => s + d.sessions, 0)
                : tab === 'heatmap' ? `🔥${app.settings.streak}`
                : calendarData.filter(Boolean).reduce((s, d) => s + d.sessions, 0)}
              {tab !== 'heatmap' ? '회' : '일'}
            </Text>
          </View>
          <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.sLabel, { color: T.sub }]}>{tab === 'monthly' ? '공부일' : '연속'}</Text>
            <Text style={[S.sVal, { color: T.gold || '#F0B429' }]}>
              {tab === 'monthly' ? `${monthStudyDays}일` : `🔥${app.settings.streak}일`}
            </Text>
          </View>
        </View>

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 일간 */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'daily' && (<>

          {/* 집중밀도 한 줄 가이드 */}
          {!app.settings.guideDensity && todaySessions.length > 0 && (
            <TouchableOpacity onPress={() => app.updateSettings({ guideDensity: true })}
              style={[S.card, { backgroundColor: T.accent + '10', borderColor: T.accent + '30', paddingVertical: 10 }]}>
              <Text style={{ fontSize: 11, color: T.accent, fontWeight: '700', textAlign: 'center' }}>
                📊 집중밀도 = 같은 시간이라도 얼마나 집중했는지! 자세한 건 설정 &gt; 사용 가이드
              </Text>
            </TouchableOpacity>
          )}

          {/* 취약 과목 알림 */}
          {weakSubjects.length > 0 && (
            <View style={[S.weakCard, { backgroundColor: T.accent + '18', borderColor: T.accent + '40' }]}>
              <Text style={[S.weakTitle, { color: T.accent }]}>⚠️ 최근 7일간 안 한 과목</Text>
              <View style={S.weakChips}>
                {weakSubjects.map(s => (
                  <View key={s.id} style={[S.weakChip, { backgroundColor: s.color + '25', borderColor: s.color + '60' }]}>
                    <Text style={[S.weakChipT, { color: s.color }]}>{s.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {todaySessions.length > 0 && (
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
              <Text style={[S.secLabel, { color: T.sub }]}>오늘 평균 집중 밀도</Text>
              <View style={S.tierRow}>
                <View style={[S.tierBig, { backgroundColor: todayTier.color + '20' }]}>
                  <Text style={[S.tierBigT, { color: todayTier.color }]}>{todayTier.label}</Text>
                </View>
                <View>
                  <Text style={[S.tierScore, { color: T.text }]}>{todayAvgDensity}점</Text>
                  <Text style={[S.tierMsg, { color: todayTier.color }]}>{todayTier.message}</Text>
                </View>
              </View>
            </View>
          )}

          {todaySessions.length > 0 && (
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
              <Text style={[S.secLabel, { color: T.sub }]}>오늘 타임라인</Text>
              <View style={S.tlRow}>
                {timeline.map((sec, h) => (
                  <View key={h} style={S.tlCol}>
                    <View style={[S.tlBar, { height: sec > 0 ? Math.max(4, (sec / timelineMax) * 36) : 2, backgroundColor: sec > 0 ? T.accent : T.surface2 }]} />
                    {h % 3 === 0 && <Text style={[S.tlLabel, { color: T.sub }]}>{h}</Text>}
                  </View>
                ))}
              </View>
            </View>
          )}

          {renderSubjects(daySubjects, '과목 비율')}
        </>)}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 주간 */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'weekly' && (<>

          {/* 주간 리포트 카드 버튼 */}
          <TouchableOpacity
            style={[S.reportBtn, { backgroundColor: T.accent }]}
            onPress={() => setShowReport(true)}
            activeOpacity={0.85}
          >
            <Text style={S.reportBtnIcon}>📋</Text>
            <View>
              <Text style={S.reportBtnTitle}>주간 리포트 카드</Text>
              <Text style={S.reportBtnSub}>공유하고 기록으로 남기기</Text>
            </View>
            <Text style={S.reportBtnArrow}>→</Text>
          </TouchableOpacity>

          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>7일간 공부량</Text>
            {weekData.map((d, i) => (
              <View key={i} style={S.barRow}>
                <Text style={[S.barDay, { color: d.isToday ? T.accent : T.sub }]}>{d.day}</Text>
                <View style={[S.barTrack, { backgroundColor: T.surface2 }]}>
                  <View style={[S.barFill, { width: `${Math.max(1, (d.sec / weekMax) * 100)}%`, backgroundColor: d.isToday ? T.accent : T.purple || '#6C5CE7' }]} />
                </View>
                <Text style={[S.barTime, { color: d.sec > 0 ? T.text : T.sub }]}>{d.sec > 0 ? formatShort(d.sec) : '-'}</Text>
              </View>
            ))}
          </View>

          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>집중 밀도 추이</Text>
            <View style={S.densityChart}>
              {weekData.map((d, i) => {
                const h = d.density > 0 ? Math.max(8, (d.density / 120) * 60) : 4;
                const tier = d.density > 0 ? getTier(d.density) : null;
                return (
                  <View key={i} style={S.densityCol}>
                    <View style={[S.densityBar, { height: h, backgroundColor: tier ? tier.color : T.surface2 }]} />
                    <Text style={[S.densityDay, { color: d.isToday ? T.accent : T.sub }]}>{d.day}</Text>
                    {tier && <Text style={[S.densityTier, { color: tier.color }]}>{tier.label}</Text>}
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── 시간대별 집중력 분석 ── */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>시간대별 집중력 패턴 <Text style={{ fontSize: 9 }}>(최근 30일)</Text></Text>
            {timeZoneAnalysis.every(z => z.count === 0) ? (
              <Text style={[S.emptyText, { color: T.sub }]}>데이터가 더 쌓이면 패턴을 알 수 있어요 📊</Text>
            ) : (
              <>
                {timeZoneAnalysis.map((zone, i) => {
                  const maxSec = Math.max(...timeZoneAnalysis.map(z => z.totalSec), 1);
                  const barW = zone.count > 0 ? Math.max(8, (zone.totalSec / maxSec) * 100) : 4;
                  return (
                    <View key={i} style={S.tzRow}>
                      <Text style={[S.tzIcon]}>{zone.icon}</Text>
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
                    </View>
                  );
                })}
                {bestZone && (
                  <View style={[S.bestZoneBanner, { backgroundColor: bestZone.tier ? bestZone.tier.color + '18' : T.surface2, borderColor: bestZone.tier ? bestZone.tier.color + '40' : T.border }]}>
                    <Text style={{ fontSize: 11 }}>{bestZone.icon}</Text>
                    <Text style={[S.bestZoneT, { color: bestZone.tier ? bestZone.tier.color : T.text }]}>
                      {bestZone.label}에 집중력이 가장 높아요!  {bestZone.tier?.label}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {renderSubjects(weekSubjects, '주간 과목 비율')}
        </>)}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 월간 */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'monthly' && (<>
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={S.monthNav}>
              <TouchableOpacity onPress={() => setMonthOffset(p => p - 1)}>
                <Text style={[S.monthArrow, { color: T.accent }]}>◀</Text>
              </TouchableOpacity>
              <Text style={[S.monthTitle, { color: T.text }]}>{viewMonthStr}</Text>
              <TouchableOpacity onPress={() => setMonthOffset(p => Math.min(0, p + 1))} disabled={monthOffset >= 0}>
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
                  <View key={cell.date} style={[S.calCell, cell.isToday && { borderWidth: 1.5, borderColor: T.accent, borderRadius: 6 }]}>
                    <View style={[S.calDot, { backgroundColor: getHeatColor(cell.sec) }]}>
                      <Text style={[S.calDay, { color: cell.sec > 0 ? (cell.sec / monthMaxSec > 0.5 ? 'white' : T.text) : T.sub }]}>{cell.day}</Text>
                    </View>
                    {cell.sec > 0 && <Text style={[S.calTime, { color: T.sub }]}>{cell.sec >= 3600 ? `${Math.floor(cell.sec / 3600)}h` : `${Math.floor(cell.sec / 60)}m`}</Text>}
                  </View>
                );
              })}
            </View>
            <View style={S.heatLegend}>
              <Text style={[S.heatLegendT, { color: T.sub }]}>적음</Text>
              {[T.surface2, T.accent + '30', T.accent + '60', T.accent + 'A0', T.accent].map((c, i) => (
                <View key={i} style={[S.heatBox, { backgroundColor: c }]} />
              ))}
              <Text style={[S.heatLegendT, { color: T.sub }]}>많음</Text>
            </View>
          </View>
          {renderSubjects(monthSubjects, `${viewMonthStr} 과목 비율`)}
        </>)}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 잔디 (365일 히트맵) */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'heatmap' && (<>

          {/* 잔디 한 줄 가이드 */}
          {!app.settings.guideHeatmap && (
            <TouchableOpacity onPress={() => app.updateSettings({ guideHeatmap: true })}
              style={[S.card, { backgroundColor: T.accent + '10', borderColor: T.accent + '30', paddingVertical: 10 }]}>
              <Text style={{ fontSize: 11, color: T.accent, fontWeight: '700', textAlign: 'center' }}>
                🌱 매일 공부하면 칸이 채워져요! 365일 초록색으로 채워보세요!
              </Text>
            </TouchableOpacity>
          )}

          {/* 365일 히트맵 */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={S.hmHeader}>
              <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>365일 공부 잔디</Text>
              <View style={[S.hmBadge, { backgroundColor: T.accent + '20' }]}>
                <Text style={[S.hmBadgeT, { color: T.accent }]}>🌱 {totalStudyDays365}일</Text>
              </View>
            </View>

            {/* 잔디 그리드 + 월 라벨 (하나의 ScrollView 안에서 정렬) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                    {['일', '', '화', '', '목', '', '토'].map((d, i) => (
                      <Text key={i} style={[S.hmDayLabel, { color: T.sub }]}>{d}</Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: HM_GAP }}>
                    {heatmap365.map((week, wi) => (
                      <View key={wi} style={{ flexDirection: 'column', gap: HM_GAP }}>
                        {week.map((day, di) => (
                          <View
                            key={di}
                            style={[
                              S.hmCell,
                              {
                                backgroundColor: getHeat365Color(day),
                                borderWidth: day.isToday ? 1.5 : 0,
                                borderColor: day.isToday ? T.accent : 'transparent',
                              },
                            ]}
                          >
                            {day.hasVerified && !day.isFuture && (
                              <Text style={{ fontSize: 5, textAlign: 'center', color: '#FFF', fontWeight: '900' }}>⭐</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* 범례 */}
            <View style={S.heatLegend}>
              <Text style={[S.heatLegendT, { color: T.sub }]}>적음</Text>
              {[T.surface2, T.accent + '35', T.accent + '65', T.accent + 'A5', T.accent].map((c, i) => (
                <View key={i} style={[S.heatBox, { backgroundColor: c }]} />
              ))}
              <Text style={[S.heatLegendT, { color: T.sub }]}>많음</Text>
            </View>
            <View style={[S.heatLegend, { marginTop: 6 }]}>
              <View style={[S.heatBox, { backgroundColor: T.accent + '65' }]} /><Text style={[S.heatLegendT, { color: T.sub }]}> 📖</Text>
              <View style={[S.heatBox, { backgroundColor: '#4CAF5075', marginLeft: 8 }]} /><Text style={[S.heatLegendT, { color: T.sub }]}> 🔥</Text>
              <View style={[S.heatBox, { backgroundColor: '#FFD70075', marginLeft: 8 }]} /><Text style={[S.heatLegendT, { color: T.sub }]}> 🏆Verified</Text>
            </View>
          </View>

          {/* 시간대별 집중력 분석 (잔디 탭에도 표시) */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>시간대별 집중력 패턴 <Text style={{ fontSize: 9 }}>(최근 30일)</Text></Text>
            {timeZoneAnalysis.every(z => z.count === 0) ? (
              <Text style={[S.emptyText, { color: T.sub }]}>데이터가 더 쌓이면 패턴을 알 수 있어요 📊</Text>
            ) : (
              <>
                {timeZoneAnalysis.map((zone, i) => {
                  const maxSec = Math.max(...timeZoneAnalysis.map(z => z.totalSec), 1);
                  const barW = zone.count > 0 ? Math.max(8, (zone.totalSec / maxSec) * 100) : 4;
                  return (
                    <View key={i} style={S.tzRow}>
                      <Text style={S.tzIcon}>{zone.icon}</Text>
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
                    </View>
                  );
                })}
                {bestZone && (
                  <View style={[S.bestZoneBanner, { backgroundColor: bestZone.tier ? bestZone.tier.color + '18' : T.surface2, borderColor: bestZone.tier ? bestZone.tier.color + '40' : T.border }]}>
                    <Text style={{ fontSize: 11 }}>{bestZone.icon}</Text>
                    <Text style={[S.bestZoneT, { color: bestZone.tier ? bestZone.tier.color : T.text }]}>
                      {bestZone.label}에 집중력이 가장 높아요!  {bestZone.tier?.label}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* 취약 과목 알림 */}
          {weakSubjects.length > 0 && (
            <View style={[S.weakCard, { backgroundColor: T.accent + '18', borderColor: T.accent + '40' }]}>
              <Text style={[S.weakTitle, { color: T.accent }]}>⚠️ 최근 7일간 안 한 과목</Text>
              <View style={S.weakChips}>
                {weakSubjects.map(s => (
                  <View key={s.id} style={[S.weakChip, { backgroundColor: s.color + '25', borderColor: s.color + '60' }]}>
                    <Text style={[S.weakChipT, { color: s.color }]}>{s.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 📓 공부 일기 (메모 있는 세션 전체, 날짜별 그룹) */}
          {(() => {
            const memoed = [...app.sessions]
              .filter(s => s.memo && s.memo.trim())
              .sort((a, b) => (b.date > a.date ? 1 : -1));
            if (memoed.length === 0) return (
              <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                <Text style={[S.secLabel, { color: T.sub }]}>📓 공부 일기</Text>
                <Text style={[S.emptyText, { color: T.sub }]}>타이머 완료 후 메모를 남기면{'\n'}날짜별로 여기 쌓여요 ✏️</Text>
              </View>
            );
            const grouped = {};
            memoed.forEach(s => { if (!grouped[s.date]) grouped[s.date] = []; grouped[s.date].push(s); });
            return (
              <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>📓 공부 일기</Text>
                  <Text style={[{ fontSize: 9, color: T.sub }]}>탭하면 수정</Text>
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
                              {subj ? subj.name : '미지정'} · {formatShort(s.durationSec)} ✏️
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
      <Modal visible={!!editMemo} transparent animationType="fade">
        <View style={S.mo}>
          <View style={[S.moScroll]}>
            <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border, borderRadius: 20, padding: 16, margin: 20 }]}>
              <Text style={[S.modalTitle, { color: T.text }]}>📝 메모 수정</Text>
              <TextInput
                value={editMemoText}
                onChangeText={setEditMemoText}
                style={[S.memoEditInput, { borderColor: T.border, backgroundColor: T.surface2, color: T.text }]}
                maxLength={50}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (editMemo) app.updateSessionMemo(editMemo.sessionId, editMemoText);
                  setEditMemo(null);
                }}
              />
              <Text style={[{ fontSize: 9, color: T.sub, textAlign: 'right', marginBottom: 14 }]}>{editMemoText.length}/50</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[S.mCancel, { borderColor: T.border, flex: 1 }]} onPress={() => setEditMemo(null)}>
                  <Text style={[S.mCancelT, { color: T.sub }]}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.mConfirm, { backgroundColor: T.accent, flex: 1 }]}
                  onPress={() => {
                    if (editMemo) app.updateSessionMemo(editMemo.sessionId, editMemoText);
                    setEditMemo(null);
                  }}
                >
                  <Text style={S.mConfirmT}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 주간 리포트 카드 모달 ── */}
      <Modal visible={showReport} transparent animationType="fade">
        <View style={S.mo}>
          <ScrollView contentContainerStyle={S.moScroll}>
            <ViewShot ref={reportRef} options={{ format: 'png', quality: 1 }}>
              <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border }]}>
                {/* 리포트 헤더 - 그라디언트 느낌 */}
                <View style={[S.reportCardHeader, { backgroundColor: T.accent }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CharacterAvatar characterId={app.settings.mainCharacter} size={40} mood="happy" />
                    <View>
                      <Text style={S.reportCardHeaderT}>📊 주간 리포트</Text>
                      <Text style={S.reportCardHeaderSub}>{dateStr(addDays(new Date(), -6))} ~ {today}</Text>
                    </View>
                  </View>
                </View>

                {/* 핵심 지표 3개 */}
                <View style={S.reportMetrics}>
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: T.accent }]}>{formatDuration(weekTotal)}</Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>총 공부시간</Text>
                  </View>
                  <View style={[S.reportMetricDivider, { backgroundColor: T.border }]} />
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: getTier(weekAvgDensity).color }]}>{getTier(weekAvgDensity).label}</Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>집중밀도</Text>
                  </View>
                  <View style={[S.reportMetricDivider, { backgroundColor: T.border }]} />
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: T.text }]}>{weekStudyDays}<Text style={{ fontSize: 12 }}>/7</Text></Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>공부일</Text>
                  </View>
                </View>

                {/* 지난주 대비 + 연속 */}
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, flex: 1 }]}>
                    {(() => {
                      const diff = weekTotal - weekPrevTotal;
                      const isUp = diff >= 0;
                      return (<>
                        <Text style={{ fontSize: 10, color: T.sub }}>지난주 대비</Text>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: isUp ? '#00C781' : '#FF6B6B', marginTop: 2 }}>
                          {isUp ? '▲' : '▼'} {formatShort(Math.abs(diff))}
                        </Text>
                      </>);
                    })()}
                  </View>
                  <View style={[S.reportMiniCard, { backgroundColor: '#FF7F5012', flex: 1 }]}>
                    <Text style={{ fontSize: 10, color: T.sub }}>연속 공부</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#FF7F50', marginTop: 2 }}>🔥 {app.settings.streak}일</Text>
                  </View>
                </View>

                {/* 최다 과목 */}
                {weekSubjects.length > 0 && (
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, marginHorizontal: 16, marginBottom: 12 }]}>
                    <Text style={{ fontSize: 10, color: T.sub }}>💪 최다 과목</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: weekSubjects[0].color }} />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{weekSubjects[0].name}</Text>
                      <Text style={{ fontSize: 11, color: T.sub }}>{formatShort(weekSubjects[0].sec)}</Text>
                    </View>
                  </View>
                )}

                {/* 투명성 리포트 */}
                {(weekFocusStats.screenOnSessions > 0 || weekFocusStats.screenOffSessions > 0) && (
                  <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 12 }}>
                    <View style={[S.reportMiniCard, { backgroundColor: '#FF6B6B08', flex: 1, alignItems: 'center' }]}>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: '#FF6B6B' }}>{weekFocusStats.screenOnSessions}</Text>
                      <Text style={{ fontSize: 9, color: T.sub, marginTop: 2 }}>🔥 집중</Text>
                    </View>
                    <View style={[S.reportMiniCard, { backgroundColor: '#4CAF5008', flex: 1, alignItems: 'center' }]}>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: '#4CAF50' }}>{weekFocusStats.screenOffSessions}</Text>
                      <Text style={{ fontSize: 9, color: T.sub, marginTop: 2 }}>📖 편하게</Text>
                    </View>
                    <View style={[S.reportMiniCard, { backgroundColor: '#FFD70008', flex: 1, alignItems: 'center' }]}>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFD700' }}>{weekFocusStats.verifiedSessions}</Text>
                      <Text style={{ fontSize: 9, color: T.sub, marginTop: 2 }}>🏆 Verified</Text>
                    </View>
                  </View>
                )}

                {/* 워터마크 */}
                <Text style={{ fontSize: 9, color: T.sub, textAlign: 'center', paddingBottom: 16, opacity: 0.6 }}>
                  열공 멀티타이머 · #공부스타그램
                </Text>
              </View>
            </ViewShot>

            {/* 공유/닫기 버튼 (캡처 영역 밖) */}
            <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 8, paddingBottom: 20 }}>
              <TouchableOpacity style={[S.shareBtn, { backgroundColor: T.accent }]} onPress={handleShareReport} activeOpacity={0.85}>
                <Text style={S.shareBtnT}>📸 이미지로 공유</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowReport(false)} style={[S.shareBtn, { backgroundColor: T.card, borderWidth: 1.5, borderColor: T.border }]} activeOpacity={0.85}>
                <Text style={[S.shareBtnT, { color: T.text }]}>닫기</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// 히트맵 셀 크기
const HM_CELL = 11;
const HM_GAP  = 2;

const S = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  tabRow: { flexDirection: 'row', borderRadius: 8, padding: 2, gap: 2 },
  tabBtn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  tabText: { fontSize: 10, fontWeight: '700' },

  summaryRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 10, borderWidth: 1, alignItems: 'center' },
  sLabel: { fontSize: 9, fontWeight: '600' },
  sVal: { fontSize: 15, fontWeight: '900', marginTop: 2 },

  card: { borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 8 },
  secLabel: { fontSize: 10, fontWeight: '700', marginBottom: 8 },

  // 취약 과목
  weakCard: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 8 },
  weakTitle: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  weakChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  weakChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  weakChipT: { fontSize: 11, fontWeight: '700' },

  // 주간 리포트 버튼
  reportBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 10, marginBottom: 8 },
  reportBtnIcon: { fontSize: 24 },
  reportBtnTitle: { color: 'white', fontSize: 13, fontWeight: '800' },
  reportBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 1 },
  reportBtnArrow: { color: 'white', fontSize: 16, marginLeft: 'auto' },

  // 리포트 카드 모달
  reportCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  reportCardHeader: { padding: 16, alignItems: 'center', gap: 4 },
  reportCardHeaderT: { color: 'white', fontSize: 16, fontWeight: '900' },
  reportCardHeaderSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  reportMetrics: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  reportMetricItem: { flex: 1, alignItems: 'center', gap: 4 },
  reportMetricVal: { fontSize: 18, fontWeight: '900' },
  reportMetricLabel: { fontSize: 9, fontWeight: '600' },
  reportMetricDivider: { width: 1, height: 36 },
  reportMiniCard: { borderRadius: 10, padding: 10 },
  reportCompareLabel: { fontSize: 11, fontWeight: '600' },
  reportCompareVal: { fontSize: 14, fontWeight: '900' },
  reportTopSubj: { marginHorizontal: 16, marginBottom: 12 },
  reportTopSubjLabel: { fontSize: 10, fontWeight: '700' },
  reportTopSubjName: { fontSize: 13, fontWeight: '800' },
  reportStreak: { marginHorizontal: 16, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, borderWidth: 1 },
  reportStreakT: { fontSize: 13, fontWeight: '800' },
  reportTransparency: { marginHorizontal: 16, borderRadius: 12, padding: 14, marginBottom: 16 },
  reportTransTitle: { fontSize: 12, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  reportTransRow: { flexDirection: 'row', justifyContent: 'space-around' },
  reportTransItem: { alignItems: 'center' },
  shareBtn: { marginHorizontal: 16, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  shareBtnT: { color: 'white', fontSize: 14, fontWeight: '800' },

  // 집중도
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  tierBig: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tierBigT: { fontSize: 20, fontWeight: '900' },
  tierScore: { fontSize: 15, fontWeight: '800' },
  tierMsg: { fontSize: 10, fontWeight: '600', marginTop: 1 },

  // 바차트
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 6 },
  barDay: { width: 14, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barTime: { width: 35, fontSize: 10, fontWeight: '600', textAlign: 'right' },

  // 밀도 차트
  densityChart: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 80 },
  densityCol: { alignItems: 'center', gap: 3 },
  densityBar: { width: 16, borderRadius: 3 },
  densityDay: { fontSize: 9, fontWeight: '700' },
  densityTier: { fontSize: 8, fontWeight: '800' },

  // 타임라인
  tlRow: { flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 1 },
  tlCol: { flex: 1, alignItems: 'center' },
  tlBar: { width: '100%', borderRadius: 1, minWidth: 2 },
  tlLabel: { fontSize: 7, marginTop: 2 },

  // 시간대 분석
  tzRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  tzIcon: { fontSize: 14, width: 20 },
  tzLabel: { fontSize: 10, fontWeight: '700', width: 28 },
  tzBarWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tzBarTrack: { flex: 1, height: 7, borderRadius: 3.5, overflow: 'hidden' },
  tzBarFill: { height: '100%', borderRadius: 3.5 },
  tzTime: { fontSize: 9, width: 30, textAlign: 'right' },
  tzTierBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tzTierT: { fontSize: 9, fontWeight: '800' },
  tzEmpty: { fontSize: 9, width: 30, textAlign: 'center' },
  bestZoneBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, padding: 8, borderWidth: 1, marginTop: 4 },
  bestZoneT: { fontSize: 11, fontWeight: '700' },

  // 과목 비율
  stackBar: { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden', marginBottom: 8 },
  stackSeg: { height: '100%' },
  subjRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  subjDot: { width: 8, height: 8, borderRadius: 4 },
  subjName: { flex: 1, fontSize: 11, fontWeight: '600' },
  subjPct: { fontSize: 10 },
  subjTime: { fontSize: 10, fontWeight: '700', width: 35, textAlign: 'right' },

  // 월간 캘린더
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  monthArrow: { fontSize: 14, fontWeight: '800', paddingHorizontal: 8 },
  monthTitle: { fontSize: 15, fontWeight: '900' },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekDay: { flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '700' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  calDot: { width: CELL, height: CELL, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  calDay: { fontSize: 10, fontWeight: '700' },
  calTime: { fontSize: 6, marginTop: 1 },

  // 히트 범례
  heatLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 8 },
  heatBox: { width: 12, height: 12, borderRadius: 2 },
  heatLegendT: { fontSize: 8, fontWeight: '600' },

  // 365일 히트맵
  hmHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  hmBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  hmBadgeT: { fontSize: 11, fontWeight: '800' },
  hmMonthRow: { flexDirection: 'row', marginBottom: 2 },
  hmMonthLabel: { fontSize: 8, fontWeight: '600' },
  hmGrid: { flexDirection: 'row' },
  hmDayLabels: { flexDirection: 'column', gap: HM_GAP, marginRight: HM_GAP, paddingTop: 0 },
  hmDayLabel: { fontSize: 7, fontWeight: '600', height: HM_CELL, lineHeight: HM_CELL, width: 14, textAlign: 'right' },
  hmCell: { width: HM_CELL, height: HM_CELL, borderRadius: 2 },

  // 인사이트
  insightCard: { borderRadius: 14, padding: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  insightText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },

  // 빈 텍스트
  emptyText: { fontSize: 11, textAlign: 'center', paddingVertical: 8 },

  // 공부 일기
  diaryGroup: { marginBottom: 10 },
  diaryDate: { fontSize: 10, fontWeight: '800', marginBottom: 4 },
  diaryRow: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 5, paddingVertical: 2 },
  diaryMemo: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  diaryMeta: { fontSize: 9, marginTop: 1 },
  memoEditInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 12 },

  // 모달
  mo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  moScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 20 },
  mCancel: { marginHorizontal: 16, marginBottom: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  mCancelT: { fontSize: 13, fontWeight: '600' },
});
