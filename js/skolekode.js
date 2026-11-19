/* Kode fra trafikkskolen (0.27.0). Trafikkskoler kjøper tilgang til Pluss for elevene sine utenom App Store (App Store
   Review Guidelines 3.1.3(c)). Eleven skriver koden én gang; serveren (server/skolekoder/worker.js) svarer med et
   signert bevis som appen sjekker selv med den offentlige nøkkelen under, så tilgangen virker uten nett. Appen spør
   serveren igjen etter en uke, så en kode som skolen ikke har betalt for (stengt), slutter å virke.
   Appen viser aldri pris eller hvor koden kjøpes (Apples regler). Ingen personopplysninger sendes: bare koden og en
   tilfeldig nøkkel for denne installasjonen av appen.
   Lagres i innstillingene: skolekode { kode, bevis, sjekket } og installId. */
import { getSettings, saveSettings } from './db.js';
import { setSchoolPass } from './plus.js';

/* Serveren (Cloudflare Workers). Tom til den er satt opp: da vises ikke kodefeltet. Til testing kan adressen settes i
   localStorage['kjorerapport.kodeServer'] (f.eks. http://localhost:8787, server/skolekoder/dev.mjs). */
export const SERVER = '';
/* Den offentlige nøkkelen til bevisene (fra «node tools/skolekoder.mjs nokler»; den private ligger bare hos serveren) */
export const PUBLIC_KEY = { kty: 'EC', crv: 'P-256', x: '58zGkxSV-vLrTR1A2PgoIoNg8IlLMrcC9Dx7SV7Jg50', y: 'Q6E4MODOXSX_IyK5ik24Wf_z686X9VbBhOYRyhWe63M' };
export const RECHECK_MS = 7 * 86400000;

export function serverUrl() {
  try { const o = typeof localStorage !== 'undefined' && localStorage.getItem('kjorerapport.kodeServer'); if (o) return o.replace(/\/$/, ''); } catch { /* privat modus */ }
  return SERVER.replace(/\/$/, '');
}
export const codesEnabled = () => !!serverUrl();

export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const normalizeCode = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
export const formatCode = c => (normalizeCode(c).match(/.{1,4}/g) || []).join('-');
export const looksLikeCode = s => { const c = normalizeCode(s); return c.length === 12 && [...c].every(ch => ALPHABET.includes(ch)); };

const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
let keyP = null;
const verifyKey = jwk => (jwk === PUBLIC_KEY && keyP) || (keyP = crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));

/* Sjekker et bevis: riktig signatur, denne installasjonen og ikke utløpt. → innholdet ({ s: skole, exp, … }) eller null */
export async function verifyPass(token, { install, now = Date.now(), key = PUBLIC_KEY } = {}) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const k = key === PUBLIC_KEY ? await verifyKey(key) : await crypto.subtle.importKey('jwk', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, unb64u(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (p.v !== 1 || (install && p.i !== install) || !(p.exp > now)) return null;
    return p;
  } catch { return null; }
}

/* En tilfeldig nøkkel for denne installasjonen av appen (ikke knyttet til noen person) */
export function installId() {
  const s = getSettings();
  if (s.installId) return s.installId;
  const id = (crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''));
  saveSettings({ ...s, installId: id });
  return id;
}

export const ERROR_TEXT = {
  ukjent: 'Koden finnes ikke. Sjekk at du har skrevet den riktig.',
  brukt: 'Koden er allerede brukt på to telefoner. Spør trafikkskolen din.',
  stengt: 'Koden virker ikke lenger. Spør trafikkskolen din.',
  utlopt: 'Koden har gått ut. Spør trafikkskolen din.',
  nett: 'Fant ikke nettet. Prøv igjen når du er på nett.',
  server: 'Kunne ikke sjekke koden akkurat nå. Prøv igjen om litt.'
};

async function ask(code, install) {
  let r;
  try { r = await fetch(serverUrl() + '/v1/aktiver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kode: normalizeCode(code), install }) }); }
  catch { return { error: 'nett' }; }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { error: ['ukjent', 'brukt', 'stengt', 'utlopt'].includes(data.error) ? data.error : 'server', gone: r.status === 410 };
  return data;
}

/* Bruker en kode: spør serveren, sjekker beviset og lagrer det. → { ok, skole, til } eller { error } */
export async function activateCode(code) {
  if (!codesEnabled()) return { error: 'server' };
  if (!looksLikeCode(code)) return { error: 'ukjent' };
  const install = installId();
  const r = await ask(code, install);
  if (r.error) return r;
  const p = await verifyPass(r.bevis, { install });
  if (!p) return { error: 'server' };
  saveSettings({ ...getSettings(), skolekode: { kode: normalizeCode(code), bevis: r.bevis, sjekket: Date.now() } });
  setSchoolPass({ skole: p.s, exp: p.exp });
  return { ok: true, skole: p.s, til: p.exp };
}

/* Ved oppstart: sjekk det lagrede beviset (uten nett), og spør serveren igjen når det er gått en uke (med nett).
   Stengt eller utløpt kode: tilgangen fjernes. Uten svar fra serveren gjelder beviset til det går ut. */
export async function loadSchoolPass({ now = Date.now(), online = typeof navigator === 'undefined' || navigator.onLine } = {}) {
  const s = getSettings(), sk = s.skolekode;
  if (!sk || !sk.bevis) { setSchoolPass(null); return null; }
  const install = installId();
  let p = await verifyPass(sk.bevis, { install, now });
  setSchoolPass(p ? { skole: p.s, exp: p.exp } : null);
  if (online && codesEnabled() && (!p || now - (sk.sjekket || 0) > RECHECK_MS)) {
    const r = await ask(sk.kode, install);
    if (r.bevis) {
      const p2 = await verifyPass(r.bevis, { install, now });
      if (p2) { saveSettings({ ...getSettings(), skolekode: { ...sk, bevis: r.bevis, sjekket: now } }); p = p2; setSchoolPass({ skole: p2.s, exp: p2.exp }); }
    } else if (r.gone || r.error === 'ukjent') {
      const { skolekode, ...rest } = getSettings();
      saveSettings(rest);
      setSchoolPass(null);
      p = null;
    }
  }
  return p;
}
