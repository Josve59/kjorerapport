/* Skolekoder (0.27.0): trafikkskoler kjøper tilgang til Kjørerapport Pluss for elevene sine, utenom App Store
   (App Store Review Guidelines 3.1.3(c): salg til organisasjoner for elevene deres). Eieren lager én kode per elev med
   tools/skolekoder.mjs; skolen deler dem ut; eleven skriver koden i appen.

   Cloudflare Worker uten avhengigheter. Lagring: KV-navnerommet CODES. Hemmeligheter: ADMIN_SECRET (verktøyet til
   eieren) og SIGN_KEY (privat ECDSA P-256-nøkkel som JWK). Ingen personopplysninger: bare koden, skolens navn, når
   koden ble tatt i bruk, og en tilfeldig nøkkel per installasjon av appen (ikke knyttet til noen person).

   Kode i KV: «kode:XXXXXXXXXXXX» → { skole, maaneder, maks, laget, forst, installs: [id], stengt }
   - Én kode er én elev. Den kan brukes på høyst `maks` installasjoner (2: eleven kan bytte telefon).
   - Tilgangen varer `maaneder` fra første gang koden ble brukt.
   Appen får tilbake et signert bevis (ECDSA P-256), så tilgangen virker uten nett. Appen spør igjen av og til, så en
   stengt kode slutter å virke.

   POST /v1/aktiver        { kode, install }            → { bevis, skole, til }   (404 ukjent, 409 brukt, 410 stengt)
   POST /admin/koder       { skole, antall, maaneder, maks } → { koder: [...] }   (Authorization: Bearer ADMIN_SECRET)
   GET  /admin/koder?skole=Navn                          → { koder: [{ kode, brukt, forst, til, stengt }] }
   POST /admin/steng       { kode }                      → { ok }
   POST /admin/nullstill   { kode }                      → { ok }   (eleven har ny telefon og har brukt opp begge)
   POST /admin/apne        { kode }                      → { ok }   (en kode som ble stengt ved en feil, virker igjen) */

export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // uten 0/O, 1/I/L, så kodene er lette å skrive av
export const CODE_LEN = 12;
const MONTH = 30.44 * 86400000;

export const normalizeCode = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');   // mellomrom og bindestreker spiller ingen rolle
export const formatCode = c => (c.match(/.{1,4}/g) || []).join('-');
const validCode = c => c.length === CODE_LEN && [...c].every(ch => ALPHABET.includes(ch));

const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();

function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  h.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (data, status = 200) => cors(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
}

let keyCache = null, keyFor = null;   // nøkkelen leses én gang (per SIGN_KEY)
async function signKey(env) {
  if (!keyCache || keyFor !== env.SIGN_KEY) { keyCache = await crypto.subtle.importKey('jwk', JSON.parse(env.SIGN_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); keyFor = env.SIGN_KEY; }
  return keyCache;
}
/* Beviset: base64url(JSON) + «.» + base64url(signatur). Appen sjekker det med den offentlige nøkkelen. */
export async function signPass(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signKey(env), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

async function readJson(req) { try { return await req.json(); } catch { return {}; } }
const isAdmin = (req, env) => !!env.ADMIN_SECRET && req.headers.get('Authorization') === `Bearer ${env.ADMIN_SECRET}`;
const getCode = async (env, c) => { const v = await env.CODES.get('kode:' + c); return v ? JSON.parse(v) : null; };
const putCode = (env, c, rec) => env.CODES.put('kode:' + c, JSON.stringify(rec), { metadata: { skole: rec.skole } });
const until = rec => (rec.forst ? rec.forst + rec.maaneder * MONTH : null);

async function activate(req, env, now) {
  const { kode, install } = await readJson(req);
  const c = normalizeCode(kode);
  if (!validCode(c)) return json({ error: 'ukjent' }, 404);
  if (typeof install !== 'string' || install.length < 8 || install.length > 64) return json({ error: 'install' }, 400);
  const rec = await getCode(env, c);
  if (!rec) return json({ error: 'ukjent' }, 404);
  if (rec.stengt) return json({ error: 'stengt' }, 410);
  if (!rec.installs.includes(install)) {
    if (rec.installs.length >= rec.maks) return json({ error: 'brukt' }, 409);
    rec.installs.push(install);
    if (!rec.forst) rec.forst = now;
    await putCode(env, c, rec);
  }
  const til = until(rec);
  if (til <= now) return json({ error: 'utlopt', til }, 410);
  const bevis = await signPass(env, { v: 1, s: rec.skole, k: c.slice(-4), i: install, iat: now, exp: til });
  return json({ bevis, skole: rec.skole, til });
}

async function createCodes(req, env, now) {
  const { skole, antall, maaneder = 12, maks = 2 } = await readJson(req);
  const name = String(skole || '').trim().slice(0, 80);
  const n = Math.floor(Number(antall));
  if (!name || !(n >= 1 && n <= 1000)) return json({ error: 'Oppgi skole og antall (1–1000).' }, 400);
  const m = Math.max(1, Math.min(36, Math.floor(Number(maaneder) || 12)));
  const mx = Math.max(1, Math.min(50, Math.floor(Number(maks))));   // 2 for elever; opptil 50 for en felles testlenke (0.27.4)
  const koder = [];
  while (koder.length < n) {
    const c = randomCode();
    if (koder.includes(c) || await getCode(env, c)) continue;
    await putCode(env, c, { skole: name, maaneder: m, maks: mx, laget: now, forst: null, installs: [], stengt: false });
    koder.push(formatCode(c));
  }
  return json({ skole: name, maaneder: m, maks: mx, koder });
}

async function listCodes(url, env) {
  const skole = url.searchParams.get('skole');
  const out = [];
  let cursor;
  do {
    const page = await env.CODES.list({ prefix: 'kode:', cursor });
    for (const k of page.keys) {
      if (skole && (!k.metadata || k.metadata.skole !== skole)) continue;
      const rec = await getCode(env, k.name.slice(5));
      if (rec) out.push({ kode: formatCode(k.name.slice(5)), skole: rec.skole, brukt: rec.installs.length, forst: rec.forst, til: until(rec), stengt: !!rec.stengt });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return json({ koder: out });
}

async function changeCode(req, env, fn) {
  const c = normalizeCode((await readJson(req)).kode);
  const rec = validCode(c) ? await getCode(env, c) : null;
  if (!rec) return json({ error: 'ukjent' }, 404);
  fn(rec);
  await putCode(env, c, rec);
  return json({ ok: true, kode: formatCode(c) });
}

export default {
  async fetch(req, env, ctx, now = Date.now()) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    try {
      if (req.method === 'POST' && url.pathname === '/v1/aktiver') return await activate(req, env, now);
      if (url.pathname.startsWith('/admin/')) {
        if (!isAdmin(req, env)) return json({ error: 'nei' }, 401);
        if (req.method === 'POST' && url.pathname === '/admin/koder') return await createCodes(req, env, now);
        if (req.method === 'GET' && url.pathname === '/admin/koder') return await listCodes(url, env);
        if (req.method === 'POST' && url.pathname === '/admin/steng') return await changeCode(req, env, r => { r.stengt = true; });
        if (req.method === 'POST' && url.pathname === '/admin/nullstill') return await changeCode(req, env, r => { r.installs = []; });
        if (req.method === 'POST' && url.pathname === '/admin/apne') return await changeCode(req, env, r => { r.stengt = false; });   // 0.27.4: angre «steng»
      }
      if (url.pathname === '/') return json({ tjeneste: 'Kjørerapport skolekoder', ok: true });
      return json({ error: 'finnes ikke' }, 404);
    } catch (err) {
      return json({ error: 'feil på serveren' }, 500);
    }
  }
};
