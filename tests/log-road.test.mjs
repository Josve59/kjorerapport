import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunAltitude, lightClass, roadClass, driveLog, sumLogs } from '../js/log.js';
import { evaluateRoad, parsePoint } from '../js/enrich.js';
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
