/* Når skal testappen se på føreren, og når på veien? (k0.6.0)
   Nettleseren på iPhone kan bare bruke ett kamera om gangen, og et bytte tar rundt 0,85 s (kameratesten).
   Simulering på ekte turer viste at korte veiblikk (1,5 s) og å bli på føreren i svinger beholder 81–88 %
   av speil- og skulderblikkene, mot 61–79 % med lange veiperioder. Alt her er rene funksjoner, så det kan
   testes i Node. Tider i sekunder. */

export const LOOK = 1.5;          // et veiblikk: så lenge veikameraet faktisk gir bilder
export const SWITCH = 0.85;       // målt byttetid (første bilde + lys innstilt), iPhone, 27. okt.
const MIN_FRONT = 5, MAX_FRONT = 26;   // førerkameraet minst ~60 % av tiden, veikameraet minst ~5 %

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

/* Planleggeren: kalles flere ganger i sekundet med det sensorene vet nå.
   s: { now, kmh, yaw (°/s, rotasjon om loddlinjen), hacc (m/s², vannrett akselerasjon), facing, switching,
        lastLead: { headway, at } | null }
   Returnerer { want: 'user' | 'environment', reason }. Statistikk over veiblikk og grunner samles i .stats. */
export function createPlanner(settings) {
  let phase = 'user', since = -Infinity, lastTurn = -Infinity, lastLookEnd = -Infinity, reason = 'start';
  const stats = { looks: 0, byReason: {}, front: 0, road: 0, blind: 0, last: null };
  const startLook = (now, why) => { phase = 'environment'; since = now; reason = why; stats.looks++; stats.byReason[why] = (stats.byReason[why] || 0) + 1; };
  const fn = s => {
    const { now, kmh = NaN, yaw = 0, hacc = 0, facing = phase, switching = false, lastLead = null } = s;
    if (since === -Infinity) since = now;
    // Tid telles fra kameraet faktisk viser bildet
    if (switching || facing !== phase) since = Math.max(since, now);
    if (stats.last !== null) { const dt = Math.min(now - stats.last, 1); if (switching) stats.blind += dt; else if (facing === 'user') stats.front += dt; else stats.road += dt; }
    stats.last = now;
    const turning = Math.abs(yaw) > 6;
    if (turning) lastTurn = now;
    const slow = !(kmh >= 15);
    if (phase === 'environment') {
      if (slow || turning || now - since >= LOOK) { phase = 'user'; since = now; lastLookEnd = now; reason = slow ? 'lav fart' : turning ? 'sving' : 'veiblikk ferdig'; }
      return { want: phase, reason };
    }
    if (slow) { reason = 'lav fart'; return { want: 'user', reason }; }
    // Kraftig vannrett akselerasjon uten sving = nedbremsing (eller kraftig gass): se veien med en gang
    if (hacc > 3 && !turning && kmh >= 20 && now - lastLookEnd > 3) { startLook(now, 'nedbremsing'); return { want: phase, reason }; }
    if (turning || now - lastTurn < 3) { reason = 'sving'; return { want: 'user', reason }; }
    let interval = kmh >= 50 ? settings.fast : settings.city;
    if (lastLead && lastLead.headway < 1.5 && now - lastLead.at < 30) interval = Math.min(interval, 5);
    if (now - Math.max(since, lastLookEnd) >= interval) { startLook(now, lastLead && lastLead.headway < 1.5 && interval === 5 ? 'bil nær foran' : 'veiblikk'); return { want: phase, reason }; }
    reason = 'fører';
    return { want: 'user', reason };
  };
  fn.stats = stats;
  fn.settings = settings;
  return fn;
}
