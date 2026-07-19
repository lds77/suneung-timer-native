// timerCore — 벽시계 경과/남은시간/페이즈 전환 순수 로직 테스트
// CLAUDE.md 타이머·세션 불변식 1(벽시계 경과), 2(resumedAt 기반 전환 시각), 3(dedupeKey) 검증

const { wallElapsedSec, realRemainingSec, phaseEndAtMs, pomoFlipCore, seqFlipCore, buildPhaseNotifSpecs, calcTimerResult, buildSessionRecord, COUNTUP_MAX_SEC, restoreTimerCore } = require('../timerCore');

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

  test('자유/랩: 카운트업 상한(5시간)까지 남은 시간', () => {
    expect(COUNTUP_MAX_SEC).toBe(5 * 3600);
    expect(realRemainingSec({ type: 'free', resumedAt: NOW, elapsedSecAtResume: 0 }, NOW)).toBe(COUNTUP_MAX_SEC);
    const oneHourIn = { type: 'free', resumedAt: NOW - 3600_000, elapsedSecAtResume: 0 };
    expect(realRemainingSec(oneHourIn, NOW)).toBeCloseTo(4 * 3600);
    // 일시정지 누적 포함 (elapsedSecAtResume)
    const resumed = { type: 'lap', resumedAt: NOW - 1000_000, elapsedSecAtResume: 7200 };
    expect(realRemainingSec(resumed, NOW)).toBeCloseTo(COUNTUP_MAX_SEC - 7200 - 1000);
  });

  test('자유/랩 상한 오버슈트는 0으로 클램프 (311시간 방치 방어)', () => {
    const zombie = { type: 'free', resumedAt: NOW - 311 * 3600_000, elapsedSecAtResume: 0 };
    expect(realRemainingSec(zombie, NOW)).toBe(0);
    expect(realRemainingSec({ type: 'lap', resumedAt: NOW - 6 * 3600_000, elapsedSecAtResume: 0 }, NOW)).toBe(0);
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

  test('캐치업 플립(큰 오버슈트): 세션 시각은 실제 페이즈 구간 역산 — 호출 시점(nowMs)과 무관 (불변식 4 연계)', () => {
    // bg 복귀/스냅샷 복원이 몇 시간 뒤에 지난 세트를 전진시켜도, 세션은 그 세트가
    // 실제로 진행된 시각으로 기록돼야 한다 (nowMs 기준이면 전부 '지금'으로 뭉치고 날짜 귀속도 틀어짐)
    const t = { ...base, pomoPhase: 'work', pomoSet: 0 };
    const workEndAt = t.resumedAt + 25 * 60 * 1000;
    const twoHoursLater = NOW + 2 * 3600 * 1000;
    const { workSession, next } = pomoFlipCore(t, twoHoursLater);
    expect(next.resumedAt).toBe(workEndAt); // 불변식 2: 전환 시각은 호출 시점 무관
    expect(workSession.startedAt).toBe(workEndAt - 25 * 60 * 1000);
    expect(workSession.startedAt + workSession.durationSec * 1000).toBe(workEndAt);
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

  test('stale 상태(경과가 페이즈 목표 초과)는 스펙 0개 — 복원/복귀 시 반드시 페이즈 전진 후 예약해야 하는 이유', () => {
    // 첫 경계가 과거면 루프가 즉시 종료돼 미래 페이즈까지 전부 무음이 된다.
    // useAppState의 fastForwardPhases가 전진을 보장하는 전제를 문서화하는 테스트
    const stale = {
      type: 'pomodoro', label: '수학', pomoPhase: 'work', pomoSet: 0,
      pomoWorkMin: 25, pomoBreakMin: 5,
      resumedAt: NOW - 30 * 60_000, elapsedSecAtResume: 0, // work 25분이 5분 전에 끝난 상태
    };
    expect(buildPhaseNotifSpecs(stale, NOW)).toEqual([]);
  });

  test('stale 상태를 pomoFlipCore로 전진시키면 미래 스펙이 정상 생성된다', () => {
    let t = {
      id: 'tmr_1', type: 'pomodoro', label: '수학', subjectId: null, pomoPhase: 'work', pomoSet: 0,
      pomoWorkMin: 25, pomoBreakMin: 5, pauseCount: 0, startedAt: NOW - 3600_000,
      resumedAt: NOW - 30 * 60_000, elapsedSecAtResume: 0, elapsedSec: 30 * 60,
    };
    let guard = 0;
    while (buildPhaseNotifSpecs(t, NOW).length === 0 && guard++ < 10) t = pomoFlipCore(t, NOW).next;
    const specs = buildPhaseNotifSpecs(t, NOW);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.every(s => s.absMs > NOW)).toBe(true);
  });
});

describe('calcTimerResult', () => {
  test('밀도는 56~103 범위, verified는 screen_on + 이탈 0회일 때만', () => {
    const t = { type: 'countdown', totalSec: 3600, pauseCount: 0 };
    const r = calcTimerResult(t, 3600, { focusMode: 'screen_on', exitCount: 0 });
    expect(r.density).toBeGreaterThanOrEqual(56);
    expect(r.density).toBeLessThanOrEqual(103);
    expect(r.verified).toBe(true);
    expect(r.tier).toHaveProperty('id');
    expect(calcTimerResult(t, 3600, { focusMode: 'screen_on', exitCount: 2 }).verified).toBe(false);
    expect(calcTimerResult(t, 3600, { focusMode: 'screen_off', exitCount: 0 }).verified).toBe(false);
  });

  test('연속모드: 전체 항목 합산 + countdown 기준 (불변식 6)', () => {
    const t = {
      type: 'sequence', totalSec: 1800, pauseCount: 0,
      seqItems: [{ totalSec: 2400 }, { totalSec: 1800 }], seqIndex: 1, seqTotal: 2,
    };
    const r = calcTimerResult(t, 1800, { focusMode: 'screen_off' });
    expect(r.durationSec).toBe(4200); // 합산
  });

  test('카운트다운 중도 종료: 밀도 입력에 완료율 반영 (완주 대비 낮거나 같음)', () => {
    const t = { type: 'countdown', totalSec: 3600, pauseCount: 0 };
    const full = calcTimerResult(t, 3600, { focusMode: 'screen_off' });
    const half = calcTimerResult(t, 1800, { focusMode: 'screen_off' });
    expect(half.density).toBeLessThanOrEqual(full.density);
  });
});

describe('buildSessionRecord', () => {
  const spec = {
    subjectId: 'subj_1', label: ' 수학 ', durationSec: 1800,
    mode: 'countdown', timerType: 'countdown', completionRatio: 1,
    focusMode: 'screen_on', exitCount: 0, memo: ' 메모 ',
  };

  test('불변식 4: date는 시작일 기준 — 자정 걸친 세션은 시작한 날 귀속', () => {
    const start = new Date(2026, 6, 4, 23, 50, 0).getTime(); // 로컬 7/4 23:50
    const s = buildSessionRecord({ ...spec, startedAt: start, durationSec: 1800 });
    expect(s.date).toBe('2026-07-04');
    expect(s.endedAt).toBe(start + 1800 * 1000); // 종료는 시작+집중시간 (벽시계 아님)
  });

  test('verified/ultraFocusLevel은 screen_on일 때만, label/memo 트림', () => {
    const s = buildSessionRecord({ ...spec, startedAt: NOW }, { ultraFocusLevel: 'exam' });
    expect(s.verified).toBe(true);
    expect(s.ultraFocusLevel).toBe('exam');
    expect(s.label).toBe('수학');
    expect(s.memo).toBe('메모');
    const off = buildSessionRecord({ ...spec, focusMode: 'screen_off', startedAt: NOW }, { ultraFocusLevel: 'exam' });
    expect(off.verified).toBe(false);
    expect(off.ultraFocusLevel).toBeNull();
  });

  test('densityOverride가 있으면 밀도 계산을 건너뛰고 그대로 사용', () => {
    const s = buildSessionRecord({ ...spec, startedAt: NOW, densityOverride: 99 });
    expect(s.focusDensity).toBe(99);
  });

  test('startedAt 없으면 nowMs - durationSec으로 역산', () => {
    const s = buildSessionRecord({ ...spec, startedAt: null }, { nowMs: NOW });
    expect(s.startedAt).toBe(NOW - 1800 * 1000);
    expect(s.endedAt).toBe(NOW);
  });

  test('todoId 패스스루 — 할일 연결 타이머 세션 (미지정 시 null)', () => {
    const s = buildSessionRecord({ ...spec, startedAt: NOW, todoId: 'todo_1' });
    expect(s.todoId).toBe('todo_1');
    const none = buildSessionRecord({ ...spec, startedAt: NOW });
    expect(none.todoId).toBeNull();
  });

  test('불변식 3 연계: dedupeKey를 레코드에 보존 — 인메모리 dedupe 맵은 재시작에 유실되므로 영속 키가 복원 캐치업의 재기록을 막는다', () => {
    const s = buildSessionRecord({ ...spec, startedAt: NOW, dedupeKey: 'complete|tmr_1|123' });
    expect(s.dedupeKey).toBe('complete|tmr_1|123');
    expect(buildSessionRecord({ ...spec, startedAt: NOW }).dedupeKey).toBeNull();
  });
});

describe('restoreTimerCore — 콜드스타트 스냅샷 복원 분기 (불변식 8·9)', () => {
  const NOW = 1_700_000_000_000;
  const base = { id: 'tm1', label: '수학', subjectId: 's1', startedAt: NOW - 3_600_000, pauseCount: 0 };

  test('countdown running: 죽은 사이 완료 → complete + 기록 (durationSec=totalSec)', () => {
    const t = { ...base, type: 'countdown', status: 'running', totalSec: 1500, elapsedSec: 1400 };
    const r = restoreTimerCore(t, 200, NOW); // 1400+200 >= 1500
    expect(r).toMatchObject({ kind: 'complete', record: true, durationSec: 1500, timerType: 'countdown', capped: false });
  });

  test('countdown 5분 미만은 미기록, 계획/할일 연결 시 30초부터 기록 (불변식 7)', () => {
    const short = { ...base, type: 'countdown', status: 'running', totalSec: 120, elapsedSec: 100 };
    expect(restoreTimerCore(short, 60, NOW).record).toBe(false);
    expect(restoreTimerCore({ ...short, planId: 'p1' }, 60, NOW).record).toBe(true);
    expect(restoreTimerCore({ ...short, todoId: 'td1' }, 60, NOW).record).toBe(true);
  });

  test('countdown running 미완료 → resume: 경과에 gap 가산 + 지금으로 재앵커', () => {
    const t = { ...base, type: 'countdown', status: 'running', totalSec: 1500, elapsedSec: 600, resumedAt: NOW - 700_000 };
    const r = restoreTimerCore(t, 100, NOW);
    expect(r.kind).toBe('resume');
    expect(r.timer).toMatchObject({ elapsedSec: 700, status: 'running', resumedAt: NOW, elapsedSecAtResume: 700 });
  });

  test('countdown paused: gap 미가산, 경과가 이미 목표 이상이면 완료 처리', () => {
    const t = { ...base, type: 'countdown', status: 'paused', totalSec: 1500, elapsedSec: 600 };
    const r = restoreTimerCore(t, 99999, NOW);
    expect(r.kind).toBe('pause');
    expect(r.timer).toMatchObject({ elapsedSec: 600, resumedAt: null, elapsedSecAtResume: 600 });
    expect(restoreTimerCore({ ...t, elapsedSec: 1500 }, 0, NOW).kind).toBe('complete');
  });

  test('free running 상한 도달 → complete + 기록(5시간, capped), lap은 기록 없이 제거', () => {
    const free = { ...base, type: 'free', status: 'running', elapsedSec: COUNTUP_MAX_SEC - 100 };
    const r = restoreTimerCore(free, 200, NOW);
    expect(r).toMatchObject({ kind: 'complete', record: true, durationSec: COUNTUP_MAX_SEC, timerType: 'free', capped: true });
    const lap = { ...base, type: 'lap', status: 'running', elapsedSec: COUNTUP_MAX_SEC };
    expect(restoreTimerCore(lap, 0, NOW)).toMatchObject({ kind: 'complete', record: false });
  });

  test('free paused는 상한 미적용 (경과 정지 상태) → pause 유지', () => {
    const t = { ...base, type: 'free', status: 'paused', elapsedSec: COUNTUP_MAX_SEC + 999 };
    expect(restoreTimerCore(t, 0, NOW).kind).toBe('pause');
  });

  test('pomodoro running(resumedAt 有) → fastforward: gap이 아니라 벽시계 경과 사용', () => {
    const t = { ...base, type: 'pomodoro', status: 'running', elapsedSec: 100,
      resumedAt: NOW - 2_000_000, elapsedSecAtResume: 50 };
    const r = restoreTimerCore(t, 777, NOW);
    expect(r.kind).toBe('fastforward');
    expect(r.timer.elapsedSec).toBe(50 + 2000); // resumedAt 기준 (gap 777 무시)
  });

  test('pomodoro running인데 resumedAt 없으면(방어) 일반 resume 재앵커', () => {
    const t = { ...base, type: 'pomodoro', status: 'running', elapsedSec: 100, resumedAt: null };
    const r = restoreTimerCore(t, 60, NOW);
    expect(r.kind).toBe('resume');
    expect(r.timer).toMatchObject({ elapsedSec: 160, resumedAt: NOW });
  });
});
