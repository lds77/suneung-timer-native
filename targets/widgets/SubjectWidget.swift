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
        // 중형(4x2)도 6과목 (2열 x 3행) — 칩 높이/간격을 컴팩트하게 줄여 3행 확보
        let compact = family != .systemLarge
        let gap: CGFloat = compact ? 6 : 8
        let columns = [GridItem(.flexible(), spacing: gap), GridItem(.flexible(), spacing: gap)]
        return VStack(alignment: .leading, spacing: gap) {
            HStack(spacing: 6) {
                Text("과목 바로 시작")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(d.subColor)
                Spacer(minLength: 4)
                // 칩 우측 숫자가 무엇인지 안내
                Text("이번 주 공부량")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(d.subColor.opacity(0.8))
            }
            LazyVGrid(columns: columns, spacing: gap) {
                ForEach(d.launcher.prefix(6)) { s in
                    // 이번 주 공부시간 표시 — 0이면 흐리게(방치 신호), 안드로이드 위젯과 동일
                    let studied = s.weekSec > 0
                    Link(destination: subjectURL(s.id)) {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(studied ? s.color : d.subColor.opacity(0.35))
                                .frame(width: 9, height: 9)
                            Text(s.name)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(studied ? d.textColor : d.subColor)
                                .lineLimit(1)
                            Spacer(minLength: 4)
                            Text(formatShort(s.weekSec))
                                .font(.system(size: 12, weight: studied ? .bold : .medium))
                                .foregroundColor(studied ? d.accent : d.subColor.opacity(0.6))
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, compact ? 6 : 10)
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
