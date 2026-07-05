import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

// iOS Screen Time API(FamilyControls) 앱 차단 — 울트라집중 세션 중 사용자가 고른 앱을 실제로 차단.
// 요구사항: iOS 16+, Family Controls (Distribution) entitlement (2026-07-05 승인),
//           app.config.js entitlements의 'com.apple.developer.family-controls': true.
// 확장 타겟 없이 본앱에서 shield만 걸어도 차단 화면(OS 기본)이 뜬다.
// 차단/허용 목록(FamilyActivitySelection)은 opaque 토큰이라 UserDefaults에 JSON으로 저장.
//
// 차단 방식 2가지 (MODE_KEY에 저장, setShieldMode로 JS가 전환):
//  - "block"    선택한 앱/카테고리만 차단 (기본)
//  - "allowAll" 허용 목록의 앱만 남기고 전부 차단 (.all(except:)) — 시험 모드 전체 차단
// ※ 기존 빌드(44/45)에 OTA로 새 JS가 내려가도 깨지지 않도록 setShield(on) 시그니처는 유지하고
//   모드는 UserDefaults를 통해 전달한다 (구 네이티브에는 setShieldMode가 없어 JS쪽 try/catch로 무시됨)

@available(iOS 16.0, *)
private let SELECTION_KEY = "yeolgongBlockedSelection"
@available(iOS 16.0, *)
private let ALLOWED_KEY = "yeolgongAllowedSelection"
private let MODE_KEY = "yeolgongShieldMode"

@available(iOS 16.0, *)
private func loadSelection(_ key: String = SELECTION_KEY) -> FamilyActivitySelection? {
  guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
  return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
}

@available(iOS 16.0, *)
private func saveSelection(_ sel: FamilyActivitySelection, _ key: String = SELECTION_KEY) {
  if let data = try? JSONEncoder().encode(sel) {
    UserDefaults.standard.set(data, forKey: key)
  }
}

@available(iOS 16.0, *)
private func selectionCount(_ key: String) -> Int {
  guard let s = loadSelection(key) else { return 0 }
  return s.applicationTokens.count + s.categoryTokens.count
}

// 앱 선택 화면 — Apple 제공 FamilyActivityPicker를 모달로 호스팅 (차단/허용 겸용)
@available(iOS 16.0, *)
private struct PickerSheet: View {
  @State var selection: FamilyActivitySelection
  let title: String
  let onDone: (FamilyActivitySelection?) -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(title)
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

    // 앱 선택 모달 표시 → 완료 시 저장, 선택된 항목 수 resolve (취소 시 기존 수)
    // mode: nil/"block" = 차단 목록, "allow" = 허용 목록 (전체 차단의 예외)
    // ※ mode 인자는 옵셔널 — 구 JS 번들(인자 없이 호출)과의 호환 유지
    AsyncFunction("presentPicker") { (mode: String?, promise: Promise) in
      guard #available(iOS 16.0, *) else { promise.resolve(-1); return }
      let isAllow = (mode == "allow")
      let key = isAllow ? ALLOWED_KEY : SELECTION_KEY
      DispatchQueue.main.async {
        guard let current = self.appContext?.utilities?.currentViewController() else {
          promise.resolve(-1)
          return
        }
        var hostRef: UIViewController? = nil
        let sheet = PickerSheet(
          selection: loadSelection(key) ?? FamilyActivitySelection(),
          title: isAllow ? "허용할 앱 선택" : "차단할 앱 선택"
        ) { result in
          hostRef?.dismiss(animated: true)
          if let sel = result {
            saveSelection(sel, key)
            promise.resolve(sel.applicationTokens.count + sel.categoryTokens.count)
          } else {
            promise.resolve(selectionCount(key))
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
      return selectionCount(SELECTION_KEY)
    }

    // 저장된 허용(전체 차단의 예외) 대상 수 — JS가 이 함수의 존재로 전체 차단 지원 여부를 판별
    Function("getAllowedCount") { () -> Int in
      guard #available(iOS 16.0, *) else { return 0 }
      return selectionCount(ALLOWED_KEY)
    }

    // 차단 방식 저장 — "block" | "allowAll". setShield(on)이 읽는다.
    Function("setShieldMode") { (mode: String) in
      UserDefaults.standard.set(mode == "allowAll" ? "allowAll" : "block", forKey: MODE_KEY)
    }

    // 방패 on/off — on이면 저장된 방식대로 차단, off면 전부 해제.
    // block 모드에서 선택이 비어 있으면 false 반환 (걸 것이 없음).
    // allowAll 모드는 허용 목록이 비어 있어도 유효 (= 모든 앱 차단).
    Function("setShield") { (on: Bool) -> Bool in
      guard #available(iOS 16.0, *) else { return false }
      let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("yeolgongFocus"))
      if on {
        if UserDefaults.standard.string(forKey: MODE_KEY) == "allowAll" {
          // 전체 차단: 허용 목록의 개별 앱만 예외. (카테고리는 .all(except:)의 예외로 지정
          // 불가한 API 제약 — 피커에서 카테고리를 골라도 개별 앱만 반영됨)
          let allowed = loadSelection(ALLOWED_KEY) ?? FamilyActivitySelection()
          store.shield.applications = nil
          store.shield.applicationCategories =
            ShieldSettings.ActivityCategoryPolicy.all(except: allowed.applicationTokens)
          return true
        }
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
