// 1.1.0: kryss uten skilt (høyreregelen), påkjøring til motorvei
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { junctionNodes, offPriority, evaluateRoad, evaluateMerges } from '../js/enrich.js';
import { buildSituations } from '../js/situations.js';

// Et lite rutenett: en gate nord–sør gjennom et X-kryss (node 1) og et T-kryss med en privat vei (node 2)
const P = (lat, lon) => ({ lat, lon });
const seg = (ref, a, b, pts, kat = 'K', type = 'Enkel bilveg', level = 'Vegtrase og kjørebane') => ({ ref, a, b, pts, kat, type, level });
const N1 = P(63.4300, 10.4000), N2 = P(63.4310, 10.4000);

test('kryss: minst tre offentlige veier, ikke private, ikke rundkjøring, ekte noder', () => {
  const segs = [
    seg('1-1-1', '10', '1', [P(63.4290, 10.4000), N1]),
    seg('1-2-1', '1', '2', [N1, N2]),
    seg('2-1-1', '1', '11', [N1, P(63.4300, 10.4020)]),
    seg('3-1-1', '12', '1', [P(63.4300, 10.3980), N1]),
    seg('4-1-1', '2', '13', [N2, P(63.4310, 10.4020)], 'P'),        // privat: teller ikke
    seg('5-1-1', '2', '14', [N2, P(63.4320, 10.4000)]),
    seg('1-2-1', '1', '2', [N1, N2]),                                // samme segment fra to utsnitt
    seg('6-1-1', '0.5@6', '1', [P(63.4300, 10.4010), N1])           // starter midt på en lenke: «0.5@6» er ingen node
  ];
  const nodes = junctionNodes(segs);
  assert.equal(nodes.length, 1, 'bare X-krysset: T-krysset har bare to offentlige veier');
  assert.deepEqual([nodes[0].lat, nodes[0].lon], [63.43, 10.4]);
  assert.equal(nodes[0].deg, 5);
  const rb = junctionNodes([...segs.slice(0, 4), seg('7-1-1', '1', '15', [N1, P(63.4295, 10.4005)], 'K', 'Rundkjøring')]);
  assert.equal(rb.length, 0, 'noder ved rundkjøringer er ikke høyreregelkryss');
  assert.equal(junctionNodes(segs.map(x => ({ ...x, level: 'Vegtrase' }))).length, 0, 'bare kjørebane-nivået');
});

test('kryss på en forkjørsvei tas bort', () => {
  const nodes = [{ ...N1, deg: 4 }, { ...N2, deg: 3 }];
  const left = offPriority(nodes, [[P(63.4290, 10.4000), P(63.4305, 10.4000)]]);
  assert.deepEqual(left.map(n => n.lat), [63.431]);
});

// Ruta: rett nordover gjennom krysset, 1 punkt i sekundet
function route(kmhAt) {
  const pts = [];
  let lat = 63.4280;
  for (let t = 0; t <= 60; t++) {
    const kmh = kmhAt(lat);
    pts.push({ t, lat, lon: 10.4000, kmh });
    lat += kmh / 3.6 / 111200;
  }
  return pts;
}

test('kryss uten skilt: farten fram til krysset avgjør', () => {
  const road = { junctions: [{ ...N1, deg: 4 }] };
  const fast = evaluateRoad(route(() => 45), road, [], null);
  assert.equal(fast.junctions.length, 1);
  assert.equal(fast.junctions[0].minKmh, 45);
  const sitsFast = buildSituations({ points: route(() => 45), events: [] }, { nvdb: fast });
  assert.equal(sitsFast.filter(s => s.kind === 'junction').length, 1);
  assert.equal(sitsFast.find(s => s.kind === 'junction').level, 'high');
  // Ned til 25 km/t de siste 30 m før krysset: bra, ingen situasjon
  const slow = evaluateRoad(route(lat => (lat > 63.4296 && lat < 63.4301 ? 25 : 45)), road, [], null);
  assert.ok(slow.junctions[0].minKmh < 35);
  assert.equal(buildSituations({ points: route(() => 45), events: [] }, { nvdb: slow }).filter(s => s.kind === 'junction').length, 0);
  // Et vikepliktskilt ved krysset: regulert, ikke høyreregel
  assert.equal(evaluateRoad(route(() => 45), { ...road, giveway: [P(63.4299, 10.4001)] }, [], null).junctions.length, 0);
  // Over 60-sone: ikke med
  assert.equal(evaluateRoad(route(() => 45), road, [], route(() => 45).map(() => 80)).junctions.length, 0);
});

// Motorvei: 60 s på vanlig vei, så 90 s på motorveien
function mw(kmhOn) {
  const pts = [], motor = [];
  let lat = 63.40;
  for (let t = 0; t <= 150; t++) {
    const on = t >= 60;
    const kmh = on ? kmhOn(t - 60) : 50;
    pts.push({ t, lat, lon: 10.40, kmh });
    motor.push(on ? 1 : 0);
    lat += kmh / 3.6 / 111200;
  }
  return { pts, motor, limits: pts.map((_, i) => (motor[i] ? 90 : 50)) };
}

test('påkjøring: farten de første 400 m mot fartsgrensen, ikke i kø', () => {
  const good = mw(s => Math.min(88, 60 + s * 3));
  const m = evaluateMerges(good.pts, good.motor, good.limits);
  assert.equal(m.length, 1);
  assert.equal(m[0].type, 'motorvei');
  assert.equal(m[0].limit, 90);
  assert.ok(m[0].kmh >= 80);
  const sits = buildSituations({ points: good.pts, events: [] }, { nvdb: { merges: m } });
  assert.equal(sits.find(s => s.kind === 'merge').level, 'ok');

  const slow = mw(s => Math.min(60, 50 + s));
  const ms = evaluateMerges(slow.pts, slow.motor, slow.limits);
  assert.equal(ms.length, 1);
  assert.equal(buildSituations({ points: slow.pts, events: [] }, { nvdb: { merges: ms } }).find(s => s.kind === 'merge').level, 'medium');

  const queue = mw(() => 20);
  assert.equal(evaluateMerges(queue.pts, queue.motor, queue.limits).length, 0, 'kø: ikke vurdert');
  // Turen starter på motorveien: ingen påkjøring
  const start = mw(() => 90);
  start.motor.fill(1);
  assert.equal(evaluateMerges(start.pts, start.motor, start.limits).length, 0);
});

// Blinklyset (1.1.0): klikk fra mikrofonen
import { periodicAt, blinkChecks, findTurns, heardBetween } from '../js/blink.js';
let rng;
const seed = n => { let x = n; rng = () => (x = (x * 16807) % 2147483647) / 2147483647; };
const noise = (from, to, perSec) => { const out = []; for (let t = from; t < to; t += -Math.log(1 - rng()) / perSec) out.push({ t, s: 8 + rng() * 6 }); return out; };
// Som på telefonen (1.1.2): klikkene finnes i biter på 4 ms, og reléet er nesten helt jevnt (bilen 25. nov.: 0–4 ms)
const q4 = t => Math.round(t / 0.004) * 0.004;
const indicator = (from, to, C = 0.7, tock = true) => { const out = []; for (let t = from; t < to; t += C) { out.push({ t: q4(t + (rng() - 0.5) * 0.002), s: 14 }); if (tock) out.push({ t: q4(t + C / 2 + (rng() - 0.5) * 0.002), s: 11 }); } return out; };
const sorted = a => a.sort((x, y) => x.t - y.t);
const levels = (from, to) => { const out = []; for (let t = Math.ceil(from); t <= to; t++) out.push({ t, db: -50 }); return out; };

test('blinklyset høres i støy, støy alene gir nesten aldri blinklys', () => {
  seed(42);
  const clicks = sorted([...noise(0, 60, 2), ...indicator(20, 27, 0.68)]);
  assert.equal(periodicAt(clicks, 26).on, true);
  assert.ok(Math.abs(periodicAt(clicks, 26).c - 0.68) <= 0.031);
  assert.equal(periodicAt(sorted([...noise(0, 60, 2), ...indicator(20, 27, 0.95, false)]), 26).on, true, 'bare ett klikk per blink');
  const quiet = sorted(noise(0, 600, 3));
  let fp = 0, n = 0;
  for (let t = 6; t < 600; t += 0.5) { n++; if (periodicAt(quiet, t).on) fp++; }
  assert.ok(fp / n < 0.03, `falske blinklys i støy: ${fp} av ${n}`);
});

test('blinklys før feltskifte og sving, ukjent uten mikrofon, ingenting med musikk', () => {
  seed(7);
  const raw = [...sorted([...noise(0, 120, 1.5), ...indicator(30, 36, 0.75)]), ...levels(0, 120)];
  const res = blinkChecks(raw, { laneChanges: [{ t: 36, tFrom: 34, tTo: 38, dir: 'venstre' }], turns: [{ t: 80, tFrom: 78, dir: 'høyre' }] });
  assert.equal(res.checks.length, 2);
  assert.deepEqual(res.checks.map(c => [c.kind, c.heard]), [['lane', true], ['turn', false]]);
  // Uten lydnivå (mikrofonen av): ingen vurdering
  assert.equal(blinkChecks(sorted(indicator(30, 36)), { laneChanges: [{ t: 36, tFrom: 34, dir: 'venstre' }] }), null);
  // Musikk med jevn takt hele turen: ikke vurdert
  const music = [...sorted([...noise(0, 120, 1), ...indicator(0, 120, 0.5, false)]), ...levels(0, 120)];
  const m = blinkChecks(music, { laneChanges: [{ t: 60, tFrom: 58, dir: 'høyre' }] });
  assert.ok(m.music > 0.3);
  assert.equal(m.checks.length, 0);
  assert.equal(heardBetween(sorted(noise(0, 30, 1)), 0, 30), false);
});

test('svinger i kryss fra GPS-sporet', () => {
  // 20 s rett nord i 30 km/t, så en 90° sving til høyre over 6 s, så rett øst
  const pts = [];
  let lat = 63.43, lon = 10.40, hd = 0;
  for (let t = 0; t <= 45; t++) {
    if (t > 20 && t <= 26) hd += 15;
    const v = 30 / 3.6, k = Math.cos(lat * Math.PI / 180);
    lat += v * Math.cos(hd * Math.PI / 180) / 111200; lon += v * Math.sin(hd * Math.PI / 180) / (111200 * k);
    pts.push({ t, lat, lon, kmh: 30 });
  }
  const turns = findTurns(pts);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].dir, 'høyre');
  assert.ok(turns[0].tFrom >= 19 && turns[0].tFrom <= 23 && turns[0].t <= 25);
  assert.equal(findTurns(pts, [{ tFrom: 18, tTo: 28 }]).length, 0, 'i en rundkjøring er det ingen sving');
});

// Prøve-oppkjøring (1.1.0)
import { mockTest } from '../js/mocktest.js';
test('prøve-oppkjøring: dom og områder', () => {
  const r = { stats: { km: 12, duration: 26 * 60 }, events: [], camera: { calibrated: true, perMin: 7 }, road: { close: [] }, maneuvers: { laneChanges: [{ t: 100 }] } };
  const sp = { episodes: [], secondsOver: 0 };
  const road = { stops: [{ full: true }], giveway: [{}], junctions: [], signals: [], crossings: [{}] };
  const good = mockTest(r, { sits: [], sp, road });
  assert.equal(good.verdict, 'bra');
  assert.equal(good.short, false);
  assert.ok(good.areas.every(a => a.state === 'ok'), JSON.stringify(good.areas.filter(a => a.state !== 'ok')));
  // Rulling gjennom stopp: ikke klar
  const rolled = mockTest(r, { sits: [], sp, road: { ...road, stops: [{ full: false, minKmh: 8 }] } });
  assert.equal(rolled.verdict, 'ikke');
  assert.equal(rolled.areas.find(a => a.id === 'junctions').state, 'øv');
  // 12 km/t over: ikke klar
  assert.equal(mockTest(r, { sits: [], sp: { episodes: [{ maxKmh: 62, limit: 50 }], secondsOver: 8 }, road }).verdict, 'ikke');
  // Lav fart på påkjøringen: nesten
  const merge = mockTest(r, { sits: [{ kind: 'merge', level: 'medium' }], sp, road });
  assert.equal(merge.verdict, 'nesten');
  // Uten kamera og veidata: ukjent, ikke feil
  const bare = mockTest({ ...r, camera: null, road: null, stats: { km: 3, duration: 600 } }, { sits: [], sp: null, road: null });
  assert.equal(bare.verdict, 'ukjent', 'uten fart og kryss målt: «For lite målt», ikke «Ser bra ut»');
  assert.ok(bare.known < 4);
  assert.equal(bare.short, true);
  assert.ok(['speed', 'junctions', 'observe', 'distance'].every(id => bare.areas.find(a => a.id === id).state === 'ukjent'));
});

// Øv i nærheten (1.1.0)
import { distDir, distText, nearestPlaces, roadName, placeName, mapsLink } from '../js/nearby.js';
import { readiness } from '../js/readiness.js';
test('øv i nærheten: avstand, retning, navn og lenker', () => {
  const here = { lat: 63.43, lon: 10.40 };
  const ne = distDir(here, { lat: 63.437, lon: 10.415 });
  assert.equal(ne.dir, 'nordøst');
  assert.equal(distText({ m: 1234, dir: 'sør' }), '1,2 km sør');
  assert.equal(distText({ m: 420, dir: 'øst' }), '400 m øst');
  const near = nearestPlaces(here, [{ lat: 63.4301, lon: 10.4001 }, { lat: 63.4302, lon: 10.4002 }, { lat: 63.44, lon: 10.40 }, { lat: 63.45, lon: 10.40 }], 3, 150);
  assert.equal(near.length, 3, 'to skilt i samme kryss blir ett');
  assert.ok(near[0].m < near[1].m);
  assert.equal(roadName('EV6 S76D1 m475-1081'), 'E6');
  assert.equal(roadName('RV706 S1D1'), 'Rv. 706');
  assert.equal(placeName('Fv6690 Olav Tryggvasons gate X Kv Nedre Bakklandet'), 'Olav Tryggvasons gate / Nedre Bakklandet');
  assert.match(mapsLink({ lat: 63.43, lon: 10.4 }), /^https:\/\/maps\.apple\.com\/\?daddr=63\.43000,10\.40000/);
  assert.match(mapsLink({ lat: 63.43, lon: 10.4 }, true), /google\.com\/maps\/dir/);
  // Ingen turer: alt mangler
  const r = readiness([]);
  assert.deepEqual(r.needs, ['motorvei', 'rundkjøring', 'kryss', 'landevei', 'mørke']);
});

// Slik gjør du det (1.1.1): tegningene steg for steg i sikkerhetskontrollen
import { SAFETY, HOWTO } from '../js/safety-check.js';
import { figure as fig2, FIGURE_KEYS as KEYS2 } from '../js/trafficsvg.js';
test('steg-tegningene finnes, har tekst og hører til ekte oppgaver', () => {
  const ids = new Set(SAFETY.map(t => t.id)), keys = new Set(KEYS2);
  assert.ok(Object.keys(HOWTO).length >= 20);
  for (const [id, steps] of Object.entries(HOWTO)) {
    assert.ok(ids.has(id), `ukjent oppgave ${id}`);
    assert.ok(steps.length >= 1 && steps.length <= 4, id);
    for (const s of steps) {
      assert.ok(keys.has(s.fig), `${id}: tegningen ${s.fig} finnes ikke`);
      assert.ok(s.cap && s.cap.length <= 60, `${id}: teksten er for lang: ${s.cap}`);
      assert.match(fig2(s.fig), /aria-label="[^"]+"/, `${id}: ${s.fig} mangler skjermlesertekst`);
    }
    assert.deepEqual(SAFETY.find(t => t.id === id).steps, steps);
  }
  // Alle slik:-tegningene er i bruk
  const used = new Set(Object.values(HOWTO).flat().map(s => s.fig));
  for (const k of KEYS2.filter(k => k.startsWith('slik:'))) assert.ok(used.has(k), `${k} brukes ikke`);
});

test('blinklys: ingen klikk i det hele tatt gir ingen vurdering (1.1.1)', () => {
  const lv = []; for (let t = 0; t <= 120; t++) lv.push({ t, db: -60 });
  const res = blinkChecks(lv, { laneChanges: [{ t: 60, tFrom: 58, dir: 'høyre' }] });
  assert.equal(res.silent, true);
  assert.equal(res.checks.length, 0);
});

// 1.1.1: funnet av funksjonsagenten
import { cleanResult, cleanDeep } from '../js/db.js';
import { shareDrive } from '../js/messages.js';
test('HTML i en delt tur blir aldri HTML i rapporten, og prøve-oppkjøringen følger turen', () => {
  const evil = '<a href="x">klikk</a>';
  const r = cleanResult({ points: [{ t: 0, lat: 63, lon: 10 }, { t: 1, lat: 63.001, lon: 10 }], events: [], road: { medianDist: evil, close: [] }, crest: { crests: [{ kmh: evil, sight: 40 }] }, scores: {} });
  assert.ok(!JSON.stringify(r).includes('<'), 'ingen < igjen');
  assert.equal(r.crest.crests[0].sight, 40, 'tall står som før');
  assert.deepEqual(cleanDeep({ a: [1, 'x"y', { 'b<c': 1, ok: NaN }] }), { a: [1, 'xy', { ok: null }] });
  assert.equal(shareDrive({ id: 'a', startedAt: '2026-11-25T10:00:00', mock: true }).mock, true);
});

// 1.1.2: bilens egen blinklystakt (eksportene 25. nov.): en annen jevn lyd med en annen takt og mer slingring teller ikke
import { carPeriod } from '../js/blink.js';
test('blinklys: bilens takt læres, og en annen jevn lyd (vindusviskere, radio) teller ikke', () => {
  seed(5);
  const wobbly = (from, to, C) => { const out = []; for (let t = from; t < to; t += C) out.push({ t: q4(t + (rng() - 0.5) * 0.014), s: 12 }); return out; };
  const clicks = sorted([...noise(0, 300, 1.5), ...indicator(20, 30, 0.72, false), ...indicator(60, 68, 0.72, false), ...indicator(120, 127, 0.72, false), ...wobbly(180, 290, 0.91)]);
  assert.ok(Math.abs(carPeriod(clicks) - 0.72) <= 0.005, `takten: ${carPeriod(clicks)}`);
  const raw = [...clicks, ...levels(0, 300)];
  const res = blinkChecks(raw, { laneChanges: [{ t: 30, tFrom: 29, dir: 'høyre' }, { t: 230, tFrom: 229, dir: 'venstre' }] });
  assert.equal(res.period, carPeriod(clicks));
  assert.deepEqual(res.checks.map(c => c.heard), [true, false], 'den andre lyden er ikke blinklyset');
});

test('blinklys i svinger vurderes bare i kryss (1.1.2)', () => {
  const pts = Array.from({ length: 60 }, (_, i) => ({ t: i, lat: 63.43 + i * 0.0001, lon: 10.40, kmh: 20 }));
  const r = { points: pts, events: [], blink: { checks: [{ t: 20, tMid: 22, kind: 'turn', dir: 'høyre', heard: false }, { t: 40, tMid: 42, kind: 'turn', dir: 'venstre', heard: false }, { t: 50, kind: 'lane', dir: 'høyre', heard: true }] } };
  const node = { lat: pts[22].lat, lon: pts[22].lon };
  const kinds = sits => sits.filter(s => s.kind === 'blink').map(s => s.title);
  assert.deepEqual(kinds(buildSituations(r, { nvdb: { nodes: [node] } })), ['Hørte ikke blinklyset før svingen til høyre', 'Blinklys før feltskiftet'], 'svingen uten kryss tas bort');
  assert.deepEqual(kinds(buildSituations(r, { nvdb: null })), ['Blinklys før feltskiftet'], 'uten kryssdata: bare feltskiftet');
  // junctionNodes med any: også kryss med privat vei
  const segs = [seg('a', '1', '9', [P(63.43, 10.4), P(63.431, 10.4)]), seg('b', '1', '8', [P(63.43, 10.4), P(63.43, 10.401)]), seg('c', '1', '7', [P(63.43, 10.4), P(63.429, 10.4)], 'P')];
  assert.equal(junctionNodes(segs).length, 0);
  assert.equal(junctionNodes(segs, { any: true }).length, 1);
});
