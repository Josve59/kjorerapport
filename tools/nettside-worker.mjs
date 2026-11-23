/* Workeren for nettsiden (tools/nettside-cloudflare.mjs), som tekst, så den kan testes (tests/nettside.test.mjs).
   big: filer som er lastet opp gzip-komprimert. base og site (1.0.8): svendsenmedia.net/kjorerapport/ er forsiden og
   /kjorerapport/app/ nettversjonen; den gamle workers.dev-adressen har nettversjonen på roten og under /app/. */
export function workerSource({ big = [], base = '/kjorerapport', site = 'svendsenmedia.net' } = {}) {
  return `const BIG = new Set(${JSON.stringify(big)});
const TYPE = { wasm: 'application/wasm', onnx: 'application/octet-stream', js: 'text/javascript; charset=utf-8' };
const BASE = ${JSON.stringify(base)};
const asset = (env, request, p, url) => env.ASSETS.fetch(new Request(new URL(p + url.search, url), request));
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let p = url.pathname;
    // svendsenmedia.net/kjorerapport/ (1.0.8): forsiden på roten, nettversjonen under /app/. «ø» i lenker blir
    // %C3%B8, så /kjørerapport sendes videre til /kjorerapport.
    if (url.hostname.endsWith(${JSON.stringify(site)})) {
      const oe = /^\\/kj(%C3%B8|ø)rerapport/i;
      if (oe.test(p)) return Response.redirect(url.origin + p.replace(oe, BASE) + url.search, 301);
      if (p === BASE) return Response.redirect(url.origin + BASE + '/' + url.search, 301);
      if (!p.startsWith(BASE + '/')) return fetch(request);   // resten av svendsenmedia.net
      p = p.slice(BASE.length);
      if (p === '/') return asset(env, request, '/forside.html', url);
    }
    // Nettversjonen under /app/ (på begge adressene)
    if (p === '/app') return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
    if (p.startsWith('/app/')) p = p.slice(4);
    if (BIG.has(p)) {
      const r = await env.ASSETS.fetch(new Request(new URL(p + '.gz', url), { method: 'GET' }));
      if (!r.ok) return r;
      const ext = p.split('.').pop();
      return new Response(r.body, { status: 200, encodeBody: 'manual', headers: { 'content-type': TYPE[ext] || 'application/octet-stream', 'content-encoding': 'gzip', 'cache-control': 'public, max-age=3600', 'vary': 'accept-encoding' } });
    }
    // Mapper: «/» og «/hjelp/» viser index.html. Cloudflare får ikke gjøre dette selv: da sender den «/index.html»
    // videre til «/», og service workeren kan ikke bruke en videresendt side når appen åpnes uten nett.
    if (p.endsWith('/')) return asset(env, request, p + 'index.html', url);
    if (!/\\.[a-z0-9]+$/i.test(p)) return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
    return asset(env, request, p, url);
  }
};
`;
}
