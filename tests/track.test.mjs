import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTracker } from '../kamera/js/track.js';

test('følging: boksen flyttes dit bilen trolig er mellom svarene, og tar igjen forsinkelsen', () => {
  const tr = createTracker({ maxAge: 5000 });
  // En bil som flytter seg 0,1 px/ms mot høyre og vokser 0,02 px/ms (nærmer seg). Svar hvert 300. ms.
  for (let k = 0; k <= 3; k++) { const t = k * 300; tr.update([{ cls: 'car', score: 0.8, x: 100 + 0.1 * t, y: 200, w: 60 + 0.02 * t, h: 40 }], t); }
  const p = tr.predict(1100);   // 200 ms etter siste svar
  assert.equal(p.length, 1);
  assert.ok(Math.abs(p[0].x - (100 + 0.1 * 1100)) < 1, 'x ' + p[0].x);
  assert.ok(Math.abs(p[0].w - (60 + 0.02 * 1100)) < 1, 'w ' + p[0].w);
  // Høyst 0,5 s fram
  assert.ok(Math.abs(tr.predict(2000)[0].x - (100 + 0.1 * 1400)) < 1);
});

test('følging: enkeltbilder med feil telles ikke, gamle spor forsvinner, folk og biler blandes ikke', () => {
  const tr = createTracker({ maxAge: 1000 });
  tr.update([{ cls: 'car', score: 0.6, x: 10, y: 10, w: 50, h: 40 }], 0);
  assert.equal(tr.predict(100).length, 0, 'sett én gang: ikke med ennå');
  tr.update([{ cls: 'car', score: 0.6, x: 12, y: 10, w: 50, h: 40 }, { cls: 'person', score: 0.7, x: 12, y: 10, w: 20, h: 50 }], 300);
  const p = tr.predict(400);
  assert.equal(p.length, 1); assert.equal(p[0].cls, 'car');
  assert.equal(tr.predict(1500).length, 0, 'borte etter 1 s uten svar');
});

test('følging: samme bil to ganger blir ett spor', () => {
  const tr = createTracker();
  for (let k = 0; k < 3; k++) tr.update([{ cls: 'car', score: 0.42, x: 6, y: 500, w: 496, h: 300 }, { cls: 'car', score: 0.41, x: 3, y: 502, w: 492, h: 298 }], k * 300);
  assert.equal(tr.predict(700).length, 1);
  // To spor som har glidd over hverandre slås sammen
  const t2 = createTracker();
  t2.update([{ cls: 'car', score: 0.8, x: 100, y: 100, w: 80, h: 60 }, { cls: 'car', score: 0.8, x: 200, y: 100, w: 80, h: 60 }], 0);
  t2.update([{ cls: 'car', score: 0.8, x: 100, y: 100, w: 80, h: 60 }, { cls: 'car', score: 0.8, x: 160, y: 100, w: 80, h: 60 }], 300);
  t2.update([{ cls: 'car', score: 0.8, x: 100, y: 100, w: 80, h: 60 }], 600);
  t2.shift(2, 600, -20, 0, 700);   // spor 2 glir over på spor 1
  t2.update([{ cls: 'car', score: 0.8, x: 100, y: 100, w: 80, h: 60 }], 700);
  assert.equal(t2.size, 1);
});

test('følging: usikre svar holder liv i en bil som følges, men starter ingen ny; bildet holder den i inntil 2 s', () => {
  const tr = createTracker();
  tr.update([{ cls: 'car', score: 0.3, x: 10, y: 10, w: 50, h: 40 }], 0, { minNew: 0.4 });
  assert.equal(tr.size, 0, 'usikker ny bil: ikke fulgt');
  tr.update([{ cls: 'car', score: 0.6, x: 10, y: 10, w: 50, h: 40 }], 0, { minNew: 0.4 });
  tr.update([{ cls: 'car', score: 0.3, x: 12, y: 10, w: 50, h: 40 }], 300, { minNew: 0.4 });
  assert.equal(tr.predict(400).length, 1, 'usikkert svar på kjent bil teller');
  // Ingen svar fra modellen, men bildet finner bilen hvert 125. ms: lever til 2 s etter siste svar
  for (let t = 425; t <= 2300; t += 125) tr.shift(1, t - 125, 0, 0, t);
  assert.equal(tr.predict(2050).length, 1);
  assert.equal(tr.predict(2400).length, 0);
});

test('følging: klassen følger flertallet, så en bil ikke blinker til buss (0.13.3)', () => {
  const tr = createTracker();
  const seq = ['car', 'car', 'bus', 'car', 'truck', 'car', 'bus', 'car'];
  seq.forEach((cls, k) => tr.update([{ cls, score: cls === 'car' ? 0.7 : 0.6, x: 300 + k, y: 400, w: 80, h: 60 }], k * 120));
  const p = tr.predict(seq.length * 120);
  assert.equal(p.length, 1); assert.equal(p[0].cls, 'car');
  // En ekte buss som en gang ses som lastebil, forblir buss; skifter svarene for godt, skifter klassen etter hvert
  const b = createTracker();
  ['bus', 'bus', 'truck', 'bus'].forEach((cls, k) => b.update([{ cls, score: 0.8, x: 300, y: 400, w: 160, h: 120 }], k * 120));
  assert.equal(b.predict(480)[0].cls, 'bus');
  for (let k = 4; k < 12; k++) b.update([{ cls: 'truck', score: 0.8, x: 300, y: 400, w: 160, h: 120 }], k * 120);
  assert.equal(b.predict(12 * 120)[0].cls, 'truck');
});
