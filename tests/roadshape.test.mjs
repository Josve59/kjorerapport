import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackCurvature, aheadCurvature, matchRoad, laneCount, laneWidthFrom, kappaPrior } from '../js/roadshape.js';

// Punkter langs en sirkel med radius r (m) rundt (lat0, lon0), fra vinkel a0 til a1 (radianer, med klokka fra nord)
const O = { lat: 63.43, lon: 10.4 };
const at = (x, y) => ({ lat: O.lat + y / 111195, lon: O.lon + x / (111195 * Math.cos(O.lat * Math.PI / 180)) });
const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n }, (_, k) => { const a = a0 + (a1 - a0) * k / (n - 1); return at(cx + r * Math.sin(a), cy + r * Math.cos(a)); });

test('svingen nå fra GPS-sporet: høyresving med radius 100 m gir +0,01', () => {
  // Bilen kjører med klokka rundt et senter til høyre for seg: høyresving
  const track = arc(0, 0, 100, -0.3, 0, 7);
  const k = trackCurvature(track);
  assert.ok(Math.abs(k - 0.01) < 0.0015, String(k));
  const left = trackCurvature(track.slice().reverse());
  assert.ok(Math.abs(left + 0.01) < 0.0015, String(left));
  assert.equal(trackCurvature(track.slice(0, 2)), null);
});

test('rett vei: ingen sving, og for kort strekning gir null', () => {
  const line = Array.from({ length: 6 }, (_, k) => at(0, k * 8));
  assert.ok(Math.abs(trackCurvature(line)) < 1e-4);
  assert.equal(trackCurvature([at(0, 0), at(0, 3), at(0, 6)]), null);
});

test('svingen foran fra veiens linje, også over to strekninger og i begge retninger', () => {
  // Rett 0–20 m nordover, så en venstresving med radius 80 m (senter 80 m vest)
  const straight = Array.from({ length: 5 }, (_, k) => at(0, k * 5));
  const curve = arc(-80, 20, 80, Math.PI / 2, Math.PI / 2 - 1.0, 25);   // starter i (0, 20) og bøyer mot vest
  const segs = [{ pts: straight }, { pts: curve, lanes: ['1', '2'] }];
  const p = at(0.5, 2);
  const a = aheadCurvature(segs, p, 0, { from: 8, to: 60 });
  assert.ok(a && a.kappa < -0.006 && a.kappa > -0.016, JSON.stringify(a && a.kappa));
  // Motsatt vei langs samme linjer (sørover inn mot den rette biten): fra buen ut på den rette
  const back = aheadCurvature([{ pts: straight.slice().reverse() }, { pts: curve.slice().reverse() }], at(-0.5, 18), 180, { from: 2, to: 18 });
  assert.ok(back && Math.abs(back.kappa) < 0.004, JSON.stringify(back && back.kappa));
  // For langt unna veien: ingen treff
  assert.equal(aheadCurvature(segs, at(60, 0), 0), null);
});

test('veien på tvers av kjøreretningen velges ikke', () => {
  const ns = { pts: Array.from({ length: 5 }, (_, k) => at(0, k * 10)) }, ew = { pts: Array.from({ length: 5 }, (_, k) => at(-20 + k * 10, 1)) };
  assert.equal(matchRoad([ew, ns], at(0.3, 2), 0).seg, ns);
  assert.equal(matchRoad([ew, ns], at(0.3, 2), 90).seg, ew);
});

test('felt fra feltoversikten og feltbredde fra kjørebanebredden', () => {
  assert.deepEqual(laneCount(['1', '2']), { ours: 1, total: 2 });
  assert.deepEqual(laneCount(['1', '3', '2', '4']), { ours: 2, total: 4 });
  assert.deepEqual(laneCount(['1', '2', '3K', '4K'], false), { ours: 2, total: 4 });
  assert.deepEqual(laneCount(['1', '2', '1S']), { ours: 1, total: 2 }, 'sykkelfelt telles ikke');
  assert.equal(laneCount([]), null);
  assert.equal(laneWidthFrom(7.0, ['1', '2']), 3.25);
  assert.equal(laneWidthFrom(8.25, ['1', '2']), 3.75, 'bred vei: høyst 3,75 m');
  assert.equal(laneWidthFrom(21.58, ['1', '2', '3K', '4K']), 3.75, 'med skuldre og midtdeler');
  assert.equal(laneWidthFrom(14, ['1', '2']), null, '7 m per felt er ikke et vanlig felt');
  assert.equal(laneWidthFrom(NaN, ['1', '2']), null);
});

test('forventet sving: veien foran veier mest', () => {
  assert.deepEqual(kappaPrior(0.01, { kappa: 0.02 }), { kappa: 0.017, weight: 8 });
  assert.deepEqual(kappaPrior(0.01, null), { kappa: 0.01, weight: 4 });
  assert.equal(kappaPrior(null, null), null);
});

test('felt og feltbredde under kjøring: lite område fra Statens vegvesen, nytt etter 100 m', async () => {
  const { createLiveRoad } = await import('../js/livelimit.js');
  let calls = 0, t = 0;
  const road = Array.from({ length: 10 }, (_, k) => at(0, k * 30));
  const live = createLiveRoad({ now: () => t, fetchInfo: async () => { calls++; return { segs: [{ pts: road, lanes: ['1', '2'] }], widths: [{ pts: road, width: 7.0 }] }; } });
  assert.equal(live.update(at(0.5, 10), 0), null, 'første gang: venter på svaret');
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(live.update(at(0.5, 20), 0), { lanes: { ours: 1, total: 2 }, laneWidth: 3.25 });
  assert.deepEqual(live.update(at(-0.5, 25), 180).lanes, { ours: 1, total: 2 }, 'motsatt retning');
  t = 10000; live.update(at(0.5, 60), 0); assert.equal(calls, 1, 'under 100 m: samme område');
  live.update(at(0.5, 160), 0); assert.equal(calls, 2, 'over 100 m: nytt område');
});
