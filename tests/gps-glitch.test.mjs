import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeDemo, removeGpsOutliers } from '../js/analysis.js';

test('et posisjonshopp i starten (som på første ekte tur) filtreres bort', () => {
  const d = makeDemo();
  // De to første posisjonene ligger 1,2 km unna resten (mobilnett-posisjon før GPS låste), fart ukjent.
  d.loc[0] = { ...d.loc[0], lat: d.loc[0].lat + 0.011, speed: NaN };
  d.loc[1] = { ...d.loc[1], lat: d.loc[1].lat + 0.011, speed: NaN };
  const r = analyze(d);
  assert.equal(r.droppedPoints, 2);
  assert.equal(r.events.length, 3, 'bare de tre ekte hendelsene');
  assert.equal(r.overall, 82);
  assert.ok(r.stats.maxKmh < 80, `toppfart ${r.stats.maxKmh}`);
  assert.ok(r.scores.smooth >= 80, `jevn fart ${r.scores.smooth}`);
});

test('et enkelt hopp midt i turen filtreres bort', () => {
  const d = makeDemo();
  d.loc[150] = { ...d.loc[150], lon: d.loc[150].lon + 0.02, speed: NaN };
  const r = analyze(d);
  assert.equal(r.droppedPoints, 1);
  assert.equal(r.events.length, 3);
  assert.equal(r.overall, 82);
});

test('umulig GPS-fart forkastes og erstattes av avstand/tid', () => {
  const d = makeDemo();
  d.loc[100].speed = 115;   // 414 km/t
  const r = analyze(d);
  assert.ok(r.stats.maxKmh < 80, `toppfart ${r.stats.maxKmh}`);
  assert.equal(r.events.length, 3);
});

test('en ekte GPS-pause (tunnel) beholder begge delene av turen', () => {
  const pts = [];
  for (let t = 0; t < 60; t++) pts.push({ t, lat: 63.43 + t * 0.0002, lon: 10.39 });
  for (let t = 120; t < 180; t++) pts.push({ t, lat: 63.43 + 0.012 + (t - 120) * 0.0002, lon: 10.39 });
  assert.equal(removeGpsOutliers(pts).length, 120);
});
