import AVFoundation
import CoreImage
import QuartzCore

/// Begge kameraene samtidig (AVCaptureMultiCamSession, iPhone XS og nyere): førerkameraet (frontkameraet) og
/// veikameraet (bakkameraet). Nettappen henter siste bilde fra hvert kamera som JPEG fra den lokale serveren
/// (/cam/user.jpg og /cam/environment.jpg), og bilgjenkjenningen (RoadDetector) får veibildene direkte.
/// Bildene er stående, som fra nettleseren, og førerkameraet er ikke speilvendt. Ingen bilder lagres.
nonisolated final class CameraHub: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    static let shared = CameraHub()

    enum Facing: String, CaseIterable, Sendable { case user, environment }

    struct Frame: @unchecked Sendable {
        let buffer: CVPixelBuffer
        let time: CFTimeInterval   // samme klokke som CACurrentMediaTime()
        let seq: Int
        var width: Int { CVPixelBufferGetWidth(buffer) }
        var height: Int { CVPixelBufferGetHeight(buffer) }
    }

    struct Started: Sendable {
        let active: [Facing]
        let multi: Bool
        let error: String?
    }

    static var multiSupported: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return AVCaptureMultiCamSession.isMultiCamSupported
        #endif
    }

    /// Kalles for hvert nytt bilde fra veikameraet (på kameraets egen kø)
    var onRoadFrame: (@Sendable (Frame) -> Void)?

    private let setupQueue = DispatchQueue(label: "kjorerapport.camera")
    private let frameQueue = DispatchQueue(label: "kjorerapport.camera.frames", qos: .userInitiated)
    private let lock = NSLock()
    private var session: AVCaptureSession?
    private var facingOf: [ObjectIdentifier: Facing] = [:]
    private var latest: [Facing: Frame] = [:]
    private var seq = 0
    private(set) var active: [Facing] = []
    // Ingen fargestyring: JPEG-bildene skal ha de samme verdiene som kameraet gir
    private let ci = CIContext(options: [.workingColorSpace: NSNull(), .cacheIntermediates: false])
    private let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

    // Bildestørrelse fra kameraet (liggende, før bildet roteres til stående) og bilder i sekundet
    private static let size: [Facing: (Int32, Int32)] = [.user: (640, 480), .environment: (1280, 720)]
    private static let fps: Int32 = 15

    // MARK: Start og stopp

    func start(_ wanted: [Facing]) async -> Started {
        let wanted = Facing.allCases.filter { wanted.contains($0) }
        guard !wanted.isEmpty else { return Started(active: [], multi: false, error: "ingen kamera valgt") }
        #if !targetEnvironment(simulator)
        if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
            _ = await AVCaptureDevice.requestAccess(for: .video)
        }
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            return Started(active: [], multi: false, error: "nei")
        }
        #endif
        return await withCheckedContinuation { done in
            setupQueue.async {
                if Set(self.active) == Set(wanted), self.session?.isRunning == true || self.simTimer != nil {
                    done.resume(returning: Started(active: self.active, multi: self.active.count > 1, error: nil))
                    return
                }
                self.stopNow()
                done.resume(returning: self.configure(wanted))
            }
        }
    }

    /// Starter økten igjen hvis den har stoppet (kalles ved feil og når et avbrudd er over)
    private func resume() {
        setupQueue.asyncAfter(deadline: .now() + 1) { [self] in
            if let s = session, !s.isRunning { s.startRunning() }
        }
    }

    func stop() {
        setupQueue.async { self.stopNow() }
    }

    // Hvorfor kameraene sist stoppet av seg selv (0.13.8). Leses og nullstilles når nettappen starter dem igjen
    private var lastStop: String?
    private func noteStop(_ why: String) { lock.lock(); lastStop = why; lock.unlock() }
    func takeLastStop() -> String? { lock.lock(); defer { lock.unlock() }; let s = lastStop; lastStop = nil; return s }

    private func stopNow() {
        session?.stopRunning()
        session = nil
        #if targetEnvironment(simulator)
        simTimer?.cancel()
        simTimer = nil
        #endif
        lock.lock()
        latest.removeAll()
        facingOf.removeAll()
        active = []
        lock.unlock()
    }

    private func configure(_ wanted: [Facing]) -> Started {
        #if targetEnvironment(simulator)
        return startSimulated(wanted)
        #else
        let multi = wanted.count > 1 && AVCaptureMultiCamSession.isMultiCamSupported
        let use = multi ? wanted : [wanted[0]]
        let s: AVCaptureSession = multi ? AVCaptureMultiCamSession() : AVCaptureSession()
        s.beginConfiguration()
        if !multi { s.sessionPreset = .inputPriority }
        var got: [Facing] = []
        var map: [ObjectIdentifier: Facing] = [:]
        for f in use {
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: f == .user ? .front : .back),
                  let input = try? AVCaptureDeviceInput(device: device) else { continue }
            Self.chooseFormat(device, size: Self.size[f]!, multi: multi)
            let out = AVCaptureVideoDataOutput()
            out.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            out.alwaysDiscardsLateVideoFrames = true
            out.setSampleBufferDelegate(self, queue: frameQueue)
            let connection: AVCaptureConnection?
            if multi {
                guard s.canAddInput(input), s.canAddOutput(out) else { continue }
                s.addInputWithNoConnections(input)
                s.addOutputWithNoConnections(out)
                guard let port = input.ports(for: .video, sourceDeviceType: device.deviceType, sourceDevicePosition: device.position).first else { continue }
                let c = AVCaptureConnection(inputPorts: [port], output: out)
                guard s.canAddConnection(c) else { continue }
                s.addConnection(c)
                connection = c
            } else {
                guard s.canAddInput(input), s.canAddOutput(out) else { continue }
                s.addInput(input)
                s.addOutput(out)
                connection = out.connection(with: .video)
            }
            if let c = connection {
                if c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }   // stående
                if f == .user, c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = false }
            }
            map[ObjectIdentifier(out)] = f
            got.append(f)
        }
        s.commitConfiguration()
        if let m = s as? AVCaptureMultiCamSession, m.hardwareCost > 1 {
            return Started(active: [], multi: false, error: "kameraene krever for mye av telefonen samtidig")
        }
        guard !got.isEmpty else { return Started(active: [], multi: false, error: "fant ikke kameraet") }
        lock.lock()
        facingOf = map
        active = got
        lock.unlock()
        session = s
        // Stopper kameraene av seg selv (for varm telefon, en annen app tok kameraet), startes de igjen når det går
        for name in [AVCaptureSession.runtimeErrorNotification, AVCaptureSession.interruptionEndedNotification] {
            NotificationCenter.default.addObserver(forName: name, object: s, queue: nil) { [weak self] _ in self?.resume() }
        }
        // Grunnen huskes (0.13.8), så eksporten kan si hvorfor kameraene stoppet
        NotificationCenter.default.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: s, queue: nil) { [weak self] note in
            let raw = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
            let why: String
            switch raw.flatMap(AVCaptureSession.InterruptionReason.init(rawValue:)) {
            case .videoDeviceNotAvailableDueToSystemPressure: why = "telefonen var for varm eller presset"
            case .videoDeviceInUseByAnotherClient: why = "en annen app tok kameraet"
            case .videoDeviceNotAvailableInBackground: why = "appen lå i bakgrunnen"
            case .videoDeviceNotAvailableWithMultipleForegroundApps: why = "flere apper var framme"
            case .audioDeviceInUseByAnotherClient: why = "en annen app tok lyden"
            default: why = "avbrudd \(raw ?? -1)"
            }
            self?.noteStop(why)
        }
        NotificationCenter.default.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: s, queue: nil) { [weak self] note in
            self?.noteStop("kamerafeil \((note.userInfo?[AVCaptureSessionErrorKey] as? NSError)?.code ?? 0)")
        }
        s.startRunning()
        return Started(active: got, multi: got.count > 1, error: nil)
        #endif
    }

    /// Minste format med minst ønsket størrelse (og som tåler to kameraer samtidig), låst til 15 bilder i sekundet
    private static func chooseFormat(_ device: AVCaptureDevice, size: (Int32, Int32), multi: Bool) {
        let fits = device.formats.filter { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return (!multi || f.isMultiCamSupported) && d.width >= size.0 && d.height >= size.1
                && f.videoSupportedFrameRateRanges.contains { $0.minFrameRate <= Double(fps) && $0.maxFrameRate >= Double(fps) }
        }
        let best = fits.min { a, b in
            let da = CMVideoFormatDescriptionGetDimensions(a.formatDescription), db = CMVideoFormatDescriptionGetDimensions(b.formatDescription)
            return Int(da.width) * Int(da.height) < Int(db.width) * Int(db.height)
        }
        guard let best, (try? device.lockForConfiguration()) != nil else { return }
        device.activeFormat = best
        device.activeVideoMinFrameDuration = CMTime(value: 1, timescale: fps)
        device.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: fps)
        device.unlockForConfiguration()
    }

    // MARK: Bilder

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let time = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
        lock.lock()
        guard let f = facingOf[ObjectIdentifier(output)] else { lock.unlock(); return }
        received(buffer, facing: f, time: time.isFinite ? time : CACurrentMediaTime())
    }

    /// Kalles med låsen holdt
    private func received(_ buffer: CVPixelBuffer, facing f: Facing, time: CFTimeInterval) {
        seq += 1
        let frame = Frame(buffer: buffer, time: time, seq: seq)
        latest[f] = frame
        let road = onRoadFrame
        lock.unlock()
        if f == .environment { road?(frame) }
    }

    func latestFrame(_ f: Facing) -> Frame? {
        lock.lock(); defer { lock.unlock() }
        return latest[f]
    }

    /// Siste bilde som JPEG, valgfritt nedskalert så den lengste siden er høyst maxSide.
    func jpeg(_ f: Facing, maxSide: Int, quality: Double, after: Int) -> (data: Data, ageMs: Int, seq: Int, width: Int, height: Int)? {
        guard let frame = latestFrame(f), frame.seq != after else { return nil }
        var image = CIImage(cvPixelBuffer: frame.buffer)
        let long = max(frame.width, frame.height)
        if maxSide > 0, long > maxSide {
            let k = CGFloat(maxSide) / CGFloat(long)
            image = image.transformed(by: CGAffineTransform(scaleX: k, y: k))
        }
        let opts = [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): quality]
        guard let data = ci.jpegRepresentation(of: image, colorSpace: sRGB, options: opts) else { return nil }
        let age = max(0, Int((CACurrentMediaTime() - frame.time) * 1000))
        return (data, age, frame.seq, Int(image.extent.width.rounded()), Int(image.extent.height.rounded()))
    }

    // MARK: Simulatoren (uten kamera): bilder fra en mappe på Macen

    #if targetEnvironment(simulator)
    private var simTimer: DispatchSourceTimer?

    /// Mappen settes med SIMCTL_CHILD_KJ_SIMCAM=<mappe> ved start; den har undermappene user/ og environment/
    /// med JPEG-bilder (stående). Hvert bilde vises 1,5 s, og bildene går i ring.
    private func startSimulated(_ wanted: [Facing]) -> Started {
        let root = ProcessInfo.processInfo.environment["KJ_SIMCAM"] ?? ""
        var frames: [Facing: [CVPixelBuffer]] = [:]
        for f in wanted {
            let dir = URL(fileURLWithPath: root).appendingPathComponent(f.rawValue)
            let files = ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
                .filter { ["jpg", "jpeg", "png"].contains($0.pathExtension.lowercased()) }
                .sorted { $0.lastPathComponent < $1.lastPathComponent }
            frames[f] = files.compactMap { pixelBuffer(from: $0) }
            if frames[f]!.isEmpty, let gray = pixelBuffer(width: f == .user ? 480 : 720, height: f == .user ? 640 : 1280) { frames[f] = [gray] }
        }
        lock.lock()
        active = wanted
        lock.unlock()
        let timer = DispatchSource.makeTimerSource(queue: frameQueue)
        var tick = 0
        timer.schedule(deadline: .now(), repeating: 1.0 / Double(Self.fps))
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            for (f, list) in frames {
                let b = list[(tick / (Int(Self.fps) * 3 / 2)) % list.count]
                self.lock.lock()
                self.received(b, facing: f, time: CACurrentMediaTime())
            }
            tick += 1
        }
        timer.resume()
        simTimer = timer
        return Started(active: wanted, multi: wanted.count > 1, error: nil)
    }

    private func pixelBuffer(from url: URL) -> CVPixelBuffer? {
        guard let image = CIImage(contentsOf: url) else { return nil }
        let w = Int(image.extent.width), h = Int(image.extent.height)
        guard let pb = pixelBuffer(width: w, height: h) else { return nil }
        ci.render(image, to: pb)
        return pb
    }

    private func pixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pb)
        return pb
    }
    #else
    private var simTimer: Never? { nil }
    #endif
}
