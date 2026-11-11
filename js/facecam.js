/* Kameraene på telefonen. Førerkameraet (frontkameraet) med ansiktsgjenkjenning (MediaPipe Face Landmarker: hodet og
   øynene). I iPhone-appen også veikameraet (bakkameraet) samtidig: bilene finner appen selv med D-FINE (nativecam.js),
   og her følges de mellom svarene, og feltlinjer, dashbordkant, baklys i mørket og fartsskilt leses fra bildet.
   I Safari bare førerkameraet, som før. Ingen bilder lagres eller sendes – bare vinkler og tall om veien går videre. */
import { poseFromMatrix, eyesFromBlendshapes } from './camera.js';
import { processDetections, detectTaillights, roadDets, focalPx, onRoad as onRoadArea, VEHICLE_WIDTH } from './road.js';
import { detectLanes, toGray, rowMeans, dashLine, scaleLane, LANE_WIDTH, createLaneTracker, laneGamma, roadEdgeLines } from './lanes.js';
import { createTracker } from './track.js';
import { matchShift } from './flow.js';
import { readSigns, signTracker, signAhead } from './signs.js';
import * as native from './nativecam.js';
import { createDriverPicker, createFaceMask } from './calibcheck.js';
import { createFaceLight, meanLum } from './facelight.js';

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
const NIGHT_LUM = 60;   // under dette (snittlysstyrke 0–255) er det mørkt: bilgjenkjenningen får et lysere bilde, og baklys letes etter
let landmarker = null, loading = null, stream = null, video = null, timer = null, roadTimer = null;
const listeners = new Set(), roadListeners = new Set();
let lastPose = null, lastTs = 0, frames = 0, startedAt = 0, fpsWanted = 8, fpsNow = 8;
let driver = null, road = null, roadModel = null, detsUnsub = null, lanesUnsub = null, mlLanes = null, driverSeq = -1, roadSeq = -1;   // kildene i iPhone-appen
let wantFacings = [], lastKick = 0;   // vakten: kameraene startes på nytt hvis bildene stopper (0.10.1)
let perfSince = 0;   // når tallene sist ble nullstilt (kameraene startet)
// Veiens form (0.10.3): forventet sving og feltbredde fra app.js (GPS-sporet og Statens vegvesen), og kamerahøyden
// slik feltlinjene viser den (lært underveis: feltbredde / avstanden mellom linjene i modellen)
let shape = { kappa: null, kappaWeight: 1, laneWidth: null, lanes: null, src: null }, camHEst = 1.2;
export function setRoadShape(s) { shape = { ...shape, ...s }; }
let lastFace = null, lastView = null, lastRoad = null;
let rowEma = null, rowN = 0, roadBottom = null, lastLum = null, speedKmh = NaN;
let laneCanvas = null, laneCtx = null, tailCanvas = null, tailCtx = null, signCanvas = null, signCtx = null;
let flowPrev = null, flowPrevT = 0, flowRgba = null, signN = 0, lastSign = null, signReads = [];
const tracker = createTracker();   // biler og folk mellom svarene fra bilgjenkjenningen
const signs = signTracker();
const freshPerf = () => ({ faceMs: 0, faceFrames: 0, faceNone: 0, faceOther: 0, faceMasked: 0, faceDim: 0, faceDimOk: 0, faceLum: 0, roadMs: 0, laneMs: 0, flowMs: 0, signMs: 0, dfine: null, dfineMs: 0, dfineFrames: 0, dfineAny: 0, laneMl: null, laneMlMs: 0, laneMlFrames: 0, laneMlDim: 0, laneMlHot: 0, laneRunMs: 0, roadKnown: 0, offRoad: 0,
  flowHits: 0, flowTries: 0, signReads: 0, signs: 0, signMissed: 0, signMissLog: [], slow: false, slowSince: 0, drops: 0, stalls: 0, stallLog: [] });
const perf = { stalls: 0, faceMs: 0, faceFrames: 0, faceNone: 0, faceOther: 0, faceMasked: 0, faceDim: 0, faceDimOk: 0, faceLum: 0, roadMs: 0, laneMs: 0, flowMs: 0, signMs: 0, dfine: null, dfineMs: 0, dfineFrames: 0, dfineAny: 0, laneMl: null, laneMlMs: 0, laneMlFrames: 0, laneMlDim: 0, laneMlHot: 0, laneRunMs: 0, roadKnown: 0, offRoad: 0,
  flowHits: 0, flowTries: 0, signReads: 0, signs: 0, signMissed: 0, signMissLog: [], slow: false, slowSince: 0, drops: 0, stallLog: [] };

export const state = () => ({ loaded: !!landmarker, running: !!stream || !!driver, native: !!driver,
  stalled: !!driver && driver.stalledMs > 3000,   // ingen nye bilder fra kameraene på 3 s
  road: !!road, roadModel, roadSize: road && road.ready ? `${road.width}x${road.height}` : null, roadBottom,
  fps: startedAt ? frames / ((performance.now() - startedAt) / 1000) : 0, lastPose, lastRoad, video,
  perf: { ...perf, faceMs: Math.round(perf.faceMs), faceLum: Math.round(perf.faceLum), roadMs: Math.round(perf.roadMs), laneMs: Math.round(perf.laneMs * 10) / 10,
    flowMs: Math.round(perf.flowMs * 10) / 10, signMs: Math.round(perf.signMs * 10) / 10, dfineMs: Math.round(perf.dfineMs), laneMlMs: Math.round(perf.laneMlMs), laneRunMs: Math.round(perf.laneRunMs) } });

/* Førerplassen (0.12.6): lært av kameraet, på nytt hver gang kameraet startes. Fra 0.13.2 med plassen fra
   kalibreringen som utgangspunkt (setDriverHome), og ledsagerens side av bildet skjult når modellen finner ledsageren. */
let driverHome = null;
let driverPick = createDriverPicker();
let faceMask = createFaceMask(), maskCanvas = null, maskCtx = null;
// Førerbildet i mørket (0.13.10): lysnes etter hvor lyst det er der førerens ansikt pleier å være
const faceLight = createFaceLight();
let lightCanvas = null, lightCtx = null, lightN = 0, faceBox = null, faceBias = 0;
let laneTrack = createLaneTracker();   // feltlinjene over tid (0.12.6)
let laneRaw = null, laneRawW = 0, laneAnsAt = null;   // siste utregnede linjer og svaret de kom fra (0.13.9)

/* Ansiktets plass fra kalibreringen ({ x, y, z } fra facePosition), eller null: under kalibreringen og uten kalibrering */
export function setDriverHome(pos) { driverHome = pos || null; driverPick.setHome(driverHome); }

/* Kan telefonen ha begge kameraene på samtidig (iPhone-appen på iPhone XS og nyere, med bilgjenkjenningen)? */
export async function roadSupported() {
  const i = await native.camInfo();
  return !!(i && i.multi && i.model);
}

export function setSpeed(kmh) { speedKmh = kmh; }   // fartsskilt leses bare når bilen kjører

export function loadModel(onStatus = () => {}) {
  if (landmarker) return Promise.resolve(landmarker);
  if (loading) return loading;
  loading = (async () => {
    onStatus('Laster ansiktsgjenkjenning … (rundt 13 MB første gang)');
    const { FilesetResolver, FaceLandmarker } = await import(BASE + 'vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(BASE + 'wasm');
    const opts = delegate => ({
      baseOptions: { modelAssetPath: BASE + 'face_landmarker.task', delegate },
      // Ett ansikt (0.13.1): med to leter modellen etter et nytt ansikt i hvert bilde i stedet for å følge det den har.
      // Det tok 33 ms mot 9 ms, og i mørket mistet den føreren mye oftere (6. nov. ved likt lys: 28 % mot 88 %).
      // Førervelgeren under passer fortsatt på at ledsagerens ansikt ikke tas for førerens.
      runningMode: 'VIDEO', numFaces: 1,
      outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true   // øynene (k0.7.6)
    });
    try { landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch { onStatus('Bytter til enklere modus …'); landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
    onStatus('Ansiktsgjenkjenning klar');
    return landmarker;
  })().catch(err => { loading = null; throw err; });
  return loading;
}

function show(videoEl, s) {
  videoEl.setAttribute('playsinline', '');
  videoEl.muted = true;
  if (videoEl.srcObject !== s) videoEl.srcObject = s;
  // play() kan bli hengende hvis kameraet ikke leverer bilder; da går vi videre etter 2 s
  return Promise.race([videoEl.play().catch(() => {}), new Promise(r => setTimeout(r, 2000))]);
}

/* Starter førerkameraet (og veikameraet med road: true, bare i iPhone-appen). Må kalles fra et trykk første gang. */
export async function startCamera(videoEl, { road: withRoad = false, home } = {}) {
  if (home !== undefined) driverHome = home || null;
  driverPick = createDriverPicker({ home: driverHome }); faceMask = createFaceMask(); laneTrack = createLaneTracker(); laneRaw = null; laneAnsAt = null;
  if (native.available()) {
    const want = withRoad ? ['user', 'environment'] : ['user'];
    if (driver && !!road === withRoad) { video = videoEl; await show(videoEl, driver.stream()); return; }
    stopSources();
    Object.assign(perf, freshPerf());   // tallene som lagres med turen gjelder denne økten
    perfSince = performance.now();
    wantFacings = want;
    const r = await native.start(want, { detect: withRoad });
    // 10 bilder i sekundet (0.13.10, var 15): ansiktsmodellen ser 8, resten ble pakket og sendt til ingen nytte (varme)
    driver = native.source('user', { fps: 10, max: 640 });
    faceLight.reset(); faceBox = null; faceBias = 0; lightN = 0;
    if (r.active.includes('environment')) {
      road = native.source('environment', { fps: 10 });
      roadModel = r.model || null;
      perf.dfine = roadModel;
      detsUnsub = native.onDets(onDets);
      // Feltmodellen (0.13.0): siste svar brukes av feltlinjene i roadTick
      mlLanes = null;
      lanesUnsub = native.onLanes(r => { mlLanes = r; perf.laneMlFrames++; if (r.hot) perf.laneMlHot++; if (Number.isFinite(r.run)) ema('laneRunMs', r.run); if (r.gamma < 0.99) perf.laneMlDim++; if (r.backend) perf.laneMl = r.backend; if (Number.isFinite(r.ms)) ema('laneMlMs', r.ms); });
    }
    video = videoEl;
    await show(videoEl, driver.stream());
    if (timer) { stopLoop(); startLoop(fpsWanted); }
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Denne nettleseren gir ikke tilgang til kameraet.');
  if (stream && video === videoEl) return;
  if (!stream) stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 } }, audio: false });
  video = videoEl;
  await show(videoEl, stream);
}

/* Flytter førerkamerabildet til et annet <video>-element (f.eks. fra testskjermen til opptaket). */
export async function attachVideo(videoEl) {
  const s = driver ? driver.stream() : stream;
  if (!s) return false;
  video = videoEl;
  await show(videoEl, s);
  return true;
}

/* Veikamerabildet i et <video>-element (forhåndsvisning). */
export async function attachRoadVideo(videoEl) {
  if (!road) return false;
  await show(videoEl, road.stream());
  return true;
}

export function onPose(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onRoad(fn) { roadListeners.add(fn); return () => roadListeners.delete(fn); }

const ema = (k, v) => { perf[k] = perf[k] ? perf[k] * 0.9 + v * 0.1 : v; };
/* Blir telefonen treg (varm, eller for mye å gjøre), går førerkameraet ned til 5 bilder i sekundet.
   Tilbake til full fart når analysene igjen er raske i 20 s. */
function adapt() {
  const ms = Math.max(perf.faceMs, perf.roadMs + perf.laneMs);
  const now = performance.now();
  // De første 20 s regnes ikke (0.13.8): modellene varmer opp og de første bildene er trege. Nesten hver tur ble
  // meldt som «treg (varm?)» én gang, 6–26 s etter at appen åpnet, og førerkameraet gikk på 5 bilder i sekundet
  if (now - Math.max(perfSince, startedAt) < 20000) return;
  if (ms > 110 && fpsNow > 5) { fpsNow = 5; perf.slow = true; perf.slowSince = now; perf.drops++; }
  else if (ms < 60 && fpsNow < fpsWanted && now - perf.slowSince > 20000) { fpsNow = fpsWanted; perf.slow = false; }
}

/* Kjører ansiktsgjenkjenningen ca. 8 ganger i sekundet, og veikameraets analyse like ofte når det er på. */
export function startLoop(fps = 8) {
  if (timer) return;
  fpsWanted = fps; fpsNow = fps;
  frames = 0; startedAt = performance.now();
  const tick = () => {
    timer = setTimeout(tick, 1000 / fpsNow);
    faceTick();
  };
  tick();
  if (road && !roadTimer) {
    const rt = () => { roadTimer = setTimeout(rt, 1000 / Math.min(10, fpsNow + 2)); try { roadTick(); } catch { /* neste bilde */ } };
    rt();
  }
}

/* Vakten: har det ikke kommet bilder på 4 s, bes appen starte kameraene (og serveren) igjen, høyst hvert 10. s */
function watchdog() {
  if (!driver || driver.stalledMs < 4000 || performance.now() - lastKick < 10000) return;
  lastKick = performance.now();
  perf.stalls++;
  // Når og hvorfor (0.13.8): klokkeslettet og appens grunn (for varm, en annen app tok kameraet) følger med eksporten.
  // Turen 11. nov. kl. 19.12 mistet 8 s fra begge kameraene uten at noe sa hvorfor
  const entry = { at: Date.now(), why: null };
  if (perf.stallLog.length < 8) perf.stallLog.push(entry);
  native.start(wantFacings, { detect: wantFacings.includes('environment') }).then(r => { entry.why = (r && r.why) || null; }).catch(() => {});
}

function faceTick() {
  watchdog();
  if (!landmarker) return;
  let src, w, h;
  if (driver) {
    if (!driver.ready || driver.seq === driverSeq) return;
    driverSeq = driver.seq; src = driver.canvas; w = driver.width; h = driver.height;
  } else {
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    src = video; w = video.videoWidth; h = video.videoHeight;
  }
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  let pose = null;
  const t1 = performance.now();
  try {
    // Ledsagerens side svart (0.13.2, se createFaceMask): samme bildestørrelse, så punktene og vinklene er som før
    const m = faceMask.mask;
    let input = src;
    if (m) {
      if (!maskCanvas || maskCanvas.width !== w || maskCanvas.height !== h) { maskCanvas = document.createElement('canvas'); maskCanvas.width = w; maskCanvas.height = h; maskCtx = maskCanvas.getContext('2d'); }
      maskCtx.drawImage(src, 0, 0, w, h);
      maskCtx.fillStyle = '#000';
      maskCtx.fillRect(Math.floor(m.from * w), 0, Math.ceil((m.to - m.from) * w), h);
      input = maskCanvas;
      perf.faceMasked++;
    }
    if (driver) { try { faceLightStep(src, w, h); } catch { /* uten lysning */ } }
    const res = landmarker.detectForVideo(input, ts);
    // Føreren blant ansiktene (0.12.6): ledsageren skal ikke tas for føreren
    const all = ((res && res.facialTransformationMatrixes) || []).map(mx => poseFromMatrix(mx.data));
    const k = driverPick.step(all, ts / 1000);
    pose = k >= 0 ? all[k] : null;
    // Hvorfor det ikke ble noe ansikt (0.13.1): ingen i bildet (mørkt, snudd bort) eller et annet ansikt enn førerens
    perf.faceFrames++; if (!all.length) perf.faceNone++; else if (k < 0) perf.faceOther++;
    // Hvor ofte bildet ble lysnet, og om ansiktet ble funnet da (0.13.10): viser i eksporten om lysningen virker
    if (driver && driver.gamma < 0.95) { perf.faceDim++; if (k >= 0) perf.faceDimOk++; }
    // Hvor føreren og ledsageren er i bildet, til skjermen over
    const lms = (res && res.faceLandmarks) || [];
    if (k >= 0 && lms[k]) { faceMask.driver(xSpan(lms[k]), ts / 1000); faceBox = lmBox(lms[k]); }
    for (const i of driverPick.rejectedSide) if (lms[i]) faceMask.passenger(xSpan(lms[i]), ts / 1000);
    faceMask.tick(ts / 1000);
    // Øynene (k0.7.6): hvor de ser i forhold til hodet
    const eyes = pose && res.faceBlendshapes && res.faceBlendshapes[k] ? eyesFromBlendshapes(res.faceBlendshapes[k].categories) : null;
    if (pose && eyes) Object.assign(pose, eyes);
    const lm = k >= 0 && res.faceLandmarks ? res.faceLandmarks[k] : null;
    lastFace = lm ? { at: performance.now(), lm, pose, w, h } : lastFace && performance.now() - lastFace.at < 500 ? lastFace : null;
  } catch { pose = null; }
  ema('faceMs', performance.now() - t1); adapt();
  frames++;
  lastPose = pose;
  for (const fn of listeners) fn(pose, ts);
}
/* Rammen rundt ansiktet (0–1), med litt luft: der lyset måles neste gang, også når ansiktet er mistet */
const lmBox = lm => {
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of lm) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const mx = (x1 - x0) * 0.15, my = (y1 - y0) * 0.15;
  return { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my };
};
/* Ett lite bilde i sekundet: lyset der føreren sitter (hele bildet før ansiktet er sett), og hvor mye bildet skal lysnes */
function faceLightStep(src, w, h) {
  if (lightN++ % 8) return;
  const W = 24, H = Math.max(8, Math.round(24 * h / w));
  if (!lightCanvas || lightCanvas.height !== H) { lightCanvas = document.createElement('canvas'); lightCanvas.width = W; lightCanvas.height = H; lightCtx = lightCanvas.getContext('2d', { willReadFrequently: true }); }
  lightCtx.drawImage(src, 0, 0, W, H);
  const o = faceLight.step(meanLum(lightCtx.getImageData(0, 0, W, H).data, W, H, faceBox));
  if (o.raw === null) return;
  driver.gamma = o.gamma;
  ema('faceLum', o.raw);
  if (o.bias !== faceBias) { faceBias = o.bias; if (!road) native.configure({ faceBias }); }
}
const xSpan = lm => { let min = 1, max = 0; for (const p of lm) { if (p.x < min) min = p.x; if (p.x > max) max = p.x; } return { min, max }; };

/* Svar fra bilgjenkjenningen i appen, med tiden bildet ble tatt: inn i følgingen (en bil må være sett to ganger,
   og forsinkelsen tas igjen). Biler som allerede følges, beholdes med svakere svar (fra 0,25; nye fra 0,4). */
function onDets(r) {
  if (!road) return;
  if (r.error) { perf.dfineErr = (perf.dfineErr || 0) + 1; perf.dfine = `${roadModel || 'D-FINE'} · ${r.error}`; return; }
  const k = road.width && r.w ? road.width / r.w : 1;
  const dets = r.dets.map(d => ({ ...d, x: d.x * k, y: d.y * k, w: d.w * k, h: d.h * k }));
  const keep = dets.filter(x => x.score >= 0.4);
  tracker.update(dets.filter(x => x.score >= 0.25), r.at, { minNew: 0.4 });
  perf.dfineFrames++; if (keep.length) perf.dfineAny++;
  if (Number.isFinite(r.ms)) ema('dfineMs', r.ms);
  if (r.backend) perf.dfine = r.backend;
}

/* Veikameraet: ett bilde om gangen, i kamerabildets piksler (stående, 720×1280). */
function roadTick() {
  if (!road || !road.ready || road.seq === roadSeq) return;
  roadSeq = road.seq;
  const el = road.canvas, vw = el.width, vh = el.height, now0 = road.t;
  const dark = lastLum !== null && lastLum < NIGHT_LUM;
  const area = roadArea(vw, vh);   // veien foran fra feltmodellen: biler og baklys må stå på den (0.13.2)
  native.configure({ roadBottom, dark, laneGamma: laneGamma(lastLum), faceBias });
  // Bildesammenligning (k0.7.5): hvor bilene har flyttet seg siden forrige bilde, før boksene brukes
  flowRgba = null;
  try { const tf = performance.now(); flowStep(el, now0); ema('flowMs', performance.now() - tf); } catch { flowPrev = null; }
  const t1 = performance.now();
  let r = null;
  try {
    const merged = tracker.predict(now0);
    // Til turrapporten (0.13.2): hvor ofte veien var kjent, og hvor ofte en bil ble tatt bort fordi den sto utenfor
    if (area) { perf.roadKnown++; if (merged.some(d => VEHICLE_WIDTH[d.cls] && d.score >= 0.35 && !onRoadArea(d, area, vw, vh))) perf.offRoad++; }
    // Feltlinjene fra forrige bilde (regnet på et lite bilde), skalert til kamerabildet
    // Bare oppmalte linjer: veikanten og midten (0.13.3) er for usikre til å skille bilen foran fra møtende biler
    const pl = lastView && lastView.lane && lastView.lane.left && lastView.lane.right && !lastView.lane.left.edge && !lastView.lane.right.edge ? lastView.lane : null, kk = pl ? vw / pl.W : 1;
    r = processDetections(merged, vw, vh, { roadBottom, lane: pl ? { left: scaleLane(pl.left, kk), right: scaleLane(pl.right, kk) } : null, road: area });
    lastView = { at: performance.now(), w: vw, h: vh, lead: r.lead, roadBottom, dfine: roadModel, lane: lastView && lastView.lane };
  } catch { r = null; }
  ema('roadMs', performance.now() - t1);
  if (!r) return;
  // Feltlinjer på et lite gråtonebilde (240 piksler bredt fra 0.10.3, så linjene langt fram og svingen synes)
  const t2 = performance.now();
  try {
    const W = 240, H = Math.round(240 * vh / vw);
    if (!laneCanvas || laneCanvas.height !== H) { laneCanvas = document.createElement('canvas'); laneCanvas.width = W; laneCanvas.height = H; laneCtx = laneCanvas.getContext('2d', { willReadFrequently: true }); }
    laneCtx.drawImage(el, 0, 0, W, H);
    const gray = toGray(laneCtx.getImageData(0, 0, W, H).data, W, H);
    // Lysstyrke 0–255 (snitt): forteller om veikameraet ser noe i det hele tatt (mørke, refleks i ruta)
    let sum = 0; for (let i = 0; i < gray.length; i++) sum += gray[i];
    r.lum = Math.round(sum / gray.length);
    lastLum = r.lum;
    // Dashbordkanten: radsnitt glattet over tid, ny vurdering hvert 15. bilde
    const rm = rowMeans(gray, W, H);
    if (!rowEma || rowEma.length !== H) { rowEma = Float32Array.from(rm); rowN = 0; }
    else for (let y = 0; y < H; y++) rowEma[y] += (rm[y] - rowEma[y]) * 0.05;
    if (++rowN >= 20 && rowN % 15 === 0) { const dl = dashLine(rowEma); roadBottom = dl && dl < 0.97 ? Math.round(dl * 100) / 100 : null; }
    // Feltlinjer på veien rett over dashbordet når kanten er kjent (testet på kveldsbildene 2. nov. og dagsturen 31. okt.)
    // Buede linjer (0.10.3): forventet sving og feltbredde fra veidata og GPS, og den andre linjen der den skal være
    const base = roadBottom ? { top: Math.max(0.25, roadBottom - 0.2), bottom: roadBottom - 0.02, horizon: Math.max(0.15, roadBottom - 0.25), minInl: 0.15, maxBg: 230 } : { top: 0.6, bottom: 0.92, horizon: 0.45 };
    const laneW = shape.laneWidth || LANE_WIDTH;
    // Linjene kameraet så i forrige bilde (ikke de tegnet etter feltbredden), så valget holder seg til samme linje (0.12.5)
    const pv = lastView && lastView.lane && lastView.lane.W === W && performance.now() - (lastView.lane.at || 0) < 600 ? lastView.lane : null;
    const painted = L => (L && !L.predicted && !L.edge ? L : null);
    const sure = L => (painted(L) && !L.carried ? L : null);
    const prev = pv ? { left: sure(pv.left), right: sure(pv.right) } : null;
    // Feltmodellen (0.13.0): punktene på linjene den fant, skalert til det lille bildet. Punkter godt utenfor veien
    // foran (gang- og sykkelvei, linjer bak en fortauskant) tas ikke med. Uten ferskt svar: den enkle bildeanalysen.
    // 0.13.9: svaret gjelder i 1,2 s (var 0,6): varm telefon gir 3 svar i sekundet, og ett tapt svar sendte ellers
    // linjene over på den enkle bildeanalysen i et par bilder. Det samme svaret regnes heller ikke ut på nytt.
    const ml = mlLanes && mlLanes.w > 0 && Math.abs(mlLanes.h / mlLanes.w - vh / vw) < 0.02 && performance.now() - mlLanes.at < 1200 ? mlLanes : null;
    const fresh = !ml || ml.at !== laneAnsAt || !laneRaw || laneRawW !== W;
    if (fresh) {
      const points = ml ? mlPoints(ml, W / ml.w, W) : null;
      laneRaw = detectLanes(gray, W, H, { ...base, curve: true, far: base.horizon + 0.04, kappa: shape.kappa, kappaWeight: shape.kappaWeight,
        focal: focalPx(W, H), camH: camHEst, laneWidth: laneW, predict: true, prev, points });
      laneRaw.ml = !!points; laneRawW = W; laneAnsAt = ml ? ml.at : performance.now();
    }
    const raw = laneRaw;
    // Det som vises og lagres: linjer som er sett mer enn én gang, og som står litt når de faller ut (0.12.6)
    const ln = { ...raw, ...laneTrack.step(raw, W, { t: performance.now(), fresh }) };
    // Kamerahøyden fra feltbredden: telefonen står i en holder ved rattet, så bare rimelige høyder tas med (0.12.5)
    if (Number.isFinite(ln.camH) && ln.camH > 0.8 && ln.camH < 1.8) camHEst += (ln.camH - camHEst) * 0.05;
    // Smale veier uten oppmalte linjer (0.13.3): ingen linje sett, men feltmodellen ser veien. Da vises høyre veikant og
    // midten av veien (feltet vårt er høyre halvdel). Telles ikke som sette linjer, og gir ikke sideavvik.
    let edge = false;
    if (ml && !painted(ln.left) && !painted(ln.right)) {
      const e = roadEdgeLines(scaleRoad(ml.road, W / ml.w), W, { vh: base.horizon * H, yBottom: base.bottom * H });
      if (e.right) { ln.left = e.left; ln.right = e.right; edge = true; }
    }
    // En linje som bæres etter feltbredden mens den er borte (carried, 0.13.9), vises, men lagres ikke som sett
    const seenL = !!painted(ln.left) && !ln.left.carried, seenR = !!painted(ln.right) && !ln.right.carried;
    r.lane = { l: seenL, r: seenR, offset: ln.offset, ...(edge ? { e: 1 } : {}), ...(ln.curve ? { k: Math.round(ln.curve.kappa * 1e4) / 1e4 } : {}), ...(shape.laneWidth ? { lw: shape.laneWidth } : {}) };
    Object.assign(lastView, { lane: { left: ln.left, right: ln.right, offset: ln.offset, W, H, at: performance.now(), ansAt: laneAnsAt, ml: !!raw.ml, road: ml ? scaleRoad(ml.road, W / ml.w) : null, kappa: ln.curve ? ln.curve.kappa : null,
      prior: shape.kappa, src: shape.src, lanes: shape.lanes, laneWidth: shape.laneWidth }, lum: r.lum, roadBottom });
  } catch { /* ingen feltlinjer */ }
  ema('laneMs', performance.now() - t2);
  if (dark || r.lum < NIGHT_LUM) {
    try {
      const W = 320, H = Math.round(320 * vh / vw);
      // Samme lille bilde som bildesammenligningen (tegnes én gang)
      let rgba = flowRgba && flowRgba.length === W * H * 4 ? flowRgba : null;
      if (!rgba) {
        if (!tailCanvas || tailCanvas.height !== H) { tailCanvas = document.createElement('canvas'); tailCanvas.width = W; tailCanvas.height = H; tailCtx = tailCanvas.getContext('2d', { willReadFrequently: true }); }
        tailCtx.drawImage(el, 0, 0, W, H); rgba = tailCtx.getImageData(0, 0, W, H).data;
      }
      const kt = vw / W;
      const tl = detectTaillights(rgba, W, H, { roadBottom, onRoad: area ? b => onRoadArea({ x: b.x * kt, y: b.y * kt, w: b.w * kt, h: 0 }, area, vw, vh) : null });
      r.night = true;
      r.tail = tl.pairs;
      if (!r.lead && tl.lead) r.lead = tl.lead;
      Object.assign(lastView, { night: true, tail: tl.pairs, lead: r.lead });
    } catch { /* ingen baklys */ }
  }
  // Fartsskilt (k0.7.6): hvert 2. bilde, veien over dashbordet i full oppløsning (ikke når bilen står stille)
  if (!(speedKmh < 3) && ++signN % 2 === 0) {
    const t3 = performance.now();
    try { signStep(r, el, now0, vw, vh); } catch { /* ingen skilt */ }
    ema('signMs', performance.now() - t3);
  }
  lastRoad = r;
  for (const fn of roadListeners) fn(r, now0);
}

/* Feltmodellens svar i det lille bildets piksler (k = liten bredde / kamerabredde). pts: [x, y, …], road: [y, venstre,
   høyre, …]. Et punkt mer enn 6 % av bredden utenfor veien foran på samme høyde droppes. */
function mlPoints(ml, k, W) {
  const road = scaleRoad(ml.road, k), m = W * 0.06, out = [];
  for (let i = 0; i + 1 < ml.pts.length; i += 2) {
    const x = ml.pts[i] * k, y = ml.pts[i + 1] * k;
    let e = null, best = Infinity;
    for (const r of road) { const d = Math.abs(r[0] - y); if (d < best) { best = d; e = r; } }
    if (e && best < 6 && (x < e[1] - m || x > e[2] + m)) continue;
    out.push({ x, y });
  }
  return out;
}
function scaleRoad(road, k) {
  const out = [];
  const r = road || [];
  for (let i = 0; i + 2 < r.length; i += 3) out.push([r[i] * k, r[i + 1] * k, r[i + 2] * k]);
  return out;
}
/* Veien foran fra feltmodellens siste svar (høyst 1,5 s gammelt) i veikamerabildets piksler, til onRoad i road.js */
function roadArea(vw, vh) {
  const ml = mlLanes;
  if (!ml || !(ml.w > 0) || Math.abs(ml.h / ml.w - vh / vw) > 0.02 || performance.now() - ml.at > 1500) return null;
  const k = vw / ml.w;
  if (!ml.area || ml.area.k !== k) ml.area = { k, rows: scaleRoad(ml.road, k).sort((a, b) => a[0] - b[0]), y0: Number(ml.y0) * k };
  return ml.area;
}

/* Fartsskilt (k0.7.6): røde ringer i delen av bildet over dashbordet, tallet lest mot maler (signs.js). Skilt som
   står på en bil (fartsmerker bak på lastebiler) hoppes over. Et skilt godtas når det er lest likt minst 3 ganger. */
function signStep(r, el, t, vw, vh) {
  const hh = Math.round(vh * (roadBottom ? Math.min(roadBottom, 0.85) : 0.72));
  if (!signCanvas || signCanvas.width !== vw || signCanvas.height !== hh) { signCanvas = document.createElement('canvas'); signCanvas.width = vw; signCanvas.height = hh; signCtx = signCanvas.getContext('2d', { willReadFrequently: true }); }
  signCtx.drawImage(el, 0, 0, vw, hh, 0, 0, vw, hh);
  const rgba = signCtx.getImageData(0, 0, vw, hh).data;
  const skip = tracker.predict(t).filter(p => !['person', 'bicycle'].includes(p.cls));
  signReads = readSigns(rgba, vw, hh, { skip });
  perf.signReads += signReads.length;
  if (signReads.length) r.signRead = signReads.map(s => ({ limit: s.limit, score: s.score, w: s.box.w }));
  const conf = signs.update(signReads, t);
  // Skilt som ble lest, men ikke godtatt (0.13.9): følger med eksporten, så det synes hva som ble mistet
  for (const m of signs.takeMissed()) { perf.signMissed++; if (perf.signMissLog.length < 40) perf.signMissLog.push({ at: Date.now(), ...m }); }
  if (conf) {
    perf.signs++;
    conf.ahead = signAhead(conf.w, focalPx(vw, vh));   // avstanden til skiltet: grensen gjelder fra der det står
    const b = signReads.slice().sort((a, b2) => b2.box.w - a.box.w)[0].box;
    lastSign = { ...conf, at: performance.now(), box: b };
    r.sign = conf;
    // Lite bilde av skiltet (til å sjekke lesingen etterpå, bare med testbilder på)
    try {
      const c = document.createElement('canvas'), m = Math.round(b.w * 0.15); c.width = 64; c.height = 64;
      c.getContext('2d').drawImage(signCanvas, b.x - m, b.y - m, b.w + 2 * m, b.h + 2 * m, 0, 0, 64, 64);
      r.signImg = c.toDataURL('image/jpeg', 0.7);
    } catch { /* uten bilde */ }
  }
}

/* Bildesammenligning (k0.7.5): et lite bilde (320 piksler bredt) i hvert steg. For hver bil som følges, letes midten av
   boksen fra forrige bilde opp i dette, og følgingen får flyttingen. Uten biler tegnes bildet likevel i mørket (baklys). */
function flowStep(el, t) {
  const W = 320, H = Math.round(320 * el.height / el.width), k = W / el.width;
  if (!tailCanvas || tailCanvas.height !== H) { tailCanvas = document.createElement('canvas'); tailCanvas.width = W; tailCanvas.height = H; tailCtx = tailCanvas.getContext('2d', { willReadFrequently: true }); }
  const preds = tracker.predict(flowPrevT).filter(p => p.w * k >= 7).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 6);
  const dark = lastLum !== null && lastLum < NIGHT_LUM;
  if (!preds.length && !dark) { flowPrev = null; return; }
  tailCtx.drawImage(el, 0, 0, W, H);
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

/* Testbilde (valgfritt, for feilsøking): lite JPEG i farger av det veikameraet ser nå, eller null. */
export function snapshot(size = 160) {
  if (!road || !road.ready) return null;
  const el = road.canvas, k = size / Math.max(el.width, el.height);
  const c = document.createElement('canvas'); c.width = Math.round(el.width * k); c.height = Math.round(el.height * k);
  c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', size > 200 ? 0.75 : 0.6);
}

/* Det modellene så i siste bilde, til fullskjermvisningen. facing 'user': ansiktets punkter (0–1 i kamerabildet,
   ikke speilvendt), hodet og øynene, og mask: delen av bildet som er skjult for modellen ({ from, to } 0–1, 0.13.2).
   'environment': { w, h, dets, lead, lane, roadBottom, lum, night, dfine, ... }. */
export function view(facing = 'user') {
  if (facing === 'user') {
    const mask = faceMask.mask;
    if (!lastFace || performance.now() - lastFace.at > 1500) return { facing, mask };
    return { facing, w: lastFace.w, h: lastFace.h, lm: lastFace.lm, pose: lastFace.pose, at: lastFace.at, faceMs: Math.round(perf.faceMs), mask };
  }
  const signView = { signReads: signReads.map(r => ({ box: r.box, limit: r.limit, score: r.score })), lastSign: lastSign && performance.now() - lastSign.at < 20000 ? lastSign : null };
  if (!road || !lastView || performance.now() - lastView.at > 3000) return { facing };
  // Boksene slik bilene trolig står akkurat nå (følgingen), og bilen foran regnet fra dem
  const t = road.t, v = lastView, preds = tracker.predict(t);
  const kk = v.lane && v.lane.W ? v.w / v.lane.W : 1;
  const lane = v.lane && v.lane.left && v.lane.right ? { left: scaleLane(v.lane.left, kk), right: scaleLane(v.lane.right, kk) } : null;
  const area = roadArea(v.w, v.h);
  const lead = processDetections(preds, v.w, v.h, { roadBottom: v.roadBottom, lane, road: area }).lead || (v.lead && v.lead.src === 'baklys' ? v.lead : null);
  return { facing, ...v, ...signView, dets: roadDets(preds, v.w, v.h, v.roadBottom, area), lead, dfineMs: Math.round(perf.dfineMs) };
}

/* Kameraets kilde (canvas eller video) til fullskjermvisningen */
export function sourceEl(facing = 'user') {
  if (facing === 'environment') return road ? road.canvas : null;
  return driver ? driver.canvas : video;
}

export function stopLoop() {
  if (timer) clearTimeout(timer); timer = null;
  if (roadTimer) clearTimeout(roadTimer); roadTimer = null;
}

function stopSources() {
  if (detsUnsub) detsUnsub(); detsUnsub = null;
  if (lanesUnsub) lanesUnsub(); lanesUnsub = null; mlLanes = null;
  if (driver) driver.stop();
  if (road) road.stop();
  if (driver || road) native.stop();
  driver = null; road = null; roadModel = null; driverSeq = -1; roadSeq = -1;
  tracker.reset(); flowPrev = null; lastView = null; lastRoad = null; rowEma = null; rowN = 0; roadBottom = null; lastLum = null;
}

export function stopCamera() {
  stopLoop();
  stopSources();
  if (stream) for (const tr of stream.getTracks()) tr.stop();
  stream = null;
  if (video) video.srcObject = null;
  video = null;
}
