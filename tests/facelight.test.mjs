/* js/facelight.js: hvor mye førerbildet lysnes i mørket (0.13.10) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceLight, meanLum } from '../js/facelight.js';

test('førerbildet i mørket: lyst bilde røres ikke, mørkt bilde lysnes mot samme nivå', () => {
  const f = createFaceLight();
  assert.deepEqual(f.step(120), { gamma: 1, bias: 0, raw: 120 });
  assert.deepEqual(f.step(80), { gamma: 1, bias: 0, raw: 80 });
  // Rett under grensen: nesten ingen lysning, så bildet ikke hopper i lysstyrke
  assert.ok(createFaceLight().step(72).gamma >= 0.9);
  // Mørkt: lysnes så snittet havner rundt 80
  const o = createFaceLight().step(30);
  assert.ok(o.gamma > 0.5 && o.gamma < 0.6, `gamma ${o.gamma}`);
  assert.ok(Math.abs(255 * Math.pow(30 / 255, o.gamma) - 80) < 8);
  // Nesten svart: ikke mer enn 0,4, ellers er det bare støy igjen
  assert.equal(createFaceLight().step(4).gamma, 0.4);
});

test('førerbildet i mørket: regner tilbake fra det lysnede bildet, og står rolig', () => {
  const f = createFaceLight();
  const cam = 30;   // kameraets eget bilde holder seg på 30
  let g = f.step(cam).gamma;
  const seen = [];
  for (let i = 0; i < 6; i++) { const o = f.step(255 * Math.pow(cam / 255, g)); g = o.gamma; seen.push(o); }
  assert.ok(seen.every(o => o.gamma === seen[0].gamma), 'samme lysning hver gang');
  assert.ok(seen.every(o => Math.abs(o.raw - 30) <= 1), 'ser at kameraets bilde fortsatt er 30');
  // Det blir lyst igjen (gatelys): tilbake til urørt bilde
  assert.equal(f.step(255 * Math.pow(140 / 255, g)).gamma, 1);
});

test('førerbildet i mørket: kameraet bes eksponere lysere, og slår ikke av og på', () => {
  const f = createFaceLight();
  assert.equal(f.step(50).bias, 0);
  let o = f.step(255 * Math.pow(30 / 255, f.step(30).gamma));
  assert.equal(o.bias, 1.5, 'mørkt: lysere eksponering');
  // Kameraet gjør bildet nesten tre ganger så lyst: fortsatt på
  o = f.step(255 * Math.pow(85 / 255, o.gamma));
  assert.equal(o.bias, 1.5);
  o = f.step(130);
  o = f.step(130);
  assert.equal(o.bias, 0, 'dagslys: av');
});

test('snittlysstyrke: hele bildet eller bare der ansiktet er', () => {
  const w = 4, h = 4, img = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = x < 2 ? 20 : 200, i = (y * w + x) * 4; img[i] = img[i + 1] = img[i + 2] = v; img[i + 3] = 255; }
  assert.equal(Math.round(meanLum(img, w, h)), 110);
  assert.equal(Math.round(meanLum(img, w, h, { x0: 0, x1: 0.5, y0: 0, y1: 1 })), 20);
  assert.equal(Math.round(meanLum(img, w, h, { x0: 0.5, x1: 1.4, y0: -0.2, y1: 1 })), 200, 'ramme utenfor bildet klippes');
});
