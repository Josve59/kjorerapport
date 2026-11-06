/* Feltlinjer fra veikameraet (testversjon k0.6.0). Enkel bildeanalyse uten maskinlæring:
   1) i nedre del av bildet letes det etter lyse striper (lysere enn omgivelsene, passe brede) rad for rad,
   2) en rett linje tilpasses på hver side med RANSAC (tåler støy fra biler, skilt og skygger),
   3) avstanden mellom linjene nederst i bildet gir skalaen (et kjørefelt er rundt 3,25 m i Norge).
   Virker best på merket vei i dagslys. I mørke bilder strekkes kontrasten først (k0.6.4), så linjer i lyset
   fra frontlyktene blir med. Snø, regn og slitte linjer gir ofte ingen treff.
   Ren funksjon på gråtonebilde, så den kan testes i Node. Ingen bilder lagres.
   0.10.3: buede linjer (curve: true). En vei med jevn kurve gir i bildet x = A + B·d + C/d, der d er antall piksler
   under horisonten: A er retningen (forsvinningspunktet), B sidestillingen til linjen (feltbredde / kamerahøyde),
   og C svingen (C = f²·H·κ/2, f brennvidde i piksler, H kamerahøyde i meter, κ krumning i 1/m, + = mot høyre).
   Begge linjene deler A og C. Svingen tas fra bildet langt fram, med en forventet verdi fra bilens egen sving og
   veien foran (Statens vegvesen) som hjelp når linjene er svake. Ser kameraet bare én linje, tegnes den andre der
   den skal være etter feltbredden (predicted). */

export const LANE_WIDTH = 3.25;

/* gray: Uint8Array w*h (0–255). Returnerer { left, right, offset, width, points } der left/right er
   { xBottom, xTop, yBottom, yTop, inliers } eller null, offset = bilens sideavvik fra midten av feltet i meter
   (positiv = til høyre, forutsatt at kameraet står midt i bilen), width = feltbredde i piksler nederst. */
export function detectLanes(gray, w, h, { top = 0.6, bottom = 0.92, horizon = 0.45, maxBg = 150, minInl = 0.25, seed = 7,
  curve = false, far = null, kappa = null, kappaWeight = 3, focal = null, camH = 1.2, laneWidth = LANE_WIDTH, predict = false, useHorizon = false, prev = null } = {}) {
  const y0 = Math.floor(h * top), y1 = Math.floor(h * bottom);
  // Med buede linjer letes det også lenger fram (mot horisonten), der svingen synes
  const ys = curve ? Math.max(1, Math.min(y0, Math.floor(h * (far ?? Math.max(horizon + 0.04, top - 0.15))))) : y0;
  const night = stretchDark(gray, w, ys, y1);
  if (night) gray = night;
  const minW = Math.max(1, Math.round(w * 0.006)), maxW = Math.max(3, Math.round(w * 0.08));
  const pts = [];
  for (let y = ys; y <= y1; y += 1) {
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
      const bright = gray[row + x] > bg[x] + 25 && gray[row + x] > 90 && bg[x] < maxBg;
      if (bright && start < 0) start = x;
      if ((!bright || x === w - 1) && start >= 0) {
        const len = x - start;
        const maxLen = y >= y0 ? maxW * (0.5 + (y - y0) / (y1 - y0 + 1)) : maxW * 0.5 * Math.max(0.3, (y - ys) / (y0 - ys + 1));
        if (len >= minW && len <= maxLen && ridge(gray, row, start, x, w)) pts.push({ x: start + len / 2, y });
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
    if (!best || best.inl.length < Math.max(8, (y1 - y0) * minInl)) return null;
    // Minste kvadrater på inlierne
    const n = best.inl.length, my = best.inl.reduce((t, c) => t + c.y, 0) / n, mx = best.inl.reduce((t, c) => t + c.x, 0) / n;
    let sxy = 0, syy = 0; for (const c of best.inl) { sxy += (c.y - my) * (c.x - mx); syy += (c.y - my) ** 2; }
    const b = syy > 0 ? sxy / syy : best.b, a = mx - b * my;
    if (Math.sign(b) !== sign) return null;
    return { xBottom: a + b * y1, xTop: a + b * y0, yBottom: y1, yTop: y0, inliers: n, pts: best.inl };
  };
  // Perspektiv: linjene skal peke mot et forsvinningspunkt over analyseområdet og nær midten av bildet.
  // Forlenget til horisonten (her antatt rundt 0,45·h) må hver linje ende i midtre halvdel.
  const atY = (L, y) => L.xBottom + (L.xTop - L.xBottom) * (y - L.yBottom) / (L.yTop - L.yBottom);
  const yh = h * horizon;
  // I sving (buede linjer på) kan de rette linjene nær bilen peke lenger til siden
  const lo = curve ? 0.02 : 0.2, hi = curve ? 0.98 : 0.8;
  const plausible = L => L && atY(L, yh) > w * lo && atY(L, yh) < w * hi;
  // 0.12.5: opptil tre kandidater per side (den sterkeste, så den sterkeste av resten osv.). Veikant, rekkverk og
  // brøytestikker er ofte lengre og tydeligere enn en stiplet feltlinje, men ligger lenger ut. Valget tar derfor den
  // innerste kandidaten som er rimelig sterk, og den som ligger der linjen var i forrige bilde (prev) når den finnes.
  const mid = w / 2, near = pts.filter(p => p.y >= y0);
  const candidates = (cand, sign) => {
    const out = [];
    let rest = cand;
    for (let k = 0; k < 3; k++) {
      const L = fit(rest, sign);
      if (!L) break;
      const used = new Set(L.pts);
      delete L.pts;
      // Helningen i bildet er sideavstanden delt på kamerahøyden (x = A + B·d gir dx/dy = B). En linje i eget felt
      // ligger høyst rundt 3 m til siden av kameraet; rekkverk og kanter lenger ut (eller høyere opp) helner mer.
      const lat = Math.abs((L.xTop - L.xBottom) / (L.yTop - L.yBottom)) * camH;
      if (plausible(L) && lat <= 3) out.push(L);
      rest = rest.filter(p => !used.has(p));
    }
    return out;
  };
  const yRef = (y0 + y1) / 2;
  const pick = (cs, side, before) => {
    if (!cs.length) return null;
    const strongest = Math.max(...cs.map(c => c.inliers));
    const ok = cs.filter(c => c.inliers >= strongest * 0.4);
    if (before) {
      // Nær linjen i forrige bilde: den vinner (linjene flytter seg lite mellom to bilder)
      const tol = w * 0.08;
      const close = ok.filter(c => Math.abs(atY(c, yRef) - laneX(before, yRef)) < tol && Math.abs(c.xBottom - before.xBottom) < tol * 1.5);
      if (close.length) return close.sort((a, b) => b.inliers - a.inliers)[0];
    }
    return ok.sort((a, b) => side === 'left' ? atY(b, yRef) - atY(a, yRef) : atY(a, yRef) - atY(b, yRef))[0];
  };
  const candL = candidates(near.filter(p => p.x < mid), -1), candR = candidates(near.filter(p => p.x >= mid), 1);
  let left = pick(candL, 'left', prev && prev.left);
  let right = pick(candR, 'right', prev && prev.right);
  // Feltet kan ikke være en smal stripe: med begge linjer skal bredden midt i analyseområdet passe med feltbredden
  // sett fra kamerahøyden (grovt, horisonten er bare antatt). Er feltet altfor smalt, er den svakeste linjen feil.
  if (left && right && laneWidth > 0 && camH > 0) {
    const want = laneWidth / camH * Math.max(1, yRef - yh), got = atY(right, yRef) - atY(left, yRef);
    if (got < want * 0.45) { if (left.inliers >= right.inliers) right = null; else left = null; }
  }
  if (left && right) {
    const xi = (a, b) => { const sa = (a.xTop - a.xBottom) / (a.yTop - a.yBottom), sb = (b.xTop - b.xBottom) / (b.yTop - b.yBottom); const y = (b.xBottom - a.xBottom + sa * a.yBottom - sb * b.yBottom) / (sa - sb); return { y, x: a.xBottom + sa * (y - a.yBottom) }; };
    const v = xi(left, right);
    if (!(v.y < y0 && v.x > w * lo && v.x < w * hi)) { if (left.inliers >= right.inliers) right = null; else left = null; }
  }
  let shape = null;
  if (curve && (left || right)) {
    shape = fitCurves(pts, left, right, { w, h, y1, ys, yh, kappa, kappaWeight, focal, camH, useHorizon });
    if (shape) { left = shape.left; right = shape.right; }
  }
  // Én linje: den andre der den skal være etter feltbredden og kamerahøyden (tegnes, men telles ikke som sett)
  if (shape && predict && (left ? !right : right) && laneWidth > 0 && camH > 0) {
    const seen = left || right, sign = left ? 1 : -1, c = seen.curve;
    const other = { ...c, B: c.B + sign * laneWidth / camH };
    const L2 = curveLine(other, y1, seen.yTop, 0);
    if (L2.xBottom > -w * 0.5 && L2.xBottom < w * 1.5) { L2.predicted = true; if (left) right = L2; else left = L2; }
  }
  let offset = null, width = null, camHeight = null;
  const seenL = left && !left.predicted ? left : null, seenR = right && !right.predicted ? right : null;
  if (seenL && seenR && seenR.xBottom > seenL.xBottom) {
    width = seenR.xBottom - seenL.xBottom;
    if (width > w * 0.25) offset = Math.round(((w / 2) - (seenL.xBottom + seenR.xBottom) / 2) / width * laneWidth * 100) / 100;
    else width = null;
    // Kamerahøyden følger av feltbredden: B(høyre) − B(venstre) = feltbredde / høyde
    if (width && seenL.curve && seenR.curve) { const dB = seenR.curve.B - seenL.curve.B; if (dB > 0) camHeight = Math.round(laneWidth / dB * 100) / 100; }
  }
  return { left, right, offset, width, points: pts.length, night: !!night, curve: shape ? { C: shape.C, kappa: shape.kappa, vh: shape.vh } : null, camH: camHeight };
}

/* Feltlinjen er en lys rygg (0.12.5): lysere enn asfalten rett på begge sider. Overgangen fra asfalt til lys grus,
   gress, fortau eller snøkant er et trinn (lyst bare på den ene siden) og tas ikke med. Det var det som oftest ble
   tatt for en feltlinje ute på siden. Ved bildekanten holder det med den ene siden. */
function ridge(gray, row, start, end, w) {
  const len = end - start, f = Math.max(2, Math.min(6, len));
  let m = 0; for (let x = start; x < end; x++) m += gray[row + x]; m /= len;
  const side = (a, b) => { a = Math.max(0, a); b = Math.min(w, b); if (b - a < 2) return null; let s = 0; for (let x = a; x < b; x++) s += gray[row + x]; return s / (b - a); };
  const l = side(start - 1 - f, start - 1), r = side(end + 1, end + 1 + f);
  if (l === null && r === null) return false;
  // Innsiden (mot midten av bildet) er asfalt og skal være tydelig mørkere. Utsiden kan være grus eller gress, men
  // linjen skal likevel skille seg litt ut fra den.
  const inner = (start + end) / 2 < w / 2 ? r : l, outer = inner === r ? l : r;
  return (inner === null || m - inner >= 15) && (outer === null || m - outer >= 6);
}

/* x i bildet for en linje på høyde y: buet (curve) eller rett */
export function laneX(L, y) {
  if (L.curve) { const d = Math.max(1, y - L.curve.vh); return L.curve.A + L.curve.B * d + L.curve.C / d; }
  return L.xBottom + (L.xTop - L.xBottom) * (y - L.yBottom) / ((L.yTop - L.yBottom) || 1);
}

/* Linjen skalert fra analysebildet til kamerabildet (k = bredde i kamerabildet / bredde i analysebildet) */
export function scaleLane(L, k) {
  if (!L) return L;
  const o = { ...L, xBottom: L.xBottom * k, xTop: L.xTop * k, yBottom: L.yBottom * k, yTop: L.yTop * k };
  if (L.curve) o.curve = { A: L.curve.A * k, B: L.curve.B, C: L.curve.C * k * k, vh: L.curve.vh * k };
  return o;
}

function curveLine(c, yBottom, yTop, inliers) {
  const L = { curve: c, yBottom, yTop, inliers };
  L.xBottom = laneX(L, yBottom); L.xTop = laneX(L, yTop);
  return L;
}

/* Felles tilpasning av x = A + B·d + C/d for linjene som ble funnet rett. Startes fra de rette linjene, og punktene
   nær kurven tas med i tre runder, så linjen kan følge svingen oppover i bildet. Forventet sving (kappa) trekker C
   mot sin verdi, sterkere jo svakere bildet er. Returnerer { left, right, C, kappa, vh } eller null. */
function fitCurves(pts, left, right, { w, h, y1, ys, yh, kappa, kappaWeight, focal, camH, useHorizon }) {
  const slope = L => (L.xTop - L.xBottom) / (L.yTop - L.yBottom);
  let vh = yh;
  if (left && right && !useHorizon) {
    const sa = slope(left), sb = slope(right);
    const y = (right.xBottom - left.xBottom + sa * left.yBottom - sb * right.yBottom) / (sa - sb);
    if (Number.isFinite(y)) vh = y;
  }
  vh = Math.min(vh, ys - 3);
  const f = focal || h / 2 / Math.tan(33 * Math.PI / 180);
  const Cp = Number.isFinite(kappa) ? f * f * camH * kappa / 2 : 0;
  const Cmax = f * f * camH * 0.03 / 2;   // svinger krappere enn radius 33 m tegnes ikke
  // Start: de rette linjene med den forventede svingen trukket fra (ellers bommer starten nær bilen med C/d)
  const y0n = Math.min(...[left, right].filter(Boolean).map(L => L.yTop));
  const sides = [left, right].map(L => {
    if (!L) return null;
    let n = 0, sd = 0, st = 0, sdd = 0, sdt = 0;
    for (let k = 0; k <= 10; k++) {
      const y = y0n + (y1 - y0n) * k / 10, d = y - vh, t = laneX(L, y) - Cp / d;
      n++; sd += d; st += t; sdd += d * d; sdt += d * t;
    }
    const B0 = (n * sdt - sd * st) / (n * sdd - sd * sd || 1);
    return { B: B0, A: (st - B0 * sd) / n };
  });
  let A = (sides[0] ? sides[0].A : 0) + (sides[1] ? sides[1].A : 0);
  A /= (sides[0] ? 1 : 0) + (sides[1] ? 1 : 0);
  let C = Cp, B = sides.map(sd => sd && sd.B), used = [[], []];
  const model = (k, y) => { const d = y - vh; return A + B[k] * d + C / d; };
  const tol0 = Math.max(1.5, w * 0.012), steps = 12;
  // Linjen følges trinnvis oppover: hver runde tar med et høyere bånd, spådd fra kurven så langt
  for (let it = 0; it < steps; it++) {
    used = [[], []];
    const yLim = y1 - (y1 - ys) * Math.min(1, (it + 2) / 6);
    for (const p of pts) {
      const d = p.y - vh;
      if (d < 3 || p.y < yLim) continue;
      const tol = tol0 * (1 + 1.5 * (y1 - p.y) / Math.max(1, y1 - ys));
      let bestK = -1, bestE = tol;
      for (let k = 0; k < 2; k++) if (B[k] !== null && B[k] !== undefined) { const e = Math.abs(model(k, p.y) - p.x); if (e <= bestE) { bestE = e; bestK = k; } }
      if (bestK >= 0) used[bestK].push(p);
    }
    // Normalligningene for [A, C, B0, B1]; ubrukte sider tas ut
    const idx = [0, 1]; if (B[0] !== null && B[0] !== undefined) idx.push(2); if (B[1] !== null && B[1] !== undefined) idx.push(3);
    const n = idx.length, M = Array.from({ length: n }, () => new Float64Array(n)), v = new Float64Array(n);
    const add = (row, rhs, wt = 1) => { for (let i = 0; i < n; i++) { v[i] += wt * row[idx[i]] * rhs; for (let j = 0; j < n; j++) M[i][j] += wt * row[idx[i]] * row[idx[j]]; } };
    let dSum = 0, cnt = 0;
    for (let k = 0; k < 2; k++) for (const p of used[k]) {
      const d = p.y - vh, row = [1, 1 / d, k === 0 ? d : 0, k === 1 ? d : 0];
      add(row, p.x); dSum += d; cnt++;
    }
    if (cnt < 10) return null;
    // Forventet sving: som kappaWeight punkter på typisk avstand
    const dTyp = dSum / cnt;
    add([0, 1 / dTyp, 0, 0], Cp / dTyp, kappaWeight);
    const sol = solve(M, v);
    if (!sol) return null;
    const full = [A, C, B[0], B[1]];
    idx.forEach((k, i) => { full[k] = sol[i]; });
    [A, C] = full; B = [full[2], full[3]];
    if (Math.abs(C) > Cmax) C = Math.sign(C) * Cmax;
  }
  const yTop = Math.max(ys, Math.ceil(vh + Math.max(4, (y1 - vh) * 0.12)));
  const mk = k => {
    if (B[k] === null || B[k] === undefined || used[k].length < 6) return null;
    const L = curveLine({ A, B: B[k], C, vh }, y1, yTop, used[k].length);
    return L;
  };
  const nl = mk(0), nr = mk(1);
  if (!nl && !nr) return null;
  // Rimelig: linjene på hver sin side av midten nederst, og ikke krysset over analyseområdet
  if (nl && nr && !(nl.xBottom < nr.xBottom && laneX(nl, yTop) < laneX(nr, yTop))) return null;
  return { left: nl || (left && !nr ? left : null), right: nr || (right && !nl ? right : null), C, kappa: C * 2 / (f * f * camH), vh };
}

function solve(M, v) {
  const n = v.length, a = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-9) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const k = a[r][c] / a[c][c]; for (let j = c; j <= n; j++) a[r][j] -= k * a[c][j]; }
  }
  return a.map((r, i) => r[n] / r[i]);
}

/* Mørkt analyseområde (snitt under 60): strekk lysstyrken så de 5 % mørkeste blir 30 og de 1 % lyseste 230.
   Returnerer et nytt bilde, eller null når bildet er lyst nok eller helt uten kontrast (ingenting å se). */
function stretchDark(gray, w, y0, y1) {
  const hist = new Uint32Array(256);
  let n = 0, sum = 0;
  for (let i = y0 * w; i < (y1 + 1) * w && i < gray.length; i++) { hist[gray[i]]++; sum += gray[i]; n++; }
  if (!n || sum / n >= 60) return null;
  const pct = q => { let c = 0; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= q * n) return v; } return 255; };
  const lo = pct(0.05), hi = pct(0.99);
  if (hi - lo < 20) return null;
  const k = 200 / (hi - lo), out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((gray[i] - lo) * k + 30)));
  return out;
}

/* RGBA (fra canvas) → gråtoner */
export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return g;
}

/* Dashbordkanten (k0.7.1): hvor veien slutter og bilens eget dashbord begynner, i et stående bilde fra en telefon i
   holder. På turen 2. nov. var de nederste rundt 28 % av bildet dashbord, og bilgjenkjenningen tok det for en bil
   rett foran (hele bildebredden, «2,5 m»), mens feltlinjene ble lett etter på dashbordet.
   Kanten er en tydelig overgang fra lysere (vei) til mørkere (dashbord) i radsnittene, glattet over tid. Den
   øverste tydelige kanten fra 60 % av høyden og ned: horisonten i dagslys ligger over (31. okt.: 0,49–0,59), og
   lyse lister nede på dashbordet under (2. nov.: 0,90 mot riktig 0,72). Begge turene gir riktig kant.
   rowMean: snitt per rad (0–255). Returnerer kanten som andel av høyden, eller null uten tydelig kant. */
export function rowMeans(gray, w, h) {
  const out = new Float32Array(h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += gray[y * w + x]; out[y] = s / w; }
  return out;
}
export function dashLine(rowMean, { from = 0.6, to = 0.97, win = 5, minStep = 12 } = {}) {
  const h = rowMean.length, a = Math.floor(h * from), b = Math.floor(h * to);
  const steps = [];
  let best = 0;
  for (let y = Math.max(a, win); y < Math.min(b, h - win); y++) {
    let up = 0, dn = 0;
    for (let k = 1; k <= win; k++) { up += rowMean[y - k]; dn += rowMean[y + k - 1]; }
    const step = (up - dn) / win;
    steps.push([y, step]);
    if (step > best) best = step;
  }
  if (best < minStep) return null;
  // Øverste kant som er minst halvparten så tydelig som den sterkeste, og toppen av den kanten
  const first = steps.findIndex(([, st]) => st >= Math.max(minStep, 0.5 * best));
  let k = first;
  while (k + 1 < steps.length && steps[k + 1][1] >= steps[k][1]) k++;
  return steps[k][0] / h;
}
