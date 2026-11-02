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
  let points = [], sections = [], prev = null, heading = null, section = null, done = null, track = null;
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
  /* GPS-punkt {lat, lon, t (s), kmh}. Returnerer null eller { text, kind, … }:
     'boks' { d } fotoboks foran (innen 1 km), 'strekning-foran' { d } inngangen til en strekningsmåling foran,
     'strekning' { avg, left } på strekningen, 'ferdig' { avg } i 8 s etter utgangen. d i meter (rundet til 50). */
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
        done = { until: p.t + 8, avg: total, text: `Strekningsmåling ferdig · snitt ${total} km/t` };
        section = null;
      } else {
        const left = Math.max(0, Math.round((section.s.len - section.dist) / 100) / 10);
        return { kind: 'strekning', avg, left, text: `Strekningsmåling · snitt ${avg ?? '–'} km/t · ${String(left).replace('.', ',')} km igjen` };
      }
    }
    if (done && p.t < done.until) return { kind: 'ferdig', avg: done.avg, text: done.text };
    // Fotoboks eller inngang til strekningsmåling foran i vår retning, innen 1 km (k0.7.1: før 700 m), innen 30° rett
    // foran. Vises først når bilen har nærmet seg den samme kontrollen 3 oppdateringer på rad (eller er innen 300 m):
    // kontroller på andre veier i nærheten ga ellers korte, falske varsler (Storlien-turen, 11–12 min)
    const ahead = q => angDiff(heading, bearing(p, q)) <= 30;
    let near = null;
    points.forEach((b, i) => {
      const d = metres(p, b);
      if (d > 1000 || d < 15 || !ahead(b)) return;
      if (Number.isFinite(b.mdir) && b.ctl) { const withM = angDiff(heading, b.mdir) < 90; if ((b.ctl === 'med') !== withM) return; }
      if (!near || d < near.d) near = { d, kind: 'boks', key: 'p' + i };
    });
    sections.forEach((s, i) => {
      const d = metres(p, s.entry);
      if (d > 1000 || d <= 60 || !ahead(s.entry) || angDiff(heading, s.dir) >= 45) return;
      if (!near || d < near.d) near = { d, kind: 'strekning-foran', key: 's' + i };
    });
    if (near) {
      track = track && track.key === near.key ? { key: near.key, d: near.d, n: near.d < track.d - 2 ? track.n + 1 : track.n } : { key: near.key, d: near.d, n: 1 };
      if (track.n < 3 && near.d > 300) near = null;
    } else track = null;
    if (near) {
      const d = Math.max(50, Math.round(near.d / 50) * 50);
      return { kind: near.kind, d, text: `${near.kind === 'boks' ? 'Fotoboks' : 'Strekningsmåling'} om ${d} m` };
    }
    return null;
  };
  return { load, update };
}
