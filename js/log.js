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

/* motor (0.18.0): 1/2 = motorvei/motortrafikkvei etter Statens vegvesen, 0 = ikke, undefined = ukjent (ikke hentet).
   Når det er kjent, avgjør det motorvei: E6 rundt Trondheim har mye 80 km/t, og vanlig vei kan ha 90. */
export function roadClass(limit, maxNearbyKmh, motor) {
  if (motor === 1 || motor === 2) return 'motor';
  const known = motor === 0;
  if (Number.isFinite(limit)) return limit <= 50 ? 'by' : limit <= 80 || known ? 'land' : 'motor';
  if (!Number.isFinite(maxNearbyKmh)) return 'by';
  return maxNearbyKmh <= 55 ? 'by' : maxNearbyKmh <= 85 || known ? 'land' : 'motor';
}

export const ROAD_LABEL = { by: 'By og tettsted', land: 'Landevei', motor: 'Motorvei og motortrafikkvei' };
export const LIGHT_LABEL = { day: 'Dagslys', twilight: 'Skumring', dark: 'Mørke' };

/* r: analyseresultat (points med t relativt til start), recStartMs: når opptaket startet (ms),
   limits: fartsgrense per punkt eller null. motor: motorvei per punkt (1/2/0) eller null (0.18.0). */
export const STILL_MAX = 300;   // sekunder stans som teller i loggen
export function driveLog(r, recStartMs, limits = null, motor = null) {
  const sec = { by: 0, land: 0, motor: 0 }, km = { by: 0, land: 0, motor: 0 };
  const light = { day: 0, twilight: 0, dark: 0 }, lightKm = { day: 0, twilight: 0, dark: 0 };
  const pts = r.points;
  const t0 = r.t0 || 0;
  let fromLimits = 0, still = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (!(dt > 0)) continue;
    const dist = haversine(pts[i - 1], pts[i]) / 1000;
    // Stillestående (0.18.3): kø og rødt lys er kjøring, men en parkert bil med opptaket på er ikke øving. De første
    // 5 minuttene av en stans teller, resten ikke (før telte 30 min på en parkeringsplass som 30 min øving).
    still = pts[i].kmh < 3 && pts[i - 1].kmh < 3 ? still + dt : 0;
    if (still > STILL_MAX) continue;
    // Hull i GPS-en (0.18.0): i tunneler mister telefonen posisjonen, og før forsvant den tiden fra loggen. Hull på
    // opptil 5 min telles når farten mellom punktene er mulig (5–130 km/t); ellers sto bilen, eller GPS-en hoppet.
    if (dt >= 10 && !(dt <= 300 && dist / (dt / 3600) >= 5 && dist / (dt / 3600) <= 130)) continue;
    let mx = 0;
    for (let k = i; k >= 0 && pts[i].t - pts[k].t <= 30; k--) mx = Math.max(mx, pts[k].kmh);
    for (let k = i; k < pts.length && pts[k].t - pts[i].t <= 30; k++) mx = Math.max(mx, pts[k].kmh);
    const lim = limits && Number.isFinite(limits[i]) ? limits[i] : NaN;
    if (Number.isFinite(lim)) fromLimits++;
    const rc = roadClass(lim, mx, motor ? motor[i] : undefined);
    sec[rc] += dt; km[rc] += dist;
    const when = new Date(recStartMs + (t0 + pts[i].t) * 1000);
    const lc = lightClass(sunAltitude(when, pts[i].lat, pts[i].lon));
    light[lc] += dt; lightKm[lc] += dist;
  }
  return { sec, km, light, lightKm, total: { sec: sec.by + sec.land + sec.motor, km: km.by + km.land + km.motor }, roadSource: motor ? 'motorvei' : fromLimits > pts.length / 2 ? 'nvdb' : 'fart' };
}

export function sumLogs(logs) {
  const z = () => ({ by: 0, land: 0, motor: 0 }), zl = () => ({ day: 0, twilight: 0, dark: 0 });
  const out = { sec: z(), km: z(), light: zl(), lightKm: zl(), surface: { dry: 0, wet: 0, snow: 0, ice: 0, unknown: 0 }, total: { sec: 0, km: 0 }, count: logs.length };
  for (const l of logs) {
    for (const k of ['by', 'land', 'motor']) { out.sec[k] += l.sec[k]; out.km[k] += l.km[k]; }
    for (const k of ['day', 'twilight', 'dark']) { out.light[k] += l.light[k]; out.lightKm[k] += l.lightKm[k]; }
    if (l.surface) for (const k of Object.keys(out.surface)) out.surface[k] += l.surface[k] || 0;   // føre (0.12.0)
    out.total.sec += l.total.sec; out.total.km += l.total.km;
  }
  return out;
}

/* Kjørelogg til forsikringen (0.24.0). Flere forsikringsselskap gir høyere startbonus etter 2 000 km øvelseskjøring,
   og noen godtar et skjermbilde av kilometerne fra en annen app. trips: [{ at: ISO-tid, km, sec }]. Eldste tur først;
   turer uten tid eller kilometer telles ikke. */
export const INSURANCE_KM = 2000;
export function insuranceLog(trips = [], target = INSURANCE_KM) {
  const list = trips.filter(t => t && Number.isFinite(Date.parse(t.at)) && t.km > 0)
    .map(t => ({ at: t.at, km: t.km, sec: Math.max(0, t.sec || 0) }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const km = list.reduce((s, t) => s + t.km, 0), sec = list.reduce((s, t) => s + t.sec, 0);
  const days = new Set(list.map(t => { const d = new Date(t.at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })).size;
  return { trips: list, km, sec, count: list.length, days, first: list.length ? list[0].at : '', last: list.length ? list[list.length - 1].at : '',
    target, left: Math.max(0, target - Math.floor(km)), done: km >= target, share: Math.min(1, km / target) };   // hele km rundes ned: aldri mer enn kjørt
}

function haversine(a, b) {
  const R = 6371000, dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
