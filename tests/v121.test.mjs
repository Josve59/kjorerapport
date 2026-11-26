/* 1.2.1: rettinger etter testene av 1.2.0 (to agenter, 26. nov. 2026) */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { normalizeCode, cleanup } from '../server/skolekoder/worker.js';
import { labelKey, sealLabel, openLabel } from '../skole/merke.js';

const DAY = 86400000, YEAR = 365 * DAY, MONTH = 30.44 * DAY;
const T0 = Date.UTC(2027, 0, 10, 12);
const memKV = () => { const m = new Map(); return {
  async get(k) { return m.has(k) ? m.get(k).value : null; },
  async put(k, value, o = {}) { m.set(k, { value, metadata: o.metadata || null }); },
  async list({ prefix = '' } = {}) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: m.get(name).metadata })), list_complete: true }; },
  async getWithMetadata(k) { return m.has(k) ? { value: m.get(k).value, metadata: m.get(k).metadata } : { value: null, metadata: null }; },
  async delete(k) { m.delete(k); }
}; };
async function setup() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { env: { CODES: memKV(), ADMIN_SECRET: 'hemmelig-test', SIGN_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey)) } };
}
const req = (env, method, path, body, { auth, now = T0, raw } = {}) => worker.fetch(new Request('https://koder.test' + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined }), env, {}, now);
const admin = (env, method, path, body, now) => req(env, method, path, body, { auth: env.ADMIN_SECRET, now });
const jsonOf = r => r.json();
const newCode = async (env, token, now = T0) => (await jsonOf(await req(env, 'POST', '/v1/skole/ny', null, { auth: token, now }))).kode;
const activate = (env, kode, install, now = T0) => req(env, 'POST', '/v1/aktiver', { kode, install }, { now });

test('eierens «apne» angrer også «Fikk lappen»', async () => {
  const { env } = await setup();
  const s = await jsonOf(await admin(env, 'POST', '/admin/skole', { navn: 'Skole A' }));
  const kode = await newCode(env, s.token);
  await activate(env, kode, 'telefon-1-abcdef');
  await req(env, 'POST', '/v1/skole/fullfor', { kode }, { auth: s.token });
  await admin(env, 'POST', '/admin/apne', { kode });
  assert.equal((await activate(env, kode, 'telefon-1-abcdef')).status, 200);
  const o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token }));
  assert.deepEqual([o.iBruk, o.ferdig], [1, 0]);
});

test('ugyldig måned og rare kropper gir 400, ikke forrige måned eller 500', async () => {
  const { env } = await setup();
  assert.equal((await admin(env, 'GET', '/admin/faktura?mnd=2027-13')).status, 400);
  assert.equal((await admin(env, 'GET', '/admin/faktura?mnd=2027-02')).status, 200);
  for (const raw of ['null', '[]', '7', '"x"']) {
    assert.equal((await req(env, 'POST', '/v1/aktiver', null, { raw })).status, 404, raw);
    assert.equal((await req(env, 'POST', '/admin/skole', null, { raw, auth: env.ADMIN_SECRET })).status, 400, raw);
  }
});

test('lærerkoder: skolen må finnes (eller tvinges), og en side som lages senere får dem; en ubrukt kan stenges og åpnes', async () => {
  const { env } = await setup();
  assert.equal((await admin(env, 'POST', '/admin/laerer', { skole: 'Skrivfeil Skole', navn: 'Kari' })).status, 404);
  const t = await jsonOf(await admin(env, 'POST', '/admin/laerer', { skole: 'Ny Skole', navn: 'Kari Nilsen', tving: true }));
  const s = await jsonOf(await admin(env, 'POST', '/admin/skole', { navn: 'Ny skole' }));
  const o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token }));
  assert.deepEqual(o.laerere.map(x => x.navn), ['Kari Nilsen'], 'lærerkoden hører til skolen nå');
  assert.equal((await req(env, 'POST', '/v1/skole/steng', { kode: t.kode }, { auth: s.token })).status, 200);
  assert.equal((await req(env, 'POST', '/v1/skole/apne', { kode: t.kode }, { auth: s.token })).status, 200, 'før: 409 trukket');
  assert.equal((await activate(env, t.kode, 'laerer-telefon-1')).status, 200);
});

test('eierens tall: null er «ikke oppgitt», og lengste tid er minst 36 måneder', async () => {
  const { env } = await setup();
  await admin(env, 'POST', '/admin/skole', { navn: 'Skole B', pris: 400 });
  let r = await jsonOf(await admin(env, 'POST', '/admin/skole/endre', { navn: 'Skole B', pris: null, maaneder: 12 }));
  assert.deepEqual([r.pris, r.maaneder], [400, 36]);
  r = await jsonOf(await admin(env, 'POST', '/admin/skole/endre', { navn: 'Skole B', maaneder: 48 }));
  assert.equal(r.maaneder, 48);
});

test('forhåndsbetalte plasser fra en pakke (før 1.2.0) brukes før noe faktureres', async () => {
  const { env } = await setup();
  const s = await jsonOf(await admin(env, 'POST', '/admin/skole', { navn: 'Pakkeskolen' }));
  // En skole fra før 1.2.0: 3 kjøpt, én gammel kode i bruk
  const rec = JSON.parse(await env.CODES.get('skole:pakkeskolen'));
  await env.CODES.put('skole:pakkeskolen', JSON.stringify({ ...rec, kjopt: 3, maaneder: 12 }));
  const old = 'K7MX29QFH4TA';
  await env.CODES.put('kode:' + old, JSON.stringify({ skole: 'Pakkeskolen', skoleId: 'pakkeskolen', maaneder: 12, maks: 2, laget: T0, utdelt: T0, forst: T0, installs: ['gammel-telefon-1'], stengt: false, tester: false }), { metadata: { skole: 'Pakkeskolen', sid: 'pakkeskolen', u: T0, f: T0, n: 1, s: 0, m: 12 } });
  let o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token }));
  assert.equal(o.forhand, 2);
  const a = await newCode(env, s.token), b = await newCode(env, s.token), c = await newCode(env, s.token);
  for (const [k, i] of [[a, 'tel-a-abcdef'], [b, 'tel-b-abcdef'], [c, 'tel-c-abcdef']]) await activate(env, k, i);
  o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token }));
  assert.deepEqual([o.forhand, o.denneMnd], [0, 1], 'to forhåndsbetalte, den tredje faktureres');
  const f = await jsonOf(await admin(env, 'GET', '/admin/faktura?mnd=2027-01'));
  assert.deepEqual(f.skoler.map(x => [x.navn, x.antall]), [['Pakkeskolen', 1]]);
  assert.equal(f.skoler[0].koder[0].kode, c);
});

test('slettingen: avsluttede koder leses ikke før de er ett år over tiden, og ubrukte koder med navn slettes etter to år', async () => {
  const { env } = await setup();
  const s = await jsonOf(await admin(env, 'POST', '/admin/skole', { navn: 'Rydd' }, T0));
  await admin(env, 'POST', '/admin/skole/endre', { navn: 'Rydd', grense: 1000 });
  const key = await labelKey(s.token);
  // 450 elever som har fått lappen for 100 dager siden: slettingen skal ikke bruke opp kvoten på dem
  for (let i = 0; i < 450; i++) {
    const k = await newCode(env, s.token, T0 + i);
    await activate(env, k, `tel-${i}-abcdefgh`, T0);
    await req(env, 'POST', '/v1/skole/fullfor', { kode: k }, { auth: s.token, now: T0 + DAY });
  }
  const old = await jsonOf(await admin(env, 'POST', '/admin/laerer', { skole: 'Rydd', navn: 'Ubrukt Lærer' }, T0));
  const named = (await jsonOf(await req(env, 'POST', '/v1/skole/ny', { merke: await sealLabel(key, 'Ola') }, { auth: s.token, now: T0 }))).kode;
  let gets = 0; const get = env.CODES.get.bind(env.CODES); env.CODES.get = k => { if (k.startsWith('kode:')) gets++; return get(k); };
  let r = await cleanup(env, T0 + 100 * DAY);
  assert.equal(r.igjen, false);
  assert.ok(gets < 10, `leste ${gets} koder`);
  // To år etter: alt er borte, også den ubrukte lærerkoden og den ubrukte koden med navn (flere netter: 400 om gangen)
  let total = 0;
  for (let n = 0; n < 6; n++) { r = await cleanup(env, T0 + 2 * YEAR + DAY + n * DAY); total += r.koder; if (!r.igjen) break; }
  assert.equal(r.igjen, false);
  assert.equal(total, 452);
  assert.equal(await env.CODES.get('kode:' + normalizeCode(old.kode)), null);
  assert.equal(await env.CODES.get('kode:' + normalizeCode(named)), null);
});

test('lærerkoder teller ikke i skolens «brukt» etter slettingen, og helsesjekken varsler når slettingen henger i en uke', async () => {
  const { env } = await setup();
  const s = await jsonOf(await admin(env, 'POST', '/admin/skole', { navn: 'Skole C' }, T0));
  const k = await newCode(env, s.token);
  await activate(env, k, 'tel-1-abcdefgh');
  const t = await jsonOf(await admin(env, 'POST', '/admin/laerer', { skole: 'Skole C', navn: 'Kari' }));
  await activate(env, t.kode, 'laerer-1-abcdef');
  await admin(env, 'POST', '/admin/steng', { kode: t.kode }, T0 + DAY);
  await cleanup(env, T0 + YEAR + 2 * DAY);
  assert.equal(await env.CODES.get('kode:' + normalizeCode(t.kode)), null, 'den stengte lærerkoden er slettet');
  const o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token, now: T0 + YEAR + 2 * DAY }));
  assert.equal(o.brukt, 1, 'bare eleven');
  // Helse: «igjen» i over en uke → 503
  await env.CODES.put('drift:rydd', JSON.stringify({ t: T0, koder: 0, pluss: 0, skoler: 0, igjen: true, igjenSiden: T0 - 8 * DAY }));
  const h = await req(env, 'GET', '/v1/helse', null, { now: T0 + 3600000 });
  assert.equal(h.status, 503);
  await env.CODES.put('drift:rydd', JSON.stringify({ t: T0, koder: 0, pluss: 0, skoler: 0, igjen: true, igjenSiden: T0 - 2 * DAY }));
  assert.equal((await req(env, 'GET', '/v1/helse', null, { now: T0 + 3600000 })).status, 200);
});

test('navn: en emoji deles ikke i to når navnet kortes av', async () => {
  const key = await labelKey('en-lenke-som-er-lang-nok-0123456789');
  const back = await openLabel(key, await sealLabel(key, 'a' + '😀'.repeat(70)));
  assert.equal(Array.from(back).length, 60);
  assert.ok(!back.includes('�'));
});

test('grensen per måned holder med 200 koder selv om listen hos Cloudflare henger etter', async () => {
  const { env } = await setup();
  const s = await jsonOf(await admin(env, 'POST', '/admin/skole', { navn: 'Treg' }));
  const list = env.CODES.list;
  env.CODES.list = async o => (o.prefix === 'kode:' ? { keys: [], list_complete: true } : list(o));
  let ok = 0;
  for (let i = 0; i < 205; i++) if ((await req(env, 'POST', '/v1/skole/ny', null, { auth: s.token, now: T0 + i })).status === 200) ok++;
  assert.equal(ok, 200);
});
