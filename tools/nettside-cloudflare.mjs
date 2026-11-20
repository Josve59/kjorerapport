/* Publiserer nettversjonen av Kjørerapport hos Cloudflare (0.27.2), som en Worker med statiske filer:
   https://kjorerapport.<underdomene>.workers.dev. GitHub Pages fortsetter som før; dette er en ekstra adresse.
   Uten Cloudflares eget verktøy (wrangler/npm finnes ikke på Macen): snakker direkte med API-et.
   1. velger filene til nettappen fra git (det som er committet, ikke arbeidsfiler eller .local-test),
   2. laster opp filene som er endret (Cloudflare husker resten),
   3. legger ut en liten Worker som henter filer over Cloudflares grense på 25 MB fra GitHub Pages,
   4. slår på adressen og sjekker at siden svarer med riktig versjon.
   Tilgangsnøkkelen er den samme som for skolekodene: .local-test/skolekoder/cf-token.txt. Den skrives aldri ut.
   Bruk: node tools/nettside-cloudflare.mjs   (kjør etter commit og push, så GitHub Pages har de samme filene) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.cloudflare.com/client/v4';
const SCRIPT = 'kjorerapport';
const GITHUB = 'https://josve59.github.io/kjorerapport';
const MAX = 25 * 1024 * 1024;   // Cloudflares grense per statiske fil
// Det som hører til nettappen. Ikke: ios/, server/, tools/, tests/, appstore/, designprofil/, README, CLAUDE.md
const PARTS = ['index.html', 'sw.js', 'manifest.webmanifest', 'manifest-vei.webmanifest', 'css', 'js', 'fonts', 'icons', 'vendor', 'kamera', 'hjelp', 'personvern', 'trafikkskole', 'lisenser'];
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
  const buf = fs.readFileSync(path.join(root, f));
  if (buf.length > MAX) { big.push('/' + f); continue; }
  const b64 = buf.toString('base64');
  const hash = crypto.createHash('sha256').update(b64 + path.extname(f).slice(1)).digest('hex').slice(0, 32);
  manifest['/' + f] = { hash, size: buf.length };
  byHash.set(hash, { f, b64 });
}
console.log(`${Object.keys(manifest).length} filer${big.length ? `, ${big.length} for store for Cloudflare (hentes fra GitHub Pages): ${big.join(', ')}` : ''}.`);

const [acc] = await cf('GET', '/accounts');
if (!acc) { console.log('Fant ingen konto for nøkkelen.'); process.exit(1); }

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

// 3. Workeren: statiske filer først; det som mangler (de store filene) hentes fra GitHub Pages
const worker = `const BIG = new Set(${JSON.stringify(big)});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (BIG.has(url.pathname)) {
      const r = await fetch(${JSON.stringify(GITHUB)} + url.pathname, { cf: { cacheEverything: true, cacheTtl: 86400 } });
      const h = new Headers(r.headers);
      if (url.pathname.endsWith('.wasm')) h.set('content-type', 'application/wasm');
      h.delete('set-cookie');
      return new Response(r.body, { status: r.status, headers: h });
    }
    // Mapper: «/» og «/hjelp/» viser index.html. Cloudflare får ikke gjøre dette selv: da sender den «/index.html»
    // videre til «/», og service workeren kan ikke bruke en videresendt side når appen åpnes uten nett.
    if (url.pathname.endsWith('/')) return env.ASSETS.fetch(new Request(new URL(url.pathname + 'index.html' + url.search, url), request));
    if (!/\\.[a-z0-9]+$/i.test(url.pathname)) return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
    return env.ASSETS.fetch(request);
  }
};
`;
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
fs.writeFileSync(path.join(root, '.local-test/skolekoder/nettside-url.txt'), url);
