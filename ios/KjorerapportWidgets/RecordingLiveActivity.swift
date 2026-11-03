import ActivityKit
import SwiftUI
import WidgetKit

@main
struct KjorerapportWidgets: WidgetBundle {
    var body: some Widget {
        RecordingLiveActivity()
    }
}

/// Viser at et opptak pågår, hvor lenge og hvor langt, så ledsageren ser det med låst skjerm.
/// Ingen fartsgrense her: den hentes i appen og kan være utdatert når appen er i bakgrunnen.
struct RecordingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RecordingAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color(red: 0.13, green: 0.15, blue: 0.17))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    StatusLabel(context: context)
                        .font(.headline)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ElapsedText(context: context)
                        .font(.title2.weight(.bold))
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(distanceText(context.state.distanceM))
                            .font(.title3.weight(.semibold))
                        Spacer()
                        Text(hint(context))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                RecordDot(finished: context.state.finishedDuration != nil)
            } compactTrailing: {
                ElapsedText(context: context)
                    .font(.footnote.weight(.semibold))
                    .frame(maxWidth: 52)
            } minimal: {
                RecordDot(finished: context.state.finishedDuration != nil)
            }
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<RecordingAttributes>

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                StatusLabel(context: context)
                    .font(.headline)
                Text(hint(context))
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.75))
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                ElapsedText(context: context)
                    .font(.title.weight(.bold))
                Text(distanceText(context.state.distanceM))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
        .foregroundStyle(.white)
        .padding(16)
    }
}

private struct StatusLabel: View {
    let context: ActivityViewContext<RecordingAttributes>

    var body: some View {
        let finished = context.state.finishedDuration != nil
        Label {
            Text(finished ? "Turen er lagret" : "Opptak pågår")
        } icon: {
            RecordDot(finished: finished)
        }
    }
}

private struct ElapsedText: View {
    let context: ActivityViewContext<RecordingAttributes>

    var body: some View {
        Group {
            if let seconds = context.state.finishedDuration {
                Text(Duration.seconds(seconds), format: .time(pattern: seconds >= 3600 ? .hourMinuteSecond : .minuteSecond))
            } else {
                Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
            }
        }
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
    }
}

private struct RecordDot: View {
    let finished: Bool

    var body: some View {
        Image(systemName: finished ? "checkmark.circle.fill" : "record.circle.fill")
            .foregroundStyle(finished ? .green : .red)
            .accessibilityLabel(finished ? "Turen er lagret" : "Opptak pågår")
    }
}

private func hint(_ context: ActivityViewContext<RecordingAttributes>) -> String {
    if context.state.finishedDuration != nil { return "Rapporten ligger i appen" }
    if context.isStale { return "Åpne appen for å se opptaket" }
    return "Ledsageren stopper i appen"
}

private func distanceText(_ meters: Double) -> String {
    let km = Measurement(value: meters / 1000, unit: UnitLength.kilometers)
    return km.formatted(.measurement(width: .abbreviated, usage: .asProvided, numberFormatStyle: .number.precision(.fractionLength(1))))
}
