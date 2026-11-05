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
