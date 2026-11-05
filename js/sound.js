/* Lyd ved fotobokser og strekningsmåling (v0.9.10 / k0.7.5), som i varslingsapper (SafeDrive o.l.): et mykt
   «ding-dong» når et varsel kommer (rundt 1 km før), tre pip når det store kortet kommer (300 m før), raske pip hvis
   farten er over grensen nær boksen, og en lyd når en strekningsmåling starter og slutter.
   Lydene lages i telefonen (Web Audio), ingen lydfiler. iPhone krever at lyden låses opp med et trykk: det skjer
   når opptaket startes. Lydøkten settes til «transient» (spilles også med lydløs-bryteren på, og musikk dempes et
   øyeblikk) og slippes etter hver lyd. */

/* Hvilken lyd som skal spilles nå, ut fra varselet fra liveatk.js. Ren tilstandsmaskin, testes i Node.
   step(atk, { kmh, limit, t }) → null | 'varsel' | 'naer' | 'fart' | 'ferdig'. t i sekunder. */
export function createAtkSounds() {
  let lastKey = null, bigKey = null, fastAt = -Infinity, inSection = false, sectionN = 0, doneSaid = false;
  const step = (atk, { kmh = NaN, limit = null, t = 0 } = {}) => {
    const over = (v, slack) => Number.isFinite(v) && Number.isFinite(limit) && limit > 0 && v > limit + slack;
    if (!atk) { lastKey = null; bigKey = null; if (inSection) { inSection = false; } doneSaid = false; return null; }
    if (atk.kind === 'boks' || atk.kind === 'strekning-foran') {
      doneSaid = false;
      const key = atk.key || atk.kind;
      const first = key !== lastKey;
      lastKey = key;
      if (atk.d <= 300 && bigKey !== key) { bigKey = key; fastAt = t; return 'naer'; }
      if (first) return 'varsel';
      // Nær boksen og for fort: raske pip hvert 2. sekund til farten er under grensen
      if (atk.kind === 'boks' && atk.d <= 300 && over(kmh, 3) && t - fastAt >= 2) { fastAt = t; return 'fart'; }
      return null;
    }
    if (atk.kind === 'strekning') {
      lastKey = null; bigKey = null;
      if (!inSection) { inSection = true; sectionN = 0; fastAt = t; return 'varsel'; }
      sectionN++;
      // Snittet over grensen (etter de første 10 oppdateringene, da er snittet stabilt): pip hvert 15. sekund
      if (sectionN >= 10 && over(atk.avg, 1) && t - fastAt >= 15) { fastAt = t; return 'fart'; }
      return null;
    }
    if (atk.kind === 'ferdig') {
      inSection = false;
      if (!doneSaid) { doneSaid = true; return 'ferdig'; }
    }
    return null;
  };
  return { step };
}

let ctx = null, releaseTimer = null;
const session = type => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* ikke støttet */ } };

/* Kalles fra et trykk (start opptak, bryteren i innstillingene): låser opp lyden på iPhone. */
export function unlockSound() {
  if (typeof window !== 'undefined' && window.kjNative && window.kjNative.beep) return true;   // appen trenger ingen opplåsing
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ctx) ctx = new AC();
    // Et kort, stille lydklipp i trykket låser opp lyden for resten av økten
    const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    ctx.resume().catch(() => {});
    return true;
  } catch { return false; }
}

// Tonene: [frekvens Hz, start s, lengde s]
const PATTERNS = {
  varsel: [[660, 0, 0.16], [880, 0.18, 0.22]],
  naer: [[1000, 0, 0.11], [1000, 0.19, 0.11], [1000, 0.38, 0.16]],
  fart: [[1400, 0, 0.08], [1400, 0.12, 0.08]],
  ferdig: [[880, 0, 0.16], [660, 0.18, 0.22]]
};

export async function playSound(name, volume = 0.5) {
  const pat = PATTERNS[name];
  if (!pat) return;
  // iPhone-appen (0.12.2): appen spiller pipene selv. Web Audio i appen ble dempet og hørtes ikke.
  if (typeof window !== 'undefined' && window.kjNative && window.kjNative.beep) { window.kjNative.beep(pat, Math.min(1, volume + 0.2)); return; }
  try {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); }
    session('transient');
    if (ctx.state !== 'running') await ctx.resume();
    const t0 = ctx.currentTime + 0.03;
    let end = 0;
    for (const [f, at, len] of pat) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      // Myk start og slutt (ingen klikk)
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(volume, t0 + at + 0.012);
      g.gain.setValueAtTime(volume, t0 + at + len - 0.04);
      g.gain.linearRampToValueAtTime(0, t0 + at + len);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + at); o.stop(t0 + at + len + 0.02);
      end = Math.max(end, at + len);
    }
    // Slipp lydøkten etterpå, så musikken går som før
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { session('auto'); }, (end + 0.4) * 1000);
  } catch { /* ingen lyd */ }
}
