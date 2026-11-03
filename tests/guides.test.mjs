import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDES, guideFor, isDarkSeason } from '../js/guides.js';

const base = { real: 0, cameraOn: false, calibrated: false, roadCam: false, native: true, unbacked: 0, dark: false };

test('første gang: «Slik fungerer det»', () => {
  assert.equal(guideFor(base).id, 'start');
});

test('en lukket guide vises ikke, neste som passer kommer i stedet', () => {
  assert.equal(guideFor(base, { start: true }).id, 'holder');
  assert.equal(guideFor({ ...base, real: 5 }, {}).id, 'report');
});

test('kameraguiden bare når kameraet er på', () => {
  const ctx = { ...base, real: 4 };
  assert.notEqual(guideFor(ctx, { report: true }).id, 'camera');
  assert.equal(guideFor({ ...ctx, cameraOn: true }, { report: true }).id, 'camera');
});

test('alt lukket: ingen guide', () => {
  const all = Object.fromEntries(GUIDES.map(g => [g.id, true]));
  assert.equal(guideFor({ ...base, real: 10, cameraOn: true, unbacked: 5, dark: true }, all), null);
});

test('hver guide har id, tittel, ingress og minst to steg', () => {
  const ids = new Set();
  for (const g of GUIDES) {
    assert.ok(g.id && !ids.has(g.id), g.id); ids.add(g.id);
    assert.ok(g.title && g.lead && g.icon);
    assert.ok(g.steps.length >= 2 && g.steps.every(s => s.length === 2 && s[0] && s[1]));
  }
});

test('mørketid oktober–februar', () => {
  assert.equal(isDarkSeason(new Date(2026, 10, 3)), true);
  assert.equal(isDarkSeason(new Date(2026, 5, 3)), false);
});
