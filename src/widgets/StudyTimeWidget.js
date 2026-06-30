// src/widgets/StudyTimeWidget.js
// "오늘 공부시간" 위젯. 크기에 따라 반응형:
//  - 1x1(아주 작게): 총시간만 크게
//  - 2x1: 총시간 + 목표 막대
//  - 2x2: + 과목 top2 + 이번 주 누적/하루 평균
// 헤드리스 컨텍스트라 react-native가 아닌 Flex/Text 위젯만 사용.

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { formatShort } from './widgetData';

// 안드로이드 위젯 dp 기준: 1셀 ≈ 70dp. 2x2 위젯은 너비/높이 ≈ 140dp 안팎.
const COMPACT_MAX_WIDTH = 110;   // 이보다 좁으면 1x1 컴팩트(시간만)
const TALL_MIN_HEIGHT = 130;     // 이 높이 이상(2x2)이면 과목+주간막대 노출

const theme = (darkMode) => darkMode
  ? { bg: '#1C1C1E', text: '#FFFFFF', sub: '#9A9AA0', track: '#3A3A3C' }
  : { bg: '#FFFFFF', text: '#1A1A1A', sub: '#8A8A8E', track: '#ECECEF' };

// flex 비율 가로 진행바 (filled : remainder)
function ProgressBar({ pct, accent, trackColor, height = 8 }) {
  const filled = Math.max(0, Math.min(100, pct));
  const remainder = 100 - filled;
  return (
    <FlexWidget style={{ height, width: 'match_parent', flexDirection: 'row', backgroundColor: trackColor, borderRadius: height / 2 }}>
      {filled > 0 && <FlexWidget style={{ flex: filled, height, backgroundColor: accent, borderRadius: height / 2 }} />}
      {remainder > 0 && <FlexWidget style={{ flex: remainder, height }} />}
    </FlexWidget>
  );
}

// 과목 한 줄 (점 + 이름 + 시간), 막대 없이 컴팩트
function SubjectLine({ subject, accent, t }) {
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
      <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subject.color || accent }} />
      <TextWidget text={subject.name} style={{ flex: 1, fontSize: 12, color: t.text, marginLeft: 6 }} maxLines={1} truncate="END" />
      <TextWidget text={formatShort(subject.sec)} style={{ fontSize: 12, color: t.sub, marginLeft: 6 }} />
    </FlexWidget>
  );
}

export function StudyTimeWidget({ data, width = 0, height = 0 }) {
  const { totalSec = 0, goalSec = 0, goalPct = 0, accent = '#FF6B9D', darkMode = false, subjects = [], streak = 0, weekTotalSec = 0, weekAvgSec = 0 } = data || {};
  const t = theme(darkMode);
  const isCompact = width > 0 && width < COMPACT_MAX_WIDTH;
  // 2x2 이상(높이 충분)이면 과목/주간요약 노출. 높이 모르면 너비로 폴백.
  const isMedium = height === 0 ? width >= 200 : height >= TALL_MIN_HEIGHT;
  const hasGoal = goalSec > 0;
  const timeText = totalSec > 0 ? formatShort(totalSec) : '0m';

  // 1x1 컴팩트: 총시간만 (+목표%)
  if (isCompact) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={rootStyle(t, 'center', 'center')}>
        <TextWidget text={timeText} style={{ fontSize: 22, color: t.text, fontWeight: '800' }} />
        {hasGoal && <TextWidget text={`목표 ${goalPct}%`} style={{ fontSize: 11, color: accent, fontWeight: '700', marginTop: 2 }} />}
      </FlexWidget>
    );
  }

  const headerLabel = isMedium && streak > 0 ? `오늘 공부 · 연속 ${streak}일` : '오늘 공부';

  return (
    <FlexWidget clickAction="OPEN_APP" style={rootStyle(t, 'center')}>
      {/* 헤더 */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget text={headerLabel} style={{ fontSize: 13, color: t.sub, fontWeight: '600' }} maxLines={1} truncate="END" />
        {hasGoal && <TextWidget text={`목표 ${goalPct}%`} style={{ fontSize: 12, color: accent, fontWeight: '700' }} />}
      </FlexWidget>

      {/* 총 시간 */}
      <TextWidget text={timeText} style={{ fontSize: isMedium ? 30 : 26, color: t.text, fontWeight: '800', marginTop: 4 }} />

      {/* 목표 진행바 */}
      {hasGoal && (
        <FlexWidget style={{ width: 'match_parent', marginTop: 8 }}>
          <ProgressBar pct={goalPct} accent={accent} trackColor={t.track} height={isMedium ? 8 : 7} />
        </FlexWidget>
      )}

      {/* 중형: 과목 top2 */}
      {isMedium && subjects.length > 0 && (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginTop: 8 }}>
          {subjects.slice(0, 2).map((s, i) => <SubjectLine key={i} subject={s} accent={accent} t={t} />)}
        </FlexWidget>
      )}

      {/* 중형: 이번 주 누적 · 하루 평균 */}
      {isMedium && (
        <TextWidget
          text={`이번 주 ${formatShort(weekTotalSec)} · 하루 평균 ${formatShort(weekAvgSec)}`}
          style={{ fontSize: 12, color: t.sub, fontWeight: '600', marginTop: 10 }}
          maxLines={1}
          truncate="END"
        />
      )}
    </FlexWidget>
  );
}

function rootStyle(t, justify = 'center', align) {
  return {
    height: 'match_parent',
    width: 'match_parent',
    flexDirection: 'column',
    justifyContent: justify,
    ...(align ? { alignItems: align } : {}),
    backgroundColor: t.bg,
    borderRadius: 20,
    padding: 14,
  };
}
