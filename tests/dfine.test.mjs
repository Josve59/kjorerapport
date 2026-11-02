import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropFor, decode, toTensorData, SIZE } from '../kamera/js/dfine.js';
import { mergeDets } from '../kamera/js/facecam.js';

test('D-FINE: stående bilde gir kvadrat midt på, liggende hele bildet', () => {
  assert.deepEqual(cropFor(720, 1280), { sx: 0, sy: 280, sw: 720, sh: 720 });
  assert.deepEqual(cropFor(1280, 720), { sx: 0, sy: 0, sw: 1280, sh: 720 });
});

test('D-FINE: svar tolkes til biler i kamerabildets piksler, og svake/uaktuelle klasser forkastes', () => {
  const Q = 300, C = 80, logits = new Float32Array(Q * C).fill(-10), boxes = new Float32Array(Q * 4);
  logits[0 * C + 2] = 2;           // spørring 0: bil, sigmoid ≈ 0,88
  boxes.set([0.5, 0.5, 0.2, 0.1], 0);
  logits[1 * C + 16] = 5;          // spørring 1: hund (ikke med)
  logits[2 * C + 7] = -1;          // spørring 2: lastebil, sigmoid ≈ 0,27
  boxes.set([0.25, 0.75, 0.1, 0.1], 8);
  const crop = cropFor(720, 1280);
  const d = decode(logits, boxes, crop);
  assert.equal(d.length, 2);
  assert.equal(d[0].cls, 'car');
  assert.ok(Math.abs(d[0].score - 0.88) < 0.01);
  assert.ok(Math.abs(d[0].x - (0.4 * 720)) < 0.5 && Math.abs(d[0].y - (280 + 0.45 * 720)) < 0.5 && Math.abs(d[0].w - 144) < 0.5);
  assert.equal(d[1].cls, 'truck');
  assert.equal(decode(logits, boxes, crop, { minScore: 0.5 }).length, 1);
});

test('D-FINE: bildet blir til 0–1 i kanaler (NCHW), med gammakurve i mørket', () => {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  rgba[0] = 255; rgba[1] = 64; rgba[2] = 0;
  const t = toTensorData(rgba);
  assert.equal(t.length, 3 * SIZE * SIZE);
  assert.equal(t[0], 1); assert.ok(Math.abs(t[SIZE * SIZE] - 64 / 255) < 1e-6); assert.equal(t[2 * SIZE * SIZE], 0);
  const gamma = new Uint8ClampedArray(256).map((_, v) => Math.round(255 * Math.pow(v / 255, 0.5)));
  assert.ok(toTensorData(rgba, gamma)[SIZE * SIZE] > t[SIZE * SIZE], 'mørke toner løftes');
});

test('To modeller: samme bil telles én gang (høyeste score), ulike biler beholdes', () => {
  const a = { cls: 'car', score: 0.6, x: 100, y: 100, w: 50, h: 40 };
  const b = { cls: 'car', score: 0.8, x: 104, y: 102, w: 50, h: 40 };
  const c = { cls: 'car', score: 0.5, x: 300, y: 100, w: 50, h: 40 };
  const m = mergeDets([a, b, c]);
  assert.equal(m.length, 2);
  assert.equal(m[0].score, 0.8);
});
