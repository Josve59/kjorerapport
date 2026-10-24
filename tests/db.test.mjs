import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDemo } from '../js/analysis.js';

/* Importen skrives til IndexedDB; her testes bare at eksport→import-formatet beholder dataene,
   med en minimal falsk IndexedDB-fri sti: vi kjører samme normalisering som importDrive. */
test('eksportformat med null for NaN kan leses tilbake', () => {
  const d = makeDemo();
  d.loc[0].speed = NaN;
  const json = JSON.stringify({ input: d }, (k, v) => (typeof v === 'number' && Number.isNaN(v) ? null : v));
  const back = JSON.parse(json);
  assert.equal(back.input.loc[0].speed, null);
  const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
  assert.ok(Number.isNaN(num(back.input.loc[0].speed)));
  assert.equal(num(back.input.loc[1].lat), d.loc[1].lat);
});
