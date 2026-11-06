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

/* 0.12.5: veikanter og ytre linjer tas ikke for feltet */
test('feltlinjer: overgang fra asfalt til lyst fortau er ingen feltlinje', () => {
  const w = 160, h = 120, g = road(w, h, [[38, 74]]);
  // Lyst fortau til høyre for en kant som går mot forsvinningspunktet
  for (let y = Math.floor(h * 0.5); y < h; y++) {
    const f = (y - h * 0.5) / (h * 0.45), xe = Math.round(86 + (127 - 86) * f);
    for (let x = xe; x < w; x++) g[y * w + x] = 190;
  }
  const r = detectLanes(g, w, h);
  assert.ok(r.left, 'venstre linje finnes');
  assert.equal(r.right, null, 'fortauskanten er ikke en feltlinje: ' + JSON.stringify(r.right));
});
test('feltlinjer: den innerste linjen velges, ikke en sterkere linje lenger ut', () => {
  const w = 160, h = 120;
  // Stiplet kantlinje i feltet, og en heltrukken lys linje lenger ut (rekkverk, kant av gang- og sykkelvei)
  const g = road(w, h, [[38, 74], [118, 84]], { dashed: true });
  const outer = road(w, h, [[156, 92]]);
  for (let i = 0; i < g.length; i++) if (outer[i] === 210) g[i] = 210;
  const r = detectLanes(g, w, h);
  assert.ok(r.right, 'høyre linje finnes');
  const want = 118 + (84 - 118) * (1 - (h * 0.92 - h * 0.5) / (h * 0.45));
  assert.ok(Math.abs(r.right.xBottom - want) < 4, `innerste linje: ${r.right.xBottom} mot ${want}`);
});

/* 0.12.6: linjene over tid */
import { createLaneTracker } from '../kamera/js/lanes.js';
test('feltlinjer over tid: ny linje vises etter to bilder, og står en stund når den faller ut', () => {
  const L = x => ({ xBottom: x, xTop: x + 30, yBottom: 100, yTop: 60 }), R = x => ({ xBottom: x, xTop: x - 30, yBottom: 100, yTop: 60 });
  const tr = createLaneTracker({ need: 2, hold: 3 }), w = 160;
  assert.equal(tr.step({ left: L(20), right: R(140), offset: 0.1 }, w).left, null, 'første bilde: ikke vist ennå');
  let o = tr.step({ left: L(21), right: R(139), offset: 0.1 }, w);
  assert.ok(o.left && o.right); assert.equal(o.offset, 0.1);
  o = tr.step({ left: null, right: R(139), offset: null }, w);
  assert.ok(o.left && o.left.held, 'venstre står selv om den ikke ble sett'); assert.equal(o.offset, null);
  o = tr.step({ left: L(120), right: R(139) }, w);   // én feilaktig linje langt unna
  assert.ok(o.left && Math.abs(o.left.xBottom - 21) < 1, 'et enkelt feiltreff flytter ikke linjen');
  for (let i = 0; i < 3; i++) o = tr.step({ left: null, right: R(139) }, w);
  assert.equal(o.left, null, 'borte etter en stund');
});
