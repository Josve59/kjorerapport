import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanes, dashLine, rowMeans } from '../kamera/js/lanes.js';

/* Lager et gråtonebilde med vei, to feltlinjer og litt støy. Linjene går fra (xb, h·0.95) opp mot (xt, h·0.5). */
function road(w, h, lines, { dashed = false, noise = 12, seed = 3 } = {}) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = y < h * 0.45 ? 160 : 70 + rnd() * noise;
  for (const [xb, xt] of lines) {
    const yb = h * 0.95, yt = h * 0.5;
    for (let y = Math.floor(yt); y < yb; y++) {
      if (dashed && Math.floor(y / 8) % 2) continue;
      const f = (y - yt) / (yb - yt), xc = xt + (xb - xt) * f, half = 0.6 + 1.4 * f;
      for (let x = Math.round(xc - half); x <= Math.round(xc + half); x++) if (x >= 0 && x < w) g[y * w + x] = 210;
    }
  }
  return g;
}

test('feltlinjer: begge linjene finnes, og sideavviket stemmer', () => {
  const w = 160, h = 120;
  const r = detectLanes(road(w, h, [[38, 74], [127, 86]]), w, h);
  assert.ok(r.left && r.right, JSON.stringify(r));
  const xl = 38 + (74 - 38) * (1 - (h * 0.92 - h * 0.5) / (h * 0.45)), xr = 127 + (86 - 127) * (1 - (h * 0.92 - h * 0.5) / (h * 0.45));
  assert.ok(Math.abs(r.left.xBottom - xl) < 3 && Math.abs(r.right.xBottom - xr) < 3, `${r.left.xBottom} ${xl} ${r.right.xBottom} ${xr}`);
  const expected = ((w / 2) - (xl + xr) / 2) / (xr - xl) * 3.25;
  assert.ok(Math.abs(r.offset - expected) < 0.15, `${r.offset} vs ${expected}`);
});

test('feltlinjer: stiplet midtlinje og bil til høyre i feltet', () => {
  const w = 160, h = 120;
  const r = detectLanes(road(w, h, [[20, 66], [110, 80]], { dashed: true }), w, h);
  assert.ok(r.left && r.right);
  assert.ok(r.offset > 0.3, 'bilen ligger til høyre for midten: ' + r.offset);
});

test('feltlinjer: ingen linjer gir ingen treff', () => {
  const r = detectLanes(road(160, 120, []), 160, 120);
  assert.equal(r.left, null);
  assert.equal(r.right, null);
  assert.equal(r.offset, null);
});

test('feltlinjer: i mørket (linjer i lyset fra frontlyktene) finnes linjene etter kontraststrekk', () => {
  const w = 160, h = 120;
  const day = road(w, h, [[38, 74], [127, 86]]);
  const dark = day.map(v => Math.round(v * 0.3));   // asfalt ~22, linjer ~63: under dagsterskelen på 90
  const r = detectLanes(dark, w, h);
  assert.ok(r.night && r.left && r.right, JSON.stringify({ night: r.night, l: !!r.left, r: !!r.right }));
  const d = detectLanes(day, w, h);
  assert.ok(Math.abs(r.offset - d.offset) < 0.15, `natt ${r.offset} dag ${d.offset}`);
  assert.equal(detectLanes(new Uint8Array(w * h).fill(8), w, h).left, null, 'helt svart bilde: ingen linjer');
});

test('dashbordkant: øverste tydelige overgang fra vei til mørkt dashbord fra 60 % og ned', () => {
  // Stående bilde: himmel mørk (natt), vei lys til 72 %, dashbord mørkt, lys list ved 90 %, mørkt under
  const h = 200, row = y => (y < 0.35 * h ? 20 : y < 0.72 * h ? 140 : y < 0.89 * h ? 30 : y < 0.91 * h ? 120 : 15);
  const rm = Float32Array.from({ length: h }, (_, y) => row(y));
  const d = dashLine(rm);
  assert.ok(Math.abs(d - 0.72) < 0.02, 'kant ' + d);
  // Dagslys: lys himmel over mørkere landskap (horisont ved 50 %) og dashbord ved 87 %
  const day = Float32Array.from({ length: h }, (_, y) => (y < 0.5 * h ? 200 : y < 0.87 * h ? 110 : 25));
  assert.ok(Math.abs(dashLine(day) - 0.87) < 0.02, 'dag ' + dashLine(day));
  assert.equal(dashLine(new Float32Array(h).fill(90)), null, 'ingen kant');
  const g = new Uint8Array(4 * 3).fill(10); g[4] = 50;
  assert.equal(rowMeans(g, 4, 3)[1], 20);
});

/* 0.12.5: veikanter og ytre linjer tas ikke for feltet */
test('feltlinjer: overgang fra asfalt til lyst fortau er ingen feltlinje', () => {
  const w = 160, h = 120, g = road(w, h, [[38, 74]]);
  // Lyst fortau til høyre for en kant som går mot forsvinningspunktet
  for (let y = Math.floor(h * 0.5); y < h; y++) {
    const f = (y - h * 0.5) / (h * 0.45), xe = Math.round(86 + (127 - 86) * f);
    for (let x = xe; x < w; x++) g[y * w + x] = 190;
  }
  const r = detectLanes(g, w, h);
  assert.ok(r.left, 'venstre linje finnes');
  assert.equal(r.right, null, 'fortauskanten er ikke en feltlinje: ' + JSON.stringify(r.right));
});
test('feltlinjer: den innerste linjen velges, ikke en sterkere linje lenger ut', () => {
  const w = 160, h = 120;
  // Stiplet kantlinje i feltet, og en heltrukken lys linje lenger ut (rekkverk, kant av gang- og sykkelvei)
  const g = road(w, h, [[38, 74], [118, 84]], { dashed: true });
  const outer = road(w, h, [[156, 92]]);
  for (let i = 0; i < g.length; i++) if (outer[i] === 210) g[i] = 210;
  const r = detectLanes(g, w, h);
  assert.ok(r.right, 'høyre linje finnes');
  const want = 118 + (84 - 118) * (1 - (h * 0.92 - h * 0.5) / (h * 0.45));
  assert.ok(Math.abs(r.right.xBottom - want) < 4, `innerste linje: ${r.right.xBottom} mot ${want}`);
});

/* 0.12.6: linjene over tid */
import { createLaneTracker } from '../kamera/js/lanes.js';
test('feltlinjer over tid: ny linje vises etter to bilder, og står en stund når den faller ut', () => {
  const L = x => ({ xBottom: x, xTop: x + 30, yBottom: 100, yTop: 60 }), R = x => ({ xBottom: x, xTop: x - 30, yBottom: 100, yTop: 60 });
  const tr = createLaneTracker({ need: 2, hold: 3 }), w = 160;
  assert.equal(tr.step({ left: L(20), right: R(140), offset: 0.1 }, w).left, null, 'første bilde: ikke vist ennå');
  let o = tr.step({ left: L(21), right: R(139), offset: 0.1 }, w);
  assert.ok(o.left && o.right); assert.equal(o.offset, 0.1);
  o = tr.step({ left: null, right: R(139), offset: null }, w);
  assert.ok(o.left && o.left.held, 'venstre står selv om den ikke ble sett'); assert.equal(o.offset, null);
  o = tr.step({ left: L(120), right: R(139) }, w);   // én feilaktig linje langt unna
  assert.ok(o.left && Math.abs(o.left.xBottom - 21) < 1, 'et enkelt feiltreff flytter ikke linjen');
  for (let i = 0; i < 3; i++) o = tr.step({ left: null, right: R(139) }, w);
  assert.equal(o.left, null, 'borte etter en stund');
});

/* 0.13.0: punkter fra feltmodellen i stedet for bildet */
test('feltlinjer fra feltmodellen: punktene gir linjene, bildet brukes ikke', () => {
  const w = 160, h = 120, pts = [];
  for (let y = 60; y <= 112; y += 1) {
    const f = (y - h * 0.5) / (h * 0.45);
    pts.push({ x: 74 + (38 - 74) * f, y }, { x: 86 + (127 - 86) * f, y });
  }
  const blank = new Uint8Array(w * h).fill(70);   // ingenting å se i bildet
  const r = detectLanes(blank, w, h, { points: pts });
  assert.ok(r.left && r.right && r.ml, JSON.stringify(r));
  assert.equal(detectLanes(blank, w, h, { points: [] }).left, null);
});

/* ---------- Lysere bilde til feltmodellen i mørket (0.13.2) ---------- */
import { laneGamma } from '../kamera/js/lanes.js';
test('feltmodellen i mørket: bildet lysnes under lys 50, mest i det mørkeste, og glir over uten hopp', () => {
  assert.equal(laneGamma(60), 1); assert.equal(laneGamma(50), 1); assert.equal(laneGamma(null), 1); assert.equal(laneGamma(0), 1);
  assert.equal(laneGamma(15), 0.45, 'turen 6. nov. kl. 22.39, motorveien i stummende mørke');
  assert.equal(laneGamma(27), 0.6, 'turen 9. nov. kl. 17.50, minutt 12–13');
  // Snittet løftes mot 70 i det mørke, og kurven går jevnt mot 1
  for (const lum of [10, 20, 30]) { const g = laneGamma(lum); assert.ok(Math.abs(255 * (lum / 255) ** g - 70) < 12, `lys ${lum} → ${Math.round(255 * (lum / 255) ** g)}`); }
  let prev = laneGamma(4);
  for (let lum = 5; lum <= 55; lum++) { const g = laneGamma(lum); assert.ok(g >= prev && g - prev <= 0.1, `lys ${lum}: ${prev} → ${g}`); prev = g; }
});

/* ---------- Veikanten på veier uten oppmalte linjer (0.13.3) ---------- */
import { roadEdgeLines, laneX } from '../kamera/js/lanes.js';
test('smal vei uten linjer: høyre veikant og midten av veien fra feltmodellens vei', () => {
  // Analysebildet 240×427, horisonten ved rad 220. En 5 m bred vei, bilen 1 m til høyre for midten, kamerahøyde 1,2 m:
  // x = 120 + X·d/1,2 (X sideveis i meter, d rader under horisonten). Veien går ut av bildet nederst.
  const vh = 220, xAt = (X, y) => 120 + X * (y - vh) / 1.2;
  const road = [];
  for (let y = 224; y <= 330; y += 2) road.push([y, Math.max(0, Math.round(xAt(-3.5, y))), Math.min(240, Math.round(xAt(1.5, y)))]);
  road.push([332, 200, 240], [334, 230, 240]);                     // panseret skygger: smale biter nederst
  const { left, right } = roadEdgeLines(road, 240, { vh, yBottom: 330 });
  assert.equal(right.edge, 'kant'); assert.equal(left.edge, 'midt');
  for (const y of [240, 260, 280]) {
    assert.ok(Math.abs(laneX(right, y) - xAt(1.5, y)) < 2, `høyre kant ved ${y}: ${laneX(right, y)} mot ${xAt(1.5, y)}`);
    assert.ok(Math.abs(laneX(left, y) - xAt(-1, y)) < 2.5, `midten ved ${y}: ${laneX(left, y)} mot ${xAt(-1, y)}`);
  }
  // Nederst er kanten utenfor bildet, men linjen fortsetter riktig dit
  assert.ok(Math.abs(laneX(right, 330) - xAt(1.5, 330)) < 6);
  // For lite vei: ingen linjer
  assert.deepEqual(roadEdgeLines(road.slice(0, 3), 240, { vh, yBottom: 330 }), { left: null, right: null });
  assert.deepEqual(roadEdgeLines(null, 240, { vh, yBottom: 330 }), { left: null, right: null });
});

/* 0.13.9: følgeren teller svar og tid, ikke bilder */
test('feltlinjer over tid: samme svar telles ikke to ganger, og en tapt linje står i tid', () => {
  const L = x => ({ xBottom: x, xTop: x + 30, yBottom: 100, yTop: 60 }), R = x => ({ xBottom: x, xTop: x - 30, yBottom: 100, yTop: 60 });
  const tr = createLaneTracker({ holdMs: 800 }), w = 160, a = { left: L(20), right: R(140), offset: 0.1 };
  assert.equal(tr.step(a, w, { t: 0 }).left, null, 'første svar: ikke vist ennå');
  assert.equal(tr.step(a, w, { t: 120, fresh: false }).left, null, 'samme svar en gang til teller ikke');
  let o = tr.step({ left: L(21), right: R(139), offset: 0.1 }, w, { t: 330 });
  assert.ok(o.left && o.right, 'andre svar: vist');
  // Begge borte: linjene står i 800 ms, også i bildene uten nytt svar
  const none = { left: null, right: null, offset: null };
  o = tr.step(none, w, { t: 660 });
  assert.ok(o.left && o.left.held && !o.left.carried);
  o = tr.step(none, w, { t: 1000 });
  assert.ok(o.left, 'ett tapt svar til tar ikke linjen (0,67 s)');
  o = tr.step(none, w, { t: 1150, fresh: false });
  assert.equal(o.left, null, 'borte etter 0,8 s, også uten nytt svar');
});

test('feltlinjer over tid: en tapt linje følger feltbredden mens den andre ses', () => {
  const L = x => ({ xBottom: x, xTop: x + 30, yBottom: 100, yTop: 60 }), R = x => ({ xBottom: x, xTop: x - 30, yBottom: 100, yTop: 60 });
  const tr = createLaneTracker({ holdMs: 800, carryMs: 2200 }), w = 160;
  tr.step({ left: L(20), right: R(140) }, w, { t: 0 });
  tr.step({ left: L(20), right: R(140) }, w, { t: 330 });
  // Venstre faller ut, høyre flytter seg: detectLanes tegner venstre etter feltbredden (predicted)
  const lost = x => ({ left: { ...L(x), predicted: true }, right: R(x + 120), offset: null });
  let o = tr.step(lost(26), w, { t: 660 });
  assert.ok(o.left.carried && o.left.held && !o.left.predicted, 'vises heltrukket');
  assert.equal(o.left.xBottom, 26, 'og følger den andre linjen i stedet for å stå stille');
  assert.equal(o.offset, null, 'sideavvik bare når begge er sett');
  o = tr.step(lost(30), w, { t: 2400 });
  assert.ok(o.left.carried, 'bæres lenger enn en linje som bare står');
  o = tr.step(lost(30), w, { t: 3000 });
  assert.ok(o.left.predicted && !o.left.carried, 'etter 2,2 s: stiplet etter feltbredden, som før');
  // Tilbake på det nye stedet: sees igjen etter to svar
  tr.step({ left: L(30), right: R(150) }, w, { t: 3330 });
  o = tr.step({ left: L(30), right: R(150), offset: 0.2 }, w, { t: 3660 });
  assert.ok(o.left && !o.left.held && o.offset === 0.2);
});

test('feltlinjer over tid: en båret linje kjennes igjen med en gang når den ses igjen', () => {
  const L = x => ({ xBottom: x, xTop: x + 30, yBottom: 100, yTop: 60 }), R = x => ({ xBottom: x, xTop: x - 30, yBottom: 100, yTop: 60 });
  const tr = createLaneTracker(), w = 160;
  tr.step({ left: L(20), right: R(120) }, w, { t: 0 });
  tr.step({ left: L(20), right: R(120) }, w, { t: 330 });
  // Venstre borte i 1,3 s mens bilen flytter seg 40 piksler til siden: langt fra der linjen sist ble sett
  let o;
  for (let i = 1; i <= 4; i++) o = tr.step({ left: { ...L(20 + i * 10), predicted: true }, right: R(120 + i * 10) }, w, { t: 330 + i * 330 });
  assert.ok(o.left.carried && o.left.xBottom === 60);
  o = tr.step({ left: L(62), right: R(160), offset: 0.3 }, w, { t: 1980 });
  assert.ok(o.left && !o.left.held && !o.left.carried, 'sett igjen i første svar, uten blink');
  assert.equal(o.offset, 0.3);
});

/* 0.13.15: plasseringen i feltet måles fra linjenes forsvinningspunkt, så en vridd telefon ikke forskyver den */
test('plassering i feltet: en vridd telefon flytter ikke bilen i feltet', () => {
  const w = 160, h = 120;
  // Punkter på to rette linjer som møtes i (xv, 54): bilen midt i feltet, feltet 80 piksler bredt nederst (y = 110)
  const scene = xv => { const pts = []; for (let y = 66; y <= 110; y++) { const f = (y - 54) / 56; pts.push({ x: xv - 40 * f, y }, { x: xv + 40 * f, y }); } return pts; };
  const blank = new Uint8Array(w * h).fill(70);
  const straight = detectLanes(blank, w, h, { points: scene(80) });
  const turned = detectLanes(blank, w, h, { points: scene(92) });   // telefonen vridd: alt flyttet 12 piksler
  assert.ok(straight.left && straight.right && turned.left && turned.right);
  assert.ok(Math.abs(straight.offset) < 0.1, 'rett fram: ' + straight.offset);
  assert.ok(Math.abs(turned.offset) < 0.1, 'vridd: fortsatt midt i feltet, ikke ' + turned.offset);
  // Bilen 20 piksler (en fjerdedel av feltet) til høyre for midten, telefonen rett: linjene flytter seg nederst, ikke i det fjerne
  const off = []; for (let y = 66; y <= 110; y++) { const f = (y - 54) / 56; off.push({ x: 80 - 60 * f, y }, { x: 80 + 20 * f, y }); }
  const right = detectLanes(blank, w, h, { points: off });
  assert.ok(right.offset > 0.6 && right.offset < 1.0, 'en fjerdedel av 3,25 m til høyre: ' + right.offset);
});
