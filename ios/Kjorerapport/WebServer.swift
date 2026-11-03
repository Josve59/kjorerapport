import Foundation
import Network

/// Liten HTTP-server på 127.0.0.1 som viser nettappen fra appens egne filer (web/), uten nett.
/// Fast port, så nettappens lagring (IndexedDB) hører til samme opprinnelse hver gang appen åpnes.
nonisolated final class WebServer: @unchecked Sendable {
    static let port: UInt16 = 51789
    private let root: URL
    private let queue = DispatchQueue(label: "kjorerapport.webserver")
    private var listener: NWListener?

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func start() throws {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!)
        params.allowLocalEndpointReuse = true
        let listener = try NWListener(using: params)
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.start(queue: queue)
        self.listener = listener
    }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(connection, buffer: Data())
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, done, error in
            guard let self else { connection.cancel(); return }
            var buffer = buffer
            if let data { buffer.append(data) }
            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                self.respond(connection, head: String(decoding: buffer[..<end.lowerBound], as: UTF8.self))
            } else if done || error != nil || buffer.count > 65_536 {
                connection.cancel()
            } else {
                self.receive(connection, buffer: buffer)
            }
        }
    }

    private func respond(_ connection: NWConnection, head: String) {
        let request = head.split(separator: "\r\n").first?.split(separator: " ") ?? []
        let method = request.first.map(String.init) ?? "GET"
        var path = request.count > 1 ? String(request[1]) : "/"
        var query: [String: String] = [:]
        if let cut = path.firstIndex(where: { $0 == "?" || $0 == "#" }) {
            for pair in path[path.index(after: cut)...].split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1)
                if kv.count == 2 { query[String(kv[0])] = String(kv[1]) }
            }
            path = String(path[..<cut])
        }
        path = path.removingPercentEncoding ?? path
        if path.hasPrefix("/cam/") {
            // JPEG-kodingen tar noen millisekunder: utenfor serverens egen kø, så filene ikke venter
            let (p, q, head) = (path, query, method == "HEAD")
            DispatchQueue.global(qos: .userInitiated).async { self.cameraFrame(connection, path: p, query: q, head: head) }
            return
        }
        if path.hasSuffix("/") { path += "index.html" }
        let file = root.appendingPathComponent(String(path.drop(while: { $0 == "/" }))).standardizedFileURL

        var status = "200 OK", type = "text/plain; charset=utf-8", body = Data()
        // Bare filer inne i web/
        if file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) {
            body = data
            type = Self.mimeType(file.pathExtension)
        } else {
            status = "404 Not Found"
            body = Data("Fant ikke filen".utf8)
        }
        let header = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n"
        var out = Data(header.utf8)
        if method != "HEAD" { out.append(body) }
        connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
    }

    /// Siste bilde fra et kamera (CameraHub): /cam/user.jpg eller /cam/environment.jpg, valgfritt ?max=<lengste side>
    /// og ?after=<nummer> (204 hvis det ikke har kommet et nyere bilde). X-Age er bildets alder i millisekunder.
    private func cameraFrame(_ connection: NWConnection, path: String, query: [String: String], head: Bool) {
        let name = path.dropFirst("/cam/".count).replacingOccurrences(of: ".jpg", with: "")
        var header: String, body = Data()
        if let facing = CameraHub.Facing(rawValue: name),
           let f = CameraHub.shared.jpeg(facing, maxSide: Int(query["max"] ?? "") ?? 0, quality: Double(query["q"] ?? "") ?? 0.8, after: Int(query["after"] ?? "") ?? -1) {
            body = f.data
            header = "HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: \(body.count)\r\nX-Age: \(f.ageMs)\r\nX-Seq: \(f.seq)\r\nX-Size: \(f.width)x\(f.height)\r\n"
        } else {
            header = "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n"
        }
        header += "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
        var out = Data(header.utf8)
        if !head { out.append(body) }
        connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
    }

    static func mimeType(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": "text/html; charset=utf-8"
        case "js", "mjs": "text/javascript; charset=utf-8"
        case "css": "text/css; charset=utf-8"
        case "json", "webmanifest": "application/json"
        case "svg": "image/svg+xml"
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "woff2": "font/woff2"
        case "wasm": "application/wasm"
        case "pdf": "application/pdf"
        default: "application/octet-stream"
        }
    }
}
