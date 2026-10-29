/* Veikameraet (testversjon k0.5.0): bakkameraet ser veien foran. Gjenkjenning av biler og folk skjer
   på telefonen (MediaPipe Object Detector). Bilder lagres aldri, bare tall: hvor mange biler og folk,
   og hvor langt unna bilen rett foran er.
   Rene funksjoner uten nettleseravhengighet, så de kan testes i Node. */

/* Typisk bredde (m) for kjøretøy, brukt til å anslå avstand ut fra hvor bred bilen ser ut i bildet. */
export const VEHICLE_WIDTH = { car: 1.8, truck: 2.5, bus: 2.55, motorcycle: 0.8 };
const PEOPLE = ['person', 'bicycle'];

/* Brennvidde i piksler ut fra kameraets synsvinkel langs den lengste siden av bildet.
   iPhone-hovedkameraet ser rundt 66° i bredden (4:3). Det er et anslag; avstanden kan bomme med 20–30 %. */
export function focalPx(w, h, fovDeg = 66) {
  return Math.max(w, h) / 2 / Math.tan(fovDeg / 2 * Math.PI / 180);
}

/* Én bildeanalyse → tall. dets: [{ cls, score, x, y, w, h }] i piksler. Bilen foran: et kjøretøy midt i
   bildet (sentrum innenfor midtre 30 %) med underkanten i nedre del (på veien, ikke på en bro), den bredeste. */
export function processDetections(dets, w, h, { fovDeg = 66, maxDist = 80 } = {}) {
  const f = focalPx(w, h, fovDeg);
  let lead = null, cars = 0, people = 0;
  for (const d of dets) {
    if (VEHICLE_WIDTH[d.cls]) {
      cars++;
      const cx = d.x + d.w / 2, bottom = d.y + d.h;
      if (cx < w * 0.35 || cx > w * 0.65 || bottom < h * 0.45 || d.w < 8) continue;
      const dist = VEHICLE_WIDTH[d.cls] * f / d.w;
      if (dist > maxDist) continue;
      if (!lead || d.w > lead.wpx) lead = { cls: d.cls, dist: Math.round(dist * 10) / 10, wpx: Math.round(d.w), score: Math.round(d.score * 100) / 100 };
    } else if (PEOPLE.includes(d.cls)) people++;
  }
  return { lead, cars, people };
}

/* Bilen foran i mørket (k0.6.4): baklysene. Bilgjenkjenningen (lært på dagsbilder) ser lite om natten, men to
   røde lys side om side er lett å finne. Avstanden anslås ut fra avstanden mellom lysene (rundt 1,45 m på en
   personbil). rgba: Uint8ClampedArray fra canvas, w×h (gjerne 320×240). Returnerer { lead, pairs }.
   Ren funksjon, kan testes i Node. */
export const TAIL_SEP = 1.45;
export function detectTaillights(rgba, w, h, { fovDeg = 66, maxDist = 80 } = {}) {
  // Rødt lys: sterk rød kanal, tydelig mer rødt enn grønt og blått. Overeksponerte kjerner (hvite) kobles
  // til blobben gjennom den røde glorien rundt.
  const y0 = Math.floor(h * 0.3), y1 = Math.floor(h * 0.95);
  // Terskelen følger det sterkeste røde i bildet, så lysene finnes også når kameraet eksponerer mørkt.
  let maxR = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (rgba[i] - Math.max(rgba[i + 1], rgba[i + 2]) > 20 && rgba[i] > maxR) maxR = rgba[i]; }
  const thr = Math.max(70, Math.min(110, 0.55 * maxR)), diff = Math.max(25, 0.4 * thr);
  const mask = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r > thr && r - Math.max(g, b) > diff) mask[y * w + x] = 1;
  }
  // Sammenhengende områder (4-naboer)
  const blobs = [], stack = [];
  for (let p = 0; p < mask.length; p++) {
    if (mask[p] !== 1) continue;
    let n = 0, sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    mask[p] = 2; stack.push(p);
    while (stack.length) {
      const q = stack.pop(), x = q % w, y = (q - x) / w;
      n++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const nb of [q - 1, q + 1, q - w, q + w]) {
        if (nb < 0 || nb >= mask.length || mask[nb] !== 1) continue;
        if ((nb === q - 1 || nb === q + 1) && Math.floor(nb / w) !== y) continue;
        mask[nb] = 2; stack.push(nb);
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    // Lys, ikke lange striper (refleks, bremselys-lister) eller store røde flater (bil, skilt)
    if (n >= 2 && n <= w * h * 0.03 && bw <= bh * 4 && bh <= bw * 3) blobs.push({ x: sx / n, y: sy / n, n, size: Math.max(bw, bh) });
  }
  // Par: samme høyde, lik størrelse, passe avstand
  const f = focalPx(w, h, fovDeg);
  let lead = null, pairs = 0;
  for (let i = 0; i < blobs.length; i++) for (let j = i + 1; j < blobs.length; j++) {
    const a = blobs[i], b = blobs[j];
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), s = (a.size + b.size) / 2;
    if (dy > Math.max(2, 0.6 * s) || Math.max(a.n, b.n) > 3 * Math.min(a.n, b.n) || dx < 1.5 * s || dx > w * 0.6) continue;
    pairs++;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    // Bilen foran: midt i bildet, og lysene rundt horisonten eller litt under (ikke gatelys, ikke panseret)
    if (cx < w * 0.35 || cx > w * 0.65 || cy < h * 0.35 || cy > h * 0.8) continue;
    const dist = TAIL_SEP * f / dx;
    if (dist > maxDist) continue;
    if (!lead || dx > lead.wpx) lead = { cls: 'car', dist: Math.round(dist * 10) / 10, wpx: Math.round(dx), score: 0.5, src: 'baklys' };
  }
  return { lead, pairs };
}

function kmhAt(points, t) {
  if (!points.length) return NaN;
  let lo = 0, hi = points.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid].t < t) lo = mid + 1; else hi = mid; }
  return points[lo].kmh;
}

/* Hele turen. samples: [{ t, lead, cars, people }] i opptakstid, points: rapportens punkter (relativ tid).
   Samkjøring med GPS: mellom bildene fra veikameraet (når kameraet ser på føreren) antas avstanden å være
   den samme, men bare hvis farten vår har endret seg mindre enn 15 km/t. Da bygges det bro over hullet. */
export function roadSummary(samples, points, { t0 = 0, minKmh = 50, closeSec = 1.0, bridge = 8 } = {}) {
  const s = (samples || []).filter(x => Number.isFinite(x.t)).map(x => ({ ...x, t: x.t - t0 })).sort((a, b) => a.t - b.t);
  if (!s.length) return null;
  const total = points.length ? points[points.length - 1].t - points[0].t : 0;
  // Hvor stor del av tiden veikameraet faktisk så veien (bilder tettere enn 1 s regnes som sammenhengende)
  let seen = 0;
  for (let i = 1; i < s.length; i++) { const dt = s[i].t - s[i - 1].t; if (dt < 1) seen += dt; }
  const follow = [];
  for (const x of s) {
    const kmh = kmhAt(points, x.t);
    x.kmh = kmh;
    if (x.lead && kmh >= 30) { x.headway = x.lead.dist / (kmh / 3.6); follow.push(x); }
  }
  const med = a => { const b = a.slice().sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
  // Kort avstand: tidsluke under closeSec i minst minKmh, sammenhengende (med bro over korte hull)
  const close = [];
  let cur = null;
  for (const x of follow) {
    const tight = x.kmh >= minKmh && x.headway < closeSec;
    if (tight && cur && x.t - cur.tEnd <= bridge && Math.abs(x.kmh - cur.lastKmh) < 15) {
      cur.tEnd = x.t; cur.min = Math.min(cur.min, x.headway); cur.minDist = Math.min(cur.minDist, x.lead.dist); cur.kmh.push(x.kmh); cur.lastKmh = x.kmh; cur.n++;
    } else if (tight) {
      if (cur) close.push(cur);
      cur = { t: x.t, tEnd: x.t, min: x.headway, minDist: x.lead.dist, kmh: [x.kmh], lastKmh: x.kmh, n: 1 };
    }
  }
  if (cur) close.push(cur);
  const episodes = close.filter(c => c.n >= 4 && c.tEnd - c.t >= 2).map(c => ({
    t: c.t, tEnd: c.tEnd, dur: c.tEnd - c.t, minHeadway: Math.round(c.min * 10) / 10, minDist: Math.round(c.minDist), kmh: Math.round(med(c.kmh)), bridged: c.n < (c.tEnd - c.t) * 3
  }));
  return {
    samples: s.length, coverage: total > 0 ? Math.min(1, seen / total) : 0,
    medianHeadway: follow.length ? Math.round(med(follow.map(x => x.headway)) * 10) / 10 : null,
    medianDist: follow.length ? Math.round(med(follow.map(x => x.lead.dist))) : null,
    followShare: s.length ? follow.length / s.length : 0,
    maxCars: Math.max(0, ...s.map(x => x.cars || 0)), peopleSeen: s.filter(x => x.people > 0).length,
    people: s.filter(x => x.people > 0).slice(0, 1000).map(x => Math.round(x.t * 10) / 10),   // tider med folk i bildet (samkjøring med gangfelt)
    // Så veikameraet noe? Andel bilder med bil, folk eller feltlinje, og andel mørke bilder (k0.6.3)
    seenShare: Math.round(s.filter(x => x.lead || x.cars > 0 || x.people > 0 || (x.lane && (x.lane.l || x.lane.r))).length / s.length * 100) / 100,
    darkShare: s.some(x => Number.isFinite(x.lum)) ? Math.round(s.filter(x => Number.isFinite(x.lum) && x.lum < 40).length / s.filter(x => Number.isFinite(x.lum)).length * 100) / 100 : null,
    tailLeads: s.filter(x => x.lead && x.lead.src === 'baklys').length,   // bilen foran funnet med baklysene (mørke)
    medianLum: s.some(x => Number.isFinite(x.lum)) ? med(s.filter(x => Number.isFinite(x.lum)).map(x => x.lum)) : null,
    lane: laneStats(s),
    close: episodes,
    // Bare tall (lagres i databasen sammen med analysen)
    follow: follow.map(x => ({ t: Math.round(x.t * 100) / 100, dist: x.lead.dist, headway: Math.round(x.headway * 100) / 100 }))
  };
}

/* Plassering i feltet (test): hvor ofte begge feltlinjene ble funnet, typisk avvik fra midten og hvor mye
   det varierer (slingring). Bare bilder i minst 40 km/t, der det er en vei med linjer å følge. */
function laneStats(s) {
  const fast = s.filter(x => x.kmh >= 40 && x.lane);
  if (fast.length < 10) return null;
  const both = fast.filter(x => Number.isFinite(x.lane.offset));
  const med = a => { const b = a.slice().sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
  if (both.length < 10) return { share: both.length / fast.length, medianOffset: null, spread: null, nearEdge: 0 };
  const off = both.map(x => x.lane.offset);
  const m = med(off);
  return {
    share: Math.round(both.length / fast.length * 100) / 100,
    medianOffset: Math.round(m * 100) / 100,
    spread: Math.round(med(off.map(v => Math.abs(v - m))) * 100) / 100,
    nearEdge: both.filter(x => Math.abs(x.lane.offset) > 0.75).length
  };
}

/* Avstand til bilen foran rett før t (relativ tid), fra siste bilde fra veikameraet innen 4 s. */
export function leadAt(road, t) {
  let best = null;
  for (const x of (road && road.follow) || []) { if (x.t > t) break; if (t - x.t <= 4) best = x; }
  return best ? { dist: best.dist, headway: best.headway, age: t - best.t } : null;
}
