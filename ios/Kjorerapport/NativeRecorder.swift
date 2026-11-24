import ActivityKit
import CoreLocation
import CoreMotion
import StoreKit
import UIKit
import WebKit

/// Sensorene i appen. Posisjonen kommer alltid herfra (navigator.geolocation i nettappen erstattes av Bridge.js),
/// også med låst skjerm under et opptak. Bevegelsen tar nettappen selv når den er synlig (devicemotion); mens
/// appen er i bakgrunnen måles den her, og alt som ble målt gis til opptakeren når appen er synlig igjen.
final class NativeRecorder: NSObject, CLLocationManagerDelegate, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?
    private let location = CLLocationManager()
    private let motion = CMMotionManager()
    private var watching = false      // nettappen vil ha posisjoner (sjekk før kjøring, opptak)
    private var recording = false     // et opptak pågår
    private var micWanted = false     // blinklyset (1.1.0): lytt etter det mens opptaket pågår og appen er synlig
    private var inBackground = false
    private var buffer: [[String: Any]] = []   // målinger mens appen er i bakgrunnen
    private var pendingFiles: [(name: String, text: String)] = []   // filer åpnet i appen, til nettappen henter dem (0.18.1; kø fra 0.18.3)
    // Live Activity (låseskjerm og Dynamic Island) mens opptaket pågår
    private var activityID: String?
    private var recordStart = Date()
    private var distanceM = 0.0          // nettappens avstand når den er synlig, pluss det som måles i bakgrunnen
    private var lastLocation: CLLocation?
    private var lastActivityUpdate = Date.distantPast
    private let gravity = 9.80665
    private let detector = RoadDetector()   // bilgjenkjenning for veikameraet (CameraHub)
    private let laneDetector = LaneDetector()   // feltlinjer og vei med maskinlæring (0.13.0)
    private lazy var plus: PlusStore = {
        let p = PlusStore()
        p.onChange = { [weak self] owned in self?.send("window.__kjPlus && window.__kjPlus(\(owned))") }
        return p
    }()

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        location.activityType = .automotiveNavigation
        location.pausesLocationUpdatesAutomatically = false
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        // Et opptak kan ikke overleve at appen ble avsluttet: rydd bort gamle Live Activities
        Task { for old in Activity<RecordingAttributes>.activities { await old.end(nil, dismissalPolicy: .immediate) } }
    }

    // MARK: Meldinger fra nettappen

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return (nil, "ukjent melding") }
        switch cmd {
        case "info":
            #if DEBUG
            // Måling fra Macen (KJ_JS): skjermen holdes på så lenge måleskriptet spør. Én gang ved start var ikke nok:
            // telefonen låste seg etter 1–2 minutter i hvile (12. nov.), og da stopper siden
            if ProcessInfo.processInfo.environment["KJ_JS"] != nil { UIApplication.shared.isIdleTimerDisabled = true }
            #endif
            // thermal (0.13.12): varmetrinnet fra iOS (0 normal, 1 lunken, 2 varm, 3 svært varm)
            let dev = await Self.devTools()
            FrameLog.shared.allow(dev)   // veibilder til modelltrening bare i testbygg (1.0.4)
            return (["devTools": dev, "thermal": ProcessInfo.processInfo.thermalState.rawValue], nil)
        case "framesSet":
            FrameLog.shared.allow(await Self.devTools())
            FrameLog.shared.set(body["on"] as? Bool ?? false)
            return (FrameLog.shared.status(), nil)
        case "framesInfo":
            FrameLog.shared.allow(await Self.devTools())
            return (FrameLog.shared.status(), nil)
        case "framesClear":
            FrameLog.shared.clear()
            return (FrameLog.shared.status(), nil)
        case "camInfo":
            return (["multi": CameraHub.multiSupported, "model": Bundle.main.url(forResource: "DFine", withExtension: "mlmodelc") != nil,
                     "lanes": Bundle.main.url(forResource: "Lanes", withExtension: "mlmodelc") != nil], nil)
        case "camPrepare":
            // 1.0.3: modellene lastes mens eleven gjør seg klar (hjemskjermen og «Før kjøring»), ikke når kameraene startes
            _ = prepareModels()
            return (["ok": true], nil)
        case "camStart":
            // Begge kameraene samtidig når telefonen kan (iPhone XS og nyere), ellers det første i listen
            let facings = (body["facings"] as? [String] ?? ["user"]).compactMap(CameraHub.Facing.init(rawValue:))
            let detect = (body["detect"] as? Bool ?? false) && facings.contains(.environment)
            // 1.0.3: et nytt forsøk (fresh) starter serveren på nytt uansett hva den selv mener om tilstanden sin, og
            // modellene lastes samtidig med at kameraene startes (før etter hverandre: 3,6–4,7 s til svar)
            WebServer.shared?.restart(force: body["fresh"] as? Bool ?? false)
            if detect { _ = prepareModels() }
            FrameLog.shared.newSession()
            let started = await CameraHub.shared.start(facings, fresh: body["fresh"] as? Bool ?? false)
            let model = detect && started.active.contains(.environment) ? await startDetector() : nil
            if model == nil { CameraHub.shared.onRoadFrame = nil }
            let why: Any = CameraHub.shared.takeLastStop().map { $0 as Any } ?? NSNull()   // hvorfor kameraene sist stoppet (0.13.8)
            return (["active": started.active.map(\.rawValue), "multi": started.multi, "error": started.error.map { $0 as Any } ?? NSNull(), "model": model.map { $0 as Any } ?? NSNull(), "why": why], nil)
        case "plusStatus":
            await plus.refresh()
            return (plus.status, nil)
        case "plusBuy":
            return (await plus.buy(in: webView?.window?.windowScene), nil)
        case "plusRestore":
            return (await plus.restore(), nil)
        case "plusRedeem":
            return (await plus.redeem(in: webView?.window?.windowScene), nil)
        case "remindAuth":   // påminnelse om dagens teori (0.24.0, Reminders.swift)
            return (await Reminders.authorize(), nil)
        case "remindSet":
            return (await Reminders.set(body["items"] as? [[String: Any]] ?? []), nil)
        case "remindClear":
            await Reminders.clear()
            return (["ok": true], nil)
        case "share":
            return (["completed": await share(body)], nil)
        case "takeFile":
            // Den eldste filen som ble åpnet i appen (0.18.1). Hver gis bare én gang; nettappen spør til køen er tom.
            guard !pendingFiles.isEmpty else { return (NSNull(), nil) }
            let f = pendingFiles.removeFirst()
            return (["name": f.name, "text": f.text], nil)
        case "print":
            await printPage()
        case "review":
            // Apple bestemmer selv om spørsmålet vises (høyst tre ganger i året)
            if let scene = webView?.window?.windowScene { AppStore.requestReview(in: scene) }
        case "beep":
            // Pip (0.12.2): spilles av appen, så de høres med lydløs-bryteren på (se Beeper.swift)
            let tones = (body["tones"] as? [[Double]]) ?? []
            Beeper.shared.play(tones, volume: body["volume"] as? Double ?? 0.6)
        case "haptic":
            let pattern = (body["pattern"] as? [Double]) ?? [30]
            if pattern.count > 1 { UINotificationFeedbackGenerator().notificationOccurred(.success) }
            else {
                let ms = pattern.first ?? 30
                UIImpactFeedbackGenerator(style: ms >= 70 ? .heavy : ms >= 35 ? .medium : .light).impactOccurred()
            }
        case "log":
            #if DEBUG
            print("[web \(body["level"] as? String ?? "log")] \(body["text"] as? String ?? "")")
            #endif
        case "camStop":
            CameraHub.shared.onRoadFrame = nil
            CameraHub.shared.stop()
        case "camConfig":
            detector.configure(roadBottom: body["roadBottom"] as? Double, dark: body["dark"] as? Bool ?? false)
            laneDetector.configure(roadBottom: body["roadBottom"] as? Double, gamma: body["laneGamma"] as? Double ?? 1)
            if let bias = body["faceBias"] as? Double { CameraHub.shared.setUserBias(bias) }   // førerkameraet i mørket (0.13.10)
            ModelPace.still = body["still"] as? Bool ?? false   // bilen står stille: modellene går 1 gang i sekundet (0.13.12)
            FrameLog.shared.note(["roadBottom": body["roadBottom"] ?? NSNull(), "dark": body["dark"] as? Bool ?? false, "laneGamma": body["laneGamma"] ?? NSNull()])
        case "geoStart":
            watching = true
            startLocation()
        case "geoStop":
            watching = false
            if !recording { location.stopUpdatingLocation() }
        case "recStart":
            recording = true
            buffer.removeAll()
            location.allowsBackgroundLocationUpdates = true
            location.showsBackgroundLocationIndicator = true
            UIApplication.shared.isIdleTimerDisabled = true   // skjermen holdes på under opptak
            startLocation()
            startActivity()
        case "recStatus":
            // I bakgrunnen får ikke nettappen nye posisjoner (de samles her), så da gjelder appens egen avstand
            if !inBackground, let d = body["distanceM"] as? Double, d.isFinite { distanceM = d; updateActivity(force: false) }
        case "micAuth":   // blinklyset (1.1.0, BlinkListener.swift)
            return (["ok": await BlinkListener.authorize()], nil)
        case "micStart":
            BlinkListener.shared.onBatch = { [weak self] js in Task { @MainActor in self?.send(js) } }
            micWanted = true
            let why = inBackground ? nil : BlinkListener.shared.start()
            return (["ok": why == nil, "error": why.map { $0 as Any } ?? NSNull()], nil)
        case "micStop":
            micWanted = false
            BlinkListener.shared.stop()
        case "recStop":
            micWanted = false
            BlinkListener.shared.stop()
            recording = false
            endActivity()
            buffer.removeAll()
            motion.stopDeviceMotionUpdates()
            location.allowsBackgroundLocationUpdates = false
            UIApplication.shared.isIdleTimerDisabled = false
            if !watching { location.stopUpdatingLocation() }
        default:
            break
        }
        return (["auth": authorizationName], nil)
    }

    /// Bilmodellen og feltmodellen lastes én gang per økt, begge samtidig og i bakgrunnen (1.0.3). Første gang etter
    /// en oppdatering tar det noen sekunder. Den samme lastingen deles av alle som venter på den.
    private var modelsTask: Task<(cars: Bool, lanes: Bool), Never>?
    private func prepareModels() -> Task<(cars: Bool, lanes: Bool), Never> {
        if let t = modelsTask { return t }
        let cars = detector, lanes = laneDetector
        let t = Task.detached(priority: .userInitiated) { () -> (cars: Bool, lanes: Bool) in
            let t0 = Date()
            async let c = cars.load()
            async let l = lanes.load()
            let r = await (cars: c, lanes: l)
            #if DEBUG
            print("[cam] modellene lastet: biler \(r.cars), felt \(r.lanes) på \(Int(Date().timeIntervalSince(t0) * 1000)) ms")
            #endif
            return r
        }
        modelsTask = t
        return t
    }

    /// Gir bilgjenkjenningen og feltmodellen veibildene når de er lastet. Svarene går til nettappen som
    /// window.__kjCamDets({ dets, w, h, age, ms, backend }). Returnerer bilmodellens navn, eller nil.
    private func startDetector() async -> String? {
        let detector = self.detector
        let loaded = await prepareModels().value
        if !loaded.cars || !loaded.lanes { modelsTask = nil }   // prøves igjen neste gang
        guard loaded.cars else { return nil }
        detector.onResult = { [weak self] result in
            let js = "window.__kjCamDets && window.__kjCamDets(\(Self.jsonString(result)))"
            Task { @MainActor in self?.send(js) }
        }
        // Feltlinjene (0.13.0): egen modell på de samme veibildene, svarene som window.__kjCamLanes({ pts, road, … })
        let lanes = self.laneDetector
        let lanesLoaded = loaded.lanes
        if lanesLoaded {
            lanes.onResult = { [weak self] result in
                let js = "window.__kjCamLanes && window.__kjCamLanes(\(Self.jsonString(result)))"
                Task { @MainActor in self?.send(js) }
            }
        }
        CameraHub.shared.onRoadFrame = { frame in
            detector.feed(frame)
            if lanesLoaded { lanes.feed(frame) }
        }
        return detector.name
    }

    // MARK: Deling og utskrift

    /// iPhone-delearket med tekst og/eller filer (sikkerhetskopi, eksport, kjørelogg). Svarer om noe ble delt.
    private func share(_ body: [String: Any]) async -> Bool {
        var items: [Any] = []
        if let text = body["text"] as? String, !text.isEmpty { items.append(text) }
        for file in body["files"] as? [[String: Any]] ?? [] {
            guard let name = file["name"] as? String, let b64 = file["data"] as? String, let data = Data(base64Encoded: b64) else { continue }
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("deling", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(name.replacingOccurrences(of: "/", with: "-"))
            guard (try? data.write(to: url, options: .atomic)) != nil else { continue }
            items.append(url)
        }
        guard !items.isEmpty, let top = topViewController() else { return false }
        return await withCheckedContinuation { done in
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            var answered = false
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                guard !answered else { return }
                answered = true
                done.resume(returning: completed)
            }
            top.present(sheet, animated: true)
        }
    }

    /// Skriver ut rapporten (eller PDF via delearket i utskriftsvinduet)
    private func printPage() async {
        guard let web = webView else { return }
        let info = UIPrintInfo.printInfo()
        info.outputType = .general
        info.jobName = "Kjørerapport"
        let printer = UIPrintInteractionController.shared
        printer.printInfo = info
        printer.printFormatter = web.viewPrintFormatter()
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            printer.present(animated: true) { _, _, _ in done.resume() }
        }
    }

    private func topViewController() -> UIViewController? {
        var top = webView?.window?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }

    /// Utviklerdelen i Innstillinger (visningene, testknappene og veibildene) finnes bare i bygg fra Xcode: de har
    /// utviklerprofilen (embedded.mobileprovision) i appen. 1.0.16: ikke lenger i TestFlight. Apple tester appen i det
    /// samme testmiljøet som TestFlight (sandbox), og skal se appen slik kundene får den. Svaret er klart med en gang.
    private static let devToolsAnswer: Bool = {
        #if DEBUG
        return true
        #else
        return Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision") != nil
        #endif
    }()
    private static func devTools() async -> Bool { devToolsAnswer }

    private var authorizationName: String {
        switch location.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: "ok"
        case .denied, .restricted: "nei"
        default: "ukjent"
        }
    }

    private func startLocation() {
        if location.authorizationStatus == .notDetermined { location.requestWhenInUseAuthorization() }
        askFullAccuracy()
        location.startUpdatingLocation()
    }

    /// «Nøyaktig posisjon» av (1.0.16): da kommer posisjonen bare omtrent (flere km unna), og en tur kan aldri starte.
    /// Appen ber om nøyaktig posisjon mens den er i bruk (teksten «Kjoretur» i Info.plist), én gang per oppstart.
    /// Sier eleven nei, får nettappen feil 4 og forklarer hvor det slås på.
    private var askedFullAccuracy = false
    private func askFullAccuracy() {
        let s = location.authorizationStatus
        guard s == .authorizedWhenInUse || s == .authorizedAlways, location.accuracyAuthorization == .reducedAccuracy else { return }
        if askedFullAccuracy { send("window.__kjGeoError && window.__kjGeoError(4)"); return }
        askedFullAccuracy = true
        location.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "Kjoretur") { [weak self] _ in
            guard let self, self.location.accuracyAuthorization == .reducedAccuracy else { return }
            self.send("window.__kjGeoError && window.__kjGeoError(4)")
        }
    }

    // MARK: Posisjon

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations {
            if recording { addDistance(loc) }
            // Fart og GPS-nøyaktighet til veibildene (1.0.4), ingen posisjon
            FrameLog.shared.note(["kmh": loc.speed >= 0 ? (loc.speed * 36).rounded() / 10 : NSNull(), "gpsAcc": loc.horizontalAccuracy.rounded()])
            let sample: [String: Any] = [
                "type": "loc",
                "ts": loc.timestamp.timeIntervalSince1970 * 1000,
                "lat": loc.coordinate.latitude,
                "lon": loc.coordinate.longitude,
                "acc": loc.horizontalAccuracy,
                "speed": loc.speed >= 0 ? loc.speed : NSNull(),
                "heading": loc.course >= 0 ? loc.course : NSNull(),
                "alt": loc.verticalAccuracy >= 0 ? loc.altitude : NSNull()
            ]
            if inBackground {
                if recording { buffer.append(sample) }
            } else if watching {
                send("window.__kjGeo && window.__kjGeo(\(json(sample)))")
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let code = (error as? CLError)?.code == .denied ? 1 : 2
        if !inBackground { send("window.__kjGeoError && window.__kjGeoError(\(code))") }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .denied, .restricted: send("window.__kjGeoError && window.__kjGeoError(1)")
        case .authorizedWhenInUse, .authorizedAlways: if watching || recording { askFullAccuracy(); manager.startUpdatingLocation() }
        default: break
        }
    }

    // MARK: Live Activity

    private func startActivity() {
        recordStart = Date()
        distanceM = 0
        lastLocation = nil
        Task {
            for old in Activity<RecordingAttributes>.activities { await old.end(nil, dismissalPolicy: .immediate) }
            guard ActivityAuthorizationInfo().areActivitiesEnabled, recording else { return }
            let started = try? Activity.request(
                attributes: RecordingAttributes(startedAt: recordStart),
                content: content(finished: nil),
                pushType: nil)
            activityID = started?.id
            lastActivityUpdate = Date()
        }
    }

    /// Avstand mens appen er i bakgrunnen (nettappen sender sin egen når den er synlig)
    private func addDistance(_ loc: CLLocation) {
        guard inBackground, loc.horizontalAccuracy >= 0, loc.horizontalAccuracy <= 30 else { return }
        if let last = lastLocation { distanceM += loc.distance(from: last) }
        lastLocation = loc
        updateActivity(force: false)
    }

    private func updateActivity(force: Bool) {
        guard let id = activityID, force || Date().timeIntervalSince(lastActivityUpdate) >= 15 else { return }
        lastActivityUpdate = Date()
        let c = content(finished: nil)
        Task { for a in Activity<RecordingAttributes>.activities where a.id == id { await a.update(c) } }
    }

    private func endActivity() {
        guard let id = activityID else { return }
        activityID = nil
        let c = content(finished: Date().timeIntervalSince(recordStart))
        // Står igjen en stund på låseskjermen som en bekreftelse på at turen er lagret
        let until = Date().addingTimeInterval(15 * 60)
        Task { for a in Activity<RecordingAttributes>.activities where a.id == id { await a.end(c, dismissalPolicy: .after(until)) } }
    }

    private func content(finished: Double?) -> ActivityContent<RecordingAttributes.ContentState> {
        // Uten nye målinger på 3 minutter regnes den som utdatert (for eksempel hvis appen er avsluttet)
        ActivityContent(state: .init(distanceM: distanceM, finishedDuration: finished),
                        staleDate: finished == nil ? Date().addingTimeInterval(180) : nil)
    }

    // MARK: Bakgrunn

    @objc private func didEnterBackground() {
        inBackground = true
        if micWanted { BlinkListener.shared.stop() }   // mikrofonen bare mens appen er synlig (ingen lyd i bakgrunnen)
        lastLocation = nil
        updateActivity(force: true)
        guard recording, motion.isDeviceMotionAvailable else { return }
        // Samme tall som Safari gir nettappen (WebKit): m/s² og grader/s, alpha om x, beta om y, gamma om z
        motion.deviceMotionUpdateInterval = 1.0 / 20
        let offset = Date().timeIntervalSince1970 - ProcessInfo.processInfo.systemUptime
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let self, let m = data, self.recording else { return }
            let u = m.userAcceleration, g = m.gravity, r = m.rotationRate, k = self.gravity
            let deg = 180 / Double.pi
            self.buffer.append([
                "type": "mot",
                "ts": (offset + m.timestamp) * 1000,
                "ax": u.x * k, "ay": u.y * k, "az": u.z * k,
                "gx": (u.x + g.x) * k, "gy": (u.y + g.y) * k, "gz": (u.z + g.z) * k,
                "ra": r.x * deg, "rb": r.y * deg, "rg": r.z * deg
            ])
        }
    }

    @objc private func didBecomeActive() {
        inBackground = false
        if micWanted && recording { _ = BlinkListener.shared.start() }
        motion.stopDeviceMotionUpdates()
        guard !buffer.isEmpty else { return }
        let list = buffer
        buffer.removeAll()
        send("window.__kjBackfill && window.__kjBackfill(\(json(list)))")
    }

    // MARK: Filer åpnet i appen (0.18.1)

    /// En fil fra delearket («Åpne i Kjørerapport»): meldinger mellom elev og lærer, eksporterte turer og
    /// sikkerhetskopier. Teksten holdes til nettappen henter den (takeFile), også når appen startes av filen.
    func openFile(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url), data.count < 300_000_000 else { return }
        // iPhone legger en kopi i appens Inbox-mappe: den trengs ikke når teksten er lest
        if url.path.contains("/Inbox/") { try? FileManager.default.removeItem(at: url) }
        // Kø (0.18.3): flere filer rett etter hverandre skal ikke skyve hverandre ut. Høyst ti venter.
        pendingFiles.append((url.lastPathComponent, String(decoding: data, as: UTF8.self)))
        if pendingFiles.count > 10 { pendingFiles.removeFirst() }
        send("window.__kjFile && window.__kjFile()")
    }

    // MARK: Hjelp

    private func send(_ script: String) {
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    private func json(_ value: Any) -> String { Self.jsonString(value) }

    nonisolated private static func jsonString(_ value: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return "null" }
        return String(decoding: data, as: UTF8.self)
    }
}
