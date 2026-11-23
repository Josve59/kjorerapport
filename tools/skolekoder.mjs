/* Skolekoder (0.27.0): eierens verktøy for kodene trafikkskolene kjøper til elevene sine. Se server/skolekoder/README.md.

   node tools/skolekoder.mjs nokler                        lager nøkkelparet og admin-hemmeligheten (bare én gang)
   node tools/skolekoder.mjs lag "Skolens navn" 150 [mnd] [maks]   lager 150 koder (12 måneder og 2 telefoner per kode om
                                                           ikke annet er sagt), og lagrer dem som regneark i Nedlastinger
   node tools/skolekoder.mjs lag "Testgruppe" 1 3 25           én felles testlenke: 3 måneder, høyst 25 telefoner
   node tools/skolekoder.mjs liste ["Skolens navn"]        hvor mange koder som er brukt (alle skoler, eller én)
   node tools/skolekoder.mjs steng KODE                    koden slutter å virke (f.eks. skolen betalte ikke)
   node tools/skolekoder.mjs nullstill KODE                eleven har brukt koden på to telefoner og har fått en ny
   node tools/skolekoder.mjs apne KODE                     en kode som ble stengt ved en feil, virker igjen
   node tools/skolekoder.mjs tester KODE [av]              merker en kode som testkode (testerne kan sende turer)
   node tools/skolekoder.mjs turer                         lister turene testerne har sendt, og henter nye til
                                                           Nedlastinger (kjorerapport-tester-….json, leses av turrapport)
   node tools/skolekoder.mjs slett-turer alle|NØKKEL       sletter turene på serveren når testingen er ferdig
   node tools/skolekoder.mjs pluss                         hvor mange telefoner hvert Pluss-kjøp brukes på (1.0.7):
                                                           viser om noen deler kjøpet. Ingenting stenges.

   Skolesiden (1.0.8): skolen deler ut tilganger selv fra en pakke, på sin egen side.
   node tools/skolekoder.mjs skole "Skolens navn" 100 [mnd] lager skolen med 100 tilganger og skriver ut lenken til
                                                           skolens side (send den til skolen; den er skolens nøkkel)
   node tools/skolekoder.mjs pakke "Skolens navn" 50       legger til 50 tilganger (etter betalt faktura)
   node tools/skolekoder.mjs skoler                        alle skolene: kjøpt, i bruk, sendt, igjen og nye bestillinger
   node tools/skolekoder.mjs ny-lenke "Skolens navn"       ny lenke til skolen; den gamle slutter å virke

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
  const [skole, antall, maaneder = '12', maks = '2', type = ''] = args;
  if (!skole || !antall) { console.log('Bruk: node tools/skolekoder.mjs lag "Skolens navn" 150 [måneder] [telefoner per kode]'); process.exit(1); }
  const r = await admin('POST', '/admin/koder', { skole, antall: Number(antall), maaneder: Number(maaneder), maks: Number(maks), tester: type === 'tester' });
  const file = path.join(os.homedir(), 'Downloads', `skolekoder-${skole.replace(/[^\wæøåÆØÅ-]+/g, '-')}-${new Date().toLocaleDateString('sv-SE')}.csv`);
  fs.writeFileSync(file, '﻿Kode;Skole;Gyldig i måneder fra første bruk\n' + r.koder.map(k => `${k};${r.skole};${r.maaneder}`).join('\n') + '\n');
  console.log(`${r.koder.length} koder til ${r.skole} (${r.maaneder} måneder fra eleven tar koden i bruk, høyst ${r.maks} telefoner per kode${r.tester ? ', testkode: kan sende turer' : ''}).`);
  console.log(`Lagret som regneark: ${file}`);
  const web = read('nettside-url.txt');
  if (web && r.koder.length <= 3) for (const k of r.koder) console.log(`Lenke som låser opp av seg selv: ${web}/?kode=${k}`);
} else if (cmd === 'liste') {
  const [skole] = args;
  const r = await admin('GET', '/admin/koder' + (skole ? '?skole=' + encodeURIComponent(skole) : ''));
  const by = new Map();
  for (const k of r.koder) { const s = by.get(k.skole) || { alle: 0, brukt: 0, stengt: 0 }; s.alle++; if (k.brukt) s.brukt++; if (k.stengt) s.stengt++; by.set(k.skole, s); }
  for (const [s, n] of by) console.log(`${s}: ${n.brukt} av ${n.alle} koder brukt${n.stengt ? `, ${n.stengt} stengt` : ''}`);
  if (skole) for (const k of r.koder) console.log(`  ${k.kode}  ${k.brukt ? `brukt fra ${day(k.forst)} til ${day(k.til)} (${k.brukt} telefon${k.brukt === 1 ? '' : 'er'})` : 'ikke brukt'}${k.stengt ? ' · STENGT' : ''}${k.tester ? ' · testkode' : ''}`);
  if (!r.koder.length) console.log('Ingen koder ennå.');
} else if (cmd === 'tester') {
  const [kode, av] = args;
  if (!kode) { console.log('Bruk: node tools/skolekoder.mjs tester KODE [av]'); process.exit(1); }
  const r = await admin('POST', '/admin/tester', { kode, tester: av !== 'av' });
  console.log(av === 'av' ? `${r.kode} er ikke lenger testkode.` : `${r.kode} er testkode: testerne kan sende turer (appen får vite det neste gang den spør serveren).`);
} else if (cmd === 'turer') {
  const { turer } = await admin('GET', '/admin/turer');
  if (!turer.length) { console.log('Ingen turer fra testere ennå.'); process.exit(0); }
  const dl = path.join(os.homedir(), 'Downloads');
  let nye = 0;
  for (const t of turer) {
    const name = `kjorerapport-tester-${String(t.start || '').slice(0, 16).replace(/[:T]/g, '-') || t.tur}-${t.install || 'x'}.json`;
    const file = path.join(dl, name);
    const sendt = new Date(t.sendt).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
    console.log(`  ${sendt}  tur ${String(t.start || '').slice(0, 16).replace('T', ' ')}  telefon ${t.install}  ${(t.bytes / 1e6).toFixed(1).replace('.', ',')} MB  v${t.versjon || '?'}${fs.existsSync(file) ? '' : '  (ny)'}`);
    if (fs.existsSync(file)) continue;
    const res = await fetch(url + '/admin/tur?nokkel=' + encodeURIComponent(t.nokkel), { headers: { Authorization: `Bearer ${read('admin.txt')}` } });
    if (!res.ok) { console.log(`    kunne ikke hente (${res.status})`); continue; }
    let buf = Buffer.from(await res.arrayBuffer());
    if (t.gz) buf = (await import('node:zlib')).gunzipSync(buf);
    fs.writeFileSync(file, buf); nye++;
  }
  console.log(`${turer.length} turer på serveren${nye ? `, ${nye} nye hentet til Nedlastinger` : ', ingen nye'}.`);
} else if (cmd === 'slett-turer') {
  const [hva] = args;
  if (!hva) { console.log('Bruk: node tools/skolekoder.mjs slett-turer alle   (eller én NØKKEL fra «turer»)'); process.exit(1); }
  const r = await admin('POST', '/admin/slett-tur', hva === 'alle' ? { alle: true } : { nokkel: hva });
  console.log(`${r.slettet} ${r.slettet === 1 ? 'tur' : 'turer'} slettet på serveren.`);
} else if (cmd === 'skole' || cmd === 'ny-lenke') {
  const [navn, antall, maaneder = '12'] = args;
  if (!navn || (cmd === 'skole' && antall === undefined)) { console.log(cmd === 'skole' ? 'Bruk: node tools/skolekoder.mjs skole "Skolens navn" 100 [måneder]' : 'Bruk: node tools/skolekoder.mjs ny-lenke "Skolens navn"'); process.exit(1); }
  const r = cmd === 'skole' ? await admin('POST', '/admin/skole', { navn, antall: Number(antall), maaneder: Number(maaneder) }) : await admin('POST', '/admin/skole/ny-lenke', { navn });
  const web = read('nettside-url.txt') || 'https://kjorerapport.jo-9fc.workers.dev';
  console.log(cmd === 'skole' ? `${r.navn} er lagt inn med ${r.kjopt} tilganger (${r.maaneder} måneder fra eleven tar koden i bruk, ${r.maks} telefoner per kode).` : `${r.navn} har fått en ny lenke. Den gamle virker ikke lenger.`);
  console.log('Lenken til skolens side (send den bare til skolen, den er skolens nøkkel):');
  console.log(`${web}/skole/#${r.token}`);
} else if (cmd === 'pakke') {
  const [navn, antall] = args;
  if (!navn || !antall) { console.log('Bruk: node tools/skolekoder.mjs pakke "Skolens navn" 50'); process.exit(1); }
  const r = await admin('POST', '/admin/skole/pakke', { navn, antall: Number(antall) });
  console.log(`${r.navn} har nå ${r.kjopt} tilganger totalt. Skolen ser det på siden sin med en gang.`);
} else if (cmd === 'skoler') {
  const { skoler } = await admin('GET', '/admin/skoler');
  if (!skoler.length) { console.log('Ingen skoler med egen side ennå. Lag en med «skole "Navn" 100».'); process.exit(0); }
  for (const s of skoler) {
    console.log(`${s.navn}: ${s.kjopt} kjøpt, ${s.brukt} i bruk, ${s.ubrukt} sendt men ikke tatt i bruk, ${s.igjen} igjen`);
    for (const b of s.bestillinger) console.log(`  BESTILLING: ${b.antall} tilganger, ${day(b.t)}. Send faktura, og kjør «pakke "${s.navn}" ${b.antall}» når den er betalt.`);
  }
} else if (cmd === 'pluss') {
  const r = await admin('GET', '/admin/pluss');
  if (!r.kjop) { console.log('Ingen Pluss-kjøp har meldt seg ennå (appen melder seg én gang i uka når Pluss er kjøpt).'); process.exit(0); }
  const line = o => `1 telefon: ${o[1]}, 2: ${o[2]}, 3: ${o[3]}, 4 eller flere: ${o['4+']}`;
  console.log(`${r.kjop} Pluss-kjøp har meldt seg.`);
  console.log(`I bruk nå (siste 14 dager):  ${line(r.naa)}`);
  console.log(`Flest på én gang noen gang:  ${line(r.maks)}`);
  console.log('2 kan være at noen har byttet telefon. 3 eller flere på én gang tyder på deling.');
  for (const k of r.liste.filter(x => x.maks >= 3)) console.log(`  kjøp ${k.kjop}…  ${k.naa} i bruk nå, flest ${k.maks}, ${k.telefoner} telefoner totalt, sist ${day(k.sist)}`);
} else if (cmd === 'steng' || cmd === 'nullstill' || cmd === 'apne') {
  const [kode] = args;
  if (!kode) { console.log(`Bruk: node tools/skolekoder.mjs ${cmd} KODE`); process.exit(1); }
  const r = await admin('POST', `/admin/${cmd}`, { kode });
  console.log(cmd === 'steng' ? `${r.kode} er stengt. Den slutter å virke neste gang appen sjekker (innen en uke).` : cmd === 'apne' ? `${r.kode} er åpnet igjen og virker som før.` : `${r.kode} er nullstilt og kan brukes på en ny telefon.`);
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace('/*', '').trim());
}
