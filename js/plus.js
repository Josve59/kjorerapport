/* Kjørerapport Pluss (0.11.0): ett engangskjøp i iPhone-appen (App Store, PlusStore.swift).
   Gratis: opptak, rapport, kart, fartsgrense, fotoboksvarsel, guider, kjørelogg, eksport og sikkerhetskopi, og
   rapportene for de FREE_REPORTS siste turene. Pluss: kameraene, opplæringsplanen (med faresteder),
   trafikklærersiden og rapportene for alle eldre turer. Nettversjonen (Safari) har alt, som før.
   Turene slettes aldri og kan alltid eksporteres, også uten Pluss.
   Prøveperiode (0.11.2): et gratis kjøp i App Store («14 dagers prøveperiode», Apples regel for apper uten abonnement)
   låser opp Pluss i 14 dager, én gang per Apple-ID. */

export const FREE_REPORTS = 10;
export const PLUS_FEATURES = {
  camera: { icon: 'camera', title: 'Kameraene', text: 'Speil- og skulderblikk med frontkameraet, og bilen foran, feltlinjene og fartsskiltene med bakkameraet samtidig.' },
  plan: { icon: 'book', title: 'Opplæringsplanen', text: 'Hele læreplanen for klasse B, med det appen har sett på turene, og faresteder på kartet.' },
  teacher: { icon: 'school', title: 'Til trafikklæreren', text: 'Oppsummering av øvingen siden forrige kjøretime, klar til å vise eller dele.' },
  ready: { icon: 'flag', title: 'Hva må du øve mer på?', text: 'Det du bør øve mer på før oppkjøringen, og det som er på plass: mengde, variasjon, mørke, fart og speil.' },
  history: { icon: 'list', title: 'Alle rapportene', text: `Rapportene for alle turene, ikke bare de ${FREE_REPORTS} siste.` }
};

const native = () => typeof window !== 'undefined' && !!(window.kjNative && window.kjNative.plusStatus);
let state = { owned: false, available: false, price: null, loaded: false, trialAvailable: false, trialEnd: null };
let trialTimer = null;
let devOverride = null;   // utviklerdelen: true/false overstyrer, null = som App Store sier
const listeners = new Set();
const notify = () => { for (const fn of listeners) try { fn(hasPlus()); } catch { /* */ } };

/* Har brukeren Pluss nå? Utenfor iPhone-appen alltid ja. */
export function hasPlus() {
  if (devOverride !== null) return devOverride;
  if (!native()) return true;
  return state.owned || trialActive();
}
/* Prøveperioden pågår nå (og er ikke kjøpt) */
export function trialActive(now = Date.now()) {
  const end = state.trialEnd ? Date.parse(state.trialEnd) : NaN;
  return Number.isFinite(end) && end > now;
}
/* Hele dager igjen av prøveperioden (avrundet opp), eller 0 */
export function trialDaysLeft(now = Date.now()) {
  const end = state.trialEnd ? Date.parse(state.trialEnd) : NaN;
  return Number.isFinite(end) && end > now ? Math.ceil((end - now) / 86400000) : 0;
}
/* Når prøveperioden går ut mens appen er åpen, låses Pluss igjen */
function armTrialTimer() {
  clearTimeout(trialTimer);
  const end = state.trialEnd ? Date.parse(state.trialEnd) : NaN;
  if (Number.isFinite(end) && end > Date.now() && end - Date.now() < 2 ** 31 - 1) trialTimer = setTimeout(notify, end - Date.now() + 1000);
}
export const plusState = () => ({ ...state, native: native(), dev: devOverride });
export function onPlusChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setDevPlus(v) { devOverride = v === true || v === false ? v : null; notify(); }

/* Henter status fra App Store (pris og eierskap). Svarer state. */
export async function refreshPlus() {
  if (!native()) { state = { ...state, owned: true, loaded: true }; return plusState(); }
  const r = await window.kjNative.plusStatus().catch(() => null);
  if (r) state = { owned: !!r.owned, available: !!r.available, price: r.price || null, loaded: true, trialAvailable: !!r.trialAvailable, trialEnd: r.trialEnd || null };
  armTrialTimer();
  notify();
  return plusState();
}

const run = async cmd => {
  const r = await window.kjNative[cmd]().catch(e => ({ error: String(e && e.message || e) }));
  if (r && typeof r.owned === 'boolean') state = { ...state, owned: r.owned };
  if (r && 'trialEnd' in r) state = { ...state, trialEnd: r.trialEnd || null, trialAvailable: !!r.trialAvailable };
  armTrialTimer();
  notify();
  return { owned: hasPlus(), bought: state.owned || devOverride === true, error: r && r.error ? r.error : null };   // bought: kjøpt (ikke bare prøve)
};
export const buyPlus = () => (native() ? run('plusBuy') : Promise.resolve({ owned: true, bought: true, error: null }));
export const startTrial = () => (native() ? run('plusTrial') : Promise.resolve({ owned: true, bought: true, error: null }));
export const restorePlus = () => (native() ? run('plusRestore') : Promise.resolve({ owned: true, bought: true, error: null }));
export const redeemPlus = () => (native() ? run('plusRedeem') : Promise.resolve({ owned: true, bought: true, error: null }));

if (typeof window !== 'undefined') window.addEventListener('kjplus', e => { state = { ...state, owned: !!(e.detail && e.detail.owned) }; refreshPlus().catch(() => notify()); });

/* Til testene: sett tilstanden direkte */
export function _setStateForTest(s) { state = { ...state, ...s }; }

/* Rapporten for en tur er låst uten Pluss når turen er eldre enn de FREE_REPORTS siste ekte turene (demoturer og
   importerte turer teller ikke, og er aldri låst). drives: [{ id, startedAt, demo, imported }]. Ren funksjon. */
export function reportLocked(drives, id, plus) {
  if (plus) return false;
  const real = drives.filter(d => !d.demo && !d.imported).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const i = real.findIndex(d => d.id === id);
  return i >= FREE_REPORTS;
}

/* Hvilken Pluss-funksjon en skjerm hører til, eller null */
export function gateFor(hash) {
  return { '#/kamera': 'camera', '#/opplaering': 'plan', '#/faresteder': 'plan', '#/trafikklaerer': 'teacher', '#/klar': 'ready' }[hash] || null;
}
