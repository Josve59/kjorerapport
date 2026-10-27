import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processDetections, roadSummary, focalPx, leadAt } from '../kamera/js/road.js';

test('veikamera: bilen rett foran velges, og avstanden anslås fra bredden', () => {
  const f = focalPx(640, 480);
  const w = 1.8 * f / 20;   // en bil 20 m unna
  const dets = [
    { cls: 'car', score: 0.8, x: 320 - w / 2, y: 260, w, h: w * 0.8 },     // midt foran
    { cls: 'car', score: 0.9, x: 20, y: 250, w: w * 2, h: w },              // i nabofeltet, nærmere
    { cls: 'person', score: 0.6, x: 600, y: 200, w: 15, h: 40 },
    { cls: 'car', score: 0.7, x: 310, y: 50, w: 30, h: 20 }                 // langt oppe i bildet (bro)
  ];
  const r = processDetections(dets, 640, 480);
  assert.equal(r.cars, 3);
  assert.equal(r.people, 1);
  assert.ok(Math.abs(r.lead.dist - 20) < 0.5, JSON.stringify(r.lead));
});

test('veikamera: kort avstand med bro over hull når førerkameraet var på', () => {
  const points = Array.from({ length: 121 }, (_, i) => ({ t: i, kmh: 72 }));   // 20 m/s
  const samples = [];
  // Veikameraet 2 s av hvert 6. sekund, bilen foran 14 m unna (0,7 s) fra 50 til 74 s
  for (let t = 0; t < 120; t += 0.125) if (t % 6 < 2) samples.push({ t, cars: 1, people: 0, lead: t >= 50 && t <= 74 ? { cls: 'car', dist: 14 } : { cls: 'car', dist: 45 } });
  const s = roadSummary(samples, points);
  assert.equal(s.close.length, 1, JSON.stringify(s.close));
  assert.ok(s.close[0].t >= 50 && s.close[0].t <= 56 && s.close[0].tEnd >= 72, JSON.stringify(s.close[0]));   // første veibilde etter 50 s er ved 54 s
  assert.equal(s.close[0].minHeadway, 0.7);
  assert.ok(s.coverage > 0.25 && s.coverage < 0.4, String(s.coverage));
  assert.equal(leadAt(s, 61).dist, 14);
  assert.doesNotThrow(() => structuredClone(s), 'kan lagres i databasen');
  // Farten endret seg mye mellom bildene: ingen bro
  const points2 = points.map(p => ({ ...p, kmh: p.t % 6 < 2 ? 72 : 72 }));
  for (const p of points2) if (p.t >= 60) p.kmh = 50;   // vi bremset ned
  const s2 = roadSummary(samples, points2);
  assert.ok(s2.close.every(c => c.tEnd < 60 || c.t >= 60), 'ingen episode bygges over fartsendringen');
});
