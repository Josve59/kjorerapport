/* Veiens form rundt bilen (0.10.3), til feltlinjene i veikameraet: hvor mye veien svinger og hvor bredt feltet er.
   - Svingen nå: fra GPS-sporet de siste sekundene (retningsendring per meter).
   - Svingen foran: fra veiens linje i Statens vegvesens data (fartsgrensestrekningene appen allerede har hentet),
     8–60 m fram i kjøreretningen. Den vet om svingen før kameraet ser den, og også når linjene er slitte eller dekket.
   - Feltene: feltoversikten på strekningen (antall felt i vår retning) og kjørebanebredden (Vegbredde, beregnet).
   Krumning κ i 1/m, positiv = sving mot høyre. Rene funksjoner, kan testes i Node. */

const R = 6371000, rad = Math.PI / 180;
const local = (o, p) => ({ x: (p.lon - o.lon) * rad * R * Math.cos(o.lat * rad), y: (p.lat - o.lat) * rad * R });   // øst, nord (m)
const bearing = (a, b) => { const v = local(a, b); return Math.atan2(v.x, v.y); };   // radianer, med klokka fra nord
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/* Svingen nå fra GPS-punkter [{lat, lon}] (eldst først, siste 4–8 s). Krever minst 15 m kjørt. κ eller null. */
export function trackCurvature(track, { minDist = 15 } = {}) {
  const pts = track.filter((p, i) => i === 0 || local(track[i - 1], p).x ** 2 + local(track[i - 1], p).y ** 2 > 4);   // minst 2 m mellom punktene
  if (pts.length < 3) return null;
  let dist = 0, turn = 0;
  for (let i = 1; i < pts.length; i++) {
    const v = local(pts[i - 1], pts[i]); dist += Math.hypot(v.x, v.y);
    if (i >= 2) turn += wrap(bearing(pts[i - 1], pts[i]) - bearing(pts[i - 2], pts[i - 1]));
  }
  const first = Math.hypot(local(pts[0], pts[1]).x, local(pts[0], pts[1]).y), last = Math.hypot(local(pts[pts.length - 2], pts[pts.length - 1]).x, local(pts[pts.length - 2], pts[pts.length - 1]).y);
  const span = dist - (first + last) / 2;   // retningsendringen fordeles over midtpunktene
  if (dist < minDist || span <= 1) return null;
  return turn / span;
}

/* Nærmeste punkt på en linje [{lat, lon}] til p: { i (segment), t (0–1), d (m), brg (segmentets retning) } */
function nearest(pts, p) {
  let best = null;
  for (let i = 1; i < pts.length; i++) {
    const a = local(p, pts[i - 1]), b = local(p, pts[i]), vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
    if (L2 < 0.01) continue;
    const t = Math.max(0, Math.min(1, -(a.x * vx + a.y * vy) / L2)), x = a.x + t * vx, y = a.y + t * vy, d = Math.hypot(x, y);
    if (!best || d < best.d) best = { i, t, d, brg: Math.atan2(vx, vy) };
  }
  return best;
}

/* Veistrekningen bilen er på: nærmeste linje innen maxM som går langs kjøreretningen (innen 40°).
   segs: [{ pts, lanes?, ... }], heading i grader (eller null). { seg, hit, forward (kjører med linjens retning) } eller null. */
export function matchRoad(segs, p, heading, { maxM = 25 } = {}) {
  let best = null;
  for (const s of segs) {
    if (!s.pts || s.pts.length < 2) continue;
    const hit = nearest(s.pts, p);
    if (!hit || hit.d > maxM) continue;
    let forward = true, diff = 0;
    if (Number.isFinite(heading)) {
      diff = Math.abs(wrap(heading * rad - hit.brg));
      forward = diff <= Math.PI / 2;
      if (Math.min(diff, Math.PI - diff) > 40 * rad) continue;
    }
    const score = hit.d + (Number.isFinite(heading) ? 10 * Math.min(diff, Math.PI - diff) : 0);
    if (!best || score < best.score) best = { seg: s, hit, forward, score };
  }
  return best;
}

/* Punktene langs veien fram til `to` meter fra bilen, videre over på neste strekning der linjene møtes (høyst 3). */
function aheadPoints(segs, m, to) {
  const out = [];
  let pts = m.forward ? m.seg.pts : m.seg.pts.slice().reverse();
  let i = m.forward ? m.hit.i : pts.length - m.hit.i;   // neste knekkpunkt i kjøreretningen
  // Startpunktet: projeksjonen på linjen
  const a = m.seg.pts[m.hit.i - 1], b = m.seg.pts[m.hit.i];
  let cur = { lat: a.lat + (b.lat - a.lat) * m.hit.t, lon: a.lon + (b.lon - a.lon) * m.hit.t };
  out.push({ ...cur, s: 0 });
  let s = 0, hops = 0;
  const used = new Set([m.seg]);
  while (s < to) {
    if (i >= pts.length) {
      // Neste strekning: en linje som begynner (eller slutter) der denne slutter, i omtrent samme retning
      const end = pts[pts.length - 1], dir = bearing(pts[pts.length - 2], end);
      let next = null;
      for (const sg of segs) {
        if (used.has(sg) || !sg.pts || sg.pts.length < 2) continue;
        const f = sg.pts[0], l = sg.pts[sg.pts.length - 1];
        const df = Math.hypot(local(end, f).x, local(end, f).y), dl = Math.hypot(local(end, l).x, local(end, l).y);
        const cand = df < 3 ? sg.pts : dl < 3 ? sg.pts.slice().reverse() : null;
        if (!cand) continue;
        const turn = Math.abs(wrap(bearing(cand[0], cand[1]) - dir));
        if (turn < 50 * rad && (!next || turn < next.turn)) next = { pts: cand, turn, sg };
      }
      if (!next || ++hops > 3) break;
      used.add(next.sg); pts = next.pts; i = 1;
      continue;
    }
    const v = local(cur, pts[i]), len = Math.hypot(v.x, v.y);
    s += len; cur = pts[i]; out.push({ ...cur, s }); i++;
  }
  return out;
}

/* Svingen foran fra veiens linje: x(z) = a + b·z + κ·z²/2 tilpasset punktene from–to meter fram, i et koordinatsystem
   langs veien der bilen er. { kappa, len (m dekket) } eller null. */
export function aheadCurvature(segs, p, heading, { from = 8, to = 60 } = {}) {
  const m = matchRoad(segs, p, heading);
  if (!m) return null;
  const pts = aheadPoints(segs, m, to);
  if (pts.length < 2) return null;
  // Langs veien: retningen ved bilen
  const o = pts[0], th = m.forward ? m.hit.brg : m.hit.brg + Math.PI;
  const fx = Math.sin(th), fy = Math.cos(th);
  // Jevnt fordelte prøver hver 4. meter langs linjen
  const samples = [];
  for (let s = from; s <= to; s += 4) {
    let k = 1; while (k < pts.length && pts[k].s < s) k++;
    if (k >= pts.length) break;
    const a = pts[k - 1], b = pts[k], t = (s - a.s) / ((b.s - a.s) || 1);
    const q = local(o, { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
    samples.push({ z: q.x * fx + q.y * fy, x: q.x * fy - q.y * fx });   // z fram, x til høyre
  }
  if (samples.length < 4) return null;
  // Minste kvadrater for [a, b, c] i x = a + b z + c z², κ = 2c
  const S = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (const { z, x } of samples) { const r = [1, z, z * z]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += r[i] * r[j]; S[i][3] += r[i] * x; } }
  for (let c = 0; c < 3; c++) {
    let pv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(S[r][c]) > Math.abs(S[pv][c])) pv = r;
    if (Math.abs(S[pv][c]) < 1e-9) return null;
    [S[c], S[pv]] = [S[pv], S[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = S[r][c] / S[c][c]; for (let j = c; j < 4; j++) S[r][j] -= f * S[c][j]; }
  }
  const cq = S[2][3] / S[2][2];
  return { kappa: 2 * cq, len: samples[samples.length - 1].z, seg: m.seg, forward: m.forward };
}

/* Feltene fra feltoversikten (NVDB) for vår kjøreretning: oddetall går med lenkeretningen, partall mot. Bokstaver: K
   kollektivfelt, S sykkelfelt, V/H svingefelt. { ours, total } (gjennomgående kjørefelt, uten sykkelfelt) eller null. */
export function laneCount(lanes, forward = true) {
  if (!Array.isArray(lanes) || !lanes.length) return null;
  const drive = lanes.map(String).filter(l => /^\d+[KR]?$/.test(l));
  if (!drive.length) return null;
  const ours = drive.filter(l => (parseInt(l, 10) % 2 === 1) === forward).length;
  return { ours, total: drive.length };
}

/* Feltbredden: kjørebanebredden (med skuldre, i Trondheim 7,0–21,6 m) minus 0,5 m skulder, delt på antall kjørefelt,
   innenfor vanlige norske felt (2,75–3,75 m). Bare når forholdet er rimelig (2,6–5,5 m per felt), ellers null. */
export function laneWidthFrom(carriageway, lanes) {
  const n = laneCount(lanes);
  if (!n || !Number.isFinite(carriageway) || carriageway <= 0) return null;
  const raw = carriageway / n.total;
  if (raw < 2.6 || raw > 5.5) return null;
  return Math.round(Math.max(2.75, Math.min(3.75, (carriageway - 0.5) / n.total)) * 100) / 100;
}

/* Forventet sving til kameraet: veien foran veier mest, bilens sving nå litt. { kappa, weight } (weight = hvor mye
   den skal trekke, som antall punkter i tilpasningen) eller null. */
export function kappaPrior(now, ahead) {
  const r6 = v => Math.round(v * 1e6) / 1e6;
  if (ahead && Number.isFinite(ahead.kappa)) return { kappa: r6(Number.isFinite(now) ? 0.7 * ahead.kappa + 0.3 * now : ahead.kappa), weight: 8 };
  if (Number.isFinite(now)) return { kappa: r6(now), weight: 4 };
  return null;
}
