import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tolerance, intensity, createSpeedWarn, beepInterval } from '../js/speedwarn.js';
import { surfaceFactor, suggestSurface, surfaceSplit, dayKey } from '../js/surface.js';
import { checkCalibration, facePosition } from '../js/calibcheck.js';
import { gameState, unlockedBy, levelFor, xpForLevel, streakAt, weekStart } from '../js/game.js';
import { setViewMode, isTeacher, isSchool, plusFor, modeFromLegacy, students, scopeDriver, personKey, recordDriver, homeworkFor, schoolInfo } from '../js/modes.js';
import { rolling, periodStats } from '../js/devchart.js';
import { sumLogs } from '../js/log.js';

/* ---------- Fartsvarsel ---------- */
test('fartsvarsel: samme margin som politiet (3 km/t, 3 % over 100)', () => {
  assert.equal(tolerance(50), 3);
  assert.equal(tolerance(100), 3);
  assert.equal(tolerance(110), 4);
});
test('fartsvarsel: styrken vokser eksponentielt og flater ut', () => {
  assert.equal(intensity(0), 0);
  assert.ok(intensity(3) > 0.3 && intensity(3) < 0.4);
  assert.ok(intensity(15) > 0.85 && intensity(15) < 1);
  assert.ok(beepInterval(1) < beepInterval(0.2));
});
test('fartsvarsel: først etter 2 sekunder over grensen, og borte når farten er nede', () => {
  const w = createSpeedWarn();
  assert.equal(w.step({ kmh: 58, limit: 50, t: 0 }).level, 0);
  assert.equal(w.step({ kmh: 58, limit: 50, t: 1 }).level, 0);
  const on = w.step({ kmh: 58, limit: 50, t: 2.1 });
  assert.ok(on.level > 0 && on.beep);
  assert.equal(w.step({ kmh: 58, limit: 50, t: 2.5 }).beep, false);   // ikke pip hver gang
  assert.equal(w.step({ kmh: 50, limit: 50, t: 3 }).level, 0);
  assert.equal(w.step({ kmh: 53, limit: 50, t: 10 }).level, 0);       // innenfor marginen
  assert.equal(w.step({ kmh: 80, limit: null, t: 11 }).level, 0);     // ukjent grense: aldri varsel
});

/* ---------- Føre ---------- */
test('føre: lavere grenser på glatt føre, med gulv', () => {
  assert.equal(surfaceFactor('dry'), 1);
  assert.equal(surfaceFactor(''), 1);
  assert.ok(surfaceFactor('wet') < 1 && surfaceFactor('wet') > 0.8);
  assert.ok(surfaceFactor('snow') < surfaceFactor('wet'));
  assert.ok(surfaceFactor('ice') >= 0.4 && surfaceFactor('ice') <= surfaceFactor('snow'));
});
test('føre: forslag er dagens valg, ellers tørt om sommeren og ingen om vinteren', () => {
  const jun = new Date(2026, 5, 3), des = new Date(2026, 11, 3);
  assert.equal(suggestSurface(null, jun), 'dry');
  assert.equal(suggestSurface(null, des), '');
  assert.equal(suggestSurface({ id: 'ice', day: dayKey(des) }, des), 'ice');
  assert.equal(suggestSurface({ id: 'ice', day: '2026-12-1' }, des), '');
});
test('føre: tiden summeres i kjøreloggen', () => {
  const lg = (id, sec) => ({ sec: { by: sec, land: 0, motor: 0 }, km: { by: 1, land: 0, motor: 0 }, light: { day: sec, twilight: 0, dark: 0 }, lightKm: { day: 1, twilight: 0, dark: 0 }, total: { sec, km: 1 }, surface: surfaceSplit(id, sec) });
  const t = sumLogs([lg('snow', 600), lg('', 300), lg('snow', 60)]);
  assert.equal(t.surface.snow, 660);
  assert.equal(t.surface.unknown, 300);
});

/* ---------- Kalibreringssjekk ---------- */
const poses = (n, o = {}) => Array.from({ length: n }, () => ({ yaw: 0, pitch: 0, x: 0, y: 0, z: -50, ...o }));
test('kalibrering: uten kalibrering er det et punkt å gjøre', () => {
  assert.equal(checkCalibration(null, poses(20)).state, 'none');
});
test('kalibrering: ansiktet på samme sted er ok, flyttet holder sies fra om', () => {
  const calib = { ok: true, forward: { yaw: 0, pitch: 0 }, left: { yaw: -40, pitch: 0 }, right: { yaw: 40, pitch: 0 }, rear: { yaw: 20, pitch: 15 }, pos: facePosition(poses(20)), at: new Date().toISOString() };
  assert.equal(checkCalibration(calib, poses(20, { yaw: 25 })).state, 'ok');           // ser et annet sted, men holderen står likt
  assert.equal(checkCalibration(calib, poses(20, { x: 12 })).state, 'moved');
  assert.equal(checkCalibration(calib, poses(5)).state, 'wait');
});
test('kalibrering: eldre kalibrering uten posisjon bruker retningene', () => {
  const calib = { ok: true, forward: { yaw: 0, pitch: 0 }, left: { yaw: -40, pitch: 0 }, right: { yaw: 40, pitch: 0 }, rear: { yaw: 20, pitch: 15 } };
  assert.equal(checkCalibration(calib, poses(20, { x: NaN })).state, 'ok');
  assert.equal(checkCalibration(calib, poses(20, { x: NaN, yaw: -20, pitch: -25 })).state, 'moved');
});

/* ---------- Spill ---------- */
const DAY = 86400000;
const row = (id, t, { km = 10, min = 20, score = 90, events = 0, dark = 0, motor = 0, rb = 0, surface = '' } = {}) => ({
  d: { id, startedAt: new Date(t).toISOString(), surface },
  res: { stats: { km }, overall: score, events: Array(events).fill({}), maneuvers: { roundabouts: Array(rb).fill({}), laneChanges: [] } },
  log: { sec: { by: (min - motor) * 60, land: 0, motor: motor * 60 }, light: { day: (min - dark) * 60, twilight: 0, dark: dark * 60 }, total: { sec: min * 60, km } }
});
test('spill: nivåene stiger med XP', () => {
  assert.equal(xpForLevel(1), 0); assert.equal(xpForLevel(2), 100); assert.equal(xpForLevel(3), 300);
  assert.equal(levelFor(0).n, 1); assert.equal(levelFor(99).n, 1); assert.equal(levelFor(100).n, 2); assert.equal(levelFor(350).n, 3);
});
test('spill: uker på rad teller hele uker, og denne uka kan mangle ennå', () => {
  const now = new Date(2026, 10, 5, 12).getTime();   // torsdag
  const w = k => weekStart(now) - k * 7 * DAY + DAY;
  assert.equal(streakAt([w(0), w(1), w(2)], now), 3);
  assert.equal(streakAt([w(1), w(2)], now), 2);      // ikke kjørt denne uka ennå
  assert.equal(streakAt([w(0), w(2)], now), 1);
  assert.equal(streakAt([], now), 0);
});
test('spill: merker, ringer og rekorder', () => {
  const now = new Date(2026, 10, 5, 12).getTime();
  const rows = [row('a', now - 20 * DAY, { km: 60, min: 70, events: 3, score: 80 }), row('b', now - DAY, { km: 8, min: 30, events: 0, score: 96, dark: 12, rb: 4, surface: 'snow' })];
  const g = gameState(rows, now);
  const got = new Set(g.badges.filter(b => b.earned).map(b => b.id));
  for (const id of ['first', 'dark', 'smooth', 'score95', 'long', 'winter']) assert.ok(got.has(id), id);
  assert.ok(!got.has('km100'));
  assert.equal(g.rings[0].value, 30);
  assert.ok(g.rings[1].have.includes('mørke') && g.rings[1].have.includes('glatt føre'));
  assert.equal(g.records.find(r => r.id === 'score').value, '96');
  assert.equal(g.records.find(r => r.id === 'longest').driveId, 'a');
});
test('spill: det en tur låste opp', () => {
  const now = Date.now();
  const rows = [row('a', now - 3 * DAY, { score: 80, events: 2 }), row('b', now - DAY, { score: 97, events: 0, km: 9 })];
  const u = unlockedBy(rows, 'b');
  assert.ok(u.badges.some(b => b.id === 'score95'));
  assert.ok(u.records.some(r => r.id === 'score'));
  assert.ok(u.xpGain > 0);
  assert.equal(unlockedBy(rows, 'a').records.length, 0);   // første tur: ingen «ny rekord»
});

/* ---------- Visninger ---------- */
test('visninger: Pluss og hvem dataene gjelder', () => {
  assert.equal(plusFor('free'), false); assert.equal(plusFor('school'), true); assert.equal(plusFor('app'), null);
  assert.equal(modeFromLegacy({ devPlus: 'on' }), 'plus'); assert.equal(modeFromLegacy({ devPlus: 'off' }), 'free'); assert.equal(modeFromLegacy({ viewMode: 'teacher' }), 'teacher');
  const s = { activeDriver: 'Jo', activeStudent: 'Emma', drivers: ['Ola'], students: [{ name: 'Emma', email: 'e@x.no' }] };
  setViewMode('plus');
  assert.equal(scopeDriver(s), null); assert.equal(personKey(s), 'Jo'); assert.equal(recordDriver(s), 'Jo'); assert.equal(isTeacher(), false);
  assert.equal(schoolInfo(s), null);
  setViewMode('teacher');
  assert.equal(scopeDriver(s), 'Emma'); assert.equal(personKey(s), 'Emma'); assert.equal(recordDriver(s), 'Emma');
  assert.deepEqual(students(s).map(x => x.name), ['Emma', 'Ola']);
  setViewMode('school');
  assert.ok(isSchool() && schoolInfo(s).name);
  assert.equal(homeworkFor({ homework: { Emma: { focus: ['brake'], setAt: '1' } } }).focus[0], 'brake');   // eleven ser leksen
  setViewMode('nonsense');
  assert.equal(isTeacher() || isSchool(), false);
});

/* ---------- Kjøreutvikling ---------- */
test('kjøreutvikling: glidende snitt og periodetall', () => {
  assert.deepEqual(rolling([60, 90, 90, 90]), [60, 75, 80, 90]);
  const st = periodStats([60, 70, 80, 90, 95, 100].map(overall => ({ overall })));
  assert.equal(st.best, 100); assert.equal(st.n, 6); assert.equal(Math.round(st.change), 25);
  assert.equal(periodStats([]), null);
});

/* ---------- Føreren, ikke ledsageren (0.12.6) ---------- */
import { createDriverPicker } from '../js/calibcheck.js';
test('førerkamera: føreren er ansiktet lengst mot venstre, og ledsageren tas ikke over', () => {
  // Som kalibreringen 6. nov.: føreren rundt 17° mot venstre, ledsageren rundt 20° mot høyre (modellens «cm»)
  const d = { x: 34, y: 6, z: -110 }, l = { x: -45, y: 8, z: -120 };
  const p = createDriverPicker();
  assert.equal(p.step([l, d], 0), 1, 'to ansikter: føreren sitter til venstre');
  for (let t = 0.1; t < 3; t += 0.1) assert.equal(p.step([d, l], t), 0);
  assert.equal(p.step([l], 3.1), -1, 'føreren snur seg bort: ledsagerens ansikt godtas ikke');
  assert.equal(p.step([{ x: 75, y: 4, z: -100 }], 3.2), 0, 'skulderblikk: føreren lener seg langt mot venstre');
  assert.equal(p.step([{ x: 10, y: 6, z: -105 }, l], 3.3), 0, 'føreren lener seg litt mot høyre');
  assert.equal(p.step([l], 600), -1, 'lenge uten fører (mørkt): ledsageren godtas fortsatt ikke');
  assert.equal(p.step([l], 1000), 0, 'etter et kvarter starter det helt på nytt');
  assert.equal(p.step([], 1001), -1);
});
