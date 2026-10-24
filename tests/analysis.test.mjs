import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeDemo, rating, SENSITIVITY } from '../js/analysis.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: fikk ${actual}, ventet ${expected} ± ${tol}`);

test('demoturen gir forventet distanse', () => {
  const r = analyze(makeDemo());
  near(r.stats.km, 4.2, 0.15, 'km');
});

test('demoturen gir nøyaktig tre hendelser med riktig tid og styrke', () => {
  const r = analyze(makeDemo());
  assert.equal(r.events.length, 3, 'antall hendelser');
  const [a, b, c] = r.events;
  assert.equal(a.kind, 'accel'); assert.equal(a.level, 'harsh');
  near(a.g, 0.40, 0.03, 'akselerasjon g'); near(a.t, 112, 4, 'akselerasjon tid (1:52)');
  assert.equal(b.kind, 'brake'); assert.equal(b.level, 'harsh');
  near(b.g, 0.47, 0.03, 'brems g'); near(b.t, 182, 4, 'brems tid (3:02)');
  assert.equal(c.kind, 'turn'); assert.equal(c.level, 'harsh');
  near(c.g, 0.49, 0.03, 'sving g'); near(c.t, 192, 4, 'sving tid (3:12)');
});

test('demoturen gir samlet poengsum rundt 82', () => {
  const r = analyze(makeDemo());
  near(r.overall, 82, 2, 'overall');
  assert.equal(r.source, 'gyro');
  assert.equal(rating(r.overall), 'Bra, med noen ting å jobbe med');
});

test('følsomhet skalerer tersklene', () => {
  const snill = analyze(makeDemo(), { factor: SENSITIVITY.snill.factor });
  const streng = analyze(makeDemo(), { factor: SENSITIVITY.streng.factor });
  const normal = analyze(makeDemo());
  assert.ok(snill.events.length <= normal.events.length, 'snill gir ikke flere hendelser');
  assert.ok(streng.events.length >= normal.events.length, 'streng gir ikke færre hendelser');
  assert.ok(snill.overall >= normal.overall && streng.overall <= normal.overall, 'poeng følger følsomhet');
});

test('GPS-fallback for svinger når gyrodata mangler', () => {
  const d = makeDemo();
  const r = analyze({ loc: d.loc, gyro: [], grav: [] });
  assert.equal(r.source, 'gps');
  assert.ok(r.events.some(e => e.kind === 'turn'), 'finner fortsatt svinger fra GPS-retning');
});

test('for få punkter gir en forståelig feil', () => {
  const d = makeDemo();
  assert.throws(() => analyze({ loc: d.loc.slice(0, 10), gyro: [], grav: [] }), /For få GPS-punkter/);
});
