import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driverProfile, planSettings, planShares, createPlanner, SWITCH, LOOK } from '../kamera/js/plan.js';

/* Kjører planleggeren mot et kamera som bruker SWITCH sekunder på hvert bytte. drive(t) gir { kmh, yaw, hacc }. */
function run(planner, seconds, drive) {
  let facing = 'user', switchUntil = -1, target = 'user';
  const log = [];
  for (let now = 0; now <= seconds; now += 0.125) {
    const switching = now < switchUntil;
    if (!switching && facing !== target) facing = target;
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
  const road = log.filter(x => x.facing === 'environment').length * 0.125, look = road / (p.stats.looks || 1);
  assert.ok(look >= LOOK - 0.2 && look <= LOOK + 0.3, 'hvert veiblikk varer ca. 1,5 s: ' + look);
});

test('plan: bil nær foran gir oftere veiblikk', () => {
  const p = createPlanner(planSettings({ focus: ['mirror'] }));
  const log = run(p, 60, t => ({ kmh: 80, yaw: 0, hacc: 0, lastLead: t > 10 ? { headway: 1.0, at: t - 1 } : null }));
  assert.ok(p.stats.byReason['bil nær foran'] >= 4, JSON.stringify(p.stats.byReason));
  assert.ok(log.length > 0);
});
