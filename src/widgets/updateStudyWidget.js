// src/widgets/updateStudyWidget.js
// 앱이 켜져 있을 때 위젯을 즉시 다시 그리도록 요청하는 트리거.
// Android: react-native-android-widget으로 즉시 리렌더.
// iOS: App Group(UserDefaults)에 스냅샷을 기록하고 WidgetKit 타임라인 리로드.

import { Platform } from 'react-native';

// iOS 위젯 데이터 공유용 App Group (app.config.js APP_GROUP과 반드시 일치)
const IOS_APP_GROUP = 'group.com.yeolgong.timer';

// iOS: getWidgetData()로 계산한 스냅샷을 App Group에 JSON 문자열로 기록 후 위젯 리로드.
// SwiftUI 위젯(targets/widgets)이 이 JSON을 읽어 렌더한다.
async function updateIosWidgets() {
  try {
    const { ExtensionStorage } = require('@bacons/apple-targets');
    const { getWidgetData } = require('./widgetData');
    const data = await getWidgetData();
    const storage = new ExtensionStorage(IOS_APP_GROUP);
    storage.set('widgetData', JSON.stringify(data));
    ExtensionStorage.reloadWidget();
  } catch {
    // 네이티브 모듈 미가용/위젯 미설치 등은 조용히 무시 (앱 기능에 영향 없음)
  }
}

const WIDGET_RENDERERS = {
  StudyTime: (React, W, data, info) => React.createElement(W.StudyTimeWidget, { data, width: info.width, height: info.height }),
  DDay: (React, W, data, info) => React.createElement(W.DDayWidget, { data, width: info.width, height: info.height }),
  SubjectLauncher: (React, W, data, info) => React.createElement(W.SubjectLauncherWidget, { data, width: info.width, height: info.height }),
};

// 모든 열공메이트 위젯을 한 번에 갱신
export async function updateAllWidgets() {
  if (Platform.OS === 'ios') { await updateIosWidgets(); return; }
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
