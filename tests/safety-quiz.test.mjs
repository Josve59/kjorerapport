/* Quizen om sikkerhetskontrollen (0.28.1): spørsmålene henger sammen med oppgavene og tegningene */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFETY_QUIZ } from '../js/safety-quiz.js';
import { SAFETY, SAFETY_AREAS } from '../js/safety-check.js';
import { FIGURE_KEYS } from '../js/trafficsvg.js';
import { safetyFor } from '../js/theory.js';

test('hvert spørsmål hører til en oppgave, med fire ulike svar', () => {
  const ids = new Set(), tasks = new Map(SAFETY.map(t => [t.id, t])), keys = new Set(FIGURE_KEYS);
  for (const q of SAFETY_QUIZ) {
    assert.ok(!ids.has(q.id), `id ${q.id} finnes to ganger`); ids.add(q.id);
    const t = tasks.get(q.task); assert.ok(t, `${q.id}: ukjent oppgave ${q.task}`);
    assert.equal(q.area, t.area, `${q.id}: område`);
    assert.equal(q.car || 'alle', t.car || 'alle', `${q.id}: biltype`);
    assert.ok(SAFETY_AREAS.some(a => a.id === q.area));
    assert.equal(q.a.length, 4, `${q.id}: fire svar`);
    assert.equal(new Set(q.a.map(x => x.trim().toLowerCase())).size, 4, `${q.id}: like svar`);
    assert.ok(q.q && q.why && q.ref, `${q.id}: tekst mangler`);
    for (const k of [q.img, q.wimg]) if (k) assert.ok(keys.has(k.replace(/:anon$/, '')), `${q.id}: tegningen ${k} finnes ikke`);   // «:anon» = symbolet uten navn
    assert.ok(/^Sikkerhetskontroll · /.test(q.eyebrow));
  }
});

test('quizen følger biltypen', () => {
  const el = safetyFor(SAFETY_QUIZ, 'el'), fossil = safetyFor(SAFETY_QUIZ, 'fossil');
  assert.ok(el.every(q => q.car !== 'fossil'));
  assert.ok(fossil.every(q => q.car !== 'el'));
});
