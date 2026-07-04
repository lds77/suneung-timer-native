import WidgetKit
import SwiftUI

// 오늘 공부시간 위젯 — 오늘 누적 시간 + 목표 달성률 + 연속일
struct StudyTimeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StudyTimeWidget", provider: DataProvider()) { entry in
            StudyTimeView(entry: entry)
        }
        .configurationDisplayName("오늘 공부시간")
        .description("오늘 공부한 시간과 목표 달성률을 보여줘요.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

struct StudyTimeView: View {
    @Environment(\.widgetFamily) var family
    let entry: DataEntry
    var d: WidgetData { entry.data }

    private var isAccessory: Bool {
        family == .accessoryCircular || family == .accessoryRectangular
    }

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular: circularBody
            case .accessoryRectangular: rectangularBody
            case .systemMedium: mediumBody
            default: smallBody
            }
        }
        // 잠금화면(accessory)은 시스템이 배경/색을 그리므로 투명 + 시스템 전경색 사용
        .containerBackground(isAccessory ? Color.clear : d.bg, for: .widget)
        .widgetURL(URL(string: "yeolgong://open"))
    }

    // 잠금화면 원형: 목표 달성률 링 + 오늘 시간 (목표 없으면 시간만)
    private var circularBody: some View {
        Group {
            if d.goalSec > 0 {
                Gauge(value: Double(min(max(d.goalPct, 0), 100)), in: 0...100) {
                    Image(systemName: "book.fill")
                } currentValueLabel: {
                    Text(formatTiny(d.totalSec))
                        .font(.system(size: 14, weight: .heavy))
                        .minimumScaleFactor(0.6)
                }
                .gaugeStyle(.accessoryCircularCapacity)
            } else {
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 1) {
                        Image(systemName: "book.fill")
                            .font(.system(size: 10))
                        Text(formatTiny(d.totalSec))
                            .font(.system(size: 14, weight: .heavy))
                            .minimumScaleFactor(0.6)
                    }
                }
            }
        }
    }

    // 잠금화면 직사각형: 오늘 공부 시간 + 목표/연속 한 줄
    // 밝은 배경화면에서 글자가 묻히지 않도록 시스템 블러 배경(AccessoryWidgetBackground)을 깐다
    private var rectangularBody: some View {
        ZStack {
            AccessoryWidgetBackground()
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Image(systemName: "book.fill")
                        .font(.system(size: 10))
                    Text("오늘 공부")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundStyle(.secondary)
                todayTimeText(size: 20, color: .primary)
                if d.goalSec > 0 || d.streak > 0 {
                    Text(rectangularSubline)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }

    private var rectangularSubline: String {
        var parts: [String] = []
        if d.goalSec > 0 { parts.append("목표 \(d.goalPct)%") }
        if d.streak > 0 { parts.append("\(d.streak)일 연속") }
        return parts.joined(separator: " · ")
    }

    // 오늘 누적 시간 — 타이머 실행 중이면 OS가 초 단위로 직접 그리는 실시간 카운팅
    // (Text(_:style:.timer)는 타임라인 갱신 없이도 계속 올라간다)
    @ViewBuilder
    private func todayTimeText(size: CGFloat, color: Color) -> some View {
        if let anchor = d.runningAnchor {
            Text(anchor, style: .timer)
                .font(.system(size: size, weight: .heavy))
                .monospacedDigit()
                .foregroundColor(color)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
        } else {
            Text(formatShort(d.totalSec))
                .font(.system(size: size, weight: .heavy))
                .foregroundColor(color)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
    }

    // 시간 + 목표 (소형/중형 좌측 공통). 연속일 표기는 소형만(중형은 우측 요약에 있음)
    private func summaryColumn(showStreak: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text("오늘 공부")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(d.subColor)
                if d.runningAnchor != nil {
                    Circle().fill(d.accent).frame(width: 6, height: 6) // 집중 중 표시
                }
            }
            Spacer(minLength: 0)
            todayTimeText(size: 30, color: d.textColor)
            if d.goalSec > 0 {
                ProgressView(value: min(1.0, Double(d.totalSec) / Double(max(1, d.goalSec))))
                    .tint(d.accent)
                    .scaleEffect(x: 1, y: 1.1, anchor: .center)
                Text("목표 \(d.goalPct)%")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(d.subColor)
            }
            if showStreak && d.streak > 0 {
                HStack(spacing: 3) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 11))
                        .foregroundColor(d.accent)
                    Text("\(d.streak)일 연속")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(d.subColor)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var smallBody: some View {
        summaryColumn(showStreak: true)
    }

    // 주간 요약 한 줄 (라벨 + 값) — 안드로이드 2x2와 동일 구성
    private func statRow(_ label: String, _ value: String, valueColor: Color) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(d.subColor)
            Spacer(minLength: 4)
            Text(value)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(valueColor)
        }
    }

    private var mediumBody: some View {
        HStack(alignment: .top, spacing: 16) {
            summaryColumn(showStreak: false)
            VStack(alignment: .leading, spacing: 8) {
                Text("이번 주")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(d.subColor)
                Spacer(minLength: 0)
                statRow("누적", formatShort(d.weekTotalSec), valueColor: d.textColor)
                statRow("하루 평균", formatShort(d.weekAvgSec), valueColor: d.textColor)
                if d.streak > 0 {
                    statRow("연속", "\(d.streak)일째", valueColor: d.accent)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}
