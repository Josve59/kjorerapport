/* js/laneease.js: feltlinjene på skjermen glir mot siste svar og tones inn og ut (0.13.9) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaneEase } from '../js/laneease.js';

const line = (x, extra = {}) => ({ pts: Array.from({ length: 16 }, (_, i) => [x + i, 900 - i * 20]), ...extra });

test('feltlinjer på skjermen: tones inn, glir mot nytt svar og tones ut', () => {
  const e = createLaneEase();
  let o = e.step({ left: line(100), right: line(500) }, 0, { ansAt: 0 });
  assert.equal(o.left.alpha, 0, 'starter usynlig');
  for (let t = 16; t <= 600; t += 16) o = e.step({ left: line(100), right: line(500) }, t, { ansAt: 0 });
  assert.ok(o.left.alpha > 0.95 && o.fill > 0.95, 'tonet inn');
  // Nytt svar 10 piksler til siden: ett bilde senere er linjen bare et stykke på vei, nederst lengst
  o = e.step({ left: line(110), right: line(500) }, 616, { ansAt: 333 });
  const near = o.left.pts[0][0], far = o.left.pts[15][0] - 15;
  assert.ok(near > 100 && near < 103, `nederst ${near}`);
  assert.ok(far > 100 && far < near, 'lengst fram glir saktest');
  for (let t = 632; t <= 2000; t += 16) o = e.step({ left: line(110), right: line(500) }, t, { ansAt: 333 });
  assert.ok(Math.abs(o.left.pts[15][0] - 125) < 0.5, 'kommer fram');
  // Linjen forsvinner: tones ut der den sto, og er borte etter en stund
  o = e.step({ left: null, right: line(500) }, 2016, { ansAt: 666 });
  assert.ok(o.left && o.left.alpha < 1 && o.left.alpha > 0.8);
  assert.ok(o.fill < 1, 'fyllet tones med');
  for (let t = 2032; t <= 3200; t += 16) o = e.step({ left: null, right: line(500) }, t, { ansAt: 666 });
  assert.equal(o.left, null);
  assert.equal(o.fill, 0);
});

test('feltlinjer på skjermen: få svar gir roligere gliding, langt hopp tones inn på nytt sted', () => {
  const run = gap => {
    const e = createLaneEase();
    let o, ans = 0;
    for (let t = 0; t <= 4000; t += 16) { if (t - ans >= gap) ans = t; o = e.step({ left: line(100) }, t, { ansAt: ans }); }
    const interval = o.interval;
    o = e.step({ left: line(120) }, 4016, { ansAt: ans });
    return { moved: o.left.pts[0][0] - 100, interval };
  };
  const fast = run(125), slow = run(333);
  assert.ok(Math.abs(fast.interval - 128) < 12 && Math.abs(slow.interval - 336) < 12, `${fast.interval} ${slow.interval}`);
  assert.ok(slow.moved < fast.moved, 'tre svar i sekundet: linjen glir saktere enn med åtte');
  // Feltskifte: linjen flytter seg 200 piksler. Den sveiper ikke over veien, men tones inn der den er nå
  const e = createLaneEase();
  let o;
  for (let t = 0; t <= 800; t += 16) o = e.step({ left: line(100) }, t, { ansAt: 0, width: 720 });
  o = e.step({ left: line(300) }, 816, { ansAt: 333, width: 720 });
  assert.equal(o.left.pts[0][0], 300);
  assert.ok(o.left.alpha <= 0.35, "starter svakt");
  // Stiplet linje (etter feltbredden) er svakere enn en sett linje, og en båret linje ligger mellom
  const p = createLaneEase();
  let a;
  for (let t = 0; t <= 2000; t += 16) a = p.step({ left: line(100, { predicted: true }), right: line(500, { carried: true }) }, t, {});
  assert.ok(Math.abs(a.left.alpha - 0.6) < 0.02 && a.left.predicted);
  assert.ok(Math.abs(a.right.alpha - 0.82) < 0.02 && !a.right.predicted);
});
