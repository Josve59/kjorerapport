/* Skolekoder (0.27.0): serveren (server/skolekoder/worker.js) og kontrollen i appen (js/skolekode.js) sammen */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { normalizeCode, formatCode, signPass } from '../server/skolekoder/worker.js';
import { verifyPass, looksLikeCode, normalizeCode as appNormalize, PUBLIC_KEY, codeFromUrl } from '../js/skolekode.js';
import { setSchoolPass, hasPlus, hasTheory, schoolPass } from '../js/plus.js';

const memKV = () => { const m = new Map(); return {
  async get(k) { return m.has(k) ? m.get(k).value : null; },
  async put(k, value, o = {}) { m.set(k, { value, metadata: o.metadata || null }); },
  async list({ prefix = '' } = {}) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: m.get(name).metadata })), list_complete: true }; },
  async getWithMetadata(k) { return m.has(k) ? { value: m.get(k).value, metadata: m.get(k).metadata } : { value: null, metadata: null }; },
  async delete(k) { m.delete(k); }
}; };
async function setup() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { env: { CODES: memKV(), ADMIN_SECRET: 'hemmelig-test', SIGN_KEY: JSON.stringify(priv) }, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } };
}
const call = (env, method, path, body, { admin = false, now } = {}) => worker.fetch(new Request('https://koder.test' + path, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer ' + env.ADMIN_SECRET } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, {}, now);
const T0 = Date.UTC(2027, 0, 10);

test('kodene: lette å skrive av, og like i appen og på serveren', () => {
  assert.equal(normalizeCode(' k7mx-29qf h4ta '), 'K7MX29QFH4TA');
  assert.equal(appNormalize('k7mx-29qf-h4ta'), 'K7MX29QFH4TA');
  assert.equal(formatCode('K7MX29QFH4TA'), 'K7MX-29QF-H4TA');
  assert.ok(looksLikeCode('k7mx 29qf h4ta'));
  assert.ok(!looksLikeCode('K7MX-29QF-H4T0'), '0 finnes ikke i kodene');
  assert.ok(!looksLikeCode('K7MX-29QF'));
});

test('skolen får koder, eleven tar en i bruk, og appen godtar beviset uten nett', async () => {
  const { env, pub } = await setup();
  assert.equal((await call(env, 'POST', '/admin/koder', { skole: 'Test Trafikkskole', antall: 3 })).status, 401, 'uten admin-hemmelighet');
  const made = await (await call(env, 'POST', '/admin/koder', { skole: 'Test Trafikkskole', antall: 3, maaneder: 12 }, { admin: true })).json();
  assert.equal(made.koder.length, 3);
  assert.equal(new Set(made.koder).size, 3);
  assert.ok(made.koder.every(looksLikeCode));
  const code = made.koder[0];
  const r = await (await call(env, 'POST', '/v1/aktiver', { kode: code.toLowerCase(), install: 'telefon-aaaa-1111' }, { now: T0 })).json();
  assert.equal(r.skole, 'Test Trafikkskole');
  assert.ok(Math.abs(r.til - (T0 + 365 * 86400000)) < 2 * 86400000, 'tolv måneder fra første bruk');
  const p = await verifyPass(r.bevis, { install: 'telefon-aaaa-1111', now: T0 + 1000, key: pub });
  assert.equal(p.s, 'Test Trafikkskole');
  assert.equal(await verifyPass(r.bevis, { install: 'en-annen-telefon', now: T0, key: pub }), null, 'beviset gjelder bare denne installasjonen');
  assert.equal(await verifyPass(r.bevis, { install: 'telefon-aaaa-1111', now: r.til + 1, key: pub }), null, 'utløpt');
  assert.equal(await verifyPass(r.bevis, { install: 'telefon-aaaa-1111', now: T0, key: PUBLIC_KEY }), null, 'feil nøkkel');
  const tampered = r.bevis.replace(/^[^.]+/, b => Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(b, 'base64url')), exp: 9e15 })).toString('base64url'));
  assert.equal(await verifyPass(tampered, { install: 'telefon-aaaa-1111', now: T0, key: pub }), null, 'endret bevis');
});

test('to telefoner per kode, så «brukt»; stengt, nullstilt og ukjent', async () => {
  const { env, pub } = await setup();
  const [code] = (await (await call(env, 'POST', '/admin/koder', { skole: 'Skole B', antall: 1 }, { admin: true })).json()).koder;
  const act = (install, now = T0) => call(env, 'POST', '/v1/aktiver', { kode: code, install }, { now });
  assert.equal((await act('telefon-1-abcdef')).status, 200);
  assert.equal((await act('telefon-1-abcdef', T0 + 86400000)).status, 200, 'samme telefon igjen');
  assert.equal((await act('telefon-2-abcdef')).status, 200, 'ny telefon');
  const third = await act('telefon-3-abcdef');
  assert.equal(third.status, 409);
  assert.equal((await third.json()).error, 'brukt');
  // Lista til eieren
  const list = await (await call(env, 'GET', '/admin/koder?skole=' + encodeURIComponent('Skole B'), null, { admin: true })).json();
  assert.deepEqual(list.koder.map(k => [k.kode, k.brukt, k.stengt]), [[code, 2, false]]);
  // Nullstill: eleven har ny telefon
  assert.equal((await call(env, 'POST', '/admin/nullstill', { kode: code }, { admin: true })).status, 200);
  assert.equal((await act('telefon-3-abcdef')).status, 200);
  // Stengt: virker ikke lenger
  await call(env, 'POST', '/admin/steng', { kode: code }, { admin: true });
  const closed = await act('telefon-1-abcdef');
  assert.equal(closed.status, 410);
  assert.equal((await closed.json()).error, 'stengt');
  assert.equal((await call(env, 'POST', '/v1/aktiver', { kode: '2345-6789-ABCD', install: 'telefon-1-abcdef' })).status, 404);
  // Utløpt: tolv måneder etter første bruk
  const [c2] = (await (await call(env, 'POST', '/admin/koder', { skole: 'Skole B', antall: 1, maaneder: 1 }, { admin: true })).json()).koder;
  await call(env, 'POST', '/v1/aktiver', { kode: c2, install: 'telefon-9-abcdef' }, { now: T0 });
  assert.equal((await call(env, 'POST', '/v1/aktiver', { kode: c2, install: 'telefon-9-abcdef' }, { now: T0 + 40 * 86400000 })).status, 410);
  // Serveren svarer nettappen (CORS)
  const opt = await worker.fetch(new Request('https://koder.test/v1/aktiver', { method: 'OPTIONS' }), env, {});
  assert.equal(opt.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(pub);
});

test('en gyldig skolekode gir Pluss og teorien, også i nettversjonen', () => {
  assert.equal(hasTheory(), false, 'nettversjonen uten kode: teorien er låst');
  setSchoolPass({ skole: 'Skole A', exp: Date.now() + 86400000 });
  assert.equal(hasTheory(), true);
  assert.equal(hasPlus(), true);
  assert.equal(schoolPass().skole, 'Skole A');
  setSchoolPass({ skole: 'Skole A', exp: Date.now() - 1 });
  assert.equal(hasTheory(), false, 'utløpt');
  assert.equal(schoolPass(), null);
  setSchoolPass(null);
});

test('serveren signerer slik appen venter', async () => {
  const { env, pub } = await setup();
  const t = await signPass(env, { v: 1, s: 'X', i: 'inst-12345678', exp: T0 + 1000 });
  assert.equal((await verifyPass(t, { install: 'inst-12345678', now: T0, key: pub })).s, 'X');
});

test('testlenke: koden leses fra «?kode=», med eller uten bindestreker (0.27.4)', () => {
  assert.equal(codeFromUrl('https://x.dev/?kode=K7MX-29QF-H4TA'), 'K7MX29QFH4TA');
  assert.equal(codeFromUrl('https://x.dev/?kamera=vei&kode=k7mx29qfh4ta#/opplaering'), 'K7MX29QFH4TA');
  assert.equal(codeFromUrl('https://x.dev/?kode=ikke-en-kode'), null);
  assert.equal(codeFromUrl('https://x.dev/'), null);
  assert.equal(codeFromUrl('ikke en adresse'), null);
});

test('en felles testkode kan gjelde flere enn 5 telefoner, men høyst 50 (0.27.4)', async () => {
  const { env } = await setup();
  const many = await (await call(env, 'POST', '/admin/koder', { skole: 'Testgruppe', antall: 1, maaneder: 3, maks: 25 }, { admin: true })).json();
  assert.equal(many.maks, 25);
  const capped = await (await call(env, 'POST', '/admin/koder', { skole: 'Testgruppe', antall: 1, maaneder: 3, maks: 500 }, { admin: true })).json();
  assert.equal(capped.maks, 50);
  for (let i = 0; i < 6; i++) assert.equal((await call(env, 'POST', '/v1/aktiver', { kode: many.koder[0], install: 'telefon-' + i }, { now: T0 })).status, 200);
  const normal = await (await call(env, 'POST', '/admin/koder', { skole: 'Skole', antall: 1 }, { admin: true })).json();
  assert.equal(normal.maks, 2, 'elevkoder er fortsatt 2 telefoner');
});

test('en kode som ble stengt ved en feil, kan åpnes igjen (0.27.4)', async () => {
  const { env } = await setup();
  const [code] = (await (await call(env, 'POST', '/admin/koder', { skole: 'Testgruppe', antall: 1, maaneder: 3, maks: 25 }, { admin: true })).json()).koder;
  assert.equal((await call(env, 'POST', '/admin/steng', { kode: code }, { admin: true })).status, 200);
  assert.equal((await call(env, 'POST', '/v1/aktiver', { kode: code, install: 'telefon-1' }, { now: T0 })).status, 410);
  assert.equal((await call(env, 'POST', '/admin/apne', { kode: code })).status, 401, 'bare med admin-hemmeligheten');
  assert.equal((await call(env, 'POST', '/admin/apne', { kode: code }, { admin: true })).status, 200);
  assert.equal((await call(env, 'POST', '/v1/aktiver', { kode: code, install: 'telefon-1' }, { now: T0 })).status, 200);
});

test('testere kan sende turer; andre kan ikke (0.27.5)', async () => {
  const { env, pub } = await setup();
  const mk = async tester => (await (await call(env, 'POST', '/admin/koder', { skole: tester ? 'Testgruppe' : 'Skole', antall: 1, maaneder: 3, maks: 5, tester }, { admin: true })).json()).koder[0];
  const testCode = await mk(true), pupilCode = await mk(false);
  const act = async (kode, install) => (await call(env, 'POST', '/v1/aktiver', { kode, install }, { now: T0 })).json();
  const tp = await verifyPass((await act(testCode, 'telefon-test-1')).bevis, { install: 'telefon-test-1', now: T0, key: pub });
  const pp = await verifyPass((await act(pupilCode, 'telefon-elev-1')).bevis, { install: 'telefon-elev-1', now: T0, key: pub });
  assert.equal(tp.t, 1, 'testkoden står i beviset');
  assert.equal(pp.t, 0);
  const send = (kode, install, body, tur = 'tur-1') => worker.fetch(new Request('https://koder.test/v1/tur', { method: 'POST', body, headers: { 'X-Kode': kode, 'X-Install': install, 'X-Tur': tur, 'X-Start': '2027-01-10T12:00', 'X-Versjon': '0.27.5', 'X-Gzip': '0' } }), env, {}, T0 + 1000);
  const trip = new TextEncoder().encode(JSON.stringify({ app: 'Kjørerapport', drive: { id: 'tur-1' } }));
  assert.equal((await send(pupilCode, 'telefon-elev-1', trip)).status, 403, 'vanlig elevkode kan ikke sende');
  assert.equal((await send(testCode, 'en-annen-telefon', trip)).status, 404, 'bare telefoner som har brukt koden');
  assert.equal((await send(testCode, 'telefon-test-1', new Uint8Array(0))).status, 400);
  assert.equal((await send(testCode, 'telefon-test-1', new Uint8Array(20 * 1024 * 1024 + 1))).status, 413, 'for stor');
  assert.equal((await send(testCode, 'telefon-test-1', trip)).status, 200);
  assert.equal((await send(testCode, 'telefon-test-1', trip)).status, 200, 'samme tur igjen erstatter den første');
  const list = await (await call(env, 'GET', '/admin/turer', null, { admin: true })).json();
  assert.equal(list.turer.length, 1);
  assert.equal(list.turer[0].tur, 'tur-1');
  assert.equal(list.turer[0].versjon, '0.27.5');
  assert.equal((await call(env, 'GET', '/admin/turer', null)).status, 401, 'listen krever admin');
  const got = await call(env, 'GET', '/admin/tur?nokkel=' + encodeURIComponent(list.turer[0].nokkel), null, { admin: true });
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), trip, 'turen kommer tilbake slik den ble sendt');
  await call(env, 'POST', '/admin/steng', { kode: testCode }, { admin: true });
  assert.equal((await send(testCode, 'telefon-test-1', trip, 'tur-2')).status, 410, 'stengt kode kan ikke sende');
  const del = await (await call(env, 'POST', '/admin/slett-tur', { alle: true }, { admin: true })).json();
  assert.equal(del.slettet, 1);
  assert.equal((await (await call(env, 'GET', '/admin/turer', null, { admin: true })).json()).turer.length, 0);
});

test('appen husker om skolebeviset er en testkode (0.27.5)', () => {
  setSchoolPass({ skole: 'Testgruppe', exp: Date.now() + 86400000, tester: true });
  assert.equal(schoolPass().tester, true);
  setSchoolPass({ skole: 'Skole', exp: Date.now() + 86400000 });
  assert.equal(schoolPass().tester, false);
  setSchoolPass(null);
});

test('testversjonen sender turer uten kode, men bare fra testadressen (0.27.9)', async () => {
  const { env } = await setup();
  const send = origin => worker.fetch(new Request('https://koder.test/v1/tur', { method: 'POST', body: new TextEncoder().encode('{"app":"Kjørerapport"}'), headers: { 'X-Testbygg': '1', 'X-Install': 'telefon-testbygg-1', 'X-Tur': 'tur-9', 'Origin': origin } }), env, {}, T0);
  assert.equal((await send('https://kjorerapport-test.jo-9fc.workers.dev')).status, 200);
  assert.equal((await send('https://kjorerapport.jo-9fc.workers.dev')).status, 404, 'vanlig adresse må ha testkode');
  assert.equal((await send('https://noe-annet.example')).status, 404);
  const list = await (await call(env, 'GET', '/admin/turer', null, { admin: true })).json();
  assert.equal(list.turer.length, 1);
  assert.equal(list.turer[0].kode, 'TEST');
});
