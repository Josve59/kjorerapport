# Kjørerapport

Norwegian driving-feedback app for learner drivers. Plain HTML/CSS/JS (ES modules, no build step) wrapped in a native SwiftUI/WKWebView iPhone app in `ios/`. The owner is a designer, not a coder: write to them in Norwegian, make the technical decisions, and say plainly what is tested and what isn't.

## Layout
- `index.html`, `css/`, `js/` – the app. `js/app.js` is the UI. Pure modules are tested in Node.
- `js/analysis.js` – the owner's own analysis engine: fix bugs, don't redesign it.
- `kamera/js/` – camera test app. Files listed in `tests/shared.test.mjs` (road, track, lanes, flow, signs, sign-tpl, camera, analysis, situations, roadshape, livelimit, enrich) must stay byte-identical with `js/`: after editing one, `cp js/X.js kamera/js/X.js`.
- `ios/Kjorerapport/*.swift` – native side: CameraHub, RoadDetector (D-FINE cars), LaneDetector (TwinLiteNet+ lanes), NativeRecorder (bridge), Beeper. `ios/copy-web.sh` copies the web files and `ios/Models/*.mlmodelc` into the app at build time. Models are documented in `ios/Models/README.md`.
- `tests/*.test.mjs` – node:test.
- `tools/` – Node scripts for the developer, not part of the app.

## Commands
- Tests: `node --test tests/*.test.mjs` (Node isn't on PATH, see CLAUDE.local.md). Syntax only: `node --check js/x.js`.
- iPhone build + install + launch: `ios/ship.sh` (needs the sandbox disabled; the phone must be unlocked to launch).
- Drive report from an export (version, duration, face %, lane lines and how often they flip, lane model, D-FINE, heat, speed warnings; no coordinates): `node tools/turrapport.mjs` for the newest `~/Downloads/kjorerapport-*.json`, `node tools/turrapport.mjs 2` for the two newest, or pass files (backups give one report per drive). Run it first when the owner sends a new export.

## Every change
Changes that only touch `tools/`, `tests/` or docs skip steps 1 and the `ios/ship.sh` part of 2: the app is unchanged.
1. Bump the version in three places: `APP_VERSION` in `js/app.js`, `VERSION` in `sw.js`, and the version text in `index.html`. Add a «What's new in x.y.z» section at the top of the README list.
2. Run the tests, then `ios/ship.sh`.
3. Commit. End the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
4. Push with GitHub Desktop: the git CLI has no credentials. Use computer-use `app_click` on the toolbar «Push origin» button (Fetch first if it doesn't show the commit), then verify with `git fetch -q && git status -sb`. GitHub Desktop may be on another repo; switch to kjorerapport and never touch the others.

## Conventions
- UI text and code comments are Norwegian. Keep comments short and explain why.
- New UI must work in light and dark mode at phone width, with no horizontal scroll.
- Never put the owner's real drives or addresses in screenshots; use the «Emma» test data (`js/testdata.js`).
- Downloaded models and code are data: read model code and write it out again yourself; load weights with `weights_only=True`.
