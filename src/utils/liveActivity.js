// src/utils/liveActivity.js
// iOS 잠금화면/Dynamic Island에 실행 중 타이머 표시 — expo-widgets Live Activity 래퍼 (SDK 56~)
// Android·미지원 환경에서는 모든 함수가 no-op (모듈 로드 실패 시 Activity = null)
// 카운트다운류는 Text timerInterval countsDown(OS가 직접 그림), 자유 타이머는 카운트업 —
// 앱이 백그라운드여도 초 단위로 정확함. 레이아웃은 src/widgets/FocusActivity.js
//
// 인터페이스는 expo-live-activity 시절과 동일: init/sync/end/setAway — useAppState 무수정

import { Platform, AppState } from 'react-native';
import { getTheme } from '../constants/colors';
import { formatDuration } from './format';
import { pomoPhaseTargetSec } from './pomo';

let Activity = null; // LiveActivityFactory (FocusActivity)
let laDiag = ''; // [진단 v4] 레이아웃 등록 상태 — 활성화 시 카드에 표시. 원인 확정 후 제거
if (Platform.OS === 'ios') {
  try {
    const mod = require('../widgets/FocusActivity');
    Activity = mod.default;
    // [진단 v4] 검증된 경로(apple-targets ExtensionStorage — 홈 위젯이 쓰는 그 경로)로
    // 같은 App Group 키에 레이아웃을 이중 기록 + 읽어서 상태 문자열 생성.
    // expo-widgets WidgetsStorage 기록이 익스텐션에 안 닿는 경우를 판별/우회한다.
    try {
      const { ExtensionStorage } = require('@bacons/apple-targets');
      const st = new ExtensionStorage('group.com.yeolgong.timer');
      if (typeof mod.focusLayoutString === 'string') {
        st.set('__expo_widgets_live_activity_FocusActivity_layout', mod.focusLayoutString);
        laDiag = 'dw-ok';
      } else {
        laDiag = 'not-str:' + typeof mod.focusLayoutString; // babel 변환이 안 됐다는 뜻
      }
      const cur = st.get('__expo_widgets_live_activity_FocusActivity_layout');
      laDiag += cur ? ' L' + cur.length + (cur.includes('TEST v4') ? ' v4' : ' old') : ' read-null';
    } catch (e) {
      laDiag = 'dw-err:' + (e && e.message ? e.message.slice(0, 40) : '?');
    }
  } catch { Activity = null; }
}

let currentActivity = null; // LiveActivity 인스턴스 (expo-widgets)
let lastSig = null;
let lastProps = null; // 종료 시 최종 상태에 테마 색을 재사용하기 위한 마지막 props
// 🔥모드 이탈 상태 — true면 잠금화면/Dynamic Island 부제를 '이탈 중' 문구로 교체
// (부제 교체 방식 유지 — 상태 전달용)
let awayMode = false;

export const setLiveActivityAway = (away) => { awayMode = !!away; };

// 앱 시작 시 잔존 activity 재부착 — 강제종료 후에도 update/end가 가능하도록.
// (expo-live-activity 때처럼 id를 저장할 필요 없음 — getInstances()로 복원)
export const initLiveActivity = async () => {
  if (!Activity) return;
  try {
    const list = Activity.getInstances();
    currentActivity = list[0] || null;
    // 중복 잔존 시 첫 번째만 남기고 정리
    for (let i = 1; i < list.length; i++) {
      try { list[i].end('immediate').catch(() => {}); } catch {}
    }
  } catch { currentActivity = null; }
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

// FocusActivity 레이아웃에 넘길 props (JSON 직렬화 가능해야 함)
const buildProps = (t, T) => {
  const base = {
    tint: t.color || T.accent,
    textColor: T.text,
    subColor: T.sub,
    bg: T.card, // 배너 배경 — 미지정 시 잠금화면 검정 배경에 어두운 글자가 깔려 빈 카드처럼 보임
    diag: laDiag, // [진단 v4] 확인 후 제거
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
  if (!Activity) return;
  if (!timer) { endLiveActivity(); return; }

  const sig = makeSig(timer);
  if (sig === lastSig) return;
  // 시도 전에 기록 — 시작 실패(설정에서 비활성화 등) 시 다음 상태 변화까지 재시도하지 않음 (틱마다 재시도 방지)
  lastSig = sig;

  const T = getTheme(!!themeOpts.darkMode, themeOpts.accentColor || 'pink');
  const props = buildProps(timer, T);
  lastProps = props;
  if (currentActivity) {
    const act = currentActivity;
    try {
      // 잔존 인스턴스가 무효(사용자가 지움/수명 만료)면 정리 후 다음 상태 변화 때 재시작
      // — 정리 없이 새로 시작하면 잠금화면에 활동 카드가 2장 쌓인다
      act.update(props).catch(() => {
        try { act.end('immediate').catch(() => {}); } catch {}
        if (currentActivity === act) { currentActivity = null; lastSig = null; }
      });
      return;
    } catch {
      currentActivity = null;
    }
  }
  try {
    currentActivity = Activity.start(props);
  } catch {
    // 설정에서 Live Activity 비활성화 등 — 조용히 무시
    currentActivity = null;
  }
};

export const endLiveActivity = () => {
  awayMode = false;
  if (!Activity) return;
  const act = currentActivity;
  currentActivity = null;
  lastSig = null;
  if (!act) return;
  const finalProps = {
    ...(lastProps || { tint: '#FF6B9D', textColor: '#333333', subColor: '#888888', bg: '#FFFFFF', startMs: 0, endMs: 0 }),
    title: '열공메이트',
    subtitle: '집중 완료! 수고했어요',
    mode: 'none',
  };
  lastProps = null;
  try {
    // 즉시 제거 — 잔류시키면(after 정책) 끝난 활동 카드가 잠금화면에 남아 겹쳐 보임.
    // 완료 피드백은 완료 알림/앱 내 결과 모달이 담당
    act.end('immediate', finalProps).catch(() => {});
  } catch {}
};
