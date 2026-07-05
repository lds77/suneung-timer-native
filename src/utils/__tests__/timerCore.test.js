// timerCore — 벽시계 경과/남은시간/페이즈 전환 순수 로직 테스트
// CLAUDE.md 타이머·세션 불변식 1(벽시계 경과), 2(resumedAt 기반 전환 시각), 3(dedupeKey) 검증

const { wallElapsedSec, realRemainingSec, phaseEndAtMs, pomoFlipCore, seqFlipCore, buildPhaseNotifSpecs } = require('../timerCore');

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

describe('seqFlipCore', () => {
  const items = [
    { label: '수학', color: '#111111', totalSec: 2400, subjectId: 'subj_m' },
    { label: '영어', color: '#222222', totalSec: 1800, subjectId: 'subj_e' },
  ];
  const base = {
    id: 'tmr_s', type: 'sequence', label: '수학', color: '#111111', subjectId: 'subj_m',
    totalSec: 2400, elapsedSec: 2400, pauseCount: 1,
    startedAt: NOW - 2_400_000, resumedAt: NOW - 2_400_000, elapsedSecAtResume: 0,
    seqItems: items, seqIndex: 0, seqTotal: 2, seqBreakSec: 600, seqPhase: 'work',
    seqSessionIds: [],
  };

  test('work 종료(중간 항목): 세션 스펙 + break 전환 + 다음 항목 안내 알림', () => {
    const r = seqFlipCore(base, NOW);
    expect(r.kind).toBe('toBreak');
    // 불변식 3·6: dedupeKey seq|id|인덱스|startedAt, timerType countdown
    expect(r.session.dedupeKey).toBe(`seq|tmr_s|0|${base.startedAt}`);
    expect(r.session.timerType).toBe('countdown');
    expect(r.session.durationSec).toBe(2400);
    expect(r.notif).toEqual({ title: '수학 완료!', body: '다음: 영어' });
    // 불변식 2: break 시작점 = work의 정확한 종료 시각
    expect(r.next.resumedAt).toBe(base.resumedAt + 2400 * 1000);
    expect(r.next.seqPhase).toBe('break');
    expect(r.next.elapsedSec).toBe(0);
  });

  test('5분 미만/쉬는시간 항목은 세션 기록 안 함 (불변식 5·7)', () => {
    expect(seqFlipCore({ ...base, elapsedSec: 200 }, NOW).session).toBeNull();
    const breakItems = [{ label: '휴식', totalSec: 600, isBreak: true }, items[1]];
    expect(seqFlipCore({ ...base, seqItems: breakItems, elapsedSec: 600 }, NOW).session).toBeNull();
  });

  test('마지막 항목 work 종료: completed + 세션 스펙 (result는 호출부가 채움)', () => {
    const t = { ...base, seqIndex: 1, label: '영어', totalSec: 1800, elapsedSec: 1800 };
    const r = seqFlipCore(t, NOW);
    expect(r.kind).toBe('completed');
    expect(r.endedPhase).toBe('work');
    expect(r.session.dedupeKey).toBe(`seq|tmr_s|1|${t.startedAt}`);
    expect(r.next.status).toBe('completed');
  });

  test('break 종료: 다음 항목으로 전환 — 라벨/색/목표/과목 교체, startedAt=resumedAt=break 종료 시각', () => {
    const t = { ...base, seqPhase: 'break', elapsedSec: 600, resumedAt: NOW - 600_000 };
    const r = seqFlipCore(t, NOW);
    expect(r.kind).toBe('toWork');
    const endAt = t.resumedAt + 600 * 1000;
    expect(r.next).toMatchObject({
      seqPhase: 'work', seqIndex: 1, label: '영어', totalSec: 1800,
      subjectId: 'subj_e', startedAt: endAt, resumedAt: endAt, elapsedSecAtResume: 0, elapsedSec: 0,
    });
    expect(r.notif).toEqual({ title: '영어 시작!', body: '집중!' });
  });

  test('seqBreakSec=0이면 break 종료 알림 없음 (work→break에서 이미 발송)', () => {
    const t = { ...base, seqPhase: 'break', seqBreakSec: 0 };
    expect(seqFlipCore(t, NOW).notif).toBeNull();
  });

  test('break인데 다음 항목 없음(안전장치): completed, endedPhase=break', () => {
    const t = { ...base, seqPhase: 'break', seqIndex: 1 };
    const r = seqFlipCore(t, NOW);
    expect(r.kind).toBe('completed');
    expect(r.endedPhase).toBe('break');
    expect(r.session).toBeNull();
  });
});

describe('buildPhaseNotifSpecs', () => {
  test('뽀모도로: 시작 직후 work 종료→휴식 종료가 번갈아, 기준은 resumedAt', () => {
    const t = {
      type: 'pomodoro', label: '수학', pomoPhase: 'work', pomoSet: 0,
      pomoWorkMin: 25, pomoBreakMin: 5, resumedAt: NOW, elapsedSecAtResume: 0,
    };
    const specs = buildPhaseNotifSpecs(t, NOW);
    expect(specs[0]).toMatchObject({ absMs: NOW + 25 * 60_000, title: '수학 집중 완료!' });
    expect(specs[1]).toMatchObject({ absMs: NOW + 30 * 60_000, title: '수학 휴식 끝!' });
    // 4세트째 work 종료(4번째 집중완료 알림)는 긴 휴식 문구 + 이후 간격 15분
    const fourthWorkEnd = specs.filter(s => s.title === '수학 집중 완료!')[3];
    expect(fourthWorkEnd.body).toContain('긴 휴식');
    expect(specs.length).toBeLessThanOrEqual(16);
  });

  test('뽀모도로: 페이즈 중간 재개 — 첫 알림은 남은 시간 기준 (오버슈트 비반영)', () => {
    const t = {
      type: 'pomodoro', label: '수학', pomoPhase: 'work', pomoSet: 0,
      pomoWorkMin: 25, pomoBreakMin: 5,
      resumedAt: NOW - 60_000, elapsedSecAtResume: 600, // 10분 지점에서 재개, 1분 경과
    };
    const specs = buildPhaseNotifSpecs(t, NOW);
    // 첫 종료 = resumedAt + (1500-600)초
    expect(specs[0].absMs).toBe(NOW - 60_000 + 900_000);
  });

  test('연속모드: 휴식 알림(breakSec>0) + 다음 과목 시작 + 마지막 완료 알림', () => {
    const t = {
      type: 'sequence', seqPhase: 'work', seqIndex: 0, seqTotal: 2, seqBreakSec: 600,
      totalSec: 2400, resumedAt: NOW, elapsedSecAtResume: 0,
      seqItems: [{ label: '수학', totalSec: 2400 }, { label: '영어', totalSec: 1800 }],
    };
    const specs = buildPhaseNotifSpecs(t, NOW);
    expect(specs.map(s => s.title)).toEqual(['수학 완료!', '▶ 영어 시작!', '연속 실행 완료!']);
    expect(specs[0].absMs).toBe(NOW + 2400_000);
    expect(specs[1].absMs).toBe(NOW + 3000_000);          // +휴식 10분
    expect(specs[2].absMs).toBe(NOW + 3000_000 + 1800_000); // +영어 30분
  });

  test('연속모드: breakSec=0이면 휴식 알림 생략, 시작 알림만', () => {
    const t = {
      type: 'sequence', seqPhase: 'work', seqIndex: 0, seqTotal: 2, seqBreakSec: 0,
      totalSec: 2400, resumedAt: NOW, elapsedSecAtResume: 0,
      seqItems: [{ label: '수학', totalSec: 2400 }, { label: '영어', totalSec: 1800 }],
    };
    const specs = buildPhaseNotifSpecs(t, NOW);
    expect(specs.map(s => s.title)).toEqual(['▶ 영어 시작!', '연속 실행 완료!']);
  });

  test('countdown/free 타입은 빈 배열', () => {
    expect(buildPhaseNotifSpecs({ type: 'countdown', totalSec: 60, resumedAt: NOW }, NOW)).toEqual([]);
    expect(buildPhaseNotifSpecs({ type: 'free', resumedAt: NOW }, NOW)).toEqual([]);
  });
});
