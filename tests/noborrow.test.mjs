/* 0.26.5: fartsgrensen lånes ikke fra en annen veg (turene 19. nov.: «50» midt på en 80-veg) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDetail, noBorrow, NEAR_M } from '../js/enrich.js';
import { createLiveLimit } from '../js/livelimit.js';

const M = 1 / 111320, LON = 1 / (111320 * Math.cos(63 * Math.PI / 180));
// Rett nordover i 72 km/t: 20 m mellom punktene, ett i sekundet
const pts = Array.from({ length: 90 }, (_, i) => ({ t: i, lat: 63 + i * 20 * M, lon: 10 }));
const line = (from, to, east, limit) => ({ limit, pts: [{ lat: 63 + from * 20 * M, lon: 10 + east * LON }, { lat: 63 + to * 20 * M, lon: 10 + east * LON }] });
// Egen veg med 80 unntatt punkt 30–60 (NVDB mangler grensen der), og en parallell 50-veg 18 m øst
const segs = [line(0, 30, 0, 80), line(60, 90, 0, 80), line(25, 65, 18, 50)];

test('rapporten: en parallell veg 18 m unna gir ikke grense der vegen mangler den', () => {
  const det = matchDetail(pts, segs);
  assert.equal(det[45].limit, 50, 'uten regelen ble 50 lånt');
  assert.ok(det[45].d > NEAR_M);
  const lim = noBorrow(pts, det);
  assert.equal(lim[10], 80);
  assert.ok(lim.slice(31, 60).every(v => Number.isNaN(v)), 'ukjent i stedet for 50');
  assert.equal(lim[75], 80);
  // GPS-en drar bilen 14 m bort fra sin egen veg i 3 s: grensen holdes, fordi den ble funnet nær bilen like før
  const wobble = pts.map((p, i) => (i >= 70 && i <= 72 ? { ...p, lon: 10 + 14 * LON } : p));
  assert.ok(noBorrow(wobble, matchDetail(wobble, segs)).slice(70, 73).every(v => v === 80));
});

test('under kjøring: «–» i stedet for lånt 50, og 80 igjen når vegen har grense', async () => {
  let T = 0;
  const live = createLiveLimit({ fetchBox: async () => segs, now: () => T });
  live.update({ ...pts[0], acc: 5 });
  await new Promise(r => setTimeout(r, 0));
  const shown = [];
  for (const p of pts) { T = p.t * 1000; shown.push(live.update({ ...p, acc: 5 }).limit); }
  assert.equal(shown[20], 80);
  assert.ok(!shown.slice(34, 60).includes(50), `viste ${[...new Set(shown.slice(34, 60))]}`);
  assert.equal(shown[80], 80);
});
