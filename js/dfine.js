/* D-FINE nano (k0.7.0): bilgjenkjenning for veikameraet med ONNX Runtime Web. Apache 2.0
   (Peterande/D-FINE, eksportert av onnx-community/dfine_n_coco-ONNX). COCO AP rundt 43, mot rundt 34 for
   EfficientDet-Lite2. Bildet skaleres til 640×640, verdier 0–1, ingen normalisering
   (preprocessor_config: do_normalize false). Ut: logits [1, 300, 80] og pred_boxes [1, 300, 4] (cx, cy, w, h, 0–1).
   Kjører på grafikkprosessoren (WebGPU) der det finnes, ellers på prosessoren (wasm).
   Forbehandling og tolkning er rene funksjoner, så de kan testes i Node. */

export const SIZE = 640;
// COCO-klasser vi bruker, med navnene road.js venter (VEHICLE_WIDTH og folk)
export const CLASSES = { 0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck' };

/* Utsnitt av kamerabildet som gis til modellen: stående bilde → kvadrat midt på (der veien er, i full
   oppløsning), liggende → hele bildet. { sx, sy, sw, sh } i bildets piksler. */
export function cropFor(w, h, roadBottom = null) {
  // Med kjent dashbordkant (k0.7.1): kvadratet slutter rett under kanten, så det dekker veien og lite dashbord
  if (h > w && roadBottom) { const s = w, sy = Math.round(Math.max(0, Math.min(h - s, roadBottom * h - 0.9 * s))); return { sx: 0, sy, sw: s, sh: s }; }
  if (h > w) { const s = w; return { sx: 0, sy: Math.round((h - s) * 0.5), sw: s, sh: s }; }
  return { sx: 0, sy: 0, sw: w, sh: h };
}

/* RGBA (SIZE×SIZE) → Float32 NCHW 0–1, valgfritt med gammakurve i mørket (samme som for Lite2) */
export function toTensorData(rgba, gamma = null) {
  const n = SIZE * SIZE, out = new Float32Array(3 * n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r = gamma ? gamma[rgba[i]] : rgba[i], g = gamma ? gamma[rgba[i + 1]] : rgba[i + 1], b = gamma ? gamma[rgba[i + 2]] : rgba[i + 2];
    out[j] = r / 255; out[n + j] = g / 255; out[2 * n + j] = b / 255;
  }
  return out;
}

/* Modellens svar → [{ cls, score, x, y, w, h }] i kamerabildets piksler (som MediaPipe-svarene). */
export function decode(logits, boxes, crop, { minScore = 0.15, queries = 300, classes = 80 } = {}) {
  const out = [];
  for (let q = 0; q < queries; q++) {
    let best = -Infinity, bc = -1;
    for (const c of Object.keys(CLASSES)) { const v = logits[q * classes + +c]; if (v > best) { best = v; bc = +c; } }
    const score = 1 / (1 + Math.exp(-best));
    if (score < minScore) continue;
    const [cx, cy, bw, bh] = [boxes[q * 4], boxes[q * 4 + 1], boxes[q * 4 + 2], boxes[q * 4 + 3]];
    out.push({ cls: CLASSES[bc], score, x: crop.sx + (cx - bw / 2) * crop.sw, y: crop.sy + (cy - bh / 2) * crop.sh, w: bw * crop.sw, h: bh * crop.sh });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 20);
}

/* Laster modellen. base: mappe med ort.webgpu.min.mjs og wasm-filene, model: URL til .onnx.
   Returnerer { detect(source, w, h, gamma) → dets, backend } eller kaster feil (da brukes Lite2). */
export async function loadDfine({ ortBase, model, preferGpu = true }) {
  const ort = await import(ortBase + 'ort.webgpu.min.mjs');
  ort.env.wasm.wasmPaths = ortBase;
  ort.env.wasm.numThreads = 1;   // GitHub Pages har ikke cross-origin-isolasjon, så ingen tråder
  let session = null, backend = null;
  const tries = preferGpu && typeof navigator !== 'undefined' && navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr = null;
  for (const ep of tries) {
    try { session = await ort.InferenceSession.create(model, { executionProviders: [ep], graphOptimizationLevel: 'all' }); backend = ep; break; }
    catch (e) { lastErr = e; }
  }
  if (!session) throw lastErr || new Error('D-FINE startet ikke');
  const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const inName = session.inputNames[0];
  const detect = async (source, w, h, gamma = null, roadBottom = null) => {
    const crop = cropFor(w, h, roadBottom);
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, SIZE, SIZE);
    const data = toTensorData(ctx.getImageData(0, 0, SIZE, SIZE).data, gamma);
    const res = await session.run({ [inName]: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) });
    const logits = res.logits || res[session.outputNames[0]], boxes = res.pred_boxes || res[session.outputNames[1]];
    return decode(logits.data, boxes.data, crop);
  };
  return { detect, backend, canvas };
}

/* Samme som loadDfine, men modellen kjører i en egen tråd (dfine-worker.js). Hovedtråden tegner bare utsnittet og
   henter pikslene (rundt 10 ms). Kaster feil hvis tråden ikke får WebGPU innen 30 s (da brukes loadDfine). */
export function loadDfineWorker({ ortBase, model, timeout = 30000 }) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('./dfine-worker.js', import.meta.url), { type: 'module' }); } catch (e) { reject(e); return; }
    const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pending = new Map();
    let nextId = 1, ready = false;
    const timer = setTimeout(() => { if (!ready) { w.terminate(); reject(new Error('egen tråd startet ikke')); } }, timeout);
    w.onmessage = e => {
      const m = e.data;
      if (m.type === 'ready') {
        ready = true; clearTimeout(timer);
        const detect = (source, wd, ht, gamma = null, roadBottom = null) => new Promise((res, rej) => {
          const crop = cropFor(wd, ht, roadBottom);
          ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, SIZE, SIZE);
          const buf = ctx.getImageData(0, 0, SIZE, SIZE).data.buffer;
          const id = nextId++;
          pending.set(id, { res, rej });
          w.postMessage({ type: 'run', id, buf, gamma: !!gamma, crop }, [buf]);
        });
        resolve({ detect, backend: m.backend, worker: true, terminate: () => w.terminate() });
      } else if (m.type === 'error') { clearTimeout(timer); w.terminate(); reject(new Error(m.message)); }
      else if (m.type === 'dets' || m.type === 'fail') {
        const p = pending.get(m.id); pending.delete(m.id);
        if (p) { if (m.type === 'dets') p.res(m.dets); else p.rej(new Error(m.message)); }
      }
    };
    w.onerror = e => { clearTimeout(timer); if (!ready) reject(new Error(e.message || 'feil i egen tråd')); };
    w.postMessage({ type: 'init', ortBase, model });
  });
}
