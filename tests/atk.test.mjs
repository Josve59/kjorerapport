import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRoad, ctlDir, parseLines } from '../js/enrich.js';
import { createLiveAtk } from '../js/liveatk.js';

// Rett veg østover langs 63.40, 1 punkt per sekund i 72 km/t (20 m/s)
const lonPerM = 1 / (111320 * Math.cos(63.4 * Math.PI / 180));
const drive = (n, kmh = 72, dir = 1) => Array.from({ length: n }, (_, i) => ({ t: i, lat: 63.4, lon: 10.4 + dir * i * (kmh / 3.6) * lonPerM, kmh }));

test('ATK: kontrollretning og MULTILINESTRING leses', () => {
  assert.equal(ctlDir('Med metreringsretning'), 'med');
  assert.equal(ctlDir('Mot metreringsretning'), 'mot');
  assert.equal(ctlDir(''), null);
  assert.equal(parseLines('MULTILINESTRING Z ((63.1 10.1 5, 63.2 10.2 6),(63.3 10.3 7))').length, 3);
});

test('ATK: fotoboks i vår retning teller, motgående ikke; strekningsmåling gir snittfart', () => {
  const pts = drive(200);   // 4 km østover
  const at = m => ({ lat: 63.4, lon: 10.4 + m * lonPerM });
  const limits = pts.map(() => 70);
  const road = {
    // Metreringsretning østover (90°): «med» måler oss, «mot» måler motgående
    atk: [{ ...at(1000), name: 'Boks mot øst (P1)', ctl: 'med', mdir: 90 }, { ...at(1010), name: 'Boks mot vest (P2)', ctl: 'mot', mdir: 90 }, { ...at(2500), name: 'Ukjent', ctl: null, mdir: null }],
    // Strekning 1–3 km, geometri østover; to objekter (en per retning)
    sections: [
      { name: 'Test mot øst (S1)', ctl: 'med', pts: [at(1000), at(2000), at(3000)] },
      { name: 'Test mot vest (S2)', ctl: 'mot', pts: [at(1000), at(2000), at(3000)] }
    ]
  };
  const ev = evaluateRoad(pts, road, [], limits);
  assert.deepEqual(ev.atk.map(a => [a.name, a.sure]), [['Boks mot øst (P1)', true], ['Ukjent', false]]);
  assert.equal(ev.atk[0].limit, 70);
  assert.equal(ev.sections.length, 1);
  assert.equal(ev.sections[0].name, 'Test mot øst (S1)');
  assert.ok(Math.abs(ev.sections[0].avgKmh - 72) <= 2, 'snitt ' + ev.sections[0].avgKmh);
  // Samme veg vestover: bare boksen og strekningen for vest
  const west = drive(200, 72, -1).map(p => ({ ...p, lon: p.lon + 4000 * lonPerM }));
  const evW = evaluateRoad(west, road, [], limits);
  assert.deepEqual(evW.atk.map(a => a.name), ['Ukjent', 'Boks mot vest (P2)']);
  assert.deepEqual(evW.sections.map(s => s.name), ['Test mot vest (S2)']);
});

test('ATK: strekning gjennom tunnel med GPS-hull får riktig snitt', () => {
  const pts = drive(200).filter(p => p.t < 60 || p.t > 130);   // 70 s uten posisjoner midt i
  const at = m => ({ lat: 63.4, lon: 10.4 + m * lonPerM });
  const ev = evaluateRoad(pts, { sections: [{ name: 'Tunnel (S1)', ctl: 'med', pts: [at(1000), at(3000)] }] }, [], null);
  assert.equal(ev.sections.length, 1);
  assert.ok(Math.abs(ev.sections[0].avgKmh - 72) <= 3, 'snitt ' + ev.sections[0].avgKmh);
});

test('ATK live: «Fotoboks om …» foran i vår retning, og løpende snitt på strekningen', () => {
  const at = m => ({ lat: 63.4, lon: 10.4 + m * lonPerM });
  const live = createLiveAtk();
  const segs = [{ pts: [at(0), at(5000)] }];   // fartsgrensestrekning østover = metreringsretning
  live.load({ points: [{ ...at(1500), name: 'P1', ctl: 'med' }, { ...at(1600), name: 'P2', ctl: 'mot' }], sections: [{ name: 'S1', ctl: 'med', pts: [at(2000), at(3000)] }] }, segs);
  const seen = [];
  for (const p of drive(200)) { const r = live.update(p); seen.push(r ? r.text : null); }
  assert.ok(seen.slice(40, 70).some(x => /^Fotoboks om/.test(x || '')), 'varsel før boksen ved 1500 m');
  assert.ok(seen.slice(102, 148).every(x => /^Strekningsmåling · snitt/.test(x || '')), 'snitt underveis');
  const fin = seen.slice(148, 170).find(x => /ferdig/.test(x || ''));
  assert.ok(fin && /snitt 7[12] km\/t/.test(fin), fin);
  // Motsatt retning: ingen boks foran fra P1, men P2 (mot) gjelder
  const live2 = createLiveAtk();
  live2.load({ points: [{ ...at(1500), name: 'P1', ctl: 'med' }], sections: [] }, segs);
  const west = drive(200, 72, -1).map(p => ({ ...p, lon: p.lon + 4000 * lonPerM }));
  assert.ok(west.every(p => !live2.update(p)), 'P1 måler ikke vestgående');
});
