import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processDetections, roadSummary, focalPx, leadAt, detectTaillights, TAIL_SEP } from '../kamera/js/road.js';

test('veikamera: bilen rett foran velges, og avstanden anslås fra bredden', () => {
  const f = focalPx(640, 480);
  const w = 1.8 * f / 20;   // en bil 20 m unna
  const dets = [
    { cls: 'car', score: 0.8, x: 320 - w / 2, y: 260, w, h: w * 0.8 },     // midt foran
    { cls: 'car', score: 0.9, x: 20, y: 250, w: w * 2, h: w },              // i nabofeltet, nærmere
    { cls: 'person', score: 0.6, x: 600, y: 200, w: 15, h: 40 },
    { cls: 'car', score: 0.7, x: 310, y: 50, w: 30, h: 20 }                 // langt oppe i bildet (bro)
  ];
  const r = processDetections(dets, 640, 480);
  assert.equal(r.cars, 3);
  assert.equal(r.people, 1);
  assert.ok(Math.abs(r.lead.dist - 20) < 0.5, JSON.stringify(r.lead));
});

test('veikamera: kort avstand med bro over hull når førerkameraet var på', () => {
  const points = Array.from({ length: 121 }, (_, i) => ({ t: i, kmh: 72 }));   // 20 m/s
  const samples = [];
  // Veikameraet 2 s av hvert 6. sekund, bilen foran 14 m unna (0,7 s) fra 50 til 74 s
  for (let t = 0; t < 120; t += 0.125) if (t % 6 < 2) samples.push({ t, cars: 1, people: 0, lead: t >= 50 && t <= 74 ? { cls: 'car', dist: 14 } : { cls: 'car', dist: 45 } });
  const s = roadSummary(samples, points);
  assert.equal(s.close.length, 1, JSON.stringify(s.close));
  assert.ok(s.close[0].t >= 50 && s.close[0].t <= 56 && s.close[0].tEnd >= 72, JSON.stringify(s.close[0]));   // første veibilde etter 50 s er ved 54 s
  assert.equal(s.close[0].minHeadway, 0.7);
  assert.ok(s.coverage > 0.25 && s.coverage < 0.4, String(s.coverage));
  assert.equal(leadAt(s, 61).dist, 14);
  assert.doesNotThrow(() => structuredClone(s), 'kan lagres i databasen');
  // Farten endret seg mye mellom bildene: ingen bro
  const points2 = points.map(p => ({ ...p, kmh: p.t % 6 < 2 ? 72 : 72 }));
  for (const p of points2) if (p.t >= 60) p.kmh = 50;   // vi bremset ned
  const s2 = roadSummary(samples, points2);
  assert.ok(s2.close.every(c => c.tEnd < 60 || c.t >= 60), 'ingen episode bygges over fartsendringen');
});

/* Mørkt bilde (320×240) med røde lys: [x, y, r] i piksler. Lysene har hvit kjerne og rød glorie. */
function nightFrame(lights, w = 320, h = 240) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = 14; d[i * 4 + 1] = 14; d[i * 4 + 2] = 18; d[i * 4 + 3] = 255; }
  for (const [fx, fy, r] of lights) for (let cx = Math.round(fx), cy = Math.round(fy), y = cy - r - 2; y <= cy + r + 2; y++) for (let x = cx - r - 2; x <= cx + r + 2; x++) {
    const dd = Math.hypot(x - cx, y - cy), i = (y * w + x) * 4;
    if (dd <= r * 0.5) { d[i] = 255; d[i + 1] = 235; d[i + 2] = 225; }        // kjerne
    else if (dd <= r + 2) { d[i] = 230; d[i + 1] = 40; d[i + 2] = 35; }        // rød glorie
  }
  return d;
}

test('veikamera i mørket: baklysene gir bilen foran og avstanden', () => {
  const w = 320, h = 240, f = focalPx(w, h);
  const sep = TAIL_SEP * f / 15;   // en bil 15 m unna
  const r = detectTaillights(nightFrame([[160 - sep / 2, 150, 3], [160 + sep / 2, 150, 3]]), w, h);
  assert.ok(r.lead, JSON.stringify(r));
  assert.ok(Math.abs(r.lead.dist - 15) < 1.5, 'avstand ' + r.lead.dist);
  assert.equal(r.lead.src, 'baklys');
  // Et enkelt lys, lys i ulik høyde, og et par i nabofeltet gir ingen bil rett foran
  assert.equal(detectTaillights(nightFrame([[160, 150, 3]]), w, h).lead, null);
  assert.equal(detectTaillights(nightFrame([[140, 120, 3], [180, 170, 3]]), w, h).lead, null);
  const side = detectTaillights(nightFrame([[40, 150, 3], [80, 150, 3]]), w, h);
  assert.equal(side.lead, null); assert.equal(side.pairs, 1);
  // To biler foran: den nærmeste (bredeste paret) velges
  const near = TAIL_SEP * f / 10, far = TAIL_SEP * f / 30;
  const two = detectTaillights(nightFrame([[160 - far / 2, 120, 2], [160 + far / 2, 120, 2], [160 - near / 2, 170, 4], [160 + near / 2, 170, 4]]), w, h);
  assert.ok(two.lead && Math.abs(two.lead.dist - 10) < 1.2, JSON.stringify(two));
});

test('veikamera i mørket: mange lys, lys mellom paret og store flekker gir ingen bil foran', () => {
  const w = 320, h = 240, f = focalPx(w, h);
  const sep = TAIL_SEP * f / 15;
  // Tredje lys mellom: to biler side om side
  assert.equal(detectTaillights(nightFrame([[160 - sep / 2, 150, 3], [160, 150, 3], [160 + sep / 2, 150, 3]]), w, h).lead, null);
  // Mange lys (kø i flere felt): tvetydig
  const many = [];
  for (let k = 0; k < 10; k++) many.push([20 + k * 30, 150 + (k % 2) * 25, 2]);
  const r = detectTaillights(nightFrame(many), w, h);
  assert.equal(r.lead, null); assert.ok(r.cluttered);
  // Store, uskarpe flekker tett sammen (glare): ingen bil
  assert.equal(detectTaillights(nightFrame([[150, 150, 9], [176, 150, 9]]), w, h).lead, null);
});

test('veikamera: beste bil-score lagres også under grensen, men telles ikke', () => {
  const r = processDetections([{ cls: 'car', score: 0.22, x: 300, y: 300, w: 60, h: 50 }], 640, 480);
  assert.equal(r.cars, 0); assert.equal(r.lead, null); assert.equal(r.best, 0.22);
});

test('veikamera: bilens eget dashbord (bred boks nederst) er ikke en bil foran', () => {
  const W = 720, H = 1280;
  const hood = { cls: 'car', score: 0.9, x: 0, y: 700, w: 719, h: 400 };          // hele bredden, ned i dashbordet
  const car = { cls: 'car', score: 0.7, x: 320, y: 600, w: 90, h: 70 };           // bil foran, over dashbordkanten
  const r = processDetections([hood, car], W, H, { roadBottom: 0.73 });
  assert.ok(r.lead && r.lead.wpx === 90, JSON.stringify(r.lead));
  assert.equal(r.cars, 1);
  // Gamle turer: roadSummary ser bort fra «biler» over 70 % av bildebredden
  const pts = Array.from({ length: 60 }, (_, i) => ({ t: i, kmh: 60, lat: 63, lon: 10 }));
  const samples = Array.from({ length: 50 }, (_, i) => ({ t: i, cars: 1, people: 0, lead: { cls: 'car', dist: 2.5, wpx: 719 } }));
  assert.equal(roadSummary(samples, pts, { frameW: 720 }).follow.length, 0);
  assert.equal(roadSummary(samples, pts).follow.length, 50);
});

test('veikamera: brøytestikker er ikke folk, møtende biler er ikke bilen foran', () => {
  const W = 720, H = 1280;
  const post = { cls: 'person', score: 0.7, x: 100, y: 500, w: 12, h: 120 };      // smal og høy
  const walker = { cls: 'person', score: 0.7, x: 200, y: 500, w: 40, h: 110 };
  assert.equal(processDetections([post, walker], W, H).people, 1);
  // Bil i nabofeltet (utenfor feltlinjene) er ikke bilen foran
  const lane = { left: { xBottom: 260, xTop: 320, yBottom: 900, yTop: 600 }, right: { xBottom: 420, xTop: 360, yBottom: 900, yTop: 600 } };
  const other = { cls: 'car', score: 0.8, x: 400, y: 700, w: 80, h: 60 };          // midt i bildet, men til høyre for høyre linje
  assert.equal(processDetections([other], W, H, { lane }).lead, null);
  const own = { cls: 'car', score: 0.8, x: 300, y: 700, w: 80, h: 60 };
  assert.ok(processDetections([own], W, H, { lane }).lead);
  // Rapporten: en «bil foran» som nærmer seg raskere enn egen fart (60 km/t) er møtende
  const pts = Array.from({ length: 20 }, (_, i) => ({ t: i, kmh: 60, lat: 63, lon: 10 }));
  const samples = [0, 1, 2, 3].map(i => ({ t: 5 + i * 0.5, cars: 1, people: 0, lead: { cls: 'car', dist: 60 - i * 15, wpx: 50 } }));
  assert.equal(roadSummary(samples, pts).follow.length, 0);
  const ahead = [0, 1, 2, 3].map(i => ({ t: 5 + i * 0.5, cars: 1, people: 0, lead: { cls: 'car', dist: 30 - i * 0.5, wpx: 50 } }));
  assert.equal(roadSummary(ahead, pts).follow.length, 4);
});

/* ---------- Huslys er ikke biler (0.13.2) ---------- */
import { onRoad, roadDets } from '../kamera/js/road.js';
/* Veien som feltmodellen så den på nattbildene 2. nov. (kamerabildet 720×1280): en spiss ved 52 % av høyden som
   blir full bredde rett over dashbordkanten. Rader hver 5. piksel, [y, venstre, høyre]. */
function roadRows({ top = 665, full = 820, bottom = 905, tip = [353, 410] } = {}) {
  const rows = [];
  for (let y = top; y <= bottom; y += 5) {
    const f = Math.min(1, (y - top) / (full - top));
    rows.push([y, Math.round(tip[0] * (1 - f)), Math.round(tip[1] + (720 - tip[1]) * f)]);
  }
  return { rows, y0: 581 };
}
test('veikamera: biler må stå på veien foran – huslys over og ved siden av veien er ikke biler', () => {
  const W = 720, H = 1280, road = roadRows();
  const box = (x, bottom, w = 30, h = 24) => ({ cls: 'car', score: 0.7, x, y: bottom - h, w, h });
  assert.ok(onRoad(box(366, 680), road, W, H), 'bil langt framme på veien');
  assert.ok(onRoad(box(366, 655), road, W, H), 'litt over spissen: innenfor slingringsmonnet');
  assert.ok(!onRoad(box(366, 600), road, W, H), 'opplyst vindu over der veien slutter');
  assert.ok(!onRoad(box(640, 700, 40, 30), road, W, H), 'huslys langt til høyre for veien');
  assert.ok(onRoad(box(560, 720, 50, 40), road, W, H), 'parkert bil rett utenfor veikanten (x 520)');
  assert.ok(onRoad(box(0, 880, 60, 50), road, W, H), 'nær bilen godtas alt');
  // Uten svar fra feltmodellen, og når veien ikke smalner til en spiss (borte i mørket) eller går over båndet: ingen sjekk
  assert.ok(onRoad(box(366, 600), null, W, H));
  assert.ok(onRoad(box(366, 600), { rows: road.rows.slice(0, 5), y0: 581 }, W, H), 'for få rader');
  const short = { rows: road.rows.filter(r => r[0] >= 760), y0: 581 };
  assert.ok(onRoad(box(366, 600), short, W, H), 'veien forsvinner i mørket uten å smalne');
  assert.ok(onRoad(box(366, 500), roadRows({ top: 585 }), W, H), 'veien fortsetter over båndet');
  // I gjenkjenningen: huslyset midt i bildet blir ikke bilen foran, og telles ikke
  const light = box(345, 560, 40, 30), car = box(340, 700, 40, 32);
  assert.ok(processDetections([light], W, H, { roadBottom: 0.75 }).lead, 'uten veien: huslyset ble «bil foran»');
  const r = processDetections([light, car], W, H, { roadBottom: 0.75, road });
  assert.equal(r.cars, 1); assert.equal(r.lead.wpx, 40); assert.equal(r.lead.box.y, 668);
  assert.deepEqual(roadDets([light, car, { cls: 'person', score: 0.8, x: 650, y: 560, w: 20, h: 50 }], W, H, 0.75, road).map(d => d.y), [668, 560], 'folk på fortauet vises fortsatt');
});
test('veikamera i mørket: røde lys utenfor veien er ikke baklys', () => {
  const w = 320, h = 240, f = focalPx(w, h), sep = TAIL_SEP * f / 15;
  const frame = nightFrame([[160 - sep / 2, 150, 3], [160 + sep / 2, 150, 3]]);
  assert.ok(detectTaillights(frame, w, h, { onRoad: () => true }).lead);
  let asked = null;
  assert.equal(detectTaillights(frame, w, h, { onRoad: b => { asked = b; return false; } }).lead, null);
  assert.ok(Math.abs(asked.x - (160 - sep / 2)) < 1.5 && Math.abs(asked.w - sep) < 2 && Math.abs(asked.y - 150) < 1.5, JSON.stringify(asked));
});
test('veikamera: høyballer på jordet ved en smal vei er ikke biler, en bil i veikanten er det (0.13.3)', () => {
  const W = 720, H = 1280;
  // Smal vei: 120 px bred ved rad 760 (rundt 4,5 m), spiss ved 665
  const road = roadRows({ tip: [370, 390], full: 1400 });
  const at = road.rows.find(r => r[0] === 760);
  const bale = { cls: 'car', score: 0.6, x: at[2] + 40, y: 730, w: 45, h: 30 };     // 40 px (rundt 1,5 m) ut på jordet
  const parked = { cls: 'car', score: 0.7, x: at[2] - 15, y: 728, w: 60, h: 32 };   // står litt inn på veien
  assert.ok(!onRoad(bale, road, W, H), JSON.stringify({ at, bale }));
  assert.ok(onRoad(parked, road, W, H));
});
