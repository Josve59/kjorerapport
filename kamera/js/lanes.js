/* Feltlinjer fra veikameraet (testversjon k0.6.0). Enkel bildeanalyse uten maskinlæring:
   1) i nedre del av bildet letes det etter lyse striper (lysere enn omgivelsene, passe brede) rad for rad,
   2) en rett linje tilpasses på hver side med RANSAC (tåler støy fra biler, skilt og skygger),
   3) avstanden mellom linjene nederst i bildet gir skalaen (et kjørefelt er rundt 3,25 m i Norge).
   Virker best på merket vei i dagslys. Mørke, snø, regn og slitte linjer gir ofte ingen treff.
   Ren funksjon på gråtonebilde, så den kan testes i Node. Ingen bilder lagres. */

export const LANE_WIDTH = 3.25;

/* gray: Uint8Array w*h (0–255). Returnerer { left, right, offset, width, points } der left/right er
   { xBottom, xTop, yBottom, yTop, inliers } eller null, offset = bilens sideavvik fra midten av feltet i meter
   (positiv = til høyre, forutsatt at kameraet står midt i bilen), width = feltbredde i piksler nederst. */
export function detectLanes(gray, w, h, { top = 0.6, bottom = 0.92, seed = 7 } = {}) {
  const y0 = Math.floor(h * top), y1 = Math.floor(h * bottom);
  const minW = Math.max(1, Math.round(w * 0.006)), maxW = Math.max(3, Math.round(w * 0.08));
  const pts = [];
  for (let y = y0; y <= y1; y += 1) {
    const row = y * w;
    // Lokal bakgrunn: glidende snitt over 1/8 av bredden
    const win = Math.max(4, Math.round(w / 8));
    let sum = 0;
    const bg = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      sum += gray[row + x];
      if (x >= win) sum -= gray[row + x - win];
      bg[Math.max(0, x - (win >> 1))] = sum / Math.min(x + 1, win);
    }
    for (let x = w - (win >> 1); x < w; x++) bg[x] = bg[w - (win >> 1) - 1];
    let start = -1;
    for (let x = 0; x < w; x++) {
      // Lys stripe på mørkere underlag (asfalt). Snø, himmel og lyse flater har lys bakgrunn og tas ikke med.
      const bright = gray[row + x] > bg[x] + 25 && gray[row + x] > 90 && bg[x] < 150;
      if (bright && start < 0) start = x;
      if ((!bright || x === w - 1) && start >= 0) {
        const len = x - start;
        if (len >= minW && len <= maxW * (0.5 + (y - y0) / (y1 - y0 + 1))) pts.push({ x: start + len / 2, y });
        start = -1;
      }
    }
  }
  // RANSAC per side: x = a + b*y. Venstre linje: x øker oppover (b < 0), høyre: x minker oppover (b > 0).
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const fit = (cand, sign) => {
    if (cand.length < 8) return null;
    let best = null;
    for (let k = 0; k < 150; k++) {
      const p = cand[Math.floor(rnd() * cand.length)], q = cand[Math.floor(rnd() * cand.length)];
      if (Math.abs(p.y - q.y) < (y1 - y0) * 0.15) continue;
      const b = (p.x - q.x) / (p.y - q.y);
      if (Math.sign(b) !== sign || Math.abs(b) < 0.3 || Math.abs(b) > 3) continue;
      const a = p.x - b * p.y;
      const tol = Math.max(1.5, w * 0.012);
      const inl = cand.filter(c => Math.abs(a + b * c.y - c.x) <= tol);
      if (!best || inl.length > best.inl.length) best = { a, b, inl };
    }
    if (!best || best.inl.length < Math.max(8, (y1 - y0) * 0.25)) return null;
    // Minste kvadrater på inlierne
    const n = best.inl.length, my = best.inl.reduce((t, c) => t + c.y, 0) / n, mx = best.inl.reduce((t, c) => t + c.x, 0) / n;
    let sxy = 0, syy = 0; for (const c of best.inl) { sxy += (c.y - my) * (c.x - mx); syy += (c.y - my) ** 2; }
    const b = syy > 0 ? sxy / syy : best.b, a = mx - b * my;
    if (Math.sign(b) !== sign) return null;
    return { xBottom: a + b * y1, xTop: a + b * y0, yBottom: y1, yTop: y0, inliers: n };
  };
  const mid = w / 2;
  let left = fit(pts.filter(p => p.x < mid), -1);
  let right = fit(pts.filter(p => p.x >= mid), 1);
  // Perspektiv: linjene skal peke mot et forsvinningspunkt over analyseområdet og nær midten av bildet.
  // Forlenget til horisonten (her antatt rundt 0,45·h) må hver linje ende i midtre halvdel.
  const atY = (L, y) => L.xBottom + (L.xTop - L.xBottom) * (y - L.yBottom) / (L.yTop - L.yBottom);
  const yh = h * 0.45;
  const plausible = L => L && atY(L, yh) > w * 0.2 && atY(L, yh) < w * 0.8;
  if (!plausible(left)) left = null;
  if (!plausible(right)) right = null;
  if (left && right) {
    const xi = (a, b) => { const sa = (a.xTop - a.xBottom) / (a.yTop - a.yBottom), sb = (b.xTop - b.xBottom) / (b.yTop - b.yBottom); const y = (b.xBottom - a.xBottom + sa * a.yBottom - sb * b.yBottom) / (sa - sb); return { y, x: a.xBottom + sa * (y - a.yBottom) }; };
    const v = xi(left, right);
    if (!(v.y < y0 && v.x > w * 0.2 && v.x < w * 0.8)) { if (left.inliers >= right.inliers) right = null; else left = null; }
  }
  let offset = null, width = null;
  if (left && right && right.xBottom > left.xBottom) {
    width = right.xBottom - left.xBottom;
    if (width > w * 0.25) offset = Math.round(((w / 2) - (left.xBottom + right.xBottom) / 2) / width * LANE_WIDTH * 100) / 100;
    else width = null;
  }
  return { left, right, offset, width, points: pts.length };
}

/* RGBA (fra canvas) → gråtoner */
export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return g;
}
