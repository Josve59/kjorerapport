// Testdata til App Store-bildene (bare testbygg, KJ_EVAL). Den oppdiktede eleven Emma, som i demoen (js/demo.js), men i
// den vanlige lagringen, så demolinjen «Demo med Emma» ikke vises: åtte øvingsturer langs offentlige gater i Trondheim
// som blir roligere over tid, teori med tre prøver og en prøvedato, og Pluss på. Ingenting her er ekte.
// 1.0.0 (22.11.2026): sletter alle turer og innstillinger i simulatorappen første gang.
(async () => {
  const js = f => import(new URL('js/' + f, location.href).href);
  const plus = await js('plus.js');
  plus.setDevPlus(true);   // Pluss på (bare i minnet, hver gang appen starter)
  if (localStorage.getItem('kjShotsSeeded') === '11') return;
  const [db, an, demo, { DEMO_ROUTE: ROUTE }] = await Promise.all([js('db.js'), js('analysis.js'), js('demo.js'), js('demo-route.js')]);
  const now = Date.now(), DAY = 86400000;
  const R = 6371000, rad = Math.PI / 180;
  const dist = (a, b) => Math.hypot((b[1] - a[1]) * rad * Math.cos(a[0] * rad), (b[0] - a[0]) * rad) * R;
  const cum = [0]; for (let i = 1; i < ROUTE.length; i++) cum.push(cum[i - 1] + dist(ROUTE[i - 1], ROUTE[i]));
  const total = cum[cum.length - 1];
  const at = s => {
    s = ((s % total) + total) % total; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const a = ROUTE[i - 1], b = ROUTE[i], f = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return { lat: a[0] + (b[0] - a[0]) * f, lon: a[1] + (b[1] - a[1]) * f, bearing: (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * rad), b[0] - a[0]) / rad + 360) % 360 };
  };
  for (const d of await db.listDrives()) await db.deleteDrive(d.id);
  // [dager siden, klokka, frø, hvor på ruta, hvor brå (1 = som demoturen), runder]: eldre turer brå, de nyeste mykere
  const plan = [[34, 17, 3, 0, 1.3, 2], [31, 12, 5, 900, 1.2, 3], [27, 18, 7, 1800, 1.1, 2], [24, 14, 9, 400, 1.0, 4], [20, 19, 11, 2600, 0.95, 3], [16, 11, 13, 1200, 0.9, 5], [11, 18, 15, 3100, 0.85, 3], [2, 17, 17, 200, 0.75, 4]];
  for (const [i, [ago, hour, seed, offset, k, rounds]] of plan.entries()) {
    const parts = Array.from({ length: rounds }, (_, r) => an.makeDemo(seed + r * 100, { yaw: 0.7, pitch: 0.35 }));
    const input = { loc: [], gyro: [], grav: [], acc: [] };
    let t0 = 0;
    for (const p of parts) { for (const key of ['loc', 'gyro', 'grav', 'acc']) for (const x of p[key]) input[key].push({ ...x, t: x.t + t0 }); t0 += p.gyro[p.gyro.length - 1].t + 0.1; }
    input.loc = input.loc.map(p => ({ ...p, speed: p.speed * 0.68 }));   // bykjøring: gatene har 30–50
    input.acc = input.acc.map(a => ({ ...a, x: a.x * k * 0.75, y: a.y * k * 0.75, z: a.z * k * 0.75 }));
    input.gyro = input.gyro.map(a => ({ ...a, x: a.x * k, y: a.y * k, z: a.z * k }));
    if (k < 1) { const sp = input.loc.map(p => p.speed), w = Math.round((1 - k) * 6); input.loc = input.loc.map((p, j) => { let t = 0, n = 0; for (let q = Math.max(0, j - w); q <= Math.min(sp.length - 1, j + w); q++) { t += sp[q]; n++; } return { ...p, speed: t / n }; }); }
    // Den nyeste turen holder fartsgrensen i sentrum (30–50 km/t): Emma har øvd på fart siden forrige gang
    if (i === plan.length - 1) input.loc = input.loc.map(p => ({ ...p, speed: p.speed < 7 ? p.speed : 7 + (p.speed - 7) * 0.25 }));
    let s = offset, prev = null;
    input.loc = input.loc.map(p => { if (prev) s += Math.max(0, (p.speed + prev.speed) / 2) * (p.t - prev.t); prev = p; const q = at(s); return { ...p, lat: q.lat, lon: q.lon, bearing: q.bearing }; });
    const start = new Date(now - ago * DAY); start.setHours(hour, (i * 13) % 60, 0, 0);
    await db.importDrive({ drive: { id: 'emma' + i, startedAt: start.toISOString(), driver: 'Emma', imported: false, surface: 'dry' }, input }, { keepId: true });
  }
  // Innstillingene fra bunnen av: bare Emma, ingen elevliste, meldinger eller lekser fra tidligere tester
  for (const key of Object.keys(localStorage)) if (key.startsWith('kjorerapport.')) localStorage.removeItem(key);
  // Teorien som i demoen, og litt øving tidligere i dag, så dagens mål ikke står på 0 når bildene tas om morgenen
  const [th, { QUESTIONS }] = await Promise.all([js('theory.js'), js('theory-b.js')]);
  let theory = demo.emmaTheory(now);
  const midnight = new Date(now).setHours(0, 0, 0, 0), from = Math.max(midnight + 300000, now - 100 * 60000);
  const due = th.dueList(QUESTIONS, theory, now).slice(0, 36), step = (now - 120000 - from) / Math.max(1, due.length);
  if (step > 0) due.forEach((q, i) => { theory = th.answer(theory, q.id, i % 9 === 4 ? 1 : 0, from + i * step); });
  // Sikkerhetskontrollen: 27 av 46 oppgaver kan hun, og quizen er halvveis (lært = tre riktige spredt over dager)
  const [{ SAFETY }, { SAFETY_QUIZ }] = await Promise.all([js('safety-check.js'), js('safety-quiz.js')]);
  SAFETY.forEach((t, i) => { if (i % 5 !== 2 && i % 7 !== 3) theory = th.markSafety(theory, t.id, i % 9 !== 8, now - (20 - (i % 14)) * DAY); });
  SAFETY_QUIZ.forEach((q, i) => {
    if (i % 2 === 0) for (const d of [12, 11, 9]) theory = th.answer(theory, q.id, 0, now - d * DAY + 18 * 3600000);
    else if (i % 4 === 1) theory = th.answer(theory, q.id, i % 8 === 5 ? 1 : 0, now - 2 * DAY + 18 * 3600000);
  });
  // Skiltprøven: 75 av 123 skilt lært
  const { SIGN_QUESTIONS } = await js('theory-signs.js');
  SIGN_QUESTIONS.forEach((q, i) => {
    if (i % 5 < 3) for (const d of [13, 12, 10]) theory = th.answer(theory, q.id, 0, now - d * DAY + 19 * 3600000);
    else if (i % 5 === 3) theory = th.answer(theory, q.id, i % 10 === 8 ? 1 : 0, now - 3 * DAY + 19 * 3600000);
  });
  // Forrige kjøretime for 18 dager siden, så «siden sist» på trafikklærersiden har tre turer
  const lesson = new Date(now - 18 * DAY).toISOString().slice(0, 10);
  db.saveSettings({
    ...db.getSettings(), name: 'Emma', drivers: ['Emma'], activeDriver: 'Emma', homeDriver: 'Emma', viewMode: 'plus', devPlus: '',
    introSeen: true, camIntroSeen: true, hideInstallHint: true, permOk: true, lockTipShown: 2, lastBackupAt: new Date(now).toISOString(),
    devMarks: false,   // ingen testknapper («Feltskifte», «Feil grense») på opptaksskjermen
    guidesClosed: { start: true, holder: true, camera: true, report: true, backup: true, teacher: true, dark: true },
    focus: ['roundabout', 'mirror'], lessons: { Emma: lesson },
    curriculum: { Emma: { tgk: { done: true, at: new Date(now - 90 * DAY).toISOString() }, teori: { done: true, at: new Date(now - 60 * DAY).toISOString() }, trinn2: { done: true, at: new Date(now - 18 * DAY).toISOString() } } },
    theory: { Emma: theory }
  });
  localStorage.setItem('kjShotsSeeded', '11');
  location.reload();
})().catch(e => console.error('seed', e));
