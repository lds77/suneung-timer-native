/**
 * 🎯 수능타이머 네이티브 앱 v3.0 - Phase 3
 * =============================================
 * Phase 3 추가 기능:
 *  ✅ 모의고사 결과 입력 (과목별 점수/오답수/총점/백분위)
 *  ✅ 모의고사 기록 목록 + 삭제
 *  ✅ 오답노트 (과목/문번/오답유형/중요도/내메모)
 *  ✅ 오답노트 목록 + 필터 (전체/미복습/중요/복습예정)
 *  ✅ 오답 복습 모드 (에빙하우스 망각곡선)
 *  ✅ UI 전체 개선 (카드 디자인, 색상 계층, 애니메이션 제거 → 명확성)
 *  ✅ 홈 화면 리디자인 (섹션 구분 명확, 진행률 바)
 *  ✅ 타이머 화면 개선 (원형 진행 애니메이션 시뮬레이션)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Vibration, AppState, Dimensions, Modal,
  Alert, Switch, StatusBar, Platform, KeyboardAvoidingView,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

const { width: SW } = Dimensions.get('window');

// ══════════════════════════════════════════════
// 📚 상수
// ══════════════════════════════════════════════
const SUBJECTS = [
  { name: '국어',  time: 80,  emoji: '📖', color: '#667eea', category: 'subject' },
  { name: '수학',  time: 100, emoji: '📐', color: '#f093fb', category: 'subject' },
  { name: '영어',  time: 70,  emoji: '🌍', color: '#4facfe', category: 'subject' },
  { name: '한국사',time: 30,  emoji: '🏛️', color: '#43e97b', category: 'subject' },
  { name: '탐구1', time: 30,  emoji: '🔬', color: '#fa709a', category: 'subject' },
  { name: '탐구2', time: 30,  emoji: '🧪', color: '#fee140', category: 'subject' },
];

const FOCUS_TIMERS = [
  { name: '집중 25분',  time: 25,  emoji: '🔥', color: '#ff6b6b', category: 'focus' },
  { name: '집중 50분',  time: 50,  emoji: '💪', color: '#e84393', category: 'focus' },
  { name: '집중 90분',  time: 90,  emoji: '🚀', color: '#6c5ce7', category: 'focus' },
  { name: '집중 120분', time: 120, emoji: '⭐', color: '#a29bfe', category: 'focus' },
];

const TIME_ATTACK = [
  { name: '타임어택 3분',  time: 3,  emoji: '⚡', color: '#ff4757', category: 'attack' },
  { name: '타임어택 5분',  time: 5,  emoji: '⚡', color: '#ff6348', category: 'attack' },
  { name: '타임어택 10분', time: 10, emoji: '⚡', color: '#ff7f50', category: 'attack' },
  { name: '타임어택 15분', time: 15, emoji: '⚡', color: '#ffa502', category: 'attack' },
];

const REST_TIMERS = [
  { name: '휴식 5분',  time: 5,  emoji: '☕', color: '#4ecca3', category: 'rest' },
  { name: '휴식 10분', time: 10, emoji: '🍵', color: '#26de81', category: 'rest' },
  { name: '휴식 15분', time: 15, emoji: '🛋️', color: '#20bf6b', category: 'rest' },
];

const MOCK_EXAM_SCHEDULE = [
  { name: '국어',  time: 80,  emoji: '📖', color: '#667eea', break: 20,
    totalQ: 45 },
  { name: '수학',  time: 100, emoji: '📐', color: '#f093fb', break: 50,
    totalQ: 30 },
  { name: '영어',  time: 70,  emoji: '🌍', color: '#4facfe', break: 20,
    totalQ: 45 },
  { name: '한국사',time: 30,  emoji: '🏛️', color: '#43e97b', break: 2,
    totalQ: 20 },
  { name: '탐구1', time: 30,  emoji: '🔬', color: '#fa709a', break: 2,
    totalQ: 20 },
  { name: '탐구2', time: 30,  emoji: '🧪', color: '#fee140', break: 0,
    totalQ: 20 },
];

const WRONG_TYPES = [
  { id: 'concept',  label: '개념 부족', emoji: '📚', color: '#667eea' },
  { id: 'calc',     label: '계산 실수', emoji: '🔢', color: '#f093fb' },
  { id: 'time',     label: '시간 부족', emoji: '⏱️', color: '#fa709a' },
  { id: 'trap',     label: '함정 선지', emoji: '🪤', color: '#ff6b6b' },
  { id: 'reading',  label: '독해 실수', emoji: '👀', color: '#4facfe' },
  { id: 'memory',   label: '암기 부족', emoji: '🧠', color: '#43e97b' },
  { id: 'careless', label: '부주의',    emoji: '😵', color: '#fee140' },
  { id: 'other',    label: '기타',      emoji: '📌', color: '#CD853F' },
];

// 에빙하우스 망각곡선 복습 주기 (일)
const REVIEW_SCHEDULE = [1, 3, 7, 14, 30];

const THEMES = {
  lavender: { primary: '#667eea', accent: '#764ba2', gradient: '#667eea22' },
  pink:     { primary: '#f093fb', accent: '#e84393', gradient: '#f093fb22' },
  blue:     { primary: '#4facfe', accent: '#00f2fe', gradient: '#4facfe22' },
  green:    { primary: '#43e97b', accent: '#38f9d7', gradient: '#43e97b22' },
  orange:   { primary: '#fa709a', accent: '#fee140', gradient: '#fa709a22' },
};

const STUDY_TIPS = {
  '국어':   ['지문 읽기 전 발문을 먼저 보세요.', '비문학은 접속어로 구조를 파악하세요.', '문학은 객관적 근거를 지문에서 찾으세요.'],
  '수학':   ['문제가 요구하는 개념을 먼저 생각하세요.', '풀 수 있는 문제부터 확실히.', '단위와 부호를 마지막에 한 번 더 확인.'],
  '영어':   ['모르는 단어는 앞뒤 문맥으로 추론하세요.', '빈칸 추론은 글의 요지와 연결됩니다.'],
  '한국사': ['사건의 인과관계를 떠올리세요.', '시대별 키워드와 유물을 이미지로 연상하세요.'],
  '탐구1':  ['도표는 가로축·세로축 의미 먼저 파악.', '실험 지문은 변수와 결과만 정확히.'],
  '탐구2':  ['탐구는 시간 싸움. 정형화된 문제는 기계적으로.'],
  '집중':   ['스마트폰은 다른 방에 두세요.', '중간에 자세를 바꿔주면 집중이 유지됩니다.'],
  '타임어택':['시간은 짧지만 집중은 깊게.', '제한 시간이 집중력을 높여줍니다.'],
  '휴식':   ['잠깐 눈을 감고 쉬세요.', '스트레칭이 다음 집중을 도와줍니다.'],
};

const MOTIVATION_MSGS = [
  '오늘도 책상 앞에 앉은 너, 이미 절반은 성공이야. 🌟',
  '어제보다 1문제 더 맞추면 그게 성장이야. 📈',
  '지금 이 순간이 미래의 너를 만들고 있어. 💪',
  '힘들 때가 실력이 느는 때야. 버텨! 🔥',
  '수능은 마라톤. 꾸준함이 최고의 전략이야. 🏃',
  '🧸 잘하고 있어. 너 자신을 믿어.',
  '달콤한 결과는 쓴 노력 뒤에 온다. 🍯',
];

const PAUSE_TIPS = [
  '잠깐 쉬어가는 것도 전략입니다.',
  '물 한 모금이 도움이 됩니다.',
  '5분만 더! 포기하지 마세요.',
  '70%만 집중해도 충분합니다.',
];

// ── 환경음 ──────────────────────────────────────
const AMBIENT_SOUNDS = [
  { id: 'rain',     emoji: '🌧️', name: '빗소리',    url: 'https://www.soundjay.com/nature/sounds/rain-01.mp3' },
  { id: 'cafe',     emoji: '☕', name: '카페',      url: 'https://www.soundjay.com/nature/sounds/rain-02.mp3' },
  { id: 'library',  emoji: '📚', name: '도서관',    url: 'https://www.soundjay.com/nature/sounds/rain-03.mp3' },
  { id: 'fire',     emoji: '🔥', name: '모닥불',    url: 'https://www.soundjay.com/nature/sounds/fire-burning-1.mp3' },
  { id: 'ocean',    emoji: '🌊', name: '파도',      url: 'https://www.soundjay.com/nature/sounds/ocean-wave-1.mp3' },
  { id: 'white',    emoji: '📻', name: '화이트노이즈', url: 'https://www.soundjay.com/nature/sounds/rain-04.mp3' },
];

// ── TTS 수능 방송 스크립트 ──────────────────────
const TTS_ANNOUNCEMENTS = {
  국어: [
    '지금부터 국어 영역 시험을 시작하겠습니다. 수험생 여러분은 문제지 1번부터 45번까지를 잘 확인하시고 문제를 푸십시오.',
    '국어 영역 시험 시간은 80분입니다. 답안지에 수험 번호와 성명을 기재하고 시험을 시작하십시오.',
  ],
  수학: [
    '지금부터 수학 영역 시험을 시작하겠습니다. 수험생 여러분은 문제지 1번부터 30번까지를 잘 확인하시고 문제를 푸십시오.',
    '수학 영역 시험 시간은 100분입니다.',
  ],
  영어: [
    '지금부터 영어 영역 시험을 시작하겠습니다. 수험생 여러분은 문제지 1번부터 45번까지를 잘 확인하시고 문제를 푸십시오.',
    '영어 영역 시험 시간은 70분입니다. 영어 듣기 평가는 시험 시작 후 진행됩니다.',
  ],
  한국사: [
    '지금부터 한국사 영역 시험을 시작하겠습니다. 시험 시간은 30분입니다.',
  ],
  탐구1: [
    '지금부터 탐구 영역 시험을 시작하겠습니다. 첫 번째 선택 과목 시험 시간은 30분입니다.',
  ],
  탐구2: [
    '지금부터 두 번째 선택 과목 시험을 시작하겠습니다. 시험 시간은 30분입니다.',
  ],
  시작벨: '딩동댕동. 지금부터 시험을 시작합니다.',
  종료벨: '딩동댕동. 지금부터 시험을 마칩니다. 수험생 여러분은 필기도구를 놓고 문제지와 답안지를 책상 위에 올려놓으십시오.',
  오분전: '시험 종료 5분 전입니다. 마킹을 확인하시기 바랍니다.',
  일분전: '시험 종료 1분 전입니다. 답안을 최종 확인하십시오.',
};

// ── 주간 목표 과목 기본값 ─────────────────────
const DEFAULT_WEEKLY_GOALS = {
  '국어': 600,   // 분
  '수학': 720,
  '영어': 480,
  '한국사': 180,
  '탐구1': 360,
  '탐구2': 360,
};

// ══════════════════════════════════════════════
// 🔔 알림 설정
// ══════════════════════════════════════════════
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function setupNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('timer-alarm', {
      name: '타이머 알람',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      enableVibrate: true,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('timer-warning', {
      name: '타이머 경고',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      enableVibrate: true,
    });
  }
}

async function scheduleTimerNotification(secondsFromNow, title, body) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default', priority: 'max', channelId: 'timer-alarm' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.floor(secondsFromNow)),
    },
  });
}

async function scheduleWarningNotifications(totalSeconds, subjectName) {
  if (totalSeconds > 300) {
    await Notifications.scheduleNotificationAsync({
      content: { title: `⚠️ ${subjectName} 5분 남았습니다!`, body: '마킹을 확인하세요.', channelId: 'timer-warning' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, totalSeconds - 300) },
    });
  }
  if (totalSeconds > 60) {
    await Notifications.scheduleNotificationAsync({
      content: { title: `🚨 ${subjectName} 1분 남았습니다!`, body: '마지막 점검!', channelId: 'timer-warning' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, totalSeconds - 60) },
    });
  }
}

async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ══════════════════════════════════════════════
// 🛠️ 유틸
// ══════════════════════════════════════════════
const formatTime = (s) => {
  const m = Math.floor(Math.abs(s) / 60);
  const sec = Math.abs(s) % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

const getTodayKey = () => new Date().toLocaleDateString('ko-KR');

// ── 등급 계산 (백분위 기준) ───────────────────────
// 입력: percentile = 백분위 (0~100)
//       "내 점수보다 낮은 응시자 비율" → 상위% = 100 - percentile
//
// ▶ 9등급제 (현행 수능 상대평가)
//   출처: 한국교육과정평가원 / 진학사 공식 자료
//   1등급 상위  4%  → 백분위 96 이상
//   2등급 상위 11%  → 백분위 89 이상
//   3등급 상위 23%  → 백분위 77 이상
//   4등급 상위 40%  → 백분위 60 이상
//   5등급 상위 60%  → 백분위 40 이상
//   6등급 상위 77%  → 백분위 23 이상
//   7등급 상위 89%  → 백분위 11 이상
//   8등급 상위 96%  → 백분위  4 이상
//   9등급 나머지
//
// ▶ 5등급제 (2028 고교 내신 개편, 교육부 확정)
//   출처: 2023.12 교육부 2028 대입제도 개편 확정안
//   A등급 상위 10%  → 백분위 90 이상
//   B등급 상위 34%  → 백분위 66 이상  (누적 34%)
//   C등급 상위 66%  → 백분위 34 이상  (누적 66%)
//   D등급 상위 90%  → 백분위 10 이상  (누적 90%)
//   E등급 나머지                        (누적 100%)
// ─────────────────────────────────────────────────

const GRADE_9 = [
  { minPct: 96, label: '1등급', topRange: '상위 4%',  color: '#43e97b' },
  { minPct: 89, label: '2등급', topRange: '상위 11%', color: '#26de81' },
  { minPct: 77, label: '3등급', topRange: '상위 23%', color: '#4facfe' },
  { minPct: 60, label: '4등급', topRange: '상위 40%', color: '#667eea' },
  { minPct: 40, label: '5등급', topRange: '상위 60%', color: '#a29bfe' },
  { minPct: 23, label: '6등급', topRange: '상위 77%', color: '#fdcb6e' },
  { minPct: 11, label: '7등급', topRange: '상위 89%', color: '#fd9644' },
  { minPct:  4, label: '8등급', topRange: '상위 96%', color: '#ff6b6b' },
  { minPct:  0, label: '9등급', topRange: '하위',     color: '#ff4757' },
];

const GRADE_5 = [
  { minPct: 90, label: 'A등급', topRange: '상위 10%', color: '#43e97b' },
  { minPct: 66, label: 'B등급', topRange: '상위 34%', color: '#4facfe' },
  { minPct: 34, label: 'C등급', topRange: '상위 66%', color: '#667eea' },
  { minPct: 10, label: 'D등급', topRange: '상위 90%', color: '#fa709a' },
  { minPct:  0, label: 'E등급', topRange: '하위 10%', color: '#ff4757' },
];

// percentile: 백분위 (0~100)
const getGrade = (percentile, gradeSystem = '9') => {
  if (percentile === null || percentile === undefined || percentile === '') return '-';
  const p = Number(percentile);
  const table = gradeSystem === '5' ? GRADE_5 : GRADE_9;
  return (table.find(g => p >= g.minPct) || table[table.length - 1]).label;
};

const getGradeColor = (percentile, gradeSystem = '9') => {
  if (percentile === null || percentile === undefined || percentile === '') return '#888';
  const p = Number(percentile);
  const table = gradeSystem === '5' ? GRADE_5 : GRADE_9;
  return (table.find(g => p >= g.minPct) || table[table.length - 1]).color;
};

const getTopRange = (percentile, gradeSystem = '9') => {
  if (percentile === null || percentile === undefined || percentile === '') return '';
  const p = Number(percentile);
  const table = gradeSystem === '5' ? GRADE_5 : GRADE_9;
  return (table.find(g => p >= g.minPct) || table[table.length - 1]).topRange;
};

const getNextReviewDate = (wrong) => {
  const count = wrong.reviewCount || 0;
  const idx = Math.min(count, REVIEW_SCHEDULE.length - 1);
  const base = wrong.lastReviewDate
    ? new Date(wrong.lastReviewDate)
    : new Date(wrong.createdAt);
  return new Date(base.getTime() + REVIEW_SCHEDULE[idx] * 86400000);
};

const isReviewDue = (wrong) => new Date() >= getNextReviewDate(wrong);

const formatDateAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

// ══════════════════════════════════════════════
// 🏠 메인 App
// ══════════════════════════════════════════════
export default function App() {
  // ── 화면 ──
  const [screen, setScreen] = useState('home');
  // home | timer | subTimerScreen | stats | settings
  // | mockResult | mockHistory | wrongList | wrongAdd | wrongDetail | wrongReview
  // | ambient | tts | timeline | weeklyGoal

  // ── 타이머 ──
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showCountdown, setShowCountdown] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [pauseCount, setPauseCount] = useState(0);
  const [completionFocus, setCompletionFocus] = useState({ score: 100, grade: 'S', msg: '완벽한 집중!' });

  // ── 모의고사 ──
  const [mockExamMode, setMockExamMode] = useState(false);
  const [mockExamStep, setMockExamStep] = useState(0);
  const [showBreakPrompt, setShowBreakPrompt] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [pendingExamData, setPendingExamData] = useState(null); // 결과 입력 대기
  const [examRecords, setExamRecords] = useState([]);
  const [editingRecord, setEditingRecord] = useState(null);

  // ── 오답노트 ──
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [wrongFilter, setWrongFilter] = useState('all');
  const [editingWrong, setEditingWrong] = useState(null);
  const [viewingWrong, setViewingWrong] = useState(null);
  const [reviewList, setReviewList] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);

  // ── 보조 타이머 ──
  const [subTimers, setSubTimers] = useState([]);

  // ── 설정 ──
  const [darkMode, setDarkMode] = useState(true);
  const [themeKey, setThemeKey] = useState('lavender');
  const [pauseLimit, setPauseLimit] = useState(0);
  const [dDay, setDDay] = useState('2026-11-12');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [gradeSystem, setGradeSystem] = useState('9'); // '9' = 9등급제  '5' = 5등급제(2028 개편)

  // ── 환경음 ──
  const [ambientId, setAmbientId] = useState(null);   // 재생 중인 사운드 id
  const [ambientVolume, setAmbientVolume] = useState(0.5);
  const ambientSoundRef = useRef(null);

  // ── TTS ──
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [ttsSubject, setTtsSubject] = useState('국어');
  const [ttsAnnounceType, setTtsAnnounceType] = useState('start'); // start|end|five|one|bell

  // ── 주간 목표 ──
  const [weeklyGoals, setWeeklyGoals] = useState(DEFAULT_WEEKLY_GOALS);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalDraftStr, setGoalDraftStr] = useState({}); // {과목: '분(string)'}

  // ── 공부 타임라인 ──
  const [timeline, setTimeline] = useState([]);
  // [{id, subjectName, color, emoji, startAt, endAt, durationMin}]

  // ── 통계 ──
  const [studyStats, setStudyStats] = useState({});

  // ── UI ──
  const [activeTab, setActiveTab] = useState('subject');
  const [quickMemo, setQuickMemo] = useState('');
  const [motivationMsg, setMotivationMsg] = useState('');
  const [currentTip, setCurrentTip] = useState('');
  const [pauseTip, setPauseTip] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCategory, setCustomCategory] = useState('focus');

  // ── Refs ──
  const intervalRef = useRef(null);
  const endTimeRef = useRef(null);
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const selectedSubjectRef = useRef(null);
  const mockExamModeRef = useRef(false);
  const mockExamStepRef = useRef(0);
  const pauseCountRef = useRef(0);
  const studyStartRef = useRef(null);
  const subTimerIntervalRef = useRef(null);
  const warningFiredRef = useRef({ five: false, one: false });
  const appStateRef = useRef(AppState.currentState);

  // ── Sync refs ──
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { selectedSubjectRef.current = selectedSubject; }, [selectedSubject]);
  useEffect(() => { mockExamModeRef.current = mockExamMode; }, [mockExamMode]);
  useEffect(() => { mockExamStepRef.current = mockExamStep; }, [mockExamStep]);
  useEffect(() => { pauseCountRef.current = pauseCount; }, [pauseCount]);

  const theme = THEMES[themeKey] || THEMES.lavender;

  const C = {
    bg: darkMode ? '#0f0f1a' : '#f0f0fa',
    card: darkMode ? '#1a1a2e' : '#ffffff',
    card2: darkMode ? '#16213e' : '#f8f8ff',
    border: darkMode ? '#2a2a4a' : '#e0e0f0',
    text: darkMode ? '#f0f0ff' : '#1a1a2e',
    textSub: darkMode ? '#8888aa' : '#6666aa',
    primary: theme.primary,
    accent: theme.accent,
    gradient: theme.gradient,
    danger: '#ff4757',
    warn: '#ffa502',
    success: '#43e97b',
  };

  // ══════════════════════════════════════════════
  // 🔧 초기화
  // ══════════════════════════════════════════════
  useEffect(() => {
    setupNotifications();
    loadAll();
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      Vibration.vibrate([0, 500, 200, 500, 200, 500], false);
    });
    return () => {
      sub.remove();
      clearInterval(intervalRef.current);
      clearInterval(subTimerIntervalRef.current);
    };
  }, []);

  // AppState
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        if (isRunningRef.current && !isPausedRef.current && endTimeRef.current) {
          const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
          setTimeLeft(remaining);
          if (remaining === 0) handleTimerComplete();
        }
        syncSubTimers();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // ══════════════════════════════════════════════
  // 💾 저장소
  // ══════════════════════════════════════════════
  const loadAll = async () => {
    try {
      const pairs = await AsyncStorage.multiGet([
        'darkMode','themeKey','pauseLimit','dDay','soundEnabled','gradeSystem',
        'studyStats','examRecords','wrongAnswers','weeklyGoals','timeline',
      ]);
      const data = Object.fromEntries(pairs);
      if (data.darkMode)     setDarkMode(JSON.parse(data.darkMode));
      if (data.themeKey)     setThemeKey(data.themeKey);
      if (data.pauseLimit)   setPauseLimit(parseInt(data.pauseLimit));
      if (data.dDay)         setDDay(data.dDay);
      if (data.soundEnabled !== null) setSoundEnabled(JSON.parse(data.soundEnabled));
      if (data.gradeSystem)  setGradeSystem(data.gradeSystem);
      if (data.studyStats)   setStudyStats(JSON.parse(data.studyStats));
      if (data.examRecords)  setExamRecords(JSON.parse(data.examRecords));
      if (data.wrongAnswers) setWrongAnswers(JSON.parse(data.wrongAnswers));
      if (data.weeklyGoals)  setWeeklyGoals(JSON.parse(data.weeklyGoals));
      if (data.timeline)     setTimeline(JSON.parse(data.timeline));
    } catch (e) {}
  };

  const save = async (key, val) => {
    try { await AsyncStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch {}
  };

  const saveStats = (ns) => { setStudyStats(ns); save('studyStats', ns); };
  const saveExamRecords = (r) => { setExamRecords(r); save('examRecords', r); };
  const saveWrongAnswers = (w) => { setWrongAnswers(w); save('wrongAnswers', w); };
  const saveWeeklyGoals = (g) => { setWeeklyGoals(g); save('weeklyGoals', g); };
  const saveTimeline = (t) => { setTimeline(t); save('timeline', t); };

  // ══════════════════════════════════════════════
  // 🎵 환경음
  // ══════════════════════════════════════════════
  const playAmbient = async (soundId) => {
    try {
      // 기존 재생 중이면 정지
      if (ambientSoundRef.current) {
        await ambientSoundRef.current.stopAsync();
        await ambientSoundRef.current.unloadAsync();
        ambientSoundRef.current = null;
      }
      // 같은 버튼 누르면 토글 OFF
      if (ambientId === soundId) {
        setAmbientId(null);
        return;
      }
      const sound_info = AMBIENT_SOUNDS.find(s => s.id === soundId);
      if (!sound_info) return;

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: sound_info.url },
        { shouldPlay: true, isLooping: true, volume: ambientVolume }
      );
      ambientSoundRef.current = sound;
      setAmbientId(soundId);
    } catch (e) {
      Alert.alert('환경음 오류', '소리를 불러올 수 없습니다.\n인터넷 연결을 확인하세요.');
    }
  };

  const stopAmbient = async () => {
    if (ambientSoundRef.current) {
      await ambientSoundRef.current.stopAsync();
      await ambientSoundRef.current.unloadAsync();
      ambientSoundRef.current = null;
    }
    setAmbientId(null);
  };

  const changeAmbientVolume = async (vol) => {
    setAmbientVolume(vol);
    if (ambientSoundRef.current) {
      await ambientSoundRef.current.setVolumeAsync(vol);
    }
  };

  // 앱 종료 시 환경음 정리
  useEffect(() => {
    return () => { if (ambientSoundRef.current) ambientSoundRef.current.unloadAsync(); };
  }, []);

  // ══════════════════════════════════════════════
  // 📢 TTS 수능 방송
  // ══════════════════════════════════════════════
  const speakAnnouncement = async (text) => {
    if (ttsSpeaking) { Speech.stop(); setTtsSpeaking(false); return; }
    setTtsSpeaking(true);
    Speech.speak(text, {
      language: 'ko-KR',
      pitch: 0.95,
      rate: 0.85,
      onDone: () => setTtsSpeaking(false),
      onError: () => setTtsSpeaking(false),
    });
  };

  const getTtsText = () => {
    if (ttsAnnounceType === 'bell_start') return TTS_ANNOUNCEMENTS.시작벨;
    if (ttsAnnounceType === 'bell_end')   return TTS_ANNOUNCEMENTS.종료벨;
    if (ttsAnnounceType === 'five')       return TTS_ANNOUNCEMENTS.오분전;
    if (ttsAnnounceType === 'one')        return TTS_ANNOUNCEMENTS.일분전;
    const scripts = TTS_ANNOUNCEMENTS[ttsSubject];
    if (!scripts) return '';
    return ttsAnnounceType === 'start' ? scripts[0] : (scripts[1] || scripts[0]);
  };

  // ══════════════════════════════════════════════
  // 📅 공부 타임라인
  // ══════════════════════════════════════════════
  const addTimelineEntry = (subjectName, color, emoji, durationMin) => {
    if (!subjectName || durationMin < 1) return;
    const today = getTodayKey();
    const entry = {
      id: Date.now().toString(),
      date: today,
      subjectName,
      color: color || '#667eea',
      emoji: emoji || '📖',
      startAt: studyStartRef.current ? new Date(studyStartRef.current).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '',
      endAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      durationMin: Math.floor(durationMin),
    };
    setTimeline(prev => {
      const next = [entry, ...prev].slice(0, 100); // 최대 100개
      save('timeline', next);
      return next;
    });
  };

  // 타임라인 오늘 항목만 필터
  const getTodayTimeline = () => {
    const today = getTodayKey();
    return timeline.filter(e => e.date === today);
  };

  // ══════════════════════════════════════════════
  // 📊 통계 기록
  // ══════════════════════════════════════════════
  const recordStudyTime = useCallback((subjectName, minutes) => {
    if (!subjectName || minutes < 1) return;
    const today = getTodayKey();
    setStudyStats(prev => {
      const next = { ...prev };
      if (!next[today]) next[today] = {};
      next[today][subjectName] = (next[today][subjectName] || 0) + Math.floor(minutes);
      save('studyStats', next);
      return next;
    });
  }, []);

  // ══════════════════════════════════════════════
  // ⏱️ 타이머 핵심
  // ══════════════════════════════════════════════
  const startInterval = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!isRunningRef.current || isPausedRef.current || !endTimeRef.current) return;
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 300 && !warningFiredRef.current.five) {
        warningFiredRef.current.five = true;
        Vibration.vibrate([100, 50, 100, 50, 100], false);
      }
      if (remaining === 60 && !warningFiredRef.current.one) {
        warningFiredRef.current.one = true;
        Vibration.vibrate([200, 100, 200], false);
      }
      if (remaining === 0) { clearInterval(intervalRef.current); handleTimerComplete(); }
    }, 500);
  }, []);

  const handleTimerComplete = useCallback(() => {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    setTimeLeft(0);
    endTimeRef.current = null;
    deactivateKeepAwake();
    Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500], false);

    if (studyStartRef.current && selectedSubjectRef.current) {
      const elapsed = (Date.now() - studyStartRef.current) / 60000;
      const name = selectedSubjectRef.current.name;
      if (!name.startsWith('휴식')) {
        recordStudyTime(name, elapsed);
        addTimelineEntry(
          name,
          selectedSubjectRef.current.color,
          selectedSubjectRef.current.emoji,
          elapsed
        );
      }
    }
    studyStartRef.current = null;

    const pc = pauseCountRef.current;
    let fm;
    if (pc === 0)      fm = { score: 100, grade: 'S',  msg: '완벽한 집중!' };
    else if (pc === 1) fm = { score: 95,  grade: 'A+', msg: '훌륭한 집중!' };
    else if (pc === 2) fm = { score: 85,  grade: 'A',  msg: '좋은 집중!' };
    else if (pc === 3) fm = { score: 75,  grade: 'B+', msg: '괜찮은 집중!' };
    else if (pc <= 5)  fm = { score: 65,  grade: 'B',  msg: '조금 더!' };
    else               fm = { score: 50,  grade: 'C',  msg: '집중 연습 필요!' };
    setCompletionFocus(fm);

    if (mockExamModeRef.current) {
      const step = mockExamStepRef.current;
      const cur = MOCK_EXAM_SCHEDULE[step];
      if (cur.break === 0 && step < MOCK_EXAM_SCHEDULE.length - 1) {
        const nextStep = step + 1;
        mockExamStepRef.current = nextStep;
        setMockExamStep(nextStep);
        setTimeout(() => startTimerInternal({ ...MOCK_EXAM_SCHEDULE[nextStep], category: 'subject' }), 500);
        return;
      }
      if (step < MOCK_EXAM_SCHEDULE.length - 1) {
        setBreakMinutes(cur.break);
        setShowBreakPrompt(true);
      } else {
        // 모의고사 완료 → 결과 입력 화면
        setMockExamMode(false);
        setMockExamStep(0);
        const examData = {
          id: Date.now(),
          date: new Date().toISOString(),
          subjects: MOCK_EXAM_SCHEDULE.map(s => ({
            name: s.name, emoji: s.emoji, color: s.color,
            score: '', wrongCount: '', totalQ: s.totalQ,
          })),
          totalScore: '', percentile: '', memo: '',
        };
        setPendingExamData(examData);
        setShowCompletion(true);
      }
    } else {
      setShowCompletion(true);
    }
  }, [recordStudyTime]);

  const startTimerInternal = useCallback((subject) => {
    const totalSec = subject.time * 60;
    const endMs = Date.now() + totalSec * 1000;
    setSelectedSubject(subject);
    setTimeLeft(totalSec);
    endTimeRef.current = endMs;
    setIsRunning(true);
    setIsPaused(false);
    setPauseCount(0);
    setQuickMemo('');
    warningFiredRef.current = { five: false, one: false };
    studyStartRef.current = Date.now();
    activateKeepAwakeAsync();
    cancelAllNotifications().then(() => {
      const label = `${subject.emoji} ${subject.name}`;
      scheduleTimerNotification(totalSec, `⏰ ${label} 완료!`, `${label} 시간이 종료되었습니다.`);
      if (!['attack','rest'].includes(subject.category)) {
        scheduleWarningNotifications(totalSec, subject.name);
      }
    });
    startInterval();
    const tips = STUDY_TIPS[subject.name] || STUDY_TIPS['집중'];
    setCurrentTip(tips[Math.floor(Math.random() * tips.length)]);
    showDailyMotivation();
    setScreen('timer');
  }, [startInterval]);

  const startTimer = (subject) => {
    const skipCountdown = ['attack','rest'].includes(subject.category) || subject.name.startsWith('집중');
    if (skipCountdown) {
      startTimerInternal(subject);
    } else {
      setSelectedSubject(subject);
      setCountdown(3);
      setShowCountdown(true);
      setScreen('timer');
    }
  };

  useEffect(() => {
    if (!showCountdown || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [showCountdown, countdown]);

  useEffect(() => {
    if (showCountdown && countdown === 0) {
      setShowCountdown(false);
      if (selectedSubject) startTimerInternal(selectedSubject);
    }
  }, [showCountdown, countdown, selectedSubject, startTimerInternal]);

  const pauseTimer = () => {
    if (!isPaused) {
      if (pauseLimit > 0 && pauseCount >= pauseLimit) {
        Alert.alert('⛔ 일시정지 제한', `${pauseLimit}회 초과! 끝까지 집중하세요!`);
        Vibration.vibrate([100, 50, 100], false);
        return;
      }
      setIsPaused(true);
      setPauseCount(p => p + 1);
      cancelAllNotifications();
      deactivateKeepAwake();
      clearInterval(intervalRef.current);
      setPauseTip(PAUSE_TIPS[Math.floor(Math.random() * PAUSE_TIPS.length)]);
    } else {
      const newEndMs = Date.now() + timeLeft * 1000;
      endTimeRef.current = newEndMs;
      setIsPaused(false);
      activateKeepAwakeAsync();
      const label = `${selectedSubject.emoji} ${selectedSubject.name}`;
      scheduleTimerNotification(timeLeft, `⏰ ${label} 완료!`, `${label} 시간이 종료되었습니다.`);
      startInterval();
    }
  };

  const stopTimer = () => {
    Alert.alert('타이머 종료', '타이머를 종료하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '종료', style: 'destructive', onPress: () => {
        if (studyStartRef.current && selectedSubject) {
          const elapsed = (Date.now() - studyStartRef.current) / 60000;
          if (!selectedSubject.name.startsWith('휴식')) recordStudyTime(selectedSubject.name, elapsed);
        }
        clearInterval(intervalRef.current);
        cancelAllNotifications();
        deactivateKeepAwake();
        endTimeRef.current = null;
        studyStartRef.current = null;
        setIsRunning(false);
        setIsPaused(false);
        setSelectedSubject(null);
        setTimeLeft(0);
        setMockExamMode(false);
        setMockExamStep(0);
        setShowCompletion(false);
        setShowBreakPrompt(false);
        setScreen('home');
      }},
    ]);
  };

  const dismissCompletion = () => {
    // 모의고사 완료 → 결과 입력
    if (pendingExamData) {
      setShowCompletion(false);
      setScreen('mockResult');
      return;
    }
    setShowCompletion(false);
    setIsRunning(false);
    setSelectedSubject(null);
    setTimeLeft(0);
    setScreen('home');
  };

  // ══════════════════════════════════════════════
  // 🎓 모의고사
  // ══════════════════════════════════════════════
  const startMockExam = () => {
    setMockExamMode(true);
    setMockExamStep(0);
    startTimerInternal({ ...MOCK_EXAM_SCHEDULE[0], category: 'subject' });
  };

  const startBreakTimer = () => {
    setShowBreakPrompt(false);
    startTimerInternal({ name: '휴식', emoji: '☕', color: '#4ecca3', time: breakMinutes, category: 'rest' });
  };

  const skipBreak = () => {
    setShowBreakPrompt(false);
    const nextStep = mockExamStepRef.current + 1;
    if (nextStep < MOCK_EXAM_SCHEDULE.length) {
      setMockExamStep(nextStep);
      mockExamStepRef.current = nextStep;
      startTimerInternal({ ...MOCK_EXAM_SCHEDULE[nextStep], category: 'subject' });
    }
  };

  // ══════════════════════════════════════════════
  // ⏲️ 보조 타이머
  // ══════════════════════════════════════════════
  const syncSubTimers = () => {
    const now = Date.now();
    setSubTimers(prev => prev.map(t => {
      if (!t.running || t.paused) return t;
      if (t.mode === 'stopwatch') return { ...t, elapsed: Math.floor((now - t.startedAt) / 1000) };
      if (t.mode === 'countdown' && t.endTime) {
        const remaining = Math.max(0, Math.ceil((t.endTime - now) / 1000));
        if (remaining === 0) return { ...t, remaining: 0, running: false };
        return { ...t, remaining };
      }
      return t;
    }));
  };

  useEffect(() => {
    const hasActive = subTimers.some(t => t.running && !t.paused);
    if (!hasActive) { clearInterval(subTimerIntervalRef.current); return; }
    subTimerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      setSubTimers(prev => prev.map(t => {
        if (!t.running || t.paused) return t;
        if (t.mode === 'stopwatch') return { ...t, elapsed: Math.floor((now - t.startedAt) / 1000) };
        if (t.mode === 'countdown' && t.endTime) {
          const remaining = Math.max(0, Math.ceil((t.endTime - now) / 1000));
          if (remaining === 0) {
            Vibration.vibrate([300, 100, 300, 100, 300], false);
            return { ...t, remaining: 0, running: false };
          }
          return { ...t, remaining };
        }
        return t;
      }));
    }, 500);
    return () => clearInterval(subTimerIntervalRef.current);
  }, [subTimers]);

  const addSubTimer = (mode) => {
    if (subTimers.length >= 2) { Alert.alert('최대 2개까지 추가 가능합니다'); return; }
    const id = Date.now();
    if (mode === 'stopwatch') {
      setSubTimers(prev => [...prev, { id, mode, label: '스톱워치', running: true, paused: false, elapsed: 0, startedAt: id }]);
    } else {
      setSubTimers(prev => [...prev, { id, mode: 'countdown', label: '카운트다운', running: false, paused: false, remaining: 25 * 60, setMinutes: 25, endTime: null }]);
    }
  };

  const toggleSubTimer = (id) => {
    const now = Date.now();
    setSubTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (!t.running) return t.mode === 'countdown'
        ? { ...t, running: true, paused: false, endTime: now + t.remaining * 1000 }
        : { ...t, running: true, paused: false, startedAt: now };
      if (t.paused) return t.mode === 'countdown'
        ? { ...t, paused: false, endTime: now + t.remaining * 1000 }
        : { ...t, paused: false, startedAt: now - t.elapsed * 1000 };
      if (t.mode === 'countdown' && t.endTime) {
        return { ...t, paused: true, remaining: Math.max(0, Math.ceil((t.endTime - now) / 1000)), endTime: null };
      }
      return { ...t, paused: true, elapsed: Math.floor((now - t.startedAt) / 1000) };
    }));
  };

  const removeSubTimer = (id) => setSubTimers(prev => prev.filter(t => t.id !== id));

  // ══════════════════════════════════════════════
  // 🔖 오답노트
  // ══════════════════════════════════════════════
  const addWrongAnswer = (data) => {
    const newW = { id: Date.now(), ...data, createdAt: new Date().toISOString(), reviewed: false, reviewCount: 0, lastReviewDate: null };
    const updated = [newW, ...wrongAnswers];
    saveWrongAnswers(updated);
  };

  const updateWrongAnswer = (id, data) => {
    const updated = wrongAnswers.map(w => w.id === id ? { ...w, ...data } : w);
    saveWrongAnswers(updated);
  };

  const deleteWrongAnswer = (id) => {
    Alert.alert('오답 삭제', '이 오답을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => {
        const updated = wrongAnswers.filter(w => w.id !== id);
        saveWrongAnswers(updated);
        setScreen('wrongList');
      }},
    ]);
  };

  const completeReview = () => {
    const cur = reviewList[reviewIndex];
    updateWrongAnswer(cur.id, {
      reviewed: true,
      reviewCount: (cur.reviewCount || 0) + 1,
      lastReviewDate: new Date().toISOString(),
    });
    if (reviewIndex < reviewList.length - 1) {
      setReviewIndex(i => i + 1);
    } else {
      Alert.alert('🎉 복습 완료!', `${reviewList.length}개 오답 복습 완료!`);
      setScreen('wrongList');
    }
  };

  const getFilteredWrong = () => {
    switch (wrongFilter) {
      case 'unreviewed': return wrongAnswers.filter(w => !w.reviewed);
      case 'important':  return wrongAnswers.filter(w => w.importance === 3);
      case 'due':        return wrongAnswers.filter(w => isReviewDue(w));
      default:           return wrongAnswers;
    }
  };

  const startReview = (mode) => {
    let list = [...wrongAnswers];
    if (mode === 'unreviewed') list = list.filter(w => !w.reviewed);
    else if (mode === 'important') list = list.filter(w => w.importance === 3);
    else if (mode === 'due') list = list.filter(w => isReviewDue(w));
    if (!list.length) { Alert.alert('복습할 오답이 없습니다'); return; }
    setReviewList(list);
    setReviewIndex(0);
    setScreen('wrongReview');
  };

  // ══════════════════════════════════════════════
  // 📋 모의고사 기록
  // ══════════════════════════════════════════════
  const saveExamResult = (data) => {
    const updated = [data, ...examRecords];
    saveExamRecords(updated);
    setPendingExamData(null);
    setScreen('mockHistory');
  };

  const deleteExamRecord = (id) => {
    Alert.alert('기록 삭제', '이 모의고사 기록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => saveExamRecords(examRecords.filter(r => r.id !== id)) },
    ]);
  };

  // ══════════════════════════════════════════════
  // 🎯 유틸
  // ══════════════════════════════════════════════
  const showDailyMotivation = async () => {
    const today = getTodayKey();
    const shown = await AsyncStorage.getItem('motivationShown').catch(() => null);
    if (shown !== today) {
      setMotivationMsg(MOTIVATION_MSGS[Math.floor(Math.random() * MOTIVATION_MSGS.length)]);
      await AsyncStorage.setItem('motivationShown', today).catch(() => {});
      setTimeout(() => setMotivationMsg(''), 5000);
    }
  };

  const getDaysLeft = () => Math.ceil((new Date(dDay) - new Date()) / 86400000);
  const getTodayMin = () => Object.values(studyStats[getTodayKey()] || {}).reduce((a, b) => a + b, 0);
  const getProgress = () => (!selectedSubject || selectedSubject.time * 60 === 0) ? 0
    : ((selectedSubject.time * 60 - timeLeft) / (selectedSubject.time * 60)) * 100;
  const isWarn = timeLeft <= 300 && timeLeft > 60 && isRunning && !isPaused;
  const isCrit = timeLeft <= 60 && isRunning && !isPaused;
  const timerColor = isCrit ? C.danger : isWarn ? C.warn : C.primary;

  const dueCount = wrongAnswers.filter(w => isReviewDue(w)).length;
  const unreviewedCount = wrongAnswers.filter(w => !w.reviewed).length;

  // ══════════════════════════════════════════════
  // 📐 진행률 원 (SVG 없이 View로 시뮬레이션)
  // ══════════════════════════════════════════════
  const RING_SIZE = 220;
  const progressWidth = (getProgress() / 100) * (RING_SIZE - 20);

  // ══════════════════════════════════════════════
  // 🖥️ 렌더링
  // ══════════════════════════════════════════════

  // ──────────────────────────────────────────────
  // ① 타이머 화면
  // ──────────────────────────────────────────────
  if (screen === 'timer') {
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle="light-content" />

        {/* 3-2-1 카운트다운 오버레이 */}
        {showCountdown && (
          <View style={[st.overlay, { backgroundColor: 'rgba(10,10,26,0.95)' }]}>
            <Text style={st.cdEmoji}>{selectedSubject?.emoji}</Text>
            <Text style={[st.cdSubject, { color: C.text }]}>{selectedSubject?.name}</Text>
            <Text style={[st.cdNum, { color: C.primary }]}>{countdown}</Text>
            <Text style={[st.cdLabel, { color: C.textSub }]}>준비…</Text>
          </View>
        )}

        {/* 휴식 프롬프트 */}
        {showBreakPrompt && (
          <View style={[st.overlay, { backgroundColor: 'rgba(10,10,26,0.95)' }]}>
            <Text style={st.breakIcon}>☕</Text>
            <Text style={[st.breakTitle, { color: C.text }]}>휴식 시간</Text>
            <Text style={[st.breakSub, { color: C.textSub }]}>{breakMinutes}분 휴식</Text>
            {mockExamStep < MOCK_EXAM_SCHEDULE.length - 1 && (
              <View style={[st.breakNextBox, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[st.breakNextLabel, { color: C.textSub }]}>다음 과목</Text>
                <Text style={[st.breakNextVal, { color: C.text }]}>
                  {MOCK_EXAM_SCHEDULE[mockExamStep + 1]?.emoji} {MOCK_EXAM_SCHEDULE[mockExamStep + 1]?.name}
                </Text>
              </View>
            )}
            <TouchableOpacity style={[st.breakBtn, { backgroundColor: C.primary }]} onPress={startBreakTimer}>
              <Text style={st.breakBtnText}>☕ {breakMinutes}분 휴식 시작</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.breakSkip} onPress={skipBreak}>
              <Text style={[st.breakSkipText, { color: C.textSub }]}>건너뛰고 다음 과목 →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 완료 오버레이 */}
        {showCompletion && (
          <View style={[st.overlay, { backgroundColor: 'rgba(10,10,26,0.96)' }]}>
            <Text style={st.compEmoji}>🎉</Text>
            <Text style={[st.compTitle, { color: C.text }]}>완료!</Text>
            {selectedSubject && (
              <Text style={[st.compSubject, { color: C.textSub }]}>
                {selectedSubject.emoji} {selectedSubject.name}
              </Text>
            )}
            <View style={[st.compScoreBox, { backgroundColor: C.card, borderColor: C.primary + '66' }]}>
              <Text style={[st.compGrade, { color: C.primary }]}>{completionFocus.grade}</Text>
              <Text style={[st.compScore, { color: C.text }]}>{completionFocus.score}점</Text>
              <Text style={[st.compMsg, { color: C.textSub }]}>{completionFocus.msg}</Text>
              <Text style={[st.compPause, { color: C.textSub }]}>일시정지 {pauseCount}회</Text>
            </View>
            {pendingExamData ? (
              <TouchableOpacity style={[st.compBtn, { backgroundColor: C.primary }]} onPress={dismissCompletion}>
                <Text style={st.compBtnText}>📋 모의고사 결과 입력하기</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[st.compBtn, { backgroundColor: C.primary }]} onPress={dismissCompletion}>
                <Text style={st.compBtnText}>확인 ✓</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 동기부여 배너 */}
        {!!motivationMsg && (
          <View style={[st.motBanner, { backgroundColor: C.primary + 'dd' }]}>
            <Text style={st.motText}>{motivationMsg}</Text>
          </View>
        )}

        {/* 헤더 */}
        <View style={[st.timerHdr, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={stopTimer} style={st.stopBtn}>
            <Text style={[st.stopBtnText, { color: C.textSub }]}>✕</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[st.timerTitle, { color: C.text }]}>
              {selectedSubject ? `${selectedSubject.emoji} ${selectedSubject.name}` : '타이머'}
            </Text>
            {mockExamMode && (
              <Text style={[st.mockBadge, { color: C.primary }]}>
                📋 모의고사 {mockExamStep + 1}/{MOCK_EXAM_SCHEDULE.length}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setScreen('subTimerScreen')} style={st.subBtn}>
            <Text style={[{ color: C.primary, fontSize: 14, fontWeight: '700' }]}>+⏱</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={st.flex} showsVerticalScrollIndicator={false}>
          {/* 원형 타이머 */}
          <View style={st.ringWrap}>
            {/* 배경 링 */}
            <View style={[st.ringBg, { borderColor: C.border }]} />
            {/* 진행 링 (상단 바로 시각화) */}
            <View style={[st.ringProgress, {
              width: progressWidth,
              backgroundColor: timerColor + '55',
              borderRadius: 4,
              position: 'absolute',
              top: 12,
              left: (RING_SIZE - progressWidth) / 2,
            }]} />
            {/* 원 */}
            <View style={[st.ringCircle, { borderColor: timerColor }]}>
              <Text style={[st.timeDisplay, { color: timerColor }]}>
                {formatTime(timeLeft)}
              </Text>
              {selectedSubject && (
                <Text style={[st.timeTotalLabel, { color: C.textSub }]}>
                  / {formatTime(selectedSubject.time * 60)}
                </Text>
              )}
              {isPaused && <Text style={[st.pausedLabel, { color: C.warn }]}>⏸ 일시정지</Text>}
            </View>
            {/* 진행률 */}
            <Text style={[st.pctLabel, { color: C.textSub }]}>{Math.round(getProgress())}% 완료</Text>
          </View>

          {/* 진행 바 */}
          <View style={[st.progressBarWrap, { backgroundColor: C.border }]}>
            <View style={[st.progressBarFill, { width: `${getProgress()}%`, backgroundColor: timerColor }]} />
          </View>

          {/* 팁 */}
          {(!!currentTip || !!pauseTip) && (
            <View style={[st.tipBox, { backgroundColor: C.card, borderColor: isPaused ? C.warn + '44' : C.border }]}>
              <Text style={[st.tipText, { color: isPaused ? C.warn : C.textSub }]}>
                {isPaused ? `⏸ ${pauseTip}` : `💡 ${currentTip}`}
              </Text>
            </View>
          )}

          {/* 퀵 메모 */}
          <View style={[st.memoBox, { backgroundColor: C.card, borderColor: C.border }]}>
            <TextInput
              style={[st.memoInput, { color: C.text }]}
              placeholder="⚡ 빠른 메모..."
              placeholderTextColor={C.textSub}
              value={quickMemo}
              onChangeText={setQuickMemo}
              multiline
            />
          </View>

          {/* 보조 타이머 미니 */}
          {subTimers.length > 0 && (
            <View style={[st.subMini, { backgroundColor: C.card, borderColor: C.border }]}>
              {subTimers.map(t => (
                <TouchableOpacity key={t.id} style={st.subMiniItem} onPress={() => toggleSubTimer(t.id)}>
                  <Text style={[st.subMiniLabel, { color: C.textSub }]}>{t.label}</Text>
                  <Text style={[st.subMiniTime, { color: t.running && !t.paused ? C.primary : C.textSub }]}>
                    {t.mode === 'stopwatch' ? formatTime(t.elapsed) : formatTime(t.remaining)}
                    {' '}{t.running && !t.paused ? '▶' : '⏸'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* 컨트롤 버튼 (하단 고정) */}
        <View style={[st.controls, { backgroundColor: C.bg, borderTopColor: C.border }]}>
          <TouchableOpacity
            style={[st.ctrlBtn, { backgroundColor: isPaused ? C.primary : C.warn }]}
            onPress={pauseTimer}
          >
            <Text style={st.ctrlBtnText}>{isPaused ? '▶ 재개' : '⏸ 일시정지'}</Text>
            {pauseLimit > 0 && <Text style={st.ctrlBtnSub}>{pauseCount}/{pauseLimit}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[st.ctrlBtn, { backgroundColor: C.danger }]} onPress={stopTimer}>
            <Text style={st.ctrlBtnText}>⏹ 종료</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // ② 보조 타이머 화면
  // ──────────────────────────────────────────────
  if (screen === 'subTimerScreen') {
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader title="⏲️ 보조 타이머" onBack={() => setScreen('timer')} C={C} />
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {subTimers.map(t => (
            <View key={t.id} style={[st.subCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[st.subCardLabel, { color: C.text }]}>{t.label}</Text>
              <Text style={[st.subCardTime, { color: C.primary }]}>
                {t.mode === 'stopwatch' ? formatTime(t.elapsed) : formatTime(t.remaining)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[st.subCardBtn, { backgroundColor: C.primary }]} onPress={() => toggleSubTimer(t.id)}>
                  <Text style={st.subCardBtnText}>{t.running && !t.paused ? '⏸' : '▶'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.subCardBtn, { backgroundColor: C.danger }]} onPress={() => removeSubTimer(t.id)}>
                  <Text style={st.subCardBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {subTimers.length < 2 && (
            <View style={{ gap: 8 }}>
              <TouchableOpacity style={[st.addSubBtn, { backgroundColor: C.primary }]} onPress={() => addSubTimer('stopwatch')}>
                <Text style={st.addSubBtnText}>+ 스톱워치 추가</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.addSubBtn, { backgroundColor: C.accent }]} onPress={() => addSubTimer('countdown')}>
                <Text style={st.addSubBtnText}>+ 카운트다운 추가</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // ③ 모의고사 결과 입력
  // ──────────────────────────────────────────────
  if (screen === 'mockResult') {
    return (
      <MockResultScreen
        C={C}
        darkMode={darkMode}
        examData={pendingExamData || {
          id: Date.now(), date: new Date().toISOString(),
          subjects: MOCK_EXAM_SCHEDULE.map(s => ({ name: s.name, emoji: s.emoji, color: s.color, score: '', wrongCount: '', totalQ: s.totalQ })),
          totalScore: '', percentile: '', memo: '',
        }}
        onSave={saveExamResult}
        onCancel={() => { setPendingExamData(null); setScreen('mockHistory'); }}
      />
    );
  }

  // ──────────────────────────────────────────────
  // ④ 모의고사 기록
  // ──────────────────────────────────────────────
  if (screen === 'mockHistory') {
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader title="📋 모의고사 기록" onBack={() => setScreen('home')} C={C}
          rightAction={{ label: '+ 직접 입력', onPress: () => { setPendingExamData(null); setScreen('mockResult'); } }}
        />
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {examRecords.length === 0 && (
            <View style={st.emptyBox}>
              <Text style={st.emptyEmoji}>📋</Text>
              <Text style={[st.emptyText, { color: C.textSub }]}>아직 모의고사 기록이 없어요</Text>
              <Text style={[st.emptyHint, { color: C.textSub }]}>모의고사 모드 완료 후 자동으로 기록됩니다</Text>
            </View>
          )}
          {examRecords.map(record => (
            <ExamRecordCard key={record.id} record={record} C={C} gradeSystem={gradeSystem} onDelete={() => deleteExamRecord(record.id)} />
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // ⑤ 오답 추가/수정
  // ──────────────────────────────────────────────
  if (screen === 'wrongAdd') {
    return (
      <WrongAnswerForm
        C={C}
        editData={editingWrong}
        onSave={(data) => {
          if (editingWrong) { updateWrongAnswer(editingWrong.id, data); }
          else { addWrongAnswer(data); }
          setEditingWrong(null);
          setScreen('wrongList');
        }}
        onCancel={() => { setEditingWrong(null); setScreen('wrongList'); }}
      />
    );
  }

  // ──────────────────────────────────────────────
  // ⑥ 오답 상세/복습 단일
  // ──────────────────────────────────────────────
  if (screen === 'wrongDetail' && viewingWrong) {
    return (
      <WrongDetail
        C={C}
        wrong={viewingWrong}
        onBack={() => { setViewingWrong(null); setScreen('wrongList'); }}
        onEdit={() => { setEditingWrong(viewingWrong); setViewingWrong(null); setScreen('wrongAdd'); }}
        onDelete={() => { deleteWrongAnswer(viewingWrong.id); setViewingWrong(null); }}
        onReviewed={() => {
          updateWrongAnswer(viewingWrong.id, {
            reviewed: true,
            reviewCount: (viewingWrong.reviewCount || 0) + 1,
            lastReviewDate: new Date().toISOString(),
          });
          setViewingWrong(null);
          setScreen('wrongList');
        }}
      />
    );
  }

  // ──────────────────────────────────────────────
  // ⑦ 복습 모드
  // ──────────────────────────────────────────────
  if (screen === 'wrongReview' && reviewList.length > 0) {
    const cur = reviewList[reviewIndex];
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <View style={[st.subHeader, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => setScreen('wrongList')}>
            <Text style={[st.backBtn, { color: C.primary }]}>✕ 나가기</Text>
          </TouchableOpacity>
          <Text style={[st.subHeaderTitle, { color: C.text }]}>
            복습 {reviewIndex + 1}/{reviewList.length}
          </Text>
        </View>
        {/* 진행 바 */}
        <View style={[{ height: 4, backgroundColor: C.border }]}>
          <View style={[{ height: 4, backgroundColor: C.primary, width: `${((reviewIndex + 1) / reviewList.length) * 100}%` }]} />
        </View>
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16 }}>
          <View style={[st.reviewCard, { backgroundColor: C.card, borderColor: C.border }]}>
            {/* 과목 + 문번 */}
            <View style={st.reviewTop}>
              <View style={[st.subjectPill, { backgroundColor: (SUBJECTS.find(s => s.name === cur.subject)?.color || C.primary) + '33' }]}>
                <Text style={[st.subjectPillText, { color: SUBJECTS.find(s => s.name === cur.subject)?.color || C.primary }]}>
                  {cur.subject}
                </Text>
              </View>
              <Text style={[st.reviewQNum, { color: C.text }]}>#{cur.questionNumber}번</Text>
              <Text style={[st.reviewImportance, { color: '#ffd700' }]}>
                {'★'.repeat(cur.importance || 1)}
              </Text>
            </View>
            {/* 정답/오답 */}
            {(cur.myAnswer || cur.correctAnswer) && (
              <View style={[st.answerRow, { backgroundColor: C.card2, borderRadius: 10, padding: 12, marginVertical: 10 }]}>
                {cur.myAnswer && (
                  <View style={st.answerCol}>
                    <Text style={[st.answerLabel, { color: C.danger }]}>내 답</Text>
                    <Text style={[st.answerVal, { color: C.text }]}>{cur.myAnswer}</Text>
                  </View>
                )}
                {cur.correctAnswer && (
                  <View style={st.answerCol}>
                    <Text style={[st.answerLabel, { color: C.success }]}>정답</Text>
                    <Text style={[st.answerVal, { color: C.text }]}>{cur.correctAnswer}</Text>
                  </View>
                )}
              </View>
            )}
            {/* 오답 유형 태그 */}
            {cur.wrongTypes?.length > 0 && (
              <View style={st.tagRow}>
                {cur.wrongTypes.map(id => {
                  const wt = WRONG_TYPES.find(t => t.id === id);
                  return wt ? (
                    <View key={id} style={[st.tag, { backgroundColor: wt.color + '22', borderColor: wt.color + '66' }]}>
                      <Text style={[st.tagText, { color: wt.color }]}>{wt.emoji} {wt.label}</Text>
                    </View>
                  ) : null;
                })}
              </View>
            )}
            {/* 메모 */}
            {!!cur.memo && (
              <View style={[st.reviewMemo, { backgroundColor: C.card2 }]}>
                <Text style={[st.reviewMemoLabel, { color: C.textSub }]}>메모</Text>
                <Text style={[st.reviewMemoText, { color: C.text }]}>{cur.memo}</Text>
              </View>
            )}
            {/* 다음 복습 예정 */}
            <View style={[st.reviewSchedule, { borderTopColor: C.border }]}>
              <Text style={[st.reviewScheduleText, { color: C.textSub }]}>
                📅 복습 {cur.reviewCount || 0}회 완료
                {' · '}다음: {getNextReviewDate(cur).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          </View>
        </ScrollView>
        <View style={[st.reviewActions, { backgroundColor: C.bg, borderTopColor: C.border }]}>
          <TouchableOpacity style={[st.reviewCompleteBtn, { backgroundColor: C.primary }]} onPress={completeReview}>
            <Text style={st.reviewCompleteBtnText}>✅ 복습 완료</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // ⑧ 오답 목록
  // ──────────────────────────────────────────────
  if (screen === 'wrongList') {
    const filtered = getFilteredWrong();
    const filters = [
      { key: 'all', label: `전체 ${wrongAnswers.length}` },
      { key: 'due', label: `복습예정 ${dueCount}` },
      { key: 'unreviewed', label: `미복습 ${unreviewedCount}` },
      { key: 'important', label: `중요 ${wrongAnswers.filter(w => w.importance === 3).length}` },
    ];
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader title="📷 오답노트" onBack={() => setScreen('home')} C={C}
          rightAction={{ label: '+ 추가', onPress: () => { setEditingWrong(null); setScreen('wrongAdd'); } }}
        />
        {/* 복습 시작 버튼 */}
        {wrongAnswers.length > 0 && (
          <View style={[st.reviewBtnRow, { backgroundColor: C.card2, borderBottomColor: C.border }]}>
            <TouchableOpacity style={[st.reviewStartBtn, { backgroundColor: C.primary }]} onPress={() => startReview('due')}>
              <Text style={st.reviewStartBtnText}>📅 복습예정 {dueCount}개</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.reviewStartBtn, { backgroundColor: C.accent }]} onPress={() => startReview('unreviewed')}>
              <Text style={st.reviewStartBtnText}>🆕 미복습 {unreviewedCount}개</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* 필터 탭 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[st.filterScroll, { backgroundColor: C.card2, borderBottomColor: C.border }]}
          contentContainerStyle={{ padding: 8, gap: 6 }}>
          {filters.map(f => (
            <TouchableOpacity key={f.key}
              style={[st.filterChip, wrongFilter === f.key && { backgroundColor: C.primary }]}
              onPress={() => setWrongFilter(f.key)}
            >
              <Text style={[st.filterChipText, wrongFilter === f.key && { color: '#fff' }, { color: wrongFilter === f.key ? '#fff' : C.textSub }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 12, gap: 10 }}>
          {filtered.length === 0 && (
            <View style={st.emptyBox}>
              <Text style={st.emptyEmoji}>📷</Text>
              <Text style={[st.emptyText, { color: C.textSub }]}>오답이 없어요</Text>
            </View>
          )}
          {filtered.map(w => {
            const subColor = SUBJECTS.find(s => s.name === w.subject)?.color || C.primary;
            const due = isReviewDue(w);
            return (
              <TouchableOpacity key={w.id}
                style={[st.wrongCard, { backgroundColor: C.card, borderColor: C.border, borderLeftColor: subColor, borderLeftWidth: 4 }]}
                onPress={() => { setViewingWrong(w); setScreen('wrongDetail'); }}
              >
                <View style={st.wrongCardTop}>
                  <View style={[st.subjectPill, { backgroundColor: subColor + '22' }]}>
                    <Text style={[st.subjectPillText, { color: subColor }]}>{w.subject}</Text>
                  </View>
                  <Text style={[st.wrongQNum, { color: C.text }]}>#{w.questionNumber}번</Text>
                  <Text style={{ color: '#ffd700' }}>{'★'.repeat(w.importance || 1)}</Text>
                  {due && (
                    <View style={[st.dueBadge, { backgroundColor: C.warn + '33' }]}>
                      <Text style={[{ color: C.warn, fontSize: 11, fontWeight: '700' }]}>복습예정</Text>
                    </View>
                  )}
                </View>
                {w.wrongTypes?.length > 0 && (
                  <View style={[st.tagRow, { marginTop: 6 }]}>
                    {w.wrongTypes.slice(0, 3).map(id => {
                      const wt = WRONG_TYPES.find(t => t.id === id);
                      return wt ? (
                        <View key={id} style={[st.tagSm, { backgroundColor: wt.color + '22' }]}>
                          <Text style={[st.tagSmText, { color: wt.color }]}>{wt.emoji} {wt.label}</Text>
                        </View>
                      ) : null;
                    })}
                  </View>
                )}
                <View style={st.wrongCardBottom}>
                  <Text style={[st.wrongCardDate, { color: C.textSub }]}>{formatDateAgo(w.createdAt)}</Text>
                  {w.reviewed && <Text style={[{ color: C.textSub, fontSize: 12 }]}>복습 {w.reviewCount}회 ✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // 🎵 환경음 화면
  // ──────────────────────────────────────────────
  if (screen === 'ambient') {
    const STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader title="🎵 환경음" onBack={() => setScreen('home')} C={C} />
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 14 }}>
          <Text style={[{ color: C.textSub, fontSize: 13, textAlign: 'center' }]}>
            공부에 집중할 수 있는 백그라운드 사운드를 선택하세요
          </Text>
          {ambientId && (
            <View style={[{ backgroundColor: C.primary + '22', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.primary + '55' }]}>
              <Text style={[{ color: C.primary, fontWeight: 'bold', fontSize: 15 }]}>
                🔊 {AMBIENT_SOUNDS.find(s => s.id === ambientId)?.emoji} {AMBIENT_SOUNDS.find(s => s.id === ambientId)?.name} 재생 중
              </Text>
            </View>
          )}
          {/* 볼륨 */}
          <View style={[st.settingSection, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.settingLabel, { color: C.text }]}>🔊 볼륨  {Math.round(ambientVolume * 100)}%</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {STEPS.map(v => (
                <TouchableOpacity key={v}
                  style={[{
                    flex: 1, minWidth: 36, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                    backgroundColor: Math.abs(ambientVolume - v) < 0.05 ? C.primary : C.card2,
                    borderWidth: 1, borderColor: Math.abs(ambientVolume - v) < 0.05 ? C.primary : C.border,
                  }]}
                  onPress={() => changeAmbientVolume(v)}
                >
                  <Text style={[{ fontSize: 11, fontWeight: '600', color: Math.abs(ambientVolume - v) < 0.05 ? '#fff' : C.textSub }]}>
                    {Math.round(v * 100)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {/* 사운드 목록 */}
          <View style={{ gap: 10 }}>
            {AMBIENT_SOUNDS.map(sound => (
              <TouchableOpacity key={sound.id}
                style={[{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: ambientId === sound.id ? C.primary + '22' : C.card,
                  borderRadius: 16, borderWidth: 1.5,
                  borderColor: ambientId === sound.id ? C.primary : C.border,
                  padding: 16,
                }]}
                onPress={() => playAmbient(sound.id)}
              >
                <Text style={{ fontSize: 32 }}>{sound.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 16, fontWeight: '700', color: ambientId === sound.id ? C.primary : C.text }]}>
                    {sound.name}
                  </Text>
                  <Text style={[{ fontSize: 12, color: C.textSub, marginTop: 2 }]}>
                    {ambientId === sound.id ? '▶ 재생 중 — 탭하면 정지' : '탭하여 재생'}
                  </Text>
                </View>
                <View style={[{
                  width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: ambientId === sound.id ? C.primary : C.card2,
                }]}>
                  <Text style={{ fontSize: 18 }}>{ambientId === sound.id ? '⏸' : '▶'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {ambientId && (
            <TouchableOpacity style={[st.dangerBtn, { borderColor: C.danger }]} onPress={stopAmbient}>
              <Text style={{ color: C.danger, fontWeight: '700' }}>⏹ 환경음 정지</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // 📢 TTS 수능 방송 화면
  // ──────────────────────────────────────────────
  if (screen === 'tts') {
    const subjects = ['국어', '수학', '영어', '한국사', '탐구1', '탐구2'];
    const announceTypes = [
      { key: 'start',      label: '시험 시작 안내',   emoji: '🔔' },
      { key: 'bell_start', label: '시작벨',          emoji: '🔔' },
      { key: 'five',       label: '5분 전 안내',     emoji: '⚠️' },
      { key: 'one',        label: '1분 전 안내',     emoji: '🚨' },
      { key: 'bell_end',   label: '종료벨',          emoji: '🔕' },
    ];
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader title="📢 수능 방송 시뮬레이션" onBack={() => { Speech.stop(); setTtsSpeaking(false); setScreen('home'); }} C={C} />
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 14 }}>
          <Text style={[{ color: C.textSub, fontSize: 13, textAlign: 'center' }]}>
            실제 수능 시험장 안내 방송을 재현합니다
          </Text>

          {/* 과목 선택 */}
          <View style={[st.settingSection, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.settingLabel, { color: C.text, marginBottom: 10 }]}>📚 과목 선택</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {subjects.map(s => (
                <TouchableOpacity key={s}
                  style={[{
                    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5,
                    backgroundColor: ttsSubject === s ? C.primary : 'transparent',
                    borderColor: ttsSubject === s ? C.primary : C.border,
                  }]}
                  onPress={() => setTtsSubject(s)}
                >
                  <Text style={[{ fontWeight: '700', color: ttsSubject === s ? '#fff' : C.text }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 방송 유형 선택 */}
          <View style={[st.settingSection, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.settingLabel, { color: C.text, marginBottom: 10 }]}>📋 방송 유형</Text>
            <View style={{ gap: 8 }}>
              {announceTypes.map(t => (
                <TouchableOpacity key={t.key}
                  style={[{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 14, borderRadius: 12, borderWidth: 1.5,
                    backgroundColor: ttsAnnounceType === t.key ? C.primary + '22' : C.card2,
                    borderColor: ttsAnnounceType === t.key ? C.primary : C.border,
                  }]}
                  onPress={() => setTtsAnnounceType(t.key)}
                >
                  <Text style={{ fontSize: 20 }}>{t.emoji}</Text>
                  <Text style={[{ flex: 1, fontWeight: '600', color: ttsAnnounceType === t.key ? C.primary : C.text }]}>{t.label}</Text>
                  {ttsAnnounceType === t.key && <Text style={{ color: C.primary }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 미리보기 */}
          <View style={[st.settingSection, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.settingLabel, { color: C.textSub, marginBottom: 8, fontSize: 12 }]}>📝 방송 내용 미리보기</Text>
            <Text style={[{ color: C.text, fontSize: 14, lineHeight: 22 }]}>{getTtsText()}</Text>
          </View>

          {/* 재생 버튼 */}
          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: ttsSpeaking ? C.danger : C.primary }]}
            onPress={() => speakAnnouncement(getTtsText())}
          >
            <Text style={st.primaryBtnText}>{ttsSpeaking ? '⏹ 방송 중지' : '▶ 방송 재생'}</Text>
          </TouchableOpacity>

          {ttsSpeaking && (
            <View style={[{ backgroundColor: C.primary + '22', borderRadius: 12, padding: 12, alignItems: 'center' }]}>
              <Text style={[{ color: C.primary, fontWeight: '600' }]}>🔊 방송 중...</Text>
            </View>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // 📅 공부 타임라인 화면
  // ──────────────────────────────────────────────
  if (screen === 'timeline') {
    const todayEntries = getTodayTimeline();
    const totalMin = todayEntries.reduce((a, e) => a + e.durationMin, 0);
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader
          title="📅 오늘 타임라인"
          onBack={() => setScreen('home')}
          C={C}
          rightAction={{
            label: '전체삭제',
            onPress: () => Alert.alert('타임라인 초기화', '오늘 기록을 모두 삭제할까요?', [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: () => {
                const today = getTodayKey();
                setTimeline(prev => { const n = prev.filter(e => e.date !== today); save('timeline', n); return n; });
              }},
            ]),
          }}
        />
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* 오늘 요약 */}
          <View style={[{ flexDirection: 'row', gap: 10 }]}>
            <View style={[st.dashCard, { backgroundColor: C.card, borderColor: C.border, flex: 1 }]}>
              <Text style={[st.dashLabel, { color: C.textSub }]}>오늘 총 공부</Text>
              <Text style={[st.dashVal, { color: C.primary }]}>{Math.floor(totalMin / 60)}h {totalMin % 60}m</Text>
            </View>
            <View style={[st.dashCard, { backgroundColor: C.card, borderColor: C.border, flex: 1 }]}>
              <Text style={[st.dashLabel, { color: C.textSub }]}>세션 수</Text>
              <Text style={[st.dashVal, { color: C.primary }]}>{todayEntries.length}회</Text>
            </View>
          </View>

          {todayEntries.length === 0 ? (
            <View style={st.emptyBox}>
              <Text style={st.emptyEmoji}>📅</Text>
              <Text style={[st.emptyText, { color: C.text }]}>오늘 공부 기록이 없어요</Text>
              <Text style={[st.emptyHint, { color: C.textSub }]}>타이머를 시작하면 자동으로 기록됩니다</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {todayEntries.map((entry, idx) => (
                <View key={entry.id}
                  style={[{
                    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
                    backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
                    borderColor: C.border, borderLeftColor: entry.color, borderLeftWidth: 4, padding: 14,
                  }]}
                >
                  {/* 타임라인 선 */}
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 22 }}>{entry.emoji}</Text>
                    {idx < todayEntries.length - 1 && (
                      <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: C.border, borderRadius: 1 }} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontWeight: '700', fontSize: 15, color: entry.color }]}>{entry.subjectName}</Text>
                    <Text style={[{ color: C.textSub, fontSize: 12, marginTop: 2 }]}>
                      {entry.startAt} → {entry.endAt}
                    </Text>
                    <View style={[{
                      marginTop: 6, paddingHorizontal: 10, paddingVertical: 4,
                      backgroundColor: entry.color + '22', borderRadius: 8, alignSelf: 'flex-start',
                    }]}>
                      <Text style={[{ color: entry.color, fontWeight: '700', fontSize: 13 }]}>
                        {Math.floor(entry.durationMin / 60) > 0 ? `${Math.floor(entry.durationMin / 60)}시간 ` : ''}
                        {entry.durationMin % 60}분
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // 🎯 주간 목표 화면
  // ──────────────────────────────────────────────
  if (screen === 'weeklyGoal') {
    const today = getTodayKey();
    const thisWeek = (() => {
      const days = [];
      const now = new Date();
      const dow = now.getDay(); // 0=일
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - dow + i);
        days.push(d.toLocaleDateString('ko-KR'));
      }
      return days;
    })();
    const weeklyActual = {}; // 과목 → 주간 실제 분
    SUBJECTS.forEach(s => {
      weeklyActual[s.name] = thisWeek.reduce((acc, day) => {
        return acc + ((studyStats[day] && studyStats[day][s.name]) || 0);
      }, 0);
    });

    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader
          title="🎯 주간 목표"
          onBack={() => { setEditingGoals(false); setScreen('home'); }}
          C={C}
          rightAction={{ label: editingGoals ? '저장' : '편집', onPress: () => {
            if (editingGoals) {
              const next = { ...weeklyGoals };
              Object.entries(goalDraftStr).forEach(([k, v]) => {
                const n = parseInt(v);
                if (!isNaN(n) && n > 0) next[k] = n;
              });
              saveWeeklyGoals(next);
              setEditingGoals(false);
            } else {
              const draft = {};
              SUBJECTS.forEach(s => { draft[s.name] = String(weeklyGoals[s.name] || 300); });
              setGoalDraftStr(draft);
              setEditingGoals(true);
            }
          }}}
        />
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={[{ color: C.textSub, fontSize: 13, textAlign: 'center' }]}>
            이번 주 ({thisWeek[0]} ~ {thisWeek[6]})
          </Text>
          {SUBJECTS.map(s => {
            const actual = weeklyActual[s.name] || 0;
            const goal = weeklyGoals[s.name] || 300;
            const pct = Math.min(100, Math.round((actual / goal) * 100));
            return (
              <View key={s.name} style={[st.card, { backgroundColor: C.card, borderColor: C.border, borderLeftColor: s.color, borderLeftWidth: 4 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 22, marginRight: 8 }}>{s.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontWeight: '700', fontSize: 15, color: C.text }]}>{s.name}</Text>
                    <Text style={[{ fontSize: 12, color: C.textSub }]}>
                      {Math.floor(actual / 60)}h {actual % 60}m / 목표 {Math.floor(goal / 60)}h {goal % 60}m
                    </Text>
                  </View>
                  <Text style={[{ fontWeight: 'bold', fontSize: 16, color: pct >= 100 ? C.success : pct >= 70 ? C.primary : C.textSub }]}>
                    {pct}%
                  </Text>
                </View>
                <View style={[st.statBarBg, { backgroundColor: C.card2, height: 10 }]}>
                  <View style={[st.statBarFill, { width: `${pct}%`, backgroundColor: pct >= 100 ? C.success : s.color, height: 10 }]} />
                </View>
                {editingGoals && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <Text style={[{ color: C.textSub, fontSize: 13 }]}>목표 (분):</Text>
                    <TextInput
                      style={[st.formInput, { flex: 1, color: C.text, borderColor: C.border, backgroundColor: C.card2, paddingVertical: 6 }]}
                      keyboardType="numeric"
                      value={goalDraftStr[s.name] || ''}
                      onChangeText={v => setGoalDraftStr(prev => ({ ...prev, [s.name]: v }))}
                    />
                    <Text style={[{ color: C.textSub, fontSize: 12 }]}>
                      = {Math.floor((parseInt(goalDraftStr[s.name]) || 0) / 60)}h {(parseInt(goalDraftStr[s.name]) || 0) % 60}m
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // ⑨ 통계 화면
  // ──────────────────────────────────────────────
  if (screen === 'stats') {
    const today = studyStats[getTodayKey()] || {};
    const totalMin = Object.values(today).reduce((a, b) => a + b, 0);
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader title="📊 공부 통계" onBack={() => setScreen('home')} C={C} />
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={[st.statSummaryCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.statSummaryLabel, { color: C.textSub }]}>오늘 총 공부시간</Text>
            <Text style={[st.statSummaryVal, { color: C.primary }]}>
              {Math.floor(totalMin / 60)}시간 {totalMin % 60}분
            </Text>
          </View>
          {Object.entries(today).length > 0 && (
            <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[st.sectionTitle, { color: C.text }]}>과목별</Text>
              {Object.entries(today).sort((a, b) => b[1] - a[1]).map(([sub, min]) => {
                const subObj = SUBJECTS.find(s => s.name === sub);
                return (
                  <View key={sub} style={st.statBarRow}>
                    <Text style={[st.statBarLabel, { color: C.text }]}>{subObj?.emoji || '📚'} {sub}</Text>
                    <View style={[st.statBarBg, { backgroundColor: C.border }]}>
                      <View style={[st.statBarFill, { width: `${Math.min(100, (min / 120) * 100)}%`, backgroundColor: subObj?.color || C.primary }]} />
                    </View>
                    <Text style={[st.statBarMin, { color: C.textSub }]}>{min}분</Text>
                  </View>
                );
              })}
            </View>
          )}
          <Text style={[st.sectionTitle, { color: C.text, paddingHorizontal: 4 }]}>최근 기록</Text>
          {Object.entries(studyStats).sort(([a], [b]) => new Date(b) - new Date(a)).slice(0, 14).map(([date, data]) => {
            const total = Object.values(data).reduce((a, b) => a + b, 0);
            return (
              <View key={date} style={[st.statDayRow, { borderBottomColor: C.border }]}>
                <Text style={[st.statDayDate, { color: C.textSub }]}>{date}</Text>
                <Text style={[st.statDayTotal, { color: C.primary }]}>{Math.floor(total / 60)}h {total % 60}m</Text>
              </View>
            );
          })}
          {Object.keys(studyStats).length === 0 && (
            <View style={st.emptyBox}>
              <Text style={st.emptyEmoji}>📊</Text>
              <Text style={[st.emptyText, { color: C.textSub }]}>아직 공부 기록이 없어요</Text>
            </View>
          )}
          <TouchableOpacity style={[st.dangerBtn, { borderColor: C.danger }]}
            onPress={() => Alert.alert('초기화', '모든 통계를 삭제하시겠습니까?', [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: () => saveStats({}) },
            ])}>
            <Text style={{ color: C.danger }}>통계 초기화</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // ⑩ 설정 화면
  // ──────────────────────────────────────────────
  if (screen === 'settings') {
    return (
      <View style={[st.flex, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <SubHeader title="⚙️ 설정" onBack={() => setScreen('home')} C={C} />
        <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 10 }}>
          <SettingRow label="🌙 다크 모드" C={C}>
            <Switch value={darkMode} onValueChange={v => { setDarkMode(v); save('darkMode', v); }} trackColor={{ true: C.primary }} />
          </SettingRow>
          <SettingRow label="🔔 알림 진동" C={C}>
            <Switch value={soundEnabled} onValueChange={v => { setSoundEnabled(v); save('soundEnabled', v); }} trackColor={{ true: C.primary }} />
          </SettingRow>
          <View style={[st.settingSection, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.settingLabel, { color: C.text }]}>⛔ 일시정지 횟수 제한</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {[0, 1, 2, 3, 5].map(n => (
                <TouchableOpacity key={n}
                  style={[st.limitChip, { borderColor: C.border }, pauseLimit === n && { backgroundColor: C.primary, borderColor: C.primary }]}
                  onPress={() => { setPauseLimit(n); save('pauseLimit', n.toString()); }}>
                  <Text style={[st.limitChipText, { color: pauseLimit === n ? '#fff' : C.textSub }]}>
                    {n === 0 ? '무제한' : `${n}회`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={[st.settingSection, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.settingLabel, { color: C.text }]}>📅 수능 날짜</Text>
            <TextInput style={[st.dDayInput, { color: C.text, borderColor: C.border }]}
              value={dDay} onChangeText={v => { setDDay(v); save('dDay', v); }}
              placeholder="YYYY-MM-DD" placeholderTextColor={C.textSub} />
          </View>
          <View style={[st.settingSection, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.settingLabel, { color: C.text }]}>🎨 테마 색상</Text>
            <View style={st.themeRow}>
              {Object.entries(THEMES).map(([key, t]) => (
                <TouchableOpacity key={key}
                  style={[st.themeChip, { backgroundColor: t.primary }, themeKey === key && { borderWidth: 3, borderColor: '#fff' }]}
                  onPress={() => { setThemeKey(key); save('themeKey', key); }} />
              ))}
            </View>
          </View>

          {/* 등급제 선택 */}
          <View style={[st.settingSection, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.settingLabel, { color: C.text }]}>🏫 등급제 선택</Text>
            <Text style={[{ color: C.textSub, fontSize: 12, marginTop: 4, marginBottom: 10 }]}>
              모의고사 기록에서 등급 표시 방식을 선택하세요
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { key: '9', label: '기존 9등급제', desc: '1~9등급\n(현행 수능)' },
                { key: '5', label: '5등급제', desc: 'A~E등급\n(2028 개편안)' },
              ].map(item => (
                <TouchableOpacity key={item.key}
                  style={[st.gradeChip, {
                    borderColor: gradeSystem === item.key ? C.primary : C.border,
                    backgroundColor: gradeSystem === item.key ? C.primary + '22' : C.card2,
                  }]}
                  onPress={() => { setGradeSystem(item.key); save('gradeSystem', item.key); }}
                >
                  <Text style={[st.gradeChipTitle, { color: gradeSystem === item.key ? C.primary : C.text }]}>
                    {item.label}
                  </Text>
                  <Text style={[st.gradeChipDesc, { color: C.textSub }]}>{item.desc}</Text>
                  {gradeSystem === item.key && (
                    <Text style={[{ color: C.primary, fontSize: 16, marginTop: 4 }]}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            {/* 등급 컷 미리보기 */}
            <View style={[st.gradePreview, { backgroundColor: C.card2, borderColor: C.border }]}>
              <Text style={[st.gradePreviewTitle, { color: C.textSub }]}>등급 컷 기준 (점수 기준)</Text>
              <View style={st.gradePreviewRow}>
                {(gradeSystem === '5' ? GRADE_5 : GRADE_9).map((g, i) => (
                  <View key={i} style={st.gradePreviewCell}>
                    <View style={[st.gradePreviewDot, { backgroundColor: g.color }]} />
                    <Text style={[st.gradePreviewLabel, { color: g.color }]}>{g.label}</Text>
                    <Text style={[st.gradePreviewMin, { color: C.textSub }]}>{g.topRange}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────
  // 🏠 홈 화면
  // ──────────────────────────────────────────────
  const daysLeft = getDaysLeft();
  const todayMin = getTodayMin();

  const getTabTimers = () => {
    switch (activeTab) {
      case 'subject': return SUBJECTS;
      case 'focus':   return FOCUS_TIMERS;
      case 'attack':  return TIME_ATTACK;
      case 'rest':    return REST_TIMERS;
      default:        return SUBJECTS;
    }
  };

  return (
    <View style={[st.flex, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />

      {!!motivationMsg && (
        <View style={[st.motBanner, { backgroundColor: C.primary + 'ee' }]}>
          <Text style={st.motText}>{motivationMsg}</Text>
        </View>
      )}

      <ScrollView style={st.flex} showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={st.homeHdr}>
          <View>
            <Text style={[st.appTitle, { color: C.text }]}>🎯 수능타이머</Text>
            <Text style={[st.appDate, { color: C.textSub }]}>
              {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity style={st.hdrBtn} onPress={() => setScreen('stats')}>
              <Text style={[st.hdrBtnText, { color: C.primary }]}>📊</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.hdrBtn} onPress={() => setScreen('settings')}>
              <Text style={[st.hdrBtnText, { color: C.primary }]}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* D-Day + 오늘 통계 */}
        <View style={st.dashRow}>
          <View style={[st.dashCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.dashLabel, { color: C.textSub }]}>수능까지</Text>
            <Text style={[st.dashVal, { color: C.primary }]}>
              {daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? '🎯 D-Day!' : '완료'}
            </Text>
          </View>
          <View style={[st.dashCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.dashLabel, { color: C.textSub }]}>오늘 공부</Text>
            <Text style={[st.dashVal, { color: C.primary }]}>
              {Math.floor(todayMin / 60)}h {todayMin % 60}m
            </Text>
          </View>
          <TouchableOpacity style={[st.dashCard, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => setScreen('weeklyGoal')}>
            <Text style={[st.dashLabel, { color: C.textSub }]}>주간 목표</Text>
            <Text style={[st.dashVal, { color: C.primary, fontSize: 16 }]}>🎯</Text>
          </TouchableOpacity>
        </View>

        {/* 퀵 메뉴 (모의고사/오답노트) */}
        <View style={st.quickRow}>
          <TouchableOpacity
            style={[st.quickCard, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => Alert.alert('📋 모의고사 모드', '실제 수능 시간표대로 자동 진행합니다.\n국어→수학→영어→한국사→탐구1→탐구2', [
              { text: '취소', style: 'cancel' },
              { text: '시작!', onPress: startMockExam },
            ])}
          >
            <Text style={st.quickCardEmoji}>📋</Text>
            <Text style={[st.quickCardTitle, { color: C.text }]}>모의고사</Text>
            <Text style={[st.quickCardSub, { color: C.textSub }]}>{examRecords.length}개 기록</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.quickCard, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => setScreen('mockHistory')}
          >
            <Text style={st.quickCardEmoji}>📈</Text>
            <Text style={[st.quickCardTitle, { color: C.text }]}>성적 기록</Text>
            <Text style={[st.quickCardSub, { color: C.textSub }]}>결과 확인</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.quickCard, { backgroundColor: C.card, borderColor: dueCount > 0 ? C.warn + '88' : C.border }]}
            onPress={() => setScreen('wrongList')}
          >
            <Text style={st.quickCardEmoji}>📷</Text>
            <Text style={[st.quickCardTitle, { color: C.text }]}>오답노트</Text>
            <Text style={[st.quickCardSub, { color: dueCount > 0 ? C.warn : C.textSub }]}>
              {dueCount > 0 ? `복습 ${dueCount}개` : `${wrongAnswers.length}개`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 퀵 메뉴 2행 */}
        <View style={st.quickRow}>
          <TouchableOpacity
            style={[st.quickCard, { backgroundColor: C.card, borderColor: ambientId ? C.primary + '88' : C.border }]}
            onPress={() => setScreen('ambient')}
          >
            <Text style={st.quickCardEmoji}>{ambientId ? AMBIENT_SOUNDS.find(s=>s.id===ambientId)?.emoji ?? '🎵' : '🎵'}</Text>
            <Text style={[st.quickCardTitle, { color: ambientId ? C.primary : C.text }]}>환경음</Text>
            <Text style={[st.quickCardSub, { color: ambientId ? C.primary : C.textSub }]}>
              {ambientId ? AMBIENT_SOUNDS.find(s=>s.id===ambientId)?.name ?? '재생중' : '집중 BGM'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.quickCard, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => setScreen('tts')}
          >
            <Text style={st.quickCardEmoji}>📢</Text>
            <Text style={[st.quickCardTitle, { color: C.text }]}>수능방송</Text>
            <Text style={[st.quickCardSub, { color: C.textSub }]}>TTS 시뮬</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.quickCard, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => setScreen('timeline')}
          >
            <Text style={st.quickCardEmoji}>📅</Text>
            <Text style={[st.quickCardTitle, { color: C.text }]}>타임라인</Text>
            <Text style={[st.quickCardSub, { color: C.textSub }]}>오늘 기록</Text>
          </TouchableOpacity>
        </View>

        {/* 섹션 타이틀 */}
        <Text style={[st.sectionTitle, { color: C.text, paddingHorizontal: 16, marginTop: 8 }]}>⏱️ 타이머 시작</Text>

        {/* 탭 */}
        <View style={[st.tabRow, { backgroundColor: C.card2 }]}>
          {[
            { key: 'subject', label: '과목별' },
            { key: 'focus',   label: '집중' },
            { key: 'attack',  label: '타임어택' },
            { key: 'rest',    label: '휴식' },
          ].map(tab => (
            <TouchableOpacity key={tab.key}
              style={[st.tab, activeTab === tab.key && { backgroundColor: C.primary }]}
              onPress={() => setActiveTab(tab.key)}>
              <Text style={[st.tabText, { color: activeTab === tab.key ? '#fff' : C.textSub }]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 타이머 목록 */}
        <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
          {getTabTimers().map(item => (
            <TouchableOpacity key={item.name}
              style={[st.timerCard, { backgroundColor: C.card, borderColor: C.border, borderLeftColor: item.color }]}
              onPress={() => startTimer(item)}>
              <Text style={st.timerCardEmoji}>{item.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.timerCardName, { color: C.text }]}>{item.name}</Text>
                <Text style={[st.timerCardTime, { color: C.textSub }]}>{item.time}분</Text>
              </View>
              <View style={[st.timerCardBadge, { backgroundColor: item.color + '22' }]}>
                <Text style={[{ color: item.color, fontSize: 14, fontWeight: 'bold' }]}>▶</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* 직접 설정 */}
          {['focus', 'attack', 'rest'].includes(activeTab) && (
            showCustomInput && customCategory === activeTab ? (
              <View style={[st.customInputRow, { backgroundColor: C.card, borderColor: C.border }]}>
                <TextInput style={[st.customInput, { color: C.text }]} placeholder="분 입력"
                  placeholderTextColor={C.textSub} keyboardType="numeric"
                  value={customMinutes} onChangeText={setCustomMinutes} autoFocus />
                <TouchableOpacity style={[st.customConfirmBtn, { backgroundColor: C.primary }]}
                  onPress={() => {
                    const min = parseInt(customMinutes);
                    if (!min || min < 1 || min > 999) { Alert.alert('1~999분 사이로 입력하세요'); return; }
                    const emoji = activeTab === 'rest' ? '⏰' : activeTab === 'attack' ? '⚡' : '🔥';
                    const color = activeTab === 'rest' ? '#4ecca3' : activeTab === 'attack' ? '#ff4757' : '#667eea';
                    startTimer({ name: `${min}분`, time: min, emoji, color, category: activeTab });
                    setShowCustomInput(false); setCustomMinutes('');
                  }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>시작</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowCustomInput(false)}>
                  <Text style={{ color: C.danger, marginLeft: 8 }}>취소</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[st.customBtn, { borderColor: C.border }]}
                onPress={() => { setShowCustomInput(true); setCustomCategory(activeTab); }}>
                <Text style={[st.customBtnText, { color: C.textSub }]}>+ 직접 설정</Text>
              </TouchableOpacity>
            )
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════
// 🧩 서브 컴포넌트들
// ══════════════════════════════════════════════

// ── SubHeader ──
function SubHeader({ title, onBack, C, rightAction }) {
  return (
    <View style={[st.subHeader, { borderBottomColor: C.border }]}>
      <TouchableOpacity onPress={onBack}>
        <Text style={[st.backBtn, { color: C.primary }]}>← 뒤로</Text>
      </TouchableOpacity>
      <Text style={[st.subHeaderTitle, { color: C.text }]}>{title}</Text>
      {rightAction ? (
        <TouchableOpacity onPress={rightAction.onPress}>
          <Text style={[{ color: C.primary, fontSize: 14, fontWeight: '700' }]}>{rightAction.label}</Text>
        </TouchableOpacity>
      ) : <View style={{ width: 50 }} />}
    </View>
  );
}

// ── SettingRow ──
function SettingRow({ label, C, children }) {
  return (
    <View style={[st.settingRow, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[st.settingLabel, { color: C.text }]}>{label}</Text>
      {children}
    </View>
  );
}

// ── ExamRecordCard ──
function ExamRecordCard({ record, C, gradeSystem = '9', onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = new Date(record.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  return (
    <View style={[st.examCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <TouchableOpacity style={st.examCardTop} onPress={() => setExpanded(e => !e)}>
        <View style={{ flex: 1 }}>
          <Text style={[st.examCardDate, { color: C.text }]}>{dateStr}</Text>
          {record.totalScore ? (
            <Text style={[st.examCardTotal, { color: C.primary }]}>총점 {record.totalScore}점
              {record.percentile ? `  (백분위 ${record.percentile}%)` : ''}
            </Text>
          ) : <Text style={[{ color: C.textSub, fontSize: 13 }]}>성적 미입력</Text>}
        </View>
        <Text style={[{ color: C.textSub }]}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={[st.examCardBody, { borderTopColor: C.border }]}>
          <View style={st.examSubjectGrid}>
            {record.subjects?.map(sub => (
              <View key={sub.name} style={[st.examSubjectCell, { backgroundColor: C.card2 }]}>
                <Text style={[st.examSubjectName, { color: C.textSub }]}>{sub.emoji} {sub.name}</Text>
                {(sub.score !== null && sub.score !== '') ? (
                  <Text style={[st.examSubjectScore, { color: C.text }]}>{sub.score}점</Text>
                ) : null}
                {(sub.percentile !== null && sub.percentile !== undefined && sub.percentile !== '') ? (
                  <>
                    <Text style={[st.examSubjectGrade, { color: getGradeColor(sub.percentile, gradeSystem) }]}>
                      {getGrade(sub.percentile, gradeSystem)}
                    </Text>
                    <Text style={[{ color: C.textSub, fontSize: 10 }]}>백분위 {sub.percentile}</Text>
                  </>
                ) : (sub.score !== null && sub.score !== '') ? (
                  <Text style={[{ color: C.textSub, fontSize: 11 }]}>백분위 미입력</Text>
                ) : (
                  <Text style={[{ color: C.textSub, fontSize: 12 }]}>-</Text>
                )}
                {sub.wrongCount ? <Text style={[st.examSubjectWrong, { color: C.textSub }]}>오답 {sub.wrongCount}개</Text> : null}
              </View>
            ))}
          </View>
          {!!record.memo && (
            <View style={[st.examMemo, { backgroundColor: C.card2 }]}>
              <Text style={[{ color: C.textSub, fontSize: 13 }]}>{record.memo}</Text>
            </View>
          )}
          <TouchableOpacity style={[st.dangerBtn, { borderColor: C.danger, marginTop: 8 }]} onPress={onDelete}>
            <Text style={{ color: C.danger }}>🗑️ 기록 삭제</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── MockResultScreen ──
function MockResultScreen({ C, examData, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    ...examData,
    subjects: examData.subjects.map(s => ({ ...s, score: s.score || '', percentile: s.percentile || '', wrongCount: s.wrongCount || '' })),
    totalScore: examData.totalScore || '',
    percentile: examData.percentile || '',
    memo: examData.memo || '',
  });

  const updateSubject = (index, field, value) => {
    const subjects = [...formData.subjects];
    subjects[index] = { ...subjects[index], [field]: value };
    setFormData(prev => ({ ...prev, subjects }));
  };

  const handleSave = () => {
    const cleaned = {
      ...formData,
      subjects: formData.subjects.map(s => ({
        ...s,
        score: s.score === '' ? null : parseInt(s.score),
        percentile: s.percentile === '' ? null : parseInt(s.percentile),
        wrongCount: s.wrongCount === '' ? null : parseInt(s.wrongCount),
      })),
      totalScore: formData.totalScore === '' ? null : parseInt(formData.totalScore),
      percentile: formData.percentile === '' ? null : parseInt(formData.percentile),
    };
    onSave(cleaned);
  };

  return (
    <KeyboardAvoidingView style={[st.flex, { backgroundColor: C.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle={C.bg === '#0f0f1a' ? 'light-content' : 'dark-content'} />
      <View style={[st.subHeader, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[st.backBtn, { color: C.primary }]}>← 나중에</Text>
        </TouchableOpacity>
        <Text style={[st.subHeaderTitle, { color: C.text }]}>📋 모의고사 결과 입력</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={[{ color: C.textSub, fontSize: 13 }]}>※ 선택 사항입니다. 나중에 기록에서 확인할 수 있어요.</Text>

        {/* 과목별 */}
        {formData.subjects.map((sub, i) => (
          <View key={sub.name} style={[st.card, { backgroundColor: C.card, borderColor: C.border, borderLeftColor: sub.color, borderLeftWidth: 4 }]}>
            <Text style={[st.sectionTitle, { color: C.text, marginBottom: 10 }]}>{sub.emoji} {sub.name}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[st.inputLabel, { color: C.textSub }]}>원점수</Text>
                <TextInput
                  style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2 }]}
                  placeholder="예: 85" placeholderTextColor={C.textSub}
                  keyboardType="numeric" value={sub.score}
                  onChangeText={v => updateSubject(i, 'score', v)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.inputLabel, { color: C.textSub }]}>백분위</Text>
                <TextInput
                  style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2 }]}
                  placeholder="예: 93" placeholderTextColor={C.textSub}
                  keyboardType="numeric" value={sub.percentile || ''}
                  onChangeText={v => updateSubject(i, 'percentile', v)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.inputLabel, { color: C.textSub }]}>오답수</Text>
                <TextInput
                  style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2 }]}
                  placeholder={`/${sub.totalQ}`} placeholderTextColor={C.textSub}
                  keyboardType="numeric" value={sub.wrongCount}
                  onChangeText={v => updateSubject(i, 'wrongCount', v)}
                />
              </View>
            </View>
          </View>
        ))}

        {/* 전체 성적 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[st.sectionTitle, { color: C.text, marginBottom: 10 }]}>📊 전체 성적</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[st.inputLabel, { color: C.textSub }]}>총점 (450점 만점)</Text>
              <TextInput style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2 }]}
                placeholder="예: 350" placeholderTextColor={C.textSub} keyboardType="numeric"
                value={formData.totalScore} onChangeText={v => setFormData(p => ({ ...p, totalScore: v }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.inputLabel, { color: C.textSub }]}>백분위 (%)</Text>
              <TextInput style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2 }]}
                placeholder="예: 85" placeholderTextColor={C.textSub} keyboardType="numeric"
                value={formData.percentile} onChangeText={v => setFormData(p => ({ ...p, percentile: v }))} />
            </View>
          </View>
        </View>

        {/* 메모 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[st.inputLabel, { color: C.textSub }]}>메모 (오늘 시험 총평)</Text>
          <TextInput style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2, minHeight: 72, textAlignVertical: 'top' }]}
            placeholder="틀린 이유나 주의할 점을 메모하세요..." placeholderTextColor={C.textSub}
            multiline value={formData.memo} onChangeText={v => setFormData(p => ({ ...p, memo: v }))} />
        </View>

        <TouchableOpacity style={[st.primaryBtn, { backgroundColor: C.primary }]} onPress={handleSave}>
          <Text style={st.primaryBtnText}>💾 저장하기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.secondaryBtn, { borderColor: C.border }]} onPress={onCancel}>
          <Text style={[st.secondaryBtnText, { color: C.textSub }]}>건너뛰기</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── WrongAnswerForm (오답 추가/수정) ──
function WrongAnswerForm({ C, editData, onSave, onCancel }) {
  const [form, setForm] = useState({
    subject: editData?.subject || '국어',
    questionNumber: editData?.questionNumber || '',
    myAnswer: editData?.myAnswer || '',
    correctAnswer: editData?.correctAnswer || '',
    wrongTypes: editData?.wrongTypes || [],
    importance: editData?.importance || 2,
    memo: editData?.memo || '',
  });

  const toggleType = (id) => {
    setForm(prev => ({
      ...prev,
      wrongTypes: prev.wrongTypes.includes(id)
        ? prev.wrongTypes.filter(t => t !== id)
        : [...prev.wrongTypes, id],
    }));
  };

  const handleSave = () => {
    if (!form.questionNumber) { Alert.alert('문제 번호를 입력해주세요'); return; }
    onSave(form);
  };

  return (
    <KeyboardAvoidingView style={[st.flex, { backgroundColor: C.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle={C.bg === '#0f0f1a' ? 'light-content' : 'dark-content'} />
      <View style={[st.subHeader, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[st.backBtn, { color: C.primary }]}>← 취소</Text>
        </TouchableOpacity>
        <Text style={[st.subHeaderTitle, { color: C.text }]}>{editData ? '✏️ 오답 수정' : '📷 오답 추가'}</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 14 }}>
        {/* 과목 선택 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[st.inputLabel, { color: C.textSub, marginBottom: 10 }]}>과목 선택</Text>
          <View style={st.subjectGrid}>
            {SUBJECTS.map(sub => (
              <TouchableOpacity key={sub.name}
                style={[st.subjectChip, form.subject === sub.name && { backgroundColor: sub.color, borderColor: sub.color }]}
                onPress={() => setForm(p => ({ ...p, subject: sub.name }))}>
                <Text style={[st.subjectChipText, { color: form.subject === sub.name ? '#fff' : C.textSub }]}>
                  {sub.emoji} {sub.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 문제 번호 + 답 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[st.inputLabel, { color: C.textSub }]}>문제 번호 *</Text>
              <TextInput style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2 }]}
                placeholder="예: 15" placeholderTextColor={C.textSub} keyboardType="numeric"
                value={form.questionNumber} onChangeText={v => setForm(p => ({ ...p, questionNumber: v }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.inputLabel, { color: C.textSub }]}>내 답</Text>
              <TextInput style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2, textAlign: 'center' }]}
                placeholder="③" placeholderTextColor={C.textSub}
                value={form.myAnswer} onChangeText={v => setForm(p => ({ ...p, myAnswer: v }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.inputLabel, { color: C.textSub }]}>정답</Text>
              <TextInput style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2, textAlign: 'center' }]}
                placeholder="①" placeholderTextColor={C.textSub}
                value={form.correctAnswer} onChangeText={v => setForm(p => ({ ...p, correctAnswer: v }))} />
            </View>
          </View>
        </View>

        {/* 오답 유형 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[st.inputLabel, { color: C.textSub, marginBottom: 10 }]}>왜 틀렸나요? (복수 선택)</Text>
          <View style={st.wrongTypeGrid}>
            {WRONG_TYPES.map(wt => (
              <TouchableOpacity key={wt.id}
                style={[st.wrongTypeBtn, { borderColor: form.wrongTypes.includes(wt.id) ? wt.color : C.border },
                  form.wrongTypes.includes(wt.id) && { backgroundColor: wt.color + '22' }]}
                onPress={() => toggleType(wt.id)}>
                <Text style={[st.wrongTypeBtnText, { color: form.wrongTypes.includes(wt.id) ? wt.color : C.textSub }]}>
                  {wt.emoji} {wt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 중요도 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[st.inputLabel, { color: C.textSub, marginBottom: 10 }]}>중요도</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { v: 1, label: '★ 보통' },
              { v: 2, label: '★★ 중요' },
              { v: 3, label: '★★★ 매우중요' },
            ].map(item => (
              <TouchableOpacity key={item.v}
                style={[st.importanceBtn, { borderColor: form.importance === item.v ? C.primary : C.border },
                  form.importance === item.v && { backgroundColor: C.primary }]}
                onPress={() => setForm(p => ({ ...p, importance: item.v }))}>
                <Text style={[st.importanceBtnText, { color: form.importance === item.v ? '#fff' : C.textSub }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 메모 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[st.inputLabel, { color: C.textSub }]}>메모 (선택)</Text>
          <TextInput style={[st.formInput, { color: C.text, borderColor: C.border, backgroundColor: C.card2, minHeight: 64, textAlignVertical: 'top', marginTop: 8 }]}
            placeholder="틀린 이유, 풀이법 등..." placeholderTextColor={C.textSub}
            multiline value={form.memo} onChangeText={v => setForm(p => ({ ...p, memo: v }))} />
        </View>

        <TouchableOpacity style={[st.primaryBtn, { backgroundColor: C.primary }]} onPress={handleSave}>
          <Text style={st.primaryBtnText}>💾 저장하기</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── WrongDetail (오답 상세) ──
function WrongDetail({ C, wrong, onBack, onEdit, onDelete, onReviewed }) {
  const subColor = SUBJECTS.find(s => s.name === wrong.subject)?.color || C.primary;
  const nextReview = getNextReviewDate(wrong);
  const due = isReviewDue(wrong);
  return (
    <View style={[st.flex, { backgroundColor: C.bg }]}>
      <View style={[st.subHeader, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={onBack}>
          <Text style={[st.backBtn, { color: C.primary }]}>← 목록</Text>
        </TouchableOpacity>
        <Text style={[st.subHeaderTitle, { color: C.text }]}>오답 상세</Text>
        <TouchableOpacity onPress={onEdit}>
          <Text style={[{ color: C.primary, fontSize: 14, fontWeight: '700' }]}>✏️ 수정</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, gap: 14 }}>
        {/* 기본 정보 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, borderLeftColor: subColor, borderLeftWidth: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View style={[st.subjectPill, { backgroundColor: subColor + '22' }]}>
              <Text style={[st.subjectPillText, { color: subColor }]}>{wrong.subject}</Text>
            </View>
            <Text style={[st.reviewQNum, { color: C.text }]}>#{wrong.questionNumber}번</Text>
            <Text style={{ color: '#ffd700', fontSize: 16 }}>{'★'.repeat(wrong.importance || 1)}</Text>
          </View>
          {(wrong.myAnswer || wrong.correctAnswer) && (
            <View style={[st.answerRow, { backgroundColor: C.card2, borderRadius: 10, padding: 12, marginBottom: 10 }]}>
              {wrong.myAnswer && (
                <View style={st.answerCol}>
                  <Text style={[st.answerLabel, { color: C.danger }]}>내 답</Text>
                  <Text style={[st.answerVal, { color: C.text }]}>{wrong.myAnswer}</Text>
                </View>
              )}
              {wrong.correctAnswer && (
                <View style={st.answerCol}>
                  <Text style={[st.answerLabel, { color: C.success }]}>정답</Text>
                  <Text style={[st.answerVal, { color: C.text }]}>{wrong.correctAnswer}</Text>
                </View>
              )}
            </View>
          )}
          {wrong.wrongTypes?.length > 0 && (
            <View style={st.tagRow}>
              {wrong.wrongTypes.map(id => {
                const wt = WRONG_TYPES.find(t => t.id === id);
                return wt ? (
                  <View key={id} style={[st.tag, { backgroundColor: wt.color + '22', borderColor: wt.color + '66' }]}>
                    <Text style={[st.tagText, { color: wt.color }]}>{wt.emoji} {wt.label}</Text>
                  </View>
                ) : null;
              })}
            </View>
          )}
        </View>

        {/* 메모 */}
        {!!wrong.memo && (
          <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.inputLabel, { color: C.textSub }]}>메모</Text>
            <Text style={[{ color: C.text, marginTop: 6, lineHeight: 20 }]}>{wrong.memo}</Text>
          </View>
        )}

        {/* 복습 정보 */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[st.inputLabel, { color: C.textSub }]}>복습 현황</Text>
          <Text style={[{ color: C.text, marginTop: 6 }]}>
            복습 {wrong.reviewCount || 0}회 완료
            {wrong.lastReviewDate ? `  ·  마지막: ${formatDateAgo(wrong.lastReviewDate)}` : ''}
          </Text>
          <Text style={[{ color: due ? C.warn : C.textSub, marginTop: 4 }]}>
            📅 다음 복습: {nextReview.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            {due ? ' ← 복습 예정!' : ''}
          </Text>
        </View>

        <TouchableOpacity style={[st.primaryBtn, { backgroundColor: C.success }]} onPress={onReviewed}>
          <Text style={st.primaryBtnText}>✅ 복습 완료 표시</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.dangerBtn, { borderColor: C.danger }]} onPress={onDelete}>
          <Text style={{ color: C.danger }}>🗑️ 오답 삭제</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════
// 💅 스타일시트
// ══════════════════════════════════════════════
const st = StyleSheet.create({
  flex: { flex: 1 },

  // ── 오버레이 ──
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, alignItems: 'center', justifyContent: 'center', padding: 24 },
  cdEmoji: { fontSize: 56, marginBottom: 8 },
  cdSubject: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  cdNum: { fontSize: 110, fontWeight: 'bold' },
  cdLabel: { fontSize: 18, marginTop: 8 },

  // ── 휴식 ──
  breakIcon: { fontSize: 56, marginBottom: 8 },
  breakTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 6 },
  breakSub: { fontSize: 16, marginBottom: 16 },
  breakNextBox: { borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', marginBottom: 20, width: '80%' },
  breakNextLabel: { fontSize: 12, marginBottom: 4 },
  breakNextVal: { fontSize: 20, fontWeight: '700' },
  breakBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 30, marginBottom: 10 },
  breakBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  breakSkip: { padding: 12 },
  breakSkipText: { fontSize: 14 },

  // ── 완료 ──
  compEmoji: { fontSize: 56, marginBottom: 6 },
  compTitle: { fontSize: 32, fontWeight: 'bold' },
  compSubject: { fontSize: 18, marginBottom: 16 },
  compScoreBox: { borderRadius: 20, borderWidth: 1.5, padding: 24, alignItems: 'center', marginBottom: 24, minWidth: '70%' },
  compGrade: { fontSize: 48, fontWeight: 'bold' },
  compScore: { fontSize: 22, fontWeight: '600', marginTop: 4 },
  compMsg: { fontSize: 15, marginTop: 4 },
  compPause: { fontSize: 13, marginTop: 8, opacity: 0.6 },
  compBtn: { paddingVertical: 16, paddingHorizontal: 36, borderRadius: 30 },
  compBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // ── 동기부여 ──
  motBanner: { paddingVertical: 10, paddingHorizontal: 16, zIndex: 10 },
  motText: { color: '#fff', textAlign: 'center', fontSize: 13, fontWeight: '600' },

  // ── 타이머 ──
  timerHdr: { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  stopBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stopBtnText: { fontSize: 20 },
  timerTitle: { fontSize: 18, fontWeight: '700' },
  mockBadge: { fontSize: 12, marginTop: 2 },
  subBtn: { width: 40, height: 36, alignItems: 'flex-end', justifyContent: 'center' },

  ringWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, height: 280 },
  ringBg: { width: 220, height: 220, borderRadius: 110, borderWidth: 1.5, position: 'absolute' },
  ringCircle: { width: 210, height: 210, borderRadius: 105, borderWidth: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  timeDisplay: { fontSize: 50, fontWeight: 'bold', letterSpacing: 2 },
  timeTotalLabel: { fontSize: 14, marginTop: 4 },
  pausedLabel: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  pctLabel: { marginTop: 10, fontSize: 13 },

  progressBarWrap: { height: 4, marginHorizontal: 16, borderRadius: 2, marginBottom: 14, overflow: 'hidden' },
  progressBarFill: { height: 4, borderRadius: 2 },

  tipBox: { marginHorizontal: 16, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  tipText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },

  memoBox: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  memoInput: { padding: 12, fontSize: 14, minHeight: 48 },

  subMini: { marginHorizontal: 16, padding: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 16 },
  subMiniItem: { flex: 1 },
  subMiniLabel: { fontSize: 11, marginBottom: 2 },
  subMiniTime: { fontSize: 16, fontWeight: '700' },

  controls: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 28, borderTopWidth: 1 },
  ctrlBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ctrlBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  ctrlBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },

  // ── 보조 타이머 ──
  subCard: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  subCardLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
  subCardTime: { fontSize: 22, fontWeight: 'bold', minWidth: 80, textAlign: 'center' },
  subCardBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  subCardBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  addSubBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  addSubBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // ── 서브 헤더 ──
  subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  subHeaderTitle: { fontSize: 17, fontWeight: 'bold' },
  backBtn: { fontSize: 15, fontWeight: '600' },

  // ── 홈 ──
  homeHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 14 },
  appTitle: { fontSize: 22, fontWeight: 'bold' },
  appDate: { fontSize: 12, marginTop: 2 },
  hdrBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hdrBtnText: { fontSize: 20 },

  dashRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  dashCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center' },
  dashLabel: { fontSize: 12, marginBottom: 4 },
  dashVal: { fontSize: 22, fontWeight: 'bold' },

  quickRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 14 },
  quickCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4 },
  quickCardEmoji: { fontSize: 22 },
  quickCardTitle: { fontSize: 13, fontWeight: '700' },
  quickCardSub: { fontSize: 11 },

  tabRow: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 12, padding: 4, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '600' },

  timerCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, gap: 12 },
  timerCardEmoji: { fontSize: 26 },
  timerCardName: { fontSize: 15, fontWeight: '700' },
  timerCardTime: { fontSize: 13, marginTop: 2 },
  timerCardBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  customBtn: { padding: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center' },
  customBtnText: { fontSize: 14 },
  customInputRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  customInput: { flex: 1, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  customConfirmBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },

  // ── 오답 ──
  reviewBtnRow: { flexDirection: 'row', gap: 8, padding: 10, borderBottomWidth: 1 },
  reviewStartBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  reviewStartBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  filterScroll: { maxHeight: 48, borderBottomWidth: 1 },
  filterChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#ccc' },
  filterChipText: { fontSize: 13, fontWeight: '600' },

  wrongCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  wrongCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrongQNum: { fontSize: 15, fontWeight: '700' },
  dueBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  wrongCardBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  wrongCardDate: { fontSize: 12 },

  reviewCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  reviewQNum: { fontSize: 18, fontWeight: '700' },
  reviewImportance: { fontSize: 16 },
  answerRow: { flexDirection: 'row', gap: 16 },
  answerCol: { flex: 1, alignItems: 'center' },
  answerLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  answerVal: { fontSize: 20, fontWeight: 'bold' },
  reviewMemo: { borderRadius: 10, padding: 12, marginTop: 10 },
  reviewMemoLabel: { fontSize: 12, marginBottom: 4 },
  reviewMemoText: { fontSize: 15, lineHeight: 22 },
  reviewSchedule: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  reviewScheduleText: { fontSize: 13 },
  reviewActions: { padding: 12, paddingBottom: 28, borderTopWidth: 1 },
  reviewCompleteBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  reviewCompleteBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  tagText: { fontSize: 12, fontWeight: '600' },
  tagSm: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  tagSmText: { fontSize: 11, fontWeight: '600' },

  subjectPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  subjectPillText: { fontSize: 13, fontWeight: '700' },

  // ── 모의고사 기록 ──
  examCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  examCardTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  examCardDate: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  examCardTotal: { fontSize: 16, fontWeight: '700' },
  examCardBody: { padding: 14, borderTopWidth: 1 },
  examSubjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  examSubjectCell: { width: (SW - 32 - 14 * 2 - 8 * 2) / 3, padding: 10, borderRadius: 10, alignItems: 'center' },
  examSubjectName: { fontSize: 11, marginBottom: 4 },
  examSubjectScore: { fontSize: 18, fontWeight: 'bold' },
  examSubjectGrade: { fontSize: 12, fontWeight: '600' },
  examSubjectWrong: { fontSize: 11, marginTop: 2 },
  examMemo: { borderRadius: 10, padding: 10 },

  // ── 폼 공통 ──
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  formInput: { borderWidth: 1, borderRadius: 10, padding: 11, fontSize: 15 },
  primaryBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  secondaryBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  secondaryBtnText: { fontSize: 15 },
  dangerBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },

  // ── 오답 폼 ──
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjectChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#ccc' },
  subjectChipText: { fontSize: 13, fontWeight: '600' },
  wrongTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wrongTypeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  wrongTypeBtnText: { fontSize: 13, fontWeight: '600' },
  importanceBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  importanceBtnText: { fontSize: 12, fontWeight: '600' },

  // ── 설정 ──
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 16 },
  settingSection: { borderRadius: 14, borderWidth: 1, padding: 16 },
  settingLabel: { fontSize: 15, fontWeight: '600' },
  limitChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, marginRight: 6 },
  limitChipText: { fontSize: 13, fontWeight: '600' },
  dDayInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 16, marginTop: 8 },
  themeRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 10 },
  themeChip: { width: 38, height: 38, borderRadius: 19 },

  // 등급제 선택
  gradeChip: { flex: 1, borderRadius: 14, borderWidth: 2, padding: 14, alignItems: 'center', gap: 2 },
  gradeChipTitle: { fontSize: 14, fontWeight: 'bold' },
  gradeChipDesc: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  gradePreview: { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12 },
  gradePreviewTitle: { fontSize: 11, marginBottom: 8 },
  gradePreviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gradePreviewCell: { alignItems: 'center', gap: 2, minWidth: 40 },
  gradePreviewDot: { width: 10, height: 10, borderRadius: 5 },
  gradePreviewLabel: { fontSize: 11, fontWeight: '700' },
  gradePreviewMin: { fontSize: 10 },

  // ── 통계 ──
  statSummaryCard: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center' },
  statSummaryLabel: { fontSize: 13, marginBottom: 4 },
  statSummaryVal: { fontSize: 32, fontWeight: 'bold' },
  statBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statBarLabel: { width: 72, fontSize: 13, fontWeight: '600' },
  statBarBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  statBarFill: { height: 8, borderRadius: 4 },
  statBarMin: { width: 36, textAlign: 'right', fontSize: 12 },
  statDayRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  statDayDate: { fontSize: 14 },
  statDayTotal: { fontSize: 14, fontWeight: '600' },

  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyHint: { fontSize: 13 },
});
