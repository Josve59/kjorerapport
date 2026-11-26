/* 1.2.0: lærerkoder, elevkoder til lappen, faktura måneden etter og navn på kodene (eieren 26. nov. 2026) */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { monthOf, prevMonth, normalizeCode } from '../server/skolekoder/worker.js';
import { verifyPass, passFields } from '../js/skolekode.js';
import { setSchoolPass, schoolPass, teacherPass, hasPlus } from '../js/plus.js';
import { buildPackage, readPackage, cleanSchoolCode } from '../js/messages.js';
import { labelKey, sealLabel, openLabel, MAX_LABEL } from '../skole/merke.js';

const DAY = 86400000;
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
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { env: { CODES: memKV(), ADMIN_SECRET: 'hemmelig-test', SIGN_KEY: JSON.stringify(priv) }, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } };
}
const req = (env, method, path, body, { auth, now = T0 } = {}) => worker.fetch(new Request('https://koder.test' + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, {}, now);
const admin = (env, method, path, body, now) => req(env, method, path, body, { auth: env.ADMIN_SECRET, now });
const jsonOf = async r => r.json();
async function school(env, navn = 'Trafikkskolen Øst', extra = {}) {
  return jsonOf(await admin(env, 'POST', '/admin/skole', { navn, ...extra }, T0));
}
const newCode = async (env, token, now = T0, body = null) => (await jsonOf(await req(env, 'POST', '/v1/skole/ny', body, { auth: token, now }))).kode;
const activate = (env, kode, install, now = T0) => req(env, 'POST', '/v1/aktiver', { kode, install }, { now });

test('måneden i norsk tid, og måneden før', () => {
  assert.equal(monthOf(Date.UTC(2026, 11, 31, 22, 30)), '2026-12');
  assert.equal(monthOf(Date.UTC(2026, 11, 31, 23, 30)), '2027-01', 'nyttårsaften kl. 00.30 i Norge er januar');
  assert.equal(prevMonth('2027-01'), '2026-12');
  assert.equal(prevMonth('2027-10'), '2027-09');
});

test('«Fikk lappen» på skolesiden avslutter koden, og appen får vite hvorfor', async () => {
  const { env } = await setup();
  const s = await school(env);
  const kode = await newCode(env, s.token);
  assert.equal((await activate(env, kode, 'elev-telefon-1')).status, 200);
  const done = await req(env, 'POST', '/v1/skole/fullfor', { kode }, { auth: s.token, now: T0 + 90 * DAY });
  assert.equal(done.status, 200);
  const again = await activate(env, kode, 'elev-telefon-1', T0 + 91 * DAY);
  assert.equal(again.status, 410);
  assert.deepEqual(await again.json(), { error: 'fullfort', skole: 'Trafikkskolen Øst' });
  let o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token, now: T0 + 91 * DAY }));
  assert.deepEqual([o.iBruk, o.ferdig], [0, 1]);
  assert.ok(o.koder[0].fullfort);
  // Trykket ved en feil: «Åpne igjen»
  assert.equal((await req(env, 'POST', '/v1/skole/apne', { kode }, { auth: s.token, now: T0 + 92 * DAY })).status, 200);
  assert.equal((await activate(env, kode, 'elev-telefon-1', T0 + 92 * DAY)).status, 200);
  o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token, now: T0 + 92 * DAY }));
  assert.deepEqual([o.iBruk, o.ferdig], [1, 0]);
});

test('et bevis til lappen fornyes hver gang appen spør, og slutter å virke 60 dager etter siste svar', async () => {
  const { env, pub } = await setup();
  const s = await school(env);
  const kode = await newCode(env, s.token);
  const first = await jsonOf(await activate(env, kode, 'elev-telefon-1'));
  const later = await jsonOf(await activate(env, kode, 'elev-telefon-1', T0 + 400 * DAY));
  assert.ok(await verifyPass(later.bevis, { install: 'elev-telefon-1', now: T0 + 455 * DAY, key: pub }), 'fornyet etter over et år');
  assert.equal(await verifyPass(first.bevis, { install: 'elev-telefon-1', now: T0 + 61 * DAY, key: pub }), null, 'det første er utløpt');
  // Høyst 36 måneder fra første bruk
  const end = await activate(env, kode, 'elev-telefon-1', T0 + 37 * 30.44 * DAY);
  assert.equal(end.status, 410);
  assert.equal((await end.json()).error, 'utlopt');
});

test('lærerkoder: eieren lager dem, og beviset låser opp trafikklærerversjonen med navnet', async () => {
  const { env, pub } = await setup();
  await school(env);
  assert.equal((await req(env, 'POST', '/admin/laerer', { skole: 'Trafikkskolen Øst', navn: 'Kari Nilsen' })).status, 401, 'bare eieren');
  assert.equal((await admin(env, 'POST', '/admin/laerer', { skole: 'Trafikkskolen Øst' })).status, 400, 'navnet mangler');
  const t = await jsonOf(await admin(env, 'POST', '/admin/laerer', { skole: 'trafikkskolen-ost', navn: 'Kari Nilsen' }));
  assert.deepEqual([t.skole, t.navn, t.skoleId], ['Trafikkskolen Øst', 'Kari Nilsen', 'trafikkskolen-ost']);
  const r = await jsonOf(await activate(env, t.kode, 'laerer-telefon-1'));
  assert.deepEqual([r.rolle, r.navn, r.skole, r.varig], ['laerer', 'Kari Nilsen', 'Trafikkskolen Øst', true]);
  const p = await verifyPass(r.bevis, { install: 'laerer-telefon-1', now: T0, key: pub });
  const f = passFields(p, t.kode);
  assert.deepEqual([f.laerer, f.navn, f.skole, f.varig, f.kode], [true, 'Kari Nilsen', 'Trafikkskolen Øst', true, normalizeCode(t.kode)]);
  // Lærerkoden står for seg på skolesiden, ikke blant elevene, og faktureres ikke
  const s2 = await jsonOf(await admin(env, 'POST', '/admin/skole/ny-lenke', { navn: 'Trafikkskolen Øst' }));
  const o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s2.token }));
  assert.deepEqual([o.koder.length, o.laerere.length, o.laerere[0].navn, o.denneMnd], [0, 1, 'Kari Nilsen', 0]);
  // Skolen kan stenge koden når læreren slutter, men ikke gi den «Fikk lappen»
  assert.equal((await req(env, 'POST', '/v1/skole/fullfor', { kode: t.kode }, { auth: s2.token })).status, 409);
  assert.equal((await req(env, 'POST', '/v1/skole/steng', { kode: t.kode }, { auth: s2.token })).status, 200);
  assert.equal((await activate(env, t.kode, 'laerer-telefon-1')).status, 410);
  // En skole uten egen side: koden knyttes til navnet
  const free = await jsonOf(await admin(env, 'POST', '/admin/laerer', { skole: 'Pilotskolen', navn: 'Ola' }));
  assert.deepEqual([free.skole, free.skoleId], ['Pilotskolen', null]);
});

test('læreren gir en elev fra samme skole «har fått lappen» fra appen; andre kan ikke', async () => {
  const { env } = await setup();
  const s = await school(env), other = await school(env, 'Annen Skole');
  const t = await jsonOf(await admin(env, 'POST', '/admin/laerer', { skole: 'Trafikkskolen Øst', navn: 'Kari Nilsen' }));
  await activate(env, t.kode, 'laerer-telefon-1');
  const elev = await newCode(env, s.token), ubrukt = await newCode(env, s.token), fremmed = await newCode(env, other.token);
  await activate(env, elev, 'elev-telefon-1');
  await activate(env, fremmed, 'elev-telefon-2');
  const done = (kode, laerer = t.kode, install = 'laerer-telefon-1') => req(env, 'POST', '/v1/laerer/fullfor', { laerer, install, kode }, { now: T0 + DAY });
  assert.equal((await done(elev, t.kode, 'en-annen-telefon')).status, 403, 'lærerkoden må være i bruk på denne telefonen');
  assert.equal((await done(elev, elev, 'elev-telefon-1')).status, 403, 'en elevkode er ingen lærerkode');
  assert.equal((await done(fremmed)).status, 404, 'en elev fra en annen skole');
  assert.equal((await done(ubrukt)).status, 409, 'aldri tatt i bruk');
  assert.equal((await done(t.kode)).status, 404, 'ikke seg selv');
  assert.equal((await done(elev)).status, 200);
  assert.equal((await (await activate(env, elev, 'elev-telefon-1', T0 + 2 * DAY)).json()).error, 'fullfort');
  const o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token, now: T0 + 2 * DAY }));
  assert.equal(o.ferdig, 1, 'skolen ser det med en gang');
  // En stengt lærerkode kan ikke lenger avslutte elever
  const elev2 = await newCode(env, s.token);
  await activate(env, elev2, 'elev-telefon-3');
  await admin(env, 'POST', '/admin/steng', { kode: t.kode });
  assert.equal((await done(elev2)).status, 403);
});

test('fakturaen: elevkodene som ble tatt i bruk i måneden, per skole, med skolens pris', async () => {
  const { env } = await setup();
  const a = await school(env, 'Trafikkskolen Øst'), b = await school(env, 'Bil og Buss', { pris: 400 });
  const jan = T0, feb = Date.UTC(2027, 1, 3, 12);
  const k1 = await newCode(env, a.token, jan), k2 = await newCode(env, a.token, jan), k3 = await newCode(env, a.token, jan), k4 = await newCode(env, b.token, jan);
  await activate(env, k1, 'telefon-1-abcdef', jan);
  await activate(env, k1, 'telefon-1b-abcdef', jan + DAY);   // samme elev, ny telefon: én gang
  await activate(env, k2, 'telefon-2-abcdef', feb);          // delt ut i januar, tatt i bruk i februar
  await activate(env, k4, 'telefon-4-abcdef', jan);
  // k3 tas aldri i bruk; en lærerkode og en gammel kode fra «lag» faktureres ikke
  const t = await jsonOf(await admin(env, 'POST', '/admin/laerer', { skole: 'Trafikkskolen Øst', navn: 'Kari' }));
  await activate(env, t.kode, 'laerer-telefon-1', jan);
  const old = (await jsonOf(await admin(env, 'POST', '/admin/koder', { skole: 'Trafikkskolen Øst', antall: 1 }))).koder[0];
  await activate(env, old, 'telefon-9-abcdef', jan);
  assert.equal((await req(env, 'GET', '/admin/faktura?mnd=2027-01')).status, 401);
  const f = await jsonOf(await admin(env, 'GET', '/admin/faktura?mnd=2027-01'));
  assert.equal(f.mnd, '2027-01');
  assert.deepEqual(f.skoler.map(s => [s.navn, s.antall, s.pris, s.sum]), [['Bil og Buss', 1, 400, 400], ['Trafikkskolen Øst', 1, 450, 450]]);
  assert.deepEqual(f.skoler[1].koder.map(k => k.kode), [k1]);
  const f2 = await jsonOf(await admin(env, 'GET', '/admin/faktura', null, feb + 30 * DAY));
  assert.equal(f2.mnd, '2027-02', 'uten måned: forrige måned');
  assert.deepEqual(f2.skoler.map(s => [s.navn, s.antall]), [['Trafikkskolen Øst', 1]]);
  assert.ok(k3);
  // Skolen ser det samme: denne måneden og forrige
  const o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: a.token, now: feb }));
  assert.deepEqual([o.denneMnd, o.forrigeMnd, o.mnd, o.forrige], [1, 1, '2027-02', '2027-01']);
});

test('navn på kodene: krypteres i nettleseren, serveren lagrer bare den krypterte teksten', async () => {
  const { env } = await setup();
  const s = await school(env);
  const key = await labelKey(s.token);
  const sealed = await sealLabel(key, '  Emma   Hansen ');
  assert.ok(!sealed.includes('Emma'));
  assert.equal(await openLabel(key, sealed), 'Emma Hansen', 'mellomrom ryddes');
  assert.equal(await openLabel(await labelKey(s.token), sealed), 'Emma Hansen', 'samme lenke gir samme nøkkel i en annen nettleser');
  assert.equal(await openLabel(await labelKey('en-annen-lenke-som-er-lang-nok-123456'), sealed), null, 'en annen lenke kan ikke lese det');
  assert.equal(await openLabel(key, ''), '');
  assert.equal(await sealLabel(key, '   '), '');
  assert.equal((await openLabel(key, await sealLabel(key, 'æøå'.repeat(40)))).length, MAX_LABEL, 'høyst 60 tegn');
  // Med koden når den lages, og endret etterpå
  const kode = await newCode(env, s.token, T0, { merke: sealed });
  let o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token }));
  assert.equal(await openLabel(key, o.koder[0].merke), 'Emma Hansen');
  const raw = JSON.stringify([await env.CODES.get('kode:' + normalizeCode(kode)), (await env.CODES.list({ prefix: 'kode:' })).keys]);
  assert.ok(!raw.includes('Emma'), 'navnet står ikke i klartekst noe sted på serveren');
  assert.equal((await req(env, 'POST', '/v1/skole/merke', { kode, merke: 'Emma Hansen' }, { auth: s.token })).status, 400, 'klartekst avvises');
  await req(env, 'POST', '/v1/skole/merke', { kode, merke: await sealLabel(key, 'Emma H. 3B') }, { auth: s.token });
  o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token }));
  assert.equal(await openLabel(key, o.koder[0].merke), 'Emma H. 3B');
  await req(env, 'POST', '/v1/skole/merke', { kode, merke: '' }, { auth: s.token });
  o = await jsonOf(await req(env, 'GET', '/v1/skole', null, { auth: s.token }));
  assert.equal(o.koder[0].merke, '', 'navnet er fjernet');
});

test('appen: lærerbeviset gir Pluss og trafikklærerversjonen; et elevbevis gjelder til lappen', () => {
  const now = Date.now();
  setSchoolPass(passFields({ s: 'Trafikkskolen Øst', exp: now + DAY, t: 0, l: 1, e: now + 900 * DAY, r: 'laerer', n: 'Kari Nilsen' }, 'k7mx-29qf-h4ta'));
  assert.ok(hasPlus());
  assert.deepEqual([teacherPass().navn, teacherPass().kode, schoolPass().slutt > now + 800 * DAY], ['Kari Nilsen', 'K7MX29QFH4TA', true]);
  setSchoolPass(passFields({ s: 'Trafikkskolen Øst', exp: now + DAY, t: 0, l: 1, e: now + 900 * DAY }, 'K7MX29QFH4TA'));
  assert.equal(teacherPass(), null, 'en elevkode er ingen lærerkode');
  assert.equal(schoolPass().varig, true);
  // Eldre bevis (før 1.2.0) uten de nye feltene
  setSchoolPass(passFields({ s: 'Gammel Skole', exp: now + DAY, t: 1 }, ''));
  assert.deepEqual([schoolPass().varig, schoolPass().laerer, schoolPass().tester, schoolPass().slutt], [false, false, true, now + DAY]);
  setSchoolPass(null);
});

test('elevens kode følger med meldingen til læreren, men aldri fra læreren', () => {
  assert.equal(cleanSchoolCode('k7mx-29qf-h4ta'), 'K7MX29QFH4TA');
  assert.equal(cleanSchoolCode('K7MX-29QF-H4T0'), '', '0 finnes ikke i kodene');
  const fromPupil = readPackage(JSON.parse(JSON.stringify(buildPackage({ from: { role: 'elev', name: 'Emma', id: 'abc123def', kode: 'K7MX-29QF-H4TA' } }))));
  assert.equal(fromPupil.from.kode, 'K7MX29QFH4TA');
  const fromTeacher = buildPackage({ from: { role: 'laerer', name: 'Kari', kode: 'K7MX-29QF-H4TA' } });
  assert.equal(fromTeacher.from.kode, undefined);
  const noCode = buildPackage({ from: { role: 'elev', name: 'Emma' } });
  assert.equal(noCode.from.kode, undefined);
});
