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

/* Kalibrering: median av vinklene for hvert mål. Returnerer { forward, left, right, rear, ok, problem }. */
export function calibrationFromSamples(byTarget) {
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
  return { ...out, ok: true };
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
export function detectGlances(samples, calib, { maxGap = 0.35, minDur = 0.2 } = {}) {
  const s = samples.filter(x => Number.isFinite(x.t)).slice().sort((a, b) => a.t - b.t);
  const drift = forwardDrift(s, calib);
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
  return merged.filter(g => g.n >= 2 || g.tEnd - g.t >= minDur).map(g => ({ cls: g.cls, t: g.t, tEnd: g.tEnd, dur: Math.max(g.tEnd - g.t, 0.125) }));
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

/* Vurdering mot turen. points: rapportens punkter (t relativt til start), t0: start i opptakstid.
   laneChanges: rapportens feltskifter. Returnerer tall og sjekker for rapporten. */
export function evaluateMirrors(samples, calib, { points = [], t0 = 0, laneChanges = [], markedLanes = [] } = {}) {
  const valid = samples.filter(x => Number.isFinite(x.t));
  if (!valid.length) return null;
  const coverage = valid.filter(x => x.ok).length / valid.length;
  const glances = detectGlances(valid, calib).map(g => ({ ...g, t: g.t - t0, tEnd: g.tEnd - t0 }));
  const mirrors = glances.filter(g => MIRRORS.includes(g.cls));
  const count = c => glances.filter(g => g.cls === c).length;
  let moving = 0, gap = 0, longest = 0, longestAt = 0, gi = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = Math.min(points[i].t - points[i - 1].t, 5);
    while (gi < mirrors.length && mirrors[gi].t <= points[i].t) { gap = 0; gi++; }
    if (points[i].kmh > 10) { moving += dt; gap += dt; if (gap > longest) { longest = gap; longestAt = points[i].t; } }
  }
  const within = (cls, a, b) => glances.some(g => cls.includes(g.cls) && g.tEnd >= a && g.t <= b);
  // Merket av ledsager (v0.7.8): merket kommer etter feltskiftet, og retningen er ukjent.
  // Speil (et hvilket som helst) 15–1 s før merket, skulderblikk (en av sidene) 12–0 s før.
  const marked = markedLanes.slice().sort((a, b) => a - b).filter((t, i, a) => !i || t - a[i - 1] >= 4);
  const lane = marked.length ? marked.map(t => ({
    t, dir: null, marked: true, kmh: null,
    mirror: within(MIRRORS, t - 15, t - 1),
    shoulder: within(['shoulderL', 'shoulderR'], t - 12, t + 0.5)
  })) : laneChanges.map(l => {
    const left = l.dir === 'venstre';
    return {
      t: l.t, dir: l.dir, kmh: l.kmh,
      mirror: within(left ? ['left', 'rear'] : ['right', 'rear'], l.tFrom - 8, l.tFrom + 1),
      shoulder: within([left ? 'shoulderL' : 'shoulderR'], l.tFrom - 5, l.tFrom + 1.5)
    };
  });
  let start = null;
  const firstMove = points.find(p => p.kmh > 5);
  if (firstMove) start = { t: firstMove.t, mirror: within(['left', 'rear'], firstMove.t - 12, firstMove.t + 1), shoulder: within(['shoulderL'], firstMove.t - 8, firstMove.t + 1) };
  return {
    coverage, glances,
    counts: { left: count('left'), right: count('right'), rear: count('rear'), shoulderL: count('shoulderL'), shoulderR: count('shoulderR') },
    perMin: moving > 30 ? mirrors.length / (moving / 60) : 0,
    longestGap: longest, longestGapAt: longestAt - longest,
    lane, laneSource: marked.length ? 'marks' : 'sensors', start, calibrated: !!(calib && calib.ok),
    drift: Math.round(forwardDrift(valid, calib).max * 10) / 10,
    away: eyesOffRoad(valid, calib, { points, t0 })
  };
}
