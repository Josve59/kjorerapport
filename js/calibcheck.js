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
   ansikt, og noen ganger var det ledsagerens, så blikket ble regnet fra feil person. Nå ses opptil to ansikter, og
   føreren er ansiktet nærmest der føreren har vært (en glidende plassering i cm fra kameraet). Uten kjent plassering
   er føreren den nærmeste: telefonen står ved rattet. Et ansikt langt fra førerplassen (ledsageren når føreren ikke
   ses) godtas ikke. Har føreren ikke vært sett på en stund, godtas et nytt ansikt, men ikke et som sitter tydelig lenger unna (ledsageren);
   etter et kvarter starter det helt på nytt (og ved hver ny tur).
   poses: [{ x, y, z }] (cm, z negativ foran kameraet). step(poses, t) gir indeksen til føreren eller -1. */
export function createDriverPicker({ maxJump = 35, nearer = 25, staleSec = 20, forgetSec = 900, start = null } = {}) {
  let ref = start && Number.isFinite(start.x) && Number.isFinite(start.z) ? { ...start } : null, seenAt = -Infinity;
  const ok = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  return {
    get ref() { return ref; },
    step(poses, t) {
      const c = (poses || []).map((p, i) => ({ p, i })).filter(x => ok(x.p));
      if (!c.length) return (poses || []).length ? 0 : -1;   // uten plassering: det ene ansiktet modellen fant
      const byNear = c.slice().sort((a, b) => Math.abs(a.p.z) - Math.abs(b.p.z));
      let pick;
      if (!ref || t - seenAt > forgetSec) pick = byNear[0];
      else if (t - seenAt > staleSec) {
        // Lenge uten fører (mørkt i bilen, eller holderen flyttet): et ansikt godtas, men ikke et som sitter tydelig
        // lenger unna enn føreren gjorde (det er ledsageren)
        pick = byNear[0];
        if (Math.abs(pick.p.z) - Math.abs(ref.z) > nearer) return -1;
      }
      else {
        pick = c.slice().sort((a, b) => dist(a.p, ref) - dist(b.p, ref))[0];
        // To ansikter og det andre er tydelig nærmere telefonen: det er føreren (ledsageren sitter lenger unna)
        if (byNear[0] !== pick && Math.abs(pick.p.z) - Math.abs(byNear[0].p.z) > nearer) pick = byNear[0];
        else if (dist(pick.p, ref) > maxJump) return -1;
      }
      ref = ref && t - seenAt <= staleSec ? { x: ref.x + (pick.p.x - ref.x) * 0.1, y: ref.y + (pick.p.y - ref.y) * 0.1, z: ref.z + (pick.p.z - ref.z) * 0.1 } : { x: pick.p.x, y: pick.p.y, z: pick.p.z };
      seenAt = t;
      return pick.i;
    }
  };
}
