import WidgetKit
import SwiftUI

// 열공메이트 iOS 홈 화면 위젯 번들 — 3종(오늘 공부시간 / 시험 D-Day / 과목 바로 시작)
@main
struct YeolgongWidgets: WidgetBundle {
    var body: some Widget {
        StudyTimeWidget()
        DDayWidget()
        SubjectWidget()
    }
}
