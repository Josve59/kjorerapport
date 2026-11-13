/* Veikameraet i nettleseren (0.17.0). Safari kan bare ha ett kamera på om gangen, så nettversjonen bruker enten
   førerkameraet eller veikameraet («Bare veikamera»). iPhone-appen har begge samtidig (CameraHub.swift).
   - Kilden ser ut som kildene fra iPhone-appen (nativecam.js source), så resten av facecam.js (feltlinjene, skiltene,
     bilen foran, bildesammenligningen) virker som der.
   - Bilene finnes med D-FINE nano (Apache 2.0, ONNX Runtime Web, fra testappen kamera/ k0.7.0) i en egen tråd.
     iPhone-appen bruker en større D-FINE på telefonens egen maskinlæringsbrikke.
   - Feltlinjene kommer fra den enkle bildeanalysen i lanes.js: feltmodellen finnes bare i iPhone-appen.
   Modellene (rundt 40 MB) lastes første gang veikameraet brukes, og lagres av service workeren. */
import { loadDfineWorker } from './dfine.js';

const ORT_BASE = new URL('../vendor/ort/', import.meta.url).href;
const DFINE_MODEL = new URL('../vendor/dfine/dfine_n_coco.onnx', import.meta.url).href;

/* Kan nettleseren åpne et kamera i det hele tatt? */
export const webCameraSupported = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/* Bakkameraet som kilde: bildene tegnes på et lerret fps ganger i sekundet. Stående telefon gir stående bilde (720×1280). */
export async function webRoadSource({ fps = 10 } = {}) {
  if (!webCameraSupported()) throw new Error('Denne nettleseren gir ikke tilgang til kameraet.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 30 } }, audio: false });
  const video = document.createElement('video');
  video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = stream;
  await Promise.race([video.play().catch(() => {}), new Promise(r => setTimeout(r, 2000))]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let running = true, seq = -1, t = 0, frames = 0, timer = null, lastAt = performance.now(), gamma = 1;
  const grab = () => {
    if (!running) return;
    timer = setTimeout(grab, 1000 / fps);
    if (video.readyState < 2 || !video.videoWidth) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    ctx.drawImage(video, 0, 0);
    seq++; frames++; t = performance.now(); lastAt = t;
  };
  grab();
  return {
    facing: 'environment', canvas, web: true,
    get width() { return canvas.width; }, get height() { return canvas.height; },
    get t() { return t; }, get frames() { return frames; }, get seq() { return seq; },
    get ready() { return frames > 0; },
    get gamma() { return gamma; }, set gamma(v) { gamma = v; },
    get stalledMs() { return performance.now() - lastAt; },
    stream() { return stream; },
    stop() { running = false; clearTimeout(timer); for (const tr of stream.getTracks()) tr.stop(); video.srcObject = null; }
  };
}

/* Bilgjenkjenningen: én gang per økt i appen, og gjenbrukt når kameraet startes på nytt. Lasting av 40 MB på mobilnett
   kan ta tid første gang, så fristen er 2 minutter. → { detect(source, w, h, dark, roadBottom) → dets, backend } */
let carModel = null;
export function loadCarModel() {
  if (!carModel) carModel = loadDfineWorker({ ortBase: ORT_BASE, model: DFINE_MODEL, timeout: 120000 }).catch(err => { carModel = null; throw err; });
  return carModel;
}
