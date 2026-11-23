/* Workeren for nettsiden (tools/nettside-worker.mjs, 1.0.8): svendsenmedia.net/kjorerapport/ og den gamle
   workers.dev-adressen. Sjekker hvilken fil som hentes, og hvilke adresser som sendes videre. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { workerSource } from '../tools/nettside-worker.mjs';

const worker = (await import('data:text/javascript;base64,' + Buffer.from(workerSource({ big: ['/vendor/stor.wasm'] })).toString('base64'))).default;
const env = { ASSETS: { fetch: async req => new Response('fil:' + new URL(req.url).pathname + new URL(req.url).search) } };
const realFetch = globalThis.fetch;
async function get(u) {
  globalThis.fetch = async req => new Response('opprinnelig:' + new URL(req.url).pathname);   // resten av svendsenmedia.net
  try {
    const r = await worker.fetch(new Request(u, { redirect: 'manual' }), env);
    return r.status >= 300 && r.status < 400 ? 'videre:' + r.headers.get('location') : await r.text();
  } finally { globalThis.fetch = realFetch; }
}

test('svendsenmedia.net/kjorerapport/: forsiden, nettversjonen under /app/ og undersidene', async () => {
  const s = 'https://svendsenmedia.net';
  assert.equal(await get(s + '/kjorerapport/'), 'fil:/forside.html');
  assert.equal(await get(s + '/kjorerapport'), 'videre:' + s + '/kjorerapport/');
  assert.equal(await get(s + '/kjorerapport/app/'), 'fil:/index.html');
  assert.equal(await get(s + '/kjorerapport/app/?kode=K7MX-29QF-H4TA'), 'fil:/index.html?kode=K7MX-29QF-H4TA');
  assert.equal(await get(s + '/kjorerapport/app'), 'videre:' + s + '/kjorerapport/app/');
  assert.equal(await get(s + '/kjorerapport/app/js/app.js'), 'fil:/js/app.js');
  assert.equal(await get(s + '/kjorerapport/app/sw.js'), 'fil:/sw.js');
  assert.equal(await get(s + '/kjorerapport/css/side.css'), 'fil:/css/side.css');
  assert.equal(await get(s + '/kjorerapport/skole/'), 'fil:/skole/index.html');
  assert.equal(await get(s + '/kjorerapport/elev/?kode=X&fra=Y'), 'fil:/elev/index.html?kode=X&fra=Y');
  assert.equal(await get(s + '/kjorerapport/personvern'), 'videre:' + s + '/kjorerapport/personvern/');
  assert.equal(await get('https://www.svendsenmedia.net/kjorerapport/hjelp/'), 'fil:/hjelp/index.html');
});

test('/kjørerapport sendes videre, og resten av svendsenmedia.net går urørt til den vanlige nettsiden', async () => {
  const s = 'https://svendsenmedia.net';
  assert.equal(await get(s + '/kj%C3%B8rerapport/'), 'videre:' + s + '/kjorerapport/');
  assert.equal(await get(s + '/kj%C3%B8rerapport/skole/?a=1'), 'videre:' + s + '/kjorerapport/skole/?a=1');
  assert.equal(await get(s + '/kjorerapportx'), 'opprinnelig:/kjorerapportx');
  assert.equal(await get(s + '/kontakt'), 'opprinnelig:/kontakt');
});

test('den gamle adressen har nettversjonen på roten som før, og under /app/', async () => {
  const w = 'https://kjorerapport.jo-9fc.workers.dev';
  assert.equal(await get(w + '/'), 'fil:/index.html');
  assert.equal(await get(w + '/?kode=ABC'), 'fil:/index.html?kode=ABC');
  assert.equal(await get(w + '/app/'), 'fil:/index.html');
  assert.equal(await get(w + '/elev/?kode=X'), 'fil:/elev/index.html?kode=X');
  assert.equal(await get(w + '/forside.html'), 'fil:/forside.html');
});

test('store filer hentes komprimert, også under /app/', async () => {
  const r = await worker.fetch(new Request('https://svendsenmedia.net/kjorerapport/app/vendor/stor.wasm'), env);
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  assert.equal(r.headers.get('content-type'), 'application/wasm');
  assert.equal(await r.text(), 'fil:/vendor/stor.wasm.gz');
});
