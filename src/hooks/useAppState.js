// src/hooks/useAppState.js
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';

const SOUND_FILES = {
  rain:   require('../../assets/sounds/rain.mp3'),
  cafe:   require('../../assets/sounds/cafe.mp3'),
  fire:   require('../../assets/sounds/fire.mp3'),
  wave:   require('../../assets/sounds/wave.mp3'),
  forest: require('../../assets/sounds/forest.mp3'),
};
import { saveSettings, loadSettings, saveSubjects, loadSubjects, saveSessions, loadSessions, saveDDays, loadDDays, saveTodos, loadTodos } from '../utils/storage';
import { getToday, generateId } from '../utils/format';
import { calculateDensity } from '../utils/density';
import { getRandomMessage } from '../constants/characters';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const DEFAULT_SETTINGS = {
  mainCharacter: 'toru', dailyGoalMin: 360, pomodoroWorkMin: 25, pomodoroBreakMin: 5,
  soundId: 'none', soundVolume: 70, darkMode: false, notifEnabled: true,
  ultraFocusLevel: 'focus', // 'normal' | 'focus' | 'exam' (🔥모드 잠금 강도)
  challengeText: '', // 커스텀 챌린지 문구 (빈 값이면 기본 문구 사용)
  streak: 0, lastStudyDate: '', onboardingDone: false,
  schoolLevel: 'high', accentColor: 'pink', fontScale: 'medium', fontFamily: 'default',
  // 가이드 플래그 (한 번 보면 다시 안 뜸)
  guideMode: false,     // 🔥/📖 모드 선택 설명
  guideDensity: false,  // 집중밀도 설명
  guideHeatmap: false,  // 잔디 설명
  guideLock: false,     // 잠금 화면 설명
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [subjects, setSubjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [ddays, setDDays] = useState([]);
  const [todos, setTodos] = useState([]);

  // ═══ 멀티타이머 ═══
  // status: 'running'|'paused'|'completed'|'waiting' (순차 대기)
  const [timers, setTimers] = useState([]);
  const timersRef = useRef([]); timersRef.current = timers;

  // 순차 실행 큐
  const [queue, setQueue] = useState(null);
  // queue: { id, items: [{label,color,totalSec,subjectId,type}], currentIndex, breakSec, status:'running'|'break'|'done' }

  // 1초 틱
  useEffect(() => {
    const id = setInterval(() => {
      // 일반 타이머 틱
      setTimers(prev => {
        if (!prev.some(t => t.status === 'running')) return prev;
        return prev.map(t => {
          if (t.status !== 'running') return t;
          const next = { ...t, elapsedSec: t.elapsedSec + 1 };
          // 랩 스톱워치는 무한
          if (t.type === 'lap') return next;
          if (t.type === 'countdown' && next.elapsedSec >= t.totalSec) {
            fireComplete(t); return { ...next, status: 'completed', result: calcResult(t, next.elapsedSec) };
          }
          if (t.type === 'pomodoro') {
            const target = t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60;
            if (next.elapsedSec >= target) return pomoFlip(next);
          }
          if (t.type === 'free') return next;
          return next;
        });
      });

      // 순차 큐 틱
      setQueue(prev => {
        if (!prev || prev.status === 'done') return prev;
        const next = { ...prev, elapsed: (prev.elapsed || 0) + 1 };
        if (prev.status === 'break') {
          if (next.elapsed >= prev.breakSec) {
            // 쉬는시간 끝 → 다음 과목 시작
            return startNextInQueue(next);
          }
          return next;
        }
        // 현재 과목 진행 중 — 타이머가 알아서 처리
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 순차 큐에서 현재 타이머 완료 감지
  useEffect(() => {
    if (!queue || queue.status !== 'running') return;
    const currentItem = queue.items[queue.currentIndex];
    if (!currentItem) return;
    const currentTimer = timers.find(t => t.id === currentItem.timerId);
    if (currentTimer && currentTimer.status === 'completed') {
      // 다음으로 넘어감
      const nextIndex = queue.currentIndex + 1;
      if (nextIndex >= queue.items.length) {
        setQueue(prev => prev ? { ...prev, status: 'done' } : null);
        fireNotif('📋 순차 실행 완료!', '모든 과목을 끝냈어! 🎉');
        Vibration.vibrate([0, 500, 200, 500]);
      } else {
        // 쉬는시간 시작
        setQueue(prev => prev ? { ...prev, status: 'break', currentIndex: nextIndex, elapsed: 0 } : null);
        fireNotif('☕ 쉬는 시간!', `${queue.breakSec / 60}분 후 다음 과목`);
        Vibration.vibrate([0, 300, 100, 300]);
      }
    }
  }, [timers, queue]);

  const startNextInQueue = (q) => {
    const item = q.items[q.currentIndex];
    if (!item) return { ...q, status: 'done' };
    const timerId = generateId('tmr_');
    const queueMeta = { id: q.id, name: q.name, icon: q.icon, color: q.color, total: q.items.length, myIndex: q.currentIndex, labels: q.items.map(it => it.label) };
    const timer = {
      id: timerId, type: item.type || 'countdown', label: item.label,
      subjectId: item.subjectId || null, color: item.color, totalSec: item.totalSec,
      elapsedSec: 0, status: 'running', pauseCount: 0, createdAt: Date.now(),
      pomoPhase: 'work', pomoSet: 0, pomoWorkMin: 25, pomoBreakMin: 5, result: null, laps: [],
      queueId: q.id, queueIndex: q.currentIndex, queueMeta,
    };
    setTimers(prev => [...prev, timer]);
    // item에 timerId 기록
    const newItems = [...q.items];
    newItems[q.currentIndex] = { ...item, timerId };
    return { ...q, items: newItems, status: 'running', elapsed: 0 };
  };

  // 순차 실행 시작
  const startSequence = useCallback(({ items, breakSec = 600, seqName = '', seqIcon = '📋', seqColor = '#6C5CE7' }) => {
    // 모드 미선택 상태에서 연속모드 → 자동 📖모드
    if (!focusModeRef.current) activateScreenOffMode();
    // items: [{label, color, totalSec, subjectId, type}]
    if (!items.length) return;
    const firstItem = items[0];
    const timerId = generateId('tmr_');
    const queueId = generateId('q_');
    const queueMeta = { id: queueId, name: seqName, icon: seqIcon, color: seqColor, total: items.length, myIndex: 0, labels: items.map(it => it.label) };
    const timer = {
      id: timerId, type: firstItem.type || 'countdown', label: firstItem.label,
      subjectId: firstItem.subjectId || null, color: firstItem.color, totalSec: firstItem.totalSec,
      elapsedSec: 0, status: 'running', pauseCount: 0, createdAt: Date.now(),
      pomoPhase: 'work', pomoSet: 0, pomoWorkMin: 25, pomoBreakMin: 5, result: null, laps: [],
      queueId, queueIndex: 0, queueMeta,
    };
    setTimers(prev => [...prev, timer]);
    const newItems = items.map((it, i) => i === 0 ? { ...it, timerId } : it);
    setQueue({ id: queueId, name: seqName, icon: seqIcon, color: seqColor, items: newItems, currentIndex: 0, breakSec, status: 'running', elapsed: 0 });
    showToast('start');
  }, []);

  const cancelSequence = useCallback(() => {
    setQueue(null);
  }, []);

  // ═══ 집중 모드 (🔥 화면 켜두고 집중 도전 / 📖 화면 끄고 편하게 공부) ═══
  // 'screen_on' = 🔥모드: keep-awake + 이탈감지 + 다크 + 최소밝기
  // 'screen_off' = 📖모드: 조용히 타이머만
  // null = 모드 미선택 (타이머 안 돌아가는 상태)
  const [focusMode, setFocusMode] = useState(null);
  const focusModeRef = useRef(null);
  focusModeRef.current = focusMode;

  // 🔥모드 원래 설정 저장 (복원용)
  const originalDarkMode = useRef(null);
  const originalBrightness = useRef(null);

  // 울트라 포커스 상태 (🔥모드 전용)
  const [ultraFocus, setUltraFocus] = useState({
    isAway: false, awayAt: null, exitCount: 0,
    totalAwayMs: 0, showWarning: false, showChallenge: false,
    challengeAwayMs: 0, gaveUp: false, pauseAllowed: false,
  });
  const ultraRef = useRef(ultraFocus);
  ultraRef.current = ultraFocus;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const bgTime = useRef(null);

  // 🔥모드 활성화
  const activateScreenOnMode = useCallback(async () => {
    try {
      // 원래 설정 저장
      originalDarkMode.current = settings.darkMode;
      try { originalBrightness.current = await Brightness.getBrightnessAsync(); } catch { originalBrightness.current = 0.5; }
      // keep-awake + 다크모드 + 최소밝기
      await activateKeepAwakeAsync('focus');
      if (!settings.darkMode) setSettings(prev => ({ ...prev, darkMode: true }));
      try { await Brightness.setBrightnessAsync(0.05); } catch {}
    } catch {}
    setFocusMode('screen_on');
    setUltraFocus({ isAway: false, awayAt: null, exitCount: 0, totalAwayMs: 0, showWarning: false, showChallenge: false, challengeAwayMs: 0, gaveUp: false, pauseAllowed: false });
  }, [settings.darkMode]);

  // 📖모드 활성화
  const activateScreenOffMode = useCallback(() => {
    setFocusMode('screen_off');
    setUltraFocus({ isAway: false, awayAt: null, exitCount: 0, totalAwayMs: 0, showWarning: false, showChallenge: false, challengeAwayMs: 0, gaveUp: false, pauseAllowed: false });
  }, []);

  // 모드 해제 (모든 타이머 완료/삭제 시)
  const deactivateFocusMode = useCallback(async () => {
    if (focusModeRef.current === 'screen_on') {
      try { deactivateKeepAwake('focus'); } catch {}
      // 원래 설정 복원
      if (originalDarkMode.current !== null) setSettings(prev => ({ ...prev, darkMode: originalDarkMode.current }));
      if (originalBrightness.current !== null) { try { await Brightness.setBrightnessAsync(originalBrightness.current); } catch {} }
      originalDarkMode.current = null;
      originalBrightness.current = null;
    }
    setFocusMode(null);
    setUltraFocus({ isAway: false, awayAt: null, exitCount: 0, totalAwayMs: 0, showWarning: false, showChallenge: false, challengeAwayMs: 0, gaveUp: false, pauseAllowed: false });
  }, []);

  // 🔥모드 이탈 시 밝기/다크 복원, 복귀 시 다시 적용
  const restoreBrightness = async () => {
    if (originalBrightness.current !== null) { try { await Brightness.setBrightnessAsync(originalBrightness.current); } catch {} }
    if (originalDarkMode.current !== null && originalDarkMode.current !== settingsRef.current.darkMode) {
      setSettings(prev => ({ ...prev, darkMode: originalDarkMode.current }));
    }
  };
  const applyFocusBrightness = async () => {
    try { await Brightness.setBrightnessAsync(0.05); } catch {}
    if (!settingsRef.current.darkMode) setSettings(prev => ({ ...prev, darkMode: true }));
  };

  // 챌린지 필요 여부
  const needsChallenge = (level, awayMs) => {
    if (level === 'normal') return false;
    if (level === 'focus') return awayMs >= 60000;
    if (level === 'exam') return awayMs >= 5000;
    return false;
  };

  // 챌린지 문구 (친근한 동기부여 + 커스텀 지원)
  const getChallengeText = (level, awayMs) => {
    // 커스텀 문구가 있으면 우선 사용
    const custom = settingsRef.current.challengeText?.trim();
    if (custom) return custom;

    const cnt = ultraRef.current.exitCount || 0;
    // 기본 문구 풀 (친근 + 동기부여)
    const SHORT = ['다시 열공!', '집중 고고!', '할 수 있어!', '파이팅!'];
    const MID = ['다시 집중해서 열공하자!', '잠깐 쉬었으니 다시 달려보자!', '폰 내려놓고 다시 공부하자!', '목표를 향해 다시 집중!'];
    const LONG = ['잠깐 쉬었으니까 이제 진짜 집중해서 열공하자 파이팅!', '지금 다시 시작하면 충분해 끝까지 집중하자 화이팅!', '포기하지 않는 내가 진짜 대단해 다시 열공 시작!'];
    const pick = (arr) => arr[cnt % arr.length];

    if (level === 'exam') {
      if (cnt >= 5) return pick(LONG);
      if (cnt >= 3) return pick(MID);
      return pick(SHORT);
    }
    if (cnt >= 5) return pick(MID);
    if (cnt >= 3) return pick(SHORT);
    return '집중!';
  };

  // 잠깐 쉬기 (60초간 이탈 허용)
  const pauseAllowRef = useRef(null);
  const allowPause = useCallback(() => {
    setUltraFocus(prev => ({ ...prev, pauseAllowed: true }));
    clearTimeout(pauseAllowRef.current);
    pauseAllowRef.current = setTimeout(() => {
      setUltraFocus(prev => ({ ...prev, pauseAllowed: false }));
      showToastCustom('⏰ 쉬는 시간 끝! 다시 집중!', 'toru');
    }, 60000);
    showToastCustom('⏸️ 60초간 자유시간! 빠르게 다녀와~', 'taco');
  }, []);

  // AppState 핸들링
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const hasRunning = timersRef.current.some(t => t.status === 'running');
      const mode = focusModeRef.current;
      const uf = settingsRef.current;
      const level = uf.ultraFocusLevel || 'focus';
      const isStrict = level === 'exam';

      if (state === 'inactive') { /* 무시 */ }
      else if (state === 'background') {
        bgTime.current = Date.now();

        // 🔥모드에서만 이탈 감지 (keep-awake라서 background = 진짜 이탈)
        if (mode === 'screen_on' && hasRunning && !ultraRef.current.gaveUp && !ultraRef.current.pauseAllowed) {
          setUltraFocus(prev => ({ ...prev, isAway: true, awayAt: Date.now() }));
          const charName = { toru: '토루', paengi: '팽이', taco: '타코', totoru: '토토루' }[uf.mainCharacter] || '토루';
          fireNotif(`${charName}랑 같이 열공하자! 📚`, '타이머가 돌아가고 있어~');
          // 밝기/다크 복원 (다른 앱에서 어두우면 불편)
          restoreBrightness();
        }
        // 📖모드는 아무것도 안 함
      }
      else if (state === 'active') {
        const gap = bgTime.current ? Math.floor((Date.now() - bgTime.current) / 1000) : 0;
        const awayMs = bgTime.current ? Date.now() - bgTime.current : 0;
        bgTime.current = null;
        const wasAway = ultraRef.current.isAway;

        // 🔥모드 복귀 처리
        if (mode === 'screen_on' && wasAway && !ultraRef.current.gaveUp) {
          // 10초 이내 복귀 → 시스템 알림/전화 등으로 간주 → 이탈 아님
          if (awayMs < 10000) {
            setUltraFocus(prev => ({ ...prev, isAway: false, awayAt: null }));
            applyFocusBrightness();
          } else {
            // 10초 이상 → 진짜 이탈
            const challenge = needsChallenge(level, awayMs);
            setUltraFocus(prev => ({
              ...prev, isAway: false, awayAt: null,
              exitCount: prev.exitCount + 1,
              totalAwayMs: prev.totalAwayMs + awayMs,
              showWarning: !challenge, showChallenge: challenge, challengeAwayMs: awayMs,
            }));
            if (!challenge) setTimeout(() => setUltraFocus(prev => ({ ...prev, showWarning: false })), 4000);

            if (isStrict) {
              setTimers(prev => prev.map(t =>
                t.status === 'running' ? { ...t, status: 'paused', pauseCount: (t.pauseCount || 0) + 1, pausedByUltra: true } : t
              ));
            }
            if (!challenge) {
              if (isStrict) showToastCustom('📱 이탈 감지! 타이머가 멈췄어요', 'paengi');
              else { const m = Math.floor(awayMs / 60000); showToastCustom(m >= 1 ? `📱 ${m}분 이탈! 집중하자~` : '📱 돌아왔구나! 집중하자~', 'toru'); }
            }
            // 챌린지 모달이 뜨면 밝기를 원래대로 복원 (문구 입력해야 하니까)
            if (challenge) restoreBrightness();
            else applyFocusBrightness();
          }
        }

        // 잠깐 쉬기 중 복귀
        if (mode === 'screen_on' && ultraRef.current.pauseAllowed && wasAway) {
          setUltraFocus(prev => ({ ...prev, isAway: false, awayAt: null }));
          applyFocusBrightness();
        }

        // 백그라운드 시간 보정 (모드 상관없이)
        if (gap > 1) {
          setTimers(prev => prev.map(t => {
            if (t.status !== 'running') return t;
            const e = t.elapsedSec + gap;
            if (t.type === 'countdown' && e >= t.totalSec) {
              fireComplete(t); return { ...t, elapsedSec: t.totalSec, status: 'completed', result: calcResult(t, t.totalSec) };
            }
            if (t.type === 'pomodoro') {
              const target = t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60;
              if (e >= target) return pomoFlip({ ...t, elapsedSec: e });
            }
            return { ...t, elapsedSec: e };
          }));
          setQueue(prev => {
            if (!prev || prev.status === 'done') return prev;
            return { ...prev, elapsed: (prev.elapsed || 0) + gap };
          });
        }
      }
    });
    return () => sub.remove();
  }, []);

  // 모든 타이머 완료/삭제 시 모드 자동 해제
  useEffect(() => {
    const hasActive = timers.some(t => t.status === 'running' || t.status === 'paused');
    if (!hasActive && focusMode) {
      deactivateFocusMode();
    }
  }, [timers]);

  // 챌린지 성공
  const dismissChallenge = useCallback(() => {
    setUltraFocus(prev => ({ ...prev, showChallenge: false, challengeAwayMs: 0 }));
    if (settingsRef.current.ultraFocusLevel === 'exam') {
      setTimers(prev => prev.map(t => t.pausedByUltra && t.status === 'paused' ? { ...t, status: 'running', pausedByUltra: false } : t));
    }
    // 챌린지 해제 → 다시 최소밝기 + 다크모드
    applyFocusBrightness();
    showToastCustom('💪 다시 집중! 할 수 있어!', 'toru');
  }, []);

  // 포기
  const giveUpFocus = useCallback(async () => {
    setUltraFocus(prev => ({ ...prev, showChallenge: false, gaveUp: true }));
    setTimers(prev => prev.map(t => {
      if (t.status === 'running' || t.status === 'paused') {
        fireComplete(t);
        return { ...t, status: 'completed', result: calcResult(t, t.elapsedSec), gaveUp: true };
      }
      return t;
    }));
    showToastCustom('다음엔 같이 하자... 😴', 'totoru');
  }, []);

  const calcResult = (t, dur) => {
    const mode = focusModeRef.current || 'screen_off';
    const ufState = ultraRef.current;
    const d = calculateDensity({
      pausedCount: t.pauseCount, totalSec: dur,
      timerType: t.type, completionRatio: t.type === 'countdown' ? Math.min(1, dur / Math.max(1, t.totalSec)) : 1,
      pomoSets: t.pomoSet || 0, focusMode: mode,
      exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0,
      todaySessionCount: todaySessions.length, streak: settings.streak,
    });
    const { getTier } = require('../constants/presets');
    return { density: d, tier: getTier(d), focusMode: mode, exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0, verified: mode === 'screen_on' && (ufState.exitCount || 0) === 0 };
  };

  const pomoFlip = (t) => {
    if (t.pomoPhase === 'work') {
      recordSessionInternal({ subjectId: t.subjectId, durationSec: t.pomoWorkMin * 60, mode: 'pomodoro', pauseCount: t.pauseCount });
      fireNotif(`🍅 ${t.label} 집중 완료!`, '쉬는 시간~'); Vibration.vibrate([0, 300, 100, 300]);
      return { ...t, elapsedSec: 0, pomoPhase: (t.pomoSet + 1) % 4 === 0 ? 'longbreak' : 'break', pomoSet: t.pomoSet + 1, pauseCount: 0 };
    }
    fireNotif(`🍅 ${t.label} 휴식 끝!`, '다시 집중!'); Vibration.vibrate([0, 200, 100, 200]);
    return { ...t, elapsedSec: 0, pomoPhase: 'work', pauseCount: 0 };
  };

  const fireComplete = (t) => {
    const mode = focusModeRef.current || 'screen_off';
    const ufState = ultraRef.current;
    const isPerfect = mode === 'screen_on' && ufState.exitCount === 0 && !ufState.gaveUp;
    if (isPerfect && t.elapsedSec >= 300) {
      fireNotif('🏆 퍼펙트 집중!', `${t.label} 이탈 없이 완료! Verified!`);
      Vibration.vibrate([0, 300, 100, 300, 100, 500, 200, 800]);
      showToastCustom('🏆 이탈 0회! Verified!! 🎉', 'taco');
    } else {
      fireNotif(`⏰ ${t.label} 완료!`, '🎉'); Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    }
    if (t.elapsedSec > 10) {
      const exitCnt = mode === 'screen_on' ? (ufState.exitCount || 0) : 0;
      const sessId = recordSessionInternal({
        subjectId: t.subjectId,
        durationSec: t.type === 'countdown' ? t.totalSec : t.elapsedSec,
        mode: t.type, pauseCount: t.pauseCount, exitCount: exitCnt,
        focusMode: mode, timerType: t.type,
        completionRatio: t.type === 'countdown' ? Math.min(1, t.elapsedSec / Math.max(1, t.totalSec)) : 1,
        pomoSets: t.pomoSet || 0,
      });
      setTimers(prev => prev.map(tt => tt.id === t.id ? { ...tt, memoSessionId: sessId } : tt));
    }
  };

  const fireNotif = async (title, body) => {
    try { await Notifications.scheduleNotificationAsync({ content: { title, body, sound: true, vibrate: [0, 300, 100, 300] }, trigger: null }); } catch {}
  };

  // 타이머 조작
  const addTimer = useCallback((opts) => {
    // 모드 미선택 상태에서 타이머 추가 → 자동 📖모드
    if (!focusModeRef.current) activateScreenOffMode();
    const t = {
      id: generateId('tmr_'), type: opts.type || 'free', label: opts.label || '타이머',
      subjectId: opts.subjectId || null, color: opts.color || '#FF6B9D', totalSec: opts.totalSec || 0,
      elapsedSec: 0, status: 'running', pauseCount: 0, createdAt: Date.now(),
      pomoPhase: 'work', pomoSet: 0, pomoWorkMin: opts.pomoWorkMin || 25, pomoBreakMin: opts.pomoBreakMin || 5,
      result: null, laps: [],
    };
    setTimers(prev => [...prev, t]); showToast('start'); return t;
  }, []);

  const pauseTimer = useCallback((id) => setTimers(prev => prev.map(t => t.id === id ? { ...t, status: 'paused', pauseCount: t.pauseCount + 1 } : t)), []);
  const resumeTimer = useCallback((id) => setTimers(prev => prev.map(t => t.id === id && t.status === 'paused' ? { ...t, status: 'running' } : t)), []);

  const stopTimer = useCallback((id) => {
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (t.elapsedSec > 30 && t.status !== 'completed') {
        const sessId = recordSessionInternal({ subjectId: t.subjectId, durationSec: t.elapsedSec, mode: t.type, pauseCount: t.pauseCount });
        return { ...t, status: 'completed', result: t.result || calcResult(t, t.elapsedSec), memoSessionId: sessId };
      }
      return { ...t, status: 'completed', result: t.result || calcResult(t, t.elapsedSec) };
    }));
  }, []);

  const restartTimer = useCallback((id) => {
    setTimers(prev => prev.map(t => t.id === id ? { ...t, elapsedSec: 0, status: 'running', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null, laps: [] } : t));
    showToast('start');
  }, []);

  const resetTimer = useCallback((id) => {
    setTimers(prev => prev.map(t => t.id === id ? { ...t, elapsedSec: 0, status: 'paused', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null, laps: [] } : t));
  }, []);

  const removeTimer = useCallback((id) => setTimers(prev => prev.filter(t => t.id !== id)), []);

  // 랩 기록
  const addLap = useCallback((id) => {
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      const lapNum = (t.laps || []).length + 1;
      const prevLapTime = t.laps?.length > 0 ? t.laps[t.laps.length - 1].totalTime : 0;
      return { ...t, laps: [...(t.laps || []), { num: lapNum, splitTime: t.elapsedSec - prevLapTime, totalTime: t.elapsedSec }] };
    }));
  }, []);

  // ═══ 집중 사운드 ═══
  const soundRef = useRef(null);
  const isSoundLoadingRef = useRef(false); // 로딩 중 중복 방지

  // 사운드 완전 정리 (await 보장)
  const stopAndUnload = async () => {
    const s = soundRef.current;
    soundRef.current = null;
    if (s) {
      try { await s.stopAsync(); } catch {}
      try { await s.unloadAsync(); } catch {}
    }
  };

  // soundId 변경 시
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const run = async () => {
      if (isSoundLoadingRef.current) return;
      isSoundLoadingRef.current = true;
      await stopAndUnload();
      if (cancelled) { isSoundLoadingRef.current = false; return; }
      const { soundId, soundVolume } = settings;
      if (soundId !== 'none' && SOUND_FILES[soundId]) {
        try {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
          const { sound } = await Audio.Sound.createAsync(
            SOUND_FILES[soundId],
            { isLooping: true, volume: (soundVolume ?? 70) / 100 }
          );
          if (cancelled) { try { await sound.unloadAsync(); } catch {} isSoundLoadingRef.current = false; return; }
          soundRef.current = sound;
          await sound.playAsync();
        } catch (e) { console.log('사운드 오류:', e); }
      }
      isSoundLoadingRef.current = false;
    };
    run();
    return () => { cancelled = true; };
  }, [settings.soundId, loading]);

  // 볼륨 변경 시 (사운드 교체 없이 볼륨만)
  useEffect(() => {
    if (loading || !soundRef.current) return;
    soundRef.current.setVolumeAsync((settings.soundVolume ?? 70) / 100).catch(() => {});
  }, [settings.soundVolume, loading]);

  // 앱 종료 시 정리
  useEffect(() => {
    return () => { stopAndUnload(); };
  }, []);

  // 토스트
  const [toast, setToast] = useState({ visible: false, message: '', char: 'toru' });
  const toastRef = useRef(null);
  const showToast = useCallback((type) => {
    const msg = getRandomMessage(type); clearTimeout(toastRef.current);
    setToast({ visible: true, message: msg.text, char: msg.char });
    toastRef.current = setTimeout(() => setToast(p => ({ ...p, visible: false })), 3000);
  }, []);
  const showToastCustom = useCallback((message, char = 'toru') => {
    clearTimeout(toastRef.current);
    setToast({ visible: true, message, char });
    toastRef.current = setTimeout(() => setToast(p => ({ ...p, visible: false })), 3000);
  }, []);

  // 초기 로드
  useEffect(() => {
    (async () => {
      await Notifications.requestPermissionsAsync();
      const [s, subj, sess, dd, td] = await Promise.all([loadSettings(), loadSubjects(), loadSessions(), loadDDays(), loadTodos()]);
      if (s) {
        // 마이그레이션
        if (s.ultraFocusStrict !== undefined && !s.ultraFocusLevel) {
          s.ultraFocusLevel = s.ultraFocusStrict ? 'exam' : 'focus';
          delete s.ultraFocusStrict;
        }
        if (s.ultraFocusEnabled !== undefined) delete s.ultraFocusEnabled;
        setSettings({ ...DEFAULT_SETTINGS, ...s });
      } if (subj) setSubjects(subj);
      if (sess) setSessions(sess); if (dd) setDDays(dd); if (td) setTodos(td);
      setLoading(false);
    })();
  }, []);

  // 자동 저장
  const saveRef = useRef(null);
  useEffect(() => {
    if (loading) return; clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => { saveSettings(settings); saveSubjects(subjects); saveSessions(sessions); saveDDays(ddays); saveTodos(todos); }, 500);
  }, [settings, subjects, sessions, ddays, todos, loading]);

  // 통계
  const todaySessions = sessions.filter(s => s.date === getToday());
  const todayTotalSec = todaySessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
  const runningTimers = timers.filter(t => t.status === 'running');
  const runningTodaySec = runningTimers.length > 0 ? Math.max(...runningTimers.map(t => t.elapsedSec)) : 0;
  const mood = (() => { const t = todayTotalSec + runningTodaySec; const g = settings.dailyGoalMin * 60; if (t >= g * 0.8) return 'happy'; if (t < 600) return 'sad'; return 'normal'; })();

  const recordSessionInternal = useCallback(({ subjectId = null, durationSec, mode = 'free', pauseCount = 0, memo = '', exitCount = 0, focusMode: fm = 'screen_off', timerType = 'free', completionRatio = 1, pomoSets = 0, selfRating = null }) => {
    const density = calculateDensity({
      pausedCount: pauseCount, totalSec: durationSec, timerType, completionRatio, pomoSets,
      focusMode: fm, exitCount, selfRating,
      todaySessionCount: todaySessions.length, streak: settings.streak,
    });
    const { getTier } = require('../constants/presets');
    const tier = getTier(density);
    const verified = fm === 'screen_on' && exitCount === 0;
    const newSess = {
      id: generateId('sess_'), date: getToday(), subjectId,
      startedAt: Date.now() - durationSec * 1000, endedAt: Date.now(),
      durationSec, mode, focusDensity: density, tier: tier.id,
      pausedCount: pauseCount, exitCount, focusMode: fm, verified,
      selfRating, memo: memo.trim(),
    };
    setSessions(prev => [...prev, newSess]);
    if (subjectId) setSubjects(prev => prev.map(s => s.id === subjectId ? { ...s, totalElapsedSec: (s.totalElapsedSec || 0) + durationSec } : s));
    updateStreak();
    return newSess.id;
  }, []);
  const recordSession = recordSessionInternal;

  // 세션 메모 업데이트 (타이머 완료 후 나중에 추가/수정)
  const updateSessionMemo = useCallback((sessionId, memo) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, memo: memo.trim() } : s));
  }, []);

  // 타이머 메모 업데이트 (완료 카드 표시용)
  const updateTimerMemo = useCallback((timerId, memo) => {
    setTimers(prev => prev.map(t => t.id === timerId ? { ...t, memoText: memo } : t));
  }, []);

  const updateStreak = useCallback(() => {
    setSettings(prev => {
      const today = getToday(); if (prev.lastStudyDate === today) return prev;
      const y = new Date(); y.setDate(y.getDate() - 1);
      return { ...prev, streak: (prev.lastStudyDate === y.toISOString().slice(0, 10) || !prev.lastStudyDate) ? prev.streak + 1 : 1, lastStudyDate: today };
    });
  }, []);

  const addSubject = useCallback((s) => { const n = { id: generateId('subj_'), totalElapsedSec: 0, isFavorite: false, createdAt: new Date().toISOString(), ...s }; setSubjects(prev => [...prev, n]); return n; }, []);
  const removeSubject = useCallback((id) => setSubjects(prev => prev.filter(s => s.id !== id)), []);
  const updateSubject = useCallback((id, u) => setSubjects(prev => prev.map(s => s.id === id ? { ...s, ...u } : s)), []);
  const addDDay = useCallback((dd) => { const n = { id: generateId('dd_'), isPrimary: ddays.length === 0, ...dd }; setDDays(prev => [...prev, n]); return n; }, [ddays]);
  const removeDDay = useCallback((id) => { setDDays(prev => { const f = prev.filter(d => d.id !== id); if (f.length > 0 && !f.some(d => d.isPrimary)) f[0].isPrimary = true; return f; }); }, []);
  const setPrimaryDDay = useCallback((id) => setDDays(prev => {
    const target = prev.find(d => d.id === id);
    if (!target) return prev;
    if (target.isPrimary) return prev.map(d => d.id === id ? { ...d, isPrimary: false } : d);
    const cnt = prev.filter(d => d.isPrimary).length;
    if (cnt >= 8) return prev;
    return prev.map(d => d.id === id ? { ...d, isPrimary: true } : d);
  }), []);
  const addTodo = useCallback((text) => setTodos(prev => [...prev, { id: generateId('todo_'), text, done: false }]), []);
  const toggleTodo = useCallback((id) => setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t)), []);
  const removeTodo = useCallback((id) => setTodos(prev => prev.filter(t => t.id !== id)), []);
  const updateSettings = useCallback((u) => setSettings(prev => ({ ...prev, ...u })), []);

  return (
    <AppContext.Provider value={{
      loading, settings, updateSettings,
      subjects, addSubject, removeSubject, updateSubject,
      sessions, todaySessions, todayTotalSec, runningTodaySec, recordSession, updateSessionMemo, updateTimerMemo,
      ddays, addDDay, removeDDay, setPrimaryDDay,
      todos, addTodo, toggleTodo, removeTodo, mood,
      timers, addTimer, pauseTimer, resumeTimer, stopTimer, restartTimer, resetTimer, removeTimer, addLap, setTimers,
      queue, startSequence, cancelSequence,
      toast, showToast, showToastCustom,
      focusMode, activateScreenOnMode, activateScreenOffMode, deactivateFocusMode,
      ultraFocus, setUltraFocus, dismissChallenge, giveUpFocus, getChallengeText, allowPause,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be within AppProvider'); return ctx; };
