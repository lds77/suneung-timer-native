// timerCore — 벽시계 경과/남은시간/페이즈 전환 순수 로직 테스트
// CLAUDE.md 타이머·세션 불변식 1(벽시계 경과), 2(resumedAt 기반 전환 시각), 3(dedupeKey) 검증

const { wallElapsedSec, realRemainingSec, phaseEndAtMs, pomoFlipCore } = require('../timerCore');

const NOW = 1_800_000_000_000;

describe('wallElapsedSec', () => {
  test('resumedAt 기준: 재개 후 벽시계 경과 + 재개 시점 누적', () => {
    const t = { resumedAt: NOW - 90_500, elapsedSecAtResume: 120, elapsedSec: 0 };
    expect(wallElapsedSec(t, NOW)).toBe(120 + 90); // floor(90.5)
  });

  test('resumedAt 없으면 elapsedSec 캐시 폴백 (일시정지 상태)', () => {
    expect(wallElapsedSec({ resumedAt: null, elapsedSec: 77 }, NOW)).toBe(77);
  });
});

describe('realRemainingSec', () => {
  test('카운트다운: 목표 - 실경과 (소수점 유지)', () => {
    const t = { type: 'countdown', totalSec: 600, resumedAt: NOW - 100_500, elapsedSecAtResume: 0 };
    expect(realRemainingSec(t, NOW)).toBeCloseTo(600 - 100.5);
  });

  test('카운트다운 오버슈트는 0으로 클램프', () => {
    const t = { type: 'countdown', totalSec: 60, resumedAt: NOW - 120_000, elapsedSecAtResume: 0 };
    expect(realRemainingSec(t, NOW)).toBe(0);
  });

  test('뽀모도로: 현재 페이즈 목표 기준 (work=워크분, 4세트째 longbreak=15분)', () => {
    const work = { type: 'pomodoro', pomoPhase: 'work', pomoWorkMin: 25, resumedAt: NOW - 60_000, elapsedSecAtResume: 0 };
    expect(realRemainingSec(work, NOW)).toBeCloseTo(25 * 60 - 60);
    const lb = { type: 'pomodoro', pomoPhase: 'longbreak', pomoBreakMin: 5, resumedAt: NOW, elapsedSecAtResume: 0 };
    expect(realRemainingSec(lb, NOW)).toBeCloseTo(15 * 60); // 긴 휴식은 최소 15분
  });

  test('자유/랩은 0 (남은 시간 개념 없음)', () => {
    expect(realRemainingSec({ type: 'free', resumedAt: NOW }, NOW)).toBe(0);
    expect(realRemainingSec({ type: 'lap', resumedAt: NOW }, NOW)).toBe(0);
  });
});

describe('phaseEndAtMs', () => {
  test('resumedAt 기반 역산 — 틱 오버슈트와 무관하게 동일한 종료 시각', () => {
    const t = { resumedAt: NOW - 10_000, elapsedSecAtResume: 300 };
    // 목표 600초 → 종료 = resumedAt + (600-300)*1000. 호출 시점(nowMs)과 무관해야 한다.
    expect(phaseEndAtMs(t, 600, NOW)).toBe(NOW - 10_000 + 300_000);
    expect(phaseEndAtMs(t, 600, NOW + 5_000)).toBe(NOW - 10_000 + 300_000);
  });

  test('resumedAt 없으면 nowMs 폴백', () => {
    expect(phaseEndAtMs({ elapsedSecAtResume: 0 }, 60, NOW)).toBe(NOW + 60_000);
  });
});

describe('pomoFlipCore', () => {
  const base = {
    id: 'tmr_1', type: 'pomodoro', subjectId: 'subj_1', label: '수학',
    pomoWorkMin: 25, pomoBreakMin: 5, pauseCount: 2,
    startedAt: NOW - 3_600_000, elapsedSec: 1502,
    resumedAt: NOW - 1_502_000, elapsedSecAtResume: 0,
  };

  test('work 종료: 세션 스펙 + break 전환 + 다음 페이즈 기준점은 정확한 종료 시각', () => {
    const t = { ...base, pomoPhase: 'work', pomoSet: 0 };
    const { endedPhase, workSession, next } = pomoFlipCore(t, NOW);
    expect(endedPhase).toBe('work');
    // 불변식 3: dedupeKey 규칙 pomo|id|startedAt|세트
    expect(workSession.dedupeKey).toBe(`pomo|tmr_1|${t.startedAt}|0`);
    expect(workSession.durationSec).toBe(25 * 60);
    expect(workSession.pomoSets).toBe(1);
    // 불변식 2: 다음 페이즈 시작점 = work의 정확한 종료 시각 (오버슈트 2초 비누적)
    expect(next.resumedAt).toBe(t.resumedAt + 25 * 60 * 1000);
    expect(next.pomoPhase).toBe('break');
    expect(next.pomoSet).toBe(1);
    expect(next.elapsedSec).toBe(0);
    expect(next.elapsedSecAtResume).toBe(0);
    expect(next.pauseCount).toBe(0);
  });

  test('4세트째 work 종료는 longbreak', () => {
    const t = { ...base, pomoPhase: 'work', pomoSet: 3 };
    expect(pomoFlipCore(t, NOW).next.pomoPhase).toBe('longbreak');
  });

  test('break 종료: 세션 없음, work 복귀, 기준점 = break 종료 시각', () => {
    const t = { ...base, pomoPhase: 'break', pomoSet: 1, resumedAt: NOW - 300_000, elapsedSecAtResume: 0 };
    const { endedPhase, workSession, next } = pomoFlipCore(t, NOW);
    expect(endedPhase).toBe('break');
    expect(workSession).toBeNull();
    expect(next.pomoPhase).toBe('work');
    expect(next.resumedAt).toBe(t.resumedAt + 5 * 60 * 1000);
  });

  test('longbreak 종료 기준점은 15분(긴 휴식) 기준', () => {
    const t = { ...base, pomoPhase: 'longbreak', pomoSet: 4, resumedAt: NOW - 900_000, elapsedSecAtResume: 0 };
    const { next } = pomoFlipCore(t, NOW);
    expect(next.resumedAt).toBe(t.resumedAt + 15 * 60 * 1000);
  });
});
