// Første forslag til feltlinjer på veibildene (1.0.5), som eieren går gjennom på merkesiden (tools/merk/).
// Punktene feltmodellen lagret med hvert bilde (FrameLog.swift: midt på hver linjebit, annenhver rad) kjedes sammen
// nedenfra og opp til linjer, og strekene i stiplede linjer bindes sammen. Velger ut bilder med jevn avstand i kjørt
// tid (ikke når bilen står stille), så settet blir variert.
//   node tools/merk/forslag.mjs .local-test/veibilder/<økt> [antall=300]
// Skriver <økt>-merk/forslag.json. Etiketter som allerede er lagret, blir ikke rørt.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '');
const want = Number(process.argv[3] || 300);
if (!fs.existsSync(dir)) { console.error('Finner ikke økta:', dir); process.exit(1); }
const out = dir + '-merk';
fs.mkdirSync(out, { recursive: true });

/* Kjeder punktene [x, y, x, y, …] til linjer. Et punkt hører til en kjede når det ligger rett over enden av den
   (høyst 14 px opp) og der kjeden peker. Kjeder med minst 8 punkter og 24 px høyde blir linjer. */
export function chains(flat) {
  const pts = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
  pts.sort((a, b) => b.y - a.y || a.x - b.x);
  const open = [];
  for (const p of pts) {
    let best = null, bd = Infinity;
    for (const c of open) {
      const e = c.pts[c.pts.length - 1], dy = e.y - p.y;
      if (dy < 0.5 || dy > 14) continue;
      // Retningen fra de siste punktene (lineært), ellers rett opp
      const q = c.pts[Math.max(0, c.pts.length - 6)];
      const slope = c.pts.length > 3 && e.y !== q.y ? (e.x - q.x) / (e.y - q.y) : 0;
      const xp = e.x + slope * (p.y - e.y);
      const d = Math.abs(p.x - xp);
      if (d < Math.max(6, dy * 1.2) && d < bd) { bd = d; best = c; }
    }
    if (best) best.pts.push(p); else open.push({ pts: [p] });
  }
  return open.filter(c => c.pts.length >= 8 && c.pts[0].y - c.pts[c.pts.length - 1].y >= 24);
}

/* En kjede som linje med noder omtrent hver 30. piksel i høyden (median av x i hvert vindu) */
function polyline(c) {
  const ys = c.pts.map(p => p.y), y0 = Math.max(...ys), y1 = Math.min(...ys);
  const n = Math.max(2, Math.min(8, Math.round((y0 - y1) / 30) + 1)), nodes = [];
  for (let k = 0; k < n; k++) {
    const yc = y0 - (y0 - y1) * k / (n - 1), w = Math.max(8, (y0 - y1) / (n - 1) / 2);
    const xs = c.pts.filter(p => Math.abs(p.y - yc) <= w).map(p => p.x).sort((a, b) => a - b);
    if (xs.length) nodes.push([Math.round(xs[xs.length >> 1]), Math.round(yc)]);
  }
  return nodes;
}

/* Strekene i en stiplet linje: en linje som fortsetter der en annen slutter (forlenget), bindes sammen */
function joinDashes(lines) {
  lines.sort((a, b) => b[0][1] - a[0][1]);
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < lines.length; i++) for (let j = 0; j < lines.length; j++) {
      if (i === j) continue;
      const a = lines[i], b = lines[j];
      const top = a[a.length - 1], prev = a[Math.max(0, a.length - 2)], start = b[0];
      const gap = top[1] - start[1];
      if (gap < 0 || gap > 120) continue;
      const slope = top[1] !== prev[1] ? (top[0] - prev[0]) / (top[1] - prev[1]) : 0;
      const xp = top[0] + slope * (start[1] - top[1]);
      if (Math.abs(xp - start[0]) <= 10 + 0.1 * gap) { lines[i] = a.concat(b); lines.splice(j, 1); changed = true; break outer; }
    }
  }
  return lines;
}

const files = fs.readdirSync(dir).filter(f => /^f\d+\.json$/.test(f)).sort();
const frames = [];
for (const f of files) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (!m.lanes || !m.lanes.w || !fs.existsSync(path.join(dir, f.replace('.json', '.jpg')))) continue;
  frames.push({ id: f.replace('.json', ''), kmh: m.kmh ?? null, dark: !!m.dark, y0: m.lanes.y0, y1: m.lanes.y1, lanes: m.lanes });
}
// Utvalg: bilder der bilen kjører (fra 8 km/t), jevnt fordelt
const moving = frames.filter(f => !(f.kmh < 8));
const step = Math.max(1, moving.length / want);
const chosen = [];
for (let k = 0; k < moving.length && chosen.length < want; k += step) chosen.push(moving[Math.floor(k)]);
const res = { session: path.basename(dir), made: new Date().toISOString(), frames: [] };
let nLines = 0;
for (const f of chosen) {
  const lines = joinDashes(chains(f.lanes.pts || []).map(polyline).filter(l => l.length >= 2));
  nLines += lines.length;
  res.frames.push({ id: f.id, kmh: f.kmh, dark: f.dark, y0: f.y0, y1: f.y1, lines: lines.map((pts, i) => ({ id: i + 1, type: 'ukjent', pts })) });
}
fs.writeFileSync(path.join(out, 'forslag.json'), JSON.stringify(res));
console.log(`${res.frames.length} bilder valgt av ${frames.length} (${moving.length} i fart), ${nLines} forslag til linjer -> ${path.join(out, 'forslag.json')}`);
