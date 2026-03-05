// src/screens/StatsScreen.js  —  v24
// 추가: 히트맵(365일 잔디) · 주간 리포트 카드 · 시간대별 집중력 분석 · 취약 과목 알림
import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Pressable,
  StyleSheet, Dimensions, Share, Animated, TextInput, Platform,
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
import { calcAverageDensity } from '../utils/density';
import CharacterAvatar from '../components/CharacterAvatar';
import Svg, { Circle } from 'react-native-svg';

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

// ─── 일간 리포트 텍스트 생성 ─────────────────────────────────────
function buildDayReportText({ date, totalSec, goalSec, avgDensity, sessions, topSubject, streak }) {
  const tier = getTier(avgDensity);
  const pct = Math.min(100, Math.round(totalSec / Math.max(1, goalSec) * 100));
  return `📊 열공 멀티타이머 오늘 리포트 (${date})

⏱️ 공부시간: ${formatDuration(totalSec)}
🎯 목표 달성: ${pct}% (목표 ${formatDuration(goalSec)})
💫 집중밀도: ${tier.label} ${avgDensity}점
📚 세션: ${sessions}회
${topSubject ? `💪 최다 과목: ${topSubject}` : ''}
🔥 연속 공부: ${streak}일

#열공멀티타이머 #공부스타그램 #수험생`;
}

// ─── 월간 리포트 텍스트 생성 ─────────────────────────────────────
function buildMonthReportText({ monthStr, totalSec, studyDays, totalDays, avgDensity, topSubject }) {
  const tier = getTier(avgDensity);
  return `📊 열공 멀티타이머 ${monthStr} 월간 리포트

⏱️ 총 공부시간: ${formatDuration(totalSec)}
📅 공부일: ${studyDays}/${totalDays}일
💫 평균 집중밀도: ${tier.label} ${avgDensity}점
${topSubject ? `💪 최다 과목: ${topSubject}` : ''}

#열공멀티타이머 #공부스타그램 #월간리포트`;
}

// ─── 잔디 리포트 텍스트 생성 ─────────────────────────────────────
function buildHeatReportText({ studyDays, streak, longestStreak, yearTotal }) {
  return `🌱 열공 멀티타이머 공부 기록

📆 공부일 (최근 6개월): ${studyDays}일
🔥 현재 연속: ${streak}일
🏆 최장 연속: ${longestStreak}일
⏱️ 올해 총 공부: ${formatDuration(yearTotal)}

#열공멀티타이머 #공부스타그램 #공부잔디`;
}

// ─── 과목 레이블 색상 헬퍼 ────────────────────────────────────────
const LABEL_PALETTE = ['#4A90D9', '#E8575A', '#5CB85C', '#F5A623', '#9B6FC3', '#00B894', '#E17055', '#74B9FF', '#A29BFE', '#FD79A8'];
function hashLabelColor(label) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = label.charCodeAt(i) + ((h << 5) - h);
  return LABEL_PALETTE[Math.abs(h) % LABEL_PALETTE.length];
}

// 내장 과목명: 사용자가 과목을 만들지 않아도 라벨에 이 글자가 들어가면 자동 분류
// 긴 이름이 우선 매칭되도록 내부에서 length 내림차순 정렬
const BUILTIN_SUBJECTS = [
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

function getSessionSubject(sess, subjects) {
  // 1. subjectId 직접 매칭
  const subj = subjects.find(s => s.id === sess.subjectId);
  if (subj) return { id: sess.subjectId, name: subj.name, color: subj.color };

  if (sess.label) {
    // 2. 사용자 과목 정확 일치 (예: label='국어' → 국어 과목)
    const exact = subjects.find(s => s.name === sess.label);
    if (exact) return { id: exact.id, name: exact.name, color: exact.color };

    // 3. 사용자 과목명 포함 매칭 (예: label='수능 국어' → 국어 과목)
    //    더 긴 과목명을 우선 매칭 (부분 일치 충돌 방지)
    const sortedUser = [...subjects].sort((a, b) => b.name.length - a.name.length);
    const partial = sortedUser.find(s => sess.label.includes(s.name));
    if (partial) return { id: partial.id, name: partial.name, color: partial.color };

    // 4. 내장 과목명 포함 매칭 (사용자 과목이 없어도 자동 분류)
    //    '수능 국어' → 국어, '국어' → 국어 → 동일 버킷
    const builtin = BUILTIN_SUBJECTS.find(s => sess.label.includes(s.name));
    if (builtin) return { id: `builtin_${builtin.name}`, name: builtin.name, color: builtin.color };

    // 5. 매칭 실패 → 라벨 그대로 (학습법의 '집중', '완전 휴식' 등)
    return { id: `lbl_${sess.label}`, name: sess.label, color: hashLabelColor(sess.label) };
  }

  return { id: '_none', name: '미지정', color: '#B2BEC3' };
}

// ─── 목표 달성 링 컴포넌트 ────────────────────────────────────────
function GoalRing({ pct, size = 88, color, bgColor }) {
  const stroke = Math.round(size * 0.115);
  const r = size / 2;
  const clamped = Math.min(100, Math.max(0, pct));
  const innerR = r - stroke / 2;
  const circumference = 2 * Math.PI * innerR;
  const offset = circumference * (1 - clamped / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={r} cy={r} r={innerR} stroke={bgColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={r} cy={r} r={innerR}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${r} ${r})`}
        />
      </Svg>
      <Text style={{ fontSize: 15, fontWeight: '800', color }}>{clamped}%</Text>
    </View>
  );
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
  const [showDayReport, setShowDayReport] = useState(false);
  const [showMonthReport, setShowMonthReport] = useState(false);
  const [showHeatReport, setShowHeatReport] = useState(false);

  // 주간 탭 이전/다음 주 탐색 (0 = 이번주, -1 = 지난주, ...)
  const [weekOffset, setWeekOffset] = useState(0);

  // 날짜 클릭 상세 모달
  const [dayDetailDate, setDayDetailDate] = useState(null);

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
      return { ...zone, totalSec, avgDensity, tier, count: zoneSess.length };
    });
  }, [weekData, app.sessions]);
  const bestZone = [...timeZoneAnalysis].filter(z => z.count > 0).sort((a, b) => b.avgDensity - a.avgDensity)[0];

  // ─── 시간대별 집중력 분석 (월간 탭 — 선택된 월) ─────────────────
  const monthTimeZoneAnalysis = useMemo(() => {
    const recent = app.sessions.filter(s => s.date?.startsWith(viewMonthStr) && s.startedAt);
    return TIME_ZONES.map(zone => {
      const zoneSess = recent.filter(s => zone.hours.includes(new Date(s.startedAt).getHours()));
      const totalSec = zoneSess.reduce((s, x) => s + (x.durationSec || 0), 0);
      const avgDensity = calcAverageDensity(zoneSess);
      const tier = zoneSess.length > 0 ? getTier(avgDensity) : null;
      return { ...zone, totalSec, avgDensity, tier, count: zoneSess.length };
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

  // 잔디 색상: 📖모드 = accent 계열, 🔥모드 = 초록, Verified = 골드
  const getHeat365Color = (day) => {
    if (day.isFuture) return 'transparent';
    if (day.sec === 0) return T.surface2;
    const r = Math.min(1, day.sec / Math.max(heatmap365Max * 0.8, 3600));
    if (day.hasVerified) {
      // 🏆 Verified 있는 날: 골드 계열
      if (r < 0.25) return '#FFD70066'; if (r < 0.5) return '#FFD70099';
      if (r < 0.75) return '#FFD700CC'; return '#FFD700';
    }
    if (day.hasScreenOn) {
      // 🔥모드 있는 날: 초록
      if (r < 0.25) return '#4CAF5066'; if (r < 0.5) return '#4CAF5099';
      if (r < 0.75) return '#4CAF50CC'; return '#4CAF50';
    }
    // 📖모드만: 기본 accent
    if (r < 0.25) return T.accent + '66'; if (r < 0.5) return T.accent + '99';
    if (r < 0.75) return T.accent + 'CC'; return T.accent;
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

  // ─── 잔디 요약: 올해 총 공부시간 ────────────────────────────
  const yearTotalSec = useMemo(() => {
    const thisYear = new Date().getFullYear().toString();
    return app.sessions.filter(s => s.date?.startsWith(thisYear)).reduce((s, x) => s + (x.durationSec || 0), 0);
  }, [app.sessions]);

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

  // 월간 평균 집중밀도
  const monthAvgDensity = useMemo(() => {
    const prefix = viewMonthStr.replace('.', '-');
    return calcAverageDensity(app.sessions.filter(s => s.date?.startsWith(prefix)));
  }, [app.sessions, viewMonthStr]);

  // 리포트 카드 캡처용 ref
  const reportRef = useRef();
  const dayReportRef = useRef();
  const monthReportRef = useRef();
  const heatReportRef = useRef();

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.scroll}>

        {/* ── 헤더 ── */}
        <View style={S.header}>
          <Text style={[S.headerTitle, { color: T.text }]}>📊 통계</Text>
          <View style={[S.tabRow, { backgroundColor: T.surface2 }]}>
            {[{ id: 'daily', l: '일간' }, { id: 'weekly', l: '주간' }, { id: 'monthly', l: '월간' }, { id: 'heatmap', l: '잔디' }, { id: 'subject', l: '과목' }].map(t => (
              <TouchableOpacity key={t.id} style={[S.tabBtn, tab === t.id && { backgroundColor: T.card }]} onPress={() => setTab(t.id)}>
                <Text style={[S.tabText, { color: tab === t.id ? T.text : T.sub }]}>{t.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 요약 카드 ── */}
        {tab !== 'subject' && <View style={S.summaryRow}>
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
        </View>}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 일간 */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'daily' && (<>

          {/* ── 오늘 리포트 카드 버튼 ── */}
          <TouchableOpacity
            style={[S.reportBtn, { backgroundColor: T.accent }]}
            onPress={() => setShowDayReport(true)}
            activeOpacity={0.85}
          >
            <Text style={S.reportBtnIcon}>📋</Text>
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

          {/* ── 집중밀도 + 목표달성률 2열 ── */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {todaySessions.length > 0 && (
              <TouchableOpacity style={[S.card, { backgroundColor: T.card, borderColor: T.border, flex: 1, marginBottom: 0, alignItems: 'center' }]}
                onPress={() => setShowDensityDetail(true)} activeOpacity={0.8}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>평균 집중밀도</Text>
                  <Text style={{ fontSize: 8, color: T.sub }}>탭 ▸</Text>
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
                <Text style={{ fontSize: 8, color: T.sub }}>탭 ▸</Text>
              </View>
              <GoalRing
                pct={Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100))}
                size={74} color={T.accent} bgColor={T.surface2}
              />
              <Text style={[S.sVal, { color: T.accent, fontSize: 16, marginTop: 5 }]}>{formatDuration(todayTotalSec)}</Text>
              <Text style={[S.sLabel, { color: T.sub, marginTop: 2 }]}>목표 {formatDuration(app.settings.dailyGoalMin * 60)}</Text>
              {todayTotalSec >= app.settings.dailyGoalMin * 60 && (
                <Text style={{ fontSize: 11, color: T.accent, fontWeight: '700', marginTop: 4 }}>🎉 달성!</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Gantt 타임라인 ── */}
          {todaySessions.length > 0 && (
            <TouchableOpacity style={[S.card, { backgroundColor: T.card, borderColor: T.border }]} onPress={() => setShowTimelineModal(true)} activeOpacity={0.85}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>오늘 공부 타임라인</Text>
                <Text style={{ fontSize: 10, color: T.sub, lineHeight: 14 }}>탭: 시간대 상세 ▸</Text>
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
                        <Text style={{ fontSize: 7, fontWeight: '800', color: 'rgba(255,255,255,0.95)', marginTop: 3, marginLeft: 3, marginRight: 2 }} numberOfLines={1}>{sesSubj.name}</Text>
                      )}
                      {durPct > 4 && (
                        <Text style={{ fontSize: 6, color: 'rgba(255,255,255,0.8)', marginLeft: 3 }} numberOfLines={1}>{Math.round(s.durationSec / 60)}분</Text>
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

          {/* ── TODO 카드 ── */}
          {app.todos.length > 0 && (
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>📝 오늘 할 일</Text>
                <Text style={{ fontSize: 11, color: T.sub }}>{app.todos.filter(t => t.done).length}/{app.todos.length} 완료</Text>
              </View>
              {app.todos.map(todo => (
                <TouchableOpacity key={todo.id} onPress={() => app.toggleTodo(todo.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
                  <Text style={{ fontSize: 16, marginRight: 8 }}>{todo.done ? '✅' : '⬜'}</Text>
                  <Text style={{ fontSize: 13, color: todo.done ? T.sub : T.text, textDecorationLine: todo.done ? 'line-through' : 'none', flex: 1 }}>
                    {todo.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

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
                    onPress={() => { setEditMemo({ sessionId: sess.id, memo: sess.memo || '' }); setEditMemoText(sess.memo || ''); }}
                    style={[S.sessCard, { borderLeftColor: subj ? subj.color : '#B2BEC3' }]}
                    activeOpacity={0.75}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subj ? subj.color : '#B2BEC3' }} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>{subj ? subj.name : '미지정'}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: T.sub }}>{startH}{endH ? ` ~ ${endH}` : ''}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: T.accent, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
                      <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '25' }]}>
                        <Text style={{ fontSize: 11, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
                      </View>
                      {sess.verified && <Text style={{ fontSize: 11 }}>🏆</Text>}
                    </View>
                    {sess.memo
                      ? <Text style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>💬 {sess.memo}</Text>
                      : <Text style={{ fontSize: 10, color: T.surface2, marginTop: 2 }}>+ 메모 추가</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

        </>)}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 주간 */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'weekly' && (<>

          {/* ── 주 탐색 헤더 ── */}
          <View style={[S.weekNavRow, { backgroundColor: T.card, borderColor: T.border }]}>
            <TouchableOpacity onPress={() => setWeekOffset(p => p - 1)} style={S.weekNavBtn}>
              <Text style={[S.weekNavArrow, { color: T.accent }]}>◀</Text>
            </TouchableOpacity>
            <Text style={[S.weekNavTitle, { color: T.text }]}>
              {weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난 주' : `${Math.abs(weekOffset)}주 전`}
            </Text>
            <TouchableOpacity onPress={() => setWeekOffset(p => Math.min(0, p + 1))} disabled={weekOffset >= 0} style={S.weekNavBtn}>
              <Text style={[S.weekNavArrow, { color: weekOffset >= 0 ? T.border : T.accent }]}>▶</Text>
            </TouchableOpacity>
          </View>

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
              <TouchableOpacity key={i} onPress={() => d.sec > 0 && setDayDetailDate(d.date)} activeOpacity={d.sec > 0 ? 0.7 : 1}>
                <View style={S.barRow}>
                  <Text style={[S.barDay, { color: d.isToday ? T.accent : T.sub }]}>{d.day}</Text>
                  <View style={[S.barTrack, { backgroundColor: T.surface2 }]}>
                    <View style={[S.barFill, { width: `${Math.max(1, (d.sec / weekMax) * 100)}%`, backgroundColor: d.isToday ? T.accent : T.purple || '#6C5CE7' }]} />
                  </View>
                  <Text style={[S.barTime, { color: d.sec > 0 ? T.text : T.sub }]}>{d.sec > 0 ? formatShort(d.sec) : '-'}</Text>
                  {i === weekBestDayIdx && d.sec > 0 && <Text style={{ fontSize: 12, marginLeft: 2 }}>👑</Text>}
                </View>
              </TouchableOpacity>
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
            <Text style={[S.secLabel, { color: T.sub }]}>시간대별 집중력 패턴 <Text style={{ fontSize: 9 }}>{weekOffset === 0 ? '(이번 주)' : weekOffset === -1 ? '(지난 주)' : `(${Math.abs(weekOffset)}주 전)`}</Text></Text>
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

          {/* ── 월간 리포트 카드 버튼 ── */}
          <TouchableOpacity
            style={[S.reportBtn, { backgroundColor: T.accent }]}
            onPress={() => setShowMonthReport(true)}
            activeOpacity={0.85}
          >
            <Text style={S.reportBtnIcon}>📋</Text>
            <View>
              <Text style={S.reportBtnTitle}>{viewMonthStr} 월간 리포트 카드</Text>
              <Text style={S.reportBtnSub}>공유하고 기록으로 남기기</Text>
            </View>
            <Text style={S.reportBtnArrow}>→</Text>
          </TouchableOpacity>

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
                  <TouchableOpacity key={cell.date} style={[S.calCell, cell.isToday && { borderWidth: 1.5, borderColor: T.accent, borderRadius: 6 }]} onPress={() => cell.sec > 0 && setDayDetailDate(cell.date)} activeOpacity={cell.sec > 0 ? 0.7 : 1}>
                    <View style={[S.calDot, { backgroundColor: getHeatColor(cell.sec) }]}>
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
          {renderSubjects(monthSubjects, `${viewMonthStr} 과목 비율`)}

          {/* ── 시간대별 집중력 분석 (월간) ── */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.secLabel, { color: T.sub }]}>시간대별 집중력 패턴 <Text style={{ fontSize: 9 }}>({viewMonthStr})</Text></Text>
            {monthTimeZoneAnalysis.every(z => z.count === 0) ? (
              <Text style={[S.emptyText, { color: T.sub }]}>데이터가 더 쌓이면 패턴을 알 수 있어요 📊</Text>
            ) : (
              <>
                {monthTimeZoneAnalysis.map((zone, i) => {
                  const maxSec = Math.max(...monthTimeZoneAnalysis.map(z => z.totalSec), 1);
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
                {monthBestZone && (
                  <View style={[S.bestZoneBanner, { backgroundColor: monthBestZone.tier ? monthBestZone.tier.color + '18' : T.surface2, borderColor: monthBestZone.tier ? monthBestZone.tier.color + '40' : T.border }]}>
                    <Text style={{ fontSize: 11 }}>{monthBestZone.icon}</Text>
                    <Text style={[S.bestZoneT, { color: monthBestZone.tier ? monthBestZone.tier.color : T.text }]}>
                      {monthBestZone.label}에 집중력이 가장 높아요!  {monthBestZone.tier?.label}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

        </>)}

        {/* ──────────────────────────────────────────────────── */}
        {/* 탭: 잔디 (365일 히트맵) */}
        {/* ──────────────────────────────────────────────────── */}
        {tab === 'heatmap' && (<>

          {/* ── 잔디 리포트 카드 버튼 ── */}
          <TouchableOpacity
            style={[S.reportBtn, { backgroundColor: T.accent }]}
            onPress={() => setShowHeatReport(true)}
            activeOpacity={0.85}
          >
            <Text style={S.reportBtnIcon}>🌱</Text>
            <View>
              <Text style={S.reportBtnTitle}>공부 기록 카드</Text>
              <Text style={S.reportBtnSub}>잔디 기록 공유하기</Text>
            </View>
            <Text style={S.reportBtnArrow}>→</Text>
          </TouchableOpacity>

          {/* 잔디 한 줄 가이드 */}
          {!app.settings.guideHeatmap && (
            <TouchableOpacity onPress={() => app.updateSettings({ guideHeatmap: true })}
              style={[S.card, { backgroundColor: T.accent + '10', borderColor: T.accent + '30', paddingVertical: 10 }]}>
              <Text style={{ fontSize: 11, color: T.accent, fontWeight: '700', textAlign: 'center' }}>
                🌱 매일 공부하면 칸이 채워져요! 365일 초록색으로 채워보세요!
              </Text>
            </TouchableOpacity>
          )}

          {/* ── 잔디 요약 통계 ── */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={S.hmStatRow}>
              <View style={S.hmStatItem}>
                <Text style={[S.hmStatVal, { color: T.accent }]}>{totalStudyDays365}일</Text>
                <Text style={[S.hmStatLabel, { color: T.sub }]}>공부일</Text>
              </View>
              <View style={[S.hmStatDivider, { backgroundColor: T.border }]} />
              <View style={S.hmStatItem}>
                <Text style={[S.hmStatVal, { color: T.text }]}>🔥{app.settings.streak}일</Text>
                <Text style={[S.hmStatLabel, { color: T.sub }]}>현재 연속</Text>
              </View>
              <View style={[S.hmStatDivider, { backgroundColor: T.border }]} />
              <View style={S.hmStatItem}>
                <Text style={[S.hmStatVal, { color: T.gold || '#F0B429' }]}>{longestStreak}일</Text>
                <Text style={[S.hmStatLabel, { color: T.sub }]}>최장 연속</Text>
              </View>
              <View style={[S.hmStatDivider, { backgroundColor: T.border }]} />
              <View style={S.hmStatItem}>
                <Text style={[S.hmStatVal, { color: T.text }]}>{formatShort(yearTotalSec)}</Text>
                <Text style={[S.hmStatLabel, { color: T.sub }]}>올해 총</Text>
              </View>
            </View>
          </View>

          {/* 365일 히트맵 */}
          <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={S.hmHeader}>
              <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>최근 6개월 공부 잔디</Text>
              <View style={[S.hmBadge, { backgroundColor: T.accent + '20' }]}>
                <Text style={[S.hmBadgeT, { color: T.accent }]}>🌱 {totalStudyDays365}일</Text>
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
                      <Text key={i} style={[S.hmDayLabel, { color: T.sub }]}>{d}</Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: HM_GAP }}>
                    {heatmap365.map((week, wi) => (
                      <View key={wi} style={{ flexDirection: 'column', gap: HM_GAP }}>
                        {week.map((day, di) => (
                          <TouchableOpacity
                            key={di}
                            onPress={() => !day.isFuture && day.sec > 0 && setDayDetailDate(day.date)}
                            activeOpacity={!day.isFuture && day.sec > 0 ? 0.6 : 1}
                          >
                            <View
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
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            {/* 범례 */}
            <View style={S.heatLegend}>
              <Text style={[S.heatLegendT, { color: T.sub }]}>적음</Text>
              {[T.surface2, T.accent + '66', T.accent + '99', T.accent + 'CC', T.accent].map((c, i) => (
                <View key={i} style={[S.heatBox, { backgroundColor: c }]} />
              ))}
              <Text style={[S.heatLegendT, { color: T.sub }]}>많음</Text>
            </View>
            <View style={[S.heatLegend, { marginTop: 6 }]}>
              <View style={[S.heatBox, { backgroundColor: T.accent + '99' }]} /><Text style={[S.heatLegendT, { color: T.sub }]}> 📖</Text>
              <View style={[S.heatBox, { backgroundColor: '#4CAF5099', marginLeft: 8 }]} /><Text style={[S.heatLegendT, { color: T.sub }]}> 🔥</Text>
              <View style={[S.heatBox, { backgroundColor: '#FFD70099', marginLeft: 8 }]} /><Text style={[S.heatLegendT, { color: T.sub }]}> 🏆Verified</Text>
            </View>
            <Text style={{ fontSize: 10, color: T.sub, textAlign: 'center', marginTop: 10, opacity: 0.6 }}>
              📊 잔디를 탭하면 날짜별 상세 통계를 볼 수 있어요
            </Text>
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
                activeOpacity={0.8}
              >
                <Text style={[S.subjPeriodBtnT, { color: subjPeriod === val ? 'white' : T.sub }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {subjectAllStats.length === 0 ? (
            <Text style={[S.emptyText, { color: T.sub, marginTop: 40 }]}>아직 공부 기록이 없어요</Text>
          ) : (<>
            {/* 요약 카드 */}
            <View style={[S.summaryRow, { marginBottom: 12 }]}>
              <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                <Text style={[S.sLabel, { color: T.sub }]}>공부 과목</Text>
                <Text style={[S.sVal, { color: T.text }]}>{subjectAllStats.length}개</Text>
              </View>
              <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                <Text style={[S.sLabel, { color: T.sub }]}>총 공부시간</Text>
                <Text style={[S.sVal, { color: T.accent }]}>{formatDuration(subjectAllStats.reduce((s, x) => s + x.sec, 0))}</Text>
              </View>
            </View>

            {/* 스택 비율 바 + 과목 리스트 */}
            <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
              <Text style={[S.secLabel, { color: T.sub }]}>과목별 비율</Text>
              <View style={[S.stackBar, { backgroundColor: T.surface2, marginBottom: 14 }]}>
                {subjectAllStats.map((s, i) => (
                  <View key={i} style={[S.stackSeg, { width: `${Math.max(2, s.pct)}%`, backgroundColor: s.color }]} />
                ))}
              </View>
              {subjectAllStats.map((s, i) => (
                <TouchableOpacity key={i} style={S.subjListItem} onPress={() => setSubjDetail(s.id)} activeOpacity={0.7}>
                  <View style={[S.subjDot, { backgroundColor: s.color }]} />
                  <Text style={[S.subjName, { color: T.text, flex: 1 }]} numberOfLines={1}>{s.name}</Text>
                  <View style={S.subjListBarTrack}>
                    <View style={[S.subjListBarFill, { width: `${Math.max(2, s.pct)}%`, backgroundColor: s.color + 'CC' }]} />
                  </View>
                  <Text style={[S.subjPct, { color: T.sub, minWidth: 32, textAlign: 'right' }]}>{s.pct}%</Text>
                  <Text style={[S.subjTime, { color: T.text, minWidth: 50, textAlign: 'right' }]}>{formatShort(s.sec)}</Text>
                </TouchableOpacity>
              ))}
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
                    <Text style={{ fontSize: 20 }}>🏆</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: T.sub, marginBottom: 2 }}>가장 집중한 과목</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>
                        {top.name}
                        <Text style={{ fontSize: 12, fontWeight: '400', color: T.accent }}>  {formatShort(top.sec)} ({top.pct}%)</Text>
                      </Text>
                    </View>
                  </View>
                  <View style={[S.subjInsightRow, { borderTopWidth: 1, borderTopColor: T.border, paddingTop: 10 }]}>
                    <Text style={{ fontSize: 20 }}>⚠️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: T.sub, marginBottom: 2 }}>가장 소홀한 과목</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>
                        {neglected.name}
                        {daysSince !== null && daysSince > 0 && (
                          <Text style={{ fontSize: 12, fontWeight: '400', color: '#E17055' }}>  ({daysSince}일째 미공부)</Text>
                        )}
                        {daysSince === 0 && (
                          <Text style={{ fontSize: 12, fontWeight: '400', color: '#00B894' }}>  (오늘 공부함)</Text>
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
                    <Text style={{ fontSize: 11, fontWeight: '700', color: getTier(weekAvgDensity).color }}>{weekAvgDensity}점</Text>
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
          <ScrollView contentContainerStyle={S.moScroll}>
            <ViewShot ref={dayReportRef} options={{ format: 'png', quality: 1 }}>
              <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={[S.reportCardHeader, { backgroundColor: T.accent }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CharacterAvatar characterId={app.settings.mainCharacter} size={40} mood="happy" />
                    <View>
                      <Text style={S.reportCardHeaderT}>📊 오늘 리포트</Text>
                      <Text style={S.reportCardHeaderSub}>{today}</Text>
                    </View>
                  </View>
                </View>
                <View style={S.reportMetrics}>
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: T.accent }]}>{formatDuration(todayTotalSec)}</Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>총 공부시간</Text>
                  </View>
                  <View style={[S.reportMetricDivider, { backgroundColor: T.border }]} />
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: getTier(todayAvgDensity).color }]}>{getTier(todayAvgDensity).label}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: getTier(todayAvgDensity).color }}>{todayAvgDensity}점</Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>집중밀도</Text>
                  </View>
                  <View style={[S.reportMetricDivider, { backgroundColor: T.border }]} />
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: T.text }]}>{todaySessions.length}<Text style={{ fontSize: 12 }}>회</Text></Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>세션</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, flex: 1 }]}>
                    <Text style={{ fontSize: 10, color: T.sub }}>목표 달성</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: T.accent, marginTop: 2 }}>
                      {Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100))}%
                    </Text>
                    <Text style={{ fontSize: 9, color: T.sub, marginTop: 1 }}>목표 {formatDuration(app.settings.dailyGoalMin * 60)}</Text>
                  </View>
                  <View style={[S.reportMiniCard, { backgroundColor: '#FF7F5012', flex: 1 }]}>
                    <Text style={{ fontSize: 10, color: T.sub }}>연속 공부</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#FF7F50', marginTop: 2 }}>🔥 {app.settings.streak}일</Text>
                  </View>
                </View>
                {daySubjects.length > 0 && (
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, marginHorizontal: 16, marginBottom: 12 }]}>
                    <Text style={{ fontSize: 10, color: T.sub }}>💪 최다 과목</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: daySubjects[0].color }} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>{daySubjects[0].name}</Text>
                      <Text style={{ fontSize: 11, color: T.sub, marginLeft: 'auto' }}>{formatShort(daySubjects[0].sec)}</Text>
                    </View>
                  </View>
                )}
                <Text style={{ fontSize: 9, color: T.sub, textAlign: 'center', paddingBottom: 14, opacity: 0.6 }}>
                  열공 멀티타이머 · #공부스타그램
                </Text>
              </View>
            </ViewShot>
            <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 8, paddingBottom: 20 }}>
              <TouchableOpacity style={[S.shareBtn, { backgroundColor: T.accent }]} onPress={handleShareDayReport} activeOpacity={0.85}>
                <Text style={S.shareBtnT}>📸 이미지로 공유</Text>
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
          <ScrollView contentContainerStyle={S.moScroll}>
            <ViewShot ref={monthReportRef} options={{ format: 'png', quality: 1 }}>
              <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={[S.reportCardHeader, { backgroundColor: T.accent }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CharacterAvatar characterId={app.settings.mainCharacter} size={40} mood="happy" />
                    <View>
                      <Text style={S.reportCardHeaderT}>📊 {viewMonthStr} 월간 리포트</Text>
                      <Text style={S.reportCardHeaderSub}>공부일 {monthStudyDays}일 / {calendarData.filter(Boolean).length}일</Text>
                    </View>
                  </View>
                </View>
                <View style={S.reportMetrics}>
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: T.accent }]}>{formatDuration(monthTotalSec)}</Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>총 공부시간</Text>
                  </View>
                  <View style={[S.reportMetricDivider, { backgroundColor: T.border }]} />
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: getTier(monthAvgDensity).color }]}>{getTier(monthAvgDensity).label}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: getTier(monthAvgDensity).color }}>{monthAvgDensity}점</Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>집중밀도</Text>
                  </View>
                  <View style={[S.reportMetricDivider, { backgroundColor: T.border }]} />
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: T.text }]}>{monthStudyDays}<Text style={{ fontSize: 12 }}>일</Text></Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>공부일</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, flex: 1 }]}>
                    <Text style={{ fontSize: 10, color: T.sub }}>📅 공부 비율</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: T.accent, marginTop: 2 }}>
                      {calendarData.filter(Boolean).length > 0 ? Math.round(monthStudyDays / calendarData.filter(Boolean).length * 100) : 0}%
                    </Text>
                  </View>
                  <View style={[S.reportMiniCard, { backgroundColor: '#FF7F5012', flex: 1 }]}>
                    <Text style={{ fontSize: 10, color: T.sub }}>연속 공부</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#FF7F50', marginTop: 2 }}>🔥 {app.settings.streak}일</Text>
                  </View>
                </View>
                {monthSubjects.length > 0 && (
                  <View style={[S.reportMiniCard, { backgroundColor: T.surface2, marginHorizontal: 16, marginBottom: 12 }]}>
                    <Text style={{ fontSize: 10, color: T.sub }}>💪 최다 과목</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: monthSubjects[0].color }} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>{monthSubjects[0].name}</Text>
                      <Text style={{ fontSize: 11, color: T.sub, marginLeft: 'auto' }}>{formatShort(monthSubjects[0].sec)}</Text>
                    </View>
                  </View>
                )}
                <Text style={{ fontSize: 9, color: T.sub, textAlign: 'center', paddingBottom: 14, opacity: 0.6 }}>
                  열공 멀티타이머 · #공부스타그램
                </Text>
              </View>
            </ViewShot>
            <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 8, paddingBottom: 20 }}>
              <TouchableOpacity style={[S.shareBtn, { backgroundColor: T.accent }]} onPress={handleShareMonthReport} activeOpacity={0.85}>
                <Text style={S.shareBtnT}>📸 이미지로 공유</Text>
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
          <ScrollView contentContainerStyle={S.moScroll}>
            <ViewShot ref={heatReportRef} options={{ format: 'png', quality: 1 }}>
              <View style={[S.reportCard, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={[S.reportCardHeader, { backgroundColor: T.accent }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CharacterAvatar characterId={app.settings.mainCharacter} size={40} mood="happy" />
                    <View>
                      <Text style={S.reportCardHeaderT}>🌱 공부 기록</Text>
                      <Text style={S.reportCardHeaderSub}>{new Date().getFullYear()}년 누적</Text>
                    </View>
                  </View>
                </View>
                <View style={S.reportMetrics}>
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: T.accent }]}>{totalStudyDays365}<Text style={{ fontSize: 12 }}>일</Text></Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>공부일</Text>
                  </View>
                  <View style={[S.reportMetricDivider, { backgroundColor: T.border }]} />
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: '#FF7F50' }]}>🔥{app.settings.streak}<Text style={{ fontSize: 12 }}>일</Text></Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>현재 연속</Text>
                  </View>
                  <View style={[S.reportMetricDivider, { backgroundColor: T.border }]} />
                  <View style={S.reportMetricItem}>
                    <Text style={[S.reportMetricVal, { color: T.gold || '#F0B429' }]}>{longestStreak}<Text style={{ fontSize: 12 }}>일</Text></Text>
                    <Text style={[S.reportMetricLabel, { color: T.sub }]}>최장 연속</Text>
                  </View>
                </View>
                <View style={[S.reportMiniCard, { backgroundColor: T.surface2, marginHorizontal: 16, marginBottom: 12 }]}>
                  <Text style={{ fontSize: 10, color: T.sub }}>⏱️ 올해 총 공부시간</Text>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: T.accent, marginTop: 4 }}>{formatDuration(yearTotalSec)}</Text>
                </View>
                <Text style={{ fontSize: 9, color: T.sub, textAlign: 'center', paddingBottom: 14, opacity: 0.6 }}>
                  열공 멀티타이머 · #공부스타그램 #공부잔디
                </Text>
              </View>
            </ViewShot>
            <View style={{ paddingHorizontal: 20, marginTop: 12, gap: 8, paddingBottom: 20 }}>
              <TouchableOpacity style={[S.shareBtn, { backgroundColor: T.accent }]} onPress={handleShareHeatReport} activeOpacity={0.85}>
                <Text style={S.shareBtnT}>📸 이미지로 공유</Text>
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
        <TouchableOpacity style={S.mo} activeOpacity={1} onPress={() => setShowTimelineModal(false)}>
          <TouchableOpacity style={[S.dayDetailSheet, { backgroundColor: T.bg }]} activeOpacity={1}>
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[S.modalTitle, { color: T.text, fontSize: 16, textAlign: 'left', marginBottom: 0 }]}>⏰ 시간대별 공부 현황</Text>
              <TouchableOpacity onPress={() => setShowTimelineModal(false)} style={{ padding: 4 }}>
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
                <Text key={h} style={{ fontSize: 7, color: T.sub }}>{h}시</Text>
              ))}
            </View>
            {/* 시간대별 리스트 */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {hourlyDetail.filter(h => h.sec > 0).length === 0 ? (
                <Text style={[S.emptyText, { color: T.sub }]}>오늘 공부 기록이 없어요</Text>
              ) : (
                hourlyDetail.map(({ hour, sec, subjects }) => {
                  if (sec === 0) return null;
                  // 60분(3600초) = 100% 기준 고정 바
                  return (
                    <View key={hour} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: T.sub, width: 34 }}>{String(hour).padStart(2, '0')}시</Text>
                        <View style={{ flex: 1, height: 14, backgroundColor: T.surface2, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }}>
                          {subjects.map((subj, si) => {
                            const subjPct = Math.min(100, (subj.sec / 3600) * 100);
                            return <View key={si} style={{ width: `${subjPct}%`, height: '100%', backgroundColor: subj.color }} />;
                          })}
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: T.text, width: 35, textAlign: 'right' }}>{Math.round(sec / 60)}분</Text>
                      </View>
                      {subjects.length > 1 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 42, marginTop: 3 }}>
                          {subjects.map((subj, si) => (
                            <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: subj.color }} />
                              <Text style={{ fontSize: 9, color: T.sub }}>{subj.name} {Math.round(subj.sec / 60)}분</Text>
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
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 날짜 상세 모달 ── */}
      <Modal visible={!!dayDetailDate && !editMemo} transparent animationType="slide" onRequestClose={() => setDayDetailDate(null)}>
        <TouchableOpacity style={S.mo} activeOpacity={1} onPress={() => setDayDetailDate(null)}>
          <TouchableOpacity style={[S.dayDetailSheet, { backgroundColor: T.bg }]} activeOpacity={1}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {dayDetail && (<>
                {/* 헤더 */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>{formatDetailDate(dayDetail.date)}</Text>
                  <TouchableOpacity onPress={() => setDayDetailDate(null)} style={{ padding: 4 }}>
                    <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
                  </TouchableOpacity>
                </View>
                {/* 요약 3개 카드 */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
                    <Text style={[S.sLabel, { color: T.sub }]}>총 공부시간</Text>
                    <Text style={[S.sVal, { color: T.accent }]}>{formatDuration(dayDetail.totalSec)}</Text>
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
                              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>{subj ? subj.name : '미지정'}</Text>
                            </View>
                            <Text style={{ fontSize: 12, color: T.sub }}>{startH}{endH ? ` ~ ${endH}` : ''}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 13, color: T.accent, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
                            <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '25' }]}>
                              <Text style={{ fontSize: 11, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
                            </View>
                            {sess.verified && <Text style={{ fontSize: 11 }}>🏆</Text>}
                          </View>
                          {sess.memo && <Text style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>💬 {sess.memo}</Text>}
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
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 과목 상세 모달 ── */}
      <Modal visible={!!subjDetail && !editMemo} transparent animationType="slide" onRequestClose={() => setSubjDetail(null)}>
        <TouchableOpacity style={S.mo} activeOpacity={1} onPress={() => setSubjDetail(null)}>
          <TouchableOpacity style={[S.dayDetailSheet, { backgroundColor: T.bg }]} activeOpacity={1}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {subjDetailData && (<>
                {/* 헤더 */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: subjDetailData.color }} />
                    <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>{subjDetailData.name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSubjDetail(null)} style={{ padding: 4 }}>
                    <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
                  </TouchableOpacity>
                </View>
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
                      <Text style={{ fontSize: 13, color: T.sub }}>마지막 공부일</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>{formatDetailDate(subjDetailData.lastDate)}</Text>
                      {d === 0
                        ? <Text style={{ fontSize: 12, color: '#00B894' }}>· 오늘</Text>
                        : <Text style={{ fontSize: 12, color: T.sub }}>· {d}일 전</Text>}
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
                        <View key={sess.id} style={[S.sessCard, { borderLeftColor: subjDetailData.color }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>{sess.date}</Text>
                            <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '20' }]}>
                              <Text style={{ fontSize: 11, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 12, color: T.sub }}>{startH ? `${startH} 시작` : ''}</Text>
                            <Text style={{ fontSize: 12, color: T.text, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
                          </View>
                          {sess.memo ? <Text style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>💬 {sess.memo}</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </>)}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 목표 달성률 상세 팝업 ── */}
      <Modal visible={showGoalDetail} transparent animationType="slide" onRequestClose={() => setShowGoalDetail(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setShowGoalDetail(false)} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* 헤더 */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>🎯 오늘 목표 달성률</Text>
                <TouchableOpacity onPress={() => setShowGoalDetail(false)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
                </TouchableOpacity>
              </View>
              {/* 큰 링 + 시간 */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <GoalRing
                  pct={Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100))}
                  size={120} color={T.accent} bgColor={T.surface2}
                />
                <Text style={{ fontSize: 22, fontWeight: '900', color: T.text, marginTop: 10 }}>{formatDuration(todayTotalSec)}</Text>
                <Text style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>목표 {formatDuration(app.settings.dailyGoalMin * 60)}</Text>
                {todayTotalSec >= app.settings.dailyGoalMin * 60 ? (
                  <View style={{ backgroundColor: T.accent + '18', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: T.accent }}>🎉 오늘 목표 달성!</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: T.surface2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub }}>
                      남은 시간 {formatDuration(Math.max(0, app.settings.dailyGoalMin * 60 - todayTotalSec))}
                    </Text>
                  </View>
                )}
              </View>
              {/* 이번 주 달성 현황 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: T.text, marginBottom: 10 }}>📅 이번 주 달성 현황</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {weekData.map(d => {
                    const met = d.sec >= app.settings.dailyGoalMin * 60;
                    const isToday = d.date === today;
                    return (
                      <View key={d.date} style={{ alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 9, color: isToday ? T.accent : T.sub, fontWeight: isToday ? '800' : '600' }}>{d.day}</Text>
                        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: d.sec === 0 ? T.surface2 : met ? T.accent + '20' : T.surface2, borderWidth: 1.5, borderColor: d.sec === 0 ? T.border : met ? T.accent : T.border, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 10 }}>{d.sec === 0 ? '' : met ? '✓' : '·'}</Text>
                        </View>
                        <Text style={{ fontSize: 7, color: T.sub }}>{d.sec > 0 ? formatShort(d.sec) : '-'}</Text>
                      </View>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: T.accent }}>{weekData.filter(d => d.sec >= app.settings.dailyGoalMin * 60).length}일</Text>
                    <Text style={{ fontSize: 9, color: T.sub }}>이번 주 달성</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: T.border }} />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: T.accent }}>{app.settings.streak || 0}일</Text>
                    <Text style={{ fontSize: 9, color: T.sub }}>연속 달성</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: T.border }} />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: T.accent }}>{weekData.filter(d => d.sec > 0).length}일</Text>
                    <Text style={{ fontSize: 9, color: T.sub }}>이번 주 공부</Text>
                  </View>
                </View>
              </View>
              {/* 목표 시간 안내 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: T.text, marginBottom: 8 }}>💡 목표 달성 팁</Text>
                {(() => {
                  const pct = Math.min(100, Math.round(todayTotalSec / Math.max(1, app.settings.dailyGoalMin * 60) * 100));
                  const tips = pct >= 100
                    ? ['오늘 목표를 달성했어요! 꾸준히 이어가세요', '연속 달성 기록을 이어가 보세요 🔥']
                    : pct >= 70
                    ? ['조금만 더! 거의 다 왔어요', '짧은 세션을 추가해 목표를 채워보세요']
                    : pct >= 40
                    ? ['오늘 아직 시간이 있어요. 파이팅!', '과목별 타이머로 집중적으로 공부해보세요']
                    : ['목표를 작게 쪼개 시작해보세요', '일단 15분부터 타이머를 시작해보세요'];
                  return tips.map((t, i) => (
                    <Text key={i} style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>• {t}</Text>
                  ));
                })()}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 집중밀도 상세 팝업 ── */}
      <Modal visible={showDensityDetail} transparent animationType="slide" onRequestClose={() => setShowDensityDetail(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setShowDensityDetail(false)} />
          <View style={[S.dayDetailSheet, { backgroundColor: T.bg }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* 헤더 */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[S.modalTitle, { color: T.text, fontSize: 17, textAlign: 'left', marginBottom: 0 }]}>🧠 집중밀도 상세</Text>
                <TouchableOpacity onPress={() => setShowDensityDetail(false)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
                </TouchableOpacity>
              </View>
              {/* 큰 티어 뱃지 + 점수 */}
              <View style={{ alignItems: 'center', marginBottom: 18 }}>
                <View style={{ backgroundColor: todayTier.color + '20', borderRadius: 24, width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 28, fontWeight: '900', color: todayTier.color }}>{todayTier.label}</Text>
                </View>
                <Text style={{ fontSize: 26, fontWeight: '900', color: T.text }}>{todayAvgDensity}점</Text>
                <Text style={{ fontSize: 13, color: todayTier.color, fontWeight: '700', marginTop: 3 }}>{todayTier.message}</Text>
              </View>
              {/* 티어 진행 바 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: T.text, marginBottom: 10 }}>🏆 티어 구간</Text>
                {TIERS.map(tier => {
                  const isCurrentTier = todayTier.id === tier.id;
                  return (
                    <View key={tier.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tier.color + (isCurrentTier ? '30' : '12'), alignItems: 'center', justifyContent: 'center', borderWidth: isCurrentTier ? 2 : 0, borderColor: tier.color }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: tier.color }}>{tier.label}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ height: 8, backgroundColor: T.surface2, borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: 8, borderRadius: 4, backgroundColor: tier.color + (isCurrentTier ? 'FF' : '50'), width: `${((tier.max - tier.min) / 120) * 100 + (tier.min / 120 * 100)}%` }} />
                        </View>
                      </View>
                      <Text style={{ fontSize: 10, fontWeight: isCurrentTier ? '900' : '600', color: isCurrentTier ? tier.color : T.sub, minWidth: 52, textAlign: 'right' }}>
                        {tier.min === 0 ? `~${tier.max}` : tier.max >= 120 ? `${tier.min}+` : `${tier.min}~${tier.max}`}점
                      </Text>
                    </View>
                  );
                })}
              </View>
              {/* 오늘 세션별 밀도 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: T.text, marginBottom: 10 }}>📋 오늘 세션별 밀도</Text>
                {todaySessions.length === 0 ? (
                  <Text style={{ fontSize: 11, color: T.sub }}>세션 기록이 없어요</Text>
                ) : (
                  todaySessions.map((s, i) => {
                    const sesSubj = getSessionSubject(s, app.subjects);
                    const sesTier = getTier(s.focusDensity || 0);
                    return (
                      <View key={s.id || i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: i < todaySessions.length - 1 ? 1 : 0, borderBottomColor: T.border }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sesSubj.color }} />
                        <Text style={{ fontSize: 11, color: T.text, flex: 1 }} numberOfLines={1}>{sesSubj.name}</Text>
                        <Text style={{ fontSize: 10, color: T.sub }}>{formatShort(s.durationSec || 0)}</Text>
                        <View style={{ backgroundColor: sesTier.color + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: sesTier.color }}>{sesTier.label} {s.focusDensity || 0}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
              {/* 점수 계산 기준 */}
              <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: T.text, marginBottom: 8 }}>💡 밀도 점수 기준</Text>
                {[
                  { icon: '⏱', label: '기본 점수', desc: '시간이 길수록 기본점 부여' },
                  { icon: '🔥', label: '집중모드 보너스', desc: '🔥 집중도전(화면 ON) + 이탈 없음 시 최대 +15점' },
                  { icon: '⏸', label: '일시정지 패널티', desc: '자주 멈출수록 -점' },
                  { icon: '✅', label: '자기평가 보너스', desc: '세션 종료 시 자기평가 +점' },
                ].map(item => (
                  <View key={item.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 13 }}>{item.icon}</Text>
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: T.text }}>{item.label}</Text>
                      <Text style={{ fontSize: 9, color: T.sub }}>{item.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// 히트맵 셀 크기
const HM_WEEKS = 20;
const HM_GAP   = 2;
const HM_CELL  = Math.max(8, Math.floor((SW - 72 - (HM_WEEKS - 1) * HM_GAP) / HM_WEEKS));

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
  mConfirm: { marginHorizontal: 16, marginBottom: 16, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  mConfirmT: { color: 'white', fontSize: 13, fontWeight: '700' },

  // 주간 탐색
  weekNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, borderWidth: 1, padding: 8, marginBottom: 8 },
  weekNavBtn: { padding: 8 },
  weekNavArrow: { fontSize: 18, fontWeight: '700' },
  weekNavTitle: { fontSize: 14, fontWeight: '800' },

  // 세션 카드
  sessCard: { borderLeftWidth: 4, borderLeftColor: '#ccc', paddingLeft: 10, paddingVertical: 8, marginBottom: 8, borderRadius: 4 },
  tierSmallBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },

  // 잔디 요약 통계
  hmStatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  hmStatItem: { alignItems: 'center', flex: 1, paddingVertical: 4 },
  hmStatVal: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  hmStatLabel: { fontSize: 10 },
  hmStatDivider: { width: 1, height: 32, opacity: 0.3 },

  // 날짜 상세 모달 시트 (바텀 시트 스타일)
  dayDetailSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', padding: 20, paddingBottom: 36 },

  // 과목 탭
  subjPeriodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  subjPeriodBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  subjPeriodBtnT: { fontSize: 13, fontWeight: '700' },
  subjListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  subjListBarTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.08)' },
  subjListBarFill: { height: 6, borderRadius: 3 },
  subjInsightCard: { borderRadius: 12, padding: 14, marginTop: 12, gap: 10 },
  subjInsightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
