/* Skolekoder (0.27.0): serveren (server/skolekoder/worker.js) og kontrollen i appen (js/skolekode.js) sammen */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { normalizeCode, formatCode, signPass, schoolId } from '../server/skolekoder/worker.js';
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

test('turer uten kode avvises, også med testbygg-hodet fra 0.27.9 (0.28.0)', async () => {
  const { env } = await setup();
  const r = await worker.fetch(new Request('https://koder.test/v1/tur', { method: 'POST', body: new TextEncoder().encode('{}'), headers: { 'X-Testbygg': '1', 'X-Install': 'telefon-testbygg-1', 'Origin': 'https://kjorerapport-test.jo-9fc.workers.dev' } }), env, {}, T0);
  assert.equal(r.status, 404);
});

/* Telling av Pluss-kjøp (1.0.7): Pluss er per person, og serveren teller telefoner per kjøp uten å stenge noe */
const KJOP = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const DAY = 86400000;
test('kjøpstellingen er av (1.0.16): serveren lagrer ingenting og svarer 410', async () => {
  const { env } = await setup();
  const r = await call(env, 'POST', '/v1/pluss', { kjop: KJOP, install: 'telefon-aaaa-1111' }, { now: T0 });
  assert.equal(r.status, 410);
  assert.equal((await env.CODES.list({ prefix: 'pluss:' })).keys.length, 0);
});

test('serveren teller telefoner per Pluss-kjøp, og skriver høyst én gang i uka per telefon (bare med PLUSS_TELLING)', async () => {
  const { env } = await setup();
  env.PLUSS_TELLING = '1';
  const plus = (kjop, install, now) => call(env, 'POST', '/v1/pluss', { kjop, install }, { now });
  assert.equal((await plus('ikke-et-nummer', 'telefon-aaaa-1111', T0)).status, 400);
  assert.equal((await plus(KJOP, 'kort', T0)).status, 400);
  assert.equal((await plus(KJOP, 'telefon-aaaa-1111', T0)).status, 200);
  let writes = 0; const put = env.CODES.put; env.CODES.put = (...a) => { writes++; return put(...a); };
  await plus(KJOP, 'telefon-aaaa-1111', T0 + DAY);
  assert.equal(writes, 0, 'samme telefon dagen etter skrives ikke');
  await plus(KJOP, 'telefon-aaaa-1111', T0 + 7 * DAY);
  assert.equal(writes, 1, 'etter en uke skrives den');
  await plus(KJOP, 'telefon-bbbb-2222', T0 + 7 * DAY);
  assert.equal((await call(env, 'GET', '/admin/pluss', null, { now: T0 + 7 * DAY })).status, 401, 'tallene krever admin');
  let sum = await (await call(env, 'GET', '/admin/pluss', null, { admin: true, now: T0 + 7 * DAY })).json();
  assert.equal(sum.kjop, 1);
  assert.equal(sum.naa[2], 1, 'to telefoner i bruk nå');
  // Den første telefonen slutter å melde seg (byttet telefon): etter 14 dager er bare den nye i bruk
  await plus(KJOP, 'telefon-bbbb-2222', T0 + 21 * DAY);
  sum = await (await call(env, 'GET', '/admin/pluss', null, { admin: true, now: T0 + 22 * DAY })).json();
  assert.equal(sum.naa[1], 1, 'bare den nye telefonen er i bruk');
  assert.equal(sum.maks[2], 1, 'men det var to på én gang');
  // Deling: fire telefoner melder seg samme uke
  for (const t of ['telefon-cccc-3333', 'telefon-dddd-4444', 'telefon-eeee-5555']) await plus(KJOP, t, T0 + 22 * DAY);
  sum = await (await call(env, 'GET', '/admin/pluss', null, { admin: true, now: T0 + 22 * DAY })).json();
  assert.equal(sum.naa['4+'], 1);
  assert.equal(sum.liste[0].kjop, KJOP.slice(0, 6), 'bare starten av nummeret vises');
  assert.equal(sum.liste[0].telefoner, 5);
});

/* Skolesiden (1.0.8): skolen deler ut tilganger fra en pakke, uten konto og uten elevnavn */
const asSchool = (env, token, method, path, body, now = T0) => worker.fetch(new Request('https://koder.test' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined }), env, {}, now);
test('skolens id lages av navnet', () => {
  assert.equal(schoolId('Trafikkskolen Øst AS'), 'trafikkskolen-ost-as');
  assert.equal(schoolId('  Bærum Kjøreskole & Co '), 'baerum-kjoreskole-co');
});

test('skolesiden (1.2.0): skolen lager koder uten pakke, eleven tar en i bruk, og en ubrukt kode kan trekkes tilbake', async () => {
  const { env, pub } = await setup();
  assert.equal((await call(env, 'POST', '/admin/skole', { navn: 'Test Trafikkskole' })).status, 401, 'bare eieren lager skoler');
  const made = await (await call(env, 'POST', '/admin/skole', { navn: 'Test Trafikkskole' }, { admin: true, now: T0 })).json();
  assert.equal(made.id, 'test-trafikkskole');
  assert.deepEqual([made.pris, made.grense, made.maaneder, made.maks], [450, 200, 36, 2]);
  assert.ok(made.token.length >= 40);
  assert.equal((await call(env, 'POST', '/admin/skole', { navn: 'Test trafikkskole' }, { admin: true })).status, 409, 'samme navn to ganger');
  assert.equal((await asSchool(env, 'feil-' + made.token, 'GET', '/v1/skole')).status, 401);
  assert.equal((await asSchool(env, env.ADMIN_SECRET, 'GET', '/v1/skole')).status, 401, 'admin-hemmeligheten er ingen skolenøkkel');
  assert.ok(!JSON.stringify(await env.CODES.get('skole:test-trafikkskole')).includes(made.token), 'nøkkelen lagres ikke i klartekst');

  let o = await (await asSchool(env, made.token, 'GET', '/v1/skole')).json();
  assert.deepEqual([o.navn, o.pris, o.iBruk, o.ubrukt, o.ferdig, o.koder.length], ['Test Trafikkskole', 450, 0, 0, 0, 0]);
  const a = await (await asSchool(env, made.token, 'POST', '/v1/skole/ny', null, T0 + 1000)).json();
  assert.ok(looksLikeCode(a.kode));
  assert.equal(a.igjen, 199, 'grensen per måned teller ned');
  const b = await (await asSchool(env, made.token, 'POST', '/v1/skole/ny', null, T0 + 2000)).json();
  o = await (await asSchool(env, made.token, 'GET', '/v1/skole', null, T0 + 3000)).json();
  assert.deepEqual([o.iBruk, o.ubrukt, o.nye, o.koder.length], [0, 2, 2, 2]);
  assert.equal(o.koder[0].kode, b.kode, 'nyeste først');

  // Eleven tar koden i bruk i appen: beviset gjelder til lappen, men bare 60 dager om gangen
  const act = await (await call(env, 'POST', '/v1/aktiver', { kode: a.kode, install: 'elev-telefon-1' }, { now: T0 + DAY })).json();
  assert.equal(act.varig, true);
  const p = await verifyPass(act.bevis, { install: 'elev-telefon-1', now: T0 + DAY, key: pub });
  assert.deepEqual([p.s, p.l, p.r], ['Test Trafikkskole', 1, undefined]);
  assert.ok(Math.abs(p.e - (T0 + DAY + 36 * 30.44 * DAY)) < 1000, 'senest 36 måneder fra første bruk');
  assert.equal(p.exp, T0 + DAY + 60 * DAY, 'beviset gjelder 60 dager og fornyes når appen spør');
  o = await (await asSchool(env, made.token, 'GET', '/v1/skole', null, T0 + DAY)).json();
  assert.deepEqual([o.iBruk, o.ubrukt, o.denneMnd, o.mnd], [1, 1, 1, '2027-01']);
  const ra = o.koder.find(k => k.kode === a.kode);
  assert.deepEqual([ra.telefoner, ra.varig], [1, true]);

  // Den andre eleven tok aldri koden i bruk: skolen trekker den tilbake
  const back = await (await asSchool(env, made.token, 'POST', '/v1/skole/steng', { kode: b.kode })).json();
  assert.equal(back.tilbake, true);
  assert.equal((await call(env, 'POST', '/v1/aktiver', { kode: b.kode, install: 'elev-telefon-2' })).status, 410, 'en trukket kode virker ikke');
  assert.equal((await asSchool(env, made.token, 'POST', '/v1/skole/apne', { kode: b.kode })).status, 409, 'trukket kan ikke åpnes igjen');
  assert.equal((await asSchool(env, made.token, 'POST', '/v1/skole/fullfor', { kode: b.kode })).status, 409, 'en kode som aldri ble brukt, kan ikke få lappen');
  o = await (await asSchool(env, made.token, 'GET', '/v1/skole', null, T0 + DAY)).json();
  assert.deepEqual([o.iBruk, o.ubrukt], [1, 0]);

  // Ny telefon, steng og åpne igjen på en kode i bruk
  await call(env, 'POST', '/v1/aktiver', { kode: a.kode, install: 'elev-telefon-1b' }, { now: T0 + DAY });
  assert.equal((await call(env, 'POST', '/v1/aktiver', { kode: a.kode, install: 'elev-telefon-1c' }, { now: T0 + DAY })).status, 409, 'to telefoner er brukt');
  assert.equal((await asSchool(env, made.token, 'POST', '/v1/skole/ny-telefon', { kode: a.kode })).status, 200);
  assert.equal((await call(env, 'POST', '/v1/aktiver', { kode: a.kode, install: 'elev-telefon-1c' }, { now: T0 + DAY })).status, 200, 'ny telefon virker');
  const closed = await (await asSchool(env, made.token, 'POST', '/v1/skole/steng', { kode: a.kode })).json();
  assert.equal(closed.tilbake, false);
  o = await (await asSchool(env, made.token, 'GET', '/v1/skole', null, T0 + DAY)).json();
  assert.deepEqual([o.iBruk, o.brukt, o.denneMnd], [0, 1, 1], 'en stengt kode er tatt i bruk, og faktureres');
  assert.equal((await asSchool(env, made.token, 'POST', '/v1/skole/apne', { kode: a.kode })).status, 200);

  // En annen skole kan ikke røre koden
  const other = await (await call(env, 'POST', '/admin/skole', { navn: 'Annen Skole' }, { admin: true })).json();
  assert.equal((await asSchool(env, other.token, 'POST', '/v1/skole/steng', { kode: a.kode })).status, 404);
  assert.equal((await asSchool(env, other.token, 'POST', '/v1/skole/fullfor', { kode: a.kode })).status, 404);
  assert.equal((await (await asSchool(env, other.token, 'GET', '/v1/skole')).json()).koder.length, 0);

  // Eierens oversikt og ny lenke
  const all = await (await call(env, 'GET', '/admin/skoler', null, { admin: true, now: T0 + DAY })).json();
  const mine = all.skoler.find(x => x.id === 'test-trafikkskole');
  assert.deepEqual([mine.iBruk, mine.ubrukt, mine.denneMnd, mine.pris], [1, 0, 1, 450]);
  const nl = await (await call(env, 'POST', '/admin/skole/ny-lenke', { id: 'test-trafikkskole' }, { admin: true })).json();
  assert.equal((await asSchool(env, made.token, 'GET', '/v1/skole')).status, 401, 'den gamle lenken virker ikke lenger');
  assert.equal((await asSchool(env, nl.token, 'GET', '/v1/skole')).status, 200);
  const codes = await (await call(env, 'GET', '/admin/koder?skole=' + encodeURIComponent('Test Trafikkskole'), null, { admin: true })).json();
  assert.equal(codes.koder.length, 2);
});

test('skolesiden ser nye koder med en gang, selv om listen hos Cloudflare ligger etter, og grensen per måned holder', async () => {
  const { env } = await setup();
  const made = await (await call(env, 'POST', '/admin/skole', { navn: 'Treg Liste', grense: 3 }, { admin: true })).json();
  const list = env.CODES.list;
  env.CODES.list = async o => (o.prefix === 'kode:' ? { keys: [], list_complete: true } : list(o));   // listen har ikke fått med seg noe ennå
  await asSchool(env, made.token, 'POST', '/v1/skole/ny', null, T0);
  await asSchool(env, made.token, 'POST', '/v1/skole/ny', null, T0 + 1000);
  const o = await (await asSchool(env, made.token, 'GET', '/v1/skole', null, T0 + 2000)).json();
  assert.deepEqual([o.ubrukt, o.nye, o.koder.length], [2, 2, 2]);
  await asSchool(env, made.token, 'POST', '/v1/skole/ny', null, T0 + 3000);
  const full = await asSchool(env, made.token, 'POST', '/v1/skole/ny', null, T0 + 4000);
  assert.equal(full.status, 429, 'grensen kan ikke overskrides mens listen henger etter');
  assert.equal((await full.json()).error, 'grense');
  env.CODES.list = list;
  assert.equal((await asSchool(env, made.token, 'POST', '/v1/skole/ny', null, Date.UTC(2027, 1, 1, 12))).status, 200, 'ny måned, nye koder');
  await call(env, 'POST', '/admin/skole/endre', { navn: 'Treg Liste', grense: 10, pris: 400 }, { admin: true });
  const o2 = await (await asSchool(env, made.token, 'GET', '/v1/skole', null, T0 + 5000)).json();
  assert.deepEqual([o2.grense, o2.pris], [10, 400]);
});

/* Drift (25. nov. 2026): sletting ett år etter at koden gikk ut, og helsesjekk */
const YEAR = 365 * DAY;
test('sletting: en brukt kode slettes ett år etter at tilgangen gikk ut, og skolens telling står', async () => {
  const { env } = await setup();
  const { token } = await (await call(env, 'POST', '/admin/skole', { navn: 'Rydd Trafikkskole' }, { admin: true, now: T0 })).json();
  const brukt = (await (await asSchool(env, token, 'POST', '/v1/skole/ny', null, T0)).json()).kode;
  const trukket = (await (await asSchool(env, token, 'POST', '/v1/skole/ny', null, T0)).json()).kode;
  await call(env, 'POST', '/v1/aktiver', { kode: brukt, install: 'telefon-aaaa-1111' }, { now: T0 });
  await asSchool(env, token, 'POST', '/v1/skole/steng', { kode: trukket }, T0 + 10 * DAY);   // ubrukt: trekkes tilbake
  const ubrukt = (await (await asSchool(env, token, 'POST', '/v1/skole/ny', null, T0)).json()).kode;
  const ov0 = await (await asSchool(env, token, 'GET', '/v1/skole', null, T0 + 20 * DAY)).json();
  assert.deepEqual([ov0.brukt, ov0.ubrukt], [1, 1]);
  const til = T0 + 36 * 30.44 * DAY;   // til lappen, høyst 36 måneder (1.2.0)
  // Ett døgn før fristen for den brukte: bare den trukne slettes (trukket 10 dager etter start)
  let r = await (await call(env, 'POST', '/admin/rydd', {}, { admin: true, now: til + YEAR - DAY })).json();
  assert.equal(r.koder, 1, 'bare den trukne koden, ett år etter at den ble trukket');
  assert.ok(await env.CODES.get('kode:' + normalizeCode(brukt)), 'den brukte står ennå');
  // Prøvekjøring teller uten å slette
  r = await (await call(env, 'POST', '/admin/rydd', { prov: true }, { admin: true, now: til + YEAR + DAY })).json();
  assert.equal(r.koder, 1);
  assert.ok(await env.CODES.get('kode:' + normalizeCode(brukt)), 'prøvekjøring sletter ikke');
  r = await (await call(env, 'POST', '/admin/rydd', {}, { admin: true, now: til + YEAR + DAY })).json();
  assert.equal(r.koder, 1);
  assert.equal(await env.CODES.get('kode:' + normalizeCode(brukt)), null, 'den brukte er slettet');
  assert.ok(await env.CODES.get('kode:' + normalizeCode(ubrukt)), 'en ubrukt, åpen kode har ingen opplysninger om noen og står');
  const ov1 = await (await asSchool(env, token, 'GET', '/v1/skole', null, til + YEAR + DAY)).json();
  assert.deepEqual([ov1.brukt, ov1.ubrukt], [1, 1], 'den slettede koden telles fortsatt som brukt');
  assert.equal(ov1.koder.length, 1, 'den slettede vises ikke lenger');
  // En kode stengt før tiden: ett år etter at den ble stengt
  const { koder } = await (await call(env, 'POST', '/admin/koder', { skole: 'Steng', antall: 1, maaneder: 12 }, { admin: true, now: T0 })).json();
  await call(env, 'POST', '/v1/aktiver', { kode: koder[0], install: 'telefon-bbbb-2222' }, { now: T0 });
  await call(env, 'POST', '/admin/steng', { kode: koder[0] }, { admin: true, now: T0 + 30 * DAY });
  r = await (await call(env, 'POST', '/admin/rydd', {}, { admin: true, now: T0 + 30 * DAY + YEAR + DAY })).json();
  assert.equal(r.koder, 1);
  assert.equal(await env.CODES.get('kode:' + normalizeCode(koder[0])), null);
});

test('sletting: det som var lagret av kjøpstellingen, slettes', async () => {
  const { env } = await setup();
  env.PLUSS_TELLING = '1';
  await call(env, 'POST', '/v1/pluss', { kjop: KJOP, install: 'telefon-aaaa-1111' }, { now: T0 });
  delete env.PLUSS_TELLING;
  const r = await (await call(env, 'POST', '/admin/rydd', {}, { admin: true, now: T0 + DAY })).json();
  assert.equal(r.pluss, 1);
  assert.equal((await env.CODES.list({ prefix: 'pluss:' })).keys.length, 0);
});

test('helsesjekk: svarer 503 til slettingen har gått, så 200, og 503 igjen når den har stått stille i 36 timer', async () => {
  const { env } = await setup();
  let r = await call(env, 'GET', '/v1/helse', null, { now: T0 });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).ryddOk, false);
  let waited = null;
  await worker.scheduled({ scheduledTime: T0 }, env, { waitUntil: p => { waited = p; } });
  await waited;
  r = await call(env, 'GET', '/v1/helse', null, { now: T0 + 3600000 });
  const h = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual([h.ok, h.kv, h.signering, h.ryddOk], [true, true, true, true]);
  assert.equal((await call(env, 'GET', '/v1/helse', null, { now: T0 + 37 * 3600000 })).status, 503);
  // Uten signeringsnøkkel: feil
  const bad = { ...env, SIGN_KEY: '{}' };
  assert.equal((await (await call(bad, 'GET', '/v1/helse', null, { now: T0 + 3600000 })).json()).signering, false);
});
