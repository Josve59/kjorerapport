/* Frontkamera + ansiktsgjenkjenning (MediaPipe Face Landmarker) på telefonen.
   Ingen bilder lagres eller sendes – bare hodets vinkler går videre til appen. */
import { poseFromMatrix } from './camera.js';

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
let landmarker = null, loading = null, stream = null, video = null, timer = null, listeners = new Set();
let lastPose = null, lastTs = 0, frames = 0, startedAt = 0;

export const state = () => ({ loaded: !!landmarker, running: !!stream, fps: startedAt ? frames / ((performance.now() - startedAt) / 1000) : 0, lastPose, video });

export function loadModel(onStatus = () => {}) {
  if (landmarker) return Promise.resolve(landmarker);
  if (loading) return loading;
  loading = (async () => {
    onStatus('Laster ansiktsgjenkjenning … (rundt 13 MB første gang)');
    const { FilesetResolver, FaceLandmarker } = await import(BASE + 'vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(BASE + 'wasm');
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

/* Starter frontkameraet. Må kalles fra et trykk første gang (iPhone). */
export async function startCamera(videoEl) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Denne nettleseren gir ikke tilgang til kameraet.');
  if (stream && video === videoEl) return;
  if (!stream) stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 } }, audio: false });
  video = videoEl;
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
}

/* Flytter kamerabildet til et annet <video>-element (f.eks. fra testskjermen til opptaket). */
export async function attachVideo(videoEl) {
  if (!stream) return false;
  video = videoEl;
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  return true;
}

export function onPose(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* Kjører gjenkjenningen ca. 8 ganger i sekundet. */
export function startLoop(fps = 8) {
  if (timer) return;
  frames = 0; startedAt = performance.now();
  const tick = () => {
    timer = setTimeout(tick, 1000 / fps);
    if (!landmarker || !video || video.readyState < 2 || video.videoWidth === 0) return;
    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    let pose = null;
    try {
      const res = landmarker.detectForVideo(video, ts);
      const m = res && res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
      pose = m ? poseFromMatrix(m.data) : null;
    } catch { pose = null; }
    frames++;
    lastPose = pose;
    for (const fn of listeners) fn(pose, ts);
  };
  tick();
}

export function stopLoop() { if (timer) clearTimeout(timer); timer = null; }

export function stopCamera() {
  stopLoop();
  if (stream) for (const tr of stream.getTracks()) tr.stop();
  stream = null;
  if (video) video.srcObject = null;
  video = null;
}
