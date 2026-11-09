import CoreImage
import CoreML
import QuartzCore

/// Feltlinjer og vei med maskinlæring (0.13.0): TwinLiteNet+ large (MIT, chequanghuy/TwinLiteNetPlus), trent på
/// BDD100K (100 000 kjøreturer, dag og natt, regn og snø). Modellen merker hver piksel som feltlinje eller ikke, og
/// kjørbar vei eller ikke. Den skiller oppmalte linjer fra veikanter, rekkverk, fortauskanter og brøytestikker, som den
/// enkle bildeanalysen i nettappen ofte tok feil av.
/// Utsnittet er et bredt bånd (16:9) av det stående veibildet, rett over dashbordkanten, slik modellen er trent
/// (dashbordkamera, 640×360 med grå kant til 640×384). Svaret er punkter midt på hver linjebit rad for rad, og venstre
/// og høyre kant av veien foran, i kamerabildets piksler. Nettappen tilpasser feltlinjene (lanes.js) fra punktene.
nonisolated final class LaneDetector: @unchecked Sendable {
    static let width = 640, height = 384, pad = 12   // 640×360 bilde med 12 grå rader over og under

    /// Kalles med hvert svar (på modellens egen kø)
    var onResult: (@Sendable ([String: Any]) -> Void)?

    private let queue = DispatchQueue(label: "kjorerapport.lanes", qos: .userInitiated)
    private let lock = NSLock()
    private var busy = false
    private var lastStart: CFTimeInterval = 0
    private var roadBottom: Double?
    private var gamma = 1.0   // under 1 i mørket: bildet lysnes (0.13.2, regnet ut i nettappen, lanes.js laneGamma)
    private var models: [(units: String, model: MLModel)] = []
    private var chosen: Int?
    private var trials: [[Double]] = []
    private var runs = 0
    private var pool: CVPixelBufferPool?
    private let ci = CIContext(options: [.workingColorSpace: NSNull(), .cacheIntermediates: false])

    /// Laster modellen på grafikkprosessoren og med «alle» (gjerne AI-brikken); den raskeste brukes resten av økten.
    func load() -> Bool {
        lock.lock(); defer { lock.unlock() }
        if !models.isEmpty { return true }
        guard let url = Bundle.main.url(forResource: "Lanes", withExtension: "mlmodelc") else { return false }
        #if targetEnvironment(simulator)
        let choices = [("prosessor", MLComputeUnits.cpuOnly)]
        #else
        let choices = [("alle", MLComputeUnits.all), ("gpu", MLComputeUnits.cpuAndGPU)]
        #endif
        for (label, units) in choices {
            let config = MLModelConfiguration()
            config.computeUnits = units
            if let m = try? MLModel(contentsOf: url, configuration: config) { models.append((label, m)) }
        }
        trials = Array(repeating: [], count: models.count)
        let attrs: [String: Any] = [kCVPixelBufferWidthKey as String: Self.width, kCVPixelBufferHeightKey as String: Self.height,
                                    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                                    kCVPixelBufferIOSurfacePropertiesKey as String: [:],
                                    kCVPixelBufferMetalCompatibilityKey as String: true]
        CVPixelBufferPoolCreate(nil, nil, attrs as CFDictionary, &pool)
        return !models.isEmpty
    }

    func configure(roadBottom: Double?, gamma: Double = 1) {
        lock.lock(); self.roadBottom = roadBottom; self.gamma = min(1, max(0.3, gamma)); lock.unlock()
    }

    /// Nytt veibilde: høyst rundt 8 ganger i sekundet (3 når telefonen er varm), og bare når forrige svar er ferdig.
    func feed(_ frame: CameraHub.Frame) {
        let now = CACurrentMediaTime()
        let hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue
        lock.lock()
        guard !busy, !models.isEmpty, now - lastStart >= (hot ? 0.33 : 0.125) else { lock.unlock(); return }
        busy = true
        lastStart = now
        let bottom = roadBottom, gamma = self.gamma
        lock.unlock()
        queue.async { [self] in
            defer { lock.lock(); busy = false; lock.unlock() }
            guard let out = run(frame, roadBottom: bottom, gamma: gamma) else { return }
            onResult?(out)
        }
    }

    /// Båndet i kamerabildets piksler: hele bredden, 16:9, med bunnen ved dashbordkanten (eller 80 % ned uten kant)
    static func band(w: Int, h: Int, roadBottom: Double?) -> (y0: Double, y1: Double) {
        let W = Double(w), H = Double(h)
        let bh = min(H, W * 9 / 16)
        let y1 = min(H, max(bh, (roadBottom ?? 0.8) * H))
        return (y1 - bh, y1)
    }

    private func run(_ frame: CameraHub.Frame, roadBottom: Double?, gamma: Double) -> [String: Any]? {
        let w = frame.width, h = frame.height
        let (y0, y1) = Self.band(w: w, h: h, roadBottom: roadBottom)
        guard let pool else { return nil }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
        guard let input = pb else { return nil }
        let inner = Double(Self.height - 2 * Self.pad)
        // Core Image har origo nederst til venstre: båndet flyttes ned i hjørnet, skaleres til 640×360 og løftes 12 rader
        var img = CIImage(cvPixelBuffer: frame.buffer)
            .cropped(to: CGRect(x: 0, y: Double(h) - y1, width: Double(w), height: y1 - y0))
            .transformed(by: CGAffineTransform(translationX: 0, y: -(Double(h) - y1)))
            .transformed(by: CGAffineTransform(scaleX: Double(Self.width) / Double(w), y: inner / (y1 - y0)))
            .transformed(by: CGAffineTransform(translationX: 0, y: Double(Self.pad)))
        // Mørkt (0.13.2): lysnes som bildet til bilgjenkjenningen, ellers fant modellen få linjer under lys 30
        if gamma < 0.99, let f = CIFilter(name: "CIGammaAdjust") {
            f.setValue(img, forKey: kCIInputImageKey)
            f.setValue(gamma, forKey: "inputPower")
            if let o = f.outputImage { img = o }
        }
        let gray = CIImage(color: CIColor(red: 114 / 255, green: 114 / 255, blue: 114 / 255))
            .cropped(to: CGRect(x: 0, y: 0, width: Self.width, height: Self.height))
        ci.render(img.composited(over: gray), to: input, bounds: CGRect(x: 0, y: 0, width: Self.width, height: Self.height), colorSpace: nil)

        lock.lock()
        let index = chosen ?? (runs % models.count)
        runs += 1
        let model = models[index].model
        lock.unlock()
        let t0 = CACurrentMediaTime()
        guard let features = try? MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: input)]),
              let result = try? model.prediction(from: features),
              let lanes = result.featureValue(for: "lanes")?.multiArrayValue,
              let road = result.featureValue(for: "road")?.multiArrayValue else { return nil }
        let ms = (CACurrentMediaTime() - t0) * 1000
        pick(index, ms)

        // Fra modellens rader og kolonner til kamerabildets piksler
        let sx = Double(w) / Double(Self.width), sy = (y1 - y0) / inner
        let fy = { (r: Int) -> Double in y0 + (Double(r - Self.pad) + 0.5) * sy }
        let L = Plane(lanes), R = Plane(road)
        // Feltlinjene: midten av hver linjebit, annenhver rad (høyst 900 punkter)
        var pts: [Double] = []
        var r = Self.pad
        while r < Self.height - Self.pad && pts.count < 1800 {
            var start = -1
            for c in 0...Self.width {
                let on = c < Self.width && L[r, c] > 0
                if on && start < 0 { start = c }
                if !on && start >= 0 {
                    if c - start <= 60 { pts.append((Double(start + c) / 2 * sx).rounded()); pts.append(fy(r).rounded()) }
                    start = -1
                }
            }
            r += 2
        }
        // Veien foran: venstre og høyre kant av den kjørbare biten som ligger nærmest midten, hver fjerde rad
        var edges: [Double] = []
        r = Self.pad
        let mid = Self.width / 2
        while r < Self.height - Self.pad {
            var best: (Int, Int)? = nil, bestD = Int.max, start = -1
            for c in 0...Self.width {
                let on = c < Self.width && R[r, c] > 0
                if on && start < 0 { start = c }
                if !on && start >= 0 {
                    let d = start <= mid && mid < c ? 0 : min(abs(start - mid), abs(c - mid))
                    if c - start >= 8 && d < bestD { best = (start, c); bestD = d }
                    start = -1
                }
            }
            if let b = best { edges.append(fy(r).rounded()); edges.append((Double(b.0) * sx).rounded()); edges.append((Double(b.1) * sx).rounded()) }
            r += 4
        }
        lock.lock()
        let units = models[chosen ?? index].units
        lock.unlock()
        return ["pts": pts, "road": edges, "w": w, "h": h, "y0": y0.rounded(), "y1": y1.rounded(), "gamma": gamma,
                "age": max(0, (CACurrentMediaTime() - frame.time) * 1000), "ms": ms,
                "backend": "TwinLiteNet+ · \(units)\(chosen == nil ? " (måler)" : "")"]
    }

    /// De 4 første svarene på hver måte (det første regnes ikke), så velges den raskeste
    private func pick(_ index: Int, _ ms: Double) {
        lock.lock(); defer { lock.unlock() }
        guard chosen == nil else { return }
        trials[index].append(ms)
        guard trials.allSatisfy({ $0.count >= 4 }) else { return }
        let median = trials.map { t -> Double in let s = t.dropFirst().sorted(); return s[s.count / 2] }
        chosen = median.indices.min { median[$0] < median[$1] }
    }

    /// Et svar [1, 1, rader, kolonner] lest med Core MLs egne radavstander (polstret på AI-brikken)
    private struct Plane {
        let values: [Float], row: Int, col: Int
        init(_ a: MLMultiArray) {
            row = a.strides[2].intValue; col = a.strides[3].intValue
            switch a.dataType {
            case .float16: values = a.withUnsafeBufferPointer(ofType: Float16.self) { $0.map(Float.init) }
            case .double: values = a.withUnsafeBufferPointer(ofType: Double.self) { $0.map(Float.init) }
            default: values = a.withUnsafeBufferPointer(ofType: Float.self) { Array($0) }
            }
        }
        subscript(r: Int, c: Int) -> Float { let i = r * row + c * col; return i < values.count ? values[i] : 0 }
    }
}
