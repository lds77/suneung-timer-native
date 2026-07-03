// src/widgets/TodayPlanWidget.js
// 오늘 계획 위젯 — 플래너의 오늘 계획 블록 + 달성률. 항목 탭 → 그 계획으로 타이머 바로 시작.
// 탭 → OPEN_URI 딥링크(yeolgong://start?planId=...) → App.js가 startFromPlan으로 남은 시간 카운트다운.
// iOS TodayPlanWidget.swift와 동일 구성 (done=80%, 집중탭 계획 카드와 같은 기준).

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

const theme = (darkMode) => darkMode
  ? { bg: '#1C1C1E', text: '#FFFFFF', sub: '#9A9AA0', chip: '#2C2C2E' }
  : { bg: '#FFFFFF', text: '#1A1A1A', sub: '#8A8A8E', chip: '#F2F2F5' };

const DONE_GREEN = '#4CAF50';
const GOLD = '#E6B800';

const planUri = (id) => ({ uri: `yeolgong://start?planId=${encodeURIComponent(id)}` });

// "45분" / 진행 중 "20/45분" / 완료 (집중탭 계획 카드와 동일 표기)
const planTimeText = (p) => {
  if (p.done) return '완료';
  if (p.doneSec > 0) return `${Math.floor(p.doneSec / 60)}/${p.targetMin}분`;
  return `${p.targetMin}분`;
};

function PlanRow({ plan, accent, t }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={planUri(plan.id)}
      style={{
        width: 'match_parent', height: 'wrap_content', flexDirection: 'row', alignItems: 'center',
        backgroundColor: t.chip, borderRadius: 11, paddingVertical: 8, paddingHorizontal: 10, marginTop: 5,
      }}
    >
      <FlexWidget style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: plan.done ? DONE_GREEN : (plan.color || accent) }} />
      <TextWidget
        text={plan.label}
        style={{ flex: 1, fontSize: 13, color: plan.done ? t.sub : t.text, fontWeight: '600', marginLeft: 7 }}
        maxLines={1}
        truncate="END"
      />
      <TextWidget
        text={planTimeText(plan)}
        style={{ fontSize: 12, color: plan.done ? t.sub : accent, fontWeight: '700', marginLeft: 5, paddingRight: 3 }}
      />
    </FlexWidget>
  );
}

export function TodayPlanWidget({ data, width = 0, height = 0 }) {
  const { plans = [], planPct = -1, accent = '#FF6B9D', darkMode = false } = data || {};
  const t = theme(darkMode);
  const isCompact = width > 0 && width < 110;
  const rootStyle = {
    height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center',
    backgroundColor: t.bg, borderRadius: 20, padding: 11,
  };

  // 1x1 컴팩트: 다음 할 계획 하나 (탭 → 그 계획 시작)
  if (isCompact) {
    const next = plans.find(p => !p.done) || null;
    const base = { ...rootStyle, alignItems: 'center', padding: 8 };
    if (!next) {
      return (
        <FlexWidget clickAction="OPEN_APP" style={base}>
          <TextWidget text={plans.length > 0 ? '계획 완료!' : '오늘 계획'} style={{ fontSize: 12, fontWeight: '700', color: t.text }} maxLines={1} />
          {planPct >= 0 && <TextWidget text={`${planPct}%`} style={{ fontSize: 15, fontWeight: '800', color: planPct >= 100 ? GOLD : accent, marginTop: 3 }} />}
        </FlexWidget>
      );
    }
    return (
      <FlexWidget clickAction="OPEN_URI" clickActionData={planUri(next.id)} style={base}>
        <FlexWidget style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: next.color || accent }} />
        <TextWidget text={next.label} style={{ fontSize: 13, color: t.text, fontWeight: '700', marginTop: 5 }} maxLines={1} truncate="END" />
        <TextWidget text={planTimeText(next)} style={{ fontSize: 11, color: accent, fontWeight: '700', marginTop: 2 }} maxLines={1} />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget style={rootStyle}>
      {/* 헤더: 제목 + 전체 달성률 */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget text="오늘 계획" style={{ flex: 1, fontSize: 12, color: t.sub, fontWeight: '600', marginLeft: 3 }} maxLines={1} />
        {planPct >= 0 && (
          <TextWidget text={`${planPct}%`} style={{ fontSize: 12, color: planPct >= 100 ? GOLD : accent, fontWeight: '800', marginLeft: 6, paddingRight: 3 }} maxLines={1} />
        )}
      </FlexWidget>
      {plans.length === 0 ? (
        <FlexWidget clickAction="OPEN_APP" style={{ width: 'match_parent', height: 'wrap_content' }}>
          <TextWidget text="플래너에서 오늘 계획을 세워보세요" style={{ fontSize: 13, color: t.sub, marginLeft: 3, marginTop: 6 }} maxLines={2} />
        </FlexWidget>
      ) : (
        // 높이에 맞춰 행 수 결정 (행 ≈ 38dp + 헤더 여유). 높이 모르면 3개.
        plans
          .slice(0, height > 0 ? Math.max(1, Math.floor((height - 28) / 38)) : 3)
          .map((p) => <PlanRow key={p.id} plan={p} accent={accent} t={t} />)
      )}
    </FlexWidget>
  );
}
