import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeDemo } from '../js/analysis.js';
import { buildSummary, eventsPer10km, eventLabel } from '../js/report.js';

const r = analyze(makeDemo());

test('oppsummeringsteksten inneholder poeng, hendelser og tips', () => {
  const text = buildSummary(r, { subtitle: 'test', note: 'Rundkjøringer' });
  assert.match(text, /^Kjørerapport – test/);
  assert.match(text, /Poeng: 82/);
  assert.match(text, /Hendelser \(3\):/);
  assert.match(text, /1\. Kraftig akselerasjon – 1:52/);
  assert.match(text, /Notat: Rundkjøringer/);
  assert.match(text, /Testversjon/);
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
