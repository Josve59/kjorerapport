import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeDemo } from '../js/analysis.js';

/* Lager en tur langs en rett vei østover med valgfrie manøvrer. Retning med klokka er positiv. */
function synth(script) {
  const lat0 = 63.43, lon0 = 10.39, mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  let t = 0, x = 0, y = 0, h = Math.PI / 2, v = 0, nextLoc = 0, s = 3;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const dt = 0.05, loc = [], gyro = [], grav = [];
  const step = (vTarget, yr) => {
    v += Math.max(-2, Math.min(2, (vTarget - v))) * dt; h += yr * dt;
    x += v * Math.sin(h) * dt; y += v * Math.cos(h) * dt; t += dt;
    gyro.push({ t, x: 0.003 * rnd(), y: 0.003 * rnd(), z: -yr + 0.003 * rnd() });
    grav.push({ t, x: 0, y: 0, z: -9.81 });
    if (t >= nextLoc) { nextLoc += 1; loc.push({ t, lat: lat0 + y / mLat, lon: lon0 + x / mLon, speed: v, bearing: ((h * 180 / Math.PI) % 360 + 360) % 360, acc: 4 }); }
  };
  for (const [kind, a, b] of script) {
    if (kind === 'drive') for (let k = 0; k < a / dt; k++) step(b, 0);
    if (kind === 'lane') { // a = varighet (s), b = +1 venstre / -1 høyre; θ = A sin(πt/T)
      const T = a, A = 3.5 * Math.PI / (2 * v * T);
      for (let k = 0; k < T / dt; k++) step(v, -b * A * Math.PI / T * Math.cos(Math.PI * k * dt / T));
    }
    if (kind === 'turn') { const yr = b, n = Math.abs(a) * Math.PI / 180 / Math.abs(yr) / dt; for (let k = 0; k < n; k++) step(v, Math.sign(a) * Math.abs(yr)); }
  }
  return { loc, gyro, grav };
}

test('feltskifte til venstre og høyre oppdages på rett vei i 70 km/t', () => {
  const d = synth([['drive', 30, 19.4], ['lane', 4, 1], ['drive', 25, 19.4], ['lane', 5, -1], ['drive', 30, 19.4]]);
  const r = analyze(d);
  const lc = r.maneuvers.laneChanges;
  assert.equal(lc.length, 2, JSON.stringify(lc));
  assert.equal(lc[0].dir, 'venstre');
  assert.equal(lc[1].dir, 'høyre');
  assert.ok(lc[0].offset > 2.4 && lc[0].offset < 5.5);
});

test('rett vei uten manøvrer gir ingen feltskifter eller rundkjøringer', () => {
  const r = analyze(synth([['drive', 120, 19.4]]));
  assert.equal(r.maneuvers.laneChanges.length, 0);
  assert.equal(r.maneuvers.roundabouts.length, 0);
});

test('rundkjøring (høyre – venstre rundt – høyre) oppdages, vanlig sving gjør det ikke', () => {
  const d = synth([['drive', 40, 8], ['turn', 30, 0.35], ['turn', -150, 0.35], ['turn', 30, 0.35], ['drive', 30, 8], ['turn', -90, 0.3], ['drive', 30, 8]]);
  const r = analyze(d);
  assert.equal(r.maneuvers.roundabouts.length, 1, JSON.stringify(r.maneuvers.roundabouts));
  assert.ok(Math.abs(r.maneuvers.roundabouts[0].net) > 60, 'tok av til venstre i rundkjøringen');
});

test('demoturen har ingen falske feltskifter', () => {
  const r = analyze(makeDemo());
  assert.equal(r.maneuvers.laneChanges.length, 0);
});
