/* Speil- og skulderblikk fra hodets retning (kamera-testversjonen).
   Rene funksjoner uten nettleseravhengighet, så de kan testes i Node.
   Hodets retning (yaw = sidelengs, pitch = opp/ned) kommer fra ansiktsgjenkjenningen på telefonen.
   Bilder lagres aldri – bare vinklene. */

export const CLASS_LABEL = {
  forward: 'Rett fram',
  left: 'Venstre speil',
  right: 'Høyre speil',
  rear: 'Bakspeil',
  shoulderL: 'Skulderblikk venstre',
  shoulderR: 'Skulderblikk høyre',
  other: 'Ser et annet sted',
  none: 'Ser ikke ansiktet'
};
export const MIRRORS = ['left', 'right', 'rear'];
export const MIRROR_NAME = { left: 'venstre speil', right: 'høyre speil', rear: 'bakspeilet' };
/* «Høyre speil og bakspeilet ligger bare 10° fra hverandre» for kalibreringer med speil nær hverandre, ellers '' */
export function closeMirrorText(close) {
  if (!close || !close.length) return '';
  const p = close.slice().sort((a, b) => a.deg - b.deg)[0];
  const t = `${MIRROR_NAME[p.a]} og ${MIRROR_NAME[p.b]} ligger bare ${p.deg}° fra hverandre`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export const CALIB_STEPS = [
  { id: 'forward', text: 'Se rett fram på veien' },
  { id: 'left', text: 'Se i venstre sidespeil' },
  { id: 'right', text: 'Se i høyre sidespeil' },
  { id: 'rear', text: 'Se i bakspeilet' }
];

/* 4×4-matrisen fra MediaPipe (kolonnevis) → vinkler i grader. Fortegn spiller ingen rolle,
   fordi alt sammenlignes med kalibreringen. */
export function poseFromMatrix(m) {
  if (!m || m.length < 16) return null;
  const r02 = m[8], r22 = m[10], r12 = m[9], r10 = m[1], r11 = m[5];
  const deg = 180 / Math.PI;
  return {
    yaw: Math.atan2(r02, r22) * deg,
    pitch: Math.asin(Math.max(-1, Math.min(1, -r12))) * deg,
    roll: Math.atan2(r10, r11) * deg
  };
}

const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };

/* Øynene (k0.7.6): ansiktsmodellen gir også hvor øynene ser (blendshapes eyeLookIn/Out/Up/Down, 0–1). Et blikk i
   speilet tas ofte delvis med øynene, så hodet alene undervurderte blikket. Returnerer { ex, ey, blink }: øynenes
   vinkel sidelengs og opp/ned i omtrentlige grader (positiv ex = mot førerens venstre, positiv ey = opp), eller
   ex/ey NaN når øynene er lukket. Retningen i forhold til hodet finnes ved kalibreringen (sy, sp). */
export function eyesFromBlendshapes(categories) {
  if (!categories || !categories.length) return null;
  const v = {}; for (const c of categories) v[c.categoryName] = c.score;
  const b = k => v[k] || 0;
  const blink = (b('eyeBlinkLeft') + b('eyeBlinkRight')) / 2;
  if (blink > 0.55) return { ex: NaN, ey: NaN, blink };
  const ex = 30 * ((b('eyeLookOutLeft') + b('eyeLookInRight')) / 2 - (b('eyeLookInLeft') + b('eyeLookOutRight')) / 2);
  const ey = 25 * ((b('eyeLookUpLeft') + b('eyeLookUpRight')) / 2 - (b('eyeLookDownLeft') + b('eyeLookDownRight')) / 2);
  return { ex, ey, blink };
}
/* Blikket = hodet + øynene, når kalibreringen er tatt med øynene (calib.g). Ellers hodet som før, så eldre
   kalibreringer og turer virker uendret. */
export const useGaze = calib => !!(calib && calib.g && calib.g.ok);
export function toGaze(p, calib) {
  if (!p || !useGaze(calib) || !Number.isFinite(p.yaw)) return p;
  const g = calib.g, ex = Number.isFinite(p.ex) ? p.ex : 0, ey = Number.isFinite(p.ey) ? p.ey : 0;
  return { ...p, yaw: p.yaw + g.sy * ex, pitch: p.pitch + g.sp * ey, head: { yaw: p.yaw, pitch: p.pitch } };
}
export const gazeCalib = calib => (useGaze(calib) ? calib.g : calib);

/* Kalibrering: median av vinklene for hvert mål. Returnerer { forward, left, right, rear, ok, problem }, og med
   øynene målt også g: den samme kalibreringen for blikket (hode + øyne), med retningene sy og sp. */
export function calibrationFromSamples(byTarget) {
  const head = calibrationHead(byTarget);
  const all = Object.values(byTarget).flat().filter(p => p && Number.isFinite(p.yaw));
  if (!head.ok || all.filter(p => Number.isFinite(p.ex)).length < 0.6 * all.length) return head;
  // Øynene går samme vei som hodet når føreren ser i et speil: fortegnet som gjør det slik
  const med = (id, k) => median((byTarget[id] || []).filter(p => p && Number.isFinite(p[k])).map(p => p[k]));
  let cy = 0, cp = 0;
  for (const id of MIRRORS) {
    cy += (head[id].yaw - head.forward.yaw) * ((med(id, 'ex') - med('forward', 'ex')) || 0);
    cp += (head[id].pitch - head.forward.pitch) * ((med(id, 'ey') - med('forward', 'ey')) || 0);
  }
  const sy = cy < 0 ? -1 : 1, sp = cp < 0 ? -1 : 1;
  const gz = {};
  for (const [id, arr] of Object.entries(byTarget)) gz[id] = (arr || []).filter(p => p && Number.isFinite(p.yaw)).map(p => ({ yaw: p.yaw + sy * (Number.isFinite(p.ex) ? p.ex : 0), pitch: p.pitch + sp * (Number.isFinite(p.ey) ? p.ey : 0) }));
  const g = calibrationHead(gz);
  return g.ok ? { ...head, g: { ...g, sy, sp } } : head;
}
function calibrationHead(byTarget) {
  const out = {};
  for (const id of ['forward', ...MIRRORS]) {
    const s = (byTarget[id] || []).filter(p => p && Number.isFinite(p.yaw));
    out[id] = s.length >= 5 ? { yaw: median(s.map(p => p.yaw)), pitch: median(s.map(p => p.pitch)), n: s.length } : null;
  }
  const missing = ['forward', ...MIRRORS].filter(id => !out[id]);
  if (missing.length) return { ...out, ok: false, problem: 'missing', missing };
  const dist = id => Math.hypot(out[id].yaw - out.forward.yaw, out[id].pitch - out.forward.pitch);
  const tooClose = MIRRORS.filter(id => dist(id) < 8);
  if (tooClose.length) return { ...out, ok: false, problem: 'close', tooClose };
  if (Math.sign(out.left.yaw - out.forward.yaw) === Math.sign(out.right.yaw - out.forward.yaw)) return { ...out, ok: false, problem: 'sides' };
  // To speil nær hverandre (v0.11.1): kalibreringen godtas, men appen kan blande dem. Kalibreringen 3. nov. hadde
  // høyre speil og bakspeilet rundt 10° fra hverandre. close: [{ a, b, deg }] for par under 14°
  const pairs = [['left', 'rear'], ['right', 'rear'], ['left', 'right']];
  const close = pairs.map(([a, b]) => ({ a, b, deg: Math.round(Math.hypot(out[a].yaw - out[b].yaw, out[a].pitch - out[b].pitch)) })).filter(p => p.deg < 14);
  return { ...out, ok: true, ...(close.length ? { close } : {}) };
}

/* Klassifiserer én retning mot kalibreringen. */
export function classifyPose(pose, calib) {
  if (!pose || !Number.isFinite(pose.yaw)) return 'none';
  if (!calib || !calib.ok) return 'other';
  const f = calib.forward;
  const v = { y: pose.yaw - f.yaw, p: pose.pitch - f.pitch };
  const rel = id => ({ y: calib[id].yaw - f.yaw, p: calib[id].pitch - f.pitch });
  // Skulderblikk: hodet vridd tydelig lenger enn sidespeilet på samme side.
  // v0.7.8: minst 8° eller 40 % forbi speilet (før: 50 % + 5°). Kameraet undervurderer store vridninger og
  // mister ansiktet rundt 50–60°, så den gamle grensen (61° mot høyre i bilen vår) ble nesten aldri nådd.
  for (const [id, cls] of [['left', 'shoulderL'], ['right', 'shoulderR']]) {
    const t = rel(id);
    if (Math.sign(v.y) === Math.sign(t.y) && Math.abs(v.y) > Math.abs(t.y) + Math.max(8, 0.4 * Math.abs(t.y))) return cls;
  }
  const d = (a, b) => Math.hypot(a.y - b.y, 0.8 * (a.p - b.p));
  let best = 'forward', bd = d(v, { y: 0, p: 0 });
  for (const id of MIRRORS) { const dd = d(v, rel(id)); if (dd < bd) { bd = dd; best = id; } }
  const size = id => Math.hypot(rel(id).y, rel(id).p);
  const limit = best === 'forward' ? Math.max(7, 0.4 * Math.min(...MIRRORS.map(size))) : Math.max(7, 0.5 * size(best));
  return bd <= limit ? best : 'other';
}

/* Rett fram kan flytte seg litt under turen: føreren sitter annerledes, eller holderen siger. For hvert
   30-sekund finnes medianen av hodestillingene nær rett fram, og alle mål forskyves like mye (v0.7.8).
   Returnerer en funksjon t → { yaw, pitch } i grader. Aldri mer enn 10°. */
export function forwardDrift(samples, calib, { bucket = 30, near = 12, min = 30 } = {}) {
  const zero = () => ({ yaw: 0, pitch: 0 });
  zero.max = 0;
  if (!calib || !calib.ok) return zero;
  const s = samples.filter(x => x.ok && Number.isFinite(x.yaw) && Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  if (!s.length) return zero;
  const t0 = s[0].t, nb = Math.floor((s[s.length - 1].t - t0) / bucket) + 1;
  const clamp = v => Math.max(-10, Math.min(10, v));
  const offs = [];
  let prev = { yaw: 0, pitch: 0 }, k0 = 0;
  for (let k = 0; k < nb; k++) {
    const end = t0 + (k + 1) * bucket, w = [];
    while (k0 < s.length && s[k0].t < end) { w.push(s[k0]); k0++; }
    const near0 = w.filter(x => Math.hypot(x.yaw - calib.forward.yaw - prev.yaw, x.pitch - calib.forward.pitch - prev.pitch) < near);
    if (near0.length >= min) prev = { yaw: clamp(median(near0.map(x => x.yaw)) - calib.forward.yaw), pitch: clamp(median(near0.map(x => x.pitch)) - calib.forward.pitch) };
    offs.push(prev);
  }
  const fn = t => offs[Math.min(nb - 1, Math.max(0, Math.floor((t - t0) / bucket)))];
  fn.max = Math.max(0, ...offs.map(o => Math.hypot(o.yaw, o.pitch)));
  return fn;
}

/* Blikk: sammenhengende perioder mot et speil eller skulder.
   samples: [{ t, yaw, pitch, ok }] (sekunder). Mister kameraet ansiktet like etter at hodet var på vei
   kraftig til siden, regnes det som skulderblikk (ansiktet forsvinner ofte da). */
export function detectGlances(samples, calib, { maxGap = 0.35, minDur = 0.35 } = {}) {
  const s = samples.filter(x => Number.isFinite(x.t)).slice().sort((a, b) => a.t - b.t);
  const drift = forwardDrift(s, calib);
  // Tiden ett bilde dekker (median mellom bildene, 0,1–0,25 s): et blikk varer fra første bilde til etter det siste
  const steps = []; for (let i = 1; i < s.length; i++) { const d = s[i].t - s[i - 1].t; if (d > 0 && d < 1) steps.push(d); }
  const dt = Math.max(0.1, Math.min(0.25, steps.length ? median(steps) : 0.125));
  const cls = [];
  let lastValid = null;
  for (const x of s) {
    const o = x.ok ? drift(x.t) : null;
    let c = x.ok ? classifyPose({ yaw: x.yaw - o.yaw, pitch: x.pitch - o.pitch }, calib) : 'none';
    if (c === 'none' && lastValid && x.t - lastValid.t <= 0.6 && (lastValid.c === 'shoulderL' || lastValid.c === 'shoulderR' || lastValid.c === 'left' || lastValid.c === 'right')) {
      c = lastValid.c === 'left' || lastValid.c === 'shoulderL' ? 'shoulderL' : 'shoulderR';
    }
    if (x.ok) lastValid = { t: x.t, c };
    cls.push({ t: x.t, c });
  }
  // Ett enkelt bilde med en annen retning enn begge naboene er støy (v0.11.1): hodet skjelver over grensen mellom
  // rett fram og et speil, eller mellom to speil som ligger nær hverandre. Turene 3. nov. ga 15–25 «blikk» i minuttet,
  // 40–50 % kortere enn 0,3 s.
  for (let i = 1; i < cls.length - 1; i++) {
    const a = cls[i - 1].c, b = cls[i + 1].c;
    if (a === b && cls[i].c !== a && cls[i + 1].t - cls[i - 1].t <= 2 * maxGap) cls[i] = { t: cls[i].t, c: a };
  }
  const out = [];
  let cur = null;
  for (const x of cls) {
    const glance = MIRRORS.includes(x.c) || x.c === 'shoulderL' || x.c === 'shoulderR';
    if (glance && cur && cur.cls === x.c && x.t - cur.tEnd <= maxGap) { cur.tEnd = x.t; cur.n++; }
    else if (glance) { cur = { cls: x.c, t: x.t, tEnd: x.t, n: 1 }; out.push(cur); }
    else if (cur && x.t - cur.tEnd > maxGap) cur = null;
  }
  // Et skulderblikk passerer speilvinkelen på vei rundt: korte speilperioder (< 0,4 s) rett før et
  // skulderblikk på samme side slås sammen med det, så de ikke telles som egne speilblikk.
  const merged = [];
  for (let k = 0; k < out.length; k++) {
    const g = out[k], nx = out[k + 1];
    const side = g.cls === 'left' ? 'shoulderL' : g.cls === 'right' ? 'shoulderR' : null;
    if (side && nx && nx.cls === side && nx.t - g.tEnd <= maxGap && g.tEnd - g.t < 0.4) { nx.t = g.t; nx.n += g.n; continue; }
    merged.push(g);
  }
  // Et speilblikk varer typisk 0,5–1 s. Kortere enn minDur (fra første bilde til etter det siste) telles ikke (v0.11.1:
  // før holdt to bilder, 0,13 s). Skulderblikk der ansiktet forsvinner, holdes fortsatt av bildene rundt.
  return merged.filter(g => g.tEnd - g.t + dt >= minDur).map(g => ({ cls: g.cls, t: g.t, tEnd: g.tEnd, dur: g.tEnd - g.t + dt }));
}

/* Blikket borte fra veien (v0.8.0): sammenhengende perioder der hodet tydelig ikke ser på veien foran,
   i minst 30 km/t: speil, skulder, eller mer enn 15° unna rett fram (for eksempel ned mot telefonen).
   Over 2 s regnes som risiko (dobbel ulykkesrisiko ifølge NHTSA).
   Samkjøring med GPS: i svinger følger hodet veien, så perioder der bilen svinger mer enn 4 °/s telles
   ikke. Perioder over 6 s er nesten alltid at føreren sitter annerledes, ikke at blikket er borte, og
   telles heller ikke. Ansikt som forsvinner i under 0,6 s bryter ikke perioden, og ett enkelt bilde
   rett fram regnes som støy. samples: rå hodedata (opptakstid), points: rapportens punkter (t relativt). */
export function eyesOffRoad(samples, calib, { points = [], t0 = 0, minDur = 2, maxDur = 6, minKmh = 30, maxTurn = 4, offDeg = 15 } = {}) {
  if (!calib || !calib.ok || points.length < 3) return [];
  const s = samples.filter(x => Number.isFinite(x.t)).slice().sort((a, b) => a.t - b.t);
  const drift = forwardDrift(s, calib);
  // Svingrate fra GPS-sporet (°/s) ved hvert punkt
  const R = Math.PI / 180, head = (a, b) => Math.atan2((b.lon - a.lon) * Math.cos(a.lat * R), b.lat - a.lat) / R;
  const turn = points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return 0;
    const a = points[i - 1], b = points[i + 1], dt = b.t - a.t;
    if (!(dt > 0) || a.kmh < 10) return 0;
    let d = head(p, b) - head(a, p);
    if (d > 180) d -= 360; if (d < -180) d += 360;
    return Math.abs(d) / (dt / 2);
  });
  const idxAt = t => {
    let lo = 0, hi = points.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid].t < t) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const f = calib.forward;
  const out = [];
  let cur = null, fwdRun = 0;
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const close = () => {
    const dur = cur ? cur.tEnd - cur.t : 0;
    if (cur && dur >= minDur && dur <= maxDur && med(cur.kmh) >= minKmh && med(cur.turn) <= maxTurn) {
      const top = Object.entries(cur.cls).sort((a, b) => b[1] - a[1])[0][0];
      const kmh = med(cur.kmh);
      out.push({ t: cur.t, tEnd: cur.tEnd, dur, kmh, metres: kmh / 3.6 * dur, cls: top });
    }
    cur = null;
  };
  for (const x of s) {
    const t = x.t - t0;
    if (!x.ok) { if (cur && t - cur.tEnd > 0.6) close(); continue; }
    const o = drift(x.t), p = { yaw: x.yaw - o.yaw, pitch: x.pitch - o.pitch };
    const c = classifyPose(p, calib);
    const off = c !== 'forward' && (c !== 'other' || Math.hypot(p.yaw - f.yaw, p.pitch - f.pitch) > offDeg);
    if (!off) { fwdRun++; if (fwdRun >= 2) close(); continue; }
    fwdRun = 0;
    if (cur && t - cur.tEnd > 0.6) close();
    if (!cur) cur = { t, tEnd: t, cls: {}, kmh: [], turn: [] };
    cur.tEnd = t;
    cur.cls[c] = (cur.cls[c] || 0) + 1;
    const i = idxAt(t);
    cur.kmh.push(points[i].kmh);
    cur.turn.push(turn[i]);
  }
  close();
  return out;
}

/* Hvor langt fra kalibreringens «rett fram» føreren faktisk så i fart (median over 40 km/t), i grader.
   Over 12° passer ikke kalibreringen (k0.6.10: turen til Storlien hadde 28°). null uten nok data. */
export function calibOffset(samples, calib, points, t0) {
  if (!calib || !calib.ok || !points || points.length < 3) return null;
  const kmhAt = t => { let lo = 0, hi = points.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].t < t) lo = m + 1; else hi = m; } return points[lo].kmh; };
  const fast = samples.filter(x => x.ok && Number.isFinite(x.yaw) && kmhAt(x.t - t0) >= 40);
  if (fast.length < 150) return null;
  return Math.round(Math.hypot(median(fast.map(x => x.yaw)) - calib.forward.yaw, median(fast.map(x => x.pitch)) - calib.forward.pitch));
}

/* Vurdering mot turen. points: rapportens punkter (t relativt til start), t0: start i opptakstid.
   laneChanges: rapportens feltskifter. Returnerer tall og sjekker for rapporten. */
export function evaluateMirrors(samples, calib, { points = [], t0 = 0, laneChanges = [], markedLanes = [] } = {}) {
  // Blikket (hode + øyne) når kalibreringen er tatt med øynene (k0.7.6)
  if (useGaze(calib)) { samples = samples.map(x => toGaze(x, calib)); calib = gazeCalib(calib); }
  const valid = samples.filter(x => Number.isFinite(x.t));
  if (!valid.length) return null;
  const coverage = valid.filter(x => x.ok).length / valid.length;
  const glances = detectGlances(valid, calib).map(g => ({ ...g, t: g.t - t0, tEnd: g.tEnd - t0 }));
  const mirrors = glances.filter(g => MIRRORS.includes(g.cls));
  const count = c => glances.filter(g => g.cls === c).length;
  // Når så førerkameraet føreren? (v0.8.1) Testappen kan bytte til veikameraet, og da finnes det hull.
  // Et punkt regnes som sett hvis det finnes en måling innen 0,6 s.
  const ts = valid.map(x => x.t - t0).sort((a, b) => a - b);
  const seenAt = t => {
    let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ts[mid] < t) lo = mid + 1; else hi = mid; }
    return Math.abs(ts[lo] - t) <= 0.6 || (lo > 0 && Math.abs(ts[lo - 1] - t) <= 0.6);
  };
  const seenShare = (a, b) => { a = Math.max(a, ts[0]); let n = 0, k = 0; for (let t = a; t <= b; t += 0.5) { n++; if (seenAt(t)) k++; } return n ? k / n : 0; };   // før opptaket startet finnes ingenting å se
  let moving = 0, seenMoving = 0, gap = 0, longest = 0, longestAt = 0, gi = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = Math.min(points[i].t - points[i - 1].t, 5);
    while (gi < mirrors.length && mirrors[gi].t <= points[i].t) { gap = 0; gi++; }
    if (points[i].kmh > 10) {
      moving += dt;
      if (!seenAt(points[i].t)) continue;   // tid kameraet så veien teller ikke som tid uten speil
      seenMoving += dt; gap += dt;
      if (gap > longest) { longest = gap; longestAt = points[i].t; }
    }
  }
  const within = (cls, a, b) => glances.some(g => cls.includes(g.cls) && g.tEnd >= a && g.t <= b);
  // Ja hvis blikket finnes. Nei bare hvis førerkameraet så føreren minst 90 % av tiden; ellers ukjent (null).
  // v0.8.2: 50 % ga feil «nei» i opptil 25 % av sjekkene da byttestrategiene ble simulert på ekte turer.
  const check = (cls, a, b) => within(cls, a, b) ? true : seenShare(a, b) >= 0.9 ? false : null;
  // Merket av ledsager (v0.7.8): merket kommer etter feltskiftet, og retningen er ukjent.
  // Speil (et hvilket som helst) 15–1 s før merket, skulderblikk (en av sidene) 12–0 s før.
  const marked = markedLanes.slice().sort((a, b) => a - b).filter((t, i, a) => !i || t - a[i - 1] >= 4);
  const lane = marked.length ? marked.map(t => ({
    t, dir: null, marked: true, kmh: null,
    mirror: check(MIRRORS, t - 15, t - 1),
    shoulder: check(['shoulderL', 'shoulderR'], t - 12, t + 0.5)
  })) : laneChanges.map(l => {
    const left = l.dir === 'venstre';
    return {
      t: l.t, dir: l.dir, kmh: l.kmh,
      mirror: check(left ? ['left', 'rear'] : ['right', 'rear'], l.tFrom - 8, l.tFrom + 1),
      shoulder: check([left ? 'shoulderL' : 'shoulderR'], l.tFrom - 5, l.tFrom + 1.5)
    };
  });
  let start = null;
  const firstMove = points.find(p => p.kmh > 5);
  if (firstMove) start = { t: firstMove.t, mirror: check(['left', 'rear'], firstMove.t - 12, firstMove.t + 1), shoulder: check(['shoulderL'], firstMove.t - 8, firstMove.t + 1) };
  return {
    coverage, glances,
    counts: { left: count('left'), right: count('right'), rear: count('rear'), shoulderL: count('shoulderL'), shoulderR: count('shoulderR') },
    perMin: seenMoving > 30 ? mirrors.length / (seenMoving / 60) : 0,
    frontShare: moving > 0 ? Math.round(seenMoving / moving * 100) / 100 : 0,
    longestGap: longest, longestGapAt: longestAt - longest,
    lane, laneSource: marked.length ? 'marks' : 'sensors', start, calibrated: !!(calib && calib.ok),
    drift: Math.round(forwardDrift(valid, calib).max * 10) / 10,
    calibOff: calibOffset(valid, calib, points, t0),
    ...(calib && calib.close ? { closeMirrors: calib.close } : {}),
    away: eyesOffRoad(valid, calib, { points, t0 })
  };
}
