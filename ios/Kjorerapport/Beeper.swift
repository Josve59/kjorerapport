import AVFoundation

/// Pip fra iPhone-appen (0.12.2). Nettappens Web Audio ble dempet av WebKit (lydløs-bryteren og «ambient»-lydøkten),
/// så lyden kom ikke fram. Her lages tonene i appen og spilles som varsler i navigasjonsapper: de høres med
/// lydløs-bryteren på, demper musikk et øyeblikk, og slipper lyden etterpå.
@MainActor
final class Beeper {
    static let shared = Beeper()
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    private var releaseTask: Task<Void, Never>?

    private init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    /// tones: [[frekvens Hz, start s, lengde s]], volume 0–1
    func play(_ tones: [[Double]], volume: Double) {
        let valid = tones.filter { $0.count == 3 && $0[0] > 0 && $0[2] > 0 }
        guard !valid.isEmpty else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
            try session.setActive(true)
            if !engine.isRunning { try engine.start() }
        } catch { return }
        let rate = format.sampleRate
        let end = valid.map { $0[1] + $0[2] }.max() ?? 0
        let frames = AVAudioFrameCount((end + 0.05) * rate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames), let data = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = frames
        for i in 0..<Int(frames) { data[i] = 0 }
        let amp = Float(max(0, min(1, volume)))
        for tone in valid {
            let (f, at, len) = (tone[0], tone[1], tone[2])
            let start = Int(at * rate), count = Int(len * rate), ramp = Int(0.012 * rate)
            for k in 0..<count where start + k < Int(frames) {
                // Myk start og slutt, så det ikke klikker
                let env = Float(min(1, Double(min(k, count - k)) / Double(max(1, ramp))))
                data[start + k] += amp * env * Float(sin(2 * Double.pi * f * Double(k) / rate))
            }
        }
        player.scheduleBuffer(buffer, at: nil, options: [])
        if !player.isPlaying { player.play() }
        releaseTask?.cancel()
        releaseTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64((end + 0.5) * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.player.stop()
            self.engine.stop()
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
