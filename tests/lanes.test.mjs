import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanes, dashLine, rowMeans } from '../kamera/js/lanes.js';

/* Lager et gråtonebilde med vei, to feltlinjer og litt støy. Linjene går fra (xb, h·0.95) opp mot (xt, h·0.5). */
function road(w, h, lines, { dashed = false, noise = 12, seed = 3 } = {}) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = y < h * 0.45 ? 160 : 70 + rnd() * noise;
  for (const [xb, xt] of lines) {
    const yb = h * 0.95, yt = h * 0.5;
    for (let y = Math.floor(yt); y < yb; y++) {
      if (dashed && Math.floor(y / 8) % 2) continue;
      const f = (y - yt) / (yb - yt), xc = xt + (xb - xt) * f, half = 0.6 + 1.4 * f;
      for (let x = Math.round(xc - half); x <= Math.round(xc + half); x++) if (x >= 0 && x < w) g[y * w + x] = 210;
    }
  }
  return g;
}

test('feltlinjer: begge linjene finnes, og sideavviket stemmer', () => {
  const w = 160, h = 120;
  const r = detectLanes(road(w, h, [[38, 74], [127, 86]]), w, h);
  assert.ok(r.left && r.right, JSON.stringify(r));
  const xl = 38 + (74 - 38) * (1 - (h * 0.92 - h * 0.5) / (h * 0.45)), xr = 127 + (86 - 127) * (1 - (h * 0.92 - h * 0.5) / (h * 0.45));
  assert.ok(Math.abs(r.left.xBottom - xl) < 3 && Math.abs(r.right.xBottom - xr) < 3, `${r.left.xBottom} ${xl} ${r.right.xBottom} ${xr}`);
  const expected = ((w / 2) - (xl + xr) / 2) / (xr - xl) * 3.25;
  assert.ok(Math.abs(r.offset - expected) < 0.15, `${r.offset} vs ${expected}`);
});

test('feltlinjer: stiplet midtlinje og bil til høyre i feltet', () => {
  const w = 160, h = 120;
  const r = detectLanes(road(w, h, [[20, 66], [110, 80]], { dashed: true }), w, h);
  assert.ok(r.left && r.right);
  assert.ok(r.offset > 0.3, 'bilen ligger til høyre for midten: ' + r.offset);
});

test('feltlinjer: ingen linjer gir ingen treff', () => {
  const r = detectLanes(road(160, 120, []), 160, 120);
  assert.equal(r.left, null);
  assert.equal(r.right, null);
  assert.equal(r.offset, null);
});

test('feltlinjer: i mørket (linjer i lyset fra frontlyktene) finnes linjene etter kontraststrekk', () => {
  const w = 160, h = 120;
  const day = road(w, h, [[38, 74], [127, 86]]);
  const dark = day.map(v => Math.round(v * 0.3));   // asfalt ~22, linjer ~63: under dagsterskelen på 90
  const r = detectLanes(dark, w, h);
  assert.ok(r.night && r.left && r.right, JSON.stringify({ night: r.night, l: !!r.left, r: !!r.right }));
  const d = detectLanes(day, w, h);
  assert.ok(Math.abs(r.offset - d.offset) < 0.15, `natt ${r.offset} dag ${d.offset}`);
  assert.equal(detectLanes(new Uint8Array(w * h).fill(8), w, h).left, null, 'helt svart bilde: ingen linjer');
});

test('dashbordkant: øverste tydelige overgang fra vei til mørkt dashbord fra 60 % og ned', () => {
  // Stående bilde: himmel mørk (natt), vei lys til 72 %, dashbord mørkt, lys list ved 90 %, mørkt under
  const h = 200, row = y => (y < 0.35 * h ? 20 : y < 0.72 * h ? 140 : y < 0.89 * h ? 30 : y < 0.91 * h ? 120 : 15);
  const rm = Float32Array.from({ length: h }, (_, y) => row(y));
  const d = dashLine(rm);
  assert.ok(Math.abs(d - 0.72) < 0.02, 'kant ' + d);
  // Dagslys: lys himmel over mørkere landskap (horisont ved 50 %) og dashbord ved 87 %
  const day = Float32Array.from({ length: h }, (_, y) => (y < 0.5 * h ? 200 : y < 0.87 * h ? 110 : 25));
  assert.ok(Math.abs(dashLine(day) - 0.87) < 0.02, 'dag ' + dashLine(day));
  assert.equal(dashLine(new Float32Array(h).fill(90)), null, 'ingen kant');
  const g = new Uint8Array(4 * 3).fill(10); g[4] = 50;
  assert.equal(rowMeans(g, 4, 3)[1], 20);
});
