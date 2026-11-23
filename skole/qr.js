/* QR-kode (1.0.8) til skolesiden: eleven skanner lenken til elevsiden med kameraet. Skrevet her, uten bibliotek, etter
   QR-standarden (ISO/IEC 18004): bytemodus, feilretting M (tåler at rundt 15 % er skadet), versjon 1–15 (lenker opptil
   rundt 400 tegn), alle åtte masker med straffepoengene fra standarden. Tegnes som SVG, svart på hvitt.
   Testet mot macOS sin egen QR-leser (tests/qr.test.mjs og tools/qr-sjekk.swift). */

/* Per versjon for feilretting M: feilrettingsord per blokk, og blokkene som [antall, dataord] */
const BLOCKS = [null,
  [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
  [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]],
  [30, [[1, 50], [4, 51]]], [22, [[6, 36], [2, 37]]], [22, [[8, 37], [1, 38]]], [24, [[4, 40], [5, 41]]], [24, [[5, 41], [5, 42]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]];
export const MAX_VERSION = 15;
const dataCodewords = v => BLOCKS[v][1].reduce((s, [n, d]) => s + n * d, 0);

/* Regning i GF(256) med polynomet 0x11D, og Reed-Solomon-feilretting */
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
export function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = gfMul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
export function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

/* Teksten som dataord: bytemodus (0100), lengden, bytene, avslutning og fyll (0xEC, 0x11) */
function encode(bytes, v) {
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(v) * 8;
  if (bits.length > cap) return null;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < cap / 8; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/* Dataordene delt i blokker med feilretting, flettet slik standarden sier */
function interleave(data, v) {
  const [ecLen, groups] = BLOCKS[v], div = rsDivisor(ecLen), blocks = [];
  let k = 0;
  for (const [n, d] of groups) for (let i = 0; i < n; i++) { const b = data.slice(k, k + d); k += d; blocks.push({ d: b, e: rsRemainder(b, div) }); }
  const out = [], maxD = Math.max(...blocks.map(b => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];

function build(codewords, v, mask) {
  const size = v * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  // Tidslinjene, søkemønstrene i tre hjørner og innrettingsmønstrene
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v], last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // Formatet (feilretting M = 00, og masken) med BCH-kode, to ganger
  const fmt = (() => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); return ((d << 10) | r) ^ 0x5412; })();
  const bit = (val, i) => ((val >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fmt, i));
  set(8, 7, bit(fmt, 6)); set(8, 8, bit(fmt, 7)); set(7, 8, bit(fmt, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fmt, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fmt, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fmt, i));
  set(8, size - 8, true);   // den alltid mørke modulen
  // Versjonen (fra versjon 7), to ganger
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vb = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // Dataene i sikksakk nedenfra og opp, to kolonner om gangen, utenom tidslinja i kolonne 6
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && n < codewords.length * 8) { m[y][x] = bit(codewords[n >>> 3], 7 - (n & 7)); n++; }
    }
  }
  const mk = MASKS[mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && mk(x, y)) m[y][x] = !m[y][x];
  return m;
}

/* Straffepoeng (standarden): lange rader, 2×2-felt, mønstre som ligner søkemønstrene, og skjev fordeling */
function penalty(m) {
  const size = m.length;
  let p = 0, dark = 0;
  const lines = [];
  for (let i = 0; i < size; i++) { lines.push(m[i]); lines.push(m.map(r => r[i])); }
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (const l of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && l[i] === l[i - 1]) run++;
      else { if (run >= 5) p += run - 2; run = 1; }
    }
    for (let i = 0; i + 11 <= size; i++) {
      if (A.every((b, k) => l[i + k] === !!b)) p += 40;
      if (B.every((b, k) => l[i + k] === !!b)) p += 40;
    }
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  for (const r of m) for (const c of r) if (c) dark++;
  p += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
  return p;
}

/* → { version, size, modules: [rad][kolonne] = mørk } eller null når teksten er for lang */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  for (let v = 1; v <= MAX_VERSION; v++) {
    const data = encode(bytes, v);
    if (!data) continue;
    const cw = interleave(data, v);
    let best = null, bestP = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = build(cw, v, mask), p = penalty(m);
      if (p < bestP) { best = m; bestP = p; }
    }
    return { version: v, size: best.length, modules: best };
  }
  return null;
}

/* SVG med hvit kant (4 moduler, som standarden krever). Svart på hvitt også i mørk modus, så alle kameraer leser den. */
export function qrSvg(text, { quiet = 4, label = 'QR-kode' } = {}) {
  const q = qrMatrix(text);
  if (!q) return '';
  const n = q.size + quiet * 2;
  let d = '';
  q.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
