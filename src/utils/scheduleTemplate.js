// src/utils/scheduleTemplate.js
// 학교급 기본 주간 시간표 생성 — 순수 로직 (테스트 대상)
//
// 쓰는 곳 2곳:
//  · ScheduleEditorScreen '기본으로 초기화'
//  · SettingsScreen 학교급 변경 직후의 "기본 시간표도 새로 불러올까요?" 제안
// 같은 결과가 나와야 하므로 화면마다 만들지 말고 여기를 고칠 것.

import { DEFAULT_SCHEDULES } from '../constants/presets';
import { generateId } from './format';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

export const emptyDaySchedule = () => ({ fixed: [], plans: [] });

/** 그 학교급에 기본 시간표가 준비돼 있는가 (없으면 제안할 것도 없다) */
export function hasScheduleTemplate(level) {
  return !!DEFAULT_SCHEDULES[level];
}

/**
 * 학교급 기본 시간표로 채운 weeklySchedule 객체를 만든다.
 * 템플릿이 없는 학교급이면 빈 시간표(켜진 상태)를 돌려준다.
 * ※plans의 subjectId는 항상 null — 템플릿의 라벨('국어')이 사용자 과목과 이름이 같아도
 *   id가 다르므로 연결하지 않는다. 연결은 사용자가 계획을 눌러 직접 고른다.
 */
export function buildDefaultSchedule(level) {
  const ws = { enabled: true };
  const template = DEFAULT_SCHEDULES[level];
  if (!template) {
    DAY_KEYS.forEach(k => { ws[k] = emptyDaySchedule(); });
    return ws;
  }
  DAY_KEYS.forEach(key => {
    const src = (WEEKDAY_KEYS.includes(key) ? template.weekday : template.weekend) || {};
    ws[key] = {
      fixed: (src.fixed || []).map(f => ({ ...f, id: generateId('f_') })),
      plans: (src.plans || []).map((p, idx) => ({ ...p, id: generateId('p_'), order: idx, subjectId: null })),
    };
  });
  return ws;
}

/** 사용자가 만들어 둔 내용이 시간표에 있는가 — "사라져요" 경고를 띄울지 판단용 */
export function hasScheduleContent(ws) {
  if (!ws) return false;
  return DAY_KEYS.some(k => ((ws[k]?.fixed?.length || 0) + (ws[k]?.plans?.length || 0)) > 0);
}
