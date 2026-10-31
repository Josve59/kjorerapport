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
