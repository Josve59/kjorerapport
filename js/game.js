/* Spillfølelse (0.12.0): merker, ukesringer, nivå, rekorder og uker på rad. Alt belønner øving: mengde, variasjon
   og myk kjøring. Ingenting belønner fart, korte tider eller å bruke telefonen under kjøring, og ingenting straffer.
   rows: ekte turer, nyeste først [{ d, res, log }] (som gatherRows i app.js). Ren modul, testes i Node. */

const DAY = 86400000;
const rbCount = x => ((x.road && x.road.roundabouts) || (x.res.maneuvers && x.res.maneuvers.roundabouts) || []).length;
const min = sec => sec / 60;

/* Mandag kl. 00 i uken t ligger i (lokal tid) */
export function weekStart(t) {
  const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime();
}

/* Merkene. test(s, x): s = summer så langt (eldste til denne turen), x = turen selv. */
export const BADGES = [
  { id: 'first', icon: 'flag', title: 'Første tur', text: 'Den første øvingsturen med appen.', test: s => s.n >= 1 },
  { id: 'km100', icon: 'map', title: '100 km', text: '100 km øvelseskjøring.', test: s => s.km >= 100 },
  { id: 'km500', icon: 'map', title: '500 km', text: '500 km øvelseskjøring.', test: s => s.km >= 500 },
  { id: 'km1000', icon: 'map', title: '1000 km', text: '1000 km øvelseskjøring.', test: s => s.km >= 1000 },
  { id: 'km2000', icon: 'star', title: '2000 km', text: '2000 km: det mange anbefaler før oppkjøringen.', test: s => s.km >= 2000 },
  { id: 'hours10', icon: 'wheel', title: '10 timer', text: 'Ti timer bak rattet.', test: s => s.min >= 600 },
  { id: 'dark', icon: 'moon', title: 'Første mørketur', text: 'Minst 10 minutter i mørke på én tur.', test: (s, x) => min(x.log.light.dark) >= 10 },
  { id: 'dark60', icon: 'moon', title: 'Nattøvd', text: 'En time med mørkekjøring til sammen.', test: s => s.darkMin >= 60 },
  { id: 'land', icon: 'map', title: 'Landeveien', text: 'Et kvarter på landevei på én tur.', test: (s, x) => min(x.log.sec.land) >= 15 },
  { id: 'motor', icon: 'speed', title: 'Motorveien', text: 'Fem minutter på motorvei eller motortrafikkvei.', test: (s, x) => min(x.log.sec.motor) >= 5 },
  { id: 'variety', icon: 'layers', title: 'Allsidig', text: 'En time i by, en time på landevei og en halvtime på motorvei.', test: s => s.byMin >= 60 && s.landMin >= 60 && s.motorMin >= 30 },
  { id: 'round10', icon: 'round', title: 'Rundkjøringsrev', text: '10 rundkjøringer.', test: s => s.rb >= 10 },
  { id: 'round50', icon: 'round', title: 'Rundkjøringsmester', text: '50 rundkjøringer.', test: s => s.rb >= 50 },
  { id: 'smooth', icon: 'check', title: 'Silkemyk', text: 'En tur på minst 5 km uten en eneste brå hendelse.', test: (s, x) => x.res.stats.km >= 5 && x.res.events.length === 0 },
  { id: 'score95', icon: 'star', title: '95 poeng', text: '95 poeng eller mer på en tur på minst 5 km.', test: (s, x) => x.res.stats.km >= 5 && x.res.overall >= 95 },
  { id: 'long', icon: 'pin', title: 'Langtur', text: 'En tur på over en time.', test: (s, x) => min(x.log.total.sec) >= 60 },
  { id: 'winter', icon: 'snow', title: 'Vinterfører', text: 'En tur på snø eller is.', test: (s, x) => x.d.surface === 'snow' || x.d.surface === 'ice' },
  { id: 'streak4', icon: 'flame', title: 'Fire uker på rad', text: 'Øvd minst én gang i uka i fire uker.', test: s => s.streak >= 4 },
  { id: 'streak10', icon: 'flame', title: 'Ti uker på rad', text: 'Øvd minst én gang i uka i ti uker.', test: s => s.streak >= 10 }
];

/* Nivåene: XP = minutter kjørt + 25 per merke. Nivå n krever 50·n·(n−1) XP (0, 100, 300, 600, 1000 …). */
export const LEVEL_NAMES = ['Nybegynner', 'Øvelsesfører', 'Trygg i byen', 'Landeveisfører', 'Allsidig', 'Rutinert', 'Nesten klar', 'Erfaren'];
export const xpForLevel = n => 50 * n * (n - 1);
export function levelFor(xp) {
  let n = 1;
  while (xp >= xpForLevel(n + 1)) n++;
  const from = xpForLevel(n), to = xpForLevel(n + 1);
  return { n, name: LEVEL_NAMES[Math.min(n, LEVEL_NAMES.length) - 1], xp, from, to, progress: (xp - from) / (to - from) };
}

/* Ukesringene: mål per uke */
export const RINGS = { minutes: 120, variety: 3, smooth: 90 };
const VARIETY = [
  ['by', 'by', x => min(x.log.sec.by) >= 5], ['land', 'landevei', x => min(x.log.sec.land) >= 5], ['motor', 'motorvei', x => min(x.log.sec.motor) >= 3],
  ['dark', 'mørke', x => min(x.log.light.dark + x.log.light.twilight) >= 5], ['round', 'rundkjøring', x => rbCount(x) > 0],
  ['slippery', 'glatt føre', x => x.d.surface === 'snow' || x.d.surface === 'ice']
];

/* Uker på rad med minst én tur, fram til denne uka (eller forrige, hvis det ikke er kjørt ennå denne uka) */
export function streakAt(times, now) {
  const weeks = new Set(times.map(weekStart));
  let w = weekStart(now);
  if (!weeks.has(w)) w = weekStart(w - 3 * DAY);
  let n = 0;
  while (weeks.has(w)) { n++; w = weekStart(w - 3 * DAY); }
  return n;
}

/* Hele spilltilstanden. now: når (for ukesringene og uker på rad). */
export function gameState(rows, now = Date.now()) {
  const chrono = rows.slice().sort((a, b) => Date.parse(a.d.startedAt) - Date.parse(b.d.startedAt));
  const s = { n: 0, km: 0, min: 0, darkMin: 0, byMin: 0, landMin: 0, motorMin: 0, rb: 0, streak: 0 };
  const earned = {};
  const times = [];
  for (const x of chrono) {
    const t = Date.parse(x.d.startedAt);
    times.push(t);
    s.n++; s.km += x.res.stats.km; s.min += min(x.log.total.sec); s.darkMin += min(x.log.light.dark);
    s.byMin += min(x.log.sec.by); s.landMin += min(x.log.sec.land); s.motorMin += min(x.log.sec.motor); s.rb += rbCount(x);
    s.streak = streakAt(times, t);
    for (const b of BADGES) if (!earned[b.id] && b.test(s, x)) earned[b.id] = { at: x.d.startedAt, id: x.d.id };
  }
  const badges = BADGES.map(b => ({ ...b, earned: earned[b.id] || null }));
  const nBadges = Object.keys(earned).length;
  const level = levelFor(Math.round(s.min) + 25 * nBadges);

  // Ukesringer for uka nå
  const wk = weekStart(now);
  const week = chrono.filter(x => weekStart(Date.parse(x.d.startedAt)) === wk);
  const wMin = week.reduce((a, x) => a + min(x.log.total.sec), 0);
  const wVar = VARIETY.filter(v => week.some(v[2])).map(v => v[1]);
  const wSmooth = week.length ? week.reduce((a, x) => a + x.res.overall, 0) / week.length : 0;
  const rings = [
    { id: 'minutes', label: 'Øving', value: Math.round(wMin), goal: RINGS.minutes, unit: 'min', progress: Math.min(1, wMin / RINGS.minutes) },
    { id: 'variety', label: 'Variasjon', value: wVar.length, goal: RINGS.variety, unit: '', progress: Math.min(1, wVar.length / RINGS.variety), have: wVar },
    { id: 'smooth', label: 'Myk kjøring', value: Math.round(wSmooth), goal: RINGS.smooth, unit: 'poeng', progress: week.length ? Math.min(1, wSmooth / RINGS.smooth) : 0 }
  ];

  // Rekorder (turer på minst 3 km, så korte turer ikke gir lette rekorder)
  const ok = chrono.filter(x => x.res.stats.km >= 3);
  const best = (arr, f) => arr.reduce((m, x) => (!m || f(x) > f(m) ? x : m), null);
  const weeks = new Map();
  for (const x of chrono) { const k = weekStart(Date.parse(x.d.startedAt)); weeks.set(k, (weeks.get(k) || 0) + min(x.log.total.sec)); }
  const bestWeek = [...weeks.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const clean = best(ok.filter(x => x.res.events.length === 0), x => x.res.stats.km);
  const rec = {
    score: best(ok, x => x.res.overall),
    longest: best(chrono, x => x.res.stats.km),
    clean,
    week: bestWeek ? { start: bestWeek[0], min: Math.round(bestWeek[1]) } : null
  };
  const records = [
    rec.score && { id: 'score', label: 'Beste poengsum', value: `${rec.score.res.overall}`, driveId: rec.score.d.id, at: rec.score.d.startedAt },
    rec.longest && { id: 'longest', label: 'Lengste tur', value: `${rec.longest.res.stats.km.toFixed(1).replace('.', ',')} km`, driveId: rec.longest.d.id, at: rec.longest.d.startedAt },
    rec.clean && { id: 'clean', label: 'Lengste tur uten brå hendelser', value: `${rec.clean.res.stats.km.toFixed(1).replace('.', ',')} km`, driveId: rec.clean.d.id, at: rec.clean.d.startedAt },
    rec.week && { id: 'week', label: 'Mest øving på én uke', value: `${rec.week.min} min`, at: new Date(rec.week.start).toISOString() }
  ].filter(Boolean);

  return { badges, nBadges, level, rings, records, streak: streakAt(times, now), totals: s };
}

/* Det en tur låste opp: nye merker, nytt nivå og nye rekorder (sammenlignet med turene før den) */
export function unlockedBy(rows, driveId) {
  const x = rows.find(r => r.d.id === driveId);
  if (!x) return null;
  const t = Date.parse(x.d.startedAt);
  const upTo = rows.filter(r => Date.parse(r.d.startedAt) <= t);
  const before = upTo.filter(r => r.d.id !== driveId);
  const a = gameState(before, t), b = gameState(upTo, t);
  const badges = b.badges.filter(g => g.earned && g.earned.id === driveId);
  const levelUp = b.level.n > a.level.n ? b.level : null;
  const records = before.length ? b.records.filter(r => r.driveId === driveId && r.id !== 'week' && !a.records.some(o => o.id === r.id && o.value === r.value)) : [];
  return { badges, levelUp, records, level: b.level, xpGain: b.level.xp - a.level.xp };
}
