import CoreImage
import Foundation
import QuartzCore

/// Veibilder til modelltrening (1.0.4, bare i testbygg). Når eieren slår det på i utviklerdelen, lagres ett bilde fra
/// veikameraet hvert 2. sekund sammen med svaret feltmodellen ga på akkurat det bildet, og bilmodellens siste svar.
/// Bildene ligger i appens egen mappe (Documents/veibilder/<økt>/) til de hentes med kabel fra Macen
/// (`xcrun devicectl device copy from … --domain-type appDataContainer`). De sendes aldri noe sted. Ingen bilder av føreren.
nonisolated final class FrameLog: @unchecked Sendable {
    static let shared = FrameLog()

    static let every: CFTimeInterval = 2          // sekunder mellom to bilder
    static let maxBytes: Int64 = 4_000_000_000     // høyst 4 GB til sammen
    static let minFree: Int64 = 2_000_000_000      // og minst 2 GB ledig på telefonen

    private let lock = NSLock()
    private let ci = CIContext(options: [.workingColorSpace: NSNull(), .cacheIntermediates: false])
    private let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
    private var on = UserDefaults.standard.bool(forKey: "kj.frameLog")
    private var allowed = false      // settes når appen vet at den er et testbygg (devTools)
    private var session: URL?
    private var lastSave: CFTimeInterval = 0
    private var n = 0
    private var bytes: Int64 = -1   // brukt plass, regnes ut ved første bilde
    private var cars: (result: [String: Any], at: CFTimeInterval)?
    private var meta: [String: Any] = [:]

    static var root: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("veibilder", isDirectory: true)
    }

    /// Bare testbygg kan lagre bilder (nettappen alene kan ikke slå det på i App Store-utgaven)
    func allow(_ v: Bool) { lock.lock(); allowed = v; lock.unlock() }

    func set(_ v: Bool) {
        lock.lock(); on = v; session = nil; lock.unlock()
        UserDefaults.standard.set(v, forKey: "kj.frameLog")
    }

    /// Ny økt (ny mappe) neste gang et bilde lagres: kalles når kameraene startes
    func newSession() { lock.lock(); session = nil; lastSave = 0; lock.unlock() }

    /// Det appen vet om bilen akkurat nå (fart, dashbordkant, mørke), lagres med neste bilde
    func note(_ m: [String: Any]) { lock.lock(); for (k, v) in m { meta[k] = v }; lock.unlock() }

    /// Bilmodellens siste svar (på et bilde litt før eller etter)
    func noteCars(_ r: [String: Any]) {
        lock.lock(); if on && allowed { cars = (r, CACurrentMediaTime()) }; lock.unlock()
    }

    /// Kalles fra feltmodellens kø med bildet og svaret på det. Lagrer høyst hvert 2. sekund.
    func maybeSave(_ frame: CameraHub.Frame, lanes: [String: Any]) {
        let now = CACurrentMediaTime()
        lock.lock()
        guard on, allowed, now - lastSave >= Self.every else { lock.unlock(); return }
        lastSave = now
        let carsNow = cars, metaNow = meta, checkSpace = n % 25 == 0
        if bytes < 0 { bytes = Self.usedBytes() }
        let used = bytes
        lock.unlock()
        let fm = FileManager.default
        // Plass: stopper ved 4 GB eller når telefonen har under 2 GB ledig
        if checkSpace {
            let free = (try? Self.root.deletingLastPathComponent().resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?.volumeAvailableCapacityForImportantUsage ?? 0
            if used > Self.maxBytes || free < Self.minFree { return }
        }
        let dir: URL
        lock.lock()
        if let s = session { dir = s } else {
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd-HHmmss"; f.locale = Locale(identifier: "en_US_POSIX")
            dir = Self.root.appendingPathComponent(f.string(from: Date()), isDirectory: true)
            session = dir; n = 0
        }
        n += 1
        let k = n
        lock.unlock()
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let image = CIImage(cvPixelBuffer: frame.buffer)
        let opts = [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.8]
        guard let jpeg = ci.jpegRepresentation(of: image, colorSpace: sRGB, options: opts) else { return }
        var info: [String: Any] = metaNow
        info["at"] = Date().timeIntervalSince1970 * 1000
        info["w"] = frame.width; info["h"] = frame.height
        info["lanes"] = lanes
        if let c = carsNow { info["cars"] = c.result; info["carsAgeMs"] = Int((now - c.at) * 1000) }
        info["thermal"] = ProcessInfo.processInfo.thermalState.rawValue
        let name = String(format: "f%05d", k)
        guard (try? jpeg.write(to: dir.appendingPathComponent(name + ".jpg"))) != nil else { return }
        if let data = try? JSONSerialization.data(withJSONObject: info) { try? data.write(to: dir.appendingPathComponent(name + ".json")) }
        lock.lock(); bytes += Int64(jpeg.count) + 2_000; lock.unlock()
    }

    /// { on, count, bytes, sessions } til innstillingene
    func status() -> [String: Any] {
        let fm = FileManager.default
        var count = 0, total: Int64 = 0, sessions = 0
        for s in (try? fm.contentsOfDirectory(at: Self.root, includingPropertiesForKeys: nil)) ?? [] {
            sessions += 1
            for f in (try? fm.contentsOfDirectory(at: s, includingPropertiesForKeys: [.fileSizeKey])) ?? [] {
                if f.pathExtension == "jpg" { count += 1 }
                total += Int64((try? f.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
            }
        }
        lock.lock(); let v = on && allowed; lock.unlock()
        return ["on": v, "count": count, "bytes": total, "sessions": sessions]
    }

    /// Sletter alle lagrede bilder
    func clear() {
        lock.lock(); session = nil; n = 0; bytes = 0; lock.unlock()
        try? FileManager.default.removeItem(at: Self.root)
    }

    private static func usedBytes() -> Int64 {
        var total: Int64 = 0
        let fm = FileManager.default
        if let e = fm.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey]) {
            for case let f as URL in e { total += Int64((try? f.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0) }
        }
        return total
    }
}
