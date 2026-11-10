import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overTime } from '../js/format.js';
import { scoreRing } from '../js/report.js';
import { icon, MARK_CATS } from '../js/ui.js';
import { GUIDES } from '../js/guides.js';

test('tid over fartsgrensen: sekunder når det er lite, minutter ellers', () => {
  assert.equal(overTime(1), '1 sekund');
  assert.equal(overTime(37.4), '37 sekunder');
  assert.equal(overTime(89), '89 sekunder');
  assert.equal(overTime(376), '6 minutter');
  assert.equal(overTime(37, true), '37 s');
  assert.equal(overTime(376, true), '6 min');
  assert.equal(overTime(-5), '0 sekunder');
});

test('poengringen har en bue som kan fylles i takt med tallet', () => {
  const svg = scoreRing(64);
  const m = svg.match(/class="score-arc" data-c="([\d.]+)"[^>]*stroke-dasharray="([\d.]+) ([\d.]+)"/);
  assert.ok(m, 'buen mangler');
  assert.equal(Number(m[1]), Number(m[3]));
  assert.ok(Math.abs(Number(m[2]) / Number(m[3]) - 0.64) < 0.01);
});

test('egne ikoner for kamera, gjentatt rute og fartsgrenseskilt', () => {
  for (const n of ['camera', 'repeat', 'sign']) assert.match(icon(n), /<path d="M/, n);
  assert.equal(MARK_CATS.grense.icon, 'sign');
  assert.notEqual(MARK_CATS.grense.icon, MARK_CATS.fart.icon);
  assert.equal(GUIDES.find(g => g.id === 'camera').icon, 'camera');
});
