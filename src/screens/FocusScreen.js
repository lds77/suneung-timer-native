// src/screens/FocusScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet, Dimensions, Alert, Animated, PanResponder, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK, getTheme } from '../constants/colors';
import { formatTime, formatDuration, formatDDay } from '../utils/format';
import Stepper from '../components/Stepper';
import CharacterAvatar from '../components/CharacterAvatar';
import Svg, { Circle } from 'react-native-svg';
import ScheduleEditorScreen from './ScheduleEditorScreen';
import { getPlannerMessage } from '../constants/characters';

const SW = Dimensions.get('window').width;
const GAP = 8;
const CARD_W = (SW - 32 - GAP) / 2;
const RING_SIZE = Math.min(SW - 72, 248);
const RING_STROKE = 14;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

const getSchoolDefaultFavs = (school) => {
  const pomo = (w, b, label) => ({ id: `def_pomo_${w}`, label: label, icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: w, pomoBreakMin: b });
  const cd = (min, label, color) => ({ id: `def_cd_${min}`, label: label, icon: '⏱', type: 'countdown', color: color, totalSec: min * 60 });
  if (school === 'elementary') return [
    pomo(15, 5, '뽀모 15+5'), cd(20, '20분', '#5CB85C'), cd(30, '30분', '#4A90D9'), cd(45, '45분', '#9B6FC3'),
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
  // 🔥모드 잠금화면 여부 (락 오버레이는 하드코딩 다크색 사용 — T에 영향 안 줌)
  const [screenLocked, setScreenLocked] = useState(false);
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);
  const school = app.settings.schoolLevel || 'high';
  const subjectDefMin = school === 'elementary' ? 25 : school === 'middle' ? 30 : 45;
  const subjectTimeChoices = school === 'elementary' ? [15, 20, 25, 30] : school === 'middle' ? [25, 30, 40, 45] : [30, 45, 60, 90];
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState('countdown');
  const [addMin, setAddMin] = useState(25);
  const [addSubject, setAddSubject] = useState(null);
  const [addPomoWork, setAddPomoWork] = useState(app.settings.pomodoroWorkMin || 25);
  const [addPomoBreak, setAddPomoBreak] = useState(app.settings.pomodoroBreakMin || 5);
  const [newTodo, setNewTodo] = useState('');
  const [expandedTodo, setExpandedTodo] = useState(null);
  const [editTodoId, setEditTodoId] = useState(null);
  const [editTodoText, setEditTodoText] = useState('');
  // 연속모드 빌더
  const [seqItems, setSeqItems] = useState([]);
  const [seqName, setSeqName] = useState('');
  const [seqBreak, setSeqBreak] = useState(5);
  const [showLaps, setShowLaps] = useState(null);
  const favs = app.favs || [];
  const [showFavMgr, setShowFavMgr] = useState(false);
  const [showCountupFavMgr, setShowCountupFavMgr] = useState(false);
  const [lapExpanded, setLapExpanded] = useState(false);
  // 메모 모달
  const [memoTimerId, setMemoTimerId] = useState(null);  // 메모 입력 중인 타이머 id
  const [memoText, setMemoText] = useState('');
  const [memoSessionId, setMemoSessionId] = useState(null); // 연결된 세션 id
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [planCardCollapsed, setPlanCardCollapsed] = useState(false);


  const countupFavs = app.countupFavs || [];
  const addToFav = (fav) => { app.addFav?.(fav); };
  const removeFav = (id) => { app.removeFav?.(id); };
  const runCountupFav = (fav) => {
    app.addTimer({ type: 'free', label: fav.label, color: fav.color, totalSec: 0 });
  };
  const runFav = (fav) => {
    if (fav.type === 'sequence' && fav.seqItems) {
      const items = fav.seqItems.map(it => ({ label: it.label, color: it.color, totalSec: it.min * 60, type: 'countdown', isBreak: !!it.isBreak }));
      app.startSequence({ items, breakSec: (fav.seqBreak ?? 5) * 60, seqName: fav.label, seqIcon: fav.icon, seqColor: fav.color });
    } else {
      app.addTimer({ type: fav.type, label: `${fav.icon} ${fav.label}`, color: fav.color, subjectId: fav.subjectId || null, totalSec: fav.totalSec || 0, pomoWorkMin: fav.pomoWorkMin || 25, pomoBreakMin: fav.pomoBreakMin || 5 });
    }
  };
  // 연속모드 빌더
  const handleStartSeq = () => {
    const realItems = seqItems.filter(it => it.label.trim());
    if (realItems.length < 2) { app.showToastCustom('2개 이상 추가하세요!', 'paengi'); return; }
    app.startSequence({ items: realItems.map(it => ({ label: it.isBreak ? '☕ 쉬는시간' : it.label, color: it.isBreak ? '#27AE60' : '#4A90D9', totalSec: it.min * 60, type: 'countdown', isBreak: !!it.isBreak })), breakSec: 0, seqName: seqName.trim() || '연속모드' });
    setShowAdd(false);
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

  // ═══ 🔒 잠금 오버레이 (🔥모드 전용) ═══
  const SLIDE_WIDTH = Dimensions.get('window').width - 80;
  const THUMB_SIZE = 56;
  const SLIDE_THRESHOLD = SLIDE_WIDTH - THUMB_SIZE - 10;
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;

  // screenLocked 변경 시 useAppState에 알림 (AppState 핸들러가 잠금 여부 체크용)
  useEffect(() => {
    app.notifyScreenLocked?.(screenLocked);
  }, [screenLocked]);

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
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const x = Math.max(0, Math.min(gs.dx, SLIDE_THRESHOLD));
        slideX.setValue(x);
        // 슬라이드할수록 자물쇠 텍스트 흐려짐
        slideOpacity.setValue(1 - (x / SLIDE_THRESHOLD) * 0.8);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx >= SLIDE_THRESHOLD) {
          // 잠금 해제!
          Animated.timing(slideX, { toValue: SLIDE_THRESHOLD, duration: 100, useNativeDriver: false }).start(() => {
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
    const subj = addSubject ? app.subjects.find(s => s.id === addSubject) : null;
    const label = subj ? subj.name : (addType === 'countdown' ? `${addMin}분` : `뽀모 ${addPomoWork}+${addPomoBreak}`);
    app.addTimer({ type: addType, label, subjectId: addSubject, color: subj ? subj.color : '#FF6B9D', totalSec: addType === 'countdown' ? addMin * 60 : 0, pomoWorkMin: addPomoWork, pomoBreakMin: addPomoBreak });
    setShowAdd(false);
  };
  const handleAddAndFav = () => {
    handleAddTimer();
    const subj = addSubject ? app.subjects.find(s => s.id === addSubject) : null;
    const label = subj ? subj.name : (addType === 'countdown' ? `${addMin}분` : `뽀모 ${addPomoWork}+${addPomoBreak}`);
    addToFav({ label, icon: addType === 'pomodoro' ? '🍅' : '⏰', type: addType, color: subj ? subj.color : '#FF6B9D', totalSec: addType === 'countdown' ? addMin * 60 : 0, subjectId: addSubject, pomoWorkMin: addPomoWork, pomoBreakMin: addPomoBreak });
  };

  const startLapTimer = () => {
    if (lapTimer) { app.showToastCustom('타임어택이 이미 실행중!', 'paengi'); return; }
    // 타임어택은 집중모드 없이 바로 시작
    app.addTimer({ type: 'lap', label: '⏱ 타임어택', color: '#6C5CE7', totalSec: 0 });
    app.showToastCustom('⏱ 하단 버튼으로 랩 기록!', 'taco');
  };

  const getDisplay = (t) => {
    if (t.type === 'free' || t.type === 'lap') return t.elapsedSec;
    if (t.type === 'countdown') return Math.max(0, t.totalSec - t.elapsedSec);
    if (t.type === 'sequence') {
      if (t.seqPhase === 'break') return Math.max(0, t.seqBreakSec - t.elapsedSec);
      return Math.max(0, t.totalSec - t.elapsedSec);
    }
    return Math.max(0, (t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60) - t.elapsedSec);
  };
  const getProgress = (t) => {
    if (t.type === 'free' || t.type === 'lap') return Math.min(100, (t.elapsedSec / 3600) * 100);
    if (t.type === 'countdown') return (t.elapsedSec / Math.max(1, t.totalSec)) * 100;
    if (t.type === 'sequence') {
      const target = t.seqPhase === 'break' ? t.seqBreakSec : t.totalSec;
      return (t.elapsedSec / Math.max(1, target)) * 100;
    }
    return (t.elapsedSec / Math.max(1, (t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60))) * 100;
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
        style={[S.tc, { backgroundColor: isD ? (t.result?.tier?.color || T.accent) + '10' : T.card, borderColor: isD ? (t.result?.tier?.color || T.accent) + '60' : isA ? t.color : T.border, borderWidth: isA ? 1.5 : 1, width: single ? '100%' : CARD_W }]}>
        <View style={S.tcTop}><Text style={S.tcIcon}>{icon}</Text>
          {(() => {
            const isFav = t.type === 'sequence'
              ? favs.some(f => f.label === (t.seqName || '연속모드'))
              : (t.type === 'free' || t.type === 'lap')
              ? countupFavs.some(f => f.label === t.label)
              : favs.some(f => f.label === t.label && f.type === t.type);
            return (
              <TouchableOpacity onPress={() => handleToggleFav(t)} hitSlop={{top:8,bottom:8,left:6,right:2}}>
                <Text style={{ fontSize: 11, color: isFav ? '#F0B429' : T.sub }}>{isFav ? '⭐' : '☆'}</Text>
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
          <View style={S.resArea}><Text style={S.resEmoji}>🎉</Text>
            {t.result?.tier && <View style={[S.resTier, { backgroundColor: t.result.tier.color + '20' }]}><Text style={[S.resTierT, { color: t.result.tier.color }]}>{t.result.tier.label}</Text></View>}
            <Text style={[S.resDensity, { color: T.text }]}>밀도 {t.result?.density || 0}점</Text>
            {/* 점수 이유 한 줄 */}
            <Text style={{ fontSize: 9, color: T.sub, marginTop: 2, textAlign: 'center' }}>
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
            {/* 메모 버튼 / 메모 표시 */}
            <TouchableOpacity
              style={[S.memoBtn, { backgroundColor: t.memoText ? T.accent + '18' : T.surface2, borderColor: t.memoText ? T.accent + '50' : T.border }]}
              onPress={() => { setMemoTimerId(t.id); setMemoSessionId(t.memoSessionId || null); setMemoText(t.memoText || ''); }}
            >
              <Text style={[S.memoBtnT, { color: t.memoText ? T.accent : T.sub }]}>
                {t.memoText ? `📝 ${t.memoText}` : '📝 한줄 메모 남기기'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (<>
          <Text style={[S.tcTime, { color: isA ? t.color : T.sub, fontSize: single ? 36 : 26 }]}>{formatTime(display)}</Text>
          {t.type === 'countdown' && <Text style={[S.tcElapsed, { color: T.sub }]}>{formatTime(t.elapsedSec)}</Text>}
          <View style={[S.tcTrack, { backgroundColor: T.surface2 }]}><View style={[S.tcFill, { width: `${Math.min(100,progress)}%`, backgroundColor: isP ? T.sub : t.color }]} /></View>
        </>)}
        <View style={S.tcCtrls}>
          {isA && (<><TouchableOpacity style={[S.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.resetTimer(t.id)}><Text style={[S.tcBtnT, { color: T.text }]}>↺</Text></TouchableOpacity>
            <TouchableOpacity style={[S.tcBtn, { backgroundColor: '#E8404720', flex: 2 }]} onPress={() => app.pauseTimer(t.id)}><Text style={[S.tcBtnT, { color: '#E84047' }]}>⏸</Text></TouchableOpacity>
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
        style={{ backgroundColor: T.card, borderWidth: 1.5, borderColor: isA ? ringColor : T.border, borderRadius: 20, margin: 10, marginBottom: 4, padding: 16, paddingBottom: 14 }}>

        {/* 상단 행: 아이콘 + 라벨 + 즐겨찾기 + 닫기 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 15 }}>{icon}</Text>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: T.text }} numberOfLines={1}>{t.label}</Text>
          <TouchableOpacity onPress={() => handleToggleFav(t)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 2 }}>
            <Text style={{ fontSize: 14, color: isFav ? '#F0B429' : T.sub }}>{isFav ? '⭐' : '☆'}</Text>
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
              <Text style={{ fontSize: 11, fontWeight: '700', color: T.green, textAlign: 'center' }}>
                ☕ 쉬는 중 · {Math.ceil(display / 60)}분 후 다음 항목
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 11, fontWeight: '800', color: t.seqColor || T.accent, textAlign: 'center', marginBottom: 4 }}>
                  {t.seqIcon || '📋'} {t.seqName || '연속모드'} ({(t.seqIndex || 0) + 1}/{t.seqTotal})
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                  {t.seqItems?.map((item, i) => (
                    <Text key={i} style={{ fontSize: 9, fontWeight: i === t.seqIndex ? '900' : '500', color: i === t.seqIndex ? ringColor : T.sub, textDecorationLine: i === t.seqIndex ? 'underline' : 'none' }}>
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
          <Text style={{ fontSize: 11, fontWeight: '700', color: ringColor, textAlign: 'center', marginBottom: 8 }}>
            {t.pomoPhase === 'work' ? `🍅 집중·${(t.pomoSet || 0) + 1}세트` : '☕ 휴식 중'}
          </Text>
        )}

        {/* 원형 타이머 링 */}
        <View style={{ alignItems: 'center', marginBottom: 14 }}>
          <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
              {/* 트랙 (배경 링) */}
              <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                stroke={T.surface2} strokeWidth={RING_STROKE} fill="transparent" />
              {/* 진행 링 */}
              {pct > 0 && (
                <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                  stroke={isP ? T.sub : ringColor} strokeWidth={RING_STROKE} fill="transparent"
                  strokeDasharray={RING_C} strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90, ${RING_SIZE / 2}, ${RING_SIZE / 2})`}
                />
              )}
            </Svg>
            {/* 링 내부: 시간 + 서브 텍스트 */}
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 50, fontWeight: '900', color: isA ? ringColor : T.sub, fontVariant: ['tabular-nums'], letterSpacing: 1 }}>
                {formatTime(display)}
              </Text>
              {t.type === 'countdown' && (
                <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>경과 {formatTime(t.elapsedSec)}</Text>
              )}
              {t.type === 'free' && t.elapsedSec > 0 && (
                <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>자유 공부</Text>
              )}
            </View>
          </View>
        </View>

        {/* 컨트롤 버튼 */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => app.resetTimer(t.id)}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>↺ 리셋</Text>
          </TouchableOpacity>
          {t.type === 'sequence' ? (
            <TouchableOpacity style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: '#E8404720', alignItems: 'center' }} onPress={() => app.cancelSequence()}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#E84047' }}>✕ 취소</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center' }} onPress={() => app.stopTimer(t.id)}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: T.sub }}>■ 종료</Text>
            </TouchableOpacity>
          )}
          {isA ? (
            <TouchableOpacity style={{ flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: '#E8404720', alignItems: 'center' }} onPress={() => app.pauseTimer(t.id)}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#E84047' }}>⏸ 일시정지</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: ringColor, alignItems: 'center' }} onPress={() => app.resumeTimer(t.id)}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: 'white' }}>▶ 계속하기</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView style={[S.container, { backgroundColor: T.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={56}>

      {/* ═══ 타이머 고정 영역: 실행 중 대형 뷰 ═══ */}
      {nonLapActive.length > 0 && (
        <View style={[S.timerFixedArea, { borderBottomColor: T.border }]}>
          {renderLargeTimer(nonLapActive[0])}
        </View>
      )}

      <ScrollView ref={mainScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={[S.scroll, (lapTimer || lapDone) && { paddingBottom: lapExpanded ? 340 : 200 }]}>

        {/* 🔥모드 상태 배너 */}
        {app.focusMode === 'screen_on' && hasRunning && !screenLocked && (
          <View style={[S.ultraStatus, { backgroundColor: '#FF6B6B12', borderColor: '#FF6B6B40' }]}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#FF6B6B', flex: 1 }}>
              🔥 집중 도전 중 · {app.settings.ultraFocusLevel === 'exam' ? '🔴 시험' : app.settings.ultraFocusLevel === 'focus' ? '🟡 집중' : '🟢 일반'} · {app.ultraFocus?.exitCount > 0 ? `이탈 ${app.ultraFocus.exitCount}회` : '이탈 0회 유지 중!'}
            </Text>
            <TouchableOpacity onPress={lockScreen} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FF6B6B20', marginRight: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 9 }}>🔒</Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#FF6B6B' }}> 잠금</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => app.allowPause?.()} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FF6B6B20' }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#FF6B6B' }}>⏸️ 잠깐</Text>
            </TouchableOpacity>
          </View>
        )}
        {app.focusMode === 'screen_off' && hasRunning && (
          <View style={[S.ultraStatus, { backgroundColor: '#4CAF5012', borderColor: '#4CAF5040' }]}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#4CAF50' }}>📖 편하게 공부 중 · 화면 꺼도 OK</Text>
          </View>
        )}

        {/* 잠깐 쉬기 활성화 중 */}
        {app.ultraFocus?.pauseAllowed && (
          <View style={[S.ultraStatus, { backgroundColor: '#FFB74D12', borderColor: '#FFB74D40' }]}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFB74D' }}>⏸️ 잠깐 쉬기 중 · 60초간 자유! 빠르게 다녀와~</Text>
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
        <View style={S.header}>
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
                <Text style={{ fontSize: 10, color: T.accent, marginTop: 1, fontWeight: '600' }} numberOfLines={1}>
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
              onPress={() => Alert.alert(`📅 ${dd.label}`, `날짜: ${dd.date} (${dayName})\n${formatDDay(dd.date)}\n\n하단 설정 탭에서 수정할 수 있어요`, [{ text: '확인' }])}>
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
                  <TouchableOpacity onPress={() => setShowScheduleEditor(true)}>
                    <Text style={[S.planEditBtn, { color: T.accent }]}>편집</Text>
                  </TouchableOpacity>
                  <Text style={{ color: T.sub, fontSize: 12 }}>{planCardCollapsed ? '▼' : '▲'}</Text>
                </View>
              </TouchableOpacity>
              {!planCardCollapsed && (
                <>
                  {fixed.map(item => (
                    <View key={item.id} style={S.planFixedRow}>
                      <Text style={S.planFixedIcon}>{item.icon || '📌'}</Text>
                      <Text style={[S.planFixedLabel, { color: T.sub }]}>{item.label}</Text>
                      <Text style={[S.planFixedTime, { color: T.sub }]}>{item.start}–{item.end}</Text>
                    </View>
                  ))}
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
                            <Text style={{ fontSize: 14 }}>🔵</Text>
                          ) : status.pct >= 1 ? (
                            <Text style={{ fontSize: 16 }}>✅</Text>
                          ) : status.type === 'done' ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ fontSize: 14 }}>✅</Text>
                              <TouchableOpacity style={[S.planPlayBtn, { backgroundColor: T.accent }]} onPress={() => app.startFromPlan?.(plan)}>
                                <Text style={S.planPlayBtnT}>▶+</Text>
                              </TouchableOpacity>
                            </View>
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

        {/* 할 일 (탭: 펼치기, 길게: 수정) */}
        <View style={[S.todoCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={S.todoH}><Text style={[S.todoTitle, { color: T.text }]}>📝 할 일</Text><Text style={[S.todoCnt, { color: T.sub }]}>{app.todos.filter(x => x.done).length}/{app.todos.length}</Text></View>
          <TextInput value={newTodo} onChangeText={setNewTodo} onSubmitEditing={() => { if (newTodo.trim()) { app.addTodo(newTodo.trim()); setNewTodo(''); } }} placeholder="할 일 추가" placeholderTextColor={T.sub} returnKeyType="done" style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]} />
          {app.todos.map(t => (<TouchableOpacity key={t.id} style={S.todoItem} activeOpacity={0.7}
            onPress={() => setExpandedTodo(expandedTodo === t.id ? null : t.id)}
            onLongPress={() => { setEditTodoId(t.id); setEditTodoText(t.text); }}>
            <TouchableOpacity onPress={() => app.toggleTodo(t.id)} style={[S.todoCk, { borderColor: t.done ? T.accent : T.border, backgroundColor: t.done ? T.accent : 'transparent' }]}>{t.done && <Text style={S.todoCkM}>✓</Text>}</TouchableOpacity>
            <Text style={[S.todoText, { color: t.done ? T.sub : T.text }, t.done && { textDecorationLine: 'line-through' }]} numberOfLines={expandedTodo === t.id ? 10 : 2}>{t.text}</Text>
            <TouchableOpacity onPress={() => app.removeTodo(t.id)}><Text style={[S.todoDel, { color: T.sub }]}>×</Text></TouchableOpacity></TouchableOpacity>))}
          {app.todos.length > 0 && <Text style={{ fontSize: 8, color: T.sub, textAlign: 'center', marginTop: 4 }}>탭: 펼치기 · 길게: 수정</Text>}
        </View>

        {/* ═══ 공부량 즐겨찾기 ═══ */}
        <View style={[S.quickSec, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={S.quickHeader}>
            <Text style={[S.quickTitle, { color: T.text }]}>📈 공부량 체크 즐겨찾기 (카운트업)</Text>
            <TouchableOpacity onPress={() => setShowCountupFavMgr(true)}>
              <Text style={[S.quickEdit, { color: T.accent }]}>편집</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 10, color: T.sub, marginBottom: 8 }}>탭하면 측정 시작 · 실행 중 타이머의 ☆ 탭으로 추가 · 길게 누르면 삭제</Text>
          {[0, 1].map(row => (
            <View key={row} style={S.favGrid}>
              {[0, 1, 2].map(col => {
                const fav = countupFavs[row * 3 + col];
                if (fav) return (
                  <TouchableOpacity key={fav.id}
                    style={[S.favCell, { backgroundColor: fav.color + '12', borderColor: fav.color + '50' }]}
                    onPress={() => runCountupFav(fav)}
                    onLongPress={() => Alert.alert('삭제', `${fav.label}을(를) 공부량 즐겨찾기에서 삭제할까요?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => app.removeCountupFav(fav.id) }])}>
                    <Text style={S.favCellIcon}>{fav.icon}</Text>
                    <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text>
                  </TouchableOpacity>
                );
                return (
                  <TouchableOpacity key={`ce${row}${col}`}
                    style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]}
                    onPress={() => setShowCountupFavMgr(true)}>
                    <Text style={S.favCellIcon}>+</Text>
                    <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* ═══ 즐겨찾기 (고정1 + 추가5 + 기록/커스텀) ═══ */}
        <View style={[S.quickSec, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={S.quickHeader}><Text style={[S.quickTitle, { color: T.text }]}>📋 학습법·루틴·과목 즐겨찾기 (카운트다운)</Text>
            <TouchableOpacity onPress={() => setShowFavMgr(true)}><Text style={[S.quickEdit, { color: T.accent }]}>편집</Text></TouchableOpacity></View>
          <Text style={{ fontSize: 10, color: T.sub, marginBottom: 8 }}>탭하면 타이머 시작 · 실행 중 타이머의 ☆ 탭으로 즐겨찾기 추가 · 길게 누르면 삭제</Text>
          {/* 1행: 즐겨찾기 0~2 */}
          <View style={S.favGrid}>
            {[0, 1, 2].map(i => {
              const fav = favs[i];
              if (fav) return (
                <TouchableOpacity key={fav.id} style={[S.favCell, { backgroundColor: fav.color + '12', borderColor: fav.color + '50' }]} onPress={() => runFav(fav)}
                  onLongPress={() => Alert.alert('삭제', `${fav.label} 삭제?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => removeFav(fav.id) }])}>
                  <Text style={S.favCellIcon}>{fav.icon}</Text>
                  <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text></TouchableOpacity>);
              return (
                <TouchableOpacity key={`empty${i}`} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]} onPress={() => setShowFavMgr(true)}>
                  <Text style={S.favCellIcon}>+</Text>
                  <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text></TouchableOpacity>);
            })}
          </View>
          {/* 2행: 즐겨찾기 3~5 */}
          <View style={S.favGrid}>
            {[3, 4, 5].map(i => {
              const fav = favs[i];
              if (fav) return (
                <TouchableOpacity key={fav.id} style={[S.favCell, { backgroundColor: fav.color + '12', borderColor: fav.color + '50' }]} onPress={() => runFav(fav)}
                  onLongPress={() => Alert.alert('삭제', `${fav.label} 삭제?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => removeFav(fav.id) }])}>
                  <Text style={S.favCellIcon}>{fav.icon}</Text>
                  <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text></TouchableOpacity>);
              return (
                <TouchableOpacity key={`empty${i}`} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]} onPress={() => setShowFavMgr(true)}>
                  <Text style={S.favCellIcon}>+</Text>
                  <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text></TouchableOpacity>);
            })}
          </View>
        </View>


        {/* 노이즈 */}
        <View style={[S.noiseCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[S.secTitle, { color: T.sub }]}>🎵 집중 사운드(백색소음)</Text>
              <TouchableOpacity
                style={[S.nb, { flex: 0, paddingHorizontal: 7, paddingVertical: 3, borderColor: app.settings.soundId === 'none' ? T.accent : T.border, backgroundColor: app.settings.soundId === 'none' ? T.accent : T.card }]}
                onPress={() => app.updateSettings({ soundId: 'none' })}>
                <Text style={[S.nbT, { color: app.settings.soundId === 'none' ? 'white' : T.text }]}>🔇 끄기</Text>
              </TouchableOpacity>
            </View>
            {app.settings.soundId !== 'none' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 9, color: T.sub }}>🔈</Text>
                <View style={[S.volTrack, { backgroundColor: T.surface2 }]}>
                  {[10,20,30,40,50,60,70,80,90,100].map(v => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => app.updateSettings({ soundVolume: v })}
                      style={[S.volDot, { backgroundColor: v <= (app.settings.soundVolume ?? 70) ? T.accent : T.border }]}
                    />
                  ))}
                </View>
                <Text style={{ fontSize: 9, color: T.sub }}>🔊</Text>
              </View>
            )}
          </View>
          <View style={S.noiseRow}>
            {[{ id: 'rain', t: '🌧️ 빗소리' }, { id: 'cafe', t: '☕ 카페' }, { id: 'fire', t: '🔥 모닥불' }, { id: 'wave', t: '🌊 파도' }, { id: 'forest', t: '🌲 숲속' }].map(s => (
              <TouchableOpacity key={s.id} style={[S.nb, { borderColor: app.settings.soundId === s.id ? T.accent : T.border, backgroundColor: app.settings.soundId === s.id ? T.accent : T.card }]} onPress={() => app.updateSettings({ soundId: s.id })}><Text style={[S.nbT, { color: app.settings.soundId === s.id ? 'white' : T.text }]}>{s.t}</Text></TouchableOpacity>
            ))}
          </View></View>

        {/* 타임어택 / 커스텀 */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 }}>
          <TouchableOpacity style={[S.favCell, { flex: 1, backgroundColor: '#6C5CE710', borderColor: '#6C5CE7' }]} onPress={startLapTimer}>
            <Text style={S.favCellIcon}>⏱️</Text>
            <Text style={[S.favCellLabel, { color: '#6C5CE7', fontSize: 8, lineHeight: 11 }]}>타임어택{'\n'}스톱워치</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.favCell, { flex: 1, backgroundColor: T.accent, borderColor: T.accent }]} onPress={() => { setShowAdd(true); setAddType('countdown'); setSeqItems([]); setSeqName(''); }}>
            <Text style={S.favCellIcon}>⚙️</Text>
            <Text style={[S.favCellLabel, { color: 'white' }]}>커스텀 타이머</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ═══════════ 기록 스톱워치 하단 패널 ═══════════ */}
      {lapTimer && (
        <View style={[S.lapPanel, { backgroundColor: T.card, borderColor: '#6C5CE7' }]}>
          {/* 시간 + 컨트롤 */}
          <View style={S.lapHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[S.lapTitle, { color: '#6C5CE7' }]}>⏱️ 타임어택</Text>
              <Text style={[S.lapBigTime, { color: lapTimer.status === 'running' ? '#6C5CE7' : T.sub }]}>{formatTime(lapTimer.elapsedSec)}</Text>
            </View>
            <View style={S.lapMiniCtrls}>
              {lapTimer.status === 'running' ? (
                <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: '#E8404720' }]} onPress={() => app.pauseTimer(lapTimer.id)}>
                  <Text style={[S.lapMiniBtnT, { color: '#E84047' }]}>⏸</Text></TouchableOpacity>
              ) : (
                <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: '#6C5CE7' }]} onPress={() => { app.resumeTimer(lapTimer.id); }}>
                  <Text style={S.lapMiniBtnT}>▶</Text></TouchableOpacity>
              )}
              <TouchableOpacity style={[S.lapMiniBtn, { backgroundColor: T.surface2 }]} onPress={() => app.stopTimer(lapTimer.id)}>
                <Text style={[S.lapMiniBtnT, { color: T.sub }]}>■</Text></TouchableOpacity>
            </View>
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
          {/* 큰 기록/시작 버튼 */}
          <TouchableOpacity
            style={[S.lapBigRecordBtn, { backgroundColor: lapTimer.status === 'running' ? '#F5A623' : lapTimer.elapsedSec === 0 ? '#6C5CE7' : T.surface2 }]}
            onPress={() => {
              if (lapTimer.status === 'running') app.addLap(lapTimer.id);
              else if (lapTimer.elapsedSec === 0) app.resumeTimer(lapTimer.id);
            }}
            activeOpacity={0.7}>
            <Text style={[S.lapBigRecordT, { color: lapTimer.status === 'running' ? 'white' : lapTimer.elapsedSec === 0 ? 'white' : T.sub }]}>
              {lapTimer.status === 'running' ? '⏱️ 랩 기록' : lapTimer.elapsedSec === 0 ? '▶ 타임어택 시작' : '⏸ 일시정지 중'}
            </Text>
            {(lapTimer.laps || []).length > 0 && lapTimer.status === 'running' && (
              <Text style={S.lapBigRecordSub}>
                #{(lapTimer.laps || []).length + 1} · 구간 {formatTime(lapTimer.elapsedSec - ((lapTimer.laps || []).length > 0 ? lapTimer.laps[lapTimer.laps.length - 1].totalTime : 0))}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 완료된 기록 스톱워치 하단 */}
      {!lapTimer && lapDone && (
        <View style={[S.lapPanel, S.lapPanelDone, { backgroundColor: T.card, borderColor: '#6C5CE730' }]}>
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
          <View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[S.modalTitle, { color: T.text }]}>📝 한줄 메모</Text>
            <Text style={[{ fontSize: 11, color: T.sub, marginBottom: 8, textAlign: 'center' }]}>오늘 이 공부, 한 줄로 남겨봐요</Text>
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
            <Text style={[{ fontSize: 9, color: T.sub, textAlign: 'right', marginBottom: 12 }]}>{memoText.length}/50</Text>
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

      {/* 할일 수정 모달 */}
      <Modal visible={!!editTodoId} transparent animationType="fade">
        <View style={S.mo}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }]}>
          <Text style={[S.modalTitle, { color: T.text }]}>할 일 수정</Text>
          <TextInput value={editTodoText} onChangeText={setEditTodoText} multiline style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text, minHeight: 60, textAlignVertical: 'top' }]} autoFocus />
          <View style={S.mBtns}>
            <TouchableOpacity style={[S.mCancel, { borderColor: T.border }]} onPress={() => setEditTodoId(null)}><Text style={[S.mCancelT, { color: T.sub }]}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[S.mConfirm, { backgroundColor: T.accent }]} onPress={() => {
              if (editTodoText.trim() && editTodoId) { app.removeTodo(editTodoId); app.addTodo(editTodoText.trim()); }
              setEditTodoId(null);
            }}><Text style={S.mConfirmT}>저장</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      {/* ═══ 즐겨찾기 편집 모달 ═══ */}
      <Modal visible={showFavMgr} transparent animationType="fade">
        <View style={S.mo}><ScrollView contentContainerStyle={S.moScroll}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }]}>
          <Text style={[S.modalTitle, { color: T.text }]}>⭐ 즐겨찾기 편집</Text>
          <Text style={[S.favSecLabel, { color: T.sub }]}>현재 ({favs.length}/6) · 탭하면 삭제</Text>
          <View style={S.favMgrGrid}>{favs.map(f => (
            <TouchableOpacity key={f.id} style={[S.favMgrChip, { backgroundColor: f.color + '15', borderColor: f.color }]} onPress={() => removeFav(f.id)}>
              <Text style={S.favMgrIcon}>{f.icon}</Text><Text style={[S.favMgrChipT, { color: f.color }]} numberOfLines={1}>{f.label}</Text><Text style={[S.favMgrX, { color: f.color }]}>×</Text></TouchableOpacity>
          ))}</View>
          {favs.length < 6 && (<>
            <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>🍅 뽀모도로 / ⏰ 타임어택</Text>
            <View style={S.favMgrGrid}>{[
              { label: '뽀모 25+5', icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 25, pomoBreakMin: 5 },
              { label: '뽀모 50+10', icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 50, pomoBreakMin: 10 },
              { label: '뽀모 15+5', icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 15, pomoBreakMin: 5 },
              { label: '3분 어택', icon: '⏰', type: 'countdown', color: '#6C5CE7', totalSec: 180 },
              { label: '5분 어택', icon: '⏰', type: 'countdown', color: '#6C5CE7', totalSec: 300 },
              { label: '10분 어택', icon: '⏰', type: 'countdown', color: '#6C5CE7', totalSec: 600 },
              { label: '카운트업', icon: '⏱', type: 'lap', color: '#6C5CE7' },
            ].map(item => { const ex = favs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.label} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && addToFav(item)} disabled={ex}>
                <Text style={S.favAddIcon}>{item.icon}</Text><Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 10, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 12, fontWeight: '800', color: item.color }}>+</Text>}</TouchableOpacity>); })}</View>
            <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>📘 학습법</Text>
            <View style={S.favMgrGrid}>{[
              { label: '미션스프린트', icon: '🚀', type: 'countdown', color: '#FF6B6B', totalSec: 300 },
              { label: '52/17 법칙', icon: '⏱️', type: 'sequence', color: '#4A90D9', totalSec: 0, seqItems: [{label:'집중',color:'#4A90D9',min:52},{label:'휴식',color:'#27AE60',min:17,isBreak:true}], seqBreak: 17 },
              { label: '울트라디안 90분', icon: '🌊', type: 'countdown', color: '#9B59B6', totalSec: 5400 },
              { label: '하드스타트', icon: '⚡', type: 'countdown', color: '#E67E22', totalSec: 900 },
              { label: '인터리빙', icon: '🔀', type: 'countdown', color: '#16A085', totalSec: 1200 },
              { label: '소리+묵독', icon: '📢', type: 'countdown', color: '#E8575A', totalSec: 1800 },
            ].map(item => { const ex = favs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.label} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && addToFav(item)} disabled={ex}>
                <Text style={S.favAddIcon}>{item.icon}</Text><Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 10, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 12, fontWeight: '800', color: item.color }}>+</Text>}</TouchableOpacity>); })}</View>
            <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>🎒 초등 루틴</Text>
            <View style={S.favMgrGrid}>{[
              { label: '초1-2 저학년', icon: '👧', type: 'sequence', color: '#F5A623', totalSec: 0, seqItems: [{label:'숙제',color:'#F5A623',min:15},{label:'국어',color:'#E8575A',min:15}], seqBreak: 5 },
              { label: '초3-4 중학년', icon: '🧒', type: 'sequence', color: '#00B894', totalSec: 0, seqItems: [{label:'숙제',color:'#00B894',min:20},{label:'수학',color:'#4A90D9',min:20}], seqBreak: 5 },
            ].map(item => { const ex = favs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.label} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && addToFav(item)} disabled={ex}>
                <Text style={S.favAddIcon}>{item.icon}</Text><Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 10, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 12, fontWeight: '800', color: item.color }}>+</Text>}</TouchableOpacity>); })}</View>
            <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>🎒 중등 루틴</Text>
            <View style={S.favMgrGrid}>{[
              { label: '중1-2 저학년', icon: '👦', type: 'sequence', color: '#5CB85C', totalSec: 0, seqItems: [{label:'숙제',color:'#5CB85C',min:25},{label:'영어',color:'#16A085',min:25}], seqBreak: 5 },
              { label: '중3 고학년', icon: '👨', type: 'sequence', color: '#4A90D9', totalSec: 0, seqItems: [{label:'수학',color:'#4A90D9',min:30},{label:'영어',color:'#16A085',min:25},{label:'과학',color:'#E17055',min:25}], seqBreak: 5 },
            ].map(item => { const ex = favs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.label} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && addToFav(item)} disabled={ex}>
                <Text style={S.favAddIcon}>{item.icon}</Text><Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 10, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 12, fontWeight: '800', color: item.color }}>+</Text>}</TouchableOpacity>); })}</View>
            <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>🎒 고등 루틴</Text>
            <View style={S.favMgrGrid}>{[
              { label: '고1-2 저학년', icon: '👨‍🎓', type: 'sequence', color: '#9B6FC3', totalSec: 0, seqItems: [{label:'수학',color:'#4A90D9',min:30},{label:'국어',color:'#E8575A',min:25}], seqBreak: 5 },
              { label: '고3 수능준비', icon: '🎯', type: 'sequence', color: '#E17055', totalSec: 0, seqItems: [{label:'국어',color:'#E8575A',min:40},{label:'수학',color:'#4A90D9',min:40},{label:'영어',color:'#16A085',min:30}], seqBreak: 10 },
            ].map(item => { const ex = favs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.label} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && addToFav(item)} disabled={ex}>
                <Text style={S.favAddIcon}>{item.icon}</Text><Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 10, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 12, fontWeight: '800', color: item.color }}>+</Text>}</TouchableOpacity>); })}</View>
          </>)}
          <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => { app.setFavs?.(getSchoolDefaultFavs(school)); app.showToastCustom('기본 복원!', 'toru'); }}><Text style={[S.favResetT, { color: T.sub }]}>기본으로 복원</Text></TouchableOpacity>
          <TouchableOpacity style={[S.favDoneBtn, { backgroundColor: T.accent }]} onPress={() => setShowFavMgr(false)}><Text style={S.favDoneBtnT}>완료</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>

      {/* ═══ 공부량 즐겨찾기 편집 모달 ═══ */}
      <Modal visible={showCountupFavMgr} transparent animationType="fade">
        <View style={S.mo}><ScrollView contentContainerStyle={S.moScroll}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }]}>
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
                {ex ? <Text style={{ fontSize: 10, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 12, fontWeight: '800', color: item.color }}>+</Text>}
              </TouchableOpacity>
            ); })}</View>
            {app.subjects.length > 0 && (<>
              <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>📝 내 과목</Text>
              <View style={S.favMgrGrid}>{app.subjects.map(subj => { const ex = countupFavs.some(f => f.label === subj.name); return (
                <TouchableOpacity key={subj.id} style={[S.favAddChip, { borderColor: ex ? T.border : subj.color + '60', backgroundColor: ex ? T.surface2 : subj.color + '08' }]} onPress={() => !ex && app.addCountupFav({ label: subj.name, icon: '📚', color: subj.color })} disabled={ex}>
                  <Text style={S.favAddIcon}>📚</Text>
                  <Text style={[S.favAddChipT, { color: ex ? T.sub : subj.color }]}>{subj.name}</Text>
                  {ex ? <Text style={{ fontSize: 10, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 12, fontWeight: '800', color: subj.color }}>+</Text>}
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
        <View style={S.mo}><ScrollView contentContainerStyle={S.moScroll}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }]}>
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
                  <Text style={{ fontSize: 9, fontWeight: '700', color: T.green, flex: 1 }}>☕ 쉬는시간</Text>
                ) : (
                  <TextInput value={it.label} onChangeText={(v) => setSeqItems(p => p.map((x, idx) => idx === i ? { ...x, label: v } : x))}
                    placeholder="항목명" placeholderTextColor={T.sub} maxLength={10}
                    style={{ flex: 1, fontSize: 10, fontWeight: '700', color: T.text, paddingVertical: 2, paddingHorizontal: 4, borderWidth: 1, borderColor: T.border, borderRadius: 5, backgroundColor: T.surface, minWidth: 50 }} />
                )}
                <TouchableOpacity style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }} onPress={() => setSeqItems(p => p.map((x, idx) => idx === i ? { ...x, min: Math.max(1, x.min - 5) } : x))}><Text style={{ fontSize: 11, fontWeight: '800', color: T.text }}>-</Text></TouchableOpacity>
                <Text style={{ fontSize: 11, fontWeight: '900', color: it.isBreak ? T.green : T.accent, minWidth: 30, textAlign: 'center' }}>{it.min}분</Text>
                <TouchableOpacity style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }} onPress={() => setSeqItems(p => p.map((x, idx) => idx === i ? { ...x, min: Math.min(180, x.min + 5) } : x))}><Text style={{ fontSize: 11, fontWeight: '800', color: T.text }}>+</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setSeqItems(p => p.filter((_, idx) => idx !== i))}><Text style={{ fontSize: 13, fontWeight: '700', color: T.red, paddingHorizontal: 2 }}>✕</Text></TouchableOpacity>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.accent, alignItems: 'center' }} onPress={() => setSeqItems(p => [...p, { label: '', color: '#4A90D9', min: 25, isBreak: false }])}><Text style={{ fontSize: 10, fontWeight: '700', color: T.accent }}>+ 항목</Text></TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.green, alignItems: 'center' }} onPress={() => setSeqItems(p => [...p, { label: '쉬는시간', color: '#27AE60', min: 5, isBreak: true }])}><Text style={{ fontSize: 10, fontWeight: '700', color: T.green }}>+ ☕ 쉬는시간</Text></TouchableOpacity>
            </View>
            {seqItems.length > 0 && <Text style={{ fontSize: 10, color: T.sub, textAlign: 'center', marginBottom: 4 }}>총 약 {seqItems.reduce((s, it) => s + it.min, 0)}분 ({seqItems.filter(it => !it.isBreak).length}개 항목)</Text>}
          </View>)}
          {addType !== 'sequence' ? (<View style={S.mBtns}>
            <TouchableOpacity style={[S.mCancel, { borderColor: T.border }]} onPress={() => setShowAdd(false)}><Text style={[S.mCancelT, { color: T.sub }]}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[S.mConfirm, { backgroundColor: T.accent }]} onPress={handleAddTimer}><Text style={S.mConfirmT}>▶ 시작</Text></TouchableOpacity></View>
          ) : (<View style={{ gap: 6 }}>
            <TouchableOpacity style={[S.mConfirm, { backgroundColor: T.accent, paddingVertical: 11 }]} onPress={handleStartSeq}><Text style={S.mConfirmT}>▶ 바로 시작</Text></TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: T.accent, alignItems: 'center' }} onPress={handleSaveSeq}><Text style={{ fontSize: 11, fontWeight: '700', color: T.accent }}>⭐ 즐겨찾기에 저장</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(false)}><Text style={{ fontSize: 13, fontWeight: '600', color: T.sub, textAlign: 'center', paddingVertical: 6 }}>취소</Text></TouchableOpacity>
          </View>)}
        </View></ScrollView></View>
      </Modal>

      {/* 잠금 해제 챌린지 모달 */}
      <Modal visible={!!app.ultraFocus?.showChallenge} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={S.chalOverlay}>
          <View style={[S.chalBox, { backgroundColor: T.card }]}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={90} mood="sad" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: T.text, marginTop: 10 }}>
              {app.settings.mainCharacter === 'toru' ? '토루가 울고 있어...' : app.settings.mainCharacter === 'paengi' ? '팽이가 슬퍼하고 있어...' : app.settings.mainCharacter === 'taco' ? '타코가 실망했어...' : '토토루가 속상해...'}
            </Text>
            <View style={[S.chalInfo, { backgroundColor: '#FF6B6B12', borderColor: '#FF6B6B40' }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FF6B6B' }}>📱 이탈 시간</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#FF6B6B', marginTop: 4 }}>
                {challengeAwayMin > 0 ? `${challengeAwayMin}분 ${challengeAwaySec}초` : `${challengeAwaySec}초`}
              </Text>
              <Text style={{ fontSize: 10, color: T.sub, marginTop: 4 }}>총 {app.ultraFocus?.exitCount || 0}번 이탈</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub, marginTop: 14 }}>다시 집중하려면 아래 문구를 따라 쓰세요</Text>
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
              <Text style={{ fontSize: 11, color: T.sub, textDecorationLine: 'underline' }}>그만하기</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🔒 잠금 오버레이 (🔥모드 전용) - 풀스크린 모달 */}
      <Modal visible={screenLocked} transparent animationType="none">
        <View style={S.lockOverlay} pointerEvents="box-none">
          <View style={S.lockOverlayBg} pointerEvents="auto">
            {/* 첫 사용 한 줄 가이드 */}
            {!app.settings.guideLock && (
              <TouchableOpacity onPress={() => app.updateSettings({ guideLock: true })}
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 16 }}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '700', textAlign: 'center' }}>
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
                if (rt.type === 'countdown' || rt.type === 'sequence') {
                  d = Math.max(0, rt.totalSec - rt.elapsedSec);
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
            <View style={S.lockSlideWrap}>
              <Animated.Text style={[S.lockSlideHint, { opacity: slideOpacity }]}>🔓 옆으로 밀어서 잠금 해제</Animated.Text>
              <View style={[S.lockSlideTrack, { width: SLIDE_WIDTH }]}>
                <Animated.View style={[S.lockSlideThumb, { transform: [{ translateX: slideX }] }]} {...panResponder.panHandlers}>
                  <Text style={{ fontSize: 22, color: '#000000', fontWeight: '900' }}>→</Text>
                </Animated.View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 완료 결과 + 자기평가 ── */}
      <Modal visible={!!app.completedResultData} transparent animationType="slide" onRequestClose={() => { const data = app.completedResultData; app.setCompletedResultData(null); if (data?.timerId) app.removeTimer(data.timerId); setResultSelfRating(null); setResultMemo(''); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[S.mo, { justifyContent: 'flex-end' }]}>
          <View style={[S.selfRatingSheet, { backgroundColor: T.bg }]}>
            <View style={[S.selfRatingHandle, { backgroundColor: T.border }]} />
            <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 2 }}>🎉</Text>
            <Text style={[S.selfRatingTitle, { color: T.text }]}>공부 완료!</Text>
            {/* 결과 정보 */}
            {app.completedResultData?.result && (
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                {app.completedResultData.result.tier && (
                  <View style={[S.resTier, { backgroundColor: app.completedResultData.result.tier.color + '20', marginBottom: 4 }]}>
                    <Text style={[S.resTierT, { color: app.completedResultData.result.tier.color }]}>{app.completedResultData.result.tier.label}</Text>
                  </View>
                )}
                <Text style={{ fontSize: 22, fontWeight: '900', color: app.completedResultData.result.tier?.color || T.accent }}>
                  밀도 {app.completedResultData.result.density || 0}점
                </Text>
                <Text style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>
                  {formatDuration(app.completedResultData.result.durationSec || 0)}
                  {app.completedResultData.isSeq ? ` · ${app.completedResultData.seqTotal}개 항목 완주` : ''}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', marginBottom: 12 }}>오늘 공부 어땠나요?</Text>
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
                  <Text style={{ fontSize: 11, fontWeight: '800', color: T.text, textAlign: 'center' }}>{opt.label}</Text>
                  <Text style={{ fontSize: 9, color: opt.color, fontWeight: '700', marginTop: 3 }}>{opt.bonus}</Text>
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
                if (data?.seqSessionIds?.length) {
                  // 연속모드: 모든 구간 세션에 자기평가 일괄 적용
                  data.seqSessionIds.forEach(id => {
                    app.updateSessionSelfRating(id, resultSelfRating, resultMemo.trim() || null);
                  });
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
              <Text style={{ fontSize: 12, color: T.sub }}>건너뛰기</Text>
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
  container: { flex: 1 }, scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800' }, headerSub: { fontSize: 9, marginTop: 1 },
  darkBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ddayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  ddayCell: { width: (SW - 32 - 12) / 4, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  ddayCellLabel: { fontSize: 7, fontWeight: '700' }, ddayCellVal: { fontSize: 9, fontWeight: '900', marginTop: 1 },
  planCard: { borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  planCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  planCardTitle: { fontSize: 13, fontWeight: '800' },
  planEditBtn: { fontSize: 12, fontWeight: '700' },
  planFixedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
  planFixedIcon: { fontSize: 13 },
  planFixedLabel: { flex: 1, fontSize: 11 },
  planFixedTime: { fontSize: 10 },
  planDivider: { height: 1, marginHorizontal: 12, marginVertical: 4 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  planRowIcon: { fontSize: 16 },
  planLabel: { fontSize: 12, fontWeight: '600' },
  planMiniTrack: { height: 3, borderRadius: 2, marginTop: 3, overflow: 'hidden' },
  planMiniFill: { height: 3, borderRadius: 2 },
  planTime: { fontSize: 10, minWidth: 54, textAlign: 'right' },
  planAction: { width: 32, alignItems: 'center' },
  planPlayBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  planPlayBtnT: { color: 'white', fontSize: 10, fontWeight: '800' },
  planProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, paddingTop: 4 },
  planProgTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  planProgFill: { height: 5, borderRadius: 3 },
  planProgLabel: { fontSize: 10, fontWeight: '700', minWidth: 52, textAlign: 'right' },
  progCard: { borderRadius: 12, padding: 10, borderWidth: 1, marginBottom: 8 },
  progRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progLabel: { fontSize: 10, fontWeight: '600' }, progVal: { fontSize: 15, fontWeight: '900' },
  progTrack: { height: 5, borderRadius: 3, overflow: 'hidden' }, progFill: { height: '100%', borderRadius: 3 },
  quickSec: { borderRadius: 14, padding: 10, borderWidth: 1, marginBottom: 8 },
  quickHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quickTitle: { fontSize: 13, fontWeight: '800' }, quickEdit: { fontSize: 10, fontWeight: '700' },
  quickBody: {},
  favGrid: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  favCell: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, minHeight: 62, alignItems: 'center', justifyContent: 'center' },
  favCellIcon: { fontSize: 18, marginBottom: 2 }, favCellLabel: { fontSize: 9, fontWeight: '700' },
  favEmpty: { fontSize: 10, padding: 10 },
  customBtn: { borderRadius: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 },
  customBtnIcon: { fontSize: 13 }, customBtnLabel: { color: 'white', fontSize: 11, fontWeight: '800' },
  queueCard: { borderRadius: 14, padding: 10, borderWidth: 1.5, marginBottom: 8 },
  queueTitle: { fontSize: 12, fontWeight: '800' }, queueCancel: { fontSize: 11, fontWeight: '700' },
  timerFixedArea: { borderBottomWidth: 1 },
  timerSec: { marginBottom: 8 }, secTitle: { fontSize: 10, fontWeight: '700', marginBottom: 5 },
  timerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tc: { borderRadius: 12, padding: 10 },
  tcTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  tcIcon: { fontSize: 12 }, tcLabel: { flex: 1, fontSize: 10, fontWeight: '700' }, tcClose: { fontSize: 13, fontWeight: '600' },
  tcPhase: { fontSize: 8, fontWeight: '700', marginBottom: 1 },
  tcTime: { fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center', marginVertical: 3 },
  tcElapsed: { fontSize: 8, textAlign: 'center', marginBottom: 2 },
  tcTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginBottom: 5 }, tcFill: { height: '100%', borderRadius: 2 },
  tcCtrls: { flexDirection: 'row', gap: 4 },
  tcBtn: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' }, tcBtnT: { color: 'white', fontSize: 11, fontWeight: '800' },
  resArea: { alignItems: 'center', paddingVertical: 4 }, resEmoji: { fontSize: 18, marginBottom: 2 },
  resTier: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6, marginBottom: 2 },
  resTierT: { fontSize: 14, fontWeight: '900' }, resDensity: { fontSize: 10, fontWeight: '700' }, resTime: { fontSize: 8, marginTop: 1 },
  memoBtn: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, maxWidth: '100%' },
  memoBtnT: { fontSize: 10, fontWeight: '600' },
  memoInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 4 },
  noiseCard: { borderRadius: 12, padding: 8, borderWidth: 1, marginBottom: 8 }, noiseRow: { flexDirection: 'row', gap: 4 },
  nb: { flex: 1, paddingHorizontal: 4, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignItems: 'center' }, nbT: { fontSize: 9, fontWeight: '600' },
  volTrack: { flexDirection: 'row', gap: 2, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4, borderRadius: 6 },
  volDot: { width: 8, height: 8, borderRadius: 4 },
  todoCard: { borderRadius: 12, padding: 10, borderWidth: 1 },
  todoH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  todoTitle: { fontSize: 12, fontWeight: '700' }, todoCnt: { fontSize: 9 },
  todoInput: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, fontSize: 11, marginBottom: 4 },
  todoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingVertical: 3 },
  todoCk: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  todoCkM: { color: 'white', fontSize: 10, fontWeight: '800' }, todoText: { flex: 1, fontSize: 11, lineHeight: 16 }, todoDel: { fontSize: 14, paddingHorizontal: 3 },
  lapPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 2, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.15, shadowRadius: 8 },
  lapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lapTitle: { fontSize: 11, fontWeight: '700' },
  lapBigTime: { fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lapMiniCtrls: { flexDirection: 'row', gap: 6 },
  lapMiniBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lapMiniBtnT: { color: 'white', fontSize: 14, fontWeight: '800' },
  lapListToggle: { fontSize: 9, fontWeight: '700', textAlign: 'center', marginVertical: 4 },
  lapListScroll: { maxHeight: 120 },
  lapListRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5 },
  lapListNum: { fontSize: 10, fontWeight: '600', width: 28 },
  lapListSplit: { fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'center' },
  lapListTotal: { fontSize: 10, width: 50, textAlign: 'right' },
  lapBigRecordBtn: { marginTop: 8, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  lapBigRecordT: { fontSize: 17, fontWeight: '900' },
  lapDoneBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  lapDoneBtnT: { color: 'white', fontSize: 12, fontWeight: '800' },
  mo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }, moScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 30 },
  selfRatingSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  selfRatingHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  selfRatingTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  selfRatingBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  modal: { borderRadius: 20, padding: 16, borderWidth: 1 }, modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  favSecLabel: { fontSize: 10, fontWeight: '700', marginBottom: 6 },
  favMgrGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  favMgrChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  favMgrIcon: { fontSize: 11 }, favMgrChipT: { fontSize: 10, fontWeight: '700' }, favMgrX: { fontSize: 13, fontWeight: '600' },
  favAddChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  favAddIcon: { fontSize: 11 }, favAddChipT: { fontSize: 9, fontWeight: '600', maxWidth: 90 },
  favResetT: { fontSize: 10, fontWeight: '600' },
  favDoneBtn: { marginTop: 12, paddingVertical: 11, borderRadius: 10, alignItems: 'center' }, favDoneBtnT: { color: 'white', fontSize: 13, fontWeight: '800' },
  ms: { marginBottom: 14 }, ml: { fontSize: 10, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  typeRow: { flexDirection: 'row', borderRadius: 10, padding: 2, gap: 2, marginBottom: 14 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }, typeBtnT: { fontSize: 10, fontWeight: '700' },
  presetRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 },
  pc: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 }, pcT: { fontSize: 9, fontWeight: '700' },
  mBtns: { flexDirection: 'row', gap: 8 },
  mCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center' }, mCancelT: { fontSize: 13, fontWeight: '600' },
  mConfirm: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' }, mConfirmT: { color: 'white', fontSize: 13, fontWeight: '800' },
  // 울트라 포커스 + 모드
  ultraBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  ultraBannerTitle: { fontSize: 12, fontWeight: '800' }, ultraBannerSub: { fontSize: 10, marginTop: 2 },
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
  lockOverlay: { flex: 1, zIndex: 999 },
  lockOverlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  lockMsg: { fontSize: 16, fontWeight: '800', color: 'white', marginTop: 14, textAlign: 'center' },
  lockTimer: { fontSize: 52, fontWeight: '900', color: 'white', letterSpacing: 4, marginBottom: 6 },
  lockModeBadge: { fontSize: 12, fontWeight: '700', color: '#FF6B6B', marginBottom: 20 },
  lockPauseBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#FFB74D60', marginBottom: 20 },
  lockPauseBtnT: { fontSize: 12, fontWeight: '700', color: '#FFB74D' },
  lockSlideWrap: { alignItems: 'center', position: 'absolute', bottom: 80, left: 0, right: 0 },
  lockSlideHint: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginBottom: 14, letterSpacing: 1 },
  lockSlideTrack: { height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center' },
  lockSlideThumb: { width: 56, height: 54, borderRadius: 27, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
