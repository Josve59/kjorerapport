/* Sjekker QR-koderen på skolesiden (skole/qr.js) mot macOS sin egen QR-leser: lager QR-koder for tekster i alle
   størrelser (versjon 1–15), lagrer dem som PNG og lar tools/qr-sjekk.swift lese dem. Alle må leses riktig.
   Bruk: node tools/qr-sjekk.mjs   (trenger Xcode sin «swift») */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qrMatrix } from '../skole/qr.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* PNG i gråtoner, uten bibliotek: hver modul blir scale × scale piksler, med hvit kant */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(q, scale = 8, quiet = 4) {
  const n = (q.size + quiet * 2) * scale;
  const raw = Buffer.alloc((n + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const my = Math.floor(y / scale) - quiet, mx = Math.floor(x / scale) - quiet;
      const dark = my >= 0 && my < q.size && mx >= 0 && mx < q.size && q.modules[my][mx];
      raw[y * (n + 1) + 1 + x] = dark ? 0 : 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const link = 'https://kjorerapport.jo-9fc.workers.dev/elev/?kode=K7MX-29QF-H4TA&fra=';
const texts = ['A', 'Kjørerapport', link + 'Emma%20Trafikkskole', link + encodeURIComponent('Trafikkskolen Øst AS, avdeling Trondheim sentrum'),
  ...[20, 40, 60, 80, 100, 115, 130, 160, 200, 240, 280, 320, 360, 400].map(n => 'x'.repeat(n - 1) + '!')];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-sjekk-'));
const files = [], expect = [];
for (const [i, t] of texts.entries()) {
  const q = qrMatrix(t);
  if (!q) { console.log(`For lang for QR (over versjon 15): ${t.length} tegn`); continue; }
  const f = path.join(dir, `qr-${i}.png`);
  fs.writeFileSync(f, png(q));
  files.push(f); expect.push({ t, v: q.version });
}
const out = execFileSync('swift', [path.join(root, 'tools/qr-sjekk.swift'), ...files], { encoding: 'utf8' }).trim().split('\n');
let bad = 0;
expect.forEach(({ t, v }, i) => {
  const ok = out[i] === t;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FEIL'} versjon ${String(v).padStart(2)}  ${t.length} tegn${ok ? '' : `  leste: ${String(out[i]).slice(0, 60)}`}`);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `${bad} av ${expect.length} ble ikke lest riktig.` : `Alle ${expect.length} QR-kodene ble lest riktig av macOS.`);
process.exit(bad ? 1 : 0);
