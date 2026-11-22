# Kjørerapport – App Store package (phase 0)

Everything that will go into App Store Connect and the app's settings file when the iPhone app is built (phase 1). It is written for a native app in SwiftUI that records with the phone's own sensors and reuses today's analysis and report (see «Architecture» at the bottom). Today's web app is unchanged.

**Status, 22 November 2026 (app 1.0.0): ready to submit once the owner's developer account exists, after one road test.** The owner decided on 22 November: the name stays Kjørerapport, the lane model is `n2` (trained on comma10k and Audi's A2D2, with credit to Audi on the licence page, see «Models» below), messaging is «yes» in the age rating, and the privacy label is the one in section 4. The owner has a sole proprietorship (ENK) ready.

| # | What | Status |
| --- | --- | --- |
| 1 | **Models for sale** | **Done in 1.0.0.** D-FINE small (COCO only, Apache 2.0), road-tested since 0.13.17, is now the car model in git. The lane model is TwinLiteNet+ with the `n2` weights (comma10k MIT + A2D2 CC BY-ND 4.0), also road-tested since 0.13.7. Both are now in git, and the old overlay folder was renamed to `.local-test/app-models-n2/`, so Release builds no longer stop. |
| 2 | **Road-test the sale version** | **Owner drives.** 1.0.1 (1.0.0 plus the camera-start fix for builds from Xcode) with the shipping models was installed on the phone on 22 November. One long drive with both cameras, then `node tools/turrapport.mjs`. |
| 3 | **Screenshots** | **Done 22 Nov:** eight new images for 1.0.0, theory first, and a new `kjop-pluss-review.png` (section 9). |
| 4 | **Description, promotional text, keywords** | Done (18 Nov); 1.0.0 adds the safety quiz. The owner reads it through. |
| 5 | **Review notes** | Updated 22 Nov (section 7): the two code buttons, the safety quiz, and a driving-school code for the reviewer. |
| 6 | **Age rating** | **Decided:** «Messaging and Chat» yes, everything else no (section 6). |
| 7 | **Privacy label** | **Decided:** section 4. `PrivacyInfo.xcprivacy` says the same. |
| 8 | **A driving teacher reviews the theory and the theory book** | Owner, open. Apple does not require it, but schools will ask. |
| 9 | **The name** | **Decided:** Kjørerapport (in the App Store «Kjørerapport: Øvelseskjøring»). |
| 10 | **Signing** | Renewed 22 Nov, valid until 29 Nov 02:14. From the 28th the paid account takes over. |

**Models.** The lane weights `n2` are trained on comma10k (MIT) and Audi's A2D2 (CC BY-ND 4.0). The licence allows commercial use with credit, which is on `lisenser/index.html` (Om appen › Lisenser og kilder). Whether trained weights count as «adapted material» under the no-derivatives term is unsettled; the owner knows and decided on 22 November 2026 to ship it. If Audi ever objects, swap in the comma10k-only weights (`ios/Models/lanes-comma10k.pth`) in an update.

After the 28th: enrolment (1–2 days, sometimes more), agreements, bank and tax, TestFlight on the owner's phone and preferably one other iPhone, then review (1–3 days). A realistic release date is the first half of December.

The step-by-step guide is [`innsending.md`](innsending.md) (Norwegian). Its «Allerede ferdig» list is from 5 November: see the table above.

---

## 1. What you need to do yourself

| What | Why | Where |
|---|---|---|
| Install **Xcode** (free, about 15 GB) | Needed to build and test the iPhone app | Mac App Store |
| Create an **Apple Developer** account (about NOK 1,200 a year) | TestFlight on your own phone and publishing | developer.apple.com/programs |
| Enrol as an **individual** | An ENK is not a legal entity, so Apple only accepts it as an individual. Your legal name is shown as the seller. Requires age 18 | Same place |
| Check that the name **«Kjørerapport»** is free | The name must be unique in the App Store | App Store Connect when the app is created |
| Set the **price** | Decided 18 Nov: the app is free to download; «Kjørerapport Pluss» is a one-time in-app purchase at NOK 499 for the whole family (section 12). Driving schools: NOK 350 per pupil excl. VAT, invoiced directly (see section 12) | App Store Connect |
| Sign the **Paid Applications agreement** and add bank and tax details | Needed before any in-app purchase can be sold | App Store Connect › Business |

---

## 2. App information (App Store Connect)

| Field | Text | Length |
|---|---|---|
| **Name** | Kjørerapport: Øvelseskjøring | 28 of 30 |
| **Subtitle** | Teoriprøve og øvelseskjøring | 28 of 30 |
| **Keywords** | `teoriprøve,førerkort,lappen,trafikkskole,skilt,ledsager,oppkjøring,fartsgrense,sikkerhetskontroll` | 100 of 100 bytes |
| **Promotional text** | Øv til lappen i én app: teoriprøven med 420 spørsmål, sikkerhetskontrollen og en rapport etter hver øvingstur. Prøv 10 teorispørsmål gratis. | 140 of 170 |
| **Description** | See [`beskrivelse.txt`](beskrivelse.txt) (rewritten 18 Nov for 0.23.0: theory first) | 3343 of 4000 |
| **Primary language** | Norwegian (Bokmål) | |
| **Primary category** | Education | |
| **Secondary category** | Navigation | |
| **Price** | Free (with the in-app purchase «Kjørerapport Pluss», section 12) | |
| **Availability** | Norway (speed limits and road data only cover Norway) | |
| **Privacy policy URL** | https://kjorerapport.jo-9fc.workers.dev/personvern/ (updated for the app before submission, see section 5) | |
| **Support URL** | https://kjorerapport.jo-9fc.workers.dev/hjelp/ (help page with FAQ and email, 0.11.4) | |
| **Marketing URL** (optional) | https://kjorerapport.jo-9fc.workers.dev/trafikkskole/ | |
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

**Decided 22 November 2026 (the owner said yes).** Answer «Yes, we collect data» with these three types. For each: purpose **App Functionality**, **not linked** to the user's identity, **not used for tracking**.

| Type in App Store Connect | What leaves the phone | Why |
| --- | --- | --- |
| Location › Precise Location | Positions along the route, sent to Statens vegvesen (NVDB) and Kartverket | Speed limits, road data, maps and place names. Answered right away; nothing is kept. |
| Identifiers › User ID | The access code from the driving school, only if the user enters one | The school-code server checks that the code is valid and how many phones use it. |
| Identifiers › Device ID | A random key the app makes for this installation, only with a school code | So one pupil's code works on at most two phones. It is not the advertising ID. |

Not collected: drives, marks, notes, the training plan, camera data and theory progress all stay on the phone, and purchases go through Apple. «Send turen til utvikleren» exists only in the web version and in test builds (TestFlight, Xcode), never in the App Store build (`devBuild` in app.js), so tester drives are not part of this label. `ios/Kjorerapport/PrivacyInfo.xcprivacy` lists the same three types.

**Must be checked again** before a version that adds analytics, third-party crash reporting, an account, cloud backup, iCloud sharing for the teacher messages (planned), or sending data to driving schools or insurers.

---

## 5. Privacy policy

**Done (checked 22 November 2026).** `personvern/` covers both the web version and the iPhone app: storage on the phone and deletion with the app, recording with the screen locked, both cameras, NVDB and Kartverket, the school-code server, Cloudflare for the web version, purchases through Apple, and the tester section (web and TestFlight only).

---

## 6. Age rating

**Decided 22 November 2026:** answer **yes** to «Messaging and Chat». When a learner is connected to a driving school, the learner and the driving teacher send each other messages about the drives (as files through the iOS share sheet, to someone they already know; no chat service, no user directory, no way to reach strangers). Answer «No» / «None» to everything else:
- no violence, gambling, profanity or medical content;
- no user-generated content shown to others than the one teacher or learner;
- no unrestricted web access (the help and privacy pages are the app's own);
- no advertising;
- no parental controls or age assurance.

Apple works out the rating from the answers, so it will probably be higher than 4+. That is fine as long as it is below 16+, since learners start theory at 15. If Apple's result is 16+ or higher, stop and check before submitting. The in-app purchase does not affect the rating.

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
>
> **In-app purchase.** One non-consumable, «Kjørerapport Pluss» (one-time, Family Sharing on, no trial). It unlocks the full theory practice and the safety check (with a 59-question quiz), the cameras, the training plan, the driving-teacher summary, «Hva må du øve mer på?» and reports for drives older than the 10 latest. Free for everyone: recording, the report, the map, speed limits, data export, and 10 theory questions (tab «Opplæring» › «Teori og sikkerhet» › «Prøv 10 gratis spørsmål»). Every locked theory tile opens the Pluss screen; it is also under Settings (gear icon) › «Kjørerapport Pluss». «Gjenopprett kjøp» (Restore) and «App Store-kode» (Apple offer codes) are on the same screen.
>
> **«Kode fra trafikkskolen» (driving-school code):** Norwegian driving schools buy access for their own pupils from us under a written agreement and give each pupil a personal code (guideline 3.1.3(c): sold directly to organisations for their students, never to individuals). The app shows no school prices and no links to buy outside the App Store. A code for review: REVIEW_CODE (Pluss screen › «Kode fra trafikkskolen»).
>
> **Messages between learner and driving teacher:** sent as a file through the iOS share sheet (Messages, Mail, AirDrop) to someone the user already knows. The app has no chat service, no server and no user directory.
>
> **Cameras on the simulator or without a car:** the cameras need a real device mounted in a car to be useful. They can be started under Home › «Kamera: speil- og skulderblikk» › «Start kamera».

Contact information: your name, phone and email. No demo account is needed (no login). Replace REVIEW_CODE with the code in `.local-test/skolekoder/apple-review.txt` (made for Apple, 5 phones, never in git).

---

## 8. Risk list against the App Store Review Guidelines

| Guideline | Risk | What we do |
|---|---|---|
| **4.2 Minimum Functionality** | A web page in a frame is rejected | Native recording with GPS and motion sensors (also with the screen locked), native tab bar, permissions and sharing. A Live Activity on the lock screen and in the Dynamic Island shows the running trip (time and distance). The report is reused, but the app does far more than a web page |
| **1.4.1 / safety while driving** | Apps that make people use the phone while driving | The companion operates the app, the driver does not. No reading during the drive except the speed limit. Stated clearly in the onboarding and the review notes |
| **2.5.4 Background modes** | Background location without a clear need | Only during an active recording, «Når appen er i bruk» |
| **5.1.1 Privacy** | Missing privacy policy or unclear permission texts | Section 3 and 5, link in the app (Innstillinger › Om appen) |
| **2.1 App Completeness** | Words like «testversjon», developer buttons and empty screens | Remove «Testversjon» from the text and hide developer features in the App Store version (keep them in TestFlight) |
| **2.3 Accurate Metadata** | Screenshots that show something the app does not do, or other brands | Screenshots from the real app, no car brands |
| **5.2 Intellectual Property** | Third-party data and fonts | NVDB and Kartverket: open data under NLOD/CC BY 4.0, the source credited in the app. Overpass (OFL), Leaflet (BSD), MediaPipe and D-FINE (Apache 2.0): listed under Om appen › Lisenser og kilder (D-FINE added in 0.10.0) |
| **4.0 Design** | Text that does not scale, small touch targets | Already fixed in 0.9.15 (Dynamic Type, 44 pt) |

---

## 9. Screenshots

**Done (22 November 2026, app 1.0.0):** eight images in [`skjermbilder/`](skjermbilder/), 1320 × 2868 (6.9-inch iPhone, Apple scales them down to smaller phones). Theory is the main selling point, so it comes first. Upload them in this order:

1. `01-teori.png` «Klar til teoriprøven» – the theory overview (Opplæring › Teori og sikkerhet): readiness ring 72 %, today's goal, the exam date and the last three practice tests.
2. `02-sporsmal.png` «Tegninger og forklaring» – a theory question (fog lights) just after a right answer: the right option, the drawing of a road in fog, the rule, the legal reference and «Les mer i teoriboka». Scrolled so the whole explanation shows; the question itself is above.
3. `03-kryss.png` «Hvem kjører først?» – a crossing with three cars on a priority road, the first car tapped.
4. `04-sikkerhet.png` «Sikkerhetskontrollen» – a safety-check quiz question with the drawing of the car's brake lights.
5. `05-rapport.png` «Rapport etter hver øvingstur» – the top of the report: score, «Nytt på denne turen» and «Kort fortalt».
6. `06-opptak.png` «Bare fartsgrensen på skjermen» – a real recording in the simulator (simulated position along `ios/testrute-trondheim.txt`), with the speed limit from NVDB and without the test buttons.
7. `07-kart.png` «Se hvor det skjedde» – the map in full screen with numbered events (braking, acceleration, turns) and speeding in red on the route.
8. `08-laerer.png` «Klar til neste kjøretime» – Til trafikklæreren: what has been practised since the last lesson, and what to work on.

[`kjop-pluss-review.png`](kjop-pluss-review.png) (retaken 22 November): the Pluss page as a new user sees it, with «Kjøp for 499,00 kr». A raw screenshot without caption, for the purchase review in App Store Connect.

How they were made:
- From the real app (Debug build) in the simulator: iPhone 18 Pro Max, light mode, Norwegian, the status bar set to 09:41 (`xcrun simctl status_bar <id> override --time 9:41 …`).
- The data is the made-up learner «Emma», as in the in-app demo (`js/demo.js`) but stored as normal data, so the demo bar never shows: eight practice drives along public streets in central Trondheim, theory with three practice tests and an exam date, and signs and the safety check half done. No real person's drives or addresses are shown. Pluss is on in images 1–8.
- The tools are in [`verktoy/`](verktoy/):
  - `seed.js` fills in the test data through the Debug-only `KJ_EVAL` hook (`WebAppView.swift`). The first time, it deletes all drives and settings in the simulator app. The newest drive keeps the speed limit, so the report shows progress and still has something to practise.
  - `shot.sh` takes one screenshot from the simulator.
  - `compose.py` adds the captions from `captions.json` (`~/.local/mlenv/bin/python compose.py`, needs Pillow). Colours from the design profile «Skilt og vei»: road-sign blue background, a yellow centre line and white Overpass text. The phone sits in the same place on every image.
  - `pluss-av.js` turns Pluss off and answers with the App Store price, for the review screenshot. Set the view to «Som App Store» first, or the test build turns Pluss back on.
  - Raw screenshots go to `verktoy/raw/raw-<name>.png` (git-ignored).
- For the 1.0.0 set, the app was driven by the remote control in the git-ignored `.local-test/sim/` (`driver.mjs` + `agent.js`, loaded together with `seed.js`), with helper scripts in `.local-test/appstore-shots/` that open a given question, tap the cars and scroll to a spot where no text is cut by the tab bar.
- To make new ones, ask Claude to «lag nye App Store-bilder».

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
- **Done in 0.9.20: «Testversjon» removed from the texts.** The developer section exists only in Xcode and TestFlight (`AppTransaction` environment), not in the App Store version.
- **Done in 0.9.21: Om appen › «Lisenser og kilder»** (`lisenser/`): Leaflet (BSD-2), MediaPipe (Apache 2.0), Overpass (OFL 1.1), Kartverket (CC BY 4.0), NVDB (NLOD 2.0). D-FINE (Apache 2.0) was added in 0.10.0, when the road camera came into the iPhone app. ONNX Runtime is only in the camera test app.

## 11. Architecture for phase 1 (summary)

- **SwiftUI** (iOS 26+): tab bar (Hjem, Turer, Opplæring, Trafikklærer), start and recording screen, permissions, settings.
- **Recording natively:** CoreLocation (1 Hz, background during recording) and CoreMotion (100 Hz), saved in the same JSON format as today. That gives one data format, and old drives can be imported.
- **Analysis and report:** today's `js/` files bundled in the app and shown in a `WebView` (SwiftUI, iOS 26) without the network. Native and web talk via JavaScript calls (`callJavaScript`) and a custom URL scheme. No duplicate code to maintain.
- **Data:** drives in the app's own storage (not Safari). iCloud backup can come later (then the privacy label must be checked again).
- **Done in 0.10.0 (phase 2):** both cameras at once (`AVCaptureMultiCamSession`), with car detection as Core ML on the phone (D-FINE xlarge, GPU). The face model still runs in the web view on frames from the app. The app is about 157 MB because of the model.

---

## 12. Kjørerapport Pluss (in-app purchase, 0.11.0)

**In App Store Connect** (the app › Monetization › In-App Purchases › +):

| Field | Value |
| --- | --- |
| Type | **Non-Consumable** |
| Reference name | Pluss |
| Product ID | `net.svendsenmedia.kjorerapport.pluss` (must match `PlusStore.swift` exactly) |
| Price | NOK 499 (price point 499,00), decided 18 Nov 2026 |
| Family Sharing | **On** (the app says the purchase works for the whole family) |
| Display name (Norwegian) | Kjørerapport Pluss |
| Description (Norwegian) | Hele teorien, kameraene, opplæringsplanen, trafikklæreren og alle rapportene. Ett kjøp, ikke abonnement. |
| Review screenshot | A screenshot of the Pluss screen (Innstillinger › Se Pluss) |
| Review note | «Unlocks the full theory practice and safety check, the cameras, the training plan, the driving-teacher summary and all older reports. Restore is on the same screen.» |

**No free trial (decided 18 Nov 2026, 0.23.0).** Many learners buy a theory app 7–14 days before the test, so a 14-day trial would have given the whole theory away. Do **not** create the old «14-day Trial» product (`…pluss.trial14`); the app no longer asks for it. Instead, 10 fixed theory questions are free (`FREE_THEORY` in `js/plus.js`).

- The first in-app purchase must be **submitted together with an app version** (choose it under «In-App Purchases» on the version page).
- The **Paid Applications agreement**, bank and tax details must be in place, or the product will show «Får ikke kontakt med App Store».
- **Small Business Program** (developer.apple.com): Apple then takes 15 % instead of 30 %. Apply before the first sale.
- **Codes for driving schools:** for a pilot, Apple offer codes (Monetization › In-App Purchases › Pluss › Offer Codes) can be given away free; the pupils use «Kode fra trafikkskolen» on the Pluss screen. They may **not** be sold. Paid school deals (NOK 350 per pupil excl. VAT, invoiced directly) need our own access codes with a small server (planned after launch), sold only to driving schools under guideline 3.1.3(c), never to individuals, and with no school price or link shown in the app.

**Testing without paying:**
- **In Xcode:** ▶︎ in Xcode uses `ios/Pluss.storekit` (chosen in the shared scheme «Kjorerapport»). The purchase sheet appears, nothing is charged, and Debug › StoreKit › Manage Transactions lets you delete the purchase to test again.
- **TestFlight:** testers buy with their own Apple ID in the sandbox, free of charge.
- **The developer section:** the view mode («Gratis» / «Pluss») forces Pluss off or on in Xcode and TestFlight builds.

**What is free and what is Pluss** (`js/plus.js`):
- **Free:** recording, report, map, speed limit, speed-camera warnings, guides, driving log, export and backup, reports for the 10 latest real drives, and 10 theory questions (with the theory-book sections they link to).
- **Pluss:** all theory (420 questions, 123 signs, exams, theory book, sign test and sign cards, «Hvem kjører først?», mistakes and bookmarks) and the safety check (since 0.23.0), the cameras, the training plan (with hotspots), the driving-teacher summary, «Hva må du øve mer på?» and reports for all older drives.
- **Nothing is ever deleted or held back:** a locked report shows «Eksporter turen».
- **The web version in Safari** keeps everything else free, but not the theory (`WEB_THEORY` in `js/plus.js`): Pluss cannot be bought there, so it shows the 10 free questions. It cannot record with the screen locked or use both cameras.
