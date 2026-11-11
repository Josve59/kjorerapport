/* tools/turrapport.mjs: kjøres på en oppdiktet eksport (ingen ekte turer), så tallene kan regnes for hånd. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tool = fileURLToPath(new URL('../tools/turrapport.mjs', import.meta.url));   // mappenavnet har mellomrom og ø

function exportFile(dir, name, perf) {
  const loc = [], road = [], head = [];
  // 2 min: 60 km/t fra 31 til 49 s, ellers 40. NVDB sier 50, et skilt fra kameraet sier 40 fra 35 s.
  for (let i = 0; i < 120; i++) loc.push({ t: i, lat: 59.9 + i * 1e-4, lon: 10.7, speed: (i > 30 && i < 50 ? 60 : 40) / 3.6, bearing: 0, acc: 5 });
  // 9 bilder i sekundet: venstre linje 15 av 20, høyre 30 av 40, ansikt 3 av 4
  for (let i = 0; i < 1080; i++) {
    road.push({ t: i / 9, cars: 0, people: 0, lead: null, lane: { l: i % 20 < 15, r: i % 40 < 30, offset: null, ...(i % 10 === 0 ? { e: 1 } : {}) }, lum: i < 360 ? 20 : 50 });
    head.push({ t: i / 9, yaw: 0, pitch: 0, ex: 0, ey: 0, ok: i % 4 !== 0 });
  }
  const f = join(dir, name);
  writeFileSync(f, JSON.stringify({ app: 'Kjørerapport', version: '0.13.0', drive: {
    id: 'x', startedAt: '2026-11-09T10:00:00Z', endedAt: '2026-11-09T10:02:00Z', diag: { appVersion: '0.13.0' },
    cameraPlan: { mode: 'begge', perf }, liveLimits: [{ t: 0, limit: 50 }, { t: 35, limit: 40, src: 'kamera' }] }, input: { loc, road, head } }));
  return f;
}

test('turrapport: tall fra en oppdiktet tur', () => {
  const dir = mkdtempSync(join(tmpdir(), 'turrapport-'));
  try {
    const perf = { stalls: 2, faceMs: 12, faceFrames: 1000, faceNone: 200, faceOther: 50, dfine: 'D-FINE medium · ane', dfineMs: 61, dfineFrames: 400, dfineAny: 120, slow: true, drops: 3 };
    const ml = exportFile(dir, 'ml.json', { ...perf, laneMl: 'TwinLiteNet+ · ane', laneMlMs: 23, laneMlFrames: 950, laneMlDim: 190, faceMasked: 300, roadKnown: 800, offRoad: 40 });
    const old = exportFile(dir, 'old.json', { ...perf, dfineFrames: 0 });   // før 0.13.0: ingen laneMl-felt
    const out = execFileSync(process.execPath, [tool, ml, old], { encoding: 'utf8' });
    const [a, b] = out.split('\n\n');
    assert.match(a, /Varighet +2 min · 1,3 km/);
    assert.match(a, /Ansikt +funnet i 75 % av 1[\s ]080 bilder \(9,0 per s\), 12 ms per bilde/);
    assert.match(a, /uten ansikt: ingen i bildet 20 % · annet ansikt enn førerens 5 %/);
    assert.match(a, /begge 63 % · én 25 % · ingen 13 %/);
    assert.match(a, /skifter 134 ganger/);
    assert.match(a, /Feltmodell +kjørte: 950 svar, 23 ms per bilde · TwinLiteNet\+ · ane · lysnet i mørket i 20 %/);
    assert.match(a, /i mørket \(lys under 30, minst 40 km\/t\): begge 63 % av 360 bilder/);
    assert.match(a, /ledsagerens side skjult i 30 % av bildene/);
    assert.match(a, /uten oppmalte linjer: veikanten fra feltmodellen vist i 10 % av bildene/);
    assert.match(a, /bil utenfor veien tatt bort i 5 % av 800 bilder der veien var kjent/);
    assert.doesNotMatch(b, /ledsagerens side|utenfor veien|lysnet/, 'eldre turer har ikke tellerne');
    assert.match(a, /D-FINE +61 ms per bilde · 400 svar, fant noe i 30 %/);
    assert.match(a, /treg 3 ganger.*fortsatt treg.*startet på nytt 2 ganger/);
    // Over 50 + 3 fra 31 s gir varsel fra 33 s; kameraskiltet (40) fra 35 s gjør det verre, slutt ved 50 s
    assert.match(a, /Fartsvarsler +1 varsel, 17 s til sammen/);
    assert.match(a, /verst: 0:33 60 km\/t i 40-sone \(skilt fra kameraet\), 17 s/);
    // 0.13.9: takten på feltmodellen, og skilt der kartet sa noe annet
    assert.match(a, /rundt 7,9 svar i sekundet/);
    assert.match(a, /Skilt +1 lest av kameraet · kartet hadde eller fikk samme grense for 0/);
    assert.match(a, /kartet sa noe annet \(midlertidig skilt eller feillesning\): 0:35 skilt 40, kart 50/);
    assert.match(b, /Feltmodell +ikke med i 0\.13\.0/);
    assert.match(b, /D-FINE +kjørte ikke/);
    assert.doesNotMatch(out, /59[,.]9/);   // ingen koordinater i rapporten
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
