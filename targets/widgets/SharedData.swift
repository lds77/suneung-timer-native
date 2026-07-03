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

        // 자정 경과 보정: 스냅샷 기준일이 오늘이 아니면 '오늘' 통계는 0부터 다시
        // (앱이 꺼져 있으면 스냅샷이 갱신되지 않으므로 위젯 쪽에서 리셋)
        let snapshotDate = strVal(obj["date"])
        if !snapshotDate.isEmpty && snapshotDate != localDateStr() {
            data.totalSec = 0
            data.goalPct = 0
            data.subjects = []
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
