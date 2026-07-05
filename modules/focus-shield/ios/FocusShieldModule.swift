import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

// iOS Screen Time API(FamilyControls) 앱 차단 — 울트라집중 세션 중 사용자가 고른 앱을 실제로 차단.
// 요구사항: iOS 16+, Family Controls (Distribution) entitlement (2026-07-05 승인),
//           app.config.js entitlements의 'com.apple.developer.family-controls': true.
// 확장 타겟 없이 본앱에서 shield만 걸어도 차단 화면(OS 기본)이 뜬다.
// 차단 목록(FamilyActivitySelection)은 opaque 토큰이라 UserDefaults에 JSON으로 저장.

@available(iOS 16.0, *)
private let SELECTION_KEY = "yeolgongBlockedSelection"

@available(iOS 16.0, *)
private func loadSelection() -> FamilyActivitySelection? {
  guard let data = UserDefaults.standard.data(forKey: SELECTION_KEY) else { return nil }
  return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
}

@available(iOS 16.0, *)
private func saveSelection(_ sel: FamilyActivitySelection) {
  if let data = try? JSONEncoder().encode(sel) {
    UserDefaults.standard.set(data, forKey: SELECTION_KEY)
  }
}

@available(iOS 16.0, *)
private func blockedCount() -> Int {
  guard let s = loadSelection() else { return 0 }
  return s.applicationTokens.count + s.categoryTokens.count
}

// 차단 앱 선택 화면 — Apple 제공 FamilyActivityPicker를 모달로 호스팅
@available(iOS 16.0, *)
private struct PickerSheet: View {
  @State var selection: FamilyActivitySelection
  let onDone: (FamilyActivitySelection?) -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle("차단할 앱 선택")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("취소") { onDone(nil) }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("완료") { onDone(selection) }
          }
        }
    }
  }
}

public class FocusShieldModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FocusShield")

    // 기기 지원 여부 (iOS 16+)
    Function("isSupported") { () -> Bool in
      if #available(iOS 16.0, *) { return true }
      return false
    }

    // 'approved' | 'denied' | 'notDetermined' | 'unsupported'
    Function("getAuthorizationStatus") { () -> String in
      guard #available(iOS 16.0, *) else { return "unsupported" }
      switch AuthorizationCenter.shared.authorizationStatus {
      case .approved: return "approved"
      case .denied: return "denied"
      default: return "notDetermined"
      }
    }

    // 스크린타임 접근 인증 요청 (OS 다이얼로그) — entitlement 없는 빌드에선 throw → 'denied'
    AsyncFunction("requestAuthorization") { (promise: Promise) in
      guard #available(iOS 16.0, *) else { promise.resolve("unsupported"); return }
      Task { @MainActor in
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
          promise.resolve("approved")
        } catch {
          promise.resolve("denied")
        }
      }
    }

    // 차단 앱 선택 모달 표시 → 완료 시 저장, 선택된 항목 수 resolve (취소 시 기존 수)
    AsyncFunction("presentPicker") { (promise: Promise) in
      guard #available(iOS 16.0, *) else { promise.resolve(-1); return }
      DispatchQueue.main.async {
        guard let current = self.appContext?.utilities?.currentViewController() else {
          promise.resolve(-1)
          return
        }
        var hostRef: UIViewController? = nil
        let sheet = PickerSheet(selection: loadSelection() ?? FamilyActivitySelection()) { result in
          hostRef?.dismiss(animated: true)
          if let sel = result {
            saveSelection(sel)
            promise.resolve(sel.applicationTokens.count + sel.categoryTokens.count)
          } else {
            promise.resolve(blockedCount())
          }
        }
        let host = UIHostingController(rootView: sheet)
        hostRef = host
        current.present(host, animated: true)
      }
    }

    // 저장된 차단 대상 수 (앱 + 카테고리)
    Function("getBlockedCount") { () -> Int in
      guard #available(iOS 16.0, *) else { return 0 }
      return blockedCount()
    }

    // 방패 on/off — on이면 저장된 선택을 차단, off면 전부 해제.
    // 선택이 비어 있으면 false 반환 (걸 것이 없음).
    Function("setShield") { (on: Bool) -> Bool in
      guard #available(iOS 16.0, *) else { return false }
      let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("yeolgongFocus"))
      if on {
        guard let sel = loadSelection(),
              !(sel.applicationTokens.isEmpty && sel.categoryTokens.isEmpty) else { return false }
        store.shield.applications = sel.applicationTokens.isEmpty ? nil : sel.applicationTokens
        store.shield.applicationCategories = sel.categoryTokens.isEmpty
          ? nil
          : ShieldSettings.ActivityCategoryPolicy.specific(sel.categoryTokens)
        return true
      }
      store.shield.applications = nil
      store.shield.applicationCategories = nil
      return true
    }
  }
}
