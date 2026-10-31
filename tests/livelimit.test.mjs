import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveLimit } from '../js/livelimit.js';

const tick = () => new Promise(r => setTimeout(r, 0));

test('aktiv fartsgrense: hentes rundt bilen, skifter først når to punkter er enige', async () => {
  // Vei østover langs 63.40: 60 km/t fram til lon 10.50, så 80
  const seg = (lon0, lon1, limit) => ({ limit, pts: [{ lat: 63.4, lon: lon0 }, { lat: 63.4, lon: lon1 }] });
  let calls = 0;
  const ll = createLiveLimit({ fetchBox: async () => { calls++; return [seg(10.3, 10.5, 60), seg(10.5, 10.7, 80)]; } });
  assert.deepEqual(ll.update({ lat: 63.4, lon: 10.45 }), { limit: null, status: 'venter' });
  await tick();
  assert.equal(ll.update({ lat: 63.4, lon: 10.451 }).limit, 60);
  ll.update({ lat: 63.4, lon: 10.4995 });
  assert.equal(ll.update({ lat: 63.4, lon: 10.5005 }).limit, 60, 'ett punkt med 80 er ikke nok');
  assert.equal(ll.update({ lat: 63.4, lon: 10.502 }).limit, 80);
  // Langt fra veien: ukjent
  for (let i = 0; i < 3; i++) ll.update({ lat: 63.41, lon: 10.47 });
  assert.deepEqual(ll.update({ lat: 63.41, lon: 10.47 }), { limit: null, status: 'ukjent' });
  // Utenfor området (det første er sentrert på 10.45): nytt område hentes
  await tick();
  const before = calls;
  ll.update({ lat: 63.4, lon: 10.56 });
  await tick();
  assert.ok(calls > before, 'henter nytt område i forkant');
});

test('aktiv fartsgrense: uten nett vises «–», og nytt forsøk først etter 30 s', async () => {
  let t = 0, calls = 0;
  const ll = createLiveLimit({ fetchBox: async () => { calls++; throw new Error('offline'); }, now: () => t });
  ll.update({ lat: 63.4, lon: 10.4 });
  await tick(); await tick();
  assert.deepEqual(ll.update({ lat: 63.4, lon: 10.4 }), { limit: null, status: 'feil' });
  assert.equal(calls, 1);
  t = 31000; ll.update({ lat: 63.4, lon: 10.4 });
  assert.equal(calls, 2);
});
