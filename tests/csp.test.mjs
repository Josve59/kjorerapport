// Sikkerhetsregelen i index.html (1.0.16): hashen må stemme med det innebygde skriptet, ellers stopper nettleseren det
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('CSP-hashen stemmer med hvert innebygde skript i index.html', () => {
  const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
  assert.ok(csp, 'index.html har en CSP');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /'unsafe-inline'/, 'innebygde skript og onerror= skal stoppes');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(inline.length >= 1);
  for (const code of inline) {
    const h = "'sha256-" + createHash('sha256').update(code, 'utf8').digest('base64') + "'";
    assert.ok(csp.includes(h), `hashen ${h} mangler i CSP-en`);
  }
});

test('ingen onclick= og lignende i index.html (de stoppes av CSP-en)', () => {
  assert.doesNotMatch(html, /<[^>]*\son[a-z]+=["']/);
});
