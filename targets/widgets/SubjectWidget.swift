import WidgetKit
import SwiftUI

// 과목 바로 시작 위젯 — 즐겨찾는 과목을 눌러 바로 타이머 시작 (딥링크 yeolgong://start?subjectId=)
struct SubjectWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SubjectWidget", provider: DataProvider()) { entry in
            SubjectView(entry: entry)
        }
        .configurationDisplayName("과목 바로 시작")
        .description("즐겨찾는 과목을 눌러 바로 타이머를 시작해요.")
        // 소형은 탭 영역이 하나뿐이라 과목별 실행이 불가 → 중형/대형만 지원
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct SubjectView: View {
    @Environment(\.widgetFamily) var family
    let entry: DataEntry
    var d: WidgetData { entry.data }

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        Group {
            if d.launcher.isEmpty {
                emptyBody
            } else {
                gridBody
            }
        }
        .containerBackground(d.bg, for: .widget)
    }

    private var emptyBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("과목 바로 시작")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(d.subColor)
            Spacer()
            Text("과목을 추가하면 여기서 바로 시작할 수 있어요")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(d.subColor)
                .lineLimit(3)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "yeolgong://open"))
    }

    private var gridBody: some View {
        let limit = family == .systemLarge ? 6 : 4
        return VStack(alignment: .leading, spacing: 8) {
            Text("과목 바로 시작")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(d.subColor)
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(d.launcher.prefix(limit)) { s in
                    Link(destination: subjectURL(s.id)) {
                        HStack(spacing: 6) {
                            Circle().fill(s.color).frame(width: 9, height: 9)
                            Text(s.name)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(d.textColor)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(s.color.opacity(d.darkMode ? 0.22 : 0.12))
                        )
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func subjectURL(_ id: String) -> URL {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        return URL(string: "yeolgong://start?subjectId=\(encoded)") ?? URL(string: "yeolgong://open")!
    }
}
