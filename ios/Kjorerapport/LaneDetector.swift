import CoreImage
import CoreML
import QuartzCore

/// Takten på modellene etter telefonens varme (0.13.12). Målt på telefonen 11. nov. kl. 22–23 (på et bord, koblet til
/// Macen, fra normal temperatur, tid til «lunken» / «varm»):
///   ingen av modellene: aldri / aldri (6,5 min) · bare feltmodellen 5 per s: 4:50 / ikke på 5 min
///   bare bilgjenkjenningen 5 per s: 1:30 / 5:45 · begge 5 per s (slik det var): 0:25 / 2:00
///   begge 3 per s: 1:10 / aldri (6,5 min) · bilgjenkjenning 2 og felt 3 per s: 1:45 / aldri (6,5 min)
/// Bilgjenkjenningen (grafikkprosessoren) er altså varmekilden, og feltmodellen er billig. Før gikk begge 5 ganger i
/// sekundet til telefonen ble «varm», og så 3 resten av turen uten at den kjølte seg ned (varm i 97 % av en tur).
/// Nå: bilgjenkjenningen 2,5 og feltmodellen 5 ganger i sekundet. Varm telefon: 2 og 3. Bilen står stille: 1,5 og 1,5.
/// Med den lille bilmodellen (lightCars): 5 og 5, og 3 og 3 når telefonen er varm.
/// Svært varm: 1 og 1. Følgingen i nettappen (track.js) flytter boksene mellom svarene og tåler 0,5 s mellom dem.
nonisolated enum ModelPace {
    /// Bilen står stille (fra nettappen, GPS-farten under 2 km/t): ingenting å følge med på
    nonisolated(unsafe) static var still = false
    /// Bilmodellen er den lille (0.13.17, satt av RoadDetector). Målt 12. nov.: med den holdt telefonen normal temperatur
    /// med begge modellene 5 ganger i sekundet, der medium gjorde den «varm» på to minutter. Da kan den gå 5 igjen.
    nonisolated(unsafe) static var lightCars = false

    /// Minste tid mellom to svar, i sekunder. Kamerabildene kommer 15 ganger i sekundet (hvert 0,067 s).
    static func gate(cars: Bool) -> Double {
        if still { return 0.65 }   // 1,5 i sekundet: følgingen i nettappen slipper en bil etter 1 s uten svar
        switch ProcessInfo.processInfo.thermalState {
        case .nominal, .fair: return cars && !lightCars ? 0.39 : 0.19
        case .serious: return cars && !lightCars ? 0.46 : 0.31
        default: return 0.95
        }
    }
}

/// Feltlinjer og vei med maskinlæring (0.13.0): TwinLiteNet+ large (MIT, chequanghuy/TwinLiteNetPlus). Fra 0.13.6 med
/// egne vekter, trent på comma10k (MIT, rundt 10 000 håndmerkede kjørebilder, dag og natt), så ingenting i modellen er
/// begrenset til ikke-kommersiell bruk. Modellen merker hver piksel som feltlinje eller ikke, og vei eller ikke (hele
/// veiflaten, også motgående felt). Den skiller oppmalte linjer fra veikanter, rekkverk, fortauskanter og
/// brøytestikker, som den enkle bildeanalysen i nettappen ofte tok feil av.
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
    /// Måling (testbygg, 0.13.12): KJ_LANES_HZ=<svar i sekundet> gir fast takt, også når telefonen er varm
    private static let testGate: Double? = {
        #if DEBUG
        if let v = ProcessInfo.processInfo.environment["KJ_LANES_HZ"], let hz = Double(v), hz > 0 { return 1 / hz - 0.01 }
        #endif
        return nil
    }()
    private var lastStart: CFTimeInterval = 0
    private var roadBottom: Double?
    private var gamma = 1.0   // under 1 i mørket: bildet lysnes (0.13.2, regnet ut i nettappen, lanes.js laneGamma)
    private var models: [(units: String, model: MLModel)] = []
    private var chosen: Int?
    private var tag = ""   // merke på testvekter (0.13.7, modellens versjonsfelt): står i «backend», så eksporten viser hvilke vekter som kjørte
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
        var choices = [("alle", MLComputeUnits.all), ("gpu", MLComputeUnits.cpuAndGPU)]
        #if DEBUG
        // Måling (0.13.12): KJ_LANES=gpu eller alle tvinger én regneenhet, alt annet slår modellen av
        if let only = ProcessInfo.processInfo.environment["KJ_LANES"] { choices = choices.filter { $0.0 == only } }
        #endif
        #endif
        for (label, units) in choices {
            let config = MLModelConfiguration()
            config.computeUnits = units
            if let m = try? MLModel(contentsOf: url, configuration: config) { models.append((label, m)) }
        }
        trials = Array(repeating: [], count: models.count)
        if let v = models.first?.model.modelDescription.metadata[.versionString] as? String, !v.isEmpty { tag = " \(v)" }
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

    /// Nytt veibilde: 5 ganger i sekundet (færre når telefonen er varm eller bilen står, se ModelPace), og bare når
    /// forrige svar er ferdig.
    func feed(_ frame: CameraHub.Frame) {
        let now = CACurrentMediaTime()
        let hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue
        lock.lock()
        guard !busy, !models.isEmpty, now - lastStart >= (Self.testGate ?? ModelPace.gate(cars: false)) else { lock.unlock(); return }
        busy = true
        lastStart = now
        let bottom = roadBottom, gamma = self.gamma
        lock.unlock()
        queue.async { [self] in
            defer { lock.lock(); busy = false; lock.unlock() }
            let t0 = CACurrentMediaTime()
            guard var out = run(frame, roadBottom: bottom, gamma: gamma) else { return }
            // Til eksporten (0.13.9): varm telefon (da kjøres modellen 3 ganger i sekundet) og tiden for hele svaret,
            // med klargjøring av bildet og lesing av svaret, ikke bare modellen
            out["hot"] = hot
            out["th"] = ProcessInfo.processInfo.thermalState.rawValue   // trinnet (0–3), så eksporten viser hvor varm (0.13.11)
            out["run"] = (CACurrentMediaTime() - t0) * 1000
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
        let units = models[chosen ?? index].units, tag = self.tag
        lock.unlock()
        return ["pts": pts, "road": edges, "w": w, "h": h, "y0": y0.rounded(), "y1": y1.rounded(), "gamma": gamma,
                "age": max(0, (CACurrentMediaTime() - frame.time) * 1000), "ms": ms,
                "backend": "TwinLiteNet+\(tag) · \(units)\(chosen == nil ? " (måler)" : "")"]
    }

    /// De 4 første svarene på hver måte (det første regnes ikke), så velges den raskeste
    private func pick(_ index: Int, _ ms: Double) {
        lock.lock(); defer { lock.unlock() }
        guard chosen == nil else { return }
        trials[index].append(ms)
        guard trials.allSatisfy({ $0.count >= 4 }) else { return }
        let median = trials.map { t -> Double in let s = t.dropFirst().sorted(); return s[s.count / 2] }
        chosen = median.indices.min { median[$0] < median[$1] }
        #if DEBUG
        print("[cam] feltmodellen måling: " + zip(models, median).map { "\($0.0.units) \(Int($0.1.rounded())) ms" }.joined(separator: ", "))
        #endif
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
