// src/utils/liveActivity.js
// iOS 잠금화면/Dynamic Island에 실행 중 타이머 표시 — 자체 ActivityKit 로컬 모듈 래퍼.
// (expo-live-activity → expo-widgets를 거쳐 자체 구현으로 정착: expo-widgets Live Activity는
//  빌드46 실기기에서 렌더가 전혀 되지 않아(빈 카드, 크래시/RedBox 없음) 폐기 — 2026-07-09)
// 네이티브: modules/live-activity(start/update/end/listIds) + targets/widgets/FocusLiveActivity.swift(UI)
// Android·Expo Go에서는 모든 함수가 no-op (모듈 로드 실패 시 LA = null)
// 카운트다운류는 Text(timerInterval:)로 OS가 직접 그림 — 앱이 백그라운드여도 초 단위 정확
//
// 인터페이스는 expo-live-activity 시절과 동일: init/sync/end/setAway — useAppState 무수정

import { Platform, AppState } from 'react-native';
import { getTheme } from '../constants/colors';
import { formatDuration } from './format';
import { pomoPhaseTargetSec } from './pomo';

let LA = null; // FocusLiveActivity 네이티브 모듈
if (Platform.OS === 'ios') {
  try { LA = require('../../modules/live-activity').default; } catch { LA = null; }
}

let currentId = null; // 현재 activity id
let lastSig = null;
let lastProps = null; // 종료 시 최종 상태에 테마 색을 재사용하기 위한 마지막 props
// 🔥모드 이탈 상태 — true면 잠금화면/Dynamic Island 부제를 '이탈 중' 문구로 교체
let awayMode = false;

export const setLiveActivityAway = (away) => { awayMode = !!away; };

// 앱 시작 시 잔존 activity 재부착 — 강제종료 후에도 update/end가 가능하도록.
// 중복 잔존 시 첫 번째만 남기고 정리 (잠금화면 카드 중복 방지)
export const initLiveActivity = async () => {
  if (!LA) return;
  try {
    const ids = LA.listIds();
    currentId = (ids && ids[0]) || null;
    for (let i = 1; i < (ids ? ids.length : 0); i++) {
      try { LA.end(ids[i], finalState()).catch(() => {}); } catch {}
    }
  } catch { currentId = null; }
};

// 현재 페이즈의 목표 시간 (자유/랩은 0 → 카운트업)
const phaseTargetSec = (t) => {
  if (t.type === 'countdown') return t.totalSec;
  if (t.type === 'pomodoro') return pomoPhaseTargetSec(t); // 긴 휴식(4세트마다)은 15분
  if (t.type === 'sequence') return t.seqPhase === 'work' ? t.totalSec : t.seqBreakSec;
  return 0;
};

const buildSubtitle = (t) => {
  if (t.status === 'paused') return `일시정지 · ${formatDuration(t.elapsedSec)} 집중함`;
  if (t.type === 'pomodoro') {
    if (t.pomoPhase === 'work') return `뽀모도로 ${t.pomoSet + 1}세트 집중`;
    return t.pomoPhase === 'longbreak' ? '긴 휴식 시간' : '휴식 시간';
  }
  if (t.type === 'sequence') {
    if (t.seqPhase === 'work') return `연속 집중 ${(t.seqIndex || 0) + 1}/${t.seqTotal}`;
    return '쉬는 시간';
  }
  if (t.type === 'countdown') return `목표 ${formatDuration(t.totalSec)}`;
  return '집중하는 중';
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

// 네이티브 ContentState로 넘길 props (FocusStateRecord와 필드 일치 — 전부 채워서 전달)
const buildProps = (t, T) => {
  const base = {
    tint: t.color || T.accent,
    textColor: T.text,
    subColor: T.sub,
    bg: T.card, // 잠금화면 배너 배경 = 앱 테마 카드색
    startMs: 0,
    endMs: 0,
  };
  let props;
  // 백그라운드: JS가 중단돼 페이즈 자동 전환이 불가능 → 연속모드는 페이즈 종료 시각이 지나면
  // 0:00에 멈추거나 카운트업으로 보이는 문제가 생김 → 전체 남은 시간 카운트다운으로 전환
  // (포그라운드 복귀 시 sig의 fg/bg 구분으로 즉시 항목별 표시로 복원됨)
  if (AppState.currentState === 'background' && t.type === 'sequence' && t.status === 'running') {
    const baseMs = (t.resumedAt || Date.now()) - (t.elapsedSecAtResume || 0) * 1000;
    props = {
      ...base,
      title: t.seqName || t.label || '연속모드',
      subtitle: `연속 집중 ${(t.seqIndex || 0) + 1}/${t.seqTotal} 진행 중 · 전체 남은 시간`,
      mode: 'down',
      startMs: baseMs,
      endMs: getSequenceTotalEndMs(t),
    };
  } else {
    props = { ...base, title: t.label || '타이머', subtitle: buildSubtitle(t), mode: 'none' };
    if (t.status === 'running') {
      const target = phaseTargetSec(t);
      // 누적 경과를 반영한 가상 시작 시각 (일시정지 시간 제외)
      const baseMs = (t.resumedAt || Date.now()) - (t.elapsedSecAtResume || 0) * 1000;
      props.startMs = baseMs;
      if (target > 0) {
        props.mode = 'down';
        props.endMs = baseMs + target * 1000;
      } else {
        props.mode = 'up';
      }
    }
    // 일시정지: mode 'none' — 경과 시간은 subtitle에 정적으로 표시
  }
  // 🔥모드 이탈 중: 잠금화면에서 바로 보이도록 부제를 복귀 유도 문구로 교체
  if (awayMode && t.status === 'running') {
    props.subtitle = '이탈 중 · 돌아와서 다시 집중해요!';
  }
  return props;
};

const finalState = () => ({
  ...(lastProps || { tint: '#FF6B9D', textColor: '#333333', subColor: '#888888', bg: '#FFFFFF', startMs: 0, endMs: 0 }),
  title: '열공메이트',
  subtitle: '집중 완료! 수고했어요',
  mode: 'none',
});

// 네이티브 호출이 필요한 변화만 감지 (elapsedSec 틱 제외 → 초당 호출 방지)
// fg/bg 구분 포함 — 백그라운드 진입/복귀 시 연속모드 표시 모드 전환이 갱신되도록
const makeSig = (t) => [
  AppState.currentState === 'background' ? 'bg' : 'fg',
  awayMode ? 'away' : 'here',
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

  const T = getTheme(!!themeOpts.darkMode, themeOpts.accentColor || 'pink');
  const props = buildProps(timer, T);
  lastProps = props;
  try {
    // 잔존 id 생존 확인 — 사용자가 지웠거나 수명 만료면 새로 시작
    if (currentId && !(LA.listIds() || []).includes(currentId)) currentId = null;
    if (currentId) {
      LA.update(currentId, props).catch(() => {});
      return;
    }
    currentId = LA.start(props) || null;
  } catch {
    // Live Activity 비활성화 등 — 조용히 무시
    currentId = null;
  }
};

export const endLiveActivity = () => {
  awayMode = false;
  if (!LA) return;
  const id = currentId;
  currentId = null;
  lastSig = null;
  const fin = finalState();
  lastProps = null;
  if (!id) return;
  try {
    // 즉시 제거 — 완료 피드백은 완료 알림/앱 내 결과 모달이 담당
    LA.end(id, fin).catch(() => {});
  } catch {}
};
