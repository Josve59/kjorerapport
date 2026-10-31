/* Aktiv fartsgrense under kjøring (v0.9.4). Henter fartsgrensestrekninger fra Statens vegvesen (NVDB) for et
   område rundt bilen (ca. 4,5 × 4,5 km), og finner strekningen bilen er på for hvert GPS-punkt. Nytt område
   hentes i bakgrunnen før bilen kommer til kanten. Krever nett og at «Veidata» er på.
   Verdien skifter først når to av de tre siste punktene er enige, så den ikke blinker i kryss.
   Det er NVDB sin fartsgrense, ikke skiltene: i Sverige og der NVDB mangler data vises «–». */
import { fetchLimitBox, matchLimits } from './enrich.js';

const HALF_LAT = 0.02, HALF_LON = 0.045;     // ca. 2,2 km hver vei (lengdegrad er kortere i nord)
const EDGE = 0.35;                            // ny henting når bilen er i ytterste 35 % av området

export function createLiveLimit({ fetchBox = fetchLimitBox, now = () => Date.now() } = {}) {
  let box = null, segs = [], loading = null, failedAt = -Infinity, current = null, status = 'venter';
  const recent = [];   // siste treff (fartsgrense eller null)
  const index = list => list.map(s => {
    const lats = s.pts.map(p => p.lat), lons = s.pts.map(p => p.lon);
    return { ...s, minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
  });
  const inner = (b, p) => p.lat > b.minLat + (b.maxLat - b.minLat) * EDGE / 2 && p.lat < b.maxLat - (b.maxLat - b.minLat) * EDGE / 2
    && p.lon > b.minLon + (b.maxLon - b.minLon) * EDGE / 2 && p.lon < b.maxLon - (b.maxLon - b.minLon) * EDGE / 2;
  const load = p => {
    if (loading || now() - failedAt < 30000) return;
    const b = { minLat: p.lat - HALF_LAT, maxLat: p.lat + HALF_LAT, minLon: p.lon - HALF_LON, maxLon: p.lon + HALF_LON };
    loading = fetchBox(b).then(list => { box = b; segs = index(list); status = 'ok'; })
      .catch(() => { failedAt = now(); status = 'feil'; })
      .finally(() => { loading = null; });
  };
  /* Nytt GPS-punkt {lat, lon}. Returnerer { limit (km/t eller null), status: 'venter' | 'ok' | 'feil' | 'ukjent' }. */
  const update = p => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return { limit: current, status };
    if (!box || !inner(box, p)) load(p);
    if (!box) return { limit: current, status };
    const d = 0.003;
    const near = segs.filter(s => p.lat > s.minLat - d && p.lat < s.maxLat + d && p.lon > s.minLon - 2 * d && p.lon < s.maxLon + 2 * d);
    const v = matchLimits([p], near)[0];
    recent.push(Number.isFinite(v) ? v : null);
    if (recent.length > 3) recent.shift();
    const counts = new Map();
    for (const x of recent) counts.set(x, (counts.get(x) || 0) + 1);
    for (const [x, n] of counts) if (n >= 2 || recent.length === 1) { current = x; break; }
    return { limit: current, status: current === null && status === 'ok' ? 'ukjent' : status };
  };
  return { update, get limit() { return current; } };
}
