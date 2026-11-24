/* Kjørerapport Pluss (0.11.0): ett engangskjøp i iPhone-appen (App Store, PlusStore.swift).
   Gratis: opptak, rapport, kart, fartsgrense, guider, kjørelogg, eksport og sikkerhetskopi, og
   rapportene for de FREE_REPORTS siste turene. Pluss: kameraene, opplæringsplanen (med faresteder),
   trafikklærersiden og rapportene for alle eldre turer. Nettversjonen (Safari) har alt, som før.
   Turene slettes aldri og kan alltid eksporteres, også uten Pluss.
   0.23.0 (eieren): teorien og sikkerhetskontrollen er det store salgspunktet, så de hører til Pluss, og 10 faste
   spørsmål er gratis å prøve. Det er ingen prøveperiode lenger: mange kjøper en teoriapp 7–14 dager før prøven, og
   14 gratis dager ville gitt hele teorien gratis. Prisen er 499 kr (App Store Connect).
   1.0.7 (eieren): Pluss kjøpes per person, uten Familiedeling. 1.0.16: telefonene per kjøp telles ikke lenger
   (Apple krever samtykke), så appen sender ingenting om kjøpet. */

export const FREE_REPORTS = 10;
export const PLUS_FEATURES = {
  theory: { icon: 'quiz', title: 'Hele teorien og sikkerhetskontrollen', text: 'Alle 420 spørsmålene med tegninger og forklaring, prøver som den ekte, teoriboka, skiltprøven og skiltkortene, «Hvem kjører først?» og alle 46 oppgavene i sikkerhetskontrollen.' },
  camera: { icon: 'camera', title: 'Kameraene', text: 'Speil- og skulderblikk med frontkameraet, og bilen foran, feltlinjene og fartsskiltene med bakkameraet samtidig.' },
  plan: { icon: 'book', title: 'Opplæringsplanen', text: 'Hele læreplanen for klasse B, med det appen har sett på turene, og faresteder på kartet.' },
  teacher: { icon: 'school', title: 'Til trafikklæreren', text: 'Oppsummering av øvingen siden forrige kjøretime, klar til å vise eller dele.' },
  ready: { icon: 'flag', title: 'Hva må du øve mer på?', text: 'Det du bør øve mer på før oppkjøringen, og det som er på plass: mengde, variasjon, mørke, fart og speil.' },
  history: { icon: 'list', title: 'Alle rapportene', text: `Rapportene for alle turene, ikke bare de ${FREE_REPORTS} siste.` }
};

const native = () => typeof window !== 'undefined' && !!(window.kjNative && window.kjNative.plusStatus);
let state = { owned: false, available: false, price: null, loaded: false };
let devOverride = null;   // utviklerdelen: true/false overstyrer, null = som App Store sier
const listeners = new Set();
const notify = () => { for (const fn of listeners) try { fn(hasPlus()); } catch { /* */ } };

/* Kode fra trafikkskolen (0.27.0, skolekode.js): { skole, exp } når eleven har en gyldig kode, ellers null.
   Gir hele Pluss, også teorien i nettversjonen (elever med Android bruker den). */
let school = null;
const schoolOk = () => !!(school && school.exp > Date.now());
export const schoolPass = () => (schoolOk() ? { ...school } : null);
export function setSchoolPass(p) { school = p && p.exp ? { skole: String(p.skole || ''), exp: p.exp, tester: !!p.tester } : null; notify(); }   // tester: testkode (0.27.5)

/* Har brukeren Pluss nå? Utenfor iPhone-appen alltid ja. */
export function hasPlus() {
  if (devOverride !== null) return devOverride;
  if (schoolOk()) return true;
  if (!native()) return true;
  return state.owned;
}
/* Teorien (0.23.0): bare med Pluss, også i nettversjonen. Nettversjonen har ellers alt gratis, men der kan Pluss ikke
   kjøpes, og spørsmålene ville da vært gratis for alle. Utviklerbryteren overstyrer som for resten av Pluss. */
export const WEB_THEORY = false;
export function hasTheory() {
  if (devOverride !== null) return devOverride;
  if (schoolOk()) return true;
  if (!native()) return WEB_THEORY;
  return state.owned;
}
/* Har brukeren funksjonen (nøkkel fra PLUS_FEATURES eller gateFor)? */
export const hasFeature = key => (key === 'theory' ? hasTheory() : hasPlus());
/* De 10 gratis spørsmålene (0.23.0), i rekkefølgen de vises: noe fra hvert tema, med det beste appen har (kryss som
   spilles av, førerens utsikt, bildesvar, stopplengden med kalkulatoren i teoriboka, lamper og linjer). */
export const FREE_THEORY = ['v02', 'f05', 'sp124', 'f02', 't24', 'k08', 's34', 'r09', 'a26', 'v40'];
export const plusState = () => ({ ...state, native: native(), dev: devOverride, school: schoolPass() });
export function onPlusChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setDevPlus(v) { devOverride = v === true || v === false ? v : null; notify(); }

/* Henter status fra App Store (pris og eierskap). Svarer state. */
export async function refreshPlus() {
  if (!native()) { state = { ...state, owned: true, loaded: true }; return plusState(); }
  const r = await window.kjNative.plusStatus().catch(() => null);
  if (r) state = { owned: !!r.owned, available: !!r.available, price: r.price || null, loaded: true };
  notify();
  return plusState();
}

const run = async cmd => {
  const r = await window.kjNative[cmd]().catch(e => ({ error: String(e && e.message || e) }));
  if (r && typeof r.owned === 'boolean') state = { ...state, owned: r.owned };
  notify();
  return { owned: hasPlus(), bought: state.owned || devOverride === true, error: r && r.error ? r.error : null };
};
export const buyPlus = () => (native() ? run('plusBuy') : Promise.resolve({ owned: true, bought: true, error: null }));
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

/* Hvilken Pluss-funksjon en skjerm hører til, eller null. «Til trafikklæreren» er ikke sperret (0.18.3): samtalen med
   læreren er gratis, så eleven alltid kan lese svaret. Bare oppsummeringen av øvingen på den siden hører til Pluss. */
export function gateFor(hash) {
  // Opplæring-fanen er åpen (0.20.0). Underfanen «Læreplan» hører til Pluss.
  // 0.23.0: teorien og sikkerhetskontrollen hører til Pluss. Oversikten (#/opplaering/teori) og øvingen (#/teori/ov)
  // er åpne, siden de 10 gratis spørsmålene går der; theoryui.js sperrer resten. Teoriboka sperres i theoryui.js per del.
  return { '#/kamera': 'camera', '#/opplaering/laereplan': 'plan', '#/faresteder': 'plan', '#/klar': 'ready',
    '#/teori/prove': 'theory', '#/teori/resultat': 'theory', '#/teori/skilt': 'theory', '#/teori/skiltkort': 'theory', '#/teori/kryss': 'theory',
    '#/teori/bok': 'theory', '#/sikkerhetskontroll': 'theory', '#/sikkerhetskontroll/ov': 'theory', '#/pluss/teori': 'theory' }[hash] || null;
}
