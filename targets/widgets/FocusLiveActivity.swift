import ActivityKit
import WidgetKit
import SwiftUI

// 집중 타이머 Live Activity (잠금화면 / Dynamic Island)
// ※ FocusActivityAttributes는 앱 쪽 로컬 모듈(modules/live-activity/ios)에도 동일하게 정의돼 있다.
//   ActivityKit은 타입 이름·필드로 매칭하므로 양쪽 정의(이름/필드명/타입)가 정확히 일치해야 한다.
struct FocusActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var subtitle: String
        var mode: String      // "down"(카운트다운) | "up"(카운트업) | "none"(일시정지/종료)
        var startMs: Double   // 타이머 구간 시작(ms epoch) — 누적 경과 반영한 가상 시작 시각
        var endMs: Double     // 카운트다운 종료 시각(ms epoch). "up"은 미사용
        var tint: String      // 타이머 색 (hex)
        var textColor: String // 제목 색 (hex) — 배너 전용
        var subColor: String  // 부제 색 (hex) — 배너 전용
        var bg: String        // 배너 배경 (hex, 앱 테마 카드색)
    }
}

// 카운트다운/업 타이머 텍스트 — OS가 직접 그려서 백그라운드에서도 초 단위 정확
private func focusTimerText(_ s: FocusActivityAttributes.ContentState, size: CGFloat, color: Color) -> some View {
    let start = Date(timeIntervalSince1970: s.startMs / 1000)
    let rawEnd = s.mode == "up"
        ? start.addingTimeInterval(12 * 3600) // 카운트업 상한 = Live Activity 수명(12시간)
        : Date(timeIntervalSince1970: s.endMs / 1000)
    let end = max(rawEnd, start.addingTimeInterval(1)) // 빈/역전 구간 방어 (range 크래시 방지)
    return Text(timerInterval: start...end, countsDown: s.mode == "down")
        .font(.system(size: size, weight: .bold))
        .monospacedDigit()
        .foregroundColor(color)
}

// 잠금화면/배너 UI
struct FocusBannerView: View {
    let state: FocusActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(state.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color(hexString: state.textColor))
                    .lineLimit(1)
                Text(state.subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(Color(hexString: state.subColor))
                    .lineLimit(1)
            }
            Spacer()
            if state.mode != "none" {
                focusTimerText(state, size: 30, color: Color(hexString: state.tint))
            } else {
                Image(systemName: "pause.fill")
                    .foregroundColor(Color(hexString: state.tint))
            }
        }
        .padding(EdgeInsets(top: 14, leading: 20, bottom: 14, trailing: 20))
    }
}

struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            // 잠금화면 배너 — 배경은 앱 테마 카드색 (activityBackgroundTint가 카드 전면을 칠함)
            FocusBannerView(state: context.state)
                .activityBackgroundTint(Color(hexString: context.state.bg))
                .activitySystemActionForegroundColor(Color(hexString: context.state.tint))
        } dynamicIsland: { context in
            // Dynamic Island는 항상 검정 배경 — 고정 밝은 색 사용
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .center, spacing: 2) {
                        Text(context.state.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Text(context.state.subtitle)
                            .font(.system(size: 12))
                            .foregroundColor(Color(hexString: "#B0B0B8"))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Spacer()
                        if context.state.mode == "none" {
                            Image(systemName: "pause.fill")
                                .foregroundColor(Color(hexString: context.state.tint))
                        } else {
                            focusTimerText(context.state, size: 28, color: .white)
                        }
                        Spacer()
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundColor(Color(hexString: context.state.tint))
            } compactTrailing: {
                if context.state.mode == "none" {
                    Image(systemName: "pause.fill")
                        .foregroundColor(Color(hexString: context.state.tint))
                } else {
                    focusTimerText(context.state, size: 14, color: .white)
                        .frame(width: 56)
                }
            } minimal: {
                Image(systemName: "timer")
                    .foregroundColor(Color(hexString: context.state.tint))
            }
        }
    }
}
