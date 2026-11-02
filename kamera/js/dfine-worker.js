/* D-FINE i egen tråd (k0.7.4): modellen kjører utenfor hovedtråden, så kameraløkka, sensorene og tegningen ikke
   venter på den. Hovedtråden sender et 640×640-utsnitt (RGBA), tråden gjør resten og sender svarene tilbake.
   Meldinger inn: { type: 'init', ortBase, model } og { type: 'run', id, buf, gamma, crop }.
   Meldinger ut: { type: 'ready', backend }, { type: 'error', message } og { type: 'dets', id, dets } / { type: 'fail', id }. */
import { toTensorData, decode, SIZE } from './dfine.js';

const GAMMA = new Uint8ClampedArray(256).map((_, v) => Math.round(255 * Math.pow(v / 255, 0.5)));
let ort = null, session = null, inName = null;

self.onmessage = async e => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      ort = await import(m.ortBase + 'ort.webgpu.min.mjs');
      ort.env.wasm.wasmPaths = m.ortBase;
      ort.env.wasm.numThreads = 1;
      if (!self.navigator || !self.navigator.gpu) throw new Error('ingen WebGPU i egen tråd');
      session = await ort.InferenceSession.create(m.model, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
      inName = session.inputNames[0];
      self.postMessage({ type: 'ready', backend: 'webgpu' });
    } catch (err) { self.postMessage({ type: 'error', message: String(err && err.message || err).slice(0, 120) }); }
    return;
  }
  if (m.type === 'run') {
    try {
      const data = toTensorData(new Uint8ClampedArray(m.buf), m.gamma ? GAMMA : null);
      const res = await session.run({ [inName]: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) });
      const logits = res.logits || res[session.outputNames[0]], boxes = res.pred_boxes || res[session.outputNames[1]];
      self.postMessage({ type: 'dets', id: m.id, dets: decode(logits.data, boxes.data, m.crop) });
    } catch (err) { self.postMessage({ type: 'fail', id: m.id, message: String(err && err.message || err).slice(0, 120) }); }
  }
};
