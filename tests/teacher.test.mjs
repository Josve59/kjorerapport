import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teacherSummary, teacherText, teacherHtml, fmtHours } from '../js/teacher.js';

// Oppdiktede turer (nyeste først), slik gatherRows lager dem
const log = (by, land, motor, dark) => ({ sec: { by, land, motor }, km: { by: by / 120, land: land / 60, motor: motor / 40 }, light: { day: by + land + motor - dark, twilight: 0, dark }, lightKm: { day: 0, twilight: 0, dark: 0 }, total: { sec: by + land + motor, km: by / 120 + land / 60 + motor / 40 } });
const row = (day, score, cats, extra = {}) => ({
  d: { startedAt: `2026-11-${String(day).padStart(2, '0')}T16:00:00.000Z`, note: extra.note || '' },
  res: { overall: score, scores: cats, stats: { km: 20 }, maneuvers: { roundabouts: [{}, {}], laneChanges: [{}] }, camera: extra.camera || null },
  log: log(900, 600, 300, extra.dark || 0), sp: extra.sp || null, road: null, marks: extra.marks || []
});
const rows = [
  row(9, 88, { brake: 92, accel: 80, turn: 95, smooth: 90 }, { dark: 1200, sp: { secondsOver: 20 }, marks: [{ cat: 'speil', note: 'glemte speil i rundkjøring' }], camera: { calibrated: true, lane: [{ mirror: true }, { mirror: false }, { mirror: null }] } }),
  row(7, 84, { brake: 90, accel: 78, turn: 94, smooth: 88 }, { note: 'Rundkjøringer på Tiller' }),
  row(5, 74, { brake: 85, accel: 70, turn: 92, smooth: 80 }),
  row(2, 70, { brake: 80, accel: 66, turn: 90, smooth: 78 }),
  row(1, 60, { brake: 70, accel: 60, turn: 88, smooth: 70 })   // før forrige time
];

test('trafikklærer: bare turer siden forrige time, med tid, mørke, manøvrer og utvikling', () => {
  const s = teacherSummary(rows, { from: Date.parse('2026-11-02T00:00:00Z'), driver: 'Jo', plan: { tgk: { done: true } }, now: new Date('2026-11-10') });
  assert.equal(s.count, 4);
  assert.equal(s.time, 4 * 1800);
  assert.equal(s.light.dark, 1200);
  assert.deepEqual(s.maneuvers, { roundabouts: 8, laneChanges: 4, junctions: 0 });
  assert.equal(s.score.early, 72); assert.equal(s.score.late, 86, 'første halvdel mot siste');
  assert.deepEqual(s.mirrors, { lanes: 2, seen: 1 }, 'ukjente (null) telles ikke');
  assert.ok(s.work.some(w => w.id === 'accel'), 'akselerasjon bør jobbes med');
  assert.ok(s.good.includes('Svinger'));
  assert.equal(s.marks.speil, 1);
  assert.equal(s.notes.length, 2);
  assert.ok(s.plan[0].items.find(i => i.id === 'tgk').done);
  const txt = teacherText(s, { note: 'Hvordan øver vi rundkjøring med to felt?' });
  assert.match(txt, /4 turer, 2 t 00 min/);
  assert.match(txt, /bedre: snittet gikk fra 72 til 86/);
  assert.match(txt, /Spørsmål til trafikklæreren: Hvordan øver vi/);
  assert.match(teacherHtml(s), /Bør jobbes med/);
});

test('trafikklærer: tomt tidsrom', () => {
  const s = teacherSummary(rows, { from: Date.parse('2026-12-01T00:00:00Z') });
  assert.equal(s.count, 0);
  assert.match(teacherText(s), /Ingen turer/);
  assert.match(teacherHtml(s), /Ingen turer i perioden/);
  assert.equal(fmtHours(3900), '1 t 05 min');
});

test('teori og sikkerhetskontroll på trafikklærersiden (0.15.0)', () => {
  const theory = { level: 'nesten', taken: 2, passed: 1, last: { correct: 40, total: 45, passed: true, at: 1 }, learned: 120, total: 235, signs: 12, signsTotal: 50, safety: { known: 30, total: 43 } };
  const s = teacherSummary([], { from: Date.parse('2026-12-01T00:00:00Z') });
  // Også uten turer i perioden skal teorien vises
  assert.match(teacherText(s, { theory }), /Teori: siste øveprøve 40 av 45 \(bestått\), 1 av 2 øveprøver bestått, 120 av 235 spørsmål lært, 12 av 50 skilt lært, sikkerhetskontroll 30 av 43 oppgaver\./);
  const html = teacherHtml(s, { theory });
  assert.match(html, /Ingen turer i perioden/);
  assert.match(html, /Teori og sikkerhetskontroll/);
  assert.match(html, /40 av 45 · bestått/);
  // Uten øving: ingen teorilinje og ikke noe kort
  assert.doesNotMatch(teacherText(s), /Teori:/);
  assert.doesNotMatch(teacherHtml(s), /Teori og sikkerhetskontroll/);
  assert.match(teacherText(s, { theory: { ...theory, taken: 7, passed: 4, last: { correct: 33, total: 45, passed: false, at: 2 } } }), /33 av 45 \(ikke bestått\), 4 av de 5 siste øveprøvene bestått/);
});
