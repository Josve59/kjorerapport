/* Rene sensorfunksjoner uten nettleseravhengighet, så de kan testes i Node. */

export const RAD = Math.PI / 180;
export const MOTION_INTERVAL = 1 / 20;   // ca. 20 Hz lagring
export const LP_ALPHA = 0.05;            // lavpass for tyngdekraft når acceleration mangler

const has = v => v && v.x !== null && v.x !== undefined && Number.isFinite(v.x);

/* Tyngdekraft: inkl. − uten når begge finnes, ellers lavpassfilter av inkl.
   Returnerer { grav, state } der state er filtertilstanden som skal sendes inn neste gang. */
export function deriveGravity(includingGravity, acceleration, state) {
  if (has(includingGravity) && has(acceleration)) {
    const g = { x: includingGravity.x - acceleration.x, y: includingGravity.y - acceleration.y, z: includingGravity.z - acceleration.z };
    return { grav: g, state: g };
  }
  if (has(includingGravity)) {
    if (!state) { const g = { x: includingGravity.x, y: includingGravity.y, z: includingGravity.z }; return { grav: g, state: g }; }
    const g = {
      x: state.x + LP_ALPHA * (includingGravity.x - state.x),
      y: state.y + LP_ALPHA * (includingGravity.y - state.y),
      z: state.z + LP_ALPHA * (includingGravity.z - state.z)
    };
    return { grav: g, state: g };
  }
  return { grav: null, state };
}

/* Nedsampling etter tid: lagre når det er gått minst MOTION_INTERVAL siden forrige lagring.
   1 ms slingringsmonn, ellers gjør flyttallsfeil at 60 Hz blir 16 Hz i stedet for 20. */
export function shouldStore(t, lastStoredT, interval = MOTION_INTERVAL) {
  return !(Number.isFinite(lastStoredT) && lastStoredT >= 0 && t - lastStoredT < interval - 0.001);
}

/* rotationRate i grader/s (alpha om z, beta om x, gamma om y) → rad/s {x,y,z}. */
export function gyroFromRotationRate(r) {
  if (!r || r.alpha === null || r.alpha === undefined || !Number.isFinite(r.alpha)) return null;
  return { x: r.beta * RAD, y: r.gamma * RAD, z: r.alpha * RAD };
}

/* Lineær akselerasjon (uten tyngdekraft) hvis nettleseren gir den. */
export function linearFromEvent(acceleration) {
  if (!has(acceleration)) return null;
  return { x: acceleration.x, y: acceleration.y, z: acceleration.z };
}

/* Hull i opptaket: appen var skjult fra `hiddenAt` til `now`. Hull under 1 s ignoreres. */
export function gapFromHidden(hiddenAt, now) {
  if (!Number.isFinite(hiddenAt) || now - hiddenAt <= 1) return null;
  return { from: hiddenAt, to: now };
}

/* Haversine-avstand i meter. */
export function haversine(a, b) {
  const R = 6371000, k = Math.PI / 180;
  const dLat = (b.lat - a.lat) * k, dLon = (b.lon - a.lon) * k;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* Oppvarming: før første ferske, nøyaktige posisjon forkastes gamle/unøyaktige fikser (typisk en
   mobilnett-posisjon fra før GPS-en har låst). Returnerer true hvis fiksen skal forkastes. */
export function isStaleStartFix(accuracyM, ageMs, locked, maxAcc = 30, maxAgeMs = 5000) {
  if (locked) return false;
  if (Number.isFinite(accuracyM) && accuracyM > maxAcc) return true;
  if (Number.isFinite(ageMs) && ageMs > maxAgeMs) return true;
  return false;
}
