/* Setter opp skolekode-serveren hos Cloudflare (0.27.1), uten Cloudflares eget verktøy (wrangler/npm finnes ikke på
   Macen). Snakker direkte med Cloudflares API:
   1. finner kontoen,
   2. lager (eller gjenbruker) KV-lagringen «kjorerapport-skolekoder»,
   3. laster opp server/skolekoder/worker.js med lagringen og hemmelighetene (ADMIN_SECRET, SIGN_KEY),
   4. slår på adressen på workers.dev og venter til serveren svarer,
   5. skriver adressen i .local-test/skolekoder/url.txt.
   Kan kjøres på nytt: da lastes bare serveren opp igjen (f.eks. etter en endring i worker.js).

   Tilgangsnøkkelen (API-token) lager eieren selv hos Cloudflare (mal «Edit Cloudflare Workers») og legger i
   .local-test/skolekoder/cf-token.txt. Den skrives aldri ut. Bruk: node tools/skolekoder-oppsett.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.local-test/skolekoder');
const read = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return null; } };
const API = 'https://api.cloudflare.com/client/v4';
const SCRIPT = 'kjorerapport-skolekoder', KV_TITLE = 'kjorerapport-skolekoder';

const token = read('cf-token.txt');
if (!token) { console.log('Mangler tilgangsnøkkelen i .local-test/skolekoder/cf-token.txt.'); process.exit(1); }
const admin = read('admin.txt'), signKey = read('privat.jwk.json');
if (!admin || !signKey) { console.log('Mangler nøklene. Kjør «node tools/skolekoder.mjs nokler» først.'); process.exit(1); }

async function cf(method, p, body, headers = {}) {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!data.success) {
    const msg = (data.errors || []).map(e => `${e.code}: ${e.message}`).join('; ') || `HTTP ${r.status}`;
    const err = new Error(msg); err.status = r.status; err.codes = (data.errors || []).map(e => e.code); throw err;
  }
  return data.result;
}

// 1. Kontoen
const accounts = await cf('GET', '/accounts');
if (!accounts.length) { console.log('Fant ingen konto for nøkkelen. Har den tilgang til en konto?'); process.exit(1); }
const acc = accounts[0];
console.log(`Konto funnet${accounts.length > 1 ? ` (${accounts.length} kontoer, bruker den første)` : ''}.`);

// 2. KV-lagringen
const spaces = await cf('GET', `/accounts/${acc.id}/storage/kv/namespaces?per_page=100`);
let kv = spaces.find(n => n.title === KV_TITLE);
if (!kv) { kv = await cf('POST', `/accounts/${acc.id}/storage/kv/namespaces`, { title: KV_TITLE }); console.log('Lagringen for kodene er laget.'); }
else console.log('Lagringen for kodene finnes fra før, og brukes videre.');

// 3. Serveren, med lagringen og hemmelighetene
const code = fs.readFileSync(path.join(root, 'server/skolekoder/worker.js'), 'utf8');
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify({
  main_module: 'worker.js', compatibility_date: '2026-11-01',
  bindings: [
    { type: 'kv_namespace', name: 'CODES', namespace_id: kv.id },
    { type: 'secret_text', name: 'ADMIN_SECRET', text: admin },
    { type: 'secret_text', name: 'SIGN_KEY', text: signKey }
  ]
})], { type: 'application/json' }));
form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
await cf('PUT', `/accounts/${acc.id}/workers/scripts/${SCRIPT}`, form);
console.log('Serveren er lastet opp.');
// Slettingen hver natt (25. nov. 2026): kl. 03.17 UTC, se cleanup i worker.js
await cf('PUT', `/accounts/${acc.id}/workers/scripts/${SCRIPT}/schedules`, [{ cron: '17 3 * * *' }]);
console.log('Slettingen hver natt er satt opp.');

// 4. Adressen på workers.dev: kontoen trenger et underdomene først (velges én gang)
let sub = null;
try { sub = (await cf('GET', `/accounts/${acc.id}/workers/subdomain`)).subdomain; } catch { /* ikke valgt ennå */ }
if (!sub) {
  for (const name of ['kjorerapport', `kjorerapport-${Math.random().toString(36).slice(2, 6)}`, `kjorerapport-${Math.random().toString(36).slice(2, 8)}`]) {
    try { sub = (await cf('PUT', `/accounts/${acc.id}/workers/subdomain`, { subdomain: name })).subdomain; break; } catch (e) { if (e.status !== 409 && !/taken|exists|unavailable/i.test(e.message)) throw e; }
  }
  if (!sub) { console.log('Fant ikke et ledig navn på workers.dev. Velg et i Cloudflare under Workers & Pages, og kjør på nytt.'); process.exit(1); }
  console.log('Adressen på workers.dev er valgt.');
}
await cf('POST', `/accounts/${acc.id}/workers/scripts/${SCRIPT}/subdomain`, { enabled: true, previews_enabled: false });
const url = `https://${SCRIPT}.${sub}.workers.dev`;
fs.writeFileSync(path.join(dir, 'url.txt'), url);

// 5. Vent til serveren svarer (en ny adresse kan bruke litt tid)
let ok = false;
for (let i = 0; i < 30 && !ok; i++) {
  try { const r = await fetch(url + '/'); ok = r.ok && (await r.json()).ok === true; } catch { /* ikke ennå */ }
  if (!ok) await new Promise(res => setTimeout(res, 5000));
}
console.log(ok ? `Serveren svarer på ${url}` : `Serveren er lastet opp til ${url}, men svarer ikke ennå. Prøv igjen om noen minutter.`);
// Kjør slettingen én gang med en gang, så helsesjekken (/v1/helse) har noe å vise før første natt
if (ok) {
  try {
    const r = await (await fetch(url + '/admin/rydd', { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: '{}' })).json();
    console.log(`Slettet nå: ${r.koder} koder som gikk ut for over et år siden, ${r.pluss} fra den gamle kjøpstellingen${r.igjen ? ' (resten tas i natt)' : ''}.`);
    const h = await (await fetch(url + '/v1/helse')).json();
    console.log(h.ok ? 'Helsesjekken svarer ok.' : `Helsesjekken svarer ikke ok: ${JSON.stringify({ kv: h.kv, signering: h.signering, ryddOk: h.ryddOk })}`);
  } catch (e) { console.log('Klarte ikke å kjøre slettingen nå: ' + e.message); }
}
console.log('Adressen er lagret i .local-test/skolekoder/url.txt.');
