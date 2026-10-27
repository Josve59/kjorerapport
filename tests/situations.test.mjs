import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSituations, situationSummary } from '../js/situations.js';

const points = Array.from({ length: 301 }, (_, i) => ({ t: i, lat: 63.43 + i * 1e-5, lon: 10.39, kmh: 60 }));
const r = {
  points,
  events: [{ kind: 'brake', level: 'harsh', t: 100, g: 0.45, speedKmh: 60, n: 1 }, { kind: 'turn', level: 'brisk', t: 200, g: 0.37, speedKmh: 25, n: 2 }],
  maneuvers: { laneChanges: [], roundabouts: [{ t: 200, tFrom: 195, tTo: 205 }] }
};
const camera = {
  calibrated: true,
  away: [{ t: 96, tEnd: 98.5, dur: 2.5, kmh: 60, metres: 41.7, cls: 'other' }],
  lane: [{ t: 150, dir: null, marked: true, mirror: false, shoulder: false }, { t: 250, dir: null, marked: true, mirror: true, shoulder: true }],
  start: { t: 3, mirror: true, shoulder: false }
};

test('samkjøring: nedbremsing rett etter at blikket var borte er alvorlig', () => {
  const s = buildSituations(r, { camera });
  const brake = s.find(x => x.kind === 'event' && x.event === 'brake');
  assert.equal(brake.level, 'high');
  assert.deepEqual(brake.sources, ['motion', 'gps', 'camera']);
  assert.match(brake.text, /borte fra veien i 2,5 s/);
  const away = s.find(x => x.kind === 'away');
  assert.equal(away.level, 'medium');
  assert.match(away.text, /42 m/);
});

test('samkjøring: feltskifter, igangkjøring og rundkjøring', () => {
  const s = buildSituations(r, { camera });
  const lanes = s.filter(x => x.kind === 'lane');
  assert.equal(lanes[0].level, 'medium');
  assert.equal(lanes[1].level, 'ok');
  assert.ok(lanes[0].sources.includes('marks'));
  assert.equal(s.find(x => x.kind === 'start').level, 'low');
  assert.match(s.find(x => x.event === 'turn').text, /i rundkjøring/);
  const sum = situationSummary(s);
  assert.equal(sum.high, 1);
  assert.equal(sum.ok, 1);
});

test('samkjøring: fart over grensen og uten kamera', () => {
  const sp = { episodes: [{ tFrom: 98, tTo: 104, maxKmh: 72, limit: 50 }, { tFrom: 260, tTo: 270, maxKmh: 63, limit: 50 }] };
  const s = buildSituations(r, { sp, marks: [{ t: 262, cat: 'fart' }, { t: 263, cat: 'felt' }] });
  assert.ok(!s.some(x => x.kind === 'away' || x.kind === 'lane'), 'uten kamera ingen blikk');
  const brake = s.find(x => x.event === 'brake');
  assert.equal(brake.level, 'high', 'kraftig brems og 22 over grensen');
  assert.ok(brake.sources.includes('road'));
  const speed = s.filter(x => x.kind === 'speed');
  assert.equal(speed.length, 1, 'episoden ved bremsen er allerede med');
  assert.equal(speed[0].level, 'medium');
  assert.deepEqual(speed[0].marks, ['fart'], 'ledsagerens merke knyttes til, fasitmerket ikke');
});
