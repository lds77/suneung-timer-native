import WidgetKit
import SwiftUI

// 열공메이트 iOS 홈 화면 위젯 번들 — 5종(오늘 공부시간 / 시험 D-Day / 과목 바로 시작 / 오늘 계획 / 오늘 할 일)
// + 집중 타이머 Live Activity (잠금화면/Dynamic Island)
@main
struct YeolgongWidgets: WidgetBundle {
    var body: some Widget {
        StudyTimeWidget()
        DDayWidget()
        SubjectWidget()
        TodayPlanWidget()
        TodayTodoWidget()
        FocusLiveActivity()
    }
}
