import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Veikameraets moduler finnes både i hovedappen (iPhone-appen, 0.10.0) og i kameratestappen, og skal være like
const SHARED = ['road', 'track', 'lanes', 'flow', 'signs', 'sign-tpl', 'camera', 'analysis', 'situations'];
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

for (const name of SHARED) {
  test(`js/${name}.js er lik kamera/js/${name}.js`, () => {
    assert.equal(read(`js/${name}.js`), read(`kamera/js/${name}.js`));
  });
}

test('service workeren forhåndslagrer veikameraets moduler', () => {
  const sw = read('sw.js');
  for (const name of ['nativecam', 'road', 'track', 'lanes', 'flow', 'signs', 'sign-tpl']) assert.ok(sw.includes(`'./js/${name}.js'`), name);
});

test('nativecam: utenfor iPhone-appen finnes ingen egne kameraer', async () => {
  const native = await import('../js/nativecam.js');
  assert.equal(native.available(), false);
  assert.equal(await native.camInfo(), null);
});
