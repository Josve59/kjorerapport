/* Fotobokser og strekningsmåling under kjøring (v0.9.7). Bruker dataene livelimit.js henter for området rundt
   bilen (fartsgrenser + ATK fra NVDB). Bare kontroller i vår kjøreretning: NVDB-geometrien går i
   metreringsretningen, og ved en fotoboks finnes den fra fartsgrensestrekningen nærmest.
   - Fotoboks foran (innen 700 m, rett foran oss, i vår retning): «Fotoboks om 400 m».
   - Strekningsmåling: fra bilen er ved inngangen i riktig retning, til utgangen: snittfart = kjørt lengde / tid.
   Rene funksjoner rundt en liten tilstand, så det kan testes i Node. */

const R = Math.PI / 180;
export function metres(a, b) {
  const cos = Math.cos((a.lat + b.lat) / 2 * R);
  return Math.hypot((b.lon - a.lon) * R * cos * 6371000, (b.lat - a.lat) * R * 6371000);
}
export const bearing = (a, b) => (Math.atan2((b.lon - a.lon) * Math.cos(a.lat * R), b.lat - a.lat) / R + 360) % 360;
const angDiff = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
/* Hvor langt p ligger forbi origin langs retningen dir (meter, negativ = før) */
const along = (p, origin, dir) => metres(origin, p) * Math.cos((bearing(origin, p) - dir) * R);

/* Korteste avstand (m) fra p til linjestykket a–b */
function segDist(p, a, b) {
  const cos = Math.cos(p.lat * R), k = R * 6371000;
  const ax = (a.lon - p.lon) * k * cos, ay = (a.lat - p.lat) * k, bx = (b.lon - p.lon) * k * cos, by = (b.lat - p.lat) * k;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/* Retningen til strekningen nærmest p (grader fra nord), fra fartsgrensestrekninger [{pts}], eller null. */
export function directionAt(p, segs, maxM = 60) {
  let best = null;
  for (const s of segs || []) for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1], b = s.pts[i];
    if (metres(a, b) < 1) continue;
    const d = segDist(p, a, b);
    if (!best || d < best.d) best = { d, dir: bearing(a, b) };
  }
  return best && best.d <= maxM ? best.dir : null;
}

export function createLiveAtk() {
  let points = [], sections = [], prev = null, heading = null, section = null, done = null;
  /* Nye data for området: { points: [{lat, lon, name, ctl}], sections: [{name, ctl, pts}] }, segs: fartsgrenser */
  const load = (data, segs) => {
    points = (data.points || []).map(p => ({ ...p, mdir: directionAt(p, segs) }));
    sections = (data.sections || []).map(s => {
      let len = 0; for (let i = 1; i < s.pts.length; i++) len += metres(s.pts[i - 1], s.pts[i]);
      const fwd = s.ctl !== 'mot';   // vår inngang er starten av linjen når kontrollen går med metreringsretningen
      const entry = fwd ? s.pts[0] : s.pts[s.pts.length - 1], exit = fwd ? s.pts[s.pts.length - 1] : s.pts[0];
      const next = fwd ? s.pts[1] : s.pts[s.pts.length - 2], beforeExit = fwd ? s.pts[s.pts.length - 2] : s.pts[1];
      return { name: s.name, len, entry, exit, dir: bearing(entry, next), exitDir: bearing(beforeExit, exit), known: !!s.ctl };
    });
  };
  /* GPS-punkt {lat, lon, t (s), kmh}. Returnerer { text, kind: 'boks' | 'strekning' | 'ferdig' } eller null. */
  const update = p => {
    if (!p || !Number.isFinite(p.lat)) return null;
    if (prev && metres(prev, p) >= 8) { heading = bearing(prev, p); }
    if (!prev || metres(prev, p) >= 8) {
      if (section && prev) {
        const step = metres(prev, p), before = section.dist;
        section.dist += step;
        // Lengden nådd: tiden mellom de to posisjonene, forholdsmessig (jevn fart gjennom et GPS-hull i tunnel)
        if (section.tLen === null && section.dist >= section.s.len) section.tLen = prev.t + (p.t - prev.t) * Math.min(1, (section.s.len - before) / step);
      }
      prev = p;
    }
    if (heading === null) return null;
    // Strekningsmåling: start ved inngangen i riktig retning, slutt ved utgangen. Tiden ved inngang og utgang
    // regnes fra hvor langt forbi (eller før) punktet bilen var, og farten der, så snittet ikke bommer med 1 posisjon.
    const v = q => (q.kmh > 5 ? q.kmh / 3.6 : 20);
    if (!section) {
      for (const s of sections) if (metres(p, s.entry) <= 60 && angDiff(heading, s.dir) < 45) {
        const a = along(p, s.entry, s.dir);
        section = { s, t0: p.t - a / v(p), dist: Math.max(0, a), tLen: null }; break;
      }
    }
    if (section) {
      const el = p.t - section.t0;
      const avg = el > 2 ? Math.round(section.dist / el * 3.6) : null;
      // Forbi utgangen (også etter et GPS-hull i tunnel, inntil 2 km forbi), eller kjørt langt forbi lengden uten å treffe den
      const ax = along(p, section.s.exit, section.s.exitDir);
      if ((ax >= 0 && metres(p, section.s.exit) <= 2000) || section.dist > section.s.len + 400) {
        const tEnd = ax >= 0 && metres(p, section.s.exit) <= 2000 ? p.t - ax / v(p) : (section.tLen ?? p.t);
        const total = tEnd > section.t0 ? Math.round(section.s.len / (tEnd - section.t0) * 3.6) : avg;
        done = { until: p.t + 20, text: `Strekningsmåling ferdig · snitt ${total} km/t` };
        section = null;
      } else {
        const left = Math.max(0, Math.round((section.s.len - section.dist) / 100) / 10);
        return { kind: 'strekning', text: `Strekningsmåling · snitt ${avg ?? '–'} km/t · ${String(left).replace('.', ',')} km igjen` };
      }
    }
    if (done && p.t < done.until) return { kind: 'ferdig', text: done.text };
    // Fotoboks foran i vår retning
    let near = null;
    for (const b of points) {
      const d = metres(p, b);
      if (d > 700 || d < 15) continue;
      if (angDiff(heading, bearing(p, b)) > 30) continue;   // ikke foran oss
      if (Number.isFinite(b.mdir) && b.ctl) { const withM = angDiff(heading, b.mdir) < 90; if ((b.ctl === 'med') !== withM) continue; }
      if (!near || d < near.d) near = { d };
    }
    if (near) return { kind: 'boks', text: `Fotoboks om ${Math.max(50, Math.round(near.d / 50) * 50)} m` };
    return null;
  };
  return { load, update };
}
