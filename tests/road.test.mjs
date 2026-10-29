import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processDetections, roadSummary, focalPx, leadAt, detectTaillights, TAIL_SEP } from '../kamera/js/road.js';

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

/* Mørkt bilde (320×240) med røde lys: [x, y, r] i piksler. Lysene har hvit kjerne og rød glorie. */
function nightFrame(lights, w = 320, h = 240) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = 14; d[i * 4 + 1] = 14; d[i * 4 + 2] = 18; d[i * 4 + 3] = 255; }
  for (const [fx, fy, r] of lights) for (let cx = Math.round(fx), cy = Math.round(fy), y = cy - r - 2; y <= cy + r + 2; y++) for (let x = cx - r - 2; x <= cx + r + 2; x++) {
    const dd = Math.hypot(x - cx, y - cy), i = (y * w + x) * 4;
    if (dd <= r * 0.5) { d[i] = 255; d[i + 1] = 235; d[i + 2] = 225; }        // kjerne
    else if (dd <= r + 2) { d[i] = 230; d[i + 1] = 40; d[i + 2] = 35; }        // rød glorie
  }
  return d;
}

test('veikamera i mørket: baklysene gir bilen foran og avstanden', () => {
  const w = 320, h = 240, f = focalPx(w, h);
  const sep = TAIL_SEP * f / 15;   // en bil 15 m unna
  const r = detectTaillights(nightFrame([[160 - sep / 2, 150, 3], [160 + sep / 2, 150, 3]]), w, h);
  assert.ok(r.lead, JSON.stringify(r));
  assert.ok(Math.abs(r.lead.dist - 15) < 1.5, 'avstand ' + r.lead.dist);
  assert.equal(r.lead.src, 'baklys');
  // Et enkelt lys, lys i ulik høyde, og et par i nabofeltet gir ingen bil rett foran
  assert.equal(detectTaillights(nightFrame([[160, 150, 3]]), w, h).lead, null);
  assert.equal(detectTaillights(nightFrame([[140, 120, 3], [180, 170, 3]]), w, h).lead, null);
  const side = detectTaillights(nightFrame([[40, 150, 3], [80, 150, 3]]), w, h);
  assert.equal(side.lead, null); assert.equal(side.pairs, 1);
  // To biler foran: den nærmeste (bredeste paret) velges
  const near = TAIL_SEP * f / 10, far = TAIL_SEP * f / 30;
  const two = detectTaillights(nightFrame([[160 - far / 2, 120, 2], [160 + far / 2, 120, 2], [160 - near / 2, 170, 4], [160 + near / 2, 170, 4]]), w, h);
  assert.ok(two.lead && Math.abs(two.lead.dist - 10) < 1.2, JSON.stringify(two));
});
