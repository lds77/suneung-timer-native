// src/widgets/TodayTodoWidget.js
// 오늘 할 일 위젯 — 앱 오늘 탭과 같은 목록(My Day 판정), 행을 누르면 위젯에서 바로 체크/해제.
// 체크는 widgetTaskHandler의 TODO_TOGGLE이 AsyncStorage에 직접 반영(헤드리스) 후 재렌더.
// 헤더/빈 영역 탭 → 집중탭 할일 카드로 스크롤. iOS TodayTodoWidget.swift는 보기 전용(탭 → 동일 딥링크)으로 동일 데이터 사용.

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

const OPEN_FOCUS_TODOS = { uri: 'yeolgong://open?tab=focus&section=todos' };

const theme = (darkMode) => darkMode
  ? { bg: '#1C1C1E', text: '#FFFFFF', sub: '#9A9AA0', chip: '#2C2C2E', border: '#48484D' }
  : { bg: '#FFFFFF', text: '#1A1A1A', sub: '#8A8A8E', chip: '#F2F2F5', border: '#C7C7CC' };

const DONE_GREEN = '#4CAF50';
const GOLD = '#E6B800';

function TodoRow({ todo, accent, t, grid = false }) {
  return (
    <FlexWidget
      clickAction="TODO_TOGGLE"
      clickActionData={{ id: todo.id }}
      style={{
        height: 'wrap_content', flexDirection: 'row', alignItems: 'center',
        backgroundColor: t.chip, borderRadius: 11, paddingVertical: 8, paddingHorizontal: 10,
        ...(grid ? { flex: 1, margin: 3 } : { width: 'match_parent', marginTop: 5 }),
      }}
    >
      {/* 체크박스 */}
      <FlexWidget style={{
        width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
        backgroundColor: todo.done ? DONE_GREEN : t.bg,
        borderWidth: 2, borderColor: todo.done ? DONE_GREEN : t.border,
      }}>
        {todo.done && <TextWidget text="✓" style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '800' }} />}
      </FlexWidget>
      {todo.color !== '' && (
        <FlexWidget style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: todo.color, marginLeft: 7 }} />
      )}
      <TextWidget
        text={todo.text}
        style={{ flex: 1, fontSize: 13, color: todo.done ? t.sub : t.text, fontWeight: '600', marginLeft: 7 }}
        maxLines={1}
        truncate="END"
      />
    </FlexWidget>
  );
}

export function TodayTodoWidget({ data, width = 0, height = 0 }) {
  const { todos = [], todoDone = 0, todoTotal = 0, accent = '#FF6B9D', darkMode = false } = data || {};
  const t = theme(darkMode);
  const isCompact = width > 0 && width < 110;
  const allDone = todoTotal > 0 && todoDone === todoTotal;
  const rootStyle = {
    height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center',
    backgroundColor: t.bg, borderRadius: 20, padding: 11,
  };

  // 1x1 컴팩트: 완료 카운트만 (탭 → 앱)
  if (isCompact) {
    return (
      <FlexWidget clickAction="OPEN_URI" clickActionData={OPEN_FOCUS_TODOS} style={{ ...rootStyle, alignItems: 'center', padding: 8 }}>
        <TextWidget text="오늘 할 일" style={{ fontSize: 12, fontWeight: '700', color: t.text }} maxLines={1} />
        <TextWidget
          text={todoTotal > 0 ? `${todoDone}/${todoTotal}` : '없음'}
          style={{ fontSize: 16, fontWeight: '800', color: allDone ? GOLD : accent, marginTop: 3 }}
          maxLines={1}
        />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget style={rootStyle}>
      {/* 헤더: 제목(탭 → 앱) + 완료 카운트 */}
      <FlexWidget clickAction="OPEN_URI" clickActionData={OPEN_FOCUS_TODOS} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget text="오늘 할 일" style={{ flex: 1, fontSize: 12, color: t.sub, fontWeight: '600', marginLeft: 3 }} maxLines={1} />
        {todoTotal > 0 && (
          <TextWidget
            text={`${todoDone}/${todoTotal}`}
            style={{ fontSize: 12, color: allDone ? GOLD : accent, fontWeight: '800', marginLeft: 6, paddingRight: 3 }}
            maxLines={1}
          />
        )}
      </FlexWidget>
      {todos.length === 0 ? (
        <FlexWidget clickAction="OPEN_URI" clickActionData={OPEN_FOCUS_TODOS} style={{ width: 'match_parent', height: 'wrap_content' }}>
          <TextWidget text="오늘 할 일을 추가해보세요" style={{ fontSize: 13, color: t.sub, marginLeft: 3, marginTop: 6 }} maxLines={2} />
        </FlexWidget>
      ) : (() => {
        // 높이에 맞춰 행 수 결정 (행 ≈ 38dp + 헤더 여유, TodayPlan과 동일 기준). 높이 모르면 3개.
        const rowsFit = height > 0 ? Math.max(1, Math.floor((height - 28) / 38)) : 3;
        // 3칸 이상 너비면 2열 그리드 (과목바로시작/오늘계획과 동일 기준)
        const cols = width >= 170 ? 2 : 1;
        const capacity = rowsFit * cols;
        // 홈 위젯은 스크롤이 안 되므로, 넘치면 마지막 한 줄을 "+N개 더"로 대체해 잘린 걸 알린다(탭 → 앱).
        // 한 줄만 들어가는 작은 크기(rowsFit 1)에선 항목을 우선하고 안내는 생략.
        const showMore = todos.length > capacity && rowsFit >= 2;
        const shown = todos.slice(0, (showMore ? rowsFit - 1 : rowsFit) * cols);
        const moreCount = todos.length - shown.length;
        const moreFooter = (showMore && moreCount > 0) ? (
          <FlexWidget
            key="more"
            clickAction="OPEN_URI"
            clickActionData={OPEN_FOCUS_TODOS}
            style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 5, paddingVertical: 3 }}
          >
            <TextWidget text={`+${moreCount}개 더 · 탭하여 열기`} style={{ fontSize: 12, color: t.sub, fontWeight: '700' }} maxLines={1} />
          </FlexWidget>
        ) : null;
        if (cols === 1) {
          return [
            ...shown.map((todo) => <TodoRow key={todo.id} todo={todo} accent={accent} t={t} />),
            moreFooter,
          ];
        }
        const rows = [];
        for (let i = 0; i < shown.length; i += cols) rows.push(shown.slice(i, i + cols));
        return [
          ...rows.map((row, ri) => (
            <FlexWidget key={ri} style={{ width: 'match_parent', flexDirection: 'row' }}>
              {row.map((todo) => <TodoRow key={todo.id} todo={todo} accent={accent} t={t} grid />)}
              {row.length < cols && <FlexWidget style={{ flex: 1, margin: 3 }} />}
            </FlexWidget>
          )),
          moreFooter,
        ];
      })()}
    </FlexWidget>
  );
}
