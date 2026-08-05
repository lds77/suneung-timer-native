// src/utils/scheduleTemplate.js
// 학교급 기본 주간 시간표 생성 — 순수 로직 (테스트 대상)
//
// 쓰는 곳 3곳:
//  · App.js 온보딩 마무리 (학교급 기본 시간표 자동 적용)
//  · ScheduleEditorScreen '기본으로 초기화'
//  · SettingsScreen 학교급 변경 직후의 "기본 시간표도 새로 불러올까요?" 제안
// 같은 결과가 나와야 하므로 화면마다 만들지 말고 여기를 고칠 것.
// ※2026-08-05까지 세 곳에 **각자 구현**돼 있었고, 온보딩만 과목을 연결하고 나머지 둘은
//   연결하지 않았다 — 같은 '기본 시간표'인데 들어온 문으로 결과가 갈렸다.

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
 *
 * @param level    학교급 id
 * @param subjects 사용자 과목 목록 — 계획 라벨과 **이름이 같은 과목이 있으면 연결**한다.
 *                 (템플릿 라벨은 '국어'·'수학'처럼 SCHOOL_DEFAULT_SUBJECTS와 맞춰 둔 이름이라
 *                  대개 그대로 붙는다. 연결돼야 할일↔계획 연동과 과목별 통계가 바로 작동한다)
 *                 없거나 이름이 안 맞으면 subjectId는 null — 사용자가 계획을 눌러 직접 고른다.
 */
export function buildDefaultSchedule(level, subjects = []) {
  const ws = { enabled: true };
  const template = DEFAULT_SCHEDULES[level];
  if (!template) {
    DAY_KEYS.forEach(k => { ws[k] = emptyDaySchedule(); });
    return ws;
  }
  const nameToId = {};
  (subjects || []).forEach(s => { if (s?.name && !nameToId[s.name]) nameToId[s.name] = s.id; });
  DAY_KEYS.forEach(key => {
    const src = (WEEKDAY_KEYS.includes(key) ? template.weekday : template.weekend) || {};
    ws[key] = {
      fixed: (src.fixed || []).map(f => ({ ...f, id: generateId('f_') })),
      plans: (src.plans || []).map((p, idx) => ({
        ...p, id: generateId('p_'), order: idx, subjectId: nameToId[p.label] || null,
      })),
    };
  });
  return ws;
}

/** 사용자가 만들어 둔 내용이 시간표에 있는가 — "사라져요" 경고를 띄울지 판단용 */
export function hasScheduleContent(ws) {
  if (!ws) return false;
  return DAY_KEYS.some(k => ((ws[k]?.fixed?.length || 0) + (ws[k]?.plans?.length || 0)) > 0);
}
