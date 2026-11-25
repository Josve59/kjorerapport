/* Blinklyset hørt med mikrofonen (1.1.0). iPhone-appen (BlinkListener.swift) finner korte klikk i lyden mens et opptak
   pågår, og sender bare tidspunktet og styrken på klikkene og lydnivået. Lyden lagres eller sendes aldri.
   Her finnes blinklyset i klikkene: reléet tikker jevnt, 60–120 ganger i minuttet (kravet er 90 ± 30), ofte med et
   klikk når lyset tennes og et når det slukner. Seks klikk på rad med samme avstand er blinklyset.
   Radio og musikk har også jevn takt: hører appen «blinklys» store deler av turen, vurderes det ikke.
   raw: [{ t, s }] (klikk, sekunder fra start og styrke i dB over bakgrunnen) og [{ t, db }] (lydnivået, ett i sekundet).
   Ren modul, testes i Node. Alle tider i sekunder. */

export const BLINK = {
  minC: 0.48, maxC: 1.05, step: 0.01,   // periode (en hel blink): 0,5–1,0 s, litt slingringsmonn
  tol: 0.012,                            // reléet er jevnt; klikkene finnes på 5 ms nær
  chain: 6,                              // seks klikk på rad med samme avstand (ett kan mangle). Med fem og 25 ms
                                         // ga tilfeldig støy (3 klikk i sekundet) «blinklys» 24 % av tiden, nå 0 %
  win: 6,                                // sekunder bakover fra tidspunktet som vurderes
  maxMad: 0.003,                         // reléet er nesten helt jevnt: avstanden i kjeden varierer høyst 3 ms i snitt.
                                         // Bilen 25. nov.: blinklyset 0–4 ms, vindusviskere eller radio 6–8 ms (1.1.2)
  maxClicks: 48,                         // flere klikk enn dette på 6 s (8 i sekundet): for mye støy til å si noe. 1.1.1 satte
                                         // 30 mot falske blinklys i støy, men da forsvant blinklys som tikker to ganger per
                                         // blink. Med jevnhetskravet (maxMad) og bilens takt holder 48 (1.1.2)
  before: 8,                             // så mange sekunder før manøveren teller blinklyset
  music: 0.3                             // «blinklys» mer enn 30 % av tiden: radio eller musikk
};

/* Første indeks med t >= x */
function lower(a, x) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].t < x) lo = m + 1; else hi = m; }
  return lo;
}

/* Hvor jevn en kjede er (1.1.2): gjennomsnittlig avvik (s) fra kjedens egen periode. Et manglende klikk gir dobbel avstand. */
function steadiness(times, C) {
  const per = [];
  for (let k = 1; k < times.length; k++) { const dt = times[k] - times[k - 1], m = Math.max(1, Math.round(dt / C)); per.push(dt / m); }
  if (!per.length) return { mad: Infinity, mean: C };
  const mean = per.reduce((a, b) => a + b, 0) / per.length;
  return { mad: per.reduce((a, b) => a + Math.abs(b - mean), 0) / per.length, mean };
}

/* Lengste kjede av klikk med avstand C (ett manglende klikk tillatt) → { n, from, to, mad } */
function chainFor(w, C, tol) {
  let best = { n: 0, from: 0, to: 0, times: [] };
  for (let i = 0; i < w.length; i++) {
    let last = w[i].t, miss = 0, j = i + 1;
    const times = [w[i].t];
    for (;;) {
      const target = last + C;
      while (j < w.length && w[j].t < target - tol) j++;
      if (j < w.length && w[j].t <= target + tol) { last = w[j].t; times.push(last); j++; continue; }
      if (miss < 1) { miss++; last = target; continue; }
      break;
    }
    if (times.length > best.times.length) best = { n: times.length, from: times[0], to: times[times.length - 1], times };
  }
  const st = steadiness(best.times, C);
  return { n: best.n, from: best.from, to: best.to, mad: st.mad, mean: st.mean };
}

/* Tikker blinklyset ved tiden t? clicks sortert på t. → { on, c (periode), n (klikk i kjeden), noisy } */
export function periodicAt(clicks, t, opt = BLINK) {
  const w = clicks.slice(lower(clicks, t - opt.win), lower(clicks, t + 1e-9));
  if (w.length > opt.maxClicks) return { on: false, c: null, n: 0, noisy: true };
  if (w.length < opt.chain) return { on: false, c: null, n: 0, noisy: false };
  // Den lengste kjeden som er jevn nok: blinklyset er et relé, så avstanden er nesten helt lik (maxMad)
  let best = { n: 0, c: null, mad: Infinity };
  for (let C = opt.minC; C <= opt.maxC + 1e-9; C += opt.step) {
    const ch = chainFor(w, C, opt.tol);
    if (ch.n >= opt.chain && ch.mad > opt.maxMad) continue;
    // c er kjedens egen periode (ikke rutenettet på 10 ms), så bilens takt blir riktig (0,720, ikke 0,71 eller 0,72)
    if (ch.n > best.n || (ch.n === best.n && ch.mad < best.mad)) best = { n: ch.n, c: Math.round(ch.mean * 1000) / 1000, mad: ch.mad };
  }
  return { on: best.n >= opt.chain, c: best.c, n: best.n, mad: best.mad, noisy: false };
}

/* Bilens blinklystakt (1.1.2): reléet har samme takt hele turen. Den finnes fra de jevneste kjedene (høyst 1,5 ms avvik),
   og deretter teller bare kjeder med den takten (±20 ms), og fem klikk holder. Bilen 25. nov.: blinklyset 0,72 s, og
   en annen jevn lyd (vindusviskere eller radio) 0,91 s som ellers ble tatt for blinklys. Uten slike kjeder: null. */
export function carPeriod(clicks, opt = BLINK, step = 2) {
  if (!clicks.length) return null;
  const ps = [];
  for (let t = clicks[0].t + opt.win; t <= clicks[clicks.length - 1].t + 1e-9; t += step) {
    const r = periodicAt(clicks, t, opt);
    if (r.on && r.mad <= 0.0015) ps.push(r.c);
  }
  if (ps.length < 3) return null;
  ps.sort((a, b) => a - b);
  return ps[Math.floor(ps.length / 2)];
}
export const forPeriod = (P, opt = BLINK) => (P ? { ...opt, minC: P - 0.02, maxC: P + 0.02, chain: 5 } : opt);

/* Hørte appen blinklyset en gang mellom a og b? Vurderes hvert halve sekund. */
export function heardBetween(clicks, a, b, opt = BLINK) {
  for (let t = a + 2; t <= b + 1e-9; t += 0.5) if (periodicAt(clicks, t, opt).on) return true;
  return false;
}

/* Svinger i kryss fra GPS-sporet: minst 60° på høyst 12 s i under 45 km/t, ikke i en rundkjøring.
   points: [{ t, lat, lon, kmh }]. → [{ t (midt i svingen), tFrom (svingen begynner), dir: 'høyre'|'venstre' }] */
export function findTurns(points, roundabouts = []) {
  const n = points.length, h = new Array(n).fill(NaN);
  for (let i = 1; i < n - 1; i++) {
    const a = points[i - 1], b = points[i + 1];
    if (!(points[i].kmh >= 5)) continue;
    const k = Math.cos(a.lat * Math.PI / 180), dx = (b.lon - a.lon) * k, dy = b.lat - a.lat;
    if (Math.hypot(dx, dy) * 111200 < 3) continue;
    h[i] = Math.atan2(dx, dy) * 180 / Math.PI;
  }
  const diff = (x, y) => { let d = y - x; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  const inRb = t => roundabouts.some(r => t >= r.tFrom - 3 && t <= r.tTo + 3);
  const out = [];
  for (let i = 1; i < n - 1; i++) {
    if (!Number.isFinite(h[i])) continue;
    let j = -1, acc = 0, prev = h[i], maxKmh = 0;
    for (let k = i + 1; k < n - 1 && points[k].t - points[i].t <= 12; k++) {
      if (!Number.isFinite(h[k])) continue;
      acc += diff(prev, h[k]); prev = h[k]; maxKmh = Math.max(maxKmh, points[k].kmh);
      if (Math.abs(acc) >= 60) { j = k; break; }
    }
    if (j < 0 || maxKmh > 45) continue;
    // Starten: der retningen har endret seg 10°, midten: 30°
    let s = i, m = j, a2 = 0; prev = h[i];
    for (let k = i + 1; k <= j; k++) {
      if (!Number.isFinite(h[k])) continue;
      a2 += diff(prev, h[k]); prev = h[k];
      if (s === i && Math.abs(a2) >= 10) s = k;
      if (Math.abs(a2) >= 30) { m = k; break; }
    }
    if (!inRb(points[m].t)) out.push({ t: points[m].t, tFrom: points[s].t, dir: acc > 0 ? 'høyre' : 'venstre' });
    while (i < n - 1 && points[i].t < points[j].t + 5) i++;
  }
  return out;
}

/* Blinklys før feltskifter og svinger. raw: klikk og lydnivå (se øverst), tider relative til rapporten.
   → null uten mikrofon, ellers { checks: [{ t, kind: 'lane'|'turn', dir, heard }], music, listened (s) } */
export function blinkChecks(raw, { laneChanges = [], turns = [] } = {}, opt = BLINK) {
  const clicks = (raw || []).filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.s)).sort((a, b) => a.t - b.t);
  const levels = (raw || []).filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.db)).sort((a, b) => a.t - b.t);
  if (!levels.length) return null;
  const covered = (a, b) => { const i = lower(levels, a); return i < levels.length && levels[i].t <= b; };
  // Musikk eller annen jevn lyd: hvor ofte «blinklyset» tikker, hvert 5. sekund mens mikrofonen var på
  let on = 0, n = 0;
  for (const x of levels) { if (Math.round(x.t) % 5) continue; n++; if (periodicAt(clicks, x.t, opt).on) on++; }
  const music = n ? Math.round(on / n * 100) / 100 : 0;
  const listened = levels.length;
  if (music > opt.music) return { checks: [], music, listened };
  // Ingen klikk i det hele tatt på over et minutt (1.1.1): mikrofonen hørte ikke noe som ligner, så «blinket ikke» ville
  // vært gjetning. Da vurderes det ikke.
  if (listened >= 60 && clicks.length < 5) return { checks: [], music, listened, silent: true };
  const period = carPeriod(clicks, opt);
  const o2 = forPeriod(period, opt);
  const checks = [];
  const check = (kind, tStart, tEnd, dir) => {
    const a = tStart - opt.before;
    if (!covered(a, a + 2) || !covered(tStart - 2, tStart + 2)) return;   // mikrofonen var ikke på hele tiden
    // Blinklyset tikker gjennom svingen til rattet er rettet ut: tre sekunder etter midten av svingen teller (1.1.2)
    const heard = heardBetween(clicks, a, tEnd + 3, o2);
    // Tikket det også et godt stykke før? Da kan det være noe annet (eller blinking for en annen manøver): ukjent
    const earlier = heardBetween(clicks, a - 25, a - 8, o2);
    if (heard && earlier) return;
    checks.push({ t: Math.round(tStart * 10) / 10, tMid: Math.round(tEnd * 10) / 10, kind, dir: dir || '', heard });
  };
  for (const l of laneChanges) check('lane', l.tFrom, l.t, l.dir);
  for (const tr of turns) check('turn', tr.tFrom, tr.t, tr.dir);
  checks.sort((x, y) => x.t - y.t);
  return { checks, music, listened, ...(period ? { period } : {}) };
}
