// src/widgets/updateStudyWidget.js
// 앱이 켜져 있을 때 위젯을 즉시 다시 그리도록 요청하는 트리거.
// Android 전용 — iOS에서는 네이티브 모듈이 없으므로 즉시 no-op.

import { Platform } from 'react-native';

const WIDGET_RENDERERS = {
  StudyTime: (React, W, data, info) => React.createElement(W.StudyTimeWidget, { data, width: info.width, height: info.height }),
  DDay: (React, W, data, info) => React.createElement(W.DDayWidget, { data, width: info.width, height: info.height }),
  SubjectLauncher: (React, W, data, info) => React.createElement(W.SubjectLauncherWidget, { data, width: info.width, height: info.height }),
};

// 모든 열공메이트 위젯을 한 번에 갱신
export async function updateAllWidgets() {
  if (Platform.OS !== 'android') return;
  try {
    const React = require('react');
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const W = {
      StudyTimeWidget: require('./StudyTimeWidget').StudyTimeWidget,
      DDayWidget: require('./DDayWidget').DDayWidget,
      SubjectLauncherWidget: require('./SubjectLauncherWidget').SubjectLauncherWidget,
    };
    const { getWidgetData } = require('./widgetData');
    const data = await getWidgetData();

    await Promise.all(Object.keys(WIDGET_RENDERERS).map((widgetName) =>
      requestWidgetUpdate({
        widgetName,
        renderWidget: (info) => WIDGET_RENDERERS[widgetName](React, W, data, info),
        widgetNotFound: () => {},
      }).catch(() => {})
    ));
  } catch {
    // 위젯 미설치/네이티브 미가용 등은 조용히 무시 (앱 기능에 영향 없음)
  }
}

// 하위호환 별칭 (기존 호출부)
export const updateStudyWidget = updateAllWidgets;
