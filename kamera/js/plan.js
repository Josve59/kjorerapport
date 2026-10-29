/* Når skal testappen se på føreren, og når på veien? (k0.6.0)
   Nettleseren på iPhone kan bare bruke ett kamera om gangen, og et bytte tar rundt 0,85 s (kameratesten).
   Simulering på ekte turer viste at korte veiblikk (1,5 s) og å bli på føreren i svinger beholder 81–88 %
   av speil- og skulderblikkene, mot 61–79 % med lange veiperioder. Alt her er rene funksjoner, så det kan
   testes i Node. Tider i sekunder. */

export const LOOK = 1.5;          // et veiblikk: så lenge veikameraet faktisk gir brukbare bilder
export const LOOK_LONG = 2.5;     // rett vei i jevn fart, når veikameraet har sett noe nyttig: flere bilder per bytte
export const SWITCH = 0.85;       // målt byttetid (første bilde + lys innstilt), iPhone, 27. okt.
const MIN_FRONT = 5, MAX_FRONT = 26;   // førerkameraet minst ~60 % av tiden, veikameraet minst ~5 %
const DARK_LUM = 40;              // snittlysstyrke (0–255) for et mørkt bilde (natt)

/* Førerprofil fra de siste turene (opptil 5) for samme fører. results: [{ camera, road, stats }].
   Andelene glattes (Beta(1,1)), så få feltskifter ikke gir bastante tall. */
export function driverProfile(results) {
  const recent = (results || []).filter(r => r && (r.camera || r.road)).slice(0, 5);
  let mY = 0, mN = 0, sY = 0, sN = 0, away = 0, close = 0, min = 0;
  for (const r of recent) {
    for (const l of (r.camera && r.camera.calibrated && r.camera.lane) || []) {
      if (l.mirror === true) mY++; else if (l.mirror === false) mN++;
      if (l.shoulder === true) sY++; else if (l.shoulder === false) sN++;
    }
    if (r.camera && r.camera.calibrated) away += (r.camera.away || []).length;
    if (r.road) close += r.road.close.length;
    min += (r.stats && r.stats.duration ? r.stats.duration : 0) / 60;
  }
  const rate = (y, n) => (y + 1) / (y + n + 2);
  return {
    drives: recent.length, lanes: Math.max(mY + mN, sY + sN),
    mirror: rate(mY, mN), shoulder: rate(sY, sN),
    awayPer10: min > 1 ? away / min * 10 : 0, closePer10: min > 1 ? close / min * 10 : 0
  };
}

/* Hvor lenge førerkameraet ser føreren mellom veiblikkene, ut fra dagens mål og førerprofilen.
   Dagens mål veier tyngst. Returnerer { fast, city, reasons } (fast = over 50 km/t). */
export function planSettings({ profile = null, focus = [] } = {}) {
  let fast = 8, city = 12;
  const reasons = [];
  const f = new Set(focus || []);
  if (f.has('mirror') || f.has('lane')) { fast = 25; city = 25; reasons.push('Dagens mål handler om speil og feltskifte: mest førerkamera'); }
  else if (f.has('smooth') || f.has('limits') || f.has('brake')) { fast = 6; city = 8; reasons.push('Dagens mål handler om fart og avstand: oftere veiblikk'); }
  else if (profile && profile.drives) {
    if (profile.closePer10 >= 1) { fast *= 0.6; city *= 0.7; reasons.push('Tidligere turer: ofte for nær bilen foran, oftere veiblikk'); }
    if (profile.lanes >= 6 && profile.mirror >= 0.85 && profile.shoulder >= 0.85) { fast *= 0.75; city *= 0.8; reasons.push('Tidligere turer: god på speil og skulderblikk, litt mer tid på veien'); }
    else if (profile.lanes >= 4 && (profile.mirror < 0.6 || profile.shoulder < 0.6)) { fast *= 1.5; city *= 1.4; reasons.push(`Tidligere turer: ${profile.shoulder < profile.mirror ? 'skulderblikk' : 'speil'} bør øves, mer tid på føreren`); }
  }
  const clamp = v => Math.round(Math.max(MIN_FRONT, Math.min(MAX_FRONT, v)) * 10) / 10;
  return { fast: clamp(fast), city: clamp(city), reasons };
}

/* Andel tid per kamera for en plan (for rapporten og testene). */
export function planShares(front) {
  const cycle = front + LOOK + 2 * SWITCH;
  return { front: front / cycle, road: LOOK / cycle, blind: 2 * SWITCH / cycle };
}

/* Planleggeren: kalles flere ganger i sekundet med det sensorene vet nå, også mens kameraet bytter.
   s: { now, kmh, yaw (°/s, rotasjon om loddlinjen), hacc (m/s², vannrett akselerasjon), facing,
        switching (true til kameraet gir brukbare bilder: bytte + lyset innstilt), lastLead: { headway, at } | null }
   Returnerer { want: 'user' | 'environment', reason }. Statistikk over veiblikk og grunner samles i .stats.
   fn.road(sample) skal kalles for hvert bilde fra veikameraet ({ lead, cars, people, lane, lum }).

   Hva som styrer (k0.6.3, etter turene 29. okt.):
   - Førerkameraet i svinger, rundkjøringer og inn mot kryss (farten faller under 50 km/t), og de første
     8 s etter igangkjøring: der skjer speil- og skulderblikkene.
   - Veiblikk på rett vei i jevn fart, der plassering og avstand kan måles. Plassering og avstand endrer seg
     sakte, så stikkprøver holder. Over 60 km/t og når forrige blikk så noe: lengre blikk (2,5 s).
   - Ser førerkameraet et blikk i sidespeilet eller over skulderen, blir det på føreren i 8 s (k0.6.5):
     et feltskifte kommer trolig, og skulderblikket skal med.
   - I mørket ser veikameraet like ofte (k0.6.4: mye av øvingen i Norge skjer i mørket). Bare i lyse bilder
     der det ikke finnes noe å se (kameraet dekket, feil vei) blir det litt færre veiblikk. */
export function createPlanner(settings) {
  let phase = 'user', since = -Infinity, lastTurn = -Infinity, lastLookEnd = -Infinity, lastSlow = -Infinity, holdUntil = -Infinity;
  let reason = 'start', lookLen = LOOK, look = null;
  const hist = [];     // fart siste 5 s
  const recent = [];   // de siste veiblikkene: { useful, dark }
  const stats = { looks: 0, byReason: {}, holds: {}, front: 0, road: 0, blind: 0, last: null, useful: 0, dark: 0 };
  const startLook = (now, why, long = false) => {
    phase = 'environment'; since = now; reason = why; lookLen = long ? LOOK_LONG : LOOK; look = { n: 0, useful: false, darkN: 0 };
    stats.looks++; stats.byReason[why] = (stats.byReason[why] || 0) + 1;
  };
  const endLook = (now, why) => {
    phase = 'user'; since = now; lastLookEnd = now; reason = why;
    if (look && look.n) {
      const q = { useful: look.useful, dark: !look.useful && look.darkN >= look.n / 2 };
      recent.push(q); if (recent.length > 4) recent.shift();
      if (q.useful) stats.useful++; if (q.dark) stats.dark++;
    }
    look = null;
  };
  const hold = (why, now, until) => { if (now >= holdUntil) stats.holds[why] = (stats.holds[why] || 0) + 1; holdUntil = Math.max(holdUntil, until); reason = why; };
  // Hvor nyttig veikameraet har vært: ingenting i de 4 siste lyse blikkene → litt sjeldnere. Mørke blikk teller ikke.
  const quality = () => {
    const u = recent.length >= 4 ? recent.slice(-4) : null;
    if (u && u.every(q => !q.useful && !q.dark)) return { factor: 1.6, cap: 40 };
    return { factor: 1, cap: MAX_FRONT };
  };
  const fn = s => {
    const { now, kmh = NaN, yaw = 0, hacc = 0, facing = phase, switching = false, lastLead = null } = s;
    if (since === -Infinity) since = now;
    // Tid telles fra kameraet faktisk gir brukbare bilder
    if (switching || facing !== phase) since = Math.max(since, now);
    if (stats.last !== null) { const dt = Math.min(now - stats.last, 1); if (switching) stats.blind += dt; else if (facing === 'user') stats.front += dt; else stats.road += dt; }
    stats.last = now;
    const turning = Math.abs(yaw) > 6;
    if (turning) lastTurn = now;
    const slow = !(kmh >= 15);
    if (slow) lastSlow = now;
    if (Number.isFinite(kmh)) { hist.push({ now, kmh }); while (hist.length && now - hist[0].now > 5) hist.shift(); }
    // Inn mot kryss eller rundkjøring: farten faller jevnt (ikke bråbrems) under 50 km/t
    const before = hist.find(h => now - h.now <= 4);
    const slowing = before && kmh < 50 && before.kmh - kmh >= 8 && hacc <= 3;
    if (phase === 'environment') {
      if (slow || turning || slowing || now - since >= lookLen) endLook(now, slow ? 'lav fart' : turning ? 'sving' : slowing ? 'kryss nærmer seg' : 'veiblikk ferdig');
      return { want: phase, reason };
    }
    if (slow) { reason = 'lav fart'; return { want: 'user', reason }; }
    const q = quality();
    // Kraftig vannrett akselerasjon uten sving = nedbremsing (eller kraftig gass): se veien med en gang
    if (hacc > 3 && !turning && kmh >= 20 && now - lastLookEnd > 3) { startLook(now, 'nedbremsing'); return { want: phase, reason }; }
    if (turning || now - lastTurn < 3) { reason = 'sving'; return { want: 'user', reason }; }
    if (now - lastSlow < 8) { hold('igangkjøring', now, lastSlow + 8); return { want: 'user', reason }; }
    if (slowing) hold('kryss nærmer seg', now, now + 4);
    if (now < holdUntil) return { want: 'user', reason };
    let interval = Math.min(q.cap, (kmh >= 50 ? settings.fast : settings.city) * q.factor);
    const near = lastLead && lastLead.headway < 1.5 && now - lastLead.at < 30;
    if (near) interval = Math.min(interval, 5);
    if (now - Math.max(since, lastLookEnd) >= interval) {
      const last = recent[recent.length - 1];
      const long = kmh >= 60 && now - lastTurn > 10 && (!last || last.useful);
      startLook(now, near && interval === 5 ? 'bil nær foran' : 'veiblikk', long);
      return { want: phase, reason };
    }
    reason = 'fører';
    return { want: 'user', reason };
  };
  // Førerkameraet så et blikk i sidespeilet eller over skulderen: et feltskifte eller en sving kommer trolig.
  // Bli på føreren i 8 s, så resten av sjekken (og skulderblikket) blir med (k0.6.5).
  fn.glance = (now, cls) => {
    if (!['left', 'right', 'shoulderL', 'shoulderR'].includes(cls)) return;
    if (phase === 'user') hold('speilblikk', now, now + 8);
  };
  // Hvert bilde fra veikameraet: så det noe (bil, folk, feltlinje), og var det mørkt?
  fn.road = r => {
    if (!look || !r) return;
    look.n++;
    if ((r.lead && r.lead.src !== 'baklys') || r.cars > 0 || r.people > 0 || (r.lane && (r.lane.l || r.lane.r))) look.useful = true;
    if (Number.isFinite(r.lum) && r.lum < DARK_LUM) look.darkN++;
  };
  fn.stats = stats;
  fn.settings = settings;
  return fn;
}
