import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poseFromMatrix, calibrationFromSamples, classifyPose, detectGlances, evaluateMirrors, forwardDrift } from '../js/camera.js';

const pts = (yaw, pitch, n = 10) => Array.from({ length: n }, () => ({ yaw: yaw + (Math.random() - 0.5), pitch: pitch + (Math.random() - 0.5) }));
const calib = calibrationFromSamples({ forward: pts(0, 0), left: pts(-35, -3), right: pts(48, -2), rear: pts(22, 14) });

test('kalibrering: gyldig, og avviser speil som ikke skiller seg fra rett fram', () => {
  assert.equal(calib.ok, true);
  const bad = calibrationFromSamples({ forward: pts(0, 0), left: pts(-3, 0), right: pts(40, 0), rear: pts(20, 12) });
  assert.equal(bad.ok, false);
  assert.equal(bad.problem, 'close');
  assert.equal(calibrationFromSamples({ forward: pts(0, 0) }).problem, 'missing');
});

test('klassifisering av retninger', () => {
  assert.equal(classifyPose({ yaw: 1, pitch: 1 }, calib), 'forward');
  assert.equal(classifyPose({ yaw: -33, pitch: -2 }, calib), 'left');
  assert.equal(classifyPose({ yaw: 46, pitch: -1 }, calib), 'right');
  assert.equal(classifyPose({ yaw: 21, pitch: 13 }, calib), 'rear');
  assert.equal(classifyPose({ yaw: -65, pitch: 0 }, calib), 'shoulderL');
  assert.equal(classifyPose({ yaw: 85, pitch: 0 }, calib), 'shoulderR');
  assert.equal(classifyPose(null, calib), 'none');
});

test('rotasjonsmatrise gir vinkler', () => {
  const a = 30 * Math.PI / 180;
  // rotasjon om y-aksen, kolonnevis 4×4
  const m = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  const p = poseFromMatrix(m);
  assert.ok(Math.abs(Math.abs(p.yaw) - 30) < 0.01, JSON.stringify(p));
  assert.ok(Math.abs(p.pitch) < 0.01);
});

/* Lager 8 bilder i sekundet: rett fram, med blikk lagt inn [start, varighet, yaw, pitch, ok] */
function series(seconds, glances) {
  const out = [];
  for (let t = 0; t < seconds; t += 0.125) {
    const g = glances.find(([s, d]) => t >= s && t < s + d);
    out.push(g ? { t, yaw: g[2], pitch: g[3], ok: g[4] !== false } : { t, yaw: 0.5, pitch: 0, ok: true });
  }
  return out;
}

test('blikk oppdages, korte blinkskudd ignoreres, og tapt ansikt etter vridning regnes som skulder', () => {
  const s = series(30, [[5, 0.6, -34, -3], [10, 0.5, 22, 13], [15, 0.125, 47, -2], [20, 0.3, -50, 0], [20.3, 0.5, null, null, false]]);
  const g = detectGlances(s, calib);
  assert.deepEqual(g.map(x => x.cls), ['left', 'rear', 'shoulderL'], JSON.stringify(g));
});

test('vurdering: speil og skulder før feltskifte, lengste pause og dekning', () => {
  const s = series(120, [[10, 0.6, -34, -3], [40, 0.6, -34, -3], [42, 0.5, -70, 0], [90, 0.6, 46, -1]]);
  const points = Array.from({ length: 121 }, (_, i) => ({ t: i, kmh: i < 3 ? 0 : 60 }));
  const lc = [{ t: 45, tFrom: 44, tTo: 48, dir: 'venstre', kmh: 60 }, { t: 100, tFrom: 99, tTo: 103, dir: 'høyre', kmh: 60 }];
  const e = evaluateMirrors(s, calib, { points, t0: 0, laneChanges: lc });
  assert.equal(e.lane[0].mirror, true);
  assert.equal(e.lane[0].shoulder, true);
  assert.equal(e.lane[1].mirror, false, 'høyre speil 9 s før er for tidlig');
  assert.equal(e.lane[1].shoulder, false);
  assert.equal(e.coverage, 1);
  assert.deepEqual([e.counts.left, e.counts.right, e.counts.shoulderL], [2, 1, 1]);
  assert.ok(e.longestGap >= 49 && e.longestGap <= 51, `lengste pause ${e.longestGap}`);
  assert.equal(e.start.mirror, false, 'ingen speilblikk før start');
});

test('rett fram som har flyttet seg under turen, rettes opp', () => {
  // Hodet sitter 4° høyere og 3° mer mot høyre enn ved kalibreringen
  const s = series(120, [[30, 0.6, -34, -3], [80, 0.6, 46, -1]]).map(x => x.ok ? { ...x, yaw: x.yaw + 3, pitch: x.pitch + 4 } : x);
  const off = forwardDrift(s, calib);
  assert.ok(Math.abs(off(60).yaw - 3) < 1 && Math.abs(off(60).pitch - 4) < 1, JSON.stringify(off(60)));
  assert.deepEqual(detectGlances(s, calib).map(g => g.cls), ['left', 'right']);
});

test('feltskifter merket av ledsager brukes, dobbelttrykk teller én gang', () => {
  const s = series(120, [[40, 0.6, -34, -3], [45, 0.5, -70, 0], [90, 0.6, 22, 13]]);
  const points = Array.from({ length: 121 }, (_, i) => ({ t: i, kmh: 60 }));
  const e = evaluateMirrors(s, calib, { points, t0: 0, laneChanges: [{ t: 10, tFrom: 9, tTo: 12, dir: 'venstre' }], markedLanes: [50, 51.5, 100] });
  assert.equal(e.laneSource, 'marks');
  assert.equal(e.lane.length, 2);
  assert.equal(e.lane[0].mirror, true);
  assert.equal(e.lane[0].shoulder, true);
  assert.equal(e.lane[1].mirror, true, 'bakspeil 10 s før');
  assert.equal(e.lane[1].shoulder, false);
  assert.equal(evaluateMirrors(s, calib, { points, laneChanges: [{ t: 10, tFrom: 9, tTo: 12, dir: 'venstre' }] }).laneSource, 'sensors');
});

test('blikket borte fra veien: bare over 2 s, i fart og på rett vei', async () => {
  const { eyesOffRoad } = await import('../js/camera.js');
  // 0,6 s speilblikk (ok), 2,5 s ned mot telefonen (pitch -30), og 2,5 s borte i 20 km/t (teller ikke)
  const s = series(100, [[20, 0.6, -34, -3], [40, 2.5, 0, -30], [80, 2.5, 0, -30]]);
  const pts = Array.from({ length: 101 }, (_, i) => ({ t: i, lat: 63.43 + i * 1.5e-4, lon: 10.39, kmh: i > 70 ? 20 : 60 }));
  const a = eyesOffRoad(s, calib, { points: pts, t0: 0 });
  assert.equal(a.length, 1, JSON.stringify(a));
  assert.ok(Math.abs(a[0].t - 40) < 0.3 && a[0].dur >= 2.2);
  assert.ok(a[0].metres > 35 && a[0].metres < 45);
});
