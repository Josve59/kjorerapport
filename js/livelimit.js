/* Aktiv fartsgrense under kjøring (v0.9.4). Henter fartsgrensestrekninger fra Statens vegvesen (NVDB) for et
   område rundt bilen (ca. 4,5 × 4,5 km), og finner strekningen bilen er på for hvert GPS-punkt. Nytt område
   hentes i bakgrunnen før bilen kommer til kanten. Krever nett og at «Veidata» er på.
   Verdien skifter først når to av de tre siste punktene er enige, så den ikke blinker i kryss.
   Det er NVDB sin fartsgrense, ikke skiltene: i Sverige og der NVDB mangler data vises «–». */
import { fetchLimitBox, fetchAtkBox, fetchRoadInfo, matchLimits } from './enrich.js';
import { createLiveAtk } from './liveatk.js';
import { matchRoad, laneCount, laneWidthFrom } from './roadshape.js';

const HALF_LAT = 0.02, HALF_LON = 0.045;     // ca. 2,2 km hver vei (lengdegrad er kortere i nord)
const EDGE = 0.35;                            // ny henting når bilen er i ytterste 35 % av området

/* atk: også fotobokser og strekningsmåling for området (v0.9.7), via fetchAtk. */
export function createLiveLimit({ fetchBox = fetchLimitBox, fetchAtk = fetchAtkBox, atk = false, now = () => Date.now() } = {}) {
  const live = atk ? createLiveAtk() : null;
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
    loading = fetchBox(b).then(list => {
      box = b; segs = index(list); status = 'ok';
      if (live) fetchAtk(b).then(data => live.load(data, list)).catch(() => {});
    })
      .catch(() => { failedAt = now(); status = 'feil'; })
      .finally(() => { loading = null; });
  };
  /* Kjøreretningen (0.13.1): matchLimits velger strekninger langs kjøreretningen, men får ett punkt om gangen her og
     kunne ikke regne den ut selv. Kryssende gater og veier under ga derfor 80→30→80 i noen sekunder og falske
     fartsvarsler (turene 6. nov.). Retningen tas fra punktet minst 8 m bak, så GPS-støy i lav fart ikke snur den. */
  let back = null, heading = null;
  const metresTo = (a, b) => Math.hypot((b.lat - a.lat) * 111195, (b.lon - a.lon) * 111195 * Math.cos(a.lat * Math.PI / 180));
  /* Nytt GPS-punkt {lat, lon, acc (m, valgfri)}. Returnerer { limit (km/t eller null), status: 'venter' | 'ok' | 'feil' | 'ukjent' }. */
  const update = p => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return { limit: current, status };
    if (!back) back = p;
    else if (metresTo(back, p) >= 8) {
      heading = (Math.atan2((p.lon - back.lon) * Math.cos(back.lat * Math.PI / 180), p.lat - back.lat) * 180 / Math.PI + 360) % 360;
      back = p;
    }
    if (!box || !inner(box, p)) load(p);
    if (!box) return { limit: current, status };
    const d = 0.003;
    const near = segs.filter(s => p.lat > s.minLat - d && p.lat < s.maxLat + d && p.lon > s.minLon - 2 * d && p.lon < s.maxLon + 2 * d);
    const pt = { lat: p.lat, lon: p.lon, heading: Number.isFinite(p.heading) ? p.heading : heading };
    let v = matchLimits([pt], near)[0];
    // Veien bilen er på, holdes (0.13.1): så lenge en strekning med samme grense går langs kjøreretningen innenfor
    // GPS-ens usikkerhet, går ikke grensen ned eller blir ukjent. Dårlig GPS (30–50 m) dro ellers punktet bort fra
    // 80-veien og over på en 30-gate på tvers (turen 6. nov. kl. 15.35: 79 km/t «i 30-sone» i 12 s). En høyere
    // grense tas med en gang: holdt tilbake ga den varsel til føreren som gasset opp etter skiltet.
    if (Number.isFinite(current) && !(v >= current) && pt.heading !== null) {
      const radius = Math.max(25, Number.isFinite(p.acc) ? Math.min(p.acc, 50) : 0);
      if (matchLimits([pt], near.filter(s => s.limit === current), radius, { parallelOnly: true })[0] === current) v = current;
    }
    recent.push(Number.isFinite(v) ? v : null);
    if (recent.length > 3) recent.shift();
    const counts = new Map();
    for (const x of recent) counts.set(x, (counts.get(x) || 0) + 1);
    for (const [x, n] of counts) if (n >= 2 || recent.length === 1) { current = x; break; }
    return { limit: current, status: current === null && status === 'ok' ? 'ukjent' : status };
  };
  /* Fotoboks foran / strekningsmåling: p = {lat, lon, t (s), kmh}. { text, kind } eller null. */
  const atkStatus = p => (live ? live.update(p) : null);
  /* Fartsgrensestrekningene nær et punkt (veiens linje, til svingen foran i roadshape.js) */
  const near = (p, d = 0.002) => (!p || !box ? [] : segs.filter(s => p.lat > s.minLat - d && p.lat < s.maxLat + d && p.lon > s.minLon - 2 * d && p.lon < s.maxLon + 2 * d));
  return { update, atk: atkStatus, near, get limit() { return current; } };
}

/* Felt og feltbredde der bilen er (0.10.3): nytt lite område fra Statens vegvesen når bilen har kjørt 100 m (eller
   etter 60 s), aldri mer enn ett om gangen. update(p, heading) → { lanes: { ours, total }, laneWidth (m) } eller null. */
export function createLiveRoad({ fetchInfo = fetchRoadInfo, now = () => Date.now() } = {}) {
  let info = null, at = null, atTime = -Infinity, loading = null, failedAt = -Infinity;
  const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111195, (a.lon - b.lon) * 111195 * Math.cos(a.lat * Math.PI / 180));
  const update = (p, heading) => {
    if (!p || !Number.isFinite(p.lat)) return null;
    const stale = !at || dist(at, p) > 100 || now() - atTime > 60000;
    if (stale && !loading && now() - failedAt > 20000) {
      const q = { lat: p.lat, lon: p.lon };
      loading = fetchInfo(q).then(r => { info = r; at = q; atTime = now(); }).catch(() => { failedAt = now(); }).finally(() => { loading = null; });
    }
    if (!info) return null;
    const m = matchRoad(info.segs, p, heading);
    if (!m) return null;
    const lanes = laneCount(m.seg.lanes, m.forward);
    const w = matchRoad(info.widths, p, heading, { maxM: 20 });
    return { lanes, laneWidth: w ? laneWidthFrom(w.seg.width, m.seg.lanes) : null };
  };
  return { update, get loading() { return !!loading; } };
}
