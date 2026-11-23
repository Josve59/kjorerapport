/* QR-koden på skolesiden (skole/qr.js, 1.0.8). Om macOS faktisk leser kodene, sjekkes med «node tools/qr-sjekk.mjs». */
import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg, rsDivisor, rsRemainder, MAX_VERSION } from '../skole/qr.js';

test('Reed-Solomon gir feilrettingen fra standardens eksempel («HELLO WORLD», versjon 1-M)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, rsDivisor(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('minste versjon som får plass, med søkemønstre i tre hjørner', () => {
  const q = qrMatrix('https://kjorerapport.jo-9fc.workers.dev/elev/?kode=K7MX-29QF-H4TA&fra=Emma%20Trafikkskole');
  assert.equal(q.version, 6);
  assert.equal(q.size, 6 * 4 + 17);
  const finder = (x0, y0) => [0, 1, 2, 3, 4, 5, 6].every(i => q.modules[y0][x0 + i] && q.modules[y0 + 6][x0 + i] && q.modules[y0 + i][x0] && q.modules[y0 + i][x0 + 6]) && q.modules[y0 + 3][x0 + 3];
  assert.ok(finder(0, 0) && finder(q.size - 7, 0) && finder(0, q.size - 7));
  assert.equal(q.modules[q.size - 8][8], true, 'den alltid mørke modulen');
  assert.equal(qrMatrix('A').version, 1);
  assert.equal(qrMatrix('x'.repeat(14)).version, 1);
  assert.equal(qrMatrix('x'.repeat(15)).version, 2);
});

test('for lang tekst gir ingen QR-kode, og SVG-en er svart på hvitt', () => {
  assert.equal(qrMatrix('x'.repeat(500)), null);
  assert.equal(qrSvg('x'.repeat(500)), '');
  assert.ok(MAX_VERSION >= 10);
  const svg = qrSvg('Kjørerapport');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 29 29"/, 'versjon 1 (21 moduler) med 4 i hvit kant på hver side');
  assert.match(svg, /fill="#fff"/);
  assert.match(svg, /fill="#000"/);
});
