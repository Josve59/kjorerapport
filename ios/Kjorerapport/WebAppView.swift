import SwiftUI
import WebKit

/// Nettappen i en WKWebView. WKWebView (ikke SwiftUI sin WebView) fordi appen trenger egne svar på
/// tillatelser (kamera og bevegelse), en meldingsbro med svar, og et skript som lastes før nettappen.
struct WebAppView: UIViewRepresentable {
    let recorder: NativeRecorder

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let content = WKUserContentController()
        if let url = Bundle.main.url(forResource: "Bridge", withExtension: "js"), let source = try? String(contentsOf: url, encoding: .utf8) {
            content.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        content.addScriptMessageHandler(recorder, contentWorld: .page, name: "kj")
        #if DEBUG
        // Testbygg: nettappens console.log/warn/error og feil i Xcode-loggen
        content.addUserScript(WKUserScript(source: Self.consoleBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // Testbygg: SIMCTL_CHILD_KJ_EVAL=<fil.js> kjører et skript når siden er lastet (testdata til App Store-bildene)
        if let path = ProcessInfo.processInfo.environment["KJ_EVAL"], let source = try? String(contentsOfFile: path, encoding: .utf8) {
            content.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        #endif
        #if targetEnvironment(simulator)
        // Simulatoren har ingen bevegelsessensor: en telefon som ligger i ro, så sjekken før kjøring og opptaket kan testes
        content.addUserScript(WKUserScript(source: Self.simulatorMotion, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        #endif
        config.userContentController = content

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never   // nettappen bruker safe-area selv
        web.allowsBackForwardNavigationGestures = true   // sveip tilbake fra Personvern og siden for trafikkskoler
        web.uiDelegate = context.coordinator
        web.navigationDelegate = context.coordinator
        #if DEBUG
        web.isInspectable = true
        #endif
        recorder.webView = web
        var start = "http://127.0.0.1:\(WebServer.port)/index.html"
        #if DEBUG
        // Testbygg: SIMCTL_CHILD_KJ_HASH=#/kamera åpner en side direkte
        if let hash = ProcessInfo.processInfo.environment["KJ_HASH"] { start += hash }
        #endif
        web.load(URLRequest(url: URL(string: start)!))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    #if DEBUG
    private static let consoleBridge = """
    (() => {
      const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kj;
      if (!h) return;
      const send = (level, args) => { try { h.postMessage({ cmd: 'log', level, text: args.map(a => a instanceof Error ? a.stack || a.message : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').slice(0, 2000) }); } catch (e) {} };
      for (const level of ['log', 'warn', 'error']) { const orig = console[level].bind(console); console[level] = (...a) => { send(level, a); orig(...a); }; }
      window.addEventListener('error', e => send('error', [e.message + ' @ ' + e.filename + ':' + e.lineno]));
      window.addEventListener('unhandledrejection', e => send('error', ['unhandled: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)]));
    })();
    """
    #endif

    #if targetEnvironment(simulator)
    private static let simulatorMotion = """
    setInterval(() => {
      const n = () => (Math.random() - 0.5) * 0.04;
      const d = { acceleration: { x: n(), y: n(), z: n() }, accelerationIncludingGravity: { x: n(), y: -9.6 + n(), z: -1.9 + n() },
        rotationRate: { alpha: n(), beta: n(), gamma: n() }, interval: 16 };
      let ev = null;
      try { ev = new DeviceMotionEvent('devicemotion', d); } catch (e) { ev = null; }
      if (!ev || !ev.accelerationIncludingGravity) {
        ev = new Event('devicemotion');
        for (const k of Object.keys(d)) Object.defineProperty(ev, k, { value: d[k] });
      }
      window.dispatchEvent(ev);
    }, 16);
    """
    #endif

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        private func isApp(_ url: URL) -> Bool { url.host == "127.0.0.1" || ["about", "blob", "data"].contains(url.scheme ?? "") }

        // Kamera (valgfritt) og bevegelsessensorer: iPhone spør selv med tekstene i Info.plist
        func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin, initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType) async -> WKPermissionDecision {
            origin.host == "127.0.0.1" ? .grant : .deny
        }

        // (Denne har ingen async-variant i WebKit, så den må ha svar-blokken)
        func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
            decisionHandler(origin.host == "127.0.0.1" ? .grant : .deny)
        }

        // Lenker ut av appen (e-post, personvern i nettleseren) åpnes utenfor appen
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = navigationAction.request.url else { return .cancel }
            if isApp(url) { return .allow }
            if navigationAction.targetFrame?.isMainFrame ?? true {
                await UIApplication.shared.open(url)
                return .cancel
            }
            return .allow
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                if isApp(url) { webView.load(navigationAction.request) } else { UIApplication.shared.open(url) }
            }
            return nil
        }

        // Nettappens egne dialoger er HTML, men alert/confirm brukes noen steder som reserve
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
            _ = await present(message, cancel: false, on: webView)
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
            await present(message, cancel: true, on: webView)
        }

        private func present(_ message: String, cancel: Bool, on webView: WKWebView) async -> Bool {
            await withCheckedContinuation { done in
                let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                if cancel { alert.addAction(UIAlertAction(title: "Avbryt", style: .cancel) { _ in done.resume(returning: false) }) }
                alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done.resume(returning: true) })
                var top = webView.window?.rootViewController
                while let next = top?.presentedViewController { top = next }
                if let top { top.present(alert, animated: true) } else { done.resume(returning: false) }
            }
        }

        // Nettappen startes på nytt hvis iPhone har avsluttet den i bakgrunnen (lite minne)
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }
    }
}
