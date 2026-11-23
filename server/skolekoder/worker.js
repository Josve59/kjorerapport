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
   POST /admin/apne        { kode }                      → { ok }   (en kode som ble stengt ved en feil, virker igjen)

   Testere (0.27.5): en kode kan merkes som testkode (`tester: true`). Beviset får da `t: 1`, og appen viser knappen
   «Send turen til utvikleren». Turen sendes bare når testeren trykker, og bare fra en installasjon som har brukt koden.
   POST /v1/tur            body: turen (gzip-JSON), hoder X-Kode, X-Install, X-Tur, X-Start, X-Versjon, X-Gzip
                                                         → { ok, nokkel }   (403 ikke tester, 410 stengt/utløpt, 413 for stor)
   POST /admin/tester      { kode, tester }              → { ok }
   GET  /admin/turer                                     → { turer: [{ nokkel, kode, install, tur, start, bytes, gz, versjon, sendt }] }
   GET  /admin/tur?nokkel=…                              → selve turen (som den ble sendt)
   POST /admin/slett-tur   { nokkel } eller { alle: true } → { ok, slettet }

   Telling av Pluss-kjøp (1.0.7): Pluss kjøpes per person i App Store. For å se om kjøp deles, melder iPhone-appen seg
   høyst én gang i uka med et anonymt kjøpsnummer (SHA-256 av Apples kjøps-ID, laget på telefonen) og installasjons-
   nøkkelen. Serveren kan ikke finne kjøpet hos Apple eller vite hvem som kjøpte. Ingenting stenges, bare telles.
   «pluss:<kjop>» → { forst, installs: [{ i, forst, sist }], maks }   (maks: flest telefoner i bruk på én gang)
   POST /v1/pluss          { kjop, install }             → { ok }
   GET  /admin/pluss                                     → { kjop, naa: { 1, 2, 3, '4+' }, maks: { … }, liste } */

export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // uten 0/O, 1/I/L, så kodene er lette å skrive av
export const CODE_LEN = 12;
const MONTH = 30.44 * 86400000;
const MAX_TRIP = 20 * 1024 * 1024;   // KV tar 25 MiB per verdi
const TRIPS_PER_DAY = 30;            // per installasjon

export const normalizeCode = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');   // mellomrom og bindestreker spiller ingen rolle
export const formatCode = c => (c.match(/.{1,4}/g) || []).join('-');
const validCode = c => c.length === CODE_LEN && [...c].every(ch => ALPHABET.includes(ch));

const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();

function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Kode, X-Install, X-Tur, X-Start, X-Versjon, X-Gzip');
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
  const bevis = await signPass(env, { v: 1, s: rec.skole, k: c.slice(-4), i: install, iat: now, exp: til, t: rec.tester ? 1 : 0 });
  return json({ bevis, skole: rec.skole, til });
}

async function createCodes(req, env, now) {
  const { skole, antall, maaneder = 12, maks = 2, tester = false } = await readJson(req);
  const name = String(skole || '').trim().slice(0, 80);
  const n = Math.floor(Number(antall));
  if (!name || !(n >= 1 && n <= 1000)) return json({ error: 'Oppgi skole og antall (1–1000).' }, 400);
  const m = Math.max(1, Math.min(36, Math.floor(Number(maaneder) || 12)));
  const mx = Math.max(1, Math.min(50, Math.floor(Number(maks))));   // 2 for elever; opptil 50 for en felles testlenke (0.27.4)
  const koder = [];
  while (koder.length < n) {
    const c = randomCode();
    if (koder.includes(c) || await getCode(env, c)) continue;
    await putCode(env, c, { skole: name, maaneder: m, maks: mx, laget: now, forst: null, installs: [], stengt: false, tester: !!tester });
    koder.push(formatCode(c));
  }
  return json({ skole: name, maaneder: m, maks: mx, tester: !!tester, koder });
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
      if (rec) out.push({ kode: formatCode(k.name.slice(5)), skole: rec.skole, brukt: rec.installs.length, forst: rec.forst, til: until(rec), stengt: !!rec.stengt, tester: !!rec.tester });
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

/* En tur fra en tester (0.27.5). Lagres under «tur:<installasjon>:<turens id>», så samme tur sendt på nytt erstatter
   den gamle. Bare det som trengs for å finne igjen turen, står i metadata; selve turen er det testeren sendte. */
async function receiveTrip(req, env, now) {
  const h = n => req.headers.get(n) || '';
  const c = normalizeCode(h('X-Kode')), install = h('X-Install');
  // Testadressen uten kode (0.27.9) er fjernet igjen (0.28.0): turer kommer bare fra testkoder
  const rec = validCode(c) ? await getCode(env, c) : null;
  if (!rec || !rec.installs.includes(install)) return json({ error: 'ukjent' }, 404);
  if (rec.stengt) return json({ error: 'stengt' }, 410);
  const til = until(rec);
  if (!til || til <= now) return json({ error: 'utlopt' }, 410);
  if (!rec.tester) return json({ error: 'ikke-tester' }, 403);
  const len = Number(h('Content-Length') || 0);
  if (len > MAX_TRIP) return json({ error: 'stor' }, 413);
  const body = await req.arrayBuffer();
  if (!body.byteLength) return json({ error: 'tom' }, 400);
  if (body.byteLength > MAX_TRIP) return json({ error: 'stor' }, 413);
  const day = new Date(now).toISOString().slice(0, 10), countKey = `teller:${install}:${day}`;
  const count = Number(await env.CODES.get(countKey) || 0);
  if (count >= TRIPS_PER_DAY) return json({ error: 'mange' }, 429);
  await env.CODES.put(countKey, String(count + 1), { expirationTtl: 2 * 86400 });
  const tripId = h('X-Tur').replace(/[^\w.-]/g, '').slice(0, 60) || String(now);
  const key = `tur:${install.slice(0, 12)}:${tripId}`;
  const meta = { kode: c.slice(-4), install: install.slice(0, 8), tur: tripId, start: h('X-Start').slice(0, 30), bytes: body.byteLength, gz: h('X-Gzip') === '1', versjon: h('X-Versjon').slice(0, 12), sendt: now };
  await env.CODES.put(key, body, { metadata: meta });
  return json({ ok: true, nokkel: key });
}

async function listTrips(env) {
  const turer = [];
  let cursor;
  do {
    const page = await env.CODES.list({ prefix: 'tur:', cursor });
    for (const k of page.keys) turer.push({ nokkel: k.name, ...(k.metadata || {}) });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  turer.sort((a, b) => (b.sendt || 0) - (a.sendt || 0));
  return json({ turer });
}

async function getTrip(url, env) {
  const key = url.searchParams.get('nokkel') || '';
  if (!key.startsWith('tur:')) return json({ error: 'ukjent' }, 404);
  const v = await env.CODES.getWithMetadata(key, { type: 'arrayBuffer' });
  if (!v || !v.value) return json({ error: 'ukjent' }, 404);
  return cors(new Response(v.value, { headers: { 'Content-Type': v.metadata && v.metadata.gz ? 'application/gzip' : 'application/json' } }));
}

async function deleteTrips(req, env) {
  const { nokkel, alle } = await readJson(req);
  const keys = [];
  if (alle === true) {
    let cursor;
    do { const page = await env.CODES.list({ prefix: 'tur:', cursor }); keys.push(...page.keys.map(k => k.name)); cursor = page.list_complete ? null : page.cursor; } while (cursor);
  } else if (typeof nokkel === 'string' && nokkel.startsWith('tur:')) keys.push(nokkel);
  for (const k of keys) await env.CODES.delete(k);
  return json({ ok: true, slettet: keys.length });
}

/* Pluss-telling (1.0.7). En telefon regnes som i bruk når den har meldt seg de siste 14 dagene: appen melder seg hver
   uke, så to telefoner som brukes samtidig, synes begge. Bytter noen telefon, er den gamle ute etter 14 dager. */
export const PLUS_ACTIVE = 14 * 86400000;
const PLUS_WRITE_EVERY = 6 * 86400000;   // KV tåler 1000 skrivinger om dagen gratis: høyst én per telefon i uka
const PLUS_KEEP = 20;                    // telefoner per kjøp som huskes
const activeNow = (rec, now) => rec.installs.filter(x => now - x.sist <= PLUS_ACTIVE).length;
const bucket = n => (n >= 4 ? '4+' : String(n));

async function countPlus(req, env, now) {
  const { kjop, install } = await readJson(req);
  if (typeof kjop !== 'string' || !/^[0-9a-f]{32}$/.test(kjop)) return json({ error: 'kjop' }, 400);
  if (typeof install !== 'string' || install.length < 8 || install.length > 64) return json({ error: 'install' }, 400);
  const key = 'pluss:' + kjop, old = await env.CODES.get(key);
  const rec = old ? JSON.parse(old) : { forst: now, installs: [], maks: 0 };
  const id = install.slice(0, 16);
  let row = rec.installs.find(x => x.i === id);
  if (row && now - row.sist < PLUS_WRITE_EVERY) return json({ ok: true });
  if (row) row.sist = now; else { row = { i: id, forst: now, sist: now }; rec.installs.push(row); }
  rec.installs.sort((a, b) => b.sist - a.sist);
  rec.installs = rec.installs.slice(0, PLUS_KEEP);
  rec.maks = Math.max(rec.maks || 0, activeNow(rec, now));
  await env.CODES.put(key, JSON.stringify(rec));
  return json({ ok: true });
}

async function plusSummary(env, now) {
  const naa = { 1: 0, 2: 0, 3: 0, '4+': 0 }, maks = { 1: 0, 2: 0, 3: 0, '4+': 0 }, liste = [];
  let cursor;
  do {
    const page = await env.CODES.list({ prefix: 'pluss:', cursor });
    for (const k of page.keys) {
      const v = await env.CODES.get(k.name);
      if (!v) continue;
      const rec = JSON.parse(v), n = activeNow(rec, now);
      if (n) naa[bucket(n)]++;
      if (rec.maks) maks[bucket(rec.maks)]++;
      liste.push({ kjop: k.name.slice(6, 12), telefoner: rec.installs.length, naa: n, maks: rec.maks || 0, forst: rec.forst, sist: Math.max(0, ...rec.installs.map(x => x.sist)) });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  liste.sort((a, b) => b.maks - a.maks || b.sist - a.sist);
  return json({ kjop: liste.length, naa, maks, liste });
}

export default {
  async fetch(req, env, ctx, now = Date.now()) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    try {
      if (req.method === 'POST' && url.pathname === '/v1/aktiver') return await activate(req, env, now);
      if (req.method === 'POST' && url.pathname === '/v1/tur') return await receiveTrip(req, env, now);
      if (req.method === 'POST' && url.pathname === '/v1/pluss') return await countPlus(req, env, now);
      if (url.pathname.startsWith('/admin/')) {
        if (!isAdmin(req, env)) return json({ error: 'nei' }, 401);
        if (req.method === 'POST' && url.pathname === '/admin/koder') return await createCodes(req, env, now);
        if (req.method === 'GET' && url.pathname === '/admin/koder') return await listCodes(url, env);
        if (req.method === 'POST' && url.pathname === '/admin/steng') return await changeCode(req, env, r => { r.stengt = true; });
        if (req.method === 'POST' && url.pathname === '/admin/nullstill') return await changeCode(req, env, r => { r.installs = []; });
        if (req.method === 'POST' && url.pathname === '/admin/apne') return await changeCode(req, env, r => { r.stengt = false; });   // 0.27.4: angre «steng»
        if (req.method === 'POST' && url.pathname === '/admin/tester') { const b = await req.clone().json().catch(() => ({})); return await changeCode(req, env, r => { r.tester = b.tester !== false; }); }
        if (req.method === 'GET' && url.pathname === '/admin/turer') return await listTrips(env);
        if (req.method === 'GET' && url.pathname === '/admin/tur') return await getTrip(url, env);
        if (req.method === 'POST' && url.pathname === '/admin/slett-tur') return await deleteTrips(req, env);
        if (req.method === 'GET' && url.pathname === '/admin/pluss') return await plusSummary(env, now);
      }
      if (url.pathname === '/') return json({ tjeneste: 'Kjørerapport skolekoder', ok: true });
      return json({ error: 'finnes ikke' }, 404);
    } catch (err) {
      return json({ error: 'feil på serveren' }, 500);
    }
  }
};
