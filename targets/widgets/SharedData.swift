import Foundation
import SwiftUI
import WidgetKit

// App Group (app.config.js APP_GROUP과 일치)
let APP_GROUP = "group.com.yeolgong.timer"
// ExtensionStorage.set('widgetData', JSON.stringify(...)) 로 저장되는 키
let WIDGET_DATA_KEY = "widgetData"

// MARK: - 색상 유틸

extension Color {
    // "#RRGGBB" → Color (파싱 실패 시 앱 기본 핑크)
    init(hexString: String) {
        let cleaned = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        if cleaned.count == 6 {
            let r = Double((value >> 16) & 0xFF) / 255.0
            let g = Double((value >> 8) & 0xFF) / 255.0
            let b = Double(value & 0xFF) / 255.0
            self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
        } else {
            self.init(.sRGB, red: 1.0, green: 0.42, blue: 0.62, opacity: 1) // #FF6B9D
        }
    }
}

// MARK: - 포맷 유틸 (JS format.js formatShort / ddayLabel과 동일 규칙)

func formatShort(_ totalSec: Int) -> String {
    let sec = max(0, totalSec)
    let h = sec / 3600
    let m = (sec % 3600) / 60
    if h > 0 && m > 0 { return "\(h)h \(m)m" }
    if h > 0 { return "\(h)h" }
    return "\(m)m"
}

func ddayLabel(_ n: Int) -> String {
    if n == 0 { return "D-DAY" }
    return n > 0 ? "D-\(n)" : "D+\(-n)"
}

// 잠금화면 원형 등 아주 좁은 자리용: "3h" / "45m" (1시간 이상이면 분 생략)
func formatTiny(_ totalSec: Int) -> String {
    let sec = max(0, totalSec)
    let h = sec / 3600
    if h > 0 { return "\(h)h" }
    return "\((sec % 3600) / 60)m"
}

// MARK: - 날짜 유틸 (JS widgetData.js todayStr / daysUntil과 동일 규칙, 로컬 기준)

func localDateStr(_ date: Date = Date()) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = TimeZone.current
    return f.string(from: date)
}

// "YYYY-MM-DD" → 오늘 자정 기준 남은 일수. 파싱 실패 시 nil.
func daysUntil(_ dateStr: String) -> Int? {
    guard !dateStr.isEmpty else { return nil }
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = TimeZone.current
    guard let target = f.date(from: dateStr) else { return nil }
    let cal = Calendar.current
    let from = cal.startOfDay(for: Date())
    let to = cal.startOfDay(for: target)
    return cal.dateComponents([.day], from: from, to: to).day
}

// MARK: - JSON 값 추출 헬퍼 (스키마 드리프트에 강하도록 관대하게)

private func intVal(_ v: Any?) -> Int {
    if let i = v as? Int { return i }
    if let d = v as? Double { return Int(d) }
    if let n = v as? NSNumber { return n.intValue }
    return 0
}
private func strVal(_ v: Any?) -> String { (v as? String) ?? "" }
private func dblVal(_ v: Any?) -> Double {
    if let d = v as? Double { return d }
    if let n = v as? NSNumber { return n.doubleValue }
    return 0
}
private func boolVal(_ v: Any?) -> Bool {
    if let b = v as? Bool { return b }
    if let n = v as? NSNumber { return n.boolValue }
    return false
}

// MARK: - 데이터 모델 (JS getWidgetData() 반환 구조와 대응)

struct SubjectStat: Identifiable {
    let id = UUID()
    let name: String
    let color: Color
    let sec: Int
}

struct DDayItem: Identifiable {
    let id = UUID()
    let label: String
    let n: Int
    let isPrimary: Bool
}

struct LauncherItem: Identifiable {
    let id: String   // subjectId (딥링크용)
    let name: String
    let color: Color
    let weekSec: Int // 이번 주 공부시간 (0이면 흐리게 — 안드로이드와 동일)
}

struct PlanItem: Identifiable {
    let id: String    // planId (딥링크용)
    let label: String
    let color: Color? // 없으면 앱 액센트 사용
    let targetMin: Int
    let doneSec: Int
    let done: Bool    // 목표 80% 이상 (집중탭 계획 카드와 동일 기준)
}

struct TodoItem: Identifiable {
    let id: String
    let text: String
    let done: Bool
    let color: Color? // 과목 색 (없으면 표시 안 함)
}

struct WidgetData {
    var totalSec: Int = 0
    var goalSec: Int = 0
    var goalPct: Int = 0
    var accent: Color = Color(hexString: "#FF6B9D")
    var darkMode: Bool = false
    var streak: Int = 0
    var subjects: [SubjectStat] = []
    var weekTotalSec: Int = 0
    var weekAvgSec: Int = 0
    var ddays: [DDayItem] = []
    var launcher: [LauncherItem] = []
    var plans: [PlanItem] = []
    var planPct: Int = -1 // 오늘 계획 달성률 0~100, -1이면 계획 없음
    var todos: [TodoItem] = []
    var todoDone: Int = 0
    var todoTotal: Int = 0
    // 실행 중 타이머 앵커 — 있으면 오늘공부 시간을 Text(style: .timer)로 실시간 카운팅
    var runningAnchor: Date? = nil
    // 현재 페이즈 종료 예정 시각 — 있으면 카운팅이 이 시각에 자동 정지 (Text(timerInterval:))
    // 잠금 중 앱이 스냅샷을 못 갱신해도 타이머 종료 후 계속 올라가지 않도록
    var runningEnd: Date? = nil

    // App Group UserDefaults에서 JSON 문자열을 읽어 파싱. 실패 시 빈 데이터.
    static func load() -> WidgetData {
        var data = WidgetData()
        guard
            let defaults = UserDefaults(suiteName: APP_GROUP),
            let raw = defaults.string(forKey: WIDGET_DATA_KEY),
            let jsonData = raw.data(using: .utf8),
            let obj = (try? JSONSerialization.jsonObject(with: jsonData)) as? [String: Any]
        else { return data }

        data.totalSec = intVal(obj["totalSec"])
        data.goalSec = intVal(obj["goalSec"])
        data.goalPct = intVal(obj["goalPct"])
        let accentHex = strVal(obj["accent"])
        if !accentHex.isEmpty { data.accent = Color(hexString: accentHex) }
        data.darkMode = boolVal(obj["darkMode"])
        data.streak = intVal(obj["streak"])
        data.weekTotalSec = intVal(obj["weekTotalSec"])
        data.weekAvgSec = intVal(obj["weekAvgSec"])

        if let arr = obj["subjects"] as? [[String: Any]] {
            data.subjects = arr.map {
                SubjectStat(name: strVal($0["name"]),
                            color: Color(hexString: strVal($0["color"])),
                            sec: intVal($0["sec"]))
            }
        }
        if let arr = obj["ddays"] as? [[String: Any]] {
            data.ddays = arr.map {
                // 목표일로 남은 일수를 매 렌더마다 재계산 → 앱을 안 열어도 자정에 D-Day 감소
                DDayItem(label: strVal($0["label"]),
                         n: daysUntil(strVal($0["date"])) ?? intVal($0["n"]),
                         isPrimary: boolVal($0["isPrimary"]))
            }
        }
        if let arr = obj["launcherSubjects"] as? [[String: Any]] {
            data.launcher = arr.compactMap {
                let sid = strVal($0["id"])
                if sid.isEmpty { return nil }
                return LauncherItem(id: sid,
                                    name: strVal($0["name"]),
                                    color: Color(hexString: strVal($0["color"])),
                                    weekSec: intVal($0["weekSec"]))
            }
        }
        if let arr = obj["plans"] as? [[String: Any]] {
            data.plans = arr.compactMap {
                let pid = strVal($0["id"])
                if pid.isEmpty { return nil }
                let hex = strVal($0["color"])
                return PlanItem(id: pid,
                                label: strVal($0["label"]),
                                color: hex.isEmpty ? nil : Color(hexString: hex),
                                targetMin: intVal($0["targetMin"]),
                                doneSec: intVal($0["doneSec"]),
                                done: boolVal($0["done"]))
            }
        }
        if obj["planPct"] != nil { data.planPct = intVal(obj["planPct"]) }
        if let arr = obj["todos"] as? [[String: Any]] {
            data.todos = arr.compactMap {
                let tid = strVal($0["id"])
                if tid.isEmpty { return nil }
                let hex = strVal($0["color"])
                return TodoItem(id: tid,
                                text: strVal($0["text"]),
                                done: boolVal($0["done"]),
                                color: hex.isEmpty ? nil : Color(hexString: hex))
            }
        }
        data.todoDone = intVal(obj["todoDone"])
        data.todoTotal = intVal(obj["todoTotal"])

        let anchorMs = dblVal(obj["runningAnchorMs"])
        if anchorMs > 0 {
            let anchor = Date(timeIntervalSince1970: anchorMs / 1000)
            // 미래 앵커(시계 이상)는 무시
            if anchor <= Date() { data.runningAnchor = anchor }
        }
        let endMs = dblVal(obj["runningEndMs"])
        if endMs > 0, let anchor = data.runningAnchor {
            let end = Date(timeIntervalSince1970: endMs / 1000)
            if end > anchor { data.runningEnd = end }
        }

        // 자정 경과 보정: 스냅샷 기준일이 오늘이 아니면 '오늘' 통계는 0부터 다시
        // (앱이 꺼져 있으면 스냅샷이 갱신되지 않으므로 위젯 쪽에서 리셋)
        // 단, 타이머 실행 중(앵커 존재)에 자정을 넘긴 경우는 카운팅 유지 —
        // 그 세션은 종료 시 오늘 날짜로 기록되므로 계속 세는 쪽이 맞다.
        let snapshotDate = strVal(obj["date"])
        if !snapshotDate.isEmpty && snapshotDate != localDateStr() {
            // 오늘 계획은 요일이 바뀌면 목록 자체가 달라지므로 비움 (앱 열면 갱신)
            data.plans = []
            data.planPct = -1
            // 오늘 할 일: 미완료는 이월되므로 유지, 어제 '완료'는 오늘 목록에서 사라지거나
            // 미완료로 리셋되는 항목이라 제거 (앱의 일일 리셋 규칙과 정합 — 안드 widgetData와 동일)
            data.todos = data.todos.filter { !$0.done }
            data.todoDone = 0
            data.todoTotal = data.todos.count
            if data.runningAnchor == nil {
                data.totalSec = 0
                data.goalPct = 0
                data.subjects = []
            }
        }
        return data
    }

    // 테마 색상 (darkMode는 앱 설정을 따름 — 안드로이드 위젯과 동일)
    var bg: Color { darkMode ? Color(hexString: "#1C1C1E") : Color.white }
    var textColor: Color { darkMode ? Color.white : Color(hexString: "#1A1A2E") }
    var subColor: Color { darkMode ? Color(hexString: "#9AA0A6") : Color(hexString: "#6B7280") }
}

// MARK: - 공용 Timeline Provider (3종 위젯이 동일 데이터 사용)

struct DataEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct DataProvider: TimelineProvider {
    func placeholder(in context: Context) -> DataEntry {
        DataEntry(date: Date(), data: WidgetData())
    }
    func getSnapshot(in context: Context, completion: @escaping (DataEntry) -> Void) {
        completion(DataEntry(date: Date(), data: WidgetData.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DataEntry>) -> Void) {
        let entry = DataEntry(date: Date(), data: WidgetData.load())
        // 앱이 데이터 변동 시 reloadWidget()으로 즉시 갱신하지만, 30분마다 보조 갱신.
        // 자정 직후엔 즉시 리로드해 '오늘' 리셋/D-Day 감소가 최대 30분 밀리지 않도록.
        let cal = Calendar.current
        let in30 = cal.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        var next = in30
        if let tomorrow = cal.date(byAdding: .day, value: 1, to: Date()) {
            let justPastMidnight = cal.startOfDay(for: tomorrow).addingTimeInterval(5)
            next = min(in30, justPastMidnight)
        }
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}
