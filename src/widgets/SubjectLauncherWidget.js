// src/widgets/SubjectLauncherWidget.js
// 과목별 '이번 주' 공부시간 + 탭하면 그 과목 타이머 바로 시작.
// 0시간(이번 주 안 한) 과목은 흐리게 → 방치 신호. 순서는 고정(탭 위치 안정).
// 탭 → OPEN_URI 딥링크(yeolgong://start?subjectId=...) → 앱이 받아 집중탭에서 시작.

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { formatShort } from './widgetData';

const theme = (darkMode) => darkMode
  ? { bg: '#1C1C1E', text: '#FFFFFF', sub: '#9A9AA0', chip: '#2C2C2E', dim: '#5A5A5E' }
  : { bg: '#FFFFFF', text: '#1A1A1A', sub: '#8A8A8E', chip: '#F2F2F5', dim: '#C2C2C8' };

const startUri = (id) => ({ uri: `yeolgong://start?subjectId=${encodeURIComponent(id)}` });

function SubjectRow({ subject, accent, t }) {
  const studied = (subject.weekSec || 0) > 0;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={startUri(subject.id)}
      style={{
        width: 'match_parent', height: 'wrap_content', flexDirection: 'row', alignItems: 'center',
        backgroundColor: t.chip, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 11, marginTop: 5,
      }}
    >
      <FlexWidget style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: studied ? (subject.color || accent) : t.dim }} />
      <TextWidget
        text={subject.name}
        style={{ flex: 1, fontSize: 13, color: studied ? t.text : t.sub, fontWeight: '600', marginLeft: 8 }}
        maxLines={1}
        truncate="END"
      />
      <TextWidget text={formatShort(subject.weekSec || 0)} style={{ fontSize: 12, color: studied ? accent : t.dim, fontWeight: studied ? '700' : '500', marginLeft: 6 }} />
    </FlexWidget>
  );
}

export function SubjectLauncherWidget({ data, width = 0, height = 0 }) {
  const { launcherSubjects = [], accent = '#FF6B9D', darkMode = false } = data || {};
  const t = theme(darkMode);
  const isCompact = width > 0 && width < 110;

  // 1x1 컴팩트: 첫 과목 하나를 위젯 전체 버튼으로 (과목명만, 탭→시작)
  if (isCompact) {
    const s = launcherSubjects[0];
    const base = { height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg, borderRadius: 20, padding: 8 };
    if (!s) {
      return (
        <FlexWidget style={base}>
          <TextWidget text="과목 없음" style={{ fontSize: 12, color: t.sub }} />
        </FlexWidget>
      );
    }
    return (
      <FlexWidget clickAction="OPEN_URI" clickActionData={startUri(s.id)} style={base}>
        <FlexWidget style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: s.color || accent }} />
        <TextWidget text={s.name} style={{ fontSize: 13, color: t.text, fontWeight: '700', marginTop: 5 }} maxLines={1} truncate="END" />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center',
        backgroundColor: t.bg, borderRadius: 20, padding: 11,
      }}
    >
      <TextWidget text="이번 주 공부" style={{ fontSize: 12, color: t.sub, fontWeight: '600', marginLeft: 3 }} />
      {launcherSubjects.length === 0 ? (
        <TextWidget text="과목을 추가해보세요" style={{ fontSize: 13, color: t.sub, marginLeft: 3, marginTop: 6 }} maxLines={2} />
      ) : (
        // 높이에 맞는 개수만 노출(잘림 방지). 행 ≈ 36dp, 제목/패딩 ≈ 32dp 예약.
        launcherSubjects
          .slice(0, height ? Math.max(1, Math.floor((height - 32) / 36)) : launcherSubjects.length)
          .map((s) => <SubjectRow key={s.id} subject={s} accent={accent} t={t} />)
      )}
    </FlexWidget>
  );
}
