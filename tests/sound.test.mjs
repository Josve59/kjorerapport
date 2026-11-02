import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAtkSounds } from '../js/sound.js';

test('lyd ved fotoboks: ding-dong ved varselet, tre pip 300 m før, raske pip ved for høy fart', () => {
  const s = createAtkSounds(), out = [];
  const boks = d => ({ kind: 'boks', d, key: 'p3' });
  let t = 0;
  for (const d of [950, 900, 850, 800, 600, 400, 300, 250, 200, 150, 100, 50]) out.push([d, s.step(boks(d), { kmh: 88, limit: 80, t: t++ })]);
  assert.equal(out[0][1], 'varsel', 'første varsel');
  assert.deepEqual(out.slice(1, 6).map(x => x[1]), [null, null, null, null, null], 'bare én gang');
  assert.equal(out[6][1], 'naer', '300 m før');
  // For fort: pip hvert 2. sekund
  assert.deepEqual(out.slice(7).map(x => x[1]), [null, 'fart', null, 'fart', null]);
  // Forbi: stille, og en ny boks varsles igjen
  assert.equal(s.step(null, { t: 20 }), null);
  assert.equal(s.step({ kind: 'boks', d: 900, key: 'p4' }, { kmh: 70, limit: 80, t: 21 }), 'varsel');
  // Innen grensen: ingen fartspip
  const s2 = createAtkSounds();
  const r = [800, 300, 200, 100].map((d, i) => s2.step(boks(d), { kmh: 79, limit: 80, t: i * 3 }));
  assert.deepEqual(r, ['varsel', 'naer', null, null]);
});

test('lyd ved strekningsmåling: start, pip ved for høyt snitt, og slutt', () => {
  const s = createAtkSounds();
  assert.equal(s.step({ kind: 'strekning-foran', d: 800, key: 's0' }, { t: 0 }), 'varsel');
  assert.equal(s.step({ kind: 'strekning-foran', d: 250, key: 's0' }, { t: 20 }), 'naer');
  assert.equal(s.step({ kind: 'strekning', avg: null, left: 5 }, { limit: 80, t: 30 }), 'varsel');
  const r = [];
  for (let i = 1; i <= 40; i++) r.push(s.step({ kind: 'strekning', avg: 84, left: 4 }, { limit: 80, t: 30 + i }));
  assert.equal(r.filter(Boolean).length, 2, 'for høyt snitt: pip hvert 15. s etter at snittet er stabilt');
  assert.equal(s.step({ kind: 'ferdig', avg: 82 }, { t: 80 }), 'ferdig');
  assert.equal(s.step({ kind: 'ferdig', avg: 82 }, { t: 81 }), null, 'bare én gang');
});
