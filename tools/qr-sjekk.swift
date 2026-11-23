// Leser QR-koder i PNG-filer med macOS sin egen QR-leser (Core Image), én linje per fil: teksten, eller INGEN.
// Brukes av tools/qr-sjekk.mjs for å sjekke QR-koderen på skolesiden (skole/qr.js).
import CoreImage
import Foundation

let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])
for path in CommandLine.arguments.dropFirst() {
    guard let image = CIImage(contentsOf: URL(fileURLWithPath: path)) else { print("INGEN"); continue }
    let text = detector?.features(in: image).compactMap { ($0 as? CIQRCodeFeature)?.messageString }.first
    // Linjeskift i teksten skrives som \n, så hver fil blir én linje
    print((text ?? "INGEN").replacingOccurrences(of: "\n", with: "\\n"))
}
