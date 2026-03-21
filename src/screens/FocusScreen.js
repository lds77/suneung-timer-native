// src/screens/FocusScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet, Dimensions, Alert, Animated, PanResponder, KeyboardAvoidingView, Platform, Vibration, Keyboard, useWindowDimensions, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK, getTheme } from '../constants/colors';
import { formatTime, formatDuration, formatDDay, calcDDay } from '../utils/format';
import Stepper from '../components/Stepper';
import CharacterAvatar from '../components/CharacterAvatar';
import Svg, { Circle } from 'react-native-svg';
import ScheduleEditorScreen from './ScheduleEditorScreen';
import { getPlannerMessage, getTodoMessage } from '../constants/characters';
import { getTier } from '../constants/presets';

const SW = Dimensions.get('window').width;
const isTablet = SW >= 600;
const CONTENT_MAX_W = isTablet ? 680 : SW;
const GAP = 8;
const CARD_W = isTablet ? (Math.min(CONTENT_MAX_W, SW) - 32 - GAP) / 2 : (SW - 32 - GAP) / 2;
const RING_SIZE = isTablet ? Math.min(SW * 0.38, 340) : Math.min(SW - 72, 248);
const RING_STROKE = isTablet ? 16 : 14;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const RING_SIZE_FULL = isTablet ? Math.min(SW * 0.5, 460) : Math.min(SW - 40, 300);
const RING_STROKE_FULL = isTablet ? 20 : 16;
const RING_R_FULL = (RING_SIZE_FULL - RING_STROKE_FULL) / 2;
const RING_C_FULL = 2 * Math.PI * RING_R_FULL;

const getSchoolDefaultFavs = (school) => {
  const pomo = (w, b, label) => ({ id: `def_pomo_${w}`, label: label, icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: w, pomoBreakMin: b });
  const cd = (min, label, color) => ({ id: `def_cd_${min}`, label: label, icon: '⏰', type: 'countdown', color: color, totalSec: min * 60 });
  if (school === 'elementary_lower') return [
    pomo(10, 5, '뽀모 10+5'), cd(15, '15분', '#5CB85C'), cd(20, '20분', '#4A90D9'), cd(25, '25분', '#9B6FC3'),
  ];
  if (school === 'elementary_upper') return [
    pomo(15, 5, '뽀모 15+5'), cd(20, '20분', '#5CB85C'), cd(25, '25분', '#4A90D9'), cd(30, '30분', '#9B6FC3'),
  ];
  if (school === 'middle') return [
    pomo(25, 5, '뽀모 25+5'), cd(30, '30분', '#5CB85C'), cd(45, '45분', '#4A90D9'), cd(60, '1시간', '#9B6FC3'),
  ];
  if (school === 'university') return [
    pomo(25, 5, '뽀모 25+5'), cd(45, '45분', '#5CB85C'), cd(60, '1시간', '#4A90D9'), cd(90, '90분', '#9B6FC3'),
  ];
  if (school === 'exam_prep') return [
    pomo(50, 10, '뽀모 50+10'), cd(60, '1시간', '#5CB85C'), cd(90, '90분', '#4A90D9'), cd(120, '2시간', '#9B6FC3'),
  ];
  // high, nsuneung
  return [
    pomo(25, 5, '뽀모 25+5'), cd(45, '45분', '#5CB85C'), cd(60, '1시간', '#4A90D9'), cd(90, '90분', '#9B6FC3'),
  ];
};
const DEFAULT_FAVS = getSchoolDefaultFavs('high');

export default function FocusScreen() {
  const app = useApp();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // 🔥모드 잠금화면 여부 (락 오버레이는 하드코딩 다크색 사용 — T에 영향 안 줌)
  const [screenLocked, setScreenLocked] = useState(false);
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = isTablet && winW > winH;
  const contentMaxW = isTablet ? Math.round(winW * 0.83) : SW;
  const school = app.settings.schoolLevel || 'high';
  const subjectDefMin = school === 'elementary_lower' ? 15 : school === 'elementary_upper' ? 20 : school === 'middle' ? 30 : 45;
  const subjectTimeChoices = school === 'elementary_lower' ? [10, 15, 20, 25] : school === 'elementary_upper' ? [15, 20, 25, 30] : school === 'middle' ? [25, 30, 40, 45] : [30, 45, 60, 90];
  const [showAdd, setShowAdd] = useState(false);
  const [timerViewMode, setTimerViewMode] = useState('default'); // 'default' | 'full' | 'mini'
  const [addType, setAddType] = useState('countdown');
  const [addMin, setAddMin] = useState(25);
  const [addSubject, setAddSubject] = useState(null);
  const [addPomoWork, setAddPomoWork] = useState(app.settings.pomodoroWorkMin || 25);
  const [addPomoBreak, setAddPomoBreak] = useState(app.settings.pomodoroBreakMin || 5);

  const [expandedTodo, setExpandedTodo] = useState(null);
  const [editTodoId, setEditTodoId] = useState(null);
  const [editTodoText, setEditTodoText] = useState('');
  const [editTodoSubjectId, setEditTodoSubjectId] = useState(null);
  const [editTodoSubjectLabel, setEditTodoSubjectLabel] = useState(null);
  const [editTodoSubjectColor, setEditTodoSubjectColor] = useState(null);
  const [editTodoScope, setEditTodoScope] = useState('today');
  const [editTodoPriority, setEditTodoPriority] = useState('normal');
  const [editTodoMemo, setEditTodoMemo] = useState('');
  const [showEditTodoMemo, setShowEditTodoMemo] = useState(false);
  const [editTodoRepeatType, setEditTodoRepeatType] = useState('none');
  const [editTodoCustomDays, setEditTodoCustomDays] = useState([]);
  const [editTodoDdayId, setEditTodoDdayId] = useState(null);
  // 연속모드 빌더
  const [seqItems, setSeqItems] = useState([]);
  const [seqName, setSeqName] = useState('');
  const [seqBreak, setSeqBreak] = useState(5);
  const [showLaps, setShowLaps] = useState(null);
  const favs = app.favs || [];
  const [showFavMgr, setShowFavMgr] = useState(false);
  const [showCountupFavMgr, setShowCountupFavMgr] = useState(false);
  const [favTab, setFavTab] = useState('countdown'); // 'countdown' | 'countup'
  const [lapExpanded, setLapExpanded] = useState(false);
  const [showCompletedTodos, setShowCompletedTodos] = useState(false);
  const [todoScopeFilter, setTodoScopeFilter] = useState('today');
  // 할일 추가 모달
  const [showAddTodoModal, setShowAddTodoModal] = useState(false);
  const inlineInputRef = useRef(null);
  const [addTodoText, setAddTodoText] = useState('');
  const [addTodoSubjectId, setAddTodoSubjectId] = useState(null);
  const [addTodoSubjectLabel, setAddTodoSubjectLabel] = useState(null);
  const [addTodoSubjectColor, setAddTodoSubjectColor] = useState(null);
  const [addTodoPriority, setAddTodoPriority] = useState('normal');
  const [addTodoScope, setAddTodoScope] = useState('today');
  const [addTodoRepeatType, setAddTodoRepeatType] = useState('none');
  const [addTodoCustomDays, setAddTodoCustomDays] = useState([]);
  const [addTodoDdayId, setAddTodoDdayId] = useState(null);
  const [addTodoMemo, setAddTodoMemo] = useState('');
  const [showAddTodoMemo, setShowAddTodoMemo] = useState(false);
  // 메모 모달
  const [memoTimerId, setMemoTimerId] = useState(null);  // 메모 입력 중인 타이머 id
  const [memoText, setMemoText] = useState('');
  const [memoSessionId, setMemoSessionId] = useState(null); // 연결된 세션 id
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [planCardCollapsed, setPlanCardCollapsed] = useState(false);
  const [nowStr, setNowStr] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowStr(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);


  const countupFavs = app.countupFavs || [];
  const addToFav = (fav) => { app.addFav?.(fav); };
  const removeFav = (id) => { app.removeFav?.(id); };
  const checkCanStart = () => {
    const running = app.timers.find(t => t.status === 'running' && t.type !== 'lap');
    if (running) { app.showToastCustom(`⏱ 타이머가 실행 중입니다`, 'paengi'); return false; }
    return true;
  };
  const runCountupFav = (fav) => {
    if (!checkCanStart()) return;
    app.addTimer({ type: 'free', label: fav.label, color: fav.color, totalSec: 0 });
  };
  const runFav = (fav) => {
    if (!checkCanStart()) return;
    if (fav.type === 'sequence' && fav.seqItems) {
      const items = fav.seqItems.map(it => ({ label: it.label, color: it.color, totalSec: it.min * 60, type: 'countdown', isBreak: !!it.isBreak }));
      app.startSequence({ items, breakSec: (fav.seqBreak ?? 5) * 60, seqName: fav.label, seqIcon: fav.icon, seqColor: fav.color });
    } else {
      app.addTimer({ type: fav.type, label: `${fav.icon} ${fav.label}`, color: fav.color, subjectId: fav.subjectId || null, totalSec: fav.totalSec || 0, pomoWorkMin: fav.pomoWorkMin || 25, pomoBreakMin: fav.pomoBreakMin || 5 });
    }
  };
  // 연속모드 빌더
  const handleStartSeq = () => {
    if (!checkCanStart()) return;
    const realItems = seqItems.filter(it => it.label.trim());
    if (realItems.length < 2) { app.showToastCustom('2개 이상 추가하세요!', 'paengi'); return; }
    const seqOpts = { items: realItems.map(it => ({ label: it.isBreak ? '☕ 쉬는시간' : it.label, color: it.isBreak ? '#27AE60' : '#4A90D9', totalSec: it.min * 60, type: 'countdown', isBreak: !!it.isBreak })), breakSec: 0, seqName: seqName.trim() || '연속모드' };
    // iOS: Modal 닫힘 애니메이션 완료 후 타이머 시작 (동시 Modal 전환 크래시 방지)
    setShowAdd(false);
    setTimeout(() => app.startSequence(seqOpts), Platform.OS === 'ios' ? 350 : 0);
  };
  const handleSaveSeq = () => {
    if (seqItems.filter(it => it.label.trim()).length < 2 || !seqName.trim()) { app.showToastCustom('이름과 2개 이상 필요!', 'paengi'); return; }
    addToFav({ label: seqName.trim(), icon: '📋', type: 'sequence', color: '#6C5CE7', totalSec: 0, seqItems: seqItems.filter(it => it.label.trim()).map(it => ({ ...it })), seqBreak: 0 });
    setShowAdd(false);
  };
  const SEQ_LABELS = ['공부','숙제','수학','국어','영어','독서','운동','휴식','점심','저녁','복습','과학','사회'];

  const primaryDDs = app.ddays.filter(d => d.isPrimary);
  const active = app.timers.filter(t => t.status === 'running' || t.status === 'paused');
  const completed = app.timers.filter(t => t.status === 'completed');
  const maxRunning = active.length > 0 ? Math.max(...active.map(t => t.elapsedSec)) : 0;
  const realToday = app.todayTotalSec + maxRunning;
  const goalPct = Math.min(100, Math.round((realToday / (app.settings.dailyGoalMin * 60)) * 100));
  const hasRunning = app.timers.some(t => t.status === 'running');
  const hasPausedByUltra = app.timers.some(t => t.pausedByUltra && t.status === 'paused');

  // 플래너 달성률 (enabled이고 오늘 plans 있을 때만 숫자, 아니면 null)
  const plannerRate = app.weeklySchedule?.enabled ? app.getTodayPlanRate?.() : null;

  // 챌린지
  const [challengeInput, setChallengeInput] = useState('');
  const challengeTarget = app.getChallengeText?.(app.settings.ultraFocusLevel || 'focus', app.ultraFocus?.challengeAwayMs || 0) || '집중';
  const challengeMatch = challengeInput.trim() === challengeTarget;
  const challengeAwayMin = Math.floor((app.ultraFocus?.challengeAwayMs || 0) / 60000);
  const challengeAwaySec = Math.floor(((app.ultraFocus?.challengeAwayMs || 0) % 60000) / 1000);

  // 완료 결과 모달 — 자기평가 입력
  const [resultSelfRating, setResultSelfRating] = useState(null);
  const [resultMemo, setResultMemo] = useState('');

  const ultraMood = app.ultraFocus?.gaveUp ? 'sad' : app.ultraFocus?.showChallenge ? 'sad' : app.ultraFocus?.showWarning ? 'sad' : app.mood;

  const mainScrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const inlineFocusedRef = useRef(false);

  // ═══ 🔒 잠금 오버레이 (🔥모드 전용) ═══
  const SLIDE_WIDTH = isTablet ? Math.min(winW - 80, 360) : winW - 80;
  const THUMB_SIZE = 56;
  const SLIDE_THRESHOLD = SLIDE_WIDTH - THUMB_SIZE - 10;
  const slideThresholdRef = useRef(SLIDE_THRESHOLD);
  slideThresholdRef.current = SLIDE_THRESHOLD;
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;

  // 앱 복귀 시 키보드 자동 열림 방지
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        Keyboard.dismiss();
        inlineInputRef.current?.blur();
      }
    });
    return () => sub.remove();
  }, []);

  // Android: 인라인 todo 입력창이 키보드에 가려질 때 스크롤로 노출
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      if (!inlineFocusedRef.current) return;
      const keyboardScreenY = e.endCoordinates.screenY;
      inlineInputRef.current?.measureInWindow((x, y, w, h) => {
        const inputBottom = y + h;
        if (inputBottom > keyboardScreenY - 8) {
          mainScrollRef.current?.scrollTo({
            y: scrollYRef.current + (inputBottom - keyboardScreenY) + 24,
            animated: true,
          });
        }
      });
    });
    return () => sub.remove();
  }, []);

  // screenLocked 변경 시 useAppState에 알림 (AppState 핸들러가 잠금 여부 체크용)
  useEffect(() => {
    app.notifyScreenLocked?.(screenLocked);
  }, [screenLocked]);

  // 타이머 없어지면 기본모드로 복귀
  useEffect(() => {
    const hasActive = app.timers.some(t => t.type !== 'lap' && (t.status === 'running' || t.status === 'paused'));
    if (!hasActive) setTimerViewMode('default');
  }, [app.timers]);

  // 🔥모드 타이머 실행 시 자동 잠금
  useEffect(() => {
    if (app.focusMode === 'screen_on' && hasRunning && !app.ultraFocus?.showChallenge && !app.ultraFocus?.gaveUp) {
      if (!screenLocked) {
        setScreenLocked(true);
        try { app.applyFocusBrightness?.(); } catch {}
      }
    }
    if (!hasRunning || app.focusMode !== 'screen_on') {
      // 집중모드가 완전히 꺼진 경우에만 밝기/다크 복원
      // focusMode가 여전히 screen_on이면 타이머 시작 50ms 갭 또는 deactivateFocusMode가 처리 예정
      if (app.focusMode !== 'screen_on') {
        try { app.restoreBrightness?.(); } catch {}
      }
      setScreenLocked(false);
    }
  }, [app.focusMode, hasRunning, app.ultraFocus?.showChallenge, app.ultraFocus?.gaveUp]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderMove: (_, gs) => {
        const threshold = slideThresholdRef.current;
        const x = Math.max(0, Math.min(gs.dx, threshold));
        slideX.setValue(x);
        // 슬라이드할수록 자물쇠 텍스트 흐려짐
        slideOpacity.setValue(1 - (x / threshold) * 0.8);
      },
      onPanResponderRelease: (_, gs) => {
        const threshold = slideThresholdRef.current;
        if (gs.dx >= threshold) {
          // 잠금 해제!
          Animated.timing(slideX, { toValue: threshold, duration: 100, useNativeDriver: false }).start(() => {
            // restore brightness so UI buttons are visible after unlocking
            try { app.restoreBrightness?.(); } catch {}
            setScreenLocked(false);
            slideX.setValue(0);
            slideOpacity.setValue(1);
          });
        } else {
          // 원위치
          Animated.spring(slideX, { toValue: 0, useNativeDriver: false }).start();
          Animated.timing(slideOpacity, { toValue: 1, duration: 200, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  // 잠금 버튼 (해제 후 다시 잠그기)
  const lockScreen = () => {
    if (app.focusMode === 'screen_on' && hasRunning) {
      setScreenLocked(true);
      try { app.applyFocusBrightness?.(); } catch {}
    }
  };


  // 기록 스톱워치 찾기
  const lapTimer = app.timers.find(t => t.type === 'lap' && (t.status === 'running' || t.status === 'paused'));
  const lapDone = app.timers.find(t => t.type === 'lap' && t.status === 'completed');
  const nonLapTimers = app.timers.filter(t => t.type !== 'lap');
  const nonLapActive = nonLapTimers.filter(t => t.status === 'running' || t.status === 'paused');
  const nonLapCompleted = nonLapTimers.filter(t => t.status === 'completed');
  const allNonLap = [...nonLapActive, ...nonLapCompleted];

  const handleAddTimer = () => {
    if (!checkCanStart()) return;
    const subj = addSubject ? app.subjects.find(s => s.id === addSubject) : null;
    const label = subj ? subj.name : (addType === 'countdown' ? `${addMin}분` : `뽀모 ${addPomoWork}+${addPomoBreak}`);
    const opts = { type: addType, label, subjectId: addSubject, color: subj ? subj.color : '#FF6B9D', totalSec: addType === 'countdown' ? addMin * 60 : 0, pomoWorkMin: addPomoWork, pomoBreakMin: addPomoBreak };
    // iOS: Modal 닫힘 애니메이션 완료 후 타이머 시작 (동시 Modal 전환 크래시 방지)
    setShowAdd(false);
    setTimeout(() => app.addTimer(opts), Platform.OS === 'ios' ? 350 : 0);
  };
  const handleAddAndFav = () => {
    handleAddTimer();
    const subj = addSubject ? app.subjects.find(s => s.id === addSubject) : null;
    const label = subj ? subj.name : (addType === 'countdown' ? `${addMin}분` : `뽀모 ${addPomoWork}+${addPomoBreak}`);
    addToFav({ label, icon: addType === 'pomodoro' ? '🍅' : '⏰', type: addType, color: subj ? subj.color : '#FF6B9D', totalSec: addType === 'countdown' ? addMin * 60 : 0, subjectId: addSubject, pomoWorkMin: addPomoWork, pomoBreakMin: addPomoBreak });
  };

  // ── 할일 추가 모달 헬퍼 ──
  const openAddTodo = () => {
    setAddTodoSubjectId(null);
    setAddTodoSubjectLabel(null);
    setAddTodoSubjectColor(null);
    setAddTodoPriority('normal');
    setAddTodoScope('today');
    setAddTodoDdayId(null);
    setAddTodoMemo('');
    setShowAddTodoMemo(false);
    setAddTodoRepeatType('none');
    setAddTodoCustomDays([]);
    setTimeout(() => inlineInputRef.current?.focus(), 100);
  };
  const submitInlineTodo = () => {
    if (!addTodoText.trim()) { setAddTodoText(''); return; }
    const scopeMap = { today: 'today', week: 'week', exam: 'exam', all: 'today' };
    app.addTodo({
      text: addTodoText.trim(),
      subjectId: addTodoSubjectId,
      subjectLabel: addTodoSubjectLabel,
      subjectColor: addTodoSubjectColor,
      priority: 'normal',
      scope: scopeMap[todoScopeFilter] || 'today',
      isTemplate: false,
    });
    Vibration.vibrate([0, 30]);
    setAddTodoText('');
    Keyboard.dismiss();
  };
  const submitAddTodo = () => {
    if (!addTodoText.trim()) return;
    const repeatMap = { daily: [0,1,2,3,4,5,6], weekday: [1,2,3,4,5], weekend: [0,6], custom: addTodoCustomDays };
    const repeatDays = addTodoRepeatType !== 'none' ? (repeatMap[addTodoRepeatType] || null) : null;
    app.addTodo({
      text: addTodoText.trim(),
      subjectId: addTodoSubjectId,
      subjectLabel: addTodoSubjectLabel,
      subjectColor: addTodoSubjectColor,
      priority: addTodoPriority,
      scope: addTodoScope,
      ddayId: addTodoDdayId,
      memo: addTodoMemo,
      isTemplate: repeatDays !== null,
      repeatDays,
    });
    // 반복 템플릿 인스턴스 생성은 addTodo 내부에서 처리
    Vibration.vibrate([0, 30]);
    setAddTodoText('');
    setAddTodoMemo('');
    setAddTodoSubjectId(null);
    setAddTodoSubjectLabel(null);
    setAddTodoSubjectColor(null);
    setShowAddTodoMemo(false);
    app.showToastCustom('✅ 할 일이 저장됐어요!', 'taco');
    setShowAddTodoModal(false);
  };

  const closeAddTodoModal = () => {
    setAddTodoSubjectId(null);
    setAddTodoSubjectLabel(null);
    setAddTodoSubjectColor(null);
    setShowAddTodoModal(false);
  };

  const openEditTodo = (t) => {
    const rDays = t.repeatDays;
    let repeatType = 'none';
    if (rDays && rDays.length > 0) {
      if (rDays.length === 7) repeatType = 'daily';
      else if (rDays.length === 5 && !rDays.includes(0) && !rDays.includes(6)) repeatType = 'weekday';
      else if (rDays.length === 2 && rDays.includes(0) && rDays.includes(6)) repeatType = 'weekend';
      else repeatType = 'custom';
    }
    setEditTodoId(t.id);
    setEditTodoText(t.text || '');
    setEditTodoSubjectId(t.subjectId || null);
    setEditTodoSubjectLabel(t.subjectLabel || null);
    setEditTodoSubjectColor(t.subjectColor || null);
    setEditTodoScope(t.scope || 'today');
    setEditTodoPriority(t.priority || 'normal');
    setEditTodoMemo(t.memo || '');
    setShowEditTodoMemo(!!(t.memo));
    setEditTodoRepeatType(repeatType);
    setEditTodoCustomDays(rDays && repeatType === 'custom' ? rDays : []);
    setEditTodoDdayId(t.ddayId || null);
  };

  const submitEditTodo = () => {
    if (!editTodoText.trim() || !editTodoId) return;
    const repeatMap = { daily: [0,1,2,3,4,5,6], weekday: [1,2,3,4,5], weekend: [0,6], custom: editTodoCustomDays };
    const repeatDays = editTodoRepeatType !== 'none' ? (repeatMap[editTodoRepeatType] || null) : null;
    const todo = app.todos.find(t => t.id === editTodoId);
    // 인스턴스 편집 시 부모 템플릿도 함께 제거 (새 템플릿 생성 또는 반복 해제 시 중복/유령 템플릿 방지)
    if (todo?.templateId) {
      app.removeTodo(todo.templateId);
    }
    app.removeTodo(editTodoId);
    app.addTodo({
      text: editTodoText.trim(),
      subjectId: editTodoSubjectId,
      subjectLabel: editTodoSubjectLabel,
      subjectColor: editTodoSubjectColor,
      priority: editTodoPriority,
      scope: editTodoRepeatType !== 'none' ? 'today' : editTodoScope,
      ddayId: editTodoDdayId,
      memo: editTodoMemo,
      isTemplate: repeatDays !== null,
      repeatDays,
    });
    setEditTodoId(null);
  };

  const startLapTimer = () => {
    if (lapTimer) { app.showToastCustom('타임어택이 이미 실행중!', 'paengi'); return; }
    // 타임어택은 집중모드 없이 바로 시작
    app.addTimer({ type: 'lap', label: '⏱ 타임어택', color: '#6C5CE7', totalSec: 0 });
    app.showToastCustom('⏱ 하단 버튼으로 랩 기록!', 'taco');
  };

  // 렌더 시점의 실제 페이즈 경과(초) — 상태 elapsedSec 대신 wall-clock 직접 계산
  // 500ms 인터벌 + Math.floor 상태 업데이트 방식에서는 연속 렌더 간격이 500ms로 줄어
  // 1초가 0.5초처럼 보이는 현상이 발생하므로, 렌더 시점에 항상 현재 시각 기준으로 계산
  const getLivePhaseElapsed = (t) => {
    if (t.status === 'running' && t.resumedAt) {
      return (t.elapsedSecAtResume || 0) + Math.floor((Date.now() - t.resumedAt) / 1000);
    }
    return t.elapsedSec;
  };
  const getDisplay = (t) => {
    const live = getLivePhaseElapsed(t);
    if (t.type === 'free' || t.type === 'lap') return live;
    if (t.type === 'countdown') return Math.max(0, t.totalSec - live);
    if (t.type === 'sequence') {
      if (t.seqPhase === 'break') return Math.max(0, t.seqBreakSec - live);
      return Math.max(0, t.totalSec - live);
    }
    return Math.max(0, (t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60) - live);
  };
  // 전체 누적 경과 (포모도로·연속모드용 — 완료된 페이즈 합산)
  // 순수 공부 시간만 누적 (쉬는 시간 제외)
  const getTotalElapsed = (t) => {
    const live = getLivePhaseElapsed(t);
    if (t.type === 'pomodoro') {
      const completedWork = (t.pomoSet || 0) * (t.pomoWorkMin || 25) * 60;
      const currentWork = t.pomoPhase === 'work' ? live : 0;
      return completedWork + currentWork;
    }
    if (t.type === 'sequence') {
      // break 중에는 seqIndex 항목까지 완료됨 (seqIndex는 break 후에야 증가)
      const completedCount = t.seqPhase === 'break' ? (t.seqIndex || 0) + 1 : (t.seqIndex || 0);
      const completedSec = (t.seqItems || []).slice(0, completedCount)
        .filter(item => !item.isBreak)
        .reduce((sum, item) => sum + (item.totalSec || (item.min || 0) * 60), 0);
      const currentWork = t.seqPhase === 'break' ? 0 : live;
      return completedSec + currentWork;
    }
    return live;
  };
  const getProgress = (t) => {
    const live = getLivePhaseElapsed(t);
    if (t.type === 'free' || t.type === 'lap') return Math.min(100, (live / 3600) * 100);
    if (t.type === 'countdown') return (live / Math.max(1, t.totalSec)) * 100;
    if (t.type === 'sequence') {
      const target = t.seqPhase === 'break' ? t.seqBreakSec : t.totalSec;
      return (live / Math.max(1, target)) * 100;
    }
    return (live / Math.max(1, (t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60))) * 100;
  };

  // 타이머 카드 즐겨찾기 토글
  const handleToggleFav = (t) => {
    if (t.type === 'sequence') {
      const seqName = t.seqName || '연속모드';
      if (favs.some(f => f.label === seqName)) { app.showToastCustom('이미 즐겨찾기에 있어요!', 'paengi'); return; }
      if (t.seqItems?.length) {
        addToFav({ label: seqName, icon: t.seqIcon || '📋', type: 'sequence', color: t.seqColor || '#6C5CE7', totalSec: 0, seqItems: t.seqItems.map(it => ({ label: it.label, color: it.color, min: Math.round(it.totalSec / 60) })), seqBreak: t.seqBreakSec ? Math.round(t.seqBreakSec / 60) : 5 });
      } else { app.showToastCustom('저장할 수 없어요', 'paengi'); }
      return;
    }
    if (t.type === 'free' || t.type === 'lap') {
      const isFav = countupFavs.some(f => f.label === t.label);
      if (isFav) { app.showToastCustom('이미 즐겨찾기에 있어요!', 'paengi'); return; }
      app.addCountupFav?.({ label: t.label, color: t.color });
    } else {
      const isFav = favs.some(f => f.label === t.label && f.type === t.type);
      if (isFav) { app.showToastCustom('이미 즐겨찾기에 있어요!', 'paengi'); return; }
      addToFav({ label: t.label, icon: t.type === 'pomodoro' ? '🍅' : '⏰', type: t.type, color: t.color, totalSec: t.totalSec, pomoWorkMin: t.pomoWorkMin, pomoBreakMin: t.pomoBreakMin, subjectId: t.subjectId || null });
    }
  };

  // 일반 타이머 렌더
  const handleTimerLongPress = (t) => {
    const opts = [{ text: '취소', style: 'cancel' }];
    const inSeq = t.type === 'sequence';
    if (inSeq && t.status !== 'completed') {
      const seqLabel = t.seqName || '연속모드';
      const existingFav = favs.find(f => f.label === seqLabel);
      if (existingFav) {
        opts.push({ text: `⭐ "${seqLabel}" 즐겨찾기 삭제`, style: 'destructive', onPress: () => removeFav(existingFav.id) });
      } else {
        opts.push({ text: `⭐ "${seqLabel}" 세트 저장`, onPress: () => {
          if (favs.length >= 6) { app.showToastCustom('즐겨찾기가 가득 찼어요! 기존 항목을 삭제해주세요', 'paengi'); return; }
          if (t.seqItems?.length) {
            addToFav({ label: seqLabel, icon: t.seqIcon || '📋', type: 'sequence', color: t.seqColor || '#6C5CE7', totalSec: 0, seqItems: t.seqItems.map(it => ({ label: it.label, color: it.color, min: Math.round(it.totalSec / 60) })), seqBreak: t.seqBreakSec ? Math.round(t.seqBreakSec / 60) : 5 });
          } else { app.showToastCustom('저장할 수 없어요', 'paengi'); }
        }});
      }
    } else if (t.status !== 'completed') {
      const isFreeLap = t.type === 'free' || t.type === 'lap';
      if (isFreeLap) {
        const existingFav = countupFavs.find(f => f.label === t.label);
        if (existingFav) {
          opts.push({ text: '⭐ 즐겨찾기 삭제', style: 'destructive', onPress: () => app.removeCountupFav(existingFav.id) });
        } else {
          opts.push({ text: '⭐ 즐겨찾기 추가', onPress: () => {
            if (countupFavs.length >= 6) { app.showToastCustom('즐겨찾기가 가득 찼어요! 기존 항목을 삭제해주세요', 'paengi'); return; }
            app.addCountupFav?.({ label: t.label, color: t.color, subjectId: t.subjectId || null });
          }});
        }
      } else {
        const existingFav = favs.find(f => f.label === t.label && f.type === t.type);
        if (existingFav) {
          opts.push({ text: '⭐ 즐겨찾기 삭제', style: 'destructive', onPress: () => removeFav(existingFav.id) });
        } else {
          opts.push({ text: '⭐ 즐겨찾기 추가', onPress: () => {
            if (favs.length >= 6) { app.showToastCustom('즐겨찾기가 가득 찼어요! 기존 항목을 삭제해주세요', 'paengi'); return; }
            addToFav({ label: t.label, icon: t.type === 'pomodoro' ? '🍅' : '⏰', type: t.type, color: t.color, totalSec: t.totalSec, pomoWorkMin: t.pomoWorkMin, pomoBreakMin: t.pomoBreakMin });
          }});
        }
      }
    }
    opts.push({ text: '↺ 리셋', onPress: () => app.resetTimer(t.id) });
    if (inSeq) {
      opts.push({ text: '✕ 연속모드 전체취소', style: 'destructive', onPress: () => app.cancelSequence() });
    } else {
      opts.push({ text: '🗑 삭제', style: 'destructive', onPress: () => app.removeTimer(t.id) });
    }
    Alert.alert(t.label, '타이머 옵션', opts);
  };

  const renderTimer = (t, single) => {
    const isA = t.status === 'running', isP = t.status === 'paused', isD = t.status === 'completed';
    const icon = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? '🍅' : '☕') : t.type === 'countdown' ? '⏰' : '⏱';
    const display = isD ? 0 : getDisplay(t);
    const progress = isD ? 100 : getProgress(t);
    return (
      <TouchableOpacity key={t.id} activeOpacity={0.8} onLongPress={() => handleTimerLongPress(t)}
        style={[S.tc, { borderRadius: T.cardRadius, backgroundColor: isD ? (t.result?.tier?.color || T.accent) + '10' : T.card, borderColor: isD ? (t.result?.tier?.color || T.accent) + '60' : isA ? t.color : T.border, borderWidth: isA ? 1.5 : 1, width: single ? '100%' : CARD_W }]}>
        <View style={S.tcTop}><Text style={S.tcIcon}>{icon}</Text>
          {(() => {
            const isFav = t.type === 'sequence'
              ? favs.some(f => f.label === (t.seqName || '연속모드'))
              : (t.type === 'free' || t.type === 'lap')
              ? countupFavs.some(f => f.label === t.label)
              : favs.some(f => f.label === t.label && f.type === t.type);
            return (
              <TouchableOpacity onPress={() => handleToggleFav(t)} hitSlop={{top:8,bottom:8,left:6,right:2}}>
                <Text style={{ fontSize: 13, color: isFav ? '#F0B429' : T.sub }}>{isFav ? '⭐' : '☆'}</Text>
              </TouchableOpacity>
            );
          })()}
          <Text style={[S.tcLabel, { color: T.text }]} numberOfLines={1}>{t.label}</Text>
          <TouchableOpacity
            onPress={() => {
              if ((t.status === 'running' || t.status === 'paused') && t.elapsedSec >= 60) {
                app.showToastCustom('■ 종료 버튼으로 먼저 타이머를 종료해주세요', 'paengi');
              } else {
                app.removeTimer(t.id);
              }
            }}
            hitSlop={{top:8,bottom:8,left:8,right:8}}>
            <Text style={[S.tcClose, { color: (t.status === 'running' || t.status === 'paused') && t.elapsedSec >= 60 ? T.border : T.sub }]}>✕</Text>
          </TouchableOpacity></View>
        {t.type === 'pomodoro' && !isD && <Text style={[S.tcPhase, { color: t.pomoPhase === 'work' ? t.color : T.green }]}>{t.pomoPhase === 'work' ? `집중·${t.pomoSet+1}세트` : '휴식'}</Text>}
        {isD ? (
          <View style={S.resArea}>
            {(!t.memoSessionId && t.elapsedSec < 300) ? (
              /* 5분 미만 — 통계 저장 안 됨 */
              <>
                <Text style={S.resEmoji}>⏱️</Text>
                <Text style={{ fontSize: 13, color: T.sub, textAlign: 'center', marginTop: 4 }}>5분 미만 · 통계에 저장되지 않아요</Text>
                <Text style={{ fontSize: 11, color: T.sub, textAlign: 'center', marginTop: 2 }}>{formatDuration(t.elapsedSec)} 진행</Text>
              </>
            ) : (
              /* 정상 결과 */
              <>
                <Text style={S.resEmoji}>🎉</Text>
                {t.result?.tier && <View style={[S.resTier, { backgroundColor: t.result.tier.color + '20' }]}><Text style={[S.resTierT, { color: t.result.tier.color }]}>{t.result.tier.label}</Text></View>}
                <Text style={[S.resDensity, { color: T.text }]}>밀도 {t.result?.density || 0}점</Text>
                {/* 점수 이유 한 줄 */}
                <Text style={{ fontSize: 11, color: T.sub, marginTop: 2, textAlign: 'center' }}>
                  {(() => {
                    const r = t.result || {};
                    const parts = [];
                    if (t.type === 'countdown') parts.push(r.density >= 30 ? '완주 👏' : '도전');
                    else if (t.type === 'pomodoro') parts.push(`${t.pomoSet || 1}세트`);
                    else parts.push(formatDuration(t.elapsedSec));
                    if ((t.pauseCount || 0) === 0) parts.push('일시정지 0회');
                    else parts.push(`일시정지 ${t.pauseCount}회`);
                    if (r.focusMode === 'screen_on') { parts.push(r.verified ? '🏆 Verified!' : '🔥모드'); }
                    return parts.join(' · ');
                  })()}
                </Text>
                <Text style={[S.resTime, { color: T.sub }]}>{formatDuration(t.type === 'countdown' ? t.totalSec : t.elapsedSec)}</Text>
                {/* 메모 버튼 */}
                <TouchableOpacity
                  style={[S.memoBtn, { backgroundColor: t.memoText ? T.accent + '18' : T.surface2, borderColor: t.memoText ? T.accent + '50' : T.border }]}
                  onPress={() => { setMemoTimerId(t.id); setMemoSessionId(t.memoSessionId || null); setMemoText(t.memoText || ''); }}
                >
                  <Text style={[S.memoBtnT, { color: t.memoText ? T.accent : T.sub }]}>
                    {t.memoText ? `📝 ${t.memoText}` : '📝 한줄 메모 남기기'}
                  </Text>
                </TouchableOpacity>
                {/* 세션 완료 시 할일 체크 */}
                {app.todos.filter(td => !td.done).length > 0 && (
                  <View style={{ width: '100%', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border }}>
                    <Text style={{ fontSize: 12, color: T.sub, marginBottom: 4, textAlign: 'center' }}>이 세션에서 완료한 할 일이 있나요?</Text>
                    {app.todos.filter(td => !td.done).slice(0, 4).map(td => (
                      <TouchableOpacity key={td.id} onPress={() => app.toggleTodo(td.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                        <View style={{ width: 14, height: 14, borderRadius: 3, borderWidth: 1.5, borderColor: T.border, backgroundColor: 'transparent' }} />
                        <Text style={{ fontSize: 13, color: T.text, flex: 1 }} numberOfLines={1}>{td.text}</Text>
                      </TouchableOpacity>
                    ))}
                    {app.todos.filter(td => !td.done).length > 4 && (
                      <Text style={{ fontSize: 11, color: T.sub, textAlign: 'center' }}>+{app.todos.filter(td => !td.done).length - 4}개 더</Text>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        ) : (<>
          <Text testID="timer-text" style={[S.tcTime, { color: isA ? t.color : T.sub, fontSize: single ? 36 : 26, fontWeight: T.timerFontWeight }]}>{formatTime(display)}</Text>
          {t.type !== 'lap' && getTotalElapsed(t) > 0 && <Text style={[S.tcElapsed, { color: T.sub }]}>{formatTime(getTotalElapsed(t))}</Text>}
          <View style={[S.tcTrack, { backgroundColor: T.surface2 }]}><View style={[S.tcFill, { width: `${Math.min(100,progress)}%`, backgroundColor: isP ? T.sub : t.color }]} /></View>
        </>)}
        <View style={S.tcCtrls}>
          {isA && (<><TouchableOpacity style={[S.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.resetTimer(t.id)}><Text style={[S.tcBtnT, { color: T.text }]}>↺</Text></TouchableOpacity>
            <TouchableOpacity style={[S.tcBtn, { backgroundColor: T.stylePreset === 'minimal' ? T.surface2 : '#E8404720', flex: 2 }]} onPress={() => app.pauseTimer(t.id)}><Text style={[S.tcBtnT, { color: T.stylePreset === 'minimal' ? T.sub : '#E84047' }]}>⏸</Text></TouchableOpacity>
            <TouchableOpacity style={[S.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.stopTimer(t.id)}><Text style={[S.tcBtnT, { color: T.sub }]}>■</Text></TouchableOpacity></>)}
          {isP && (<><TouchableOpacity style={[S.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.resetTimer(t.id)}><Text style={[S.tcBtnT, { color: T.text }]}>↺</Text></TouchableOpacity>
            <TouchableOpacity style={[S.tcBtn, { backgroundColor: t.color, flex: 2 }]} onPress={() => app.resumeTimer(t.id)}><Text style={S.tcBtnT}>▶</Text></TouchableOpacity>
            <TouchableOpacity style={[S.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.stopTimer(t.id)}><Text style={[S.tcBtnT, { color: T.sub }]}>■</Text></TouchableOpacity></>)}
          {isD && (<><TouchableOpacity style={[S.tcBtn, { backgroundColor: t.color, flex: 1 }]} onPress={() => app.restartTimer(t.id)}><Text style={S.tcBtnT}>▶ 다시</Text></TouchableOpacity>
            <TouchableOpacity style={[S.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.removeTimer(t.id)}><Text style={[S.tcBtnT, { color: T.sub }]}>삭제</Text></TouchableOpacity></>)}
        </View>
      </TouchableOpacity>
    );
  };

  const renderLargeTimer = (t) => {
    const isA = t.status === 'running', isP = t.status === 'paused';
    const display = getDisplay(t);
    const pct = Math.max(0, Math.min(100, getProgress(t)));
    const dashOffset = RING_C * (1 - pct / 100);
    const icon = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? '🍅' : '☕')
      : t.type === 'sequence' ? (t.seqPhase === 'break' ? '☕' : (t.seqIcon || '📋'))
      : t.type === 'countdown' ? '⏰' : '⏱';
    const ringColor = (t.type === 'sequence' && t.seqPhase === 'break') ? T.green
      : (t.type === 'pomodoro' && t.pomoPhase !== 'work') ? T.green
      : t.color;
    const isFav = t.type === 'sequence'
      ? favs.some(f => f.label === (t.seqName || '연속모드'))
      : (t.type === 'free') ? countupFavs.some(f => f.label === t.label)
      : favs.some(f => f.label === t.label && f.type === t.type);
    return (
      <TouchableOpacity key={t.id} activeOpacity={0.95} onLongPress={() => handleTimerLongPress(t)}
        style={{ backgroundColor: T.card, borderWidth: 1.5, borderColor: isA ? ringColor : T.border, borderRadius: T.cardRadius, margin: 10, marginBottom: 4, padding: 16, paddingBottom: 14 }}>

        {/* 상단 행: 아이콘 + 라벨 + 미니모드 토글 + 즐겨찾기 + 닫기 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 15 }}>{icon}</Text>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: T.text }} numberOfLines={1}>{t.label}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: T.surface2, borderRadius: 8, padding: 2, gap: 1 }}>
            {[{ id: 'mini', label: '미니' }, { id: 'default', label: '기본' }, { id: 'full', label: '전체' }].map(opt => (
              <TouchableOpacity key={opt.id} onPress={() => setTimerViewMode(opt.id)}
                style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: timerViewMode === opt.id ? T.accent : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: timerViewMode === opt.id ? 'white' : T.sub }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => handleToggleFav(t)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 2 }}>
            <Text style={{ fontSize: 15, color: isFav ? '#F0B429' : T.sub }}>{isFav ? '⭐' : '☆'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { if (t.elapsedSec >= 60) { app.showToastCustom('■ 종료 버튼으로 먼저 타이머를 종료해주세요', 'paengi'); } else { app.removeTimer(t.id); } }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.elapsedSec >= 60 ? T.border : T.sub }}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 연속모드 단계 표시 */}
        {t.type === 'sequence' && (
          <View style={{ marginBottom: 10 }}>
            {t.seqPhase === 'break' ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.green, textAlign: 'center' }}>
                ☕ 쉬는 중 · {Math.ceil(display / 60)}분 후 다음 항목
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 13, fontWeight: '800', color: t.seqColor || T.accent, textAlign: 'center', marginBottom: 4 }}>
                  {t.seqIcon || '📋'} {t.seqName || '연속모드'} ({(t.seqIndex || 0) + 1}/{t.seqTotal})
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                  {t.seqItems?.map((item, i) => (
                    <Text key={i} style={{ fontSize: 11, fontWeight: i === t.seqIndex ? '900' : '500', color: i === t.seqIndex ? ringColor : T.sub, textDecorationLine: i === t.seqIndex ? 'underline' : 'none' }}>
                      {i === t.seqIndex ? '●' : `${i + 1}`} {item.label}
                    </Text>
                  ))}
                </View>
              </>
            )}
          </View>
        )}
        {/* 뽀모도로 페이즈 */}
        {t.type === 'pomodoro' && (
          <Text style={{ fontSize: 13, fontWeight: '700', color: ringColor, textAlign: 'center', marginBottom: 8 }}>
            {t.pomoPhase === 'work' ? `🍅 집중·${(t.pomoSet || 0) + 1}세트` : '☕ 휴식 중'}
          </Text>
        )}

        {/* 원형 타이머 링 */}
        <View style={{ alignItems: 'center', marginBottom: 14 }}>
          <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
              {/* 트랙 (배경 링) */}
              <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                stroke={T.surface2} strokeWidth={T.ringStroke} fill="transparent" />
              {/* 진행 링 */}
              {pct > 0 && (
                <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                  stroke={isP ? T.sub : ringColor} strokeWidth={T.ringStroke} fill="transparent"
                  strokeDasharray={RING_C} strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90, ${RING_SIZE / 2}, ${RING_SIZE / 2})`}
                />
              )}
            </Svg>
            {/* 링 내부: 시간 + 서브 텍스트 */}
            <View style={{ alignItems: 'center' }}>
              <Text testID="timer-text" style={{ fontSize: isTablet ? 64 : 50, fontWeight: T.timerFontWeight, color: isA ? ringColor : T.sub, fontVariant: ['tabular-nums'], letterSpacing: 1 }}>
                {formatTime(display)}
              </Text>
              {t.type !== 'lap' && getTotalElapsed(t) > 0 && (
                <Text style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>경과 {formatTime(getTotalElapsed(t))}</Text>
              )}
            </View>
          </View>
        </View>

        {/* 컨트롤 버튼 */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => app.resetTimer(t.id)}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>↺ 리셋</Text>
          </TouchableOpacity>
          {t.type === 'sequence' ? (
            <TouchableOpacity style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.stylePreset === 'minimal' ? T.surface2 : '#E8404720', alignItems: 'center' }} onPress={() => app.cancelSequence()}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: T.stylePreset === 'minimal' ? T.sub : '#E84047' }}>✕ 취소</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => app.stopTimer(t.id)}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: T.sub }}>■ 종료</Text>
            </TouchableOpacity>
          )}
          {isA ? (
            <TouchableOpacity style={{ flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: T.stylePreset === 'minimal' ? T.surface2 : '#E8404720', alignItems: 'center' }} onPress={() => app.pauseTimer(t.id)}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: T.stylePreset === 'minimal' ? T.sub : '#E84047' }}>⏸ 일시정지</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: ringColor, alignItems: 'center' }} onPress={() => app.resumeTimer(t.id)}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: 'white' }}>▶ 계속하기</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFullTimer = (t) => {
    const isA = t.status === 'running', isP = t.status === 'paused';
    const display = getDisplay(t);
    const pct = Math.max(0, Math.min(100, getProgress(t)));
    const dashOffset = RING_C_FULL * (1 - pct / 100);
    const icon = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? '🍅' : '☕')
      : t.type === 'sequence' ? (t.seqPhase === 'break' ? '☕' : (t.seqIcon || '📋'))
      : t.type === 'countdown' ? '⏰' : '⏱';
    const ringColor = (t.type === 'sequence' && t.seqPhase === 'break') ? T.green
      : (t.type === 'pomodoro' && t.pomoPhase !== 'work') ? T.green
      : t.color;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 24 }}>
        {/* 라벨 + 모드 전환 버튼 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 }}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: T.text, flex: 1, textAlign: 'center' }} numberOfLines={1}>{t.label}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 2, gap: 1 }}>
            {[{ id: 'mini', label: '미니' }, { id: 'default', label: '기본' }, { id: 'full', label: '전체' }].map(opt => (
              <TouchableOpacity key={opt.id} onPress={() => setTimerViewMode(opt.id)}
                style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: timerViewMode === opt.id ? T.accent : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: timerViewMode === opt.id ? 'white' : T.sub }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {/* 연속모드 단계 */}
        {t.type === 'sequence' && t.seqPhase !== 'break' && (
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.seqColor || T.accent, marginBottom: 10 }}>
            {t.seqIcon || '📋'} {t.seqName || '연속모드'} ({(t.seqIndex || 0) + 1}/{t.seqTotal})
          </Text>
        )}
        {t.type === 'pomodoro' && (
          <Text style={{ fontSize: 14, fontWeight: '700', color: ringColor, marginBottom: 10 }}>
            {t.pomoPhase === 'work' ? `🍅 집중·${(t.pomoSet || 0) + 1}세트` : '☕ 휴식 중'}
          </Text>
        )}
        {/* 큰 원형 링 */}
        <View style={{ width: RING_SIZE_FULL, height: RING_SIZE_FULL, alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <Svg width={RING_SIZE_FULL} height={RING_SIZE_FULL} style={{ position: 'absolute' }}>
            <Circle cx={RING_SIZE_FULL / 2} cy={RING_SIZE_FULL / 2} r={RING_R_FULL}
              stroke={T.surface2} strokeWidth={T.ringStrokeFull} fill="transparent" />
            {pct > 0 && (
              <Circle cx={RING_SIZE_FULL / 2} cy={RING_SIZE_FULL / 2} r={RING_R_FULL}
                stroke={isP ? T.sub : ringColor} strokeWidth={T.ringStrokeFull} fill="transparent"
                strokeDasharray={RING_C_FULL} strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform={`rotate(-90, ${RING_SIZE_FULL / 2}, ${RING_SIZE_FULL / 2})`}
              />
            )}
          </Svg>
          <View style={{ alignItems: 'center' }}>
            <Text testID="timer-text" style={{ fontSize: isTablet ? 80 : 60, fontWeight: T.timerFontWeight, color: isA ? ringColor : T.sub, fontVariant: ['tabular-nums'], letterSpacing: 2 }}>
              {formatTime(display)}
            </Text>
            {t.type !== 'lap' && getTotalElapsed(t) > 0 && (
              <Text style={{ fontSize: 14, color: T.sub, marginTop: 4 }}>경과 {formatTime(getTotalElapsed(t))}</Text>
            )}
          </View>
        </View>
        {/* 컨트롤 버튼 */}
        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
          <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => app.resetTimer(t.id)}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>↺ 리셋</Text>
          </TouchableOpacity>
          {t.type === 'sequence' ? (
            <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.stylePreset === 'minimal' ? T.surface2 : '#E8404720', alignItems: 'center' }} onPress={() => app.cancelSequence()}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: T.stylePreset === 'minimal' ? T.sub : '#E84047' }}>✕ 취소</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => app.stopTimer(t.id)}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: T.sub }}>■ 종료</Text>
            </TouchableOpacity>
          )}
          {isA ? (
            <TouchableOpacity style={{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: T.stylePreset === 'minimal' ? T.surface2 : '#E8404720', alignItems: 'center' }} onPress={() => app.pauseTimer(t.id)}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: T.stylePreset === 'minimal' ? T.sub : '#E84047' }}>⏸ 일시정지</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: ringColor, alignItems: 'center' }} onPress={() => app.resumeTimer(t.id)}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: 'white' }}>▶ 계속하기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderMiniTimer = (t) => {
    const isA = t.status === 'running';
    const display = getDisplay(t);
    const icon = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? '🍅' : '☕')
      : t.type === 'sequence' ? (t.seqPhase === 'break' ? '☕' : (t.seqIcon || '📋'))
      : t.type === 'countdown' ? '⏰' : '⏱';
    const ringColor = (t.type === 'sequence' && t.seqPhase === 'break') ? T.green
      : (t.type === 'pomodoro' && t.pomoPhase !== 'work') ? T.green
      : t.color;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: T.text }} numberOfLines={1}>{t.label}</Text>
        <Text style={{ fontSize: 22, fontWeight: '900', color: isA ? ringColor : T.sub, fontVariant: ['tabular-nums'], minWidth: 70, textAlign: 'right' }}>
          {formatTime(display)}
        </Text>
        <TouchableOpacity
          onPress={() => isA ? app.pauseTimer(t.id) : app.resumeTimer(t.id)}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: isA ? (T.stylePreset === 'minimal' ? T.surface2 : '#E8404720') : ringColor + '30' }}>
          <Text style={{ fontSize: 15, color: isA ? (T.stylePreset === 'minimal' ? T.sub : '#E84047') : ringColor }}>{isA ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', backgroundColor: T.surface2, borderRadius: 8, padding: 2, gap: 1 }}>
          {[{ id: 'mini', label: '미니' }, { id: 'default', label: '기본' }, { id: 'full', label: '전체' }].map(opt => (
            <TouchableOpacity key={opt.id} onPress={() => setTimerViewMode(opt.id)}
              style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: timerViewMode === opt.id ? T.accent : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: timerViewMode === opt.id ? 'white' : T.sub }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={[S.container, { backgroundColor: T.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={56}>

      {/* ═══ 타이머 고정 영역: 기본 / 전체 / 미니 ═══ */}
      {nonLapActive.length > 0 && timerViewMode === 'mini' && !isLandscape && (
        <View style={[{ borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.card }, isTablet && { maxWidth: contentMaxW, width: '100%', alignSelf: 'center' }]}>
          {renderMiniTimer(nonLapActive[0])}
        </View>
      )}
      {nonLapActive.length > 0 && timerViewMode === 'full' && !isLandscape && (
        <View style={[{ flex: 1, backgroundColor: T.bg }, isTablet && { maxWidth: contentMaxW, width: '100%', alignSelf: 'center' }]}>
          {renderFullTimer(nonLapActive[0])}
        </View>
      )}
      {nonLapActive.length > 0 && timerViewMode === 'default' && !isLandscape && (
        <View style={[S.timerFixedArea, { borderBottomColor: T.border }, isTablet && { maxWidth: contentMaxW, width: '100%', alignSelf: 'center' }]}>
          {renderLargeTimer(nonLapActive[0])}
        </View>
      )}

      {(timerViewMode !== 'full' || isLandscape) && (isLandscape ? (
        /* ── iPad 가로모드: 2컬럼 ── */
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <ScrollView ref={mainScrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
            contentContainerStyle={[S.scrollCol, (lapTimer || lapDone) && { paddingBottom: lapExpanded ? 340 : 200 }]}>

        {/* 🔥모드 상태 배너 */}
        {app.focusMode === 'screen_on' && hasRunning && !screenLocked && (
          <View style={[S.ultraStatus, { backgroundColor: '#FF6B6B12', borderColor: '#FF6B6B40' }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF6B6B', flex: 1 }}>
              🔥 집중 도전 중 · {app.settings.ultraFocusLevel === 'exam' ? '🔴 울트라집중' : app.settings.ultraFocusLevel === 'focus' ? '🟡 집중' : '🟢 일반'} · {app.ultraFocus?.exitCount > 0 ? `이탈 ${app.ultraFocus.exitCount}회` : '이탈 0회 유지 중!'}
            </Text>
            <TouchableOpacity onPress={lockScreen} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FF6B6B20', marginRight: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 11 }}>🔒</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FF6B6B' }}> 잠금</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => app.allowPause?.()} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FF6B6B20' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FF6B6B' }}>⏸️ 잠깐</Text>
            </TouchableOpacity>
          </View>
        )}
        {app.focusMode === 'screen_off' && hasRunning && (
          <View style={[S.ultraStatus, { backgroundColor: '#4CAF5012', borderColor: '#4CAF5040' }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#4CAF50' }}>📖 편하게 공부 중 · 화면 꺼도 OK</Text>
          </View>
        )}

        {/* 잠깐 쉬기 활성화 중 */}
        {app.ultraFocus?.pauseAllowed && (
          <View style={[S.ultraStatus, { backgroundColor: '#FFB74D12', borderColor: '#FFB74D40' }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFB74D' }}>⏸️ 잠깐 쉬기 중 · 60초간 자유! 빠르게 다녀와~</Text>
          </View>
        )}

        {/* 경고 배너 */}
        {app.ultraFocus?.showWarning && (
          <View style={[S.ultraBanner, { backgroundColor: '#FF6B6B18', borderColor: '#FF6B6B60' }]}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={40} mood="sad" />
            <View style={{ flex: 1 }}>
              <Text style={[S.ultraBannerTitle, { color: '#FF6B6B' }]}>📱 이탈 감지!</Text>
              <Text style={[S.ultraBannerSub, { color: T.sub }]}>{app.ultraFocus.exitCount}번 이탈 · 선언 보너스 감소</Text>
            </View>
          </View>
        )}

        {/* 시험 모드 복귀 버튼 */}
        {hasPausedByUltra && !app.ultraFocus?.showChallenge && (
          <TouchableOpacity style={[S.ultraResumeBtn, { backgroundColor: T.accent }]} onPress={() => app.dismissChallenge?.()} activeOpacity={0.8}>
            <Text style={S.ultraResumeBtnT}>▶ 다시 집중 시작하기</Text>
          </TouchableOpacity>
        )}

        {/* 포기 상태 */}
        {app.ultraFocus?.gaveUp && (
          <View style={[S.ultraBanner, { backgroundColor: '#6B7B8D18', borderColor: '#6B7B8D60' }]}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={40} mood="sad" />
            <View style={{ flex: 1 }}>
              <Text style={[S.ultraBannerTitle, { color: '#6B7B8D' }]}>😴 오늘은 여기까지</Text>
              <Text style={[S.ultraBannerSub, { color: T.sub }]}>다음엔 더 잘할 수 있어!</Text>
            </View>
          </View>
        )}

        {/* 헤더 */}
        <View style={[S.header, isTablet && !isLandscape && S.tabletBlock]}>
          <View style={S.headerLeft}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={54} mood={ultraMood} tappable onCharChange={(id) => app.updateSettings({ mainCharacter: id })} />
            <View style={{ marginLeft: 8 }}><Text style={[S.title, { color: T.text }]}>열공메이트</Text>
              {(app.settings.streak > 0 || app.todaySessions?.length > 0) && (
                <Text style={[S.headerSub, { color: T.sub }]}>
                  {[
                    app.settings.streak > 0 ? `🔥 ${app.settings.streak}일 연속` : '',
                    app.todaySessions?.length > 0 ? `📚 오늘 ${app.todaySessions.length}세션` : '',
                  ].filter(Boolean).join('  ·  ')}
                </Text>
              )}
              {plannerRate !== null && (
                <Text style={{ fontSize: 12, color: T.accent, marginTop: 1, fontWeight: '600' }} numberOfLines={1}>
                  {getPlannerMessage(app.settings.mainCharacter, plannerRate)}
                </Text>
              )}
            </View></View>
          <TouchableOpacity style={[S.darkBtn, { borderColor: T.border, backgroundColor: T.card }]} onPress={() => app.updateSettings({ darkMode: !app.settings.darkMode })}><Text>{app.settings.darkMode ? '☀️' : '🌙'}</Text></TouchableOpacity>
        </View>

        {/* D-Day 배지 (1줄4개, 최대2줄8개, 규격 통일) */}
        {primaryDDs.length > 0 && (
          <View style={S.ddayGrid}>{primaryDDs.slice(0, 8).map(dd => {
            const dObj = new Date(dd.date + 'T00:00:00');
            const dayName = ['일','월','화','수','목','금','토'][dObj.getDay()];
            return (
            <TouchableOpacity key={dd.id} style={[S.ddayCell, { backgroundColor: T.accent + '15', borderColor: T.accent + '60' }]}
              onPress={() => Alert.alert(`📅 ${dd.label}`, `날짜: ${dd.date} (${dayName})\n${formatDDay(dd.date)}`, [
                { text: '확인' },
                { text: '설정에서 수정', onPress: () => navigation.navigate('Settings') },
              ])}>
              <Text style={[S.ddayCellLabel, { color: T.text }]} numberOfLines={1}>{dd.label}</Text>
              <Text style={[S.ddayCellVal, { color: T.accent }]}>{formatDDay(dd.date)}</Text></TouchableOpacity>);
          })}</View>
        )}

        {/* 진행률 */}
        <View style={[S.progCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={S.progRow}><Text style={[S.progLabel, { color: T.sub }]}>오늘</Text><Text style={[S.progVal, { color: T.accent }]}>{formatDuration(realToday)}</Text></View>
          <View style={[S.progTrack, { backgroundColor: T.surface2 }]}><View style={[S.progFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? T.gold : T.accent }]} /></View>
        </View>

        {/* ═══ 오늘의 계획 카드 ═══ */}
        {(() => {
          const ws = app.weeklySchedule;
          if (!ws || !ws.enabled) return null;
          const dayKey = app.getDayKey?.();
          const dayData = dayKey && ws[dayKey];
          if (!dayData || !dayData.plans || dayData.plans.length === 0) return null;
          const fixed = (dayData.fixed || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
          const plans = (dayData.plans || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
          const getPlanStatus = (plan) => {
            const completedSec = app.getPlanCompletedSec?.(plan.id) || 0;
            const targetSec = (plan.targetMin || 0) * 60;
            const activeTimer = app.timers.find(t => t.planId === plan.id && (t.status === 'running' || t.status === 'paused'));
            const currentSec = completedSec + (activeTimer ? activeTimer.elapsedSec : 0);
            const pct = targetSec > 0 ? Math.min(1, currentSec / targetSec) : 0;
            if (activeTimer) return { type: 'running', currentSec, targetSec, pct };
            if (pct >= 0.8) return { type: 'done', currentSec, targetSec, pct };
            if (completedSec > 0) return { type: 'partial', currentSec, targetSec, pct };
            return { type: 'idle', currentSec, targetSec, pct: 0 };
          };
          const totalTargetSec = plans.reduce((sum, p) => sum + (p.targetMin || 0) * 60, 0);
          const totalDoneSec = plans.reduce((sum, p) => {
            const completedSec = app.getPlanCompletedSec?.(p.id) || 0;
            const activeTimer = app.timers.find(t => t.planId === p.id && (t.status === 'running' || t.status === 'paused'));
            return sum + completedSec + (activeTimer ? activeTimer.elapsedSec : 0);
          }, 0);
          const overallPct = totalTargetSec > 0 ? Math.min(1, totalDoneSec / totalTargetSec) : 0;
          return (
            <View style={[S.planCard, { backgroundColor: T.card, borderColor: T.border }]}>
              <TouchableOpacity style={S.planCardHeader} onPress={() => setPlanCardCollapsed(c => !c)}>
                <Text style={[S.planCardTitle, { color: T.text }]}>📅 오늘의 계획</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity onPress={() => setShowScheduleEditor(true)} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
                    <Text style={[S.planEditBtn, { color: T.accent }]}>편집</Text>
                  </TouchableOpacity>
                  <Text style={{ color: T.sub, fontSize: 14 }}>{planCardCollapsed ? '▼' : '▲'}</Text>
                </View>
              </TouchableOpacity>
              {!planCardCollapsed && (
                <>
                  {fixed.map(item => {
                    const isCrossMidnight = item.start && item.end && item.start > item.end;
                    const isPast = !isCrossMidnight && item.end && item.end <= nowStr;
                    const pastStyle = isPast ? { textDecorationLine: 'line-through', opacity: 0.45 } : {};
                    return (
                      <View key={item.id} style={S.planFixedRow}>
                        <Text style={[S.planFixedIcon, isPast && { opacity: 0.45 }]}>{item.icon || '📌'}</Text>
                        <Text style={[S.planFixedLabel, { color: T.text + 'A0' }, pastStyle]}>{item.label}</Text>
                        <Text style={[S.planFixedTime, { color: T.sub }, pastStyle]}>{item.start}–{item.end}</Text>
                      </View>
                    );
                  })}
                  {fixed.length > 0 && plans.length > 0 && (
                    <View style={[S.planDivider, { backgroundColor: T.border }]} />
                  )}
                  {plans.map(plan => {
                    const status = getPlanStatus(plan);
                    return (
                      <View key={plan.id} style={S.planRow}>
                        <Text style={S.planRowIcon}>{plan.icon || '📖'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.planLabel, { color: T.text }]}>{plan.label}</Text>
                          {status.type !== 'idle' && status.pct < 1 && (
                            <View style={[S.planMiniTrack, { backgroundColor: T.surface2 }]}>
                              <View style={[S.planMiniFill, { width: `${Math.round(status.pct * 100)}%`, backgroundColor: status.type === 'partial' || status.type === 'done' ? T.sub : T.accent }]} />
                            </View>
                          )}
                        </View>
                        <Text style={[S.planTime, { color: T.sub }]}>
                          {status.type === 'idle'
                            ? `${plan.targetMin}분`
                            : status.type === 'done'
                            ? `✅ ${plan.targetMin}분`
                            : `${Math.floor(status.currentSec / 60)}분/${plan.targetMin}분`}
                        </Text>
                        <View style={S.planAction}>
                          {status.type === 'running' ? (
                            <Text style={{ fontSize: 15 }}>🔵</Text>
                          ) : status.pct >= 1 ? (
                            <Text style={{ fontSize: 16 }}>✅</Text>
                          ) : status.type === 'done' ? (
                            <TouchableOpacity style={[S.planPlayBtn, { backgroundColor: T.accent }]} onPress={() => app.startFromPlan?.(plan)}>
                              <Text style={S.planPlayBtnT}>▶+</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity style={[S.planPlayBtn, { backgroundColor: T.accent }]} onPress={() => app.startFromPlan?.(plan)}>
                              <Text style={S.planPlayBtnT}>{status.type === 'partial' ? '▶+' : '▶'}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
              <View style={S.planProgress}>
                <View style={[S.planProgTrack, { backgroundColor: T.surface2 }]}>
                  <View style={[S.planProgFill, { width: `${Math.round(overallPct * 100)}%`, backgroundColor: overallPct >= 1 ? T.gold || '#FFD700' : T.accent }]} />
                </View>
                <Text style={[S.planProgLabel, { color: T.sub }]}>{Math.round(overallPct * 100)}% 달성</Text>
              </View>
            </View>
          );
        })()}

        {/* 할 일 */}
        {(() => {
          const priorityOrder = { high: 0, normal: 1, low: 2 };
          const sortTodos = (list) => [...list].sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
          });

          // scope 필터 적용
          const visibleTodos = app.todos.filter(t => !t.isTemplate && (() => {
            if (todoScopeFilter === 'today') return t.scope === 'today' || t.scope == null;
            if (todoScopeFilter === 'week') return t.scope === 'week';
            if (todoScopeFilter === 'exam') return t.scope === 'exam';
            if (todoScopeFilter === 'all') return true;
            return true;
          })());

          // 과목별 그룹핑
          const groupMap = {};
          const groupOrder = [];
          visibleTodos.forEach(t => {
            const key = t.subjectId || '__none__';
            if (!groupMap[key]) {
              groupMap[key] = { key, label: t.subjectLabel || (t.subjectId ? '알 수 없음' : '미분류'), color: t.subjectColor || T.sub, todos: [] };
              groupOrder.push(key);
            }
            groupMap[key].todos.push(t);
          });
          // 미완료 많은 순 정렬 (미분류는 마지막)
          groupOrder.sort((a, b) => {
            if (a === '__none__') return 1;
            if (b === '__none__') return -1;
            return groupMap[b].todos.filter(t => !t.done).length - groupMap[a].todos.filter(t => !t.done).length;
          });

          const renderTodoRow = (t) => {
            const isExpanded = expandedTodo === t.id;
            const timeStr = t.completedAt
              ? new Date(t.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
              : null;
            return (
              <TouchableOpacity key={t.id} style={[S.todoItem, { alignItems: 'flex-start' }]} activeOpacity={0.7}
                onPress={() => setExpandedTodo(isExpanded ? null : t.id)}
                onLongPress={() => openEditTodo(t)}>
                {/* 우선순위 인디케이터 */}
                {t.priority === 'high' && !t.done && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E17055', marginTop: 6, marginRight: 4 }} />
                )}
                {t.priority !== 'high' && <View style={{ width: 6, marginRight: 4 }} />}
                {/* 체크박스 */}
                <TouchableOpacity onPress={() => {
                  const wasDone = t.done;
                  app.toggleTodo(t.id);
                  Vibration.vibrate([0, 30]);
                  // 올클리어 체크: 완료로 바꿀 때만
                  if (!wasDone) {
                    const todayList = app.todos.filter(x => !x.isTemplate && (x.scope === 'today' || x.scope == null));
                    const nowDone = todayList.filter(x => x.id === t.id ? true : x.done).length;
                    if (nowDone === todayList.length && todayList.length > 0) {
                      app.showToastCustom('🎉 오늘 할 일 올클리어!', app.settings.mainCharacter || 'toru');
                    }
                  }
                }}
                  style={[S.todoCk, { borderColor: t.done ? T.accent : T.border, backgroundColor: t.done ? T.accent : 'transparent', marginTop: 1 }]}>
                  {t.done && <Text style={S.todoCkM}>✓</Text>}
                </TouchableOpacity>
                {/* 텍스트 + 메타 */}
                <View style={{ flex: 1 }}>
                  <Text style={[S.todoText, { color: t.done ? T.sub : T.text }, t.done && { textDecorationLine: 'line-through' }]}
                    numberOfLines={isExpanded ? 0 : 2}>{t.text}</Text>
                  {/* 메타 행: scope 뱃지 + 메모 + 완료 시각 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    {(() => {
                      const scopeInfo = t.scope === 'week' ? { label: '이번주', color: '#27AE60' }
                        : t.scope === 'exam' ? { label: '시험대비', color: '#E17055' }
                        : { label: '오늘', color: T.accent };
                      return (
                        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: scopeInfo.color + '18' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: scopeInfo.color }}>{scopeInfo.label}</Text>
                        </View>
                      );
                    })()}
                    {t.memo && <Text style={{ fontSize: 12, color: T.sub }}>📎</Text>}
                    {t.done && timeStr && <Text style={{ fontSize: 11, color: T.sub }}>{timeStr}</Text>}
                  </View>
                  {t.memo && isExpanded && (
                    <View style={{ marginTop: 4, padding: 6, backgroundColor: T.surface2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 12, color: T.sub }}>📎 {t.memo}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => Alert.alert('할 일 삭제', '이 항목을 삭제할까요?', [
                  { text: '취소', style: 'cancel' },
                  { text: '삭제', style: 'destructive', onPress: () => app.removeTodo(t.id) },
                ])} style={S.todoDelBtn}>
                  <Text style={{ fontSize: 16, color: T.sub }}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          };

          // 오늘 완료 카운트 (캐릭터 메시지용)
          const todayTodos = app.todos.filter(t => !t.isTemplate && (t.scope === 'today' || t.scope == null));
          const doneCount = todayTodos.filter(t => t.done).length;
          const allDone = doneCount > 0 && doneCount === todayTodos.length;

          return (
            <View style={[S.todoCard, { backgroundColor: T.card, borderColor: T.border }, isTablet && !isLandscape && S.tabletBlock]}>
              {/* 헤더 */}
              <View style={S.todoH}>
                <Text style={[S.todoTitle, { color: T.text }]}>✅ 해야 할 일</Text>
                <Text style={[S.todoCnt, { color: T.sub }]}>{doneCount}/{todayTodos.length}</Text>
                <Text style={{ fontSize: 11, color: T.border, marginLeft: 4 }}>탭:펼치기 · 꾹:수정</Text>
              </View>
              {/* scope 필터 탭 */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                {[{ id: 'today', label: '오늘' }, { id: 'week', label: '이번주' }, { id: 'exam', label: '시험대비' }, { id: 'all', label: '전체' }].map(opt => {
                  const sel = todoScopeFilter === opt.id;
                  const cnt = app.todos.filter(t => !t.isTemplate && (
                    opt.id === 'today' ? (t.scope === 'today' || t.scope == null) : t.scope === opt.id
                  )).length;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => setTodoScopeFilter(opt.id)}
                      style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: sel ? T.accent + '20' : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                      <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? T.accent : T.sub }}>
                        {opt.label}{cnt > 0 ? ` ${cnt}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* 빠른 추가 인라인 입력 */}
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput
                    ref={inlineInputRef}
                    value={addTodoText} onChangeText={setAddTodoText}
                    placeholder="할 일 입력..." placeholderTextColor={T.sub}
                    style={[S.todoInput, { flex: 1, borderColor: T.accent, backgroundColor: T.surface, color: T.text, marginBottom: 0 }]}
                    onSubmitEditing={submitInlineTodo} returnKeyType="done"
                    onFocus={() => { inlineFocusedRef.current = true; }}
                    onBlur={() => { inlineFocusedRef.current = false; }}
                  />
                  <TouchableOpacity onPress={submitInlineTodo}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: T.accent }}>
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>추가</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowAddTodoModal(true)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                    <Text style={{ fontSize: 14 }}>📋</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* D-Day 임박 경고 (시험 7일 이내) */}
              {(() => {
                const urgentDdays = (app.ddays || []).filter(d => {
                  if (!d.date) return false;
                  const days = calcDDay(d.date);
                  if (days === null || days < 0 || days > 7) return false;
                  return app.todos.some(t => !t.isTemplate && t.scope === 'exam' && t.ddayId === d.id && !t.done);
                });
                if (urgentDdays.length === 0 || todoScopeFilter === 'exam') return null;
                return urgentDdays.map(d => {
                  const days = calcDDay(d.date);
                  const remaining = app.todos.filter(t => !t.isTemplate && t.scope === 'exam' && t.ddayId === d.id && !t.done).length;
                  const dStr = days === 0 ? 'D-Day' : `D-${days}`;
                  return (
                    <TouchableOpacity key={d.id} onPress={() => setTodoScopeFilter('exam')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E17055' + '15', borderWidth: 1, borderColor: '#E17055' + '60', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 8 }}>
                      <Text style={{ fontSize: 14 }}>🎯</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#E17055', flex: 1 }}>
                        {d.label} {dStr} · 할 일 {remaining}개 남음
                      </Text>
                      <Text style={{ fontSize: 12, color: '#E17055' }}>보기 ›</Text>
                    </TouchableOpacity>
                  );
                });
              })()}
              {/* 할일 목록 */}
              {todoScopeFilter === 'exam' ? (() => {
                const examTodos = app.todos.filter(t => !t.isTemplate && t.scope === 'exam');
                if (examTodos.length === 0) return (
                  <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', paddingVertical: 12 }}>
                    시험 체크리스트가 없어요!{'\n'}기한을 "시험"으로 설정해 추가해보세요
                  </Text>
                );
                // D-Day별 그룹핑
                const ddayMap = {};
                const ddayOrder = [];
                examTodos.forEach(t => {
                  const key = t.ddayId || '__none__';
                  if (!ddayMap[key]) { ddayMap[key] = { key, todos: [] }; ddayOrder.push(key); }
                  ddayMap[key].todos.push(t);
                });
                // 정렬: 가까운 D-Day 먼저, 지난 시험 마지막, 미분류 마지막
                ddayOrder.sort((a, b) => {
                  if (a === '__none__') return 1;
                  if (b === '__none__') return -1;
                  const da = (app.ddays || []).find(d => d.id === a);
                  const db = (app.ddays || []).find(d => d.id === b);
                  const daysA = da?.date ? (calcDDay(da.date) ?? 9999) : 9999;
                  const daysB = db?.date ? (calcDDay(db.date) ?? 9999) : 9999;
                  if (daysA < 0 && daysB >= 0) return 1;
                  if (daysA >= 0 && daysB < 0) return -1;
                  return daysA - daysB;
                });
                const activeKeys = ddayOrder.filter(k => {
                  if (k === '__none__') return true;
                  const dd = (app.ddays || []).find(d => d.id === k);
                  return !dd?.date || (calcDDay(dd.date) ?? 0) >= 0;
                });
                const pastKeys = ddayOrder.filter(k => {
                  if (k === '__none__') return false;
                  const dd = (app.ddays || []).find(d => d.id === k);
                  return dd?.date && (calcDDay(dd.date) ?? 0) < 0;
                });
                return (
                  <>
                    {activeKeys.map(key => {
                      const group = ddayMap[key];
                      const dd = (app.ddays || []).find(d => d.id === key);
                      const days = dd?.date ? calcDDay(dd.date) : null;
                      const dStr = days === null ? '' : days === 0 ? ' D-Day' : days > 0 ? ` D-${days}` : ` D+${Math.abs(days)}`;
                      const sorted = sortTodos(group.todos);
                      const doneCnt = group.todos.filter(t => t.done).length;
                      const pct = group.todos.length > 0 ? doneCnt / group.todos.length : 0;
                      return (
                        <View key={key} style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: T.text, flex: 1 }}>
                              {key === '__none__' ? '📋 기타 시험 항목' : `🎯 ${dd?.label || '시험'}${dStr}`}
                            </Text>
                            <Text style={{ fontSize: 12, color: T.sub }}>{doneCnt}/{group.todos.length}</Text>
                          </View>
                          <View style={{ height: 4, backgroundColor: T.surface2, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
                            <View style={{ height: 4, borderRadius: 2, backgroundColor: pct >= 1 ? '#27AE60' : T.accent, width: `${Math.round(pct * 100)}%` }} />
                          </View>
                          {sorted.map(renderTodoRow)}
                        </View>
                      );
                    })}
                    {pastKeys.length > 0 && (
                      <View style={{ marginTop: 4, opacity: 0.65 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 8 }}>📁 완료된 시험</Text>
                        {pastKeys.map(key => {
                          const group = ddayMap[key];
                          const dd = (app.ddays || []).find(d => d.id === key);
                          const days = dd?.date ? calcDDay(dd.date) : null;
                          const doneCnt = group.todos.filter(t => t.done).length;
                          const pct = group.todos.length > 0 ? Math.round((doneCnt / group.todos.length) * 100) : 0;
                          return (
                            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                              <Text style={{ fontSize: 13, color: T.sub, flex: 1 }}>
                                📁 {dd?.label || '시험'}{days !== null ? ` D+${Math.abs(days)}` : ''}
                              </Text>
                              <Text style={{ fontSize: 12, color: T.sub }}>{doneCnt}/{group.todos.length} ({pct}%)</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                );
              })() : (
                visibleTodos.length === 0 ? (
                  <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', paddingVertical: 12 }}>
                    {todoScopeFilter === 'today' ? '오늘 할 일이 없어요!' : todoScopeFilter === 'week' ? '이번주 할 일이 없어요!' : todoScopeFilter === 'exam' ? '시험대비 할 일이 없어요!' : '할 일이 없어요!'}
                  </Text>
                ) : (
                  groupOrder.map(key => {
                    const group = groupMap[key];
                    const sorted = sortTodos(group.todos);
                    const groupDone = group.todos.filter(t => t.done).length;
                    return (
                      <View key={key} style={{ marginBottom: 8 }}>
                        {(groupOrder.length > 1 || key !== '__none__') && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingHorizontal: 2 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: group.color }} />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: group.color, flex: 1 }}>{group.label}</Text>
                            <Text style={{ fontSize: 12, color: T.sub }}>{groupDone}/{group.todos.length}</Text>
                          </View>
                        )}
                        {sorted.map(renderTodoRow)}
                      </View>
                    );
                  })
                )
              )}
              {/* 하단 완료 + 캐릭터 메시지 */}
              {todayTodos.length > 0 && (
                <View style={{ paddingTop: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border, marginTop: 4 }}>
                  {doneCount > 0 && (
                    <Text style={{ fontSize: 13, fontWeight: '800', color: T.accent, marginBottom: 3 }}>
                      ✅ 오늘 완료 {doneCount}개{allDone ? ' 🎉' : ''}
                    </Text>
                  )}
                  <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center' }}>
                    {getTodoMessage(doneCount, allDone, app.settings.mainCharacter)}
                  </Text>
                </View>
              )}
              {/* 반복 템플릿 목록 */}
              {(() => {
                const templates = app.todos.filter(t => t.isTemplate && t.repeatDays && t.repeatDays.length > 0);
                if (templates.length === 0) return null;
                const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
                const dayOrder = [1,2,3,4,5,6,0]; // 월~토, 일 순 (토·일 표시용)
                return (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 6 }}>🔁 반복 할 일 템플릿</Text>
                    {templates.map(t => (
                      <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {t.subjectColor && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.subjectColor }} />}
                        <Text style={{ fontSize: 13, color: T.sub, flex: 1 }} numberOfLines={1}>{t.text}</Text>
                        <Text style={{ fontSize: 11, color: T.sub }}>
                          {t.repeatDays.length === 7 ? '매일' : t.repeatDays.length === 5 && !t.repeatDays.includes(0) && !t.repeatDays.includes(6) ? '주중' : [...t.repeatDays].sort((a,b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)).map(d => dayLabels[d]).join('·')}
                        </Text>
                        <TouchableOpacity onPress={() => {
                          Alert.alert(
                            '반복 할일 삭제',
                            `"${t.text}" 반복을 삭제할까요?\n오늘 생성된 항목도 함께 삭제됩니다.`,
                            [
                              { text: '취소', style: 'cancel' },
                              { text: '삭제', style: 'destructive', onPress: () => {
                                app.todos.filter(x => x.templateId === t.id).forEach(x => app.removeTodo(x.id));
                                app.removeTodo(t.id);
                              }},
                            ]
                          );
                        }} style={{ padding: 2 }}>
                          <Text style={{ fontSize: 14, color: T.sub }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </View>
          );
        })()}
          </ScrollView>
          <View style={{ width: 1, backgroundColor: T.border }} />
          {/* 오른쪽 컬럼: full 모드는 타이머만, 나머지는 ScrollView */}
          {nonLapActive.length > 0 && timerViewMode === 'full' ? (
            <View style={{ flex: 1, backgroundColor: T.bg }}>
              {renderFullTimer(nonLapActive[0])}
            </View>
          ) : (
          <View style={{ flex: 1 }}>
        {/* 가로모드: 미니/기본 타이머 상단 고정 */}
        {nonLapActive.length > 0 && timerViewMode === 'mini' && (
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: T.border, backgroundColor: T.card }}>
            {renderMiniTimer(nonLapActive[0])}
          </View>
        )}
        {nonLapActive.length > 0 && timerViewMode === 'default' && (
          <View>
            {renderLargeTimer(nonLapActive[0])}
          </View>
        )}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={S.scrollCol}>

        {/* ═══ 즐겨찾기 (탭 전환형) ═══ */}
        <View style={[S.quickSec, { backgroundColor: T.card, borderColor: T.border }, isTablet && !isLandscape && S.tabletBlock]}>
          {/* 헤더: 탭 전환 + 편집 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
            <TouchableOpacity
              onPress={() => setFavTab('countdown')}
              style={[S.favTabBtn, { backgroundColor: favTab === 'countdown' ? T.accent : T.surface2, borderColor: favTab === 'countdown' ? T.accent : T.border }]}>
              <Text style={[S.favTabBtnT, { color: favTab === 'countdown' ? 'white' : T.sub }]}>⏰ 카운트다운</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFavTab('countup')}
              style={[S.favTabBtn, { backgroundColor: favTab === 'countup' ? T.accent : T.surface2, borderColor: favTab === 'countup' ? T.accent : T.border }]}>
              <Text style={[S.favTabBtnT, { color: favTab === 'countup' ? 'white' : T.sub }]}>⏱ 카운트업</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginLeft: 'auto' }}
              onPress={() => favTab === 'countdown' ? setShowFavMgr(true) : setShowCountupFavMgr(true)}>
              <Text style={[S.quickEdit, { color: T.accent }]}>편집</Text>
            </TouchableOpacity>
          </View>
          {/* 즐겨찾기 2행 (3칸 × 2) */}
          {favTab === 'countdown' ? (
            <>
              {[0, 1].map(row => (
                <View key={row} style={S.favGrid}>
                  {[0, 1, 2].map(col => {
                    const i = row * 3 + col;
                    const fav = favs[i];
                    if (fav) return (
                      <TouchableOpacity key={fav.id} style={[S.favCell, { backgroundColor: fav.color + '12', borderColor: fav.color + '50' }]} onPress={() => runFav(fav)}
                        onLongPress={() => Alert.alert('삭제', `${fav.label} 삭제?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => removeFav(fav.id) }])}>
                        <Text style={S.favCellIcon}>{fav.icon}</Text>
                        <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text>
                      </TouchableOpacity>
                    );
                    return (
                      <TouchableOpacity key={`ecd${i}`} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]} onPress={() => setShowFavMgr(true)}>
                        <Text style={S.favCellIcon}>+</Text>
                        <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </>
          ) : (
            <>
              {[0, 1].map(row => (
                <View key={row} style={S.favGrid}>
                  {[0, 1, 2].map(col => {
                    const i = row * 3 + col;
                    const fav = countupFavs[i];
                    if (fav) return (
                      <TouchableOpacity key={fav.id} style={[S.favCell, { backgroundColor: fav.color + '12', borderColor: fav.color + '50' }]} onPress={() => runCountupFav(fav)}
                        onLongPress={() => Alert.alert('삭제', `${fav.label}을(를) 즐겨찾기에서 삭제할까요?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => app.removeCountupFav(fav.id) }])}>
                        <Text style={S.favCellIcon}>{fav.icon}</Text>
                        <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text>
                      </TouchableOpacity>
                    );
                    return (
                      <TouchableOpacity key={`ecu${i}`} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]} onPress={() => setShowCountupFavMgr(true)}>
                        <Text style={S.favCellIcon}>+</Text>
                        <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </>
          )}
        </View>


        {/* 노이즈 */}
        <View style={[S.noiseCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: app.settings.soundId !== 'none' ? 6 : 0 }}>
              <Text style={[S.secTitle, { color: T.sub }]}>🎵 집중 사운드(백색소음)</Text>
              <TouchableOpacity
                style={[S.nb, { flex: 0, paddingHorizontal: 7, paddingVertical: 3, borderColor: app.settings.soundId === 'none' ? T.accent : T.border, backgroundColor: app.settings.soundId === 'none' ? T.accent : T.card }]}
                onPress={() => app.updateSettings({ soundId: 'none' })}>
                <Text style={[S.nbT, { color: app.settings.soundId === 'none' ? 'white' : T.text }]}>🔇 끄기</Text>
              </TouchableOpacity>
            </View>
            {app.settings.soundId !== 'none' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  onPress={() => app.updateSettings({ soundVolume: Math.max(10, (app.settings.soundVolume ?? 70) - 10) })}
                  style={{ padding: 4 }}>
                  <Text style={{ fontSize: 14 }}>🔈</Text>
                </TouchableOpacity>
                <View style={[S.volTrack, { backgroundColor: T.surface2 }]}>
                  {[10,20,30,40,50,60,70,80,90,100].map(v => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => app.updateSettings({ soundVolume: v })}
                      style={[S.volDot, { backgroundColor: v <= (app.settings.soundVolume ?? 70) ? T.accent : T.border }]}
                    />
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => app.updateSettings({ soundVolume: Math.min(100, (app.settings.soundVolume ?? 70) + 10) })}
                  style={{ padding: 4 }}>
                  <Text style={{ fontSize: 14 }}>🔊</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={S.noiseRow}>
            {[{ id: 'rain', e: '🌧️', t: '빗소리' }, { id: 'cafe', e: '☕', t: '카페' }, { id: 'fire', e: '🔥', t: '모닥불' }, { id: 'wave', e: '🌊', t: '파도' }, { id: 'forest', e: '🌲', t: '숲속' }].map(s => (
              <TouchableOpacity key={s.id} style={[S.nb, { borderColor: app.settings.soundId === s.id ? T.accent : T.border, backgroundColor: app.settings.soundId === s.id ? T.accent : T.card }]} onPress={() => app.updateSettings({ soundId: s.id })}>
                <Text style={{ fontSize: 14 }}>{s.e}</Text>
                <Text style={[S.nbT, { color: app.settings.soundId === s.id ? 'white' : T.text, marginTop: 1 }]} numberOfLines={1}>{s.t}</Text>
              </TouchableOpacity>
            ))}
          </View></View>

        {/* 타임어택 / 커스텀 */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 }}>
          <TouchableOpacity style={[S.favCell, { flex: 1, backgroundColor: '#6C5CE710', borderColor: '#6C5CE7' }]} onPress={startLapTimer}>
            <Text style={S.favCellIcon}>⏱️</Text>
            <Text style={[S.favCellLabel, { color: '#6C5CE7', fontSize: 11, lineHeight: 11 }]}>타임어택{'\n'}스톱워치</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.favCell, { flex: 1, backgroundColor: T.accent, borderColor: T.accent }]} onPress={() => { setShowAdd(true); setAddType('countdown'); setSeqItems([]); setSeqName(''); }}>
            <Text style={S.favCellIcon}>⚙️</Text>
            <Text style={[S.favCellLabel, { color: 'white' }]}>커스텀 타이머</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 30 }} />
          </ScrollView>
          </View>
          )}
        </View>
      ) : (
        /* ── 세로/폰: 기존 단일 컬럼 ── */
        <ScrollView ref={mainScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
          contentContainerStyle={[S.scroll, (lapTimer || lapDone) && { paddingBottom: lapExpanded ? 340 : 200 }]}>
          <View style={isTablet ? { maxWidth: contentMaxW, width: '100%', alignSelf: 'center' } : null}>


        {/* 🔥모드 상태 배너 */}
        {app.focusMode === 'screen_on' && hasRunning && !screenLocked && (
          <View style={[S.ultraStatus, { backgroundColor: '#FF6B6B12', borderColor: '#FF6B6B40' }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF6B6B', flex: 1 }}>
              🔥 집중 도전 중 · {app.settings.ultraFocusLevel === 'exam' ? '🔴 울트라집중' : app.settings.ultraFocusLevel === 'focus' ? '🟡 집중' : '🟢 일반'} · {app.ultraFocus?.exitCount > 0 ? `이탈 ${app.ultraFocus.exitCount}회` : '이탈 0회 유지 중!'}
            </Text>
            <TouchableOpacity onPress={lockScreen} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FF6B6B20', marginRight: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 11 }}>🔒</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FF6B6B' }}> 잠금</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => app.allowPause?.()} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FF6B6B20' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FF6B6B' }}>⏸️ 잠깐</Text>
            </TouchableOpacity>
          </View>
        )}
        {app.focusMode === 'screen_off' && hasRunning && (
          <View style={[S.ultraStatus, { backgroundColor: '#4CAF5012', borderColor: '#4CAF5040' }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#4CAF50' }}>📖 편하게 공부 중 · 화면 꺼도 OK</Text>
          </View>
        )}

        {/* 잠깐 쉬기 활성화 중 */}
        {app.ultraFocus?.pauseAllowed && (
          <View style={[S.ultraStatus, { backgroundColor: '#FFB74D12', borderColor: '#FFB74D40' }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFB74D' }}>⏸️ 잠깐 쉬기 중 · 60초간 자유! 빠르게 다녀와~</Text>
          </View>
        )}

        {/* 경고 배너 */}
        {app.ultraFocus?.showWarning && (
          <View style={[S.ultraBanner, { backgroundColor: '#FF6B6B18', borderColor: '#FF6B6B60' }]}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={40} mood="sad" />
            <View style={{ flex: 1 }}>
              <Text style={[S.ultraBannerTitle, { color: '#FF6B6B' }]}>📱 이탈 감지!</Text>
              <Text style={[S.ultraBannerSub, { color: T.sub }]}>{app.ultraFocus.exitCount}번 이탈 · 선언 보너스 감소</Text>
            </View>
          </View>
        )}

        {/* 시험 모드 복귀 버튼 */}
        {hasPausedByUltra && !app.ultraFocus?.showChallenge && (
          <TouchableOpacity style={[S.ultraResumeBtn, { backgroundColor: T.accent }]} onPress={() => app.dismissChallenge?.()} activeOpacity={0.8}>
            <Text style={S.ultraResumeBtnT}>▶ 다시 집중 시작하기</Text>
          </TouchableOpacity>
        )}

        {/* 포기 상태 */}
        {app.ultraFocus?.gaveUp && (
          <View style={[S.ultraBanner, { backgroundColor: '#6B7B8D18', borderColor: '#6B7B8D60' }]}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={40} mood="sad" />
            <View style={{ flex: 1 }}>
              <Text style={[S.ultraBannerTitle, { color: '#6B7B8D' }]}>😴 오늘은 여기까지</Text>
              <Text style={[S.ultraBannerSub, { color: T.sub }]}>다음엔 더 잘할 수 있어!</Text>
            </View>
          </View>
        )}

        {/* 헤더 */}
        <View style={[S.header, isTablet && !isLandscape && S.tabletBlock]}>
          <View style={S.headerLeft}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={54} mood={ultraMood} tappable onCharChange={(id) => app.updateSettings({ mainCharacter: id })} />
            <View style={{ marginLeft: 8 }}><Text style={[S.title, { color: T.text }]}>열공메이트</Text>
              {(app.settings.streak > 0 || app.todaySessions?.length > 0) && (
                <Text style={[S.headerSub, { color: T.sub }]}>
                  {[
                    app.settings.streak > 0 ? `🔥 ${app.settings.streak}일 연속` : '',
                    app.todaySessions?.length > 0 ? `📚 오늘 ${app.todaySessions.length}세션` : '',
                  ].filter(Boolean).join('  ·  ')}
                </Text>
              )}
              {plannerRate !== null && (
                <Text style={{ fontSize: 12, color: T.accent, marginTop: 1, fontWeight: '600' }} numberOfLines={1}>
                  {getPlannerMessage(app.settings.mainCharacter, plannerRate)}
                </Text>
              )}
            </View></View>
          <TouchableOpacity style={[S.darkBtn, { borderColor: T.border, backgroundColor: T.card }]} onPress={() => app.updateSettings({ darkMode: !app.settings.darkMode })}><Text>{app.settings.darkMode ? '☀️' : '🌙'}</Text></TouchableOpacity>
        </View>

        {/* D-Day 배지 (1줄4개, 최대2줄8개, 규격 통일) */}
        {primaryDDs.length > 0 && (
          <View style={S.ddayGrid}>{primaryDDs.slice(0, 8).map(dd => {
            const dObj = new Date(dd.date + 'T00:00:00');
            const dayName = ['일','월','화','수','목','금','토'][dObj.getDay()];
            return (
            <TouchableOpacity key={dd.id} style={[S.ddayCell, { backgroundColor: T.accent + '15', borderColor: T.accent + '60' }]}
              onPress={() => Alert.alert(`📅 ${dd.label}`, `날짜: ${dd.date} (${dayName})\n${formatDDay(dd.date)}`, [
                { text: '확인' },
                { text: '설정에서 수정', onPress: () => navigation.navigate('Settings') },
              ])}>
              <Text style={[S.ddayCellLabel, { color: T.text }]} numberOfLines={1}>{dd.label}</Text>
              <Text style={[S.ddayCellVal, { color: T.accent }]}>{formatDDay(dd.date)}</Text></TouchableOpacity>);
          })}</View>
        )}

        {/* 진행률 */}
        <View style={[S.progCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={S.progRow}><Text style={[S.progLabel, { color: T.sub }]}>오늘</Text><Text style={[S.progVal, { color: T.accent }]}>{formatDuration(realToday)}</Text></View>
          <View style={[S.progTrack, { backgroundColor: T.surface2 }]}><View style={[S.progFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? T.gold : T.accent }]} /></View>
        </View>

        {/* ═══ 오늘의 계획 카드 ═══ */}
        {(() => {
          const ws = app.weeklySchedule;
          if (!ws || !ws.enabled) return null;
          const dayKey = app.getDayKey?.();
          const dayData = dayKey && ws[dayKey];
          if (!dayData || !dayData.plans || dayData.plans.length === 0) return null;
          const fixed = (dayData.fixed || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
          const plans = (dayData.plans || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
          const getPlanStatus = (plan) => {
            const completedSec = app.getPlanCompletedSec?.(plan.id) || 0;
            const targetSec = (plan.targetMin || 0) * 60;
            const activeTimer = app.timers.find(t => t.planId === plan.id && (t.status === 'running' || t.status === 'paused'));
            const currentSec = completedSec + (activeTimer ? activeTimer.elapsedSec : 0);
            const pct = targetSec > 0 ? Math.min(1, currentSec / targetSec) : 0;
            if (activeTimer) return { type: 'running', currentSec, targetSec, pct };
            if (pct >= 0.8) return { type: 'done', currentSec, targetSec, pct };
            if (completedSec > 0) return { type: 'partial', currentSec, targetSec, pct };
            return { type: 'idle', currentSec, targetSec, pct: 0 };
          };
          const totalTargetSec = plans.reduce((sum, p) => sum + (p.targetMin || 0) * 60, 0);
          const totalDoneSec = plans.reduce((sum, p) => {
            const completedSec = app.getPlanCompletedSec?.(p.id) || 0;
            const activeTimer = app.timers.find(t => t.planId === p.id && (t.status === 'running' || t.status === 'paused'));
            return sum + completedSec + (activeTimer ? activeTimer.elapsedSec : 0);
          }, 0);
          const overallPct = totalTargetSec > 0 ? Math.min(1, totalDoneSec / totalTargetSec) : 0;
          return (
            <View style={[S.planCard, { backgroundColor: T.card, borderColor: T.border }]}>
              <TouchableOpacity style={S.planCardHeader} onPress={() => setPlanCardCollapsed(c => !c)}>
                <Text style={[S.planCardTitle, { color: T.text }]}>📅 오늘의 계획</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity onPress={() => setShowScheduleEditor(true)} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
                    <Text style={[S.planEditBtn, { color: T.accent }]}>편집</Text>
                  </TouchableOpacity>
                  <Text style={{ color: T.sub, fontSize: 14 }}>{planCardCollapsed ? '▼' : '▲'}</Text>
                </View>
              </TouchableOpacity>
              {!planCardCollapsed && (
                <>
                  {fixed.map(item => {
                    const isCrossMidnight = item.start && item.end && item.start > item.end;
                    const isPast = !isCrossMidnight && item.end && item.end <= nowStr;
                    const pastStyle = isPast ? { textDecorationLine: 'line-through', opacity: 0.45 } : {};
                    return (
                      <View key={item.id} style={S.planFixedRow}>
                        <Text style={[S.planFixedIcon, isPast && { opacity: 0.45 }]}>{item.icon || '📌'}</Text>
                        <Text style={[S.planFixedLabel, { color: T.text + 'A0' }, pastStyle]}>{item.label}</Text>
                        <Text style={[S.planFixedTime, { color: T.sub }, pastStyle]}>{item.start}–{item.end}</Text>
                      </View>
                    );
                  })}
                  {fixed.length > 0 && plans.length > 0 && (
                    <View style={[S.planDivider, { backgroundColor: T.border }]} />
                  )}
                  {plans.map(plan => {
                    const status = getPlanStatus(plan);
                    return (
                      <View key={plan.id} style={S.planRow}>
                        <Text style={S.planRowIcon}>{plan.icon || '📖'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.planLabel, { color: T.text }]}>{plan.label}</Text>
                          {status.type !== 'idle' && status.pct < 1 && (
                            <View style={[S.planMiniTrack, { backgroundColor: T.surface2 }]}>
                              <View style={[S.planMiniFill, { width: `${Math.round(status.pct * 100)}%`, backgroundColor: status.type === 'partial' || status.type === 'done' ? T.sub : T.accent }]} />
                            </View>
                          )}
                        </View>
                        <Text style={[S.planTime, { color: T.sub }]}>
                          {status.type === 'idle'
                            ? `${plan.targetMin}분`
                            : status.type === 'done'
                            ? `✅ ${plan.targetMin}분`
                            : `${Math.floor(status.currentSec / 60)}분/${plan.targetMin}분`}
                        </Text>
                        <View style={S.planAction}>
                          {status.type === 'running' ? (
                            <Text style={{ fontSize: 15 }}>🔵</Text>
                          ) : status.pct >= 1 ? (
                            <Text style={{ fontSize: 16 }}>✅</Text>
                          ) : status.type === 'done' ? (
                            <TouchableOpacity style={[S.planPlayBtn, { backgroundColor: T.accent }]} onPress={() => app.startFromPlan?.(plan)}>
                              <Text style={S.planPlayBtnT}>▶+</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity style={[S.planPlayBtn, { backgroundColor: T.accent }]} onPress={() => app.startFromPlan?.(plan)}>
                              <Text style={S.planPlayBtnT}>{status.type === 'partial' ? '▶+' : '▶'}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
              <View style={S.planProgress}>
                <View style={[S.planProgTrack, { backgroundColor: T.surface2 }]}>
                  <View style={[S.planProgFill, { width: `${Math.round(overallPct * 100)}%`, backgroundColor: overallPct >= 1 ? T.gold || '#FFD700' : T.accent }]} />
                </View>
                <Text style={[S.planProgLabel, { color: T.sub }]}>{Math.round(overallPct * 100)}% 달성</Text>
              </View>
            </View>
          );
        })()}

        {/* 할 일 */}
        {(() => {
          const priorityOrder = { high: 0, normal: 1, low: 2 };
          const sortTodos = (list) => [...list].sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
          });

          // scope 필터 적용
          const visibleTodos = app.todos.filter(t => !t.isTemplate && (() => {
            if (todoScopeFilter === 'today') return t.scope === 'today' || t.scope == null;
            if (todoScopeFilter === 'week') return t.scope === 'week';
            if (todoScopeFilter === 'exam') return t.scope === 'exam';
            if (todoScopeFilter === 'all') return true;
            return true;
          })());

          // 과목별 그룹핑
          const groupMap = {};
          const groupOrder = [];
          visibleTodos.forEach(t => {
            const key = t.subjectId || '__none__';
            if (!groupMap[key]) {
              groupMap[key] = { key, label: t.subjectLabel || (t.subjectId ? '알 수 없음' : '미분류'), color: t.subjectColor || T.sub, todos: [] };
              groupOrder.push(key);
            }
            groupMap[key].todos.push(t);
          });
          // 미완료 많은 순 정렬 (미분류는 마지막)
          groupOrder.sort((a, b) => {
            if (a === '__none__') return 1;
            if (b === '__none__') return -1;
            return groupMap[b].todos.filter(t => !t.done).length - groupMap[a].todos.filter(t => !t.done).length;
          });

          const renderTodoRow = (t) => {
            const isExpanded = expandedTodo === t.id;
            const timeStr = t.completedAt
              ? new Date(t.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
              : null;
            return (
              <TouchableOpacity key={t.id} style={[S.todoItem, { alignItems: 'flex-start' }]} activeOpacity={0.7}
                onPress={() => setExpandedTodo(isExpanded ? null : t.id)}
                onLongPress={() => openEditTodo(t)}>
                {/* 우선순위 인디케이터 */}
                {t.priority === 'high' && !t.done && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E17055', marginTop: 6, marginRight: 4 }} />
                )}
                {t.priority !== 'high' && <View style={{ width: 6, marginRight: 4 }} />}
                {/* 체크박스 */}
                <TouchableOpacity onPress={() => {
                  const wasDone = t.done;
                  app.toggleTodo(t.id);
                  Vibration.vibrate([0, 30]);
                  // 올클리어 체크: 완료로 바꿀 때만
                  if (!wasDone) {
                    const todayList = app.todos.filter(x => !x.isTemplate && (x.scope === 'today' || x.scope == null));
                    const nowDone = todayList.filter(x => x.id === t.id ? true : x.done).length;
                    if (nowDone === todayList.length && todayList.length > 0) {
                      app.showToastCustom('🎉 오늘 할 일 올클리어!', app.settings.mainCharacter || 'toru');
                    }
                  }
                }}
                  style={[S.todoCk, { borderColor: t.done ? T.accent : T.border, backgroundColor: t.done ? T.accent : 'transparent', marginTop: 1 }]}>
                  {t.done && <Text style={S.todoCkM}>✓</Text>}
                </TouchableOpacity>
                {/* 텍스트 + 메타 */}
                <View style={{ flex: 1 }}>
                  <Text style={[S.todoText, { color: t.done ? T.sub : T.text }, t.done && { textDecorationLine: 'line-through' }]}
                    numberOfLines={isExpanded ? 0 : 2}>{t.text}</Text>
                  {/* 메타 행: scope 뱃지 + 메모 + 완료 시각 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    {(() => {
                      const scopeInfo = t.scope === 'week' ? { label: '이번주', color: '#27AE60' }
                        : t.scope === 'exam' ? { label: '시험대비', color: '#E17055' }
                        : { label: '오늘', color: T.accent };
                      return (
                        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: scopeInfo.color + '18' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: scopeInfo.color }}>{scopeInfo.label}</Text>
                        </View>
                      );
                    })()}
                    {t.memo && <Text style={{ fontSize: 12, color: T.sub }}>📎</Text>}
                    {t.done && timeStr && <Text style={{ fontSize: 11, color: T.sub }}>{timeStr}</Text>}
                  </View>
                  {t.memo && isExpanded && (
                    <View style={{ marginTop: 4, padding: 6, backgroundColor: T.surface2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 12, color: T.sub }}>📎 {t.memo}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => Alert.alert('할 일 삭제', '이 항목을 삭제할까요?', [
                  { text: '취소', style: 'cancel' },
                  { text: '삭제', style: 'destructive', onPress: () => app.removeTodo(t.id) },
                ])} style={S.todoDelBtn}>
                  <Text style={{ fontSize: 16, color: T.sub }}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          };

          // 오늘 완료 카운트 (캐릭터 메시지용)
          const todayTodos = app.todos.filter(t => !t.isTemplate && (t.scope === 'today' || t.scope == null));
          const doneCount = todayTodos.filter(t => t.done).length;
          const allDone = doneCount > 0 && doneCount === todayTodos.length;

          return (
            <View style={[S.todoCard, { backgroundColor: T.card, borderColor: T.border }, isTablet && !isLandscape && S.tabletBlock]}>
              {/* 헤더 */}
              <View style={S.todoH}>
                <Text style={[S.todoTitle, { color: T.text }]}>✅ 해야 할 일</Text>
                <Text style={[S.todoCnt, { color: T.sub }]}>{doneCount}/{todayTodos.length}</Text>
                <Text style={{ fontSize: 11, color: T.border, marginLeft: 4 }}>탭:펼치기 · 꾹:수정</Text>
              </View>
              {/* scope 필터 탭 */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                {[{ id: 'today', label: '오늘' }, { id: 'week', label: '이번주' }, { id: 'exam', label: '시험대비' }, { id: 'all', label: '전체' }].map(opt => {
                  const sel = todoScopeFilter === opt.id;
                  const cnt = app.todos.filter(t => !t.isTemplate && (
                    opt.id === 'today' ? (t.scope === 'today' || t.scope == null) : t.scope === opt.id
                  )).length;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => setTodoScopeFilter(opt.id)}
                      style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: sel ? T.accent + '20' : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                      <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? T.accent : T.sub }}>
                        {opt.label}{cnt > 0 ? ` ${cnt}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* 빠른 추가 인라인 입력 */}
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput
                    ref={inlineInputRef}
                    value={addTodoText} onChangeText={setAddTodoText}
                    placeholder="할 일 입력..." placeholderTextColor={T.sub}
                    style={[S.todoInput, { flex: 1, borderColor: T.accent, backgroundColor: T.surface, color: T.text, marginBottom: 0 }]}
                    onSubmitEditing={submitInlineTodo} returnKeyType="done"
                    onFocus={() => { inlineFocusedRef.current = true; }}
                    onBlur={() => { inlineFocusedRef.current = false; }}
                  />
                  <TouchableOpacity onPress={submitInlineTodo}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: T.accent }}>
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>추가</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowAddTodoModal(true)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                    <Text style={{ fontSize: 14 }}>📋</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* D-Day 임박 경고 (시험 7일 이내) */}
              {(() => {
                const urgentDdays = (app.ddays || []).filter(d => {
                  if (!d.date) return false;
                  const days = calcDDay(d.date);
                  if (days === null || days < 0 || days > 7) return false;
                  return app.todos.some(t => !t.isTemplate && t.scope === 'exam' && t.ddayId === d.id && !t.done);
                });
                if (urgentDdays.length === 0 || todoScopeFilter === 'exam') return null;
                return urgentDdays.map(d => {
                  const days = calcDDay(d.date);
                  const remaining = app.todos.filter(t => !t.isTemplate && t.scope === 'exam' && t.ddayId === d.id && !t.done).length;
                  const dStr = days === 0 ? 'D-Day' : `D-${days}`;
                  return (
                    <TouchableOpacity key={d.id} onPress={() => setTodoScopeFilter('exam')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E17055' + '15', borderWidth: 1, borderColor: '#E17055' + '60', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 8 }}>
                      <Text style={{ fontSize: 14 }}>🎯</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#E17055', flex: 1 }}>
                        {d.label} {dStr} · 할 일 {remaining}개 남음
                      </Text>
                      <Text style={{ fontSize: 12, color: '#E17055' }}>보기 ›</Text>
                    </TouchableOpacity>
                  );
                });
              })()}
              {/* 할일 목록 */}
              {todoScopeFilter === 'exam' ? (() => {
                const examTodos = app.todos.filter(t => !t.isTemplate && t.scope === 'exam');
                if (examTodos.length === 0) return (
                  <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', paddingVertical: 12 }}>
                    시험 체크리스트가 없어요!{'\n'}기한을 "시험"으로 설정해 추가해보세요
                  </Text>
                );
                // D-Day별 그룹핑
                const ddayMap = {};
                const ddayOrder = [];
                examTodos.forEach(t => {
                  const key = t.ddayId || '__none__';
                  if (!ddayMap[key]) { ddayMap[key] = { key, todos: [] }; ddayOrder.push(key); }
                  ddayMap[key].todos.push(t);
                });
                // 정렬: 가까운 D-Day 먼저, 지난 시험 마지막, 미분류 마지막
                ddayOrder.sort((a, b) => {
                  if (a === '__none__') return 1;
                  if (b === '__none__') return -1;
                  const da = (app.ddays || []).find(d => d.id === a);
                  const db = (app.ddays || []).find(d => d.id === b);
                  const daysA = da?.date ? (calcDDay(da.date) ?? 9999) : 9999;
                  const daysB = db?.date ? (calcDDay(db.date) ?? 9999) : 9999;
                  if (daysA < 0 && daysB >= 0) return 1;
                  if (daysA >= 0 && daysB < 0) return -1;
                  return daysA - daysB;
                });
                const activeKeys = ddayOrder.filter(k => {
                  if (k === '__none__') return true;
                  const dd = (app.ddays || []).find(d => d.id === k);
                  return !dd?.date || (calcDDay(dd.date) ?? 0) >= 0;
                });
                const pastKeys = ddayOrder.filter(k => {
                  if (k === '__none__') return false;
                  const dd = (app.ddays || []).find(d => d.id === k);
                  return dd?.date && (calcDDay(dd.date) ?? 0) < 0;
                });
                return (
                  <>
                    {activeKeys.map(key => {
                      const group = ddayMap[key];
                      const dd = (app.ddays || []).find(d => d.id === key);
                      const days = dd?.date ? calcDDay(dd.date) : null;
                      const dStr = days === null ? '' : days === 0 ? ' D-Day' : days > 0 ? ` D-${days}` : ` D+${Math.abs(days)}`;
                      const sorted = sortTodos(group.todos);
                      const doneCnt = group.todos.filter(t => t.done).length;
                      const pct = group.todos.length > 0 ? doneCnt / group.todos.length : 0;
                      return (
                        <View key={key} style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: T.text, flex: 1 }}>
                              {key === '__none__' ? '📋 기타 시험 항목' : `🎯 ${dd?.label || '시험'}${dStr}`}
                            </Text>
                            <Text style={{ fontSize: 12, color: T.sub }}>{doneCnt}/{group.todos.length}</Text>
                          </View>
                          <View style={{ height: 4, backgroundColor: T.surface2, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
                            <View style={{ height: 4, borderRadius: 2, backgroundColor: pct >= 1 ? '#27AE60' : T.accent, width: `${Math.round(pct * 100)}%` }} />
                          </View>
                          {sorted.map(renderTodoRow)}
                        </View>
                      );
                    })}
                    {pastKeys.length > 0 && (
                      <View style={{ marginTop: 4, opacity: 0.65 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 8 }}>📁 완료된 시험</Text>
                        {pastKeys.map(key => {
                          const group = ddayMap[key];
                          const dd = (app.ddays || []).find(d => d.id === key);
                          const days = dd?.date ? calcDDay(dd.date) : null;
                          const doneCnt = group.todos.filter(t => t.done).length;
                          const pct = group.todos.length > 0 ? Math.round((doneCnt / group.todos.length) * 100) : 0;
                          return (
                            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                              <Text style={{ fontSize: 13, color: T.sub, flex: 1 }}>
                                📁 {dd?.label || '시험'}{days !== null ? ` D+${Math.abs(days)}` : ''}
                              </Text>
                              <Text style={{ fontSize: 12, color: T.sub }}>{doneCnt}/{group.todos.length} ({pct}%)</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                );
              })() : (
                visibleTodos.length === 0 ? (
                  <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', paddingVertical: 12 }}>
                    {todoScopeFilter === 'today' ? '오늘 할 일이 없어요!' : todoScopeFilter === 'week' ? '이번주 할 일이 없어요!' : todoScopeFilter === 'exam' ? '시험대비 할 일이 없어요!' : '할 일이 없어요!'}
                  </Text>
                ) : (
                  groupOrder.map(key => {
                    const group = groupMap[key];
                    const sorted = sortTodos(group.todos);
                    const groupDone = group.todos.filter(t => t.done).length;
                    return (
                      <View key={key} style={{ marginBottom: 8 }}>
                        {(groupOrder.length > 1 || key !== '__none__') && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingHorizontal: 2 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: group.color }} />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: group.color, flex: 1 }}>{group.label}</Text>
                            <Text style={{ fontSize: 12, color: T.sub }}>{groupDone}/{group.todos.length}</Text>
                          </View>
                        )}
                        {sorted.map(renderTodoRow)}
                      </View>
                    );
                  })
                )
              )}
              {/* 하단 완료 + 캐릭터 메시지 */}
              {todayTodos.length > 0 && (
                <View style={{ paddingTop: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border, marginTop: 4 }}>
                  {doneCount > 0 && (
                    <Text style={{ fontSize: 13, fontWeight: '800', color: T.accent, marginBottom: 3 }}>
                      ✅ 오늘 완료 {doneCount}개{allDone ? ' 🎉' : ''}
                    </Text>
                  )}
                  <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center' }}>
                    {getTodoMessage(doneCount, allDone, app.settings.mainCharacter)}
                  </Text>
                </View>
              )}
              {/* 반복 템플릿 목록 */}
              {(() => {
                const templates = app.todos.filter(t => t.isTemplate && t.repeatDays && t.repeatDays.length > 0);
                if (templates.length === 0) return null;
                const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
                const dayOrder = [1,2,3,4,5,6,0]; // 월~토, 일 순 (토·일 표시용)
                return (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 6 }}>🔁 반복 할 일 템플릿</Text>
                    {templates.map(t => (
                      <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {t.subjectColor && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.subjectColor }} />}
                        <Text style={{ fontSize: 13, color: T.sub, flex: 1 }} numberOfLines={1}>{t.text}</Text>
                        <Text style={{ fontSize: 11, color: T.sub }}>
                          {t.repeatDays.length === 7 ? '매일' : t.repeatDays.length === 5 && !t.repeatDays.includes(0) && !t.repeatDays.includes(6) ? '주중' : [...t.repeatDays].sort((a,b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)).map(d => dayLabels[d]).join('·')}
                        </Text>
                        <TouchableOpacity onPress={() => {
                          Alert.alert(
                            '반복 할일 삭제',
                            `"${t.text}" 반복을 삭제할까요?\n오늘 생성된 항목도 함께 삭제됩니다.`,
                            [
                              { text: '취소', style: 'cancel' },
                              { text: '삭제', style: 'destructive', onPress: () => {
                                app.todos.filter(x => x.templateId === t.id).forEach(x => app.removeTodo(x.id));
                                app.removeTodo(t.id);
                              }},
                            ]
                          );
                        }} style={{ padding: 2 }}>
                          <Text style={{ fontSize: 14, color: T.sub }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </View>
          );
        })()}

        {/* ═══ 즐겨찾기 (탭 전환형) ═══ */}
        <View style={[S.quickSec, { backgroundColor: T.card, borderColor: T.border }, isTablet && !isLandscape && S.tabletBlock]}>
          {/* 헤더: 탭 전환 + 편집 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
            <TouchableOpacity
              onPress={() => setFavTab('countdown')}
              style={[S.favTabBtn, { backgroundColor: favTab === 'countdown' ? T.accent : T.surface2, borderColor: favTab === 'countdown' ? T.accent : T.border }]}>
              <Text style={[S.favTabBtnT, { color: favTab === 'countdown' ? 'white' : T.sub }]}>⏰ 카운트다운</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFavTab('countup')}
              style={[S.favTabBtn, { backgroundColor: favTab === 'countup' ? T.accent : T.surface2, borderColor: favTab === 'countup' ? T.accent : T.border }]}>
              <Text style={[S.favTabBtnT, { color: favTab === 'countup' ? 'white' : T.sub }]}>⏱ 카운트업</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginLeft: 'auto' }}
              onPress={() => favTab === 'countdown' ? setShowFavMgr(true) : setShowCountupFavMgr(true)}>
              <Text style={[S.quickEdit, { color: T.accent }]}>편집</Text>
            </TouchableOpacity>
          </View>
          {/* 즐겨찾기 2행 (3칸 × 2) */}
          {favTab === 'countdown' ? (
            <>
              {[0, 1].map(row => (
                <View key={row} style={S.favGrid}>
                  {[0, 1, 2].map(col => {
                    const i = row * 3 + col;
                    const fav = favs[i];
                    if (fav) return (
                      <TouchableOpacity key={fav.id} style={[S.favCell, { backgroundColor: fav.color + '12', borderColor: fav.color + '50' }]} onPress={() => runFav(fav)}
                        onLongPress={() => Alert.alert('삭제', `${fav.label} 삭제?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => removeFav(fav.id) }])}>
                        <Text style={S.favCellIcon}>{fav.icon}</Text>
                        <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text>
                      </TouchableOpacity>
                    );
                    return (
                      <TouchableOpacity key={`ecd${i}`} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]} onPress={() => setShowFavMgr(true)}>
                        <Text style={S.favCellIcon}>+</Text>
                        <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </>
          ) : (
            <>
              {[0, 1].map(row => (
                <View key={row} style={S.favGrid}>
                  {[0, 1, 2].map(col => {
                    const i = row * 3 + col;
                    const fav = countupFavs[i];
                    if (fav) return (
                      <TouchableOpacity key={fav.id} style={[S.favCell, { backgroundColor: fav.color + '12', borderColor: fav.color + '50' }]} onPress={() => runCountupFav(fav)}
                        onLongPress={() => Alert.alert('삭제', `${fav.label}을(를) 즐겨찾기에서 삭제할까요?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => app.removeCountupFav(fav.id) }])}>
                        <Text style={S.favCellIcon}>{fav.icon}</Text>
                        <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text>
                      </TouchableOpacity>
                    );
                    return (
                      <TouchableOpacity key={`ecu${i}`} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]} onPress={() => setShowCountupFavMgr(true)}>
                        <Text style={S.favCellIcon}>+</Text>
                        <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </>
          )}
        </View>


        {/* 노이즈 */}
        <View style={[S.noiseCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: app.settings.soundId !== 'none' ? 6 : 0 }}>
              <Text style={[S.secTitle, { color: T.sub }]}>🎵 집중 사운드(백색소음)</Text>
              <TouchableOpacity
                style={[S.nb, { flex: 0, paddingHorizontal: 7, paddingVertical: 3, borderColor: app.settings.soundId === 'none' ? T.accent : T.border, backgroundColor: app.settings.soundId === 'none' ? T.accent : T.card }]}
                onPress={() => app.updateSettings({ soundId: 'none' })}>
                <Text style={[S.nbT, { color: app.settings.soundId === 'none' ? 'white' : T.text }]}>🔇 끄기</Text>
              </TouchableOpacity>
            </View>
            {app.settings.soundId !== 'none' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  onPress={() => app.updateSettings({ soundVolume: Math.max(10, (app.settings.soundVolume ?? 70) - 10) })}
                  style={{ padding: 4 }}>
                  <Text style={{ fontSize: 14 }}>🔈</Text>
                </TouchableOpacity>
                <View style={[S.volTrack, { backgroundColor: T.surface2 }]}>
                  {[10,20,30,40,50,60,70,80,90,100].map(v => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => app.updateSettings({ soundVolume: v })}
                      style={[S.volDot, { backgroundColor: v <= (app.settings.soundVolume ?? 70) ? T.accent : T.border }]}
                    />
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => app.updateSettings({ soundVolume: Math.min(100, (app.settings.soundVolume ?? 70) + 10) })}
                  style={{ padding: 4 }}>
                  <Text style={{ fontSize: 14 }}>🔊</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={S.noiseRow}>
            {[{ id: 'rain', e: '🌧️', t: '빗소리' }, { id: 'cafe', e: '☕', t: '카페' }, { id: 'fire', e: '🔥', t: '모닥불' }, { id: 'wave', e: '🌊', t: '파도' }, { id: 'forest', e: '🌲', t: '숲속' }].map(s => (
              <TouchableOpacity key={s.id} style={[S.nb, { borderColor: app.settings.soundId === s.id ? T.accent : T.border, backgroundColor: app.settings.soundId === s.id ? T.accent : T.card }]} onPress={() => app.updateSettings({ soundId: s.id })}>
                <Text style={{ fontSize: 14 }}>{s.e}</Text>
                <Text style={[S.nbT, { color: app.settings.soundId === s.id ? 'white' : T.text, marginTop: 1 }]} numberOfLines={1}>{s.t}</Text>
              </TouchableOpacity>
            ))}
          </View></View>

        {/* 타임어택 / 커스텀 */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 }}>
          <TouchableOpacity style={[S.favCell, { flex: 1, backgroundColor: '#6C5CE710', borderColor: '#6C5CE7' }]} onPress={startLapTimer}>
            <Text style={S.favCellIcon}>⏱️</Text>
            <Text style={[S.favCellLabel, { color: '#6C5CE7', fontSize: 11, lineHeight: 11 }]}>타임어택{'\n'}스톱워치</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.favCell, { flex: 1, backgroundColor: T.accent, borderColor: T.accent }]} onPress={() => { setShowAdd(true); setAddType('countdown'); setSeqItems([]); setSeqName(''); }}>
            <Text style={S.favCellIcon}>⚙️</Text>
            <Text style={[S.favCellLabel, { color: 'white' }]}>커스텀 타이머</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 30 }} />
          </View>{/* portrait wrapper 닫기 */}
        </ScrollView>
      ))}
      {lapTimer && (
        <View style={[S.lapPanel, { backgroundColor: T.card, borderColor: '#6C5CE7' },
          isLandscape ? { left: Math.ceil(winW / 2) + 1, right: 0 } :
          isTablet ? { left: Math.max(0, (winW - contentMaxW) / 2), right: Math.max(0, (winW - contentMaxW) / 2) } : null
        ]}>
          {/* 1줄: 시간 + 컨트롤 + 랩기록 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={[S.lapTitle, { color: '#6C5CE7' }]}>⏱️ 타임어택</Text>
              <Text style={[S.lapBigTime, { color: lapTimer.status === 'running' ? '#6C5CE7' : T.sub }]}>{formatTime(lapTimer.elapsedSec)}</Text>
            </View>
            <View style={S.lapMiniCtrls}>
              {lapTimer.status === 'running' ? (
                <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: T.stylePreset === 'minimal' ? T.surface2 : '#E8404720' }]} onPress={() => app.pauseTimer(lapTimer.id)}>
                  <Text style={[S.lapMiniBtnT, { color: T.stylePreset === 'minimal' ? T.sub : '#E84047' }]}>⏸</Text></TouchableOpacity>
              ) : (
                <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: '#6C5CE7' }]} onPress={() => app.resumeTimer(lapTimer.id)}>
                  <Text style={S.lapMiniBtnT}>▶</Text></TouchableOpacity>
              )}
              <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: T.surface2 }]} onPress={() => app.stopTimer(lapTimer.id)}>
                <Text style={[S.lapMiniBtnT, { color: T.sub }]}>■</Text></TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[S.lapRecordBtn, { backgroundColor: lapTimer.status === 'running' ? '#F5A623' : lapTimer.elapsedSec === 0 ? '#6C5CE7' : T.surface2 }]}
              onPress={() => {
                if (lapTimer.status === 'running') app.addLap(lapTimer.id);
                else if (lapTimer.elapsedSec === 0) app.resumeTimer(lapTimer.id);
              }}
              activeOpacity={0.7}>
              <Text style={[S.lapRecordBtnT, { color: lapTimer.status === 'running' ? 'white' : lapTimer.elapsedSec === 0 ? 'white' : T.sub }]}>
                {lapTimer.status === 'running' ? '랩 기록' : lapTimer.elapsedSec === 0 ? '시작' : '일시정지'}
              </Text>
              {(lapTimer.laps || []).length > 0 && lapTimer.status === 'running' && (
                <Text style={[S.lapRecordBtnSub, { color: 'rgba(255,255,255,0.8)' }]}>
                  #{(lapTimer.laps || []).length + 1} · {formatTime(lapTimer.elapsedSec - ((lapTimer.laps || []).length > 0 ? lapTimer.laps[lapTimer.laps.length - 1].totalTime : 0))}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {/* 랩 목록 (접기/펼치기) */}
          {(lapTimer.laps || []).length > 0 && (
            <TouchableOpacity onPress={() => setLapExpanded(!lapExpanded)}>
              <Text style={[S.lapListToggle, { color: T.accent }]}>랩 {lapTimer.laps.length}개 {lapExpanded ? '▼ 접기' : '▲ 펼치기'}</Text>
            </TouchableOpacity>
          )}
          {lapExpanded && (lapTimer.laps || []).length > 0 && (
            <ScrollView style={S.lapListScroll} nestedScrollEnabled>
              {[...(lapTimer.laps || [])].reverse().map(l => (
                <View key={l.num} style={[S.lapListRow, { borderBottomColor: T.border }]}>
                  <Text style={[S.lapListNum, { color: T.sub }]}>#{l.num}</Text>
                  <Text style={[S.lapListSplit, { color: T.text }]}>{formatTime(l.splitTime)}</Text>
                  <Text style={[S.lapListTotal, { color: T.sub }]}>{formatTime(l.totalTime)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* 완료된 기록 스톱워치 하단 */}
      {!lapTimer && lapDone && (
        <View style={[S.lapPanel, S.lapPanelDone, { backgroundColor: T.card, borderColor: '#6C5CE730' },
          isLandscape ? { left: Math.ceil(winW / 2) + 1, right: 0 } :
          isTablet ? { left: Math.max(0, (winW - contentMaxW) / 2), right: Math.max(0, (winW - contentMaxW) / 2) } : null
        ]}>
          <View style={S.lapHeader}>
            <View><Text style={[S.lapTitle, { color: T.sub }]}>⏱️ 기록 완료</Text>
              <Text style={[S.lapBigTime, { color: T.text }]}>{formatDuration(lapDone.elapsedSec)}</Text></View>
            <Text style={[S.lapDoneLaps, { color: T.sub }]}>랩 {(lapDone.laps || []).length}개</Text>
          </View>
          {(lapDone.laps || []).length > 0 && (
            <ScrollView style={S.lapListScroll} nestedScrollEnabled>
              {(lapDone.laps || []).map(l => (
                <View key={l.num} style={[S.lapListRow, { borderBottomColor: T.border }]}>
                  <Text style={[S.lapListNum, { color: T.sub }]}>#{l.num}</Text>
                  <Text style={[S.lapListSplit, { color: T.text }]}>{formatTime(l.splitTime)}</Text>
                  <Text style={[S.lapListTotal, { color: T.sub }]}>{formatTime(l.totalTime)}</Text></View>
              ))}
            </ScrollView>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TouchableOpacity style={[S.lapDoneBtn, { backgroundColor: '#6C5CE7' }]} onPress={() => app.restartTimer(lapDone.id)}>
              <Text style={S.lapDoneBtnT}>▶ 다시</Text></TouchableOpacity>
            <TouchableOpacity style={[S.lapDoneBtn, { backgroundColor: T.surface2 }]} onPress={() => app.removeTimer(lapDone.id)}>
              <Text style={[S.lapDoneBtnT, { color: T.sub }]}>닫기</Text></TouchableOpacity>
          </View>
        </View>
      )}


      {/* ── 메모 입력 모달 ── */}
      <Modal visible={!!memoTimerId} transparent animationType="fade">
        <View style={S.mo}>
          <View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540, alignSelf: 'center' }]}>
            <Text style={[S.modalTitle, { color: T.text }]}>📝 한줄 메모</Text>
            <Text style={[{ fontSize: 13, color: T.sub, marginBottom: 8, textAlign: 'center' }]}>오늘 이 공부, 한 줄로 남겨봐요</Text>
            <TextInput
              value={memoText}
              onChangeText={setMemoText}
              placeholder="예) 수학 미적분 어려웠다, 단어 80개 완료 🎯"
              placeholderTextColor={T.sub}
              style={[S.memoInput, { borderColor: T.border, backgroundColor: T.surface2, color: T.text }]}
              maxLength={50}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                // 타이머에 메모 저장 + 세션에도 업데이트
                app.setTimers && app.setTimers(prev => prev.map(t => t.id === memoTimerId ? { ...t, memoText: memoText.trim() } : t));
                if (memoSessionId) app.updateSessionMemo(memoSessionId, memoText);
                setMemoTimerId(null);
              }}
            />
            <Text style={[{ fontSize: 11, color: T.sub, textAlign: 'right', marginBottom: 12 }]}>{memoText.length}/50</Text>
            <View style={S.mBtns}>
              <TouchableOpacity style={[S.mCancel, { borderColor: T.border }]} onPress={() => setMemoTimerId(null)}>
                <Text style={[S.mCancelT, { color: T.sub }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.mConfirm, { backgroundColor: T.accent }]}
                onPress={() => {
                  // 타이머 state에 메모 저장 (표시용)
                  app.updateTimerMemo(memoTimerId, memoText.trim());
                  // 세션에도 반영
                  if (memoSessionId) app.updateSessionMemo(memoSessionId, memoText.trim());
                  setMemoTimerId(null);
                  app.showToastCustom('📝 메모 저장!', 'toru');
                }}
              >
                <Text style={S.mConfirmT}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 할일 추가 모달 ── */}
      <Modal visible={showAddTodoModal} transparent animationType="slide" onRequestClose={closeAddTodoModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={closeAddTodoModal} />
          <View style={[S.addTodoSheet, { backgroundColor: T.card, borderColor: T.border }, isTablet && { maxWidth: contentMaxW, width: '100%', alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1 }]}>
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>📝 할 일 추가</Text>
              <TouchableOpacity onPress={closeAddTodoModal} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: T.sub }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
            {/* 과목 선택 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub }}>과목</Text>
              <Text style={{ fontSize: 12, color: T.border }}>(과목 탭에서 추가·삭제 가능)</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 6 }}>
              <TouchableOpacity onPress={() => { setAddTodoSubjectId(null); setAddTodoSubjectLabel(null); setAddTodoSubjectColor(null); }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: !addTodoSubjectId ? T.accent : T.surface2, borderWidth: 1, borderColor: !addTodoSubjectId ? T.accent : T.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: !addTodoSubjectId ? 'white' : T.sub }}>미분류</Text>
              </TouchableOpacity>
              {app.subjects.map(s => {
                const sel = addTodoSubjectId === s.id;
                return (
                  <TouchableOpacity key={s.id} onPress={() => { setAddTodoSubjectId(s.id); setAddTodoSubjectLabel(s.name); setAddTodoSubjectColor(s.color); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: sel ? s.color : s.color + '15', borderWidth: 1, borderColor: s.color }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: sel ? 'white' : s.color }}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* 텍스트 입력 */}
            <TextInput
              value={addTodoText} onChangeText={setAddTodoText}
              placeholder="할 일 내용을 입력하세요" placeholderTextColor={T.sub}
              style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text, marginBottom: 8 }]}
              onSubmitEditing={submitAddTodo} returnKeyType="done" autoFocus
            />
            {/* 메모 */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, marginBottom: 6 }}>📌 메모</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
              {['오답', '개념 부족', '재풀이', '암기 필요', '계산 실수', '시간 초과'].map(tag => (
                <TouchableOpacity key={tag}
                  onPress={() => setAddTodoMemo(prev => prev ? prev + ' · ' + tag : tag)}
                  style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                  <Text style={{ fontSize: 12, color: T.sub, fontWeight: '600' }}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={addTodoMemo} onChangeText={setAddTodoMemo}
              placeholder="예) 수학 17번 · 개념 부족 · 재풀이 필요" placeholderTextColor={T.sub} multiline
              style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text, minHeight: 48, textAlignVertical: 'top', marginBottom: 14 }]}
            />
            {/* 반복 */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, marginBottom: 6 }}>🔁 반복</Text>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: addTodoRepeatType === 'custom' ? 8 : 14 }}>
              {[{ id: 'none', label: '안 함' }, { id: 'daily', label: '매일' }, { id: 'weekday', label: '주중' }, { id: 'weekend', label: '주말' }, { id: 'custom', label: '직접선택' }].map(opt => {
                const sel = addTodoRepeatType === opt.id;
                return (
                  <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setAddTodoRepeatType(opt.id); }}
                    style={{ flex: 1, paddingHorizontal: 2, paddingVertical: 6, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? T.accent + '20' : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                    <Text style={{ fontSize: 11, fontWeight: sel ? '800' : '600', color: sel ? T.accent : T.sub }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {addTodoRepeatType === 'custom' && (
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 14 }}>
                {[{ d: 1, l: '월' }, { d: 2, l: '화' }, { d: 3, l: '수' }, { d: 4, l: '목' }, { d: 5, l: '금' }, { d: 6, l: '토' }, { d: 0, l: '일' }].map(({ d, l }) => {
                  const sel = addTodoCustomDays.includes(d);
                  return (
                    <TouchableOpacity key={d} onPress={() => setAddTodoCustomDays(prev => sel ? prev.filter(x => x !== d) : [...prev, d])}
                      style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: sel ? T.accent : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                      <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? 'white' : T.sub }}>{l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {/* 기한 */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: addTodoRepeatType !== 'none' ? T.border : T.sub, marginBottom: 6 }}>기한</Text>
            {addTodoRepeatType !== 'none' ? (
              <Text style={{ fontSize: 13, color: T.accent, marginBottom: 14 }}>
                🔁 반복 설정 시 해당 요일 오늘 할 일로 자동 추가됩니다
              </Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  {[{ id: 'today', label: '오늘' }, { id: 'week', label: '이번주' }, { id: 'exam', label: '시험대비' }].map(opt => {
                    const sel = addTodoScope === opt.id;
                    return (
                      <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setAddTodoScope(opt.id); }}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? T.accent + '20' : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                        <Text style={{ fontSize: 14, fontWeight: sel ? '800' : '600', color: sel ? T.accent : T.sub }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {addTodoScope === 'exam' && (app.ddays || []).length > 0 && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#E17055', textAlign: 'right', marginBottom: 6 }}>📅 D-Day 연결 →</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, flexGrow: 1, justifyContent: 'flex-end' }}>
                      {(app.ddays || []).map(d => {
                        const sel = addTodoDdayId === d.id;
                        return (
                          <TouchableOpacity key={d.id} onPress={() => setAddTodoDdayId(sel ? null : d.id)}
                            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: sel ? '#E17055' : '#E1705520', borderWidth: 1, borderColor: sel ? '#E17055' : '#E1705560' }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: sel ? 'white' : '#E17055' }}>{d.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </>
            )}
            {/* 우선순위 */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, marginBottom: 6 }}>우선순위</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {[{ id: 'high', label: '🔴 중요', color: '#E17055' }, { id: 'normal', label: '⚪ 보통', color: '#4A90D9' }, { id: 'low', label: '⚫ 낮음', color: '#8E9AAF' }].map(opt => {
                const sel = addTodoPriority === opt.id;
                return (
                  <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setAddTodoPriority(opt.id); }}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? opt.color + '35' : T.surface2, borderWidth: sel ? 2 : 1, borderColor: sel ? opt.color : T.border }}>
                    <Text style={{ fontSize: 14, fontWeight: sel ? '800' : '600', color: sel ? opt.color : opt.color + '80' }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* 저장 버튼 */}
            <TouchableOpacity onPress={submitAddTodo}
              style={{ backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: 'white' }}>저장</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 할일 수정 모달 */}
      {/* 할일 수정 모달 (풀 기능) */}
      <Modal visible={!!editTodoId} transparent animationType="slide" onRequestClose={() => setEditTodoId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[S.mo, { justifyContent: 'flex-end' }]}>
          <View style={[S.addTodoSheet, { backgroundColor: T.card, borderColor: T.border }, isTablet && { maxWidth: 580, width: '100%', alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: T.text, flex: 1 }}>🖊️ 할 일 수정</Text>
              <TouchableOpacity onPress={() => setEditTodoId(null)} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={{ fontSize: 20, color: T.sub }}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 과목 선택 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity onPress={() => { setEditTodoSubjectId(null); setEditTodoSubjectLabel(null); setEditTodoSubjectColor(null); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: !editTodoSubjectId ? T.accent : T.surface2, borderWidth: 1, borderColor: !editTodoSubjectId ? T.accent : T.border }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: !editTodoSubjectId ? 'white' : T.sub }}>미분류</Text>
                </TouchableOpacity>
                {app.subjects.map(s => {
                  const sel = editTodoSubjectId === s.id;
                  return (
                    <TouchableOpacity key={s.id} onPress={() => { setEditTodoSubjectId(s.id); setEditTodoSubjectLabel(s.name); setEditTodoSubjectColor(s.color); }}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: sel ? s.color : s.color + '15', borderWidth: 1, borderColor: s.color }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: sel ? 'white' : s.color }}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {/* 텍스트 입력 */}
              <TextInput
                value={editTodoText} onChangeText={setEditTodoText}
                placeholder="할 일 내용" placeholderTextColor={T.sub}
                style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text, marginBottom: 8 }]}
                returnKeyType="done" autoFocus
              />
              {/* 메모 */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, marginBottom: 6 }}>📌 메모</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                {['오답', '개념 부족', '재풀이', '암기 필요', '계산 실수', '시간 초과'].map(tag => (
                  <TouchableOpacity key={tag}
                    onPress={() => setEditTodoMemo(prev => prev ? prev + ' · ' + tag : tag)}
                    style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                    <Text style={{ fontSize: 12, color: T.sub, fontWeight: '600' }}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput value={editTodoMemo} onChangeText={setEditTodoMemo}
                placeholder="예) 수학 17번 · 개념 부족 · 재풀이 필요" placeholderTextColor={T.sub} multiline
                style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text, minHeight: 48, textAlignVertical: 'top', marginBottom: 14 }]}
              />
              {/* 반복 */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, marginBottom: 6 }}>🔁 반복</Text>
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: editTodoRepeatType === 'custom' ? 8 : 14 }}>
                {[{ id: 'none', label: '안 함' }, { id: 'daily', label: '매일' }, { id: 'weekday', label: '주중' }, { id: 'weekend', label: '주말' }, { id: 'custom', label: '직접선택' }].map(opt => {
                  const sel = editTodoRepeatType === opt.id;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setEditTodoRepeatType(opt.id); }}
                      style={{ flex: 1, paddingHorizontal: 2, paddingVertical: 6, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? T.accent + '20' : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                      <Text style={{ fontSize: 11, fontWeight: sel ? '800' : '600', color: sel ? T.accent : T.sub }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {editTodoRepeatType === 'custom' && (
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 14 }}>
                  {[{ d: 1, l: '월' }, { d: 2, l: '화' }, { d: 3, l: '수' }, { d: 4, l: '목' }, { d: 5, l: '금' }, { d: 6, l: '토' }, { d: 0, l: '일' }].map(({ d, l }) => {
                    const sel = editTodoCustomDays.includes(d);
                    return (
                      <TouchableOpacity key={d} onPress={() => setEditTodoCustomDays(prev => sel ? prev.filter(x => x !== d) : [...prev, d])}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: sel ? T.accent : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                        <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? 'white' : T.sub }}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {/* 기한 */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: editTodoRepeatType !== 'none' ? T.border : T.sub, marginBottom: 6 }}>기한</Text>
              {editTodoRepeatType !== 'none' ? (
                <Text style={{ fontSize: 13, color: T.accent, marginBottom: 14 }}>🔁 반복 설정 시 해당 요일 오늘 할 일로 자동 추가됩니다</Text>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                    {[{ id: 'today', label: '오늘' }, { id: 'week', label: '이번주' }, { id: 'exam', label: '시험대비' }].map(opt => {
                      const sel = editTodoScope === opt.id;
                      return (
                        <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setEditTodoScope(opt.id); }}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? T.accent + '20' : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                          <Text style={{ fontSize: 14, fontWeight: sel ? '800' : '600', color: sel ? T.accent : T.sub }}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {editTodoScope === 'exam' && (app.ddays || []).length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#E17055', textAlign: 'right', marginBottom: 6 }}>📅 D-Day 연결 →</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, flexGrow: 1, justifyContent: 'flex-end' }}>
                        {(app.ddays || []).map(d => {
                          const sel = editTodoDdayId === d.id;
                          return (
                            <TouchableOpacity key={d.id} onPress={() => setEditTodoDdayId(sel ? null : d.id)}
                              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: sel ? '#E17055' : '#E1705520', borderWidth: 1, borderColor: sel ? '#E17055' : '#E1705560' }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: sel ? 'white' : '#E17055' }}>{d.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </>
              )}
              {/* 우선순위 */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, marginBottom: 6 }}>우선순위</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                {[{ id: 'high', label: '🔴 중요', color: '#E17055' }, { id: 'normal', label: '⚪ 보통', color: '#4A90D9' }, { id: 'low', label: '⚫ 낮음', color: '#8E9AAF' }].map(opt => {
                  const sel = editTodoPriority === opt.id;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setEditTodoPriority(opt.id); }}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? opt.color + '35' : T.surface2, borderWidth: sel ? 2 : 1, borderColor: sel ? opt.color : T.border }}>
                      <Text style={{ fontSize: 14, fontWeight: sel ? '800' : '600', color: sel ? opt.color : opt.color + '80' }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity onPress={submitEditTodo}
                style={{ backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: 'white' }}>저장</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ 즐겨찾기 편집 모달 ═══ */}
      <Modal visible={showFavMgr} transparent animationType="fade">
        <View style={S.mo}><View style={[S.moScroll, isTablet && { alignItems: 'center' }, { justifyContent: 'center', flex: 1 }]}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540 }]}>
          <Text style={[S.modalTitle, { color: T.text }]}>⭐ 즐겨찾기 편집</Text>
          <Text style={[S.favSecLabel, { color: T.sub }]}>현재 ({favs.length}/6) · 탭하면 삭제</Text>
          <View style={S.favMgrGrid}>{favs.map(f => (
            <TouchableOpacity key={f.id} style={[S.favMgrChip, { backgroundColor: f.color + '15', borderColor: f.color }]} onPress={() => removeFav(f.id)}>
              <Text style={S.favMgrIcon}>{f.icon}</Text><Text style={[S.favMgrChipT, { color: f.color }]} numberOfLines={1}>{f.label}</Text><Text style={[S.favMgrX, { color: f.color }]}>×</Text></TouchableOpacity>
          ))}</View>
          {favs.length < 6 && (<>
            <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>추가하기</Text>
            <View style={S.favMgrGrid}>{[
              { label: '뽀모 25+5', icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 25, pomoBreakMin: 5 },
              { label: '뽀모 50+10', icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 50, pomoBreakMin: 10 },
              { label: '뽀모 15+5', icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 15, pomoBreakMin: 5 },
              { label: '3분 어택', icon: '⏰', type: 'countdown', color: '#6C5CE7', totalSec: 180 },
              { label: '5분 어택', icon: '⏰', type: 'countdown', color: '#6C5CE7', totalSec: 300 },
              { label: '10분 어택', icon: '⏰', type: 'countdown', color: '#6C5CE7', totalSec: 600 },
            ].map(item => { const ex = favs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.label} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && addToFav(item)} disabled={ex}>
                <Text style={S.favAddIcon}>{item.icon}</Text><Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 12, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 14, fontWeight: '800', color: item.color }}>+</Text>}</TouchableOpacity>); })}</View>
          </>)}
          <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => { app.setFavs?.(getSchoolDefaultFavs(school)); app.showToastCustom('기본 복원!', 'toru'); }}><Text style={[S.favResetT, { color: T.sub }]}>기본으로 복원</Text></TouchableOpacity>
          <TouchableOpacity style={[S.favDoneBtn, { backgroundColor: T.accent }]} onPress={() => setShowFavMgr(false)}><Text style={S.favDoneBtnT}>완료</Text></TouchableOpacity>
        </View></View></View>
      </Modal>

      {/* ═══ 공부량 즐겨찾기 편집 모달 ═══ */}
      <Modal visible={showCountupFavMgr} transparent animationType="fade">
        <View style={S.mo}><ScrollView style={{ flex: 1 }} contentContainerStyle={[S.moScroll, isTablet && { alignItems: 'center' }]}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540 }]}>
          <Text style={[S.modalTitle, { color: T.text }]}>📈 공부량 즐겨찾기 편집</Text>
          <Text style={[S.favSecLabel, { color: T.sub }]}>현재 ({countupFavs.length}/6) · 탭하면 삭제</Text>
          <View style={S.favMgrGrid}>{countupFavs.map(f => (
            <TouchableOpacity key={f.id} style={[S.favMgrChip, { backgroundColor: f.color + '15', borderColor: f.color }]} onPress={() => app.removeCountupFav(f.id)}>
              <Text style={S.favMgrIcon}>{f.icon}</Text>
              <Text style={[S.favMgrChipT, { color: f.color }]} numberOfLines={1}>{f.label}</Text>
              <Text style={[S.favMgrX, { color: f.color }]}>×</Text>
            </TouchableOpacity>
          ))}</View>
          {countupFavs.length < 6 && (<>
            <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>📚 과목 추가</Text>
            <View style={S.favMgrGrid}>{[
              { id: 'cp_kor', label: '국어', icon: '📘', color: '#E8575A' },
              { id: 'cp_math', label: '수학', icon: '📐', color: '#4A90D9' },
              { id: 'cp_eng', label: '영어', icon: '📗', color: '#5CB85C' },
              { id: 'cp_hst', label: '한국사', icon: '📜', color: '#E17055' },
              { id: 'cp_exp1', label: '탐구1', icon: '🔬', color: '#F5A623' },
              { id: 'cp_exp2', label: '탐구2', icon: '🧪', color: '#9B6FC3' },
              { id: 'cp_sec', label: '제2외국어', icon: '🌍', color: '#00B894' },
              { id: 'cp_free', label: '자유공부', icon: '✨', color: '#6C5CE7' },
            ].map(item => { const ex = countupFavs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.id} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && app.addCountupFav(item)} disabled={ex}>
                <Text style={S.favAddIcon}>{item.icon}</Text>
                <Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 12, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 14, fontWeight: '800', color: item.color }}>+</Text>}
              </TouchableOpacity>
            ); })}</View>
            {app.subjects.length > 0 && (<>
              <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>📝 내 과목</Text>
              <View style={S.favMgrGrid}>{app.subjects.map(subj => { const ex = countupFavs.some(f => f.label === subj.name); return (
                <TouchableOpacity key={subj.id} style={[S.favAddChip, { borderColor: ex ? T.border : subj.color + '60', backgroundColor: ex ? T.surface2 : subj.color + '08' }]} onPress={() => !ex && app.addCountupFav({ label: subj.name, icon: '📚', color: subj.color })} disabled={ex}>
                  <Text style={S.favAddIcon}>📚</Text>
                  <Text style={[S.favAddChipT, { color: ex ? T.sub : subj.color }]}>{subj.name}</Text>
                  {ex ? <Text style={{ fontSize: 12, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 14, fontWeight: '800', color: subj.color }}>+</Text>}
                </TouchableOpacity>
              ); })}</View>
            </>)}
          </>)}
          <TouchableOpacity style={[S.favDoneBtn, { backgroundColor: T.accent }]} onPress={() => setShowCountupFavMgr(false)}>
            <Text style={S.favDoneBtnT}>완료</Text>
          </TouchableOpacity>
        </View></ScrollView></View>
      </Modal>

      {/* ═══ 커스텀 타이머 + 연속모드 ═══ */}
      <Modal visible={showAdd} transparent animationType="fade">
        <View style={S.mo}><ScrollView style={{ flex: 1 }} contentContainerStyle={[S.moScroll, isTablet && { alignItems: 'center' }]}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540 }]}>
          <Text style={[S.modalTitle, { color: T.text }]}>커스텀 타이머</Text>
          <View style={[S.typeRow, { backgroundColor: T.surface2 }]}>
            {[{ id: 'countdown', l: '⏰ 타임어택' }, { id: 'pomodoro', l: '🍅 뽀모도로' }, { id: 'sequence', l: '📋 연속모드' }].map(m => (
              <TouchableOpacity key={m.id} style={[S.typeBtn, addType === m.id && { backgroundColor: T.card }]} onPress={() => setAddType(m.id)}><Text style={[S.typeBtnT, { color: addType === m.id ? T.text : T.sub }]}>{m.l}</Text></TouchableOpacity>))}
          </View>
          {addType === 'countdown' && (<View style={S.ms}><Text style={[S.ml, { color: T.sub }]}>시간</Text><Stepper value={addMin} onChange={setAddMin} min={1} max={300} step={5} unit="분" colors={T} />
            <View style={S.presetRow}>{[5,10,15,25,30,45,60,90,120].map(m => (<TouchableOpacity key={m} style={[S.pc, { borderColor: addMin === m ? T.accent : T.border, backgroundColor: addMin === m ? T.accent : 'transparent' }]} onPress={() => setAddMin(m)}><Text style={[S.pcT, { color: addMin === m ? 'white' : T.sub }]}>{m}분</Text></TouchableOpacity>))}</View></View>)}
          {addType === 'pomodoro' && (<View style={S.ms}><Text style={[S.ml, { color: T.sub }]}>🍅 집중</Text><Stepper value={addPomoWork} onChange={setAddPomoWork} min={5} max={90} step={5} unit="분" colors={T} /><View style={{ height: 12 }} /><Text style={[S.ml, { color: T.sub }]}>☕ 휴식</Text><Stepper value={addPomoBreak} onChange={setAddPomoBreak} min={1} max={30} step={1} unit="분" colors={T} /></View>)}
          {addType === 'sequence' && (<View style={S.ms}>
            <TextInput value={seqName} onChangeText={setSeqName} placeholder="루틴 이름 (저장용)" placeholderTextColor={T.sub} style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]} />
            {seqItems.map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 4, borderWidth: 1, borderColor: it.isBreak ? T.green + '60' : T.border, borderRadius: 8, marginBottom: 4, backgroundColor: it.isBreak ? T.green + '08' : 'transparent' }}>
                {it.isBreak ? (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.green, flex: 1 }}>☕ 쉬는시간</Text>
                ) : (
                  <TextInput value={it.label} onChangeText={(v) => setSeqItems(p => p.map((x, idx) => idx === i ? { ...x, label: v } : x))}
                    placeholder="항목명" placeholderTextColor={T.sub} maxLength={10}
                    style={{ flex: 1, fontSize: 12, fontWeight: '700', color: T.text, paddingVertical: 2, paddingHorizontal: 4, borderWidth: 1, borderColor: T.border, borderRadius: 5, backgroundColor: T.surface, minWidth: 50 }} />
                )}
                <TouchableOpacity style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }} onPress={() => setSeqItems(p => p.map((x, idx) => idx === i ? { ...x, min: Math.max(1, x.min - 5) } : x))}><Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>-</Text></TouchableOpacity>
                <Text style={{ fontSize: 13, fontWeight: '900', color: it.isBreak ? T.green : T.accent, minWidth: 30, textAlign: 'center' }}>{it.min}분</Text>
                <TouchableOpacity style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }} onPress={() => setSeqItems(p => p.map((x, idx) => idx === i ? { ...x, min: Math.min(180, x.min + 5) } : x))}><Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>+</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setSeqItems(p => p.filter((_, idx) => idx !== i))}><Text style={{ fontSize: 14, fontWeight: '700', color: T.red, paddingHorizontal: 2 }}>✕</Text></TouchableOpacity>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.accent, alignItems: 'center' }} onPress={() => setSeqItems(p => [...p, { label: '', color: '#4A90D9', min: 25, isBreak: false }])}><Text style={{ fontSize: 12, fontWeight: '700', color: T.accent }}>+ 항목</Text></TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.green, alignItems: 'center' }} onPress={() => setSeqItems(p => [...p, { label: '쉬는시간', color: '#27AE60', min: 5, isBreak: true }])}><Text style={{ fontSize: 12, fontWeight: '700', color: T.green }}>+ ☕ 쉬는시간</Text></TouchableOpacity>
            </View>
            {seqItems.length > 0 && <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', marginBottom: 4 }}>총 약 {seqItems.reduce((s, it) => s + it.min, 0)}분 ({seqItems.filter(it => !it.isBreak).length}개 항목)</Text>}
          </View>)}
          {addType !== 'sequence' ? (<View style={S.mBtns}>
            <TouchableOpacity style={[S.mCancel, { borderColor: T.border }]} onPress={() => setShowAdd(false)}><Text style={[S.mCancelT, { color: T.sub }]}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[S.mConfirm, { backgroundColor: T.accent }]} onPress={handleAddTimer}><Text style={S.mConfirmT}>▶ 시작</Text></TouchableOpacity></View>
          ) : (<View style={{ gap: 6 }}>
            <TouchableOpacity style={[S.mConfirm, { backgroundColor: T.accent, paddingVertical: 11 }]} onPress={handleStartSeq}><Text style={S.mConfirmT}>▶ 바로 시작</Text></TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: T.accent, alignItems: 'center' }} onPress={handleSaveSeq}><Text style={{ fontSize: 13, fontWeight: '700', color: T.accent }}>⭐ 즐겨찾기에 저장</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(false)}><Text style={{ fontSize: 14, fontWeight: '600', color: T.sub, textAlign: 'center', paddingVertical: 6 }}>취소</Text></TouchableOpacity>
          </View>)}
        </View></ScrollView></View>
      </Modal>

      {/* 잠금 해제 챌린지 모달 */}
      <Modal visible={!!app.ultraFocus?.showChallenge} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={S.chalOverlay}>
          <View style={[S.chalBox, { backgroundColor: T.card }]}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={90} mood="sad" />
            <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, marginTop: 10 }}>
              {app.settings.mainCharacter === 'toru' ? '토루가 울고 있어...' : app.settings.mainCharacter === 'paengi' ? '팽이가 슬퍼하고 있어...' : app.settings.mainCharacter === 'taco' ? '타코가 실망했어...' : '토토루가 속상해...'}
            </Text>
            <View style={[S.chalInfo, { backgroundColor: '#FF6B6B12', borderColor: '#FF6B6B40' }]}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FF6B6B' }}>📱 이탈 시간</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#FF6B6B', marginTop: 4 }}>
                {challengeAwayMin > 0 ? `${challengeAwayMin}분 ${challengeAwaySec}초` : `${challengeAwaySec}초`}
              </Text>
              <Text style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>총 {app.ultraFocus?.exitCount || 0}번 이탈</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, marginTop: 14 }}>다시 집중하려면 아래 문구를 따라 쓰세요</Text>
            <View style={[S.chalTargetBox, { backgroundColor: T.accent + '12', borderColor: T.accent + '40' }]}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: T.accent, letterSpacing: 0 }}>{challengeTarget}</Text>
            </View>
            <TextInput style={[S.chalInput, { color: T.text, borderColor: challengeMatch ? '#4CAF50' : T.border, backgroundColor: challengeMatch ? '#4CAF5010' : T.bg }]}
              value={challengeInput} onChangeText={setChallengeInput} placeholder="여기에 입력..." placeholderTextColor={T.sub} autoFocus />
            <TouchableOpacity style={[S.chalBtn, { backgroundColor: challengeMatch ? T.accent : T.border }]}
              onPress={() => { if (challengeMatch) { setChallengeInput(''); app.dismissChallenge?.(); } }} disabled={!challengeMatch} activeOpacity={0.8}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: challengeMatch ? 'white' : T.sub }}>{challengeMatch ? '💪 다시 집중하기!' : '문구를 정확히 입력하세요'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 12, paddingVertical: 8 }} onPress={() => {
                const today = new Date().toISOString().split('T')[0];
                const todayCount = app.settings.giveUpDate === today ? (app.settings.giveUpCount || 0) : 0;
                const countMsg = todayCount > 0 ? `오늘 ${todayCount + 1}번째 그만하기예요.\n` : '';
                Alert.alert('😴 정말 그만할까요?', `${countMsg}모든 타이머가 중단돼요`, [{ text: '계속하기', style: 'cancel' }, { text: '그만하기', style: 'destructive', onPress: () => { setChallengeInput(''); app.giveUpFocus?.(); } }]);
              }}>
              <Text style={{ fontSize: 13, color: T.sub, textDecorationLine: 'underline' }}>그만하기</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🔒 잠금 오버레이 (🔥모드 전용) - 풀스크린 모달 */}
      <Modal visible={screenLocked} transparent animationType="none" statusBarTranslucent>
        <View style={[S.lockOverlayBg, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            {/* 첫 사용 한 줄 가이드 */}
            {!app.settings.guideLock && (
              <TouchableOpacity onPress={() => app.updateSettings({ guideLock: true })}
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '700', textAlign: 'center' }}>
                  🔒 화면을 덮어두고 공부하세요! 옆으로 밀면 해제돼요
                </Text>
              </TouchableOpacity>
            )}

            {/* 캐릭터 + 메시지 */}
            <View style={{ alignItems: 'center', marginBottom: 30 }}>
              <CharacterAvatar characterId={app.settings.mainCharacter} size={110} mood={app.ultraFocus?.exitCount > 0 ? 'normal' : 'happy'} />
              <Text style={S.lockMsg}>
                {app.ultraFocus?.exitCount === 0 ? '집중 잘하고 있어! 💕' : `이탈 ${app.ultraFocus?.exitCount}회... 다시 집중! 💪`}
              </Text>
            </View>

            {/* 타이머 표시 */}
            <Text style={S.lockTimer}>
              {(() => {
                const rt = app.timers.find(t => t.status === 'running');
                if (!rt) return '--:--';
                let d;
                if (rt.type === 'countdown') {
                  d = Math.max(0, rt.totalSec - rt.elapsedSec);
                } else if (rt.type === 'sequence') {
                  const seqTarget = rt.seqPhase === 'break' ? rt.seqBreakSec : rt.totalSec;
                  d = Math.max(0, seqTarget - rt.elapsedSec);
                } else if (rt.type === 'pomodoro') {
                  const target = (rt.pomoPhase === 'work' ? rt.pomoWorkMin : rt.pomoBreakMin) * 60;
                  d = Math.max(0, target - rt.elapsedSec);
                } else {
                  d = rt.elapsedSec;
                }
                const m = Math.floor(d / 60); const s = d % 60;
                return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
              })()}
            </Text>
            <Text style={S.lockModeBadge}>🔥 집중 도전 중 · 이탈 {app.ultraFocus?.exitCount || 0}회</Text>

            {/* 잠깐 쉬기 */}
            {!app.ultraFocus?.pauseAllowed && (
              <TouchableOpacity onPress={() => { app.allowPause?.(); setScreenLocked(false); }} style={S.lockPauseBtn}>
                <Text style={S.lockPauseBtnT}>⏸️ 잠깐 쉬기 (60초)</Text>
              </TouchableOpacity>
            )}

            {/* 슬라이드 해제 */}
            <View style={[S.lockSlideWrap, { bottom: Math.max(80, insets.bottom + 40) }]}>
              <Animated.Text style={[S.lockSlideHint, { opacity: slideOpacity }]}>🔓 옆으로 밀어서 잠금 해제</Animated.Text>
              <View style={[S.lockSlideTrack, { width: SLIDE_WIDTH }]}>
                <Animated.View style={[S.lockSlideThumb, { transform: [{ translateX: slideX }] }]} {...panResponder.panHandlers}>
                  <Text style={{ fontSize: 22, color: '#000000', fontWeight: '900' }}>→</Text>
                </Animated.View>
              </View>
            </View>
        </View>
      </Modal>

      {/* ── 완료 결과 + 자기평가 ── */}
      <Modal visible={!!app.completedResultData} transparent animationType="slide" onRequestClose={() => { const data = app.completedResultData; app.setCompletedResultData(null); if (data?.timerId) app.removeTimer(data.timerId); setResultSelfRating(null); setResultMemo(''); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[S.mo, { justifyContent: 'flex-end' }]}>
          <View style={[S.selfRatingSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: contentMaxW, width: '100%', alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: T.border }]}>
            <View style={[S.selfRatingHandle, { backgroundColor: T.border }]} />
            <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 2 }}>{app.completedResultData?.planSessionIds?.length ? '📅' : '🎉'}</Text>
            <Text style={[S.selfRatingTitle, { color: T.text }]}>{app.completedResultData?.planSessionIds?.length ? '계획 달성!' : '공부 완료!'}</Text>
            {/* 결과 정보 */}
            {app.completedResultData?.result && (() => {
              const selfBonus = (resultSelfRating === 'fire' || resultSelfRating === 'perfect') ? 3 : 0;
              const displayDensity = Math.max(56, Math.min(103, (app.completedResultData.result.density || 0) + selfBonus));
              const displayTier = getTier(displayDensity);
              return (
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={[S.resTier, { backgroundColor: displayTier.color + '20', marginBottom: 4 }]}>
                    <Text style={[S.resTierT, { color: displayTier.color }]}>{displayTier.label}</Text>
                  </View>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: displayTier.color }}>
                    밀도 {displayDensity}점{selfBonus > 0 ? <Text style={{ fontSize: 15, color: displayTier.color }}> (+{selfBonus})</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 13, color: T.sub, marginTop: 3 }}>
                    {formatDuration(app.completedResultData.result.durationSec || 0)}
                    {app.completedResultData.isSeq ? ` · ${app.completedResultData.seqTotal}개 항목 완주` : ''}
                  </Text>
                </View>
              );
            })()}
            <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', marginBottom: 12 }}>오늘 공부 어땠나요?</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {[
                { icon: '🔥', label: '완전 집중', value: 'fire', bonus: '+3점', color: '#FF6B9D' },
                { icon: '😐', label: '보통이었어', value: 'normal', bonus: '±0점', color: T.sub },
                { icon: '😴', label: '좀 딴 짓', value: 'sleepy', bonus: '±0점', color: '#B2BEC3' },
              ].map(opt => (
                <TouchableOpacity key={opt.value}
                  style={[S.selfRatingBtn, { backgroundColor: T.card, borderColor: resultSelfRating === opt.value ? opt.color : T.border, borderWidth: resultSelfRating === opt.value ? 2 : 1 }]}
                  onPress={() => setResultSelfRating(opt.value)}>
                  <Text style={{ fontSize: 28, marginBottom: 6 }}>{opt.icon}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: T.text, textAlign: 'center' }}>{opt.label}</Text>
                  <Text style={{ fontSize: 11, color: opt.color, fontWeight: '700', marginTop: 3 }}>{opt.bonus}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={resultMemo}
              onChangeText={setResultMemo}
              placeholder="한줄 메모 (선택)"
              placeholderTextColor={T.sub}
              style={[S.memoInput, { borderColor: T.border, color: T.text, backgroundColor: T.surface }]}
              maxLength={50}
            />
            <TouchableOpacity
              style={{ width: '100%', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 8, backgroundColor: resultSelfRating ? T.accent : T.border }}
              onPress={() => {
                if (!resultSelfRating) { app.showToastCustom('자기평가를 선택해주세요!', 'paengi'); return; }
                const data = app.completedResultData;
                if (data?.planSessionIds?.length) {
                  // 계획 완료: 모든 계획 세션에 자기평가 일괄 적용
                  data.planSessionIds.forEach(id => {
                    app.updateSessionSelfRating(id, resultSelfRating, resultMemo.trim() || null);
                  });
                } else if (data?.seqSessionIds?.length) {
                  // 연속모드: 마지막 완료 세션에만 자기평가 적용 (중간 세션은 이미 밀도 계산됨)
                  const lastSeqId = data.seqSessionIds[data.seqSessionIds.length - 1];
                  app.updateSessionSelfRating(lastSeqId, resultSelfRating, resultMemo.trim() || null);
                } else if (data?.sessionId) {
                  app.updateSessionSelfRating(data.sessionId, resultSelfRating, resultMemo.trim() || null);
                }
                app.setCompletedResultData(null);
                if (data?.timerId) app.removeTimer(data.timerId);
                setResultSelfRating(null);
                setResultMemo('');
              }}>
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '900', letterSpacing: 1 }}>완료</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { const data = app.completedResultData; app.setCompletedResultData(null); if (data?.timerId) app.removeTimer(data.timerId); setResultSelfRating(null); setResultMemo(''); }}
              style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: T.sub }}>건너뛰기</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 주간 플래너 편집 */}
      <ScheduleEditorScreen visible={showScheduleEditor} onClose={() => setShowScheduleEditor(false)} />
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 }, scrollCol: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  tabletBlock: { width: CONTENT_MAX_W },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800' }, headerSub: { fontSize: 11, marginTop: 1 },
  darkBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ddayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  ddayCell: { width: (CONTENT_MAX_W - 32 - 12) / 4, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  ddayCellLabel: { fontSize: 11, fontWeight: '700' }, ddayCellVal: { fontSize: 11, fontWeight: '900', marginTop: 1 },
  planCard: { borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  planCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  planCardTitle: { fontSize: 14, fontWeight: '800' },
  planEditBtn: { fontSize: 14, fontWeight: '700' },
  planFixedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
  planFixedIcon: { fontSize: 14 },
  planFixedLabel: { flex: 1, fontSize: 13 },
  planFixedTime: { fontSize: 12 },
  planDivider: { height: 1, marginHorizontal: 12, marginVertical: 4 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  planRowIcon: { fontSize: 16 },
  planLabel: { fontSize: 14, fontWeight: '600' },
  planMiniTrack: { height: 3, borderRadius: 2, marginTop: 3, overflow: 'hidden' },
  planMiniFill: { height: 3, borderRadius: 2 },
  planTime: { fontSize: 12, minWidth: 54, textAlign: 'right' },
  planAction: { width: 32, alignItems: 'center' },
  planPlayBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  planPlayBtnT: { color: 'white', fontSize: 12, fontWeight: '800' },
  planProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, paddingTop: 4 },
  planProgTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  planProgFill: { height: 5, borderRadius: 3 },
  planProgLabel: { fontSize: 12, fontWeight: '700', minWidth: 52, textAlign: 'right' },
  progCard: { borderRadius: 12, padding: 10, borderWidth: 1, marginBottom: 8 },
  progRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progLabel: { fontSize: 12, fontWeight: '600' }, progVal: { fontSize: 15, fontWeight: '900' },
  progTrack: { height: 5, borderRadius: 3, overflow: 'hidden' }, progFill: { height: '100%', borderRadius: 3 },
  quickSec: { borderRadius: 14, padding: 10, borderWidth: 1, marginBottom: 8 },
  quickHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quickTitle: { fontSize: 14, fontWeight: '800' }, quickEdit: { fontSize: 12, fontWeight: '700' },
  favTabBtn: { paddingHorizontal: 10, paddingTop: 5, paddingBottom: 7, borderRadius: 8, borderWidth: 1 },
  favTabBtnT: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  quickBody: {},
  favGrid: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  favCell: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, minHeight: 62, alignItems: 'center', justifyContent: 'center' },
  favCellIcon: { fontSize: 18, marginBottom: 2 }, favCellLabel: { fontSize: 11, fontWeight: '700' },
  favEmpty: { fontSize: 12, padding: 10 },
  customBtn: { borderRadius: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 },
  customBtnIcon: { fontSize: 14 }, customBtnLabel: { color: 'white', fontSize: 13, fontWeight: '800' },
  queueCard: { borderRadius: 14, padding: 10, borderWidth: 1.5, marginBottom: 8 },
  queueTitle: { fontSize: 14, fontWeight: '800' }, queueCancel: { fontSize: 13, fontWeight: '700' },
  timerFixedArea: { borderBottomWidth: 1 },
  timerSec: { marginBottom: 8 }, secTitle: { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  timerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tc: { borderRadius: 12, padding: 10 },
  tcTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  tcIcon: { fontSize: 14 }, tcLabel: { flex: 1, fontSize: 12, fontWeight: '700' }, tcClose: { fontSize: 14, fontWeight: '600' },
  tcPhase: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  tcTime: { fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center', marginVertical: 3 },
  tcElapsed: { fontSize: 11, textAlign: 'center', marginBottom: 2 },
  tcTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginBottom: 5 }, tcFill: { height: '100%', borderRadius: 2 },
  tcCtrls: { flexDirection: 'row', gap: 4 },
  tcBtn: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' }, tcBtnT: { color: 'white', fontSize: 13, fontWeight: '800' },
  resArea: { alignItems: 'center', paddingVertical: 4 }, resEmoji: { fontSize: 18, marginBottom: 2 },
  resTier: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6, marginBottom: 2 },
  resTierT: { fontSize: 15, fontWeight: '900' }, resDensity: { fontSize: 12, fontWeight: '700' }, resTime: { fontSize: 11, marginTop: 1 },
  memoBtn: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, maxWidth: '100%' },
  memoBtnT: { fontSize: 12, fontWeight: '600' },
  memoInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 4 },
  noiseCard: { borderRadius: 12, padding: 8, borderWidth: 1, marginBottom: 8 }, noiseRow: { flexDirection: 'row', gap: 4 },
  nb: { flex: 1, paddingHorizontal: 4, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignItems: 'center' }, nbT: { fontSize: 11, fontWeight: '600' },
  volTrack: { flexDirection: 'row', gap: 3, alignItems: 'center', paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8 },
  volDot: { width: 14, height: 14, borderRadius: 7 },
  addTodoSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, padding: 20, paddingBottom: 32, maxHeight: '88%' },
  todoCard: { borderRadius: 12, padding: 10, borderWidth: 1 },
  todoH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  todoTitle: { fontSize: 14, fontWeight: '700' }, todoCnt: { fontSize: 11 },
  todoInput: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, fontSize: 13, marginBottom: 4 },
  todoItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  todoCk: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  todoCkM: { color: 'white', fontSize: 12, fontWeight: '800' }, todoText: { flex: 1, fontSize: 13, lineHeight: 16 }, todoDel: { fontSize: 15, paddingHorizontal: 3 },
  todoActionBtn: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  todoDelBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  lapPanel: { position: 'absolute', bottom: 0, left: 8, right: 8, borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.15, shadowRadius: 8 },
  lapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lapTitle: { fontSize: 13, fontWeight: '700' },
  lapBigTime: { fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lapMiniCtrls: { flexDirection: 'row', gap: 6 },
  lapMiniBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lapMiniBtnT: { color: 'white', fontSize: 15, fontWeight: '800' },
  lapListToggle: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginVertical: 4 },
  lapListScroll: { maxHeight: 120 },
  lapListRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5 },
  lapListNum: { fontSize: 12, fontWeight: '600', width: 28 },
  lapListSplit: { fontSize: 14, fontWeight: '700', flex: 1, textAlign: 'center' },
  lapListTotal: { fontSize: 12, width: 50, textAlign: 'right' },
  lapBigRecordBtn: { marginTop: 8, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  lapBigRecordT: { fontSize: 17, fontWeight: '900' },
  lapRecordBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, alignItems: 'center', minWidth: 72 },
  lapRecordBtnT: { fontSize: 14, fontWeight: '900' },
  lapRecordBtnSub: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  lapDoneBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  lapDoneBtnT: { color: 'white', fontSize: 14, fontWeight: '800' },
  mo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }, moScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 30 },
  selfRatingSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  selfRatingHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  selfRatingTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  selfRatingBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  modal: { borderRadius: 20, padding: 16, borderWidth: 1 }, modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  favSecLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  favMgrGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  favMgrChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  favMgrIcon: { fontSize: 13 }, favMgrChipT: { fontSize: 12, fontWeight: '700' }, favMgrX: { fontSize: 14, fontWeight: '600' },
  favAddChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  favAddIcon: { fontSize: 13 }, favAddChipT: { fontSize: 11, fontWeight: '600', maxWidth: 90 },
  favResetT: { fontSize: 12, fontWeight: '600' },
  favDoneBtn: { marginTop: 12, paddingVertical: 11, borderRadius: 10, alignItems: 'center' }, favDoneBtnT: { color: 'white', fontSize: 14, fontWeight: '800' },
  ms: { marginBottom: 14 }, ml: { fontSize: 12, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  typeRow: { flexDirection: 'row', borderRadius: 10, padding: 2, gap: 2, marginBottom: 14 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }, typeBtnT: { fontSize: 12, fontWeight: '700' },
  presetRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 },
  pc: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 }, pcT: { fontSize: 11, fontWeight: '700' },
  mBtns: { flexDirection: 'row', gap: 8 },
  mCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center' }, mCancelT: { fontSize: 14, fontWeight: '600' },
  mConfirm: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' }, mConfirmT: { color: 'white', fontSize: 14, fontWeight: '800' },
  // 울트라 포커스 + 모드
  ultraBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  ultraBannerTitle: { fontSize: 14, fontWeight: '800' }, ultraBannerSub: { fontSize: 12, marginTop: 2 },
  ultraResumeBtn: { borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 8 },
  ultraResumeBtnT: { color: 'white', fontSize: 15, fontWeight: '900' },
  ultraStatus: { flexDirection: 'row', borderRadius: 8, padding: 8, borderWidth: 1, marginBottom: 6, alignItems: 'center', justifyContent: 'space-between' },
  modeBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1.5, marginTop: 12 },
  // 챌린지
  chalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  chalBox: { width: '100%', maxWidth: 360, borderRadius: 24, padding: 28, alignItems: 'center' },
  chalInfo: { width: '100%', borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', marginTop: 14 },
  chalTargetBox: { width: '100%', borderRadius: 10, borderWidth: 1.5, padding: 12, alignItems: 'center', marginTop: 8 },
  chalInput: { width: '100%', borderRadius: 10, borderWidth: 2, padding: 12, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 8, letterSpacing: 0 },
  chalBtn: { width: '100%', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 14 },
  // 가이드 말풍선
  guideBubble: { borderRadius: 10, padding: 12, borderWidth: 1, marginTop: 10, width: '100%' },
  // 🔒 잠금 오버레이
  lockOverlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  lockMsg: { fontSize: 16, fontWeight: '800', color: 'white', marginTop: 14, textAlign: 'center' },
  lockTimer: { fontSize: 52, fontWeight: '900', color: 'white', letterSpacing: 4, marginBottom: 6 },
  lockModeBadge: { fontSize: 14, fontWeight: '700', color: '#FF6B6B', marginBottom: 20 },
  lockPauseBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#FFB74D60', marginBottom: 20 },
  lockPauseBtnT: { fontSize: 14, fontWeight: '700', color: '#FFB74D' },
  lockSlideWrap: { alignItems: 'center', position: 'absolute', left: 0, right: 0 },
  lockSlideHint: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginBottom: 14, letterSpacing: 1 },
  lockSlideTrack: { height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center' },
  lockSlideThumb: { width: 56, height: 54, borderRadius: 27, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
