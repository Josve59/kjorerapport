import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportLocked, gateFor, hasPlus, setDevPlus, FREE_REPORTS, PLUS_FEATURES } from '../js/plus.js';

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
  assert.equal(gateFor('#/opplaering'), 'plan');
  assert.equal(gateFor('#/faresteder'), 'plan');
  assert.equal(gateFor('#/trafikklaerer'), 'teacher');
  assert.equal(gateFor('#/'), null);
  assert.equal(gateFor('#/rapport/x'), null);
  for (const k of ['camera', 'plan', 'teacher', 'history']) assert.ok(PLUS_FEATURES[k].title && PLUS_FEATURES[k].text);
});

test('utenfor iPhone-appen har alle Pluss, og utviklerbryteren overstyrer', () => {
  assert.equal(hasPlus(), true);
  setDevPlus(false); assert.equal(hasPlus(), false);
  setDevPlus(true); assert.equal(hasPlus(), true);
  setDevPlus(null); assert.equal(hasPlus(), true);
});
