/* Fartsskilt fra veikameraet (k0.7.6): vanlige skilt (hvit flate, rød ring, svarte tall) og digitale skilt (rød
   lysring, lyse tall på svart, som på E6 når fartsgrensen settes ned ved ulykker, vær og veiarbeid).
   Ingen ferdig modell for norske fartsskilt finnes med fri lisens (tyske GTSRB mangler 40, 90 og 110), så dette er
   klassisk bildebehandling på et lukket sett av tall:
   1. Røde ringer: røde piksler (hver 2. piksel), sammenhengende flekker, rund form og lite rødt i midten
      (baklys og røde biler er fylte).
   2. Tallet: innsiden av ringen samples til 48×48, glattes (lysdiodene på digitale skilt flyter sammen), deles i
      forgrunn og bakgrunn (Otsu; tallet er den minste delen, svart på hvitt eller lyst på svart) og
      sammenlignes med maler for 20–120 i flere skrifttyper og med lysdioder (sign-tpl.js).
   3. Følging over bilder: samme skilt må leses likt flere ganger før det godtas (signTracker).
   Rene funksjoner, testes i Node. */
import { TEMPLATES, GW, GH } from './sign-tpl.js';

export const LIMITS = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
const N = 48;   // innsiden av skiltet samples til N×N

/* Røde piksler: rød klart over grønn og blå. Gir maske (1 per step×step-rute, rød hvis en av pikslene i ruten er
   rød: små lysdioder på digitale skilt faller ellers mellom) over rgba W×H. */
export function redMask(rgba, W, H, step = 2) {
  const mw = Math.floor(W / step), mh = Math.floor(H / step), m = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let red = 0;
    for (let dy = 0; dy < step && !red; dy++) for (let dx = 0; dx < step; dx++) {
      const i = ((y * step + dy) * W + x * step + dx) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], mx = g > b ? g : b;
      if (r >= 70 && r - mx >= 35 && r >= 1.4 * mx) { red = 1; break; }
    }
    m[y * mw + x] = red;
  }
  return { m, mw, mh };
}

/* Ringer i masken: [{ x, y, w, h }] i maskens piksler, størst først. */
export function findRings({ m: m0, mw, mh }, { minSide = 5, maxSide = 140, max = 6, grow = true } = {}) {
  // Rød-punktene vokser én rute i alle retninger: lysringen på digitale skilt er prikker med mellomrom, og tynne
  // ringer langt unna blir brutt opp
  let m = m0;
  if (grow) {
    m = new Uint8Array(m0.length);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      if (!m0[y * mw + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < mw && yy < mh) m[yy * mw + xx] = 1; }
    }
  }
  const lab = new Int32Array(mw * mh), out = [], stack = [];
  let id = 0;
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || lab[s]) continue;
    id++; lab[s] = id; stack.push(s);
    let n = 0, x0 = mw, y0 = mh, x1 = 0, y1 = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % mw, y = (p - x) / mw;
      // Sammenheng fra den voksne masken, men størrelse og form fra de ekte røde punktene
      if (m0[p]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      for (const q of [p - 1, p + 1, p - mw, p + mw]) {
        if (q < 0 || q >= m.length || !m[q] || lab[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === mw - 1)) continue;
        lab[q] = id; stack.push(q);
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < minSide || h < minSide || w > maxSide || h > maxSide) continue;
    const asp = w / h;
    if (asp < 0.65 || asp > 1.5) continue;
    const fill = n / (w * h);
    if (fill < 0.18 || fill > 0.72) continue;
    // Lite rødt i midten (en fylt rød flekk er baklys, en bil eller et forbudsskilt)
    let mid = 0, midN = 0;
    for (let y = Math.round(y0 + h * 0.3); y <= Math.round(y1 - h * 0.3); y++) for (let x = Math.round(x0 + w * 0.3); x <= Math.round(x1 - w * 0.3); x++) { midN++; if (m0[y * mw + x]) mid++; }
    if (midN && mid / midN > 0.15) continue;
    // Rød i alle fire retninger fra midten (en ring, ikke en bue eller en stripe)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let dirs = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      for (let r = 0.25; r <= 0.62; r += 0.04) { const x = Math.round(cx + dx * r * w), y = Math.round(cy + dy * r * h); if (x >= 0 && y >= 0 && x < mw && y < mh && m[y * mw + x]) { dirs++; break; } }
    }
    if (dirs < 6) continue;
    out.push({ x: x0, y: y0, w, h, n });
  }
  return out.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, max);
}

/* Innsiden av et skilt (box i rgba-pikslene) → { vec, asp, contrast, polarity } eller null.
   vec: tallets form (GW×GH, normalisert), asp: bredde/høyde for tallet. Samme behandling for malene. */
export function signFeatures(rgba, W, H, box, why = null) {
  const g = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = box.x + (i + 0.5) / N * box.w - 0.5, y = box.y + (j + 0.5) / N * box.h - 0.5;
    const xi = Math.max(0, Math.min(W - 2, Math.floor(x))), yi = Math.max(0, Math.min(H - 2, Math.floor(y))), fx = Math.max(0, Math.min(1, x - xi)), fy = Math.max(0, Math.min(1, y - yi));
    const at = (xx, yy) => { const k = (yy * W + xx) * 4; return (rgba[k] * 77 + rgba[k + 1] * 150 + rgba[k + 2] * 29) / 256; };
    g[j * N + i] = at(xi, yi) * (1 - fx) * (1 - fy) + at(xi + 1, yi) * fx * (1 - fy) + at(xi, yi + 1) * (1 - fx) * fy + at(xi + 1, yi + 1) * fx * fy;
  }
  // Små skilt er allerede uskarpe etter forstørringen til 48×48; bare store glattes (lysdiodene flyter sammen)
  return featuresFromGray(g, box.w >= 40, why);
}

export function featuresFromGray(g0, blur = true, why = null) {
  const no = r => { if (why) why.reason = r; return null; };
  // Glatting 3×3 (lysdioder flyter sammen)
  const g = blur ? new Float32Array(N * N) : g0;
  if (blur) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N) { s += g0[yy * N + xx]; n++; } }
    g[y * N + x] = s / n;
  }
  // Innenfor ringen (70 % av radien)
  const inside = [], R = N / 2 * 0.7;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) < R) inside.push(y * N + x);
  // Otsu
  const hist = new Float64Array(256);
  for (const k of inside) hist[Math.max(0, Math.min(255, Math.round(g[k])))]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = -1, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = inside.length - wB; if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; th = t; }
  }
  let nLo = 0, sLo = 0, sHi = 0;
  for (const k of inside) { if (g[k] <= th) { nLo++; sLo += g[k]; } else sHi += g[k]; }
  const nHi = inside.length - nLo;
  if (!nLo || !nHi) return no('ensfarget');
  const contrast = sHi / nHi - sLo / nLo;
  if (contrast < 30) return no('kontrast ' + Math.round(contrast));
  // Tallet er den minste delen: mørkt på hvitt skilt, lyst på digitalt skilt
  const darkFg = nLo <= nHi;
  const fg = new Uint8Array(N * N);
  for (const k of inside) if (darkFg ? g[k] <= th : g[k] > th) fg[k] = 1;
  const share = Math.min(nLo, nHi) / inside.length;
  if (share < 0.06 || share > 0.55) return no('andel ' + share.toFixed(2));
  // Rammen rundt tallet (rader/kolonner med minst 2 forgrunnspiksler)
  const rows = new Int32Array(N), cols = new Int32Array(N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fg[y * N + x]) { rows[y]++; cols[x]++; }
  let x0 = 0, x1 = N - 1, y0 = 0, y1 = N - 1;
  while (x0 < N && cols[x0] < 2) x0++; while (x1 > x0 && cols[x1] < 2) x1--;
  while (y0 < N && rows[y0] < 2) y0++; while (y1 > y0 && rows[y1] < 2) y1--;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bh < N * 0.2 || bw < N * 0.18 || bh > N * 0.75) return no(`ramme ${bw}x${bh}`);
  // Tallets form i GW×GH ruter (andel forgrunn)
  const vec = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const ax = x0 + i * bw / GW, bx = x0 + (i + 1) * bw / GW, ay = y0 + j * bh / GH, by = y0 + (j + 1) * bh / GH;
    let s = 0, n = 0;
    for (let y = Math.floor(ay); y < Math.ceil(by); y++) for (let x = Math.floor(ax); x < Math.ceil(bx); x++) { n++; s += fg[y * N + x]; }
    vec[j * GW + i] = n ? s / n : 0;
  }
  return { vec: normalize(vec), asp: bw / bh, contrast: Math.round(contrast), polarity: darkFg ? 'mørk' : 'lys' };
}

function normalize(v) {
  let m = 0; for (const x of v) m += x; m /= v.length;
  let s = 0; for (let i = 0; i < v.length; i++) { v[i] -= m; s += v[i] * v[i]; }
  s = Math.sqrt(s) || 1; for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

/* Tallets form → { limit, score, margin }: beste mal (korrelasjon, trukket for ulik bredde/høyde-forhold). */
export function classify(f, templates = TEMPLATES) {
  if (!f) return null;
  const best = new Map();
  for (const t of templates) {
    let c = 0; for (let i = 0; i < f.vec.length; i++) c += f.vec[i] * t.vec[i];
    const sc = c - 0.6 * Math.abs(Math.log(f.asp / t.asp));
    if (!best.has(t.limit) || sc > best.get(t.limit)) best.set(t.limit, sc);
  }
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  return { limit: ranked[0][0], score: Math.round(ranked[0][1] * 100) / 100, margin: Math.round((ranked[0][1] - (ranked[1] ? ranked[1][1] : 0)) * 100) / 100 };
}

/* Hele bildet (rgba W×H, f.eks. veien over dashbordet) → lesninger [{ box (rgba-piksler), limit, score, margin }]. */
export function readSigns(rgba, W, H, { step = 2, minScore = 0.5, minMargin = 0.04, skip = [], templates = TEMPLATES } = {}) {
  const mask = redMask(rgba, W, H, step);
  const out = [];
  for (const r of findRings(mask)) {
    const box = refineBox(rgba, W, H, { x: r.x * step - step, y: r.y * step - step, w: r.w * step + 2 * step, h: r.h * step + 2 * step });
    if (box.w < 14) continue;   // for lite til å lese tallet
    if (skip.some(s => box.x + box.w / 2 > s.x && box.x + box.w / 2 < s.x + s.w && box.y + box.h / 2 > s.y && box.y + box.h / 2 < s.y + s.h)) continue;   // på en bil (fartsmerke bak på lastebiler)
    const c = classify(signFeatures(rgba, W, H, box), templates);
    // Små skilt (under 28 piksler) må stemme bedre: de få feillesningene i testen var der
    if (c && c.score >= minScore + (box.w < 28 ? 0.08 : 0) && c.margin >= minMargin) out.push({ box, ...c });
  }
  return out;
}

/* Skiltets ytterkant i full oppløsning: rammen rundt de røde pikslene (masken over er grov, ±2 piksler). */
export function refineBox(rgba, W, H, b) {
  const x0 = Math.max(0, Math.floor(b.x - 2)), y0 = Math.max(0, Math.floor(b.y - 2)), x1 = Math.min(W - 1, Math.ceil(b.x + b.w + 2)), y1 = Math.min(H - 1, Math.ceil(b.y + b.h + 2));
  let ax = W, ay = H, bx = -1, by = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4, r = rgba[i], mx = Math.max(rgba[i + 1], rgba[i + 2]);
    if (r >= 70 && r - mx >= 35 && r >= 1.4 * mx) { if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; }
  }
  if (bx < 0) return b;
  return { x: ax, y: ay, w: bx - ax + 1, h: by - ay + 1 };
}

/* Følging av skilt over bilder: samme skilt (nær samme sted, eller litt lenger ut mot kanten og større) må leses
   minst 3 ganger med samme tall (60 % av stemmene) før det godtas. update(reads, t ms) → nytt godtatt skilt eller null. */
export function signTracker({ maxGap = 900, minReads = 3, minShare = 0.6 } = {}) {
  let tracks = [];
  const update = (reads, t) => {
    let confirmed = null;
    for (const r of reads) {
      const cx = r.box.x + r.box.w / 2, cy = r.box.y + r.box.h / 2;
      let tr = null, bd = Infinity;
      for (const k of tracks) { const d = Math.hypot(cx - k.cx, cy - k.cy); if (d < Math.max(40, 3 * k.w) && d < bd) { bd = d; tr = k; } }
      if (!tr) { tr = { cx, cy, w: r.box.w, votes: {}, n: 0, t0: t, done: false }; tracks.push(tr); }
      tr.cx = cx; tr.cy = cy; tr.w = r.box.w; tr.t = t; tr.n++;
      tr.votes[r.limit] = (tr.votes[r.limit] || 0) + r.score;
      if (!tr.done && tr.n >= minReads) {
        const tot = Object.values(tr.votes).reduce((a, b) => a + b, 0);
        const [lim, v] = Object.entries(tr.votes).sort((a, b) => b[1] - a[1])[0];
        if (v / tot >= minShare) { tr.done = true; confirmed = { limit: +lim, reads: tr.n, share: Math.round(v / tot * 100) / 100, w: Math.round(r.box.w) }; }
      }
    }
    tracks = tracks.filter(k => t - k.t <= maxGap);
    return confirmed;
  };
  return { update, get size() { return tracks.length; } };
}

/* Fartsgrensen fra kameraet under kjøring (k0.7.6). Et godtatt skilt gjelder til (a) et nytt skilt, (b) 3 km
   senere, eller (c) NVDB-grensen endrer seg mer enn 150 m etter skiltet (ny strekning; midlertidige skilt og
   digitale skilt gjelder ellers til neste skilt). current(distM, nvdb) → null eller { limit, nvdb, agree, sinceM }. */
export function createCamLimit({ maxM = 3000, nvdbM = 150 } = {}) {
  let cam = null;
  const sign = (limit, distM, nvdb) => { cam = { limit, d0: distM, nvdb0: nvdb }; };
  const current = (distM, nvdb) => {
    if (!cam) return null;
    const since = distM - cam.d0;
    if (since > maxM || (Number.isFinite(nvdb) && Number.isFinite(cam.nvdb0) && nvdb !== cam.nvdb0 && since > nvdbM)) { cam = null; return null; }
    // Skiltet sett der NVDB ennå ikke var kjent: husk første kjente verdi
    if (!Number.isFinite(cam.nvdb0) && Number.isFinite(nvdb)) cam.nvdb0 = nvdb;
    return { limit: cam.limit, nvdb: Number.isFinite(nvdb) ? nvdb : null, agree: cam.limit === nvdb, sinceM: Math.round(since) };
  };
  return { sign, current, reset: () => { cam = null; } };
}
