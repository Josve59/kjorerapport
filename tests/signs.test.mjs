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

/* 0.13.9: skiltet gjelder fra der det står, tåler feil i kartet, og legges over kartets grenser i rapporten */
import { signAhead, overlayCamSigns } from '../kamera/js/signs.js';

test('fartsgrense fra kameraet: gjelder fra der skiltet står', () => {
  assert.equal(signAhead(30, 985), 25, '30 piksler bredt skilt er rundt 25 m unna');
  assert.equal(signAhead(0, 985), 0);
  const cl = createCamLimit();
  cl.sign(50, 1000, 60, 25);   // lest 25 m før skiltet, i 60-sonen
  assert.equal(cl.current(1010, 60), null, 'før skiltet gjelder fortsatt 60');
  assert.deepEqual(cl.pending, { limit: 50, d0: 1025 });
  assert.equal(cl.current(1026, 60).limit, 50, 'ved skiltet');
  assert.equal(cl.current(1100, 50).agree, true, 'kartet følger etter');
});

test('fartsgrense fra kameraet: et kort feiltreff i kartet tar ikke bort et midlertidig skilt', () => {
  const cl = createCamLimit();
  cl.sign(50, 0, 80);   // veiarbeid: 50 der kartet sier 80
  assert.equal(cl.current(400, 80).limit, 50);
  assert.equal(cl.current(420, 30).limit, 50, 'kartet treffer en kryssende gate');
  assert.equal(cl.current(480, 30).limit, 50, '60 m: fortsatt et feiltreff');
  assert.equal(cl.current(500, 80).limit, 50, 'tilbake på veien: skiltet gjelder');
  assert.equal(cl.current(900, 60).limit, 50, 'kartet skifter til 60 …');
  assert.equal(cl.current(1010, 60), null, '… og når det har stått i 100 m, er det en ny strekning');
});

test('fartsgrense fra kameraet: høyere enn kartet gjelder bare til kartet har hatt sjansen til å følge etter', () => {
  const up = createCamLimit();
  up.sign(80, 0, 60);   // feillesning eller skiltet til en annen vei
  assert.equal(up.current(200, 60).limit, 80);
  assert.equal(up.current(320, 60), null, 'kartet fulgte ikke etter på 300 m');
  const ok = createCamLimit();
  ok.sign(80, 0, 60);
  assert.equal(ok.current(60, 80).agree, true, 'kartet følger etter');
  assert.equal(ok.current(140, 80).limit, 80);
  assert.equal(ok.current(500, 80), null, 'kartet har tatt over med samme grense');
});

test('skilt i rapporten: kameraets skilt legges over kartets grenser', () => {
  // 100 punkter, ett per sekund og 20 m (72 km/t). Kartet sier 80 hele veien. Kameraet leser 50 ved punkt 20, 30 m unna
  const points = Array.from({ length: 100 }, (_, i) => ({ t: i, lat: 60 + i * 20 / 111195, lon: 10 }));
  const limits = points.map(() => 80);
  const o = overlayCamSigns(points, limits, [{ t: 20, limit: 50, ahead: 30 }, { t: 60, limit: 80, ahead: 30 }]);
  assert.equal(o.limits[20], 80, 'der skiltet ble lest gjelder fortsatt 80');
  assert.equal(o.limits[21], 80);
  assert.equal(o.limits[22], 50, 'fra skiltet (30 m lenger fram)');
  assert.equal(o.limits[60], 50);
  assert.equal(o.limits[62], 80, 'nytt skilt: veiarbeidet er slutt');
  assert.deepEqual(o.cam, [[22, 61, 50]]);
  assert.deepEqual(limits, points.map(() => 80), 'kartets liste endres ikke');
  assert.deepEqual(overlayCamSigns(points, limits, []).cam, []);
});

test('fartsskilt: skilt som ble lest, men ikke godtatt, meldes', () => {
  const tr = signTracker();
  const r = (limit, x, w = 30) => ({ limit, score: 0.8, box: { x, y: 100, w, h: w } });
  tr.update([r(50, 500)], 0);
  tr.update([r(50, 506, 33)], 250);
  assert.deepEqual(tr.takeMissed(), []);
  tr.update([], 1300);   // skiltet er ute av bildet
  assert.deepEqual(tr.takeMissed(), [{ limit: 50, reads: 2, share: 1, w: 33 }]);
  assert.deepEqual(tr.takeMissed(), [], 'meldes én gang');
});
