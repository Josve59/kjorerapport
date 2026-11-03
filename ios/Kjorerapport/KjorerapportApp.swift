import SwiftUI

/// Kjørerapport for iPhone (fase 1). Appen viser den samme rapporten, analysen og opplæringen som nettappen
/// (kopiert inn som web/ ved bygging), men måler selv med telefonens GPS og bevegelsessensorer, slik at
/// opptaket fortsetter også når skjermen er låst.
@main
struct KjorerapportApp: App {
    @State private var recorder = NativeRecorder()
    private let server: WebServer?

    init() {
        // Nettappen serveres fra telefonen selv (127.0.0.1 regnes som sikker, så kamera og sensorer virker)
        if let root = Bundle.main.url(forResource: "web", withExtension: nil) {
            let s = WebServer(root: root)
            try? s.start()
            server = s
        } else {
            server = nil
        }
    }

    var body: some Scene {
        WindowGroup {
            WebAppView(recorder: recorder)
                .ignoresSafeArea()
                .background(Color(uiColor: .systemBackground))
        }
    }
}
