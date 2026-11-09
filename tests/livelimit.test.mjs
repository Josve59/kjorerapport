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

test('aktiv fartsgrense: kryssende gate gir ikke 80→30→80 (0.13.1)', async () => {
  // Hovedvei nordover (80) langs lon 10.40, sidegate østover (30) langs lat 63.40. GPS-en ligger 8 m øst for
  // hovedveien, så i krysset er sidegaten nærmest. Bilen sakker ned gjennom krysset (punkter 2 m fra hverandre).
  const main = { limit: 80, pts: [{ lat: 63.39, lon: 10.40 }, { lat: 63.41, lon: 10.40 }] };
  const side = { limit: 30, pts: [{ lat: 63.40, lon: 10.39 }, { lat: 63.40, lon: 10.41 }] };
  const ll = createLiveLimit({ fetchBox: async () => [main, side] });
  const lon = 10.40016;   // ca. 8 m øst
  ll.update({ lat: 63.3990, lon }); await tick();
  const seen = [];
  for (let lat = 63.3995; lat < 63.39985; lat += 0.0001) seen.push(ll.update({ lat, lon }).limit);   // 11 m mellom punktene
  for (let k = -3; k <= 3; k++) seen.push(ll.update({ lat: 63.4 + k * 0.00002, lon }).limit);
  for (let lat = 63.4001; lat < 63.4006; lat += 0.0001) seen.push(ll.update({ lat, lon }).limit);
  assert.ok(seen.slice(2).every(v => v === 80), `hele veien gjennom krysset: 80, fikk ${seen.join(',')}`);
  // Svinger bilen inn i sidegaten, skifter grensen til 30
  for (let i = 1; i <= 5; i++) ll.update({ lat: 63.40, lon: 10.40 + i * 0.0002 });
  assert.equal(ll.limit, 30, 'inne i sidegaten');
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
