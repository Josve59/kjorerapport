import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeDemo } from '../js/analysis.js';
import { buildSummary, eventsPer10km, eventLabel, headline, evaluateFocus } from '../js/report.js';

const r = analyze(makeDemo());

test('oppsummeringsteksten inneholder poeng, hendelser og tips', () => {
  const text = buildSummary(r, { subtitle: 'test', note: 'Rundkjøringer' });
  assert.match(text, /^Kjørerapport – test/);
  assert.match(text, /Poeng: 82/);
  assert.match(text, /Hendelser \(3\):/);
  assert.match(text, /1\. Kraftig akselerasjon – 1:52/);
  assert.match(text, /Notat: Rundkjøringer/);
  assert.match(text, /Målingene er veiledende/);
  assert.doesNotMatch(text, /Testversjon/);
});

test('hendelser per 10 km', () => {
  const v = eventsPer10km(r);
  assert.ok(v > 6.5 && v < 7.5, `fikk ${v}`);
  assert.equal(eventsPer10km({ stats: { km: 0.1 }, events: [] }), 0);
});

test('hendelsesnavn', () => {
  assert.equal(eventLabel({ kind: 'brake', level: 'brisk' }), 'Brå nedbremsing');
  assert.equal(eventLabel({ kind: 'turn', level: 'harsh' }), 'Svært skarp sving');
});

test('oppsummering: førernavnet står ikke to ganger', () => {
  const r = analyze(makeDemo());
  const first = buildSummary(r, { subtitle: 'tir. 27. okt. · Kari', driver: 'Kari' }).split('\n')[0];
  assert.equal(first.match(/Kari/g).length, 1, first);
  assert.match(buildSummary(r, { subtitle: 'tir. 27. okt.', driver: 'Kari' }).split('\n')[0], /– Kari$/);
});

test('fasit for feltskifter: ledsagerens merker kobles til funne feltskifter', async () => {
  const { laneTruth } = await import('../js/report.js');
  const lc = [{ tFrom: 100, tTo: 106 }, { tFrom: 300, tTo: 305 }];
  const marks = [{ t: 110, cat: 'felt' }, { t: 200, cat: 'felt' }, { t: 302, cat: 'speil' }];
  const f = laneTruth(lc, marks);
  assert.equal(f.marked, 2);
  assert.equal(f.found, 1);
  assert.equal(f.extra, 1);
  assert.deepEqual(f.hits, [true, false]);
  assert.equal(f.missed.length, 1);
  assert.equal(f.missed[0].t, 200);
  assert.equal(laneTruth(lc, [{ t: 110, cat: 'annet' }]), null, 'uten fasitmerker ingen sammenligning');
  assert.equal(laneTruth(lc, [{ t: 110, cat: 'felt' }, { t: 111.5, cat: 'felt' }]).marked, 1, 'dobbelttrykk teller én gang');
});

test('overskriften regnes av kjøringen og sier fra om for høy fart (0.18.3)', () => {
  assert.equal(headline({ overall: 90, overallBase: 100, speed: { score: 74 } }), 'Rolig og jevn kjøring, men litt for høy fart');
  assert.equal(headline({ overall: 60, overallBase: 100, speed: { score: 0 } }), 'Rolig og jevn kjøring, men for høy fart');
  assert.equal(headline({ overall: 72, overallBase: 60, speed: { score: 95 } }), 'Ujevn kjøring', 'god fart, ujevn kjøring');
  assert.equal(headline({ overall: 50, overallBase: 50, speed: { score: 50 } }), 'Mye brå kjøring, og for høy fart');
  assert.equal(headline({ overall: 95 }), 'Rolig og jevn kjøring', 'uten fartsdel: som før, men «jevn» i stedet for «trygg»');
});

test('speil og skulderblikk er ikke «nådd» når ingenting er målt (0.18.3)', () => {
  const base = { ...r, maneuvers: { laneChanges: [], roundabouts: [] } };
  const none = evaluateFocus(['mirror'], { r: base })[0];
  assert.equal(none.state, 'na');
  const cam = evaluateFocus(['mirror'], { r: { ...base, camera: { calibrated: true, lane: [{ t: 10, mirror: false }, { t: 50, mirror: true }] } } })[0];
  assert.equal(cam.state, 'no', 'kameraet så et feltskifte uten speilblikk');
  const ok = evaluateFocus(['mirror'], { r: { ...base, camera: { calibrated: true, lane: [{ t: 50, mirror: true }] } } })[0];
  assert.equal(ok.state, 'ok');
});

import { speedingFor, wrongLimitRuns, dataChecks, gpsGaps, WRONG_M } from '../js/report.js';

/* En rett tur i 60 km/t, ett punkt i sekundet (16,7 m), med fartsgrenser per punkt */
const straight = (limits, kmh = () => 60) => ({ t0: 100, points: limits.map((_, i) => ({ t: i, kmh: kmh(i), lat: 63 + i * 16.67 / 111320, lon: 10 })) });
const fill = (...parts) => parts.flatMap(([n, v]) => Array(n).fill(v));

test('0.26.0: «Feil grense» tar ut farten over den grensen, på strekningen rundt merket', () => {
  // 50, så 40 (der det kjøres 35), så 50 igjen: 60 km/t i begge 50-sonene
  const limits = fill([40, 50], [40, 40], [40, 50]);
  const r = straight(limits, i => (limits[i] === 40 ? 35 : 60)), enrich = { limits };
  const all = speedingFor(r, enrich);
  assert.equal(all.episodes.length, 2, 'uten merke: to perioder i 50-sonene');
  assert.deepEqual(all.ignored, []);
  // Merket trykkes 20 s inn (opptakets tid er rapportens tid + t0)
  const sp = speedingFor(r, enrich, [{ cat: 'grense', t: 120 }, { cat: 'fart', t: 130 }]);
  assert.equal(sp.episodes.length, 1, 'bare den andre 50-sonen teller');
  assert.ok(sp.episodes[0].tFrom >= 80);
  assert.equal(sp.ignored.length, 1);
  assert.ok(sp.ignored[0].tTo < 40);
  assert.ok(sp.secondsOver < all.secondsOver);
  assert.equal(sp.coverage, 1, 'dekningen gjelder hele turen, også strekningen med feil grense');
  assert.deepEqual(sp.wrongRuns, [[0, 39]]);
});

test('0.26.0: en feil grense gjelder høyst en kilometer hver vei, og et merke uten grense i nærheten gjør ingenting', () => {
  const limits = fill([200, 50]);
  const r = straight(limits);
  const [[a, b]] = wrongLimitRuns(r, limits, [{ cat: 'grense', t: 100 + 100 }]);
  assert.ok(100 - a <= WRONG_M / 16.67 + 1 && b - 100 <= WRONG_M / 16.67 + 1, `${a}–${b}`);
  assert.ok(a > 30 && b < 170);
  // Ingen grense der merket ble trykket: nærmeste grense innen 15 s brukes
  const gap = fill([20, NaN], [30, 60]);
  assert.deepEqual(wrongLimitRuns(straight(gap), gap, [{ cat: 'grense', t: 100 + 12 }]), [[20, 49]]);
  assert.deepEqual(wrongLimitRuns(straight(gap), gap, [{ cat: 'grense', t: 100 + 2 }]), [], 'over 15 s unna: ingenting');
});

test('0.26.0: datakvalitet: dekning, merkede grenser, GPS-hull, unøyaktig GPS og varm telefon', () => {
  const limits = fill([30, NaN], [70, 50]);
  const r = straight(limits);
  r.points = r.points.filter(p => p.t < 40 || p.t > 52);   // 14 s mellom to punkter
  const lim = r.points.map(p => limits[p.t]);
  const sp = speedingFor(r, { limits: lim }, [{ cat: 'grense', t: 100 + 70 }]);
  const q = dataChecks(r, { sp, marks: [{ cat: 'grense', t: 170 }], gaps: [], diag: { gpsMedianAcc: 25 }, cameraPlan: { perf: { thermalS: [100, 50, 200, 0] } } });
  const text = q.map(x => x.text).join(' | ');
  assert.match(text, /Fartsgrensen var kjent på 66 %/);
  assert.match(text, /merket fartsgrensen som feil én gang/);
  assert.match(text, /GPS-en var borte én gang \(til sammen 14 s, 0:39\)/);
  assert.match(text, /typisk 25 m/);
  assert.match(text, /Telefonen var varm 57 %/);
  // Når appen var skjult, er hullet allerede forklart
  assert.deepEqual(gpsGaps(r.points, [{ from: 39, to: 53 }]), []);
  // En vanlig tur gir ingen merknader
  const ok = straight(fill([60, 80]));
  assert.deepEqual(dataChecks(ok, { sp: speedingFor(ok, { limits: fill([60, 80]) }), diag: { gpsMedianAcc: 3 }, cameraPlan: { perf: { thermalS: [600, 100, 50, 0] } } }), []);
});
