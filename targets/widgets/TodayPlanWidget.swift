import WidgetKit
import SwiftUI

// 오늘 계획 위젯 — 플래너의 오늘 계획 블록 + 달성률. 항목 탭 → 그 계획으로 타이머 바로 시작.
// 소형: 다음 할 계획 1개 크게. 중형: 3개 목록. 대형: 6개 목록.
struct TodayPlanWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayPlanWidget", provider: DataProvider()) { entry in
            TodayPlanView(entry: entry)
        }
        .configurationDisplayName("오늘 계획")
        .description("플래너의 오늘 계획과 달성률을 보여주고, 눌러서 바로 시작해요.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct TodayPlanView: View {
    @Environment(\.widgetFamily) var family
    let entry: DataEntry
    var d: WidgetData { entry.data }

    var body: some View {
        Group {
            if d.plans.isEmpty {
                emptyBody
            } else if family == .systemSmall {
                smallBody
            } else {
                listBody
            }
        }
        .containerBackground(d.bg, for: .widget)
    }

    // 계획 없음 — 플래너로 유도
    private var emptyBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            Spacer()
            Text("플래너에서 오늘 계획을\n세워보세요")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(d.subColor)
                .lineLimit(3)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "yeolgong://open"))
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text("오늘 계획")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(d.subColor)
            Spacer(minLength: 0)
            if d.planPct >= 0 {
                Text("\(d.planPct)%")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(d.planPct >= 100 ? Color(hexString: "#E6B800") : d.accent)
            }
        }
    }

    // 다음(아직 안 끝난) 계획, 없으면 첫 계획
    private var nextPlan: PlanItem {
        d.plans.first(where: { !$0.done }) ?? d.plans[0]
    }

    // 소형: 다음 계획 하나 크게 + 전체 달성률 바 (탭 → 그 계획 시작)
    private var smallBody: some View {
        let p = nextPlan
        let allDone = !d.plans.contains(where: { !$0.done })
        return VStack(alignment: .leading, spacing: 6) {
            header
            Spacer(minLength: 0)
            if allDone {
                Text("오늘 계획 완료!")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundColor(d.textColor)
            } else {
                Text("다음 할 일")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(d.subColor)
                // 색 틴트 박스 + 재생 아이콘 → 탭하면 바로 시작한다는 어포던스
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Circle().fill(p.color ?? d.accent).frame(width: 9, height: 9)
                        Text(p.label)
                            .font(.system(size: 16, weight: .heavy))
                            .foregroundColor(d.textColor)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    HStack(spacing: 4) {
                        Text(planTimeText(p))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(d.accent)
                        Image(systemName: "play.fill")
                            .font(.system(size: 9))
                            .foregroundColor(d.accent)
                    }
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill((p.color ?? d.accent).opacity(d.darkMode ? 0.22 : 0.12))
                )
            }
            if d.planPct >= 0 {
                ProgressView(value: min(1.0, Double(d.planPct) / 100.0))
                    .tint(d.accent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(planURL(allDone ? nil : p.id))
    }

    // 중형/대형: 계획 목록 (탭 → 해당 계획 시작)
    // 과목바로시작 위젯과 동일한 색 틴트 박스 + 재생 아이콘 → '눌러서 실행' 어포던스
    private var listBody: some View {
        let limit = family == .systemLarge ? 6 : 3
        return VStack(alignment: .leading, spacing: 6) {
            header
            ForEach(d.plans.prefix(limit)) { p in
                Link(destination: planURL(p.id) ?? URL(string: "yeolgong://open")!) {
                    HStack(spacing: 8) {
                        if p.done {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(Color(hexString: "#4CAF50"))
                        } else {
                            Circle().fill(p.color ?? d.accent).frame(width: 9, height: 9)
                                .padding(.horizontal, 2.5)
                        }
                        Text(p.label)
                            .font(.system(size: 14, weight: p.done ? .medium : .semibold))
                            .foregroundColor(p.done ? d.subColor : d.textColor)
                            .strikethrough(p.done, color: d.subColor)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Text(p.done ? "완료" : planTimeText(p))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(p.done ? d.subColor : d.accent)
                        if !p.done {
                            Image(systemName: "play.fill")
                                .font(.system(size: 9))
                                .foregroundColor(d.accent)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(p.done
                                  ? d.subColor.opacity(d.darkMode ? 0.12 : 0.07)
                                  : (p.color ?? d.accent).opacity(d.darkMode ? 0.22 : 0.12))
                    )
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // "45분" / 진행 중이면 "20/45분" (집중탭 계획 카드와 동일 표기)
    private func planTimeText(_ p: PlanItem) -> String {
        if p.doneSec > 0 { return "\(p.doneSec / 60)/\(p.targetMin)분" }
        return "\(p.targetMin)분"
    }

    private func planURL(_ id: String?) -> URL? {
        guard let id = id else { return URL(string: "yeolgong://open") }
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        return URL(string: "yeolgong://start?planId=\(encoded)") ?? URL(string: "yeolgong://open")
    }
}
