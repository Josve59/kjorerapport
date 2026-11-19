/* Øving på plass (0.26.4): sklitrening, bremseøvelser og manøvrering på en parkeringsplass. Eieren kjørte 19. nov.
   kl. 21.02 en tur med sklitrening på parkeringsplasser: halvparten av hendelsene (kraftige svinger og bremsing i rundt
   20 km/t) var øvelser, og trakk ned poengene for kjøringen i trafikken.
   Øving på plass kjennes igjen på at bilen kjører rundt på et lite område: minst MIN_PATH meter i løpet av WIN sekunder
   uten å komme mer enn MAX_R meter fra der den var. Vanlig kjøring, også i kø og i rundkjøringer, gjør nesten aldri det
   (ingen av turene 16. og 19. nov. kl. 20.05, bortsett fra 1,5 min ut fra en parkeringsplass).
   Hendelsene der vises for seg i rapporten og teller ikke i poengene. Poengene regnes da på nytt med samme formel som i
   analysis.js (eierens analysemotor, som ikke endres); en test passer på at formelen er lik.
   Ren modul, testes i Node. */

export const PRACTICE = { win: 90, minPath: 250, maxR: 120, pad: 30 };

const R = 6371000, RAD = Math.PI / 180;
const dist = (a, b) => Math.hypot((b.lon - a.lon) * RAD * Math.cos(a.lat * RAD), (b.lat - a.lat) * RAD) * R;

/* points: rapportens punkter ({ t, lat, lon }). → [{ from, to }] i rapportens tid, slått sammen og med pad sekunder
   på hver side (en øvelse starter og slutter litt før og etter at bilen er «innestengt»). */
export function practiceSpans(points, { win = PRACTICE.win, minPath = PRACTICE.minPath, maxR = PRACTICE.maxR, pad = PRACTICE.pad } = {}) {
  const P = (points || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.t));
  const spans = [];
  if (P.length < 10) return spans;
  const end = P[P.length - 1].t;
  for (let i = 0; i < P.length; i += 3) {
    let k = i, maxD = 0, path = 0;
    while (k + 1 < P.length && P[k + 1].t - P[i].t <= win) {
      if (P[k + 1].t - P[k].t < 10) path += dist(P[k], P[k + 1]);
      k++;
      maxD = Math.max(maxD, dist(P[i], P[k]));
      if (maxD > maxR) break;
    }
    if (maxD > maxR || P[k].t - P[i].t < win - 10 || path < minPath) continue;
    const from = Math.max(0, P[i].t - pad), to = Math.min(end, P[k].t + pad), last = spans[spans.length - 1];
    if (last && from <= last.to) last.to = Math.max(last.to, to);
    else spans.push({ from, to });
  }
  return spans.map(s => ({ from: Math.round(s.from), to: Math.round(s.to) }));
}

export const inSpans = (t, spans) => (spans || []).some(s => t >= s.from && t <= s.to);

/* Poengene uten hendelsene på plass. r: fra analyze(). Samme formel som analysis.js: trekk per 10 km (r.kmFactor),
   jevn fart uendret, og totalen veid 30/20/25/25. → { scores, overall, counts, practice: [hendelser på plass] } */
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
export function rescore(r, spans) {
  const keep = r.events.filter(e => !inSpans(e.t, spans)), practice = r.events.filter(e => inSpans(e.t, spans));
  const count = (k, lvl) => keep.filter(e => e.kind === k && e.level === lvl).length;
  const c = {
    brake: { harsh: count('brake', 'harsh'), brisk: count('brake', 'brisk') },
    accel: { harsh: count('accel', 'harsh'), brisk: count('accel', 'brisk') },
    turn: { harsh: count('turn', 'harsh'), brisk: count('turn', 'brisk') }
  };
  const k = Number.isFinite(r.kmFactor) ? r.kmFactor : 1;
  const scores = {
    brake: clamp(100 - (20 * c.brake.harsh + 8 * c.brake.brisk) * k),
    accel: clamp(100 - (16 * c.accel.harsh + 6 * c.accel.brisk) * k),
    turn: clamp(100 - (16 * c.turn.harsh + 6 * c.turn.brisk) * k),
    smooth: r.scores.smooth
  };
  const overall = clamp(0.3 * scores.brake + 0.2 * scores.accel + 0.25 * scores.turn + 0.25 * scores.smooth);
  return { scores, overall, counts: c, practice };
}
