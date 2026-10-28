import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWkt, routeChunks, mergeBoxes, matchLimits, fillGaps, smoothBlips, analyzeSpeeding } from '../js/enrich.js';

test('WKT med Z og lat først parses', () => {
  const pts = parseWkt('LINESTRING Z (63.4263 10.3933 14.8,63.4264 10.3933 14.8)');
  assert.deepEqual(pts, [{ lat: 63.4263, lon: 10.3933 }, { lat: 63.4264, lon: 10.3933 }]);
  assert.deepEqual(parseWkt('tull'), []);
});

test('ruten deles i biter på ca. 1,5 km og bokser slås sammen', () => {
  const pts = [];
  for (let i = 0; i <= 50; i++) pts.push({ lat: 63.43 + i * 0.0009, lon: 10.39 });   // ca. 5 km nordover
  const boxes = routeChunks(pts);
  assert.ok(boxes.length >= 3 && boxes.length <= 4, `fikk ${boxes.length} bokser`);
  assert.ok(boxes[0].minLat < 63.43 && boxes[0].maxLon > 10.39);
  const merged = mergeBoxes(boxes);
  assert.ok(merged.length <= boxes.length);
});

test('fartsgrense matches til nærmeste strekning innen 25 m', () => {
  const road50 = { limit: 50, pts: [{ lat: 63.4300, lon: 10.3900 }, { lat: 63.4300, lon: 10.4000 }] };   // øst–vest
  const road30 = { limit: 30, pts: [{ lat: 63.4320, lon: 10.3900 }, { lat: 63.4320, lon: 10.4000 }] };   // 220 m lenger nord
  const pts = [
    { lat: 63.43001, lon: 10.395 },   // ~1 m fra 50-veien
    { lat: 63.43200, lon: 10.395 },   // på 30-veien
    { lat: 63.43100, lon: 10.395 }    // midt mellom, 110 m fra begge
  ];
  assert.deepEqual(matchLimits(pts, [road50, road30]), [50, 30, NaN]);
});

test('små hull fylles når grensen er lik på begge sider', () => {
  assert.deepEqual(fillGaps([50, NaN, NaN, 50, NaN, 30, NaN, NaN, NaN, NaN, 30]), [50, 50, 50, 50, NaN, 30, NaN, NaN, NaN, NaN, 30]);
});

test('fartsovertredelser: episoder, sekunder og poeng', () => {
  const pts = [], limits = [];
  for (let t = 0; t < 120; t++) {
    let kmh = 48;
    if (t >= 20 && t < 30) kmh = 58;          // 10 s, 8 over
    if (t >= 60 && t < 62) kmh = 56;          // 2 s – for kort
    if (t >= 90 && t < 95) kmh = 66;          // 5 s, 16 over – alvorlig
    pts.push({ t, kmh, lat: 63.43, lon: 10.39 + t * 1e-4 });
    limits.push(t < 110 ? 50 : NaN);
  }
  const s = analyzeSpeeding(pts, limits);
  assert.equal(s.episodes.length, 2, 'to episoder (den på 2 s forkastes)');
  assert.equal(s.episodes[0].limit, 50);
  assert.equal(s.episodes[0].over, 8);
  assert.equal(s.episodes[1].over, 16);
  assert.equal(s.secondsOver, 17);
  assert.equal(s.maxOver, 16);
  assert.equal(s.score, Math.round(100 - 1.5 * 17 - 10));
  assert.ok(Math.abs(s.coverage - 110 / 120) < 1e-9);
});

test('enkeltpunkt som avviker fra like naboer jevnes ut', () => {
  assert.deepEqual(smoothBlips([50, 30, 50, 50, 60, 60, 30, 30]), [50, 50, 50, 50, 60, 60, 30, 30]);
});

test('veidata v2: gangfelt, fartsdempere, lyskryss og skilt langs ruten', async () => {
  const { evaluateRoad, signKind } = await import('../js/enrich.js');
  // Rett vei nordover, 1 punkt per sekund, 10 m/s (36 km/t); 55 km/t mellom 40 og 50 s
  const lat0 = 63.43, lon0 = 10.39, mLat = 111320;
  const points = []; let y = 0;
  for (let t = 0; t <= 100; t++) { const kmh = t >= 40 && t <= 50 ? 55 : 36; if (t) y += kmh / 3.6; points.push({ t, lat: lat0 + y / mLat, lon: lon0, kmh }); }
  const at = (m, east = 0) => ({ lat: lat0 + m / mLat, lon: lon0 + east / (mLat * Math.cos(lat0 * Math.PI / 180)) });
  const road = {
    crossings: [at(100), at(103), at(500)],                       // to objekter for samme gangfelt + ett i 55 km/t
    bumps: [{ ...at(800), type: 'Fartshump' }],
    signals: [{ ...at(900), dir: 0 }, { ...at(300, 8), dir: 90 }], // langs vegen / tvers over (bro)
    signs: [{ ...at(200, 6), kind: 'barn' }, { ...at(600, -6), kind: 'barn' }]   // høyre side / venstre side
  };
  const r = evaluateRoad(points, road, []);
  assert.equal(r.crossings.length, 2, 'samme gangfelt i begge retninger teller én gang');
  assert.equal(r.crossings[1].kmh, 55);
  assert.equal(r.bumps.length, 1);
  assert.equal(r.signals.length, 1, 'signalanlegg på tvers (bro) tas ikke med');
  assert.equal(r.signs.length, 1, 'skilt på venstre side gjelder motgående');
  assert.equal(r.signs[0].kind, 'barn');
  assert.equal(signKind('142 - Barn'), 'barn');
  assert.equal(signKind('100.2 - Farlig sving, til venstre'), 'svingV');
  assert.equal(signKind('516 - Gangfelt'), null);
});
