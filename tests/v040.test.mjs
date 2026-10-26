import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeDemo, holderCheck, TH } from '../js/analysis.js';

test('standardvalg gir fortsatt prototypens resultat', () => {
  const r = analyze(makeDemo());
  assert.equal(r.overall, 82);
  assert.equal(r.events.length, 3);
  assert.equal(r.holder.stable, true);
  assert.equal(r.series.along.length, r.points.length);
});

test('by-tilpasset jevn fart ser bort fra stopp og gir høyere eller lik poengsum', () => {
  const normal = analyze(makeDemo());
  const city = analyze(makeDemo(), { cityAware: true });
  assert.ok(city.scores.smooth >= normal.scores.smooth, `${city.scores.smooth} vs ${normal.scores.smooth}`);
  assert.ok(city.stats.rms <= normal.stats.rms);
  assert.equal(city.cityAware, true);
});

test('egendefinerte terskler brukes, og ugyldige verdier faller tilbake', () => {
  const strict = analyze(makeDemo(), { th: { brake: { brisk: 1.5, harsh: 3.5 }, accel: TH.accel, turn: TH.turn } });
  assert.ok(strict.events.filter(e => e.kind === 'brake').length > 1, 'flere bremsehendelser med lavere terskel');
  const bad = analyze(makeDemo(), { th: { brake: { brisk: -1, harsh: 'x' } } });
  assert.equal(bad.events.length, 3);
});

test('holder-sjekk finner at telefonen ble flyttet midt i turen', () => {
  const grav = [];
  for (let t = 0; t < 600; t += 0.05) {
    // stø til 300 s, flyttes 300–310 s (vipper 40°), settes tilbake 20° skjevt
    const tilt = t < 300 ? 0 : t < 310 ? 40 * Math.PI / 180 : 20 * Math.PI / 180;
    grav.push({ t, x: 0, y: -9.81 * Math.sin(tilt), z: -9.81 * Math.cos(tilt) });
  }
  const h = holderCheck(grav, 0, 600);
  assert.equal(h.episodes.length, 1);
  assert.ok(h.episodes[0].from >= 290 && h.episodes[0].to <= 325, JSON.stringify(h.episodes[0]));
  assert.ok(h.episodes[0].shift > 15 && h.permanentShift);
});

test('holder-sjekk ignorerer start og slutt, og små rystelser', () => {
  const grav = [];
  for (let t = 0; t < 300; t += 0.05) {
    const tilt = (t < 10 || t > 290 ? 60 : 0) * Math.PI / 180 + 0.03 * Math.sin(t * 7);
    grav.push({ t, x: 0, y: -9.81 * Math.sin(tilt), z: -9.81 * Math.cos(tilt) });
  }
  assert.equal(holderCheck(grav, 0, 300).stable, true);
});

test('v3 tilpasses per segment ved varig forskyvning', () => {
  const d = makeDemo(7, { yaw: 0.7, pitch: 0.35 });
  // Etter 150 s roteres telefonen 35° om z (snudd i holderen): gyro, tyngdekraft og akselerasjon roteres likt.
  const c = Math.cos(0.6), s = Math.sin(0.6);
  const rot = v => (v.t < 150 ? v : { t: v.t, x: c * v.x - s * v.y, y: s * v.x + c * v.y, z: v.z });
  // legg på et tydelig vipp i overgangen så holder-sjekken ser det
  const tilt = v => (v.t >= 148 && v.t < 152 ? { t: v.t, x: v.x, y: v.y + 6, z: v.z } : v);
  const moved = { loc: d.loc, gyro: d.gyro.map(rot), grav: d.grav.map(rot).map(tilt), acc: d.acc.map(rot) };
  const r = analyze(moved, { engine: 'v3' });
  assert.equal(r.alongSource, 'acc');
  assert.ok(r.holder.episodes.length >= 1, 'flyttingen oppdages');
  assert.ok(r.events.filter(e => e.kind === 'brake' && e.level === 'harsh').length === 1);
});
