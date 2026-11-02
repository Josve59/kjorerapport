/* Bildesammenligning mellom to kamerabilder (k0.7.5): hvor langt en bil har flyttet seg siden forrige bilde.
   D-FINE svarer bare rundt 3 ganger i sekundet på iPhone (310 ms per bilde, kveldsturen 2. nov.), så boksene
   gikk i rette linjer mellom svarene og rettet seg med et lite hopp. Her letes midten av bilens boks fra forrige
   bilde opp i det nye bildet (summen av absolutte forskjeller i gråtoner, rundt 8 ganger i sekundet), slik
   følgingen kan flytte boksen med bilen også når den bremser eller svinger. Om natten er baklysene sterke
   kjennetegn, så det virker også i mørket. Ren modul, testes i Node. */

/* prev, cur: gråtonebilder (Uint8Array, W×H). box: { x, y, w, h } i det lille bildets piksler, der bilen var i prev.
   Returnerer { dx, dy, err } eller null (for lite, for ensformig, eller ingen tydelig treff). */
export function matchShift(prev, cur, W, H, box, { radius = 8, maxSide = 20 } = {}) {
  // Indre 70 % av boksen: mest bil, lite bakgrunn
  const x0 = Math.round(box.x + box.w * 0.15), y0 = Math.round(box.y + box.h * 0.15);
  const x1 = Math.round(box.x + box.w * 0.85), y1 = Math.round(box.y + box.h * 0.85);
  const tx0 = Math.max(0, x0), ty0 = Math.max(0, y0), tx1 = Math.min(W, x1), ty1 = Math.min(H, y1);
  const tw = tx1 - tx0, th = ty1 - ty0;
  if (tw < 5 || th < 4) return null;
  const st = Math.max(1, Math.ceil(Math.max(tw, th) / maxSide));
  // Malen (hver st-te piksel), og om den har nok kontrast til å kjennes igjen
  const pts = [];
  let sum = 0, sum2 = 0;
  for (let y = ty0; y < ty1; y += st) for (let x = tx0; x < tx1; x += st) { const v = prev[y * W + x]; pts.push(x, y, v); sum += v; sum2 += v * v; }
  const n = pts.length / 3;
  if (n < 12) return null;
  const sd = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2));
  if (sd < 6) return null;
  // Søk ± radius rundt der bilen var (å lete rundt den forventede flyttingen fra farten ga ikke bedre følging i testen)
  const R = radius, S = 2 * R + 1, cost = new Float32Array(S * S).fill(Infinity);
  let best = Infinity, bx = 0, by = 0;
  for (let dy = -R; dy <= R; dy++) {
    if (ty0 + dy < 0 || ty1 - 1 + dy >= H) continue;
    for (let dx = -R; dx <= R; dx++) {
      if (tx0 + dx < 0 || tx1 - 1 + dx >= W) continue;
      let s = 0;
      for (let i = 0; i < pts.length; i += 3) { const d = cur[(pts[i + 1] + dy) * W + pts[i] + dx] - pts[i + 2]; s += d < 0 ? -d : d; }
      cost[(dy + R) * S + dx + R] = s;
      if (s < best) { best = s; bx = dx; by = dy; }
    }
  }
  if (!Number.isFinite(best)) return null;
  // Tydelig treff: klart bedre enn å stå stille på feil sted (snittet av de andre), og ikke langt fra malen
  let other = 0, m = 0;
  for (let i = 0; i < cost.length; i++) if (Number.isFinite(cost[i])) { other += cost[i]; m++; }
  const err = best / n;
  if (err > Math.max(12, sd * 0.6) || (m > 4 && best > 0.8 * (other / m))) return null;
  // Brøkdeler av en piksel: parabel gjennom treffet og naboene
  const c = (dx, dy) => cost[(dy + R) * S + dx + R];
  const sub = (a, b, e) => { const den = a - 2 * b + e; return Number.isFinite(den) && den > 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - e) / den)) : 0; };
  const fx = bx > -R && bx < R ? sub(c(bx - 1, by), best, c(bx + 1, by)) : 0;
  const fy = by > -R && by < R ? sub(c(bx, by - 1), best, c(bx, by + 1)) : 0;
  return { dx: bx + fx, dy: by + fy, err: Math.round(err * 10) / 10 };
}
