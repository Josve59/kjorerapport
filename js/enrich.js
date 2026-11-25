/* v3.1 – valgfrie nettjenester etter turen:
   - fartsgrenser fra Statens vegvesen (NVDB API v4, vegobjekttype 105)
   - stedsnavn (gatenavn) fra Kartverket (adresse-punktsøk)
   Alt her er på som standard (v0.9.1) og kan slås av i innstillinger. Resultatet lagres på turen,
   så rapporten viser det også uten nett senere. */

const NVDB_BASE = 'https://nvdbapiles.atlas.vegvesen.no/vegobjekter/api/v4/vegobjekter';
const NVDB = NVDB_BASE + '/105';
// Skiltplate (96) med skiltnummer 204 Stopp / 202 Vikeplikt, og vegkryss (37) av typen rundkjøring
const SIGN_STOP = { type: 96, filter: '5530=7643' };
const SIGN_GIVEWAY = { type: 96, filter: '5530=7642' };
const ROUNDABOUT = { type: 37, filter: '1114=3136' };
// v0.9.0: flere skilt og punkter langs veien (koder fra NVDB-datakatalogen, okt. 2026)
// Skiltplate 142 Barn (7633), 100.1/100.2 Farlig sving til høyre/venstre (7601/7602). OR må stå i parentes.
const SIGNS = { type: 96, filter: '(5530=7633 OR 5530=7601 OR 5530=7602)' };
const CROSSING = { type: 174 };   // gangfelt (selve feltet, linje over vegen)
const BUMP = { type: 103 };       // fartsdemper (fartshump, -pute osv.)
const SIGNAL = { type: 89 };      // signalanlegg (lyskryss), strekning
// 0.18.0: motorveg (595), egenskap Motorvegtype 5378: «Motorveg» eller «Motortrafikkveg». Rundt Trondheim har det
// meste av E6 og E39 80 eller 70 km/t, så fartsgrensen alene ga for lite motorvei i kjøreloggen.
const MOTORWAY = { type: 595 };
// 1.1.0: kryss uten skilt. Veinettet (vegnett, bare for kjørende) gir kryssene som noder; forkjørsveg (596) er strekninger
const VEGNETT = 'https://nvdbapiles.atlas.vegvesen.no/vegnett/api/v4/veglenkesekvenser/segmentert';
const PRIORITY = { type: 596 };
const KARTVERKET = 'https://ws.geonorge.no/adresser/v1/punktsok';
const CLIENT = 'Kjorerapport (kjorerapport.jo-9fc.workers.dev)';   // identifiserer appen overfor NVDB
const MATCH_M = 25;            // maks avstand fra GPS-punkt til fartsgrensestrekning
const CROSS_DEG = 60;          // strekninger mer enn 60° på tvers av kjøreretningen er en annen gate (0.22.2)
const CHUNK_M = 1500;          // rutebiter per NVDB-kall
const CHUNK_LONG_M = 3000;     // lange turer (over 40 km): større biter, færre kall
const PAD_DEG = 0.0008;        // ca. 60–90 m utvidelse av utsnittet
const MAX_CHUNKS = 160;        // v0.9.3: rundt 450 km (før 30 biter, ca. 45 km)

/* ---------- Rene hjelpefunksjoner (testes i Node) ---------- */

/* "LINESTRING Z (lat lon z, lat lon z, …)" → [{lat, lon}]. srid 4326 i NVDB gir lat først. */
export function parseWkt(wkt) {
  const m = /\(([^()]*)\)\s*$/.exec(wkt || '');
  if (!m) return [];
  return m[1].split(',').map(s => {
    const p = s.trim().split(/\s+/).map(Number);
    return { lat: p[0], lon: p[1] };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/* Deler ruten i biter på ca. CHUNK_M meter og gir et kartutsnitt per bit. */
export function routeChunks(points, chunkM = CHUNK_M, pad = PAD_DEG) {
  const chunks = [];
  if (!points.length) return chunks;
  let cur = [points[0]], dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += metres(points[i - 1], points[i]);
    cur.push(points[i]);
    if (dist >= chunkM) { chunks.push(cur); cur = [points[i]]; dist = 0; }
  }
  if (cur.length > 1 || !chunks.length) chunks.push(cur);
  return chunks.map(c => {
    const lats = c.map(p => p.lat), lons = c.map(p => p.lon);
    return { minLon: Math.min(...lons) - pad, minLat: Math.min(...lats) - pad, maxLon: Math.max(...lons) + pad, maxLat: Math.max(...lats) + pad };
  });
}

/* Utsnittene for en rute: korte turer i 1,5 km-biter, lange (Trondheim–Storlien) i 3 km-biter. */
export function routeBoxes(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += metres(points[i - 1], points[i]);
  const boxes = mergeBoxes(routeChunks(points, len > 40000 ? CHUNK_LONG_M : CHUNK_M));
  if (boxes.length > MAX_CHUNKS) throw new Error(`Turen er for lang til å hente veidata (${Math.round(len / 1000)} km, maks rundt 450 km).`);
  return boxes;
}

/* Slår sammen overlappende/nære utsnitt så det blir færre kall. */
export function mergeBoxes(boxes) {
  const out = [];
  for (const b of boxes) {
    const hit = out.find(o => !(b.minLon > o.maxLon || b.maxLon < o.minLon || b.minLat > o.maxLat || b.maxLat < o.minLat)
      && (Math.max(b.maxLon, o.maxLon) - Math.min(b.minLon, o.minLon)) < 0.06 && (Math.max(b.maxLat, o.maxLat) - Math.min(b.minLat, o.minLat)) < 0.03);
    if (hit) { hit.minLon = Math.min(hit.minLon, b.minLon); hit.maxLon = Math.max(hit.maxLon, b.maxLon); hit.minLat = Math.min(hit.minLat, b.minLat); hit.maxLat = Math.max(hit.maxLat, b.maxLat); }
    else out.push({ ...b });
  }
  return out;
}

function metres(a, b) {
  const k = Math.PI / 180, cos = Math.cos((a.lat + b.lat) / 2 * k);
  const dx = (b.lon - a.lon) * k * cos * 6371000, dy = (b.lat - a.lat) * k * 6371000;
  return Math.hypot(dx, dy);
}

/* Avstand (m) fra punkt p til linjestykket a–b, i lokalt meterplan. */
function segDist(p, a, b, cos) {
  const k = Math.PI / 180 * 6371000;
  const ax = (a.lon - p.lon) * k * cos, ay = (a.lat - p.lat) * k;
  const bx = (b.lon - p.lon) * k * cos, by = (b.lat - p.lat) * k;
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/* Finner fartsgrense for hvert GPS-punkt: nærmeste strekning innen MATCH_M meter, ellers NaN.
   segments: [{ limit, pts: [{lat,lon}] }]. Grov forhåndsfiltrering med boksen rundt strekningen.
   parallelOnly (0.13.1): bare strekninger langs kjøreretningen, aldri nærmeste på tvers (livelimit.js). */
export function matchLimits(points, segments, maxM = MATCH_M, opts = {}) {
  return matchDetail(points, segments, maxM, opts).map(x => x.limit);
}

/* Som matchLimits, men med avstanden til strekningen som ble valgt: [{ limit, d }] (d = Infinity uten treff). */
export function matchDetail(points, segments, maxM = MATCH_M, { parallelOnly = false } = {}) {
  const segs = segments.filter(s => Number.isFinite(s.limit) && s.pts.length > 1).map(s => {
    const lats = s.pts.map(p => p.lat), lons = s.pts.map(p => p.lon);
    return { ...s, minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
  });
  const dLat = maxM / 111320;
  // Kjøreretningen ved hvert punkt (v0.9.9): p.heading, ellers fra nabopunktene når bilen har flyttet seg. Strekninger
  // på tvers (veier under eller over, kryssende gater) velges ikke når det finnes en langs kjøreretningen: turen
  // 2. nov. kl. 20.32 fikk 90→40→90 i 3 s i 88 km/t.
  const brg = (a, b) => (Math.atan2((b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
  const heading = i => {
    const p = points[i];
    if (Number.isFinite(p.heading)) return p.heading;
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    return a !== b && metres(a, b) > 5 ? brg(a, b) : null;
  };
  return points.map((p, idx) => {
    const cos = Math.cos(p.lat * Math.PI / 180);
    const dLon = dLat / Math.max(cos, 0.1);
    const h = heading(idx);
    let best = Infinity, limit = NaN, bestPar = Infinity, limitPar = NaN;
    for (const s of segs) {
      if (p.lat < s.minLat - dLat || p.lat > s.maxLat + dLat || p.lon < s.minLon - dLon || p.lon > s.maxLon + dLon) continue;
      for (let i = 1; i < s.pts.length; i++) {
        const d = segDist(p, s.pts[i - 1], s.pts[i], cos);
        if (d >= best && d >= bestPar) continue;
        let ang = null;
        if (h !== null && metres(s.pts[i - 1], s.pts[i]) > 1) {
          const diff = Math.abs(((brg(s.pts[i - 1], s.pts[i]) - h) % 180 + 180) % 180);
          ang = Math.min(diff, 180 - diff);
        }
        if (ang !== null && ang <= 35 && d < bestPar) { bestPar = d; limitPar = s.limit; }
        // Nærmeste i alle retninger når ingen går langs veien, men aldri en gate på tvers (0.22.2): på turen 16. nov.
        // kl. 19.18 manglet NVDB fartsgrense på veien bilen kjørte, og sidegatene på tvers (30) ble valgt i 50-sonen.
        if (d < best && (ang === null || ang <= CROSS_DEG)) { best = d; limit = s.limit; }
      }
    }
    if (bestPar <= maxM) return { limit: limitPar, d: bestPar };
    return best <= maxM && !parallelOnly ? { limit, d: best } : { limit: NaN, d: Infinity };
  });
}

/* Ikke lån fartsgrensen fra en annen veg (0.26.5). Mangler NVDB fartsgrense på vegen bilen kjører, ble nærmeste veg
   innen 25 m brukt, også en parallell veg 15–25 m unna. Turene 19. nov. kl. 20.05 og 22.25 fikk slik «50» i 30 s midt
   på en 80-veg (eieren), mellom strekninger uten grense, og 70 km/t ble regnet som 20 over. Bilens egen veg ligger
   nesten alltid innen NEAR_M (kjørefeltet fra midtlinjen pluss GPS-feil). En grense lenger unna brukes derfor bare når
   den samme grensen ble funnet nær bilen innen sec sekunder før eller etter; ellers er grensen ukjent.
   points: [{ t }], detail: fra matchDetail. → grense per punkt (NaN = ukjent) */
export const NEAR_M = 12;
export function noBorrow(points, detail, { nearM = NEAR_M, sec = 10 } = {}) {
  return detail.map((x, i) => {
    if (!Number.isFinite(x.limit) || x.d <= nearM) return x.limit;
    const t = points[i].t;
    for (let j = i - 1; j >= 0 && t - points[j].t <= sec; j--) if (detail[j].limit === x.limit && detail[j].d <= nearM) return x.limit;
    for (let j = i + 1; j < detail.length && points[j].t - t <= sec; j++) if (detail[j].limit === x.limit && detail[j].d <= nearM) return x.limit;
    return NaN;
  });
}

/* Avstanden (m) fra ett punkt { lat, lon, heading } til nærmeste strekning langs kjøreretningen (innen 35°), eller
   Infinity. Til livelimit.js (0.22.2), som må vite hvor mye lenger unna en vei er enn en annen. */
export function limitDistance(p, segments) {
  if (!p || !Number.isFinite(p.heading)) return Infinity;
  const cos = Math.cos(p.lat * Math.PI / 180);
  const brg = (a, b) => (Math.atan2((b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
  let best = Infinity;
  for (const s of segments || []) for (let i = 1; i < (s.pts || []).length; i++) {
    const a = s.pts[i - 1], b = s.pts[i];
    if (metres(a, b) <= 1) continue;
    const diff = Math.abs(((brg(a, b) - p.heading) % 180 + 180) % 180);
    if (Math.min(diff, 180 - diff) <= 35) best = Math.min(best, segDist(p, a, b, cos));
  }
  return best;
}

/* Fyller små hull (≤ 3 punkter uten treff) med nabogrensen, så korte tap av treff ikke bryter episoder. */
export function fillGaps(limits, maxGap = 3) {
  const out = limits.slice();
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) continue;
    let j = i;
    while (j < out.length && !Number.isFinite(out[j])) j++;
    const before = i > 0 ? out[i - 1] : NaN, after = j < out.length ? out[j] : NaN;
    if (j - i <= maxGap && Number.isFinite(before) && before === after) for (let k = i; k < j; k++) out[k] = before;
    i = j;
  }
  return out;
}

/* Enkeltpunkter som avviker fra like naboer (typisk i kryss, der en sidevei er nærmest) settes til naboverdien. */
/* Korte hopp (v0.9.9): en annen fartsgrense i under minSec sekunder, med samme grense før og etter, er nesten alltid en
   vei på tvers eller GPS-støy (2. nov. kl. 20.32: 90→40→90 i 3 s, 60→40→60 i 2 s, 50→30→50 i 5 s). */
export function stabilizeLimits(points, limits, minSec = 6) {
  const out = limits.slice();
  const same = (a, b) => a === b || (!Number.isFinite(a) && !Number.isFinite(b));   // ukjent (NaN/null) regnes som like
  let i = 1;
  while (i < out.length) {
    if (same(out[i], out[i - 1])) { i++; continue; }
    let j = i + 1;
    while (j < out.length && same(out[j], out[i])) j++;
    const before = out[i - 1];
    if (j < out.length && Number.isFinite(before) && out[j] === before && points[j - 1].t - points[i].t < minSec) for (let k = i; k < j; k++) out[k] = before;
    i = j;
  }
  return out;
}

export function smoothBlips(limits) {
  const out = limits.slice();
  for (let i = 1; i < out.length - 1; i++) {
    if (Number.isFinite(out[i - 1]) && out[i - 1] === out[i + 1] && out[i] !== out[i - 1]) out[i] = out[i - 1];
  }
  return out;
}

/* Fartsovertredelser. points: [{t, kmh, lat, lon}], limits: samme lengde.
   Terskel 4 km/t over (GPS-usikkerhet), minst 3 s sammenhengende, episoder under 5 s fra hverandre slås sammen. */
export function analyzeSpeeding(points, limits, { tol = 4, minSec = 3, mergeSec = 5 } = {}) {
  const episodes = [];
  let cur = null, secondsOver = 0, maxOver = 0, covered = 0;
  for (let i = 0; i < points.length; i++) {
    const L = limits[i];
    if (!Number.isFinite(L)) { continue; }
    covered++;
    const over = points[i].kmh - L;
    const dt = i > 0 ? Math.min(points[i].t - points[i - 1].t, 5) : 1;
    if (over >= tol) {
      secondsOver += dt;
      maxOver = Math.max(maxOver, over);
      if (cur && points[i].t - cur.tTo <= mergeSec && cur.limit === L) {
        cur.tTo = points[i].t;
        if (points[i].kmh > cur.maxKmh) { cur.maxKmh = points[i].kmh; cur.lat = points[i].lat; cur.lon = points[i].lon; cur.tPeak = points[i].t; }
      } else {
        cur = { tFrom: points[i].t, tTo: points[i].t, tPeak: points[i].t, limit: L, maxKmh: points[i].kmh, lat: points[i].lat, lon: points[i].lon };
        episodes.push(cur);
      }
    }
  }
  // Inn mot høyere grense (v0.9.9): akselerasjon på påkjøringsrampen rett før motorveien (2. nov. kl. 20.32: 89 km/t i
  // 70 tre sekunder før 110) er vanlig kjøring. Grensen øker innen 6 s etter perioden, og farten er under den nye.
  const nextLimit = e => {
    for (let i = 0; i < points.length; i++) {
      if (points[i].t <= e.tTo) continue;
      if (points[i].t - e.tTo > 6) return null;
      if (Number.isFinite(limits[i]) && limits[i] !== e.limit) return limits[i];
    }
    return null;
  };
  const kept = episodes.filter(e => (e.tTo - e.tFrom >= minSec || e.maxKmh - e.limit >= 10) && !(nextLimit(e) > e.limit && e.maxKmh <= nextLimit(e) + tol));
  kept.forEach((e, i) => { e.n = i + 1; e.over = e.maxKmh - e.limit; });
  const serious = kept.filter(e => e.over >= 10).length;
  const score = Math.max(0, Math.min(100, Math.round(100 - 1.5 * secondsOver - 10 * serious)));
  return { episodes: kept, secondsOver, maxOver, score, coverage: points.length ? covered / points.length : 0 };
}

/* ---------- Nettkall ---------- */

async function nvdbPage(url, signal) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'X-Client': CLIENT }, signal });
  if (!res.ok) throw new Error(`Statens vegvesen svarte ${res.status}`);
  return res.json();
}

/* Fartsgrensestrekninger i ett kartutsnitt {minLon, minLat, maxLon, maxLat}. Brukes også under kjøring (livelimit.js). */
export async function fetchLimitBox(b, signal) {
  const segments = [];
  const box = [b.minLon, b.minLat, b.maxLon, b.maxLat].map(v => v.toFixed(5)).join(',');
  let url = `${NVDB}?kartutsnitt=${box}&srid=4326&inkluder=egenskaper,geometri&segmentering=true&antall=800`;
  for (let page = 0; page < 10 && url; page++) {
    const data = await nvdbPage(url, signal);
    for (const o of data.objekter || []) {
      const e = (o.egenskaper || []).find(x => x.id === 2021);
      const pts = o.geometri && o.geometri.wkt ? parseWkt(o.geometri.wkt) : [];
      if (e && Number.isFinite(e.verdi) && pts.length > 1) segments.push({ limit: e.verdi, pts });
    }
    const md = data.metadata || {};
    url = md.returnert && md.returnert >= (md.sidestørrelse || 800) && md.neste && md.neste.href ? md.neste.href : null;
  }
  return segments;
}

/* Felt og vegbredde der bilen er (0.10.3), til feltlinjene i veikameraet: et lite område (rundt 130 × 130 m), så
   svaret er noen få kB. Feltoversikten for hele området sammen med fartsgrensene ville gjort svaret 2,5 ganger større.
   { segs: [{ pts, lanes }] (vegsegmentene med feltoversikt, i lenkeretningen), widths: [{ pts, width }] (kjørebanebredde) } */
export async function fetchRoadInfo(p, signal) {
  const dLat = 0.0006, dLon = 0.0013;
  const box = [p.lon - dLon, p.lat - dLat, p.lon + dLon, p.lat + dLat].map(v => v.toFixed(5)).join(',');
  const [lim, wid] = await Promise.all([
    nvdbPage(`${NVDB}?kartutsnitt=${box}&srid=4326&inkluder=vegsegmenter&segmentering=true&antall=100`, signal),
    nvdbPage(`${NVDB_BASE}/838?kartutsnitt=${box}&srid=4326&inkluder=egenskaper,geometri&segmentering=true&antall=100`, signal).catch(() => ({ objekter: [] }))
  ]);
  const segs = [];
  for (const o of lim.objekter || []) for (const v of o.vegsegmenter || []) {
    const pts = v.geometri && v.geometri.wkt ? parseWkt(v.geometri.wkt) : [];
    if (pts.length > 1) segs.push({ pts, lanes: Array.isArray(v.feltoversikt) ? v.feltoversikt : [] });
  }
  const widths = [];
  for (const o of wid.objekter || []) {
    const e = (o.egenskaper || []).find(x => x.id === 9800);   // Kjørebanebredde
    const pts = o.geometri && o.geometri.wkt ? parseWkt(o.geometri.wkt) : [];
    if (e && Number.isFinite(e.verdi) && pts.length > 1) widths.push({ pts, width: e.verdi });
  }
  return { segs, widths };
}

/* Henter fartsgrensestrekninger for alle utsnitt. Returnerer [{limit, pts}]. */
export async function fetchSpeedLimitSegments(points, onProgress = () => {}, signal) {
  const boxes = routeBoxes(points);
  const segments = [];
  let done = 0;
  await pool(boxes, 4, async b => {
    for (const s of await fetchLimitBox(b, signal)) segments.push(s);
    done++;
    onProgress(done / boxes.length);
  });
  return segments;
}

/* Motorvei og motortrafikkvei langs ruten (0.18.0): [{ limit: 1 (motorveg) | 2 (motortrafikkveg), pts }].
   «limit» er bare et tall matchLimits kan bruke, ikke en fartsgrense. */
export async function fetchMotorwaySegments(points, signal) {
  const boxes = routeBoxes(points);
  const segments = [], seen = new Set();
  await pool(boxes, 4, async b => {
    const box = [b.minLon, b.minLat, b.maxLon, b.maxLat].map(v => v.toFixed(5)).join(',');
    let url = `${NVDB_BASE}/${MOTORWAY.type}?kartutsnitt=${box}&srid=4326&inkluder=egenskaper,geometri&segmentering=true&antall=500`;
    for (let page = 0; page < 5 && url; page++) {
      const data = await nvdbPage(url, signal);
      for (const o of data.objekter || []) {
        const key = `${o.id}:${String(o.geometri && o.geometri.wkt || '').slice(0, 80)}`;   // samme strekning fra to utsnitt
        if (seen.has(key)) continue;
        seen.add(key);
        const kind = ((o.egenskaper || []).find(x => x.id === 5378) || {}).verdi;
        // MULTILINESTRING har ett løp per kjøreretning: hver del blir en egen strekning
        for (const m of String(o.geometri && o.geometri.wkt || '').matchAll(/\(([^()]+)\)/g)) {
          const pts = parseLines(`(${m[1]})`);
          if (pts.length > 1) segments.push({ limit: kind === 'Motortrafikkveg' ? 2 : 1, pts });
        }
      }
      const md = data.metadata || {};
      url = md.returnert && md.returnert >= (md.sidestørrelse || 500) && md.neste && md.neste.href ? md.neste.href : null;
    }
  });
  return segments;
}

/* Motorvei per GPS-punkt: 1 motorvei, 2 motortrafikkvei, 0 annen vei. Bare strekninger langs kjøreretningen, så en
   bro over eller en vei under motorveien ikke teller. Korte hull og hopp glattes som for fartsgrensene. */
export function matchMotorway(points, segments) {
  // Står bilen i kø, finnes ingen kjøreretning: da brukes den siste, ellers ble kø-tiden ikke motorvei (kritikken 0.18.0)
  let lastH = null;
  const withH = points.map((p, i) => {
    let h = Number.isFinite(p.heading) && !(p.kmh < 3) ? p.heading : null;
    if (h === null) { const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]; if (a !== b && metres(a, b) > 5) h = bearing(a, b); }
    if (h === null) h = lastH; else lastH = h;
    return h === null ? p : { ...p, heading: h };
  });
  const raw = matchLimits(withH, segments, MATCH_M, { parallelOnly: true }).map(v => (Number.isFinite(v) ? v : 0));
  return stabilizeLimits(points, smoothBlips(fillGaps(raw.map(v => (v ? v : NaN)), 5)).map(v => (Number.isFinite(v) ? v : 0)), 8);
}

/* Gatenavn for en liste punkter. Returnerer [navn|null]. Maks ett kall per punkt; feil gir null. */
export async function fetchPlaceNames(coords, signal) {
  const out = [];
  for (const c of coords) {
    try {
      const url = `${KARTVERKET}?lat=${c.lat.toFixed(6)}&lon=${c.lon.toFixed(6)}&radius=80&treffPerSide=5`;
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
      if (!res.ok) { out.push(null); continue; }
      const data = await res.json();
      const list = (data.adresser || []).filter(a => a.adressenavn).sort((a, b) => a.meterDistanseTilPunkt - b.meterDistanseTilPunkt);
      out.push(list.length ? list[0].adressenavn : null);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      out.push(null);
    }
  }
  return out;
}

/* Alle koordinater i en LINESTRING eller MULTILINESTRING, i rekkefølge. */
export function parseLines(wkt) {
  const out = [];
  for (const m of String(wkt || '').matchAll(/\(([^()]+)\)/g)) for (const s of m[1].split(',')) {
    const p = s.trim().split(/\s+/).map(Number);
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) out.push({ lat: p[0], lon: p[1] });
  }
  return out;
}

/* "POINT Z (lat lon z)" eller "POINT(lat lon)" → {lat, lon} (srid 4326 gir lat først). */
export function parsePoint(wkt) {
  const nums = String(wkt || '').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const lat = Number(nums[0]), lon = Number(nums[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/* Henter punktobjekter av én type langs ruten. */
async function fetchPoints(points, spec, withProps, signal, full = false) {
  const boxes = routeBoxes(points);
  const out = [], seen = new Set();
  await pool(boxes, 4, async b => {
    const box = [b.minLon, b.minLat, b.maxLon, b.maxLat].map(v => v.toFixed(5)).join(',');
    let url = `${NVDB_BASE}/${spec.type}?kartutsnitt=${box}&srid=4326&inkluder=geometri${withProps ? ',egenskaper' : ''}${spec.filter ? '&egenskap=' + encodeURIComponent(spec.filter) : ''}&antall=500`;
    for (let page = 0; page < 5 && url; page++) {
      const data = await nvdbPage(url, signal);
      for (const o of data.objekter || []) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        // Punkt, eller midten av en linje (gangfelt og signalanlegg er linjer). full: hele linjen
        const wkt = o.geometri ? o.geometri.wkt : '';
        if (full) {
          const props = {};
          for (const e of o.egenskaper || []) props[e.id] = e.verdi;
          out.push({ line: parseLines(wkt), props });
          continue;
        }
        let pt = null;
        if (/^\s*LINESTRING/i.test(wkt)) {
          const l = parseWkt(wkt);
          if (l.length) {
            pt = { lat: l.reduce((a, q) => a + q.lat, 0) / l.length, lon: l.reduce((a, q) => a + q.lon, 0) / l.length, line: true };
            const a = l[0], b = l[l.length - 1];   // retning langs linjen (grader fra nord)
            if (l.length > 1) pt.dir = (Math.atan2((b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
          }
        }
        else pt = parsePoint(wkt);
        if (!pt) continue;
        const props = {};
        for (const e of o.egenskaper || []) props[e.id] = e.verdi;
        out.push({ ...pt, props });   // pt kan ha dir for linjer
      }
      const md = data.metadata || {};
      url = md.returnert && md.returnert >= (md.sidestørrelse || 500) && md.neste && md.neste.href ? md.neste.href : null;
    }
  });
  return out;
}

/* Kjører oppgaver med begrenset antall samtidige kall. */
async function pool(items, size, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const it = items[next++]; await fn(it); }
  });
  await Promise.all(workers);
}

/* Skiltnummer-tekst fra NVDB («142 - Barn») → kort type */
export function signKind(text) {
  const t = String(text || '');
  if (t.startsWith('142')) return 'barn';
  if (t.startsWith('100.1')) return 'svingH';
  if (t.startsWith('100.2')) return 'svingV';
  return null;
}

/* Bare det som ligger nær ruten tas vare på (et bykart har hundrevis av gangfelt). */
export function nearRoute(points, items, maxM = 40) {
  // Alle punkter opp til rundt 4 timer (1 Hz). Før: høyst 1500, som på lange turer ga 100+ m mellom punktene
  const step = Math.max(1, Math.floor(points.length / 15000));
  const sample = points.filter((_, i) => i % step === 0);
  return items.filter(it => sample.some(p => Math.abs(p.lat - it.lat) < 0.001 && metres(p, it) <= maxM));
}

/* Kryss i veinettet (1.1.0): noder der minst tre offentlige kjøreveger møtes (kommunal, fylkes-, riks- og europavei).
   Private veger (avkjørsler, parkeringsplasser) teller ikke: den som kommer derfra, har vikeplikt uansett. Noder ved
   rundkjøringer, ramper og ferjer er ikke kryss med høyreregel. segs: [{ ref, a, b, pts, kat, type, level }] fra NVDB.
   Et segment som begynner midt på en lenke, har en startnode som «0.5052@47852»: bare tall er ekte noder. Ren funksjon. */
export function junctionNodes(segs) {
  const nodes = new Map(), seen = new Set();
  const real = id => /^\d+$/.test(String(id));
  for (const sg of segs) {
    if (seen.has(sg.ref) || !Array.isArray(sg.pts) || sg.pts.length < 2) continue;
    seen.add(sg.ref);
    // Kjørebanen er nivået bilen kjører på; «Vegtrase» alene er midtlinjen for to løp og har egne noder
    if (!['Vegtrase og kjørebane', 'Kjørebane'].includes(sg.level)) continue;
    for (const [id, p] of [[sg.a, sg.pts[0]], [sg.b, sg.pts[sg.pts.length - 1]]]) {
      if (!real(id)) continue;
      const n = nodes.get(id) || { lat: p.lat, lon: p.lon, deg: 0, bad: false };
      if (['K', 'F', 'R', 'E'].includes(sg.kat)) n.deg++;
      if (['Rundkjøring', 'Rampe', 'Bilferje'].includes(sg.type)) n.bad = true;
      nodes.set(id, n);
    }
  }
  const r5 = v => Math.round(v * 1e5) / 1e5;
  return [...nodes.values()].filter(n => n.deg >= 3 && !n.bad).map(n => ({ lat: r5(n.lat), lon: r5(n.lon), deg: n.deg }));
}

/* Kryss på en forkjørsveg er ikke høyreregelkryss: enten har vi forkjørsrett, eller vi har vikeplikt (1.1.0).
   lines: [[{lat, lon}]] (forkjørsvegene). Ren funksjon. */
export function offPriority(nodes, lines, maxM = 8) {
  return nodes.filter(n => !lines.some(l => {
    const cos = Math.cos(n.lat * Math.PI / 180);
    for (let k = 1; k < l.length; k++) {
      if (Math.abs(l[k].lat - n.lat) > 0.002 && Math.abs(l[k - 1].lat - n.lat) > 0.002) continue;
      if (segDist(n, l[k - 1], l[k], cos) <= maxM) return true;
    }
    return false;
  }));
}

/* Kryss uten forkjørsveg langs ruten (1.1.0): veinettet i de samme utsnittene som veidataene, og forkjørsvegene.
   Svaret er stort i byer (rundt 180 kB komprimert per bykvartal-utsnitt), men hentes bare én gang per tur. */
export async function fetchJunctions(points, signal) {
  const boxes = routeBoxes(points);
  const segs = [];
  await pool(boxes, 3, async b => {
    const box = [b.minLon, b.minLat, b.maxLon, b.maxLat].map(v => v.toFixed(5)).join(',');
    let url = `${VEGNETT}?kartutsnitt=${box}&srid=4326&trafikantgruppe=K&antall=1000`;
    for (let page = 0; page < 6 && url; page++) {
      const data = await nvdbPage(url, signal);
      for (const o of data.objekter || []) {
        const vs = (o.vegsystemreferanse && o.vegsystemreferanse.vegsystem) || {};
        segs.push({ ref: o.referanse || `${o.veglenkesekvensid}-${o.veglenkenummer}-${o.segmentnummer}`, a: String(o.startnode), b: String(o.sluttnode),
          pts: parseWkt(o.geometri && o.geometri.wkt), kat: vs.vegkategori || '', type: o.typeVeg || '', level: o['detaljnivå'] || '' });
      }
      const md = data.metadata || {};
      url = md.returnert && md.returnert >= (md.sidestørrelse || 1000) && md.neste && md.neste.href ? md.neste.href : null;
    }
  });
  const prio = await fetchPoints(points, PRIORITY, false, signal, true);
  return offPriority(nearRoute(points, junctionNodes(segs), 15), prio.map(x => x.line));
}

/* Retningen fra a til b i grader fra nord (motorveier langs kjøreretningen) */
const bearing = (a, b) => (Math.atan2((b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;

export async function fetchRoadData(points, signal) {
  const [stops, giveway, rb, signs, crossings, bumps, signals, junctions] = await Promise.all([
    fetchPoints(points, SIGN_STOP, false, signal),
    fetchPoints(points, SIGN_GIVEWAY, false, signal),
    fetchPoints(points, ROUNDABOUT, true, signal),
    fetchPoints(points, SIGNS, true, signal),
    fetchPoints(points, CROSSING, false, signal),
    fetchPoints(points, BUMP, true, signal),
    fetchPoints(points, SIGNAL, true, signal),
    // Kryss (1.1.0): feiler veinettet, mangler bare kryssene, ikke resten av veidataene
    fetchJunctions(points, signal).catch(() => null)
  ]);
  const r5 = v => Math.round(v * 1e5) / 1e5;
  const pt = p => ({ lat: r5(p.lat), lon: r5(p.lon) });
  return {
    // v4 (0.26.3): retningen på gangfelt. Fotobokser og strekningsmåling hentes ikke fra 1.0.4. v5 (1.1.0): kryss.
    // Feilet veinettet, lagres v4 (1.1.1), så veidataene hentes på nytt neste gang i stedet for å mangle kryss for alltid.
    v: junctions ? 5 : 4,
    stops: stops.map(pt),
    giveway: giveway.map(pt),
    roundabouts: rb.map(p => ({ ...pt(p), d: Number(p.props[1791]) || 25, name: p.props[1073] || '' })),
    signs: nearRoute(points, signs.map(p => ({ ...pt(p), kind: signKind(p.props[5530]) })).filter(x => x.kind)),
    // Retningen på linjen (0.26.3): et gangfelt går på tvers av vegen det ligger på, så det skilles fra gangfelt over en
    // sidevei ved et kryss (evaluateRoad). Fartsdempere er punkter uten retning.
    crossings: nearRoute(points, crossings.map(p => ({ ...pt(p), ...(Number.isFinite(p.dir) ? { dir: Math.round(p.dir) } : {}) })), 25),
    bumps: nearRoute(points, bumps.map(p => ({ ...pt(p), type: p.props[1156] || '' })), 20),
    // Signalanlegg: bare lyskryss og lysregulerte gangfelt (bruksområde 1273). Uten bruksområde tas bare punkter med;
    // linjer uten bruksområde er ofte kjørefeltsignaler over motorvegen.
    signals: nearRoute(points, signals.filter(p => ['Vegkryss', 'Gangfelt'].includes(p.props[1273]) || (!p.props[1273] && !p.line))
      .map(p => ({ ...pt(p), dir: Number.isFinite(p.dir) ? Math.round(p.dir) : null })), 60),
    ...(junctions ? { junctions } : {})
  };
}

/* Vurderer veidata mot ruten. points: [{t, lat, lon, kmh}], events: rapportens hendelser.
   - Stoppskilt: bare skilt bilen selv stoppet/bremset ned ved (laveste fart under 15 km/t innen ±40 m),
     ellers er det trolig skiltet til en sidevei. Helt stopp = under 3 km/t.
   - Vikeplikt: samme logikk med 30 km/t, bare til informasjon (om det var trafikk kan ikke appen vite).
   - Rundkjøringer: ruten innenfor diameter/2 + 15 m. */
export function evaluateRoad(points, road, events = [], limits = null) {
  const out = { stops: [], giveway: [], roundabouts: [] };
  if (!road || points.length < 2) return out;
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + metres(points[i - 1], points[i]));
  // 1.1.1: rutenett (ca. 110 × 100 m) over punktene, så bare naboruter søkes. Alle terskler under er 35 m eller mindre,
  // så nærmeste punkt innen terskelen er det samme som før (lavest indeks ved likt). En times bykjøring: 65 → rundt 15 ms.
  const CELL = 0.001, grid = new Map(), cellKey = (la, lo) => la * 100000 + lo;
  for (let i = 0; i < points.length; i++) { const k = cellKey(Math.floor(points[i].lat / CELL), Math.floor(points[i].lon / CELL / 2)); const c = grid.get(k); if (c) c.push(i); else grid.set(k, [i]); }
  const nearest = p => {
    let bi = -1, bd = Infinity;
    const cy = Math.floor(p.lat / CELL), cx = Math.floor(p.lon / CELL / 2), cand = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = grid.get(cellKey(cy + dy, cx + dx)); if (c) for (const i of c) cand.push(i); }
    cand.sort((x, y) => x - y);
    for (const i of cand) { const d = metres(points[i], p); if (d < bd) { bd = d; bi = i; } }
    return { i: bi, d: bd };
  };
  const window = (i, m) => { let a = i, b = i; while (a > 0 && cum[i] - cum[a - 1] <= m) a--; while (b < points.length - 1 && cum[b + 1] - cum[i] <= m) b++; return [a, b]; };
  const minIn = (a, b) => { let m = Infinity, mi = a; for (let k = a; k <= b; k++) if (points[k].kmh < m) { m = points[k].kmh; mi = k; } return { m, mi }; };
  for (const s of road.stops || []) {
    const { i, d } = nearest(s);
    if (d > 20) continue;
    const [a, b] = window(i, 40);
    const { m, mi } = minIn(a, b);
    if (m >= 15) continue;
    out.stops.push({ t: points[mi].t, lat: s.lat, lon: s.lon, minKmh: Math.round(m), full: m < 3 });
  }
  for (const s of road.giveway || []) {
    const { i, d } = nearest(s);
    if (d > 15) continue;
    const [a, b] = window(i, 30);
    const { m, mi } = minIn(a, b);
    if (m >= 30) continue;
    const [a2] = window(mi, 50);
    out.giveway.push({ t: points[mi].t, lat: s.lat, lon: s.lon, minKmh: Math.round(m), approachKmh: Math.round(points[a2].kmh) });
  }
  // Slå sammen vikepliktskilt som hører til samme kryss (innen 10 s)
  out.giveway.sort((x, y) => x.t - y.t);
  out.giveway = out.giveway.filter((g, k, arr) => !k || g.t - arr[k - 1].t > 10);
  for (const rb of road.roundabouts || []) {
    const r = Math.max(5, rb.d / 2) + 15;
    const inside = [];
    for (let k = 0; k < points.length; k++) if (metres(points[k], rb) <= r) inside.push(k);
    if (!inside.length) continue;
    const tFrom = points[inside[0]].t, tTo = points[inside[inside.length - 1]].t;
    const ev = events.filter(e => e.t >= tFrom - 3 && e.t <= tTo + 3);
    out.roundabouts.push({ t: (tFrom + tTo) / 2, tFrom, tTo, lat: rb.lat, lon: rb.lon, d: rb.d, name: rb.name, events: ev.map(e => e.n), source: 'nvdb' });
  }
  out.roundabouts.sort((x, y) => x.t - y.t);

  // v0.9.0 – gangfelt, fartsdempere, lyskryss og skilt (barn, farlig sving)
  const along = (i, m) => { let b = i; while (b < points.length - 1 && cum[b + 1] - cum[i] <= m) b++; return b; };
  const before = (i, m) => { let a = i; while (a > 0 && cum[i] - cum[a - 1] <= m) a--; return a; };
  out.crossings = []; out.bumps = []; out.signals = []; out.signs = [];
  // Gangfelt over en sidevei (0.26.3): et gangfelt ved et kryss ligger ofte under 15 m fra ruta, og ble
  // regnet som passert («Gangfelt i 60 km/t») selv om bilen kjørte forbi på hovedvegen. Feltet går på tvers av vegen
  // det ligger på: ligger linjen nesten langs kjøreretningen (under 45°), er det en annen veg.
  const routeDir = i => { const p0 = points[Math.max(0, i - 2)], p1 = points[Math.min(points.length - 1, i + 2)], k = Math.cos(p0.lat * Math.PI / 180); return (Math.atan2((p1.lon - p0.lon) * k, p1.lat - p0.lat) * 180 / Math.PI + 360) % 360; };
  const sideRoad = (o, i) => { if (!Number.isFinite(o.dir)) return false; const diff = Math.abs(((routeDir(i) - o.dir) % 180 + 180) % 180); return Math.min(diff, 180 - diff) < 45; };
  // De fleste gangfelt er punkter uten retning. Avstanden måles da til selve ruta (linjen mellom GPS-punktene), ikke til
  // nærmeste punkt: i 50 km/t er det 14 m mellom punktene. På demoruta lå gangfeltene på ruta 0–6 m fra linjen, og
  // gangfelt over sideveier ved kryss 8–15 m unna.
  const lineDist = (o, i) => {
    const seg = (a, b) => { const kx = Math.cos(a.lat * Math.PI / 180) * 111320, ky = 110540, bx = (b.lon - a.lon) * kx, by = (b.lat - a.lat) * ky, px = (o.lon - a.lon) * kx, py = (o.lat - a.lat) * ky, L = bx * bx + by * by, u = L ? Math.max(0, Math.min(1, (px * bx + py * by) / L)) : 0; return Math.hypot(px - u * bx, py - u * by); };
    return Math.min(i > 0 ? seg(points[i - 1], points[i]) : Infinity, i < points.length - 1 ? seg(points[i], points[i + 1]) : Infinity);
  };
  for (const c of road.crossings || []) {
    const { i, d } = nearest(c);
    if (d > 15 || points[i].kmh < 5 || sideRoad(c, i) || lineDist(c, i) > 8) continue;
    out.crossings.push({ t: points[i].t, lat: c.lat, lon: c.lon, kmh: Math.round(points[i].kmh), approachKmh: Math.round(points[before(i, 40)].kmh) });
  }
  for (const b of road.bumps || []) {
    const { i, d } = nearest(b);
    if (d > 10 || points[i].kmh < 3 || lineDist(b, i) > 7) continue;
    out.bumps.push({ t: points[i].t, lat: b.lat, lon: b.lon, kmh: Math.round(points[i].kmh), approachKmh: Math.round(points[before(i, 50)].kmh), type: b.type || '' });
  }
  const headingAt = i => { const p0 = points[Math.max(0, i - 1)], p1 = points[Math.min(points.length - 1, i + 1)], k = Math.cos(p0.lat * Math.PI / 180); return (Math.atan2((p1.lon - p0.lon) * k, p1.lat - p0.lat) * 180 / Math.PI + 360) % 360; };
  for (const sg of road.signals || []) {
    const { i, d } = nearest(sg);
    if (d > 35) continue;
    // Signalanlegget må ligge langs vegen vi kjører (ikke en veg under eller over): retning innen 35°, begge veier
    if (Number.isFinite(sg.dir)) { const diff = Math.abs(((headingAt(i) - sg.dir) % 180 + 180) % 180); if (Math.min(diff, 180 - diff) > 35) continue; }
    const a = before(i, 60), b = along(i, 30);
    const { m } = minIn(a, b);
    out.signals.push({ t: points[i].t, tFrom: points[a].t, tTo: points[b].t, lat: sg.lat, lon: sg.lon, minKmh: Math.round(m), stopped: m < 3, kmh: Math.round(points[i].kmh) });
  }
  for (const sg of road.signs || []) {
    const { i, d } = nearest(sg);
    if (d > 25 || i <= 0 || i >= points.length - 1 || points[i].kmh < 5) continue;
    // Skiltet gjelder den som har det på høyre side (høyretrafikk)
    const p0 = points[i - 1], p1 = points[i + 1], k = Math.cos(sg.lat * Math.PI / 180);
    const hx = (p1.lon - p0.lon) * k, hy = p1.lat - p0.lat, vx = (sg.lon - points[i].lon) * k, vy = sg.lat - points[i].lat;
    if (hx * vy - hy * vx >= 0) continue;   // til venstre: gjelder motgående trafikk
    const zone = sg.kind === 'barn' ? 150 : 250;
    const e = along(i, zone);
    let maxKmh = 0; for (let q = i; q <= e; q++) maxKmh = Math.max(maxKmh, points[q].kmh);
    out.signs.push({ t: points[i].t, tTo: points[e].t, lat: sg.lat, lon: sg.lon, kind: sg.kind, kmh: Math.round(points[i].kmh), maxKmh: Math.round(maxKmh),
      events: events.filter(ev => ev.t >= points[i].t && ev.t <= points[e].t).map(ev => ev.n) });
  }
  // Kryss uten skilt (1.1.0): her gjelder høyreregelen. Bare kryss bilen kjørte gjennom (under 10 m fra ruta). Ikke der
  // et stopp- eller vikepliktskilt, et lyskryss eller en rundkjøring er nær (da er krysset regulert), og ikke over 60-sone.
  // NVDB mangler en del skilt på kommunale veger, så appen sier «trolig» om høyreregelen.
  out.junctions = [];
  const regulated = j => [...(road.stops || []), ...(road.giveway || [])].some(x => metres(x, j) <= 35)
    || (road.signals || []).some(x => metres(x, j) <= 40) || (road.roundabouts || []).some(x => metres(x, j) <= Math.max(5, x.d / 2) + 20);
  for (const j of road.junctions || []) {
    const { i, d } = nearest(j);
    if (d > 10 || points[i].kmh < 3 || regulated(j)) continue;
    const lim = limits && Number.isFinite(limits[i]) ? limits[i] : null;
    // Over 60-sone, eller over 60 km/t der grensen er ukjent: trolig en hovedvei, ikke et kryss med høyreregel
    if (lim !== null ? lim > 60 : points[i].kmh > 60) continue;
    const { m } = minIn(before(i, 30), i);
    out.junctions.push({ t: points[i].t, lat: j.lat, lon: j.lon, kmh: Math.round(points[i].kmh), minKmh: Math.round(m), approachKmh: Math.round(points[before(i, 60)].kmh), limit: lim });
  }
  for (const k of ['crossings', 'bumps', 'signals', 'signs', 'junctions']) out[k].sort((x, y) => x.t - y.t);
  out.junctions = out.junctions.filter((g, k, arr) => !k || g.t - arr[k - 1].t > 4);
  // NVDB har ofte ett gangfelt og én fartsdemper per kjøreretning: det samme stedet innen 4 s er ett
  out.crossings = out.crossings.filter((g, k, arr) => !k || g.t - arr[k - 1].t > 4);
  out.bumps = out.bumps.filter((g, k, arr) => !k || g.t - arr[k - 1].t > 4);
  // Samme lyskryss kan ha flere signalstrekninger: slå sammen innen 15 s
  out.signals = out.signals.filter((g, k, arr) => !k || g.t - arr[k - 1].t > 15);
  return out;
}

/* Påkjøring til motorvei eller motortrafikkvei (1.1.0). motor: 0/1/2 per GPS-punkt (matchMotorway), limits: fartsgrensen
   per punkt. En påkjøring er der bilen kommer inn på motorveien etter minst 20 s utenfor (og ikke i starten av turen).
   Farten som teller, er den høyeste de første 400 m: akselerasjonsfeltet. I kø (snitt under 50 km/t den neste
   kilometeren) vurderes den ikke. Ren funksjon. → [{ t, tTo, lat, lon, entryKmh, kmh, limit, type }] */
export function evaluateMerges(points, motor, limits = null) {
  const out = [];
  if (!Array.isArray(motor) || motor.length !== points.length || points.length < 2) return out;
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  for (let i = 1; i < points.length; i++) {
    if (!(motor[i] > 0) || motor[i - 1] > 0 || points[i].t - points[0].t < 20) continue;
    let outside = true;
    for (let k = i - 1; k >= 0 && points[i].t - points[k].t <= 20; k--) if (motor[k] > 0) { outside = false; break; }
    if (!outside) continue;
    let e = i, dist = 0;
    while (e < points.length - 1 && dist < 400) { dist += metres(points[e], points[e + 1]); e++; }
    let f = i, d2 = 0;
    const sp = [], lims = [];
    while (f < points.length - 1 && d2 < 1000) { d2 += metres(points[f], points[f + 1]); sp.push(points[f].kmh); if (limits && Number.isFinite(limits[f])) lims.push(limits[f]); f++; }
    if (d2 < 600 || med(sp) < 50) { i = f; continue; }   // turen sluttet, eller kø
    let max = 0;
    for (let q = i; q <= e; q++) max = Math.max(max, points[q].kmh);
    out.push({ t: points[i].t, tTo: points[e].t, lat: points[i].lat, lon: points[i].lon, entryKmh: Math.round(points[i].kmh), kmh: Math.round(max),
      limit: lims.length ? med(lims) : null, type: motor[i] === 2 ? 'motortrafikkvei' : 'motorvei' });
    i = f;
  }
  return out;
}

/* Henter det som er slått på og mangler, og returnerer et enrich-objekt som lagres på turen. */
export const ROAD_V = 5;   // 5 (1.1.0): kryss uten skilt
export const LIMITS_V = 4;   // v0.9.9: fartsgrense langs kjøreretningen, korte hopp glattet; v3 (0.22.2): aldri gater på tvers; v4 (0.26.5): ikke lånt fra en annen veg
export const MOTOR_V = 1;    // 0.18.0: motorvei og motortrafikkvei fra NVDB
/* Bare motorveiene, for eldre turer som mangler dem (kjøreloggen henter dem i bakgrunnen) */
export async function enrichMotorway(r, existing, signal) {
  const enrich = { version: 1, ...(existing || {}) };
  enrich.motor = matchMotorway(r.points, await fetchMotorwaySegments(r.points, signal));
  enrich.motorV = MOTOR_V;
  return enrich;
}
export async function enrichDrive(r, marks, wants, existing, onProgress = () => {}) {
  const enrich = { version: 1, ...(existing || {}) };
  if (wants.limits && (!enrich.limits || enrich.limitsV !== LIMITS_V)) {
    onProgress('Henter fartsgrenser fra Statens vegvesen …');
    const segs = await fetchSpeedLimitSegments(r.points, p => onProgress(`Henter fartsgrenser fra Statens vegvesen … ${Math.round(p * 100)} %`));
    enrich.limits = stabilizeLimits(r.points, smoothBlips(fillGaps(noBorrow(r.points, matchDetail(r.points, segs))))).map(v => (Number.isFinite(v) ? v : null));
    enrich.limitsV = LIMITS_V;
    enrich.limitsFetchedAt = new Date().toISOString();
    // Skiltene kameraet leste legges over på nytt av appen (0.13.9)
    delete enrich.limitsNvdb; delete enrich.limitsCam; delete enrich.camV;
  }
  if (wants.limits && (!enrich.road || enrich.road.v !== ROAD_V)) {   // v2: skilt, gangfelt, fartsdempere, lyskryss; v3: ATK; v5: kryss
    onProgress('Henter skilt og rundkjøringer fra Statens vegvesen …');
    enrich.road = await fetchRoadData(r.points);
    enrich.roadFetchedAt = new Date().toISOString();
  }
  if (wants.limits && (!Array.isArray(enrich.motor) || enrich.motorV !== MOTOR_V)) {
    onProgress('Henter motorveier fra Statens vegvesen …');
    enrich.motor = matchMotorway(r.points, await fetchMotorwaySegments(r.points));
    enrich.motorV = MOTOR_V;
  }
  if (wants.names && !enrich.names) {
    onProgress('Henter stedsnavn fra Kartverket …');
    const coords = [...r.events.map(e => ({ lat: e.lat, lon: e.lon })), ...(marks || []).map(m => ({ lat: m.lat, lon: m.lon })).filter(c => Number.isFinite(c.lat))];
    const names = await fetchPlaceNames(coords);
    enrich.names = { events: {}, marks: {} };
    r.events.forEach((e, i) => { if (names[i]) enrich.names.events[e.n] = names[i]; });
    (marks || []).filter(m => Number.isFinite(m.lat)).forEach((m, i) => { if (names[r.events.length + i]) enrich.names.marks[m.i] = names[r.events.length + i]; });
    enrich.namesFetchedAt = new Date().toISOString();
  }
  return enrich;
}
