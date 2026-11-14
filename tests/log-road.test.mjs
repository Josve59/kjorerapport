import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunAltitude, lightClass, roadClass, driveLog, sumLogs } from '../js/log.js';
import { evaluateRoad, parsePoint, matchMotorway } from '../js/enrich.js';
import { analyze, makeDemo } from '../js/analysis.js';

const near = (a, e, tol, m) => assert.ok(Math.abs(a - e) <= tol, `${m}: fikk ${a}, ventet ${e} ± ${tol}`);

test('solhøyde i Trondheim: midtsommer, vintersolverv og natt', () => {
  near(sunAltitude(new Date(Date.UTC(2026, 5, 21, 11, 20)), 63.43, 10.39), 50.0, 1.5, 'midtsommer middag');
  near(sunAltitude(new Date(Date.UTC(2026, 11, 21, 11, 20)), 63.43, 10.39), 3.1, 1.5, 'vintersolverv middag');
  assert.ok(sunAltitude(new Date(Date.UTC(2026, 9, 24, 22, 2)), 63.43, 10.39) < -20, 'første tur, kl. 00:02');
  assert.equal(lightClass(-10), 'dark'); assert.equal(lightClass(-3), 'twilight'); assert.equal(lightClass(5), 'day');
});

test('veitype fra fartsgrense eller fart', () => {
  assert.equal(roadClass(50, 99), 'by'); assert.equal(roadClass(80, 0), 'land'); assert.equal(roadClass(110, 0), 'motor');
  assert.equal(roadClass(NaN, 48), 'by'); assert.equal(roadClass(NaN, 70), 'land'); assert.equal(roadClass(NaN, 95), 'motor');
});

test('motorvei fra Statens vegvesen går foran fartsgrensen (0.18.0)', () => {
  assert.equal(roadClass(80, 80, 1), 'motor', 'motorvei med 80 km/t');
  assert.equal(roadClass(70, 70, 2), 'motor', 'motortrafikkvei med 70 km/t');
  assert.equal(roadClass(90, 90, 0), 'land', 'vanlig vei med 90 km/t er landevei når det er kjent');
  assert.equal(roadClass(NaN, 95, 0), 'land');
  assert.equal(roadClass(50, 50, 0), 'by');
  assert.equal(roadClass(90, 90, undefined), 'motor', 'uten motorveidata: som før');
});

test('motorveier langs kjøreretningen, ikke vei på tvers (0.18.0)', () => {
  // 120 s nordover i 80 km/t (ca. 22 m/s); motorveien følger ruten de første 60 s, en bro krysser på tvers etterpå
  const pts = Array.from({ length: 120 }, (_, i) => ({ t: i, lat: 63.3 + i * 0.0002, lon: 10.4, kmh: 80 }));
  const along = { limit: 1, pts: [{ lat: 63.2999, lon: 10.4 }, { lat: 63.3 + 59 * 0.0002, lon: 10.4 }] };
  const across = { limit: 2, pts: [{ lat: 63.3 + 90 * 0.0002, lon: 10.399 }, { lat: 63.3 + 90 * 0.0002, lon: 10.401 }] };
  const m = matchMotorway(pts, [along, across]);
  assert.ok(m.slice(0, 58).every(v => v === 1), 'motorveien treffes');
  assert.ok(m.slice(62).every(v => v === 0), 'broen på tvers teller ikke');
  const log = driveLog({ points: pts, t0: 0 }, Date.UTC(2026, 10, 14, 12), pts.map(() => 80), m);
  assert.ok(log.sec.motor >= 57 && log.sec.motor <= 61, `motorvei ${log.sec.motor} s`);
  assert.ok(log.sec.land >= 58, 'resten er landevei');
  assert.equal(log.roadSource, 'motorvei');
});

test('kø på motorveien teller som motorvei (0.18.0)', () => {
  // 30 s i 80 km/t, så 90 s nesten stille (kø), så 30 s i 80 km/t, alt langs motorveien
  const pts = []; let lat = 63.3;
  for (let i = 0; i < 150; i++) { const kmh = i < 30 || i >= 120 ? 80 : 1; lat += kmh / 3.6 / 111320; pts.push({ t: i, lat, lon: 10.4, kmh }); }
  const mw = { limit: 1, pts: [{ lat: 63.2999, lon: 10.4 }, { lat: lat + 0.001, lon: 10.4 }] };
  const m = matchMotorway(pts, [mw]);
  assert.ok(m.filter(v => v === 1).length >= 145, `bare ${m.filter(v => v === 1).length} av 150 punkter ble motorvei`);
});

test('tunnel: et GPS-hull med mulig fart telles i loggen (0.18.0)', () => {
  // 60 s før, 60 s uten GPS (1,3 km, 80 km/t), 60 s etter
  const pts = []; let lat = 63.3;
  const step = 80 / 3.6 / 111320;
  for (let i = 0; i <= 60; i++) pts.push({ t: i, lat: lat + i * step, lon: 10.4, kmh: 80 });
  for (let i = 120; i <= 180; i++) pts.push({ t: i, lat: lat + i * step, lon: 10.4, kmh: 80 });
  const log = driveLog({ points: pts, t0: 0 }, Date.UTC(2026, 10, 14, 12), pts.map(() => 80));
  near(log.total.sec, 180, 1, 'tunnelen er med');
  // Bilen står 4 min uten GPS og flytter seg 50 m (parkeringshus): telles ikke
  const park = [{ t: 0, lat: 63.3, lon: 10.4, kmh: 0 }, { t: 240, lat: 63.3 + 50 / 111320, lon: 10.4, kmh: 5 }];
  assert.equal(driveLog({ points: park, t0: 0 }, Date.UTC(2026, 10, 14, 12)).total.sec, 0);
});

test('kjørelogg for demoturen om natta og om dagen', () => {
  const r = analyze(makeDemo());
  const night = driveLog(r, Date.UTC(2026, 9, 24, 22, 0));
  const day = driveLog(r, Date.UTC(2026, 5, 21, 10, 0));
  near(night.total.km, r.stats.km, 0.05, 'km stemmer med rapporten');
  assert.ok(night.light.dark > 250 && night.light.day === 0);
  assert.ok(day.light.day > 250 && day.light.dark === 0);
  assert.ok(night.sec.by > 0 && night.sec.land > 0, 'demoturen har både by- og landeveisfart');
  const s = sumLogs([night, day]);
  near(s.total.km, 2 * r.stats.km, 0.1, 'summering');
});

test('WKT-punkt', () => {
  assert.deepEqual(parsePoint('POINT Z (63.4490125 10.19479187 5.1)'), { lat: 63.4490125, lon: 10.19479187 });
  assert.deepEqual(parsePoint('POINT(63.42 10.4)'), { lat: 63.42, lon: 10.4 });
});

test('stoppskilt, vikeplikt og rundkjøring vurderes mot ruten', () => {
  // Rett strekning nordover, 1 punkt per sekund
  const pts = [];
  const sp = [40, 40, 40, 30, 20, 10, 4, 1, 0.5, 6, 15, 25, 35, 40, 40, 40, 40, 40, 40, 40, 30, 20, 12, 8, 12, 20, 30, 40, 40, 40];
  let lat = 63.43;
  for (let t = 0; t < sp.length; t++) { pts.push({ t, lat, lon: 10.39, kmh: sp[t] }); lat += sp[t] / 3.6 / 111320; }
  const at = t => ({ lat: pts[t].lat + 3 / 111320, lon: 10.39 });
  const road = {
    stops: [at(8), at(16)],          // ved første stopp (bilen stoppet), og ett i 40 km/t (sidevei – ignoreres)
    giveway: [at(23)],               // bremset til 8 km/t
    roundabouts: [{ lat: pts[26].lat, lon: 10.3901, d: 20, name: 'Testrundkjøring' }]
  };
  const ev = evaluateRoad(pts, road, [{ n: 1, t: 26 }]);
  assert.equal(ev.stops.length, 1);
  assert.equal(ev.stops[0].full, true);
  assert.equal(ev.giveway.length, 1);
  assert.equal(ev.giveway[0].minKmh, 8);
  assert.equal(ev.roundabouts.length, 1);
  assert.deepEqual(ev.roundabouts[0].events, [1]);
});
