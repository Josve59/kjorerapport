// Sender modellenes punkter gjennom appens egen linjetilpasning (js/lanes.js, slik js/facecam.js kaller den) og
// sammenligner linjene med fasiten. node applevel.mjs fil.json [fasit.json]
import fs from 'fs';
import { fileURLToPath } from 'url';
const P = fileURLToPath(new URL('../../../js/', import.meta.url));
const { detectLanes, laneX } = await import(P + 'lanes.js');
const { focalPx } = await import(P + 'road.js');
const D = JSON.parse(fs.readFileSync(process.argv[2])), W = 240, H = 427, rb = D.rb;
const GT = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3])) : null;
const scaleRoad = (r, k) => { const o = []; for (let i = 0; i + 2 < r.length; i += 3) o.push([r[i] * k, r[i + 1] * k, r[i + 2] * k]); return o; };
function mlPoints(m, k) {   // som i js/facecam.js
  const road = scaleRoad(m.road, k), mm = W * 0.06, out = [];
  for (let i = 0; i + 1 < m.pts.length; i += 2) {
    const x = m.pts[i] * k, y = m.pts[i + 1] * k; let e = null, best = Infinity;
    for (const r of road) { const d = Math.abs(r[0] - y); if (d < best) { best = d; e = r; } }
    if (e && best < 6 && (x < e[1] - mm || x > e[2] + mm)) continue;
    out.push({ x, y });
  }
  return out;
}
const gray = new Uint8Array(W * H);
const DUMP = process.env.KJ_DUMP ? {} : null;   // linjene per bilde, til kontrollark (sheet_app.py)
// To oppsett: appens egne tall (horisonten antatt 0,25 over dashbordkanten) og comma-kameraets (0,176 over)
const bases = {
  app: { top: Math.max(0.25, rb - 0.2), bottom: rb - 0.02, horizon: Math.max(0.15, rb - 0.25), minInl: 0.15, maxBg: 230 },
  comma: { top: rb - 0.126, bottom: rb - 0.02, horizon: rb - 0.176, minInl: 0.15, maxBg: 230 },
};
for (const [bn, base] of Object.entries(bases)) {
  for (const sel of ['alle', 'mørke']) {
    for (const name of D.models) {
      const s = { n: 0, right: 0, wrong: 0, both: 0, none: 0, err: [] };
      D.frames.forEach((f, fi) => {
        if (sel === 'mørke' && f.lum >= 60) return;
        s.n++;
        const k = W / f.w, g = GT ? GT.frames[fi].gt : f.gt, rows = new Map();
        for (let i = 0; i + 1 < g.length; i += 2) { const y = Math.round(g[i + 1] * k); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(g[i] * k); }
        const b = detectLanes(gray, W, H, { ...base, curve: true, far: base.horizon + 0.04, kappa: 0, kappaWeight: 1, focal: focalPx(W, H), camH: 1.2, predict: true, points: mlPoints(f[name], k) });
        let ok = 0, seen = 0; const dump = [];
        for (const side of ['left', 'right']) {
          const L = b[side]; if (!L || L.predicted) continue;
          seen++;
          const ds = [];
          for (let y = Math.ceil(H * base.top); y <= Math.floor(H * base.bottom); y++) {
            const xs = rows.get(y); if (!xs) continue;
            const x = laneX(L, y); let d = Infinity; for (const gx of xs) d = Math.min(d, Math.abs(gx - x));
            if (d <= 12) ds.push(d);
          }
          ds.sort((a, c) => a - c);
          const good = ds.length >= 5 && ds[ds.length >> 1] <= 3;
          if (good) { ok++; s.right++; s.err.push(ds[ds.length >> 1]); } else s.wrong++;
          if (DUMP && sel === 'alle') { const xs = []; for (let y = Math.ceil(H * base.top); y <= Math.floor(H * base.bottom); y += 3) xs.push(+(laneX(L, y) / k).toFixed(1), +(y / k).toFixed(1)); dump.push({ side, good, xs }); }
        }
        if (ok === 2) s.both++; if (!seen) s.none++;
        if (DUMP && sel === 'alle') ((DUMP[f.name] ||= {})[bn] ||= {})[name] = dump;
      });
      const e = s.err.sort((a, c) => a - c);
      console.log(bn.padEnd(6), sel.padEnd(6), name.padEnd(8), `bilder ${s.n}  riktige linjer ${s.right}  feil linjer ${s.wrong}  begge riktige ${s.both}  ingen linje ${s.none}  feil på riktige (median) ${e.length ? e[e.length >> 1].toFixed(2) : '-'} px`);
    }
  }
}
if (DUMP) fs.writeFileSync(process.env.KJ_DUMP, JSON.stringify(DUMP));
