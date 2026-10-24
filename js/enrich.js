/* v3.1 – valgfrie nettjenester etter turen:
   - fartsgrenser fra Statens vegvesen (NVDB API v4, vegobjekttype 105)
   - stedsnavn (gatenavn) fra Kartverket (adresse-punktsøk)
   Alt her er av som standard og slås på i innstillinger. Resultatet lagres på turen,
   så rapporten viser det også uten nett senere. */

const NVDB = 'https://nvdbapiles.atlas.vegvesen.no/vegobjekter/api/v4/vegobjekter/105';
const KARTVERKET = 'https://ws.geonorge.no/adresser/v1/punktsok';
const CLIENT = 'Kjorerapport PWA (github.com/Josve59/kjorerapport)';
const MATCH_M = 25;            // maks avstand fra GPS-punkt til fartsgrensestrekning
const CHUNK_M = 1500;          // rutebiter per NVDB-kall
const PAD_DEG = 0.0008;        // ca. 60–90 m utvidelse av utsnittet
const MAX_CHUNKS = 30;

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

/* Henter fartsgrensestrekninger for alle utsnitt. Returnerer [{limit, pts}]. */
export async function fetchSpeedLimitSegments(points, onProgress = () => {}, signal) {
  const boxes = mergeBoxes(routeChunks(points));
  if (boxes.length > MAX_CHUNKS) throw new Error('Turen er for lang til å hente fartsgrenser i ett jafs (maks ca. 45 km).');
  const segments = [];
  let done = 0;
  for (const b of boxes) {
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
    done++;
    onProgress(done / boxes.length);
  }
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

/* Henter det som er slått på og mangler, og returnerer et enrich-objekt som lagres på turen. */
export async function enrichDrive(r, marks, wants, existing, onProgress = () => {}) {
  const enrich = { version: 1, ...(existing || {}) };
  if (wants.limits && !enrich.limits) {
    onProgress('Henter fartsgrenser fra Statens vegvesen …');
    const segs = await fetchSpeedLimitSegments(r.points, p => onProgress(`Henter fartsgrenser fra Statens vegvesen … ${Math.round(p * 100)} %`));
    enrich.limits = smoothBlips(fillGaps(matchLimits(r.points, segs))).map(v => (Number.isFinite(v) ? v : null));
    enrich.limitsFetchedAt = new Date().toISOString();
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
