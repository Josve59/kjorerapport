/* Fartsvarsel under kjøring (0.12.0): en rød kant på skjermen og, hvis ledsageren vil, pip når farten er for høy.
   Grensen før appen sier fra er den samme marginen politiet trekker fra ved fartskontroll: 3 km/t opp til 100 km/t,
   og 3 % over 100 km/t. Farten må ligge over i 2 sekunder, så korte topper (og GPS-støy) ikke gir varsel.
   Over grensen vokser varselet eksponentielt mot fullt: litt over gir et svakt varsel, mye over et sterkt, og det
   flater ut så det ikke blir mer masete enn nødvendig. Pipene kommer tettere jo sterkere varselet er.
   Ren modul uten nettleseravhengighet, testes i Node. */

export const SPEED_WARN = { hold: 2, scale: 7, beepSlow: 4, beepFast: 0.8, hysteresis: 1 };

/* Margin over fartsgrensen før varsel (km/t) */
export const tolerance = limit => (limit > 100 ? Math.ceil(limit * 0.03) : 3);

/* Styrken på varselet (0–1) når farten er «over» km/t over marginen: 1 − e^(−over/7).
   3 km/t over marginen ≈ 0,35, 7 ≈ 0,63, 15 ≈ 0,88. */
export const intensity = over => (over > 0 ? 1 - Math.exp(-over / SPEED_WARN.scale) : 0);

/* Sekunder mellom pip ved en gitt styrke: 4 s for et svakt varsel, ned mot 0,8 s for et sterkt */
export const beepInterval = level => SPEED_WARN.beepSlow - (SPEED_WARN.beepSlow - SPEED_WARN.beepFast) * level;

/* step({ kmh, limit, t }) → { level: 0–1, beep: true når et pip skal spilles nå }. t i sekunder. */
export function createSpeedWarn() {
  let overSince = null, active = false, lastBeep = -Infinity;
  return {
    step({ kmh, limit, t }) {
      if (!Number.isFinite(kmh) || !Number.isFinite(limit) || limit <= 0) { overSince = null; active = false; return { level: 0, beep: false }; }
      const over = kmh - limit - tolerance(limit);
      if (over > 0) { if (overSince === null) overSince = t; }
      else if (over <= -SPEED_WARN.hysteresis || !active) { overSince = null; active = false; }
      if (overSince !== null && t - overSince >= SPEED_WARN.hold) active = true;
      if (!active) return { level: 0, beep: false };
      // Like under marginen (innenfor hysteresen) holdes et svakt varsel, så kanten ikke blinker av og på
      const level = Math.max(0.15, intensity(over));
      const beep = t - lastBeep >= beepInterval(level);
      if (beep) lastBeep = t;
      return { level, beep };
    },
    reset() { overSince = null; active = false; lastBeep = -Infinity; }
  };
}
