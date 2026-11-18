/* Demovisning for trafikkskoler (0.24.0). Eieren viser appen til trafikkskoler, men telefonen har ekte turer,
   elever og adresser. Demoen har sin egen database og sine egne innstillinger (db.js, DEMO_FLAG), og fylles første
   gang med eksempeleleven Emma: åtte øvingsturer langs offentlige gater i Trondheim som blir roligere over tid,
   teori med tre prøver og en prøvedato, og to elever til i trafikklærer-visningen. Ingenting her er ekte. */
import { importDrive, listDrives, deleteDrive, getSettings, saveSettings, isDemoMode } from './db.js';
import { makeDemo } from './analysis.js';
import { DEMO_ROUTE } from './demo-route.js';
import { createTestDrives, TEST_STUDENTS } from './testdata.js';
import { QUESTIONS } from './theory-b.js';
import { emptyProgress, answer, addExam, buildExam, scoreExam, rng, dayKey } from './theory.js';

export const DEMO_V = 4;
const DAY = 86400000;

/* Emmas turer: demoturen (2–5 runder, 10–27 min) lagt langs ruta. Eldre turer brå, de nyeste mykere. */
async function emmaDrives(now) {
  // Ny versjon av demoen: de gamle turene byttes ut (lagringen hopper over id-er som finnes fra før)
  for (const d of await listDrives()) if (String(d.id).startsWith('demo-emma-')) await deleteDrive(d.id);
  const R = 6371000, rad = Math.PI / 180, ROUTE = DEMO_ROUTE;
  const dist = (a, b) => Math.hypot((b[1] - a[1]) * rad * Math.cos(a[0] * rad), (b[0] - a[0]) * rad) * R;
  const cum = [0]; for (let i = 1; i < ROUTE.length; i++) cum.push(cum[i - 1] + dist(ROUTE[i - 1], ROUTE[i]));
  const total = cum[cum.length - 1];
  const at = s => {
    s = ((s % total) + total) % total; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const a = ROUTE[i - 1], b = ROUTE[i], f = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return { lat: a[0] + (b[0] - a[0]) * f, lon: a[1] + (b[1] - a[1]) * f, bearing: (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * rad), b[0] - a[0]) / rad + 360) % 360 };
  };
  // [dager siden, klokka, frø, hvor på ruta, hvor brå, runder] (runder: lengden på turen, så turene ikke er like)
  const plan = [[34, 17, 3, 0, 1.3, 2], [31, 12, 5, 900, 1.2, 3], [27, 18, 7, 1800, 1.1, 2], [24, 14, 9, 400, 1.0, 4], [20, 19, 11, 2600, 0.95, 3], [16, 11, 13, 1200, 0.9, 5], [11, 18, 15, 3100, 0.85, 3], [5, 17, 17, 200, 0.75, 4]];
  for (const [i, [ago, hour, seed, offset, k, rounds]] of plan.entries()) {
    const parts = Array.from({ length: rounds }, (_, r) => makeDemo(seed + r * 100, { yaw: 0.7, pitch: 0.35 }));
    const input = { loc: [], gyro: [], grav: [], acc: [] };
    let t0 = 0;
    for (const p of parts) { for (const key of ['loc', 'gyro', 'grav', 'acc']) for (const x of p[key]) input[key].push({ ...x, t: x.t + t0 }); t0 += p.gyro[p.gyro.length - 1].t + 0.1; }
    input.loc = input.loc.map(p => ({ ...p, speed: p.speed * 0.68 }));   // bykjøring: gatene har 30–50
    input.acc = input.acc.map(a => ({ ...a, x: a.x * k * 0.75, y: a.y * k * 0.75, z: a.z * k * 0.75 }));
    input.gyro = input.gyro.map(a => ({ ...a, x: a.x * k, y: a.y * k, z: a.z * k }));
    if (k < 1) { const sp = input.loc.map(p => p.speed), w = Math.round((1 - k) * 6); input.loc = input.loc.map((p, j) => { let t = 0, n = 0; for (let q = Math.max(0, j - w); q <= Math.min(sp.length - 1, j + w); q++) { t += sp[q]; n++; } return { ...p, speed: t / n }; }); }
    let s = offset, prev = null;
    input.loc = input.loc.map(p => { if (prev) s += Math.max(0, (p.speed + prev.speed) / 2) * (p.t - prev.t); prev = p; const q = at(s); return { ...p, lat: q.lat, lon: q.lon, bearing: q.bearing }; });
    const start = new Date(now - ago * DAY); start.setHours(hour, (i * 13) % 60, 0, 0);
    await importDrive({ drive: { id: 'demo-emma-' + i, startedAt: start.toISOString(), driver: 'Emma', imported: false, surface: 'dry' }, input }, { keepId: true });
  }
}

/* Emmas teori: øvd de siste to ukene, tre prøver (37, 40 og 42 riktige) og teoriprøven om 12 dager */
export function emmaTheory(now = Date.now()) {
  const rand = rng(42);
  let p = emptyProgress();
  const pool = QUESTIONS.filter(() => rand() < 0.7);
  pool.forEach((q, i) => {
    const t = now - (14 - Math.floor(i / pool.length * 14)) * DAY + 3600000;
    const right = rand() < 0.82;
    p = answer(p, q.id, right ? 0 : 1, t);
    if (right && rand() < 0.6) p = answer(p, q.id, 0, t + 60000);
    if (right && rand() < 0.5) p = answer(p, q.id, 0, t + 120000);
  });
  [[37, 9], [40, 5], [42, 2]].forEach(([c, ago], k) => {
    const ids = buildExam(QUESTIONS, { rand: rng(7 + k) });
    const r = scoreExam(QUESTIONS, ids, Object.fromEntries(ids.map((id, i) => [id, i < c ? 0 : 1])));
    p = addExam(p, r, { at: now - ago * DAY, sec: 2900 + k * 300, ids });
  });
  const exam = new Date(now + 12 * DAY);
  return { ...p, marks: pool.slice(0, 3).map(q => q.id), examDate: dayKey(exam.getTime()), remind: { on: false, time: '18:00' } };
}

/* Fyller demoen første gang (og når DEMO_V øker). Svarer true når noe ble lagt inn, så appen kan starte på nytt. */
export async function seedDemo(now = Date.now()) {
  if (!isDemoMode()) return false;
  const s = getSettings();
  if (s.demoSeeded === DEMO_V) return false;
  await emmaDrives(now);
  await createTestDrives(now, { only: ['Jonas', 'Sara'] });
  const lesson = new Date(now - 9 * DAY).toISOString().slice(0, 10);
  saveSettings({
    ...s, demoSeeded: DEMO_V, name: 'Emma', drivers: ['Emma'], activeDriver: 'Emma', homeDriver: 'Emma', activeStudent: 'Emma',
    students: TEST_STUDENTS.map(({ name, email }) => ({ name, email })),
    viewMode: 'plus', devPlus: '', scopeOwn: true, introSeen: true, camIntroSeen: true, hideInstallHint: true, lastBackupAt: new Date(now).toISOString(),
    guidesClosed: { start: true, holder: true, camera: true, report: true, backup: true, teacher: true, dark: true },
    focus: ['roundabout', 'mirror'], lessons: { Emma: lesson },
    curriculum: { Emma: { tgk: { done: true, at: new Date(now - 90 * DAY).toISOString() }, teori: { done: true, at: new Date(now - 60 * DAY).toISOString() }, trinn2: { done: true, at: new Date(now - 9 * DAY).toISOString() } } },
    theory: { Emma: emmaTheory(now) }
  });
  return true;
}
