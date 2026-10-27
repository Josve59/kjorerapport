/* Kjørerapport – analysemotor.
   Prototypekoden brukes som den er; bare pakket som ES-modul.
   Eneste tillegg: analyze(input, { factor }) skalerer tersklene (følsomhet). */

const G = 9.81;
export const TH = {
  brake: { brisk: 2.5, harsh: 3.5 },   // m/s², deceleration
  accel: { brisk: 2.5, harsh: 3.4 },   // m/s²
  turn:  { brisk: 3.5, harsh: 4.5 }    // m/s², sideways (v0.7.7: hevet fra 3,0/4,0 da gyroskopet på iPhone ble lest riktig; vanlige rundkjøringer ga 0,31–0,37 g)
};

export const SENSITIVITY = {
  snill:  { label: 'Snill',  factor: 1.2 },
  normal: { label: 'Normal', factor: 1.0 },
  streng: { label: 'Streng', factor: 0.85 }
};

function scaleTH(factor, base = TH) {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const pick = k => {
    const o = base && base[k] ? base[k] : TH[k];
    const brisk = Number.isFinite(o.brisk) && o.brisk > 0 ? o.brisk : TH[k].brisk;
    const harsh = Number.isFinite(o.harsh) && o.harsh > brisk ? o.harsh : Math.max(TH[k].harsh, brisk + 0.1);
    return { brisk: brisk * f, harsh: harsh * f };
  };
  return { brake: pick('brake'), accel: pick('accel'), turn: pick('turn') };
}

function hav(a, b) {
  const R = 6371000, k = Math.PI / 180;
  const dLat = (b.lat - a.lat) * k, dLon = (b.lon - a.lon) * k;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function smoothBy(ts, vals, half) {
  const out = new Array(vals.length);
  let lo = 0, hi = 0, sum = 0, n = 0;
  for (let i = 0; i < vals.length; i++) {
    while (hi < vals.length && ts[hi] <= ts[i] + half) { sum += vals[hi]; n++; hi++; }
    while (ts[lo] < ts[i] - half) { sum -= vals[lo]; n--; lo++; }
    out[i] = n ? sum / n : vals[i];
  }
  return out;
}

function lowerBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

/* Gyroskopets akser (v0.7.5). Standarden sier alpha = rotasjon om z, beta = om x, gamma = om y, og
   opptakeren lagrer slik: { x: beta, y: gamma, z: alpha }. iPhone (WebKit) gir i praksis alpha = om x,
   beta = om y og gamma = om z. Begge tolkningene prøves på hver tur, og den som følger GPS-retningen
   best brukes. Da blir også gamle turer riktige. */
const GYRO_AXES = {
  standard: g => g,
  webkit: g => ({ t: g.t, x: g.z, y: g.x, z: g.y })
};

/* Svingrate fra GPS-retningen (rad/s, med klokka positiv) ved hvert GPS-punkt. */
function gpsYawRate(L, vs) {
  const n = L.length, raw = new Array(n).fill(0);
  const unwrapped = new Array(n).fill(NaN);
  let prev = NaN, offset = 0;
  for (let i = 0; i < n; i++) {
    const b = L[i].bearing;
    if (Number.isFinite(b) && b >= 0 && vs[i] > 2.5) {
      if (Number.isFinite(prev)) {
        const d = b - prev;
        if (d > 180) offset -= 360; else if (d < -180) offset += 360;
      }
      prev = b; unwrapped[i] = b + offset;
    }
  }
  for (let i = 1; i < n - 1; i++) {
    const a = unwrapped[i - 1], c = unwrapped[i + 1], dt = L[i + 1].t - L[i - 1].t;
    if (Number.isFinite(a) && Number.isFinite(c) && dt > 0 && dt < 6) raw[i] = (c - a) / dt * Math.PI / 180;
  }
  return smoothBy(L.map(p => p.t), raw, 1);
}

/* Gyroskopet projisert på tyngdekraften = rotasjon om loddlinjen, snittet over ±0,75 s rundt hvert GPS-punkt. */
function projectGyro(gyro, grav, L) {
  const yt = [], yv = [];
  let j = 0;
  for (const g of gyro) {
    while (j < grav.length - 1 && grav[j + 1].t <= g.t) j++;
    const q = grav[j];
    const m = Math.hypot(q.x, q.y, q.z) || 1;
    yt.push(g.t);
    yv.push((g.x * q.x + g.y * q.y + g.z * q.z) / m);
  }
  let maxAbs = 0;
  for (const v of yv) maxAbs = Math.max(maxAbs, Math.abs(v));
  const scale = maxAbs > 20 ? Math.PI / 180 : 1;           // deg/s guard
  const pre = [0];
  for (const v of yv) pre.push(pre[pre.length - 1] + v * scale);
  return L.map(p => {
    const a = lowerBound(yt, p.t - 0.75), b = lowerBound(yt, p.t + 0.75);
    return b > a ? (pre[b] - pre[a]) / (b - a) : 0;
  });
}

/* Turning rate (rad/s) at each GPS point. Gyro projected on gravity = rotation around
   the vertical axis, so it works however the phone is mounted. Falls back to GPS heading. */
function yawSeries(input, L, vs) {
  const gpsYaw = gpsYawRate(L, vs);
  const gyro = input.gyro.slice().sort((a, b) => a.t - b.t);
  const grav = input.grav.slice().sort((a, b) => a.t - b.t);
  if (gyro.length > 50 && grav.length > 10) {
    const corr = y => {
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < L.length; i++) if (vs[i] > 5) { sxy += y[i] * gpsYaw[i]; sxx += y[i] * y[i]; syy += gpsYaw[i] * gpsYaw[i]; }
      return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
    };
    let best = null;
    for (const [axes, map] of Object.entries(GYRO_AXES)) {
      const yaw = projectGyro(axes === 'standard' ? gyro : gyro.map(map), grav, L);
      const c = Math.abs(corr(yaw));
      if (!best || c > best.corr + 0.05) best = { axes, yaw, corr: c };   // standard vinner ved nesten likt
    }
    return { source: 'gyro', yaw: best.yaw, axes: best.axes, axesCorr: Math.round(best.corr * 100) / 100 };
  }
  return { source: 'gps', yaw: gpsYaw };
}

/* Sideforflytning i GPS-sporet rundt et mulig feltskifte (v0.7.3). Sporet ±10 s legges i en akse
   langs kjøreretningen, veien tilpasses med et tredjegradspolynom, og et trinn etter manøveren
   måler hvor langt bilen flyttet seg sidelengs. Positiv = til venstre. rms = hvor godt veien passer. */
export function gpsLateralStep(L, tFrom, tTo, pad = 10) {
  const pts = L.filter(p => p.t >= tFrom - pad && p.t <= tTo + pad);
  if (pts.length < 10) return null;
  const k = Math.PI / 180 * 6371000, c = Math.cos(pts[0].lat * Math.PI / 180);
  const X = pts.map(p => (p.lon - pts[0].lon) * k * c), Y = pts.map(p => (p.lat - pts[0].lat) * k);
  const ang = Math.atan2(Y[Y.length - 1], X[X.length - 1]);
  const u = X.map((x, i) => x * Math.cos(ang) + Y[i] * Math.sin(ang));
  const w = X.map((x, i) => -x * Math.sin(ang) + Y[i] * Math.cos(ang));
  const len = u[u.length - 1] || 1;
  const rows = [], b = [];
  pts.forEach((p, i) => {
    if (p.t > tFrom && p.t < tTo) return;   // selve manøveren er med i trinnet, ikke i tilpasningen
    const s = u[i] / len;
    rows.push([1, s, s * s, s * s * s, p.t >= tTo ? 1 : 0]);
    b.push(w[i]);
  });
  if (rows.length < 8) return null;
  // Minste kvadraters metode via normallikningene (5 × 5)
  const m = 5, M = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  rows.forEach((r, q) => { for (let i = 0; i < m; i++) { for (let j = 0; j < m; j++) M[i][j] += r[i] * r[j]; M[i][m] += r[i] * b[q]; } });
  for (let i = 0; i < m; i++) {
    let piv = i;
    for (let q = i + 1; q < m; q++) if (Math.abs(M[q][i]) > Math.abs(M[piv][i])) piv = q;
    [M[i], M[piv]] = [M[piv], M[i]];
    if (Math.abs(M[i][i]) < 1e-9) return null;
    for (let q = 0; q < m; q++) if (q !== i) { const f = M[q][i] / M[i][i]; for (let j = i; j <= m; j++) M[q][j] -= f * M[i][j]; }
  }
  const coef = M.map((row, i) => row[m] / M[i][i]);
  const rms = Math.sqrt(rows.reduce((a, r, q) => a + (r.reduce((t, v, j) => t + v * coef[j], 0) - b[q]) ** 2, 0) / rows.length);
  return { step: coef[4], rms };
}

/* Manøvrer (v0.6.0): rundkjøringer og feltskifter fra rotasjonen, uten nett.
   yaw: rotasjon ved hvert GPS-punkt (rad/s). Fortegnet kalibreres mot GPS-retningen, så venstre er positiv. */
export function detectManeuvers(L, vs, yaw) {
  const n = L.length;
  if (n < 10) return { laneChanges: [], roundabouts: [] };
  // Fortegn: sammenlign med endring i GPS-retning (med klokka positiv)
  let s = 0;
  for (let i = 1; i < n - 1; i++) {
    const a = L[i - 1].bearing, c = L[i + 1].bearing, dt = L[i + 1].t - L[i - 1].t;
    if (!(Number.isFinite(a) && Number.isFinite(c) && dt > 0 && dt < 4 && vs[i] > 5)) continue;
    let d = c - a; if (d > 180) d -= 360; if (d < -180) d += 360;
    const br = d / dt * Math.PI / 180;
    if (Math.abs(br) > 0.05) s += br * yaw[i];
  }
  const cw = s >= 0 ? 1 : -1;
  const left = yaw.map(y => -cw * y);
  const dts = L.map((p, i) => (i ? Math.min(L[i].t - L[i - 1].t, 3) : 0));
  const deg = r => r * 180 / Math.PI;

  // --- Rundkjøringer: høyre – venstre (≥ 40°) – høyre innen kort tid, lav fart, liten radius
  const runs = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const turning = Math.abs(left[i]) > 0.06 && vs[i] > 1.5 && vs[i] < 15;
    const sign = Math.sign(left[i]);
    if (turning && cur && cur.sign === sign) { cur.to = i; cur.ang += left[i] * dts[i]; cur.rad.push(vs[i] / Math.abs(left[i])); }
    else if (turning) { cur = { sign, from: i, to: i, ang: left[i] * dts[i], rad: [vs[i] / Math.abs(left[i])] }; runs.push(cur); }
    else cur = null;
  }
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const roundabouts = [];
  for (let k = 1; k < runs.length - 1; k++) {
    const l = runs[k];
    if (l.sign <= 0 || deg(l.ang) < 40 || med(l.rad) > 30) continue;
    const before = runs.slice(0, k).reverse().find(r => r.sign < 0 && L[l.from].t - L[r.to].t <= 6 && deg(-r.ang) >= 8);
    const after = runs.slice(k + 1).find(r => r.sign < 0 && L[r.from].t - L[l.to].t <= 6 && deg(-r.ang) >= 8);
    if (!before || !after) continue;
    let net = 0; for (let i = before.from; i <= after.to; i++) net += left[i] * dts[i];
    const mid = Math.round((l.from + l.to) / 2);
    roundabouts.push({ t: L[mid].t, tFrom: L[before.from].t, tTo: L[after.to].t, lat: L[mid].lat, lon: L[mid].lon, net: Math.round(deg(net)), source: 'sensor' });
  }

  // --- Feltskifter: kort sideforflytning på 2,4–5,5 m med retningen tilbake som før, over 40 km/t
  // Veiens egen krumning: retningen til et glattet GPS-spor (±6 s). Trekkes fra, så svinger og
  // S-kurver i veien ikke ser ut som feltskifter. Igjen står kortvarige sideforflytninger.
  const k0 = Math.PI / 180 * 6371000, cosL = Math.cos(L[0].lat * Math.PI / 180);
  const X = L.map(p => (p.lon - L[0].lon) * k0 * cosL), Y = L.map(p => (p.lat - L[0].lat) * k0);
  const SX = [], SY = [];
  for (let i2 = 0; i2 < n; i2++) {
    let sx = 0, sy = 0, c = 0;
    for (let k = i2; k >= 0 && L[i2].t - L[k].t <= 6; k--) { sx += X[k]; sy += Y[k]; c++; }
    for (let k = i2 + 1; k < n && L[k].t - L[i2].t <= 6; k++) { sx += X[k]; sy += Y[k]; c++; }
    SX.push(sx / c); SY.push(sy / c);
  }
  const head = new Array(n).fill(NaN);
  for (let i2 = 0; i2 < n; i2++) {
    let a2 = i2, b2 = i2;
    while (a2 > 0 && L[i2].t - L[a2].t < 3) a2--;
    while (b2 < n - 1 && L[b2].t - L[i2].t < 3) b2++;
    const dx = SX[b2] - SX[a2], dy = SY[b2] - SY[a2];
    if (Math.hypot(dx, dy) > 10) head[i2] = Math.atan2(dx, dy);
  }
  const roadLeft = new Array(n).fill(0);
  for (let i2 = 1; i2 < n - 1; i2++) {
    if (!Number.isFinite(head[i2 - 1]) || !Number.isFinite(head[i2 + 1])) continue;
    let d = head[i2 + 1] - head[i2 - 1];
    if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
    const dt2 = L[i2 + 1].t - L[i2 - 1].t;
    if (dt2 > 0 && dt2 < 6) roadLeft[i2] = -d / dt2;   // med klokka → venstre er negativ
  }
  const detr = left.map((v, i2) => v - roadLeft[i2]);
  // --- Feltskifter (v0.7.5): GPS-sporet først, gyroskopet bekrefter.
  // 1) Let etter et rent sidetrinn på 2,5–5 m i GPS-sporet over 4–8 s, i minst 45 km/t hele veien ±10 s
  //    (veien tilpasses med et tredjegradspolynom, så jevne svinger går greit).
  //    Svingraten langs veien må være jevn (standardavvik under 0,8 °/s) i hele vinduet.
  // 2) Gyroskopet må vise sideforflytning til samme side, minst 1,5 m. Retningsavdrift i vinduet trekkes
  //    fra først, fordi et feltskifte ender i samme retning som det startet.
  // Under 45 km/t telles ikke feltskifter: der er det oftest kjøring rundt parkerte biler.
  const fast = vs.map(v => v >= 12.5);
  const gyroShift = (a, b) => {
    let tot = 0, T = 0;
    for (let q = a + 1; q <= b; q++) { tot += detr[q] * dts[q]; T += dts[q]; }
    const mean = T > 0 ? tot / T : 0;
    let th = 0, y = 0;
    for (let q = a + 1; q <= b; q++) { th += (detr[q] - mean) * dts[q]; y += vs[q] * th * dts[q]; }
    return y;
  };
  const cands = [];
  for (let i = 0; i < n; i++) {
    for (const len of [4, 5, 6, 7, 8]) {
      let j = i;
      while (j < n - 1 && L[j].t - L[i].t < len) j++;
      if (L[j].t - L[i].t < len - 0.5) break;
      let a = i, b = j;
      while (a > 0 && L[i].t - L[a - 1].t <= 10) a--;
      while (b < n - 1 && L[b + 1].t - L[j].t <= 10) b++;
      if (b - a < 16 || L[a].t > L[i].t - 9 || L[b].t < L[j].t + 9) continue;
      let ok = true, rs = 0, rss = 0;
      for (let q = a; q <= b && ok; q++) { ok = fast[q]; rs += roadLeft[q]; rss += roadLeft[q] * roadLeft[q]; }
      if (!ok) continue;
      // Jevn sving er greit, men der svingen strammer seg til eller slipper opp, ser GPS-sporet ut som et sidetrinn
      const k = b - a + 1;
      if (deg(Math.sqrt(Math.max(0, rss / k - (rs / k) ** 2))) > 0.8) continue;
      const g = gpsLateralStep(L, L[i].t, L[j].t);
      if (!g || g.rms > 0.35 || Math.abs(g.step) < 2.5 || Math.abs(g.step) > 5) continue;
      let ga = i, gb = j;
      while (ga > 0 && L[i].t - L[ga - 1].t <= 1) ga--;
      while (gb < n - 1 && L[gb + 1].t - L[j].t <= 1) gb++;
      const gy = gyroShift(ga, gb);
      if (Math.sign(gy) !== Math.sign(g.step) || Math.abs(gy) < 1.5) continue;
      cands.push({ i, j, step: g.step, gy, q: Math.abs(g.step) / (g.rms + 0.1) });
    }
  }
  // Beste kandidat per sted: ingen to feltskifter med midtpunkt nærmere enn 20 s
  cands.sort((x, y) => y.q - x.q);
  const picked = [];
  const midT = c => (L[c.i].t + L[c.j].t) / 2;
  for (const c of cands) if (!picked.some(p => Math.abs(midT(p) - midT(c)) < 20)) picked.push(c);
  picked.sort((x, y) => x.i - y.i);
  const laneChanges = picked.map(c => {
    const mid = Math.round((c.i + c.j) / 2);
    return { t: L[mid].t, tFrom: L[c.i].t, tTo: L[c.j].t, dir: c.step > 0 ? 'venstre' : 'høyre', offset: Math.round(Math.abs(c.step) * 10) / 10,
      lat: L[mid].lat, lon: L[mid].lon, kmh: Math.round(vs[mid] * 3.6), gyro: Math.round(Math.abs(c.gy) * 10) / 10 };
  });
  return { laneChanges, roundabouts };
}

/* Holder-sjekk (v0.4.0): ser etter at telefonen har flyttet seg i holderen underveis.
   Tyngdekraftretningen i telefonens ramme tas som median over 5 s-vinduer. Et sprang over 12° mellom
   to vinduer betyr at telefonen ble flyttet (rystelser og svinger gir under 5°). Første og siste 30 s
   ignoreres (telefonen settes i og tas ut). For hver episode måles om retningen etterpå er en annen
   enn før (varig forskyvning), som betyr at holderen ikke satt som før. */
export function holderCheck(grav, tStart, tEnd, { win = 5, jumpDeg = 12, edge = 30 } = {}) {
  const g = (grav || []).filter(v => Number.isFinite(v.t) && Number.isFinite(v.x)).slice().sort((a, b) => a.t - b.t);
  const unit = v => { const m = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / m, y: v.y / m, z: v.z / m }; };
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI;
  const wins = [];
  let i = 0;
  while (i < g.length) {
    const t0 = g[i].t, w = [];
    while (i < g.length && g[i].t < t0 + win) { w.push(unit(g[i])); i++; }
    if (w.length < 3) continue;
    const med = k => { const a = w.map(v => v[k]).sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
    wins.push({ t: t0, v: unit({ x: med('x'), y: med('y'), z: med('z') }) });
  }
  const inside = w => w.t >= tStart + edge && w.t <= tEnd - edge;
  const jumps = [];
  for (let k = 1; k < wins.length; k++) {
    if (!inside(wins[k]) || !inside(wins[k - 1]) || wins[k].t - wins[k - 1].t > 3 * win) continue;
    const a = ang(wins[k].v, wins[k - 1].v);
    if (a > jumpDeg) jumps.push({ t: wins[k].t, a });
  }
  const episodes = [];
  for (const j of jumps) {
    const last = episodes[episodes.length - 1];
    if (last && j.t - last.to <= 15) { last.to = j.t + win; last.maxJump = Math.max(last.maxJump, j.a); }
    else episodes.push({ from: j.t - win, to: j.t + win, maxJump: j.a });
  }
  const meanDir = ws => { const s = { x: 0, y: 0, z: 0 }; for (const w of ws) { s.x += w.v.x; s.y += w.v.y; s.z += w.v.z; } return ws.length ? unit(s) : null; };
  for (const e of episodes) {
    const before = meanDir(wins.filter(w => w.t >= e.from - 30 && w.t < e.from));
    const after = meanDir(wins.filter(w => w.t > e.to && w.t <= e.to + 30));
    e.shift = before && after ? ang(before, after) : 0;
  }
  return { episodes, stable: episodes.length === 0, permanentShift: episodes.some(e => e.shift > 10) };
}

/* v3: langsgående akselerasjon fra akselerometeret.
   Lineær akselerasjon projiseres på horisontalplanet (tyngdekraften fjernes), og kjøreretningen i
   telefonens ramme finnes ved minste kvadraters tilpasning mot GPS-akselerasjonen. Så virker det uansett
   hvordan telefonen står. Hvis tilpasningen er dårlig (løs holder, manglende data) returneres null,
   og GPS brukes som før. */
export function accAlongSeries(input, L, alongGps) {
  if (!Array.isArray(input.acc) || input.acc.length < 50 || !Array.isArray(input.grav) || input.grav.length < 10) return null;
  const acc = input.acc.filter(a => Number.isFinite(a.t) && Number.isFinite(a.x)).sort((a, b) => a.t - b.t);
  const grav = input.grav.slice().sort((a, b) => a.t - b.t);
  if (acc.length < 50) return null;
  const at = [], px = [0], py = [0], pz = [0];
  let j = 0, gx = 0, gy = 0, gz = 0;
  for (const a of acc) {
    while (j < grav.length - 1 && grav[j + 1].t <= a.t) j++;
    const q = grav[j];
    const m = Math.hypot(q.x, q.y, q.z) || 1;
    const ux = q.x / m, uy = q.y / m, uz = q.z / m;
    gx += ux; gy += uy; gz += uz;
    const dot = a.x * ux + a.y * uy + a.z * uz;
    const hx = a.x - dot * ux, hy = a.y - dot * uy, hz = a.z - dot * uz;
    at.push(a.t);
    px.push(px[px.length - 1] + hx); py.push(py[py.length - 1] + hy); pz.push(pz[pz.length - 1] + hz);
  }
  const H = L.map(p => {
    const a = lowerBound(at, p.t - 0.5), b = lowerBound(at, p.t + 0.5);
    const n = b - a;
    return n >= 5 ? { x: (px[b] - px[a]) / n, y: (py[b] - py[a]) / n, z: (pz[b] - pz[a]) / n, n } : null;
  });
  let ux = 0, uy = 0, uz = 0, used = 0;
  for (let i = 0; i < L.length; i++) {
    if (!H[i] || Math.abs(alongGps[i]) < 0.3 || Math.abs(alongGps[i]) > 8) continue;   // ignorer støy og GPS-utslag
    ux += alongGps[i] * H[i].x; uy += alongGps[i] * H[i].y; uz += alongGps[i] * H[i].z; used++;
  }
  if (used < 10) return null;
  const gm = Math.hypot(gx, gy, gz) || 1;
  const gux = gx / gm, guy = gy / gm, guz = gz / gm;
  const d = ux * gux + uy * guy + uz * guz;
  ux -= d * gux; uy -= d * guy; uz -= d * guz;
  const um = Math.hypot(ux, uy, uz);
  if (!(um > 0)) return null;
  ux /= um; uy /= um; uz /= um;
  // Kvalitet: korrelasjon mellom GPS-akselerasjon og akselerometer-akselerasjon. GPS-farten fra
  // telefonen er glattet og dempet, så R² blir lav selv når retningen stemmer; korrelasjonen viser om
  // de to kildene følger hverandre. Under 0,5 brukes GPS som før.
  const out = new Array(L.length);
  let n = 0, mx = 0, my = 0;
  for (let i = 0; i < L.length; i++) {
    if (!H[i]) { out[i] = alongGps[i]; continue; }
    out[i] = H[i].x * ux + H[i].y * uy + H[i].z * uz;
    mx += alongGps[i]; my += out[i]; n++;
  }
  if (n < 10) return null;
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0, ssRes = 0;
  for (let i = 0; i < L.length; i++) {
    if (!H[i]) continue;
    const x = alongGps[i] - mx, y = out[i] - my;
    sxy += x * y; sxx += x * x; syy += y * y; ssRes += (alongGps[i] - out[i]) ** 2;
  }
  const corr = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  const r2 = sxx > 0 ? 1 - ssRes / sxx : 0;
  if (corr < 0.5) return null;
  out[0] = 0; out[out.length - 1] = 0;
  return { series: out, r2, corr, axis: { x: ux, y: uy, z: uz } };
}

function findEvents(L, series, vs, kind, sign, th, minSpeed) {
  const ev = [];
  let cur = null;
  for (let i = 0; i < L.length; i++) {
    const val = series[i] * sign;
    if (val >= th.brisk && vs[i] >= minSpeed) {
      if (!cur || L[i].t - cur.tEnd > 2) {
        cur = { kind, i0: i, tEnd: L[i].t, peak: val, iPeak: i };
        ev.push(cur);
      } else {
        cur.tEnd = L[i].t;
        if (val > cur.peak) { cur.peak = val; cur.iPeak = i; }
      }
    }
  }
  for (const e of ev) {
    const p = L[e.iPeak];
    e.level = e.peak >= th.harsh ? 'harsh' : 'brisk';
    e.t = p.t; e.lat = p.lat; e.lon = p.lon;
    e.g = e.peak / G;
    e.speedKmh = Math.round(vs[e.i0] * 3.6);
  }
  return ev;
}

const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

/* GPS-glipper (v0.3.3). Første ekte tur viste et posisjonshopp i starten som ga 416 km/t og 35 g.
   Punktene deles i biter ved hopp som ville kreve over MAX_V m/s (216 km/t); korte biter kastes.
   Fart fra GPS over MAX_V forkastes også, og fartsendringer over 15 m/s² regnes som sensorfeil. */
const MAX_V = 60;
export function removeGpsOutliers(pts) {
  if (pts.length < 2) return pts;
  const segs = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    const dt = Math.max(pts[i].t - pts[i - 1].t, 0.5);
    if (hav(pts[i - 1], pts[i]) / dt > MAX_V) segs.push([]);
    segs[segs.length - 1].push(pts[i]);
  }
  if (segs.length === 1) return pts;
  // Biter som er mye kortere enn hovedsporet er glipper (f.eks. 10 s gammel posisjon før GPS låser).
  const longest = Math.max(...segs.map(s => s.length));
  return segs.filter(s => s.length === longest || s.length >= 0.2 * longest).flat();
}

/* Forbehandling av GPS-sporet: filtrering, deduplisering, glippfilter, fartsutfylling, glattet fart og
   langsgående akselerasjon fra GPS. Skilt ut så den kan brukes i analyseverktøy. */
export function prepareTrack(input) {
  const raw = input.loc.filter(p => Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon)
    && Math.abs(p.lat) > 1e-4 && (!Number.isFinite(p.acc) || p.acc <= 50));
  raw.sort((a, b) => a.t - b.t);
  const dedup = [];
  for (const p of raw) if (!dedup.length || p.t - dedup[dedup.length - 1].t > 0.2) dedup.push({ ...p });
  const L = removeGpsOutliers(dedup);
  const droppedPoints = dedup.length - L.length;
  if (L.length < 30) throw new Error('For få GPS-punkter. Ta opp en tur på minst et par minutter med posisjon slått på.');

  for (let i = 0; i < L.length; i++) {
    if (Number.isFinite(L[i].speed) && L[i].speed > MAX_V) L[i].speed = NaN;
    if (!(Number.isFinite(L[i].speed) && L[i].speed >= 0)) {
      const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)];
      const dt = b.t - a.t;
      L[i].speed = dt > 0 ? hav(a, b) / dt : 0;
    }
  }
  const ts = L.map(p => p.t);
  const vs = smoothBy(ts, L.map(p => p.speed), 1.0);
  const along = L.map((p, i) => {
    if (i === 0 || i === L.length - 1) return 0;
    const dt = L[i + 1].t - L[i - 1].t;
    const a = dt > 0 && dt <= 6 ? (L[i + 1].speed - L[i - 1].speed) / dt : 0;
    return Math.abs(a) > 15 ? 0 : a;
  });
  return { L, ts, vs, along, droppedPoints };
}

export function analyze(input, opts = {}) {
  const th = scaleTH(opts.factor, opts.th);
  const engine = opts.engine === 'v3' ? 'v3' : 'v1';
  const perKm = !!opts.perKm;
  const { L, vs, along, droppedPoints } = prepareTrack(input);
  const { source, yaw, axes: gyroAxes, axesCorr } = yawSeries(input, L, vs);
  const alat = L.map((p, i) => vs[i] * Math.abs(yaw[i]));
  const holder = holderCheck(input.grav, L[0].t, L[L.length - 1].t);
  const man = detectManeuvers(L, vs, yaw);
  let accFit = null;
  if (engine === 'v3') {
    // Har telefonen flyttet seg varig, tilpasses kjøreretningen separat før og etter hver forskyvning.
    const cuts = holder.episodes.filter(e => e.shift > 10).map(e => (e.from + e.to) / 2);
    if (!cuts.length) accFit = accAlongSeries(input, L, along);
    else {
      const bounds = [L[0].t - 1, ...cuts, L[L.length - 1].t + 1];
      const series = [], corrs = [];
      let ok = 0;
      for (let k = 0; k < bounds.length - 1; k++) {
        const idx = []; for (let i = 0; i < L.length; i++) if (L[i].t >= bounds[k] && L[i].t < bounds[k + 1]) idx.push(i);
        if (!idx.length) continue;
        const fit = idx.length >= 60 ? accAlongSeries(input, idx.map(i => L[i]), idx.map(i => along[i])) : null;
        idx.forEach((i, j) => { series[i] = fit ? fit.series[j] : along[i]; });
        if (fit) { ok++; corrs.push(fit.corr); }
      }
      if (ok) accFit = { series, corr: corrs.reduce((a, b) => a + b, 0) / corrs.length, r2: NaN, segments: bounds.length - 1 };
    }
  }
  const alongEv = accFit ? accFit.series : along;

  const events = [
    ...findEvents(L, alongEv, vs, 'brake', -1, th.brake, 0),
    ...findEvents(L, alongEv, vs, 'accel', 1, th.accel, 0),
    ...findEvents(L, alat, vs, 'turn', 1, th.turn, 3)
  ].sort((a, b) => a.t - b.t);
  events.forEach((e, i) => { e.n = i + 1; });

  // By-tilpasset «Jevn fart» (valgfritt): ser bort fra 10 s før og etter hvert stopp, så naturlig
  // nedbremsing til og igangkjøring fra kryss og lyskryss ikke trekker ned.
  const nearStop = new Array(L.length).fill(false);
  if (opts.cityAware) {
    for (let i = 0; i < L.length; i++) if (vs[i] < 0.5) {
      for (let k = i; k >= 0 && L[i].t - L[k].t <= 10; k--) nearStop[k] = true;
      for (let k = i; k < L.length && L[k].t - L[i].t <= 10; k++) nearStop[k] = true;
    }
  }
  let dist = 0, moving = 0, maxV = 0, sq = 0, sqN = 0, stops = 0, wasMoving = false, sqAll = 0, sqAllN = 0;
  for (let i = 1; i < L.length; i++) {
    const dt = L[i].t - L[i - 1].t;
    if (dt < 10) dist += hav(L[i - 1], L[i]);
    if (vs[i] > 1.5) { moving += dt; sqAll += along[i] ** 2; sqAllN++; if (!nearStop[i]) { sq += along[i] ** 2; sqN++; } }
    maxV = Math.max(maxV, vs[i]);
    if (vs[i] > 2) wasMoving = true;
    if (wasMoving && vs[i] < 0.5) { stops++; wasMoving = false; }
  }
  if (sqN < 30) { sq = sqAll; sqN = sqAllN; }   // for lite cruise-data: bruk alt
  const rms = sqN ? Math.sqrt(sq / sqN) : 0;
  const count = (k, lvl) => events.filter(e => e.kind === k && e.level === lvl).length;
  const c = {
    brake: { harsh: count('brake', 'harsh'), brisk: count('brake', 'brisk') },
    accel: { harsh: count('accel', 'harsh'), brisk: count('accel', 'brisk') },
    turn:  { harsh: count('turn', 'harsh'),  brisk: count('turn', 'brisk') }
  };
  // Poeng justert for distanse: trekk per 10 km, med gulv på 5 km så korte turer ikke blir «perfekte».
  const kmFactor = perKm ? 10 / Math.max(dist / 1000, 5) : 1;
  const scores = {
    brake: clamp(100 - (20 * c.brake.harsh + 8 * c.brake.brisk) * kmFactor),
    accel: clamp(100 - (16 * c.accel.harsh + 6 * c.accel.brisk) * kmFactor),
    turn:  clamp(100 - (16 * c.turn.harsh + 6 * c.turn.brisk) * kmFactor),
    smooth: clamp(100 - Math.max(0, rms - 0.55) * 70)
  };
  const overall = clamp(0.3 * scores.brake + 0.2 * scores.accel + 0.25 * scores.turn + 0.25 * scores.smooth);

  return {
    t0: L[0].t,
    points: L.map((p, i) => ({ t: p.t - L[0].t, lat: p.lat, lon: p.lon, kmh: vs[i] * 3.6 })),
    events: events.map(e => ({ ...e, t: e.t - L[0].t })),
    stats: {
      km: dist / 1000, duration: L[L.length - 1].t - L[0].t, moving,
      maxKmh: maxV * 3.6, avgKmh: moving > 0 ? dist / moving * 3.6 : 0, stops, rms
    },
    counts: c, scores, overall, tips: makeTips(c, scores), source, gyroAxes, axesCorr,
    engine, alongSource: accFit ? 'acc' : 'gps', accFit: accFit ? { r2: accFit.r2, corr: accFit.corr, segments: accFit.segments || 1 } : null, perKm, kmFactor,
    droppedPoints, cityAware: !!opts.cityAware, thresholds: th,
    holder: { ...holder, episodes: holder.episodes.map(e => ({ ...e, from: e.from - L[0].t, to: e.to - L[0].t })) },
    maneuvers: {
      laneChanges: man.laneChanges.map(m => ({ ...m, t: m.t - L[0].t, tFrom: m.tFrom - L[0].t, tTo: m.tTo - L[0].t })),
      roundabouts: man.roundabouts.map(m => ({ ...m, t: m.t - L[0].t, tFrom: m.tFrom - L[0].t, tTo: m.tTo - L[0].t }))
    },
    // Serier for hendelsesdetalj (m/s², rundet)
    series: { along: alongEv.map(v => Math.round(v * 100) / 100), lat: alat.map(v => Math.round(v * 100) / 100) }
  };
}

export const CATS = { brake: 'Bremsing', accel: 'Akselerasjon', turn: 'Svinger', smooth: 'Jevn fart' };

function makeTips(c, s) {
  const tips = [];
  const n = o => o.harsh + o.brisk;
  if (s.brake < 95) tips.push({ cat: 'brake', p: 100 - s.brake,
    text: `Du bremset brått ${n(c.brake) === 1 ? 'én gang' : n(c.brake) + ' ganger'}. Se lenger fram i trafikken og slipp gassen tidligere, så kan du bremse mykere og jevnere.` });
  if (s.accel < 95) tips.push({ cat: 'accel', p: 100 - s.accel,
    text: `${n(c.accel) === 1 ? 'Én kraftig akselerasjon' : n(c.accel) + ' kraftige akselerasjoner'}. Trykk gassen gradvis inn, særlig fra stillestående og ut av kryss.` });
  if (s.turn < 95) tips.push({ cat: 'turn', p: 100 - s.turn,
    text: `${n(c.turn) === 1 ? 'Én sving' : n(c.turn) + ' svinger'} med høy sidekraft. Ta ned farten før svingen, og hold jevn fart gjennom den.` });
  if (s.smooth < 85) tips.push({ cat: 'smooth', p: 100 - s.smooth,
    text: 'Farten varierer mye underveis. Planlegg tidligere, og prøv å holde en jevnere fart mellom kryss og lyskryss.' });
  tips.sort((a, b) => b.p - a.p);
  if (!tips.length) tips.push({ cat: 'good', p: 0,
    text: 'Rolig og jevn kjøring hele veien. Neste gang kan du prøve en rute med flere kryss og rundkjøringer.' });
  return tips.slice(0, 3);
}

export function rating(score) {
  if (score >= 90) return 'Rolig og trygg kjøring';
  if (score >= 75) return 'Bra, med noen ting å jobbe med';
  if (score >= 55) return 'Ujevn kjøring';
  return 'Mye brå kjøring';
}

/* Simulated drive (central Trondheim) for the demo button and tests */
export function makeDemo(seed = 7, mount = null) {
  let s = seed, s2 = seed + 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const rnd2 = () => { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647 - 0.5; };  // egen støy til akselerometer
  const lat0 = 63.4305, lon0 = 10.3951;
  const mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  let t = 0, v = 0, h = 1.1, x = 0, y = 0, nextLoc = 0;
  const dt = 0.1, loc = [], gyro = [], grav = [], acc = [];
  // Valgfri montering: telefonen rotert (yaw om z, pitch om x) i bilen. Da roteres gyro, tyngdekraft
  // og akselerasjon likt, og det legges til akselerometerdata – brukes til å teste v3-motoren.
  const rot = mount ? rotation(mount.yaw || 0, mount.pitch || 0) : null;
  const R = vec => (rot ? { x: rot[0][0] * vec.x + rot[0][1] * vec.y + rot[0][2] * vec.z,
    y: rot[1][0] * vec.x + rot[1][1] * vec.y + rot[1][2] * vec.z,
    z: rot[2][0] * vec.x + rot[2][1] * vec.y + rot[2][2] * vec.z } : vec);
  const step = (a, yr) => {
    const vBefore = v;
    v = Math.max(0, v + a * dt); h += yr * dt;
    x += v * Math.sin(h) * dt; y += v * Math.cos(h) * dt; t += dt;
    const g = R({ x: 0.01 * rnd(), y: 0.01 * rnd(), z: -yr + 0.01 * rnd() });
    gyro.push({ t, x: g.x, y: g.y, z: g.z });
    const q = R({ x: 0, y: 0, z: -9.81 });
    grav.push({ t, x: q.x, y: q.y, z: q.z });
    if (rot) {
      // Bilramme: y fram, x til høyre. Langsgående = faktisk fartsendring, sideveis = v·yr.
      const car = { x: v * yr + 0.3 * rnd2(), y: (v - vBefore) / dt + 0.3 * rnd2(), z: 0.3 * rnd2() };
      const p = R(car);
      acc.push({ t, x: p.x, y: p.y, z: p.z });
    }
    if (t >= nextLoc) {
      nextLoc += 1;
      loc.push({ t, lat: lat0 + y / mLat + rnd() * 2e-6, lon: lon0 + x / mLon + rnd() * 4e-6,
        speed: Math.max(0, v + rnd() * 0.2), bearing: ((h * 180 / Math.PI) % 360 + 360) % 360, acc: 5 });
    }
  };
  const to = (target, rate) => {
    const dir = target > v ? 1 : -1;
    while (dir * (target - v) > 0.01) step(dir * rate, 0);
    v = target;
  };
  const cruise = sec => { for (let i = 0; i < sec / dt; i++) step(0, 0); };
  const turn = (deg, yr) => { const k = Math.abs(deg) * Math.PI / 180 / Math.abs(yr) / dt; for (let i = 0; i < k; i++) step(0, Math.sign(deg) * Math.abs(yr)); };
  const hold = sec => { for (let i = 0; i < sec / dt; i++) step(0, 0); };
  hold(3); to(13.9, 1.6); cruise(40); to(8, 1.8); turn(90, 0.3); to(13.9, 1.5); cruise(30);
  to(0, 1.9); hold(8); to(13.9, 3.9); cruise(35); to(16.7, 1.2); cruise(30);
  to(5, 4.6); cruise(4); to(11.1, 2.0); turn(80, 0.43); to(7, 1.8); turn(-270, 0.28);
  to(19.4, 1.4); cruise(60); to(13.9, 1.6); cruise(20); to(8.3, 2.9); cruise(10); to(0, 1.7); hold(5);
  return rot ? { loc, gyro, grav, acc } : { loc, gyro, grav };
}

function rotation(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Rz(yaw) · Rx(pitch)
  return [
    [cy, -sy * cp, sy * sp],
    [sy, cy * cp, -cy * sp],
    [0, sp, cp]
  ];
}
