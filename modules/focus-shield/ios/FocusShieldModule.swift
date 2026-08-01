import CallKit
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit
import UserNotifications

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

// ─── 화면 잠금 감지 (🔥모드 이탈 판정용) ───────────────────────────────────
// iOS는 '화면 잠금'과 '앱 전환'이 앱 입장에서 완전히 같은 이벤트(didEnterBackground)라
// 구분할 공개 API가 없다. 대신 기기가 잠기면 잠시 뒤(약 10초) 보호 데이터가 잠기는 것을 이용한다:
// 백그라운드 진입 시 beginBackgroundTask로 실행 시간을 벌어 isProtectedDataAvailable을
// 지켜보다가 false가 되면 '화면 잠금이었다'고 기록한다.
//
// 백그라운드에서는 JS 타이머가 멈추므로 알림 취소도 네이티브가 해야 한다:
// JS는 이탈 알림을 20초 뒤로, 넛지를 30초~5분 뒤로 예약해 두고(고정 identifier),
// 여기서 잠금을 감지하면 그 예약들을 지운다 → 잠금화면에 헛알림이 뜨지 않는다.
// 이탈 카운트 되돌리기는 JS가 복귀 시 consumeLockedAt()으로 처리
// (src/utils/focusShield.js · useAppState AppState 핸들러).
// 한계: 기기 암호를 설정하지 않은 사용자는 감지되지 않는다 (그 경우 기존대로 이탈 처리).
// ★감지까지 걸리는 시간은 기기·직전 잠금해제 시점에 따라 10~40초로 들쭉날쭉하다(Apple 포럼).
//   그래서 자체 데드라인으로 일찍 끊지 않고, OS가 백그라운드 태스크를 회수할 때(만료 핸들러)까지
//   최대한 버틴다 — 아래 값은 그마저도 안 올 때를 위한 안전망일 뿐이다.
//   즉 감지 실패는 구조적으로 있을 수 있고, 그때는 기존대로 '이탈'로 처리된다(fail-safe).
private let LOCK_WATCH_SEC: TimeInterval = 60
private let LOCK_POLL_SEC: TimeInterval = 0.5
// useAppState의 이탈 알림 identifier와 반드시 일치해야 한다 (fireNotif 'away-now' / scheduleAwayNudges)
private let AWAY_NOTIF_IDS = ["away-now", "away-nudge-30", "away-nudge-60", "away-nudge-180", "away-nudge-300"]

// ─── 전화 수신·통화 감지 (🔥모드 이탈 판정용, 2026-08-01) ──────────────────
// 전화를 받으면 앱이 백그라운드로 내려가 이탈로 잡히고, 통화 중에 '돌아와' 넛지가 울린 뒤
// 끊으면 이탈 1회가 찍힌다. 안드로이드는 2026-07-30에 AudioManager.getMode()로 해결했는데
// iOS엔 대응물이 전혀 없었다 — 그 구멍을 CallKit CXCallObserver로 메운다.
//
// CXCallObserver는 **권한도 usage description도 필요 없다**(안드의 READ_PHONE_STATE 회피와 같은 이유로 중요).
// 셀룰러 통화와 CallKit을 쓰는 인터넷 통화(보이스톡 등)가 모두 잡힌다.
// ★관측자는 반드시 프로퍼티로 붙들고 있어야 한다★ — 매번 새로 만들면 통화 목록이
//   동기화되기 전이라 빈 배열이 돌아온다.
//
// ★한계(iOS 고유): 백그라운드에서 앱이 정지되면 관측이 끊긴다★
// 안드는 네이티브가 배경에서 계속 폴링하지만 iOS는 beginBackgroundTask가 회수되면 끝이다.
// 그래서 '통화가 언제 끝났는지'를 못 볼 수 있다 → 관측이 끊길 때 통화 중이었으면
// callHeldAtWatchEnd를 세워 그 배경 구간을 통째로 면제한다(consumeCallHeld).
// 잠금 감지가 이미 같은 양보를 하고 있으므로(잠기면 그 구간 전체 면제) 일관된 선택이다.

public class FocusShieldModule: Module {
  // lockWatch/lockedAtMs는 JS 스레드(Function)와 메인 스레드(타이머·앱 생명주기)가 함께 만지므로
  // 반드시 lock으로 감싼다. 타이머·백그라운드 태스크 관련 상태는 메인 스레드 전용.
  private let stateLock = NSLock()
  private var lockWatch = false                  // 🔥모드 세션 중에만 감시 (JS가 토글)
  private var lockedAtMs: Double = 0             // 잠금 감지 시각(epoch ms), 0 = 감지 안 됨
  private var bgTaskId: UIBackgroundTaskIdentifier = .invalid
  private var lockPollTimer: Timer?
  private var watchDeadline: Date?
  // 통화 관측 (위 주석 참고) — 관측자는 계속 붙들고 있어야 목록이 정확하다
  private let callObserver = CXCallObserver()
  private var lastCallAtMs: Double = 0        // 마지막으로 통화를 관측한 시각(epoch ms), 0 = 없음
  private var callHeldAtWatchEnd = false      // 관측이 끊길 때 통화가 진행 중이었는가

  private func isWatchEnabled() -> Bool {
    stateLock.lock(); defer { stateLock.unlock() }
    return lockWatch
  }

  // 지금 통화 중(벨 울림 포함)인가. 관측되면 기준 시각을 갱신한다.
  // ★기준점을 계속 갱신하는 것이 핵심★ — 통화 시작 시각에 굳으면 '통화 직후 유예'가
  //   `유예 − 통화 시간`으로 줄어든다(안드에서 실제로 밟은 함정, focusAway.js POST_CALL_GRACE_MS 주석).
  @discardableResult
  private func observeCall() -> Bool {
    let active = callObserver.calls.contains { !$0.hasEnded }
    if active {
      stateLock.lock()
      lastCallAtMs = Date().timeIntervalSince1970 * 1000
      stateLock.unlock()
    }
    return active
  }

  private func setCallHeld(_ v: Bool) {
    stateLock.lock(); defer { stateLock.unlock() }
    callHeldAtWatchEnd = v
  }

  private func setLockedAt(_ ms: Double) {
    stateLock.lock(); defer { stateLock.unlock() }
    lockedAtMs = ms
  }

  // 호출 스레드를 모를 때 (JS 스레드에서 오는 setLockWatch, 소멸 시점 등)
  private func endWatchSafely() {
    if Thread.isMainThread { endWatch() } else { DispatchQueue.main.async { self.endWatch() } }
  }

  // 메인 스레드 전용 (타이머 정리 + 백그라운드 태스크 종료)
  private func endWatch() {
    lockPollTimer?.invalidate()
    lockPollTimer = nil
    watchDeadline = nil
    if bgTaskId != .invalid {
      UIApplication.shared.endBackgroundTask(bgTaskId)
      bgTaskId = .invalid
    }
  }

  // 예약해 둔 이탈 알림/넛지를 발송 전에 지운다.
  // 감지가 예약 시각(20초)보다 늦은 기기에서 이미 발송됐을 수 있어 발송분도 함께 정리.
  private func cancelAwayNotifs() {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: AWAY_NOTIF_IDS)
    center.removeDeliveredNotifications(withIdentifiers: AWAY_NOTIF_IDS)
  }

  // ※메인 스레드에서 동기 호출해야 한다. OnAppEntersBackground는 didEnterBackground 알림에서
  //   메인 스레드로 동기 전달되므로, 여기서 DispatchQueue.main.async로 한 번 미루면
  //   블록이 실행되기 전에 앱이 정지될 수 있다(= 감시가 아예 시작 안 되거나, 다음 포그라운드
  //   복귀 때 유령 감시가 도는 레이스). beginBackgroundTask는 didEnterBackground가 리턴하기
  //   전에 호출하는 것이 Apple 권장이기도 하다.
  private func startWatch() {
    endWatch()
    setLockedAt(0)
    setCallHeld(false)
    bgTaskId = UIApplication.shared.beginBackgroundTask(withName: "yeolgongLockWatch") { [weak self] in
      guard let self = self else { return }
      // OS가 백그라운드 태스크를 회수하는 시점 = 관측이 끊기는 시점.
      // 이때 통화가 진행 중이었다면 통화 종료 시각을 영영 알 수 없으므로 표시해 둔다.
      if self.observeCall() { self.setCallHeld(true) }
      self.endWatch()
    }
    guard bgTaskId != .invalid else { return }
    watchDeadline = Date().addingTimeInterval(LOCK_WATCH_SEC)
    lockPollTimer = Timer.scheduledTimer(withTimeInterval: LOCK_POLL_SEC, repeats: true) { [weak self] timer in
      guard let self = self else {
        // 모듈이 사라졌는데 타이머만 남는 일이 없도록 (백그라운드 태스크는 OnDestroy에서 종료)
        timer.invalidate()
        return
      }
      // 통화 중이면 이탈 판정을 통째로 건너뛴다 — 알림을 지우고 관측만 계속한다.
      // ★여기서 endWatch()를 부르면 안 된다★: 감시를 끊는 순간 lastCallAtMs가 통화 시작
      //   시각에 굳어, 통화가 길수록 '통화 직후 유예'가 사라진다(안드에서 밟은 함정).
      if self.observeCall() {
        self.cancelAwayNotifs()
        self.watchDeadline = Date().addingTimeInterval(LOCK_WATCH_SEC)
        return
      }
      if !UIApplication.shared.isProtectedDataAvailable {
        self.setLockedAt(Date().timeIntervalSince1970 * 1000)
        self.cancelAwayNotifs()   // 화면 잠금이었다
        self.endWatch()
      } else if let dl = self.watchDeadline, Date() >= dl {
        self.endWatch()
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("FocusShield")

    // 🔥모드 세션 동안만 잠금 감시 (백그라운드 태스크를 세션 밖에서 쓰지 않기 위해)
    Function("setLockWatch") { (on: Bool) in
      self.stateLock.lock()
      self.lockWatch = on
      if !on {
        self.lockedAtMs = 0
        self.lastCallAtMs = 0
        self.callHeldAtWatchEnd = false
      }
      self.stateLock.unlock()
      if !on { self.endWatchSafely() }
    }

    // 마지막 백그라운드 구간에서 감지한 잠금 시각(epoch ms). 0이면 잠금 아님(=앱 전환).
    // 읽으면 초기화된다 (JS가 복귀 때 한 번만 소비).
    Function("consumeLockedAt") { () -> Double in
      self.stateLock.lock(); defer { self.stateLock.unlock() }
      let v = self.lockedAtMs
      self.lockedAtMs = 0
      return v
    }

    // 지금 통화 중(벨 울림 포함)인가 — 호출만 해도 통화 기준 시각이 갱신된다.
    // 안드 screenPin.isInCall()의 iOS 대응물 (useAppState가 배경 진입·복귀 시점에 호출).
    Function("isInCall") { () -> Bool in
      return self.observeCall()
    }

    // 마지막 통화 관측 이후 경과(ms). 관측 기록이 없으면 -1 (JS의 awayMsAfterCall이 그대로 통과시킴).
    Function("msSinceCall") { () -> Double in
      self.stateLock.lock(); defer { self.stateLock.unlock() }
      if self.lastCallAtMs <= 0 { return -1 }
      return Date().timeIntervalSince1970 * 1000 - self.lastCallAtMs
    }

    // 백그라운드 관측이 끊길 때 통화가 진행 중이었는가 (읽으면 초기화).
    // true면 통화 종료 시각을 알 수 없으므로 그 배경 구간을 통째로 이탈 면제한다.
    Function("consumeCallHeld") { () -> Bool in
      self.stateLock.lock(); defer { self.stateLock.unlock() }
      let v = self.callHeldAtWatchEnd
      self.callHeldAtWatchEnd = false
      return v
    }

    // ※메인 스레드에서 동기 호출됨 (didEnterBackground 알림) — startWatch 주석 참고
    OnAppEntersBackground {
      guard self.isWatchEnabled() else { return }
      self.startWatch()
    }

    OnAppEntersForeground {
      self.endWatch()
    }

    // 모듈/AppContext 소멸(개발 중 리로드 등) 시 백그라운드 태스크가 살아남으면
    // 만료 핸들러가 no-op이 되어 OS가 앱을 강제 종료한다(0x8badf00d) — 반드시 정리
    OnDestroy {
      self.endWatchSafely()
    }

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
