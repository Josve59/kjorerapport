/* Turrapport: kort rapport på norsk fra en eksportert tur (kjorerapport-*.json), for å se hvordan kameraene,
   modellene og telefonen oppførte seg uten å åpne appen. Skriver ingen koordinater.

   node tools/turrapport.mjs              den nyeste eksporten i ~/Downloads
   node tools/turrapport.mjs 2            de to nyeste
   node tools/turrapport.mjs fil.json …   bestemte filer (også sikkerhetskopier, én rapport per tur) */

import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { haversine } from '../js/sensors.js';
import { createSpeedWarn } from '../js/speedwarn.js';
import { createCamLimit } from '../js/signs.js';
import { n0, n1, hms, duration, date } from '../js/format.js';

const pct = (a, b) => (b ? `${n0((100 * a) / b)} %` : '–');
const ms = v => `${n0(v)} ms`;
const perSec = (n, sec) => (sec > 0 ? n1(n / sec) : '–');

/* Lengde slik appen regner den: bare GPS-punkter med nøyaktighet ≤ 50 m teller */
function distanceKm(loc) {
  let d = 0, last = null;
  for (const p of loc) {
    if (!Number.isFinite(p.acc) || p.acc > 50) continue;
    if (last) d += haversine(last, p);
    last = p;
  }
  return d / 1000;
}

/* Feltlinjene: andel bilder med begge/én/ingen, og hvor ofte hvilke linjer som ses skifter
   (venstre → høyre teller også som et skifte). En tilstand som varer kort betyr at linjene blinker. */
function laneStats(road) {
  const rows = road.filter(r => r.lane);
  let both = 0, one = 0, none = 0, flips = 0, prev = null, runStart = null;
  const runs = [];
  for (const r of rows) {
    const s = (r.lane.l ? 'l' : '') + (r.lane.r ? 'r' : '');
    if (s === 'lr') both++; else if (s) one++; else none++;
    if (prev !== null && s !== prev) { flips++; runs.push(r.t - runStart); runStart = r.t; }
    if (prev === null) runStart = r.t;
    prev = s;
  }
  runs.sort((a, b) => a - b);
  const median = runs.length ? runs[Math.floor(runs.length / 2)] : null;
  const sec = rows.length > 1 ? rows[rows.length - 1].t - rows[0].t : 0;
  return { n: rows.length, both, one, none, flips, perMin: sec > 0 ? (flips * 60) / sec : 0, median };
}

/* Feltlinjene i mørket (lys under 30) i minst 40 km/t, der veien som regel har oppmalte linjer */
function darkLanes(road, loc) {
  const fixes = loc.filter(p => Number.isFinite(p.speed));
  const kmhAt = t => {
    if (!fixes.length) return NaN;
    let lo = 0, hi = fixes.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (fixes[m].t < t) lo = m + 1; else hi = m; }
    return fixes[lo].speed * 3.6;
  };
  let n = 0, both = 0;
  for (const r of road) if (r.lane && Number.isFinite(r.lum) && r.lum < 30 && kmhAt(r.t) >= 39.5) { n++; if (r.lane.l && r.lane.r) both++; }
  return { n, both };
}

/* Fartsvarslene lagres ikke, så de regnes ut på nytt: GPS-farten mot fartsgrensen fra NVDB, der et skilt fra
   kameraet gjelder til neste skilt, 3 km eller ny NVDB-strekning, slik som under kjøring (app.js / signs.js).
   Varselet regnes ut selv om ledsageren hadde slått det av i innstillingene. */
function speedWarnings(loc, liveLimits) {
  const warn = createSpeedWarn(), cam = createCamLimit();
  const limits = [...liveLimits].sort((a, b) => a.t - b.t);
  let li = 0, nvdb = null, dist = 0, lastFix = null, cur = null;
  const episodes = [];   // { t0, t1, limit, kmh, over, cam } – limit og kmh der farten var høyest over
  for (const p of loc) {
    if (lastFix && Number.isFinite(p.acc) && p.acc <= 50) dist += haversine(lastFix, p);
    if (Number.isFinite(p.acc) && p.acc <= 50) lastFix = p;
    while (li < limits.length && limits[li].t <= p.t) {
      const x = limits[li++];
      if (x.src === 'kamera') cam.sign(x.limit, dist, nvdb); else nvdb = x.limit;
    }
    const cl = cam.current(dist, nvdb);
    const limit = cl ? cl.limit : nvdb;
    const kmh = Number.isFinite(p.speed) && p.speed >= 0 ? p.speed * 3.6 : NaN;
    const { level } = warn.step({ kmh, limit, t: p.t });
    if (level > 0) {
      if (!cur) episodes.push(cur = { t0: p.t, t1: p.t, over: -Infinity });
      cur.t1 = p.t;
      if (kmh - limit > cur.over) Object.assign(cur, { over: kmh - limit, limit, kmh, cam: !!cl });
    } else if (cur) { cur.t1 = p.t; cur = null; }
  }
  const total = episodes.reduce((s, e) => s + e.t1 - e.t0, 0);
  return { episodes, total, hasLimits: limits.some(x => Number.isFinite(x.limit)) };
}

function report(drive, input, file, exportVersion) {
  const out = [];
  const line = (label, text) => out.push(`${label.padEnd(14)}${text}`);
  const more = text => out.push(`${''.padEnd(14)}${text}`);
  const loc = input.loc || [], head = input.head || [], road = input.road || [];
  const version = (drive.diag && drive.diag.appVersion) || exportVersion || 'ukjent';
  const sec = drive.endedAt ? (Date.parse(drive.endedAt) - Date.parse(drive.startedAt)) / 1000
    : loc.length ? loc[loc.length - 1].t : 0;

  out.push(`Turrapport · ${file}`);
  out.push(`${date(drive.startedAt)} · versjon ${version}${exportVersion && exportVersion !== version ? ` (eksportert med ${exportVersion})` : ''}${drive.demo ? ' · demotur' : ''}${drive.interrupted ? ' · avbrutt' : ''}`);
  line('Varighet', `${duration(sec)} · ${n1(distanceKm(loc))} km`);

  const cp = drive.cameraPlan, perf = cp && cp.perf;
  if (head.length) {
    const ok = head.filter(h => h.ok).length;
    line('Ansikt', `funnet i ${pct(ok, head.length)} av ${n0(head.length)} bilder (${perSec(head.length, sec)} per s), ${ms(perf && perf.faceMs || 0)} per bilde`);
    // Fra 0.13.1: hvorfor bildene var uten ansikt (tellerne gjelder hele kameraøkten)
    if (perf && perf.faceFrames) more(`uten ansikt: ingen i bildet ${pct(perf.faceNone, perf.faceFrames)} · annet ansikt enn førerens ${pct(perf.faceOther, perf.faceFrames)}`);
    // Fra 0.13.2: ledsagerens side av bildet skjult, så modellen ikke følger ledsageren
    if (perf && perf.faceFrames && 'faceMasked' in perf) more(`ledsagerens side skjult i ${pct(perf.faceMasked, perf.faceFrames)} av bildene`);
  } else line('Ansikt', 'ingen data fra førerkameraet lagret med turen');

  const ls = laneStats(road);
  if (ls.n) {
    line('Feltlinjer', `begge ${pct(ls.both, ls.n)} · én ${pct(ls.one, ls.n)} · ingen ${pct(ls.none, ls.n)} (${n0(ls.n)} bilder)`);
    more(`skifter ${n0(ls.flips)} ganger, ${n1(ls.perMin)} per min${ls.median !== null ? `; en tilstand varer typisk ${n1(ls.median)} s` : ''}`);
    // I mørket på veier med linjer (0.13.2 lysner bildet til feltmodellen): 9. nov. var det 10–28 % her, mot ~80 % i lyset
    // Fra 0.13.3: veikanten og midten av veien vist i bilder uten oppmalte linjer
    const ne = road.filter(r => r.lane && r.lane.e).length;
    if (ne) more(`uten oppmalte linjer: veikanten fra feltmodellen vist i ${pct(ne, ls.n)} av bildene`);
    const dk = darkLanes(road, loc);
    if (dk.n >= 50) more(`i mørket (lys under 30, minst 40 km/t): begge ${pct(dk.both, dk.n)} av ${n0(dk.n)} bilder`);
  } else line('Feltlinjer', 'ingen data fra veikameraet lagret med turen');

  if (!perf) {
    line('Feltmodell', 'veikameraet var ikke på');
    line('D-FINE', 'veikameraet var ikke på');
    line('Varme', 'ingen tall (lagres bare når veikameraet er på)');
  } else {
    // Tellerne gjelder hele kameraøkten (fra kameraet startet, kan være før turen), så de deles ikke på turens lengde
    if (!('laneMlFrames' in perf)) line('Feltmodell', `ikke med i ${version} (kom i 0.13.0); linjene er fra bildeanalysen`);
    else if (!perf.laneMlFrames) line('Feltmodell', 'kjørte ikke (ingen svar); linjene er fra bildeanalysen');
    else line('Feltmodell', `kjørte: ${n0(perf.laneMlFrames)} svar, ${ms(perf.laneMlMs)} per bilde${perf.laneMl ? ` · ${perf.laneMl}` : ''}${'laneMlDim' in perf ? ` · lysnet i mørket i ${pct(perf.laneMlDim, perf.laneMlFrames)}` : ''}`);
    if (!perf.dfineFrames) line('D-FINE', 'kjørte ikke (ingen svar)');
    else line('D-FINE', `${ms(perf.dfineMs)} per bilde · ${n0(perf.dfineFrames)} svar, fant noe i ${pct(perf.dfineAny, perf.dfineFrames)}${perf.dfine ? ` · ${perf.dfine}` : ''}`);
    // Fra 0.13.2: biler som ikke sto på veien feltmodellen så (huslys), tatt bort
    if ('roadKnown' in perf) more(perf.roadKnown ? `bil utenfor veien tatt bort i ${pct(perf.offRoad, perf.roadKnown)} av ${n0(perf.roadKnown)} bilder der veien var kjent` : 'veien var aldri kjent, så biler utenfor veien ble ikke tatt bort');
    const drops = perf.drops || 0, stalls = perf.stalls || 0;
    if (!drops && !stalls && !perf.slow) line('Varme', 'ingen tegn: aldri treg, kameraet stoppet aldri');
    else line('Varme', [
      drops ? `treg ${n0(drops)} ${drops === 1 ? 'gang' : 'ganger'} (ned til 5 bilder i sekundet)` : 'aldri treg',
      perf.slow ? 'fortsatt treg da turen sluttet' : '',
      stalls ? `kameraet stoppet og startet på nytt ${n0(stalls)} ${stalls === 1 ? 'gang' : 'ganger'}` : 'kameraet stoppet aldri'
    ].filter(Boolean).join(' · '));
  }

  const sw = speedWarnings(loc, drive.liveLimits || []);
  const n = sw.episodes.length;
  if (!sw.hasLimits) line('Fartsvarsler', 'ingen fartsgrenser lagret (Veidata av, eller ingen nett)');
  else if (!n) line('Fartsvarsler', 'ingen (regnet ut på nytt fra GPS-farten og lagrede fartsgrenser)');
  else {
    line('Fartsvarsler', `${n0(n)} ${n === 1 ? 'varsel' : 'varsler'}, ${n0(sw.total)} s til sammen (regnet ut på nytt fra GPS-farten og lagrede fartsgrenser)`);
    // De verste, med tid i turen: en lav grense midt i høy fart er ofte en feil fartsgrense fra NVDB, ikke fart
    const worst = [...sw.episodes].sort((a, b) => b.over - a.over).slice(0, 3);
    more(`verst: ${worst.map(e => `${hms(e.t0)} ${n0(e.kmh)} km/t i ${e.limit}-sone${e.cam ? ' (skilt fra kameraet)' : ''}, ${n0(e.t1 - e.t0)} s`).join(' · ')}`);
  }
  return out.join('\n');
}

/* Filene: tall = så mange av de nyeste eksportene i ~/Downloads (sikkerhetskopier telles ikke med) */
function pickFiles(args) {
  const files = args.filter(a => !/^\d+$/.test(a));
  if (files.length) return files;
  const n = args.length ? Number(args[0]) : 1;
  const dir = join(homedir(), 'Downloads');
  const found = readdirSync(dir).filter(f => /^kjorerapport-\d{4}-\d\d-\d\d-\d\d-\d\d\.json$/.test(f)).sort().reverse();
  if (!found.length) { console.error('Fant ingen kjorerapport-*.json i ~/Downloads.'); process.exit(1); }
  return found.slice(0, n).map(f => join(dir, f));
}

const reports = [];
for (const f of pickFiles(process.argv.slice(2))) {
  let j;
  try { j = JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { reports.push(`Turrapport · ${basename(f)}\nKunne ikke lese filen: ${e.message}`); continue; }
  const items = Array.isArray(j.drives) ? j.drives : j.drive ? [j] : [];
  if (!items.length) { reports.push(`Turrapport · ${basename(f)}\nFant ingen tur i filen.`); continue; }
  for (const it of items) reports.push(report(it.drive, it.input || {}, basename(f), j.version));
}
console.log(reports.join('\n\n'));
