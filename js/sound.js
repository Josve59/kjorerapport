/* Pip når farten er for høy (v0.9.10 / k0.7.5). Lydene lages i telefonen (Web Audio), ingen lydfiler. iPhone krever at
   lyden låses opp med et trykk: det skjer når opptaket startes. Lydøkten settes til «transient» (spilles også med
   lydløs-bryteren på, og musikk dempes et øyeblikk) og slippes etter hver lyd. I iPhone-appen spiller appen pipene.
   1.0.4: lydene for fotobokser og strekningsmåling er tatt ut (eieren). */

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
  fart: [[1400, 0, 0.08], [1400, 0.12, 0.08]]
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
