// 학교급 기본 주간 시간표 생성 (utils/scheduleTemplate.js)
// 설정탭 학교급 변경 제안과 플래너 '기본으로 초기화'가 같은 결과를 내야 하므로 여기서 고정한다.

import { DEFAULT_SCHEDULES } from '../../constants/presets';
import {
  DAY_KEYS, buildDefaultSchedule, hasScheduleTemplate, hasScheduleContent, emptyDaySchedule,
} from '../scheduleTemplate';

describe('hasScheduleTemplate', () => {
  it('기본 시간표가 있는 학교급은 true', () => {
    expect(hasScheduleTemplate('high')).toBe(true);
    expect(hasScheduleTemplate('elementary_lower')).toBe(true);
  });

  it('없는 학교급/빈 값은 false — 제안 자체를 띄우지 않기 위한 가드', () => {
    expect(hasScheduleTemplate('no_such_level')).toBe(false);
    expect(hasScheduleTemplate(undefined)).toBe(false);
  });
});

describe('buildDefaultSchedule', () => {
  it('7일이 모두 채워지고 플래너가 켜진 상태로 나온다', () => {
    const ws = buildDefaultSchedule('high');
    expect(ws.enabled).toBe(true);
    DAY_KEYS.forEach(k => {
      expect(Array.isArray(ws[k].fixed)).toBe(true);
      expect(Array.isArray(ws[k].plans)).toBe(true);
    });
  });

  it('평일은 weekday, 주말은 weekend 템플릿을 쓴다', () => {
    const t = DEFAULT_SCHEDULES.elementary_lower;
    const ws = buildDefaultSchedule('elementary_lower');
    expect(ws.mon.fixed.map(f => f.label)).toEqual(t.weekday.fixed.map(f => f.label));
    expect(ws.sat.fixed.map(f => f.label)).toEqual(t.weekend.fixed.map(f => f.label));
    expect(ws.sun.plans.map(p => p.label)).toEqual(t.weekend.plans.map(p => p.label));
  });

  it('과목 목록을 안 주면 계획에 과목이 연결되지 않는다', () => {
    const ws = buildDefaultSchedule('high');
    DAY_KEYS.forEach(k => ws[k].plans.forEach(p => expect(p.subjectId).toBeNull()));
  });

  it('★이름이 같은 과목이 있으면 연결한다★ — 온보딩·초기화·학교급 변경이 같아야 한다', () => {
    const subjects = [
      { id: 'subj_1', name: '국어' }, { id: 'subj_2', name: '수학' },
    ];
    const ws = buildDefaultSchedule('high', subjects);
    const plans = DAY_KEYS.flatMap(k => ws[k].plans);
    const korean = plans.filter(p => p.label === '국어');
    expect(korean.length).toBeGreaterThan(0);
    korean.forEach(p => expect(p.subjectId).toBe('subj_1'));
    // 목록에 없는 이름은 그대로 null (사용자가 직접 고른다)
    plans.filter(p => !['국어', '수학'].includes(p.label))
      .forEach(p => expect(p.subjectId).toBeNull());
  });

  it('같은 이름의 과목이 여러 개면 먼저 만든 것에 붙는다', () => {
    const subjects = [{ id: 'a', name: '수학' }, { id: 'b', name: '수학' }];
    const ws = buildDefaultSchedule('middle', subjects);
    DAY_KEYS.flatMap(k => ws[k].plans).filter(p => p.label === '수학')
      .forEach(p => expect(p.subjectId).toBe('a'));
  });

  it('이름 없는 과목이 섞여 있어도 터지지 않는다', () => {
    const ws = buildDefaultSchedule('high', [{ id: 'x' }, null, { id: 'y', name: '국어' }]);
    expect(DAY_KEYS.flatMap(k => ws[k].plans).some(p => p.subjectId === 'y')).toBe(true);
  });

  it('id는 항목마다 새로 붙고 서로 겹치지 않는다', () => {
    const ws = buildDefaultSchedule('middle');
    const ids = DAY_KEYS.flatMap(k => [...ws[k].fixed, ...ws[k].plans].map(x => x.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('계획 order는 0부터 순서대로', () => {
    const ws = buildDefaultSchedule('high');
    expect(ws.mon.plans.map(p => p.order)).toEqual(ws.mon.plans.map((_, i) => i));
  });

  it('템플릿이 없는 학교급이면 빈 시간표(켜짐)를 준다 — 예전 시간표가 남지 않게', () => {
    const ws = buildDefaultSchedule('no_such_level');
    expect(ws.enabled).toBe(true);
    DAY_KEYS.forEach(k => expect(ws[k]).toEqual(emptyDaySchedule()));
  });

  it('두 번 호출해도 서로 다른 객체 — 한쪽을 고쳐도 다른 쪽에 영향이 없다', () => {
    const a = buildDefaultSchedule('high');
    const b = buildDefaultSchedule('high');
    expect(a.mon.fixed[0]).not.toBe(b.mon.fixed[0]);
    a.mon.fixed[0].label = '바뀜';
    expect(b.mon.fixed[0].label).not.toBe('바뀜');
  });
});

describe('hasScheduleContent', () => {
  it('빈 시간표·null은 false', () => {
    expect(hasScheduleContent(null)).toBe(false);
    expect(hasScheduleContent(undefined)).toBe(false);
    const empty = { enabled: true };
    DAY_KEYS.forEach(k => { empty[k] = emptyDaySchedule(); });
    expect(hasScheduleContent(empty)).toBe(false);
  });

  it('한 요일에라도 항목이 있으면 true', () => {
    const ws = { enabled: true };
    DAY_KEYS.forEach(k => { ws[k] = emptyDaySchedule(); });
    ws.wed.plans.push({ id: 'p1', label: '수학' });
    expect(hasScheduleContent(ws)).toBe(true);
  });

  it('기본 시간표를 채운 직후는 내용이 있는 상태', () => {
    expect(hasScheduleContent(buildDefaultSchedule('high'))).toBe(true);
  });
});
