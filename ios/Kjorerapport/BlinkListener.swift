import AVFoundation

/// Blinklyset (1.1.0): mikrofonen lytter etter korte klikk (reléet i blinklyset) mens et opptak pågår og appen er
/// synlig. Lyden analyseres her og forkastes med en gang: nettappen får bare tidspunktet og styrken på klikkene og
/// lydnivået én gang i sekundet, aldri lyd. Mønsteret (60–120 i minuttet) finnes i js/blink.js.
/// Klikk finnes i den lyse delen av lyden (over 2 kHz, der motor og veistøy er svakere): energien i 4 ms-biter mot en
/// bakgrunn som følger støyen. Appens egne pip (Beeper) teller ikke.
nonisolated final class BlinkListener: @unchecked Sendable {
    static let shared = BlinkListener()
    private let lock = NSLock()
    private var engine = AVAudioEngine()        // ny for hver start (1.1.1): en motor som har vært avbrutt, kan henge
    private var running = false
    private var wanted = false                  // lytt når appen er synlig (settes av start/want/stop)
    private var paused = false                  // appen er i bakgrunnen: ingen mikrofon der
    private var muteUntil = 0.0                 // egne pip: klikk før dette tidspunktet (s siden 1970) teller ikke
    private var pending: [[Double]] = []        // [tid ms siden 1970, styrke dB]
    private var lastSent = 0.0
    private var noiseDb = -120.0
    private var batchSink: (@Sendable (String) -> Void)?
    /// Kalles på hovedtråden omtrent to ganger i sekundet med JavaScript til nettappen. Leses og skrives under låsen
    /// (1.1.1): lydtråden leser den mens hovedtråden kan sette en ny.
    var onBatch: (@Sendable (String) -> Void)? {
        get { lock.lock(); defer { lock.unlock() }; return batchSink }
        set { lock.lock(); batchSink = newValue; lock.unlock() }
    }

    var isListening: Bool { lock.lock(); defer { lock.unlock() }; return running }

    private init() {
        // 1.1.1: en telefonsamtale, Siri eller ny lydrute stopper motoren. Før trodde appen at den fortsatt lyttet, og
        // mikrofonen var død resten av turen. Nå startes den på nytt når avbruddet er over.
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            if type == .began { self.halt() } else { self.restart() }
        }
        center.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main) { [weak self] _ in self?.restart() }
        center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in self?.restart() }
    }

    /// Egne pip (Beeper) skal ikke høres som klikk
    func mute(for seconds: Double) {
        lock.lock(); muteUntil = max(muteUntil, Date().timeIntervalSince1970 + seconds); lock.unlock()
    }

    static func authorize() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    /// Starter lyttingen. Svar: nil når den går, ellers en kort grunn («tilgang», «lydøkt», «mikrofon»)
    func start() -> String? {
        lock.lock(); wanted = true; paused = false; lock.unlock()
        return begin()
    }

    /// Lyttingen er ønsket, men appen er i bakgrunnen: den starter når appen er synlig igjen (resume)
    func want() { lock.lock(); wanted = true; paused = true; lock.unlock() }

    /// Slutter å lytte (turen er ferdig eller mikrofonen er slått av)
    func stop() {
        lock.lock(); wanted = false; lock.unlock()
        halt()
        // Lydøkten tilbake til bare avspilling, så andre apper ikke dempes av mikrofonen
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Appen gikk i bakgrunnen: lytt ikke, men husk at lyttingen er ønsket
    func pause() { lock.lock(); paused = true; lock.unlock(); halt() }

    /// Appen er synlig igjen: start igjen hvis lyttingen er ønsket
    @discardableResult func resume() -> String? {
        lock.lock(); paused = false; let w = wanted; lock.unlock()
        return w ? begin() : nil
    }

    /// Etter et avbrudd eller en ny lydrute: ny motor, men bare når appen er synlig og lyttingen ønsket
    private func restart() {
        halt()
        lock.lock(); let go = wanted && !paused; lock.unlock()
        if go { _ = begin() }
    }

    private func begin() -> String? {
        guard AVAudioApplication.shared.recordPermission == .granted else { return "tilgang" }
        if isListening { return nil }
        let session = AVAudioSession.sharedInstance()
        do {
            // Høyttaleren som før (pipene), og musikk fra andre apper fortsetter. Vanlig modus: «measurement» kan gjøre
            // pipene svakere, og de er viktigere enn klikkene
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch { return "lydøkt" }
        let fresh = AVAudioEngine()
        let input = fresh.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { return "mikrofon" }
        let detector = ClickDetector(rate: format.sampleRate)
        // Tidspunktet for lyden: maskinklokka (hostTime) gjøres om til vanlig klokke én gang
        let offset = Date().timeIntervalSince1970 - AVAudioTime.seconds(forHostTime: mach_absolute_time())
        input.installTap(onBus: 0, bufferSize: 2048, format: format, block: Self.tapBlock(detector: detector, offset: offset, owner: self))
        do { try fresh.start() } catch { input.removeTap(onBus: 0); return "mikrofon" }
        lock.lock(); engine = fresh; running = true; pending.removeAll(); lastSent = Date().timeIntervalSince1970; lock.unlock()
        return nil
    }

    private func halt() {
        lock.lock(); let was = running; running = false; pending.removeAll(); let e = engine; lock.unlock()
        guard was else { return }
        e.inputNode.removeTap(onBus: 0)
        e.stop()
    }

    /// Blokken lages utenfor hovedtråden-isolasjonen: den kalles på lydtråden
    private static func tapBlock(detector: ClickDetector, offset: Double, owner: BlinkListener) -> AVAudioNodeTapBlock {
        return { buffer, time in
            guard let data = buffer.floatChannelData?[0] else { return }
            let start = time.isHostTimeValid ? AVAudioTime.seconds(forHostTime: time.hostTime) + offset : Date().timeIntervalSince1970
            let clicks = detector.feed(data, count: Int(buffer.frameLength), start: start)
            owner.take(clicks, noiseDb: detector.noiseDb)
        }
    }

    private func take(_ clicks: [(Double, Double)], noiseDb: Double) {
        lock.lock()
        for c in clicks where c.0 >= muteUntil { pending.append([(c.0 * 1000).rounded(), (c.1 * 10).rounded() / 10]) }
        self.noiseDb = noiseDb
        let now = Date().timeIntervalSince1970
        guard now - lastSent >= 0.5 else { lock.unlock(); return }
        lastSent = now
        let batch = pending; pending.removeAll()
        let db = (noiseDb * 10).rounded() / 10
        lock.unlock()
        guard let json = try? JSONSerialization.data(withJSONObject: ["c": batch, "db": db, "ts": (now * 1000).rounded()]) else { return }
        let js = "window.__kjAudio && window.__kjAudio(\(String(decoding: json, as: UTF8.self)))"
        let send = onBatch   // under låsen (se onBatch)
        DispatchQueue.main.async { send?(js) }
    }
}

/// Finner korte klikk: energien over 2 kHz i biter på 4 ms, mot en bakgrunn som følger støyen sakte opp og raskere ned.
/// Et klikk er minst 9 dB over bakgrunnen og stigende, med minst 50 ms til neste.
nonisolated final class ClickDetector: @unchecked Sendable {
    private let rate: Double
    private let frame: Int
    // Høypassfilter (andre orden, 2 kHz)
    private var b0 = 0.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    private var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0
    private var acc = 0.0, count = 0, frameIndex = 0
    private var background = 1e-9, previous = 0.0, lastClick = -1.0
    private(set) var noiseDb = -120.0

    init(rate: Double) {
        self.rate = rate
        frame = max(64, Int(rate * 0.004))
        let w0 = 2 * Double.pi * 2000 / rate, alpha = sin(w0) / (2 * 0.707), c = cos(w0), a0 = 1 + alpha
        b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = (1 + c) / 2 / a0; a1 = -2 * c / a0; a2 = (1 - alpha) / a0
    }

    /// samples: én kanal. start: tiden (s siden 1970) for første prøve. → [(tid s, styrke dB)]
    func feed(_ samples: UnsafePointer<Float>, count n: Int, start: Double) -> [(Double, Double)] {
        var out: [(Double, Double)] = []
        for i in 0..<n {
            let x = Double(samples[i])
            let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            acc += y * y; count += 1
            guard count >= frame else { continue }
            let e = acc / Double(count)
            acc = 0; count = 0; frameIndex += 1
            let t = start + Double(i) / rate
            let ratio = e / max(background, 1e-12)
            if ratio > 8, e > previous * 2.5, e > 1e-8, t - lastClick > 0.05 {
                out.append((t, 10 * log10(ratio)))
                lastClick = t
            }
            // Bakgrunnen: sakte opp (et klikk flytter den lite), raskere ned
            background += (e - background) * (e > background ? 0.004 : 0.05)
            previous = e
            noiseDb = 10 * log10(max(background, 1e-12))
        }
        return out
    }
}
