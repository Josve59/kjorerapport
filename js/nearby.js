/* Øv i nærheten (1.1.0): steder rundt eleven for det appen sier mangler («Hva må du øve mer på?», readiness.js):
   rundkjøringer, kryss med vikeplikt og motorvei. Bare når noen trykker «Finn steder nær meg», og bare med
   «Fartsgrense og veidata» på: et område på rundt 6 × 6 km rundt telefonen sendes til Statens vegvesen (NVDB), uten
   navn. Veibeskrivelsen åpnes i Kart. Rene hjelpefunksjoner testes i Node. */

const NVDB_BASE = 'https://nvdbapiles.atlas.vegvesen.no/vegobjekter/api/v4/vegobjekter';
const CLIENT = 'Kjorerapport (kjorerapport.jo-9fc.workers.dev)';   // samme navn som i enrich.js
export const NEAR_BOX = { dLat: 0.03, dLon: 0.065 };   // rundt 3,3 km hver vei (lengdegradene er kortere i nord)

const DIRS = ['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest'];

/* Avstand (m) og retning («nordøst») fra a til b */
export function distDir(a, b) {
  const k = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
  const dx = (b.lon - a.lon) * k * 111320, dy = (b.lat - a.lat) * 110540;
  const deg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return { m: Math.hypot(dx, dy), dir: DIRS[Math.round(deg / 45) % 8] };
}

/* «1,2 km nordøst» / «400 m sør» */
export function distText(d) {
  const t = d.m < 950 ? `${Math.max(100, Math.round(d.m / 50) * 50)} m` : `${(Math.round(d.m / 100) / 10).toString().replace('.', ',')} km`;
  return `${t} ${d.dir}`;
}

/* De n nærmeste stedene, minst gap meter fra hverandre (et kryss har ofte flere skilt). items: [{ lat, lon, … }] */
export function nearestPlaces(here, items, n = 3, gap = 150) {
  const sorted = items.map(it => ({ ...it, ...distDir(here, it) })).sort((a, b) => a.m - b.m);
  const out = [];
  for (const it of sorted) {
    if (out.some(o => distDir(o, it).m < gap)) continue;
    out.push(it);
    if (out.length >= n) break;
  }
  return out;
}

/* «EV6 S76D1 m475-1081» → «E6», «RV706 …» → «Rv. 706», «FV6690 …» → «Fv. 6690» */
export function roadName(kortform) {
  const m = /^([ERFK])V\s?(\d+)/i.exec(String(kortform || ''));
  if (!m) return '';
  const k = m[1].toUpperCase();
  return k === 'E' ? `E${m[2]}` : k === 'R' ? `Rv. ${m[2]}` : k === 'F' ? `Fv. ${m[2]}` : '';
}

/* «Fv6690 Olav Tryggvasons gate X Kv Nedre Bakklandet» → «Olav Tryggvasons gate / Nedre Bakklandet» */
export function placeName(name) {
  return String(name || '').split(/\s+X\s+/).map(p => p.replace(/^(Ev|Rv|Fv|Kv|Pv)\s?\d*\s*/i, '').trim()).filter(Boolean).join(' / ');
}

/* Nærmeste punkt på en linje (motorveien) */
export function nearestOnLine(here, line) {
  let best = null;
  for (const p of line) { const d = distDir(here, p).m; if (!best || d < best.d) best = { lat: p.lat, lon: p.lon, d }; }
  return best;
}

/* Veibeskrivelse i Kart (iPhone) eller Google Maps (Android) */
export function mapsLink(p, android = false) {
  const ll = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  return android ? `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving` : `https://maps.apple.com/?daddr=${ll}&dirflg=d`;
}

const coordsOf = wkt => {
  const out = [];
  for (const m of String(wkt || '').matchAll(/\(([^()]+)\)/g)) for (const s of m[1].split(',')) {
    const p = s.trim().split(/\s+/).map(Number);
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) out.push({ lat: p[0], lon: p[1] });
  }
  return out;
};

async function nvdb(type, here, extra, signal) {
  const b = [here.lon - NEAR_BOX.dLon, here.lat - NEAR_BOX.dLat, here.lon + NEAR_BOX.dLon, here.lat + NEAR_BOX.dLat].map(v => v.toFixed(4)).join(',');
  const res = await fetch(`${NVDB_BASE}/${type}?kartutsnitt=${b}&srid=4326&antall=1000${extra}`, { headers: { Accept: 'application/json', 'X-Client': CLIENT }, signal });
  if (!res.ok) throw new Error(`Statens vegvesen svarte ${res.status}`);
  return (await res.json()).objekter || [];
}

/* Henter det som trengs. wants: ['rundkjøring', 'kryss', 'motorvei']. → { rundkjøring: [...], kryss: [...], motorvei: [...] }
   Posisjonen rundes til rundt 100 m før den sendes: et nabolag, ikke et hus. */
export async function fetchNearby(pos, wants, signal) {
  const here = { lat: Math.round(pos.lat * 1000) / 1000, lon: Math.round(pos.lon * 1000) / 1000 };
  const out = {};
  const jobs = [];
  if (wants.includes('rundkjøring')) jobs.push(nvdb(37, here, `&egenskap=${encodeURIComponent('1114=3136')}&inkluder=egenskaper,geometri`, signal).then(list => {
    const pts = list.map(o => { const c = coordsOf(o.geometri && o.geometri.wkt)[0]; const name = ((o.egenskaper || []).find(e => e.id === 1073) || {}).verdi; return c ? { ...c, name: placeName(name) } : null; }).filter(Boolean);
    out['rundkjøring'] = nearestPlaces(pos, pts, 3, 200);
  }));
  if (wants.includes('kryss')) jobs.push(nvdb(96, here, `&egenskap=${encodeURIComponent('5530=7642')}&inkluder=geometri`, signal).then(list => {
    out.kryss = nearestPlaces(pos, list.map(o => coordsOf(o.geometri && o.geometri.wkt)[0]).filter(Boolean), 3, 250);
  }));
  if (wants.includes('motorvei')) jobs.push(nvdb(595, here, '&inkluder=egenskaper,geometri,lokasjon', signal).then(list => {
    const pts = [];
    for (const o of list) {
      const p = nearestOnLine(pos, coordsOf(o.geometri && o.geometri.wkt));
      if (!p) continue;
      const ref = ((o.lokasjon && o.lokasjon.vegsystemreferanser) || [])[0];
      const kind = ((o.egenskaper || []).find(e => e.id === 5378) || {}).verdi;
      pts.push({ lat: p.lat, lon: p.lon, name: [roadName(ref && ref.kortform), kind === 'Motortrafikkveg' ? 'motortrafikkvei' : 'motorvei'].filter(Boolean).join(', ') });
    }
    out.motorvei = nearestPlaces(pos, pts, 2, 1500);
  }));
  await Promise.all(jobs);
  return out;
}
