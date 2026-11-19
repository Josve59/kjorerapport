/* Øving på plass (0.26.4): kjennes igjen, og poengene uten den regnes med samme formel som analysis.js */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeDemo } from '../js/analysis.js';
import { practiceSpans, rescore, inSpans, PRACTICE } from '../js/practice.js';

const M = 1 / 111320;   // grader breddegrad per meter
const drive = parts => { const pts = []; let t = 0; for (const f of parts) for (let i = 0; i < f.n; i++) { pts.push({ t, ...f.at(i), kmh: f.kmh }); t++; } return pts; };

test('øving på plass: bilen kjører rundt på et lite område', () => {
  // 3 min rett fram i 50 km/t, så 3 min i ring (radius 40 m, 20 km/t), så 3 min rett fram igjen
  const straight = (lat0) => ({ n: 180, kmh: 50, at: i => ({ lat: lat0 + i * 14 * M, lon: 10 }) });
  const ring = { n: 180, kmh: 20, at: i => ({ lat: 63.05 + 40 * M * Math.cos(i / 7), lon: 10 + 40 * M * 2 * Math.sin(i / 7) }) };
  const pts = drive([straight(63), ring, straight(63.06)]);
  const spans = practiceSpans(pts);
  assert.equal(spans.length, 1);
  assert.ok(spans[0].from >= 180 - PRACTICE.pad - 1 && spans[0].from <= 200, `fra ${spans[0].from}`);
  assert.ok(spans[0].to >= 350 && spans[0].to <= 360 + PRACTICE.pad, `til ${spans[0].to}`);
  assert.ok(inSpans(270, spans) && !inSpans(60, spans) && !inSpans(500, spans));
  // Kø eller stillestående: kort vei, ikke øving
  assert.deepEqual(practiceSpans(drive([{ n: 300, kmh: 2, at: i => ({ lat: 63 + i * 0.5 * M, lon: 10 }) }])), []);
});

test('poengene uten øving på plass: samme formel som analysemotoren', () => {
  for (const seed of [3, 7, 11, 19]) {
    const r = analyze(makeDemo(seed), { engine: 'v3' });
    const same = rescore(r, []);
    assert.deepEqual(same.scores, r.scores, `frø ${seed}`);
    assert.equal(same.overall, r.overall);
    assert.deepEqual(same.counts, r.counts);
    // Alle hendelsene på plass: bremsing, gass og sving blir 100
    const all = rescore(r, [{ from: -1, to: 1e9 }]);
    assert.equal(all.practice.length, r.events.length);
    assert.equal(all.scores.brake, 100);
    assert.equal(all.scores.turn, 100);
    assert.equal(all.scores.smooth, r.scores.smooth);
  }
});
