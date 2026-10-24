import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveGravity, shouldStore, gyroFromRotationRate, linearFromEvent, gapFromHidden, haversine, LP_ALPHA } from '../js/sensors.js';

test('tyngdekraft = inkl. − uten når begge finnes', () => {
  const { grav } = deriveGravity({ x: 1, y: 2, z: -9 }, { x: 1, y: 0, z: 0.5 }, null);
  assert.deepEqual(grav, { x: 0, y: 2, z: -9.5 });
});

test('tyngdekraft lavpassfiltreres når acceleration mangler', () => {
  let state = null;
  let out = deriveGravity({ x: 0, y: 0, z: -9.81 }, null, state); state = out.state;
  assert.deepEqual(out.grav, { x: 0, y: 0, z: -9.81 });
  out = deriveGravity({ x: 10, y: 0, z: -9.81 }, null, state);
  assert.ok(Math.abs(out.grav.x - 10 * LP_ALPHA) < 1e-9, 'første steg er alpha·differansen');
  // Etter mange like prøver konvergerer filteret
  for (let i = 0; i < 400; i++) out = deriveGravity({ x: 10, y: 0, z: -9.81 }, null, out.state);
  assert.ok(Math.abs(out.grav.x - 10) < 0.01);
});

test('ingen data gir null uten å ødelegge tilstanden', () => {
  const out = deriveGravity({ x: null }, null, { x: 1, y: 2, z: 3 });
  assert.equal(out.grav, null);
  assert.deepEqual(out.state, { x: 1, y: 2, z: 3 });
});

test('nedsampling til 20 Hz', () => {
  assert.equal(shouldStore(0, -1), true, 'første prøve lagres');
  assert.equal(shouldStore(0.02, 0), false, '20 ms etter forrige: hopp over');
  assert.equal(shouldStore(0.05, 0), true, '50 ms etter forrige: lagre');
  let last = -1, stored = 0;
  for (let i = 0; i < 600; i++) { const t = i / 60; if (shouldStore(t, last)) { stored++; last = t; } }
  assert.ok(stored >= 195 && stored <= 205, `10 s ved 60 Hz ga ${stored} prøver, ventet ca. 200`);
});

test('gyro fra grader/s til rad/s med riktig akse', () => {
  const g = gyroFromRotationRate({ alpha: 180, beta: 90, gamma: -90 });
  assert.ok(Math.abs(g.z - Math.PI) < 1e-9 && Math.abs(g.x - Math.PI / 2) < 1e-9 && Math.abs(g.y + Math.PI / 2) < 1e-9);
  assert.equal(gyroFromRotationRate({ alpha: null }), null);
  assert.equal(gyroFromRotationRate(null), null);
});

test('lineær akselerasjon', () => {
  assert.deepEqual(linearFromEvent({ x: 0.1, y: -0.2, z: 0.3 }), { x: 0.1, y: -0.2, z: 0.3 });
  assert.equal(linearFromEvent({ x: null, y: null, z: null }), null);
});

test('hull markeres bare når det er over ett sekund', () => {
  assert.equal(gapFromHidden(10, 10.5), null);
  assert.deepEqual(gapFromHidden(10, 14), { from: 10, to: 14 });
  assert.equal(gapFromHidden(null, 14), null);
});

test('haversine', () => {
  const d = haversine({ lat: 63.4305, lon: 10.3951 }, { lat: 63.4395, lon: 10.3951 });
  assert.ok(Math.abs(d - 1001) < 5, `1 km nordover ga ${d}`);
});
