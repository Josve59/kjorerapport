/* Skolekoder (0.27.0): eierens verktøy for kodene trafikkskolene kjøper til elevene sine. Se server/skolekoder/README.md.

   node tools/skolekoder.mjs nokler                        lager nøkkelparet og admin-hemmeligheten (bare én gang)
   node tools/skolekoder.mjs lag "Skolens navn" 150 [mnd]   lager 150 koder (12 måneder om ikke annet er sagt), og
                                                           lagrer dem som regneark i Nedlastinger
   node tools/skolekoder.mjs liste ["Skolens navn"]        hvor mange koder som er brukt (alle skoler, eller én)
   node tools/skolekoder.mjs steng KODE                    koden slutter å virke (f.eks. skolen betalte ikke)
   node tools/skolekoder.mjs nullstill KODE                eleven har brukt koden på to telefoner og har fått en ny

   Serveren: KJ_KODE_URL (standard http://localhost:8787, den lokale serveren) eller .local-test/skolekoder/url.txt.
   Hemmelighetene ligger i .local-test/skolekoder/ (holdes utenfor git): privat.jwk.json og admin.txt. Ta vare på dem:
   uten den private nøkkelen kan ikke serveren lage bevis appen godtar, og en ny nøkkel krever en ny versjon av appen. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.local-test/skolekoder');
const read = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return null; } };
const url = (process.env.KJ_KODE_URL || read('url.txt') || 'http://localhost:8787').replace(/\/$/, '');
const [cmd, ...args] = process.argv.slice(2);

async function admin(method, p, body) {
  const secret = read('admin.txt');
  if (!secret) throw new Error('Mangler admin-hemmeligheten. Kjør «node tools/skolekoder.mjs nokler» først.');
  const r = await fetch(url + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Serveren svarte ${r.status}: ${data.error || ''}`);
  return data;
}
const day = t => (t ? new Date(t).toLocaleDateString('nb-NO') : '–');

if (cmd === 'nokler') {
  if (read('privat.jwk.json')) { console.log(`Nøklene finnes allerede i ${dir}. Slett dem først hvis du virkelig vil lage nye (da må appen få en ny versjon).`); process.exit(0); }
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'privat.jwk.json'), JSON.stringify(priv), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'offentlig.jwk.json'), JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }));
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
  fs.writeFileSync(path.join(dir, 'admin.txt'), secret, { mode: 0o600 });
  console.log(`Lagret i ${dir}: privat.jwk.json, offentlig.jwk.json og admin.txt.`);
  console.log('Den offentlige nøkkelen (til js/skolekode.js):');
  console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }));
} else if (cmd === 'lag') {
  const [skole, antall, maaneder = '12'] = args;
  if (!skole || !antall) { console.log('Bruk: node tools/skolekoder.mjs lag "Skolens navn" 150 [måneder]'); process.exit(1); }
  const r = await admin('POST', '/admin/koder', { skole, antall: Number(antall), maaneder: Number(maaneder) });
  const file = path.join(os.homedir(), 'Downloads', `skolekoder-${skole.replace(/[^\wæøåÆØÅ-]+/g, '-')}-${new Date().toLocaleDateString('sv-SE')}.csv`);
  fs.writeFileSync(file, '﻿Kode;Skole;Gyldig i måneder fra første bruk\n' + r.koder.map(k => `${k};${r.skole};${r.maaneder}`).join('\n') + '\n');
  console.log(`${r.koder.length} koder til ${r.skole} (${r.maaneder} måneder fra eleven tar koden i bruk, høyst ${r.maks} telefoner per kode).`);
  console.log(`Lagret som regneark: ${file}`);
} else if (cmd === 'liste') {
  const [skole] = args;
  const r = await admin('GET', '/admin/koder' + (skole ? '?skole=' + encodeURIComponent(skole) : ''));
  const by = new Map();
  for (const k of r.koder) { const s = by.get(k.skole) || { alle: 0, brukt: 0, stengt: 0 }; s.alle++; if (k.brukt) s.brukt++; if (k.stengt) s.stengt++; by.set(k.skole, s); }
  for (const [s, n] of by) console.log(`${s}: ${n.brukt} av ${n.alle} koder brukt${n.stengt ? `, ${n.stengt} stengt` : ''}`);
  if (skole) for (const k of r.koder) console.log(`  ${k.kode}  ${k.brukt ? `brukt fra ${day(k.forst)} til ${day(k.til)} (${k.brukt} telefon${k.brukt === 1 ? '' : 'er'})` : 'ikke brukt'}${k.stengt ? ' · STENGT' : ''}`);
  if (!r.koder.length) console.log('Ingen koder ennå.');
} else if (cmd === 'steng' || cmd === 'nullstill') {
  const [kode] = args;
  if (!kode) { console.log(`Bruk: node tools/skolekoder.mjs ${cmd} KODE`); process.exit(1); }
  const r = await admin('POST', `/admin/${cmd}`, { kode });
  console.log(cmd === 'steng' ? `${r.kode} er stengt. Den slutter å virke neste gang appen sjekker (innen en uke).` : `${r.kode} er nullstilt og kan brukes på en ny telefon.`);
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace('/*', '').trim());
}
