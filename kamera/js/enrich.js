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
const KARTVERKET = 'https://ws.geonorge.no/adresser/v1/punktsok';
const CLIENT = 'Kjorerapport PWA (github.com/Josve59/kjorerapport)';
const MATCH_M = 25;            // maks avstand fra GPS-punkt til fartsgrensestrekning
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
   segments: [{ limit, pts: [{lat,lon}] }]. Grov forhåndsfiltrering med boksen rundt strekningen. */
export function matchLimits(points, segments, maxM = MATCH_M) {
  const segs = segments.filter(s => Number.isFinite(s.limit) && s.pts.length > 1).map(s => {
    const lats = s.pts.map(p => p.lat), lons = s.pts.map(p => p.lon);
    return { ...s, minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
  });
  const dLat = maxM / 111320;
  return points.map(p => {
    const cos = Math.cos(p.lat * Math.PI / 180);
    const dLon = dLat / Math.max(cos, 0.1);
    let best = Infinity, limit = NaN;
    for (const s of segs) {
      if (p.lat < s.minLat - dLat || p.lat > s.maxLat + dLat || p.lon < s.minLon - dLon || p.lon > s.maxLon + dLon) continue;
      for (let i = 1; i < s.pts.length; i++) {
        const d = segDist(p, s.pts[i - 1], s.pts[i], cos);
        if (d < best) { best = d; limit = s.limit; }
      }
    }
    return best <= maxM ? limit : NaN;
  });
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
  const kept = episodes.filter(e => e.tTo - e.tFrom >= minSec || e.maxKmh - e.limit >= 10);
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

/* "POINT Z (lat lon z)" eller "POINT(lat lon)" → {lat, lon} (srid 4326 gir lat først). */
export function parsePoint(wkt) {
  const nums = String(wkt || '').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const lat = Number(nums[0]), lon = Number(nums[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/* Henter punktobjekter av én type langs ruten. */
async function fetchPoints(points, spec, withProps, signal) {
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
        // Punkt, eller midten av en linje (gangfelt og signalanlegg er linjer)
        const wkt = o.geometri ? o.geometri.wkt : '';
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

export async function fetchRoadData(points, signal) {
  const [stops, giveway, rb, signs, crossings, bumps, signals] = await Promise.all([
    fetchPoints(points, SIGN_STOP, false, signal),
    fetchPoints(points, SIGN_GIVEWAY, false, signal),
    fetchPoints(points, ROUNDABOUT, true, signal),
    fetchPoints(points, SIGNS, true, signal),
    fetchPoints(points, CROSSING, false, signal),
    fetchPoints(points, BUMP, true, signal),
    fetchPoints(points, SIGNAL, true, signal)
  ]);
  const r5 = v => Math.round(v * 1e5) / 1e5;
  const pt = p => ({ lat: r5(p.lat), lon: r5(p.lon) });
  return {
    v: 2,
    stops: stops.map(pt),
    giveway: giveway.map(pt),
    roundabouts: rb.map(p => ({ ...pt(p), d: Number(p.props[1791]) || 25, name: p.props[1073] || '' })),
    signs: nearRoute(points, signs.map(p => ({ ...pt(p), kind: signKind(p.props[5530]) })).filter(x => x.kind)),
    crossings: nearRoute(points, crossings.map(pt), 25),
    bumps: nearRoute(points, bumps.map(p => ({ ...pt(p), type: p.props[1156] || '' })), 20),
    // Signalanlegg: bare lyskryss og lysregulerte gangfelt (bruksområde 1273). Uten bruksområde tas bare punkter med;
    // linjer uten bruksområde er ofte kjørefeltsignaler over motorvegen.
    signals: nearRoute(points, signals.filter(p => ['Vegkryss', 'Gangfelt'].includes(p.props[1273]) || (!p.props[1273] && !p.line))
      .map(p => ({ ...pt(p), dir: Number.isFinite(p.dir) ? Math.round(p.dir) : null })), 60)
  };
}

/* Vurderer veidata mot ruten. points: [{t, lat, lon, kmh}], events: rapportens hendelser.
   - Stoppskilt: bare skilt bilen selv stoppet/bremset ned ved (laveste fart under 15 km/t innen ±40 m),
     ellers er det trolig skiltet til en sidevei. Helt stopp = under 3 km/t.
   - Vikeplikt: samme logikk med 30 km/t, bare til informasjon (om det var trafikk kan ikke appen vite).
   - Rundkjøringer: ruten innenfor diameter/2 + 15 m. */
export function evaluateRoad(points, road, events = []) {
  const out = { stops: [], giveway: [], roundabouts: [] };
  if (!road || points.length < 2) return out;
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + metres(points[i - 1], points[i]));
  const nearest = p => {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < points.length; i++) { const d = metres(points[i], p); if (d < bd) { bd = d; bi = i; } }
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
  for (const c of road.crossings || []) {
    const { i, d } = nearest(c);
    if (d > 15 || points[i].kmh < 5) continue;
    out.crossings.push({ t: points[i].t, lat: c.lat, lon: c.lon, kmh: Math.round(points[i].kmh), approachKmh: Math.round(points[before(i, 40)].kmh) });
  }
  for (const b of road.bumps || []) {
    const { i, d } = nearest(b);
    if (d > 10 || points[i].kmh < 3) continue;
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
  for (const k of ['crossings', 'bumps', 'signals', 'signs']) out[k].sort((x, y) => x.t - y.t);
  // NVDB har ofte ett gangfelt og én fartsdemper per kjøreretning: det samme stedet innen 4 s er ett
  out.crossings = out.crossings.filter((g, k, arr) => !k || g.t - arr[k - 1].t > 4);
  out.bumps = out.bumps.filter((g, k, arr) => !k || g.t - arr[k - 1].t > 4);
  // Samme lyskryss kan ha flere signalstrekninger: slå sammen innen 15 s
  out.signals = out.signals.filter((g, k, arr) => !k || g.t - arr[k - 1].t > 15);
  return out;
}

/* Henter det som er slått på og mangler, og returnerer et enrich-objekt som lagres på turen. */
export async function enrichDrive(r, marks, wants, existing, onProgress = () => {}) {
  const enrich = { version: 1, ...(existing || {}) };
  if (wants.limits && !enrich.limits) {
    onProgress('Henter fartsgrenser fra Statens vegvesen …');
    const segs = await fetchSpeedLimitSegments(r.points, p => onProgress(`Henter fartsgrenser fra Statens vegvesen … ${Math.round(p * 100)} %`));
    enrich.limits = smoothBlips(fillGaps(matchLimits(r.points, segs))).map(v => (Number.isFinite(v) ? v : null));
    enrich.limitsFetchedAt = new Date().toISOString();
  }
  if (wants.limits && (!enrich.road || enrich.road.v !== 2)) {   // v2: flere skilt, gangfelt, fartsdempere, lyskryss
    onProgress('Henter skilt og rundkjøringer fra Statens vegvesen …');
    enrich.road = await fetchRoadData(r.points);
    enrich.roadFetchedAt = new Date().toISOString();
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
