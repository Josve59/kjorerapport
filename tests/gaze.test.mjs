import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eyesFromBlendshapes, calibrationFromSamples, classifyPose, toGaze, gazeCalib, useGaze, evaluateMirrors } from '../kamera/js/camera.js';

const bs = o => Object.entries(o).map(([categoryName, score]) => ({ categoryName, score }));

test('øynene: retning fra blendshapes, lukkede øyne gir ingen retning', () => {
  const l = eyesFromBlendshapes(bs({ eyeLookOutLeft: 0.8, eyeLookInRight: 0.8 }));
  assert.ok(l.ex > 20 && Math.abs(l.ey) < 1, JSON.stringify(l));
  const r = eyesFromBlendshapes(bs({ eyeLookInLeft: 0.6, eyeLookOutRight: 0.6, eyeLookUpLeft: 0.4, eyeLookUpRight: 0.4 }));
  assert.ok(r.ex < -15 && r.ey > 5);
  const shut = eyesFromBlendshapes(bs({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.8, eyeLookOutLeft: 0.5 }));
  assert.ok(Number.isNaN(shut.ex));
});

// Fører som ser i speilene delvis med øynene. Hodet: venstre +20°, høyre −28°, bakspeil −14° og 8° opp.
// Øynene går motsatt fortegn i modellen (ex negativ når hodet går positivt), så retningen må finnes ved kalibreringen.
const sample = (yaw, pitch, ex, ey, n = 8) => Array.from({ length: n }, (_, i) => ({ yaw: yaw + (i % 3) * 0.3, pitch: pitch + (i % 2) * 0.2, ex: ex + (i % 2) * 0.4, ey }));
const byTarget = { forward: sample(0, 0, 0, 0), left: sample(20, 0, -12, 0), right: sample(-28, 0, 14, 0), rear: sample(-14, 8, 8, 6) };

test('kalibrering med øynene: blikket (hode + øyne) får egen kalibrering med riktig retning', () => {
  const c = calibrationFromSamples(byTarget);
  assert.ok(c.ok && useGaze(c), 'blikk-kalibrering');
  assert.equal(c.g.sy, -1); assert.equal(c.g.sp, 1);
  assert.ok(Math.abs(c.g.left.yaw - 32) < 1, 'venstre speil med øynene: 32° ' + c.g.left.yaw);
  // Et speilblikk med bare øynene (hodet rett fram) gjenkjennes nå
  const eyesOnly = { yaw: 3, pitch: 0, ex: -26, ey: 0 };
  assert.equal(classifyPose(toGaze(eyesOnly, c), gazeCalib(c)), 'left');
  assert.equal(classifyPose(eyesOnly, c), 'forward', 'med bare hodet: rett fram');
  // Gamle kalibreringer (uten øyne) virker som før
  const old = calibrationFromSamples(Object.fromEntries(Object.entries(byTarget).map(([k, a]) => [k, a.map(({ yaw, pitch }) => ({ yaw, pitch }))])));
  assert.ok(old.ok && !useGaze(old));
  assert.equal(toGaze(eyesOnly, old), eyesOnly);
});

test('analysen bruker blikket når kalibreringen har øynene', () => {
  const c = calibrationFromSamples(byTarget);
  const samples = [];
  for (let t = 0; t < 30; t += 0.125) {
    const glance = t > 10 && t < 10.8;   // speilblikk med mest øyne
    samples.push({ t, ok: true, yaw: glance ? 8 : 0, pitch: 0, ex: glance ? -22 : 0, ey: 0 });
  }
  const withEyes = evaluateMirrors(samples, c, {});
  const headOnly = evaluateMirrors(samples, { ...c, g: undefined }, {});
  assert.ok(withEyes.glances.some(g => g.cls === 'left'), 'blikket i venstre speil funnet');
  assert.ok(!headOnly.glances.some(g => g.cls === 'left'), 'bare hodet: ikke funnet');
});
