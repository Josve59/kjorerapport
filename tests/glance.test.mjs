import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGlances, calibrationFromSamples, closeMirrorText } from '../js/camera.js';
import { roadDets } from '../js/road.js';

const calib = { ok: true, forward: { yaw: 0, pitch: 0 }, left: { yaw: 25, pitch: -4 }, right: { yaw: -30, pitch: 2 }, rear: { yaw: -12, pitch: 14 } };
// 8 bilder i sekundet; at(t) gir retningen ved tiden t
const run = (sec, at) => Array.from({ length: Math.round(sec * 8) }, (_, i) => { const t = i / 8, p = at(t); return { t, ok: true, yaw: p.yaw, pitch: p.pitch }; });
const fwd = { yaw: 0, pitch: 0 }, left = { yaw: 25, pitch: -4 };

test('ett enkelt bilde mot speilet er støy og telles ikke', () => {
  const s = run(6, t => (Math.abs(t - 3) < 0.01 ? left : fwd));
  assert.equal(detectGlances(s, calib).length, 0);
});

test('to bilder (0,25 s) er for kort, tre bilder (0,375 s) er et blikk', () => {
  const two = run(6, t => (t >= 3 && t < 3.2 ? left : fwd));
  assert.equal(detectGlances(two, calib).length, 0);
  const three = run(6, t => (t >= 3 && t < 3.3 ? left : fwd));
  const g = detectGlances(three, calib);
  assert.equal(g.length, 1);
  assert.equal(g[0].cls, 'left');
  assert.ok(g[0].dur >= 0.35 && g[0].dur < 0.45, String(g[0].dur));
});

test('et blikk med ett bilde som hopper ut midt i, blir ett blikk', () => {
  const s = run(6, t => (t >= 2 && t < 3 ? (Math.abs(t - 2.5) < 0.01 ? fwd : left) : fwd));
  const g = detectGlances(s, calib);
  assert.equal(g.length, 1);
  assert.ok(g[0].dur > 0.9);
});

test('kalibrering: speil nær hverandre godtas, men merkes', () => {
  const at = (yaw, pitch) => Array.from({ length: 10 }, () => ({ yaw, pitch }));
  const c = calibrationFromSamples({ forward: at(10, 10), left: at(22, 4), right: at(-8, 12), rear: at(-5, 3) });
  assert.equal(c.ok, true);
  assert.deepEqual(c.close.map(p => [p.a, p.b]), [['right', 'rear']]);
  assert.equal(closeMirrorText(c.close), `Høyre speil og bakspeilet ligger bare ${c.close[0].deg}° fra hverandre`);
  const ok = calibrationFromSamples({ forward: at(0, 0), left: at(25, -4), right: at(-30, 2), rear: at(-12, 14) });
  assert.equal(ok.close, undefined);
  assert.equal(closeMirrorText(undefined), '');
});

test('uten kjent dashbordkant: brede bokser og bokser helt nederst er ikke biler', () => {
  const w = 720, h = 1280;
  const dets = [
    { cls: 'car', score: 0.9, x: 110, y: 1000, w: 500, h: 250 },   // dashbordet
    { cls: 'car', score: 0.9, x: 300, y: 1150, w: 200, h: 120 },   // helt nederst
    { cls: 'car', score: 0.9, x: 300, y: 650, w: 150, h: 110 }     // bil på veien
  ];
  assert.deepEqual(roadDets(dets, w, h, null).map(d => d.y), [650]);
  assert.equal(roadDets(dets, w, h, 0.75).length, 1, 'med kjent kant: som før');
});
