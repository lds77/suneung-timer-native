// src/utils/ongoingNotif.js
// 안드로이드: 실행 중 타이머를 상단바/알림창/잠금화면에 상시 알림(chronometer)으로 표시.
// iOS Live Activity(src/utils/liveActivity.js)의 안드 대응물 — 표시 규칙 헬퍼를 공유한다.
// OS가 벽시계 앵커(when) 기준으로 초를 직접 그리므로 앱이 백그라운드/도즈여도 정확하고,
// 앱 프로세스가 죽어도 시간이 계속 맞는다 (스냅샷 복원과 같은 벽시계 원리 — 불변식 1).
// timeoutMs 상한으로 좀비 알림 방지: 카운트다운은 종료 시각, 카운트업은 5시간 상한(불변식 9).
// iOS/Expo Go에서는 모든 함수가 no-op (모듈 로드 실패 시 TN = null).

import { Platform, AppState } from 'react-native';
import { buildSubtitle, phaseTargetSec, getSequenceTotalEndMs } from './liveActivity';
import { COUNTUP_MAX_SEC } from './timerCore';

let TN = null; // TimerNotif 네이티브 모듈
if (Platform.OS === 'android') {
  try { TN = require('../../modules/timer-notif').default; } catch { TN = null; }
}

let lastSig = null;

// 알림 색: 타이머(과목) 색 우선, 없으면 앱 브랜드 색 (expo-notifications 플러그인 설정과 동일)
const FALLBACK_COLOR = '#FF6B9D';

// 카운트다운 표시 앵커 보정: 앱 화면은 남은 시간을 올림으로 표시하는데
// (totalSec - floor(경과) — RunningTimersBar 등) chronometer는 남은 ms를 내림으로 그려서
// 보정 없이는 알림이 항상 1초 빠르게 보인다. 종료 시각을 999ms 밀면 초가 일치하고,
// 실제 종료 순간에 0:00이 표시된다 (timeout은 실제 종료 시각 기준이라 그대로 제거됨)
const DOWN_DISPLAY_PAD_MS = 999;

const buildOptions = (t) => {
  const color = t.color || FALLBACK_COLOR;
  // 누적 경과를 반영한 가상 시작 시각 (일시정지 시간 제외) — 불변식 1의 벽시계 앵커
  const baseMs = (t.resumedAt || Date.now()) - (t.elapsedSecAtResume || 0) * 1000;

  // 백그라운드 연속모드: JS가 중단돼 페이즈 자동 전환이 안 됨 → 페이즈 종료 시각을 지나면
  // 음수 카운트로 보이는 문제 → 전체 남은 시간 카운트다운으로 전환 (Live Activity와 동일한 처리)
  if (AppState.currentState === 'background' && t.type === 'sequence' && t.status === 'running') {
    const endMs = getSequenceTotalEndMs(t);
    return {
      title: t.seqName || t.label || '연속모드',
      subtitle: `연속 집중 ${(t.seqIndex || 0) + 1}/${t.seqTotal} 진행 중 · 전체 남은 시간`,
      mode: 'down', whenMs: endMs + DOWN_DISPLAY_PAD_MS, timeoutMs: Math.max(0, endMs - Date.now()), color,
    };
  }

  const o = { title: t.label || '타이머', subtitle: buildSubtitle(t), mode: 'none', whenMs: 0, timeoutMs: 0, color };
  if (t.status === 'running') {
    const target = phaseTargetSec(t);
    if (target > 0) {
      const endMs = baseMs + target * 1000;
      o.mode = 'down';
      o.whenMs = endMs + DOWN_DISPLAY_PAD_MS;
      o.timeoutMs = Math.max(0, endMs - Date.now());
    } else {
      // 카운트업(자유/랩): 상한 시각에 OS가 알림을 자동 제거 — 앱이 죽어도 좀비 알림 없음
      o.mode = 'up';
      o.whenMs = baseMs;
      o.timeoutMs = Math.max(0, baseMs + COUNTUP_MAX_SEC * 1000 - Date.now());
    }
  }
  // 일시정지: mode 'none' — 경과 시간은 subtitle에 정적으로 표시.
  // 24시간 상한 — 일시정지 상태로 앱이 죽고 다시 안 열리면 알림이 영구히 남는 것 방지
  // (그 전에 앱을 다시 열면 포그라운드 복귀의 force 재게시가 상한을 다시 연장)
  if (t.status === 'paused') o.timeoutMs = 24 * 60 * 60 * 1000;
  return o;
};

// 네이티브 호출이 필요한 변화만 감지 (elapsedSec 틱 제외 → 초당 호출 방지)
// fg/bg 구분 포함 — 백그라운드 진입/복귀 시 연속모드 표시 모드 전환이 갱신되도록
const makeSig = (t) => [
  AppState.currentState === 'background' ? 'bg' : 'fg',
  t.id, t.status, t.type, t.label, t.color, t.resumedAt, t.elapsedSecAtResume,
  t.totalSec, t.pomoPhase, t.pomoSet, t.seqPhase, t.seqIndex,
].join('|');

// 활성 타이머(없으면 null)를 상시 알림에 반영 — 게시/갱신/제거를 내부에서 판단.
// opts.enabled: 설정(알림 허용 + 상시 알림 토글) — false면 즉시 제거
// opts.force: 시그니처가 같아도 다시 게시 — 사용자가 알림을 지웠거나(안드 14+ 스와이프 가능)
//             timeout으로 사라진 뒤 포그라운드 복귀 시 복구하는 용도
export const syncOngoingNotif = (timer, opts = {}) => {
  if (!TN) return;
  if (!timer || opts.enabled === false) { endOngoingNotif(); return; }

  const sig = makeSig(timer);
  if (!opts.force && sig === lastSig) return;
  // 시도 전에 기록 — 게시 실패(알림 권한 거부 등) 시 다음 상태 변화까지 재시도하지 않음
  lastSig = sig;

  try { TN.show(buildOptions(timer)).catch(() => {}); } catch {}
};

export const endOngoingNotif = () => {
  lastSig = null;
  if (!TN) return;
  try { TN.dismiss().catch(() => {}); } catch {}
};
