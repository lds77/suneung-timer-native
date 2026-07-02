import WidgetKit
import SwiftUI

// 시험 D-Day 위젯 — 임박한 시험 카운트다운(대표 시험 우선)
struct DDayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DDayWidget", provider: DataProvider()) { entry in
            DDayView(entry: entry)
        }
        .configurationDisplayName("시험 D-Day")
        .description("시험까지 남은 날을 임박한 순으로 보여줘요.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct DDayView: View {
    @Environment(\.widgetFamily) var family
    let entry: DataEntry
    var d: WidgetData { entry.data }

    var body: some View {
        Group {
            if d.ddays.isEmpty {
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

    private var emptyBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("시험 D-Day")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(d.subColor)
            Spacer()
            Text("등록된 시험이 없어요")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(d.subColor)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var smallBody: some View {
        let dd = d.ddays[0]
        return VStack(alignment: .leading, spacing: 4) {
            Text("시험 D-Day")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(d.subColor)
            Spacer(minLength: 0)
            Text(ddayLabel(dd.n))
                .font(.system(size: 34, weight: .heavy))
                .foregroundColor(d.accent)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(dd.label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(d.textColor)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var listBody: some View {
        let limit = family == .systemLarge ? 6 : 3
        return VStack(alignment: .leading, spacing: 10) {
            Text("시험 D-Day")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(d.subColor)
            ForEach(d.ddays.prefix(limit)) { dd in
                HStack(spacing: 8) {
                    Circle()
                        .fill(dd.isPrimary ? d.accent : d.subColor.opacity(0.4))
                        .frame(width: 7, height: 7)
                    Text(dd.label)
                        .font(.system(size: 15, weight: dd.isPrimary ? .bold : .medium))
                        .foregroundColor(d.textColor)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(ddayLabel(dd.n))
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundColor(dd.isPrimary ? d.accent : d.textColor)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}
