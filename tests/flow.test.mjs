import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchShift } from '../kamera/js/flow.js';
import { createTracker } from '../kamera/js/track.js';

// Mørkt bilde med en «bil»: mørk kasse med to lyse baklys, flyttet (ox, oy) piksler (brøkdeler: myk kant)
function frame(W, H, ox, oy) {
  const g = new Uint8Array(W * H).fill(20);
  const blob = (cx, cy, r, v) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - cx, y - cy); if (d < r + 1) g[y * W + x] = Math.max(g[y * W + x], Math.round(v * Math.min(1, r + 1 - d))); } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x >= 100 + ox && x < 140 + ox && y >= 80 + oy && y < 108 + oy) g[y * W + x] = 60;
  blob(106 + ox, 94 + oy, 3, 250); blob(134 + ox, 94 + oy, 3, 250);
  return g;
}

test('bildesammenligning: finner hvor bilen flyttet seg, også brøkdeler av en piksel', () => {
  const W = 320, H = 240, a = frame(W, H, 0, 0);
  const box = { x: 100, y: 80, w: 40, h: 28 };
  const m = matchShift(a, frame(W, H, 4, -2), W, H, box);
  assert.ok(m && Math.abs(m.dx - 4) < 0.3 && Math.abs(m.dy + 2) < 0.3, JSON.stringify(m));
  const h = matchShift(a, frame(W, H, 2.5, 0), W, H, box);
  assert.ok(h && Math.abs(h.dx - 2.5) < 0.4, 'halv piksel ' + JSON.stringify(h));
  // Ensformig flate (ingen bil): ikke noe svar
  assert.equal(matchShift(new Uint8Array(W * H).fill(30), new Uint8Array(W * H).fill(30), W, H, box), null);
});

test('følging med bildemålinger: boksen følger bilen jevnt, sene svar fra modellen gir ikke hopp', () => {
  const tr = createTracker({ maxAge: 2000 });
  // Bil som beveger seg 0,1 px/ms. Modellen ser bildene ved 0 og 300 ms.
  tr.update([{ cls: 'car', score: 0.8, x: 100, y: 200, w: 60, h: 40 }], 0);
  tr.update([{ cls: 'car', score: 0.8, x: 130, y: 200, w: 60, h: 40 }], 300);
  // Bildemålinger hvert 125. ms: bilen bremser til 0,04 px/ms
  let t = 300, x = 130;
  for (let k = 0; k < 6; k++) { const t1 = t + 125; tr.shift(1, t, 0.04 * 125, 0, t1); x += 5; t = t1; }
  const p = tr.predict(t)[0];
  assert.ok(Math.abs(p.x - x) < 3, `fulgte bremsingen: ${p.x} mot ${x}`);
  // Svar fra modellen for bildet tatt 300 ms siden, 6 px til høyre for der sporet var da: retter bare en tredjedel
  const before = tr.predict(t)[0].x, past = tr.boxOf(1, t - 300);
  tr.update([{ cls: 'car', score: 0.8, x: past.x + 6, y: 200, w: 60, h: 40 }], t - 300);
  const after = tr.predict(t)[0].x;
  assert.ok(Math.abs(after - before - 2.1) < 0.5, `rettet ${after - before} px`);
});
