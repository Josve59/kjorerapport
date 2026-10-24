/* Kjørerapport – analysemotor.
   Prototypekoden brukes som den er; bare pakket som ES-modul.
   Eneste tillegg: analyze(input, { factor }) skalerer tersklene (følsomhet). */

const G = 9.81;
export const TH = {
  brake: { brisk: 2.5, harsh: 3.5 },   // m/s², deceleration
  accel: { brisk: 2.5, harsh: 3.4 },   // m/s²
  turn:  { brisk: 3.0, harsh: 4.0 }    // m/s², sideways
};

export const SENSITIVITY = {
  snill:  { label: 'Snill',  factor: 1.2 },
  normal: { label: 'Normal', factor: 1.0 },
  streng: { label: 'Streng', factor: 0.85 }
};

function scaleTH(factor) {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const s = o => ({ brisk: o.brisk * f, harsh: o.harsh * f });
  return { brake: s(TH.brake), accel: s(TH.accel), turn: s(TH.turn) };
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

/* Turning rate (rad/s) at each GPS point. Gyro projected on gravity = rotation around
   the vertical axis, so it works however the phone is mounted. Falls back to GPS heading. */
function yawSeries(input, L, vs) {
  const gyro = input.gyro.slice().sort((a, b) => a.t - b.t);
  const grav = input.grav.slice().sort((a, b) => a.t - b.t);
  if (gyro.length > 50 && grav.length > 10) {
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
    return { source: 'gyro', yaw: L.map(p => {
      const a = lowerBound(yt, p.t - 0.75), b = lowerBound(yt, p.t + 0.75);
      return b > a ? (pre[b] - pre[a]) / (b - a) : 0;
    }) };
  }
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
  return { source: 'gps', yaw: smoothBy(L.map(p => p.t), raw, 1) };
}

/* v3: langsgående akselerasjon fra akselerometeret.
   Lineær akselerasjon projiseres på horisontalplanet (tyngdekraften fjernes), og kjøreretningen i
   telefonens ramme finnes ved minste kvadraters tilpasning mot GPS-akselerasjonen. Så virker det uansett
   hvordan telefonen står. Hvis tilpasningen er dårlig (løs holder, manglende data) returneres null,
   og GPS brukes som før. */
function accAlongSeries(input, L, alongGps) {
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
    if (!H[i] || Math.abs(alongGps[i]) < 0.3) continue;
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
  let ssRes = 0, ssTot = 0, mean = 0, n = 0;
  for (let i = 0; i < L.length; i++) if (H[i]) { mean += alongGps[i]; n++; }
  mean = n ? mean / n : 0;
  const out = new Array(L.length);
  for (let i = 0; i < L.length; i++) {
    if (!H[i]) { out[i] = alongGps[i]; continue; }
    const pred = H[i].x * ux + H[i].y * uy + H[i].z * uz;
    out[i] = pred;
    ssRes += (alongGps[i] - pred) ** 2; ssTot += (alongGps[i] - mean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  if (r2 < 0.4) return null;
  out[0] = 0; out[out.length - 1] = 0;
  return { series: out, r2, axis: { x: ux, y: uy, z: uz } };
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

export function analyze(input, opts = {}) {
  const th = scaleTH(opts.factor);
  const engine = opts.engine === 'v3' ? 'v3' : 'v1';
  const perKm = !!opts.perKm;
  const raw = input.loc.filter(p => Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon)
    && Math.abs(p.lat) > 1e-4 && (!Number.isFinite(p.acc) || p.acc <= 50));
  raw.sort((a, b) => a.t - b.t);
  const L = [];
  for (const p of raw) if (!L.length || p.t - L[L.length - 1].t > 0.2) L.push({ ...p });
  if (L.length < 30) throw new Error('For få GPS-punkter. Ta opp en tur på minst et par minutter med posisjon slått på.');

  for (let i = 0; i < L.length; i++) {
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
    return dt > 0 && dt <= 6 ? (L[i + 1].speed - L[i - 1].speed) / dt : 0;
  });
  const { source, yaw } = yawSeries(input, L, vs);
  const alat = L.map((p, i) => vs[i] * Math.abs(yaw[i]));
  const accFit = engine === 'v3' ? accAlongSeries(input, L, along) : null;
  const alongEv = accFit ? accFit.series : along;

  const events = [
    ...findEvents(L, alongEv, vs, 'brake', -1, th.brake, 0),
    ...findEvents(L, alongEv, vs, 'accel', 1, th.accel, 0),
    ...findEvents(L, alat, vs, 'turn', 1, th.turn, 3)
  ].sort((a, b) => a.t - b.t);
  events.forEach((e, i) => { e.n = i + 1; });

  let dist = 0, moving = 0, maxV = 0, sq = 0, sqN = 0, stops = 0, wasMoving = false;
  for (let i = 1; i < L.length; i++) {
    const dt = L[i].t - L[i - 1].t;
    if (dt < 10) dist += hav(L[i - 1], L[i]);
    if (vs[i] > 1.5) { moving += dt; sq += along[i] ** 2; sqN++; }
    maxV = Math.max(maxV, vs[i]);
    if (vs[i] > 2) wasMoving = true;
    if (wasMoving && vs[i] < 0.5) { stops++; wasMoving = false; }
  }
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
    counts: c, scores, overall, tips: makeTips(c, scores), source,
    engine, alongSource: accFit ? 'acc' : 'gps', accFit: accFit ? { r2: accFit.r2 } : null, perKm, kmFactor
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
