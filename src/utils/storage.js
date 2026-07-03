// src/utils/storage.js
// AsyncStorage 래퍼 — 안전한 읽기/쓰기

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SETTINGS: '@yeolgong/settings',
  SUBJECTS: '@yeolgong/subjects',
  SESSIONS: '@yeolgong/sessions',
  DDAYS: '@yeolgong/ddays',
  TODOS: '@yeolgong/todos',
  DAILY_RECORDS: '@yeolgong/dailyRecords',
  TIMER_SNAPSHOT: '@yeolgong/timerSnapshot',
  COUNTUP_FAVS: '@yeolgong/countupFavs',
  FAVS: '@yeolgong/favs',
  WEEKLY_SCHEDULE: '@yeolgong/weeklySchedule',
};

/**
 * 안전하게 JSON 저장
 */
const saveJSON = async (key, data) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
};

/**
 * 안전하게 JSON 로드
 */
const loadJSON = async (key, fallback = null) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

// ── 설정 ──
export const saveSettings = (settings) => saveJSON(KEYS.SETTINGS, settings);
export const loadSettings = () => loadJSON(KEYS.SETTINGS, null);

// ── 과목 ──
export const saveSubjects = (subjects) => saveJSON(KEYS.SUBJECTS, subjects);
export const loadSubjects = () => loadJSON(KEYS.SUBJECTS, []);

// ── 세션 ──
export const saveSessions = (sessions) => saveJSON(KEYS.SESSIONS, sessions);
export const loadSessions = () => loadJSON(KEYS.SESSIONS, []);

// ── D-Day ──
export const saveDDays = (ddays) => saveJSON(KEYS.DDAYS, ddays);
export const loadDDays = () => loadJSON(KEYS.DDAYS, []);

// ── 할 일 ──
export const saveTodos = (todos) => saveJSON(KEYS.TODOS, todos);
export const loadTodos = () => loadJSON(KEYS.TODOS, []);

// ── 공부량 즐겨찾기 ──
export const saveCountupFavs = (favs) => saveJSON(KEYS.COUNTUP_FAVS, favs);
export const loadCountupFavs = () => loadJSON(KEYS.COUNTUP_FAVS, null);

// ── 카운트다운 즐겨찾기 ──
export const saveFavs = (favs) => saveJSON(KEYS.FAVS, favs);
export const loadFavs = () => loadJSON(KEYS.FAVS, []);

// ── 일일 기록 ──
export const saveDailyRecords = (records) => saveJSON(KEYS.DAILY_RECORDS, records);
export const loadDailyRecords = () => loadJSON(KEYS.DAILY_RECORDS, {});

// ── 타이머 스냅샷 (자동 저장용) ──
export const saveTimerSnapshot = (snapshot) => saveJSON(KEYS.TIMER_SNAPSHOT, snapshot);
export const loadTimerSnapshot = () => loadJSON(KEYS.TIMER_SNAPSHOT, null);
export const clearTimerSnapshot = async () => {
  try { await AsyncStorage.removeItem(KEYS.TIMER_SNAPSHOT); } catch {}
};

// ── 주간 스케줄 ──
export const saveWeeklySchedule = (schedule) => saveJSON(KEYS.WEEKLY_SCHEDULE, schedule);
export const loadWeeklySchedule = () => loadJSON(KEYS.WEEKLY_SCHEDULE, null);

// ── 전체 초기화 ──
export const clearAllData = async () => {
  try {
    const keys = Object.values(KEYS);
    await AsyncStorage.multiRemove(keys);
    return true;
  } catch {
    return false;
  }
};

// ── 백업/복원 ──
const BACKUP_KEYS = [
  'SETTINGS', 'SUBJECTS', 'SESSIONS', 'DDAYS', 'TODOS',
  'DAILY_RECORDS', 'COUNTUP_FAVS', 'FAVS', 'WEEKLY_SCHEDULE',
];

// 키별 기대 타입 — 잘못된 형태를 복원하면 로드 경로(.filter/.map)가 매 실행마다
// 크래시해 앱이 재설치 전까지 먹통이 되므로, 형태가 안 맞는 키는 복원에서 제외한다.
const BACKUP_KEY_SHAPES = {
  SETTINGS: 'object', SUBJECTS: 'array', SESSIONS: 'array', DDAYS: 'array',
  TODOS: 'array', DAILY_RECORDS: 'object', COUNTUP_FAVS: 'array', FAVS: 'array',
  WEEKLY_SCHEDULE: 'object',
};

const matchesShape = (value, shape) => shape === 'array'
  ? Array.isArray(value)
  : (typeof value === 'object' && value !== null && !Array.isArray(value));

export const exportBackupData = async () => {
  const data = {};
  for (const k of BACKUP_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(KEYS[k]);
      if (raw !== null) data[k] = JSON.parse(raw);
    } catch {
      // 한 키가 손상돼도 나머지는 백업 (손상 키는 제외)
    }
  }
  data._meta = { version: 1, exportedAt: new Date().toISOString(), app: 'yeolgong' };
  return data;
};

export const importBackupData = async (data) => {
  if (!data || data._meta?.app !== 'yeolgong') throw new Error('invalid_backup');
  for (const k of BACKUP_KEYS) {
    if (data[k] !== undefined && matchesShape(data[k], BACKUP_KEY_SHAPES[k])) {
      await AsyncStorage.setItem(KEYS[k], JSON.stringify(data[k]));
    }
  }
  return true;
};
