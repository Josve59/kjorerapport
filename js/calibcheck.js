/* Sjekk av kalibreringen før turen (0.12.0). Kalibreringen gjelder der telefonen sto da den ble laget. Flyttes
   holderen eller setet, blir speil- og skulderblikk feil, så appen sammenligner det kameraet ser nå med
   kalibreringen, og ber om ny kalibrering i «Før du kjører» hvis den ikke lenger passer.
   - Med ansiktets posisjon (cm fra kameraet, lagret ved kalibreringen fra 0.12.0): flyttet mer enn 8 cm sidelengs
     eller i høyden, eller 12 cm nærmere eller lenger unna. Det er uavhengig av hvor føreren ser.
   - Eldre kalibreringer: hodets retning skal ligge nær en av de kalibrerte retningene (rett fram eller et speil).
     Ligger den mer enn 15° unna alle, har noe flyttet seg.
   - Eldre enn 90 dager: foreslår ny kalibrering (bil, sete og holder endrer seg).
   Ren modul, testes i Node. */
import { MIRRORS } from './camera.js';

export const CALIB_CHECK = { minSamples: 12, moveCm: 8, depthCm: 12, angleDeg: 15, maxAgeDays: 90 };

const median = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };

/* Ansiktets posisjon (median) fra en liste med poser, eller null */
export function facePosition(poses) {
  const p = (poses || []).filter(x => x && Number.isFinite(x.x) && Number.isFinite(x.z));
  if (p.length < 5) return null;
  return { x: +median(p.map(q => q.x)).toFixed(1), y: +median(p.map(q => q.y)).toFixed(1), z: +median(p.map(q => q.z)).toFixed(1) };
}

/* poses: ansikter sett de siste sekundene. Svarer { state: 'ok' | 'moved' | 'old' | 'none' | 'wait', text } */
export function checkCalibration(calib, poses, now = Date.now()) {
  if (!calib || !calib.ok) return { state: 'none', text: 'Ikke kalibrert. Kalibrer nå, det tar 30 sekunder.' };
  const seen = (poses || []).filter(p => p && Number.isFinite(p.yaw));
  if (seen.length < CALIB_CHECK.minSamples) return { state: 'wait', text: 'Ser etter føreren …' };
  const pos = facePosition(seen);
  if (calib.pos && pos) {
    const side = Math.hypot(pos.x - calib.pos.x, pos.y - calib.pos.y), depth = Math.abs(pos.z - calib.pos.z);
    if (side > CALIB_CHECK.moveCm || depth > CALIB_CHECK.depthCm) return { state: 'moved', text: 'Telefonen eller setet står ikke som da kameraet ble kalibrert. Kalibrer på nytt, så blir speil- og skulderblikk riktige.', side, depth };
  } else {
    const targets = ['forward', ...MIRRORS].map(k => calib[k]).filter(t => t && Number.isFinite(t.yaw));
    const off = seen.map(p => Math.min(...targets.map(t => Math.hypot(p.yaw - t.yaw, p.pitch - t.pitch))));
    if (targets.length && median(off) > CALIB_CHECK.angleDeg) return { state: 'moved', text: 'Det ser ut som holderen har flyttet seg siden kalibreringen. Kalibrer på nytt, så blir speil- og skulderblikk riktige.' };
  }
  const age = calib.at ? (now - Date.parse(calib.at)) / 86400000 : 0;
  if (age > CALIB_CHECK.maxAgeDays) return { state: 'old', text: `Kalibrert for ${Math.round(age)} dager siden. Kalibrer gjerne på nytt.` };
  return { state: 'ok', text: 'Ser føreren · kalibreringen stemmer' };
}

/* Hvem er føreren (0.12.6)? Førerkameraet ser ofte både føreren og ledsageren. Ansiktsmodellen ga før bare ett
   ansikt, og noen ganger var det ledsagerens, så blikket ble regnet fra feil person. (0.13.1: modellen ser igjen ett
   ansikt om gangen, se facecam.js; er det ledsagerens, avvises det her.)
   Ansiktsmodellens avstander i cm har feil skala (kalibreringen 6. nov.: føreren «110 cm» unna en telefon ved rattet),
   så valget bruker retningen fra kameraet (vinkel), som ikke påvirkes av skalaen.
   - Sidene: i kamerabildet er positiv x mot bilens venstre side. Føreren sitter til venstre for ledsageren
     (kalibreringen: føreren på x = +34,5, og blikk mot venstre speil gir positiv vinkel).
   - Først: ett ansikt er føreren; to ansikter: det som er lengst mot venstre.
   - Så: ansiktet nærmest førerens retning. Føreren kan lene seg fritt mot venstre (skulderblikk) og opptil `toward`
     grader mot ledsagersiden. Et ansikt lenger over mot høyre (ledsageren, rundt 35–40° unna) godtas ikke, heller
     ikke når føreren ikke har vært sett på lenge (mørkt i bilen). Etter `forgetSec` uten fører starter det på nytt.
   poses: [{ x, y, z }] (z negativ foran kameraet). step(poses, t) gir indeksen til føreren eller -1.
   0.13.2: med home (ansiktets plass fra kalibreringen) er det førerplassen fra start, og et ansikt der godtas alltid.
   Turen 9. nov. kl. 20.12 ble ansiktet avvist i 3 minutter etter start: førerplassen var lært av det første ansiktet,
   trolig føreren som lente seg mot telefonen da turen ble startet. Ansikter på førersiden av kalibreringen som likevel
   ikke passer (40 på rad uten at noe godtas: holderen er flyttet opp/ned eller fram/tilbake) gjør at kalibreringen
   ikke brukes mer. rejectedSide: indeksene som sist ble avvist fordi de sitter på ledsagersiden (til createFaceMask). */
export function createDriverPicker({ toward = 18, up = 25, farther = 1.6, forgetSec = 900, home = null } = {}) {
  let ref = null, seenAt = -Infinity, homeDir = null, misses = 0, side = [];
  const deg = 180 / Math.PI;
  const ok = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && p.z < 0;
  const dir = p => ({ ax: Math.atan2(p.x, -p.z) * deg, ay: Math.atan2(p.y, -p.z) * deg, d: Math.hypot(p.x, p.y, p.z) });
  const fitsTo = (x, r) => x.ax - r.ax >= -toward && Math.abs(x.ay - r.ay) <= up && x.d <= r.d * farther;
  const setHome = p => { homeDir = ok(p) ? dir(p) : null; misses = 0; };
  setHome(home);
  return {
    get ref() { return ref; },
    get rejectedSide() { return side; },
    setHome,
    step(poses, t) {
      side = [];
      const c = (poses || []).map((p, i) => ({ i, ...(ok(p) ? dir(p) : {}) })).filter(x => Number.isFinite(x.ax));
      if (!c.length) return (poses || []).length === 1 ? 0 : -1;   // uten plassering: det ene ansiktet modellen fant
      const fresh = !ref || t - seenAt > forgetSec;
      if (fresh && homeDir) ref = homeDir;
      let pick;
      if (fresh && !homeDir) pick = c.reduce((a, b) => (b.ax > a.ax ? b : a));
      else {
        const refs = homeDir ? [ref, homeDir] : [ref];
        const fits = c.filter(x => refs.some(r => fitsTo(x, r)));
        if (!fits.length) {
          side = c.filter(x => refs.every(r => x.ax - r.ax < -toward)).map(x => x.i);
          if (homeDir && side.length < c.length && ++misses >= 40) { homeDir = null; ref = null; }
          return -1;
        }
        pick = fits.reduce((a, b) => (Math.hypot(b.ax - ref.ax, b.ay - ref.ay) < Math.hypot(a.ax - ref.ax, a.ay - ref.ay) ? b : a));
      }
      misses = 0;
      ref = !fresh ? { ax: ref.ax + (pick.ax - ref.ax) * 0.05, ay: ref.ay + (pick.ay - ref.ay) * 0.05, d: ref.d + (pick.d - ref.d) * 0.05 } : { ax: pick.ax, ay: pick.ay, d: pick.d };
      seenAt = t;
      return pick.i;
    }
  };
}

/* Ledsagerens side av bildet skjules (0.13.2). Ansiktsmodellen ser ett ansikt om gangen og følger det den har funnet.
   Fant den ledsageren, ble ansiktet avvist (riktig), men føreren ble ikke funnet før modellen mistet ledsageren:
   turene 9. nov. hadde «annet ansikt enn førerens» i 25 og 44 % av bildene, ofte et halvt til tre minutter i strekk.
   Når et ansikt på ledsagersiden er avvist 3 ganger på 3 s, males bildet svart fra ledsagerens ansikt og ut til
   kanten (med litt luft), så modellen må lete på nytt og finner føreren. Aldri nærmere førerens ansikt enn `keep` av
   bildebredden. Ser modellen ikke føreren på `giveUp` s, fjernes skjermen og læres på nytt.
   Bokser og mask er i bildebredde 0–1: { min, max } fra ansiktspunktenes x. mask: { from, to } eller null. */
export function createFaceMask({ minGap = 0.25, need = 3, within = 3, keep = 0.2, pad = 0.03, giveUp = 60 } = {}) {
  let driverU = null, pass = null, hits = [], mask = null, lastDriver = -Infinity, maskAt = -Infinity;
  const build = () => {
    const pc = (pass.min + pass.max) / 2;
    if (driverU === null || Math.abs(pc - driverU) < minGap) return null;
    const m = pc < driverU ? { from: 0, to: Math.min(pass.max + pad, driverU - keep) } : { from: Math.max(pass.min - pad, driverU + keep), to: 1 };
    return m.to - m.from >= 0.05 ? { from: Math.round(m.from * 1000) / 1000, to: Math.round(m.to * 1000) / 1000 } : null;
  };
  return {
    get mask() { return mask; },
    driver(box, t) {
      const c = (box.min + box.max) / 2;
      driverU = driverU === null ? c : driverU + (c - driverU) * 0.1;
      lastDriver = t;
    },
    passenger(box, t) {
      hits = hits.filter(x => t - x <= within); hits.push(t);
      pass = pass ? { min: pass.min + (box.min - pass.min) * 0.3, max: pass.max + (box.max - pass.max) * 0.3 } : { ...box };
      if (hits.length < need) return;
      const m = build();
      if (m && !mask) maskAt = t;
      if (m) mask = m;
    },
    tick(t) {
      if (mask && t - Math.max(lastDriver, maskAt) > giveUp) { mask = null; pass = null; hits = []; }
    }
  };
}
