// Tar Claudes gjennomgang av forslagene (gjennomgang-*.json i <økt>-merk/) inn i forslag.json: forslag som tydelig
// ikke er malte linjer fjernes, og bilder som ikke kan brukes merkes med et forslag om å hoppe over.
// De fjernede linjene tas vare på (fjernet), så de kan hentes tilbake. Kjøres flere ganger uten skade.
//   node tools/merk/bruk-gjennomgang.mjs .local-test/veibilder/<økt>
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || '');
const merk = dir + '-merk', ff = path.join(merk, 'forslag.json');
const F = JSON.parse(fs.readFileSync(ff, 'utf8'));
const reviews = {};
for (const f of fs.readdirSync(merk).filter(x => /^gjennomgang-\d+\.json$/.test(x)).sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(merk, f), 'utf8'));
  Object.assign(reviews, r.frames || {});
}
let dropped = 0, skips = 0, seen = 0;
for (const fr of F.frames) {
  // Start fra alle forslagene, også de som ble fjernet ved en tidligere kjøring
  const all = [...fr.lines, ...(fr.fjernet || [])].sort((a, b) => a.id - b.id);
  const r = reviews[fr.id];
  if (!r) { fr.lines = all; delete fr.fjernet; delete fr.claude; continue; }
  seen++;
  const drop = new Set((r.drop || []).map(Number));
  fr.lines = all.filter(l => !drop.has(l.id));
  fr.fjernet = all.filter(l => drop.has(l.id));
  dropped += fr.fjernet.length;
  fr.claude = { fjernet: fr.fjernet.length, hopp: !!r.skip, note: String(r.note || '').slice(0, 160) };
  if (r.skip) skips++;
}
fs.writeFileSync(ff, JSON.stringify(F));
console.log(`gjennomgått ${seen} av ${F.frames.length} bilder · fjernet ${dropped} forslag · foreslått å hoppe over ${skips}`);
