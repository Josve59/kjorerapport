/* Feltlinjene på skjermen (0.13.9). Feltmodellen svarer 3–5 ganger i sekundet (3 når telefonen er varm), og hvert
   svar er litt forskjellig fra det forrige, mest langt fram. Tegnet rett fram hakket linjene: de hoppet til hvert
   nytt svar på en tidel, sto stille til det neste, og forsvant og kom tilbake uten overgang.
   Her glir linjene mot siste svar over omtrent like lang tid som det går mellom svarene (lengst fram glir de
   saktest, der støyen er størst og forsinkelsen synes minst), og de tones inn og ut i stedet for å blinke.
   En linje som flytter seg langt på én gang (feltskifte, annen linje valgt) tones inn på det nye stedet i stedet
   for å sveipe over veien. Rene tall inn og ut, så den testes i Node. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* step(lines, now, { ansAt, width }) → { left, right, fill, interval }.
   lines: { left, right }, hver null eller { pts: [[x, y], …] (like mange hver gang), predicted, carried, edge }.
   now (ms). ansAt: tidsmerket til svaret linjene kom fra (ms), width: bildebredden (til å kjenne igjen et hopp).
   Ut: per side null eller { pts, alpha (0–1), predicted, edge }, og fill = hvor sterkt feltet mellom dem fylles. */
export function createLaneEase() {
  const S = { left: null, right: null };
  let last = null, lastAns = null, interval = 220;
  const step = (lines, now, { ansAt = null, width = 720 } = {}) => {
    const dt = last === null ? 0 : clamp(now - last, 0, 250);
    last = now;
    // Tiden mellom svarene, glattet: styrer hvor fort linjene glir
    if (ansAt !== null && ansAt !== lastAns) {
      if (lastAns !== null) { const d = ansAt - lastAns; if (d > 30 && d < 1500) interval += (d - interval) * 0.3; }
      lastAns = ansAt;
    }
    const tauNear = clamp(0.6 * interval, 90, 260), tauFar = clamp(1.3 * interval, 150, 480);
    const k = tau => (dt <= 0 ? 0 : 1 - Math.exp(-dt / tau));
    const out = { left: null, right: null, fill: 0, interval: Math.round(interval) };
    for (const side of ['left', 'right']) {
      const t = lines && lines[side], o = S[side];
      if (t && t.pts && t.pts.length > 1) {
        const want = t.predicted ? 0.6 : t.carried ? 0.82 : 1;
        const n = t.pts.length;
        let s = o && o.pts.length === n ? o : null;
        if (s) {
          // Langt hopp: ny linje, ikke samme linje som har flyttet seg
          let jump = 0;
          for (let i = 0; i < n; i++) jump += Math.abs(t.pts[i][0] - s.pts[i][0]);
          if (jump / n > 0.08 * width) s = null;
        }
        if (!s) s = { pts: t.pts.map(p => [p[0], p[1]]), alpha: o ? Math.min(o.alpha, 0.25) : 0 };
        else {
          for (let i = 0; i < n; i++) {
            const a = k(tauNear + (tauFar - tauNear) * i / (n - 1));
            s.pts[i][0] += (t.pts[i][0] - s.pts[i][0]) * a;
            s.pts[i][1] += (t.pts[i][1] - s.pts[i][1]) * a;
          }
        }
        s.alpha += (want - s.alpha) * (dt <= 0 ? 0 : 1 - Math.exp(-dt / 160));
        s.predicted = !!t.predicted; s.edge = t.edge || null;
        S[side] = s;
      } else if (o) {
        // Borte: tones ut der den sto
        o.alpha += (0 - o.alpha) * k(220);
        if (o.alpha < 0.04) S[side] = null;
      }
      const s = S[side];
      if (s) out[side] = { pts: s.pts, alpha: s.alpha, predicted: s.predicted, edge: s.edge };
    }
    if (out.left && out.right) out.fill = Math.min(out.left.alpha, out.right.alpha);
    return out;
  };
  return { step, reset() { S.left = S.right = null; last = lastAns = null; interval = 220; } };
}
