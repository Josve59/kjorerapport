# Kjørerapport

An installable web app (PWA) that records a car drive with the phone's own GPS, gyroscope and accelerometer, and gives the learner driver a feedback report afterwards. Everything stays on the phone. No accounts, no server, no analytics.

Plain HTML, CSS and JavaScript. No build step. Open `index.html` through any web server and it runs.

```
index.html             the app shell (all five screens)
css/app.css            styling, light and dark mode
js/analysis.js         the analysis engine (your prototype code, unchanged, wrapped as a module)
js/recorder.js         sensor recording, wake lock, hidden-gap marking, checkpoints
js/db.js               IndexedDB storage (drives + raw-data chunks) and settings
js/report.js           the report: speed sign, SVG route map, score bars, tips, speed chart, events
js/app.js              screens, routing, settings, export, hidden developer option
js/format.js           Norwegian number, time and date formatting
js/ui.js               icons, toasts, dialogs, route thumbnails, score badges, mark categories, practice goals
js/log.js              driving log: road type, sun altitude and light, weekly totals
js/insights.js         practice suggestions, hotspots, same-route matching, training plan
sw.js                  service worker: caches everything so the app works offline
manifest.webmanifest   PWA manifest
fonts/                 Overpass (self-hosted, variable weight)
icons/                 app icons
tests/                 unit tests for the analysis engine
```

## Running the tests

Node.js 20 or newer is needed (only for the tests, not for the app). Then:

```bash
npm test
```

Expected: 53 passing tests. They check that the demo drive gives about 4.2 km, exactly three events (harsh acceleration ≈ 0.40 g at 1:52, harsh braking ≈ 0.47 g at 3:02, harsh turn ≈ 0.49 g at 3:12), an overall score of 82, that sensitivity presets scale the thresholds, and that the GPS fallback for turns works.

## Running it locally on the Mac

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080> in Safari or Chrome. On a computer there are no motion sensors, so «Start kjøretur» will never pass its checks. Use «Se en demotur» or the hidden developer option (below) instead.

## Hidden developer option

Open Innstillinger and tap the version text at the bottom seven times. A «Utvikler» section appears with «Kjør demotur gjennom opptakeren». It plays the simulated Trondheim drive through the real recorder, saves it to IndexedDB in chunks like a real drive, and opens the report. The result must match the demo button exactly: 82 points, three events.

## Putting it online (GitHub Pages, free HTTPS)

Motion sensors and GPS only work over HTTPS, so the app has to be hosted. GitHub Pages is free and needs no credit card. You do steps 1–6 once; I cannot do logins for you.

1. Go to <https://github.com> and click **Sign up**. Use your e-mail, pick a password and a username (the username becomes part of the app's address, for example `josve`). Confirm the e-mail they send you.
2. Once logged in, click the **+** in the top-right corner and choose **New repository**.
3. Repository name: `kjorerapport`. Leave it **Public** (required for free Pages). Do not tick any of the "initialize" boxes. Click **Create repository**.
4. On the empty-repository page, click the link **uploading an existing file**. Open the folder `Svendsen Media/Kjørerapport` in Finder, select everything in it (`index.html`, `sw.js`, `manifest.webmanifest`, `package.json`, `README.md` and the folders `css`, `js`, `fonts`, `icons`, `tests`) and drag them onto the upload area. Wait until all files are listed, then click **Commit changes** at the bottom.
5. In the repository, click **Settings** (top tab), then **Pages** in the left menu. Under "Build and deployment", set **Source** to **Deploy from a branch**, **Branch** to `main` and the folder to `/ (root)`. Click **Save**.
6. Wait one or two minutes and reload the Pages settings page. It shows the address, which will be `https://<username>.github.io/kjorerapport/`. Open it on your phone.

### Updating the app later

Repeat step 4 (in the repository: **Add file → Upload files**). Files with the same name are replaced. Before uploading, change the `VERSION` line at the top of `sw.js` (for example to `v0.1.1`), otherwise phones keep the old cached version. The home screen shows «Ny versjon er klar – Oppdater nå» on the next visit.

If you later want to avoid dragging files, install **GitHub Desktop** (free) and point it at the `Kjørerapport` folder. The folder is already a git repository with the first version committed.

## Installing on the iPhone («Legg til på Hjem-skjerm»)

1. Open the address from step 6 in **Safari** (it must be Safari, not Chrome, for home-screen apps on iPhone).
2. Tap «Se en demotur» once, so the first load is complete and everything is cached.
3. Tap the **Share** button (square with an arrow) at the bottom of Safari.
4. Scroll down in the sheet and tap **Legg til på Hjem-skjerm**, then **Legg til**.
5. Open the app from the home screen. The first time you press «Start kjøretur» → «Gi tilgang til posisjon og bevegelse», iOS asks for permission to use location and to use «Bevegelse og retning». Allow both. If you accidentally decline, go to Innstillinger → Safari → Avansert → or Innstillinger → Personvern → Stedstjenester, and allow it, or delete and re-add the home-screen app.
6. Settings on the phone: set **Autolås** to **Aldri** (Innstillinger → Skjerm og lysstyrke → Autolås) before the drive if the app shows that message on the recording screen. Turn on «Ikke forstyrr» or «Kjøring»-fokus so notifications do not take over the screen.

On Android: open the address in Chrome, use the menu (⋮) → «Legg til på startsiden» or «Installer app».

## Real-world test checklist (first practice drive)

Before you start:

- Phone in a firm holder, screen visible to the accompanying driver, charger connected.
- Autolås set to Aldri, Ikke forstyrr on.
- Open the app from the home screen, press «Start kjøretur», then «Gi tilgang …». Wait until both checks are green (GPS accuracy must reach 20 m or better, which can take 10–30 seconds outdoors; under a roof it may never happen).
- Accompanying driver presses «Start». Driver does not touch the phone.

During the drive (10–20 minutes is enough):

- Include a mix: a few stops from 50 km/t, a roundabout, two or three sharp corners, at least one brisk acceleration out of a junction. Do it safely; this is only to see that events are detected.
- Check once that the timer is counting and the distance is increasing. If the screen goes dark or a call takes over, note the time. The app marks the gap and tells you on return.

At the end:

- Accompanying driver holds «Stopp» for one second. The report opens.
- Check that: the distance roughly matches the car's trip meter; the route shape on the map makes sense; the events you did on purpose appear at roughly the right time; «Slik måles det» says turns came from the gyroscope, not the GPS fallback.
- Go to Innstillinger and export the drive as JSON. Keep the file. If the numbers look wrong, send me that file and I can re-run the analysis on it.
- Try Snill and Streng in Innstillinger and reopen the report to see how the thresholds change the score.

## Decisions I made

- **Plain HTML/CSS/JS, no build tool.** Fewer moving parts for you to maintain, and GitHub Pages can serve the folder as-is. Tests use Node's built-in test runner, no dependencies.
- **GitHub Pages over Netlify.** Updates are a file upload in a browser, no command line needed, and the address is permanent.
- **Analysis code unchanged.** It is wrapped as an ES module with the only addition being a `factor` option for the sensitivity preset (Snill 1.2, Normal 1.0, Streng 0.85), applied by scaling the thresholds before event detection, exactly as you specified.
- **Storage layout.** Each drive has a metadata record (date, duration, cached analysis result) plus raw-data chunks written every 10 seconds. A crash loses at most the last 10 seconds, and old drives are re-analysed automatically when the sensitivity changes or the engine is updated (a `resultVersion` field controls this).
- **Interrupted drives** (app killed mid-drive) are closed automatically on the next start and marked «avbrutt» in the list.
- **The demo button does not save a drive**; the hidden developer option does, so the list is not polluted during normal use.
- **Developer replay uses the samples' own timestamps** and a 60× clock, so the saved drive is identical to a real 5-minute recording.
- **Gravity** uses `accelerationIncludingGravity − acceleration` when both exist (iOS and most Android), otherwise a low-pass filter.
- **Motion samples are downsampled to 20 Hz** by time, not by count, so it behaves the same whether the phone delivers 60 or 100 Hz.
- **GPS accuracy check is strict (≤ 20 m)** as specified. If this proves too strict in the car, lowering it is a one-line change in `js/recorder.js`.
- **Export uses the iOS share sheet** when available (AirDrop, Mail, Files), with a normal file download as fallback.
- **Service-worker updates are not applied automatically.** A new version waits until you press «Oppdater nå» on the home screen, so an update can never reload the app in the middle of a drive.
- **Overpass is self-hosted as one variable-weight file** (plus a Latin-extended file), which covers 400/700/800 and works offline.
- **Font and icon files are the only third-party assets.** No scripts or styles are loaded from any CDN.

## Camera test version (kamera/)

A separate copy of the app at https://josve59.github.io/kjorerapport/kamera/ adds mirror and shoulder-check detection with the front camera. It installs as its own home-screen app («Kjøre Kamera») and keeps its own drives and settings, so the main app is untouched.

- **How it works:** MediaPipe Face Landmarker runs on the phone (files in `kamera/vendor/mediapipe/`, about 13 MB, downloaded the first time the camera is used and then cached). Only head angles are stored, never images.
- **Calibration:** the «Kameratest» screen records looking forward, at the left, right and rear mirror. It is saved per driver.
- **Report:** «Speil og skulderblikk» shows mirror glances per minute, the longest stretch without a mirror glance, a timeline, and whether there was a mirror and shoulder check before each lane change and before driving off.
- **Code:** `kamera/js/camera.js` (pure, tested in `tests/camera.test.mjs`), `kamera/js/facecam.js` (camera and model). The rest is a copy of the main app with its own database name, settings key, caches and manifest id.
- **Limits:** it sees the head, not the eyes, so eye-only glances are missed. Sun glare, sunglasses and the phone position affect it. It uses more battery.

## For driving schools (trafikkskole/ and personvern/)

- `trafikkskole/` – a plain web page for driving schools: what the app does, screenshots, privacy, honest status and a contact e-mail. Live at https://josve59.github.io/kjorerapport/trafikkskole/
- `trafikkskole/ark.html` – the one-page A4 info sheet. `trafikkskole/Kjorerapport-infoark.pdf` is the printed version. To make a new PDF after editing the sheet, open `ark.html` in Chrome and choose Print → Save as PDF (margins: none, no headers and footers).
- `personvern/` – the privacy statement, linked from Settings and the bottom of every report.
- Screenshots in `trafikkskole/img/` were taken from the demo drive at 390×844. The QR codes point to the app.

## Testing the iPhone app with a simulated drive

`ios/sim-rute.sh` drives a 6.9 km round trip in Trondheim city centre in the simulator. It follows real streets (`ios/testrute-trondheim.txt`, routed with TomTom).
- `./sim-rute.sh` drives at 50 km/h.
- `./sim-rute.sh 8` drives at about 30 km/h.
- `./sim-rute.sh stopp` stops the simulated position.

**Why «Fartsgrense ukjent her» appeared in the simulator:**
- The earlier test route was straight lines between 7 points, so it cut through blocks.
- The app only uses a speed limit section within 25 m of the GPS point, so about a third of the points got no limit.
- That is correct behaviour, not a bug.
- On the new route, all 767 points (every 10 m) hit a limit from NVDB: 30, 40 and 50 km/h.
- **In the simulator:** the sign showed 30 km/h throughout. The report marked the stretch where 50 km/h was driven in the 30 zone in red on the map.

## What's new in 0.11.6 – three fixes from the phone

- **Til trafikklæreren:** the date field «Forrige kjøretime» stuck out of the card on the iPhone (iOS gives date fields their own width), and was blank when empty. It now fits, and shows «Velg dato».
- **Report:** «– se «Det som skjedde»» pointed to a heading you had to look for. It is now a link, «Se hvor ›», that jumps there.
- **Home:** once the line about the phone holder was hidden (0.11.5), «Forslag i dag» lay almost on top of «Hei, …!». It now has proper spacing.

## What's new in 0.11.5 – simpler to use (before the UX tests)

A critical look at the app, measured against Apple's own apps and the design guidelines (clarity, the most important first, details on request, one main action per screen, plain words). The result is fewer things on screen, and the same functions.

**Home:**
- New users get help (the line about the phone holder, «Se en demotur»). After 3 drives it disappears, and the demo drive is still under Innstillinger.
- The driver chips («Alle / Emma») only show when there is more than one driver.
- «Klar for oppkjøring?» moves up, right under the last drive.

**Check before driving:**
- The iPhone app remembers the access. The check then starts by itself, and it takes one tap from Home to recording.
- «Hva øver dere på i dag?» (11 choices and a suggestion box) is now one line, «Øver på i dag», with the suggestions and an «Endre» button.
- Shorter texts.

**During the drive:**
- The GPS pill only shows when the GPS is poor.
- «Sist lagret …» only shows if saving falls behind. The companion sees only what needs a reaction.

**Report:**
- The events used to appear twice («Situasjoner» and «Hendelser»). Now there is one list, «Det som skjedde», with the 5 most important first and the rest behind «Vis … til».
- The jump chips at the top are gone, since the report is short enough without them.
- Speed limits, roads and manoeuvres, the events in detail and the technical explanations are under «Flere detaljer».
- «Brå hendelser» is renamed «Hendelser», the same word throughout the app.

**Camera page:** two short sentences instead of three paragraphs.

**Fixed in the iPhone app:**
- The web view's cache is emptied at start, and the local server sends `no-store`. After an update the app could otherwise show old files.
- Note for testing: two simulators running the app at once share the port 51789, so the newest one can show the other one's pages. Close the other simulator.

## What's new in 0.11.4 – ready for the App Store

Everything for the submission is ready. The step-by-step guide (in Norwegian) is [`appstore/innsending.md`](appstore/innsending.md).

**In the app:**
- **Privacy manifest** (`ios/Kjorerapport/PrivacyInfo.xcprivacy`), which Apple requires: no tracking and no collected data. The only «required reason» API is the system uptime, used to timestamp the sensors.
- **«Pluss (test)» now only works where the developer section exists** (Xcode and TestFlight). A setting saved in TestFlight could otherwise have unlocked Pluss for free in the App Store version.
- **New help page** (`hjelp/`, the support URL for the App Store), linked from Innstillinger › Om appen.
- **The privacy page** now covers purchases through the App Store, and deleting the iPhone app.
- **The camera permission text** describes both cameras.
- **The map's buttons no longer show above the tab bar** when the map is scrolled under it.

**For the App Store:**
- 7 screenshots at 1320 × 2868 in `appstore/skjermbilder/`, with captions in Norwegian. They are made from made-up drives along real streets in Trondheim. The tools to make new ones are in `appstore/verktoy/`.
- A screenshot of the Pluss screen for the purchase review: `appstore/kjop-pluss-review.png`.
- An updated description, review notes, age rating answers and support URL in `appstore/README.md`.

## What's new in 0.11.3 – bug fixes

**Messages at the bottom no longer get stuck:**
- Short messages (for example «Guiden er lukket») could stay on screen, half over the tab bar.
- The cause was in how they were hidden. Each one only moved down by 140 % of its own height. A message over three lines did not move far enough to leave the screen.
- Now a message fades out completely. It also uses the full width, so it wraps into fewer lines. You can tap it to close it, and it closes when the app goes to the background.

**Other bugs found and fixed:**
- **The page jumped to the top:** this happened after every tick in Opplæring, the trend switch and the driver chips on Home, and changes on Trafikklærer. Now only a new page starts at the top.
- **The Pluss page now updates by itself:** for example when a parent approves «Spør før kjøp», or when the trial runs out. «Kode fra trafikkskolen» now says that the code is being processed.
- **The camera and GPS no longer keep running in the background:** this used to happen if you left the pre-drive check or the camera screen while the camera was still starting.
- **Calibration stops when you leave the page:** before, it kept talking over Home and then reported a failed calibration.
- **A report that is slow to load can no longer replace another report:** for example when the speed-limit fetch failed after you had opened another drive.
- **The home screen offers «Prøv Pluss gratis i 14 dager» right after launch,** not only after you visited another page first.

## What's new in 0.11.2 – free trial and «Klar for oppkjøring?»

**Free 14-day trial of Pluss (iPhone app):**
- The Pluss screen now offers **«Prøv gratis i 14 dager»** first, with the purchase as the second button.
- Apple does not allow a free trial on a one-time purchase directly, so the trial is a separate **free** in-app purchase, «14 dagers prøveperiode» (App Review Guidelines 3.1.1). It unlocks Pluss for 14 days from when it was taken, once per Apple ID.
- During the trial, the Pluss screen and Innstillinger show the days left. When it ends, the app goes back to the free parts, and all drives stay.
- Nothing is charged and nothing renews. The product must be created in App Store Connect (see `appstore/README.md`, section 12).

**«Klar for oppkjøring?» (new Pluss screen, `js/readiness.js`):**
- A card on Home shows how many points are in place (free to see). The screen itself is part of Pluss.
- It checks eight things against the app's own targets:
  - amount (2 000 km, also what several insurers require for a discount)
  - variety (town, country road, motorway)
  - driving in the dark
  - smooth driving on the latest drives
  - speed limits (with Veidata)
  - roundabouts, lane changes and junctions
  - mirror and shoulder checks (with the camera)
  - the mandatory training, as ticked in Opplæring
- Points the app cannot measure yet (no camera, no Veidata) are shown but not counted.
- The top three things to practise next are listed first.
- The wording never says the pupil will pass. It says that the driving teacher decides when the pupil is ready for the test.

## What's new in 0.11.1 – more trustworthy mirror checks (after the drives on 3 Nov)

**What the drives showed:**
- The app counted **15–25 mirror glances a minute**, and 40–50 % of them were shorter than 0.3 s. Real mirror checks are about every 5–8 s and last 0.5–1 s, so most of the short ones were the head shaking across the border between straight ahead and a mirror.
- In the calibration, the right mirror and the rear-view mirror were only about 10° apart, so the app could mix them up.

**Fixed:**
- **One frame that differs from both neighbours is noise** (`detectGlances`): a single frame towards a mirror between two straight-ahead frames, or a single frame towards another mirror in the middle of a glance.
- **A glance must last at least 0.35 s**, measured from the first frame to after the last one. That is 3 frames at 8 per second; before, 2 frames (0.13 s) were enough. The live log on the camera screen and the full-screen view also need 3 frames.
- **Mirrors close together:**
  - **Calibration:** a calibration with two mirrors less than 14° apart is still accepted, but marked (`calib.close`).
  - **Dialog:** the app says so in a dialog after calibrating («Høyre speil og bakspeilet ligger bare 10° fra hverandre … snu hodet tydelig mot hvert speil»).
  - **Camera screen:** it shows the same note.
  - **Report:** the report mentions it under «Speil og skulderblikk».
- **Road camera without a known dashboard edge:** boxes over 60 % of the width, or with the bottom edge in the lowest 10 % of the frame, do not count as cars. On the 19:57 drive the edge was never found, and 66 «cars in front» at 3–4 m were the dashboard.

**Result on the four drives with the camera:** 9–17 mirror glances a minute, none shorter than 0.35 s. The verdicts in the report (from 6 a minute «bra», from 3 «jevnlige») still fit. 162 tests pass.

## What's new in 0.11.0 – Kjørerapport Pluss

The iPhone app is free to download, with **Kjørerapport Pluss** as a one-time in-app purchase (planned price NOK 349, not a subscription, Family Sharing on).

| Free | Pluss |
| --- | --- |
| Recording (also with the screen locked), report, map, speed limit, speed-camera warnings | The cameras: mirror and shoulder checks, road camera |
| Guides, driving log, export and backup | The training plan with hotspots |
| Reports for the 10 latest real drives | The driving-teacher page |
| | Reports for all older drives |

**How it is built:**
- **`ios/Kjorerapport/PlusStore.swift`** uses StoreKit 2:
  - the product `net.svendsenmedia.kjorerapport.pluss`, purchase in the app's window, «Gjenopprett kjøp» (`AppStore.sync`), and codes from driving schools (`presentOfferCodeRedeemSheet`)
  - it listens to `Transaction.updates`, so purchases on other devices, Family Sharing and refunds are picked up.
- **`js/plus.js`:**
  - status and purchase via the bridge
  - `reportLocked` (pure function, tested)
  - which screens belong to Pluss.
- **Gates in `app.js`:**
  - the screens Kamera, Opplæring, Faresteder and Trafikklærer show the Pluss screen with that feature on top
  - small locks on the Opplæring and Trafikklærer tabs
  - older drives in the log are faded with «· Pluss»
  - a locked report has «Se Pluss» and «Eksporter turen»
  - the camera is not started before a drive without Pluss
  - a Pluss row in Innstillinger.
- **The Pluss screen** shows the price from the App Store, «Kjøp», «Gjenopprett kjøp», «Kode fra trafikkskolen», and what is free.
- **Testing:**
  - `ios/Pluss.storekit` and a shared scheme make ▶︎ in Xcode use a local test store, so the purchase can be tried without money.
  - The developer section has «Pluss (test)»: as the App Store says, always on, or always off.
- **The web version (Safari)** has everything free, as before.

**Before the purchase can be sold:** see `appstore/README.md` section 12 (the product in App Store Connect, the Paid Applications agreement, the Small Business Program).

**Tested:**
- In the simulator: the locks on the tabs, the Pluss screen with the right feature first, and the message when the App Store cannot be reached.
- 157 tests pass.
- **Not tested yet:** the purchase itself, which needs ▶︎ from Xcode (the test store) or TestFlight.

## What's new in 0.10.3 – curved lane lines, using the road ahead from Statens vegvesen

Before 0.10.3 the road camera fitted a straight line to each lane line close to the car. In a bend the drawn line shot straight ahead off the road.

**1. Curved lines** (`js/lanes.js`, `curve: true`):
- **The model:** a road with a steady curve looks like this in the camera image: `x = A + B·d + C/d`, where `d` is the number of pixels below the horizon.
  - `A` is the direction (the vanishing point).
  - `B` is how far the line is to the side (lane width / camera height).
  - `C` is the curve (`C = f²·H·κ/2`, κ in 1/m, positive = to the right).
- **Fitting:** both lines share `A` and `C`. The straight lines near the car are the starting point. The fit follows the line upwards in bands towards the horizon, so the far part of the line, where the curve shows, is included.
- **The lane analysis image** is now 240 px wide (was 160).
- **Camera height:** the app learns it during the drive from the distance between the two lines and the lane width.
- **One line seen:** the other is drawn where it should be from the lane width. It is dashed in full screen and does not count as seen.

**2. Knowing the curve before the camera sees it** (`js/roadshape.js`):
- **The curve now** comes from the GPS track over the last 6 s (change of heading per metre).
- **The curve ahead** comes from the road line in Statens vegvesen's data, 8–60 m ahead in the direction of travel. The app already fetches this line with the speed limits, so it costs no extra download. It follows onto the next road stretch where the lines meet.
- **Together:** the curve ahead counts most (70 %). It pulls the camera's curve towards it, more strongly when the lines in the image are weak (worn, snow, darkness).
- **Below 15 km/h** the app assumes no curve (queues, junctions).

**3. Lanes and lane width** (`fetchRoadInfo` in `enrich.js`, `createLiveRoad` in `livelimit.js`):
- **What is fetched:** «feltoversikt» from the road segments (lanes in our direction: odd numbers with the road direction, even against it) and «Kjørebanebredde» from «Vegbredde, beregnet» (type 838).
- **Area:** about 130 × 130 m around the car, refetched after 100 m. That is a few kB and 110–250 ms in the tests. The whole area along with the speed limits would have made the answer 2.5 times larger (2.5 MB).
- **Lane width:** the carriageway width minus 0.5 m shoulder, divided by the number of lanes, kept within 2.75–3.75 m. It is not used when the width per lane is unreasonable.
- **In the app:** the lane width scales the position in the lane and the predicted second line.

**On screen:**
- The lines are drawn as curves (16 points, each smoothed), with the lane lightly shaded between them.
- Full screen says for example «Sving til høyre, radius 240 m (veidata) · tofeltsvei · felt 3,25 m».

**Saved:** the road samples get `lane.k` (curve, 1/m) and `lane.lw` (lane width from NVDB).

**Tested:**
- **Synthetic curves (radius 67–100 m):**
  - The fitted curve hits the far end within 1 px when the road data agrees, against 32–37 px off for a straight line.
  - Without road data, the error is 6–8 px.
  - A very sharp curve without road data is drawn straight, as before.
- **The 168 night snapshots from 2 Nov:** both lines were found as often as before (88 against 84). 43 got a curve, and in 11 the second line was drawn from the lane width.
- **Real NVDB:** tested at four places in Trondheim. On Omkjøringsvegen it found 2 lanes our way (of 4, with bus lanes).
- 153 tests pass.

**Not tested yet:** a real drive through bends. Watch full screen in the next drive: the lines should bend with the road, and the text at the top says where the curve comes from.

## What's new in 0.10.2 – after the first drives with the iPhone app (3 Nov, five drives, 39 min)

**What the drives showed:**

| Drive | Length | GPS / motion gaps | Driver camera | Road camera | D-FINE per frame |
| --- | --- | --- | --- | --- | --- |
| 19:57 | 5.2 km, 7 min | none | 7.7/s, face 93 %, eyes in 92 % | lead car 43 %, both lane lines 47 % | 381 ms |
| 20:07 | 3.0 km, 4 min | none | 7.7/s, 95 % | 48 %, 50 % | 428 ms |
| 20:11 | 9.2 km, 10 min | none | 7.7/s, 97 % | 50 %, 53 % | 529 ms |
| 20:25 | 2.5 km, 5 min | none | **no frames** | **no frames** | (ran, 214 ms) |
| 20:32 | 9.6 km, 14 min | none | 6.3/s, 87 % | 26 %, 33 % | 659 ms |

- **Both cameras at once work on the iPhone.** The camera read the speed signs 40 and 50, in agreement with NVDB.
- The 13 events on the first drive look real: 0.4–0.6 g in turns at 30–40 km/h.

**Fixed:**
- **No camera data on the 20:25 drive.**
  - The detector in the app ran the whole drive, but the web app got no frames: its first request to the local server never succeeded.
  - The cause is that iPhone closes the listening socket while the app is in the background, and the server did not start again.
  - Now the server restarts when it fails and when the app comes to the front.
  - Each frame request has a 2.5 s time limit.
  - A watchdog in `facecam.js` asks the app to restart the cameras (and the server) after 4 s without frames, at most every 10 s.
  - The recording pill says «Kamera: får ingen bilder – starter på nytt …».
  - The camera session also restarts after runtime errors and interruptions.
- **D-FINE xlarge was too slow on the phone** (381 ms cool, 659 ms after 14 minutes, with the driver camera slowing to 6.3/s). The app now uses **D-FINE medium** (Objects365 + COCO, AP about 55; 2.2 times faster on the Mac, the same cars on the night snapshots). The app is about 80 MB smaller.
- **Camera numbers per drive:** the camera speed numbers saved with a drive (`cameraPlan.perf`) are now reset for each camera session. Before, they added up across drives.
- **«Sett Autolås til Aldri»** is no longer shown in the iPhone app. The app keeps the screen on itself.

## What's new in 0.10.1 – guides, a better map, the stop button, and scrolling fixed

**Scrolling fixed** (found in the simulator):
- **Locked page after the map:** «Tilbake» from a report while the map was in full screen left `body.map-open`, so nothing in the app could be scrolled. Every screen change now closes overlays first (`releaseOverlays`).
- **Full-screen map squeezed into a strip:** the screen animation (`transform`) stayed on after it finished, which locks `position: fixed` inside the screen. The animation class is now removed when it ends, and the full-screen map is moved into `<body>` while open.
- **Stop button:** `touch-action: none` meant a finger on the big stop button could not scroll the recording screen. It is now `pan-y`, and scrolling cancels the hold.
- **Long dialogs:** dialogs can now scroll on small screens.

**The map in the report:**
- On the phone, the page scrolls past the map, and a tap on the map opens it in full screen.
- The full-screen view has «Lukk» on the left, the distance in the middle and «Hele ruten».
- Event numbers show a bubble with the name, time and speed.
- «Utforsk kartet» is a floating button with an icon.

**Guides** (`js/guides.js`, Innstillinger › Guider og tips):
- Seven short guides, chosen by situation, one at a time on Hjem:
  - «Slik fungerer det» before the first drive
  - preparing the phone
  - the camera, when it is on
  - reading the report
  - backup
  - sharing with the driving teacher
  - night driving in the dark season
- Close one with ×. The guides screen lists all of them and can show them on Hjem again.
- They replace the old «Slik fungerer det» card.

**Stop button:**
- New design: a round red button with a white stop symbol and a ring around it that fills while held (1 s). It says «Hold …» during the hold and turns green when stopped.
- It is always at the bottom of the recording screen (`.stop-dock`), so the companion never has to scroll to stop.

**The iPhone app (native):**
- **Sharing:** `navigator.share` gives the iPhone share sheet with text and files: backup, export and driving log go to Files, AirDrop or email.
- **Printing:** `window.print` gives iPhone printing, also «Save as PDF».
- **Vibration:** `vibrate` becomes haptics.
- **App Store review:** asked after the 5th, 15th and 40th drive, if the drive went well.
- **Lock-screen hint:** the first three drives say the screen can be locked.

**Smaller things:**
- **Backup:** it no longer counts as taken when sharing is cancelled.
- **Storage text:** the storage note in the iPhone app is correct.
- **Error message:** «Statens vegvesen svarte 503» is now «Statens vegvesen svarer ikke akkurat nå. Prøv igjen om litt».
- **Situations:** say «Ved 9 km/t» instead of «I 9 km/t».
- **Small fixes:** messages sit above the tab bar, and the area beyond the page edge has the app's colour.

**Testing:** `#/demotur` starts the demo drive straight into recording. 143 tests pass.

## What's new in 0.10.0 – both cameras at once in the iPhone app, D-FINE xlarge on the phone

The iPhone app now uses the driver camera (front) and the road camera (back) **at the same time**. Safari can only use one camera at a time; the native app uses `AVCaptureMultiCamSession` (iPhone XS and newer). Safari is unchanged: driver camera only.

**How it fits together:**
- **`ios/Kjorerapport/CameraHub.swift`:** both cameras at 15 frames per second, portrait. The driver camera is 640×480 and not mirrored, like in Safari. The road camera is 1280×720.
- **The local server:** gives the latest frame as JPEG at `/cam/user.jpg` and `/cam/environment.jpg`. The query `?after=` gives 204 if no new frame has come, and the header `X-Age` gives the frame's age in ms.
- **`ios/Kjorerapport/RoadDetector.swift`:** cars and people with **D-FINE xlarge (Objects365 + COCO, COCO AP about 59)** as Core ML on the phone's graphics processor.
  - Same crop and decoding as `dfine.js`: a square above the dashboard edge, 640×640, gamma in the dark.
  - At most 10 times a second, 3 when the phone is hot.
  - The first 8 answers time the GPU and «all» (Core ML chooses), and the faster one is used for the rest of the session.
  - The answers go to the web app as the event `kjcamdets`, with the time the frame was taken.
- **`js/nativecam.js`:** fetches the frames into a canvas, and gives a `captureStream` to the small camera images.
- **`js/facecam.js`:** rewritten.
  - The driver camera runs as before (MediaPipe Face Landmarker), now with the eyes (blendshapes), like the camera test app.
  - The road camera has everything from the test app: tracking between answers (`track.js`), image tracking (`flow.js`), lane lines and dashboard edge (`lanes.js`), taillights in the dark and speed signs (`signs.js`).
  - The road modules are copied from `kamera/js/`, and `tests/shared.test.mjs` checks that the copies are identical.
- **In the app:**
  - **Kamera:** a «Veikamera samtidig» switch, a road preview with a status line, and tap a camera image for full screen.
  - **Before the drive:** a «Veikamera ser veien» check.
  - **Recording:** two small camera images, and the pill says «bil 23 m foran». Speed signs read by the camera take priority over NVDB, as in the test app.
  - **Report:** a «Veien foran» section (time gap, distance, too close, position in the lane) with a «Veien» shortcut.
  - **Developer section:** «Testbilder fra veikameraet».
- **Saved with the drive:** `road` samples (numbers only), and `cameraPlan` with frame size, model and speed.

**Choosing the model** (`ios/Models/README.md`):
- Converted from PyTorch (Hugging Face `ustc-community/dfine-*-obj2coco`) to Core ML fp16, and checked against PyTorch fp32 on 42 night snapshots from the drives on 2 Nov.

| Model | Speed on the Mac GPU | Same detections as PyTorch |
| --- | --- | --- |
| Small | 5 ms | 55 of 56 |
| Medium | 7 ms | 83 of 85 |
| Large | 9.5 ms | 66 of 66 |
| Xlarge | 15 ms | 57 of 57 |

- The Neural Engine was 8–14 times slower than the GPU for this model (the deformable attention does not run there).
- 8-bit weights halved the size but matched only 52 of 57, so fp16 is used.
- **Size:** the compiled model is 120 MB. It lies in `ios/Models/DFine.mlmodelc` with the weights split into parts under 50 MB, because GitHub refuses files over 100 MB. `copy-web.sh` joins them at build time. The app is about 157 MB.

**Two bugs found and fixed in the simulator test:**
- **Zero output:** Core ML gave all zeros every other run, because the rows in the answer are padded.
  - The decoding now reads with Core ML's own strides.
  - An all-zero answer is reported as an error, not as «no cars».
  - In the simulator the model runs on the CPU, because the simulator's GPU gives only zeros.
- **Taps:** iPhone does not pass taps on `<video>` elements on, so tap targets now sit around or over the camera images.

**Tested in the simulator with a fake camera** (`KJ_SIMCAM`, night snapshots from 2 Nov) and the Trondheim route:
- Both cameras started, and D-FINE xlarge loaded in 0.7 s.
- Full screen showed «3 biler · Bil foran 54 m», one lane line and the dashboard edge at 72 % (as on the real drive).
- The report got «Veien foran»: lane position 0.12 m right, both lines in 42 % of frames.
- On the Mac with the same Swift code, xlarge took 17–25 ms per frame and found the same cars as PyTorch.
- **Not tested yet: real cameras on a phone.** Speed, heat and battery with both cameras and xlarge must be measured on a drive. The full-screen view shows the time per answer.

**Testing in the simulator:** in testbygg (Debug), `SIMCTL_CHILD_KJ_SIMCAM=<folder with user/ and environment/>` gives fake camera images. `SIMCTL_CHILD_KJ_HASH=#/kamera` opens a page directly, and the web app's `console` goes to the Xcode log.

## What's new in 0.9.22 – Live Activity in the iPhone app

While a recording is running, the lock screen and the Dynamic Island show:
- **«Opptak pågår»** with a red dot.
- **The trip time**, counted by iOS itself, so it is right without updates.
- **The distance.**
- **The text «Ledsageren stopper i appen».**

When the trip is stopped, it says **«Turen er lagret»**, with the time, distance and «Rapporten ligger i appen». That stays for 15 minutes.

**Deliberately not shown:**
- The speed limit. It is fetched by the web app and can be out of date while the app is in the background.
- Anything the driver needs to look at.

**Structure (`ios/`):**
- **`KjorerapportWidgets/` (new widget extension, `net.svendsenmedia.kjorerapport.widgets`):**
  - `RecordingLiveActivity.swift` covers the lock screen and the Dynamic Island (expanded, compact and minimal).
  - It is embedded in the app ("Embed Foundation Extensions"), with its own `KjorerapportWidgets-Info.plist`.
- **`Shared/RecordingAttributes.swift`:** the data both parts share (start time, distance, finished duration).
- **`NativeRecorder.swift`:**
  - starts the Live Activity at `recStart`;
  - updates it at most every 15 s;
  - ends it at `recStop`.
- **Distance:**
  - While the app is visible, the web app's distance is used (`kjNative.status`, every 10 s).
  - In the background, the app measures the distance itself from the location points (accuracy 30 m or better).
- **No updates for 3 minutes:** it shows «Åpne appen for å se opptaket», for example if the app was closed.
- **Old Live Activities** are removed when the app starts.
- **`Kjorerapport-Info.plist`:** `NSSupportsLiveActivities`.

**Tested in the simulator** (simulated route at 50 km/h):
- The lock screen showed «Opptak pågår», and the time and distance followed with the screen locked: 1.0 km after 1:18.
- The Dynamic Island showed the red dot and the time on the home screen.
- After Stopp it showed «Turen er lagret», 2:22 and 1.7 km.
- iOS itself asks whether Live Activities should be allowed, the first time and once more later. That is normal.
- **Bug found:** the web app kept sending its last distance in the background and overwrote the app's own. Fixed: in the background, only the app's own distance counts.
- **Not tested on a real iPhone.**

## What's new in 0.9.21 – licenses page

**«Lisenser og kilder»** (`lisenser/index.html`) is linked under Innstillinger › Om appen and from Personvern. It is included in the iPhone app and works offline.

**What the page lists:**
- **Software in the app:**
  - Leaflet 1.9.4 (BSD 2-Clause);
  - MediaPipe Tasks Vision with Face Landmarker and EfficientDet-Lite (Apache 2.0);
  - the Overpass typeface (SIL OFL 1.1).
- **Data:**
  - maps and place names from Kartverket (CC BY 4.0);
  - road data from Statens vegvesen NVDB (NLOD 2.0, with the attribution text NLOD requires).
- **The full license texts:**
  - Each one is in a closed `details` box.
  - They are stored as plain text in `<pre>`, and a small script joins the hard-wrapped lines into paragraphs, so the text flows on a narrow screen.
- **Not listed:** D-FINE and ONNX Runtime. They are only used by the camera test app (`kamera/`), which is not in the iPhone app.

**Personvern updated:**
- Date: 3 November 2026.
- It applies to the iPhone app too.
- The sentence «Appen kjører ikke i bakgrunnen» was wrong for the iPhone app. It now says that location and motion continue with a locked screen while a recording is running, with the blue indicator, and only then.

**Tested:**
- In the browser at mobile width: no horizontal scroll, and the license texts open.
- In the iPhone app (simulator): the link opens the page.
- The two links under Om appen are now on separate lines, instead of one line that broke in an ugly place.

## What's new in 0.9.20 – no more «Testversjon»

**Texts:**
- «Testversjon» is gone from the app:
  - the footer on Hjem;
  - Om appen;
  - the report (screen, shared text and PDF);
  - the summary for the driving instructor.
- The sentence that remains: «Målingene er veiledende og erstatter ikke ledsager eller trafikklærer.»
- «Appen er i testfase» is gone from Om appen.
- «prototypen» is gone from Avansert (analysis engine and thresholds).
- The camera tag in the report is now called «Ny» instead of «Test».
- **The page and info sheet for driving schools:**
  - «testversjon» is gone.
  - «Ærlig status» is now called «Viktig å vite».
  - The PDF has been regenerated from `ark.html` with headless Chrome. It is checked: one A4 page.
- The camera test app (`kamera/`) is still labelled as a test app. It is not included in the iPhone app.

**The developer section (7 taps on the version number) is gone from the App Store version:**
- Apple does not allow hidden features.
- The iPhone app answers `kjNative.info()` with `devTools`:
  - `true` in Debug (Xcode) and TestFlight (`AppTransaction` environment `sandbox`/`xcode`);
  - `false` otherwise.
- The web app still has the section.
- **Tested in the simulator** (via a temporary test log): Debug gives `devTools=true`, Release gives `devTools=false`.
- **Bug found along the way:** iOS read 7 quick taps on the version number as a double-tap zoom, so only the first one counted. The version line now has `touch-action: manipulation` and `cursor: pointer`.
  - The simulator test tool still could not deliver 7 separate taps. The counting is therefore tested in the browser, and the answer from the app with one tap.
  - **Test on a real iPhone.**

**iPhone app, other:**
- «Se etter ny versjon» is hidden in the app, which is updated through the App Store.
- **The driving-school page was missing from the app:** «Informasjon for trafikkskoler» gave «Fant ikke filen». `trafikkskole/` is now copied in by `copy-web.sh`. Tested: the page opens in the app.
- **Swipe back** (`allowsBackForwardNavigationGestures`) is turned on, so you can get back from Personvern and the driving-school page. Not confirmed in the simulator. «Åpne appen» at the bottom of the pages always works.

## What's new in 0.9.19 – demo trip under Avansert

**«Spill av en demotur»** is now under Innstillinger › Avansert, visible to everyone. Before, it was a hidden developer button. It lets App Review (and curious users) see the live screen and the stop flow without driving.

- **The replay:**
  - The simulated tour of Trondheim (5 min 27 s) is played through the recorder at 10× speed, about half a minute.
  - It stops by itself and opens the report.
  - Holding Stopp also works.
- **Speed limit sign during the replay:**
  - `makeDemo()` now also gives `limits`: the speed limits along the imagined route (50, 60, 50, 70, 50).
  - The sign shows them with the text «Fartsgrense i demoturen».
  - Nothing is fetched from NVDB during the replay, and nothing is saved as live limits.
- **The record screen** says it is a demo trip, played back at ten times speed. The auto-lock warning is not shown during the replay.
- **The trip** is tagged «demotur». It does not count in the overview, the development or the comparisons. The «Slik fungerer det» card on Hjem still shows until the first real trip.
- **The developer section** (7 taps on the version number) keeps only 60×. The 10× button is now the public one.
- **Tested** in the browser and in the iPhone app (simulator): the button, the sign (50 → 60), the demo message, and the report tagged «Demotur».

## What's new in 0.9.18 – intro on first launch

Three short screens appear the first time the app opens, before the first trip. They can be swiped, and «Hopp over» closes them:
1. **«Øvelseskjøring med en rapport etterpå»**: what the phone measures and what the report gives.
2. **«Ledsageren styrer telefonen»**: the holder, the companion starts and stops, only the speed limit and speed camera beeps during the drive.
3. **«Turene blir på telefonen»**: no account, no trips uploaded, sharing is the user's choice. The permission prompts come at the first trip, not at launch. Ends with «Kom i gang» or «Se en demotur først».

**Behaviour:**
- Shown only when there are no trips and it has not been seen before (`introSeen` in the settings).
- Can be shown again from Innstillinger → Om appen → «Vis introen igjen».
- Built for HIG:
  - Short, and skippable on every page.
  - The button stays in place.
  - Page dots can be tapped.
  - Reduced motion makes the page change instant.
  - Content starts at the top if it does not fit (low screens, large text).
  - The image gets smaller on short screens.
- **Tested:**
  - In the browser (light and dark): the intro opens by itself on an empty app, and the pages change with both the button and swiping. «Kom i gang» closes it, and it does not come back after reload.
  - In the simulator: on a fresh install, the same three pages show on a short iPhone screen.

## What's new in 0.9.17 / k0.7.12 – the iPhone app (phase 1, first version)

A real iPhone app in `ios/` (Xcode 27, SwiftUI, iOS 26 or newer). It is built in Xcode by opening `ios/Kjorerapport.xcodeproj` and pressing Run, or from the command line:
`xcodebuild -project ios/Kjorerapport.xcodeproj -target Kjorerapport -sdk iphonesimulator`.

**Structure:**
- **`KjorerapportApp.swift`:** starts the local server and shows the app.
- **`WebServer.swift`:** a small HTTP server on `127.0.0.1:51789`. It serves the web app from the app's own files (`web/`, copied in at build time by `copy-web.sh`: the main app with `css`, `js`, `fonts`, `icons`, `personvern`, Leaflet and MediaPipe). Everything works without the network. The port is fixed so that the web app's storage stays the same between launches, and 127.0.0.1 counts as secure, so the camera and sensors work.
- **`WebAppView.swift`:** WKWebView with permission answers (camera, motion), links out of the app (email, Safari), alert/confirm, and a restart if iPhone stops the web content.
- **`NativeRecorder.swift`:**
  - Location always comes from CoreLocation (navigator.geolocation is replaced by `Bridge.js`).
  - During a recording, location is measured with the screen locked too («Når appen er i bruk» + `UIBackgroundModes: location`, blue indicator), and the screen is kept on (`isIdleTimerDisabled`).
  - In the background, motion is also measured with CoreMotion at 20 Hz, with the same units and axes as WebKit gives the web app.
  - Everything measured in the background goes to the recorder when the app is visible again.
- **`Bridge.js`:** is loaded before the web app. It provides `window.kjNative`, the geolocation replacement and the `kjbackfill` event.

**The web app (both apps, only active inside the iPhone app):**
- **`Recorder.backfill()`** fills in measurements from the locked screen with the correct time. The gap is removed when it is covered. Motion downsampling starts over for the fill-in.
- **The recorder** tells the app when recording starts and stops (`recStart`/`recStop`).
- **No service worker** in the app (the files are in the app and are updated through the App Store). No «Legg til på Hjem-skjerm».
- **`getRaw()`** sorts measurements by time (backfill can end up in a later chunk).

**Tested in the simulator (iPhone 18 Pro, iOS 27.2):**
- The app starts and shows the front page with the tab bar, offline, from the local server.
- The demo report works.
- The pre-drive check shows. The tab bar is hidden there.
- The motion permission answer had to use WebKit's completion-block variant: it has no async version, so the async method was never called, and the permission waited forever.
- **Recording with the app in the background (iPhone Duo simulator, simulated route in Trondheim at 50 km/h):**
  - 30 seconds on the home screen. Afterwards the distance and GPS points had grown as if the app had been open the whole time (18 → 76 points, 0.2 → 0.8 km).
  - The speed graph is continuous, and the report has no gap.
  - The simulator has no motion sensor. In the simulator only, the app sends noise from a phone lying still, so the pre-drive check and recording can be tested. Because of that, the report says the accelerometer did not match the GPS. That is expected.
- **Order fix:** the iPhone app sends the fill-in (`didBecomeActive`) *before* the web app sees that it is visible (`visibilitychange`).
  - Before the fix, the gap was registered after it was already covered: «Appen var skjult i 43 sekunder» appeared, and the gap stayed in the data.
  - Now the recorder remembers the filled-in time ranges (`filled`) and does not register a gap that is already covered. The message disappears if the fill-in comes afterwards.
- On a physical iPhone: requires the developer account (or a free Apple ID for 7-day test installation from Xcode).

## What's new in 0.9.16 / k0.7.11 – tab bar

A fixed **tab bar** at the bottom with the four main parts (`tab-bars.md › Best practices`): **Hjem**, **Turer** (the driving log with all drives, before «Kjørelogg»), **Opplæring** and **Trafikklærer**.

- **Where it is shown:** on all screens except the pre-drive check, the drive itself and the camera screen, so nobody leaves the drive by mistake. A report belongs to the tab it was opened from. Settings and the demo belong to «Hjem», «Faresteder» to «Opplæring».
- **Back button:** the tabs' own screens have none. From a report it goes back to the tab you came from, and from «Faresteder» to «Opplæring».
- **Front page:** now only start, last drive, development and goals. The drive list, the driving log card and the shortcut cards are in the tabs. «Faresteder» is a card at the top of «Opplæring» (shown only when there are any).
- **Style:** the chosen tab is blue (navigation/information) with a slightly thicker icon. Labels are 13.3 px and touch targets 52 px. The bar becomes solid with «Reduser gjennomsiktighet», and toast messages are lifted above it.

## What's new in 0.9.15 / k0.7.10 – fixes from the design review (Apple HIG)

This is a design review against Apple's Human Interface Guidelines (the apple-design skill), measured on the newest version at mobile size.

- **Text follows the iPhone's text size** (Critical, `accessibility.md › Vision`). The root element uses `-apple-system-body` (17 px by default) and the body uses `1rem`, so all rem sizes grow with the setting in Settings › Display & Text Size. Other browsers get 17 px. Tested at 28 px root: no horizontal overflow.
- **Correction to 0.9.14:** small text was 14.4 px, not «never under 15 px» as stated. It is now 15.3 px at the default size. Labels such as «Distanse» are at least 13.6 px.
- **One colour means one thing** (`color.md › Best practices`):
  - acceleration is now violet (before blue, like links)
  - neutral data series (weeks, score trend, road types) have their own colours (`--chart`, `--cat-2`, `--cat-3`)
  - the score ring has its own scale: green from 75, orange 55–74, red below
- **Icons and numbers on coloured surfaces** are dark in dark mode (`--on-color`). White on the light dark-mode colours gave 2.2:1.
- **No separate light/dark setting** (`dark-mode.md › Best practices`): the app follows the phone.
- **Touch targets of at least 44 px** (`accessibility.md › Mobility`): map zoom, playback speed, and the links «Personvern» and «Informasjon for trafikkskoler».
- **«Øk kontrast»** gives darker grey text and visible lines. **«Reduser gjennomsiktighet»** gives a solid top bar.
- **«Faresteder»** is shown only when there is something there. The training card then fills the width.

## What's new in 0.9.14 / k0.7.9 – new visual style

`css/theme.css` (the same file in both apps) is loaded after `app.css` and sets a common style. The direction is still road and signs, but calmer.

- **Colours:**
  - Signal yellow (`--primary`) for everything you press: Start, «Ta kopi», «Oppdater nå» and other primary buttons. Before, primary buttons were black.
  - Sign blue (`--link`) for links and information.
  - Green and red only for good and bad.
  - Light mode: warm off-white background, and white cards with soft shadow and no lines.
  - Dark mode: dark surfaces with a thin line and no shadow.
  - All text, including grey, has a contrast of at least 4.5:1.
- **Typography:** Overpass as before (similar to road signs), with a clearer scale. Small text is never under about 15 px.
- **Components:**
  - card titles have a coloured icon chip
  - choices with several buttons have a calm background, with the chosen one lifted out
  - filter and quick-navigation pills fill, and buttons and fields are filled with no frame
  - all touch targets are at least 44–48 px, including text links
  - a clear focus ring
  - movement is reduced for those who have asked for it
- **Front page:** the order is now start, the last drive, «Til trafikklæreren», then overview, development and the camera card further down. The four number tiles are gone, since the same numbers are in the driving log and the development chart.
- **Text:** the pre-drive screen now says what actually happens during the drive («Under kjøringen vises bare fartsgrensen …»).

## What's new in 0.9.13 / k0.7.8 – a page for the driving instructor

New screen **«Til trafikklæreren»** (`js/teacher.js`, route `#/trafikklaerer`, card on the front page). It is one page with everything practised since the last driving lesson, ready to show on the phone, print or save as PDF, or share as a message.

- **Period:** «Forrige time» (a date per driver, `settings.lessons`), 30 days or everything. After the lesson, «Timen er ferdig – ny periode fra i dag» sets today's date and empties the question field.
- **Contents:**
  - drives, driving time, km and time in the dark
  - what should be worked on (`suggestFocus` for the period) and what is going well (categories averaging 90 or more)
  - what has been practised: road types, light conditions, roundabouts, lane changes, junctions with give way or stop
  - how it is going: average score with trend (first half of the drives against the second), categories, speed limits, and mirror checks before lane changes when the driver camera has been used
  - the companion's marks and notes
  - the training plan: ticked items and what the app has seen
  - «Spørsmål til trafikklæreren», a free-text question saved per driver
- **Note on the score:** the page says plainly that the score measures how calmly and smoothly the car is driven, not whether the traffic rules are followed.
- **Tested** with the evening drives of 29 Oct–2 Nov: 3 drives, 1 h 44 min, 89.6 km, everything in the dark, 10 roundabouts and 27 lane changes. Tests are in `tests/teacher.test.mjs`.

## What's new in 0.9.12 / k0.7.7 – tidy-up: report and settings for those who use the app

The app had grown into showing a lot of measurement detail. This version changes only what is shown, not the measurements.

- **Score as a ring** (`scoreRing`, `scoreBadge`): in the report and the drive lists it now reads «72 av 100» with a ring that fills up (green, blue, orange or red). Before, the score stood inside a speed limit sign, where «72» was read as speed limit 72.
- **The top of the report** shows four figures (distance, time, top speed, sudden events) instead of six. «Snittfart» and «Per 10 km» are gone from the top.
- **Next practice drive** (`nextPractice`): a new card right after «Kort fortalt». It gives at most two specific things to practise, chosen from this drive, with how and where to practise them. It looks at speed limits, mirror checks (from the companion's marks or the driver camera), serious situations and the weakest category. If the drive went well, it suggests trying a new kind of road.
- **Ordinary words instead of g-forces:** events show «kraftig/merkbar», and situations say «I 50 km/t, i rundkjøring». The g-figure is still shown when you open an event. The source tags (GPS, motion) are gone from situations.
- **«Flere detaljer»** at the bottom gathers the speed graph, data quality, how it is measured and (in the test app) the road camera. The quick navigation is shorter.
- **Front page:** the text now says what actually happens: «Under turen vises bare fartsgrensen, og det piper før fotobokser». It used to say «Ingen poeng, lyder …».
- **Settings** are 40 % shorter. Ordinary choices come first: drivers and goals, «Under kjøring» (speed limit and speed cameras, sound), «Rapporten» (map, place names, read aloud), appearance, backup and about the app. «Avansert» holds sensitivity, analysis engine, thresholds, the in-car reminder, export and import of single drives, and maintenance.

## What's new in 0.9.11 / k0.7.6 – eyes in the driver camera, full screen for the driver, reading speed signs

**Driver camera**
- **Eyes** (`camera.js`: `eyesFromBlendshapes`, `toGaze`, `gazeCalib`). The face model (MediaPipe Face Landmarker, still the best face model for the browser on iPhone) now also reports where the eyes look (blendshapes eyeLookIn/Out/Up/Down). Gaze is head plus eyes. A calibration taken with k0.7.6 or later stores a separate gaze calibration (`calib.g`). Which way the eyes turn relative to the head is found from the calibration itself: in a mirror the eyes go the same way as the head. Live classification, the plan and the analysis (`evaluateMirrors`) then use gaze. Older calibrations work as before, with the head only. In the test, a mirror glance with 8° head and 22° eyes is found; with the head only it was "straight ahead". Head samples also store `ex`/`ey`.
- **15 analyses a second** with the driver camera only (before 8). The model takes about 26 ms on the iPhone.
- **Full screen for the driver camera:**
  - the face with outline, eyes and irises, all gliding smoothly
  - an arrow for the gaze
  - a map of the mirrors from the calibration, with a dot for where the driver is looking (filled for gaze, ring for the head only)
  - what the app thinks the driver is looking at, head and eye angles, and the last 6 glances with duration
- **Recalibrate** to get the eyes included. The screen says «Bare hodet – kalibrer på nytt» until you do.

**Speed signs from the road camera** (`kamera/js/signs.js`, `sign-tpl.js`)
- **Covers** ordinary signs and digital signs (red LED ring and bright digits, as on the E6 when the limit is lowered).
- **No ready-made model exists with a free licence for Norwegian speed signs.** German GTSRB lacks 40, 90 and 110. So this is image processing on a closed set of numbers:
  1. red rings (with a 2×2 «any red» and a grown mask so the LED ring holds together)
  2. a full-resolution edge
  3. the inside to 48×48, Otsu, the digits as the smallest part
  4. comparison against 297 templates (DIN Condensed, DIN Alternate, Arial Narrow and Helvetica Neue, ordinary and LED, at 24 and 44 px, 4 bit, 69 kB)
- **Accepted** when the same sign is read the same way at least 3 times. Signs on vehicles are skipped. Reading runs every second frame when the car is moving.
- **Tested** on 240 synthetic signs in other typefaces, in real evening photos from the drive, with blur, noise, darkening and tilt:
  - correct in a single frame for 66 % (83 % over 44 px, 67 % at 28–43 px, 40 % under 28 px)
  - wrong in 2 of 240, both under 28 px, where a higher score is now required
  - no hits in 132 real evening photos without signs
  - in the app with a fake camera, a digital 60 sign was accepted on each of 4 passes, with no wrong readings, in 9 ms per read on the Mac
- **On screen:** a camera-read sign takes priority over NVDB until the next sign, 3 km, or a new NVDB stretch more than 150 m after the sign. The limit sign gets a blue edge and the text «Skilt sett av kameraet · Statens vegvesen: X». Speed camera beeps use the same limit.
- **Saved with the drive:** `liveLimits` with `src: 'kamera'`, and in the road samples `sign`, `signRead` and a 64 px picture of the sign (with test pictures on).

## What's new in 0.9.10 / k0.7.5 – smoother boxes, warning sound for speed cameras

From the evening drive on 2 Nov (k0.7.4, 26 min, dark): D-FINE ran in its own thread at **310 ms per frame** on the iPhone (about 3 answers a second). The boxes moved in straight lines between answers and jumped a little at each new one. There were 0 gaps in the motion data from the camera (before k0.7.3: 43 %).

- **Image tracking between answers** (`kamera/js/flow.js`, `track.js`): about 8 times a second, the middle of each tracked car's box from the previous frame is found again in a small grey image (320 px wide, sum of absolute differences, ±5–14 px, to a fraction of a pixel). The image controls the movement sideways and up/down. Answers from the model correct a third of the gap (with the time the frame was taken), and size (distance) still comes from the model. It works at night too, because taillights are strong features.
- **Fewer flickering boxes:** a car already being tracked is kept with weaker answers (score from 0.25; new cars still need 0.4). A track that the image still finds lives up to 2 s without a new answer. Two boxes on the same car become one.
- **Smooth drawing** in the full-screen view: boxes (70 ms), lane lines (120 ms) and the distance to the car in front (400 ms) glide to new values.
- Tested in a simulation with a real evening photo from the drive and D-FINE answers 310 ms late with noise. On a lane change (150 px in 2 s), the average gap between box and car went from 26 to 6 px, and the largest jump from 63 to 10 px. With harsh shaking it went from 63 to 6 px. In the app with a fake camera, the image found the car again in 313 of 313 tries (4 ms per step on the Mac), and the car was shown 61 % of the time against 43 % of the frames where the model found it.
- **Speed camera sound** (`js/sound.js`, both apps, on by default with Veidata). A soft ding-dong plays when the warning appears (about 1 km before), three beeps when the big card appears (300 m), and quick beeps every 2 s if you are more than 3 km/h over the limit near the speed camera. On average speed control there is a sound at the start and the end, and beeps every 15 s if your average is over the limit. The sounds are made with Web Audio, so there are no sound files. Sound is unlocked when you press Start. The audio session is set to «transient», so it plays even with the silent switch on and music is dimmed for a moment. The setting is «Lyd ved fotobokser», with a «Prøv lyden» button.

## What's new in k0.7.4 – tracking between detections, D-FINE in its own thread

- **Tracking** (`kamera/js/track.js`): each car or person gets a track with position and velocity (px per ms) from one detection to the next. Between detections the box is moved to where the car probably is now (at most 0.5 s ahead). Detections are fed in with the time the frame was taken, so D-FINE's delay (about 0.3 s on the iPhone) is made up. A track must be seen at least twice before it counts, which removes one-off false detections, and it disappears after 1 s without a new detection. Both the full-screen view and the recorded road samples use the tracks, so the distance to the car in front is steadier.
- **D-FINE in a Web Worker** (`kamera/js/dfine-worker.js`, `loadDfineWorker`): the main thread only draws the 640×640 crop and reads the pixels. The worker does the tensor, the model on WebGPU and the decoding. If the worker does not get WebGPU, the main-thread version from k0.7.0 is used (`perf.dfineWorker` gives the reason).
- **Tested with a fake camera** where the picture slides sideways at 0.08 px/ms: D-FINE ran in its own thread at 44 ms per frame on the Mac (before about 105 ms on the main thread). The box moved 4 px per 50 ms between detections, the same speed as the picture, instead of jumping at each new detection.
- Tested and rejected: D-FINE fp16 was twice as fast but found clearly fewer cars with confidence (4 against 8 on the motorway photo, 5 against 20 at dusk).

## What's new in 0.9.9 / k0.7.3 – a second opinion on the 2 Nov 20:32 drive, checked and fixed

Another Claude agent analysed the drive (43.7 km, dark and rain). I checked its four claims against the data and the app's own code:

1. **«The gyro axes are swapped»: not a bug in the app.** The analysis already picks the axis order automatically (`GYRO_AXES`). On this drive it chose «webkit», with a correlation of 0.88 to the GPS heading. The agent computed on the raw data without that step.
2. **«The speed limit jumps»: right for the report** (the live limit had no jumps). There were 90→40→90 in 3 s at 88 km/h, 60→40→60 and 50→30→50, from roads crossing below or above. Fixed:
   - `matchLimits` prefers a segment along the direction of travel (within 35°).
   - `stabilizeLimits` smooths jumps shorter than 6 s that have the same limit before and after. Unknown limits count as equal, which also fixed an infinite loop in the first version.
   - `analyzeSpeeding` no longer counts speed above the limit when the limit rises within 6 s and the speed is under the new limit (the on-ramp onto the motorway: 89 in 70 three seconds before 110).
   - Old drives fetch the limits again (`LIMITS_V = 2`). This drive went from 12 speeding episodes to 8, and the false ones are gone.
3. **«Car in front is mostly wrong»: partly right.** The report already ignored taillights (518 of 1023) and the dashboard, and gave 0 «for nær». Real problems fixed:
   - red-and-white snow poles were counted as people (people need a height/width ratio of at most 4.5 and a score of 0.5)
   - oncoming cars could become the «car in front». Live, the car in front must be between the lane lines when both are found. In the report, a «car» that closes in faster than our own speed + 3 m/s is oncoming (18 removed on this drive).
4. **«The motion data has gaps»: right, and the most important one.** 43 % of the drive was in gaps over 0.25 s. The cause: with 1280×720 and D-FINE, Lite2 took 733 ms per frame on the iPhone and blocked the app. Fixed:
   - With D-FINE on WebGPU, Lite2 runs only when the car is standing still (queues, red lights), where gaps do not matter.
   - Motion samples get their time from the event itself (`event.timeStamp`) instead of from when the app got round to processing them.

## What's new in k0.7.2 – full-screen camera with what the models see

Tap the small camera image during a recording to get the camera in full screen, with what the models see drawn on top:

- cars, trucks, buses and motorcycles in yellow, people and bikes in pink (with score)
- the car in front in green, with distance and headway
- the lane lines (green/pink)
- the dashboard edge as a dashed blue line
- a bar for the position in the lane (red when more than 0.75 m from the centre)

At the top: the model (D-FINE + Lite2 or Lite2), dark or not, number of cars and people, car in front, lane lines and side offset, the dashboard edge, brightness and D-FINE time. With the driver camera in front (switching mode), it says «Førerkamera». Tap anywhere or ✕ to close. Nothing of this is stored.

Tested with a fake 720×1280 camera that shows a night snapshot from 2 Nov: the car in front at 46 m, a parked car, the left lane line, and the dashboard edge at 73 %.

## What's new in 0.9.8 / k0.7.1 – after the evening drive with D-FINE (2 Nov), and large speed-camera warnings

**What the drive showed:** the detectors work on the iPhone. Lite2 found something in 2831 of 3021 runs. D-FINE ran on WebGPU at about 350 ms, and the night snapshots are good. But:

- **The car's own dashboard was taken for a car in front.** The phone was mounted so that the bottom 28 % of the portrait frame was dashboard. 8263 of 9364 «cars in front» were a 719–720 px wide box at «2.5 m» (median headway 0.15 s). New: the app finds the dashboard edge itself (`dashLine` in `lanes.js`), as the topmost clear bright-to-dark transition from 60 % of the height down, in row means smoothed over time. On the snapshots this gives 0.73 (2 Nov) and 0.87 (31 Oct), which matches both. Detections more than 70 % of the frame wide, or reaching well into the dashboard, are ignored. Car detection (D-FINE crop), lane lines and the taillight search use only the road above the edge. In old drives, the report ignores «cars» over 70 % of the frame width (`roadSummary` `frameW`). On 2 Nov the typical headway goes from 0.2 s / 3 m to 1.8 s / 33 m, with no false «for nær».
- **Lane lines were searched for on the dashboard** (both lines in 95 of 11,856 frames). New: the search band is the road just above the dashboard edge (20 % of the height). The horizon is 25 % above the edge, the inlier requirement is lower (dashed lines), and brighter asphalt is allowed (lit by the headlights). On 67 large evening snapshots: at least one line in 60 (before 7), both in 42 (before 1). The daylight drive on 31 Oct: 37 and 18 of 50 (before 26 and 2).

**Speed camera / section control on the recording screen (both apps):**
- A small yellow line from 1 km away: «Fotoboks om 800 m» / «Strekningsmåling om 800 m». Before, the range was 700 m and there was no warning for the start of section control.
- A large yellow card for the last 300 m: «FOTOBOKS · om 250 m · Fartsgrense 80 · du kjører 77 km/t». It disappears by itself 2 s after passing. After section control: «Strekningsmåling ferdig · snitt 75 km/t» for 8 s.
- The control must be within 30° straight ahead, and the car must have got closer to it 3 updates in a row (or be within 300 m). Controls on other roads nearby gave short false warnings before. Simulated on the Storlien drive: a warning about 1 km before each section control, the large card 300 m before, the running average, and the final average of 74 and 77 km/h.

## What's new in k0.7.0 – D-FINE nano + Lite2, 1280×720 road camera, large test snapshots

- **Two detectors, merged.** D-FINE nano (Apache 2.0, ONNX from onnx-community/dfine_n_coco-ONNX, COCO AP about 43) runs with ONNX Runtime Web 1.30.0 (MIT, `vendor/ort/`) on the GPU (WebGPU), asynchronously, at most every 250 ms. EfficientDet-Lite2 runs on the CPU every 600 ms. Results older than 1.5 s are not used, and the same object (overlap over 50 %) counts once (`mergeDets`). Without WebGPU only Lite2 is used, because D-FINE on the CPU is too slow on the phone.
- **Why both** (lab test on night and dusk photos, boxes drawn and checked): D-FINE found many more distant cars in daylight and at dusk (20 against 7–10). Lite2 was better on large cars close in front at night (the taillight photo and a city car). D-FINE took a smudge on the windscreen for a car at 0.49, so its threshold is 0.4. The int8 version of D-FINE gave many weak false detections, so fp32 (15 MB) is used. On the Mac: D-FINE on WebGPU 26–39 ms, on the CPU 160–580 ms.
- **D-FINE input:** for a portrait frame, a 720×720 square in the middle (the road, at full resolution) is scaled to 640×640, with gamma brightening in the dark.
- **Road camera at 1280×720** (before 640×480).
- **Test snapshots:** a large one (480 px, JPEG 0.75) every 30 s and small ones (160 px) when there is a car in front, so other models can be tested afterwards on real frames from the road.
- **End-to-end test** with a fake 720×1280 camera (a motorway photo): 44 road frames in 6 s, D-FINE about 3 times a second (about 105 ms, asynchronous), Lite2 185 ms, 11 cars, car in front at 22 m.
- First load downloads about 50 MB of models (Lite2 8 MB, ONNX Runtime 27 MB, D-FINE 15 MB). They are then cached in the ML cache for offline use.

## What's new in k0.6.13 – a stronger detector for the dark, and a ready test setup

- **EfficientDet-Lite2** (int8, 7.5 MB, `vendor/mediapipe/efficientdet_lite2.tflite`, Apache 2.0) replaces Lite0 for the road camera. Lab test on night and dusk photos (vehicles with a score of 0.35 or more):

  | Photo | Lite0 | Lite2 |
  |---|---|---|
  | Car close in front at night | 0 | 2 |
  | Motorway at dusk | 0–1 | 7 (with gamma) |
  | City at night | 1 | 3 |
  | Darkened motorway | 4–7 | 8–10 |

  It takes about 3 times as long (151 against 53 ms per frame on the Mac). So detection runs at most every 2.5 × its own time (at least 250 ms, about twice a second) and reuses the last result in between. The lane lines still run on every frame, and the phone slows down based on the lane time.
- **Gamma brightening** (0.5, lookup table) at night instead of the canvas filter «brightness(2.2)». With Lite2 it was better: 6 cars against 1 at dusk.
- **Test setup:** once after the update, the camera app turns on «Bruk kamera», «Bare vei», test snapshots and road data (`settings.testSetup`). It can be changed afterwards and is not set again.

## What's new in 0.9.7 / k0.6.12 – speed cameras and section control

- **Data:** NVDB «ATK-punkt» (type 162: name 9522, control direction 9527) and «Streknings-ATK» (823: name 9520, control direction 9519, a line from entry to exit). NVDB geometry runs in the metering direction, so «Med metreringsretning» means the same way as the line. I checked this on E6/E14 at Trondheim: «mot Narvik» is «Med» and the line runs towards Narvik.
- **Only our direction:** at a speed camera, the metering direction is the direction of the nearest speed-limit segment (point-to-segment distance). It is compared with the direction the car drove. Cameras that measure oncoming traffic are left out. If the direction is unknown (for example in a tunnel without data), the camera is included but marked uncertain.
- **Section control:** the average speed is computed the way ATK does it: section length divided by the time from entry to exit. The exit is the point where the distance driven after the entry equals the section length, and the time is interpolated linearly through a GPS gap. This matters in tunnels: in Helltunnelen on 31 Oct, 141 of 213 GPS fixes were inaccurate.
- **Report:** «Langs vegen» lists the speed cameras (speed and limit) and the section controls (average over the length). The situations show speed over the limit at a camera, or an average over the limit on a section.
- **Recording screen:** a yellow «Fotoboks om 400 m» when a camera in our direction is within 700 m ahead. During section control it shows «Strekningsmåling · snitt 76 km/t · 1,2 km igjen», and at the end «Strekningsmåling ferdig · snitt 75 km/t». The speed-camera data is fetched for the same area as the speed limit (`js/liveatk.js`, `fetchAtkBox`).
- **Checked on real drives with live NVDB:** Trondheim → Storlien gave three cameras towards Narvik (the ones for the opposite direction were left out), section control in Stavsjøtunnelen with an average of 74 km/h, and Helltunnelen with an average of 75 (live 77, matching the timestamps). The E6 evening drives give «mot Oslo» southbound and «mot Narvik» northbound. Road data is now version 3, so old drives fetch it again automatically.

## What's new in k0.6.11 – ready for a «Bare vei» test in the dark

Plan from now on: one thing at a time. First the road camera on its own («Bare vei», no switching), then the driver camera on its own. After that, a native iPhone app with both cameras at once. No more work goes into the switching plan.

- **Precheck for «Bare vei»:** the back camera starts at once, without face detection or calibration. The status line shows what the road camera sees («Veikamera på · 2 biler · feltlinjer · mørkt»), so it is easy to see whether the detector works before setting off.
- **Test snapshots:** in colour, 160 px on the long side (before: 96×72 greyscale), so taillights and traffic lights can be checked on evening drives. With «Bare vei», one every 20 s and an extra one when there is a car in front (at most every 8 s). Before, a continuous road camera gave only one snapshot for the whole drive.
- **Recording screen:** the pill shows «bil 18 m foran (baklys)» when the distance comes from taillights, and «i feltet» when both lane lines are found.

## What's new in 0.9.6 / k0.6.10 – after Trondheim → Storlien (31 Oct, 92 min, daylight)

- **The object detector never worked on the iPhone.** In all drives so far (2994 frames at night, 795 in daylight) it found nothing, not even weak detections. Yet the 50 test snapshots from the Storlien drive show cars clearly. It now runs on the **CPU and gets a canvas copy** of the camera frame instead of the video element. In a browser test this found 12 detections (best score 0.82) in a portrait frame, in about 50 ms. Usage is logged in `cameraPlan.perf` (`detector`, `detFrames`, `detAny`), so the next drive shows whether it works.
- **A wrong calibration blocked the road camera.** «Rett fram» was calibrated 28° away from where the driver actually looked while driving. The live classification thought the driver looked in the left mirror 63 % of the time, and the hold after mirror glances stopped almost all road looks (road camera 2 % of the time, 54 looks in 92 minutes). Now «rett fram» is taken from the median head pose above 40 km/h over the last ~60 s. If it is more than 12° from the calibration, the calibration is considered wrong: there is no mirror-glance hold, a warning shows on the recording screen, and the report says the mirror and shoulder numbers are uncertain (`camera.calibOff`). The other drives were 4–9°, so they are not affected.
- **The live speed-limit log was not exported** (`drive.liveLimits`). It was stored on the phone but left out of `exportPayload`, so a drive exported again now includes it.
- **Daylight lane lines work:** both lines were found in 265 of 795 frames, one line in 604. The car was typically 0.28 m right of the lane centre. The road frames were portrait (480×640).

## What's new in 0.9.5 / k0.6.9 – «Oppdater nå» shows up again

- **Bug:** if a new version had already been downloaded in the background (the last time the app was open), the app waited for an «installed» event that had already happened. So the «Oppdater nå» banner never appeared. A waiting version is now shown at once.
- **The iPhone does not check for updates when the app comes back from the background.** It now checks each time the app becomes visible, and every 30 minutes.
- **New button «Se etter ny versjon»** under the version number. It checks right away and says what it found.
- **The service worker installs past the browser cache** (`cache: 'reload'`). GitHub Pages caches for 10 minutes, so a new version could otherwise get old files.

## What's new in 0.9.4 / k0.6.8 – active speed limit on the screen

- **The active speed limit is shown while recording:** a speed-limit sign with the current speed next to it. It comes from Statens vegvesen (NVDB, the same data as the report). `js/livelimit.js` fetches the speed-limit segments for an area of about 4.5 × 4.5 km around the car, and fetches the next area in the background before the car reaches the edge. Each GPS fix is matched to the nearest segment within 25 m. The value changes only when 2 of the last 3 fixes agree, so it does not flicker at junctions. Without network, or where NVDB has no data (Sweden), the sign shows «–» with an explanation. It needs «Veidata» on, which is the default.
- Simulated along E14 Trondheim–Storlien with live NVDB: known for 90 % of the route (the rest is Sweden), the same as the analysis after the drive 98 % of the time, and about 0.3 s per fetch. Checked from the browser (CORS works): E6 at Trondheim gives 90.
- Each change of the shown limit is stored with the drive (`drive.liveLimits`, [{t, limit}]).
- **New mark «Feil grense»** (neutral, not feedback on the driving): press it when the app's limit does not match the sign or the car. The mark's note stores what the app showed («Appen viste 80 km/t»), so it can be compared with NVDB and the sign afterwards.
- **Camera plan (k0.6.8):** the active speed limit gives the road type. 70 and above counts as open road, with the fast interval and long looks. Below 70 counts as town. Without a limit, the speed is used as before (over 50 km/h).
- The privacy page and the «Veidata» setting say that an area around the car is sent during the drive.

## What's new in 0.9.3 / k0.6.7 – ready for long drives (Trondheim–Storlien)

- **Road data for long drives:** before, routes over about 45 km (30 map boxes) failed with «Turen er for lang». Now routes over 40 km use 3 km boxes, with a maximum of 160 (about 450 km), and the speed limits are fetched 4 at a time. Live test on the 106 km E14 route Trondheim–Storlien: 35 boxes, speed limits in 2 s (known for 90 % of the route; the rest is mainly the Swedish part, which NVDB does not cover), other road data in 14 s.
- **Matching along long routes:** `nearRoute` used at most 1500 route points. On a 100 km drive that is more than 100 m between points, so crossings and signs could be missed. It now uses up to 15,000 points.
- **Long-standstill reminder:** after 10 minutes standing still, the recording screen suggests stopping the drive and starting a new one, so a break does not become part of the report. The main app's recorder now reports live speed for this.
- Measured: analysis of a 158-minute drive takes 0.4 s on the Mac. The export is about 20 MB per 1.5 hours, so use AirDrop rather than e-mail.

## What's new in 0.9.2 / k0.6.6 – lane changes checked against 24 marks

On the 29 Oct 19:46 drive the companion marked 24 lane changes, most of them in a back-and-forth test on the E6 in the second half. The first half was country road with almost no lane changes.

- The sensors found 12 of the 24. Most misses were in the rapid sequence: lane changes 5–20 s apart, where the ±10 s road fit and the 20 s spacing cannot separate them, or where the GPS step was 5–7 m (two lanes, or GPS error).
- Shorter windows (±6–7 s, 8–10 s spacing) found up to 19 of 24, but tripled the unmarked detections, also on drives with almost no lane changes. So they were not adopted.
- **Adopted:** the gyro must confirm at least 2.2 m of sideways movement (was 1.5 m). This finds the same 12 of 24, removes both false lane changes on the country road, and gives fewer unmarked ones on the other drives (18:45 from 9 to 6, 17:07 from 2 to 1).
- Where the companion marks lane changes, the report already uses the marks as ground truth for mirror and shoulder checks.

## What's new in k0.6.5 – after the 40-minute night drive (29 Oct, 24 marked lane changes)

- **False taillight pairs:** all 416 «cars in front» came from the taillight search. They gave a median headway of 0.5 s on the motorway, which is not true, and triggered 107 extra road looks («bil nær foran»). The driver camera then saw the driver only 66 % of the time. The taillight search now rejects cluttered frames (more than 8 red lights), pairs with a third light between them, large blurry spots, and distances under 4 m. Taillight leads are still stored, but **not used** for distance, «for nær» or planning until test snapshots show that they are right.
- **The object detector found 0 cars in 2994 frames,** including 886 frames that were not dark. Each road frame now stores the best vehicle score, even below the threshold (`best`). The detector runs at 0.15 and counts from 0.35. The road frame size is stored (`cameraPlan.roadSize`), so a portrait image is visible. Test snapshots are needed to see what the camera actually sees.
- **Lane changes were nearly all «?»:** each road look took the driver camera away for 3.8 s (1.2 s to the first road frame, 1.4 s of road, 1.0 s back), every ~10 s. New: a glance at a side mirror or over the shoulder keeps the driver camera on for 8 s, because a lane change is probably coming. Simulated on the 27 Oct drives (full driver data): glances kept 96–97 % (was 87–90 %), lane-change checks the same as with full data 67–75 % (was 25–56 %). Live classification uses the calibration with a slowly following «forward».
- Driver camera settle after a switch back: 250 → 120 ms.

## What's new in k0.6.4 – road camera in the dark

Much of the practice driving in Norway happens in the dark, so the road camera keeps looking at night (k0.6.3 made looks 3× rarer in the dark; that is removed). Only bright frames with nothing to see (camera covered) make looks a little rarer. To make the dark frames useful:

- **Lane lines:** when the analysis area is dark (mean below 60), the contrast is stretched first (5th percentile → 30, 99th → 230), so lines lit by the headlights reach the thresholds. Tested on real night photos from Wikimedia Commons and on darkened day frames.
- **Car in front: taillights.** The object detector (trained on day images) finds little at night. `detectTaillights` in `road.js` finds pairs of red lights at the same height near the horizon in the middle of the image. The threshold follows the brightest red in the frame. Distance = 1.45 m × focal length / spacing. It found the car in a close night photo where the detector found nothing.
- **Brighter frame for the detector** at night (canvas filter, or a gamma table where filters are missing). This found an extra car in the night windscreen photo.
- **Optional test snapshots** (camera screen, off by default): one 96×72 greyscale JPEG per road look, stored in the road sample and included in the export, so the night detection can be tuned on real frames from the phone.
- The report gives advice for dark drives: put the phone as close to the windscreen as possible and dim the car's screen, because reflections in the glass are the biggest problem.

## What's new in k0.6.3 – camera switching fixed after the first switching drives (29 Oct)

Two drives in the evening with «Bytt» (7 and 24 min) showed:

- **Each road look gave only 0.4 s of road frames, but cost the driver camera 2.7 s.** The look length was counted from the moment the switch started, because the planner was not asked while the camera was switching. It is now asked on every tick, and a look is counted from the first usable road frame. The road camera waits until the exposure is stable (two frames with almost the same brightness, at most 1.5 s), since it takes longer to settle in the dark. A look now gives 1.5 s of frames (2.5 s on straight roads above 60 km/h when the last look saw something).
- **The road camera saw nothing in 285 frames: no cars, no lane lines.** Both drives were after dark, with screen reflections in the windscreen. Each road frame now stores its brightness (`lum`, 0–255). If the last 3 looks were dark and found nothing, looks become 3× rarer, and a dark look ends after 3 frames. The report says when the road camera found nothing.
- **Situation-based plan:** the driver camera stays on while turning and for 3 s after (as before). New: it also stays on when the speed falls steadily below 50 km/h towards a junction or roundabout, and for the first 8 s after moving off from a stop. Simulated on the 27 Oct drives (full driver camera data): standard keeps 87–90 % of mirror and shoulder glances (was 84–85 %) with the same road time.
- The first analysis after a switch is slow and no longer counts towards «telefonen ble treg».
- The old calibration from 27 Oct still fitted at highway speed (within 2–3°). The many «other» poses on the first drive were the driver looking down to the right (screen or phone), not a calibration error.

## What's new in 0.9.1 / k0.6.2 – road data and place names on by default

- «Veidata» (NVDB) and «Stedsnavn» (Kartverket) are now on by default, so a new user (for example a driving instructor testing the app) gets the full report without changing settings. They can still be turned off under Innstillinger → Kart og nettjenester. Anyone who already turned them off keeps that choice. The privacy page says the same.

## What's new in 0.9.0 / k0.6.1 – more road data from NVDB

Recognising signs with the camera was rejected for now. With 1.5 s road looks every 8–25 s the camera would catch only about 1 in 3 signs, and it would need a European sign model. NVDB already knows every sign and object along the road, with 100 % coverage, at night and in snow. Road data v2 (`enrich.road.v = 2`, «Veidata» setting) also fetches:

| What | NVDB | Rule |
|---|---|---|
| Crossings | type 174 (line, midpoint) | passed within 15 m. Speed at the crossing and 40 m before. Duplicates per direction within 4 s merged |
| Speed bumps | type 103 (`1156` type) | within 10 m. Speed at the bump and 50 m before |
| Traffic lights | type 89, only `1273` Bruksområde = Vegkryss/Gangfelt, or no use stated and a point | within 35 m, and for lines the direction must be within 35° of ours (not a road under or over). Lane-control signals over the motorway are excluded |
| Signs | type 96 sign plates `5530` = 142 Barn (7633), 100.1/100.2 Farlig sving (7601/7602) | only when the sign stands on **our right** (right-hand traffic), so signs for oncoming traffic are ignored. Max speed in the 150 m (Barn) or 250 m (curve) after it, and events in that stretch |

The NVDB filter with several values must be parenthesised: `(5530=7633 OR 5530=7601 OR 5530=7602)`. Without parentheses the request is rejected. Only objects within 25–60 m of the route are stored (about 5–6 kB per drive). Old drives fetch v2 the next time the report is opened online.

**Fusion (`situations.js`, new `nvdb` input):**
- **Place.** «ved lyskryss», «ved gangfelt», «rett før fartsdemper», «etter skiltet Barn/Farlig sving» are added to harsh events and eyes-off-road. Eyes off the road at a light or crossing counts as serious. Braking right before a bump adds «Brems tidligere og mykere». A light only counts as context if speed dropped below 65 km/h (otherwise it is probably a signal on another road).
- **New situations:**
  - Crossing at 45 km/h or more (small thing), and serious when the road camera saw people within 3 s and speed was over 30 km/h (`roadSummary.people` in the test app).
  - Speed bump at over 35 km/h, «bør øves på» over 45.
  - Barn sign with over 40 km/h in the next 150 m.
  - Harsh event after a Farlig sving sign.
- The report gets «Langs vegen» in «Veier og manøvrer»: crossings, speed bumps, lights and signs with speeds.

Tested against live NVDB on the 27 Oct drives. 17:46: 21 crossings, 9 bumps, 3 lights, 1 Barn, 1 Farlig sving. 18:27: 20 crossings, 1 bump, 6 lights. 83 tests.

## What's new in k0.6.0 (camera test app) / 0.8.2 – optimised switching, lane lines

Built on the camera test from the iPhone (27 Oct). Both cameras at once is not possible. A switch takes 0.62 s to the first frame and 0.84 s to settled exposure, very consistently. Before building, the strategies were simulated on the two calibrated drives by removing driver-camera data when a plan would have looked at the road:

| Plan | Driver | Road | Blind | Mirror/shoulder glances kept |
|---|---|---|---|---|
| Old (4/3 s, 6/2 s) | 68–71 % | 18–22 % | 13–15 % | 61–79 % |
| **New, standard** | **82–84 %** | **8–9 %** | **8–9 %** | **84–85 %** |
| New, goal «speil og skulderblikk» | 91 % | 4–5 % | 4–5 % | 94–95 % |

What was built:
- **Planner (`kamera/js/plan.js`).** Short road looks of 1.5 s. Never below 15 km/h, never while turning or in the 3 s after (turning = gyro projected on gravity > 6 °/s, using the iPhone axis order). An immediate look on hard horizontal acceleration without turning, i.e. braking. Every 5 s when the last look showed a car closer than 1.5 s. Phases are counted from when the new camera shows a frame. Plain total rotation was tried and rejected: road vibration made it read «turning» 45 % of the time against 13–17 % really.
- **Practice goal and driver profile** set the interval between looks. «Speil»/«feltskifte» gives 25 s, «fart»/«jevn fart»/«bremsing» gives 6 s, and the standard is 8 s above 50 km/h and 12 s in town. The profile from the driver's last 5 drives (Beta-smoothed mirror and shoulder rates, close following) shortens or lengthens it. The driver camera is clamped to at least about 60 % and the road to at least about 5 %. Reasons are stored with the drive and shown in the report.
- **Live sensors in the recorder:** smoothed yaw rate about the vertical (°/s) and horizontal linear acceleration (m/s²).
- **«No» needs 90 % coverage.** A missing mirror or shoulder check is «nei» only when the driver camera saw the driver 90 % of the window, otherwise «?». At 50 % the simulation gave wrong «nei» in up to 25 % of checks.
- **Frames from the first 250 ms after a switch are dropped** (exposure still settling), so a dark frame cannot look like a lost face, which would read as a shoulder check.
- **Performance:**
  - Smoothed time per analysis for each model is measured.
  - Above 110 ms the camera drops to 5 fps («telefonen er treg (varm?)»), and returns to 8 fps after 20 s of fast frames.
  - Stored per drive with the camera split, the reasons for road looks and the average switch time (`drive.cameraPlan`).
  - A camera that delivers no frames can no longer hang a switch (2 s timeout on `play()`).
- **Lane lines (`kamera/js/lanes.js`).**
  - **Method:** bright stripes on a dark (asphalt) background in the lower part of a 160 px wide grey image, a RANSAC line per side, then checks that both lines point towards a vanishing point near the centre. Offset from the lane centre uses a 3.25 m lane, and it takes about 1–6 ms per frame.
  - **Results on Wikimedia road photos:** trees and snow edges are rejected, and the Saltfjellet centre and edge lines are found. Dashed lines far away are often missed.
  - **Use in the app:** a live overlay («Vis feltlinjer») on the camera screen. Lane position is stored with each road frame, and the report shows «Plassering i feltet» (share of frames with both lines, typical offset, spread, frames near a line).
- 81 tests (new: `plan.test.mjs`, `lanes.test.mjs`).

## What's new in k0.5.0 (camera test app) – road camera and camera switching

The test app `kamera/` is now the test bed for the road-facing (rear) camera.

- **Road camera** (`kamera/js/road.js`, `facecam.js`). It uses the MediaPipe Object Detector with EfficientDet-Lite0 (`vendor/mediapipe/efficientdet_lite0.tflite`, 4.6 MB, Google's model bucket, COCO classes) and only counts car/truck/bus/motorcycle/bicycle/person. The lead vehicle is a vehicle centred in the frame (middle 30 %) with its bottom edge in the lower part, the widest one. Distance = typical vehicle width × focal length / box width, assuming about 66° field of view on the long side, so ±20–30 %. Time gap = distance / GPS speed. Only numbers are stored (`road` samples in the chunks), never images. On five Wikimedia traffic photos it found the cars and picked a sensible lead car (11–19 m in queues). It takes about 80–120 ms per image on a Mac CPU.
- **Modes** in Kamera → «Veikamera»:
  - «Av»
  - «Bytt»: switches between driver and road camera by speed. Below 15 km/h driver only; 15–50 km/h 6 s driver / 2 s road; above 50 km/h 4 s driver / 3 s road. A phase is counted from when the new camera actually shows a frame.
  - «Bare vei»
- **Camera test** («Test to kameraer»):
  - First tries to keep both cameras on at once, by checking that each track is live, not muted and still delivering frames.
  - Then switches 10 times and measures time to the first frame and to settled exposure (3 frames within 4 % brightness).
  - Shows how much of the time each camera would see at highway speed, and can share the result.
  - iPhone Safari is expected to allow only one camera at a time. The test settles it on the actual phone.
- **Fusion that accounts for the gaps:**
  - Mirror and shoulder checks are «ukjent» (null, shown as «?») instead of «nei» when the driver camera saw the driver less than half of the window. A glance that was seen still counts as yes.
  - Time with the road camera is not counted as time without mirror checks, and glances per minute use the time the driver camera was actually on (`frontShare`).
  - Close following: a time gap under 1.0 s at 50 km/h or more for at least 2 s («Kort avstand til bilen foran», serious under 0.7 s). Between road-camera bursts the gap is assumed unchanged, but only while our GPS speed changed less than 15 km/h. Otherwise no bridge.
  - Braking: the report says how far ahead the lead car was just before, and braking with a time gap under 1.5 s counts as serious.
  - The report gets a «Veien foran» section with typical time gap and distance, close-following count and how much of the time each camera saw.
- New tests: `tests/road.test.mjs` (lead selection, distance, bridging, no bridge after a speed change, storable result), plus gap tests in camera and situations. 75 tests in total.

## What's new in 0.8.1

- Mirror and shoulder checks that could not be judged show «?» instead of ✕ (shared camera code). The source label «Kamera» is now «Førerkamera».

## What's new in 0.8.0 – camera in the main app, and data fusion

**Camera moved into the main app.** Everything from the camera test version is now in Kjørerapport itself, off by default. It covers calibration from the checklist, spoken full-screen calibration, mirror and shoulder checks, marked lane changes, forward drift and «Kalibrer og vurder turen» afterwards. Turn it on under «Kamera: speil- og skulderblikk» on the home screen. The camera code now lives in `js/camera.js` and `js/facecam.js`, and the MediaPipe files moved to the shared `vendor/mediapipe/`. They are cached on first use in `kjorerapport-ml`, which is kept across versions. `kamera/` stays as a separate test app and will become the test bed for the road-facing camera.

**Moving drives from the camera test app.** Each home-screen app on iPhone has its own storage, so this goes through a backup. In Kjøre Kamera: Innstillinger → «Ta kopi». In Kjørerapport: Innstillinger → «Gjenopprett», then answer yes to restoring the settings too (this brings the calibration). Restored drives are no longer flagged «importert», so they count in statistics.

**Data fusion – «Situasjoner» (`js/situations.js`).** GPS, motion sensors, driver camera, companion marks and road data are combined into situations. Each situation has a time, a place, a severity (alvorlig / bør øves på / liten ting / bra) and the sources that saw it:
- **Eyes off the road** (camera + GPS, `eyesOffRoad` in camera.js). A situation is 2–6 s with the head clearly away from the road ahead (mirror, shoulder, or more than 15° off), at 30 km/h or more, on a road turning less than 4 °/s. In curves the head follows the road, so turning stretches are skipped. Over 6 s is almost always posture or drift, not distraction. 2 s is the NHTSA limit for doubled crash risk. The 27 Oct drives gave 3 each, for example a 2.9 s look in the left mirror at 81 km/h (67 m).
- **Harsh events with context.** Braking with eyes off the road in the 5 s before counts as serious, and so does a harsh event while speeding. Events inside roundabouts are labelled as such.
- **Lane changes** (marked or detected) with mirror and shoulder checks, and the pull-out at the start.
- **Speeding episodes** of 10 km/h or more over the limit (road data), unless already part of another situation.
- Companion remarks within 10 s are attached.

The report gets a «Situasjoner» card after the map. The most serious come first, the good ones are folded away, and tapping one zooms the map. «Kort fortalt» mentions the number of serious situations. New tests: `tests/situations.test.mjs`, plus an eyes-off-road test in `tests/camera.test.mjs`.

## What's new in 0.7.8 / k0.3.0 – undo, marked lane changes for the camera, forward drift

Based on the 27 Oct 18:27 drive, where the companion marked all 10 lane changes. One was a double tap, and there was one stray «Annet».

- **Undo**: «Angre «Feltskifte» (6:59)» under the mark buttons removes the last mark. Two taps on the same mark within 2.5 s count as one, and in the report «Feltskifte» marks less than 4 s apart count as one.
- **Automatic lane changes stay strict.** Loosening the sensor detector enough to find 5 of the 9 marked lane changes also gave 14–18 false ones on the other drives. At highway speed a lane change is about 1–2 °/s of rotation and a few metres in the GPS track, which is the same size as normal weaving and GPS noise. Half of the marked ones were also below 45 km/h.
- **The camera uses the companion's «Feltskifte» marks** as the lane changes when there are any (`markedLanes` in `evaluateMirrors`). The direction is unknown, so any mirror 15–1 s before the mark and either shoulder 12–0 s before count. Without marks it falls back to the sensor lane changes. 18:27 drive: mirror before 8 of 9, shoulder before 3 of 9.
- **Forward drift**: every 30 s the median head pose near «straight ahead» is found, and all targets shift with it (at most 10°, `forwardDrift`). On the 18:27 drive the head sat about 3° higher than at calibration. «Straight ahead» went from 47 % to 58 % and «looking elsewhere» from 39 % to 26 %. The report warns when the drift exceeds 6°.
- **Shoulder checks**: the threshold is now at least 8° or 40 % beyond the mirror on the same side (it was 50 % + 5°). The camera underestimates large head turns and loses the face around 50–60°, so the old right-hand threshold (61° in our car) was almost never reached.

## What's new in 0.7.7 / k0.2.4 – turn thresholds raised

Default turn thresholds raised from 3.0 / 4.0 m/s² (0.31 / 0.41 g) to **3.5 / 4.5 m/s² (0.36 / 0.46 g)** for «brå» / «kraftig». They were never really exercised before 0.7.5, because the iPhone gyroscope was read with the wrong axes. With correct axes, ordinary roundabouts at 20–25 km/h gave 0.31–0.37 g. The «Snill» and «Streng» sensitivity settings and custom thresholds scale from the new values as before. Results: 27 Oct 17:46 → 1 turn event (0.37 g at 13:00), 27 Oct 17:07 → 0, 24 Oct → 4 (0.36–0.41 g).

## What's new in 0.7.6 / k0.2.3 – lane change ground truth

- New companion button «Feltskifte» (wide, dashed, below the others). It is not a remark: the companion presses it right after each lane change to give the app a ground truth.
- The report's «Veier og manøvrer» then shows «Fasit: ledsageren merket N feltskifter, appen fant X av dem, og Y som ikke var merket». Each found lane change is labelled «bekreftet av ledsager» or «ikke merket av ledsager», and marked lane changes the app missed are listed as «Ikke funnet av appen». A mark counts for a detected lane change from 3 s before it starts to 15 s after it ends (`laneTruth` in report.js).
- These marks are kept out of remark counts, practice-goal suggestions and hotspots.

## What's new in 0.7.5 / k0.2.2 – iPhone gyroscope axes, GPS-first lane changes

**Gyroscope axes on iPhone.** The recorder stores `rotationRate` per the spec (alpha about z, beta about x, gamma about y). On iPhone (WebKit) alpha is in practice about x, beta about y and gamma about z. With the phone fairly upright (camera facing the driver) the projected yaw was almost zero: gyro vs GPS turning slope 0.02–0.10 on the two 27 Oct drives (0.33 on 24 Oct). `yawSeries` now tries both axis orders on every drive and keeps the one that follows the GPS heading best (`result.gyroAxes`, `result.axesCorr`). Slope is now 0.96–1.02. This fixes old drives too. Turn events, roundabouts and lane changes change accordingly; braking and acceleration don't use the gyroscope and are unchanged.

**Lane changes: GPS first, gyroscope confirms.** At highway speed a lane change is only about 1 °/s of rotation, which got lost in gyro noise and road curvature. The marked lane change on 27 Oct (12:04–12:10, 77 km/h, in a long gentle right-hander) was clearly visible in the GPS track (3.2–3.5 m right, fit RMS 0.1 m). New method:

1. Scan 4–8 s windows for a clean sideways step of 2.5–5 m in the GPS track (cubic road line ± step, RMS ≤ 0.35 m), at ≥ 45 km/h for the whole window ±10 s.
2. The road's turning rate must be steady (std ≤ 0.8 °/s). Gentle curves are fine. Curves that tighten or open up are not.
3. The gyroscope, with heading drift in the window removed, must show ≥ 1.5 m sideways to the same side.
4. Best candidate per 20 s.

Results: 27 Oct 17:46 → 10:29 left, 12:04 right (the marked one). 27 Oct 17:07 → 2. 24 Oct → 6, mostly right-hand merges at 77–90 km/h (2+1 road?). New tests: lane change in a gentle curve at 80 km/h, and automatic recognition of iPhone axes.

## What's new in 0.7.4 / k0.2.1 – fewer false lane changes

The 27 October drive (13 km, curvy road) showed 19 lane changes; the driver made only a few. Most were curve entries and exits where the road-curvature estimate from GPS lags the gyroscope, leaving half an S that the integrator read as a lane change. A candidate now has to pass three extra checks:

1. **S-shape in the gyroscope**: rotation both ways, the smaller lobe at least half the larger, in the order that matches the direction.
2. **GPS confirms the shift**: the track ±10 s is fitted with a cubic road line plus a step; the car must have moved 1.5–7 m sideways to the same side, with the road fitting within 1.5 m RMS (`gpsLateralStep` in analysis.js).
3. **Not on a curvy stretch**: the road turns less than 20° in total (both ways counted) within ±8 s.

Result: 27 Oct drive 19 → 2 (11:06 right, 12:11 left), 24 Oct drive 6 → 0. Three new tests cover a gyro S with no GPS shift, a curvy road at 60 km/h, and the GPS step measurement; all three fail with the old method. Cached analyses are invalidated so old drives are re-analysed. Lane changes below 45 km/h and in curves are not counted, so some real ones can be missed.

## What's new in 0.7.3 / k0.2.0

- Camera version: calibration is easy to find. «Kalibrer nå» sits in the camera row of the pre-drive checklist, the home card turns orange with «Ikke kalibrert» when the camera is on but not calibrated, and the camera screen shows «Kalibrer» at the top (it starts the camera itself).
- Calibration runs full screen with large text and reads each step aloud («Se i venstre sidespeil»), because the driver is looking at the mirrors, not the screen. It can be cancelled.
- A drive recorded without calibration can be assessed afterwards: the report offers «Kalibrer og vurder turen» (calibrate with the holder where it was, then the drive is re-analysed from the stored head angles) or «Bruk kalibreringen jeg har». Calibrated drives get «Kalibrer på nytt for denne turen».
- If the selected driver has no calibration, the newest calibration is used.
- Fixed: the driver's name appeared twice in the shared summary. Toasts could stay on screen if the page was hidden when they appeared.

## What's new in 0.7.2

- Settings has a new «Om appen» card with «Gi tilbakemelding» (opens an e-mail to Jo@svendsenmedia.net with the app version and device filled in), «Personvern» and a link to the driving-school page.
- Every report ends with «Stemte rapporten? Si fra». The e-mail includes the drive's score, distance, time, number of events, engine and sensitivity, so feedback can be matched to the drive. The user sees and can change everything before sending.
- Same changes in the camera version (k0.1.1).

## What's new in 0.7.1

- Fix: the main app and the camera version share a web address, so each service worker now only clears its own caches.
- The main service worker ignores everything under `kamera/`.

## What's new in 0.7.0

- **Practice suggestions.** The app looks at the last five real drives for the selected driver and suggests up to three goals with a reason, for example «Bremsing: snitt 57 poeng på de 2 siste turene» or «Ingen mørkekjøring registrert ennå, og det er mørketid». Shown in the start card on the home screen and in step 1 before driving, with «Bruk forslagene».
- **Spoken summary.** A speaker icon in the report reads out the score, distance, events, what went well, the most important tip and today's goals in Norwegian. With «Les opp rapporten» on in settings it starts by itself when the companion stops the recording.
- **Hotspots (Faresteder).** A map and list of places where events or companion marks repeat across drives (within 60 m), with street names and «på 2 av 3 turer som passerte».
- **Same route.** When a drive follows a route you have driven before (70 % overlap both ways within 80 m), the report shows a table of all drives on that route and whether this was the best one.
- **Drive replay.** «Spill av turen» under the map moves a dot along the route at 20× or 60× with time and speed, and event markers pulse as they are passed.
- **Training plan (Opplæring).** A checklist following the main parts of the class B curriculum (obligatory parts, trinn 2, 3 and 4), stored per driver with the date each item was ticked. Items the app can see on the drives show evidence, for example minutes on town roads, darkness, roundabouts, lane changes, junctions and time over the speed limit.
- **Backups include settings** (drivers, goals, training plan, thresholds, switches); restoring asks whether to restore them too. A banner on the home screen reminds you when two or more drives are not backed up (snooze for a week). Settings show the last backup and how much space the app uses.
- **Automatic tests on GitHub.** `.github/workflows/test.yml` runs the syntax check, the unit tests and the service-worker file check on every push.
- **Publishing through GitHub Desktop.** The local history is merged with the history created by browser uploads, so updates are now a normal commit and «Push origin».
- Tests: 53.

## What's new in 0.6.0

- **Quick-mark buttons for the companion.** The recording screen has six large buttons: Speil, Skulder, Blinklys, Plassering, Fart and Annet. Each tap stamps the moment with that category and shows a running count on the button. In the report the marks carry their category, are summarised («Ledsageren merket: speil 2, fart 1») and are linked to lane changes and events nearby.
- **Today's practice goals.** Step 1 before driving lets you pick up to three goals (myk bremsing, rolig akselerasjon, svinger, jevn fart, fartsgrenser, rundkjøringer, feltskifte, kryss og vikeplikt, speil og skulderblikk, mørkekjøring). The report opens with «Dagens mål» saying for each one whether it was reached, with the numbers behind it. The choice is remembered for the next drive.
- **Roads and maneuvers.** A new report section shows time on town roads, country roads and motorways, the light conditions, and a list of maneuvers you can tap to see on the map:
  - **Lane changes** detected from the gyroscope at 45 km/t or more, after subtracting the road's own curvature (from a smoothed GPS track). On the first real drive this went from 22 false hits to 6 plausible ones.
  - **Roundabouts** from NVDB (junction type «Rundkjøring», with diameter), or from the gyroscope's right–left–right pattern when road data is off. Each shows whether there were harsh events inside it.
  - **Stop signs** (sign 204 in Norway – rare) from NVDB: whether the car came to a full stop (below 3 km/t) or rolled.
  - **Give-way junctions** (sign 202) where you slowed down, with speed in and lowest speed. Informational only: the app cannot know if there was traffic.
  - Road data is fetched with the existing «Veidata» switch (formerly «Fartsgrenser»), in parallel: about 6 seconds for a 15 km drive.
- **Driving log.** A new «Kjørelogg» screen (card on the home screen) with total driving time, distance, number of drives and time in darkness; time split by road type (from speed limits when road data is on, otherwise estimated from speed) and by light (computed from the sun's altitude at each point, no network); minutes per week for the last eight weeks; and export as a spreadsheet (CSV with semicolons and decimal commas for Norwegian Excel/Numbers).
- **Reminder in the car.** Settings explain how to make the iPhone Shortcuts app show a notification when the phone connects to the car's Bluetooth. It deliberately does not open a URL, because that opens Safari, which has separate storage from the home-screen app.
- Fixes: week buckets in the log no longer break on the daylight-saving change; the drive list heading «Denne uken» is now «Siste 7 dager».
- Tests: 48.

## What's new in 0.5.0 – design and experience

- **New look.** Sticky app bar with icons on every screen, softer cards with depth, a consistent icon set (`js/ui.js`), subtle screen transitions and growing score bars. Light and dark mode both checked.
- **Home.** A dark start card with a road motif and a yellow «Start kjøretur» button that greets the selected driver. A «Siste tur» card shows the score sign, key numbers, the change from the previous drive and the most important tip. Summary is a clean 2×2 grid. Drives are grouped by «I dag», «I går», «Denne uken» and month, each with a small route thumbnail and a score badge. Loading shows skeleton rows, and an empty list has a proper empty state. Goals show progress bars.
- **Report.** Score and a «Kort fortalt» card come first: what went well, what to work on, time over the speed limit and companion marks, in one list. Technical notices (GPS glitches, holder moved, hidden app, sensor details) moved to a «Datakvalitet» card with a status pill; only serious ones (short or interrupted drive) still show next to the score. Print and share are icons in the app bar. The section tabs highlight where you are while scrolling and show counts for events and marks.
- **Before driving.** Three numbered steps (fest telefonen, gi tilgang, sjekker sensorene) that tick off as they complete. The start button says what it is waiting for («Venter på GPS (34 m) …») and gives a short vibration when ready.
- **Settings.** Grouped under Vurdering, Førere og mål, Kart og nettjenester, Utseende and Data, with iOS-style switches. Distance-adjusted scoring is now a switch.
- **Own dialogs and toasts** replace the browser's alert, confirm and prompt boxes.
- Fixes: the page could become wider than the screen (goal fields), which made phones zoom out; the tab bar no longer interrupts scrolling.

## What's new in 0.4.0

- **Real map in the report.** The route is drawn on a map from Kartverket (topographic, grey tone; inverted in dark mode) using Leaflet 1.9.4, which is bundled in `vendor/leaflet` so no CDN is involved. The route keeps its road look with a yellow centre line, stretches over the speed limit are red, events are numbered markers and companion marks are diamonds. Pinch to zoom; «Utforsk kartet» opens a full-screen map that can be panned. Tapping a marker opens that event's details. Map tiles you have seen are cached by the service worker (up to 1 500 tiles), so reports open offline afterwards. The map can be turned off under Nettjenester; the old offline route drawing is then used.
- **Event details.** Tapping an event opens a panel with a ±20 s chart of speed and the measured force with the brisk/harsh thresholds, a plain-language description («Farten falt fra … til …»), duration over the threshold, the speed limit and street at that spot, any companion mark nearby, a tip, and «Vis i kartet», which zooms the map to the event.
- **Print / PDF.** «PDF» in the report header opens the print dialog (on iPhone: share → save as PDF). The print layout hides buttons, forces light colours, expands «Slik måles det» and keeps the map.
- **Drivers.** Add drivers in settings and pick «Hvem kjører?» before each drive. The home screen gets driver filter chips; tiles, goals and trends follow the filter, and «Forrige tur» compares with the same driver. The driver can be changed on a report afterwards and is included in exports.
- **Goals and category trend.** Optional goals (minimum score, maximum events per 10 km) shown on the home screen against the average of the last three drives, with the score goal as a line on the trend. The trend can switch between overall score and the four categories.
- **City-aware «Jevn fart»** (default on): the 10 s before and after each stop are ignored. On the first real drive this raises «Jevn fart» from 87 to 92.
- **Holder check.** During analysis, sudden changes in the phone's orientation (over 12° between 5 s windows, ignoring the first and last 30 s) are reported with time, and whether the phone sat differently afterwards. If it did, the v3 engine calibrates the driving direction separately before and after. On the first real drive it found the moment the phone was handled at 13:22–13:50, put back the same way. The pre-drive check also shows «Telefonen står stødig» (advisory).
- **Advanced thresholds** in settings: brisk and harsh limits for braking, acceleration and turns in m/s² (with g shown), applied before the sensitivity preset, with a reset button.
- Fixes: report no longer jumps to the top when street names or speed limits finish loading; buttons marked hidden (for example «Start likevel») are now really hidden.
- Tests: 39.

## What's new in 0.3.5

- **v3 is the default engine.** On the first real drive the iPhone delivered full 60 Hz motion data and the accelerometer agreed with GPS (correlation 0,76), while GPS alone missed eight brisk brakes. v1 remains available in settings.
- **Stale fixes are dropped at the start of a recording.** Until the first fresh, accurate position (accuracy ≤ 30 m and age ≤ 5 s), GPS fixes are ignored, and the recording screen says «GPS: venter på fersk posisjon …». This removes the cause of the 416 km/t glitch at the source; the analysis filter stays as a safety net. The number of dropped start fixes is in the diagnostics.
- Tests: 33.

## What's new in 0.3.4

- **Glitch filter tuned on the first real export.** The stale start position lasted 10 points, which the 0.3.3 rule kept. Fragments shorter than 20 % of the main track are now dropped. On the real drive this removes 11 points, brings the top speed from 416 to 90 km/t and the overall score from 61 to 92 (v1).
- **v3 calibration made robust.** GPS spikes above 8 m/s² are ignored when fitting the driving direction, and the quality check is now the correlation between GPS and accelerometer acceleration (threshold 0,5) instead of R², because iPhone's GPS speed is smoothed and damped, which made R² low (0,45) even though the two sources agreed well (correlation 0,76).
- Track preprocessing extracted as `prepareTrack()` for analysis tooling.

## What's new in 0.3.3

- **GPS glitch filter.** The first real drive started with a position jump (a network fix before GPS lock) that produced 416 km/t, 35 g events and a «Jevn fart» score of 0. The analysis now splits the track at jumps that would require more than 216 km/t and discards short fragments, drops reported speeds above that, and treats speed changes above 15 m/s² as sensor errors. The report says how many points were dropped. This is the first change to the prototype's preprocessing; event detection and scoring are untouched, and the demo drive still gives 82 points.
- All stored drives are re-analysed automatically with the filter.

## What's new in 0.3.2

- **Sensor diagnostics.** Each recording stores what the phone delivered: motion events per second, whether gyroscope, gravity and linear acceleration were present, GPS fixes per second and typical accuracy, the Wake Lock result, whether the app ran from the home screen, gaps, marks and the browser's user-agent string. Shown under «Slik måles det → Telefonen leverte» and included in exports and backups.
- **Comparisons use real recordings only.** «Forrige tur», the change arrows, the summary tiles and the trend ignore demo and imported drives, and the demo report no longer compares itself with anything.

## What's new in 0.3.1

- **Speed limits from Statens vegvesen (NVDB), opt-in.** Innstillinger → Nettjenester etter turen → Fartsgrenser. When a report is opened with network access, the route is split into stretches of about 1,5 km, and the speed-limit objects (NVDB API v4, type 105) in each stretch are fetched. Every GPS point is matched to the nearest speed-limit segment within 25 m, small gaps are filled, and single-point mismatches at junctions are smoothed. The report gets a «Fartsgrenser» section with its own score (100 minus 1,5 per second over the limit, minus 10 per episode 10 km/t or more over), seconds over, worst exceedance, route coverage and a list of episodes. The speed chart shows the limit as a red dashed line and shades time over the limit. The score is not part of the overall score. Results are stored on the drive, so the report works offline afterwards. Rate: 1 request per stretch, about 2–3 seconds for a 10 km drive.
- **Street names from Kartverket, opt-in.** Innstillinger → Nettjenester etter turen → Stedsnavn. Events and marks get the nearest street name (address lookup within 80 m), shown in the lists and in the shared summary.
- Both services are off by default. The settings text explains that route positions are sent to the service. Nothing else leaves the phone, and a failed fetch is remembered for an hour so the report does not keep retrying; «Prøv igjen» forces a retry.
- Tests: 28 in total (WKT parsing, route chunking, matching, gap filling, blip smoothing, speeding analysis).

## What's new in 0.3.0

- **Merk-knapp for ledsager.** A large «Merk» button on the recording screen stamps a moment (A, B, C …) with a short vibration. No feedback reaches the driver. In the report each mark shows time and speed, gets a comment field that saves automatically, and is drawn as a black diamond on the map and a dashed line in the speed chart. Marks are included in the shared summary and in exports.
- **Engine v3 (accelerometer), behind a setting.** The recorder now also stores linear acceleration at 20 Hz. With Innstillinger → Analysemotor → v3, braking and acceleration are measured from the accelerometer projected on the horizontal plane, with the driving direction found by least-squares fit against GPS, so phone orientation does not matter. If the fit is poor (R² below 0,4, for example a loose holder) it falls back to GPS and says so under «Slik måles det». On the demo drive v3 finds a brisk brake (2,9 m/s² by design) that GPS smoothing hides. v1 remains the default until it has been compared on real drives.
- **Points adjusted for distance (default on).** Penalties are counted per 10 km, with a 5 km floor so a short trip cannot look perfect. Can be switched off in settings to get the prototype's scoring. The demo drive scores 69 with this on (82 with it off).
- **Persistent storage and backup.** The app asks the browser for persistent storage and shows the answer in settings. «Sikkerhetskopier alle turer» writes one JSON file with every drive and its raw data; «Gjenopprett fra sikkerhetskopi» reads it back and skips drives that already exist. The iOS install hint now warns that Safari may delete data after 7 days unless the app is on the home screen.
- **Recorder refactored into pure functions** (`js/sensors.js`) with 8 tests covering gravity derivation, 20 Hz downsampling, gyro unit conversion and gap marking. The tests caught a floating-point bug that made 60 Hz input downsample to 16 Hz instead of 20.
- **Short drive warning** at the top of reports under 1 km.
- **UI:** a sticky quick-navigation bar (Rute · Poeng · Fart · Hendelser · Merker), a plain-language scale next to each g value (lett / merkbar / kraftig), a larger «Del rapport» button, and the score counts up on the speed sign (unless reduced motion is on).
- Tests: 22 in total.

## What's new in 0.2.0

- Home: summary tiles (drives, total km, average, best, events per 10 km), a «Slik fungerer det» card for first-time users, and an install hint (Android install button, iOS «Legg til på Hjem-skjerm» instructions).
- Pre-drive check: after 20 seconds of waiting with GPS accuracy of 40 m or better, a «Start likevel» button appears as an escape hatch (for example under a carport). The strict 20 m rule still applies to the normal Start button.
- Recording: short vibration on start and stop (Android), and a line showing when the last checkpoint was saved and how many GPS points are in.
- Report: notes per drive (saved automatically and shown in the list), «Del» button that shares a text summary via the share sheet or clipboard, «Dette gikk bra» section with positive feedback for categories at 90 or above, per-category change arrows against the previous drive, stops and events per 10 km in the stats, a north arrow and scale bar on the map, tapping a map marker highlights the event in the list, and a delete button.
- Settings: light/dark/automatic theme, import of exported JSON files (so a drive can be opened on another phone), and «Analyser alle turer på nytt».
- Tests: 10 in total (summary text, events per 10 km, labels, export round-trip).

## Known limitations and next steps (not in v1)

- Recording only runs while the screen is on and the app is in front. Background recording with the screen off needs a native app. Tell the accompanying driver.
- The service worker could not be tested inside the desktop preview browser (it blocks service workers). Verify offline mode on the phone: load the app once, turn on flight mode, open it again from the home screen.
- Camera-based mirror and shoulder checks.
- An instructor view for comparing drives and pupils.
