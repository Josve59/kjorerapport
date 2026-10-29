/* Kamera på telefonen: førerkamera (frontkameraet) med ansiktsgjenkjenning og veikamera (bakkameraet)
   med gjenkjenning av biler og folk. Testversjonen kan bytte mellom dem under kjøring.
   Ingen bilder lagres eller sendes – bare hodets vinkler og tall om veien går videre til appen. */
import { poseFromMatrix } from './camera.js';
import { processDetections, detectTaillights } from './road.js';
import { detectLanes, toGray } from './lanes.js';

const BASE = new URL('../../vendor/mediapipe/', import.meta.url).href;   // delt med hovedappen
let landmarker = null, loading = null, detector = null, loadingRoad = null, fileset = null;
let stream = null, video = null, timer = null, facing = 'user', switching = false;
const listeners = new Set(), roadListeners = new Set();
let lastPose = null, lastRoad = null, lastTs = 0, frames = 0, startedAt = 0, schedule = null;
let settleUntil = 0;   // bilder rett etter et bytte er for mørke (lyset stiller seg inn) og brukes ikke
let settleLum = null, settleStable = 0;   // veikameraet: vent til lysstyrken er stabil (i mørke tar det lenger tid)
let firstAfterSwitch = false;   // første analyse etter et bytte er treg (modellen starter på nytt) og telles ikke i farten
let fpsWanted = 8, fpsNow = 8;
const perf = { faceMs: 0, roadMs: 0, laneMs: 0, slow: false, slowSince: 0, drops: 0 };   // glattet tid per analyse
let laneCanvas = null, laneCtx = null, laneOverlay = null;
let brightCanvas = null, brightCtx = null, tailCanvas = null, tailCtx = null, lastLum = null, roadSize = null;
const NIGHT_LUM = 60;   // under dette (snittlysstyrke 0–255) brukes nattmodus for veikameraet
const switchLog = [];   // byttetider (ms) denne økten

export const state = () => ({ loaded: !!landmarker, roadLoaded: !!detector, running: !!stream, facing, switching,
  ready: !!stream && !switching && performance.now() >= settleUntil,   // gir brukbare bilder nå
  roadSize,   // bildestørrelse fra veikameraet (stående bilde = telefonen står på høykant)
  fps: startedAt ? frames / ((performance.now() - startedAt) / 1000) : 0, fpsNow, lastPose, lastRoad, video, switches: switchLog.slice(),
  perf: { ...perf, faceMs: Math.round(perf.faceMs), roadMs: Math.round(perf.roadMs), laneMs: Math.round(perf.laneMs * 10) / 10 } });

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

/* Gjenkjenning av biler og folk for veikameraet (rundt 5 MB første gang). */
export function loadRoadModel(onStatus = () => {}) {
  if (detector) return Promise.resolve(detector);
  if (loadingRoad) return loadingRoad;
  loadingRoad = (async () => {
    onStatus('Laster gjenkjenning av biler … (rundt 5 MB første gang)');
    const { ObjectDetector } = await vision();
    const opts = delegate => ({
      baseOptions: { modelAssetPath: BASE + 'efficientdet_lite0.tflite', delegate },
      runningMode: 'VIDEO', scoreThreshold: 0.15, maxResults: 12,   // road.js teller bare fra 0,35
      categoryAllowlist: ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'person']
    });
    try { detector = await ObjectDetector.createFromOptions(fileset, opts('GPU')); }
    catch { detector = await ObjectDetector.createFromOptions(fileset, opts('CPU')); }
    onStatus('Gjenkjenning av biler klar');
    return detector;
  })().catch(err => { loadingRoad = null; throw err; });
  return loadingRoad;
}

const constraints = mode => ({ video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 } }, audio: false });

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
    settleLum = null; settleStable = 0; firstAfterSwitch = true;
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
    const ms = facing === 'user' ? perf.faceMs : perf.roadMs + perf.laneMs;
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
      const t1 = performance.now();
      try {
        const src = dark ? brightFrame(video) : video;
        const sw = src === video ? video.videoWidth : src.width, sh = src === video ? video.videoHeight : src.height;
        const res = detector.detectForVideo(src, ts);
        const dets = (res && res.detections || []).map(d => ({ cls: d.categories[0].categoryName, score: d.categories[0].score,
          x: d.boundingBox.originX, y: d.boundingBox.originY, w: d.boundingBox.width, h: d.boundingBox.height }));
        road = processDetections(dets, sw, sh);
      } catch { road = null; }
      ema('roadMs', performance.now() - t1);
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
          const ln = detectLanes(gray, W, H);
          road.lane = { l: !!ln.left, r: !!ln.right, offset: ln.offset };
          if (laneOverlay) drawLanes(laneOverlay, ln, W, H);
        } catch { /* ingen feltlinjer */ }
        ema('laneMs', performance.now() - t2);
        if (dark || road.lum < NIGHT_LUM) {
          try {
            const W = 320, H = Math.round(320 * video.videoHeight / video.videoWidth);
            if (!tailCanvas || tailCanvas.height !== H) { tailCanvas = document.createElement('canvas'); tailCanvas.width = W; tailCanvas.height = H; tailCtx = tailCanvas.getContext('2d', { willReadFrequently: true }); }
            tailCtx.drawImage(video, 0, 0, W, H);
            const tl = detectTaillights(tailCtx.getImageData(0, 0, W, H).data, W, H);
            road.night = true;
            road.tail = tl.pairs;
            if (!road.lead && tl.lead) road.lead = tl.lead;
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

export function stopLoop() { if (timer) clearTimeout(timer); timer = null; }

/* Testbilde (valgfritt, for feilsøking): 96×72 svart-hvitt JPEG av det veikameraet ser nå, eller null. */
export function snapshot() {
  if (!video || facing !== 'environment' || video.videoWidth === 0) return null;
  const c = document.createElement('canvas'); c.width = 96; c.height = Math.round(96 * video.videoHeight / video.videoWidth);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.6);
}

/* Lysere kopi av kamerabildet til bilgjenkjenningen i mørket. Bruker canvas-filter der det finnes,
   ellers en oppslagstabell (gamma 0,5: mørke toner løftes mest). */
const GAMMA = new Uint8ClampedArray(256).map((_, v) => Math.round(255 * Math.pow(v / 255, 0.5)));
function brightFrame(v) {
  const W = Math.min(640, v.videoWidth), H = Math.round(W * v.videoHeight / v.videoWidth);
  if (!brightCanvas || brightCanvas.width !== W || brightCanvas.height !== H) {
    brightCanvas = document.createElement('canvas'); brightCanvas.width = W; brightCanvas.height = H;
    brightCtx = brightCanvas.getContext('2d', { willReadFrequently: true });
  }
  if ('filter' in brightCtx) { brightCtx.filter = 'brightness(2.2) contrast(1.15)'; brightCtx.drawImage(v, 0, 0, W, H); brightCtx.filter = 'none'; }
  else {
    brightCtx.drawImage(v, 0, 0, W, H);
    const img = brightCtx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = GAMMA[d[i]]; d[i + 1] = GAMMA[d[i + 1]]; d[i + 2] = GAMMA[d[i + 2]]; }
    brightCtx.putImageData(img, 0, 0);
  }
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
