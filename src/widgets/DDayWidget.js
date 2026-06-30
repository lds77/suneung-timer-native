// src/widgets/DDayWidget.js
// 시험(D-Day) 위젯. 높이에 따라 여러 시험을 임박 순으로 노출.
//  - 1x1: 라벨 + D-n
//  - 2x1: 대표 1개 크게(라벨 + 큰 D-n + 날짜)
//  - 2x2+: 대표 크게 + 나머지 시험 줄(날짜 포함)로 꽉 채움
// 탭 시 앱 열기.

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { ddayLabel } from './widgetData';

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
// "11/14(목)"
const fmtDateShort = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
};

function rootStyle(t, justify = 'center', align) {
  return {
    height: 'match_parent', width: 'match_parent', flexDirection: 'column',
    justifyContent: justify, ...(align ? { alignItems: align } : {}),
    backgroundColor: t.bg, borderRadius: 20, padding: 14,
  };
}

// 나머지 시험 한 줄: 라벨 … 날짜  D-n
function DDayRow({ item, accent, t }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: 7 }}>
      <TextWidget text={item.label || '시험'} style={{ flex: 1, fontSize: 13, color: t.text, fontWeight: '500' }} maxLines={1} truncate="END" />
      <TextWidget text={fmtDateShort(item.date)} style={{ fontSize: 11, color: t.sub, marginLeft: 6 }} />
      <TextWidget text={ddayLabel(item.n)} style={{ fontSize: 15, color: accent, fontWeight: '800', marginLeft: 8 }} />
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
      <FlexWidget style={rootStyle(t, 'center', isCompact ? 'center' : undefined)} clickAction="OPEN_APP">
        <TextWidget text={isCompact ? '시험 없음' : '시험 일정을 추가해보세요'} style={{ fontSize: isCompact ? 12 : 13, color: t.sub }} maxLines={2} />
      </FlexWidget>
    );
  }

  // 1x1: 라벨 + D-n. 패딩 최소화 + 작은 고정 폰트로 'D-141' 잘림 방지.
  if (isCompact) {
    const d = list[0];
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg, borderRadius: 20, padding: 6 }}
      >
        <TextWidget text={d.label || '시험'} style={{ fontSize: 9, color: t.sub, fontWeight: '600', textAlign: 'center', width: 'match_parent' }} maxLines={1} truncate="END" />
        <TextWidget text={ddayLabel(d.n)} style={{ fontSize: 15, color: accent, fontWeight: '800', marginTop: 1, textAlign: 'center', width: 'match_parent' }} maxLines={1} />
      </FlexWidget>
    );
  }

  // 표시 개수: 높이 기준 (대표가 더 큼 → 한 칸 더 차지하는 셈)
  const fit = height ? Math.floor((height - 20) / 38) : 3;
  const total = Math.max(1, Math.min(list.length, fit));
  const featured = list[0];
  const rest = list.slice(1, total);
  const big = total === 1;                       // 대표만 보일 땐 더 크게
  const shortH = height > 0 && height < 120;      // 2x1처럼 낮은 칸
  const dnFont = shortH ? 24 : (big ? 34 : 28);
  const showDate = height === 0 || height >= 112; // 낮으면 날짜 생략(공간)

  return (
    <FlexWidget style={rootStyle(t, 'center', 'flex-start')} clickAction="OPEN_APP">
      {/* 대표 시험 (크게) */}
      <TextWidget text={featured.label || '시험'} style={{ fontSize: 13, color: t.sub, fontWeight: '600' }} maxLines={1} truncate="END" />
      <TextWidget text={ddayLabel(featured.n)} style={{ fontSize: dnFont, color: accent, fontWeight: '800', marginTop: 2 }} maxLines={1} adjustsFontSizeToFit />
      {showDate && <TextWidget text={fmtDateFull(featured.date)} style={{ fontSize: 12, color: t.sub, marginTop: 3 }} maxLines={1} />}

      {/* 나머지 시험 줄 */}
      {rest.map((d, i) => <DDayRow key={i} item={d} accent={accent} t={t} />)}
    </FlexWidget>
  );
}
