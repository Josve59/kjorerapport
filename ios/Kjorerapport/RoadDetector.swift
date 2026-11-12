import CoreImage
import CoreML
import QuartzCore

/// Bilgjenkjenning for veikameraet med D-FINE medium (Apache 2.0, Peterande/D-FINE, bare COCO fra 0.13.5) som Core ML,
/// på telefonens grafikkprosessor eller AI-brikke. Samme utsnitt og tolkning som D-FINE i nettappen (kamera/js/dfine.js):
/// et kvadrat midt i det stående bildet (rett over dashbordkanten når den er kjent), skalert til 640×640, lysnet med
/// en gammakurve i mørket. Svarene er i kamerabildets piksler og går til nettappen, som følger bilene mellom svarene.
nonisolated final class RoadDetector: @unchecked Sendable {
    static let size = 640
    // COCO-klasser vi bruker, med navnene nettappen venter (road.js)
    private static let classes: [(Int, String)] = [(0, "person"), (1, "bicycle"), (2, "car"), (3, "motorcycle"), (5, "bus"), (7, "truck")]

    struct Detection { let cls: String; let score: Float; let x, y, w, h: Double }

    /// Kalles med hvert svar (på modellens egen kø)
    var onResult: (@Sendable ([String: Any]) -> Void)?

    private let queue = DispatchQueue(label: "kjorerapport.dfine", qos: .userInitiated)
    private let lock = NSLock()
    private var busy = false
    /// Måling (testbygg, 0.13.12): KJ_DFINE_HZ=<svar i sekundet> gir fast takt, også når telefonen er varm
    private static let testGate: Double? = {
        #if DEBUG
        if let v = ProcessInfo.processInfo.environment["KJ_DFINE_HZ"], let hz = Double(v), hz > 0 { return 1 / hz - 0.01 }
        #endif
        return nil
    }()
    private var lastStart: CFTimeInterval = 0
    private var roadBottom: Double?
    private var dark = false
    private var models: [(units: String, model: MLModel)] = []
    private var chosen: Int?
    private var trials: [[Double]] = []
    private var runs = 0
    private(set) var name = "D-FINE"
    private var pool: CVPixelBufferPool?
    private let ci = CIContext(options: [.workingColorSpace: NSNull(), .cacheIntermediates: false])

    /// Laster modellen to ganger: på grafikkprosessoren og med «alle» (Core ML velger, gjerne AI-brikken for deler av den).
    /// De første svarene måles, og den raskeste brukes resten av økten.
    func load(modelURL: URL? = nil) -> Bool {
        lock.lock(); defer { lock.unlock() }
        if !models.isEmpty { return true }
        var file = "DFine"
        #if DEBUG
        // Måling (0.13.16): KJ_DFINE_MODEL=test bruker modellen ios/copy-web.sh la ved som DFineTest, når den finnes
        if ProcessInfo.processInfo.environment["KJ_DFINE_MODEL"] == "test", Bundle.main.url(forResource: "DFineTest", withExtension: "mlmodelc") != nil { file = "DFineTest" }
        #endif
        guard let url = modelURL ?? Bundle.main.url(forResource: file, withExtension: "mlmodelc") else { return false }
        #if targetEnvironment(simulator)
        let choices = [("prosessor", MLComputeUnits.cpuOnly)]   // simulatoren gir bare nuller på grafikkprosessoren
        #else
        var choices = [("gpu", MLComputeUnits.cpuAndGPU), ("alle", MLComputeUnits.all)]
        #if DEBUG
        // Måling (0.13.12): KJ_DFINE=gpu eller alle tvinger én regneenhet, alt annet slår modellen av
        if let only = ProcessInfo.processInfo.environment["KJ_DFINE"] { choices = choices.filter { $0.0 == only } }
        #endif
        #endif
        for (label, units) in choices {
            let config = MLModelConfiguration()
            config.computeUnits = units
            if let m = try? MLModel(contentsOf: url, configuration: config) { models.append((label, m)) }
        }
        if let d = models.first?.model.modelDescription.metadata[.description] as? String,
           let size = ["xlarge", "large", "medium", "small", "nano"].first(where: { d.contains("dfine-\($0)") }) {
            name = "D-FINE \(size)"
            ModelPace.lightCars = size == "small" || size == "nano"
        }
        trials = Array(repeating: [], count: models.count)
        var attrs: [String: Any] = [kCVPixelBufferWidthKey as String: Self.size, kCVPixelBufferHeightKey as String: Self.size,
                                    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                                    kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        attrs[kCVPixelBufferMetalCompatibilityKey as String] = true
        CVPixelBufferPoolCreate(nil, nil, attrs as CFDictionary, &pool)
        return !models.isEmpty
    }

    func configure(roadBottom: Double?, dark: Bool) {
        lock.lock()
        self.roadBottom = roadBottom
        self.dark = dark
        lock.unlock()
    }

    /// Nytt veibilde. Modellen kjører 2,5 ganger i sekundet (færre når telefonen er varm eller bilen står, se ModelPace
    /// i LaneDetector.swift), og bare når forrige svar er ferdig, så bildene som kommer imens hoppes over.
    func feed(_ frame: CameraHub.Frame) {
        let now = CACurrentMediaTime()
        lock.lock()
        guard !busy, !models.isEmpty, now - lastStart >= (Self.testGate ?? ModelPace.gate(cars: true)) else { lock.unlock(); return }
        busy = true
        lastStart = now
        let bottom = roadBottom, dark = self.dark
        lock.unlock()
        queue.async { [self] in
            defer { lock.lock(); busy = false; lock.unlock() }
            guard let out = detect(frame, roadBottom: bottom, dark: dark) else { return }
            onResult?(out)
        }
    }

    private func detect(_ frame: CameraHub.Frame, roadBottom: Double?, dark: Bool) -> [String: Any]? {
        let w = frame.width, h = frame.height
        let crop = Self.cropFor(w: w, h: h, roadBottom: roadBottom)
        guard let pool else { return nil }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
        guard let input = pb else { return nil }
        // Core Image har origo nederst til venstre
        var image = CIImage(cvPixelBuffer: frame.buffer)
            .cropped(to: CGRect(x: crop.sx, y: Double(h) - crop.sy - crop.sh, width: crop.sw, height: crop.sh))
            .transformed(by: CGAffineTransform(translationX: -crop.sx, y: -(Double(h) - crop.sy - crop.sh)))
            .transformed(by: CGAffineTransform(scaleX: Double(Self.size) / crop.sw, y: Double(Self.size) / crop.sh))
        if dark, let f = CIFilter(name: "CIGammaAdjust") {
            f.setValue(image, forKey: kCIInputImageKey)
            f.setValue(0.5, forKey: "inputPower")   // som GAMMA i nettappen: 255 · (v/255)^0,5
            if let o = f.outputImage { image = o }
        }
        ci.render(image, to: input, bounds: CGRect(x: 0, y: 0, width: Self.size, height: Self.size), colorSpace: nil)

        lock.lock()
        let index = chosen ?? (runs % models.count)
        runs += 1
        let model = models[index].model
        lock.unlock()
        let t0 = CACurrentMediaTime()
        guard let features = try? MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: input)]),
              let result = try? model.prediction(from: features),
              let logits = result.featureValue(for: "logits")?.multiArrayValue,
              let boxes = result.featureValue(for: "boxes")?.multiArrayValue else { return nil }
        let ms = (CACurrentMediaTime() - t0) * 1000
        pick(index, ms)
        // Bare nuller betyr at modellen ikke kjørte riktig (ikke at bildet er tomt): ingen svar heller enn falske
        guard !Self.allZero(boxes) else { return ["dets": [], "w": w, "h": h, "age": 0, "ms": ms, "error": "tomt svar fra modellen"] }
        let dets = Self.decode(logits: logits, boxes: boxes, crop: crop)
        lock.lock()
        let units = models[chosen ?? index].units
        lock.unlock()
        return [
            "dets": dets.map { ["cls": $0.cls, "score": Double($0.score), "x": $0.x, "y": $0.y, "w": $0.w, "h": $0.h] },
            "w": w, "h": h,
            "age": max(0, (CACurrentMediaTime() - frame.time) * 1000),
            "ms": ms,
            "backend": "\(name) · \(units)\(chosen == nil ? " (måler)" : "")"
        ]
    }

    /// De 4 første svarene på hver måte (det første regnes ikke, modellen varmes opp), så velges den raskeste
    private func pick(_ index: Int, _ ms: Double) {
        lock.lock(); defer { lock.unlock() }
        guard chosen == nil else { return }
        trials[index].append(ms)
        guard trials.allSatisfy({ $0.count >= 4 }) else { return }
        let median = trials.map { t -> Double in let s = t.dropFirst().sorted(); return s[s.count / 2] }
        chosen = median.indices.min { median[$0] < median[$1] }
        #if DEBUG
        print("[cam] D-FINE måling: " + zip(models, median).map { "\($0.0.units) \(Int($0.1.rounded())) ms" }.joined(separator: ", "))
        #endif
    }

    /// Samme som cropFor i dfine.js: { sx, sy, sw, sh } i bildets piksler
    static func cropFor(w: Int, h: Int, roadBottom: Double?) -> (sx: Double, sy: Double, sw: Double, sh: Double) {
        let W = Double(w), H = Double(h)
        if h > w, let rb = roadBottom {
            let s = W
            return (0, (max(0, min(H - s, rb * H - 0.9 * s))).rounded(), s, s)
        }
        if h > w { return (0, ((H - W) * 0.5).rounded(), W, W) }
        return (0, 0, W, H)
    }

    /// Samme som decode i dfine.js: logits [1, 300, 80], bokser [1, 300, 4] (cx, cy, w, h 0–1) → de 20 beste fra 0,15
    static func decode(logits: MLMultiArray, boxes: MLMultiArray, crop: (sx: Double, sy: Double, sw: Double, sh: Double), minScore: Float = 0.15) -> [Detection] {
        let queries = logits.shape[1].intValue
        let L = Strided(logits), B = Strided(boxes)
        var out: [Detection] = []
        for q in 0..<queries {
            var best = -Float.infinity, name = ""
            for (c, n) in classes { let v = L[q, c]; if v > best { best = v; name = n } }
            let score = 1 / (1 + exp(-best))
            if score < minScore || !score.isFinite { continue }
            let cx = Double(B[q, 0]), cy = Double(B[q, 1]), bw = Double(B[q, 2]), bh = Double(B[q, 3])
            out.append(Detection(cls: name, score: score, x: crop.sx + (cx - bw / 2) * crop.sw, y: crop.sy + (cy - bh / 2) * crop.sh,
                                 w: bw * crop.sw, h: bh * crop.sh))
        }
        return Array(out.sorted { $0.score > $1.score }.prefix(20))
    }

    static func allZero(_ a: MLMultiArray) -> Bool {
        let s = Strided(a)
        return !(0..<min(50, a.shape[1].intValue)).contains { q in s[q, 2] != 0 || s[q, 3] != 0 }
    }

    /// Svar [1, n, k] lest med Core MLs egne avstander mellom radene: på AI-brikken er radene polstret, så tallene
    /// ligger ikke tett (uten dette ble annenhver kjøring bare nuller)
    private struct Strided {
        let values: [Float], row: Int, col: Int
        init(_ a: MLMultiArray) {
            row = a.strides[1].intValue; col = a.strides[2].intValue
            switch a.dataType {
            case .float16: values = a.withUnsafeBufferPointer(ofType: Float16.self) { $0.map(Float.init) }
            case .double: values = a.withUnsafeBufferPointer(ofType: Double.self) { $0.map(Float.init) }
            default: values = a.withUnsafeBufferPointer(ofType: Float.self) { Array($0) }
            }
        }
        subscript(q: Int, c: Int) -> Float { let i = q * row + c * col; return i < values.count ? values[i] : .nan }
    }
}
