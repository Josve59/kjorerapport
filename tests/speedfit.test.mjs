/* js/speedfit.js: fart etter forholdene (0.13.13) – bakketopper fra rotasjonssensoren og fartsdelen av poengene */
import test from 'node:test';
import assert from 'node:assert/strict';
import { crestSpeed, speedScore, totalScore, stopSpeed, crestSight } from '../js/speedfit.js';

/* En oppdiktet tur: telefonen står rett opp (tyngden langs −y), kjøreretningen er −z. Bilen kjører v m/s og går
   over en topp med radius R etter 60 s. Først litt gass og brems, så appen finner kjøreretningen. */
function trip({ v = 20, R = 250, lines = true, webkit = false } = {}) {
  const loc = [], gyro = [], grav = [], acc = [], road = [];
  const speed = t => (t < 10 ? 10 + t : t < 20 ? 20 - (t - 10) * 0.5 : t < 30 ? 15 + (t - 20) * (v - 15) / 10 : v);
  const accel = t => (t < 10 ? 1 : t < 20 ? -0.5 : t < 30 ? (v - 15) / 10 : 0);
  const crestDur = (8 * Math.PI / 180) * R / v;   // 8 grader over toppen
  for (let t = 0; t <= 120; t += 1) loc.push({ t, lat: 60 + t * 1e-4, lon: 10, speed: speed(t), bearing: 0, acc: 3 });
  for (let i = 0; i <= 120 * 20; i++) {
    const t = i / 20, onCrest = t >= 60 && t < 60 + crestDur;
    // nesa ned = negativ rotasjon om høyreaksen. Høyre er +x når telefonen vender mot føreren og bilen kjører mot −z
    const rate = onCrest ? -(v / R) : 0;
    const g = { t, x: rate, y: 0, z: 0 };
    gyro.push(webkit ? { t, x: g.y, y: g.z, z: g.x } : g);
    grav.push({ t, x: 0, y: -9.81, z: 0 });
    acc.push({ t, x: 0, y: 0, z: -accel(t) });
    if (i % 2 === 0) road.push({ t, lane: { l: lines, r: lines } });
  }
  return { loc, gyro, grav, acc, road };
}

test('bakketopp: krapp topp i 72 km/t er for fort, slak topp er greit', () => {
  const sharp = crestSpeed(trip({ v: 20, R: 250 }));
  assert.equal(sharp.n, 1);
  assert.equal(sharp.crests.length, 1);
  const c = sharp.crests[0];
  assert.ok(Math.abs(c.t - 60) < 1.5 && Math.abs(c.kmh - 72) <= 1, JSON.stringify(c));
  assert.ok(c.radius >= 250 && c.radius < 300, 'radius ' + c.radius + ' (litt for stor for en kort topp, i førerens favør)');
  assert.ok(c.safeKmh > 55 && c.safeKmh < 68 && !c.narrow, 'trygg fart ' + c.safeKmh);
  const gentle = crestSpeed(trip({ v: 20, R: 1500 }));
  assert.equal(gentle.n, 1);
  assert.equal(gentle.crests.length, 0, 'sikten rekker');
  assert.equal(crestSpeed(trip({ v: 12, R: 250 })).crests.length, 0, '43 km/t over samme topp er greit');
});

test('bakketopp: strengere uten midtlinje og på glatt føre, og samme svar med WebKit-rekkefølgen på sensoren', () => {
  const lined = crestSpeed(trip({ v: 15, R: 250 })), bare = crestSpeed(trip({ v: 15, R: 250, lines: false }));
  assert.equal(lined.crests.length, 0, '54 km/t med midtlinje: rekker å stoppe på sikten');
  assert.equal(bare.crests.length, 1, 'uten midtlinje: halve sikten til en møtende bil');
  assert.ok(bare.crests[0].narrow && bare.crests[0].safeKmh < 54);
  assert.equal(crestSpeed(trip({ v: 17, R: 250 }), { surface: 'snow' }).crests.length, 1, 'snø: lengre bremsestrekning');
  assert.equal(crestSpeed(trip({ v: 17, R: 250 })).crests.length, 0);
  assert.deepEqual(crestSpeed(trip({ v: 20, R: 250, webkit: true }), { axes: 'webkit' }).crests, crestSpeed(trip({ v: 20, R: 250 })).crests);
  assert.equal(crestSpeed({ loc: [], gyro: [], grav: [], acc: [] }), null, 'uten data: ikke målt');
});

test('bakketopp: sikt og stopp regnet for hånd', () => {
  assert.ok(Math.abs(crestSight(250) - (Math.sqrt(550) + Math.sqrt(300))) < 1e-9);   // 23,5 + 17,3 = 40,8 m
  const v = stopSpeed(40.8, 0.7 * 9.81);   // v + v²/13,7 = 40,8 → 17,7 m/s
  assert.ok(Math.abs(v + v * v / (2 * 0.7 * 9.81) - 40.8) < 1e-6 && Math.abs(v * 3.6 - 63.7) < 1);
});

test('fartsdelen: trekk for tid over grensen og for bakketopper, per 10 km', () => {
  assert.equal(speedScore({}), null, 'ingenting målt: totalpoengene som før');
  assert.equal(totalScore(98, null), 98);
  const clean = speedScore({ speeding: { episodes: [] }, crest: { crests: [] }, km: 40 });
  assert.equal(clean.score, 100);
  assert.equal(totalScore(98, clean), 99);
  // 40 km: tre korte overtredelser litt over, én på 15 over i 16 s, og tre bakketopper
  const sp = { episodes: [{ tFrom: 0, tTo: 4, over: 6 }, { tFrom: 50, tTo: 54, over: 5 }, { tFrom: 90, tTo: 94, over: 7 }, { tFrom: 200, tTo: 216, over: 15 }] };
  const s = speedScore({ speeding: sp, crest: { crests: [{ kmh: 64, safeKmh: 54 }, { kmh: 60, safeKmh: 55 }, { kmh: 75, safeKmh: 58 }] }, km: 40 });
  assert.equal(s.limitPen, 5.5);   // (3 × 4 × 0,5 + 8 × 2) × 10/40
  assert.equal(s.crestPen, 4);   // (4 + 4 + 8) × 10/40
  assert.equal(s.score, 91);
  assert.equal(totalScore(98, s), 95);
  assert.deepEqual([s.over, s.crests], [4, 3]);
  // Bare bakketopper (fartsgrensene ikke hentet): den delen teller alene
  assert.equal(speedScore({ crest: { crests: [] }, km: 10 }).over, null);
});
