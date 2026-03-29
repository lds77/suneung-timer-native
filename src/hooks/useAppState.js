// src/hooks/useAppState.js
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Vibration, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';

const SOUND_FILES = {
  rain:    require('../../assets/sounds/rain.mp3'),
  cafe:    require('../../assets/sounds/cafe.mp3'),
  fire:    require('../../assets/sounds/fire.mp3'),
  wave:    require('../../assets/sounds/wave.mp3'),
  forest:  require('../../assets/sounds/forest.mp3'),
  train:   require('../../assets/sounds/train.mp3'),
  library: require('../../assets/sounds/Library.mp3'),
  clock:   require('../../assets/sounds/clock.mp3'),
  space:   require('../../assets/sounds/space.mp3'),
  writing: require('../../assets/sounds/writing.mp3'),
};
import { saveSettings, loadSettings, saveSubjects, loadSubjects, saveSessions, loadSessions, saveDDays, loadDDays, saveTodos, loadTodos, saveCountupFavs, loadCountupFavs, saveFavs, loadFavs, saveWeeklySchedule, loadWeeklySchedule, saveTimerSnapshot, loadTimerSnapshot, clearTimerSnapshot } from '../utils/storage';
import { getToday, generateId } from '../utils/format';
import { calculateDensity } from '../utils/density';
import { getRandomMessage } from '../constants/characters';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Android 8+ 필수: Notification Channel 설정 (없으면 백그라운드 알림이 조용히 실패)
// 채널은 한번 만들면 수정 불가 → 삭제 후 재생성
if (Platform.OS === 'android') {
  Notifications.deleteNotificationChannelAsync('timer-complete').catch(() => {});
  Notifications.setNotificationChannelAsync('timer-complete', {
    name: '타이머 알림',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500],
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}

// 앱 시작 시 이전 세션의 잔여 예약 알람 제거 (강제종료/재부팅 후 유령 알람 방지)
Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});

const DEFAULT_SETTINGS = {
  mainCharacter: 'toru', dailyGoalMin: 360, pomodoroWorkMin: 25, pomodoroBreakMin: 5,
  soundId: 'none', soundVolume: 70, darkMode: false, notifEnabled: true,
  ultraFocusLevel: 'normal', // 'normal' | 'focus' | 'exam' (🔥모드 잠금 강도)
  ultraStreak: 0, ultraStreakBest: 0, ultraStreakDate: '', // 울트라집중 연속 기록
  challengeText: '', // 커스텀 챌린지 문구 (빈 값이면 기본 문구 사용)
  streak: 0, lastStudyDate: '', onboardingDone: false,
  schoolLevel: 'high', elemGrade: 'upper', accentColor: 'pink', fontScale: 'medium', fontFamily: 'default', stylePreset: 'cute',
  // 가이드 플래그 (한 번 보면 다시 안 뜸)
  guideMode: false,     // 🔥/📖 모드 선택 설명
  guideDensity: false,  // 집중밀도 설명
  guideHeatmap: false,  // 잔디 설명
  guideLock: false,     // 잠금 화면 설명
  exactAlarmGuideShown: false, // Android 12+ 정확한 알람 권한 안내 표시 여부
  giveUpCount: 0, giveUpDate: '', // 오늘 그만하기 횟수 추적
  lastTodoResetDate: '', // 할일 자동 초기화 날짜 추적
  // 공부 리마인더
  dailyReminderEnabled: true, // 매일 공부 리마인더
  dailyReminderHour: 20,       // 리마인더 시각 (시)
  dailyReminderMin: 0,         // 리마인더 시각 (분)
  streakReminderEnabled: true, // 연속 끊김 위기 알림
  nickname: '',  // 사용자 닉네임
  motto: '',     // 오늘의 한마디
  headerBgPreset: 0, // 집중탭 헤더 배경 프리셋 인덱스
};

const DEFAULT_COUNTUP_FAVS = [
  { id: 'cf_kor', label: '국어', icon: '📘', color: '#E8575A' },
  { id: 'cf_math', label: '수학', icon: '📐', color: '#4A90D9' },
  { id: 'cf_eng', label: '영어', icon: '📗', color: '#5CB85C' },
  { id: 'cf_exp', label: '탐구', icon: '🔬', color: '#F5A623' },
  { id: 'cf_free', label: '자유', icon: '✨', color: '#9B6FC3' },
];

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [subjects, setSubjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [ddays, setDDays] = useState([]);
  const [todos, setTodos] = useState([]);
  // 즐겨찾기 설정 (FocusScreen에서 사용)
  const [favs, setFavs] = useState([]);
  const [countupFavs, setCountupFavs] = useState(DEFAULT_COUNTUP_FAVS);

  // ═══ 주간 플래너 ═══
  const [weeklySchedule, setWeeklySchedule] = useState(null);

  // ═══ 타이머 ═══
  const [timers, setTimers] = useState([]);
  const timersRef = useRef([]); timersRef.current = timers;

  // 완료 결과 모달 데이터 (null이면 모달 숨김)
  // { timerId, label, totalSec, result, seqSummary? }
  const [completedResultData, setCompletedResultData] = useState(null);

  // 전역 집중모드 선택 대기 콜백
  const [pendingModeAction, setPendingModeAction] = useState(null);
  const [showExactAlarmModal, setShowExactAlarmModal] = useState(false);

  // 100ms 틱 (anyChanged 최적화로 실제 렌더는 ~1000ms마다만 발생, 단 1초 경계 감지가 100ms 이내로 정확해져 연속 이중 렌더 방지)
  useEffect(() => {
    const id = setInterval(() => {
      // 일반 타이머 틱
      setTimers(prev => {
        if (!prev.some(t => t.status === 'running')) return prev;
        let anyChanged = false;
        const mapped = prev.map(t => {
          if (t.status !== 'running') return t;
          // resumedAt 없는 running 타이머 방어 (엣지케이스 → 즉시 기준점 설정)
          if (!t.resumedAt) {
            return { ...t, resumedAt: Date.now(), elapsedSecAtResume: t.elapsedSec };
          }
          const wallElapsed = Math.floor((Date.now() - t.resumedAt) / 1000);
          const newElapsed = (t.elapsedSecAtResume || 0) + wallElapsed;
          // elapsedSec 변화 없으면 스킵 (불필요한 리렌더 방지)
          if (newElapsed === t.elapsedSec) return t;
          anyChanged = true;
          const next = { ...t, elapsedSec: newElapsed };
          // 랩 스톱워치는 무한
          if (t.type === 'lap') return next;
          if (t.type === 'countdown' && next.elapsedSec >= t.totalSec) {
            const sessId = fireComplete(next);
            return { ...next, status: 'completed', result: calcResult(next, next.elapsedSec), ...(sessId ? { memoSessionId: sessId } : {}) };
          }
          if (t.type === 'pomodoro') {
            const target = t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60;
            if (next.elapsedSec >= target) return pomoFlip(next);
          }
          if (t.type === 'sequence') {
            const target = t.seqPhase === 'work' ? t.totalSec : t.seqBreakSec;
            // overshoot > 2초: bg 복귀 직후 stale 상태 (ticker 100ms 기준 정상은 ≤1초) → OS가 이미 알림 발송 → skipNotif
            if (next.elapsedSec >= target) return seqFlip(next, next.elapsedSec - target > 2);
          }
          if (t.type === 'free') return next;
          return next;
        });
        return anyChanged ? mapped : prev;
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  // seqFlip 페이즈 전환 후 실제 resumedAt 기준으로 남은 알림 재예약
  useEffect(() => {
    if (seqRescheduleQueue.current.length === 0) return;
    const queue = seqRescheduleQueue.current.splice(0);
    queue.forEach(t => scheduleAllPhaseNotifs(t));
  }, [timers]);

  // 연속모드 시작 (단일 sequence 타이머 생성)
  const startSequence = useCallback(({ items, breakSec = 600, seqName = '', seqIcon = '📋', seqColor = '#6C5CE7' }) => {
    if (!items.length) return;
    // 단일 타이머 제약
    const hasActive = timersRef.current.some(t => t.type !== 'lap' && (t.status === 'running' || t.status === 'paused'));
    if (hasActive) { showToastCustom('실행 중인 타이머가 있어요!', 'paengi'); return false; }
    const startAction = () => {
      const firstItem = items[0];
      const timerId = generateId('tmr_');
      const seqStartedAt = Date.now();
      const timer = {
        id: timerId, type: 'sequence', label: firstItem.label,
        subjectId: firstItem.subjectId || null, color: firstItem.color, totalSec: firstItem.totalSec,
        elapsedSec: 0, status: 'running', pauseCount: 0, createdAt: seqStartedAt, startedAt: seqStartedAt,
        result: null, laps: [], resumedAt: seqStartedAt, elapsedSecAtResume: 0,
        seqItems: items, seqIndex: 0, seqTotal: items.length,
        seqBreakSec: breakSec, seqPhase: 'work',
        seqName, seqIcon, seqColor, seqSessionIds: [],
      };
      setTimers(prev => [...prev, timer]);
      scheduleAllPhaseNotifs(timer);
      showToast('start');
    };
    // 모드 미선택 시 잠금강도별 자동 진입
    if (!focusModeRef.current) {
      const level = settingsRef.current.ultraFocusLevel || 'normal';
      if (level === 'exam') {
        activateScreenOnMode();
        setTimeout(startAction, 50);
      } else if (level === 'normal') {
        activateScreenOffMode();
        setTimeout(startAction, 50);
      } else {
        setPendingModeAction(() => startAction);
      }
    } else {
      startAction();
    }
    return true;
  }, [activateScreenOnMode, activateScreenOffMode]);

  const cancelSequence = useCallback(() => {
    setTimers(prev => prev.map(t => {
      if (t.type !== 'sequence' || t.status === 'completed') return t;
      cancelTimerNotif(t.id);
      if (t.seqPhase === 'work' && t.elapsedSec >= 300) {
        const mode = focusModeRef.current || 'screen_off';
        const ufState = ultraRef.current;
        recordSessionInternal({ subjectId: t.subjectId, label: t.label, startedAt: t.startedAt, durationSec: t.elapsedSec, mode: 'countdown', pauseCount: t.pauseCount, focusMode: mode, exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0, timerType: 'countdown', completionRatio: t.elapsedSec / Math.max(1, t.totalSec) });
      }
      return { ...t, status: 'completed', result: calcResult(t, t.elapsedSec) };
    }));
  }, []);

  // ═══ 집중 모드 (🔥 화면 켜두고 집중 도전 / 📖 화면 끄고 편하게 공부) ═══
  // 'screen_on' = 🔥모드: keep-awake + 이탈감지 + 다크 + 최소밝기
  // 'screen_off' = 📖모드: 조용히 타이머만
  // null = 모드 미선택 (타이머 안 돌아가는 상태)
  const [focusMode, setFocusMode] = useState(null);
  const focusModeRef = useRef(null);
  focusModeRef.current = focusMode;

  // 🔥모드 원래 밝기 저장 (복원용) — 다크모드는 FocusScreen 로컬 screenLocked로 처리
  const originalBrightness = useRef(null);
  // FocusScreen에서 잠금화면 ON/OFF 시 업데이트 — AppState 핸들러에서 체크용
  const screenLockedRef = useRef(false);
  const notifyScreenLocked = useCallback((locked) => { screenLockedRef.current = locked; }, []);

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

  const notifIdMap = useRef(new Map()); // timerId → 예약 알림 identifier
  const phaseNotifMap = useRef(new Map()); // timerId → [id1, id2, ...] 페이즈 전환 알림
  const seqRescheduleQueue = useRef([]); // seqFlip 페이즈 전환 후 알림 재예약 큐
  const bgTime = useRef(null);
  const plannerNotifIds = useRef([]); // 플래너 리마인더 알림 id 목록
  const reminderNotifIds = useRef([]); // 공부 리마인더 알림 id 목록

  // ref: 최신 weeklySchedule / sessions (schedulePlannerReminders에서 사용)
  const weeklyScheduleRef = useRef(null);
  const sessionsRef = useRef([]);
  weeklyScheduleRef.current = weeklySchedule;
  sessionsRef.current = sessions;

  // 🔥모드 활성화
  const activateScreenOnMode = useCallback(async () => {
    try {
      try { originalBrightness.current = await Brightness.getBrightnessAsync(); } catch { originalBrightness.current = 0.5; }
      await activateKeepAwakeAsync('focus');
      try { await Brightness.setBrightnessAsync(0.05); } catch {}
    } catch {}
    setFocusMode('screen_on');
    setUltraFocus({ isAway: false, awayAt: null, exitCount: 0, totalAwayMs: 0, showWarning: false, showChallenge: false, challengeAwayMs: 0, gaveUp: false, pauseAllowed: false });
  }, []);

  // 📖모드 활성화
  const activateScreenOffMode = useCallback(() => {
    setFocusMode('screen_off');
    setUltraFocus({ isAway: false, awayAt: null, exitCount: 0, totalAwayMs: 0, showWarning: false, showChallenge: false, challengeAwayMs: 0, gaveUp: false, pauseAllowed: false });
  }, []);

  // 모드 해제 (모든 타이머 완료/삭제 시)
  const deactivateFocusMode = useCallback(async () => {
    const wasScreenOn = focusModeRef.current === 'screen_on';
    const brightnessToRestore = wasScreenOn ? originalBrightness.current : null;
    if (wasScreenOn) {
      try { deactivateKeepAwake('focus'); } catch {}
      originalBrightness.current = null;
    }
    // setFocusMode는 await 전에 호출 — focusModeRef가 빨리 null이 되도록 (race condition 방지)
    setFocusMode(null);
    setUltraFocus({ isAway: false, awayAt: null, exitCount: 0, totalAwayMs: 0, showWarning: false, showChallenge: false, challengeAwayMs: 0, gaveUp: false, pauseAllowed: false });
    if (brightnessToRestore !== null) { try { await Brightness.setBrightnessAsync(brightnessToRestore); } catch {} }
  }, []);

  // 전역 집중모드 선택 요청 (어느 탭에서나 타이머 시작 시 호출)
  const requestModeSelect = useCallback((action) => {
    if (focusModeRef.current) { action(); return; }
    const level = settingsRef.current.ultraFocusLevel || 'normal';
    // 울트라집중: 자동 집중모드(screen_on)
    if (level === 'exam') {
      activateScreenOnMode();
      setTimeout(action, 50);
      return;
    }
    // 일반: 자동 편한모드(screen_off)
    if (level === 'normal') {
      activateScreenOffMode();
      setTimeout(action, 50);
      return;
    }
    // 집중: 모드 선택 팝업
    setPendingModeAction(() => action);
  }, [activateScreenOnMode, activateScreenOffMode]);

  const resolveModeSelect = useCallback((mode) => {
    if (mode === 'screen_on') activateScreenOnMode();
    else activateScreenOffMode();
    setPendingModeAction(prev => { if (prev) { setTimeout(prev, 50); } return null; });
  }, [activateScreenOnMode, activateScreenOffMode]);

  const cancelModeSelect = useCallback(() => {
    setPendingModeAction(null);
  }, []);

  // 🔥모드 이탈 시 밝기 복원 / 복귀 시 다시 적용
  // 다크모드는 FocusScreen의 screenLocked 로컬 상태로만 처리 — 전역 settings.darkMode는 건드리지 않음
  const restoreBrightness = async () => {
    if (originalBrightness.current !== null) { try { await Brightness.setBrightnessAsync(originalBrightness.current); } catch {} }
  };
  const applyFocusBrightness = async () => {
    try { await Brightness.setBrightnessAsync(0.05); } catch {}
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
      showToastCustom('쉬는 시간 끝! 다시 집중!', 'toru');
    }, 60000);
    showToastCustom('60초간 자유시간! 빠르게 다녀와~', 'taco');
  }, []);

  // AppState 핸들링
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const hasRunning = timersRef.current.some(t => t.status === 'running');
      const mode = focusModeRef.current;
      const uf = settingsRef.current;
      const level = uf.ultraFocusLevel || 'normal';
      const isStrict = level === 'exam';

      if (state === 'inactive') { /* 무시 */ }
      else if (state === 'background') {
        bgTime.current = Date.now();

        // 백그라운드 진입 시 타이머 스냅샷 즉시 저장 (앱 종료 대비)
        const activeTimers = timersRef.current.filter(t => t.status === 'running' || t.status === 'paused');
        if (activeTimers.length > 0) {
          lastSnapshotSaveRef.current = Date.now();
          saveTimerSnapshot({ savedAt: Date.now(), timers: timersRef.current });
        }

        // 🔥모드에서만 이탈 감지 (keep-awake라서 background = 진짜 이탈)
        if (mode === 'screen_on' && hasRunning && !ultraRef.current.gaveUp && !ultraRef.current.pauseAllowed) {
          setUltraFocus(prev => ({ ...prev, isAway: true, awayAt: Date.now() }));
          const charName = { toru: '토루', paengi: '팽이', taco: '타코', totoru: '토토루' }[uf.mainCharacter] || '토루';
          fireNotif(`${charName}랑 같이 열공하자!`, '타이머가 돌아가고 있어~');
          // 밝기/다크 복원 (다른 앱에서 어두우면 불편)
          restoreBrightness();
        }
        // 📖모드는 아무것도 안 함

        // 연속모드/뽀모도로: 백그라운드 진입 시 페이즈 알림 재예약
        // break→work 전환 후 seqRescheduleQueue가 비어있는 경우 OS 알림이 누락될 수 있으므로 방어적으로 재예약
        timersRef.current
          .filter(t => t.status === 'running' && (t.type === 'sequence' || t.type === 'pomodoro'))
          .forEach(t => scheduleAllPhaseNotifs(t));
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
            // 잠금화면이 표시 중일 때만 밝기/다크 재적용 (해제 상태에서는 집중탭 그대로 유지)
            if (screenLockedRef.current) applyFocusBrightness();
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
              // 예약 알림 취소 (타이머가 멈추니까)
              timersRef.current.filter(t => t.status === 'running').forEach(t => cancelTimerNotif(t.id));
              setTimers(prev => prev.map(t =>
                t.status === 'running' ? { ...t, status: 'paused', pauseCount: (t.pauseCount || 0) + 1, pausedByUltra: true } : t
              ));
            }
            if (!challenge) {
              if (isStrict) showToastCustom('이탈 감지! 타이머가 멈췄어요', 'paengi');
              else { const m = Math.floor(awayMs / 60000); showToastCustom(m >= 1 ? `${m}분 이탈! 집중하자~` : '돌아왔구나! 집중하자~', 'toru'); }
            }
            // 챌린지 모달이 뜨면 밝기를 원래대로 복원 (문구 입력해야 하니까)
            if (challenge) restoreBrightness();
            // 챌린지 없이 복귀 → 잠금화면 표시 중일 때만 밝기/다크 재적용
            else if (screenLockedRef.current) applyFocusBrightness();
          }
        }

        // 잠깐 쉬기 중 복귀
        if (mode === 'screen_on' && ultraRef.current.pauseAllowed && wasAway) {
          setUltraFocus(prev => ({ ...prev, isAway: false, awayAt: null }));
          if (screenLockedRef.current) applyFocusBrightness();
        }

        // 백그라운드 복귀 시 countdown 알림 재예약 (elapsedSec 보정 후 기존 알림이 부정확할 수 있음)
        if (gap > 1) {
          timersRef.current.filter(t => t.status === 'running' && t.type === 'countdown').forEach(t => {
            const remain = getRealRemainingSec(t);
            if (remain > 0) scheduleTimerNotif(t.id, t.label, remain);
          });
        }

        // 백그라운드 시간 보정 (모드 상관없이)
        if (gap > 1) {
          setTimers(prev => prev.map(t => {
            if (t.status !== 'running') return t;
            // wall clock 기반으로 실제 경과 시간 계산 (resumedAt 없으면 gap 방식 폴백)
            const e = t.resumedAt
              ? (t.elapsedSecAtResume || 0) + Math.floor((Date.now() - t.resumedAt) / 1000)
              : t.elapsedSec + gap;
            if (t.type === 'countdown' && e >= t.totalSec) {
              const completedT = { ...t, elapsedSec: t.totalSec };
              const sessId = fireComplete(completedT, true);
              return { ...completedT, status: 'completed', result: calcResult(completedT, t.totalSec), ...(sessId ? { memoSessionId: sessId } : {}) };
            }
            if (t.type === 'pomodoro') {
              let tt = { ...t, elapsedSec: e };
              while (true) {
                const target = tt.pomoPhase === 'work' ? tt.pomoWorkMin * 60 : tt.pomoBreakMin * 60;
                if (tt.elapsedSec >= target) {
                  const leftover = tt.elapsedSec - target;
                  tt = pomoFlip({ ...tt, elapsedSec: target }, true);
                  tt = { ...tt, elapsedSec: leftover };
                } else break;
              }
              return tt;
            }
            if (t.type === 'sequence') {
              let tt = { ...t, elapsedSec: e };
              while (tt.status !== 'completed') {
                const target = tt.seqPhase === 'work' ? tt.totalSec : tt.seqBreakSec;
                if (tt.elapsedSec >= target) {
                  const leftover = tt.elapsedSec - target;
                  tt = seqFlip({ ...tt, elapsedSec: target }, true);
                  if (tt.status === 'completed') break;
                  tt = { ...tt, elapsedSec: leftover };
                } else break;
              }
              return tt;
            }
            return { ...t, elapsedSec: e };
          }));
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
      // 재개될 타이머들의 남은 시간으로 알림 재예약
      timersRef.current.filter(t => t.pausedByUltra && t.status === 'paused').forEach(t => {
        if (t.type === 'countdown') {
          scheduleTimerNotif(t.id, t.label, getRealRemainingSec(t));
        } else if (t.type === 'pomodoro' || t.type === 'sequence') {
          scheduleAllPhaseNotifs(t);
        }
      });
      setTimers(prev => prev.map(t => t.pausedByUltra && t.status === 'paused' ? { ...t, status: 'running', pausedByUltra: false, resumedAt: Date.now(), elapsedSecAtResume: t.elapsedSec } : t));
    }
    // 챌린지 해제 → 다시 최소밝기 + 다크모드
    applyFocusBrightness();
    showToastCustom('다시 집중! 할 수 있어!', 'toru');
  }, []);

  // 그만하기
  const giveUpFocus = useCallback(async () => {
    setUltraFocus(prev => ({ ...prev, showChallenge: false, gaveUp: true }));
    const today = getToday();
    const prevCount = settingsRef.current.giveUpDate === today ? (settingsRef.current.giveUpCount || 0) : 0;
    updateSettings({ giveUpCount: prevCount + 1, giveUpDate: today });
    // 모든 실행/일시정지 타이머의 예약 알림 취소
    timersRef.current.filter(t => t.status === 'running' || t.status === 'paused').forEach(t => cancelTimerNotif(t.id));
    setTimers(prev => prev.map(t => {
      if (t.status === 'running' || t.status === 'paused') {
        const sessId = fireComplete(t);
        return { ...t, status: 'completed', result: calcResult(t, t.elapsedSec), gaveUp: true, ...(sessId ? { memoSessionId: sessId } : {}) };
      }
      return t;
    }));
    showToastCustom('오늘은 여기까지! 내일 다시 도전해봐요', 'totoru');
  }, []);

  const calcResult = (t, dur) => {
    const mode = focusModeRef.current || 'screen_off';
    const ufState = ultraRef.current;
    // sequence 타입: 전체 항목 합산 시간 + countdown 기준으로 계산
    let timerType = t.type;
    let totalSec = dur;
    let completionRatio = t.type === 'countdown' ? Math.min(1, dur / Math.max(1, t.totalSec)) : 1;
    if (t.type === 'sequence') {
      timerType = 'countdown';
      totalSec = (t.seqItems || []).reduce((s, it) => s + (it.totalSec || 0), 0);
      completionRatio = Math.min(1, ((t.seqIndex || 0) + 1) / Math.max(1, t.seqTotal || 1));
    }
    const d = calculateDensity({
      pausedCount: t.pauseCount, totalSec,
      timerType, completionRatio,
      pomoSets: t.pomoSet || 0, focusMode: mode,
      exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0,
      schoolLevel: settingsRef.current?.schoolLevel || 'high',
      ultraFocusLevel: mode === 'screen_on' ? (settingsRef.current?.ultraFocusLevel || 'normal') : 'normal',
    });
    const { getTier } = require('../constants/presets');
    return { density: d, tier: getTier(d), focusMode: mode, exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0, verified: mode === 'screen_on' && (ufState.exitCount || 0) === 0, durationSec: totalSec };
  };

  const pomoFlip = (t, skipNotif = false) => {
    if (t.pomoPhase === 'work') {
      recordSessionInternal({
        subjectId: t.subjectId, label: t.label,
        startedAt: Date.now() - t.pomoWorkMin * 60 * 1000,
        durationSec: t.pomoWorkMin * 60, mode: 'pomodoro',
        pauseCount: t.pauseCount, timerType: 'pomodoro',
        focusMode: focusModeRef.current || 'screen_off',
        exitCount: focusModeRef.current === 'screen_on' ? (ultraRef.current?.exitCount || 0) : 0,
        pomoSets: t.pomoSet + 1,
      });
      // 알림은 예약 알림(scheduleAllPhaseNotifs)이 처리 — fireNotif 제거(중복 방지)
      if (!skipNotif && settingsRef.current.notifEnabled) Vibration.vibrate([0, 300, 100, 300]);
      // 페이즈 종료 정확한 시각 계산 (Date.now() 대신 사용 → 틱 오버슈트 누적 방지)
      const workPhaseEndAt = (t.resumedAt || Date.now()) + (t.pomoWorkMin * 60 - (t.elapsedSecAtResume || 0)) * 1000;
      return { ...t, elapsedSec: 0, pomoPhase: (t.pomoSet + 1) % 4 === 0 ? 'longbreak' : 'break', pomoSet: t.pomoSet + 1, pauseCount: 0, resumedAt: workPhaseEndAt, elapsedSecAtResume: 0 };
    }
    if (!skipNotif && settingsRef.current.notifEnabled) Vibration.vibrate([0, 200, 100, 200]);
    // 페이즈 종료 정확한 시각 계산 (Date.now() 대신 사용 → 틱 오버슈트 누적 방지)
    const breakPhaseEndAt = (t.resumedAt || Date.now()) + (t.pomoBreakMin * 60 - (t.elapsedSecAtResume || 0)) * 1000;
    return { ...t, elapsedSec: 0, pomoPhase: 'work', pauseCount: 0, resumedAt: breakPhaseEndAt, elapsedSecAtResume: 0 };
  };

  // 연속모드 페이즈 전환 (pomoFlip 패턴)
  const seqFlip = (t, skipNotif = false) => {
    if (t.seqPhase === 'work') {
      // 현재 항목 세션 기록 (쉬는시간 항목은 제외)
      const currentItem = t.seqItems[t.seqIndex];
      const isBreakItem = currentItem?.isBreak;
      let updatedSeqSessionIds = t.seqSessionIds || [];
      const nextIndex = t.seqIndex + 1;
      const isLastItem = nextIndex >= t.seqTotal;
      // 마지막 항목이면 미리 result 계산 → densityOverride로 모달/세션 밀도 일치
      const result = isLastItem ? calcResult(t, t.totalSec) : null;
      if (t.elapsedSec >= 300 && !isBreakItem) {
        const mode = focusModeRef.current || 'screen_off';
        const ufState = ultraRef.current;
        const sessId = recordSessionInternal({
          subjectId: t.subjectId, label: t.label, startedAt: t.startedAt,
          durationSec: t.totalSec, mode: 'countdown', pauseCount: t.pauseCount,
          exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0,
          focusMode: mode, timerType: 'countdown', completionRatio: 1,
          ...(result ? { densityOverride: result.density } : {}),
        });
        if (sessId) updatedSeqSessionIds = [...updatedSeqSessionIds, sessId];
      }
      if (isLastItem) {
        // 마지막 항목 완료 → 전체 완료 (예약 알림이 처리, 잔여 phase notif 정리)
        if (!skipNotif && settingsRef.current.notifEnabled) Vibration.vibrate([0, 500, 200, 500]);
        phaseNotifMap.current.delete(t.id);
        setCompletedResultData({ timerId: t.id, label: t.seqName || '연속모드', result, isSeq: true, seqTotal: t.seqTotal, seqSessionIds: updatedSeqSessionIds });
        return { ...t, elapsedSec: 0, status: 'completed', result, seqSessionIds: updatedSeqSessionIds };
      }
      // 쉬는시간 전환
      if (!skipNotif && settingsRef.current.notifEnabled) {
        Vibration.vibrate([0, 200, 100, 200]);
        // 포그라운드: 기존 예약 phase 알림 취소 후 즉시 알림 발송 (예약 알림 취소 race condition 방지)
        const oldPhaseIds = phaseNotifMap.current.get(t.id) || [];
        phaseNotifMap.current.delete(t.id);
        oldPhaseIds.forEach(pid => Notifications.cancelScheduledNotificationAsync(pid).catch(() => {}));
        const nextItem = t.seqItems[t.seqIndex + 1];
        if (nextItem) {
          const nextLabel = nextItem.isBreak
            ? `${Math.round((nextItem.totalSec || 60) / 60)}분 휴식`
            : nextItem.label;
          fireNotif(`${t.label} 완료!`, `다음: ${nextLabel}`);
        }
      }
      // 페이즈 종료 정확한 시각 계산 (Date.now() 대신 사용 → 틱 오버슈트 누적 방지)
      const workPhaseEndAt = (t.resumedAt || Date.now()) + (t.totalSec - (t.elapsedSecAtResume || 0)) * 1000;
      const newBreakTimer = { ...t, elapsedSec: 0, seqPhase: 'break', pauseCount: 0, seqSessionIds: updatedSeqSessionIds, resumedAt: workPhaseEndAt, elapsedSecAtResume: 0 };
      seqRescheduleQueue.current.push(newBreakTimer);
      return newBreakTimer;
    } else {
      // 쉬는시간 끝 → 다음 항목 시작
      const nextItem = t.seqItems[t.seqIndex + 1];
      if (!nextItem) {
        // 안전장치
        const result = calcResult(t, 0);
        setCompletedResultData({ timerId: t.id, label: t.seqName || '연속모드', result, isSeq: true, seqTotal: t.seqTotal, seqSessionIds: t.seqSessionIds || [] });
        return { ...t, status: 'completed', result };
      }
      // 페이즈 종료 정확한 시각 계산 (Date.now() 대신 사용 → 틱 오버슈트 누적 방지)
      const breakPhaseEndAt = (t.resumedAt || Date.now()) + (t.seqBreakSec - (t.elapsedSecAtResume || 0)) * 1000;
      if (!skipNotif && settingsRef.current.notifEnabled) {
        Vibration.vibrate([0, 200, 100, 200]);
        // seqBreakSec > 0인 실제 쉬는시간 종료 시만 알림 (0이면 work→break에서 이미 발송)
        if (t.seqBreakSec > 0 && nextItem) {
          fireNotif(`${nextItem.label} 시작!`, '집중!');
        }
      }
      // break→work 전환 시에는 재예약 하지 않음
      // (break 시작 시점에 이미 재예약됐고, 재예약하면 break-end 알림이 취소될 수 있음)
      return {
        ...t, elapsedSec: 0, seqPhase: 'work', seqIndex: t.seqIndex + 1,
        label: nextItem.label, color: nextItem.color, totalSec: nextItem.totalSec,
        subjectId: nextItem.subjectId || null, startedAt: breakPhaseEndAt, pauseCount: 0,
        resumedAt: breakPhaseEndAt, elapsedSecAtResume: 0,
      };
    }
  };

  const fireComplete = (t, skipNotif = false) => {
    cancelTimerNotif(t.id); // 예약된 백그라운드 알림 취소 (포그라운드 완료 시 중복 방지)
    const mode = focusModeRef.current || 'screen_off';
    const ufState = ultraRef.current;
    const isPerfect = mode === 'screen_on' && ufState.exitCount === 0 && !ufState.gaveUp;
    if (!skipNotif) {
      if (isPerfect && t.elapsedSec >= 300) {
        fireNotif('퍼펙트 집중!', `${t.label} 이탈 없이 완료! Verified!`);
        if (settingsRef.current.notifEnabled) Vibration.vibrate([0, 300, 100, 300, 100, 500, 200, 800]);
        showToastCustom('이탈 0회! Verified!', 'taco');
      } else {
        fireNotif(`${t.label} 완료!`, '수고했어!');
        if (settingsRef.current.notifEnabled) Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      }
    } else {
      // 백그라운드 복귀: OS가 이미 알림 보냄 → 진동+토스트만
      if (isPerfect && t.elapsedSec >= 300) {
        if (settingsRef.current.notifEnabled) Vibration.vibrate([0, 300, 100, 300, 100, 500, 200, 800]);
        showToastCustom('이탈 0회! Verified!', 'taco');
      } else {
        if (settingsRef.current.notifEnabled) Vibration.vibrate([0, 500, 200, 500, 200, 500]);
        showToastCustom(`${t.label} 완료!`, 'toru');
      }
    }
    if (t.type !== 'lap' && (t.elapsedSec >= 300 || (t.planId && t.elapsedSec >= 30))) {
      const exitCnt = mode === 'screen_on' ? (ufState.exitCount || 0) : 0;
      const sessId = recordSessionInternal({
        subjectId: t.subjectId, label: t.label, startedAt: t.startedAt,
        durationSec: t.type === 'countdown' ? t.totalSec : t.elapsedSec,
        mode: t.type, pauseCount: t.pauseCount, exitCount: exitCnt,
        focusMode: mode, timerType: t.type,
        completionRatio: t.type === 'countdown' ? Math.min(1, t.elapsedSec / Math.max(1, t.totalSec)) : 1,
        pomoSets: t.pomoSet || 0, planId: t.planId || null,
      });
      // 완료 결과 모달 트리거 (랩/시퀀스 제외)
      if (t.type !== 'sequence') {
        const result = calcResult(t, t.type === 'countdown' ? t.totalSec : t.elapsedSec);
        const durationSec = t.type === 'countdown' ? t.totalSec : t.elapsedSec;
        if (t.planId) {
          const ws = weeklyScheduleRef.current;
          const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()];
          const plan = ws?.[dayKey]?.plans?.find(p => p.id === t.planId);
          if (plan) {
            const today = getToday();
            const prevDoneSec = sessionsRef.current
              .filter(s => s.date === today && s.planId === t.planId)
              .reduce((sum, s) => sum + s.durationSec, 0);
            if (prevDoneSec + durationSec >= plan.targetMin * 60 * 0.8) {
              const prevSessIds = sessionsRef.current
                .filter(s => s.date === today && s.planId === t.planId)
                .map(s => s.id);
              setCompletedResultData({ timerId: t.id, label: plan.label || t.label, result, isSeq: false, planSessionIds: [...prevSessIds, sessId] });
            }
          }
        } else {
          setCompletedResultData({ timerId: t.id, label: t.label, result, isSeq: false, sessionId: sessId });
        }
      }
      return sessId;
    }
    return null;
  };

  const fireNotif = async (title, body) => {
    if (!settingsRef.current.notifEnabled) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: 'default', vibrate: [0, 300, 100, 300],
          ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
        },
        trigger: null,
      });
    } catch {}
  };

  // 실제 남은 초 정밀 계산 (wall clock 기반, 소수점 포함)
  const getRealRemainingSec = (t) => {
    const now = Date.now();
    const realElapsedSec = t.resumedAt
      ? (t.elapsedSecAtResume || 0) + (now - t.resumedAt) / 1000
      : t.elapsedSec;
    if (t.type === 'countdown') return Math.max(0, t.totalSec - realElapsedSec);
    if (t.type === 'pomodoro') {
      const target = t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60;
      return Math.max(0, target - realElapsedSec);
    }
    return 0;
  };

  // 백그라운드 알림 예약 — 타이머 시작/재개 시 OS에 미리 등록
  const scheduleTimerNotif = async (timerId, label, seconds, customTitle, customBody) => {
    if (!settingsRef.current.notifEnabled) return;
    try {
      const existingId = notifIdMap.current.get(timerId);
      if (existingId) {
        await Notifications.cancelScheduledNotificationAsync(existingId);
        notifIdMap.current.delete(timerId);
      }
      if (seconds <= 0) return;
      const sec = Math.max(1, Math.ceil(seconds));
      // DATE 트리거: Android는 setExactAndAllowWhileIdle → Doze 모드 관통, iOS도 절대시각이 seconds보다 정확
      const trigger = Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + sec * 1000), channelId: 'timer-complete' }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + sec * 1000) };
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: customTitle || `${label} 완료!`,
          body: customBody || '타이머가 끝났어요!',
          sound: 'default', vibrate: [0, 500, 200, 500, 200, 500],
          ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
        },
        trigger,
      });
      notifIdMap.current.set(timerId, id);
    } catch {}
  };

  // 예약 알림 취소 — 일시정지/중지/삭제 시
  const cancelTimerNotif = async (timerId) => {
    try {
      const id = notifIdMap.current.get(timerId);
      if (id) {
        await Notifications.cancelScheduledNotificationAsync(id);
        notifIdMap.current.delete(timerId);
      }
      // 페이즈 전환 알림도 함께 취소
      const phaseIds = phaseNotifMap.current.get(timerId) || [];
      phaseNotifMap.current.delete(timerId);
      for (const pid of phaseIds) {
        try { await Notifications.cancelScheduledNotificationAsync(pid); } catch {}
      }
    } catch {}
  };

  // 뽀모도로·연속모드: 모든 미래 페이즈 알림 일괄 예약
  const scheduleAllPhaseNotifs = async (timer) => {
    if (!settingsRef.current.notifEnabled) return;
    // 기존 페이즈 알림 먼저 취소
    const oldIds = phaseNotifMap.current.get(timer.id) || [];
    phaseNotifMap.current.delete(timer.id);
    for (const pid of oldIds) {
      try { await Notifications.cancelScheduledNotificationAsync(pid); } catch {}
    }
    const ids = [];
    // 기준 시각: timer.resumedAt (페이즈 실제 시작 시각)
    // Date.now() 기준이면 함수 호출 지연만큼 알림이 밀리므로 절대 시각으로 예약
    const baseTime = timer.resumedAt || Date.now();
    const push = async (absMs, title, body) => {
      const msFromNow = absMs - Date.now();
      if (msFromNow <= 0) return;
      const fireAt = new Date(absMs);
      const trigger = Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: 'timer-complete' }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt };
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title, body, sound: 'default', vibrate: [0, 300, 100, 300], ...(Platform.OS === 'android' && { channelId: 'timer-complete' }) },
          trigger,
        });
        ids.push(id);
      } catch {}
    };
    if (timer.type === 'pomodoro') {
      const firstTarget = timer.pomoPhase === 'work' ? timer.pomoWorkMin * 60 : timer.pomoBreakMin * 60;
      // 현재 페이즈 종료 절대 시각 = resumedAt + (target - elapsedSecAtResume) * 1000
      let absMs = baseTime + (firstTarget - (timer.elapsedSecAtResume || 0)) * 1000;
      let phase = timer.pomoPhase;
      let set = timer.pomoSet;
      let count = 0;
      while (absMs > Date.now() && count < 16) {
        if (phase === 'work') {
          await push(absMs, `${timer.label} 집중 완료!`, '기지개 한 번 펴자!');
          const isLong = (set + 1) % 4 === 0;
          phase = isLong ? 'longbreak' : 'break';
          set++;
          absMs += (isLong ? timer.pomoBreakMin * 2 : timer.pomoBreakMin) * 60 * 1000;
        } else {
          await push(absMs, `${timer.label} 휴식 끝!`, '다시 달려보자!');
          phase = 'work';
          absMs += timer.pomoWorkMin * 60 * 1000;
        }
        count++;
      }
    } else if (timer.type === 'sequence') {
      const firstTarget = timer.seqPhase === 'work' ? timer.totalSec : timer.seqBreakSec;
      // 현재 페이즈 종료 절대 시각 = resumedAt + (target - elapsedSecAtResume) * 1000
      let absMs = baseTime + (firstTarget - (timer.elapsedSecAtResume || 0)) * 1000;
      let idx = timer.seqIndex;
      let phase = timer.seqPhase;
      while (absMs > Date.now()) {
        if (phase === 'work') {
          const nextIdx = idx + 1;
          if (nextIdx >= timer.seqTotal) {
            await push(absMs, '연속 실행 완료!', '모든 과목을 끝냈어!');
            break;
          }
          if (timer.seqBreakSec > 0) {
            await push(absMs, `${timer.seqItems[idx].label} 완료!`, `물 한 잔 마시고 와요 (${Math.round(timer.seqBreakSec / 60)}분)`);
          }
          phase = 'break';
          absMs += timer.seqBreakSec * 1000;
        } else {
          idx++;
          if (idx >= timer.seqTotal) break;
          const ni = timer.seqItems[idx];
          const niSec = ni.totalSec || ((ni.min || 0) * 60);
          await push(absMs, `▶ ${ni.label} 시작!`, '다음 과목 시작! 집중!');
          phase = 'work';
          absMs += niSec * 1000;
        }
      }
    }
    if (ids.length > 0) phaseNotifMap.current.set(timer.id, ids);
  };

  // ═══ 플래너 리마인더 알림 예약 ═══
  // 고정 일정 종료 + 10분 후에 미완료 계획이 있으면 알림 예약
  const schedulePlannerReminders = useCallback(async () => {
    // 기존 플래너 알림 모두 취소
    for (const id of plannerNotifIds.current) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    }
    plannerNotifIds.current = [];

    if (!settingsRef.current.notifEnabled) return;
    const ws = weeklyScheduleRef.current;
    if (!ws || !ws.enabled) return;

    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayKeys[new Date().getDay()];
    const dayData = ws[dayKey];
    if (!dayData) return;

    const now = Date.now();
    const today = getToday();

    // 1) 고정 일정 종료 + 10분 후 알림 (미완료 계획 있을 때만)
    if (dayData.fixed?.length && dayData.plans?.length) {
      for (const fixed of dayData.fixed) {
        if (!fixed.end) continue;
        const [endH, endM] = fixed.end.split(':').map(Number);
        const endDate = new Date();
        endDate.setHours(endH, endM, 0, 0);
        const triggerMs = endDate.getTime() + 10 * 60 * 1000;
        if (triggerMs <= now) continue;

        const hasIncompletePlan = dayData.plans.some(plan => {
          const doneSec = sessionsRef.current
            .filter(s => s.date === today && s.planId === plan.id)
            .reduce((sum, s) => sum + (s.durationSec || 0), 0);
          return doneSec < (plan.targetMin || 0) * 60 * 0.8;
        });
        if (!hasIncompletePlan) continue;

        try {
          const trigger = Platform.OS === 'android'
            ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(triggerMs), channelId: 'timer-complete' }
            : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(triggerMs) };
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: '공부 계획 알림',
              body: `${fixed.label} 끝! 오늘 남은 계획 확인해볼까요?`,
              sound: 'default',
              ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
            },
            trigger,
          });
          plannerNotifIds.current.push(id);
        } catch {}
      }
    }

    // 2) 공부 계획 시작 알림 — 시작 10분 전 + 정각 (시간 배치된 계획만)
    for (const plan of (dayData.plans || [])) {
      if (!plan.start) continue;
      const [startH, startM] = plan.start.split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(startH, startM, 0, 0);
      const startMs = startDate.getTime();

      // 이미 완료한 계획은 알림 스킵
      const doneSec = sessionsRef.current
        .filter(s => s.date === today && s.planId === plan.id)
        .reduce((sum, s) => sum + (s.durationSec || 0), 0);
      if (doneSec >= (plan.targetMin || 0) * 60 * 0.8) continue;

      // 10분 전
      const tenMinBeforeMs = startMs - 10 * 60 * 1000;
      if (tenMinBeforeMs > now) {
        try {
          const trigger = Platform.OS === 'android'
            ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(tenMinBeforeMs), channelId: 'timer-complete' }
            : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(tenMinBeforeMs) };
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: '📚 공부 시작 10분 전',
              body: `${plan.label} 시작 10분 남았어요! 준비해볼까요?`,
              sound: 'default',
              ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
            },
            trigger,
          });
          plannerNotifIds.current.push(id);
        } catch {}
      }

      // 정각
      if (startMs > now) {
        try {
          const trigger = Platform.OS === 'android'
            ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(startMs), channelId: 'timer-complete' }
            : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(startMs) };
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: '⏰ 공부 시작!',
              body: `${plan.label} 시작 시간이에요! 지금 바로 시작해볼까요?`,
              sound: 'default',
              ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
            },
            trigger,
          });
          plannerNotifIds.current.push(id);
        } catch {}
      }
    }
  }, []);

  // ═══ 공부 리마인더 알림 예약 ═══
  // 매일 설정 시각에 "오늘 아직 공부 안 했어!" + 연속 끊김 위기 알림
  const scheduleStudyReminders = useCallback(async () => {
    // 기존 리마인더 취소
    for (const id of reminderNotifIds.current) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    }
    reminderNotifIds.current = [];

    const s = settingsRef.current;
    if (!s.notifEnabled) return;

    const now = new Date();
    const todayStr = getToday();
    const hasTodaySession = sessionsRef.current.some(sess => sess.date === todayStr);

    // 1) 매일 공부 리마인더
    if (s.dailyReminderEnabled) {
      const triggerDate = new Date();
      triggerDate.setHours(s.dailyReminderHour, s.dailyReminderMin, 0, 0);
      // 이미 지난 시간이면 내일로
      if (triggerDate.getTime() <= now.getTime()) triggerDate.setDate(triggerDate.getDate() + 1);
      // 오늘 이미 공부했고 트리거가 오늘이면 스킵 (내일로)
      if (hasTodaySession && triggerDate.toISOString().slice(0, 10) === todayStr) {
        triggerDate.setDate(triggerDate.getDate() + 1);
      }
      try {
        const trigger = Platform.OS === 'android'
          ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate, channelId: 'timer-complete' }
          : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate };
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: '오늘 공부 시작해볼까?',
            body: s.streak > 0 ? `${s.streak}일 연속 공부 중! 오늘도 이어가자!` : '잠깐이라도 좋으니 시작해봐!',
            sound: 'default',
            ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
          },
          trigger,
        });
        reminderNotifIds.current.push(id);
      } catch {}
    }

    // 2) 연속 끊김 위기 알림 (streak >= 5일 이상이고, 오늘 아직 공부 안 했을 때)
    if (s.streakReminderEnabled && s.streak >= 5 && !hasTodaySession) {
      const triggerDate = new Date();
      triggerDate.setHours(21, 30, 0, 0); // 밤 9시 30분 고정
      if (triggerDate.getTime() <= now.getTime()) return; // 이미 지남
      try {
        const trigger = Platform.OS === 'android'
          ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate, channelId: 'timer-complete' }
          : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate };
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: '연속 공부 끊길 위기!',
            body: `${s.streak}일 연속이 오늘 끊겨요! 잠깐이라도 공부하자!`,
            sound: 'default',
            ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
          },
          trigger,
        });
        reminderNotifIds.current.push(id);
      } catch {}
    }
  }, []);

  // 타이머 조작
  const addTimer = useCallback((opts) => {
    // 랩타이머: 단일 제약 없이 바로 시작 (집중모드 불필요)
    if (opts.type === 'lap') {
      const startedAt = Date.now();
      const t = { id: generateId('tmr_'), type: 'lap', label: opts.label || '타이머', subjectId: null, color: opts.color || '#6C5CE7', totalSec: 0, elapsedSec: 0, status: 'paused', pauseCount: 0, createdAt: startedAt, startedAt, pomoPhase: 'work', pomoSet: 0, pomoWorkMin: 25, pomoBreakMin: 5, result: null, laps: [], resumedAt: null, elapsedSecAtResume: 0 };
      setTimers(prev => [...prev, t]);
      return t;
    }
    // 단일 타이머 제약
    const hasActive = timersRef.current.some(t => t.type !== 'lap' && (t.status === 'running' || t.status === 'paused'));
    if (hasActive) { showToastCustom('실행 중인 타이머가 있어요!', 'paengi'); return null; }

    const doStart = () => {
      const startedAt = Date.now();
      const t = {
        id: generateId('tmr_'), type: opts.type || 'free', label: opts.label || '타이머',
        subjectId: opts.subjectId || null, color: opts.color || '#FF6B9D', totalSec: opts.totalSec || 0,
        elapsedSec: 0, status: 'running', pauseCount: 0, createdAt: startedAt, startedAt,
        pomoPhase: 'work', pomoSet: 0, pomoWorkMin: opts.pomoWorkMin || 25, pomoBreakMin: opts.pomoBreakMin || 5,
        result: null, laps: [], planId: opts.planId || null, resumedAt: startedAt, elapsedSecAtResume: 0,
      };
      if (t.type === 'countdown' && t.totalSec > 0) scheduleTimerNotif(t.id, t.label, t.totalSec);
      else if (t.type === 'pomodoro') scheduleAllPhaseNotifs(t);
      setTimers(prev => [...prev, t]);
      showToast('start');
    };

    // 모드 미선택 시 잠금강도별 자동 진입
    if (!focusModeRef.current) {
      const level = settingsRef.current.ultraFocusLevel || 'normal';
      if (level === 'exam') {
        activateScreenOnMode();
        setTimeout(doStart, 50);
      } else if (level === 'normal') {
        activateScreenOffMode();
        setTimeout(doStart, 50);
      } else {
        setPendingModeAction(() => doStart);
      }
    } else {
      doStart();
    }
    return null;
  }, [activateScreenOnMode, activateScreenOffMode]);

  const startFromPlan = useCallback((plan) => {
    const today = getToday();
    const doneSec = sessionsRef.current
      .filter(s => s.date === today && s.planId === plan.id)
      .reduce((sum, s) => sum + (s.durationSec || 0), 0);
    const targetSec = plan.targetMin * 60;
    const remainingSec = Math.max(0, targetSec - doneSec);
    if (remainingSec < 60) {
      showToastCustom('이미 목표 달성한 계획이에요!', 'toru');
      return;
    }
    addTimer({
      type: 'countdown',
      label: plan.label,
      color: plan.color,
      subjectId: plan.subjectId || null,
      totalSec: remainingSec,
      planId: plan.id,
    });
  }, [addTimer]);

  const pauseTimer = useCallback((id) => {
    // 울트라집중: 일시정지 차단
    if (settingsRef.current.ultraFocusLevel === 'exam' && focusModeRef.current === 'screen_on') {
      showToastCustom('울트라집중 모드에서는 일시정지할 수 없어요!', 'toru');
      return;
    }
    cancelTimerNotif(id); // 예약 알림 취소
    setTimers(prev => prev.map(t => t.id === id ? { ...t, status: 'paused', pauseCount: t.pauseCount + 1, elapsedSecAtResume: t.elapsedSec, resumedAt: null } : t));
  }, []);
  const resumeTimer = useCallback((id) => {
    // 남은 시간으로 알림 재예약
    const t = timersRef.current.find(t => t.id === id);
    if (t && t.status === 'paused') {
      if (t.type === 'countdown') {
        scheduleTimerNotif(id, t.label, getRealRemainingSec(t));
      } else if (t.type === 'pomodoro' || t.type === 'sequence') {
        scheduleAllPhaseNotifs(t);
      }
    }
    setTimers(prev => prev.map(t => t.id === id && t.status === 'paused' ? { ...t, status: 'running', resumedAt: Date.now(), elapsedSecAtResume: t.elapsedSec } : t));
  }, []);

  const stopTimer = useCallback((id) => {
    cancelTimerNotif(id);
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (t.type !== 'lap' && (t.elapsedSec >= 300 || (t.planId && t.elapsedSec >= 30)) && t.status !== 'completed') {
        const mode = focusModeRef.current || 'screen_off';
        const ufState = ultraRef.current;
        const sessId = recordSessionInternal({ subjectId: t.subjectId, label: t.label, startedAt: t.startedAt, durationSec: t.elapsedSec, mode: t.type, pauseCount: t.pauseCount, focusMode: mode, exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0, timerType: t.type, completionRatio: t.type === 'countdown' ? Math.min(1, t.elapsedSec / Math.max(1, t.totalSec)) : 1, pomoSets: t.pomoSet || 0, planId: t.planId || null });
        const result = calcResult(t, t.elapsedSec);
        // 완료 결과 모달 트리거 (랩 제외)
        if (t.planId) {
          const ws = weeklyScheduleRef.current;
          const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()];
          const plan = ws?.[dayKey]?.plans?.find(p => p.id === t.planId);
          if (plan) {
            const today = getToday();
            const prevDoneSec = sessionsRef.current
              .filter(s => s.date === today && s.planId === t.planId)
              .reduce((sum, s) => sum + s.durationSec, 0);
            if (prevDoneSec + t.elapsedSec >= plan.targetMin * 60 * 0.8) {
              const prevSessIds = sessionsRef.current
                .filter(s => s.date === today && s.planId === t.planId)
                .map(s => s.id);
              setCompletedResultData({ timerId: t.id, label: plan.label || t.label, result, isSeq: false, planSessionIds: [...prevSessIds, sessId] });
            }
          } else {
            setCompletedResultData({ timerId: t.id, label: t.label, result, isSeq: false, sessionId: sessId });
          }
        } else {
          setCompletedResultData({ timerId: t.id, label: t.label, result, isSeq: false, sessionId: sessId });
        }
        return { ...t, status: 'completed', result, memoSessionId: sessId };
      }
      return { ...t, status: 'completed', result: t.result || calcResult(t, t.elapsedSec) };
    }));
  }, []);

  const restartTimer = useCallback((id) => {
    const t = timersRef.current.find(t => t.id === id);
    if (t) {
      const restarted = { ...t, elapsedSec: 0, status: 'running', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null, laps: [] };
      if (t.type === 'countdown' && t.totalSec > 0) scheduleTimerNotif(id, t.label, t.totalSec);
      else if (t.type === 'pomodoro') scheduleAllPhaseNotifs(restarted);
      else if (t.type === 'sequence') scheduleAllPhaseNotifs({ ...restarted, seqPhase: 'work', seqIndex: 0, totalSec: t.seqItems?.[0]?.totalSec || t.totalSec });
    }
    setTimers(prev => prev.map(t => t.id === id ? { ...t, elapsedSec: 0, status: 'running', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null, laps: [], resumedAt: Date.now(), elapsedSecAtResume: 0 } : t));
    showToast('start');
  }, []);

  const resetTimer = useCallback((id) => {
    cancelTimerNotif(id); // 예약 알림 취소
    setTimers(prev => prev.map(t => t.id === id ? { ...t, elapsedSec: 0, status: 'paused', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null, laps: [], resumedAt: null, elapsedSecAtResume: 0 } : t));
  }, []);

  const removeTimer = useCallback((id) => {
    cancelTimerNotif(id); // 예약 알림 취소
    setTimers(prev => {
      const t = prev.find(timer => timer.id === id);
      if (t && (t.status === 'running' || t.status === 'paused') && t.elapsedSec >= 300) {
        const mode = focusModeRef.current || 'screen_off';
        const ufState = ultraRef.current;
        recordSessionInternal({
          subjectId: t.subjectId, label: t.label, startedAt: t.startedAt,
          durationSec: t.elapsedSec, mode: t.type, pauseCount: t.pauseCount,
          focusMode: mode, exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0,
          timerType: t.type, completionRatio: t.type === 'countdown' ? Math.min(1, t.elapsedSec / Math.max(1, t.totalSec)) : 1,
          pomoSets: t.pomoSet || 0, planId: t.planId || null,
        });
      }
      return prev.filter(timer => timer.id !== id);
    });
  }, [recordSessionInternal]);

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
        } catch {}
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
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
      const [s, subj, sess, dd, td, cuf, fv] = await Promise.all([loadSettings(), loadSubjects(), loadSessions(), loadDDays(), loadTodos(), loadCountupFavs(), loadFavs()]);
      if (s) {
        // 마이그레이션
        if (s.ultraFocusStrict !== undefined && !s.ultraFocusLevel) {
          s.ultraFocusLevel = s.ultraFocusStrict ? 'exam' : 'focus';
          delete s.ultraFocusStrict;
        }
        if (s.ultraFocusEnabled !== undefined) delete s.ultraFocusEnabled;
        // schoolLevel 마이그레이션: 'elementary' → 'elementary_upper'
        if (s.schoolLevel === 'elementary') s.schoolLevel = 'elementary_upper';
        setSettings({ ...DEFAULT_SETTINGS, ...s });
      } if (subj) setSubjects(subj);
      if (sess) setSessions(sess); if (dd) setDDays(dd);
      // 할일 매일 자동 초기화: 완료된 일반 항목 삭제, 반복 항목은 done만 리셋
      const today = getToday();
      const mergedSettings = s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
      if (td) {
        // 새 필드 마이그레이션 (기존 todo에 없는 필드 기본값 추가)
        const migrated = td.map(t => ({
          ...t,
          completedAt:  t.completedAt  ?? null,
          subjectId:    t.subjectId    ?? null,
          subjectLabel: t.subjectLabel ?? null,
          subjectColor: t.subjectColor ?? null,
          subjectIcon:  t.subjectIcon  ?? null,
          priority:     t.priority     ?? 'normal',
          scope:        t.scope        ?? 'today',
          ddayId:       t.ddayId       ?? null,
          memo:         t.memo         ?? '',
          isTemplate:   t.isTemplate   ?? false,
          repeatDays:   t.repeatDays   ?? null,
          templateId:   t.templateId   ?? null,
          createdDate:  t.createdDate  ?? null,
        }));
        // 반복 템플릿에서 오늘 할일 자동 생성 헬퍼
        const todayDay = new Date().getDay();
        const genFromTemplates = (base) => {
          const templates = base.filter(t => t.isTemplate && t.repeatDays && t.repeatDays.length > 0);
          const toAdd = [];
          templates.forEach(tmpl => {
            if (!tmpl.repeatDays.includes(todayDay)) return;
            if (base.some(t => !t.isTemplate && t.templateId === tmpl.id && t.createdDate === today)) return;
            toAdd.push({
              id: generateId('todo_'), text: tmpl.text, done: false, completedAt: null,
              repeat: false, subjectId: tmpl.subjectId ?? null, subjectLabel: tmpl.subjectLabel ?? null,
              subjectColor: tmpl.subjectColor ?? null, subjectIcon: tmpl.subjectIcon ?? null,
              priority: tmpl.priority ?? 'normal', scope: 'today', ddayId: null,
              memo: tmpl.memo ?? '', isTemplate: false, repeatDays: null,
              templateId: tmpl.id, createdDate: today,
            });
          });
          return toAdd;
        };
        if (mergedSettings.lastTodoResetDate !== today) {
          const resetTodos = migrated
            .filter(t => t.isTemplate || !t.done || t.repeat || t.scope === 'week' || t.scope === 'exam')
            .map(t => (!t.isTemplate && t.repeat && t.done) ? { ...t, done: false, completedAt: null } : t);
          const generated = genFromTemplates(resetTodos);
          const finalTodos = generated.length > 0 ? [...resetTodos, ...generated] : resetTodos;
          setTodos(finalTodos);
          await saveTodos(finalTodos); // 크래시 대비 즉시 저장
          setSettings(prev => ({ ...prev, lastTodoResetDate: today }));
        } else {
          const generated = genFromTemplates(migrated);
          const finalTodos = generated.length > 0 ? [...migrated, ...generated] : migrated;
          setTodos(finalTodos);
          if (generated.length > 0) await saveTodos(finalTodos); // 신규 생성분만 즉시 저장
        }
      }
      if (cuf) setCountupFavs(cuf);
      if (fv && fv.length > 0) setFavs(fv);
      const ws = await loadWeeklySchedule();
      if (ws) setWeeklySchedule(ws);
      // 이전 세션 타이머 복원 (앱 강제종료 대비)
      const snapshot = await loadTimerSnapshot();
      if (snapshot && snapshot.timers && snapshot.timers.length > 0) {
        const gap = Math.floor((Date.now() - (snapshot.savedAt || Date.now())) / 1000);
        const activeTimers = snapshot.timers.filter(t => t.status === 'running' || t.status === 'paused');
        if (activeTimers.length > 0) {
          const now = Date.now();
          const restored = activeTimers.map(t => {
            const addedSec = t.status === 'running' ? gap : 0;
            const newElapsed = t.elapsedSec + addedSec;
            if (t.type === 'countdown') {
              const e = Math.min(newElapsed, t.totalSec);
              // 이미 완료된 카운트다운은 복원하지 않음 (null → filter로 제거)
              if (e >= t.totalSec) return null;
              // 실행 중이었으면 running 유지 (resumedAt 갱신)
              if (t.status === 'running') return { ...t, elapsedSec: e, status: 'running', resumedAt: now, elapsedSecAtResume: e };
              return { ...t, elapsedSec: e, status: 'paused', resumedAt: null, elapsedSecAtResume: e };
            }
            if (t.status === 'running') return { ...t, elapsedSec: newElapsed, status: 'running', resumedAt: now, elapsedSecAtResume: newElapsed };
            return { ...t, elapsedSec: newElapsed, status: 'paused', resumedAt: null, elapsedSecAtResume: newElapsed };
          }).filter(Boolean);
          setTimers(restored);
          // running으로 복원된 타이머 알림 재예약
          restored.forEach(t => {
            if (t.status !== 'running') return;
            if (t.type === 'countdown' && t.totalSec > 0) scheduleTimerNotif(t.id, t.label, getRealRemainingSec(t));
            else if (t.type === 'pomodoro' || t.type === 'sequence') scheduleAllPhaseNotifs(t);
          });
        }
        await clearTimerSnapshot();
      }
      setLoading(false);
    })();
  }, []);

  // 자동 저장
  const saveRef = useRef(null);
  useEffect(() => {
    if (loading) return; clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => { saveSettings(settings); saveSubjects(subjects); saveSessions(sessions); saveDDays(ddays); saveTodos(todos); saveCountupFavs(countupFavs); saveFavs(favs); if (weeklySchedule) saveWeeklySchedule(weeklySchedule); }, 500);
  }, [settings, subjects, sessions, ddays, todos, countupFavs, favs, weeklySchedule, loading]);

  // 타이머 스냅샷 자동 저장 (앱 강제종료 대비) — 스로틀 방식 (5초마다 최대 1회)
  // 디바운스는 1초 틱마다 리셋되어 영원히 실행되지 않으므로 스로틀을 사용
  const lastSnapshotSaveRef = useRef(0);
  useEffect(() => {
    if (loading) return;
    const hasActive = timers.some(t => t.status === 'running' || t.status === 'paused');
    if (hasActive) {
      const now = Date.now();
      if (now - lastSnapshotSaveRef.current >= 5000) {
        lastSnapshotSaveRef.current = now;
        saveTimerSnapshot({ savedAt: now, timers });
      }
    } else {
      clearTimerSnapshot();
    }
  }, [timers, loading]);

  // Android 12+ 정확한 알람 권한 안내 (최초 1회)
  useEffect(() => {
    if (loading) return;
    if (Platform.OS !== 'android') return;
    if (Platform.Version < 31) return; // Android 12 미만은 불필요
    if (settings.exactAlarmGuideShown) return;
    const timer = setTimeout(() => {
      setShowExactAlarmModal(true);
      updateSettings({ exactAlarmGuideShown: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [loading, settings.exactAlarmGuideShown]);

  // 통계
  const todaySessions = sessions.filter(s => s.date === getToday());
  const todayTotalSec = todaySessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
  const runningTimers = timers.filter(t => t.status === 'running');
  const runningTodaySec = runningTimers.length > 0 ? Math.max(...runningTimers.map(t => t.elapsedSec)) : 0;
  const mood = (() => { const t = todayTotalSec + runningTodaySec; const g = settings.dailyGoalMin * 60; if (t >= g * 0.8) return 'happy'; if (t < 600) return 'sad'; return 'normal'; })();

  // ═══ 주간 플래너 헬퍼 ═══
  const getDayKey = useCallback(() => {
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  }, []);

  const getTodaySchedule = useCallback(() => {
    if (!weeklySchedule || !weeklySchedule.enabled) return null;
    const dayData = weeklySchedule[getDayKey()];
    return dayData || { fixed: [], plans: [] };
  }, [weeklySchedule, getDayKey]);

  const getPlanCompletedSec = useCallback((planId) => {
    const today = getToday();
    return sessions
      .filter(s => s.date === today && s.planId === planId)
      .reduce((sum, s) => sum + (s.durationSec || 0), 0);
  }, [sessions]);

  const getTodayPlanRate = useCallback(() => {
    const todaySched = getTodaySchedule();
    if (!todaySched || !todaySched.plans || todaySched.plans.length === 0) return null;
    const totalTarget = todaySched.plans.reduce((sum, p) => sum + p.targetMin * 60, 0);
    if (totalTarget === 0) return null;
    const totalDone = todaySched.plans.reduce((sum, p) => sum + getPlanCompletedSec(p.id), 0);
    return Math.min(100, Math.round(totalDone / totalTarget * 100));
  }, [getTodaySchedule, getPlanCompletedSec]);

  const getAvailableMin = useCallback((dayKey) => {
    if (!weeklySchedule) return 24 * 60;
    const dayData = weeklySchedule[dayKey];
    if (!dayData || !dayData.fixed || dayData.fixed.length === 0) return 24 * 60;
    const fixedMin = dayData.fixed.reduce((sum, f) => {
      const [sh, sm] = f.start.split(':').map(Number);
      const [eh, em] = f.end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      // 자정을 넘어가는 일정 처리 (ex: 23:00~07:00)
      const dur = endMin > startMin ? endMin - startMin : (24 * 60 - startMin) + endMin;
      return sum + dur;
    }, 0);
    return Math.max(0, 24 * 60 - fixedMin);
  }, [weeklySchedule]);

  const recordSessionInternal = useCallback(({ subjectId = null, label = '', startedAt = null, durationSec, mode = 'free', pauseCount = 0, memo = '', exitCount = 0, focusMode: fm = 'screen_off', timerType = 'free', completionRatio = 1, pomoSets = 0, selfRating = null, planId = null, densityOverride = null }) => {
    const density = densityOverride ?? calculateDensity({
      pausedCount: pauseCount, totalSec: durationSec, timerType, completionRatio, pomoSets,
      focusMode: fm, exitCount, selfRating,
      schoolLevel: settingsRef.current?.schoolLevel || 'high',
      ultraFocusLevel: fm === 'screen_on' ? (settingsRef.current?.ultraFocusLevel || 'normal') : 'normal',
    });
    const { getTier } = require('../constants/presets');
    const tier = getTier(density);
    const verified = fm === 'screen_on' && exitCount === 0;
    const ultraLevel = settingsRef.current?.ultraFocusLevel || 'normal';
    const newSess = {
      id: generateId('sess_'), date: getToday(), subjectId, label: label.trim(),
      startedAt: startedAt ?? Date.now() - durationSec * 1000, endedAt: Date.now(),
      durationSec, mode, focusDensity: density, tier: tier.id,
      pausedCount: pauseCount, exitCount, focusMode: fm, verified,
      selfRating, memo: memo.trim(), planId: planId || null,
      schoolLevel: settingsRef.current?.schoolLevel || 'high',
      ultraFocusLevel: fm === 'screen_on' ? ultraLevel : null,
      timerType, completionRatio, pomoSets,
    };
    setSessions(prev => [...prev, newSess]);
    if (subjectId) setSubjects(prev => prev.map(s => s.id === subjectId ? { ...s, totalElapsedSec: (s.totalElapsedSec || 0) + durationSec } : s));
    updateStreak();
    // 울트라집중 스트릭 갱신
    if (ultraLevel === 'exam' && fm === 'screen_on') updateUltraStreak();
    return newSess.id;
  }, []);
  const recordSession = recordSessionInternal;

  // 세션 메모 업데이트 (타이머 완료 후 나중에 추가/수정)
  const updateSessionMemo = useCallback((sessionId, memo) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, memo: memo.trim() } : s));
  }, []);

  // 자기평가 업데이트 — 기존 보너스 제거 후 새 보너스 적용
  const updateSessionSelfRating = useCallback((sessionId, selfRating, memo) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      const oldBonus = s.selfRating === 'fire' || s.selfRating === 'perfect' ? 3 : 0;
      const newBonus = selfRating === 'fire' || selfRating === 'perfect' ? 3 : 0;
      const newDensity = Math.max(56, Math.min(103, (s.focusDensity || 0) - oldBonus + newBonus));
      const { getTier } = require('../constants/presets');
      return { ...s, selfRating, focusDensity: newDensity, tier: getTier(newDensity).id, ...(memo !== undefined && memo !== null ? { memo } : {}) };
    }));
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

  // 울트라집중 스트릭 갱신
  const updateUltraStreak = useCallback(() => {
    setSettings(prev => {
      const today = getToday();
      if (prev.ultraStreakDate === today) return prev; // 오늘 이미 갱신됨
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);
      const newStreak = (prev.ultraStreakDate === yesterday || !prev.ultraStreakDate) ? (prev.ultraStreak || 0) + 1 : 1;
      return { ...prev, ultraStreak: newStreak, ultraStreakBest: Math.max(newStreak, prev.ultraStreakBest || 0), ultraStreakDate: today };
    });
  }, []);

  const addSubject = useCallback((s) => { const n = { id: generateId('subj_'), totalElapsedSec: 0, isFavorite: false, createdAt: new Date().toISOString(), ...s }; setSubjects(prev => [...prev, n]); return n; }, []);
  const removeSubject = useCallback((id) => setSubjects(prev => prev.filter(s => s.id !== id)), []);
  const updateSubject = useCallback((id, u) => setSubjects(prev => prev.map(s => s.id === id ? { ...s, ...u } : s)), []);
  const addDDay = useCallback((dd) => { const n = { id: generateId('dd_'), isPrimary: ddays.length === 0, ...dd }; setDDays(prev => [...prev, n]); return n; }, [ddays]);
  const removeDDay = useCallback((id) => { setDDays(prev => { const f = prev.filter(d => d.id !== id); if (f.length > 0 && !f.some(d => d.isPrimary)) f[0].isPrimary = true; return f; }); }, []);
  const updateDDay = useCallback((id, changes) => { setDDays(prev => prev.map(d => d.id === id ? { ...d, ...changes } : d)); }, []);
  const setPrimaryDDay = useCallback((id) => setDDays(prev => {
    const target = prev.find(d => d.id === id);
    if (!target) return prev;
    if (target.isPrimary) return prev.map(d => d.id === id ? { ...d, isPrimary: false } : d);
    const cnt = prev.filter(d => d.isPrimary).length;
    if (cnt >= 3) return prev;
    return prev.map(d => d.id === id ? { ...d, isPrimary: true } : d);
  }), []);
  // addTodo: 문자열(하위 호환) 또는 객체로 호출 가능
  const addTodo = useCallback((textOrObj) => {
    const isStr = typeof textOrObj === 'string';
    const text = isStr ? textOrObj : textOrObj?.text;
    if (!text?.trim()) return;
    const o = isStr ? {} : (textOrObj || {});
    const isTemplate = o.isTemplate ?? false;
    const repeatDays = o.repeatDays ?? null;
    const tmplId = generateId('todo_');
    setTodos(prev => {
      // 중복 방지: 같은 텍스트+과목의 미완료 할일이 이미 있으면 건너뜀 (템플릿 제외)
      if (!isTemplate) {
        const trimmed = text.trim();
        const dup = prev.some(t => !t.isTemplate && !t.done && t.text === trimmed && t.subjectId === (o.subjectId ?? null));
        if (dup) return prev;
      }
      const newTmpl = {
        id:           tmplId,
        text:         text.trim(),
        done:         false,
        completedAt:  null,
        repeat:       false,
        subjectId:    o.subjectId    ?? null,
        subjectLabel: o.subjectLabel ?? null,
        subjectColor: o.subjectColor ?? null,
        subjectIcon:  o.subjectIcon  ?? null,
        priority:     o.priority     ?? 'normal',
        scope:        o.scope        ?? 'today',
        ddayId:       o.ddayId       ?? null,
        memo:         o.memo         ?? '',
        isTemplate,
        repeatDays,
        templateId:   o.templateId   ?? null,
        createdDate:  o.createdDate  ?? null,
      };
      // 반복 템플릿이면 오늘 요일에 해당할 경우 인스턴스도 즉시 생성
      if (isTemplate && repeatDays && repeatDays.length > 0) {
        const todayDay = new Date().getDay();
        const todayStr = getToday();
        if (repeatDays.includes(todayDay)) {
          const todayInst = {
            id: generateId('todo_'), text: text.trim(), done: false, completedAt: null,
            repeat: false, subjectId: o.subjectId ?? null, subjectLabel: o.subjectLabel ?? null,
            subjectColor: o.subjectColor ?? null, subjectIcon: o.subjectIcon ?? null,
            priority: o.priority ?? 'normal', scope: 'today', ddayId: null,
            memo: o.memo ?? '', isTemplate: false, repeatDays: null,
            templateId: tmplId, createdDate: todayStr,
          };
          return [...prev, newTmpl, todayInst];
        }
      }
      return [...prev, newTmpl];
    });
  }, []);
  const toggleTodo = useCallback((id) => setTodos(prev => prev.map(t => {
    if (t.id !== id) return t;
    const done = !t.done;
    return { ...t, done, completedAt: done ? Date.now() : null };
  })), []);
  const removeTodo = useCallback((id) => setTodos(prev => prev.filter(t => t.id !== id)), []);
  const toggleTodoRepeat = useCallback((id) => setTodos(prev => prev.map(t => t.id === id ? { ...t, repeat: !t.repeat } : t)), []);
  const updateTodo = useCallback((id, fields) => setTodos(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t)), []);
  const generateDailyTodos = useCallback(() => {
    const todayDay = new Date().getDay();
    const todayStr = getToday();
    setTodos(prev => {
      const templates = prev.filter(t => t.isTemplate && t.repeatDays && t.repeatDays.length > 0);
      const toAdd = [];
      templates.forEach(tmpl => {
        if (!tmpl.repeatDays.includes(todayDay)) return;
        if (prev.some(t => !t.isTemplate && t.templateId === tmpl.id && t.createdDate === todayStr)) return;
        toAdd.push({
          id: generateId('todo_'), text: tmpl.text, done: false, completedAt: null,
          repeat: false, subjectId: tmpl.subjectId ?? null, subjectLabel: tmpl.subjectLabel ?? null,
          subjectColor: tmpl.subjectColor ?? null, subjectIcon: tmpl.subjectIcon ?? null,
          priority: tmpl.priority ?? 'normal', scope: 'today', ddayId: null,
          memo: tmpl.memo ?? '', isTemplate: false, repeatDays: null,
          templateId: tmpl.id, createdDate: todayStr,
        });
      });
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  }, []);

  // 할일 헬퍼 함수
  const getTodayTodos = useCallback(() =>
    todos.filter(t => !t.isTemplate && (t.scope === 'today' || t.scope == null)),
  [todos]);
  const getTodosBySubject = useCallback((subjectId) =>
    todos.filter(t => !t.isTemplate && t.subjectId === subjectId),
  [todos]);
  const getTodoCompletionRate = useCallback(() => {
    const todayT = todos.filter(t => !t.isTemplate && (t.scope === 'today' || t.scope == null));
    if (todayT.length === 0) return 0;
    return Math.round((todayT.filter(t => t.done).length / todayT.length) * 100);
  }, [todos]);
  const getExamTodos = useCallback((ddayId) =>
    todos.filter(t => !t.isTemplate && t.scope === 'exam' && t.ddayId === ddayId),
  [todos]);
  const updateSettings = useCallback((u) => setSettings(prev => ({ ...prev, ...u })), []);

  // 알림 설정 변경 감지
  useEffect(() => {
    if (loading) return;
    if (!settings.notifEnabled) {
      Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      notifIdMap.current.clear();
    }
  }, [settings.notifEnabled, loading]);

  // 플래너 리마인더: 앱 시작 + weeklySchedule 변경 시 재예약 (1.5초 디바운스 — 편집 중 Android 알림 API 과호출 방지)
  const plannerReminderDebounceRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    clearTimeout(plannerReminderDebounceRef.current);
    plannerReminderDebounceRef.current = setTimeout(() => {
      schedulePlannerReminders();
    }, 1500);
  }, [weeklySchedule, loading]);

  // 공부 리마인더: 앱 시작 + 세션/설정 변경 시 재예약
  const studyReminderDebounceRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    clearTimeout(studyReminderDebounceRef.current);
    studyReminderDebounceRef.current = setTimeout(() => {
      scheduleStudyReminders();
    }, 2000);
  }, [sessions.length, settings.dailyReminderEnabled, settings.dailyReminderHour, settings.dailyReminderMin, settings.streakReminderEnabled, settings.streak, loading]);

  // 즐겨찾기 추가/제거
  const addFav = useCallback((fav) => {
    if (favs.length >= 6) { showToastCustom('즐겨찾기 최대 6개!', 'paengi'); return; }
    if (favs.some(f => f.label === fav.label && f.type === fav.type)) { showToastCustom('이미 있어요!', 'paengi'); return; }
    setFavs(p => [...p, { ...fav, id: `fav_${Date.now()}` }]);
    showToastCustom(`${fav.label} 추가!`, 'toru');
  }, [favs]);
  const removeFav = useCallback((id) => {
    setFavs(p => p.filter(f => f.id !== id));
    showToastCustom('즐겨찾기에서 제거됐어요', 'paengi');
  }, []);

  // 공부량 즐겨찾기 추가/제거
  const addCountupFav = useCallback((fav) => {
    if (countupFavs.length >= 6) { showToastCustom('공부량 즐겨찾기 최대 6개!', 'paengi'); return; }
    if (countupFavs.some(f => f.label === fav.label)) { showToastCustom('이미 있어요!', 'paengi'); return; }
    setCountupFavs(p => [...p, { ...fav, id: `cf_${Date.now()}` }]);
    showToastCustom(`${fav.label} 추가!`, 'toru');
  }, [countupFavs]);
  const removeCountupFav = useCallback((id) => {
    setCountupFavs(p => p.filter(f => f.id !== id));
    showToastCustom('즐겨찾기에서 제거됐어요', 'paengi');
  }, []);

  // 백업 복원 후 전체 상태 다시 로드
  const reloadAllData = useCallback(async () => {
    const [s, subj, sess, dd, td, cuf, fv] = await Promise.all([
      loadSettings(), loadSubjects(), loadSessions(), loadDDays(), loadTodos(), loadCountupFavs(), loadFavs(),
    ]);
    if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    if (subj) setSubjects(subj);
    if (sess) setSessions(sess);
    if (dd) setDDays(dd);
    if (td) setTodos(td);
    if (cuf) setCountupFavs(cuf);
    if (fv && fv.length > 0) setFavs(fv);
    const ws = await loadWeeklySchedule();
    if (ws) setWeeklySchedule(ws);
  }, []);

  return (
    <AppContext.Provider value={{
      loading, settings, updateSettings,
      subjects, addSubject, removeSubject, updateSubject,
      sessions, todaySessions, todayTotalSec, runningTodaySec, recordSession, updateSessionMemo, updateTimerMemo, updateSessionSelfRating,
      ddays, addDDay, removeDDay, updateDDay, setPrimaryDDay,
      todos, addTodo, toggleTodo, removeTodo, toggleTodoRepeat, updateTodo, generateDailyTodos,
      getTodayTodos, getTodosBySubject, getTodoCompletionRate, getExamTodos, mood,
      timers, addTimer, pauseTimer, resumeTimer, stopTimer, restartTimer, resetTimer, removeTimer, addLap, setTimers,
      startSequence, cancelSequence,
      completedResultData, setCompletedResultData,
      pendingModeAction, requestModeSelect, resolveModeSelect, cancelModeSelect,
      showExactAlarmModal, dismissExactAlarmModal: () => setShowExactAlarmModal(false),
      toast, showToast, showToastCustom,
      focusMode, activateScreenOnMode, activateScreenOffMode, deactivateFocusMode,
      applyFocusBrightness, restoreBrightness, notifyScreenLocked,
      favs, setFavs, addFav, removeFav,
      countupFavs, setCountupFavs, addCountupFav, removeCountupFav,
      ultraFocus, setUltraFocus, dismissChallenge, giveUpFocus, getChallengeText, allowPause,
      weeklySchedule, setWeeklySchedule,
      getTodaySchedule, getPlanCompletedSec, getTodayPlanRate,
      startFromPlan, getAvailableMin, getDayKey, schedulePlannerReminders,
      reloadAllData,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be within AppProvider'); return ctx; };