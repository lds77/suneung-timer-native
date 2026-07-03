// src/utils/pomo.js — 뽀모도로 페이즈 길이 계산 (단일 진실 공급원)
// 표준 뽀모도로 기법: 4세트마다 긴 휴식. 긴 휴식은 POMO_DEFAULTS.longBreakMin(15분)과
// 사용자 일반 휴식 중 큰 값 (일반 휴식을 15분보다 길게 쓰는 사용자는 긴 휴식이 더 짧아지지 않도록).
// 사용처: 틱/백그라운드 보정/알림 예약/남은시간/표시/Live Activity — 반드시 이 헬퍼를 통해 계산.
import { POMO_DEFAULTS } from '../constants/presets';

// 현재 페이즈의 휴식 길이(분) — work 페이즈에는 의미 없음
export const pomoBreakMinOf = (t) =>
  t.pomoPhase === 'longbreak'
    ? Math.max(POMO_DEFAULTS.longBreakMin, t.pomoBreakMin || POMO_DEFAULTS.breakMin)
    : (t.pomoBreakMin || POMO_DEFAULTS.breakMin);

// 현재 페이즈의 목표 길이(초)
export const pomoPhaseTargetSec = (t) =>
  (t.pomoPhase === 'work' ? (t.pomoWorkMin || POMO_DEFAULTS.workMin) : pomoBreakMinOf(t)) * 60;
