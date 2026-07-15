// src/widgets/DDayWidget.js
// 시험(D-Day) 위젯. 높이에 따라 여러 시험을 임박 순으로 노출.
//  - 1x1: 라벨 + D-n (중앙)
//  - 2x1+: 모든 시험을 동일한 2줄 카드로 (윗줄 이름 / 아랫줄 날짜·D-n).
//          대표 시험은 맨 위 정렬로만 구분(폰트 크기 차이 없음).
// 탭 시 플래너탭 월간 뷰로 이동 (시험 일정 관리 화면).

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { ddayLabel } from './widgetData';

const OPEN_PLANNER_MONTHLY = { uri: 'yeolgong://open?tab=planner&view=monthly' };

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const theme = (darkMode) => darkMode
  ? { bg: '#1C1C1E', text: '#FFFFFF', sub: '#9A9AA0', line: '#2C2C2E' }
  : { bg: '#FFFFFF', text: '#1A1A1A', sub: '#8A8A8E', line: '#F0F0F3' };

// "11월 14일 (목)"
const fmtDateFull = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
};

function rootStyle(t, justify = 'center', align) {
  return {
    height: 'match_parent', width: 'match_parent', flexDirection: 'column',
    justifyContent: justify, ...(align ? { alignItems: align } : {}),
    backgroundColor: t.bg, borderRadius: 20, padding: 14,
  };
}

// 시험 한 항목: 윗줄 이름 / 아랫줄 날짜(왼쪽) · D-n(오른쪽). 모든 항목 동일 크기.
function DDayItem({ item, accent, t, isFirst, showDate }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginTop: isFirst ? 0 : 11 }}>
      <TextWidget text={item.label || '시험'} style={{ fontSize: 14, color: t.text, fontWeight: '700' }} maxLines={1} truncate="END" />
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        {showDate
          ? <TextWidget text={fmtDateFull(item.date)} style={{ flex: 1, fontSize: 12, color: t.sub }} maxLines={1} truncate="END" />
          : <FlexWidget style={{ flex: 1 }} />}
        <TextWidget text={ddayLabel(item.n)} style={{ fontSize: 19, color: accent, fontWeight: '800', marginLeft: 8 }} maxLines={1} />
      </FlexWidget>
    </FlexWidget>
  );
}

export function DDayWidget({ data, width = 0, height = 0 }) {
  const { ddays = [], dday = null, accent = '#FF6B9D', darkMode = false } = data || {};
  const t = theme(darkMode);
  const isCompact = width > 0 && width < 110;
  const list = ddays.length ? ddays : (dday ? [dday] : []);

  // 비어있음
  if (list.length === 0) {
    return (
      <FlexWidget style={rootStyle(t, 'center', isCompact ? 'center' : undefined)} clickAction="OPEN_URI" clickActionData={OPEN_PLANNER_MONTHLY}>
        <TextWidget text={isCompact ? '시험 없음' : '시험 일정을 추가해보세요'} style={{ fontSize: isCompact ? 12 : 13, color: t.sub }} maxLines={2} />
      </FlexWidget>
    );
  }

  // 1x1: 라벨 + D-n. 패딩 최소화 + 작은 고정 폰트로 'D-141' 잘림 방지.
  if (isCompact) {
    const d = list[0];
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={OPEN_PLANNER_MONTHLY}
        style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg, borderRadius: 20, padding: 6 }}
      >
        <TextWidget text={d.label || '시험'} style={{ fontSize: 9, color: t.sub, fontWeight: '600', textAlign: 'center', width: 'match_parent' }} maxLines={1} truncate="END" />
        <TextWidget text={ddayLabel(d.n)} style={{ fontSize: 15, color: accent, fontWeight: '800', marginTop: 1, textAlign: 'center', width: 'match_parent' }} maxLines={1} />
      </FlexWidget>
    );
  }

  // 표시 개수: 높이 기준. 각 항목이 2줄 카드로 동일 크기(≈52px).
  const perItem = 52;
  const fit = height ? Math.max(1, Math.floor((height - 14) / perItem)) : 3;
  const total = Math.max(1, Math.min(list.length, fit));
  const shown = list.slice(0, total);
  const showDate = height === 0 || height >= 96;  // 아주 낮으면 날짜 생략(공간)

  return (
    <FlexWidget style={rootStyle(t, 'center', 'flex-start')} clickAction="OPEN_URI" clickActionData={OPEN_PLANNER_MONTHLY}>
      {shown.map((d, i) => (
        <DDayItem key={i} item={d} accent={accent} t={t} isFirst={i === 0} showDate={showDate} />
      ))}
    </FlexWidget>
  );
}
