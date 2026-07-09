import ActivityKit
import ExpoModulesCore

// 집중 타이머 Live Activity — ActivityKit 로컬 모듈.
// ※ FocusActivityAttributes는 위젯 익스텐션(targets/widgets/FocusLiveActivity.swift)에도
//   동일하게 정의돼 있다. ActivityKit은 타입 이름·필드로 매칭하므로 정의가 정확히 일치해야 한다.
// 앱 배포 타깃이 iOS 16.4(SDK 56 최소)라 ActivityKit 16.2 API를 가용성 가드 없이 쓴다.
struct FocusActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var subtitle: String
    var mode: String
    var startMs: Double
    var endMs: Double
    var tint: String
    var textColor: String
    var subColor: String
    var bg: String
  }
}

// JS에서 넘어오는 상태 (src/utils/liveActivity.js buildProps와 필드 일치)
struct FocusStateRecord: Record {
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var mode: String = "none"
  @Field var startMs: Double = 0
  @Field var endMs: Double = 0
  @Field var tint: String = "#FF6B9D"
  @Field var textColor: String = "#333333"
  @Field var subColor: String = "#888888"
  @Field var bg: String = "#FFFFFF"
}

private func toContentState(_ r: FocusStateRecord) -> FocusActivityAttributes.ContentState {
  return FocusActivityAttributes.ContentState(
    title: r.title, subtitle: r.subtitle, mode: r.mode,
    startMs: r.startMs, endMs: r.endMs,
    tint: r.tint, textColor: r.textColor, subColor: r.subColor, bg: r.bg
  )
}

public class FocusLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FocusLiveActivity")

    // 사용자 설정(잠금화면 실시간 활동 꺼짐 등)까지 반영한 사용 가능 여부
    Function("isSupported") { () -> Bool in
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // 시작 — 성공 시 activity id, 실패(비활성/한도 초과 등) 시 nil
    Function("start") { (state: FocusStateRecord) -> String? in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      do {
        let activity = try Activity<FocusActivityAttributes>.request(
          attributes: FocusActivityAttributes(),
          content: ActivityContent(state: toContentState(state), staleDate: nil)
        )
        return activity.id
      } catch {
        return nil
      }
    }

    // 갱신 — id가 이미 사라졌으면 조용히 no-op (호출부가 listIds로 생존 확인)
    AsyncFunction("update") { (id: String, state: FocusStateRecord) async in
      for activity in Activity<FocusActivityAttributes>.activities where activity.id == id {
        await activity.update(ActivityContent(state: toContentState(state), staleDate: nil))
      }
    }

    // 종료 — 최종 상태 반영 후 잠금화면에서 즉시 제거
    AsyncFunction("end") { (id: String, state: FocusStateRecord) async in
      for activity in Activity<FocusActivityAttributes>.activities where activity.id == id {
        await activity.end(
          ActivityContent(state: toContentState(state), staleDate: nil),
          dismissalPolicy: .immediate
        )
      }
    }

    // 현재 살아있는 activity id 목록 (강제종료 후 재부착/중복 정리용)
    Function("listIds") { () -> [String] in
      return Activity<FocusActivityAttributes>.activities.map { $0.id }
    }

    // 전부 즉시 종료 (중복 잔존 정리)
    AsyncFunction("endAll") { () async in
      for activity in Activity<FocusActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
