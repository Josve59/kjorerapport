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
