// density.js 단위 테스트 — 집중밀도 공식 v7의 점수표 회귀 방지
import { calculateDensity, getDensityBreakdown, calcAverageDensity } from '../density';

// 공통 기본 파라미터: 고등, 편하게(screen_off), 자유모드 90분, 일시정지 0회
const base = {
  pausedCount: 0, totalSec: 90 * 60, timerType: 'free', completionRatio: 1,
  pomoSets: 0, focusMode: 'screen_off', exitCount: 0, selfRating: null,
  schoolLevel: 'high', ultraFocusLevel: 'normal',
};

describe('calculateDensity — 완료 점수', () => {
  test('카운트다운 완료율 구간 (40/36/32/28)', () => {
    // screen_off는 선언보너스도 완료율에 연동되므로 screen_on으로 고정해 완료점수만 분리
    const p = { ...base, timerType: 'countdown', totalSec: 60 * 60, focusMode: 'screen_on', exitCount: 0 };
    const at = (ratio) => calculateDensity({ ...p, completionRatio: ratio });
    expect(at(1) - at(0.8)).toBe(4);   // 40 - 36
    expect(at(0.8) - at(0.5)).toBe(4); // 36 - 32
    expect(at(0.5) - at(0.49)).toBe(4); // 32 - 28
  });

  test('뽀모도로 세트 점수 (2세트+ 40, 1세트 35, 0세트 20)', () => {
    const p = { ...base, timerType: 'pomodoro', totalSec: 50 * 60 };
    const at = (sets) => calculateDensity({ ...p, pomoSets: sets });
    expect(at(2)).toBe(at(3));        // 2세트 이상 동일
    expect(at(2) - at(1)).toBe(5);    // 40 - 35
    expect(at(1) - at(0)).toBe(15);   // 35 - 20
  });

  test('자유모드 학교급별 만점 기준 (고등 120분 / 중등 80분 / 초저 25분)', () => {
    const free = (min, schoolLevel) =>
      calculateDensity({ ...base, schoolLevel, totalSec: min * 60 });
    // 고등: 120분 만점(40) vs 60분(35)
    expect(free(120, 'high') - free(60, 'high')).toBe(5 + 3); // 완료 40-35 + 지속력 15-12
    // 중등: 80분이면 완료 만점
    expect(free(80, 'middle')).toBeGreaterThanOrEqual(free(79, 'middle'));
    // 초등 저학년: 25분이면 완료 만점 40 + 지속력 15 + 습관 30 + 편하게 5 = 90
    expect(free(25, 'elementary_lower')).toBe(90);
    // 같은 25분이라도 고등은 기준이 높아 점수 낮음
    expect(free(25, 'elementary_lower')).toBeGreaterThan(free(25, 'high'));
  });
});

describe('calculateDensity — 습관/지속력', () => {
  test('일시정지 횟수별 감점 (30/25/20/15/10)', () => {
    const at = (n) => calculateDensity({ ...base, pausedCount: n });
    expect(at(0) - at(1)).toBe(5);
    expect(at(1) - at(2)).toBe(5);
    expect(at(2) - at(3)).toBe(5);
    expect(at(3) - at(4)).toBe(5);
    expect(at(4)).toBe(at(7)); // 4회 이상 동일
  });

  test('고등 지속력 보너스 경계 (10/15/30/60/90분)', () => {
    // 자유모드는 완료점수도 시간에 연동되므로 카운트다운 완료(완료점수 고정)로 지속력만 분리
    const at = (min) => calculateDensity({ ...base, timerType: 'countdown', completionRatio: 1, totalSec: min * 60 });
    expect(at(90) - at(89)).toBe(3);  // 15 - 12
    expect(at(60) - at(59)).toBe(3);  // 12 - 9
    expect(at(30) - at(29)).toBe(3);  // 9 - 6
    expect(at(15) - at(14)).toBe(3);  // 6 - 3
    expect(at(10) - at(9)).toBe(3);   // 3 - 0
  });
});

describe('calculateDensity — 선언 보너스 (집중모드/울트라)', () => {
  const focus = { ...base, focusMode: 'screen_on', totalSec: 90 * 60 };

  test('일반 집중(normal/focus): 이탈 0회 +10, 1~2회 +6, 3회+ +2', () => {
    const at = (exits) => calculateDensity({ ...focus, exitCount: exits });
    expect(at(0) - at(1)).toBe(4);  // 10 - 6
    expect(at(1) - at(2)).toBe(0);
    expect(at(2) - at(3)).toBe(4);  // 6 - 2
  });

  test('울트라(exam): 이탈 0회 +15, 1~2회 +8, 3회+ +4', () => {
    const at = (exits) => calculateDensity({ ...focus, ultraFocusLevel: 'exam', exitCount: exits });
    expect(at(0) - at(1)).toBe(7);  // 15 - 8
    expect(at(2) - at(3)).toBe(4);  // 8 - 4
    // 같은 이탈 0회면 울트라가 일반보다 +5 높음
    expect(at(0) - calculateDensity({ ...focus, exitCount: 0 })).toBe(5);
  });

  test('자가평가 보너스: fire/perfect만 +3', () => {
    expect(calculateDensity({ ...base, selfRating: 'fire' }) - calculateDensity(base)).toBe(3);
    expect(calculateDensity({ ...base, selfRating: 'perfect' }) - calculateDensity(base)).toBe(3);
    expect(calculateDensity({ ...base, selfRating: 'tired' })).toBe(calculateDensity(base));
  });
});

describe('calculateDensity — 클램프', () => {
  test('최저 56점 보장', () => {
    expect(calculateDensity({
      ...base, totalSec: 60, pausedCount: 9, timerType: 'countdown', completionRatio: 0.1,
    })).toBeGreaterThanOrEqual(56);
  });
  test('이론 최대 103점 초과 불가', () => {
    expect(calculateDensity({
      ...base, focusMode: 'screen_on', ultraFocusLevel: 'exam',
      timerType: 'countdown', completionRatio: 1, totalSec: 120 * 60, selfRating: 'fire',
    })).toBe(103);
  });
  test('30초 미만 세션은 100점 (계획용 짧은 기록 보호)', () => {
    expect(calculateDensity({ ...base, totalSec: 29 })).toBe(100);
  });
});

describe('getDensityBreakdown — calculateDensity와 점수 일치 (투명성 리포트 정합성)', () => {
  // v1.0.27 이전 버그: breakdown이 울트라 레벨을 무시하고 항상 15/8/3을 표시 → 실제 점수와 불일치
  const sweep = [];
  for (const timerType of ['countdown', 'pomodoro', 'free']) {
    for (const focusMode of ['screen_on', 'screen_off']) {
      for (const ultraFocusLevel of ['normal', 'exam']) {
        for (const exitCount of [0, 1, 3]) {
          for (const totalMin of [5, 30, 90, 120]) {
            sweep.push({
              ...base, timerType, focusMode, ultraFocusLevel, exitCount,
              totalSec: totalMin * 60, pausedCount: exitCount, pomoSets: 1, completionRatio: 0.8,
              selfRating: exitCount === 0 ? 'fire' : null,
            });
          }
        }
      }
    }
  }

  test.each(sweep.map((p, i) => [i, p]))('파라미터 조합 #%i', (_, params) => {
    expect(getDensityBreakdown(params).total).toBe(calculateDensity(params));
  });

  test('breakdown 합계 = 항목 합 (클램프 범위 내)', () => {
    const bd = getDensityBreakdown({ ...base, focusMode: 'screen_on', exitCount: 0 });
    const sum = bd.completionScore + bd.habitScore + bd.persistenceBonus + bd.declarationBonus + bd.selfBonus;
    expect(bd.total).toBe(Math.max(56, Math.min(103, sum)));
  });

  test('verified는 집중모드 + 이탈 0회만 true', () => {
    expect(getDensityBreakdown({ ...base, focusMode: 'screen_on', exitCount: 0 }).verified).toBe(true);
    expect(getDensityBreakdown({ ...base, focusMode: 'screen_on', exitCount: 1 }).verified).toBe(false);
    expect(getDensityBreakdown({ ...base, focusMode: 'screen_off', exitCount: 0 }).verified).toBe(false);
  });
});

describe('calcAverageDensity', () => {
  test('5분 미만 세션은 평균에서 제외', () => {
    const sessions = [
      { durationSec: 600, focusDensity: 80 },
      { durationSec: 120, focusDensity: 100 }, // 제외 대상
      { durationSec: 900, focusDensity: 90 },
    ];
    expect(calcAverageDensity(sessions)).toBe(85);
  });
  test('빈 입력/모두 짧은 세션이면 0', () => {
    expect(calcAverageDensity([])).toBe(0);
    expect(calcAverageDensity(null)).toBe(0);
    expect(calcAverageDensity([{ durationSec: 60, focusDensity: 100 }])).toBe(0);
  });
});
