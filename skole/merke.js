/* Elevens navn på skolesiden (1.2.0). Skolen kan skrive et navn eller elevnummer på hver kode, så den vet hvem som har
   hvilken. Navnet krypteres her i nettleseren med en nøkkel som lages av skolens lenke (AES-GCM, nøkkelen fra HKDF), og
   serveren lagrer bare den krypterte teksten. Serveren lagrer heller ikke lenken, bare SHA-256 av den, så det som er
   lagret hos oss kan ikke leses uten lenken. Får skolen en ny lenke, kan navnene ikke leses med den, og må skrives på nytt.
   Ren modul (Web Crypto), testes i Node. */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
export const MAX_LABEL = 60;

/* Nøkkelen av lenken (den samme i alle nettlesere med lenken) */
export async function labelKey(token) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(token)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('kjorerapport-merke-v1'), info: new Uint8Array(0) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/* «Emma Hansen» → «iv.tekst» (base64url). Tomt navn: '' (navnet fjernes). */
export async function sealLabel(key, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
  if (!t) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(t)));
  return `${b64u(iv)}.${b64u(ct)}`;
}

/* Tilbake til navnet. '' når det ikke er noe navn, null når det er laget med en annen lenke. */
export async function openLabel(key, sealed) {
  if (!sealed) return '';
  try {
    const [iv, ct] = String(sealed).split('.');
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, key, unb64u(ct)));
  } catch { return null; }
}
