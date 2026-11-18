import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportLocked, gateFor, hasPlus, hasTheory, hasFeature, setDevPlus, FREE_REPORTS, FREE_THEORY, PLUS_FEATURES, _setStateForTest } from '../js/plus.js';
import { QUESTIONS, THEMES } from '../js/theory-b.js';
import { SIGN_QUESTIONS, SIGN_PICK_QUESTIONS } from '../js/theory-signs.js';
import { PUZZLE_BY_SCENE } from '../js/theory-crossings.js';

const drives = Array.from({ length: 14 }, (_, i) => ({ id: 'd' + i, startedAt: new Date(Date.UTC(2026, 10, 1, 8 + i)).toISOString() }));

test('uten Pluss: de 10 siste ekte turene er åpne, eldre er låst', () => {
  assert.equal(FREE_REPORTS, 10);
  assert.equal(reportLocked(drives, 'd13', false), false, 'nyeste');
  assert.equal(reportLocked(drives, 'd4', false), false, '10. nyeste');
  assert.equal(reportLocked(drives, 'd3', false), true, '11. nyeste');
  assert.equal(reportLocked(drives, 'd0', true), false, 'med Pluss er alt åpent');
});

test('demoturer og importerte turer teller ikke og er aldri låst', () => {
  const list = [...drives, { id: 'demo', startedAt: '2026-11-03T20:00:00Z', demo: true }, { id: 'imp', startedAt: '2020-01-01T00:00:00Z', imported: true }];
  assert.equal(reportLocked(list, 'demo', false), false);
  assert.equal(reportLocked(list, 'imp', false), false);
  assert.equal(reportLocked(list, 'd4', false), false, 'demoturen skyver ikke ekte turer ut');
});

test('skjermene som hører til Pluss', () => {
  assert.equal(gateFor('#/kamera'), 'camera');
  assert.equal(gateFor('#/opplaering'), null, 'Opplæring-fanen er åpen');
  assert.equal(gateFor('#/opplaering/teori'), null);
  assert.equal(gateFor('#/opplaering/laereplan'), 'plan');
  assert.equal(gateFor('#/faresteder'), 'plan');
  assert.equal(gateFor('#/trafikklaerer'), null, 'samtalen med læreren er gratis (0.18.3)');
  assert.equal(gateFor('#/klar'), 'ready');
  assert.equal(gateFor('#/'), null);
  assert.equal(gateFor('#/rapport/x'), null);
  for (const k of ['camera', 'plan', 'teacher', 'ready', 'history']) assert.ok(PLUS_FEATURES[k].title && PLUS_FEATURES[k].text);
});

test('utenfor iPhone-appen har alle Pluss, og utviklerbryteren overstyrer', () => {
  assert.equal(hasPlus(), true);
  setDevPlus(false); assert.equal(hasPlus(), false);
  setDevPlus(true); assert.equal(hasPlus(), true);
  setDevPlus(null); assert.equal(hasPlus(), true);
});

test('0.23.0: teorien hører til Pluss, også i nettversjonen; oversikten og øvingen er åpne for de gratis spørsmålene', () => {
  for (const h of ['#/teori/prove', '#/teori/resultat', '#/teori/skilt', '#/teori/skiltkort', '#/teori/kryss', '#/teori/bok', '#/sikkerhetskontroll', '#/sikkerhetskontroll/ov', '#/pluss/teori']) assert.equal(gateFor(h), 'theory', h);
  assert.equal(gateFor('#/opplaering/teori'), null, 'oversikten viser de gratis spørsmålene');
  assert.equal(gateFor('#/teori/ov'), null, 'øvingen sperres i theoryui.js, utenom de gratis');
  assert.equal(Object.keys(PLUS_FEATURES)[0], 'theory', 'teorien står først på Pluss-siden');
  assert.equal(hasPlus(), true, 'resten av nettversjonen er gratis som før');
  assert.equal(hasTheory(), false, 'men teorien kan ikke kjøpes der');
  assert.equal(hasFeature('theory'), false);
  assert.equal(hasFeature('camera'), true);
  setDevPlus(true); assert.equal(hasTheory(), true, 'utviklerbryteren låser opp');
  setDevPlus(false); assert.equal(hasTheory(), false);
  setDevPlus(null);
});

test('0.23.0: de 10 gratis spørsmålene finnes, er ulike, har tegning og viser bredden', () => {
  const all = new Map(QUESTIONS.concat(SIGN_QUESTIONS, SIGN_PICK_QUESTIONS).map(q => [q.id, q]));
  assert.equal(FREE_THEORY.length, 10);
  assert.equal(new Set(FREE_THEORY).size, 10);
  const qs = FREE_THEORY.map(id => all.get(id));
  qs.forEach((q, i) => assert.ok(q, `${FREE_THEORY[i]} finnes`));
  qs.forEach(q => assert.ok(q.img || q.wimg || q.imgs, `${q.id} har en tegning`));
  const themes = new Set(qs.map(q => q.t || 'skilt'));
  assert.ok(THEMES.every(t => themes.has(t.id)), `alle sju temaene: ${[...themes].join(',')}`);
  assert.ok(qs.some(q => PUZZLE_BY_SCENE.has(String(q.img).replace(/^scene:/, ''))), 'minst ett kryss som spilles av');
  assert.ok(qs.some(q => q.pick), 'minst ett med bilder som svar');
});

test('0.24.0: antall spørsmål i Pluss-teksten og App Store-teksten stemmer med spørsmålslista', async () => {
  const { QUESTIONS } = await import('../js/theory-b.js');
  const { SIGNS } = await import('../js/theory-signs.js');
  const fs = await import('node:fs');
  const n = String(QUESTIONS.length);
  assert.ok(PLUS_FEATURES.theory.text.includes(`Alle ${n} spørsmålene`), `Pluss-teksten skal si ${n}`);
  const desc = fs.readFileSync(new URL('../appstore/beskrivelse.txt', import.meta.url), 'utf8');
  assert.ok(desc.includes(`${n} spørsmål`), `beskrivelse.txt skal si ${n} spørsmål`);
  assert.ok(desc.includes(`alle ${SIGNS.length} skiltene`), `beskrivelse.txt skal si ${SIGNS.length} skilt`);
});
