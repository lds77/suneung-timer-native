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
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular])
    }
}

struct DDayView: View {
    @Environment(\.widgetFamily) var family
    let entry: DataEntry
    var d: WidgetData { entry.data }

    private var isAccessory: Bool {
        family == .accessoryCircular || family == .accessoryRectangular
    }

    var body: some View {
        Group {
            if family == .accessoryCircular {
                circularBody
            } else if family == .accessoryRectangular {
                rectangularBody
            } else if d.ddays.isEmpty {
                emptyBody
            } else if family == .systemSmall {
                smallBody
            } else {
                listBody
            }
        }
        // 잠금화면(accessory)은 시스템이 배경/색을 그리므로 투명 + 시스템 전경색 사용
        .containerBackground(isAccessory ? Color.clear : d.bg, for: .widget)
        .widgetURL(URL(string: "yeolgong://open?tab=planner&view=monthly")) // 탭 → 플래너 월간(시험 관리)
    }

    // 잠금화면 원형: 대표 시험 이름(축약) + D-숫자
    private var circularBody: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let dd = d.ddays.first {
                VStack(spacing: 0) {
                    Text(dd.label)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(ddayLabel(dd.n))
                        .font(.system(size: 16, weight: .heavy))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
                .padding(.horizontal, 3)
            } else {
                Image(systemName: "calendar")
                    .font(.system(size: 16))
            }
        }
    }

    // 잠금화면 직사각형: 대표 시험 D-Day + 오늘 공부시간 한 줄 (핵심 동기 2개 결합)
    // 밝은 배경화면에서 글자가 묻히지 않도록 시스템 블러 배경(AccessoryWidgetBackground)을 깐다
    private var rectangularBody: some View {
        ZStack {
            AccessoryWidgetBackground()
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 1) {
                if let dd = d.ddays.first {
                    Text(dd.label)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(ddayLabel(dd.n))
                        .font(.system(size: 20, weight: .heavy))
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                    Group {
                        if let anchor = d.runningAnchor {
                            // 공부 중이면 초 단위 실시간 카운팅 (OS가 직접 그림).
                            // 종료 시각을 알면 그 시각에 자동 정지 (완료 후 과카운팅 방지)
                            if #available(iOS 16.0, *), let end = d.runningEnd {
                                Text("오늘 공부 ") + Text(timerInterval: anchor...end, countsDown: false)
                            } else {
                                Text("오늘 공부 ") + Text(anchor, style: .timer)
                            }
                        } else {
                            Text("오늘 공부 \(formatShort(d.totalSec))")
                        }
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                } else {
                    Text("시험 D-Day")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text("등록된 시험이 없어요")
                        .font(.system(size: 13, weight: .medium))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
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
