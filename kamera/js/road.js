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
    close: episodes,
    // Bare tall (lagres i databasen sammen med analysen)
    follow: follow.map(x => ({ t: Math.round(x.t * 100) / 100, dist: x.lead.dist, headway: Math.round(x.headway * 100) / 100 }))
  };
}

/* Avstand til bilen foran rett før t (relativ tid), fra siste bilde fra veikameraet innen 4 s. */
export function leadAt(road, t) {
  let best = null;
  for (const x of (road && road.follow) || []) { if (x.t > t) break; if (t - x.t <= 4) best = x; }
  return best ? { dist: best.dist, headway: best.headway, age: t - best.t } : null;
}
