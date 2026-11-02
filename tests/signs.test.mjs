import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSigns, findRings, redMask, classify, signTracker, createCamLimit } from '../kamera/js/signs.js';
import { TEMPLATES } from '../kamera/js/sign-tpl.js';

// Skilt tegnet i testlaben (64×64, RGBA) med Arial, som ikke er blant malene
const fx = JSON.parse(readFileSync(new URL('./fixtures/signs.json', import.meta.url), 'utf8'));
const rgba = k => Uint8ClampedArray.from(Buffer.from(fx[k], 'base64'));

test('fartsskilt: vanlige og digitale skilt leses riktig', () => {
  assert.deepEqual(readSigns(rgba('white80'), 64, 64).map(r => r.limit), [80]);
  assert.deepEqual(readSigns(rgba('white110'), 64, 64).map(r => r.limit), [110]);
  assert.deepEqual(readSigns(rgba('led60'), 64, 64).map(r => r.limit), [60], 'digitalt skilt (lysdioder)');
});

test('fartsskilt: røde ringer finnes, fylte røde flekker (baklys) ikke', () => {
  const W = 80, H = 60, img = new Uint8ClampedArray(W * H * 4).fill(60);
  const paint = (cx, cy, r0, r1) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - cx, y - cy); if (d >= r0 && d <= r1) { const i = (y * W + x) * 4; img[i] = 210; img[i + 1] = 20; img[i + 2] = 25; } } };
  paint(20, 30, 10, 14);   // ring
  paint(60, 30, 0, 9);     // fylt flekk
  const rings = findRings(redMask(img, W, H, 2));
  assert.equal(rings.length, 1);
  assert.ok(Math.abs(rings[0].x * 2 + rings[0].w - 20) < 4);
});

test('fartsskilt: malene kjenner seg selv igjen', () => {
  for (const t of TEMPLATES.filter((_, i) => i % 29 === 0)) assert.equal(classify({ vec: t.vec, asp: t.asp }).limit, t.limit);
});

test('fartsskilt: godtas først etter tre like lesninger av samme skilt', () => {
  const tr = signTracker();
  const r = (limit, x, w = 30) => ({ limit, score: 0.8, box: { x, y: 100, w, h: w } });
  assert.equal(tr.update([r(80, 500)], 0), null);
  assert.equal(tr.update([r(80, 505, 32)], 250), null);
  const c = tr.update([r(80, 512, 35)], 500);
  assert.equal(c && c.limit, 80);
  assert.equal(tr.update([r(80, 520, 38)], 750), null, 'bare én gang per skilt');
  // Uenige lesninger: ikke godtatt
  const t2 = signTracker();
  [60, 80, 90, 60].forEach((l, i) => assert.equal(t2.update([r(l, 300 + i * 4)], i * 250), null));
});

test('fartsgrense fra kameraet: gjelder til ny NVDB-strekning, nytt skilt eller 3 km', () => {
  const cl = createCamLimit();
  assert.equal(cl.current(0, 80), null);
  cl.sign(60, 1000, 80);   // digitalt skilt viser 60 der NVDB sier 80
  assert.deepEqual(cl.current(1500, 80), { limit: 60, nvdb: 80, agree: false, sinceM: 500 });
  assert.equal(cl.current(1100, 90).limit, 60, 'NVDB endrer seg rett ved skiltet: skiltet gjelder');
  assert.equal(cl.current(1300, 90), null, 'ny NVDB-strekning: skiltet gjelder ikke lenger');
  cl.sign(70, 2000, 80);
  assert.equal(cl.current(4900, 80).limit, 70);
  assert.equal(cl.current(5100, 80), null, 'etter 3 km');
});
