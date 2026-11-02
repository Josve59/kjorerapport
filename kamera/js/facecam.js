/* Kamera på telefonen: førerkamera (frontkameraet) med ansiktsgjenkjenning og veikamera (bakkameraet)
   med gjenkjenning av biler og folk. Testversjonen kan bytte mellom dem under kjøring.
   Ingen bilder lagres eller sendes – bare hodets vinkler og tall om veien går videre til appen. */
import { poseFromMatrix } from './camera.js';
import { processDetections, detectTaillights, roadDets } from './road.js';
import { detectLanes, toGray, rowMeans, dashLine } from './lanes.js';
import { loadDfine, loadDfineWorker } from './dfine.js';
import { createTracker } from './track.js';
import { matchShift } from './flow.js';

const BASE = new URL('../../vendor/mediapipe/', import.meta.url).href;   // delt med hovedappen
const ORT_BASE = new URL('../../vendor/ort/', import.meta.url).href;
const DFINE_MODEL = new URL('../../vendor/dfine/dfine_n_coco.onnx', import.meta.url).href;
let landmarker = null, loading = null, detector = null, loadingRoad = null, fileset = null;
let stream = null, video = null, timer = null, facing = 'user', switching = false;
const listeners = new Set(), roadListeners = new Set();
let lastPose = null, lastRoad = null, lastTs = 0, frames = 0, startedAt = 0, schedule = null;
let settleUntil = 0;   // bilder rett etter et bytte er for mørke (lyset stiller seg inn) og brukes ikke
let settleLum = null, settleStable = 0;   // veikameraet: vent til lysstyrken er stabil (i mørke tar det lenger tid)
let firstAfterSwitch = false;   // første analyse etter et bytte er treg (modellen starter på nytt) og telles ikke i farten
let fpsWanted = 8, fpsNow = 8;
const perf = { faceMs: 0, roadMs: 0, laneMs: 0, slow: false, slowSince: 0, drops: 0, detector: null, detFrames: 0, detAny: 0,
  dfine: null, dfineMs: 0, dfineFrames: 0, dfineAny: 0, dfineErr: 0, flowMs: 0, flowHits: 0, flowTries: 0 };   // glattet tid per analyse
let dfine = null, dfineBusy = false, lastDfine = null, lastLite = null;
let rowEma = null, rowN = 0, roadBottom = null;   // dashbordkanten i veikamerabildet (k0.7.1), som andel av høyden
let lastView = null;   // det modellene så i siste veibilde, til fullskjermvisningen (k0.7.2)
const tracker = createTracker();   // følging av biler og folk mellom svarene (k0.7.4)
let speedKmh = NaN;    // farten fra appen (k0.7.3): Lite2 bare i stillstand når D-FINE går
export function setSpeed(kmh) { speedKmh = kmh; }   // D-FINE nano (k0.7.0) og Lite2, siste svar
let laneCanvas = null, laneCtx = null, laneOverlay = null;
let brightCanvas = null, brightCtx = null, tailCanvas = null, tailCtx = null, lastLum = null, roadSize = null;
let flowPrev = null, flowPrevT = 0, flowRgba = null;   // forrige lille gråtonebilde til bildesammenligningen (k0.7.5)
const NIGHT_LUM = 60;   // under dette (snittlysstyrke 0–255) brukes nattmodus for veikameraet
const switchLog = [];   // byttetider (ms) denne økten

export const state = () => ({ loaded: !!landmarker, roadLoaded: !!detector, running: !!stream, facing, switching,
  ready: !!stream && !switching && performance.now() >= settleUntil,   // gir brukbare bilder nå
  roadSize,   // bildestørrelse fra veikameraet (stående bilde = telefonen står på høykant)
  roadBottom,   // dashbordkanten (andel av høyden) eller null
  fps: startedAt ? frames / ((performance.now() - startedAt) / 1000) : 0, fpsNow, lastPose, lastRoad, video, switches: switchLog.slice(),
  perf: { ...perf, faceMs: Math.round(perf.faceMs), roadMs: Math.round(perf.roadMs), laneMs: Math.round(perf.laneMs * 10) / 10, flowMs: Math.round(perf.flowMs * 10) / 10 } });

/* Tegner feltlinjene oppå veikamerabildet (direktevisning i kameratesten). null slår av. */
export function setLaneOverlay(canvas) { laneOverlay = canvas; }

async function vision() {
  const mod = await import(BASE + 'vision_bundle.mjs');
  if (!fileset) fileset = await mod.FilesetResolver.forVisionTasks(BASE + 'wasm');
  return mod;
}

export function loadModel(onStatus = () => {}) {
  if (landmarker) return Promise.resolve(landmarker);
  if (loading) return loading;
  loading = (async () => {
    onStatus('Laster ansiktsgjenkjenning … (rundt 13 MB første gang)');
    const { FaceLandmarker } = await vision();
    const opts = delegate => ({
      baseOptions: { modelAssetPath: BASE + 'face_landmarker.task', delegate },
      runningMode: 'VIDEO', numFaces: 1,
      outputFacialTransformationMatrixes: true, outputFaceBlendshapes: false
    });
    try { landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch { onStatus('Bytter til enklere modus …'); landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
    onStatus('Ansiktsgjenkjenning klar');
    return landmarker;
  })().catch(err => { loading = null; throw err; });
  return loading;
}

/* Gjenkjenning av biler og folk for veikameraet (rundt 8 MB første gang). EfficientDet-Lite2 (k0.6.13): på
   nattbilder fant den 2–7 biler der Lite0 fant 0–1, og 10 mot 4–7 på mørklagt motorvei. Rundt 3 ganger tregere,
   så den kjører høyst rundt to ganger i sekundet (se tick), mens feltlinjene kjører på hvert bilde. */
export function loadRoadModel(onStatus = () => {}) {
  if (detector) return Promise.resolve(detector);
  if (loadingRoad) return loadingRoad;
  loadingRoad = (async () => {
    onStatus('Laster gjenkjenning av biler … (rundt 8 MB første gang)');
    const { ObjectDetector } = await vision();
    const opts = delegate => ({
      baseOptions: { modelAssetPath: BASE + 'efficientdet_lite2.tflite', delegate },
      runningMode: 'VIDEO', scoreThreshold: 0.15, maxResults: 12,   // road.js teller bare fra 0,35
      categoryAllowlist: ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'person']
    });
    // CPU (k0.6.10): med GPU fant gjenkjenningen ikke én eneste bil på iPhone på noen tur (heller ikke svake treff),
    // selv om testbildene fra turen til Storlien viser biler tydelig. På CPU, med et kopiert bilde, virket den i testene.
    detector = await ObjectDetector.createFromOptions(fileset, opts('CPU'));
    perf.detector = 'cpu-lite2';
    // D-FINE nano i tillegg (k0.7.0), bare med WebGPU: på prosessoren er den for treg på telefonen (0,5–1 s per bilde).
    // Lastes i bakgrunnen; feiler den, brukes Lite2 alene.
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      onStatus('Laster D-FINE … (rundt 42 MB første gang)');
      // Først i egen tråd (k0.7.4), ellers i hovedtråden som før
      try {
        dfine = await loadDfineWorker({ ortBase: ORT_BASE, model: DFINE_MODEL });
        perf.dfine = 'webgpu (egen tråd)'; perf.detector = 'dfine-webgpu+lite2';
      } catch (we) {
        perf.dfineWorker = String(we && we.message || we).slice(0, 80);
        try {
          const d = await loadDfine({ ortBase: ORT_BASE, model: DFINE_MODEL, preferGpu: true });
          if (d.backend === 'webgpu') { dfine = d; perf.dfine = 'webgpu'; perf.detector = 'dfine-webgpu+lite2'; }
          else perf.dfine = 'bare prosessor (ikke brukt)';
        } catch (e) { perf.dfine = 'feilet: ' + String(e && e.message || e).slice(0, 80); }
      }
    } else perf.dfine = 'ingen WebGPU';
    onStatus(dfine ? 'Gjenkjenning av biler klar (D-FINE + Lite2)' : 'Gjenkjenning av biler klar (Lite2)');
    return detector;
  })().catch(err => { loadingRoad = null; throw err; });
  return loadingRoad;
}

// Veikameraet i 1280×720 (k0.7.0): biler langt unna blir tydeligere, og D-FINE får veien i full oppløsning
const constraints = mode => ({ video: { facingMode: mode, width: { ideal: mode === 'environment' ? 1280 : 640 }, height: { ideal: mode === 'environment' ? 720 : 480 }, frameRate: { ideal: 15, max: 30 } }, audio: false });

async function show(el) {
  video = el;
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  video.classList.toggle('road', facing === 'environment');
  // play() kan bli hengende hvis kameraet ikke leverer bilder; da går vi videre etter 2 s
  await Promise.race([video.play().catch(() => {}), new Promise(r => setTimeout(r, 2000))]);
}

/* Venter til et nytt bilde faktisk er vist (eller til tidsfristen går ut). */
export function nextFrame(el, timeout = 3000) {
  return new Promise(resolve => {
    const done = ok => { clearTimeout(to); resolve(ok); };
    const to = setTimeout(() => done(false), timeout);
    if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(() => done(true));
    else el.addEventListener('timeupdate', () => done(true), { once: true });
  });
}

/* Starter kameraet. Må kalles fra et trykk første gang (iPhone). mode: 'user' (fører) eller 'environment' (vei). */
export async function startCamera(videoEl, mode = 'user') {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Denne nettleseren gir ikke tilgang til kameraet.');
  if (stream && video === videoEl && facing === mode) return;
  if (stream && facing !== mode) { await switchTo(mode); if (video !== videoEl) await show(videoEl); return; }
  if (!stream) { facing = mode; stream = await navigator.mediaDevices.getUserMedia(constraints(mode)); }
  await show(videoEl);
}

/* Bytter mellom førerkamera og veikamera. Returnerer millisekunder til første nye bilde er vist. */
export async function switchTo(mode) {
  if (!stream || facing === mode || switching) return 0;
  switching = true;
  const t0 = performance.now();
  try {
    for (const tr of stream.getTracks()) tr.stop();
    stream = await navigator.mediaDevices.getUserMedia(constraints(mode));
    facing = mode;
    if (video) await show(video);
    if (video) await nextFrame(video);
    // Førerkameraet: fast 120 ms (ansiktsgjenkjenningen tåler lys som ikke er helt innstilt).
    // Veikameraet: til lysstyrken er stabil, høyst 1,5 s (se tick)
    settleUntil = performance.now() + (mode === 'environment' ? 1500 : 120);
    settleLum = null; settleStable = 0; firstAfterSwitch = true; lastLite = null; lastDfine = null; tracker.reset(); flowPrev = null;
    const ms = Math.round(performance.now() - t0);
    switchLog.push(ms);
    if (switchLog.length > 200) switchLog.shift();
    return ms;
  } finally { switching = false; }
}

/* Flytter kamerabildet til et annet <video>-element (f.eks. fra testskjermen til opptaket). */
export async function attachVideo(videoEl) {
  if (!stream) return false;
  await show(videoEl);
  return true;
}

export function onPose(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onRoad(fn) { roadListeners.add(fn); return () => roadListeners.delete(fn); }

/* Plan for bytting: fn() gir ønsket kamera ('user' eller 'environment') ved hvert bilde. null = ingen bytting. */
export function setSchedule(fn) { schedule = fn; }

/* Kjører gjenkjenningen ca. 8 ganger i sekundet. Hvilken modell som brukes, avhenger av kameraet. */
export function startLoop(fps = 8) {
  if (timer) return;
  fpsWanted = fps; fpsNow = fps;
  frames = 0; startedAt = performance.now();
  const ema = (k, v) => { if (firstAfterSwitch) return; perf[k] = perf[k] ? perf[k] * 0.9 + v * 0.1 : v; };
  /* Blir telefonen treg (varm, eller for mye å gjøre), går vi ned til 5 bilder i sekundet.
     Tilbake til full fart når analysene igjen er raske i 20 s. */
  const adapt = () => {
    // Veikameraet: bilgjenkjenningen kjører sjelden (egen takt), så her teller feltlinjene
    const ms = facing === 'user' ? perf.faceMs : perf.laneMs;
    const now = performance.now();
    if (ms > 110 && fpsNow > 5) { fpsNow = 5; perf.slow = true; perf.slowSince = now; perf.drops++; }
    else if (ms < 60 && fpsNow < fpsWanted && now - perf.slowSince > 20000) { fpsNow = fpsWanted; perf.slow = false; }
  };
  const tick = () => {
    timer = setTimeout(tick, 1000 / fpsNow);
    // Planen spørres også mens kameraet bytter, så den vet at veiblikket ikke har begynt ennå (k0.6.3:
    // før ble byttetiden regnet med i veiblikket, og veikameraet fikk bare 0,4 s med bilder per blikk)
    if (schedule) {
      const want = schedule();
      if (!switching && want && want !== facing) { switchTo(want).catch(() => {}); return; }
    }
    if (switching || !video || video.readyState < 2 || video.videoWidth === 0) return;
    if (performance.now() < settleUntil) {
      if (facing !== 'environment') return;
      // Lyset er innstilt når to bilder på rad har nesten samme lysstyrke
      const l = luminance(video);
      settleStable = settleLum !== null && Math.abs(l - settleLum) <= Math.max(2, settleLum * 0.04) ? settleStable + 1 : 0;
      settleLum = l;
      if (settleStable < 2) return;
      settleUntil = performance.now();
    }
    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    if (facing === 'user') {
      if (!landmarker) return;
      let pose = null;
      const t1 = performance.now();
      try {
        const res = landmarker.detectForVideo(video, ts);
        const m = res && res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
        pose = m ? poseFromMatrix(m.data) : null;
      } catch { pose = null; }
      ema('faceMs', performance.now() - t1); adapt(); firstAfterSwitch = false;
      frames++;
      lastPose = pose;
      for (const fn of listeners) fn(pose, ts);
    } else {
      if (!detector) return;
      let road = null;
      // Nattmodus (k0.6.4): bilgjenkjenningen får et lysere bilde, og baklysene letes etter i tillegg
      const dark = lastLum !== null && lastLum < NIGHT_LUM;
      roadSize = `${video.videoWidth}x${video.videoHeight}`;
      // To modeller, slått sammen (k0.7.0). I test fant D-FINE nano mange flere biler langt unna (dagslys og
      // skumring), mens Lite2 var bedre på store biler tett foran om natten.
      // - D-FINE på grafikkprosessoren, asynkront, høyst hvert 250 ms (blokkerer ikke resten)
      // - Lite2 på prosessoren hvert 2,5 × sin egen tid. Med D-FINE (k0.7.3) bare når bilen står stille: Lite2 brukte
      //   733 ms per bilde på iPhone og holdt appen opptatt, så bevegelsesmålingene fikk hull i 43 % av turen
      //   (2. nov. kl. 20.32). I stillstand (kø, rødt lys) er bilen tett foran vanligst, og hull gjør ingenting.
      // Begge modellenes svar går inn i følgingen (k0.7.4) med tiden bildet ble tatt, og bilene brukes slik de trolig
      // står nå: forsinkelsen i D-FINE (rundt 0,3 s) tas igjen, og en bil må være sett minst to ganger.
      // Koordinater i kamerabildets piksler.
      const now0 = performance.now(), vw = video.videoWidth, vh = video.videoHeight;
      if (dfine && !dfineBusy && (!lastDfine || now0 - lastDfine.at >= 250)) {
        dfineBusy = true;
        const t0 = performance.now();
        dfine.detect(video, vw, vh, dark ? GAMMA : null, roadBottom)
          .then(d => { const keep = d.filter(x => x.score >= 0.4); tracker.update(d.filter(x => x.score >= 0.25), t0, { minNew: 0.4 }); lastDfine = { at: performance.now(), dets: keep }; perf.dfineFrames++; if (keep.length) perf.dfineAny++; perf.dfineMs = perf.dfineMs ? perf.dfineMs * 0.9 + (performance.now() - t0) * 0.1 : performance.now() - t0; })
          .catch(() => { perf.dfineErr++; })
          .finally(() => { dfineBusy = false; });
      }
      // Bildesammenligning (k0.7.5): hvor bilene har flyttet seg siden forrige bilde, før boksene brukes
      flowRgba = null;
      try { const tf = performance.now(); flowStep(now0); ema('flowMs', performance.now() - tf); } catch { flowPrev = null; }
      const t1 = performance.now();
      try {
        const liteOk = !dfine || speedKmh < 5;
        if (liteOk && (!lastLite || now0 - lastLite.at >= Math.max(dfine ? 600 : 250, 2.5 * (perf.roadMs || 100)))) {
          // Alltid en kopi i canvas (lysnet i mørket): gjenkjenningen fikk ingenting ut av video-elementet direkte på iPhone
          const src = brightFrame(video, dark), k = vw / src.width;
          const res = detector.detectForVideo(src, ts);
          perf.detFrames++; if (res && res.detections && res.detections.length) perf.detAny++;
          lastLite = { at: now0, dets: (res && res.detections || []).map(d => ({ cls: d.categories[0].categoryName, score: d.categories[0].score,
            x: d.boundingBox.originX * k, y: d.boundingBox.originY * k, w: d.boundingBox.width * k, h: d.boundingBox.height * k })) };
          tracker.update(lastLite.dets.filter(d => d.score >= 0.35), now0);
          ema('roadMs', performance.now() - t1);
        }
        const merged = tracker.predict(now0);
        // Feltlinjene fra forrige bilde (regnet på et lite bilde), skalert til kamerabildet
        const pl = lastView && lastView.lane && lastView.lane.left && lastView.lane.right ? lastView.lane : null, kk = pl ? vw / pl.W : 1;
        const sc = L => ({ xBottom: L.xBottom * kk, xTop: L.xTop * kk, yBottom: L.yBottom * kk, yTop: L.yTop * kk });
        road = processDetections(merged, vw, vh, { roadBottom, lane: pl ? { left: sc(pl.left), right: sc(pl.right) } : null });
        lastView = { at: now0, w: vw, h: vh, lead: road.lead, roadBottom, dfine: dfine ? dfine.backend + (dfine.worker ? ' (egen tråd)' : '') : null, lane: lastView && lastView.lane };
      } catch { road = null; }
      // Feltlinjer på et lite gråtonebilde (160 piksler bredt, noen millisekunder)
      if (road) {
        const t2 = performance.now();
        try {
          const W = 160, H = Math.round(160 * video.videoHeight / video.videoWidth);
          if (!laneCanvas || laneCanvas.height !== H) { laneCanvas = document.createElement('canvas'); laneCanvas.width = W; laneCanvas.height = H; laneCtx = laneCanvas.getContext('2d', { willReadFrequently: true }); }
          laneCtx.drawImage(video, 0, 0, W, H);
          const gray = toGray(laneCtx.getImageData(0, 0, W, H).data, W, H);
          // Lysstyrke 0–255 (snitt): forteller om veikameraet ser noe i det hele tatt (mørke, refleks i ruta)
          let sum = 0; for (let i = 0; i < gray.length; i++) sum += gray[i];
          road.lum = Math.round(sum / gray.length);
          lastLum = road.lum;
          // Dashbordkanten: radsnitt glattet over tid, ny vurdering hvert 15. bilde
          const rm = rowMeans(gray, W, H);
          if (!rowEma || rowEma.length !== H) { rowEma = Float32Array.from(rm); rowN = 0; }
          else for (let y = 0; y < H; y++) rowEma[y] += (rm[y] - rowEma[y]) * 0.05;
          if (++rowN >= 20 && rowN % 15 === 0) { const dl = dashLine(rowEma); roadBottom = dl && dl < 0.97 ? Math.round(dl * 100) / 100 : null; }
          // Feltlinjer: på veien rett over dashbordet når kanten er kjent (før: nederste del av bildet, som var dashbordet)
          // Testet på 67 store kveldsbilder (2. nov.): minst én linje i 60 (før 7), begge i 42 (før 1); dagsturen 31. okt.
          // 37 og 18 av 50 (før 26 og 2). Asfalten rett foran er sterkt opplyst om kvelden, så lys bakgrunn tillates.
          const ln = detectLanes(gray, W, H, roadBottom ? { top: Math.max(0.25, roadBottom - 0.2), bottom: roadBottom - 0.02, horizon: Math.max(0.15, roadBottom - 0.25), minInl: 0.15, maxBg: 230 } : {});
          road.lane = { l: !!ln.left, r: !!ln.right, offset: ln.offset };
          if (lastView) Object.assign(lastView, { lane: { left: ln.left, right: ln.right, offset: ln.offset, W, H }, lum: road.lum, roadBottom });
          if (laneOverlay) drawLanes(laneOverlay, ln, W, H);
        } catch { /* ingen feltlinjer */ }
        ema('laneMs', performance.now() - t2);
        if (dark || road.lum < NIGHT_LUM) {
          try {
            const W = 320, H = Math.round(320 * video.videoHeight / video.videoWidth);
            // Samme lille bilde som bildesammenligningen (tegnes én gang)
            let rgba = flowRgba && flowRgba.length === W * H * 4 ? flowRgba : null;
            if (!rgba) {
              if (!tailCanvas || tailCanvas.height !== H) { tailCanvas = document.createElement('canvas'); tailCanvas.width = W; tailCanvas.height = H; tailCtx = tailCanvas.getContext('2d', { willReadFrequently: true }); }
              tailCtx.drawImage(video, 0, 0, W, H); rgba = tailCtx.getImageData(0, 0, W, H).data;
            }
            const tl = detectTaillights(rgba, W, H, { roadBottom });
            road.night = true;
            road.tail = tl.pairs;
            if (!road.lead && tl.lead) road.lead = tl.lead;
            if (lastView) Object.assign(lastView, { night: true, tail: tl.pairs, lead: road.lead });
          } catch { /* ingen baklys */ }
        }
      }
      adapt(); firstAfterSwitch = false;
      frames++;
      lastRoad = road;
      if (road) for (const fn of roadListeners) fn(road, ts);
    }
  };
  tick();
}

/* Bildesammenligning (k0.7.5): et lite bilde (320 piksler bredt) i hvert steg. For hver bil som følges (sett minst to
   ganger, de største først), letes midten av boksen fra forrige bilde opp i dette, og følgingen får flyttingen.
   Rundt 1–3 ms på iPhone. Uten biler å følge tegnes bildet likevel (baklysene i mørket bruker det). */
function flowStep(t) {
  const W = 320, H = Math.round(320 * video.videoHeight / video.videoWidth), k = W / video.videoWidth;
  if (!tailCanvas || tailCanvas.height !== H) { tailCanvas = document.createElement('canvas'); tailCanvas.width = W; tailCanvas.height = H; tailCtx = tailCanvas.getContext('2d', { willReadFrequently: true }); }
  const preds = tracker.predict(flowPrevT).filter(p => p.w * k >= 7).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 6);
  const dark = lastLum !== null && lastLum < NIGHT_LUM;
  if (!preds.length && !dark) { flowPrev = null; return; }
  tailCtx.drawImage(video, 0, 0, W, H);
  flowRgba = tailCtx.getImageData(0, 0, W, H).data;
  const gray = toGray(flowRgba, W, H);
  if (flowPrev && flowPrev.length === gray.length && t - flowPrevT < 400) {
    const radius = Math.min(14, Math.round(5 + (t - flowPrevT) / 30));
    for (const p of preds) {
      const b = tracker.boxOf(p.id, flowPrevT);
      if (!b) continue;
      perf.flowTries++;
      const m = matchShift(flowPrev, gray, W, H, { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k }, { radius });
      if (m && tracker.shift(p.id, flowPrevT, m.dx / k, m.dy / k, t)) perf.flowHits++;
    }
  }
  flowPrev = gray; flowPrevT = t;
}

export function stopLoop() { if (timer) clearTimeout(timer); timer = null; }

/* Testbilde (valgfritt, for feilsøking): lite JPEG i farger av det veikameraet ser nå (160 piksler på den
   lengste siden), eller null. Farger fra k0.6.11, så baklys og lyskryss kan sjekkes på kveldsturer. */
export function snapshot(size = 160) {
  if (!video || facing !== 'environment' || video.videoWidth === 0) return null;
  const k = size / Math.max(video.videoWidth, video.videoHeight);
  const c = document.createElement('canvas'); c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', size > 200 ? 0.75 : 0.6);
}

/* Det modellene så i siste bilde, til fullskjermvisningen: { facing, w, h, dets, lead, lane, roadBottom, lum, night, dfine }.
   Med førerkameraet foran: bare { facing: 'user' }. */
export function view() {
  if (facing !== 'environment') return { facing };
  if (!lastView || performance.now() - lastView.at > 3000) return { facing };
  // Boksene slik bilene trolig står akkurat nå (følgingen), og bilen foran regnet fra dem
  const t = performance.now(), v = lastView, preds = tracker.predict(t);
  const kk = v.lane && v.lane.W ? v.w / v.lane.W : 1;
  const sc = L => ({ xBottom: L.xBottom * kk, xTop: L.xTop * kk, yBottom: L.yBottom * kk, yTop: L.yTop * kk });
  const lane = v.lane && v.lane.left && v.lane.right ? { left: sc(v.lane.left), right: sc(v.lane.right) } : null;
  const lead = processDetections(preds, v.w, v.h, { roadBottom: v.roadBottom, lane }).lead || (v.lead && v.lead.src === 'baklys' ? v.lead : null);
  return { facing, ...v, dets: roadDets(preds, v.w, v.h, v.roadBottom), lead };
}

/* Svar fra to modeller: samme objekt (overlapp over 50 %) telles én gang, med høyeste score. */
export function mergeDets(dets) {
  const out = [];
  const iou = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); const i = x * y; return i / (a.w * a.h + b.w * b.h - i || 1); };
  for (const d of dets.slice().sort((a, b) => b.score - a.score)) if (!out.some(o => iou(o, d) > 0.5)) out.push(d);
  return out;
}

/* Kopi av kamerabildet til bilgjenkjenningen, lysnet i mørket med en gammakurve (0,5: mørke toner løftes mest). */
const GAMMA = new Uint8ClampedArray(256).map((_, v) => Math.round(255 * Math.pow(v / 255, 0.5)));
function brightFrame(v, bright = true) {
  const W = Math.min(640, v.videoWidth), H = Math.round(W * v.videoHeight / v.videoWidth);
  if (!brightCanvas || brightCanvas.width !== W || brightCanvas.height !== H) {
    brightCanvas = document.createElement('canvas'); brightCanvas.width = W; brightCanvas.height = H;
    brightCtx = brightCanvas.getContext('2d', { willReadFrequently: true });
  }
  brightCtx.drawImage(v, 0, 0, W, H);
  if (!bright) return brightCanvas;
  // Gammakurve (k0.6.13): løfter mørke toner uten å brenne ut frontlys. I test bedre enn canvas-filteret
  // «brightness(2.2)» med Lite2 (skumring: 6 biler mot 1)
  const img = brightCtx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = GAMMA[d[i]]; d[i + 1] = GAMMA[d[i + 1]]; d[i + 2] = GAMMA[d[i + 2]]; }
  brightCtx.putImageData(img, 0, 0);
  return brightCanvas;
}

function drawLanes(cv, ln, W, H) {
  const g = cv.getContext('2d');
  cv.width = cv.clientWidth || 320; cv.height = cv.clientHeight || Math.round(320 * H / W);
  const kx = cv.width / W, ky = cv.height / H;
  g.clearRect(0, 0, cv.width, cv.height);
  g.lineWidth = 5; g.lineCap = 'round';
  for (const [L, col] of [[ln.left, '#3ddc84'], [ln.right, '#ff4fd8']]) if (L) { g.strokeStyle = col; g.beginPath(); g.moveTo(L.xBottom * kx, L.yBottom * ky); g.lineTo(L.xTop * kx, L.yTop * ky); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, cv.width, 30);
  g.fillStyle = '#fff'; g.font = 'bold 15px system-ui, sans-serif';
  g.fillText(ln.offset !== null ? `Midt i feltet ${ln.offset > 0 ? '+' : ''}${ln.offset.toFixed(2).replace('.', ',')} m` : ln.left || ln.right ? 'Én linje funnet' : 'Ingen feltlinjer', 8, 21);
}

export function stopCamera() {
  stopLoop();
  schedule = null;
  if (stream) for (const tr of stream.getTracks()) tr.stop();
  stream = null;
  facing = 'user';
  if (video) { video.srcObject = null; video.classList.remove('road'); }
  video = null;
}

/* ---------- Kameratest: to kameraer samtidig, og hvor raskt det går å bytte ---------- */
const luminance = el => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 24;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(el, 0, 0, 32, 24);
  const d = g.getImageData(0, 0, 32, 24).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  return s / (d.length / 4);
};

/* Tester om begge kameraene kan være på samtidig. v1/v2: to <video>-elementer. */
export async function testSimultaneous(v1, v2) {
  stopCamera();
  const a = await navigator.mediaDevices.getUserMedia(constraints('user'));
  v1.srcObject = a; v1.muted = true; v1.setAttribute('playsinline', ''); await v1.play().catch(() => {});
  let b = null, err = null;
  try { b = await navigator.mediaDevices.getUserMedia(constraints('environment')); } catch (e) { err = e; }
  if (b) { v2.srcObject = b; v2.muted = true; v2.setAttribute('playsinline', ''); await v2.play().catch(() => {}); }
  await new Promise(r => setTimeout(r, 1500));
  const aLive = a.getVideoTracks()[0].readyState === 'live' && !a.getVideoTracks()[0].muted;
  const aFrames = await nextFrame(v1, 1500);
  const bLive = !!b && b.getVideoTracks()[0].readyState === 'live' && !b.getVideoTracks()[0].muted;
  const bFrames = b ? await nextFrame(v2, 1500) : false;
  for (const s of [a, b]) if (s) for (const tr of s.getTracks()) tr.stop();
  v1.srcObject = null; v2.srcObject = null;
  return { both: aLive && aFrames && bLive && bFrames, front: aLive && aFrames, back: bLive && bFrames, error: err ? String(err.name || err) : null };
}

/* Bytter n ganger og måler: tid til første bilde, og tid til lyset har roet seg (eksponering). */
export async function testSwitching(el, n = 10, onProgress = () => {}) {
  stopCamera();
  let s = await navigator.mediaDevices.getUserMedia(constraints('user'));
  el.srcObject = s; el.muted = true; el.setAttribute('playsinline', ''); await el.play().catch(() => {});
  await nextFrame(el);
  const runs = [];
  let mode = 'user';
  for (let i = 0; i < n; i++) {
    mode = mode === 'user' ? 'environment' : 'user';
    const t0 = performance.now();
    for (const tr of s.getTracks()) tr.stop();
    s = await navigator.mediaDevices.getUserMedia(constraints(mode));
    el.srcObject = s; await el.play().catch(() => {});
    await nextFrame(el);
    const first = performance.now() - t0;
    // Eksponering: vent til lysstyrken er stabil (3 bilder på rad innenfor 4 %), maks 2 s
    let prev = luminance(el), stable = 0;
    while (performance.now() - t0 < first + 2000 && stable < 3) {
      await nextFrame(el, 500);
      const l = luminance(el);
      stable = Math.abs(l - prev) <= Math.max(2, prev * 0.04) ? stable + 1 : 0;
      prev = l;
    }
    runs.push({ to: mode, first: Math.round(first), settled: Math.round(performance.now() - t0) });
    onProgress(i + 1, n);
  }
  for (const tr of s.getTracks()) tr.stop();
  el.srcObject = null;
  const avg = k => Math.round(runs.reduce((a, r) => a + r[k], 0) / runs.length);
  const max = k => Math.max(...runs.map(r => r[k]));
  return { runs, firstAvg: avg('first'), firstMax: max('first'), settledAvg: avg('settled'), settledMax: max('settled') };
}
