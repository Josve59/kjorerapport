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

/* Henstand når kartet alene senker grensen (0.13.11). Under kjøring finner appen veien bilen er på fra GPS-punktet.
   I kryss, rundkjøringer og ramper treffer den av og til en annen vei i noen sekunder: på turen 11. nov. kl. 21.33
   viste kartet 30 i ti sekunder midt i en 50-strekning rett etter en sving, og føreren fikk varsel for 45 km/t.
   Derfor varsles det mot den gamle grensen en stund etter at kartet senker den: 5 s på rett vei (føreren trenger
   uansett tid til å bremse), 10 s når bilen nettopp har svingt (der kartet oftest tar feil). Har kameraet lest
   skiltet (cam), er det ingen henstand. Bare varselet venter: grensen på skjermen og rapporten etter turen er uendret.
   step({ t (s), limit, bearing (grader, kan mangle), kmh, cam }) → grensen det skal varsles mot. */
export function createDropGrace({ straight = 5, turning = 10, turnDeg = 15, window = 5, memory = 30 } = {}) {
  let hist = [], last = null, lastAt = -Infinity, pending = null;
  return {
    step({ t, limit, bearing = NaN, kmh = NaN, cam = false }) {
      // Kjøreretningen de siste sekundene (ikke i krypefart, der GPS-retningen er støy)
      if (Number.isFinite(bearing) && kmh >= 8) hist.push({ t, b: bearing });
      hist = hist.filter(x => t - x.t <= window);
      if (!Number.isFinite(limit)) return limit;
      if (Number.isFinite(last) && t - lastAt <= memory && limit < last && !cam) {
        let turn = 0;
        for (const a of hist) for (const b of hist) turn = Math.max(turn, Math.abs(((a.b - b.b + 540) % 360) - 180));
        // En henstand som alt løper, forlenges ikke og får ikke en lavere «gammel» grense
        if (!pending || t >= pending.until) pending = { from: last, until: t + (turn >= turnDeg ? turning : straight) };
      }
      last = limit; lastAt = t;
      if (pending && (t >= pending.until || limit >= pending.from || cam)) pending = null;
      return pending ? pending.from : limit;
    },
    reset() { hist = []; last = null; lastAt = -Infinity; pending = null; }
  };
}
