// src/hooks/useAppState.js
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, Vibration, Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

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
import { saveSettings, loadSettings, saveSubjects, loadSubjects, saveSessions, loadSessions, saveDDays, loadDDays, saveTodos, loadTodos, saveTodoLog, loadTodoLog, saveCountupFavs, loadCountupFavs, saveFavs, loadFavs, saveWeeklySchedule, loadWeeklySchedule, saveTimerSnapshot, loadTimerSnapshot, clearTimerSnapshot, consumeWidgetTodoDirty } from '../utils/storage';
import { getToday, getYesterday, toDateStr, getWeekStartStr, generateId } from '../utils/format';
import { isTodayVisible, applyReorder, applyDailyTodoReset } from '../utils/todoUtils';
import { shouldNudgeBackup } from '../utils/backupNudge';
import { updateAllWidgets } from '../widgets/updateStudyWidget';
import { pomoPhaseTargetSec } from '../utils/pomo';
import { initLiveActivity, syncLiveActivity, setLiveActivityAway } from '../utils/liveActivity';
import { pinScreen, unpinScreen, isScreenPinned, scheduleLockAlarm, cancelLockAlarm, scheduleWidgetRefresh, cancelWidgetRefresh } from '../utils/screenPin';
import { setShield, shieldSupported } from '../utils/focusShield';
import { realRemainingSec, pomoFlipCore, seqFlipCore, buildPhaseNotifSpecs, calcTimerResult, buildSessionRecord } from '../utils/timerCore';
import { syncPresence as syncStudyRoomPresence } from '../utils/studyRoom';
import { buildPresence as buildStudyPresence, todayStudySec as studyRoomTodaySec } from '../utils/studyRoomCore';
import { getRandomMessage } from '../constants/characters';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification.request.content.data?.type;
    if (type === 'weeklyReport' || type === 'monthlyReport') {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false };
  },
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
  Notifications.setNotificationChannelAsync('report', {
    name: '주간·월간 리포트',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    enableVibrate: true,
  });
  // 이탈 중 상태 알림용 무음 채널 (즉시 알림 fireNotif와 사운드 중복 방지)
  Notifications.setNotificationChannelAsync('focus-status', {
    name: '집중 상태',
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
  });
}

// 앱 시작 시 이전 세션의 잔여 예약 알람 제거 플래그 (강제종료/재부팅 후 유령 알람 방지).
// 모듈 스코프에서 바로 실행하면 위젯 헤드리스 실행(번들 로드)에서도 돌아
// 실행 중 타이머의 예약 알람을 지워버리므로, 첫 마운트의 로드 effect에서 1회만 실행한다
// (JS 컨텍스트당 1회 — 액티비티 재생성 리마운트에서는 재실행하지 않음).
let staleNotifCleanupDone = false;

const DEFAULT_SETTINGS = {
  mainCharacter: 'toru', dailyGoalMin: 360, pomodoroWorkMin: 25, pomodoroBreakMin: 5,
  activeSounds: [], soundVolume: 70, darkMode: false, notifEnabled: true,
  appBlockEnabled: false, // iOS 울트라집중 앱 차단 (Screen Time) — 설정탭에서 켬
  ultraFocusLevel: 'normal', // 'normal' | 'focus' | 'exam' (🔥모드 잠금 강도)
  ultraStreak: 0, ultraStreakBest: 0, ultraStreakDate: '', // 울트라집중 연속 기록
  challengeText: '', // 커스텀 챌린지 문구 (빈 값이면 기본 문구 사용)
  streak: 0, lastStudyDate: '', onboardingDone: false,
  schoolLevel: 'high', elemGrade: 'upper', accentColor: 'pink', fontScale: 'medium', fontFamily: 'default', stylePreset: 'minimal',
  // 가이드 플래그 (한 번 보면 다시 안 뜸)
  guideMode: false,     // 🔥/📖 모드 선택 설명
  guideDensity: false,  // 집중밀도 설명
  guideHeatmap: false,  // 잔디 설명
  guideLock: false,     // 잠금 화면 설명
  widgetGuideSeen: false, // 홈 화면 위젯 1회성 안내 표시 여부 (Android)
  iosWidgetGuideSeen: false, // 홈 화면 위젯 1회성 안내 표시 여부 (iOS) — 기존 사용자도 1회 노출되도록 별도 플래그
  exactAlarmGuideShown: false, // Android 12+ 정확한 알람 권한 안내 표시 여부
  giveUpCount: 0, giveUpDate: '', // 오늘 그만하기 횟수 추적
  lastTodoResetDate: '', // 할일 자동 초기화 날짜 추적
  // 공부 리마인더
  dailyReminderEnabled: false, // 매일 공부 리마인더 (기본 OFF — 공부 안 했을 때 잔소리성, 필요시 켜기)
  dailyReminderHour: 20,       // 리마인더 시각 (시)
  dailyReminderMin: 0,         // 리마인더 시각 (분)
  streakReminderEnabled: false, // 연속 끊김 위기 알림 (기본 OFF)
  plannerNotifEnabled: false,  // 플래너 알림 — 고정일정 종료/공부 시작 알림 (기본 OFF)
  weeklyReportEnabled: true,   // 주간 공부 리포트 (매주 일요일 밤, 0분 주는 자동 스킵)
  monthlyReportEnabled: true,  // 월간 공부 리포트 (매월 마지막 날 밤, 0분 달은 자동 스킵)
  nickname: '',  // 사용자 닉네임
  motto: '',     // 오늘의 한마디
  headerBgPreset: 0, // 집중탭 헤더 배경 프리셋 인덱스
  // 해야할일 목록 구성 — '오늘'(매일 초기화·반복 생성처)과 '시험대비'(D-Day 연동)는 동작 고정이라 라벨만 변경 가능,
  // 커스텀 목록은 자유 추가/이름변경/삭제 (항목은 매일 초기화 없이 유지). 기존 '이번주'는 id 'week' 커스텀 목록으로 승계
  todoLists: [{ id: 'week', name: '이번주' }],
  todoLabelToday: '오늘',
  todoLabelExam: 'D-Day',
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
  const [todoLog, setTodoLog] = useState([]); // 완료 이력 (통계용 — 리셋 삭제와 무관하게 보존)
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
  const [pendingReportTab, setPendingReportTab] = useState(null);

  // 100ms 틱 (anyChanged 최적화로 실제 렌더는 ~1000ms마다만 발생, 단 1초 경계 감지가 100ms 이내로 정확해져 연속 이중 렌더 방지)
  // 실행 중 타이머가 있을 때만 인터벌 가동 — 없을 때도 10Hz로 JS를 깨우면
  // (안드는 백그라운드에서도 JS가 돌므로) 대기 상태 배터리를 하루 종일 소모한다
  const hasRunningTimer = timers.some(t => t.status === 'running');
  useEffect(() => {
    if (!hasRunningTimer) return undefined;
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
            // overshoot > 2초: bg 복귀 직후 stale 상태 → OS 예약 알림이 이미 발송됨 → skipNotif (sequence와 동일 가드)
            const sessId = fireComplete(next, next.elapsedSec - t.totalSec > 2);
            return { ...next, status: 'completed', result: calcResult(next, next.elapsedSec), ...(sessId ? { memoSessionId: sessId } : {}) };
          }
          if (t.type === 'pomodoro') {
            const target = pomoPhaseTargetSec(t); // 긴 휴식(4세트마다)은 15분
            // overshoot > 2초: bg 복귀/복원 직후 stale 상태 → OS 예약 알림이 이미 발송됨 → 진동 스킵 (countdown/sequence와 동일 가드)
            if (next.elapsedSec >= target) return pomoFlip(next, next.elapsedSec - target > 2);
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
  }, [hasRunningTimer]);

  // seqFlip 페이즈 전환 후 실제 resumedAt 기준으로 남은 알림 재예약
  useEffect(() => {
    if (seqRescheduleQueue.current.length === 0) return;
    const queue = seqRescheduleQueue.current.splice(0);
    queue.forEach(t => scheduleAllPhaseNotifs(t));
  }, [timers]);

  // 연속모드 시작 (단일 sequence 타이머 생성)
  const startSequence = useCallback(({ items, breakSec = 600, seqName = '', seqIcon = 'clipboard-outline', seqColor = '#6C5CE7' }) => {
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
        recordSessionInternal({ subjectId: t.subjectId, label: t.label, startedAt: t.startedAt, durationSec: t.elapsedSec, mode: 'countdown', pauseCount: t.pauseCount, focusMode: mode, exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0, timerType: 'countdown', completionRatio: Math.min(1, t.elapsedSec / Math.max(1, t.totalSec)), dedupeKey: `complete|${t.id}|${t.startedAt}` });
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

  // 🔥모드 원래 밝기 저장 (복원용) — 다크모드는 FocusScreen screenLocked로 처리
  const originalBrightness = useRef(null);
  // FocusScreen 잠금화면 상태 — Context에서 관리해 MainApp 리마운트 시에도 유지 (iOS Modal 투명 버그 방지)
  const [screenLocked, setScreenLockedState] = useState(false);
  const screenLockedRef = useRef(false);
  const setScreenLocked = useCallback((locked) => {
    screenLockedRef.current = locked;
    setScreenLockedState(locked);
    // 시험 강도(안드): 수동으로 화면 고정을 푼 뒤 잠금화면을 다시 켜면 재고정
    if (locked && Platform.OS === 'android'
        && (settingsRef.current.ultraFocusLevel || 'normal') === 'exam'
        && focusModeRef.current === 'screen_on' && !isScreenPinned()) {
      pinScreen();
    }
  }, []);
  const notifyScreenLocked = setScreenLocked; // 하위 호환 유지

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
  const phaseNotifRunId = useRef(new Map()); // timerId → 마지막 scheduleAllPhaseNotifs runId (race condition 방지)
  const seqRescheduleQueue = useRef([]); // seqFlip 페이즈 전환 후 알림 재예약 큐
  const bgTime = useRef(null);
  const plannerNotifIds = useRef([]); // 플래너 리마인더 알림 id 목록
  // 공부 리마인더/리포트 알림은 고정 identifier('reminder-*'/'report-*')로 예약·취소 — id 보관 불필요

  // ref: 최신 weeklySchedule / sessions (schedulePlannerReminders에서 사용)
  const weeklyScheduleRef = useRef(null);
  const sessionsRef = useRef([]);
  weeklyScheduleRef.current = weeklySchedule;
  sessionsRef.current = sessions;

  // 🔥모드 활성화
  const activateScreenOnMode = useCallback(async () => {
    try {
      // 이미 어두운 값(≤0.06)을 원본으로 캡처하면 복원해도 계속 어두움 → 0.4 폴백
      try {
        const b = await Brightness.getBrightnessAsync();
        originalBrightness.current = b > 0.06 ? b : 0.4;
      } catch { originalBrightness.current = 0.4; }
      await activateKeepAwakeAsync('focus');
      try { await Brightness.setBrightnessAsync(0.05); } catch {}
    } catch {}
    setFocusMode('screen_on');
    setUltraFocus({ isAway: false, awayAt: null, exitCount: 0, totalAwayMs: 0, showWarning: false, showChallenge: false, challengeAwayMs: 0, gaveUp: false, pauseAllowed: false });
    // 시험 강도(안드로이드): OS 화면 고정 — 홈/최근앱 버튼 차단으로 무의식적 이탈 방지
    // (첫 호출 시 OS가 자체 확인 다이얼로그를 띄움. iOS/Expo Go는 no-op)
    if (Platform.OS === 'android' && (settingsRef.current.ultraFocusLevel || 'normal') === 'exam') {
      pinScreen().then(ok => {
        if (ok && !settingsRef.current.guidePin) {
          updateSettings({ guidePin: true });
          showToastCustom('화면이 고정돼요. 해제: 뒤로+최근앱 동시에 길게', 'toru');
        }
      });
    }
    // iOS: 집중 도전(🔥) 세션 동안 Screen Time 앱 차단 — 잠금 강도와 무관하게
    // 설정에서 켠 경우 항상 적용 (미지원/entitlement 미포함 빌드에서는 no-op)
    // 시험 강도 + 전체 차단 옵션이 켜져 있으면 허용 앱 빼고 모두 차단(allowAll)
    if (Platform.OS === 'ios') {
      if (settingsRef.current.appBlockEnabled) {
        const allowAll = !!settingsRef.current.appBlockExamAll
          && (settingsRef.current.ultraFocusLevel || 'normal') === 'exam';
        setShield(true, allowAll ? 'allowAll' : 'block');
      } else if (!settingsRef.current.guideAppBlock && shieldSupported()) {
        // 발견성: 설정 깊숙이 있는 앱 차단 기능을 첫 집중 도전 시작 때 1회 안내
        updateSettings({ guideAppBlock: true });
        setTimeout(() => {
          Alert.alert(
            '앱 차단',
            '집중 도전 중에 유튜브 등 선택한 앱을 실제로 잠글 수 있어요.\n설정 탭 > 집중 도전 모드 > 앱 차단에서 켜보세요.',
          );
        }, 800);
      }
    }
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
      unpinScreen(); // 시험 강도 화면 고정 해제 (미고정 상태면 no-op)
      setShield(false); // iOS 앱 차단 방패 해제 (미적용 상태면 no-op)
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
    // 원래 밝기 미확보 상태면 먼저 캡처 — 어둡게 적용이 캡처보다 먼저 끝나는 레이스로
    // 0.05가 '원본'으로 저장되면 해제해도 계속 어두운 문제 방지 (iOS에서 보고됨)
    if (originalBrightness.current === null) {
      try {
        const b = await Brightness.getBrightnessAsync();
        originalBrightness.current = b > 0.06 ? b : 0.4;
      } catch { originalBrightness.current = 0.4; }
    }
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

      if (state === 'inactive') {
        // iOS: 백그라운드 진입 '후'에는 시스템 밝기 변경이 무시될 수 있어 inactive 시점에 미리 복원
        // (제어센터/알림센터 때문에 inactive가 온 경우엔 active 복귀 시 다시 어둡게 적용됨)
        if (Platform.OS === 'ios' && mode === 'screen_on' && screenLockedRef.current) {
          restoreBrightness();
        }
      }
      else if (state === 'background') {
        bgTime.current = Date.now();

        // 백그라운드 진입 시 타이머 스냅샷 즉시 저장 (앱 종료 대비)
        const activeTimers = timersRef.current.filter(t => t.status === 'running' || t.status === 'paused');
        if (activeTimers.length > 0) {
          lastSnapshotSaveRef.current = Date.now();
          saveTimerSnapshot({ savedAt: Date.now(), timers: timersRef.current });
        }

        // 🔥모드에서만 이탈 감지 (keep-awake라서 background = 진짜 이탈)
        // 단, 안드 화면 고정 중의 배경 전환은 화면 끄기/전화 수신 등 OS 이벤트뿐이고
        // 다른 앱 사용이 불가능하므로 이탈로 치지 않는다 (고정 해제 후 나간 경우만 이탈)
        const pinnedNow = Platform.OS === 'android' && isScreenPinned();
        if (mode === 'screen_on' && hasRunning && !pinnedNow && !ultraRef.current.gaveUp && !ultraRef.current.pauseAllowed) {
          setUltraFocus(prev => ({ ...prev, isAway: true, awayAt: Date.now() }));
          const charName = { toru: '토루', paengi: '팽이', taco: '타코', totoru: '토토루' }[uf.mainCharacter] || '토루';
          fireNotif(`${charName}랑 같이 열공하자!`, '타이머가 돌아가고 있어~');
          // 이탈이 길어지면 30초/1분/3분/5분 단계별 복귀 유도 (복귀 시 취소)
          scheduleAwayNudges(charName);
          // 안드: 이탈 중 상시 상태 알림 (복귀 시 제거)
          presentAwaySticky();
          // Live Activity 부제를 '이탈 중' 문구로 전환 (아래 laTimerBg 동기화에서 반영)
          setLiveActivityAway(true);
          // 밝기/다크 복원 (다른 앱에서 어두우면 불편)
          restoreBrightness();
        }
        // 📖모드는 아무것도 안 함

        // 연속모드/뽀모도로: 백그라운드 진입 시 페이즈 알림 재예약
        // break→work 전환 후 seqRescheduleQueue가 비어있는 경우 OS 알림이 누락될 수 있으므로 방어적으로 재예약
        timersRef.current
          .filter(t => t.status === 'running' && (t.type === 'sequence' || t.type === 'pomodoro'))
          .forEach(t => scheduleAllPhaseNotifs(t));

        // iOS Live Activity: 백그라운드 표시 모드로 갱신 (연속모드 → 전체 남은 시간 카운트다운)
        // bg 진입 시점엔 timers 상태가 안 바뀌어 동기화 effect가 안 돌므로 명시적으로 호출
        const laTimerBg = timersRef.current.find(t => t.type !== 'lap' && (t.status === 'running' || t.status === 'paused')) || null;
        if (laTimerBg) syncLiveActivity(laTimerBg, { darkMode: settingsRef.current.darkMode, accentColor: settingsRef.current.accentColor });
      }
      else if (state === 'active') {
        const gap = bgTime.current ? Math.floor((Date.now() - bgTime.current) / 1000) : 0;
        const awayMs = bgTime.current ? Date.now() - bgTime.current : 0;
        bgTime.current = null;
        const wasAway = ultraRef.current.isAway;

        // 이탈 넛지/상태 알림 정리 + Live Activity '이탈 중' 해제 (laTimerFg 동기화/틱에서 원래 부제로 복원)
        cancelAwayNudges();
        dismissAwaySticky();
        setLiveActivityAway(false);

        // 시험 강도(안드): 고정을 풀고 나갔다 돌아오면 자동 재고정 (세션이 살아있는 동안)
        if (Platform.OS === 'android'
            && (settingsRef.current.ultraFocusLevel || 'normal') === 'exam'
            && focusModeRef.current === 'screen_on'
            && !ultraRef.current.gaveUp
            && timersRef.current.some(t => t.status === 'running' || t.status === 'paused')
            && !isScreenPinned()) {
          pinScreen();
        }

        // iOS: inactive 시점에 복원했던 밝기를, 잠금화면이 유지 중이면 다시 어둡게
        // (제어센터/알림센터를 내렸다 올린 경우 등 — 챌린지 표시 중엔 입력해야 하므로 제외)
        if (Platform.OS === 'ios' && screenLockedRef.current && focusModeRef.current === 'screen_on'
            && !ultraRef.current.showChallenge) {
          applyFocusBrightness();
        }

        // 위젯에서 체크한 할 일 반영 + 자정 넘김 리셋 — 순서 보장을 위해 한 체인에서 처리
        // (재로드가 리셋 뒤에 resolve되면 리셋 결과를 pre-리셋 storage 값으로 되덮기 때문)
        consumeWidgetTodoDirty().then(async (dirty) => {
          if (dirty) {
            // 헤드리스 핸들러가 storage에 직접 썼으므로 재로드
            // (안 하면 다음 자동저장이 메모리 todos로 덮어써 위젯 체크가 사라짐)
            const [td, tl] = await Promise.all([loadTodos(), loadTodoLog()]);
            if (Array.isArray(td)) setTodos(td);
            if (Array.isArray(tl)) setTodoLog(tl);
          }
          // 자정 넘김: 앱을 재시작하지 않고 날이 바뀐 경우에도 할일 일일 리셋 실행
          // (리셋은 원래 로드 시에만 돌아 밤새 켜두면 어제 완료 잔존/반복 인스턴스 미생성이었음)
          // lastTodoResetDate가 비어 있으면 아직 초기 로드 전 — 로드 쪽 리셋에 맡긴다
          const todayNow = getToday();
          if (settingsRef.current.lastTodoResetDate && settingsRef.current.lastTodoResetDate !== todayNow) {
            setTodos(prev => applyDailyTodoReset(prev, { today: todayNow, needsReset: true }).todos);
            setSettings(prev => ({ ...prev, lastTodoResetDate: todayNow }));
          }
        });

        // 홈 화면 위젯 갱신 (외부에서 자정 넘김/데이터 변동 반영, iOS는 실행 중 앵커 포함)
        updateAllWidgets(timersRef.current.find(t => t.type !== 'lap' && t.status === 'running') || null);

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
            if (t.type === 'pomodoro' || t.type === 'sequence') {
              return fastForwardPhases({ ...t, elapsedSec: e });
            }
            return { ...t, elapsedSec: e };
          }));
        }

        // iOS Live Activity: 포그라운드 복귀 즉시 항목별 표시로 복원
        // (페이즈 전환 보정은 위 setTimers 이후 동기화 effect가 마저 갱신)
        const laTimerFg = timersRef.current.find(t => t.type !== 'lap' && (t.status === 'running' || t.status === 'paused')) || null;
        if (laTimerFg) syncLiveActivity(laTimerFg, { darkMode: settingsRef.current.darkMode, accentColor: settingsRef.current.accentColor });

        // 포그라운드 복귀 시 리포트 알림 재예약 (최신 공부 데이터 반영)
        scheduleWeeklyReport();
        scheduleMonthlyReport();
      }
    });
    return () => sub.remove();
  }, []);

  // 리포트 알림 탭 처리: 알림 탭 → pendingReportTab 설정 + 토스트 안내
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const type = response.notification.request.content.data?.type;
      const char = settingsRef.current.mainCharacter || 'toru';
      if (type === 'weeklyReport') {
        setPendingReportTab('weekly');
        showToastCustom('이번 주 공부 리포트예요! 통계 탭에서 확인해봐요', char);
      } else if (type === 'monthlyReport') {
        setPendingReportTab('monthly');
        showToastCustom('이번 달 공부 리포트예요! 통계 탭에서 확인해봐요', char);
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

  // 타이머 결과 계산 — 순수 계산은 timerCore.calcTimerResult, 여기서는 현재 모드/이탈 상태만 주입
  const calcResult = (t, dur) => {
    const mode = focusModeRef.current || 'screen_off';
    return calcTimerResult(t, dur, {
      focusMode: mode,
      exitCount: mode === 'screen_on' ? (ultraRef.current.exitCount || 0) : 0,
      schoolLevel: settingsRef.current?.schoolLevel || 'high',
      ultraFocusLevel: mode === 'screen_on' ? (settingsRef.current?.ultraFocusLevel || 'normal') : 'normal',
    });
  };

  // 뽀모도로 페이즈 전환 — 순수 계산은 timerCore.pomoFlipCore, 여기서는 부수효과(세션 기록/진동)만
  const pomoFlip = (t, skipNotif = false) => {
    const { endedPhase, workSession, next } = pomoFlipCore(t);
    if (workSession) {
      recordSessionInternal({
        ...workSession,
        focusMode: focusModeRef.current || 'screen_off',
        exitCount: focusModeRef.current === 'screen_on' ? (ultraRef.current?.exitCount || 0) : 0,
      });
    }
    // 알림은 예약 알림(scheduleAllPhaseNotifs)이 처리 — fireNotif 제거(중복 방지)
    if (!skipNotif && settingsRef.current.notifEnabled) {
      Vibration.vibrate(endedPhase === 'work' ? [0, 300, 100, 300] : [0, 200, 100, 200]);
    }
    return next;
  };

  // 연속모드 페이즈 전환 — 순수 계산은 timerCore.seqFlipCore, 여기서는 부수효과만
  // (세션 기록, 완료 result/모달, 진동, 즉시 알림, phase 알림 취소/재예약 큐)
  const seqFlip = (t, skipNotif = false) => {
    const core = seqFlipCore(t);
    const mode = focusModeRef.current || 'screen_off';
    const ufState = ultraRef.current;

    // 완료 경로면 세션 기록 전에 result 확정 → densityOverride로 모달/세션 밀도 일치
    // (work 완주 완료는 totalSec, break 안전장치 완료는 0 기준)
    const result = core.kind === 'completed'
      ? calcResult(t, core.endedPhase === 'work' ? t.totalSec : 0)
      : null;

    let updatedSeqSessionIds = t.seqSessionIds || [];
    if (core.session) {
      const sessId = recordSessionInternal({
        ...core.session,
        focusMode: mode,
        exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0,
        ...(result ? { densityOverride: result.density } : {}),
      });
      if (sessId) updatedSeqSessionIds = [...updatedSeqSessionIds, sessId];
    }

    if (core.kind === 'completed') {
      // 전체 완료 (예약 알림이 처리, 잔여 phase notif 정리)
      if (core.endedPhase === 'work') {
        if (!skipNotif && settingsRef.current.notifEnabled) Vibration.vibrate([0, 500, 200, 500]);
        phaseNotifMap.current.delete(t.id);
      }
      setCompletedResultData({ timerId: t.id, label: t.seqName || '연속모드', result, isSeq: true, seqTotal: t.seqTotal, seqSessionIds: updatedSeqSessionIds });
      return { ...core.next, result, seqSessionIds: updatedSeqSessionIds };
    }

    if (core.kind === 'toBreak') {
      if (!skipNotif && settingsRef.current.notifEnabled) {
        Vibration.vibrate([0, 200, 100, 200]);
        // 포그라운드: 기존 예약 phase 알림 취소 후 즉시 알림 발송 (예약 알림 취소 race condition 방지)
        const oldPhaseIds = phaseNotifMap.current.get(t.id) || [];
        phaseNotifMap.current.delete(t.id);
        oldPhaseIds.forEach(pid => Notifications.cancelScheduledNotificationAsync(pid).catch(() => {}));
        // 경계 시각(next.resumedAt) identifier — 같은 경계의 예약 알림이 이미 발화했어도 교체돼 1장만 남음
        if (core.notif) fireNotif(core.notif.title, core.notif.body, `phase-${t.id}-${core.next.resumedAt}`);
      }
      const newBreakTimer = { ...core.next, seqSessionIds: updatedSeqSessionIds };
      seqRescheduleQueue.current.push(newBreakTimer);
      return newBreakTimer;
    }

    // toWork (쉬는시간 끝 → 다음 항목 시작)
    // break→work 전환 시에는 재예약 하지 않음
    // (break 시작 시점에 이미 재예약됐고, 재예약하면 break-end 알림이 취소될 수 있음)
    if (!skipNotif && settingsRef.current.notifEnabled) {
      Vibration.vibrate([0, 200, 100, 200]);
      // 경계 시각(next.resumedAt) identifier — 같은 경계의 예약 알림을 교체 (중복 방지)
      if (core.notif) fireNotif(core.notif.title, core.notif.body, `phase-${t.id}-${core.next.resumedAt}`);
    }
    return core.next;
  };

  // bg 복귀·콜드스타트 복원 공용: 경과가 페이즈 목표를 넘긴 running 뽀모/연속을
  // 지난 페이즈만큼 전진 (중간 세션 기록 포함, 진동/즉시알림 스킵 — OS 예약분이 이미 발송됨).
  // 호출 전 elapsedSec에 벽시계 보정값을 넣을 것. 그 외 타입은 그대로 반환
  const fastForwardPhases = (t) => {
    if (t.type === 'pomodoro') {
      let tt = t;
      while (true) {
        const target = pomoPhaseTargetSec(tt);
        if (tt.elapsedSec < target) break;
        const leftover = tt.elapsedSec - target;
        tt = pomoFlip({ ...tt, elapsedSec: target }, true);
        tt = { ...tt, elapsedSec: leftover };
      }
      return tt;
    }
    if (t.type === 'sequence') {
      let tt = t;
      while (tt.status !== 'completed') {
        const target = tt.seqPhase === 'work' ? tt.totalSec : tt.seqBreakSec;
        if (tt.elapsedSec < target) break;
        const leftover = tt.elapsedSec - target;
        tt = seqFlip({ ...tt, elapsedSec: target }, true);
        if (tt.status === 'completed') break;
        tt = { ...tt, elapsedSec: leftover };
      }
      return tt;
    }
    return t;
  };

  const fireComplete = (t, skipNotif = false) => {
    // 자연 완료(카운트다운 목표 도달): 시작 시 예약한 OS 완료 알림·시험모드 진동 알람·위젯
    // 갱신 알람이 정확히 이 시각에 발화하도록 설계돼 있고, 취소/즉시발송은 발화와의 레이스를
    // 이길 수 없어 중복 알림이 떴다(같은 identifier 교체도 실기기에서 미동작 재현).
    // → 자연 완료는 아무것도 취소하지 않고 즉시 알림도 쏘지 않는다.
    //   완료 알림은 예약분이 단일 소스(뽀모도로 페이즈 알림과 동일 설계).
    // 중도 종료(포기 등)·자유/랩 타이머는 기존대로: 예약분 취소(알람이 멀어 확실히 취소됨) + 즉시 알림.
    const naturalEnd = t.type === 'countdown' && t.totalSec > 0 && t.elapsedSec >= t.totalSec;
    if (!naturalEnd) cancelTimerNotif(t.id);
    const mode = focusModeRef.current || 'screen_off';
    const ufState = ultraRef.current;
    const isPerfect = mode === 'screen_on' && ufState.exitCount === 0 && !ufState.gaveUp;
    if (!skipNotif && !naturalEnd) {
      if (isPerfect && t.elapsedSec >= 300) {
        fireNotif('퍼펙트 집중!', `${t.label} 이탈 없이 완료! Verified!`, `complete-${t.id}`);
        if (settingsRef.current.notifEnabled) Vibration.vibrate([0, 300, 100, 300, 100, 500, 200, 800]);
        showToastCustom('이탈 0회! Verified!', 'taco');
      } else {
        fireNotif(`${t.label} 완료!`, '수고했어!', `complete-${t.id}`);
        if (settingsRef.current.notifEnabled) Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      }
    } else {
      // 자연 완료(예약 알림이 표시) 또는 백그라운드 복귀(이미 발송됨) → 진동+토스트만
      if (isPerfect && t.elapsedSec >= 300) {
        if (settingsRef.current.notifEnabled) Vibration.vibrate([0, 300, 100, 300, 100, 500, 200, 800]);
        showToastCustom('이탈 0회! Verified!', 'taco');
      } else {
        if (settingsRef.current.notifEnabled) Vibration.vibrate([0, 500, 200, 500, 200, 500]);
        showToastCustom(`${t.label} 완료!`, 'toru');
      }
    }
    // 뽀모도로/연속모드 휴식 페이즈 중 종료(그만하기 등) → 휴식 시간을 공부로 기록하지 않음
    //   (이전 work 페이즈는 pomoFlip/seqFlip이 이미 세션으로 기록함)
    const inBreakPhase = (t.type === 'pomodoro' && t.pomoPhase !== 'work') || (t.type === 'sequence' && t.seqPhase !== 'work');
    if (t.type !== 'lap' && !inBreakPhase && (t.elapsedSec >= 300 || ((t.planId || t.todoId) && t.elapsedSec >= 30))) {
      const exitCnt = mode === 'screen_on' ? (ufState.exitCount || 0) : 0;
      // 카운트다운: 중도 종료(그만하기 등)도 이 경로로 올 수 있으므로 실제 경과 시간만 기록
      // 연속모드(그만하기 경로)는 항목 기준 카운트다운으로 기록 (seqFlip/stopTimer와 동일 규칙)
      const recType = t.type === 'sequence' ? 'countdown' : t.type;
      const realDurationSec = recType === 'countdown' ? Math.min(t.elapsedSec, t.totalSec) : t.elapsedSec;
      const sessId = recordSessionInternal({
        subjectId: t.subjectId, label: t.label, startedAt: t.startedAt,
        durationSec: realDurationSec,
        mode: recType, pauseCount: t.pauseCount, exitCount: exitCnt,
        focusMode: mode, timerType: recType,
        completionRatio: recType === 'countdown' ? Math.min(1, t.elapsedSec / Math.max(1, t.totalSec)) : 1,
        pomoSets: t.pomoSet || 0, planId: t.planId || null, todoId: t.todoId || null,
        dedupeKey: `complete|${t.id}|${t.startedAt}`,
      });
      // 완료 결과 모달 트리거 (랩/시퀀스 제외)
      if (t.type !== 'sequence') {
        const result = calcResult(t, realDurationSec);
        const durationSec = realDurationSec;
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
          setCompletedResultData({ timerId: t.id, label: t.label, result, isSeq: false, sessionId: sessId, todoId: t.todoId || null });
        }
      }
      return sessId;
    }
    return null;
  };

  // identifier: 예약 알림과 같은 id를 주면 OS가 트레이에서 교체 — 예약분 취소가 발화와
  // 레이스로 지더라도(완료 시각 ≈ 알람 시각) 중복 알림이 쌓이지 않는다
  const fireNotif = async (title, body, identifier) => {
    if (!settingsRef.current.notifEnabled) return;
    try {
      await Notifications.scheduleNotificationAsync({
        ...(identifier ? { identifier } : {}),
        content: { title, body, sound: 'default', vibrate: [0, 300, 100, 300],
          ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
        },
        trigger: null,
      });
    } catch {}
  };

  // 🔥모드 이탈 중 에스컬레이팅 넛지 — 이탈이 길어질수록 단계별 복귀 유도 알림 (복귀 시 전부 취소)
  // 백그라운드 진입 직후 OS에 미리 예약해 두므로 JS가 중단돼도 발송된다
  // 취소 세대 카운터 — 예약(await) 진행 중에 복귀(취소)가 끼어들면, 그 뒤에 완료된 예약을
  // 즉시 취소한다 (안 그러면 취소를 비껴간 넛지가 복귀 후 앱 사용 중에 발송됨)
  const awayNudgeCancelGen = useRef(0);
  const scheduleAwayNudges = async (charName) => {
    if (!settingsRef.current.notifEnabled) return;
    const gen = awayNudgeCancelGen.current;
    // countdown이 곧 끝나면 그 이후 넛지는 예약하지 않음 (완료 알림 뒤 '타이머 진행 중' 거짓 문구 방지)
    const cdRemains = timersRef.current
      .filter(t => t.status === 'running' && t.type === 'countdown')
      .map(t => getRealRemainingSec(t));
    const limitSec = cdRemains.length ? Math.min(...cdRemains) : Infinity;
    const NUDGES = [
      { sec: 30, title: '아직 집중 시간이에요', body: `${charName}가 기다리고 있어요. 타이머는 계속 가는 중!` },
      { sec: 60, title: '이탈 1분째', body: '집중이 끊기고 있어요. 얼른 돌아와요!' },
      { sec: 180, title: '이탈 3분째', body: '집중밀도가 떨어지고 있어요. 다시 시작해요!' },
      { sec: 300, title: '이탈 5분째', body: '오늘 목표를 잊지 않았죠? 지금 돌아오면 충분해요!' },
    ];
    for (const n of NUDGES) {
      if (n.sec >= limitSec) break;
      try {
        const trigger = Platform.OS === 'android'
          ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + n.sec * 1000), channelId: 'timer-complete' }
          : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: n.sec };
        const id = await Notifications.scheduleNotificationAsync({
          // 고정 identifier: 리마운트로 id 목록이 유실돼도 재이탈 시 대체 + 복귀 시 항상 취소 가능
          identifier: `away-nudge-${n.sec}`,
          content: {
            title: n.title, body: n.body, sound: 'default',
            // iOS: 방해금지/집중모드도 뚫는 Time Sensitive (entitlement 필요 — app.config.js)
            ...(Platform.OS === 'ios' && { interruptionLevel: 'timeSensitive' }),
            ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
          },
          trigger,
        });
        if (awayNudgeCancelGen.current !== gen) {
          // 예약 도중 복귀함 → 방금 예약분 즉시 취소하고 중단
          Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
          return;
        }
      } catch {}
    }
  };
  const cancelAwayNudges = () => {
    awayNudgeCancelGen.current++;
    // 고정 identifier 전체를 취소 — 리마운트로 세션이 바뀌어도 이전 세션의 넛지까지 정리됨
    [30, 60, 180, 300].forEach(sec => { Notifications.cancelScheduledNotificationAsync(`away-nudge-${sec}`).catch(() => {}); });
  };

  // 안드로이드: 이탈 중 상시(sticky) 상태 알림 — iOS Live Activity '이탈 중' 표시의 안드 대응물.
  // 스와이프로 지울 수 없고, 복귀하면 코드로 제거한다. 탭하면 앱이 열린다.
  const awayStickyCancelGen = useRef(0);
  const presentAwaySticky = async () => {
    if (Platform.OS !== 'android' || !settingsRef.current.notifEnabled) return;
    const gen = awayStickyCancelGen.current;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier: 'away-sticky',
        content: {
          title: '집중 이탈 중',
          body: '열공메이트로 돌아와서 집중을 이어가요',
          sticky: true,
          channelId: 'focus-status',
        },
        trigger: null,
      });
      if (awayStickyCancelGen.current !== gen) {
        // 게시 도중 복귀함 → sticky가 영구히 남지 않도록 즉시 제거
        Notifications.dismissNotificationAsync(id).catch(() => {});
      }
    } catch {}
  };
  const dismissAwaySticky = () => {
    awayStickyCancelGen.current++;
    // 고정 identifier로 제거 — 리마운트로 세션이 바뀌어도 sticky가 영구히 남지 않음
    Notifications.dismissNotificationAsync('away-sticky').catch(() => {});
  };

  // 실제 남은 초 정밀 계산 (wall clock 기반, 소수점 포함) — timerCore.realRemainingSec 위임
  const getRealRemainingSec = (t) => realRemainingSec(t);

  // 백그라운드 알림 예약 — 타이머 시작/재개 시 OS에 미리 등록
  const scheduleTimerNotif = async (timerId, label, seconds, customTitle, customBody) => {
    // 안드: 종료 시각에 홈 위젯 강제 갱신 알람 — 앱이 죽어 있어도 '집중 중' 해제/오늘합계 반영.
    // 알림 설정과 무관한 위젯 표시 정확성용이라 notifEnabled 가드보다 먼저 예약한다.
    if (Platform.OS === 'android' && seconds > 0) {
      scheduleWidgetRefresh(`widget-refresh-${timerId}`, Date.now() + Math.ceil(seconds) * 1000 + 2000);
    }
    if (!settingsRef.current.notifEnabled) return;
    try {
      const existingId = notifIdMap.current.get(timerId);
      if (existingId) {
        await Notifications.cancelScheduledNotificationAsync(existingId);
        notifIdMap.current.delete(timerId);
      }
      // 맵 유실(리마운트/복원) 시에도 이전 완료 알림이 중복 예약되지 않도록 저장소 스캔
      await cancelTaggedNotifs(timerId, ['complete']);
      if (seconds <= 0) return;
      const sec = Math.max(1, Math.ceil(seconds));
      // Android: DATE 트리거 → USE_EXACT_ALARM/SCHEDULE_EXACT_ALARM 권한 시 setExactAndAllowWhileIdle 사용
      // iOS: TIME_INTERVAL 트리거 → expo-notifications의 DATE→Int() ms 잘림 버그 우회 (최대 1초 오차 방지)
      const trigger = Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + sec * 1000), channelId: 'timer-complete' }
        : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: sec };
      const id = await Notifications.scheduleNotificationAsync({
        // 고정 identifier: 완료 순간 fireComplete의 즉시 알림이 같은 id로 발송돼
        // 이 알림을 교체한다 (취소 레이스에서 져도 중복 없음). 재예약 시 기존 예약 대체 덤
        identifier: `complete-${timerId}`,
        content: {
          title: customTitle || `${label} 완료!`,
          body: customBody || '타이머가 끝났어요!',
          data: { kind: 'complete', timerId },
          sound: 'default', vibrate: [0, 500, 200, 500, 200, 500],
          ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
        },
        trigger,
      });
      notifIdMap.current.set(timerId, id);

      // 시험 강도(안드): 화면 고정 중엔 OS가 알림 소리/진동을 차단 → 완료 시각에 네이티브 진동 알람 병행
      // (리시버가 고정 중일 때만 울리므로, 고정이 풀린 경우엔 일반 알림만 울림)
      if (Platform.OS === 'android' && (settingsRef.current.ultraFocusLevel || 'normal') === 'exam') {
        const aid = `pin-${timerId}`;
        scheduleLockAlarm(aid, Date.now() + sec * 1000);
        const prev = lockAlarmIds.current.get(timerId) || [];
        if (!prev.includes(aid)) lockAlarmIds.current.set(timerId, [...prev, aid]);
      }
    } catch {}
  };

  // OS 예약 저장소에서 이 타이머의 알림을 태그(content.data)로 찾아 일괄 취소.
  // 인메모리 id 맵(notifIdMap/phaseNotifMap)은 액티비티 재생성(프로세스 유지, JS 리마운트 —
  // 모듈 스코프 cancelAll도 다시 안 돎)이나 강제종료 후 복원 시 유실되므로,
  // 맵만 믿으면 이전 세션의 예약이 살아남아 같은 알림이 중복 발송된다 (2026-07 실기기 재현).
  // shouldAbort: getAll 이후 취소 직전에 검사 — 더 최신 예약 호출이 방금 만든 세트를 지우는 레이스 방지
  const cancelTaggedNotifs = async (timerId, kinds, shouldAbort) => {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      if (shouldAbort && shouldAbort()) return;
      const stale = all.filter(r => {
        const d = r?.content?.data;
        return d && d.timerId === timerId && kinds.includes(d.kind);
      });
      await Promise.all(stale.map(r => Notifications.cancelScheduledNotificationAsync(r.identifier).catch(() => {})));
    } catch {}
  };

  // 예약 알림 취소 — 일시정지/중지/삭제 시
  const lockAlarmIds = useRef(new Map()); // timerId -> [네이티브 진동 알람 id]
  const cancelTimerNotif = async (timerId) => {
    try {
      // 위젯 강제 갱신 알람 취소 — 일시정지/중지/앱 내 완료 시 (앱이 살아 있으면 위젯 effect가 갱신함)
      cancelWidgetRefresh(`widget-refresh-${timerId}`);
      // 화면 고정용 네이티브 진동 알람도 함께 취소
      const alarmIds = lockAlarmIds.current.get(timerId) || [];
      lockAlarmIds.current.delete(timerId);
      alarmIds.forEach(aid => cancelLockAlarm(aid));

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
      // 맵에 없는 잔여 예약(리마운트/복원 이전 세션분)까지 저장소 스캔으로 청소
      await cancelTaggedNotifs(timerId, ['complete', 'phase']);
    } catch {}
  };

  // 뽀모도로·연속모드: 모든 미래 페이즈 알림 일괄 예약
  const scheduleAllPhaseNotifs = async (timer) => {
    // 안드: 마지막 페이즈 종료 시각(연속모드는 전체 완료 시각)에 위젯 강제 갱신 알람.
    // 같은 id 재예약은 기존 알람 대체 — 페이즈 전환마다 호출돼도 1개만 유지된다.
    if (Platform.OS === 'android') {
      const allSpecs = buildPhaseNotifSpecs(timer);
      const lastSpec = allSpecs[allSpecs.length - 1];
      if (lastSpec) scheduleWidgetRefresh(`widget-refresh-${timer.id}`, lastSpec.absMs + 2000);
    }
    if (!settingsRef.current.notifEnabled) return;
    // race condition 방지: 같은 타이머에 거의 동시에 여러 번 호출될 때 최신 호출만 실행
    const runId = Date.now() + Math.random();
    phaseNotifRunId.current.set(timer.id, runId);
    // 기존 페이즈 알림 먼저 취소
    const oldIds = phaseNotifMap.current.get(timer.id) || [];
    phaseNotifMap.current.delete(timer.id);
    for (const pid of oldIds) {
      try { await Notifications.cancelScheduledNotificationAsync(pid); } catch {}
    }
    // 맵에 없는 잔여 예약까지 저장소 스캔으로 청소 — 액티비티 재생성/강제종료 복원 후에는
    // 맵이 비어 있어 이전 세션의 예약 세트가 살아남고, 페이즈 시각은 벽시계 기준 결정적이라
    // 재예약마다 같은 시각의 알림이 한 장씩 쌓여 중복 발송됐다 (shouldAbort로 최신 호출 세트 보호)
    await cancelTaggedNotifs(timer.id, ['phase'], () => phaseNotifRunId.current.get(timer.id) !== runId);
    // 취소하는 동안 더 최신 호출이 들어왔으면 중단 (그쪽이 새로 예약함)
    if (phaseNotifRunId.current.get(timer.id) !== runId) return;

    // Step 1: 알림 스펙 목록 계산 (순수 — timerCore.buildPhaseNotifSpecs, 기준 시각은 resumedAt)
    const specs = buildPhaseNotifSpecs(timer);

    // Step 2: 모든 알림을 병렬 예약 (Promise.all)
    // — 순차 await 시 scheduleNotificationAsync 호출마다 누적 지연이 발생해
    //   나중 페이즈 알림일수록 secFromNow/Date가 밀리는 문제를 방지
    // — 각 msFromNow/secFromNow를 동시(동기)에 계산하므로 기준 시각이 동일
    const now = Date.now(); // 모든 스펙의 기준 시각을 한 번에 고정
    const ids = (await Promise.all(
      specs.map(async ({ absMs, title, body }) => {
        const msFromNow = absMs - now;
        if (msFromNow <= 0) return null;
        // Android: DATE 절대시각 트리거 (exact alarm)
        // iOS: TIME_INTERVAL 트리거 → expo-notifications DATE→Int() ms 잘림 버그 우회
        const secFromNow = Math.max(1, Math.ceil(msFromNow / 1000));
        const trigger = Platform.OS === 'android'
          ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(absMs), channelId: 'timer-complete' }
          : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secFromNow };
        return Notifications.scheduleNotificationAsync({
          // 페이즈 경계 시각 기반 고정 identifier — 전환 순간의 즉시 알림(fireNotif)이 같은
          // id로 발송돼 이 알림을 교체한다 (예약분 취소가 발화와 레이스로 져도 중복 없음).
          // absMs와 전환의 next.resumedAt은 같은 산식(phaseEndAtMs, 불변식 2)이라 정확히 일치
          identifier: `phase-${timer.id}-${absMs}`,
          content: { title, body, data: { kind: 'phase', timerId: timer.id }, sound: 'default', vibrate: [0, 300, 100, 300], ...(Platform.OS === 'android' && { channelId: 'timer-complete' }) },
          trigger,
        }).catch(() => null);
      })
    )).filter(Boolean);

    // Promise.all 완료 후 방금 예약한 알림을 즉시 취소해야 하는 두 경우:
    // 1) 이 호출보다 더 최신 호출이 들어옴(runId 변경) → 그쪽이 새로 예약하므로 내 것은 중복(유령 알림)
    //    ※ 앞선 runId 가드(취소 단계)만으로는 부족 — 예약 단계에서 겹친 동시 호출을 여기서 정리
    // 2) 타이머가 이미 종료/삭제됨(cancelTimerNotif가 Promise.all 진행 중 호출된 레이스)
    const superseded = phaseNotifRunId.current.get(timer.id) !== runId;
    const timerStillActive = timersRef.current.some(
      t => t.id === timer.id && (t.status === 'running' || t.status === 'paused')
    );
    if (superseded || !timerStillActive) {
      ids.forEach(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}));
      return;
    }

    if (ids.length > 0) phaseNotifMap.current.set(timer.id, ids);

    // 시험 강도(안드): 화면 고정 중 알림 소리/진동 차단 대비 — 각 페이즈 시각에 네이티브 진동 알람 병행
    // (리시버가 고정 중일 때만 울리므로 고정 해제 상태에선 일반 알림만 울림)
    if (Platform.OS === 'android' && (settingsRef.current.ultraFocusLevel || 'normal') === 'exam') {
      (lockAlarmIds.current.get(timer.id) || []).forEach(aid => cancelLockAlarm(aid));
      const aids = [];
      specs.forEach(({ absMs }, i) => {
        if (absMs <= now) return;
        const aid = `pin-${timer.id}#${i}`;
        scheduleLockAlarm(aid, absMs);
        aids.push(aid);
      });
      lockAlarmIds.current.set(timer.id, aids);
    }
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
    if (!settingsRef.current.plannerNotifEnabled) return;
    const ws = weeklyScheduleRef.current;
    if (!ws || !ws.enabled) return;

    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayKeys[new Date().getDay()];
    const dayData = ws[dayKey];
    if (!dayData) return;

    const now = Date.now();
    const today = getToday();
    // '이번 주만' 계획은 해당 주에만 알림 대상 + '이번 주만 삭제'(skipWeeks)된 주는 제외
    const wkStart = getWeekStartStr(0);
    const activePlans = (dayData.plans || []).filter(p => (!p.onlyWeek || p.onlyWeek === wkStart) && !(p.skipWeeks && p.skipWeeks.includes(wkStart)));
    const activeFixed = (dayData.fixed || []).filter(f => (!f.onlyWeek || f.onlyWeek === wkStart) && !(f.skipWeeks && f.skipWeeks.includes(wkStart)));

    // 1) 고정 일정 종료 + 10분 후 알림 (미완료 계획 있을 때만, 이번 주 휴무 고정일정 제외)
    if (activeFixed.length && activePlans.length) {
      for (const fixed of activeFixed) {
        if (!fixed.end) continue;
        const [endH, endM] = fixed.end.split(':').map(Number);
        const endDate = new Date();
        endDate.setHours(endH, endM, 0, 0);
        const triggerMs = endDate.getTime() + 10 * 60 * 1000;
        if (triggerMs <= now) continue;

        const hasIncompletePlan = activePlans.some(plan => {
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
            // 고정 identifier: 리마운트로 id 목록이 유실돼도 재예약이 이전 예약을 대체 (중복 방지)
            identifier: `planner-fixedend-${fixed.id || fixed.label}`,
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
    for (const plan of activePlans) {
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
            identifier: `planner-pre-${plan.id}`,
            content: {
              title: '공부 시작 10분 전',
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
            identifier: `planner-start-${plan.id}`,
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
    // 기존 리마인더 취소 (고정 identifier — 리마운트로 세션이 바뀌어도 정리됨)
    for (const id of ['reminder-daily', 'reminder-streak']) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    }

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
      if (hasTodaySession && toDateStr(triggerDate) === todayStr) {
        triggerDate.setDate(triggerDate.getDate() + 1);
      }
      try {
        const trigger = Platform.OS === 'android'
          ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate, channelId: 'timer-complete' }
          : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate };
        await Notifications.scheduleNotificationAsync({
          identifier: 'reminder-daily',
          content: {
            title: '오늘 공부 시작해볼까?',
            body: s.streak > 0 ? `${s.streak}일 연속 공부 중! 오늘도 이어가자!` : '잠깐이라도 좋으니 시작해봐!',
            sound: 'default',
            ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
          },
          trigger,
        });
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
        await Notifications.scheduleNotificationAsync({
          identifier: 'reminder-streak',
          content: {
            title: '연속 공부 끊길 위기!',
            body: `${s.streak}일 연속이 오늘 끊겨요! 잠깐이라도 공부하자!`,
            sound: 'default',
            ...(Platform.OS === 'android' && { channelId: 'timer-complete' }),
          },
          trigger,
        });
      } catch {}
    }
  }, []);

  // 주간 공부 리포트 알림 예약 — 이번 주 일요일 밤 11시 발송
  const scheduleWeeklyReport = useCallback(async () => {
    // 고정 identifier로 취소 — 리마운트로 세션이 바뀌어도 정리됨
    await Notifications.cancelScheduledNotificationAsync('report-weekly').catch(() => {});
    const sett = settingsRef.current;
    if (!sett.weeklyReportEnabled || !sett.notifEnabled) return;

    const now = new Date();
    const thisSunday = new Date(now);
    thisSunday.setDate(now.getDate() - now.getDay()); // 이번 주 일요일(주 시작) — 앱 전반 일요일 기준 통일
    thisSunday.setHours(0, 0, 0, 0);

    const thisWeekDates = []; // 일~토
    for (let i = 0; i < 7; i++) {
      const d = new Date(thisSunday);
      d.setDate(thisSunday.getDate() + i);
      thisWeekDates.push(toDateStr(d));
    }

    const thisWeekSessions = sessionsRef.current.filter(sess => thisWeekDates.includes(sess.date));
    const totalSec = thisWeekSessions.reduce((sum, sess) => sum + (sess.durationSec || 0), 0);
    if (totalSec === 0) return;

    const lastWeekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(thisSunday);
      d.setDate(thisSunday.getDate() - 7 + i);
      lastWeekDates.push(toDateStr(d));
    }
    const lastWeekSessions = sessionsRef.current.filter(sess => lastWeekDates.includes(sess.date));
    const lastWeekTotal = lastWeekSessions.reduce((sum, sess) => sum + (sess.durationSec || 0), 0);

    const totalHours = Math.floor(totalSec / 3600);
    const totalMins = Math.floor((totalSec % 3600) / 60);
    const timeStr = totalHours > 0 ? `${totalHours}시간 ${totalMins}분` : `${totalMins}분`;
    const studyDays = thisWeekDates.filter(d =>
      sessionsRef.current.some(sess => sess.date === d && (sess.durationSec || 0) > 0)
    ).length;

    let compStr = '';
    if (lastWeekTotal > 0) {
      const diffMins = Math.round((totalSec - lastWeekTotal) / 60);
      if (diffMins > 0) compStr = ` · 지난주보다 ${diffMins}분 ↑`;
      else if (diffMins < 0) compStr = ` · 지난주보다 ${Math.abs(diffMins)}분 ↓`;
    }

    const fireAt = new Date(thisSunday);       // 주 시작(일) + 6 = 이번 주 토요일
    fireAt.setDate(thisSunday.getDate() + 6);
    fireAt.setHours(23, 0, 0, 0);              // 토요일 밤 23시 발송 (주 마지막 날)
    if (fireAt.getTime() <= Date.now()) return;

    try {
      const trigger = Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: 'report' }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt };
      await Notifications.scheduleNotificationAsync({
        identifier: 'report-weekly',
        content: {
          title: '이번 주 공부 리포트',
          body: `총 ${timeStr} · ${studyDays}일 공부${compStr}`,
          data: { type: 'weeklyReport' },
          sound: 'default',
        },
        trigger,
      });
    } catch {}
  }, []);

  // 월간 공부 리포트 알림 예약 — 이번 달 마지막 날 밤 11시 발송
  const scheduleMonthlyReport = useCallback(async () => {
    // 고정 identifier로 취소 — 리마운트로 세션이 바뀌어도 정리됨
    await Notifications.cancelScheduledNotificationAsync('report-monthly').catch(() => {});
    const sett = settingsRef.current;
    if (!sett.monthlyReportEnabled || !sett.notifEnabled) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const thisMonthDates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      thisMonthDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }

    const thisMonthSessions = sessionsRef.current.filter(sess => thisMonthDates.includes(sess.date));
    const totalSec = thisMonthSessions.reduce((sum, sess) => sum + (sess.durationSec || 0), 0);
    if (totalSec === 0) return;

    const lastMonth = month === 0 ? 11 : month - 1;
    const lastMonthYear = month === 0 ? year - 1 : year;
    const daysInLastMonth = new Date(lastMonthYear, lastMonth + 1, 0).getDate();
    const lastMonthDates = [];
    for (let d = 1; d <= daysInLastMonth; d++) {
      lastMonthDates.push(`${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    const lastMonthSessions = sessionsRef.current.filter(sess => lastMonthDates.includes(sess.date));
    const lastMonthTotal = lastMonthSessions.reduce((sum, sess) => sum + (sess.durationSec || 0), 0);

    const studyDays = thisMonthDates.filter(d =>
      sessionsRef.current.some(sess => sess.date === d && (sess.durationSec || 0) > 0)
    ).length;

    const totalHours = Math.floor(totalSec / 3600);
    const totalMins = Math.floor((totalSec % 3600) / 60);
    const timeStr = totalHours > 0 ? `${totalHours}시간 ${totalMins}분` : `${totalMins}분`;

    let compStr = '';
    if (lastMonthTotal > 0) {
      const diffHours = Math.round((totalSec - lastMonthTotal) / 3600);
      if (diffHours > 0) compStr = ` · 지난달보다 ${diffHours}시간 ↑`;
      else if (diffHours < 0) compStr = ` · 지난달보다 ${Math.abs(diffHours)}시간 ↓`;
    }

    const lastDayOfMonth = new Date(year, month + 1, 0);
    lastDayOfMonth.setHours(23, 0, 0, 0);
    if (lastDayOfMonth.getTime() <= Date.now()) return;

    const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    try {
      const trigger = Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: lastDayOfMonth, channelId: 'report' }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: lastDayOfMonth };
      await Notifications.scheduleNotificationAsync({
        identifier: 'report-monthly',
        content: {
          title: `${MONTH_NAMES[month]} 공부 리포트`,
          body: `총 ${timeStr} · ${studyDays}일 공부${compStr}`,
          data: { type: 'monthlyReport' },
          sound: 'default',
        },
        trigger,
      });
    } catch {}
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
        result: null, laps: [], planId: opts.planId || null, todoId: opts.todoId || null, resumedAt: startedAt, elapsedSecAtResume: 0,
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
      // 휴식 페이즈 중 중지 → 휴식 시간을 공부 세션으로 기록하지 않음 (work 페이즈는 flip 시 이미 기록됨)
      const inBreakPhase = (t.type === 'pomodoro' && t.pomoPhase !== 'work') || (t.type === 'sequence' && t.seqPhase !== 'work');
      if (t.type !== 'lap' && !inBreakPhase && (t.elapsedSec >= 300 || ((t.planId || t.todoId) && t.elapsedSec >= 30)) && t.status !== 'completed') {
        const mode = focusModeRef.current || 'screen_off';
        const ufState = ultraRef.current;
        // 연속모드는 항목 기준 카운트다운으로 기록 (seqFlip/cancelSequence와 동일 규칙 — 밀도 공식·통계 라벨 일관)
        const recType = t.type === 'sequence' ? 'countdown' : t.type;
        const sessId = recordSessionInternal({ subjectId: t.subjectId, label: t.label, startedAt: t.startedAt, durationSec: t.elapsedSec, mode: recType, pauseCount: t.pauseCount, focusMode: mode, exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0, timerType: recType, completionRatio: recType === 'countdown' ? Math.min(1, t.elapsedSec / Math.max(1, t.totalSec)) : 1, pomoSets: t.pomoSet || 0, planId: t.planId || null, todoId: t.todoId || null, dedupeKey: `complete|${t.id}|${t.startedAt}` });
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
            setCompletedResultData({ timerId: t.id, label: t.label, result, isSeq: false, sessionId: sessId, todoId: t.todoId || null });
          }
        } else {
          setCompletedResultData({ timerId: t.id, label: t.label, result, isSeq: false, sessionId: sessId, todoId: t.todoId || null });
        }
        return { ...t, status: 'completed', result, memoSessionId: sessId };
      }
      return { ...t, status: 'completed', result: t.result || calcResult(t, t.elapsedSec) };
    }));
  }, []);

  // 시퀀스 재시작/리셋 시 첫 항목 기준으로 되돌리는 필드 (label/totalSec 등은 진행하며 바뀜)
  const seqResetFields = (t) => t.type !== 'sequence' ? {} : {
    seqPhase: 'work', seqIndex: 0, seqSessionIds: [],
    label: t.seqItems?.[0]?.label ?? t.label, color: t.seqItems?.[0]?.color ?? t.color,
    subjectId: t.seqItems?.[0]?.subjectId ?? null, totalSec: t.seqItems?.[0]?.totalSec ?? t.totalSec,
  };

  const restartTimer = useCallback((id) => {
    const now = Date.now();
    const t = timersRef.current.find(t => t.id === id);
    if (t) {
      const restarted = { ...t, elapsedSec: 0, status: 'running', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null, laps: [], startedAt: now, resumedAt: now, elapsedSecAtResume: 0, ...seqResetFields(t) };
      if (t.type === 'countdown' && t.totalSec > 0) scheduleTimerNotif(id, t.label, t.totalSec);
      else if (t.type === 'pomodoro' || t.type === 'sequence') scheduleAllPhaseNotifs(restarted);
    }
    setTimers(prev => prev.map(t => t.id === id ? { ...t, elapsedSec: 0, status: 'running', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null, laps: [], startedAt: now, resumedAt: now, elapsedSecAtResume: 0, ...seqResetFields(t) } : t));
    showToast('start');
  }, []);

  const resetTimer = useCallback((id) => {
    cancelTimerNotif(id); // 예약 알림 취소
    setTimers(prev => prev.map(t => t.id === id ? { ...t, elapsedSec: 0, status: 'paused', pauseCount: 0, pomoPhase: 'work', pomoSet: 0, result: null, laps: [], resumedAt: null, elapsedSecAtResume: 0, ...seqResetFields(t) } : t));
  }, []);

  const removeTimer = useCallback((id) => {
    cancelTimerNotif(id); // 예약 알림 취소
    setTimers(prev => {
      const t = prev.find(timer => timer.id === id);
      const inBreakPhase = t && ((t.type === 'pomodoro' && t.pomoPhase !== 'work') || (t.type === 'sequence' && t.seqPhase !== 'work'));
      if (t && !inBreakPhase && (t.status === 'running' || t.status === 'paused') && t.elapsedSec >= 300) {
        const mode = focusModeRef.current || 'screen_off';
        const ufState = ultraRef.current;
        // 연속모드는 항목 기준 카운트다운으로 기록 (stopTimer/seqFlip과 동일 규칙)
        const recType = t.type === 'sequence' ? 'countdown' : t.type;
        recordSessionInternal({
          subjectId: t.subjectId, label: t.label, startedAt: t.startedAt,
          durationSec: t.elapsedSec, mode: recType, pauseCount: t.pauseCount,
          focusMode: mode, exitCount: mode === 'screen_on' ? (ufState.exitCount || 0) : 0,
          timerType: recType, completionRatio: recType === 'countdown' ? Math.min(1, t.elapsedSec / Math.max(1, t.totalSec)) : 1,
          pomoSets: t.pomoSet || 0, planId: t.planId || null, todoId: t.todoId || null,
          dedupeKey: `complete|${t.id}|${t.startedAt}`,
        });
      }
      return prev.filter(timer => timer.id !== id);
    });
    // deps에 recordSessionInternal을 넣으면 선언(아래쪽 const) 전 TDZ 접근 — Hermes는 통과하지만 스펙상 크래시
  }, []);

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
  const soundRefsMap = useRef({}); // { [id]: AudioPlayer (expo-audio) }

  const stopAllSounds = async () => {
    const entries = Object.entries(soundRefsMap.current);
    soundRefsMap.current = {};
    for (const [, s] of entries) {
      try { s.pause(); } catch {}
      try { s.remove(); } catch {}
    }
  };

  // activeSounds 변경 시 — 추가/제거 diff 처리
  useEffect(() => {
    if (loading) return;
    const activeSounds = settings.activeSounds ?? [];
    const currentIds = Object.keys(soundRefsMap.current);

    const toRemove = currentIds.filter(id => !activeSounds.includes(id));
    for (const id of toRemove) {
      const s = soundRefsMap.current[id];
      delete soundRefsMap.current[id];
      if (s) { try { s.pause(); } catch {} try { s.remove(); } catch {} }
    }

    const toAdd = activeSounds.filter(id => !currentIds.includes(id) && SOUND_FILES[id]);
    if (toAdd.length === 0) return;

    let cancelled = false;
    const loadNew = async () => {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
      for (const id of toAdd) {
        if (cancelled) break;
        try {
          const player = createAudioPlayer(SOUND_FILES[id]);
          player.loop = true;
          player.volume = (settings.soundVolume ?? 70) / 100;
          if (cancelled) { try { player.remove(); } catch {} break; }
          soundRefsMap.current[id] = player;
          player.play();
        } catch {}
      }
    };
    loadNew();
    return () => { cancelled = true; };
  }, [settings.activeSounds, loading]);

  // 볼륨 변경 시 (사운드 교체 없이 볼륨만)
  useEffect(() => {
    if (loading) return;
    const vol = (settings.soundVolume ?? 70) / 100;
    Object.values(soundRefsMap.current).forEach(s => { try { s.volume = vol; } catch {} });
  }, [settings.soundVolume, loading]);

  // 앱 종료 시 정리
  useEffect(() => {
    return () => { stopAllSounds(); };
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
      // Android 13+(API 33+): 알림 권한 요청 전 상태 확인 → 재설치 감지용
      // requestPermissionsAsync 호출 후에는 유저가 허용하면 'granted'가 되어 판단 불가
      let freshInstallDetected = false;
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const prePerm = await Notifications.getPermissionsAsync();
        if (!prePerm.granted) freshInstallDetected = true;
      }
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
      let [s, subj, sess, dd, td, cuf, fv, tl] = await Promise.all([loadSettings(), loadSubjects(), loadSessions(), loadDDays(), loadTodos(), loadCountupFavs(), loadFavs(), loadTodoLog()]);
      // 형태 방어: 손상된 저장값(비배열 등)이 있으면 그 키만 무시 — .filter/.map 크래시로 앱이 먹통되는 것 방지
      if (s && (typeof s !== 'object' || Array.isArray(s))) s = null;
      if (!Array.isArray(subj)) subj = null;
      if (!Array.isArray(sess)) sess = null;
      if (!Array.isArray(dd)) dd = null;
      if (!Array.isArray(td)) td = null;
      if (cuf && !Array.isArray(cuf)) cuf = null;
      if (!Array.isArray(fv)) fv = null;
      if (Array.isArray(tl)) setTodoLog(tl);
      if (s) {
        // 마이그레이션
        if (s.ultraFocusStrict !== undefined && !s.ultraFocusLevel) {
          s.ultraFocusLevel = s.ultraFocusStrict ? 'exam' : 'focus';
          delete s.ultraFocusStrict;
        }
        if (s.ultraFocusEnabled !== undefined) delete s.ultraFocusEnabled;
        // schoolLevel 마이그레이션: 'elementary' → 'elementary_upper'
        if (s.schoolLevel === 'elementary') s.schoolLevel = 'elementary_upper';
        // soundId → activeSounds 마이그레이션
        if (!Array.isArray(s.activeSounds)) {
          s.activeSounds = (s.soundId && s.soundId !== 'none') ? [s.soundId] : [];
        }
        delete s.soundId;
        // 할일 시험 탭 기본 라벨 개명: 시험대비 → D-Day (구 기본값 그대로인 경우만 — 직접 바꾼 사용자는 유지)
        if (s.todoLabelExam === '시험대비') s.todoLabelExam = 'D-Day';
        // 재설치 시 exactAlarmGuideShown 리셋 (구글 백업 복원 대응, Android 13+)
        if (freshInstallDetected) s.exactAlarmGuideShown = false;
        setSettings({ ...DEFAULT_SETTINGS, ...s });
      } if (subj) setSubjects(subj);
      if (sess) setSessions(sess); if (dd) setDDays(dd);
      // 할일 매일 자동 초기화: 완료된 일반 항목 삭제, 반복 항목은 done만 리셋
      const today = getToday();
      const mergedSettings = s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
      if (td) {
        // 새 필드 마이그레이션 (기존 todo에 없는 필드 기본값 추가)
        let migrated = td.map(t => ({
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
          dueDate:      t.dueDate      ?? null,
        }));
        // 드래그 정렬 도입 마이그레이션(일회성): 화면 정렬이 [완료, 우선순위]에서 [완료, 배열순서]로
        // 바뀌므로, 기존 배열을 우선순위로 한 번 안정 정렬해 업데이트 직후에도 보이는 순서를 유지
        if (!mergedSettings.todoOrderMigrated) {
          const pOrd = { high: 0, normal: 1, low: 2 };
          migrated = [...migrated].sort((a, b) => (pOrd[a.priority] ?? 1) - (pOrd[b.priority] ?? 1));
          setSettings(prev => ({ ...prev, todoOrderMigrated: true }));
        }
        // 일일 리셋 파이프라인 (규칙/구현: todoUtils.applyDailyTodoReset, 테스트 有)
        // — 지난날 반복 인스턴스 정리 + (날 바뀌었으면) 완료 항목 리셋 + 오늘 반복 인스턴스 생성
        const needsReset = mergedSettings.lastTodoResetDate !== today;
        const { todos: finalTodos, changed } = applyDailyTodoReset(migrated, { today, needsReset });
        setTodos(finalTodos);
        if (needsReset) {
          await saveTodos(finalTodos); // 크래시 대비 즉시 저장
          setSettings(prev => ({ ...prev, lastTodoResetDate: today }));
        } else if (changed) {
          // 같은 날 재실행의 자가 치유(지난날 중복 정리 등)도 즉시 저장
          await saveTodos(finalTodos);
        }
      }
      if (cuf) setCountupFavs(cuf);
      if (fv && fv.length > 0) setFavs(fv);
      const ws = await loadWeeklySchedule();
      if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
        // '이번 주만'(onlyWeek) 계획/고정일정 중 지난 주 항목 정리
        const wkStart0 = getWeekStartStr(0);
        let wsChanged = false;
        const cleaned = { ...ws };
        // 지난 주 일회성(onlyWeek) 블록 제거 + 지난 주 건너뛰기(skipWeeks) 기록 정리 (무한 증가 방지)
        const hasStale = (arr) => (arr || []).some(b => (b.onlyWeek && b.onlyWeek < wkStart0) || (b.skipWeeks && b.skipWeeks.some(w => w < wkStart0)));
        const pruneStale = (arr) => (arr || [])
          .filter(b => !b.onlyWeek || b.onlyWeek >= wkStart0)
          .map(b => b.skipWeeks ? { ...b, skipWeeks: b.skipWeeks.filter(w => w >= wkStart0) } : b);
        ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].forEach(k => {
          const day = cleaned[k];
          if (!day) return;
          if (!hasStale(day.plans) && !hasStale(day.fixed)) return;
          wsChanged = true;
          cleaned[k] = { ...day, plans: pruneStale(day.plans), fixed: pruneStale(day.fixed) };
        });
        setWeeklySchedule(cleaned);
        if (wsChanged) saveWeeklySchedule(cleaned);
      }
      // 콜드 스타트 1회: 이전 프로세스의 잔여 예약 알람 제거 — 복원 재예약 전에 await로 순서 보장
      // (기존 모듈 스코프 fire-and-forget은 위젯 헤드리스에서도 돌고, 복원 예약과 순서도 비보장이었음)
      if (!staleNotifCleanupDone) {
        staleNotifCleanupDone = true;
        await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      }
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
              // 앱이 꺼져 있는 동안 완료된 카운트다운: 세션 기록 후 제거 (기록 없이 버리면 공부시간 유실)
              if (e >= t.totalSec) {
                if (t.totalSec >= 300 || ((t.planId || t.todoId) && t.totalSec >= 30)) {
                  recordSessionInternal({
                    subjectId: t.subjectId, label: t.label, startedAt: t.startedAt,
                    durationSec: t.totalSec, mode: 'countdown', pauseCount: t.pauseCount || 0,
                    focusMode: 'screen_off', exitCount: 0, timerType: 'countdown',
                    completionRatio: 1, planId: t.planId || null, todoId: t.todoId || null,
                    // 완료 직후(기록됨)~스냅샷 정리 사이에 죽은 경우 영속 dedupe로 재기록 방지 (불변식 3)
                    dedupeKey: `complete|${t.id}|${t.startedAt}`,
                  });
                  showToastCustom(`${t.label} 완료! 공부 기록을 저장했어요`, 'toru');
                }
                return null;
              }
              // 실행 중이었으면 running 유지 (resumedAt 갱신)
              if (t.status === 'running') return { ...t, elapsedSec: e, status: 'running', resumedAt: now, elapsedSecAtResume: e };
              return { ...t, elapsedSec: e, status: 'paused', resumedAt: null, elapsedSecAtResume: e };
            }
            if (t.status === 'running') {
              // 뽀모/연속: 죽어 있던 동안 지난 페이즈를 전진 (중간 세트 세션 기록 포함).
              // stale 페이즈로 두면 buildPhaseNotifSpecs의 첫 경계가 과거 시각 → 스펙 0개로
              // 이후 페이즈 알림이 전부 무음이 되고, 틱 캐치업이 페이즈마다 진동을 울린다.
              // resumedAt은 epoch 기준이라 프로세스가 죽어도 유효 — 재앵커 없이 벽시계로
              // 보정해야 전진된 세션 시각(pomoFlipCore의 페이즈 역산)이 정확하다
              if ((t.type === 'pomodoro' || t.type === 'sequence') && t.resumedAt) {
                const wallElapsed = (t.elapsedSecAtResume || 0) + Math.floor((now - t.resumedAt) / 1000);
                return fastForwardPhases({ ...t, elapsedSec: wallElapsed });
              }
              return { ...t, elapsedSec: newElapsed, status: 'running', resumedAt: now, elapsedSecAtResume: newElapsed };
            }
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
      // 이전 세션의 Live Activity id 복원 (iOS) — 동기화 effect가 재사용/정리
      await initLiveActivity();
      setLoading(false);
    })();
  }, []);

  // 자동 저장
  const saveRef = useRef(null);
  useEffect(() => {
    if (loading) return; clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      saveSettings(settings); saveSubjects(subjects); saveSessions(sessions); saveDDays(ddays);
      // 위젯이 storage의 todos를 직접 수정했으면(오늘할일 체크) 메모리로 덮어쓰지 않고 재로드.
      // 앱 JS가 백그라운드에 살아있는 동안(실행 중 타이머의 포그라운드 서비스) 다른 상태 변화로
      // autosave가 돌면, 이 가드 없이는 위젯 체크가 stale 메모리에 덮여 조용히 풀린다.
      // 재로드된 setTodos가 다음 사이클의 autosave를 다시 트리거하므로 저장 누락은 없다.
      if (await consumeWidgetTodoDirty()) {
        const [td, tl] = await Promise.all([loadTodos(), loadTodoLog()]);
        if (Array.isArray(td)) setTodos(td);
        if (Array.isArray(tl)) setTodoLog(tl);
      } else {
        saveTodos(todos); saveTodoLog(todoLog);
      }
      saveCountupFavs(countupFavs); saveFavs(favs); if (weeklySchedule) saveWeeklySchedule(weeklySchedule);
    }, 500);
  }, [settings, subjects, sessions, ddays, todos, todoLog, countupFavs, favs, weeklySchedule, loading]);

  // 백업 넛지 — 로드 완료 후 1회 판정 (기록 20세션+, 마지막 백업/넛지에서 30일 경과 시 토스트)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      if (shouldNudgeBackup(sessions.length, settings)) {
        showToastCustom('공부 기록이 오래 백업되지 않았어요. 설정 > 데이터 백업 추천!', settings.mainCharacter || 'toru');
        setSettings(prev => ({ ...prev, lastBackupNudgeAt: Date.now() }));
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [loading]);

  // 홈 화면 위젯 갱신(Android/iOS 공통) — 위젯이 읽는 데이터(세션/과목/D-Day/설정) 변경 시.
  // Android는 AsyncStorage를 직접 읽고, iOS는 App Group에 스냅샷을 기록하므로
  // 자동저장(500ms 디바운스)보다 늦게 읽도록 여유를 두고 호출.
  // 실행 중 타이머의 상태 변화(시작/일시정지/페이즈 전환)도 시그니처로 감지해 갱신
  // — iOS는 실시간 카운팅 앵커, Android는 '집중 중' 표시 (elapsedSec 틱은 제외 → 초당 호출 없음).
  const widgetTimerSig = useMemo(() => {
    const t = timers.find(x => x.type !== 'lap' && (x.status === 'running' || x.status === 'paused'));
    if (!t) return '';
    const phase = t.type === 'pomodoro' ? t.pomoPhase : (t.type === 'sequence' ? t.seqPhase : '');
    return `${t.id}|${t.status}|${phase}|${t.resumedAt || 0}|${t.elapsedSecAtResume || 0}`;
  }, [timers]);
  const widgetUpdateRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    clearTimeout(widgetUpdateRef.current);
    widgetUpdateRef.current = setTimeout(() => {
      const active = timersRef.current.find(t => t.type !== 'lap' && t.status === 'running') || null;
      updateAllWidgets(active);
    }, 900);
  }, [sessions, subjects, ddays, settings, todos, widgetTimerSig, loading]);

  // Live Activity 동기화 (iOS 잠금화면/Dynamic Island) — 활성 타이머 1개 기준
  // elapsedSec 틱은 시그니처에서 제외되므로 상태 변화 시에만 네이티브 호출 발생
  useEffect(() => {
    if (loading) return;
    const active = timers.find(t => t.type !== 'lap' && (t.status === 'running' || t.status === 'paused')) || null;
    syncLiveActivity(active, { darkMode: settings.darkMode, accentColor: settings.accentColor });
  }, [timers, loading, settings.darkMode, settings.accentColor]);

  // 스터디룸 presence 동기화 — 타이머 상태 시그니처/세션(오늘 누적) 변화 시에만.
  // 초당 쓰기 금지(설계 8): elapsed 틱 제외, 모듈 내부 presenceSig 중복 가드가 재전송도 차단.
  // studyRoomEnabled를 켠 유저만 네트워크 사용 — 미사용자는 완전 로컬 유지
  useEffect(() => {
    if (loading || !settings.studyRoomEnabled) return;
    const h = setTimeout(() => {
      const active = timersRef.current.find(t => t.type !== 'lap' && t.status === 'running') || null;
      const today = getToday();
      syncStudyRoomPresence(buildStudyPresence(active, {
        todaySec: studyRoomTodaySec(sessionsRef.current, today), today,
      }));
    }, 1000);
    return () => clearTimeout(h);
  }, [widgetTimerSig, sessions, settings.studyRoomEnabled, loading]);

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

  // 정확한 알람 권한 안내 (Android 12+/API 31+, 최초 1회)
  // 삼성 등 일부 기기는 Android 13+에서도 정확 알람 권한이 꺼져 있을 수 있어 13+도 노출
  // 온보딩 완료 후 첫 홈화면에서만 뜨도록 게이트 (온보딩 중 방해 방지)
  useEffect(() => {
    if (loading) return;
    if (Platform.OS !== 'android') return;
    if (Platform.Version < 31) return; // Android 11 이하는 정확 알람 권한 불필요
    if (!settings.onboardingDone) return; // 온보딩 끝난 뒤에만
    if (settings.exactAlarmGuideShown) return;
    const timer = setTimeout(() => {
      setShowExactAlarmModal(true);
      updateSettings({ exactAlarmGuideShown: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [loading, settings.onboardingDone, settings.exactAlarmGuideShown]);

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
    if (!dayData) return { fixed: [], plans: [] };
    // '이번 주만'(onlyWeek) 노출 + '이번 주만 삭제/휴무'(skipWeeks)된 주는 계획·고정일정 모두 제외
    const wk = getWeekStartStr(0);
    const inWeek = (b) => (!b.onlyWeek || b.onlyWeek === wk) && !(b.skipWeeks && b.skipWeeks.includes(wk));
    return { ...dayData, fixed: (dayData.fixed || []).filter(inWeek), plans: (dayData.plans || []).filter(inWeek) };
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

  // 세션 중복 기록 방지 (dedupeKey → sessionId)
  // setTimers 업데이터 내부에서 recordSessionInternal을 호출하는 경로(fireComplete/pomoFlip/seqFlip 등)는
  // React가 업데이터를 재실행하면 같은 세션이 두 번 기록될 수 있음 → 같은 키는 기존 세션 id 반환
  const sessionDedupeRef = useRef(new Map());

  // 세션 기록 — 레코드 생성(밀도/날짜/verified 규칙)은 timerCore.buildSessionRecord,
  // 여기서는 멱등 가드(dedupeKey)와 상태 반영(sessions/subjects/스트릭)만 담당
  const recordSessionInternal = useCallback((spec) => {
    const { dedupeKey = null, subjectId = null, durationSec, focusMode: fm = 'screen_off' } = spec;
    if (dedupeKey) {
      const cached = sessionDedupeRef.current.get(dedupeKey);
      if (cached) return cached;
      // 인메모리 맵은 재시작에 유실 — 스냅샷 스로틀(5초)로 뒤처진 상태에서 강제종료되면
      // 복원 캐치업이 종료 직전 이미 기록된 세트/항목을 재기록할 수 있어 영속 레코드도 확인
      const persisted = sessionsRef.current.find(s => s.dedupeKey === dedupeKey);
      if (persisted) {
        sessionDedupeRef.current.set(dedupeKey, persisted.id);
        return persisted.id;
      }
    }
    const ultraLevel = settingsRef.current?.ultraFocusLevel || 'normal';
    const newSess = buildSessionRecord(spec, {
      schoolLevel: settingsRef.current?.schoolLevel || 'high',
      ultraFocusLevel: ultraLevel,
    });
    setSessions(prev => [...prev, newSess]);
    if (subjectId) setSubjects(prev => prev.map(s => s.id === subjectId ? { ...s, totalElapsedSec: (s.totalElapsedSec || 0) + durationSec } : s));
    updateStreak();
    // 위젯 갱신은 아래 데이터 변경 감지 effect(디바운스)가 일괄 처리 — 여기선 호출 불필요
    // 울트라집중 스트릭 갱신
    if (ultraLevel === 'exam' && fm === 'screen_on') updateUltraStreak();
    if (dedupeKey) {
      const m = sessionDedupeRef.current;
      m.set(dedupeKey, newSess.id);
      if (m.size > 100) m.delete(m.keys().next().value); // 오래된 키부터 정리 (무한 증가 방지)
    }
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
      // 보너스 미적용 기준점을 저장해 재적용을 멱등하게 — 103 클램프 상태에서
      // 보너스를 뺐다 다시 주면 점수가 3점씩 흘러내리던 비가역 문제 방지
      const base = s.baseDensity ?? ((s.focusDensity || 0) - oldBonus);
      const newDensity = Math.max(56, Math.min(103, base + newBonus));
      const { getTier } = require('../constants/presets');
      return { ...s, selfRating, baseDensity: base, focusDensity: newDensity, tier: getTier(newDensity).id, ...(memo !== undefined && memo !== null ? { memo } : {}) };
    }));
  }, []);

  // 타이머 메모 업데이트 (완료 카드 표시용)
  const updateTimerMemo = useCallback((timerId, memo) => {
    setTimers(prev => prev.map(t => t.id === timerId ? { ...t, memoText: memo } : t));
  }, []);

  const updateStreak = useCallback(() => {
    setSettings(prev => {
      const today = getToday(); if (prev.lastStudyDate === today) return prev;
      return { ...prev, streak: (prev.lastStudyDate === getYesterday() || !prev.lastStudyDate) ? prev.streak + 1 : 1, lastStudyDate: today };
    });
  }, []);

  // 울트라집중 스트릭 갱신
  const updateUltraStreak = useCallback(() => {
    setSettings(prev => {
      const today = getToday();
      if (prev.ultraStreakDate === today) return prev; // 오늘 이미 갱신됨
      const newStreak = (prev.ultraStreakDate === getYesterday() || !prev.ultraStreakDate) ? (prev.ultraStreak || 0) + 1 : 1;
      return { ...prev, ultraStreak: newStreak, ultraStreakBest: Math.max(newStreak, prev.ultraStreakBest || 0), ultraStreakDate: today };
    });
  }, []);

  const addSubject = useCallback((s) => { const n = { id: generateId('subj_'), totalElapsedSec: 0, isFavorite: false, createdAt: new Date().toISOString(), ...s }; setSubjects(prev => [...prev, n]); return n; }, []);
  const removeSubject = useCallback((id) => setSubjects(prev => prev.filter(s => s.id !== id)), []);
  const updateSubject = useCallback((id, u) => setSubjects(prev => prev.map(s => s.id === id ? { ...s, ...u } : s)), []);
  // 과목 이름/색상 편집 — 비정규화 복사본(할일 subjectLabel/Color, 과목형 플래너 블록, 실행 중 타이머)까지 전파
  const editSubject = useCallback((id, changes) => {
    const before = subjects.find(s => s.id === id);
    if (!before) return;
    setSubjects(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    const name = changes.name ?? before.name;
    const color = changes.color ?? before.color;
    if (name === before.name && color === before.color) return;
    setTodos(prev => prev.map(t => t.subjectId === id ? { ...t, subjectLabel: name, subjectColor: color } : t));
    // 과목형 플래너 블록은 생성 시 과목 이름/색을 복사해 저장 (ScheduleEditorScreen) — 함께 갱신
    setWeeklySchedule(prev => {
      if (!prev) return prev;
      let touched = false;
      const next = { ...prev };
      ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].forEach(k => {
        const day = prev[k];
        if (!Array.isArray(day?.plans) || !day.plans.some(p => p.subjectId === id)) return;
        touched = true;
        next[k] = { ...day, plans: day.plans.map(p => p.subjectId === id ? { ...p, label: name, color } : p) };
      });
      return touched ? next : prev;
    });
    // 과목에서 시작한 실행 중 타이머(라벨=과목명)도 새 이름/색으로
    setTimers(prev => prev.map(t => t.subjectId === id ? { ...t, color, label: t.label === before.name ? name : t.label } : t));
  }, [subjects]);
  // 드래그 정렬 커밋: 표시 순서(orderedIds)대로 subjects 배열 재배치 — 배열 순서가 곧 수동 순서
  const reorderSubjects = useCallback((orderedIds) => setSubjects(prev => applyReorder(prev, orderedIds)), []);
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
    const replaceId = o.replaceId ?? null; // 수정 저장: 이 id 자리에 교체 삽입 (맨 뒤로 밀리면 드래그 순서가 깨짐)
    const tmplId = generateId('todo_');
    setTodos(prev => {
      const replaceIdx = replaceId ? prev.findIndex(t => t.id === replaceId) : -1;
      const base = replaceIdx !== -1 ? prev.filter(t => t.id !== replaceId) : prev;
      // 중복 방지: 같은 목록(scope+ddayId) 안에 같은 텍스트+과목의 미완료 할일이 이미 있으면 건너뜀 (템플릿 제외)
      // scope/ddayId를 비교하지 않으면 오늘 할일이나 다른 시험에 같은 텍스트가 있을 때 추가가 조용히 무시됨
      // 교체 대상 자신은 base에서 이미 빠져 있어 자기 자신과의 중복으로 오탐하지 않음
      if (!isTemplate) {
        const trimmed = text.trim();
        const dup = base.some(t => !t.isTemplate && !t.done && t.text === trimmed
          && t.subjectId === (o.subjectId ?? null)
          && (t.scope ?? 'today') === (o.scope ?? 'today')
          && (t.ddayId ?? null) === (o.ddayId ?? null));
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
        dueDate:      o.dueDate      ?? null,
      };
      const items = [newTmpl];
      // 반복 템플릿이면 오늘 요일에 해당할 경우 인스턴스도 즉시 생성
      if (isTemplate && repeatDays && repeatDays.length > 0) {
        const todayDay = new Date().getDay();
        const todayStr = getToday();
        if (repeatDays.includes(todayDay)) {
          items.push({
            id: generateId('todo_'), text: text.trim(), done: false, completedAt: null,
            repeat: false, subjectId: o.subjectId ?? null, subjectLabel: o.subjectLabel ?? null,
            subjectColor: o.subjectColor ?? null, subjectIcon: o.subjectIcon ?? null,
            priority: o.priority ?? 'normal', scope: 'today', ddayId: null,
            memo: o.memo ?? '', isTemplate: false, repeatDays: null,
            templateId: tmplId, createdDate: todayStr,
          });
        }
      }
      const insertAt = replaceIdx !== -1 ? replaceIdx : base.length;
      return [...base.slice(0, insertAt), ...items, ...base.slice(insertAt)];
    });
  }, []);
  const toggleTodo = useCallback((id) => {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    const done = !t.done;
    const completedAt = done ? Date.now() : null;
    setTodos(prev => prev.map(x => x.id === id ? { ...x, done, completedAt } : x));
    // 완료 이력 로그 — 리셋으로 항목이 삭제돼도 통계에서 조회 가능. 체크 해제 시 회수 (id로 멱등)
    setTodoLog(prev => {
      const rest = prev.filter(e => e.id !== id);
      if (!done) return rest;
      const next = [...rest, {
        id, date: toDateStr(new Date(completedAt)), text: t.text,
        subjectLabel: t.subjectLabel ?? null, subjectColor: t.subjectColor ?? null, scope: t.scope ?? 'today',
      }];
      return next.length > 1000 ? next.slice(next.length - 1000) : next;
    });
  }, [todos]);
  const removeTodo = useCallback((id) => setTodos(prev => prev.filter(t => t.id !== id)), []);
  // 커스텀 목록 삭제 시 소속 할일 일괄 제거
  const removeTodosByScope = useCallback((scope) => setTodos(prev => prev.filter(t => t.scope !== scope)), []);
  const toggleTodoRepeat = useCallback((id) => setTodos(prev => prev.map(t => t.id === id ? { ...t, repeat: !t.repeat } : t)), []);
  const updateTodo = useCallback((id, fields) => setTodos(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t)), []);
  // 드래그 정렬 커밋: 그룹 항목들을 배열 내 기존 자리에 새 순서로 재배치 (그룹 밖 위치 불변)
  const reorderTodos = useCallback((orderedIds) => setTodos(prev => applyReorder(prev, orderedIds)), []);
  // (반복 인스턴스 생성은 applyDailyTodoReset 파이프라인으로 통합 — 로드/자정 넘김 두 경로 공용)

  // 할일 헬퍼 함수 — '오늘'은 오늘 목록 소속 + 기한 도래 항목 (isTodayVisible, My Day 모델)
  const getTodayTodos = useCallback(() =>
    todos.filter(t => isTodayVisible(t, getToday())),
  [todos]);
  const getTodosBySubject = useCallback((subjectId) =>
    todos.filter(t => !t.isTemplate && t.subjectId === subjectId),
  [todos]);
  const getTodoCompletionRate = useCallback(() => {
    const todayT = todos.filter(t => isTodayVisible(t, getToday()));
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
  }, [weeklySchedule, settings.plannerNotifEnabled, settings.notifEnabled, loading]);

  // 공부 리마인더: 앱 시작 + 세션/설정 변경 시 재예약
  const studyReminderDebounceRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    clearTimeout(studyReminderDebounceRef.current);
    studyReminderDebounceRef.current = setTimeout(() => {
      scheduleStudyReminders();
    }, 2000);
  }, [sessions.length, settings.dailyReminderEnabled, settings.dailyReminderHour, settings.dailyReminderMin, settings.streakReminderEnabled, settings.streak, loading]);

  // 리포트 알림: 앱 시작 + 세션/리포트 설정 변경 시 재예약
  const reportDebounceRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    clearTimeout(reportDebounceRef.current);
    reportDebounceRef.current = setTimeout(() => {
      scheduleWeeklyReport();
      scheduleMonthlyReport();
    }, 2500);
  }, [sessions.length, settings.weeklyReportEnabled, settings.monthlyReportEnabled, settings.notifEnabled, loading]);

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
    const tl = await loadTodoLog();
    if (Array.isArray(tl)) setTodoLog(tl);
    if (cuf) setCountupFavs(cuf);
    if (fv && fv.length > 0) setFavs(fv);
    const ws = await loadWeeklySchedule();
    if (ws) setWeeklySchedule(ws);
  }, []);

  return (
    <AppContext.Provider value={{
      loading, settings, updateSettings,
      subjects, addSubject, removeSubject, updateSubject, editSubject, reorderSubjects,
      sessions, todaySessions, todayTotalSec, runningTodaySec, recordSession, updateSessionMemo, updateTimerMemo, updateSessionSelfRating,
      ddays, addDDay, removeDDay, updateDDay, setPrimaryDDay,
      todos, addTodo, toggleTodo, removeTodo, removeTodosByScope, toggleTodoRepeat, updateTodo, reorderTodos, todoLog,
      getTodayTodos, getTodosBySubject, getTodoCompletionRate, getExamTodos, mood,
      timers, addTimer, pauseTimer, resumeTimer, stopTimer, restartTimer, resetTimer, removeTimer, addLap, setTimers,
      startSequence, cancelSequence,
      completedResultData, setCompletedResultData,
      pendingModeAction, requestModeSelect, resolveModeSelect, cancelModeSelect,
      showExactAlarmModal, dismissExactAlarmModal: () => setShowExactAlarmModal(false),
      pendingReportTab, clearPendingReportTab: () => setPendingReportTab(null),
      toast, showToast, showToastCustom,
      focusMode, activateScreenOnMode, activateScreenOffMode, deactivateFocusMode,
      applyFocusBrightness, restoreBrightness, notifyScreenLocked,
      screenLocked, setScreenLocked,
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