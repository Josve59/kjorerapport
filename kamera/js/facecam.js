/* Kamera på telefonen: førerkamera (frontkameraet) med ansiktsgjenkjenning og veikamera (bakkameraet)
   med gjenkjenning av biler og folk. Testversjonen kan bytte mellom dem under kjøring.
   Ingen bilder lagres eller sendes – bare hodets vinkler og tall om veien går videre til appen. */
import { poseFromMatrix } from './camera.js';
import { processDetections } from './road.js';

const BASE = new URL('../../vendor/mediapipe/', import.meta.url).href;   // delt med hovedappen
let landmarker = null, loading = null, detector = null, loadingRoad = null, fileset = null;
let stream = null, video = null, timer = null, facing = 'user', switching = false;
const listeners = new Set(), roadListeners = new Set();
let lastPose = null, lastRoad = null, lastTs = 0, frames = 0, startedAt = 0, schedule = null;
const switchLog = [];   // byttetider (ms) denne økten

export const state = () => ({ loaded: !!landmarker, roadLoaded: !!detector, running: !!stream, facing, switching,
  fps: startedAt ? frames / ((performance.now() - startedAt) / 1000) : 0, lastPose, lastRoad, video, switches: switchLog.slice() });

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
      runningMode: 'VIDEO', scoreThreshold: 0.35, maxResults: 12,
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
  await video.play().catch(() => {});
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
  frames = 0; startedAt = performance.now();
  const tick = () => {
    timer = setTimeout(tick, 1000 / fps);
    if (schedule && !switching) {
      const want = schedule();
      if (want && want !== facing) { switchTo(want).catch(() => {}); return; }
    }
    if (switching || !video || video.readyState < 2 || video.videoWidth === 0) return;
    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    if (facing === 'user') {
      if (!landmarker) return;
      let pose = null;
      try {
        const res = landmarker.detectForVideo(video, ts);
        const m = res && res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
        pose = m ? poseFromMatrix(m.data) : null;
      } catch { pose = null; }
      frames++;
      lastPose = pose;
      for (const fn of listeners) fn(pose, ts);
    } else {
      if (!detector) return;
      let road = null;
      try {
        const res = detector.detectForVideo(video, ts);
        const dets = (res && res.detections || []).map(d => ({ cls: d.categories[0].categoryName, score: d.categories[0].score,
          x: d.boundingBox.originX, y: d.boundingBox.originY, w: d.boundingBox.width, h: d.boundingBox.height }));
        road = processDetections(dets, video.videoWidth, video.videoHeight);
      } catch { road = null; }
      frames++;
      lastRoad = road;
      if (road) for (const fn of roadListeners) fn(road, ts);
    }
  };
  tick();
}

export function stopLoop() { if (timer) clearTimeout(timer); timer = null; }

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
