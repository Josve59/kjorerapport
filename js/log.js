/* Kjørelogg for øvelseskjøring: tid og kilometer fordelt på veitype og lysforhold. Ingen nett. */

const RAD = Math.PI / 180;

/* Solhøyde i grader (forenklet NOAA-modell, nøyaktig til rundt 1° – nok til lys/skumring/mørke). */
export function sunAltitude(date, lat, lon) {
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = ((357.529 + 0.98560028 * d) % 360) * RAD;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = ((gmst + lon / 15) * 15 - ra) * RAD;
  const alt = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(H));
  return alt / RAD;
}

export function lightClass(alt) {
  if (alt < -6) return 'dark';
  if (alt < 0) return 'twilight';
  return 'day';
}

export function roadClass(limit, maxNearbyKmh) {
  if (Number.isFinite(limit)) return limit <= 50 ? 'by' : limit <= 80 ? 'land' : 'motor';
  if (!Number.isFinite(maxNearbyKmh)) return 'by';
  return maxNearbyKmh <= 55 ? 'by' : maxNearbyKmh <= 85 ? 'land' : 'motor';
}

export const ROAD_LABEL = { by: 'By og tettsted', land: 'Landevei', motor: 'Motorvei og motortrafikkvei' };
export const LIGHT_LABEL = { day: 'Dagslys', twilight: 'Skumring', dark: 'Mørke' };

/* r: analyseresultat (points med t relativt til start), recStartMs: når opptaket startet (ms),
   limits: fartsgrense per punkt eller null. */
export function driveLog(r, recStartMs, limits = null) {
  const sec = { by: 0, land: 0, motor: 0 }, km = { by: 0, land: 0, motor: 0 };
  const light = { day: 0, twilight: 0, dark: 0 }, lightKm = { day: 0, twilight: 0, dark: 0 };
  const pts = r.points;
  const t0 = r.t0 || 0;
  let fromLimits = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (!(dt > 0 && dt < 10)) continue;
    const dist = haversine(pts[i - 1], pts[i]) / 1000;
    let mx = 0;
    for (let k = i; k >= 0 && pts[i].t - pts[k].t <= 30; k--) mx = Math.max(mx, pts[k].kmh);
    for (let k = i; k < pts.length && pts[k].t - pts[i].t <= 30; k++) mx = Math.max(mx, pts[k].kmh);
    const lim = limits && Number.isFinite(limits[i]) ? limits[i] : NaN;
    if (Number.isFinite(lim)) fromLimits++;
    const rc = roadClass(lim, mx);
    sec[rc] += dt; km[rc] += dist;
    const when = new Date(recStartMs + (t0 + pts[i].t) * 1000);
    const lc = lightClass(sunAltitude(when, pts[i].lat, pts[i].lon));
    light[lc] += dt; lightKm[lc] += dist;
  }
  return { sec, km, light, lightKm, total: { sec: sec.by + sec.land + sec.motor, km: km.by + km.land + km.motor }, roadSource: fromLimits > pts.length / 2 ? 'nvdb' : 'fart' };
}

export function sumLogs(logs) {
  const z = () => ({ by: 0, land: 0, motor: 0 }), zl = () => ({ day: 0, twilight: 0, dark: 0 });
  const out = { sec: z(), km: z(), light: zl(), lightKm: zl(), total: { sec: 0, km: 0 }, count: logs.length };
  for (const l of logs) {
    for (const k of ['by', 'land', 'motor']) { out.sec[k] += l.sec[k]; out.km[k] += l.km[k]; }
    for (const k of ['day', 'twilight', 'dark']) { out.light[k] += l.light[k]; out.lightKm[k] += l.lightKm[k]; }
    out.total.sec += l.total.sec; out.total.km += l.total.km;
  }
  return out;
}

function haversine(a, b) {
  const R = 6371000, dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
