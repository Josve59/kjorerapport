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
