// src/widgets/updateStudyWidget.js
// 앱이 켜져 있을 때 위젯을 즉시 다시 그리도록 요청하는 트리거.
// Android: react-native-android-widget으로 즉시 리렌더.
// iOS: App Group(UserDefaults)에 스냅샷을 기록하고 WidgetKit 타임라인 리로드.

import { Platform } from 'react-native';
import { pomoPhaseTargetSec } from '../utils/pomo';

// iOS 위젯 데이터 공유용 App Group (app.config.js APP_GROUP과 반드시 일치)
const IOS_APP_GROUP = 'group.com.yeolgong.timer';

// 실행 중(work 페이즈) 타이머 → 오늘공부 위젯 실시간 카운팅용 앵커(ms epoch).
// 위젯은 Text(style: .timer)로 (지금 - 앵커)를 OS가 직접 그리므로,
// 앵커 = resumedAt - 이미 쌓인 초*1000 - 완료 세션 합계*1000 이면
// 표시값 = 완료 세션 합계 + 현재 타이머 경과 = 오늘 누적이 실시간으로 올라간다.
// 쉬는시간(뽀모/연속 break)·일시정지·랩은 앵커 없음 → 정적 표시.
export function runningAnchorMs(t, totalSec) {
  if (!t || t.status !== 'running' || t.type === 'lap') return null;
  if (t.type === 'pomodoro' && t.pomoPhase !== 'work') return null;
  if (t.type === 'sequence' && t.seqPhase !== 'work') return null;
  const resumedAt = t.resumedAt || t.startedAt;
  if (!resumedAt) return null;
  return resumedAt - (t.elapsedSecAtResume || 0) * 1000 - (totalSec || 0) * 1000;
}

// 실행 중 타이머의 현재 페이즈 종료 시각(ms epoch) — 끝나는 시각을 미리 아는 타입만.
// 잠금 중엔 앱이 스냅샷을 못 갱신하므로, iOS 위젯이 Text(timerInterval:)로 이 시각에
// 카운팅을 스스로 멈추게 한다 (타이머 종료 후에도 계속 올라가던 문제 방지).
// 자유 타이머는 끝이 없어 null (계속 올라가는 게 맞음).
export function runningEndMs(t) {
  if (!t || t.status !== 'running') return null;
  const resumedAt = t.resumedAt || t.startedAt;
  if (!resumedAt) return null;
  let targetSec = 0;
  if (t.type === 'countdown') targetSec = t.totalSec || 0;
  else if (t.type === 'pomodoro' && t.pomoPhase === 'work') targetSec = pomoPhaseTargetSec(t);
  else if (t.type === 'sequence' && t.seqPhase === 'work') targetSec = t.totalSec || 0;
  if (targetSec <= 0) return null;
  return resumedAt - (t.elapsedSecAtResume || 0) * 1000 + targetSec * 1000;
}

// iOS: getWidgetData()로 계산한 스냅샷을 App Group에 JSON 문자열로 기록 후 위젯 리로드.
// SwiftUI 위젯(targets/widgets)이 이 JSON을 읽어 렌더한다.
async function updateIosWidgets(activeTimer) {
  try {
    const { ExtensionStorage } = require('@bacons/apple-targets');
    const { getWidgetData } = require('./widgetData');
    const data = await getWidgetData();
    const anchor = runningAnchorMs(activeTimer, data.totalSec);
    if (anchor) {
      data.runningAnchorMs = anchor;
      const endMs = runningEndMs(activeTimer);
      if (endMs && endMs > anchor) data.runningEndMs = endMs;
    }
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
  TodayPlan: (React, W, data, info) => React.createElement(W.TodayPlanWidget, { data, width: info.width, height: info.height }),
};

// 모든 열공메이트 위젯을 한 번에 갱신 (activeTimer: iOS 실시간 카운팅용, 옵션)
export async function updateAllWidgets(activeTimer = null) {
  if (Platform.OS === 'ios') { await updateIosWidgets(activeTimer); return; }
  if (Platform.OS !== 'android') return;
  try {
    const React = require('react');
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const W = {
      StudyTimeWidget: require('./StudyTimeWidget').StudyTimeWidget,
      DDayWidget: require('./DDayWidget').DDayWidget,
      SubjectLauncherWidget: require('./SubjectLauncherWidget').SubjectLauncherWidget,
      TodayPlanWidget: require('./TodayPlanWidget').TodayPlanWidget,
    };
    const { getWidgetData, activeRunningInfo } = require('./widgetData');
    const data = await getWidgetData();
    // 앱에서 호출된 경우 메모리 타이머가 스냅샷(5초 스로틀)보다 정확 → 실행 중 상태 덮어쓰기
    const run = activeRunningInfo(activeTimer);
    data.runningSec = run ? run.sec : 0;
    data.runningLabel = run ? run.label : '';

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
