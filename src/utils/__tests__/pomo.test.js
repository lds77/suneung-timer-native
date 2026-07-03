// 뽀모도로 페이즈 길이 테스트 — 긴 휴식(4세트마다) 15분 규칙
import { pomoBreakMinOf, pomoPhaseTargetSec } from '../pomo';

describe('pomoPhaseTargetSec', () => {
  test('work/break/longbreak 페이즈별 목표', () => {
    const base = { pomoWorkMin: 25, pomoBreakMin: 5 };
    expect(pomoPhaseTargetSec({ ...base, pomoPhase: 'work' })).toBe(25 * 60);
    expect(pomoPhaseTargetSec({ ...base, pomoPhase: 'break' })).toBe(5 * 60);
    expect(pomoPhaseTargetSec({ ...base, pomoPhase: 'longbreak' })).toBe(15 * 60);
  });

  test('일반 휴식이 15분보다 길면 긴 휴식이 더 짧아지지 않는다', () => {
    expect(pomoBreakMinOf({ pomoPhase: 'longbreak', pomoBreakMin: 20 })).toBe(20);
    expect(pomoBreakMinOf({ pomoPhase: 'longbreak', pomoBreakMin: 5 })).toBe(15);
    expect(pomoBreakMinOf({ pomoPhase: 'break', pomoBreakMin: 20 })).toBe(20);
  });

  test('필드 누락 시 기본값 (25/5분)', () => {
    expect(pomoPhaseTargetSec({ pomoPhase: 'work' })).toBe(25 * 60);
    expect(pomoPhaseTargetSec({ pomoPhase: 'break' })).toBe(5 * 60);
  });
});
