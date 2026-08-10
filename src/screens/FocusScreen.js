// src/screens/FocusScreen.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK, getTheme, HEADER_BG_PRESETS } from '../constants/colors';
import { formatTime, formatDuration, formatDDay, calcDDay } from '../utils/format';
import TodoSection from './focus/TodoSection';
import { pomoPhaseTargetSec } from '../utils/pomo';
import ChallengeModal from './focus/ChallengeModal';
import NicknameModal from './focus/NicknameModal';
import NumberField from '../components/NumberField';
import CharacterAvatar from '../components/CharacterAvatar';
import GradientView from '../components/GradientView';
import Svg, { Circle } from 'react-native-svg';
import AnalogClock from '../components/AnalogClock';
import ScheduleEditorScreen from './ScheduleEditorScreen';
import { getPlannerMessage } from '../constants/characters';
import { Ionicons } from '@expo/vector-icons';
import { createStyles } from './focus/styles';
import { hexLuminance, getSchoolDefaultFavs, resolveIcon, CalendarIcon } from './focus/helpers';

export default function FocusScreen() {
  const app = useApp();
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  // 집중모드 잠금화면 여부 — AppContext에서 관리 (MainApp 리마운트 시에도 유지, iOS Modal 투명 버그 방지)
  const screenLocked = app.screenLocked ?? false;
  const setScreenLocked = app.setScreenLocked;
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const { width: winW, height: winH } = useWindowDimensions();
  const isTablet = winW >= 600; // 동적 판별 — 회전 시 재계산 (모듈레벨 정적값 덮어쓰기)
  const tabletModalW = Math.min(640, Math.round(winW * 0.8));
  const fs = T.fontScale * (isTablet ? 1.1 : 1.0);
  const isLandscape = isTablet && winW > winH;
  const contentMaxW = isTablet ? Math.round(winW * 0.83) : winW;
  // 스타일의 고정폭(tabletBlock·ddayCell)은 반드시 이 화면의 실제 블록 폭에서 파생시킨다 —
  // styles.js의 정적 680dp를 쓰면 좁은 태블릿에서 카드가 컨테이너 밖으로 나간다
  const S = useMemo(() => createStyles(fs, contentMaxW), [fs, contentMaxW]);

  // 동적 링/카드 크기 (회전 시 재계산)
  const RING_SIZE = isTablet ? Math.min(winW * 0.38, 340) : Math.min(winW - 72, 340);
  const RING_STROKE = isTablet ? 16 : 14;
  const RING_R = (RING_SIZE - RING_STROKE) / 2;
  const RING_C = 2 * Math.PI * RING_R;
  const RING_SIZE_FULL = isTablet ? Math.min(winW * 0.5, 460) : Math.min(winW - 40, 340);
  const RING_STROKE_FULL = isTablet ? 20 : 16;
  const RING_R_FULL = (RING_SIZE_FULL - RING_STROKE_FULL) / 2;
  const RING_C_FULL = 2 * Math.PI * RING_R_FULL;
  const school = app.settings.schoolLevel || 'high';
  const subjectDefMin = school === 'elementary_lower' ? 15 : school === 'elementary_upper' ? 20 : school === 'middle' ? 30 : 45;
  const subjectTimeChoices = school === 'elementary_lower' ? [10, 15, 20, 25] : school === 'elementary_upper' ? [15, 20, 25, 30] : school === 'middle' ? [25, 30, 40, 45] : [30, 45, 60, 90];
  const [showAdd, setShowAdd] = useState(false);
  const [timerViewMode, setTimerViewMode] = useState('default'); // 'default' | 'full' | 'mini'
  const [clockFullscreen, setClockFullscreen] = useState(false);
  const [addType, setAddType] = useState('countdown');
  const [addMin, setAddMin] = useState(25);
  const [addSubject, setAddSubject] = useState(null);
  const [addPomoWork, setAddPomoWork] = useState(app.settings.pomodoroWorkMin || 25);
  const [addPomoBreak, setAddPomoBreak] = useState(app.settings.pomodoroBreakMin || 5);

  // 연속모드 빌더
  const [seqItems, setSeqItems] = useState([]);
  const [seqName, setSeqName] = useState('');
  const [seqBreak, setSeqBreak] = useState(5);
  const [showLaps, setShowLaps] = useState(null);
  const favs = app.favs || [];
  const [lapExpanded, setLapExpanded] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false); // 편집 상태는 NicknameModal 소유
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
  const runFav = (fav) => {
    if (!checkCanStart()) return;
    if (fav.type === 'sequence' && fav.seqItems) {
      const items = fav.seqItems.map(it => ({ label: it.label, color: it.color, totalSec: it.min * 60, type: 'countdown', isBreak: !!it.isBreak }));
      app.startSequence({ items, breakSec: (fav.seqBreak ?? 5) * 60, seqName: fav.label, seqIcon: fav.icon, seqColor: fav.color });
    } else {
      app.addTimer({ type: fav.type, label: fav.label, color: fav.color, subjectId: fav.subjectId || null, totalSec: fav.totalSec || 0, pomoWorkMin: fav.pomoWorkMin || 25, pomoBreakMin: fav.pomoBreakMin || 5 });
    }
  };
  // 연속모드 빌더
  const handleStartSeq = () => {
    if (!checkCanStart()) return;
    const realItems = seqItems.filter(it => it.label.trim());
    if (realItems.length < 2) { app.showToastCustom('2개 이상 추가하세요!', 'paengi'); return; }
    const seqOpts = { items: realItems.map(it => ({ label: it.isBreak ? '쉬는시간' : it.label, color: it.isBreak ? '#27AE60' : '#4A90D9', totalSec: it.min * 60, type: 'countdown', isBreak: !!it.isBreak })), breakSec: 0, seqName: seqName.trim() || '연속모드' };
    // iOS: Modal 닫힘 애니메이션 완료 후 타이머 시작 (동시 Modal 전환 크래시 방지)
    setShowAdd(false);
    setTimeout(() => app.startSequence(seqOpts), Platform.OS === 'ios' ? 350 : 0);
  };
  const handleSaveSeq = () => {
    if (seqItems.filter(it => it.label.trim()).length < 2 || !seqName.trim()) { app.showToastCustom('이름과 2개 이상 필요!', 'paengi'); return; }
    addToFav({ label: seqName.trim(), icon: 'clipboard-outline', type: 'sequence', color: '#6C5CE7', totalSec: 0, seqItems: seqItems.filter(it => it.label.trim()).map(it => ({ ...it })), seqBreak: 0 });
    setShowAdd(false);
  };
  const SEQ_LABELS = ['공부','숙제','수학','국어','영어','독서','운동','휴식','점심','저녁','복습','과학','사회'];

  // D-Day 스마트 노출: 고정(별) 최대 3개 + D-14 이내 자동 (중복 제거, 최대 6개)
  const smartDDs = useMemo(() => {
    const pinned = (app.ddays || []).filter(d => d.isPrimary).slice(0, 3);
    const pinnedIds = new Set(pinned.map(d => d.id));
    const urgent = (app.ddays || []).filter(d => {
      if (pinnedIds.has(d.id)) return false;
      const days = calcDDay(d.date);
      return days !== null && days >= 0 && days <= 14;
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return [...pinned, ...urgent].slice(0, 6);
  }, [app.ddays]);
  const active = app.timers.filter(t => t.status === 'running' || t.status === 'paused');
  const maxRunning = active.length > 0 ? Math.max(...active.map(t => t.elapsedSec)) : 0;
  const realToday = app.todayTotalSec + maxRunning;
  const goalPct = Math.min(100, Math.round((realToday / (app.settings.dailyGoalMin * 60)) * 100));
  const hasRunning = app.timers.some(t => t.status === 'running');
  const hasPausedByUltra = app.timers.some(t => t.pausedByUltra && t.status === 'paused');

  // 플래너 달성률 (enabled이고 오늘 plans 있을 때만 숫자, 아니면 null)
  const plannerRate = app.weeklySchedule?.enabled ? app.getTodayPlanRate?.() : null;

  // 챌린지 모달은 focus/ChallengeModal.js로 분리 (입력 상태 포함)

  // 완료 결과 모달 — 자기평가 입력
  // 완료 결과 모달은 focus/ResultModal.js로 분리돼 App.js 루트에서 렌더된다
  // (여기 있으면 다른 탭에서는 react-native-screens가 화면을 떼어내 모달이 안 뜬다)

  const mainScrollRef = useRef(null);
  const [todoDragging, setTodoDragging] = useState(false); // 할일 드래그 정렬 중 메인 스크롤 잠금
  const scrollYRef = useRef(0);

  // 위젯 딥링크(yeolgong://open?tab=focus&section=plans|todos) → 해당 카드로 스크롤
  const planCardYRef = useRef(null);
  const todoSecYRef = useRef(null);
  useEffect(() => {
    const section = route?.params?.section;
    if (!section) return;
    const t = setTimeout(() => {
      // plans 카드는 계획이 없으면 렌더 안 됨 → 할일 카드 위치로 폴백
      const y = section === 'plans' ? (planCardYRef.current ?? todoSecYRef.current) : todoSecYRef.current;
      if (y != null && mainScrollRef.current) mainScrollRef.current.scrollTo({ y: Math.max(0, y - 8), animated: true });
      // 소비 후 초기화(재클릭 시 재트리거) — 스크롤 후에 해야 함:
      // 즉시 초기화하면 deps 변경으로 이 effect의 클린업이 돌아 타이머가 발동 전에 취소된다
      navigation.setParams({ section: undefined });
    }, 450); // 콜드스타트 직후엔 레이아웃 완료를 기다림
    return () => clearTimeout(t);
  }, [route?.params?.section]);




  // 타이머 없어지면 기본모드로 복귀
  useEffect(() => {
    const hasActive = app.timers.some(t => t.type !== 'lap' && (t.status === 'running' || t.status === 'paused'));
    if (!hasActive) setTimerViewMode('default');
  }, [app.timers]);

  // 집중모드 타이머 실행 시 자동 잠금
  useEffect(() => {
    if (app.focusMode === 'screen_on' && hasRunning && !app.ultraFocus?.showChallenge && !app.ultraFocus?.gaveUp) {
      if (!screenLocked) {
        setScreenLocked(true);
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

  // screenLocked 상태에 따라 밝기 적용 — context에서 관리하므로 remount 후에도 정상 동작
  useEffect(() => {
    if (screenLocked && app.focusMode === 'screen_on') {
      try { app.applyFocusBrightness?.(); } catch {}
    }
  }, [screenLocked]);

  // (슬라이드 잠금해제 UI는 App.js의 잠금 오버레이가 담당 — 이 화면에는 재잠금 버튼만 있음)

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
    addToFav({ label, icon: addType === 'pomodoro' ? 'nutrition-outline' : 'alarm-outline', type: addType, color: subj ? subj.color : '#FF6B9D', totalSec: addType === 'countdown' ? addMin * 60 : 0, subjectId: addSubject, pomoWorkMin: addPomoWork, pomoBreakMin: addPomoBreak });
  };


  const startLapTimer = () => {
    if (lapTimer) { app.showToastCustom('타임어택이 이미 실행중!', 'paengi'); return; }
    // 타임어택은 집중모드 없이 바로 시작
    app.addTimer({ type: 'lap', label: '타임어택', color: '#6C5CE7', totalSec: 0 });
    app.showToastCustom('하단 버튼으로 랩 기록!', 'taco');
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
    return Math.max(0, pomoPhaseTargetSec(t) - live);
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
    return (live / Math.max(1, pomoPhaseTargetSec(t))) * 100;
  };

  // 타이머 카드 즐겨찾기 토글
  const handleToggleFav = (t) => {
    if (t.type === 'sequence') {
      const seqName = t.seqName || '연속모드';
      if (favs.some(f => f.label === seqName)) { app.showToastCustom('이미 즐겨찾기에 있어요!', 'paengi'); return; }
      if (t.seqItems?.length) {
        addToFav({ label: seqName, icon: t.seqIcon || 'clipboard-outline', type: 'sequence', color: t.seqColor || '#6C5CE7', totalSec: 0, seqItems: t.seqItems.map(it => ({ label: it.label, color: it.color, min: Math.round(it.totalSec / 60) })), seqBreak: t.seqBreakSec ? Math.round(t.seqBreakSec / 60) : 5 });
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
      addToFav({ label: t.label, icon: t.type === 'pomodoro' ? 'nutrition-outline' : 'alarm-outline', type: t.type, color: t.color, totalSec: t.totalSec, pomoWorkMin: t.pomoWorkMin, pomoBreakMin: t.pomoBreakMin, subjectId: t.subjectId || null });
    }
  };

  // 리셋은 경과를 세션으로 남기지 않고 그냥 버린다 — 종료 버튼 바로 옆이라 오탭하면
  // 몇 시간짜리 공부가 되돌릴 수 없이 사라진다. 기록 기준(불변식 7)을 넘긴 타이머만 한 번 확인.
  // 휴식 페이즈는 어차피 기록 대상이 아니므로(불변식 5) 묻지 않는다 (2026-08-04 자체 감사)
  const confirmReset = (t) => {
    const inBreak = (t.type === 'pomodoro' && t.pomoPhase !== 'work') || (t.type === 'sequence' && t.seqPhase !== 'work');
    const minRec = (t.planId || t.todoId) ? 30 : 300;
    if (t.status === 'completed' || inBreak || t.elapsedSec < minRec) { app.resetTimer(t.id); return; }
    Alert.alert('타이머 리셋',
      `지금까지 ${formatDuration(t.elapsedSec)} 진행했어요. 리셋하면 이 시간은 기록되지 않고 사라집니다.\n\n기록을 남기려면 '종료'를 눌러주세요.`,
      [{ text: '취소', style: 'cancel' }, { text: '리셋', style: 'destructive', onPress: () => app.resetTimer(t.id) }]);
  };

  // 일반 타이머 렌더
  const handleTimerLongPress = (t) => {
    const opts = [{ text: '취소', style: 'cancel' }];
    const inSeq = t.type === 'sequence';
    if (inSeq && t.status !== 'completed') {
      const seqLabel = t.seqName || '연속모드';
      const existingFav = favs.find(f => f.label === seqLabel);
      if (existingFav) {
        opts.push({ text: `"${seqLabel}" 즐겨찾기 삭제`, style: 'destructive', onPress: () => removeFav(existingFav.id) });
      } else {
        opts.push({ text: `"${seqLabel}" 세트 저장`, onPress: () => {
          if (favs.length >= 6) { app.showToastCustom('즐겨찾기가 가득 찼어요! 기존 항목을 삭제해주세요', 'paengi'); return; }
          if (t.seqItems?.length) {
            addToFav({ label: seqLabel, icon: t.seqIcon || 'clipboard-outline', type: 'sequence', color: t.seqColor || '#6C5CE7', totalSec: 0, seqItems: t.seqItems.map(it => ({ label: it.label, color: it.color, min: Math.round(it.totalSec / 60) })), seqBreak: t.seqBreakSec ? Math.round(t.seqBreakSec / 60) : 5 });
          } else { app.showToastCustom('저장할 수 없어요', 'paengi'); }
        }});
      }
    } else if (t.status !== 'completed') {
      const isFreeLap = t.type === 'free' || t.type === 'lap';
      if (isFreeLap) {
        const existingFav = countupFavs.find(f => f.label === t.label);
        if (existingFav) {
          opts.push({ text: '즐겨찾기 삭제', style: 'destructive', onPress: () => app.removeCountupFav(existingFav.id) });
        } else {
          opts.push({ text: '즐겨찾기 추가', onPress: () => {
            if (countupFavs.length >= 6) { app.showToastCustom('즐겨찾기가 가득 찼어요! 기존 항목을 삭제해주세요', 'paengi'); return; }
            app.addCountupFav?.({ label: t.label, color: t.color, subjectId: t.subjectId || null });
          }});
        }
      } else {
        const existingFav = favs.find(f => f.label === t.label && f.type === t.type);
        if (existingFav) {
          opts.push({ text: '즐겨찾기 삭제', style: 'destructive', onPress: () => removeFav(existingFav.id) });
        } else {
          opts.push({ text: '즐겨찾기 추가', onPress: () => {
            if (favs.length >= 6) { app.showToastCustom('즐겨찾기가 가득 찼어요! 기존 항목을 삭제해주세요', 'paengi'); return; }
            addToFav({ label: t.label, icon: t.type === 'pomodoro' ? 'nutrition-outline' : 'alarm-outline', type: t.type, color: t.color, totalSec: t.totalSec, pomoWorkMin: t.pomoWorkMin, pomoBreakMin: t.pomoBreakMin });
          }});
        }
      }
    }
    opts.push({ text: '↺ 리셋', onPress: () => confirmReset(t) });
    if (inSeq) {
      opts.push({ text: '■ 연속모드 종료', style: 'destructive', onPress: () => app.cancelSequence() });
    } else {
      opts.push({ text: '삭제', style: 'destructive', onPress: () => app.removeTimer(t.id) });
    }
    Alert.alert(t.label, '타이머 옵션', opts);
  };

  const renderLargeTimer = (t) => {
    const isA = t.status === 'running', isP = t.status === 'paused';
    const display = getDisplay(t);
    const pct = Math.max(0, Math.min(100, getProgress(t)));
    const dashOffset = RING_C * (1 - pct / 100);
    const iconName = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? 'timer-outline' : 'cafe-outline')
      : t.type === 'countdown' ? 'alarm-outline'
      : t.type === 'free' ? 'trending-up-outline'
      : null;
    const seqIconName = t.type === 'sequence' ? (t.seqPhase === 'break' ? null : resolveIcon(t.seqIcon) || 'clipboard-outline') : null;
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
          {iconName ? <Ionicons name={iconName} size={15} color={isA ? ringColor : T.sub} /> : (t.type === 'sequence' && t.seqPhase === 'break') ? <Ionicons name="cafe-outline" size={15} color={T.green} /> : seqIconName ? <Ionicons name={seqIconName} size={15} color={isA ? ringColor : T.sub} /> : null}
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: T.text }} numberOfLines={1}>{t.label}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: T.surface2, borderRadius: 8, padding: 2, gap: 1 }}>
            {[{ id: 'mini', label: '미니' }, { id: 'default', label: '기본' }, { id: 'full', label: '전체' }, { id: 'analog', label: '시계' }].map(opt => (
              <TouchableOpacity key={opt.id} onPress={() => setTimerViewMode(opt.id)}
                style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: timerViewMode === opt.id ? T.accent : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: timerViewMode === opt.id ? 'white' : T.sub }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => handleToggleFav(t)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 2 }}>
            <Ionicons name={isFav ? 'star' : 'star-outline'} size={15} color={isFav ? '#F0B429' : T.sub} />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Ionicons name="cafe-outline" size={13} color={T.green} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.green, textAlign: 'center' }}>
                  쉬는 중 · {Math.ceil(display / 60)}분 후 다음 항목
                </Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                  <Ionicons name={resolveIcon(t.seqIcon) || 'clipboard-outline'} size={13} color={t.seqColor || T.accent} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: t.seqColor || T.accent }}>
                    {t.seqName || '연속모드'} ({(t.seqIndex || 0) + 1}/{t.seqTotal})
                  </Text>
                </View>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 8 }}>
            <Ionicons name={t.pomoPhase === 'work' ? 'timer-outline' : 'cafe-outline'} size={13} color={ringColor} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: ringColor, textAlign: 'center' }}>
              {t.pomoPhase === 'work' ? `집중·${(t.pomoSet || 0) + 1}세트` : t.pomoPhase === 'longbreak' ? '긴 휴식 중' : '휴식 중'}
            </Text>
          </View>
        )}

        {/* 원형 타이머 링 / 아날로그 시계 */}
        {timerViewMode === 'analog' ? (
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            {t.type !== 'free' && (() => {
              const end = new Date(Date.now() + display * 1000);
              const hh = end.getHours().toString().padStart(2, '0');
              const mm = end.getMinutes().toString().padStart(2, '0');
              return <Text style={{ fontSize: 12, color: T.sub, marginBottom: 6 }}>종료 {hh}:{mm}</Text>;
            })()}
            <View style={{ position: 'relative' }}>
              <AnalogClock size={RING_SIZE} />
              <TouchableOpacity
                onPress={() => setClockFullscreen(true)}
                style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 6, padding: 5 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="expand-outline" size={16} color="#555" />
              </TouchableOpacity>
            </View>
            {/* 전체화면 시계 Modal */}
            <Modal visible={clockFullscreen} transparent animationType="fade" statusBarTranslucent>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setClockFullscreen(false)}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' }}
              >
                {t.type !== 'free' && (() => {
                  const end = new Date(Date.now() + display * 1000);
                  const hh = end.getHours().toString().padStart(2, '0');
                  const mm = end.getMinutes().toString().padStart(2, '0');
                  return <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 20, letterSpacing: 1 }}>종료 {hh}:{mm}</Text>;
                })()}
                <AnalogClock size={isTablet ? Math.min(Math.round(winW * 0.55), 520) : Math.min(winW - 48, 340)} />
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 40 }}>탭하여 닫기</Text>
              </TouchableOpacity>
            </Modal>
          </View>
        ) : (
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
              <View style={{ alignItems: 'center', width: RING_SIZE - RING_STROKE * 4 }}>
                <Text testID="timer-text" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: isTablet ? 64 : Math.round(RING_R * (formatTime(display).length >= 7 ? 0.42 : 0.52)), fontWeight: T.timerFontWeight, color: isA ? ringColor : T.sub, fontVariant: ['tabular-nums'], letterSpacing: 1 }}>
                  {formatTime(display)}
                </Text>
                {t.type !== 'lap' && getTotalElapsed(t) > 0 && (
                  <Text style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>경과 {formatTime(getTotalElapsed(t))}</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* 컨트롤 버튼 */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => confirmReset(t)}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>↺ 리셋</Text>
          </TouchableOpacity>
          {/* 연속모드도 5분 이상이면 기록·결과 모달이 뜨므로 '종료'로 통일 (2026-08-04) */}
          <TouchableOpacity style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => t.type === 'sequence' ? app.cancelSequence() : app.stopTimer(t.id)}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: T.sub }}>■ 종료</Text>
          </TouchableOpacity>
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
    const iconName = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? 'timer-outline' : 'cafe-outline')
      : t.type === 'countdown' ? 'alarm-outline'
      : t.type === 'free' ? 'trending-up-outline'
      : null;
    const seqIconName = t.type === 'sequence' ? (t.seqPhase === 'break' ? null : resolveIcon(t.seqIcon) || 'clipboard-outline') : null;
    const ringColor = (t.type === 'sequence' && t.seqPhase === 'break') ? T.green
      : (t.type === 'pomodoro' && t.pomoPhase !== 'work') ? T.green
      : t.color;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 24 }}>
        {/* 라벨 + 모드 전환 버튼 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 }}>
          {iconName ? <Ionicons name={iconName} size={18} color={isA ? ringColor : T.sub} /> : (t.type === 'sequence' && t.seqPhase === 'break') ? <Ionicons name="cafe-outline" size={18} color={T.green} /> : seqIconName ? <Ionicons name={seqIconName} size={18} color={isA ? ringColor : T.sub} /> : null}
          <Text style={{ fontSize: 17, fontWeight: '800', color: T.text, flex: 1, textAlign: 'center' }} numberOfLines={1}>{t.label}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 2, gap: 1 }}>
            {[{ id: 'mini', label: '미니' }, { id: 'default', label: '기본' }, { id: 'full', label: '전체' }, { id: 'analog', label: '시계' }].map(opt => (
              <TouchableOpacity key={opt.id} onPress={() => setTimerViewMode(opt.id)}
                style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: timerViewMode === opt.id ? T.accent : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: timerViewMode === opt.id ? 'white' : T.sub }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {/* 연속모드 단계 */}
        {t.type === 'sequence' && t.seqPhase !== 'break' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
            <Ionicons name={resolveIcon(t.seqIcon) || 'clipboard-outline'} size={14} color={t.seqColor || T.accent} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.seqColor || T.accent }}>
              {t.seqName || '연속모드'} ({(t.seqIndex || 0) + 1}/{t.seqTotal})
            </Text>
          </View>
        )}
        {t.type === 'pomodoro' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
            <Ionicons name={t.pomoPhase === 'work' ? 'timer-outline' : 'cafe-outline'} size={14} color={ringColor} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: ringColor }}>
              {t.pomoPhase === 'work' ? `집중·${(t.pomoSet || 0) + 1}세트` : t.pomoPhase === 'longbreak' ? '긴 휴식 중' : '휴식 중'}
            </Text>
          </View>
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
          <View style={{ alignItems: 'center', width: RING_SIZE_FULL - RING_STROKE_FULL * 4 }}>
            <Text testID="timer-text" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: isTablet ? 80 : Math.round(RING_R_FULL * (formatTime(display).length >= 7 ? 0.42 : 0.52)), fontWeight: T.timerFontWeight, color: isA ? ringColor : T.sub, fontVariant: ['tabular-nums'], letterSpacing: 2 }}>
              {formatTime(display)}
            </Text>
            {t.type !== 'lap' && getTotalElapsed(t) > 0 && (
              <Text style={{ fontSize: 14, color: T.sub, marginTop: 4 }}>경과 {formatTime(getTotalElapsed(t))}</Text>
            )}
          </View>
        </View>
        {/* 컨트롤 버튼 */}
        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
          <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => confirmReset(t)}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>↺ 리셋</Text>
          </TouchableOpacity>
          {/* 연속모드도 5분 이상이면 기록·결과 모달이 뜨므로 '종료'로 통일 (2026-08-04) */}
          <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => t.type === 'sequence' ? app.cancelSequence() : app.stopTimer(t.id)}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: T.sub }}>■ 종료</Text>
          </TouchableOpacity>
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
    const iconName = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? 'timer-outline' : 'cafe-outline')
      : t.type === 'countdown' ? 'alarm-outline'
      : t.type === 'free' ? 'trending-up-outline'
      : null;
    const seqIconName = t.type === 'sequence' ? (t.seqPhase === 'break' ? null : resolveIcon(t.seqIcon) || 'clipboard-outline') : null;
    const ringColor = (t.type === 'sequence' && t.seqPhase === 'break') ? T.green
      : (t.type === 'pomodoro' && t.pomoPhase !== 'work') ? T.green
      : t.color;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
        {iconName ? <Ionicons name={iconName} size={16} color={isA ? ringColor : T.sub} /> : (t.type === 'sequence' && t.seqPhase === 'break') ? <Ionicons name="cafe-outline" size={16} color={T.green} /> : seqIconName ? <Ionicons name={seqIconName} size={16} color={isA ? ringColor : T.sub} /> : null}
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
          {[{ id: 'mini', label: '미니' }, { id: 'default', label: '기본' }, { id: 'full', label: '전체' }, { id: 'analog', label: '시계' }].map(opt => (
            <TouchableOpacity key={opt.id} onPress={() => setTimerViewMode(opt.id)}
              style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: timerViewMode === opt.id ? T.accent : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: timerViewMode === opt.id ? 'white' : T.sub }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // ── 가로(2컬럼)·세로 레이아웃이 공유하는 본문 섹션 ──
  // 두 분기에 한 줄도 다르지 않게 중복돼 있던 코드를 통합 (diff 검증 후 이동)
  const renderMainSections = () => (
    <>
        {/* 집중모드 상태 배너 */}
        {app.focusMode === 'screen_on' && hasRunning && !screenLocked && (() => {
          const lvColor = app.settings.ultraFocusLevel === 'exam' ? '#FF6B6B' : app.settings.ultraFocusLevel === 'focus' ? '#FFB74D' : '#4CAF50';
          // 고정 문구 + 강도 라벨을 따로 보여주면 '집중모드 중 · 집중모드'로 겹친다 → 하나로 합쳤다
          const lvLabel = app.settings.ultraFocusLevel === 'exam' ? '울트라모드' : app.settings.ultraFocusLevel === 'focus' ? '집중모드' : '일반모드';
          return (
            <View style={[S.ultraStatus, { backgroundColor: '#FF6B6B0E', borderColor: '#FF6B6B35' }]}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Ionicons name="flash" size={14} color="#FF6B6B" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: lvColor }}>{lvLabel} 진행 중</Text>
                {(app.ultraFocus?.exitCount || 0) > 0 && (
                  <View style={{ backgroundColor: '#FF6B6B25', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: '#FF6B6B60' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#FF6B6B' }}>이탈 {app.ultraFocus.exitCount}회</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={lockScreen} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: '#FF6B6B', marginRight: 5 }}>
                <Ionicons name="lock-closed" size={11} color="white" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: 'white' }}>잠금</Text>
              </TouchableOpacity>
              {app.settings.ultraFocusLevel !== 'exam' && (
                <TouchableOpacity onPress={() => app.allowPause?.()} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: '#FF6B6BAA' }}>
                  <Ionicons name="pause" size={11} color="white" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: 'white' }}>잠깐</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
        {app.focusMode === 'screen_off' && hasRunning && (
          <View style={[S.ultraStatus, { backgroundColor: '#4CAF5012', borderColor: '#4CAF5040' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="book-outline" size={13} color="#4CAF50" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#4CAF50' }}>일반모드 · 화면 꺼도 OK</Text>
            </View>
          </View>
        )}

        {/* 잠깐 쉬기 활성화 중 */}
        {app.ultraFocus?.pauseAllowed && (
          <View style={[S.ultraStatus, { backgroundColor: '#FFB74D12', borderColor: '#FFB74D40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="pause" size={12} color="#FFB74D" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFB74D' }}>잠깐 쉬기 중 · 60초간 자유! 빠르게 다녀와~</Text>
            </View>
          </View>
        )}

        {/* 경고 배너 */}
        {app.ultraFocus?.showWarning && (
          <View style={[S.ultraBanner, { backgroundColor: '#FF6B6B18', borderColor: '#FF6B6B60' }]}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={[S.ultraBannerTitle, { color: '#FF6B6B' }]}>이탈 감지!</Text>
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
            <CharacterAvatar characterId={app.settings.mainCharacter} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={[S.ultraBannerTitle, { color: '#6B7B8D' }]}>오늘은 여기까지</Text>
              <Text style={[S.ultraBannerSub, { color: T.sub }]}>다음엔 더 잘할 수 있어!</Text>
            </View>
          </View>
        )}

        {/* 신규 사용자: 첫 공부 시작 카드 — 기록과 타이머가 전혀 없을 때만, 탭 한 번으로 추천 타이머 시작 */}
        {app.sessions.length === 0 && nonLapTimers.length === 0 && (() => {
          const rec = favs[0] || getSchoolDefaultFavs(school)[0];
          return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => rec ? runFav(rec) : setShowAdd(true)}
              style={[{ backgroundColor: T.accent, borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }, isTablet && !isLandscape && S.tabletBlock]}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>첫 공부를 시작해볼까요?</Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>
                  {rec ? `추천 ${rec.label} · 탭 한 번이면 시작돼요` : '나만의 타이머를 만들어보세요'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          );
        })()}

        {/* 헤더 */}
        {(() => {
          const hPreset = HEADER_BG_PRESETS[app.settings.headerBgPreset ?? 0] || HEADER_BG_PRESETS[0];
          const hasBg = hPreset.type !== 'none';
          const bgSampleColor = hPreset.type === 'solid' ? hPreset.color
            : hPreset.type === 'gradient' ? hPreset.colors[0] : null;
          const isLightBg = bgSampleColor ? hexLuminance(bgSampleColor) > 160 : false;
          const hText = hasBg ? (isLightBg ? '#1C1C1E' : '#fff') : T.text;
          const hSub  = hasBg ? (isLightBg ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)') : T.sub;
          const hAcc  = hasBg ? (isLightBg ? '#333' : '#fff') : T.accent;
          const hShadow = (hasBg && !isLightBg) ? { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 } : {};
          const cardStyle = [S.headerCard, isTablet && !isLandscape && S.tabletBlock,
            hPreset.type === 'solid' ? { backgroundColor: hPreset.color }
            : hPreset.type === 'none' ? { backgroundColor: T.card, borderWidth: 1, borderColor: T.border } : {}];
          const innerContent = (
            <View style={S.header}>
              <View style={S.headerLeft}>
                <TouchableOpacity
                  style={{ flex: 1, minWidth: 0 }}
                  onLongPress={() => setShowNicknameModal(true)}
                  activeOpacity={1}
                >
                  <Text style={[S.title, { color: hText }, hShadow]} numberOfLines={1}>
                    {app.settings.nickname || '열공메이트'}
                  </Text>
                  {app.settings.motto ? (
                    <Text style={[S.headerSub, { color: hAcc, fontWeight: '700' }, hShadow]} numberOfLines={1}>
                      "{app.settings.motto}"
                    </Text>
                  ) : (
                    <>
                      {(app.settings.streak > 0 || app.todaySessions?.length > 0) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {app.settings.streak > 0 && (
                            <Text style={[S.headerSub, { color: hSub }, hShadow]}>
                              <Text style={{ color: hAcc, fontWeight: '800' }}>{app.settings.streak}일</Text> 연속
                            </Text>
                          )}
                          {app.settings.streak > 0 && app.todaySessions?.length > 0 && (
                            <Text style={[S.headerSub, { color: hSub }, hShadow]}>·</Text>
                          )}
                          {app.todaySessions?.length > 0 && (
                            <Text style={[S.headerSub, { color: hSub }, hShadow]}>
                              오늘 <Text style={{ color: hAcc, fontWeight: '800' }}>{app.todaySessions.length}세션</Text>
                            </Text>
                          )}
                        </View>
                      )}
                      {plannerRate !== null && (() => { const m = getPlannerMessage(app.settings.mainCharacter, plannerRate); return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 4, flexWrap: 'wrap' }}>
                          <View style={{ backgroundColor: hasBg ? 'rgba(255,255,255,0.25)' : T.accent + '35', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: hText, ...hShadow }}>{m.day}</Text>
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: hAcc, flexShrink: 1, ...hShadow }}>{m.text}</Text>
                        </View>
                      ); })()}
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[S.darkBtn, hasBg
                  ? (isLightBg
                    ? { borderColor: 'rgba(0,0,0,0.2)', backgroundColor: 'rgba(0,0,0,0.08)' }
                    : { borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.15)' })
                  : { borderColor: T.border, backgroundColor: T.card }]}
                onPress={() => app.updateSettings({ darkMode: !app.settings.darkMode })}
              >
                <Ionicons name={app.settings.darkMode ? 'sunny-outline' : 'moon-outline'} size={16} color={hasBg ? (isLightBg ? '#1C1C1E' : '#fff') : T.sub} />
              </TouchableOpacity>
            </View>
          );
          if (hPreset.type === 'gradient') {
            return (
              <GradientView key={hPreset.id} colors={hPreset.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={cardStyle}>
                {innerContent}
              </GradientView>
            );
          }
          return <View key={hPreset.id} style={cardStyle}>{innerContent}</View>;
        })()}

        {/* D-Day 배지 (고정 3개 + D-14 자동, 최대 6개) */}
        {smartDDs.length > 0 && (
          <View style={S.ddayGrid}>{smartDDs.map(dd => {
            const dObj = new Date(dd.date + 'T00:00:00');
            const dayName = ['일','월','화','수','목','금','토'][dObj.getDay()];
            const days = calcDDay(dd.date);
            const isUrgent = days !== null && days >= 0 && days <= 3;
            return (
            <TouchableOpacity key={dd.id} style={[S.ddayCell, { backgroundColor: isUrgent ? (T.red + '15') : (T.accent + '15'), borderColor: isUrgent ? (T.red + '60') : (T.accent + '60') }]}
              onPress={() => Alert.alert(dd.label, `날짜: ${dd.date} (${dayName})\n${formatDDay(dd.date)}`, [
                { text: '확인' },
                { text: '플래너에서 관리', onPress: () => navigation.navigate('Planner', { tab: 'monthly' }) },
              ])}>
              <Text style={[S.ddayCellLabel, { color: T.text }]} numberOfLines={1}>{dd.label}</Text>
              <Text style={[S.ddayCellVal, { color: isUrgent ? T.red : T.accent }]}>{formatDDay(dd.date)}</Text></TouchableOpacity>);
          })}</View>
        )}

        {/* 우리 방 집중 인원 — 방 화면을 안 봐도 공부 중 '같이 있는 느낌' (탭 → 스터디룸) */}
        {(app.roomStudyingCount > 0 || app.roomFocusActive) && (
          <TouchableOpacity style={[S.roomPill, { backgroundColor: T.accent + '14', borderColor: T.accent + '44' }]}
            onPress={() => { navigation.navigate('Stats'); app.requestOpenStudyRoom(); }} activeOpacity={0.7}>
            <Ionicons name={app.roomFocusActive ? 'flame' : 'people'} size={14} color={T.accent} />
            <Text style={[S.roomPillText, { color: T.accent }]}>
              {app.roomFocusActive
                ? `우리 방 다같이 집중 진행 중${app.roomStudyingCount > 0 ? ` · ${app.roomStudyingCount}명 집중` : ''}`
                : `우리 방에서 ${app.roomStudyingCount}명이 함께 집중 중`}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={T.accent} />
          </TouchableOpacity>
        )}

        {/* 진행률 */}
        <View style={[S.progCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={S.progRow}><Text style={[S.progLabel, { color: T.sub }]}>오늘</Text><Text style={[S.progVal, { color: T.accent }]}>{formatDuration(realToday)}</Text></View>
          <View style={[S.progTrack, { backgroundColor: T.surface2 }]}><View style={[S.progFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? T.gold : T.accent }]} /></View>
        </View>

        {/* ═══ 오늘의 계획 카드 ═══ */}
        {/* 래퍼: 위젯 딥링크 스크롤 목적지 측정 (스크롤 컨텐츠 기준 y) */}
        <View collapsable={false} onLayout={(e) => { planCardYRef.current = e.nativeEvent.layout.y; }}>
        {(() => {
          const ws = app.weeklySchedule;
          if (!ws || !ws.enabled) return null;
          const dayKey = app.getDayKey?.();
          const dayData = app.getTodaySchedule?.(); // onlyWeek('이번 주만') 필터 적용본
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <CalendarIcon accentColor={T.accent} size={28} />
                  <Text style={[S.planCardTitle, { color: T.text }]}>오늘의 계획</Text>
                </View>
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
                        <Ionicons name={resolveIcon(item.icon) || 'pin-outline'} size={14} color={isPast ? T.sub + '70' : T.sub} />
                        <Text style={[S.planFixedLabel, { color: T.sub }, pastStyle]}>{item.label}</Text>
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
                        <Ionicons name={resolveIcon(plan.icon) || 'book-outline'} size={16} color={T.accent} />
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
                            ? `${plan.targetMin}분 완료`
                            : `${Math.floor(status.currentSec / 60)}분/${plan.targetMin}분`}
                        </Text>
                        <View style={S.planAction}>
                          {status.type === 'running' ? (
                            <Ionicons name="radio-button-on" size={15} color={T.accent} />
                          ) : status.pct >= 1 ? (
                            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
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
        </View>

        {/* 할 일 (카드+모달 — focus/TodoSection.js) */}
        <View collapsable={false} onLayout={(e) => { todoSecYRef.current = e.nativeEvent.layout.y; }}>
        <TodoSection app={app} T={T} S={S} isTablet={isTablet} isLandscape={isLandscape} contentMaxW={contentMaxW} tabletModalW={tabletModalW} mainScrollRef={mainScrollRef} scrollYRef={scrollYRef} onDragActive={setTodoDragging} />
        </View>
    </>
  );

  const renderSideSections = () => (
    <>
        {/* (즐겨찾기 카드는 과목탭으로 이전 — src/screens/focus/FavoritesCard.js, 2026-07-19) */}

        {/* 노이즈 */}
        {(() => {
          const activeSounds = app.settings.activeSounds ?? [];
          const toggleSound = (id) => {
            if (activeSounds.includes(id)) {
              app.updateSettings({ activeSounds: activeSounds.filter(x => x !== id) });
            } else if (activeSounds.length >= 3) {
              app.showToastCustom('최대 3개까지 선택할 수 있어요', 'paengi');
            } else {
              app.updateSettings({ activeSounds: [...activeSounds, id] });
            }
          };
          return (
        <View style={[S.noiseCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="musical-notes-outline" size={14} color={T.sub} />
                <Text style={[S.secTitle, { color: T.sub }]}>집중 사운드(백색소음)</Text>
              </View>
              <TouchableOpacity
                style={[S.nb, { flex: 0, paddingHorizontal: 7, paddingVertical: 3, borderColor: activeSounds.length === 0 ? T.accent : T.border, backgroundColor: activeSounds.length === 0 ? T.accent : T.surface }]}
                onPress={() => app.updateSettings({ activeSounds: [] })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="volume-mute-outline" size={13} color={activeSounds.length === 0 ? 'white' : T.text} />
                  <Text style={[S.nbT, { color: activeSounds.length === 0 ? 'white' : T.text }]}>끄기</Text>
                </View>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 11, color: T.sub, opacity: 0.7, marginBottom: activeSounds.length > 0 ? 6 : 8 }}>최대 3개 동시 선택 가능 — 믹스해보세요</Text>
            {activeSounds.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  onPress={() => app.updateSettings({ soundVolume: Math.max(10, (app.settings.soundVolume ?? 70) - 10) })}
                  style={{ padding: 4 }}>
                  <Ionicons name="volume-low-outline" size={18} color={T.sub} />
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
                  <Ionicons name="volume-high-outline" size={18} color={T.sub} />
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={{ gap: 4 }}>
            <View style={S.noiseRow}>
              {[{ id: 'rain', icon: 'rainy-outline', t: '빗소리' }, { id: 'wave', icon: 'water-outline', t: '파도' }, { id: 'forest', icon: 'leaf-outline', t: '숲속' }, { id: 'fire', icon: 'flame-outline', t: '모닥불' }, { id: 'cafe', icon: 'cafe-outline', t: '카페' }].map(s => (
                <TouchableOpacity key={s.id} style={[S.nb, { borderColor: activeSounds.includes(s.id) ? T.accent : T.border, backgroundColor: activeSounds.includes(s.id) ? T.accent : T.surface }]} onPress={() => toggleSound(s.id)}>
                  <Ionicons name={s.icon} size={18} color={activeSounds.includes(s.id) ? 'white' : T.sub} />
                  <Text style={[S.nbT, { color: activeSounds.includes(s.id) ? 'white' : T.text, marginTop: 1 }]} numberOfLines={1}>{s.t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={S.noiseRow}>
              {[{ id: 'train', icon: 'train-outline', t: '기차' }, { id: 'library', icon: 'library-outline', t: '도서관' }, { id: 'clock', icon: 'time-outline', t: '시계' }, { id: 'space', icon: 'planet-outline', t: '우주' }, { id: 'writing', icon: 'pencil-outline', t: '필기' }].map(s => (
                <TouchableOpacity key={s.id} style={[S.nb, { borderColor: activeSounds.includes(s.id) ? T.accent : T.border, backgroundColor: activeSounds.includes(s.id) ? T.accent : T.surface }]} onPress={() => toggleSound(s.id)}>
                  <Ionicons name={s.icon} size={18} color={activeSounds.includes(s.id) ? 'white' : T.sub} />
                  <Text style={[S.nbT, { color: activeSounds.includes(s.id) ? 'white' : T.text, marginTop: 1 }]} numberOfLines={1}>{s.t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
          );
        })()}

        {/* 타임어택 / 커스텀 */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 }}>
          <TouchableOpacity style={[S.favCell, { flex: 1, backgroundColor: T.accent + '20', borderColor: T.accent }]} onPress={startLapTimer}>
            <Ionicons name="stopwatch-outline" size={22} color={T.accent} />
            <Text style={[S.favCellLabel, { color: T.accent, fontSize: 11, lineHeight: 11 }]}>타임어택{'\n'}스톱워치</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.favCell, { flex: 1, backgroundColor: T.accent + '20', borderColor: T.accent }]} onPress={() => { setShowAdd(true); setAddType('countdown'); setSeqItems([]); setSeqName(''); }}>
            <Ionicons name="settings-outline" size={22} color={T.accent} />
            <Text style={[S.favCellLabel, { color: T.accent }]}>커스텀 타이머</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 30 }} />
    </>
  );

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
      {nonLapActive.length > 0 && (timerViewMode === 'default' || timerViewMode === 'analog') && !isLandscape && (
        <View style={[S.timerFixedArea, { borderBottomColor: T.border }, isTablet && { maxWidth: contentMaxW, width: '100%', alignSelf: 'center' }]}>
          {renderLargeTimer(nonLapActive[0])}
        </View>
      )}

      {(timerViewMode !== 'full' || isLandscape) && (isLandscape ? (
        /* ── iPad 가로모드: 2컬럼 ── */
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <ScrollView ref={mainScrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            scrollEnabled={!todoDragging}
            onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
            contentContainerStyle={[S.scrollCol, (lapTimer || lapDone) && { paddingBottom: lapExpanded ? 340 : 200 }]}>

        {renderMainSections()}
          </ScrollView>
          <View style={{ width: 1, backgroundColor: T.border }} />
          {/* 오른쪽 컬럼: 가로 전체모드는 Modal로 표시, 나머지는 ScrollView */}
          {(
          <View style={{ flex: 1 }}>
        {/* 가로모드: 미니/기본 타이머 상단 고정 */}
        {nonLapActive.length > 0 && timerViewMode === 'mini' && (
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: T.border, backgroundColor: T.card }}>
            {renderMiniTimer(nonLapActive[0])}
          </View>
        )}
        {nonLapActive.length > 0 && (timerViewMode === 'default' || timerViewMode === 'analog' || timerViewMode === 'full') && (
          <View>
            {renderLargeTimer(nonLapActive[0])}
          </View>
        )}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={S.scrollCol}>

            {renderSideSections()}
          </ScrollView>
          </View>
          )}
        </View>
      ) : (
        /* ── 세로/폰: 기존 단일 컬럼 ── */
        <ScrollView ref={mainScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          scrollEnabled={!todoDragging}
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
          contentContainerStyle={[S.scroll, (lapTimer || lapDone) && { paddingBottom: lapExpanded ? 340 : 200 }]}>
          <View style={isTablet ? { maxWidth: contentMaxW, width: '100%', alignSelf: 'center' } : null}>


        {renderMainSections()}
        {renderSideSections()}
          </View>{/* portrait wrapper 닫기 */}
        </ScrollView>
      ))}
      {lapTimer && (
        <View style={[S.lapPanel, { backgroundColor: T.card, borderColor: T.accent },
          isLandscape ? { left: Math.ceil(winW / 2) + 1, right: 0 } :
          isTablet ? { left: Math.max(0, (winW - contentMaxW) / 2), right: Math.max(0, (winW - contentMaxW) / 2) } : null
        ]}>
          {/* 1줄: 시간 + 컨트롤 + 랩기록 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="stopwatch-outline" size={14} color={T.accent} />
                <Text style={[S.lapTitle, { color: T.accent }]}>타임어택</Text>
              </View>
              <Text style={[S.lapBigTime, { color: lapTimer.status === 'running' ? T.accent : T.sub }]}>{formatTime(lapTimer.elapsedSec)}</Text>
            </View>
            <View style={S.lapMiniCtrls}>
              {lapTimer.status === 'running' ? (
                <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: T.stylePreset === 'minimal' ? T.surface2 : '#E8404720' }]} onPress={() => app.pauseTimer(lapTimer.id)}>
                  <Text style={[S.lapMiniBtnT, { color: T.stylePreset === 'minimal' ? T.sub : '#E84047' }]}>⏸</Text></TouchableOpacity>
              ) : (
                <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: T.accent + '25', borderWidth: 1, borderColor: T.accent }]} onPress={() => app.resumeTimer(lapTimer.id)}>
                  <Text style={[S.lapMiniBtnT, { color: T.accent }]}>▶</Text></TouchableOpacity>
              )}
              <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }]} onPress={() => app.stopTimer(lapTimer.id)}>
                <Text style={[S.lapMiniBtnT, { color: T.sub }]}>■</Text></TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[S.lapRecordBtn, { backgroundColor: lapTimer.status === 'running' ? '#F5A623' : lapTimer.elapsedSec === 0 ? T.accent + '25' : T.surface2, borderWidth: 1, borderColor: lapTimer.status === 'running' ? '#F5A623' : lapTimer.elapsedSec === 0 ? T.accent : T.border }]}
              onPress={() => {
                if (lapTimer.status === 'running') app.addLap(lapTimer.id);
                else if (lapTimer.elapsedSec === 0) app.resumeTimer(lapTimer.id);
              }}
              activeOpacity={0.7}>
              <Text style={[S.lapRecordBtnT, { color: lapTimer.status === 'running' ? 'white' : lapTimer.elapsedSec === 0 ? T.accent : T.sub }]}>
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
            <View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="stopwatch-outline" size={14} color={T.sub} /><Text style={[S.lapTitle, { color: T.sub }]}>기록 완료</Text></View>
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
            <TouchableOpacity style={[S.lapDoneBtn, { backgroundColor: T.accent + '25', borderWidth: 1, borderColor: T.accent }]} onPress={() => app.restartTimer(lapDone.id)}>
              <Text style={[S.lapDoneBtnT, { color: T.accent }]}>▶ 다시</Text></TouchableOpacity>
            <TouchableOpacity style={[S.lapDoneBtn, { backgroundColor: T.surface2 }]} onPress={() => app.removeTimer(lapDone.id)}>
              <Text style={[S.lapDoneBtnT, { color: T.sub }]}>닫기</Text></TouchableOpacity>
          </View>
        </View>
      )}


      {/* ── 가로모드 전체화면 링 타이머 Modal ── */}
      <Modal visible={isLandscape && timerViewMode === 'full' && nonLapActive.length > 0} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setTimerViewMode('default')}>
        <View style={{ flex: 1, backgroundColor: T.bg }}>
          {nonLapActive.length > 0 && renderFullTimer(nonLapActive[0])}
        </View>
      </Modal>


      {/* (즐겨찾기 편집 모달 2종은 과목탭 FavoritesCard로 이전 — 2026-07-19) */}

      {/* ═══ 커스텀 타이머 + 연속모드 ═══ */}
      <Modal visible={showAdd} transparent animationType="fade">
        {/* 안드 Modal은 별도 창이라 softwareKeyboardLayoutMode:'pan'이 안 먹는다 — KAV로 높이를
            줄여야 시간/뽀모/연속 항목 입력칸이 키보드 위로 올라온다 (2026-08-02) */}
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={S.mo}><ScrollView style={{ flex: 1 }} contentContainerStyle={[S.moScroll, isTablet && { alignItems: 'center' }]} keyboardShouldPersistTaps="handled"><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }, isTablet && { maxWidth: tabletModalW, width: '100%' }]}>
          <Text style={[S.modalTitle, { color: T.text }]}>커스텀 타이머</Text>
          <View style={[S.typeRow, { backgroundColor: T.surface2 }]}>
            {[{ id: 'countdown', icon: 'alarm-outline', l: '타임어택' }, { id: 'pomodoro', icon: 'nutrition-outline', l: '뽀모도로' }, { id: 'sequence', icon: 'clipboard-outline', l: '연속모드' }].map(m => (
              <TouchableOpacity key={m.id} style={[S.typeBtn, addType === m.id && { backgroundColor: T.card }]} onPress={() => setAddType(m.id)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name={m.icon} size={13} color={addType === m.id ? T.text : T.sub} />
                  <Text style={[S.typeBtnT, { color: addType === m.id ? T.text : T.sub }]}>{m.l}</Text>
                </View>
              </TouchableOpacity>))}
          </View>
          {addType === 'countdown' && (<View style={S.ms}><Text style={[S.ml, { color: T.sub }]}>시간</Text><NumberField value={addMin} onChange={setAddMin} min={1} max={300} unit="분" colors={T} />
            <View style={S.presetRow}>{[5,10,15,25,30,45,60,90,120].map(m => (<TouchableOpacity key={m} style={[S.pc, { borderColor: addMin === m ? T.accent : T.border, backgroundColor: addMin === m ? T.accent : 'transparent' }]} onPress={() => setAddMin(m)}><Text style={[S.pcT, { color: addMin === m ? 'white' : T.sub }]}>{m}분</Text></TouchableOpacity>))}</View></View>)}
          {addType === 'pomodoro' && (<View style={S.ms}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}><Ionicons name="timer-outline" size={13} color={T.accent} /><Text style={[S.ml, { color: T.sub }]}>집중</Text></View><NumberField value={addPomoWork} onChange={setAddPomoWork} min={5} max={90} unit="분" colors={T} /><View style={{ height: 12 }} /><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}><Ionicons name="cafe-outline" size={13} color={T.sub} /><Text style={[S.ml, { color: T.sub }]}>휴식</Text></View><NumberField value={addPomoBreak} onChange={setAddPomoBreak} min={1} max={30} unit="분" colors={T} /></View>)}
          {addType === 'sequence' && (<View style={S.ms}>
            <TextInput value={seqName} onChangeText={setSeqName} placeholder="루틴 이름 (저장용)" placeholderTextColor={T.sub} style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]} />
            {seqItems.map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 4, borderWidth: 1, borderColor: it.isBreak ? T.green + '60' : T.border, borderRadius: 8, marginBottom: 4, backgroundColor: it.isBreak ? T.green + '08' : 'transparent' }}>
                {it.isBreak ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                    <Ionicons name="cafe-outline" size={11} color={T.green} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.green }}>쉬는시간</Text>
                  </View>
                ) : (
                  <TextInput value={it.label} onChangeText={(v) => setSeqItems(p => p.map((x, idx) => idx === i ? { ...x, label: v } : x))}
                    placeholder="항목명" placeholderTextColor={T.sub} maxLength={10}
                    style={{ flex: 1, fontSize: 12, fontWeight: '700', color: T.text, paddingVertical: 2, paddingHorizontal: 4, borderWidth: 1, borderColor: T.border, borderRadius: 5, backgroundColor: T.surface, minWidth: 50 }} />
                )}
                {/* -5/+5 버튼 제거 — 25분→90분에 13번 누르던 걸 직접 입력으로 (2026-08-02) */}
                <NumberField
                  value={it.min}
                  onChange={(v) => setSeqItems(p => p.map((x, idx) => idx === i ? { ...x, min: v } : x))}
                  min={1} max={180} unit="분" colors={T} size="xs"
                  accentColor={it.isBreak ? T.green : T.accent}
                />
                <TouchableOpacity onPress={() => setSeqItems(p => p.filter((_, idx) => idx !== i))}><Text style={{ fontSize: 14, fontWeight: '700', color: T.red, paddingHorizontal: 2 }}>✕</Text></TouchableOpacity>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.accent, alignItems: 'center' }} onPress={() => setSeqItems(p => [...p, { label: '', color: '#4A90D9', min: 25, isBreak: false }])}><Text style={{ fontSize: 12, fontWeight: '700', color: T.accent }}>+ 항목</Text></TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.green, alignItems: 'center' }} onPress={() => setSeqItems(p => [...p, { label: '쉬는시간', color: '#27AE60', min: 5, isBreak: true }])}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="cafe-outline" size={12} color={T.green} /><Text style={{ fontSize: 12, fontWeight: '700', color: T.green }}>+ 쉬는시간</Text></View></TouchableOpacity>
            </View>
            {seqItems.length > 0 && <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', marginBottom: 4 }}>총 약 {seqItems.reduce((s, it) => s + it.min, 0)}분 ({seqItems.filter(it => !it.isBreak).length}개 항목)</Text>}
          </View>)}
          {addType !== 'sequence' ? (<View style={S.mBtns}>
            <TouchableOpacity style={[S.mCancel, { borderColor: T.border, backgroundColor: T.surface2 }]} onPress={() => setShowAdd(false)}><Text style={[S.mCancelT, { color: T.sub }]}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[S.mConfirm, { backgroundColor: T.accent + '25', borderWidth: 1, borderColor: T.accent }]} onPress={handleAddTimer}><Text style={[S.mConfirmT, { color: T.accent }]}>▶ 시작</Text></TouchableOpacity></View>
          ) : (<View style={{ gap: 6 }}>
            <TouchableOpacity style={[S.mConfirm, { backgroundColor: T.accent + '25', borderWidth: 1, borderColor: T.accent, paddingVertical: 11 }]} onPress={handleStartSeq}><Text style={[S.mConfirmT, { color: T.accent }]}>▶ 바로 시작</Text></TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: T.accent, alignItems: 'center' }} onPress={handleSaveSeq}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="star-outline" size={13} color={T.accent} /><Text style={{ fontSize: 13, fontWeight: '700', color: T.accent }}>즐겨찾기에 저장</Text></View></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(false)}><Text style={{ fontSize: 14, fontWeight: '600', color: T.sub, textAlign: 'center', paddingVertical: 6 }}>취소</Text></TouchableOpacity>
          </View>)}
        </View></ScrollView></View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 잠금 해제 챌린지 모달 (focus/ChallengeModal.js) */}
      <ChallengeModal app={app} T={T} S={S} />

      {/* 🔒 잠금 오버레이는 App.js의 LockOverlay 컴포넌트로 이동 (Root 레벨 렌더링 — 폰트 변경 리마운트에 영향받지 않음) */}

      {/* 완료 결과 + 자기평가 모달은 App.js 루트의 ResultModal로 이동 (focus/ResultModal.js) */}

      {/* 주간 플래너 편집 */}
      <ScheduleEditorScreen visible={showScheduleEditor} onClose={() => setShowScheduleEditor(false)} />

      {/* 닉네임 / 한마디 편집 모달 (focus/NicknameModal.js) */}
      <NicknameModal visible={showNicknameModal} onClose={() => setShowNicknameModal(false)} app={app} T={T} />
    </KeyboardAvoidingView>
  );
}

// 스타일은 ./focus/styles.js 로 분리됨
