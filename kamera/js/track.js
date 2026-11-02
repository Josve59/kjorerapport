/* Følging av biler og folk mellom svarene fra bilgjenkjenningen (k0.7.4). D-FINE bruker rundt 0,3 s per bilde på
   iPhone, så boksene lå bak bilene i fullskjermvisningen. Hver bil får et spor: posisjon og fart (piksler per ms)
   fra svar til svar. Mellom svarene flyttes boksen dit bilen trolig er nå (høyst 0,5 s fram), og svarene brukes
   med tiden bildet ble tatt, så forsinkelsen i modellen tas igjen. Et spor må være sett minst to ganger før det
   regnes med (enkeltbilder med feil forsvinner), og forsvinner etter maxAge ms uten nytt svar.
   Ren modul uten nettleseravhengighet, så den kan testes i Node. */

const family = c => (c === 'person' || c === 'bicycle' ? 'p' : 'v');
function iou(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = x * y;
  return i / (a.w * a.h + b.w * b.h - i || 1);
}

export function createTracker({ maxAge = 1000, maxAhead = 500, smooth = 0.5 } = {}) {
  let tracks = [], nextId = 1;
  const at = (tr, t) => {
    const dt = Math.min(maxAhead, Math.max(0, t - tr.t));
    return { x: tr.box.x + tr.v.x * dt, y: tr.box.y + tr.v.y * dt, w: Math.max(4, tr.box.w + tr.v.w * dt), h: Math.max(4, tr.box.h + tr.v.h * dt) };
  };
  /* Nye svar [{ cls, score, x, y, w, h }] fra et bilde tatt ved tid t (ms). */
  const update = (dets, t) => {
    const pairs = [];
    tracks.forEach((tr, i) => {
      const pb = at(tr, t);
      dets.forEach((d, j) => { if (family(d.cls) === family(tr.cls)) { const v = iou(pb, d); if (v >= 0.2) pairs.push([v, i, j]); } });
    });
    pairs.sort((a, b) => b[0] - a[0]);
    const usedT = new Set(), usedD = new Set();
    for (const [, i, j] of pairs) {
      if (usedT.has(i) || usedD.has(j)) continue;
      usedT.add(i); usedD.add(j);
      const tr = tracks[i], d = dets[j], dt = t - tr.t;
      if (dt > 0) for (const k of ['x', 'y', 'w', 'h']) { const vNew = (d[k] - tr.box[k]) / dt; tr.v[k] = tr.hits > 1 ? tr.v[k] * (1 - smooth) + vNew * smooth : vNew; }
      tr.box = { x: d.x, y: d.y, w: d.w, h: d.h };
      tr.t = Math.max(tr.t, t); tr.hits++; tr.cls = d.cls; tr.score = d.score; tr.src = d.src;
    }
    dets.forEach((d, j) => {
      if (!usedD.has(j)) tracks.push({ id: nextId++, box: { x: d.x, y: d.y, w: d.w, h: d.h }, v: { x: 0, y: 0, w: 0, h: 0 }, t, hits: 1, cls: d.cls, score: d.score, src: d.src });
    });
    tracks = tracks.filter(tr => t - tr.t <= maxAge);
  };
  /* Boksene slik de trolig er ved tid t. minHits: hvor mange ganger sporet må være sett. */
  const predict = (t, { minHits = 2 } = {}) => tracks
    .filter(tr => t - tr.t <= maxAge && tr.hits >= minHits)
    .map(tr => ({ id: tr.id, cls: tr.cls, score: tr.score, hits: tr.hits, age: t - tr.t, src: tr.src, ...at(tr, t) }));
  const reset = () => { tracks = []; };
  return { update, predict, reset, get size() { return tracks.length; } };
}
