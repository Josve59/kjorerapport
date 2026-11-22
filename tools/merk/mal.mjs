// Måler forslag mot eierens godkjente linjer: hvor mange av eierens linjer et forslag treffer (innen 10 px i snitt,
// over minst 40 % av lengden), hvor mange forslag som er riktige, hvor nær de ligger, og hvor mye av linjen de dekker.
//   node tools/merk/mal.mjs .local-test/veibilder/<økt> forslag-a.json [forslag-b.json …]
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2]); const merk = dir + '-merk';
let labels = fs.readdirSync(merk).filter(f => /^f\d{5}\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(merk, f), 'utf8'))).filter(e => e.status === 'ok');
// KJ_HOLD=5: bare bildene finetune_norge.py --hold 5 holdt utenfor (hvert 5. godkjente, i forslagenes rekkefølge)
if (process.env.KJ_HOLD) {
  const k = Number(process.env.KJ_HOLD), order = JSON.parse(fs.readFileSync(path.join(merk, 'forslag.json'), 'utf8')).frames.map(f => f.id);
  const ok = new Set(labels.map(e => e.id)), held = new Set(order.filter(id => ok.has(id)).filter((_, i) => i % k === k - 1));
  labels = labels.filter(e => held.has(e.id));
  console.log(`bare de ${labels.length} bildene som er holdt utenfor treningen`);
}
const xAt = (pts, y) => {   // x på en linje (punkter i vilkårlig rekkefølge) i høyde y, eller null utenfor
  const s = [...pts].sort((a, b) => a[1] - b[1]);
  if (y < s[0][1] || y > s[s.length - 1][1]) return null;
  for (let i = 1; i < s.length; i++) if (y <= s[i][1]) { const t = (y - s[i - 1][1]) / ((s[i][1] - s[i - 1][1]) || 1); return s[i - 1][0] + t * (s[i][0] - s[i - 1][0]); }
  return null;
};
const span = pts => { const ys = pts.map(p => p[1]); return [Math.min(...ys), Math.max(...ys)]; };
function compare(L, Q) {
  const [a0, a1] = span(L), [b0, b1] = span(Q); const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
  if (hi - lo < 8) return null;
  let s = 0, n = 0; for (let y = lo; y <= hi; y += 4) { const xa = xAt(L, y), xb = xAt(Q, y); if (xa === null || xb === null) continue; s += Math.abs(xa - xb); n++; }
  return n ? { d: s / n, cover: (hi - lo) / Math.max(1, a1 - a0) } : null;
}
for (const file of process.argv.slice(3)) {
  const F = JSON.parse(fs.readFileSync(path.join(merk, file), 'utf8')); const byId = new Map(F.frames.map(f => [f.id, f]));
  let nL = 0, nQ = 0, hitL = 0, hitQ = 0, dsum = 0, csum = 0;
  for (const e of labels) {
    const fr = byId.get(e.id); if (!fr) continue;
    // Det eieren så som forslag: de gamle forslagene etter Claudes gjennomgang, de nye som de er
    const Q = fr.lines.map(l => l.pts);
    nL += e.lines.length; nQ += Q.length;
    const used = new Set();
    for (const l of e.lines) {
      let best = null, bi = -1;
      Q.forEach((q, i) => { const c = compare(l.pts, q); if (c && c.cover >= 0.4 && c.d <= 10 && (!best || c.d < best.d)) { best = c; bi = i; } });
      if (best) { hitL++; dsum += best.d; csum += best.cover; used.add(bi); }
    }
    hitQ += used.size;
  }
  console.log(`${file.padEnd(20)} eierens linjer truffet ${hitL} av ${nL} · forslag riktige ${hitQ} av ${nQ} · avstand ${hitL ? (dsum / hitL).toFixed(1) : '-'} px · dekker ${hitL ? Math.round(100 * csum / hitL) : '-'} % av linjen`);
}
