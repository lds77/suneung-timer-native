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
};

/**
 * 안전하게 JSON 저장
 */
const saveJSON = async (key, data) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn(`[Storage] Save failed: ${key}`, e);
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
  } catch (e) {
    console.warn(`[Storage] Load failed: ${key}`, e);
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

// ── 일일 기록 ──
export const saveDailyRecords = (records) => saveJSON(KEYS.DAILY_RECORDS, records);
export const loadDailyRecords = () => loadJSON(KEYS.DAILY_RECORDS, {});

// ── 타이머 스냅샷 (자동 저장용) ──
export const saveTimerSnapshot = (snapshot) => saveJSON(KEYS.TIMER_SNAPSHOT, snapshot);
export const loadTimerSnapshot = () => loadJSON(KEYS.TIMER_SNAPSHOT, null);
export const clearTimerSnapshot = async () => {
  try { await AsyncStorage.removeItem(KEYS.TIMER_SNAPSHOT); } catch {}
};

// ── 전체 초기화 ──
export const clearAllData = async () => {
  try {
    const keys = Object.values(KEYS);
    await AsyncStorage.multiRemove(keys);
    return true;
  } catch (e) {
    console.warn('[Storage] Clear all failed', e);
    return false;
  }
};
