import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeDemo } from '../js/analysis.js';

const near = (a, e, tol, msg) => assert.ok(Math.abs(a - e) <= tol, `${msg}: fikk ${a}, ventet ${e} ± ${tol}`);
const mounted = makeDemo(7, { yaw: 0.7, pitch: 0.35 });

test('rotert montering gir samme v1-resultat (gyro projisert på tyngdekraft)', () => {
  const r = analyze(mounted);
  assert.equal(r.events.length, 3);
  assert.equal(r.overall, 82);
  assert.equal(r.alongSource, 'gps');
});

test('v3-motoren bruker akselerometeret, finner de tre hendelsene og den brå bremsen GPS glatter bort', () => {
  const r = analyze(mounted, { engine: 'v3' });
  assert.equal(r.alongSource, 'acc', 'akselerometeret skal brukes');
  assert.ok(r.accFit.corr > 0.7, `korrelasjon ${r.accFit.corr}`);
  assert.equal(r.events.length, 4, 'fire hendelser');
  const [a, b, c, d] = r.events;
  assert.equal(a.kind, 'accel'); assert.equal(a.level, 'harsh'); near(a.t, 112, 4, 'akselerasjon tid');
  assert.equal(b.kind, 'brake'); assert.equal(b.level, 'harsh'); near(b.t, 182, 4, 'brems tid');
  assert.equal(c.kind, 'turn');
  // Demoen bremser med 2,9 m/s² (brå) ved ca. 5:06 – GPS med 1 Hz glatter den under terskelen, akselerometeret ser den.
  assert.equal(d.kind, 'brake'); assert.equal(d.level, 'brisk'); near(d.t, 306, 4, 'brå brems tid'); near(d.g, 0.30, 0.05, 'brå brems g');
  near(a.g, 0.40, 0.06, 'akselerasjon g'); near(b.g, 0.47, 0.06, 'brems g');
});

test('v3 faller tilbake til GPS uten akselerometerdata eller ved dårlig tilpasning', () => {
  const plain = analyze(makeDemo(), { engine: 'v3' });
  assert.equal(plain.alongSource, 'gps');
  const noisy = makeDemo(7, { yaw: 0.2, pitch: 0 });
  noisy.acc = noisy.acc.map(a => ({ t: a.t, x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: 0 }));
  const bad = analyze(noisy, { engine: 'v3' });
  assert.equal(bad.alongSource, 'gps', 'støy gir GPS-fallback');
  assert.equal(bad.events.length, 3);
});

test('poeng justert for distanse', () => {
  const r = analyze(makeDemo(), { perKm: true });
  assert.ok(Math.abs(r.kmFactor - 2) < 1e-9, '4,2 km → gulv 5 km → faktor 2');
  assert.equal(r.scores.brake, 60);
  assert.equal(r.scores.accel, 68);
  assert.equal(r.scores.turn, 68);
  assert.equal(r.scores.smooth, 82);
  assert.equal(r.overall, 69);
  const long = analyze(makeDemo());
  assert.equal(long.kmFactor, 1);
});
