/* Kameraene i iPhone-appen (ios/Kjorerapport/CameraHub.swift): førerkameraet og veikameraet samtidig, noe Safari
   ikke kan. Appen tar bildene selv, og her hentes siste bilde fra hvert kamera som JPEG fra appens lokale server
   og tegnes på en canvas, som ansiktsgjenkjenningen og veikameraets bildeanalyse leser fra. Bilene finner appen selv
   (D-FINE på telefonens grafikkprosessor) og sender dem som hendelsen «kjcamdets». Ingen bilder lagres. */

export const available = () => typeof window !== 'undefined' && !!(window.kjNative && window.kjNative.camStart);

let info = null;
/* { multi: begge kameraene samtidig, model: bilgjenkjenning finnes } eller null utenfor iPhone-appen */
export async function camInfo() {
  if (!available()) return null;
  if (!info) info = await window.kjNative.camInfo().catch(() => null);
  return info;
}

/* Starter kameraene. facings: ['user'] og/eller 'environment'. Svar: { active, multi, error, model } */
export async function start(facings, { detect = false } = {}) {
  const r = await window.kjNative.camStart({ facings, detect });
  if (!r) throw new Error('Kameraet svarte ikke.');
  if (r.error === 'nei') { const e = new Error('Tilgang til kameraet ble avslått.'); e.name = 'NotAllowedError'; throw e; }
  if (r.error) throw new Error('Kameraet startet ikke: ' + r.error);
  return r;
}

export function stop() { if (available()) window.kjNative.camStop(); }

/* Dashbordkanten og mørke til bilgjenkjenningen (utsnittet og lysningen av bildet) */
let lastCfg = '';
export function configure(o) {
  const key = JSON.stringify(o);
  if (!available() || key === lastCfg) return;
  lastCfg = key;
  window.kjNative.camConfig(o);
}

/* Svar fra bilgjenkjenningen: fn({ dets, w, h, at, ms, backend }), der at er når bildet ble tatt (performance.now) */
export function onDets(fn) {
  const h = e => { const r = e.detail; if (r && Array.isArray(r.dets)) fn({ ...r, at: performance.now() - (Number(r.age) || 0) }); };
  window.addEventListener('kjcamdets', h);
  return () => window.removeEventListener('kjcamdets', h);
}

/* Svar fra feltmodellen (0.13.0): fn({ pts, road, w, h, y0, y1, ms, backend, at }). pts = [x, y, x, y, …] midt på
   feltlinjene, road = [y, venstre, høyre, …] kantene av veien foran, i kamerabildets piksler; y0–y1 er båndet modellen så. */
export function onLanes(fn) {
  const h = e => { const r = e.detail; if (r && Array.isArray(r.pts)) fn({ ...r, at: performance.now() - (Number(r.age) || 0) }); };
  window.addEventListener('kjcamlanes', h);
  return () => window.removeEventListener('kjcamlanes', h);
}

/* Et kamera som canvas: henter nye bilder fra appen så ofte som fps sier. { canvas, width, height, t, frames,
   seq, stream(), stop() }. t = når siste bilde ble tatt (performance.now). max: lengste side i piksler (0 = full). */
export function source(facing, { fps = 10, max = 0, quality = 0.8 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let running = true, seq = -1, t = 0, frames = 0, stream = null, timer = null, lastAt = performance.now();
  const pull = async () => {
    const t0 = performance.now();
    // Tidsfrist (0.10.1): en henting som henger (serveren stengt i bakgrunnen) skal ikke stoppe alle senere bilder
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const limit = ctl ? setTimeout(() => ctl.abort(), 2500) : null;
    try {
      const r = await fetch(`/cam/${facing}.jpg?after=${seq}&q=${quality}${max ? '&max=' + max : ''}`, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (r.status === 200) {
        const age = Number(r.headers.get('X-Age')) || 0;
        const s = Number(r.headers.get('X-Seq'));
        const bmp = await createImageBitmap(await r.blob());
        if (running) {
          if (canvas.width !== bmp.width || canvas.height !== bmp.height) { canvas.width = bmp.width; canvas.height = bmp.height; }
          ctx.drawImage(bmp, 0, 0);
          seq = Number.isFinite(s) ? s : seq + 1;
          t = performance.now() - age; frames++; lastAt = performance.now();
        }
        if (bmp.close) bmp.close();
      }
    } catch { /* neste forsøk */ }
    if (limit) clearTimeout(limit);
    if (running) timer = setTimeout(pull, Math.max(5, 1000 / fps - (performance.now() - t0)));
  };
  pull();
  return {
    facing, canvas,
    get width() { return canvas.width; }, get height() { return canvas.height; },
    get t() { return t; }, get frames() { return frames; }, get seq() { return seq; },
    get ready() { return frames > 0; },
    /* Millisekunder siden siste nye bilde (eller siden kilden startet) */
    get stalledMs() { return performance.now() - lastAt; },
    /* Til et <video>-element (forhåndsvisning) */
    stream() { if (!stream && canvas.captureStream) stream = canvas.captureStream(fps); return stream; },
    stop() { running = false; clearTimeout(timer); if (stream) for (const tr of stream.getTracks()) tr.stop(); stream = null; }
  };
}
