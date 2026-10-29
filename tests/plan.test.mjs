import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driverProfile, planSettings, planShares, createPlanner, SWITCH, LOOK, LOOK_LONG } from '../kamera/js/plan.js';

/* Kjører planleggeren mot et kamera som bruker SWITCH sekunder på hvert bytte. drive(t) gir { kmh, yaw, hacc }.
   roadFrame(t) gir bildet veikameraet ser (8 bilder i sekundet), eller null. */
function run(planner, seconds, drive, roadFrame = null) {
  let facing = 'user', switchUntil = -1, target = 'user';
  const log = [];
  for (let now = 0; now <= seconds; now += 0.125) {
    const switching = now < switchUntil;
    if (!switching && facing !== target) facing = target;
    if (!switching && facing === 'environment' && roadFrame) planner.road(roadFrame(now));
    const { want, reason } = planner({ now, ...drive(now), facing, switching });
    if (!switching && want !== facing && want !== target) { target = want; switchUntil = now + SWITCH; }
    log.push({ now, facing: switching ? 'blind' : facing, reason });
  }
  return log;
}

test('plan: dagens mål og førerprofil styrer hvor ofte veien sjekkes', () => {
  assert.deepEqual([planSettings().fast, planSettings().city], [8, 12]);
  assert.equal(planSettings({ focus: ['mirror'] }).fast, 25);
  assert.equal(planSettings({ focus: ['limits'] }).fast, 6);
  const good = driverProfile([{ camera: { calibrated: true, lane: Array(8).fill({ mirror: true, shoulder: true }), away: [] }, road: { close: [] }, stats: { duration: 900 } }]);
  assert.ok(good.mirror > 0.85 && good.lanes === 8);
  assert.equal(planSettings({ profile: good }).fast, 6);
  const weak = driverProfile([{ camera: { calibrated: true, lane: [{ mirror: true, shoulder: false }, { mirror: true, shoulder: false }, { mirror: true, shoulder: null }, { mirror: false, shoulder: false }, { mirror: true, shoulder: false }], away: [] }, stats: { duration: 600 } }]);
  assert.ok(weak.shoulder < 0.6);
  assert.equal(planSettings({ profile: weak }).fast, 12);
  assert.match(planSettings({ profile: weak }).reasons[0], /skulderblikk/);
  const s = planShares(8);
  assert.ok(Math.abs(s.front + s.road + s.blind - 1) < 1e-9 && s.front > 0.7);
});

test('plan: korte veiblikk i jevn fart, aldri i sving, med en gang ved nedbremsing', () => {
  const p = createPlanner(planSettings());
  // 0–60 s rett vei i 70 km/t, 60–75 s sving, 75–90 s rett, nedbremsing ved 84 s, 90–100 s stille
  const log = run(p, 100, t => ({ kmh: t < 90 ? 70 : 0, yaw: t >= 60 && t < 75 ? 12 : 0, hacc: t >= 84 && t < 85 ? 4 : 0 }));
  const roadAt = t => log.find(x => Math.abs(x.now - t) < 0.07).facing;
  assert.equal(p.stats.byReason['veiblikk'] >= 4, true, JSON.stringify(p.stats.byReason));
  assert.ok(log.filter(x => x.now >= 60 && x.now < 77.9).every(x => x.facing !== 'environment'), 'ingen veiblikk i sving eller 3 s etter');
  assert.equal(p.stats.byReason['nedbremsing'], 1);
  assert.ok(['environment', 'blind'].includes(roadAt(85)), 'ser veien rett etter nedbremsingen');
  assert.ok(log.filter(x => x.now > 92).every(x => x.facing !== 'environment'), 'stille: bare fører');
  // 70 km/t på rett vei: lange veiblikk (2,5 s), regnet fra veikameraet gir bilder, ikke fra byttet startet
  const runs = []; let cur = 0;
  for (const x of log.filter(x => x.now < 58)) { if (x.facing === 'environment') cur += 0.125; else if (cur) { runs.push(cur); cur = 0; } }
  assert.ok(runs.length >= 3 && runs.every(v => v >= LOOK_LONG - 0.2 && v <= LOOK_LONG + 0.3), 'hvert veiblikk varer ca. 2,5 s: ' + runs.join(', '));
});

test('plan: korte veiblikk i by, og veiblikket regnes fra første brukbare bilde', () => {
  const p = createPlanner(planSettings());
  const log = run(p, 120, () => ({ kmh: 40, yaw: 0, hacc: 0 }));
  const road = log.filter(x => x.facing === 'environment').length * 0.125, look = road / (p.stats.looks || 1);
  assert.ok(look >= LOOK - 0.2 && look <= LOOK + 0.3, 'hvert veiblikk varer ca. 1,5 s med bilder: ' + look);
  assert.ok(p.stats.blind > 0, 'byttetiden telles som blind');
});

test('plan: førerkameraet inn mot kryss og ved igangkjøring', () => {
  const p = createPlanner(planSettings({ focus: ['limits'] }));   // veiblikk hvert 6.–8. s
  // 0–30 s 60 km/t, 30–36 s farten faller jevnt til 30 km/t, 36–40 s stille (rødt lys), så 40 km/t
  const kmh = t => t < 30 ? 60 : t < 36 ? 60 - (t - 30) * 5 : t < 40 ? 0 : 40;
  const log = run(p, 70, t => ({ kmh: kmh(t), yaw: 0, hacc: 0 }));
  assert.ok(log.filter(x => x.now >= 32 && x.now < 36).every(x => x.facing !== 'environment'), 'ingen veiblikk mens farten faller inn mot krysset');
  assert.ok(log.filter(x => x.now >= 40 && x.now < 47.9).every(x => x.facing !== 'environment'), 'ingen veiblikk de første 8 s etter igangkjøring');
  assert.ok(p.stats.holds['kryss nærmer seg'] >= 1 && p.stats.holds['igangkjøring'] >= 1, JSON.stringify(p.stats.holds));
  assert.ok(log.some(x => x.now > 50 && x.facing === 'environment'), 'veiblikk igjen etterpå');
});

test('plan: i mørket ser veikameraet like ofte; bare lyse blikk uten noe å se gir færre', () => {
  const lightP = createPlanner(planSettings()), darkP = createPlanner(planSettings()), emptyP = createPlanner(planSettings());
  const drive = () => ({ kmh: 70, yaw: 0, hacc: 0 });
  run(lightP, 300, drive, () => ({ cars: 1, people: 0, lead: null, lane: { l: true, r: true, offset: 0 }, lum: 120 }));
  run(darkP, 300, drive, () => ({ cars: 0, people: 0, lead: null, lane: { l: false, r: false, offset: null }, lum: 12 }));
  run(emptyP, 300, drive, () => ({ cars: 0, people: 0, lead: null, lane: { l: false, r: false, offset: null }, lum: 120 }));
  assert.ok(darkP.stats.dark >= 3 && lightP.stats.dark === 0);
  assert.ok(darkP.stats.looks >= lightP.stats.looks, `mørkt ${darkP.stats.looks} mot lyst ${lightP.stats.looks} veiblikk`);
  assert.ok(emptyP.stats.looks < lightP.stats.looks, `tomt ${emptyP.stats.looks} mot lyst ${lightP.stats.looks}`);
});

test('plan: bil nær foran gir oftere veiblikk', () => {
  const p = createPlanner(planSettings({ focus: ['mirror'] }));
  const log = run(p, 60, t => ({ kmh: 80, yaw: 0, hacc: 0, lastLead: t > 10 ? { headway: 1.0, at: t - 1 } : null }));
  assert.ok(p.stats.byReason['bil nær foran'] >= 4, JSON.stringify(p.stats.byReason));
  assert.ok(log.length > 0);
});
