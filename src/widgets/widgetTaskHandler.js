// src/widgets/widgetTaskHandler.js
// 위젯 생명주기 이벤트(추가/갱신/리사이즈/클릭) 처리.
// 앱이 꺼져 있어도 호출되는 헤드리스 핸들러 — getWidgetData가 AsyncStorage를 직접 읽는다.

import React from 'react';
import { StudyTimeWidget } from './StudyTimeWidget';
import { DDayWidget } from './DDayWidget';
import { SubjectLauncherWidget } from './SubjectLauncherWidget';
import { getWidgetData } from './widgetData';

const nameToWidget = {
  StudyTime: StudyTimeWidget,
  DDay: DDayWidget,
  SubjectLauncher: SubjectLauncherWidget,
};

export async function widgetTaskHandler(props) {
  const { widgetInfo, widgetAction, renderWidget } = props;
  const Widget = nameToWidget[widgetInfo.widgetName];
  if (!Widget) return;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK': {
      const data = await getWidgetData();
      renderWidget(<Widget data={data} width={widgetInfo.width} height={widgetInfo.height} />);
      break;
    }
    case 'WIDGET_DELETED':
    default:
      break;
  }
}
