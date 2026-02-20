// src/hooks/useAppState.js
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { saveSettings, loadSettings, saveSubjects, loadSubjects, saveSessions, loadSessions, saveDDays, loadDDays, saveTodos, loadTodos } from '../utils/storage';
import { getToday, generateId } from '../utils/format';
import { calculateDensity } from '../utils/density';
import { getRandomMessage } from '../constants/characters';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const DEFAULT_SETTINGS = {
  mainCharacter: 'toru', dailyGoalMin: 360, pomodoroWorkMin: 25, pomodoroBreakMin: 5,
  soundId: 'none', soundVolume: 70, darkMode: false, notifEnabled: true, reminderTime: null,
  ultraFocusStrict: false, streak: 0, lastStudyDate: '', onboardingDone: false,
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [subjects, setSubjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [ddays, setDDays] = useState([]);
  const [todos, setTodos] = useState([]);

  // 멀티타이머
  // status: 'running' | 'paused' | 'completed'
  const [timers, setTimers] = useState([]);
  const timersRef = useRef([]); timersRef.current = timers;

  // 1초 틱
  useEffect(() => {
    const id = setInterval(() => {
      setTimers(prev => {
        if (!prev.some(t => t.status === 'running')) return prev;
        return prev.map(t => {
          if (t.status !== 'running') return t;
          const next = { ...t, elapsedSec: t.elapsedSec + 1 };
          if (t.type === 'countdown' && next.elapsedSec >= t.totalSec) {
            fireComplete(t); return { ...next, status: 'completed', result: calcResult(t, next.elapsedSec) };
          }
          if (t.type === 'pomodoro') {
            const target = t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60;
            if (next.elapsedSec >= target) return pomoFlip(next);
          }
          return next;
        });
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 백그라운드 보정
  const bgTime = useRef(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') { bgTime.current = Date.now(); }
      else if (state === 'active' && bgTime.current) {
        const gap = Math.floor((Date.now() - bgTime.current) / 1000); bgTime.current = null;
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
        }
      }
    });
    return () => sub.remove();
  }, []);

  const calcResult = (t, dur) => {
    const d = calculateDensity({ pausedCount: t.pauseCount, totalSec: dur });
    const { getTier } = require('../constants/presets');
    return { density: d, tier: getTier(d) };
  };

  const pomoFlip = (t) => {
    if (t.pomoPhase === 'work') {
      recordSessionInternal({ subjectId: t.subjectId, durationSec: t.pomoWorkMin * 60, mode: 'pomodoro', pauseCount: t.pauseCount });
      fireNotif(`🍅 ${t.label} 집중 완료!`, '쉬는 시간~');
      Vibration.vibrate([0, 300, 100, 300]);
      return { ...t, elapsedSec: 0, pomoPhase: (t.pomoSet + 1) % 4 === 0 ? 'longbreak' : 'break', pomoSet: t.pomoSet + 1, pauseCount: 0 };
    }
    fireNotif(`🍅 ${t.label} 휴식 끝!`, '다시 집중!');
    Vibration.vibrate([0, 200, 100, 200]);
    return { ...t, elapsedSec: 0, pomoPhase: 'work', pauseCount: 0 };
  };

  const fireComplete = (t) => {
    fireNotif(`⏰ ${t.label} 완료!`, '🎉');
    Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    if (t.elapsedSec > 10) {
      recordSessionInternal({ subjectId: t.subjectId, durationSec: t.type === 'countdown' ? t.totalSec : t.elapsedSec, mode: t.type, pauseCount: t.pauseCount });
    }
  };

  const fireNotif = async (title, body) => {
    try { await Notifications.scheduleNotificationAsync({ content: { title, body, sound: true, vibrate: [0, 300, 100, 300] }, trigger: null }); } catch {}
  };

  // 타이머 조작
  const addTimer = useCallback((opts) => {
    const t = {
      id: generateId('tmr_'), type: opts.type || 'free', label: opts.label || '타이머',
      subjectId: opts.subjectId || null, color: opts.color || '#FF6B9D', totalSec: opts.totalSec || 0,
      elapsedSec: 0, status: 'running', pauseCount: 0, createdAt: Date.now(),
      pomoPhase: 'work', pomoSet: 0, pomoWorkMin: opts.pomoWorkMin || 25, pomoBreakMin: opts.pomoBreakMin || 5,
      result: null,
    };
    setTimers(prev => [...prev, t]); showToast('start'); return t;
  }, []);

  const pauseTimer = useCallback((id) => {
    setTimers(prev => prev.map(t => t.id === id ? { ...t, status: 'paused', pauseCount: t.pauseCount + 1 } : t));
  }, []);

  const resumeTimer = useCallback((id) => {
    setTimers(prev => prev.map(t => t.id === id && t.status === 'paused' ? { ...t, status: 'running' } : t));
  }, []);

  // 종료 (세션 기록 + completed 상태로)
  const stopTimer = useCallback((id) => {
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (t.elapsedSec > 30 && t.status !== 'completed') {
        recordSessionInternal({ subjectId: t.subjectId, durationSec: t.elapsedSec, mode: t.type, pauseCount: t.pauseCount });
      }
      return { ...t, status: 'completed', result: t.result || calcResult(t, t.elapsedSec) };
    }));
  }, []);

  // 다시 시작 (원래 설정으로 리셋 후 재시작)
  const restartTimer = useCallback((id) => {
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      return { ...t, elapsedSec: 0, status: 'running', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null };
    }));
    showToast('start');
  }, []);

  // 리셋 (원래 시간으로 되돌림, 정지 상태)
  const resetTimer = useCallback((id) => {
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      return { ...t, elapsedSec: 0, status: 'paused', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null };
    }));
  }, []);

  // 완전 삭제
  const removeTimer = useCallback((id) => {
    setTimers(prev => prev.filter(t => t.id !== id));
  }, []);

  // 토스트
  const [toast, setToast] = useState({ visible: false, message: '', char: 'toru' });
  const toastRef = useRef(null);
  const showToast = useCallback((type) => {
    const msg = getRandomMessage(type);
    clearTimeout(toastRef.current);
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
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
      if (subj) setSubjects(subj); if (sess) setSessions(sess);
      if (dd) setDDays(dd); if (td) setTodos(td);
      setLoading(false);
    })();
  }, []);

  // 자동 저장
  const saveRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => { saveSettings(settings); saveSubjects(subjects); saveSessions(sessions); saveDDays(ddays); saveTodos(todos); }, 500);
  }, [settings, subjects, sessions, ddays, todos, loading]);

  // 통계
  const todaySessions = sessions.filter(s => s.date === getToday());
  const todayTotalSec = todaySessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
  const runningTimers = timers.filter(t => t.status === 'running');
  const runningTodaySec = runningTimers.length > 0 ? Math.max(...runningTimers.map(t => t.elapsedSec)) : 0;

  const mood = (() => {
    const total = todayTotalSec + runningTodaySec;
    const goal = settings.dailyGoalMin * 60;
    if (total >= goal * 0.8) return 'happy'; if (total < 600) return 'sad'; return 'normal';
  })();

  // 세션 기록
  const recordSessionInternal = useCallback(({ subjectId = null, durationSec, mode = 'free', pauseCount = 0 }) => {
    const density = calculateDensity({ pausedCount: pauseCount, totalSec: durationSec });
    const { getTier } = require('../constants/presets');
    const tier = getTier(density);
    const session = {
      id: generateId('sess_'), date: getToday(), subjectId,
      startedAt: Date.now() - durationSec * 1000, endedAt: Date.now(),
      durationSec, mode, focusDensity: density, tier: tier.id,
      pausedCount: pauseCount, appExitCount: 0, quickReturnCount: 0,
    };
    setSessions(prev => [...prev, session]);
    if (subjectId) setSubjects(prev => prev.map(s => s.id === subjectId ? { ...s, totalElapsedSec: (s.totalElapsedSec || 0) + durationSec } : s));
    updateStreak();
    return { density, tier };
  }, []);
  const recordSession = recordSessionInternal;

  const updateStreak = useCallback(() => {
    const today = getToday();
    setSettings(prev => {
      if (prev.lastStudyDate === today) return prev;
      const y = new Date(); y.setDate(y.getDate() - 1);
      return { ...prev, streak: (prev.lastStudyDate === y.toISOString().slice(0, 10) || !prev.lastStudyDate) ? prev.streak + 1 : 1, lastStudyDate: today };
    });
  }, []);

  // CRUD
  const addSubject = useCallback((s) => { const n = { id: generateId('subj_'), totalElapsedSec: 0, isFavorite: false, createdAt: new Date().toISOString(), ...s }; setSubjects(prev => [...prev, n]); return n; }, []);
  const removeSubject = useCallback((id) => setSubjects(prev => prev.filter(s => s.id !== id)), []);
  const updateSubject = useCallback((id, u) => setSubjects(prev => prev.map(s => s.id === id ? { ...s, ...u } : s)), []);
  const addDDay = useCallback((dd) => { const n = { id: generateId('dd_'), isPrimary: ddays.length === 0, emoji: '📅', ...dd }; setDDays(prev => [...prev, n]); return n; }, [ddays]);
  const removeDDay = useCallback((id) => { setDDays(prev => { const f = prev.filter(d => d.id !== id); if (f.length > 0 && !f.some(d => d.isPrimary)) f[0].isPrimary = true; return f; }); }, []);
  const setPrimaryDDay = useCallback((id) => setDDays(prev => prev.map(d => ({ ...d, isPrimary: d.id === id }))), []);
  const addTodo = useCallback((text) => setTodos(prev => [...prev, { id: generateId('todo_'), text, done: false }]), []);
  const toggleTodo = useCallback((id) => setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t)), []);
  const removeTodo = useCallback((id) => setTodos(prev => prev.filter(t => t.id !== id)), []);
  const updateSettings = useCallback((u) => setSettings(prev => ({ ...prev, ...u })), []);

  return (
    <AppContext.Provider value={{
      loading, settings, updateSettings,
      subjects, addSubject, removeSubject, updateSubject,
      sessions, todaySessions, todayTotalSec, runningTodaySec, recordSession,
      ddays, addDDay, removeDDay, setPrimaryDDay,
      todos, addTodo, toggleTodo, removeTodo, mood,
      timers, addTimer, pauseTimer, resumeTimer, stopTimer, restartTimer, resetTimer, removeTimer,
      toast, showToast, showToastCustom,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be within AppProvider'); return ctx; };
