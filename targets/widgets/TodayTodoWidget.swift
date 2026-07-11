import WidgetKit
import SwiftUI

// 오늘 할 일 위젯 — 앱 오늘 탭과 같은 목록(My Day 판정, JS getWidgetData가 계산).
// iOS는 보기 전용: 탭하면 앱 집중탭으로 이동해 체크 (안드로이드는 위젯에서 바로 체크).
// 소형: 완료 카운트 + 다음 할 일. 중형/대형: 목록 (완료는 뒤, 흐리게).
struct TodayTodoWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayTodoWidget", provider: DataProvider()) { entry in
            TodayTodoView(entry: entry)
        }
        .configurationDisplayName("오늘 할 일")
        .description("오늘 할 일과 완료 현황을 보여줘요.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct TodayTodoView: View {
    @Environment(\.widgetFamily) var family
    let entry: DataEntry
    var d: WidgetData { entry.data }

    private var allDone: Bool { d.todoTotal > 0 && d.todoDone == d.todoTotal }

    var body: some View {
        Group {
            if d.todos.isEmpty {
                emptyBody
            } else if family == .systemSmall {
                smallBody
            } else {
                listBody
            }
        }
        .containerBackground(d.bg, for: .widget)
        .widgetURL(URL(string: "yeolgong://open"))
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text("오늘 할 일")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(d.subColor)
            Spacer(minLength: 0)
            if d.todoTotal > 0 {
                Text("\(d.todoDone)/\(d.todoTotal)")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(allDone ? Color(hexString: "#E6B800") : d.accent)
            }
        }
    }

    // 할 일 없음 — 앱으로 유도
    private var emptyBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            Spacer()
            Text("오늘 할 일을\n추가해보세요")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(d.subColor)
                .lineLimit(3)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // 소형: 완료 카운트 + 다음 할 일 하나
    private var smallBody: some View {
        let next = d.todos.first(where: { !$0.done })
        return VStack(alignment: .leading, spacing: 6) {
            header
            Spacer(minLength: 0)
            if allDone || next == nil {
                Text("오늘 할 일 완료!")
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundColor(d.textColor)
                    .lineLimit(2)
            } else if let t = next {
                Text("다음 할 일")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(d.subColor)
                HStack(spacing: 6) {
                    if let c = t.color {
                        Circle().fill(c).frame(width: 8, height: 8)
                    }
                    Text(t.text)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundColor(d.textColor)
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill((t.color ?? d.accent).opacity(d.darkMode ? 0.22 : 0.12))
                )
            }
            if d.todoTotal > 0 {
                ProgressView(value: min(1.0, Double(d.todoDone) / Double(max(1, d.todoTotal))))
                    .tint(allDone ? Color(hexString: "#E6B800") : d.accent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // 중형/대형: 할 일 목록 (JS가 이미 미완료 먼저 정렬해 전달)
    private var listBody: some View {
        let rows = family == .systemMedium ? 3 : 7
        return VStack(alignment: .leading, spacing: 5) {
            header
            ForEach(d.todos.prefix(rows)) { t in
                HStack(spacing: 8) {
                    Image(systemName: t.done ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 14))
                        .foregroundColor(t.done ? Color(hexString: "#4CAF50") : d.subColor)
                    if let c = t.color, !t.done {
                        Circle().fill(c).frame(width: 7, height: 7)
                    }
                    Text(t.text)
                        .font(.system(size: 13, weight: t.done ? .medium : .semibold))
                        .foregroundColor(t.done ? d.subColor : d.textColor)
                        .strikethrough(t.done, color: d.subColor)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 9)
                        .fill(t.done
                              ? d.subColor.opacity(d.darkMode ? 0.10 : 0.06)
                              : d.subColor.opacity(d.darkMode ? 0.16 : 0.09))
                )
            }
            if d.todos.count > rows {
                Text("+\(d.todos.count - rows)개 더")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(d.subColor)
                    .padding(.leading, 3)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}
