import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestFocus, hotspots, sameRoute, overlap, curriculumEvidence, CURRICULUM } from '../js/insights.js';
import { analyze, makeDemo } from '../js/analysis.js';
import { driveLog } from '../js/log.js';

const demo = analyze(makeDemo());
const row = (res, extra = {}) => ({ res, marks: [], sp: null, road: null, log: driveLog(res, Date.UTC(2026, 9, 24, 22, 0)), ...extra });

test('forslag: svakeste kategori først, mørkekjøring om høsten', () => {
  const s = suggestFocus([row(demo), row(demo)], new Date(2026, 9, 27));
  assert.ok(s.length >= 1 && s.length <= 3);
  assert.equal(s[0].id, 'brake', JSON.stringify(s));
  assert.match(s[0].reason, /Bremsing: snitt 80 poeng/);
  const summer = suggestFocus([row(demo)], new Date(2026, 6, 1));
  assert.ok(!summer.some(x => x.id === 'dark'), 'ikke mørkekjøring om sommeren');
});

test('forslag: speilmerker fra ledsager gir «Speil og skulderblikk»', () => {
  const marks = [{ cat: 'speil', t: 10 }, { cat: 'skulder', t: 50 }, { cat: 'speil', t: 90 }];
  const s = suggestFocus([row(demo, { marks })], new Date(2026, 6, 1));
  assert.ok(s.some(x => x.id === 'mirror'), JSON.stringify(s));
});

test('faresteder: hendelser på samme sted på to turer samles', () => {
  const pts = demo.points.map(p => ({ lat: p.lat, lon: p.lon }));
  const e = demo.events[1];
  const drives = [
    { id: 'a', points: pts, items: [{ lat: e.lat, lon: e.lon, type: 'event', kind: 'brake' }] },
    { id: 'b', points: pts, items: [{ lat: e.lat + 0.0002, lon: e.lon, type: 'event', kind: 'brake' }, { lat: 63.5, lon: 10.5, type: 'mark', kind: 'speil' }] }
  ];
  const h = hotspots(drives);
  assert.equal(h.length, 1);
  assert.equal(h[0].drives, 2);
  assert.equal(h[0].passes, 2);
  assert.equal(h[0].main, 'brake');
});

test('samme rute: lik rute gjenkjennes, annen rute ikke', () => {
  const a = demo.points;
  const shifted = a.map(p => ({ lat: p.lat + 0.0003, lon: p.lon }));        // ca. 33 m forskjøvet
  const other = a.map(p => ({ lat: p.lat + 0.02, lon: p.lon }));            // 2 km unna
  assert.equal(sameRoute(a, shifted), true);
  assert.equal(sameRoute(a, other), false);
  assert.ok(overlap(a, a.slice(0, Math.floor(a.length / 2))) < 0.7, 'halv rute er ikke samme rute');
});

test('opplæringsplan: bevis fra turene', () => {
  const ev = curriculumEvidence([row(demo), row(demo)]);
  assert.match(ev.by.text, /min øvd/);
  assert.match(ev.dark.text, /min i mørke/);
  assert.match(ev.brake.text, /Bremsing snitt 80/);
  assert.equal(ev.limits, null);
  const ids = CURRICULUM.flatMap(s => s.items.map(i => i.id));
  assert.equal(new Set(ids).size, ids.length, 'unike id-er');
});
