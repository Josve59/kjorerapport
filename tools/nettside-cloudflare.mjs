/* Publiserer nettversjonen av Kjørerapport hos Cloudflare (0.27.2), som en Worker med statiske filer:
   https://kjorerapport.<underdomene>.workers.dev. Fra 0.27.3 er dette den eneste adressen (GitHub-prosjektet kan være
   privat, og GitHub Pages trengs ikke).
   Uten Cloudflares eget verktøy (wrangler/npm finnes ikke på Macen): snakker direkte med API-et.
   1. velger filene til nettappen fra git (det som er committet, ikke arbeidsfiler eller .local-test),
   2. laster opp filene som er endret (Cloudflare husker resten),
   3. legger ut en liten Worker: filer over Cloudflares grense på 25 MB lastes opp gzip-komprimert og sendes med
      Content-Encoding: gzip (nettleseren pakker dem ut), og mapper viser index.html,
   4. slår på adressen og sjekker at siden svarer med riktig versjon.
   Tilgangsnøkkelen er den samme som for skolekodene: .local-test/skolekoder/cf-token.txt. Den skrives aldri ut.
   1.0.8: samme Worker svarer også på svendsenmedia.net/kjorerapport/ (ruter i sonen svendsenmedia.net, krever at
   nøkkelen har «Zone → Workers Routes → Edit» der). Der er /kjorerapport/ forsiden (forside.html) og
   /kjorerapport/app/ nettversjonen; /kjørerapport sender videre. Den gamle workers.dev-adressen har nettversjonen på
   roten som før (testernes turer ligger lagret per adresse), og /app/ i tillegg. Resten av svendsenmedia.net er urørt.
   Bruk: node tools/nettside-cloudflare.mjs   (kjør etter commit og push, så GitHub Pages har de samme filene) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { workerSource } from './nettside-worker.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.cloudflare.com/client/v4';
const SCRIPT = 'kjorerapport';
// --slett-test (0.28.0): fjerner testadressen kjorerapport-test fra 0.27.9. Eieren bruker bare testkoden.
const DELETE_TEST = process.argv.includes('--slett-test');
const MAX = 25 * 1024 * 1024;   // Cloudflares grense per statiske fil
// Det som hører til nettappen. Ikke: ios/, server/, tools/, tests/, appstore/, designprofil/, README, CLAUDE.md
const PARTS = ['index.html', 'sw.js', 'manifest.webmanifest', 'manifest-vei.webmanifest', 'css', 'js', 'fonts', 'icons', 'vendor', 'kamera', 'hjelp', 'personvern', 'trafikkskole', 'lisenser', 'skole', 'elev', 'forside.html', 'forside'];
const SITE = 'svendsenmedia.net', BASE = '/kjorerapport';
const SITE_URL = `https://${SITE}${BASE}`;
const MIME = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', wasm: 'application/wasm', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', pdf: 'application/pdf' };
const mimeOf = f => MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream';

const token = (() => { try { return fs.readFileSync(path.join(root, '.local-test/skolekoder/cf-token.txt'), 'utf8').trim(); } catch { return null; } })();
if (!token) { console.log('Mangler tilgangsnøkkelen i .local-test/skolekoder/cf-token.txt.'); process.exit(1); }

async function cf(method, p, body, { auth = token, json = true } = {}) {
  const headers = { Authorization: `Bearer ${auth}` };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + p, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!data.success) throw new Error(`${method} ${p.replace(/accounts\/\w+/, 'accounts/…')}: ` + ((data.errors || []).map(e => `${e.code}: ${e.message}`).join('; ') || `HTTP ${r.status}`));
  return json ? data.result : data;
}

// 1. Filene: bare det som er i git, så ingenting privat blir med ved et uhell
const files = execFileSync('git', ['ls-files', '-z', ...PARTS], { cwd: root }).toString().split('\0').filter(Boolean);
const big = [], manifest = {}, byHash = new Map();
for (const f of files) {
  let buf = fs.readFileSync(path.join(root, f)), name = f;
  if (buf.length > MAX) {   // for stor: lastes opp komprimert som «fil.gz»
    const gz = zlib.gzipSync(buf, { level: 9 });
    if (gz.length > MAX) { console.log(`${f} er for stor også komprimert (${gz.length} byte). Avbryter.`); process.exit(1); }
    big.push('/' + f); buf = gz; name = f + '.gz';
  }
  const b64 = buf.toString('base64');
  const hash = crypto.createHash('sha256').update(b64 + path.extname(f).slice(1)).digest('hex').slice(0, 32);
  manifest['/' + name] = { hash, size: buf.length };
  byHash.set(hash, { f: name, b64 });
}
console.log(`${Object.keys(manifest).length} filer${big.length ? `, ${big.length} lastes opp komprimert: ${big.join(', ')}` : ''}.`);

const [acc] = await cf('GET', '/accounts');
if (!acc) { console.log('Fant ingen konto for nøkkelen.'); process.exit(1); }
if (DELETE_TEST) {
  try { await cf('DELETE', `/accounts/${acc.id}/workers/scripts/kjorerapport-test`); console.log('Testadressen kjorerapport-test er fjernet.'); }
  catch (e) { console.log(/10007|not found/i.test(e.message) ? 'Testadressen finnes ikke (allerede fjernet).' : 'Kunne ikke fjerne testadressen: ' + e.message); }
  try { fs.unlinkSync(path.join(root, '.local-test/skolekoder/nettside-test-url.txt')); } catch { /* fantes ikke */ }
  process.exit(0);
}

// 2. Opplasting: Cloudflare sier hvilke filer den ikke har fra før
const session = await cf('POST', `/accounts/${acc.id}/workers/scripts/${SCRIPT}/assets-upload-session`, { manifest });
let done = session.jwt, sent = 0;
for (const bucket of session.buckets || []) {
  const form = new FormData();
  for (const h of bucket) { const x = byHash.get(h); form.append(h, new File([x.b64], h, { type: mimeOf(x.f) })); }
  const res = await cf('POST', `/accounts/${acc.id}/workers/assets/upload?base64=true`, form, { auth: session.jwt, json: false });
  if (res.result && res.result.jwt) done = res.result.jwt;
  sent += bucket.length;
}
console.log(sent ? `${sent} filer lastet opp.` : 'Ingen filer var endret.');

// 3. Workeren: statiske filer først; de store filene sendes komprimert, slik de ble lastet opp
const worker = workerSource({ big, base: BASE, site: SITE });
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify({
  main_module: 'worker.js', compatibility_date: '2026-11-01',
  assets: { jwt: done, config: { html_handling: 'none', not_found_handling: 'none' } },   // filene svarer på sin egen sti, uten videresending
  bindings: [{ type: 'assets', name: 'ASSETS' }]
})], { type: 'application/json' }));
form.append('worker.js', new Blob([worker], { type: 'application/javascript+module' }), 'worker.js');
await cf('PUT', `/accounts/${acc.id}/workers/scripts/${SCRIPT}`, form);
console.log('Nettversjonen er lagt ut.');

// 4. Adressen
const sub = (await cf('GET', `/accounts/${acc.id}/workers/subdomain`)).subdomain;
await cf('POST', `/accounts/${acc.id}/workers/scripts/${SCRIPT}/subdomain`, { enabled: true, previews_enabled: false });
const url = `https://${SCRIPT}.${sub}.workers.dev`;
const want = (fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/Kjørerapport versjon ([\d.]+)/) || [])[1];
let ok = false;
for (let i = 0; i < 24 && !ok; i++) {
  try { const r = await fetch(url + '/index.html', { cache: 'no-store' }); ok = r.ok && (await r.text()).includes(`versjon ${want}`); } catch { /* ikke ennå */ }
  if (!ok) await new Promise(res => setTimeout(res, 5000));
}
console.log(ok ? `Nettversjonen ${want} svarer på ${url}` : `Lagt ut på ${url}, men svarer ikke med versjon ${want} ennå. Prøv igjen om noen minutter.`);

// 5. svendsenmedia.net/kjorerapport (1.0.8): rutene i sonen, så sjekk at forsiden og nettversjonen svarer der
const ROUTES = [`${SITE}${BASE}*`, `www.${SITE}${BASE}*`, `${SITE}/kj%C3%B8rerapport*`, `www.${SITE}/kj%C3%B8rerapport*`];
let siteOk = false;
try {
  const [zone] = await cf('GET', `/zones?name=${SITE}`);
  if (!zone) throw new Error(`fant ikke sonen ${SITE}`);
  const have = new Set((await cf('GET', `/zones/${zone.id}/workers/routes`)).filter(r => r.script === SCRIPT).map(r => r.pattern));
  for (const pattern of ROUTES) {
    if (have.has(pattern)) continue;
    try { await cf('POST', `/zones/${zone.id}/workers/routes`, { pattern, script: SCRIPT }); console.log(`Ny rute: ${pattern}`); }
    catch (e) { console.log(`Kunne ikke lage ruten ${pattern}: ${e.message}`); }
  }
  for (let i = 0; i < 12 && !siteOk; i++) {
    try {
      const [a, f] = await Promise.all([fetch(`${SITE_URL}/app/index.html`, { cache: 'no-store' }), fetch(`${SITE_URL}/`, { cache: 'no-store' })]);
      siteOk = a.ok && (await a.text()).includes(`versjon ${want}`) && f.ok && (await f.text()).includes('Øv til lappen');
    } catch { /* ikke ennå */ }
    if (!siteOk) await new Promise(res => setTimeout(res, 5000));
  }
  console.log(siteOk ? `Forsiden svarer på ${SITE_URL}/ og nettversjonen på ${SITE_URL}/app/` : `Rutene er lagt inn, men ${SITE_URL}/ svarer ikke riktig ennå.`);
} catch (e) {
  console.log(/10000|Authentication|No access|permission/i.test(e.message)
    ? `Nøkkelen har ikke lov til å legge Kjørerapport på ${SITE} ennå. I Cloudflare: My Profile → API Tokens → «Kjorerapport skolekoder» → Edit → legg til Zone → Workers Routes → Edit for ${SITE}.`
    : `${SITE}: ${e.message}`);
}
// Lenkene verktøyene skriver ut (skolesider, testlenker), går til svendsenmedia.net når den svarer
fs.writeFileSync(path.join(root, '.local-test/skolekoder/nettside-url.txt'), siteOk ? SITE_URL : url);
