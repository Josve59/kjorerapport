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
