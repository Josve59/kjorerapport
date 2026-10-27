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
  // Skulderblikk: hodet vridd tydelig lenger enn sidespeilet på samme side
  for (const [id, cls] of [['left', 'shoulderL'], ['right', 'shoulderR']]) {
    const t = rel(id);
    if (Math.sign(v.y) === Math.sign(t.y) && Math.abs(v.y) > Math.abs(t.y) * 1.5 + 5) return cls;
  }
  const d = (a, b) => Math.hypot(a.y - b.y, 0.8 * (a.p - b.p));
  let best = 'forward', bd = d(v, { y: 0, p: 0 });
  for (const id of MIRRORS) { const dd = d(v, rel(id)); if (dd < bd) { bd = dd; best = id; } }
  const size = id => Math.hypot(rel(id).y, rel(id).p);
  const limit = best === 'forward' ? Math.max(7, 0.4 * Math.min(...MIRRORS.map(size))) : Math.max(7, 0.5 * size(best));
  return bd <= limit ? best : 'other';
}

/* Blikk: sammenhengende perioder mot et speil eller skulder.
   samples: [{ t, yaw, pitch, ok }] (sekunder). Mister kameraet ansiktet like etter at hodet var på vei
   kraftig til siden, regnes det som skulderblikk (ansiktet forsvinner ofte da). */
export function detectGlances(samples, calib, { maxGap = 0.35, minDur = 0.2 } = {}) {
  const s = samples.filter(x => Number.isFinite(x.t)).slice().sort((a, b) => a.t - b.t);
  const cls = [];
  let lastValid = null;
  for (const x of s) {
    let c = x.ok ? classifyPose(x, calib) : 'none';
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

/* Vurdering mot turen. points: rapportens punkter (t relativt til start), t0: start i opptakstid.
   laneChanges: rapportens feltskifter. Returnerer tall og sjekker for rapporten. */
export function evaluateMirrors(samples, calib, { points = [], t0 = 0, laneChanges = [] } = {}) {
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
  const lane = laneChanges.map(l => {
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
    lane, start, calibrated: !!(calib && calib.ok)
  };
}
