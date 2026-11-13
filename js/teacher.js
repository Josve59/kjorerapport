/* Til trafikklæreren (v0.9.13): én side med det eleven har øvd på siden forrige kjøretime. Trafikklæreren ser på
   få minutter hva som er øvd (tid, km, veityper, mørke, manøvrer), hvordan det går, hva som bør jobbes med, hva
   ledsageren har merket og hvor langt de er i opplæringsplanen. Laget for å vises på telefonen, skrives ut eller
   deles som tekst. Rene funksjoner (sammendrag og tekst), så de kan testes i Node. */
import { sumLogs, ROAD_LABEL, LIGHT_LABEL } from './log.js';
import { suggestFocus, curriculumEvidence, CURRICULUM } from './insights.js';
import { CATS } from './analysis.js';
import { MARK_CATS, FOCUS, icon } from './ui.js';
import { esc, km, overTime } from './format.js';

export function fmtHours(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} t ${String(m % 60).padStart(2, '0')} min`;
}
const dateFmt = d => new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' });

/* rows: turer fra gatherRows (nyeste først: { d, res, sp, road, log, marks }).
   from/to: tidsrom (ms), plan: avkryssede punkter i opplæringsplanen ({ id: { done, at } }). */
export function teacherSummary(rows, { from = null, to = Infinity, driver = '', plan = {}, now = new Date() } = {}) {
  const sel = rows.filter(x => { const t = Date.parse(x.d.startedAt); return (from === null || t >= from) && t <= to; });
  const tot = sumLogs(sel.map(x => x.log).filter(Boolean));
  const sum = f => sel.reduce((s, x) => s + f(x), 0);
  const avg = (list, f) => (list.length ? Math.round(list.reduce((s, x) => s + f(x), 0) / list.length) : null);
  const chrono = sel.slice().reverse();
  const half = Math.ceil(chrono.length / 2);
  const cats = Object.fromEntries(['brake', 'accel', 'turn', 'smooth'].map(k => [k, avg(sel, x => x.res.scores[k])]));
  const withSp = sel.filter(x => x.sp);
  const spKm = withSp.reduce((s, x) => s + x.res.stats.km, 0), spSec = withSp.reduce((s, x) => s + x.sp.secondsOver, 0);
  // Speilblikk før feltskifter (førerkameraet, testappen): true = sett, false = ikke sett, null = kameraet så ikke føreren
  const lanes = sel.flatMap(x => (x.res.camera && x.res.camera.calibrated && Array.isArray(x.res.camera.lane) ? x.res.camera.lane : []));
  const judged = lanes.filter(l => l.mirror !== null && l.mirror !== undefined);
  const marks = {};
  for (const x of sel) for (const m of x.marks || []) marks[m.cat] = (marks[m.cat] || 0) + 1;
  const notes = [];
  for (const x of sel) {
    if (x.d.note) notes.push({ at: x.d.startedAt, text: x.d.note });
    for (const m of x.marks || []) if (m.note) notes.push({ at: x.d.startedAt, text: `${MARK_CATS[m.cat] ? MARK_CATS[m.cat].label : 'Merke'}: ${m.note}` });
  }
  const ev = curriculumEvidence(sel);
  const work = suggestFocus(sel, now).map(s => ({ id: s.id, label: (FOCUS.find(f => f.id === s.id) || { label: s.id }).label, reason: s.reason }));
  const good = Object.entries(cats).filter(([, v]) => v !== null && v >= 90).map(([k]) => CATS[k]);
  return {
    driver, from, to: Number.isFinite(to) ? to : now.getTime(), count: sel.length,
    first: chrono.length ? chrono[0].d.startedAt : null, last: chrono.length ? chrono[chrono.length - 1].d.startedAt : null,
    time: tot.total.sec, km: tot.total.km, road: tot.sec, light: tot.light,
    maneuvers: {
      roundabouts: sum(x => ((x.road && x.road.roundabouts) || x.res.maneuvers?.roundabouts || []).length),
      laneChanges: sum(x => (x.res.maneuvers?.laneChanges || []).length),
      junctions: sum(x => ((x.road && x.road.giveway) || []).length + ((x.road && x.road.stops) || []).length)
    },
    score: { avg: avg(sel, x => x.res.overall), early: chrono.length >= 4 ? avg(chrono.slice(0, half), x => x.res.overall) : null, late: chrono.length >= 4 ? avg(chrono.slice(half), x => x.res.overall) : null, cats },
    speeding: withSp.length && spKm > 0.5 ? { sec: Math.round(spSec), km: spKm, per10: spSec / spKm * 10 } : null,
    mirrors: judged.length ? { lanes: judged.length, seen: judged.filter(l => l.mirror === true).length } : null,
    work, good, marks, notes: notes.slice(0, 10),
    plan: CURRICULUM.map(st => ({ stage: st.stage, items: st.items.map(it => ({ id: it.id, label: it.label, done: !!(plan[it.id] && plan[it.id].done), evidence: it.auto && ev[it.auto] ? ev[it.auto].text : null, good: !!(it.auto && ev[it.auto] && ev[it.auto].good) })) }))
  };
}

const trendWord = s => (s.early === null ? null : s.late - s.early >= 5 ? `Bedre: snittet gikk fra ${s.early} til ${s.late} poeng` : s.early - s.late >= 5 ? `Svakere: snittet gikk fra ${s.early} til ${s.late} poeng` : `Stabilt rundt ${s.avg} poeng`);
const period = s => (s.from === null ? 'alle turer' : `${dateFmt(s.from)} – ${dateFmt(s.to)}`);

/* Teori og sikkerhetskontroll (0.15.0), fra theoryBrief i theory.js: det eleven har øvd på i appen */
const examWord = b => (b.taken >= 5 ? `${b.passed} av de 5 siste øveprøvene bestått` : `${b.passed} av ${b.taken} ${b.taken === 1 ? 'øveprøve' : 'øveprøver'} bestått`);
function theoryLine(b) {
  const parts = [];
  if (b.last) parts.push(`siste øveprøve ${b.last.correct} av ${b.last.total} (${b.last.passed ? 'bestått' : 'ikke bestått'}), ${examWord(b)}`);
  else parts.push('ingen øveprøver ennå');
  parts.push(`${b.learned} av ${b.total} spørsmål lært`, `${b.signs} av ${b.signsTotal} skilt lært`, `sikkerhetskontroll ${b.safety.known} av ${b.safety.total} oppgaver`);
  return `Teori: ${parts.join(', ')}.`;
}
function theoryCard(b) {
  if (!b) return '';
  return `<section class="card">
      <h2 class="card-title">${icon('quiz')}Teori og sikkerhetskontroll</h2>
      <dl class="stats t-man">
        <div><dt>Siste øveprøve</dt><dd>${b.last ? `${b.last.correct} av ${b.last.total} · ${b.last.passed ? 'bestått' : 'ikke bestått'}` : '–'}</dd></div>
        ${b.taken ? `<div><dt>Øveprøver bestått</dt><dd>${b.passed} av ${b.taken >= 5 ? 'de 5 siste' : b.taken}</dd></div>` : ''}
        ${b.taken && typeof b.solid === 'number' ? `<div><dt>Med minst 40 riktige</dt><dd>${b.solid} av ${b.taken >= 5 ? 'de 5 siste' : b.taken}</dd></div>` : ''}
        <div><dt>Spørsmål lært</dt><dd>${b.learned} av ${b.total}</dd></div>
        <div><dt>Skilt lært</dt><dd>${b.signs} av ${b.signsTotal}</dd></div>
        <div><dt>Sikkerhetskontroll</dt><dd>${b.safety.known} av ${b.safety.total} oppgaver</dd></div>
      </dl>
      <p class="muted small">Øveprøvene er bygget som teoriprøven, med 45 oppgaver og 38 riktige for å bestå, men er litt vanskeligere. Eleven regnes som klar ved minst 40 riktige på 3 av 5. Spørsmålene er appens egne. Sikkerhetskontrollen teller oppgavene eleven selv har merket som kan.</p>
    </section>`;
}

/* Teksten som deles (melding eller e-post til trafikklæreren). theory: fra theoryBrief, eller null. */
export function teacherText(s, { note = '', theory = null } = {}) {
  const L = [];
  L.push(`Øvingskjøring${s.driver ? ' – ' + s.driver : ''} (${period(s)})`);
  if (!s.count) { L.push('Ingen turer i perioden.'); if (theory) L.push(theoryLine(theory)); return L.join('\n'); }
  L.push(`${s.count} ${s.count === 1 ? 'tur' : 'turer'}, ${fmtHours(s.time)}, ${km(s.km)}. By ${fmtHours(s.road.by)}, landevei ${fmtHours(s.road.land)}, motorvei ${fmtHours(s.road.motor)}. Mørke ${fmtHours(s.light.dark)}.`);
  const m = s.maneuvers;
  L.push(`Manøvrer: ${m.roundabouts} rundkjøringer, ${m.laneChanges} feltskifter${m.junctions ? `, ${m.junctions} kryss med vikeplikt eller stopp` : ''}.`);
  L.push(`Snittpoeng ${s.score.avg}${trendWord(s.score) ? ` (${trendWord(s.score).toLowerCase()})` : ''}. Bremsing ${s.score.cats.brake}, akselerasjon ${s.score.cats.accel}, svinger ${s.score.cats.turn}, jevn fart ${s.score.cats.smooth}.`);
  if (s.speeding) L.push(`Fartsgrenser: ${overTime(s.speeding.sec, true)} over grensen på ${km(s.speeding.km)}.`);
  if (s.mirrors) L.push(`Speilblikk før feltskifte: sett ved ${s.mirrors.seen} av ${s.mirrors.lanes} (førerkamera).`);
  if (s.work.length) { L.push('Bør jobbes med:'); for (const w of s.work) L.push(`– ${w.label}: ${w.reason}`); }
  if (s.good.length) L.push(`Går fint: ${s.good.join(', ').toLowerCase()}.`);
  const mk = Object.entries(s.marks);
  if (mk.length) L.push(`Ledsageren merket: ${mk.map(([c, n]) => `${(MARK_CATS[c] ? MARK_CATS[c].label : c).toLowerCase()} ${n}`).join(', ')}.`);
  for (const n of s.notes) L.push(`– ${dateFmt(n.at)}: ${n.text}`);
  if (theory) L.push(theoryLine(theory));
  if (note) L.push(`Spørsmål til trafikklæreren: ${note}`);
  L.push('Fra Kjørerapport. Målingene er veiledende.');
  return L.join('\n');
}

/* Selve siden. */
export function teacherHtml(s, { note = '', theory = null } = {}) {
  if (!s.count) return `<section class="card empty"><strong>Ingen turer i perioden</strong><span class="muted small">Velg et lengre tidsrom over, eller kjør en tur.</span></section>${theoryCard(theory)}`;
  const bar = (obj, keys, labels, cls) => {
    const tot = keys.reduce((a, k) => a + obj[k], 0) || 1;
    return `<div class="road-mix">${keys.filter(k => obj[k] > 0).map(k => `<span class="${cls}-${k}" style="width:${(obj[k] / tot * 100).toFixed(1)}%"></span>`).join('')}</div>
      <ul class="legend">${keys.map(k => `<li><span class="dot mix-dot ${cls}-${k}"></span>${labels[k]}: ${fmtHours(obj[k])}</li>`).join('')}</ul>`;
  };
  const m = s.maneuvers, tw = trendWord(s.score);
  const catRow = k => `<li><span>${CATS[k]}</span><span class="t-bar"><span style="width:${s.score.cats[k]}%"></span></span><strong>${s.score.cats[k]}</strong></li>`;
  const mk = Object.entries(s.marks).sort((a, b) => b[1] - a[1]);
  return `
    <section class="card t-head">
      <p class="eyebrow">${s.driver ? esc(s.driver) + ' · ' : ''}${esc(period(s))}</p>
      <div class="tiles t-tiles">
        <div class="tile"><span class="tile-val">${s.count}</span><span class="tile-label">${s.count === 1 ? 'tur' : 'turer'}</span></div>
        <div class="tile"><span class="tile-val">${fmtHours(s.time)}</span><span class="tile-label">kjøretid</span></div>
        <div class="tile"><span class="tile-val">${km(s.km)}</span><span class="tile-label">kjørt</span></div>
        <div class="tile"><span class="tile-val">${fmtHours(s.light.dark)}</span><span class="tile-label">i mørke</span></div>
      </div>
    </section>

    ${s.work.length || s.good.length ? `<section class="card">
      <h2 class="card-title">${icon('target')}${s.work.length ? 'Bør jobbes med' : 'Status'}</h2>
      ${s.work.length ? `<ol class="practice-list">${s.work.map(w => `<li><strong>${esc(w.label)}</strong><span class="muted small">${esc(w.reason)}</span></li>`).join('')}</ol>` : '<p>Ingenting som skiller seg ut på disse turene.</p>'}
      ${s.good.length ? `<p class="t-good">${icon('check', 18)}<span>Går fint: ${esc(s.good.join(', ').toLowerCase())}.</span></p>` : ''}
    </section>` : ''}

    <section class="card">
      <h2 class="card-title">${icon('map')}Hva er øvd</h2>
      ${bar(s.road, ['by', 'land', 'motor'], ROAD_LABEL, 'mix')}
      ${bar(s.light, ['day', 'twilight', 'dark'], LIGHT_LABEL, 'light')}
      <dl class="stats t-man">
        <div><dt>Rundkjøringer</dt><dd>${m.roundabouts}</dd></div>
        <div><dt>Feltskifter</dt><dd>${m.laneChanges}</dd></div>
        <div><dt>Kryss med vikeplikt/stopp</dt><dd>${m.junctions || '–'}</dd></div>
      </dl>
    </section>

    <section class="card">
      <h2 class="card-title">${icon('chart')}Hvordan det går</h2>
      <p><strong>Snitt ${s.score.avg} av 100</strong>${tw ? ` · ${esc(tw)}` : ''}</p>
      <ul class="t-cats">${['brake', 'accel', 'turn', 'smooth'].map(catRow).join('')}</ul>
      ${s.speeding ? `<p>Fartsgrenser: ${overTime(s.speeding.sec)} over grensen på ${km(s.speeding.km)}${s.speeding.per10 < 5 ? ', det er lite' : ''}.</p>` : ''}
      ${s.mirrors ? `<p>Speilblikk før feltskifte: sett ved ${s.mirrors.seen} av ${s.mirrors.lanes} (førerkamera).</p>` : ''}
      <p class="muted small">Poengene måler hvor rolig og jevnt det kjøres (brå bremsing, gass og svinger), ikke om trafikkreglene følges.</p>
    </section>

    ${mk.length || s.notes.length ? `<section class="card">
      <h2 class="card-title">${icon('flag')}Fra ledsageren</h2>
      ${mk.length ? `<p>${mk.map(([c, n]) => `${esc(MARK_CATS[c] ? MARK_CATS[c].label : c)} <strong>${n}</strong>`).join(' · ')}</p>` : ''}
      ${s.notes.length ? `<ul class="t-notes">${s.notes.map(n => `<li><span class="muted small">${esc(dateFmt(n.at))}</span> ${esc(n.text)}</li>`).join('')}</ul>` : ''}
    </section>` : ''}

    <section class="card">
      <h2 class="card-title">${icon('school')}Opplæringsplanen</h2>
      ${s.plan.filter(st => st.items.some(it => it.done || it.evidence)).map(st => `<h3 class="t-stage">${esc(st.stage)}</h3>
        <ul class="t-plan">${st.items.filter(it => it.done || it.evidence).map(it => `<li class="${it.done ? 'done' : ''}">${it.done ? icon('check', 16) : '<span class="t-dot"></span>'}<span>${esc(it.label)}${it.evidence ? ` <span class="muted small">· ${esc(it.evidence)}</span>` : ''}</span></li>`).join('')}</ul>`).join('') || '<p class="muted">Ingen punkter krysset av eller øvd ennå.</p>'}
      <p class="muted small">Haken er satt av eleven eller ledsageren. Grå tekst er hva appen har sett på alle turene.</p>
    </section>

    ${theoryCard(theory)}

    ${note ? `<section class="card"><h2 class="card-title">${icon('note')}Spørsmål til trafikklæreren</h2><p class="t-q">${esc(note)}</p></section>` : ''}
    <p class="muted small center">Fra Kjørerapport. Målt med telefonens GPS og bevegelsessensorer. Målingene er veiledende.</p>`;
}
