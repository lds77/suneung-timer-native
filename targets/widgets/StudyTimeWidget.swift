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
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct StudyTimeView: View {
    @Environment(\.widgetFamily) var family
    let entry: DataEntry
    var d: WidgetData { entry.data }

    var body: some View {
        Group {
            if family == .systemMedium {
                mediumBody
            } else {
                smallBody
            }
        }
        .containerBackground(d.bg, for: .widget)
        .widgetURL(URL(string: "yeolgong://open"))
    }

    // 시간 + 목표 (소형/중형 좌측 공통). 연속일 표기는 소형만(중형은 우측 요약에 있음)
    private func summaryColumn(showStreak: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("오늘 공부")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(d.subColor)
            Spacer(minLength: 0)
            Text(formatShort(d.totalSec))
                .font(.system(size: 30, weight: .heavy))
                .foregroundColor(d.textColor)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
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
