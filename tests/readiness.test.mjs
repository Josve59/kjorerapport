import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readiness, READY, MANDATORY } from '../js/readiness.js';

// En tur: km, minutter per veitype og i mørke, poeng, kraftige hendelser, tid over grensen, manøvrer, kamera
const row = ({ km = 20, by = 20, land = 10, motor = 0, dark = 0, score = 90, harsh = 0, over = null, rb = 1, lc = 1, cam = null } = {}) => ({
  d: { id: Math.random().toString(36) },
  res: { stats: { km }, overall: score, events: Array.from({ length: harsh }, () => ({ level: 'harsh' })), maneuvers: { roundabouts: Array(rb).fill({}), laneChanges: Array(lc).fill({}) }, camera: cam },
  log: { sec: { by: by * 60, land: land * 60, motor: motor * 60 }, light: { day: 0, twilight: 0, dark: dark * 60 } },
  sp: over === null ? null : { secondsOver: over, episodes: [] },
  road: null
});
const all = Object.fromEntries(MANDATORY.map(id => [id, { done: true }]));

test('for få turer: for tidlig å si, og jevn kjøring telles ikke ennå', () => {
  const r = readiness([row(), row()]);
  assert.equal(r.level, 'tidlig');
  assert.equal(r.items.find(i => i.id === 'smooth').ok, null);
});

test('en elev som har øvd mye og jevnt, med alt krysset av, ser klar ut', () => {
  const rows = Array.from({ length: 100 }, () => row({ km: 25, by: 10, land: 10, motor: 5, dark: 2, over: 0, rb: 1, lc: 1, cam: { calibrated: true, frontShare: 0.9, perMin: 9, lane: [{ mirror: true, shoulder: true }] } }));
  const r = readiness(rows, { plan: all });
  assert.equal(r.items.filter(i => i.ok === false).map(i => i.id).join(), '');
  assert.equal(r.level, 'klar');
  assert.equal(r.next.length, 0);
});

test('mangler motorvei, mørke og obligatoriske kurs: ikke klar, og neste steg sier hva', () => {
  const rows = Array.from({ length: 10 }, () => row({ km: 30, by: 30, land: 30, motor: 0, dark: 0, over: 0, rb: 2, lc: 2 }));
  const r = readiness(rows, { plan: { tgk: { done: true }, teori: { done: true } } });
  const bad = r.items.filter(i => i.ok === false).map(i => i.id);
  assert.deepEqual(bad, ['km', 'variety', 'dark', 'mandatory']);
  assert.equal(r.level, 'ikke');
  assert.match(r.items.find(i => i.id === 'variety').tip, /motorvei/);
  assert.match(r.items.find(i => i.id === 'mandatory').tip, /sikkerhetskurs på bane/);
  assert.equal(r.next.length, 3);
});

test('kraftige hendelser de siste turene og mye over fartsgrensen trekker ned', () => {
  const rows = [row({ harsh: 1, over: 40 }), row({ over: 40 }), row({ over: 40 })];
  const r = readiness(rows);
  assert.equal(r.items.find(i => i.id === 'smooth').ok, false);
  assert.equal(r.items.find(i => i.id === 'speed').ok, false);
});

test('uten kamera og uten veidata telles ikke speil og fart', () => {
  const r = readiness([row(), row(), row()]);
  assert.equal(r.items.find(i => i.id === 'mirrors').ok, null);
  assert.equal(r.items.find(i => i.id === 'speed').ok, null);
  assert.equal(r.counted, r.items.length - 2);
  assert.equal(READY.km, 2000);
});
