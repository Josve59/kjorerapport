/* Førerbildet i mørket (0.13.10). På veier uten gatelys er det så mørkt i bilen at ansiktsmodellen ikke finner
   føreren: på turen 11. nov. kl. 20.00 ble ansiktet funnet i 7 % av bildene når lyset på veien var 20–30, mot rundt
   90 % fra 40 og opp (tolv perioder på over et halvt minutt uten ansikt, 15 minutter til sammen).
   Her bestemmes det hvor mye bildet skal lysnes før modellen ser det, ut fra hvor lyst det er der førerens ansikt
   pleier å være:
   - gamma (1 = urørt, ned til 0,4): iPhone-appen lysner bildet før det pakkes som JPEG, så de mørke tonene ikke
     blir ødelagt av pakkingen først. Glir jevnt inn fra lys 80 og ned, så bildet ikke hopper i lysstyrke.
   - bias (0 eller +1,5 trinn): kameraet bes eksponere lysere når det er mørkt. Slås av igjen først når bildet er klart
     lysere enn det kameraet selv kan ha gjort det, så det ikke slår seg av og på.
   Rene tall inn og ut, så den testes i Node. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* step(lum) → { gamma, bias, raw }. lum: snittlysstyrken (0–255) målt på bildet slik det kom fra appen, altså
   allerede lysnet med forrige gamma. raw: anslått lysstyrke i kameraets eget bilde. */
export function createFaceLight({ target = 80, biasOn = 35, biasOff = 115, biasEv = 1.5, minGamma = 0.4 } = {}) {
  let gamma = 1, bias = 0;
  return {
    step(lum) {
      if (!Number.isFinite(lum)) return { gamma, bias, raw: null };
      // Tilbake til kameraets eget bilde: lysningen er ut = inn^gamma på verdier 0–1
      const raw = 255 * Math.pow(clamp(lum, 1, 254) / 255, 1 / gamma);
      let g = raw >= target ? 1 : clamp(Math.log(target / 255) / Math.log(Math.max(raw, 2) / 255), minGamma, 1);
      g = Math.round(g * 20) / 20;
      // Små endringer hoppes over, så bildet ikke flimrer rundt en grense
      if (g !== 1 && gamma !== 1 && Math.abs(g - gamma) < 0.1) g = gamma;
      gamma = g;
      if (!bias && raw < biasOn) bias = biasEv;
      else if (bias && raw > biasOff) bias = 0;
      return { gamma, bias, raw: Math.round(raw) };
    },
    reset() { gamma = 1; bias = 0; }
  };
}

/* Snittlysstyrken i en del av et lite RGBA-bilde (w×h). box: { x0, x1, y0, y1 } i 0–1, eller null for hele bildet. */
export function meanLum(rgba, w, h, box = null) {
  const x0 = box ? clamp(Math.floor(box.x0 * w), 0, w - 1) : 0, x1 = box ? clamp(Math.ceil(box.x1 * w), x0 + 1, w) : w;
  const y0 = box ? clamp(Math.floor(box.y0 * h), 0, h - 1) : 0, y1 = box ? clamp(Math.ceil(box.y1 * h), y0 + 1, h) : h;
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; s += rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114; n++; }
  return n ? s / n : NaN;
}
