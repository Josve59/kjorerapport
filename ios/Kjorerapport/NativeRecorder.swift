import CoreLocation
import CoreMotion
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
    private var inBackground = false
    private var buffer: [[String: Any]] = []   // målinger mens appen er i bakgrunnen
    private let gravity = 9.80665

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        location.activityType = .automotiveNavigation
        location.pausesLocationUpdatesAutomatically = false
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    // MARK: Meldinger fra nettappen

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return (nil, "ukjent melding") }
        switch cmd {
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
        case "recStop":
            recording = false
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

    private var authorizationName: String {
        switch location.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: "ok"
        case .denied, .restricted: "nei"
        default: "ukjent"
        }
    }

    private func startLocation() {
        if location.authorizationStatus == .notDetermined { location.requestWhenInUseAuthorization() }
        location.startUpdatingLocation()
    }

    // MARK: Posisjon

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations {
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
        case .authorizedWhenInUse, .authorizedAlways: if watching || recording { manager.startUpdatingLocation() }
        default: break
        }
    }

    // MARK: Bakgrunn

    @objc private func didEnterBackground() {
        inBackground = true
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
        motion.stopDeviceMotionUpdates()
        guard !buffer.isEmpty else { return }
        let list = buffer
        buffer.removeAll()
        send("window.__kjBackfill && window.__kjBackfill(\(json(list)))")
    }

    // MARK: Hjelp

    private func send(_ script: String) {
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    private func json(_ value: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return "null" }
        return String(decoding: data, as: UTF8.self)
    }
}
