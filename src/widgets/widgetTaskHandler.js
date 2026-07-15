// src/widgets/widgetTaskHandler.js
// 위젯 생명주기 이벤트(추가/갱신/리사이즈/클릭) 처리.
// 앱이 꺼져 있어도 호출되는 헤드리스 핸들러 — getWidgetData가 AsyncStorage를 직접 읽는다.

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StudyTimeWidget } from './StudyTimeWidget';
import { DDayWidget } from './DDayWidget';
import { SubjectLauncherWidget } from './SubjectLauncherWidget';
import { TodayPlanWidget } from './TodayPlanWidget';
import { TodayTodoWidget } from './TodayTodoWidget';
import { getWidgetData } from './widgetData';

const nameToWidget = {
  StudyTime: StudyTimeWidget,
  DDay: DDayWidget,
  SubjectLauncher: SubjectLauncherWidget,
  TodayPlan: TodayPlanWidget,
  TodayTodo: TodayTodoWidget,
};

const TODOS_KEY = '@yeolgong/todos';
const TODO_LOG_KEY = '@yeolgong/todoLog';
export const WIDGET_TODO_DIRTY_KEY = '@yeolgong/widgetTodoDirty';

// 로컬 YYYY-MM-DD (format.js toDateStr와 동일 규칙 — UTC 금지)
const localDateStr = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 위젯에서 할일 체크/해제 — 앱이 꺼진 헤드리스에서 storage에 직접 반영.
// useAppState.toggleTodo와 동일 규칙: done/completedAt + 완료 로그 upsert(체크)/회수(해제, id 멱등, cap 1000).
// dirty 플래그를 남겨 앱이 살아 있으면 복귀 시 todos를 재로드하게 한다 (자동저장이 덮어쓰는 것 방지).
async function toggleTodoInStorage(id) {
  try {
    const raw = await AsyncStorage.getItem(TODOS_KEY);
    const todos = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(todos)) return;
    const t = todos.find(x => x && x.id === id);
    if (!t) return;
    const done = !t.done;
    const completedAt = done ? Date.now() : null;
    const next = todos.map(x => (x && x.id === id) ? { ...x, done, completedAt } : x);

    let log = [];
    try {
      const logRaw = await AsyncStorage.getItem(TODO_LOG_KEY);
      log = logRaw ? JSON.parse(logRaw) : [];
      if (!Array.isArray(log)) log = [];
    } catch { log = []; }
    log = log.filter(e => e && e.id !== id);
    if (done) {
      log.push({
        id, date: localDateStr(completedAt), text: t.text,
        subjectLabel: t.subjectLabel ?? null, subjectColor: t.subjectColor ?? null, scope: t.scope ?? 'today',
      });
      if (log.length > 1000) log = log.slice(log.length - 1000);
    }

    await AsyncStorage.setItem(TODOS_KEY, JSON.stringify(next));
    await AsyncStorage.setItem(TODO_LOG_KEY, JSON.stringify(log));
    await AsyncStorage.setItem(WIDGET_TODO_DIRTY_KEY, '1');
  } catch {
    // storage 손상 등은 조용히 무시 — 다음 렌더에서 현재 상태 그대로 표시
  }
}

export async function widgetTaskHandler(props) {
  const { widgetInfo, widgetAction, renderWidget } = props;
  const Widget = nameToWidget[widgetInfo.widgetName];
  if (!Widget) return;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK': {
      // 오늘할일 위젯의 행 클릭 → 체크 토글 후 재렌더
      if (widgetAction === 'WIDGET_CLICK' && props.clickAction === 'TODO_TOGGLE' && props.clickActionData?.id) {
        await toggleTodoInStorage(String(props.clickActionData.id));
      }
      const data = await getWidgetData();
      renderWidget(<Widget data={data} width={widgetInfo.width} height={widgetInfo.height} />);
      break;
    }
    case 'WIDGET_DELETED':
    default:
      break;
  }
}
