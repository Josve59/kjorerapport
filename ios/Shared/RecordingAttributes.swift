import ActivityKit
import Foundation

/// Live Activity for et opptak: på låseskjermen og i Dynamic Island mens turen tas opp.
/// Brukes av både appen (starter, oppdaterer og avslutter) og widget-utvidelsen (tegner).
nonisolated struct RecordingAttributes: ActivityAttributes {
    nonisolated struct ContentState: Codable, Hashable {
        var distanceM: Double
        /// Satt når opptaket er stoppet: turens lengde i sekunder
        var finishedDuration: Double?
    }

    var startedAt: Date
}
