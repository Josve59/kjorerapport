/* Følging av biler og folk mellom svarene fra bilgjenkjenningen (k0.7.4). D-FINE bruker rundt 0,3 s per bilde på
   iPhone, så boksene lå bak bilene i fullskjermvisningen. Hver bil får et spor: posisjon og fart (piksler per ms)
   fra svar til svar. Mellom svarene flyttes boksen dit bilen trolig er nå (høyst 0,5 s fram), og svarene brukes
   med tiden bildet ble tatt, så forsinkelsen i modellen tas igjen. Et spor må være sett minst to ganger før det
   regnes med (enkeltbilder med feil forsvinner), og forsvinner etter maxAge ms uten nytt svar.
   k0.7.5: i tillegg måles flyttingen i hvert kamerabilde (shift, fra bildesammenligning i flow.js), rundt 8 ganger
   i sekundet. Da styrer bildet bevegelsen sideveis og opp/ned, og svarene fra modellen retter bare opp gradvis
   (en tredjedel av avviket), så boksen ikke hopper ved hvert svar. Størrelsen (avstanden) kommer fortsatt fra modellen.
   Ren modul uten nettleseravhengighet, så den kan testes i Node. */

const family = c => (c === 'person' || c === 'bicycle' ? 'p' : 'v');
function iou(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = x * y;
  return i / (a.w * a.h + b.w * b.h - i || 1);
}
const K = ['x', 'y', 'w', 'h'];
const FLOW_FRESH = 500;   // ms: så lenge etter siste bildemåling styrer bildet bevegelsen
const FLOW_AGE = 2000;    // ms: et spor som bildet fortsatt finner igjen, lever så lenge uten nytt svar fra modellen

export function createTracker({ maxAge = 1000, maxAhead = 500, smooth = 0.5 } = {}) {
  let tracks = [], nextId = 1;
  // Et spor lever maxAge ms etter siste svar, eller inntil FLOW_AGE ms så lenge bildesammenligningen finner bilen
  const alive = t => tr => t - tr.seen <= maxAge || (t - tr.seen <= Math.max(maxAge, FLOW_AGE) && t - tr.flowAt <= 300);
  const at = (tr, t) => {
    const dt = Math.min(maxAhead, Math.max(0, t - tr.t));
    return { x: tr.box.x + tr.v.x * dt, y: tr.box.y + tr.v.y * dt, w: Math.max(4, tr.box.w + tr.v.w * dt), h: Math.max(4, tr.box.h + tr.v.h * dt) };
  };
  // Boksen ved et tidspunkt: fram i tid som at(), bakover fra historikken (svarene kommer 0,3 s etter bildet)
  const boxAt = (tr, t) => {
    if (t >= tr.t || !tr.hist.length) return at(tr, t);
    const h = tr.hist;
    if (t <= h[0].t) return { ...h[0].b };
    for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= t) {
      const a = h[i - 1], b = h[i], f = (t - a.t) / ((b.t - a.t) || 1);
      const o = {}; for (const k of K) o[k] = a.b[k] + (b.b[k] - a.b[k]) * f;
      return o;
    }
    return { ...h[0].b };
  };
  const remember = tr => { tr.hist.push({ t: tr.t, b: { ...tr.box } }); while (tr.hist.length > 2 && tr.t - tr.hist[0].t > 1500) tr.hist.shift(); };
  /* Nye svar [{ cls, score, x, y, w, h }] fra et bilde tatt ved tid t (ms). minNew: svar under denne scoren
     oppdaterer bare biler som allerede følges, og starter ingen nye (k0.7.5: mindre blinking når modellen er usikker). */
  const update = (input, t, { minNew = 0 } = {}) => {
    // Samme bil to ganger i ett svar (D-FINE gir av og til to nesten like bokser): bare den sikreste
    const dets = [];
    for (const d of input.slice().sort((a, b) => b.score - a.score)) if (!dets.some(o => family(o.cls) === family(d.cls) && iou(o, d) > 0.6)) dets.push(d);
    const pairs = [];
    tracks.forEach((tr, i) => {
      const pb = boxAt(tr, t);
      dets.forEach((d, j) => { if (family(d.cls) === family(tr.cls)) { const v = iou(pb, d); if (v >= 0.2) pairs.push([v, i, j]); } });
    });
    pairs.sort((a, b) => b[0] - a[0]);
    const usedT = new Set(), usedD = new Set();
    for (const [, i, j] of pairs) {
      if (usedT.has(i) || usedD.has(j)) continue;
      usedT.add(i); usedD.add(j);
      const tr = tracks[i], d = dets[j], flow = t - tr.flowAt < FLOW_FRESH || tr.t - tr.flowAt < FLOW_FRESH;
      // Fart fra svar til svar. Med bildemålinger eies farten sideveis og opp/ned av dem; størrelsen alltid herfra.
      const dt = t - tr.det.t;
      if (dt > 0) for (const k of K) {
        if (flow && (k === 'x' || k === 'y')) continue;
        const vNew = (d[k] - tr.det.b[k]) / dt;
        tr.v[k] = tr.hits > 1 ? tr.v[k] * (1 - smooth) + vNew * smooth : vNew;
      }
      // Avviket mellom svaret og der sporet var da bildet ble tatt, lagt på sporet nå
      const past = boxAt(tr, t);
      if (t > tr.t) { tr.box = at(tr, t); tr.t = t; }
      const gain = flow ? 0.35 : 1;
      for (const k of K) tr.box[k] = Math.max(k === 'w' || k === 'h' ? 4 : -Infinity, tr.box[k] + (d[k] - past[k]) * gain);
      tr.det = { t: Math.max(tr.det.t, t), b: { x: d.x, y: d.y, w: d.w, h: d.h } };
      tr.seen = Math.max(tr.seen, t); tr.hits++; tr.cls = d.cls; tr.score = d.score; tr.src = d.src;
      remember(tr);
    }
    dets.forEach((d, j) => {
      if (usedD.has(j) || d.score < minNew) return;
      const b = { x: d.x, y: d.y, w: d.w, h: d.h };
      const tr = { id: nextId++, box: { ...b }, v: { x: 0, y: 0, w: 0, h: 0 }, t, seen: t, flowAt: -Infinity, det: { t, b }, hist: [], hits: 1, cls: d.cls, score: d.score, src: d.src };
      remember(tr); tracks.push(tr);
    });
    tracks = tracks.filter(alive(t));
    // To spor på samme bil (k0.7.5, sett i test): det som er sett flest ganger beholdes
    const at0 = tracks.map(tr => at(tr, t));
    const drop = new Set();
    for (let i = 0; i < tracks.length; i++) for (let j = i + 1; j < tracks.length; j++) {
      if (drop.has(i) || drop.has(j) || family(tracks[i].cls) !== family(tracks[j].cls) || iou(at0[i], at0[j]) <= 0.7) continue;
      drop.add(tracks[i].hits >= tracks[j].hits ? j : i);
    }
    if (drop.size) tracks = tracks.filter((_, i) => !drop.has(i));
  };
  /* Bildemåling: sporet id flyttet seg (dx, dy) piksler fra bildet ved t0 til bildet ved t (flow.js). */
  const shift = (id, t0, dx, dy, t) => {
    const tr = tracks.find(x => x.id === id);
    if (!tr || !(t > t0)) return false;
    const from = boxAt(tr, t0), pred = at(tr, t);
    if (t > tr.t) { tr.box = pred; tr.t = t; }
    // Posisjonen fra bildet, litt glattet mot det sporet ventet; farten fra flyttingen
    const g = 0.8;
    tr.box.x += (from.x + dx - tr.box.x) * g; tr.box.y += (from.y + dy - tr.box.y) * g;
    const vx = dx / (t - t0), vy = dy / (t - t0), fresh = t - tr.flowAt < FLOW_FRESH;
    const vb = 0.8; tr.v.x = fresh ? tr.v.x * (1 - vb) + vx * vb : vx; tr.v.y = fresh ? tr.v.y * (1 - vb) + vy * vb : vy;
    tr.flowAt = t;
    remember(tr);
    return true;
  };
  /* Boksene slik de trolig er ved tid t. minHits: hvor mange ganger sporet må være sett. */
  const predict = (t, { minHits = 2 } = {}) => tracks
    .filter(tr => alive(t)(tr) && tr.hits >= minHits)
    .map(tr => ({ id: tr.id, cls: tr.cls, score: tr.score, hits: tr.hits, age: t - tr.seen, src: tr.src, ...at(tr, t) }));
  /* Boksen til et spor ved et tidligere tidspunkt (til bildesammenligningen) */
  const boxOf = (id, t) => { const tr = tracks.find(x => x.id === id); return tr ? boxAt(tr, t) : null; };
  const reset = () => { tracks = []; };
  return { update, shift, predict, boxOf, reset, get size() { return tracks.length; } };
}
