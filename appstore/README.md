# Kjørerapport – App Store package (phase 0)

Everything that will go into App Store Connect and the app's settings file when the iPhone app is built (phase 1). It is written for a native app in SwiftUI that records with the phone's own sensors and reuses today's analysis and report (see «Architecture» at the bottom). Today's web app is unchanged.

Status, 3 November 2026: text and plans are ready. Before phase 1, Xcode must be installed and an Apple Developer account created.

---

## 1. What you need to do yourself

| What | Why | Where |
|---|---|---|
| Install **Xcode** (free, about 15 GB) | Needed to build and test the iPhone app | Mac App Store |
| Create an **Apple Developer** account (about NOK 1,200 a year) | TestFlight on your own phone and publishing | developer.apple.com/programs |
| Choose **personal or company account** | A company (Svendsen Media) shows the company name in the App Store, but needs a D-U-N-S number (free, takes 1–2 weeks) | Same place |
| Check that the name **«Kjørerapport»** is free | The name must be unique in the App Store | App Store Connect when the app is created |
| Decide on the **price** | Recommendation: free while it is being tested | App Store Connect |

---

## 2. App information (App Store Connect)

| Field | Text | Length |
|---|---|---|
| **Name** | Kjørerapport: Øvelseskjøring | 28 of 30 |
| **Subtitle** | Tilbakemelding etter hver tur | 29 of 30 |
| **Keywords** | `førerkort,lappen,kjøreskole,trafikkskole,ledsager,elev,kjøretime,fartsgrense,speil,oppkjøring` | 97 of 100 bytes |
| **Promotional text** | Øv smartere på lappen. Kjørerapport måler bremsing, gass, svinger og fart på hver øvingstur, og forteller hva dere bør øve på neste gang. | 137 of 170 |
| **Description** | See [`beskrivelse.txt`](beskrivelse.txt) | 2058 of 4000 |
| **Primary language** | Norwegian (Bokmål) | |
| **Primary category** | Education | |
| **Secondary category** | Navigation | |
| **Price** | Free | |
| **Availability** | Norway (speed limits and road data only cover Norway) | |
| **Privacy policy URL** | https://josve59.github.io/kjorerapport/personvern/ (updated for the app before submission, see section 5) | |
| **Support URL** | https://josve59.github.io/kjorerapport/trafikkskole/ or a separate support page with an email address | |
| **Copyright** | © 2026 Svendsen Media (or your name with a personal account) | |

Notes on the text:
- Words in the name are not repeated in the keywords (Apple counts them anyway).
- No other app names (SafeDrive and similar) and no car brands (Tesla) in the metadata. That is a rejection reason (guideline 2.3.7).
- Promises are kept modest: «veiledende», «øvingshjelp». No claims about safety or passing.

---

## 3. Permission texts (Info.plist)

Shown in iPhone's own permission prompts. Written so that people understand what they say yes to (`privacy.md › Requesting permission`). Request each one only when it is needed: location and motion when the companion presses Start for the first time, the camera only when the camera is switched on.

| Key | Text |
|---|---|
| `NSLocationWhenInUseUsageDescription` | Kjørerapport bruker posisjonen under kjøreturen for å måle fart og rute og vise fartsgrensen. Posisjonen lagres bare på telefonen. |
| `NSMotionUsageDescription` | Bevegelsessensorene måler bremsing, akselerasjon og svinger under kjøreturen. Målingene lagres bare på telefonen. |
| `NSCameraUsageDescription` | Kameraet er valgfritt. Det ser på veien foran eller på føreren (speil og skulderblikk). Bildene analyseres på telefonen og lagres eller sendes aldri. |

**Background:** `UIBackgroundModes` = `location`. Recording runs with **«Når appen er i bruk»** (not «Alltid»). With `allowsBackgroundLocationUpdates` the recording continues with the screen locked, and iPhone shows the blue location indicator. That is enough to avoid gaps in the drive, and it is the least intrusive choice (guideline 2.5.4: background location only for what the user has asked for).

Ready-to-use snippet: [`Info-tillatelser.plist`](Info-tillatelser.plist).

---

## 4. Privacy label («App Privacy» in App Store Connect)

**Recommended answer: «Data Not Collected».**

Reasoning, against Apple's definition («collect» = data leaves the phone in a way that lets you or partners access it for longer than needed to answer the request right away):
- Drives, marks, notes, the training plan and camera angles are stored only on the phone. There is no server, no account, no analytics and no ads.
- Location points sent to Statens vegvesen (NVDB) and Kartverket are lookups answered right away (speed limits, maps, place names). We do not store them, and they are not used for tracking.
- Sharing a report, PDF or backup is something the user does themselves (share sheet), not collection by the app.
- Feedback by email is sent by the user from their own email app.

**Must be checked again** if the app gets analytics, crash reporting from a third party, an account, cloud backup, or sending to driving schools or insurers. Then the label must be updated *before* that version is released.

---

## 5. Privacy policy – what must change for the app

The current page (`personvern/`) is good. For the iPhone app, change:
- «telefonens egne nettleserlagring» → «appens lagring på telefonen» (deleted when the app is deleted).
- «Appen kjører ikke i bakgrunnen» → «Under et opptak fortsetter posisjon og bevegelse å måles også med låst skjerm. Når opptaket er stoppet, brukes ingen sensorer.»
- Remove GitHub Pages from the table (the app is downloaded from the App Store; Apple's own terms apply).
- Sletting: «Slett appen, så forsvinner alt» instead of website data in the browser.
- The camera: describe the road camera as well (cars, lane lines, speed signs), still analysed only on the phone.

---

## 6. Age rating

Answer «No» / «None» to every question (no violence, gambling, profanity, user-generated content shared with others, web browsing, purchases). That gives **4+**. The app is meant for 15–17-year-olds and their companions, but the age rating describes content, not the target group.

---

## 7. Notes for App Review

Paste into «Notes» under App Review Information (in English, since the reviewers write in English):

> Kjørerapport is a practice aid for Norwegian learner drivers (age 16+) who practise with a licensed companion («ledsager»), as required by Norwegian law.
>
> **Safety by design:** the phone sits in a car mount. The companion in the passenger seat starts and stops recording; the driver never touches the phone. During a drive the screen shows only the current speed limit and a large stop button; speed camera warnings are audible. All feedback comes after the drive.
>
> **How to review without driving:** on the home screen tap «Se en demotur» to open a full sample report (map, events, practice suggestions). Settings (gear icon) › «Avansert» › «Spill av en demotur» replays a simulated 5-minute drive through the recorder at 10× speed (about 30 seconds), with the speed limit sign on screen. It stops by itself and opens the report.
>
> **Background location:** used only while a recording that the user started is running, so the drive is not cut off when the screen locks. Authorization is «While Using»; no «Always» permission is requested.
>
> **No account, no server, no tracking.** Drives stay on the device. Speed limits and maps are looked up from the Norwegian Public Roads Administration (NVDB) and the Norwegian Mapping Authority (Kartverket).
>
> **Camera (optional):** off by default. When enabled, face and road analysis run on-device; no images or video are stored or transmitted.

Contact information: your name, phone and email. No demo account is needed (no login).

---

## 8. Risk list against the App Store Review Guidelines

| Guideline | Risk | What we do |
|---|---|---|
| **4.2 Minimum Functionality** | A web page in a frame is rejected | Native recording with GPS and motion sensors (also with the screen locked), native tab bar, permissions and sharing. Planned in phase 1: a Live Activity with timer on the lock screen. The report is reused, but the app does far more than a web page |
| **1.4.1 / safety while driving** | Apps that make people use the phone while driving | The companion operates the app, the driver does not. No reading during the drive except the speed limit. Stated clearly in the onboarding and the review notes |
| **2.5.4 Background modes** | Background location without a clear need | Only during an active recording, «Når appen er i bruk» |
| **5.1.1 Privacy** | Missing privacy policy or unclear permission texts | Section 3 and 5, link in the app (Innstillinger › Om appen) |
| **2.1 App Completeness** | Words like «testversjon», developer buttons and empty screens | Remove «Testversjon» from the text and hide developer features in the App Store version (keep them in TestFlight) |
| **2.3 Accurate Metadata** | Screenshots that show something the app does not do, or other brands | Screenshots from the real app, no car brands |
| **5.2 Intellectual Property** | Third-party data and fonts | NVDB and Kartverket: open data under NLOD/CC BY 4.0, the source credited in the app. Overpass (OFL), Leaflet (BSD), D-FINE (Apache 2.0), ONNX Runtime (MIT): list them in Innstillinger › Om appen › Lisenser |
| **4.0 Design** | Text that does not scale, small touch targets | Already fixed in 0.9.15 (Dynamic Type, 44 pt) |

---

## 9. Screenshots

Required: **6.9-inch iPhone**, 1320 × 2868 portrait (Apple scales down to smaller phones). 3–10 images. They are taken from the real app in the simulator in phase 1, in light mode, with a short caption on top in Norwegian:

1. **«Tilbakemelding etter hver tur»** – the top of the report: score ring, «Kort fortalt», «Neste øvingstur».
2. **«Se hvor det skjedde»** – the map with numbered events and route.
3. **«Øv på det som trengs»** – «Neste øvingstur» with two concrete practice items.
4. **«Klar til kjøretimen»** – «Til trafikklæreren» with time, road types and «Bør jobbes med».
5. **«Følg fremgangen»** – Turer / kjørelogg with road types and darkness.
6. **«Fartsgrensen hele veien»** – the recording screen with the speed limit sign and the stop button (from the demo replay).

Use the demo drive or a real drive without personal place names in a visible position (pick a route in a central area).

---

## 10. App icon

- [`ikon-1024.png`](ikon-1024.png): 1024 × 1024, square without rounded corners (iPhone rounds them itself), no transparency, the same artwork as today's icon so existing users recognise it.
- [`ikon-1024-mork.png`](ikon-1024-mork.png): variant for dark home screens (iOS 18+).
- [`ikon.svg`](ikon.svg): the source. The spokes stop inside the rim and go into the hub. In today's icon the rounded ends stuck out over the rim; the web app's icons can be updated to match.
- No text in the icon, the motif centred (`app-icons.md › Best practices`).
- In phase 1 it can be built as a layered icon in Icon Composer (for Liquid Glass): background, ring and steering wheel as separate layers.

---

## 11. Must be in the app before submission (phase 1)

- **Done in 0.9.19: the button «Spill av en demotur»** under Innstillinger › Avansert, visible to everyone, so Apple can test without driving.
- **Done in 0.9.18: a short intro on first launch** (3 screens): the phone in a holder, the companion operates it, the driver does not touch it. The permission prompts come when Start is pressed, not at launch.
- **«Testversjon»** removed from the texts. Developer features shown only in TestFlight.
- **Om appen › Lisenser** with open data and code (NVDB, Kartverket, Overpass, Leaflet, D-FINE, ONNX Runtime, MediaPipe).

## 11. Architecture for phase 1 (summary)

- **SwiftUI** (iOS 26+): tab bar (Hjem, Turer, Opplæring, Trafikklærer), start and recording screen, permissions, settings.
- **Recording natively:** CoreLocation (1 Hz, background during recording) and CoreMotion (100 Hz), saved in the same JSON format as today. That gives one data format, and old drives can be imported.
- **Analysis and report:** today's `js/` files bundled in the app and shown in a `WebView` (SwiftUI, iOS 26) without the network. Native and web talk via JavaScript calls (`callJavaScript`) and a custom URL scheme. No duplicate code to maintain.
- **Data:** drives in the app's own storage (not Safari). iCloud backup can come later (then the privacy label must be checked again).
- **Later (phase 2):** the camera on the Neural Engine (Core ML/Vision) instead of WebGPU in the browser.
