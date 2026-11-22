import SwiftUI

/// Kjørerapport for iPhone (fase 1). Appen viser den samme rapporten, analysen og opplæringen som nettappen
/// (kopiert inn som web/ ved bygging), men måler selv med telefonens GPS og bevegelsessensorer, slik at
/// opptaket fortsetter også når skjermen er låst.
@main
struct KjorerapportApp: App {
    @State private var recorder = NativeRecorder()
    @Environment(\.scenePhase) private var scenePhase
    private let server: WebServer?

    init() {
        // Nettappen serveres fra telefonen selv (127.0.0.1 regnes som sikker, så kamera og sensorer virker)
        if let root = Bundle.main.url(forResource: "web", withExtension: nil) {
            let s = WebServer(root: root)
            try? s.start()
            server = s
            WebServer.shared = s
        } else {
            server = nil
        }
    }

    var body: some Scene {
        WindowGroup {
            WebAppView(recorder: recorder)
                .ignoresSafeArea()
                .background(Color(uiColor: .systemBackground))
                // «Åpne i Kjørerapport» fra Meldinger, Mail, Filer eller AirDrop (0.18.1): nettappen henter filen
                .onOpenURL { url in recorder.openFile(url) }
        }
        // Tilbake fra bakgrunnen: den lokale serveren startes på nytt. 1.0.3: iPhone stenger den mens appen ligger
        // i bakgrunnen uten et opptak, men den sier fortsatt at den er klar. Målt 22. nov.: etter 3 min med låst skjerm
        // fikk nettappen bare feil fra serveren, så kameraene startet ikke før appen ble lukket og åpnet igjen.
        // Ikke når appen starter (da lastes siden fra den).
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { Self.wasInBackground = true }
            if phase == .active { server?.restart(force: Self.wasInBackground); Self.wasInBackground = false }
        }
    }

    @MainActor private static var wasInBackground = false
}
