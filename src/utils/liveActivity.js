// src/utils/liveActivity.js
// iOS 잠금화면/Dynamic Island에 실행 중 타이머 표시 — expo-live-activity 래퍼
// Android·Expo Go에서는 모든 함수가 no-op (모듈 로드 실패 시 LA = null)
// 카운트다운류는 progressBar.date(OS가 직접 그리는 카운트다운),
// 자유 타이머는 elapsedTimer(카운트업)를 사용하므로 앱이 백그라운드여도 초 단위로 정확함

import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme } from '../constants/colors';
import { formatDuration } from './format';

let LA = null;
if (Platform.OS === 'ios') {
  try { LA = require('expo-live-activity'); } catch { LA = null; }
}

const ID_KEY = '@yeolgong/liveActivityId';

let currentId = null;
let lastSig = null;

// 앱 시작 시 이전 세션의 activity id 복원 — 강제종료 후 잔존 activity를 재사용하거나 정리
export const initLiveActivity = async () => {
  if (!LA) return;
  try { currentId = await AsyncStorage.getItem(ID_KEY); } catch {}
};

// 현재 페이즈의 목표 시간 (자유/랩은 0 → 카운트업)
const phaseTargetSec = (t) => {
  if (t.type === 'countdown') return t.totalSec;
  if (t.type === 'pomodoro') return (t.pomoPhase === 'work' ? t.pomoWorkMin : t.pomoBreakMin) * 60;
  if (t.type === 'sequence') return t.seqPhase === 'work' ? t.totalSec : t.seqBreakSec;
  return 0;
};

const buildSubtitle = (t) => {
  if (t.status === 'paused') return `일시정지 · ${formatDuration(t.elapsedSec)} 집중함`;
  if (t.type === 'pomodoro') {
    if (t.pomoPhase === 'work') return `뽀모도로 ${t.pomoSet + 1}세트 집중 🔥`;
    return t.pomoPhase === 'longbreak' ? '긴 휴식 시간 ☕' : '휴식 시간 ☕';
  }
  if (t.type === 'sequence') {
    if (t.seqPhase === 'work') return `연속 집중 ${(t.seqIndex || 0) + 1}/${t.seqTotal} 🔥`;
    return '쉬는 시간 ☕';
  }
  if (t.type === 'countdown') return `목표 ${formatDuration(t.totalSec)} 🔥`;
  return '집중하는 중 🔥';
};

// 연속모드: 현재 페이즈 + 남은 항목/휴식을 전부 합산한 전체 종료 시각(ms)
const getSequenceTotalEndMs = (t) => {
  const target = t.seqPhase === 'work' ? (t.totalSec || 0) : (t.seqBreakSec || 0);
  const baseMs = (t.resumedAt || Date.now()) - (t.elapsedSecAtResume || 0) * 1000;
  let endMs = baseMs + target * 1000; // 현재 페이즈 종료 시각
  const items = t.seqItems || [];
  const total = t.seqTotal || items.length;
  for (let i = (t.seqIndex || 0) + 1; i < total; i++) {
    endMs += ((items[i]?.totalSec) || 0) * 1000;
  }
  // 항목 사이 휴식: work 페이즈면 남은 항목 수만큼, break 진행 중이면 1회 차감 (현재 휴식은 위 target에 포함)
  const remainingItems = Math.max(0, total - (t.seqIndex || 0) - 1);
  const remainingBreaks = t.seqPhase === 'work' ? remainingItems : Math.max(0, remainingItems - 1);
  endMs += remainingBreaks * (t.seqBreakSec || 0) * 1000;
  return endMs;
};

const buildState = (t) => {
  // 백그라운드: JS가 중단돼 페이즈 자동 전환이 불가능 → 연속모드는 페이즈 종료 시각이 지나면
  // 0:00에 멈추거나 카운트업으로 보이는 문제가 생김 → 전체 남은 시간 카운트다운으로 전환
  // (포그라운드 복귀 시 sig의 fg/bg 구분으로 즉시 항목별 표시로 복원됨)
  if (AppState.currentState === 'background' && t.type === 'sequence' && t.status === 'running') {
    return {
      title: t.seqName || t.label || '연속모드',
      subtitle: `연속 집중 ${(t.seqIndex || 0) + 1}/${t.seqTotal} 진행 중 · 전체 남은 시간`,
      progressBar: { date: getSequenceTotalEndMs(t) },
    };
  }
  const state = { title: t.label || '타이머', subtitle: buildSubtitle(t) };
  if (t.status === 'running') {
    const target = phaseTargetSec(t);
    // 누적 경과를 반영한 가상 시작 시각 (일시정지 시간 제외)
    const baseMs = (t.resumedAt || Date.now()) - (t.elapsedSecAtResume || 0) * 1000;
    state.progressBar = target > 0
      ? { date: baseMs + target * 1000 }
      : { elapsedTimer: { startDate: baseMs } };
  }
  // 일시정지: progressBar 생략 — 경과 시간은 subtitle에 정적으로 표시
  return state;
};

// 네이티브 호출이 필요한 변화만 감지 (elapsedSec 틱 제외 → 초당 호출 방지)
// fg/bg 구분 포함 — 백그라운드 진입/복귀 시 연속모드 표시 모드 전환이 갱신되도록
const makeSig = (t) => [
  AppState.currentState === 'background' ? 'bg' : 'fg',
  t.id, t.status, t.type, t.label, t.color, t.resumedAt, t.elapsedSecAtResume,
  t.totalSec, t.pomoPhase, t.pomoSet, t.seqPhase, t.seqIndex,
].join('|');

// 활성 타이머(없으면 null)를 Live Activity에 반영 — start/update/end를 내부에서 판단
export const syncLiveActivity = (timer, themeOpts = {}) => {
  if (!LA) return;
  if (!timer) { endLiveActivity(); return; }

  const sig = makeSig(timer);
  if (sig === lastSig) return;
  // 시도 전에 기록 — 시작 실패(설정에서 비활성화 등) 시 다음 상태 변화까지 재시도하지 않음 (틱마다 재시도 방지)
  lastSig = sig;

  const state = buildState(timer);
  if (currentId) {
    try {
      LA.updateActivity(currentId, state);
      return;
    } catch {
      // 잔존 id 무효 (사용자가 지웠거나 8시간 제한 종료) → 새로 시작
      currentId = null;
    }
  }
  try {
    const T = getTheme(!!themeOpts.darkMode, themeOpts.accentColor || 'pink');
    const id = LA.startActivity(state, {
      backgroundColor: T.card,
      titleColor: T.text,
      subtitleColor: T.sub,
      progressViewTint: timer.color || T.accent,
      progressViewLabelColor: T.sub,
      timerType: 'digital',
      padding: { top: 16, bottom: 16, horizontal: 20 },
    });
    if (id) {
      currentId = id;
      AsyncStorage.setItem(ID_KEY, id).catch(() => {});
    }
  } catch {
    // 설정에서 Live Activity 비활성화 등 — 조용히 무시
  }
};

export const endLiveActivity = () => {
  if (!LA || !currentId) return;
  const id = currentId;
  currentId = null;
  lastSig = null;
  AsyncStorage.removeItem(ID_KEY).catch(() => {});
  try { LA.stopActivity(id, { title: '열공메이트', subtitle: '집중 완료! 수고했어요 🎉' }); } catch {}
};
