/* Rapportvisning – ren SVG/HTML, ingen nettverk. */
import { CATS, rating } from './analysis.js';
import { esc, km, kmh, gee, mss, duration, n0, n1 } from './format.js';
import { analyzeSpeeding, evaluateRoad } from './enrich.js';
import { icon, MARK_CATS, FOCUS, isRemark } from './ui.js';
import { driveLog, ROAD_LABEL, LIGHT_LABEL } from './log.js';
import { buildSituations, situationSummary, SOURCE_LABEL, LEVEL_ORDER } from './situations.js';

const KIND_COLOR = { brake: 'var(--brake)', accel: 'var(--accel)', turn: 'var(--turn)' };
const LABEL = {
  brake: { brisk: 'Brå nedbremsing', harsh: 'Kraftig nedbremsing' },
  accel: { brisk: 'Rask akselerasjon', harsh: 'Kraftig akselerasjon' },
  turn:  { brisk: 'Skarp sving', harsh: 'Svært skarp sving' }
};
const POSITIVE = {
  brake: 'Myk og kontrollert bremsing.',
  accel: 'Rolig og gradvis på gassen.',
  turn: 'Fine, jevne svinger uten mye sidekraft.',
  smooth: 'Jevn fart gjennom hele turen.'
};
const LIMITS = [30, 50, 60, 70, 80, 90, 110];
const KIND_CSS = { brake: 'brake', accel: 'accel', turn: 'turn' };
let leafletMap = null;
let navObserver = null;
let highlight = null;
const TILE_URL = 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png';

export function eventLabel(e) { return LABEL[e.kind][e.level]; }

/* Enkel skala så g-tall gir mening for en elev. */
export function gWord(g) {
  if (g < 0.3) return 'lett';
  if (g < 0.45) return 'merkbar';
  return 'kraftig';
}

/* Fartsovertredelser fra lagrede fartsgrenser (null hvis ikke hentet). */
export function speedingFor(r, enrich) {
  if (!enrich || !Array.isArray(enrich.limits) || enrich.limits.length !== r.points.length) return null;
  const limits = enrich.limits.map(v => (v === null ? NaN : v));
  if (!limits.some(Number.isFinite)) return null;
  return { ...analyzeSpeeding(r.points, limits), limits };
}

const MARK_LETTER = i => String.fromCharCode(65 + (i % 26));

/* Fasit fra ledsageren (v0.7.6): merket «Feltskifte» trykkes like etter hvert feltskifte. Et merke hører
   til et funnet feltskifte hvis det kom fra 3 s før start til 15 s etter slutt. Tider relativt til rapporten. */
export function laneTruth(laneChanges, marks) {
  const felt = (marks || []).filter(m => m.cat === 'felt').filter((m, i, a) => !i || m.t - a[i - 1].t >= 4);   // dobbelttrykk
  if (!felt.length) return null;
  const used = new Set();
  const hits = (laneChanges || []).map(l => {
    const k = felt.findIndex((m, i) => !used.has(i) && m.t >= l.tFrom - 3 && m.t <= l.tTo + 15);
    if (k >= 0) used.add(k);
    return k >= 0;
  });
  return { marked: felt.length, found: hits.filter(Boolean).length, extra: hits.filter(h => !h).length, hits, missed: felt.filter((_, i) => !used.has(i)) };
}

/* Ledsagerens merker med fart og tid relativt til rapporten. */
export function markRows(marks, r) {
  return (marks || []).map((m, i) => {
    const t = m.t - (r.t0 || 0);
    const p = r.points.length ? nearest(r.points, t) : null;
    return { i, letter: MARK_LETTER(i), t, kmh: p ? p.kmh : NaN, lat: p ? p.lat : NaN, lon: p ? p.lon : NaN, note: m.note || '', cat: MARK_CATS[m.cat] ? m.cat : 'annet' };
  });
}

export function eventsPer10km(r) {
  return r.stats.km > 0.2 ? r.events.length / r.stats.km * 10 : 0;
}

/* Tekstoppsummering til deling (meldinger, e-post, AirDrop). */
export function buildSummary(r, ctx = {}) {
  const lines = [];
  lines.push(`Kjørerapport${ctx.subtitle ? ' – ' + ctx.subtitle : ''}${ctx.driver && !(ctx.subtitle || '').includes(ctx.driver) ? ' – ' + ctx.driver : ''}`);
  lines.push(`Poeng: ${r.overall} – ${rating(r.overall)}`);
  lines.push(`Distanse ${km(r.stats.km)} · Tid ${duration(r.stats.duration)} · Snittfart ${kmh(r.stats.avgKmh)} · Toppfart ${kmh(r.stats.maxKmh)}`);
  lines.push(`Bremsing ${r.scores.brake} · Akselerasjon ${r.scores.accel} · Svinger ${r.scores.turn} · Jevn fart ${r.scores.smooth}`);
  const names = ctx.enrich && ctx.enrich.names ? ctx.enrich.names : { events: {}, marks: {} };
  if (r.events.length) {
    lines.push(`Hendelser (${r.events.length}):`);
    for (const e of r.events) lines.push(`${e.n}. ${eventLabel(e)} – ${mss(e.t)}, ${kmh(e.speedKmh)}, ${gee(e.g)}${names.events[e.n] ? ' – ' + names.events[e.n] : ''}`);
  } else lines.push('Ingen brå hendelser.');
  const sp = speedingFor(r, ctx.enrich);
  if (sp) {
    lines.push(`Fartsgrenser: ${sp.score} poeng, ${n0(sp.secondsOver)} s over grensen${sp.episodes.length ? ':' : '.'}`);
    for (const e of sp.episodes) lines.push(`– ${mss(e.tFrom)}–${mss(e.tTo)}: ${kmh(e.maxKmh)} i ${e.limit}-sone`);
  }
  lines.push('Tips:');
  for (const t of r.tips) lines.push(`– ${t.text}`);
  const marks = markRows(ctx.marks, r);
  if (marks.length) {
    lines.push(`Ledsagerens merker (${marks.length}):`);
    for (const m of marks) lines.push(`${m.letter}. ${MARK_CATS[m.cat].label} – ${mss(m.t)}${Number.isFinite(m.kmh) ? ', ' + kmh(m.kmh) : ''}${names.marks[m.i] ? ', ' + names.marks[m.i] : ''}${m.note ? ' – ' + m.note : ''}`);
  }
  if (ctx.focusResults && ctx.focusResults.length) {
    lines.push('Dagens mål:');
    for (const f of ctx.focusResults) lines.push(`– ${f.label}: ${f.state === 'ok' ? 'nådd' : f.state === 'no' ? 'ikke nådd' : 'ikke målt'} (${f.text})`);
  }
  if (ctx.note) lines.push(`Notat: ${ctx.note}`);
  lines.push('Testversjon. Målingene er veiledende og erstatter ikke ledsager eller trafikklærer.');
  return lines.join('\n');
}

export function renderReport(root, r, ctx = {}) {
  const { prevScore = null, prev = null, title = 'Rapport', subtitle = '', gaps = [], interrupted = false,
    note = null, onNoteChange = null, onDelete = null, onShare = null, marks: rawMarks = [], onMarkNote = null,
    enrich = null, enrichStatus = null, canFetch = false, onFetch = null, diag = null,
    realMap = false, driver = '', drivers = [], onDriverChange = null, startedAt = null, focus = [], sameRoute = [], onSpeak = null, feedbackHref = null } = ctx;
  if (leafletMap) { leafletMap.remove(); leafletMap = null; highlight = null; }
  if (navObserver) { navObserver.disconnect(); navObserver = null; }
  const useReal = realMap && typeof window !== 'undefined' && window.L && r.points.length > 1;
  const positives = ['brake', 'accel', 'turn', 'smooth'].filter(k => r.scores[k] >= 90);
  const marks = markRows(rawMarks, r);
  const short = r.stats.km < 1;
  const names = enrich && enrich.names ? enrich.names : { events: {}, marks: {} };
  const sp = speedingFor(r, enrich);
  const road = enrich && enrich.road ? { ...evaluateRoad(r.points, enrich.road, r.events), fromNvdb: true } : null;
  const log = startedAt ? driveLog(r, Date.parse(startedAt), sp ? sp.limits : null) : null;
  const focusResults = evaluateFocus(focus, { r, sp, road, marks, log });
  const sits = buildSituations(r, { camera: r.camera, marks, sp, nvdb: road, road: r.road || null });
  const sitSum = situationSummary(sits);

  // Datakvalitet: alt teknisk samlet ett sted
  const quality = [];
  if (interrupted) quality.push({ sev: 2, text: 'Opptaket ble avbrutt før «Stopp» ble trykket. Rapporten gjelder den delen som ble lagret.' });
  if (short) quality.push({ sev: 2, text: `Kort tur (${km(r.stats.km)}). Grunnlaget er tynt, så poengene bør ikke vektlegges.` });
  if (r.holder && r.holder.episodes.length) quality.push({ sev: r.holder.permanentShift ? 2 : 1, text: `${r.holder.episodes.map(e => `Telefonen ble flyttet i holderen ${mss(e.from)}–${mss(e.to)}.`).join(' ')} ${r.holder.permanentShift
      ? (r.alongSource === 'acc' && r.accFit && r.accFit.segments > 1 ? 'Den satt annerledes etterpå, så v3 kalibrerte på nytt.' : 'Den satt annerledes etterpå, så målingene etter dette er mindre sikre.')
      : 'Den ble satt tilbake som før, så målingene er fortsatt gode.'}` });
  if (gaps.length) quality.push({ sev: 1, text: `Appen var skjult ${gaps.length === 1 ? 'én gang' : gaps.length + ' ganger'} (til sammen ${n0(gaps.reduce((s, g) => s + (g.to - g.from), 0))} s). Hullene er grå i fartsgrafen.` });
  if (r.droppedPoints) quality.push({ sev: 0, text: `${r.droppedPoints === 1 ? 'Ett GPS-punkt' : r.droppedPoints + ' GPS-punkter'} med umulige posisjonshopp ble sett bort fra.` });
  if (r.engine === 'v3' && r.alongSource !== 'acc') quality.push({ sev: 1, text: 'Akselerometeret passet dårlig med GPS (løs holder?), så bremsing og gass ble målt med GPS.' });
  const qualitySev = quality.reduce((m, q) => Math.max(m, q.sev), 0);
  const qualityCount = quality.filter(q => q.sev > 0).length;
  const reportActions = typeof document !== 'undefined' ? document.getElementById('report-actions') : null;
  const barTitle = typeof document !== 'undefined' ? document.getElementById('report-bar-title') : null;
  if (barTitle) barTitle.textContent = title;
  if (reportActions) {
    reportActions.innerHTML = `${onSpeak ? `<button type="button" class="icon-btn" id="btn-speak" aria-label="Les opp oppsummeringen">${icon('volume', 22)}</button>` : ''}
      <button type="button" class="icon-btn" id="btn-print" aria-label="Skriv ut eller lagre som PDF">${icon('print', 22)}</button>
      ${onShare ? `<button type="button" class="icon-btn" id="btn-share" aria-label="Del oppsummering">${icon('share', 22)}</button>` : ''}`;
  }
  const tipsAll = r.tips.filter(t => t.cat !== 'good');
  root.innerHTML = `
    <header class="report-head">
      <p class="eyebrow">${esc(subtitle)}</p>
      ${enrichStatus ? `<p class="enrich-status ${enrichStatus.error ? 'error' : ''}" id="enrich-status" aria-live="polite">${esc(enrichStatus.text)}${enrichStatus.error && onFetch ? ' <button type="button" class="link" id="btn-fetch">Prøv igjen</button>' : ''}</p>`
        : (enrich && enrich.error && canFetch && onFetch ? `<p class="enrich-status error">Forrige henting feilet: ${esc(enrich.error)} <button type="button" class="link" id="btn-fetch">Prøv igjen</button></p>` : '')}
    </header>
    <section class="hero card">
      ${speedSign(r.overall)}
      <div class="hero-text">
        <p class="rating">${esc(rating(r.overall))}</p>
        ${prevScore !== null ? `<p class="delta-pill ${r.overall > prevScore ? 'up' : r.overall < prevScore ? 'down' : ''}">${r.overall > prevScore ? '▲ ' + (r.overall - prevScore) : r.overall < prevScore ? '▼ ' + (prevScore - r.overall) : '='} fra forrige tur (${n0(prevScore)})</p>` : ''}
        ${qualitySev >= 2 ? `<p class="hero-warn">${icon('warn', 18)}<span>${esc(quality.find(q => q.sev >= 2).text)}</span></p>` : ''}
      </div>
      <dl class="stat-chips">
        <div><dt>Distanse</dt><dd>${km(r.stats.km)}</dd></div>
        <div><dt>Tid</dt><dd>${duration(r.stats.duration)}</dd></div>
        <div><dt>Snittfart</dt><dd>${kmh(r.stats.avgKmh)}</dd></div>
        <div><dt>Toppfart</dt><dd>${kmh(r.stats.maxKmh)}</dd></div>
        <div><dt>Hendelser</dt><dd>${r.events.length}</dd></div>
        <div><dt>Per 10 km</dt><dd>${n1(eventsPer10km(r))}</dd></div>
      </dl>
    </section>

    <section class="card summary-card">
      <h2 class="card-title">${icon('list')}Kort fortalt</h2>
      <ul class="summary-list">
        ${positives.map(k => `<li class="sum-good">${icon('check', 20)}<span><strong>${CATS[k]}:</strong> ${POSITIVE[k]}</span></li>`).join('')}
        ${tipsAll.map(t => `<li class="sum-work sum-${t.cat}">${icon('chev', 20)}<span>${esc(t.text)}</span></li>`).join('')}
        ${!positives.length && !tipsAll.length ? r.tips.map(t => `<li class="sum-good">${icon('check', 20)}<span>${esc(t.text)}</span></li>`).join('') : ''}
        ${sp && sp.secondsOver > 0 ? `<li class="sum-work sum-limits">${icon('speed', 20)}<span>${n0(sp.secondsOver)} sekunder over fartsgrensen${sp.maxOver >= 4 ? `, mest ${n0(sp.maxOver)} km/t over` : ''}.</span></li>` : ''}
        ${sitSum.high ? `<li class="sum-work sum-brake">${icon('warn', 20)}<span><strong>${sitSum.high} ${sitSum.high === 1 ? 'alvorlig situasjon' : 'alvorlige situasjoner'}</strong> – se Situasjoner.</span></li>` : ''}
        ${marks.length ? `<li class="sum-note">${icon('flag', 20)}<span>Ledsageren merket: ${Object.entries(marks.reduce((o, m) => { o[m.cat] = (o[m.cat] || 0) + 1; return o; }, {})).map(([c, n]) => `${MARK_CATS[c].label.toLowerCase()} ${n}`).join(', ')}.</span></li>` : ''}
      </ul>
    </section>

    ${focusResults.length ? `<section class="card focus-card">
      <h2 class="card-title">${icon('target')}Dagens mål</h2>
      <ul class="focus-list">${focusResults.map(f => `<li class="f-${f.state}"><span class="f-ico">${f.state === 'ok' ? icon('check', 18) : f.state === 'no' ? icon('chev', 18) : icon('info', 18)}</span>
        <span><strong>${esc(f.label)}</strong><span class="muted small">${esc(f.text)}</span></span>
        <span class="f-state">${f.state === 'ok' ? 'Nådd' : f.state === 'no' ? 'Øv mer' : ''}</span></li>`).join('')}</ul>
    </section>` : ''}

    <nav class="quicknav" aria-label="Hopp til">
      <a href="#map-section">Rute</a>${sits.length ? `<a href="#situation-section">Situasjoner${sitSum.high + sitSum.medium ? ` <span class="count">${sitSum.high + sitSum.medium}</span>` : ''}</a>` : ''}<a href="#score-section">Poeng</a>${sameRoute.length > 1 ? '<a href="#route-section">Samme rute</a>' : ''}${sp ? '<a href="#limits-section">Fartsgrense</a>' : ''}<a href="#speed-section">Fart</a><a href="#events-section">Hendelser${r.events.length ? ` <span class="count">${r.events.length}</span>` : ''}</a><a href="#maneuver-section">Manøvrer</a>${r.camera ? '<a href="#camera-section">Blikk</a>' : ''}${r.road ? '<a href="#road-section">Veien</a>' : ''}${marks.length ? `<a href="#marks-section">Merker <span class="count">${marks.length}</span></a>` : ''}<a href="#quality-section">Data</a>
    </nav>


    <section class="card" id="map-section">
      <h2 class="card-title">${icon('map')}Ruten</h2>
      ${useReal ? `<div class="lmap-wrap" id="lmap-wrap">
          <div id="lmap" class="lmap" role="region" aria-label="Kart over ruten med ${r.events.length} hendelser"></div>
          <button type="button" class="btn small-btn secondary lmap-toggle" id="btn-map-expand">Utforsk kartet</button>
          <div class="replay-hud" id="replay-hud" hidden aria-live="off"><span id="replay-time">0:00</span><span id="replay-speed">0 km/t</span><span id="replay-ev"></span></div>
        </div>
        <div class="replay-bar">
          <button type="button" class="btn small-btn secondary" id="btn-replay">${icon('play', 18)}<span>Spill av turen</span></button>
          <div class="seg-mini" role="group" aria-label="Avspillingsfart"><button type="button" data-x="20" class="on">20×</button><button type="button" data-x="60">60×</button></div>
        </div>
        ${typeof navigator !== 'undefined' && !navigator.onLine ? '<p class="muted small">Uten nett vises bare kartbiter du har sett før.</p>' : ''}`
        : routeMap(r, marks)}
      <ul class="legend">
        <li><span class="dot" style="background:var(--good)"></span>Start</li>
        <li><span class="dot square" style="background:var(--road-edge)"></span>Slutt</li>
        <li><span class="dot" style="background:var(--brake)"></span>Bremsing</li>
        <li><span class="dot" style="background:var(--accel)"></span>Akselerasjon</li>
        <li><span class="dot" style="background:var(--turn)"></span>Sving</li>
        ${marks.length ? '<li><span class="dot diamond" style="background:var(--ink)"></span>Merke</li>' : ''}
        ${useReal && sp && sp.episodes.length ? '<li><span class="dot line" style="background:var(--sign)"></span>Over fartsgrensen</li>' : ''}
      </ul>
      <p class="muted small">Trykk på et nummer i kartet for å se hendelsen. ${useReal ? 'Knip for å zoome, eller trykk «Utforsk kartet» for å flytte rundt.' : ''}</p>
    </section>

    ${sits.length ? situationSection(sits, sitSum) : ''}

    <section class="card" id="score-section">
      <h2 class="card-title">${icon('chart')}Slik gikk det</h2>
      ${prev ? '<p class="muted small">Pilene viser endring fra forrige tur.</p>' : ''}
      ${r.perKm ? `<p class="muted small">Poengene er justert for distanse: trekk regnes per 10 km${r.kmFactor > 1.01 ? ', og turer under 5 km regnes som 5 km' : ''}.</p>` : ''}
      <div class="bars">${['brake', 'accel', 'turn', 'smooth'].map(k => scoreBar(k, r.scores[k], prev ? prev.scores[k] : null)).join('')}</div>
    </section>

    ${sameRoute.length > 1 ? `<section class="card" id="route-section">
      <h2 class="card-title">${icon('chart')}Samme rute</h2>
      <p class="muted small">Dere har kjørt denne strekningen ${sameRoute.length} ganger. Slik har det gått:</p>
      <table class="route-table"><thead><tr><th>Dato</th><th>Poeng</th><th>Hendelser</th><th>Tid</th></tr></thead><tbody>
      ${sameRoute.map(x => `<tr class="${x.current ? 'cur' : ''}" data-id="${x.id}"><td>${esc(x.date)}${x.current ? ' <span class="tag">denne</span>' : ''}</td><td><strong>${x.overall}</strong></td><td>${x.events}</td><td>${duration(x.duration)}</td></tr>`).join('')}
      </tbody></table>
      ${(() => { const others = sameRoute.filter(x => !x.current); const cur = sameRoute.find(x => x.current); if (!others.length || !cur) return ''; const best = Math.max(...others.map(x => x.overall)); const d = cur.overall - best; return `<p class="route-verdict ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? `Beste tur på denne ruten hittil${d > 0 ? ` (${d} poeng over forrige beste)` : ''}.` : `${-d} poeng under beste tur på ruten (${best}).`}</p>`; })()}
    </section>` : ''}

    ${sp ? `<section class="card" id="limits-section">
      <h2 class="card-title">${icon('speed')}Fartsgrenser</h2>
      <p class="muted small">Fra Statens vegvesen (NVDB). Teller når farten er minst 4 km/t over grensen i minst 3 sekunder. Inngår ikke i samlet poengsum.</p>
      <div class="bars">${scoreBar('limits', sp.score, null)}</div>
      <dl class="stats limits-stats">
        <div><dt>Over grensen</dt><dd>${n0(sp.secondsOver)} s</dd></div>
        <div><dt>Mest over</dt><dd>${sp.maxOver >= 4 ? '+' + n0(sp.maxOver) + ' km/t' : '–'}</dd></div>
        <div><dt>Ruten dekket</dt><dd>${n0(sp.coverage * 100)} %</dd></div>
      </dl>
      ${sp.episodes.length ? `<ol class="episodes">${sp.episodes.map(e => `
        <li><span class="limit-pill">${e.limit}</span>
          <span class="ev-text"><strong>${kmh(e.maxKmh)} i ${e.limit}-sone</strong><span class="muted">${mss(e.tFrom)}–${mss(e.tTo)} inn i turen · +${n0(e.over)} km/t</span></span></li>`).join('')}</ol>`
        : '<p class="muted">Ingen fartsovertredelser registrert.</p>'}
    </section>` : ''}

    <section class="card" id="speed-section">
      <h2 class="card-title">${icon('speed')}Fart underveis</h2>
      ${speedChart(r, gaps, marks, sp)}
      ${sp ? '<p class="muted small">Rød stiplet linje er fartsgrensen. Rødt felt er tid over grensen.</p>' : ''}
    </section>

    <section class="card" id="events-section">
      <h2 class="card-title">${icon('warn')}Hendelser</h2>
      ${r.events.length ? `<ol class="events">${r.events.map(e => `
        <li><button type="button" class="event" data-n="${e.n}" style="--c:${KIND_COLOR[e.kind]}">
          <span class="num">${e.n}</span>
          <span class="ev-text"><strong>${esc(eventLabel(e))}</strong><span class="muted">${mss(e.t)} inn i turen, ${kmh(e.speedKmh)}</span>${names.events[e.n] ? `<span class="ev-place">${esc(names.events[e.n])}</span>` : ''}</span>
          <span class="ev-g">${gee(e.g)}<span class="g-word muted">${gWord(e.g)}</span></span>
          <span class="ev-chev" aria-hidden="true">›</span>
        </button>
        <div class="ev-detail" id="ev-detail-${e.n}" hidden></div></li>`).join('')}</ol>
        <p class="muted small">Trykk på en hendelse for detaljer.</p>` : '<p class="muted">Ingen brå hendelser registrert på denne turen.</p>'}
    </section>

    ${maneuverSection(r, road, log, marks, !!(enrich && enrich.road))}

    ${r.camera ? cameraSection(r, ctx) : ''}
    ${r.road ? roadSection(r, ctx) : ''}

    ${marks.length ? `<section class="card" id="marks-section">
      <h2 class="card-title">${icon('flag')}Ledsagerens merker</h2>
      <p class="muted small">Tidspunkt ledsageren merket underveis. Skriv hva som skjedde, så blir det med i rapporten.</p>
      <ol class="marks">${marks.map(m => `
        <li class="mark-row" data-i="${m.i}">
          <span class="num mark-num">${m.letter}</span>
          <span class="ev-text"><strong><span class="mark-cat">${icon(MARK_CATS[m.cat].icon, 16)}${MARK_CATS[m.cat].label}</span> ${mss(m.t)}${Number.isFinite(m.kmh) ? ', ' + kmh(m.kmh) : ''}</strong>${names.marks[m.i] ? `<span class="ev-place">${esc(names.marks[m.i])}</span>` : ''}
            ${onMarkNote ? `<textarea class="mark-note" rows="1" placeholder="Hva skjedde? F.eks. «glemte speil før feltskifte»" aria-label="Kommentar til merke ${m.letter}">${esc(m.note)}</textarea>`
              : (m.note ? `<span>${esc(m.note)}</span>` : '<span class="muted">Ingen kommentar</span>')}
          </span>
        </li>`).join('')}</ol>
    </section>` : ''}

    ${onNoteChange ? `<section class="card note-card">
      ${onDriverChange && (drivers.length || driver) ? `<label class="driver-row">Fører
        <select id="drive-driver">
          <option value="">Ikke valgt</option>
          ${[...new Set([...(drivers || []), ...(driver ? [driver] : [])])].map(d => `<option value="${esc(d)}" ${d === driver ? 'selected' : ''}>${esc(d)}</option>`).join('')}
        </select></label>` : ''}
      <label for="drive-note"><h2 class="card-title">${icon('note')}Notat</h2></label>
      <textarea id="drive-note" rows="2" placeholder="Hva øvde dere på? F.eks. «rundkjøringer og feltskifte»">${esc(note || '')}</textarea>
      <p class="muted small" id="note-status">Lagres automatisk.</p>
    </section>` : ''}

    <section class="card" id="quality-section">
      <details ${qualitySev >= 2 ? 'open' : ''}>
        <summary><span class="card-title">${icon('shield')}Datakvalitet</span><span class="pill ${qualityCount ? 'warn' : 'ok'}">${qualityCount ? qualityCount + (qualityCount === 1 ? ' merknad' : ' merknader') : 'God'}</span></summary>
        <ul class="quality-list">
          ${quality.length ? quality.map(q => `<li class="q-${q.sev}">${icon(q.sev ? 'warn' : 'info', 18)}<span>${esc(q.text)}</span></li>`).join('') : `<li class="q-0">${icon('check', 18)}<span>Ingen problemer funnet. GPS og sensorer leverte jevnt hele turen.</span></li>`}
        </ul>
        ${diag ? `<h3>Telefonen leverte</h3>
        <ul class="diag">
          <li>Bevegelsesdata: ${diag.motionEvents ? `${n1(diag.motionHz)} per sekund` : 'ingen'}${diag.hasGyro ? ', med gyroskop' : ', <strong>uten gyroskop</strong>'}${diag.hasLinearAcc ? ', med lineær akselerasjon' : ', <strong>uten lineær akselerasjon</strong>'}${diag.hasIncGravity ? '' : ', <strong>uten tyngdekraft</strong>'}</li>
          <li>GPS: ${diag.gpsFixes} posisjoner (${n1(diag.gpsHz)} per sekund)${Number.isFinite(diag.gpsMedianAcc) ? `, typisk nøyaktighet ${diag.gpsMedianAcc} m` : ''}</li>
          <li>Skjermlås (Wake Lock): ${esc(diag.wakeLock)} · Hjem-skjerm: ${diag.standalone ? 'ja' : 'nei'}${diag.replay ? ' · avspilt demo' : ''}</li>
          ${diag.appVersion ? `<li>Appversjon ved opptak: ${esc(diag.appVersion)}</li>` : ''}
          <li class="muted small">${esc(diag.userAgent || '')}</li>
        </ul>` : ''}
      </details>
    </section>

    <section class="card">
      <details>
        <summary><span class="card-title">${icon('info')}Slik måles det</span></summary>
        <div class="method">
          <p>Appen bruker telefonens GPS og bevegelsessensorer. Alt beregnes på telefonen.</p>
          <p><strong>Grenser denne rapporten bruker</strong> (etter følsomhet${ctx.customThresholds ? ' og egne terskler' : ''}): bremsing ${thTxt(r, 'brake')}, akselerasjon ${thTxt(r, 'accel')}, sving ${thTxt(r, 'turn')}.</p>
          <p><strong>Svinger</strong> måles som sidekraft: fart ganger hvor raskt bilen roterer. ${r.source === 'gyro'
            ? 'Rotasjonen kom fra gyroskopet, projisert på tyngdekraften, så det spiller ingen rolle hvordan telefonen står i holderen.'
            : 'Gyroskopdata manglet på denne turen, så rotasjonen ble beregnet fra GPS-retningen i stedet. Det er grovere og kan gå glipp av korte svinger.'}</p>
          <p><strong>Jevn fart</strong> ser på hvor mye farten varierer mens bilen er i bevegelse.${r.cityAware ? ' De siste og første 10 sekundene rundt hvert stopp telles ikke med, så kryss og lyskryss ikke trekker ned.' : ''}</p>
          <p><strong>Holder-sjekk:</strong> ${r.holder && r.holder.episodes.length ? `telefonen ble flyttet ${r.holder.episodes.length === 1 ? 'én gang' : r.holder.episodes.length + ' ganger'} underveis.` : 'telefonen sto stødig hele turen.'} Måles ved at tyngdekraftens retning i telefonen endrer seg brått.</p>
          <p><strong>Hendelser per 10 km</strong> gjør det lettere å sammenligne korte og lange turer.</p>
          <p><strong>Motor:</strong> ${r.alongSource === 'acc'
            ? `v3 – bremsing og gass ble målt med akselerometeret (100 ganger i sekundet) og kalibrert mot GPS (samsvar ${Math.round((r.accFit ? r.accFit.corr : 0) * 100)} %). Det fanger korte, harde bremser som GPS glatter bort.`
            : (r.engine === 'v3' ? 'v3 var valgt, men akselerometerdata manglet eller passet dårlig med GPS (løs holder?), så GPS-fart ble brukt.' : 'v1 – bremsing og gass fra GPS-fart.')}</p>
          <p>Hendelser som ligger mindre enn to sekunder fra hverandre slås sammen til én. Poengsummen trekker mest for kraftige hendelser, og samlet poengsum vekter bremsing 30 %, svinger 25 %, jevn fart 25 % og akselerasjon 20 %.</p>
          ${sp ? `<p><strong>Fartsgrenser</strong> hentes fra Statens vegvesen etter turen. Hvert GPS-punkt kobles til nærmeste fartsgrensestrekning innen 25 m, så i kryss og ved avkjøringer kan grensen bomme et sekund eller to. Poeng: 100 minus 1,5 per sekund over grensen, minus 10 per episode med 10 km/t eller mer over.</p>` : ''}
          <p>Følsomhet: ${esc(ctx.sensitivityLabel || 'Normal')}.</p>
        </div>
      </details>
    </section>

    ${onDelete ? `<button type="button" class="btn danger" id="btn-delete-drive">${icon('trash', 20)}Slett denne turen</button>` : ''}
    ${feedbackHref ? `<a class="btn secondary feedback-btn" href="${esc(feedbackHref)}">${icon('mail', 20)}Stemte rapporten? Si fra</a>` : ''}
    <footer class="report-foot">Testversjon. Målingene er veiledende og erstatter ikke ledsager eller trafikklærer. <a href="../personvern/" target="_blank" rel="noopener">Personvern</a></footer>
  `;

  const smooth = prefersReduced() ? 'auto' : 'smooth';
  const select = n => {
    root.querySelectorAll('.marker, .lm-ev').forEach(m => m.classList.toggle('active', m.dataset.n === n));
    root.querySelectorAll('.event').forEach(b => b.classList.toggle('active', b.dataset.n === n));
  };
  const showOnMap = n => {
    select(n);
    const e = r.events.find(x => String(x.n) === String(n));
    const ms = root.querySelector('#map-section');
    window.scrollTo({ top: ms.getBoundingClientRect().top + window.scrollY - 118, behavior: smooth });
    if (leafletMap && e) leafletMap.setView([e.lat, e.lon], Math.max(leafletMap.getZoom(), 16), { animate: !prefersReduced() });
  };
  const openDetail = (n, open) => {
    const panel = root.querySelector(`#ev-detail-${n}`), btn = root.querySelector(`.event[data-n="${n}"]`);
    if (!panel) return;
    const willOpen = open === undefined ? panel.hidden : open;
    if (willOpen && !panel.innerHTML) {
      const e = r.events.find(x => String(x.n) === String(n));
      panel.innerHTML = eventDetail(r, e, { marks, names, sp });
      panel.querySelector('.btn-show-map').addEventListener('click', () => showOnMap(n));
    }
    panel.hidden = !willOpen;
    btn.setAttribute('aria-expanded', String(willOpen));
    btn.classList.toggle('open', willOpen);
  };
  // Hendelse i listen → åpne detaljer og marker på kartet
  root.querySelectorAll('.event').forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', `ev-detail-${btn.dataset.n}`);
    btn.addEventListener('click', () => { select(btn.dataset.n); openDetail(btn.dataset.n); });
  });
  // Marker på kartet → hendelse i listen
  const fromMap = n => {
    select(n);
    openDetail(n, true);
    const row = root.querySelector(`.event[data-n="${n}"]`);
    if (row) row.scrollIntoView({ behavior: smooth, block: 'center' });
  };
  root.querySelectorAll('.marker').forEach(m => m.addEventListener('click', () => fromMap(m.dataset.n)));
  if (useReal) initRealMap(root, r, marks, sp, fromMap);
  root.querySelectorAll('.man-item').forEach(b => b.addEventListener('click', () => {
    const lat = Number(b.dataset.lat), lon = Number(b.dataset.lon);
    const ms = root.querySelector('#map-section');
    window.scrollTo({ top: ms.getBoundingClientRect().top + window.scrollY - 118, behavior: smooth });
    if (leafletMap && Number.isFinite(lat)) {
      if (highlight) highlight.remove();
      highlight = window.L.circleMarker([lat, lon], { radius: 18, className: 'map-highlight', weight: 4, fill: false }).addTo(leafletMap);
      leafletMap.setView([lat, lon], 17, { animate: !prefersReduced() });
    }
  }));
  const speakBtn = document.getElementById('btn-speak');
  if (speakBtn && onSpeak) speakBtn.onclick = () => onSpeak(spokenSummary(r, { focusResults, marks, sp }));
  root.querySelectorAll('.route-table tr[data-id]').forEach(tr => { if (!tr.classList.contains('cur')) { tr.tabIndex = 0; tr.onclick = () => { location.hash = '#/rapport/' + tr.dataset.id; }; } });
  const printBtn = document.getElementById('btn-print');
  if (printBtn) printBtn.onclick = () => window.print();
  const calibBtn = document.getElementById('btn-calib-drive');
  if (calibBtn && ctx.onCalibrate) calibBtn.onclick = () => ctx.onCalibrate(false);
  const useCalibBtn = document.getElementById('btn-use-calib');
  if (useCalibBtn && ctx.onCalibrate) useCalibBtn.onclick = () => ctx.onCalibrate(true);
  // Fanelinje: marker seksjonen som er i bildet
  const links = [...root.querySelectorAll('.quicknav a')];
  if ('IntersectionObserver' in window && links.length) {
    navObserver = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) {
        links.forEach(l => l.classList.toggle('on', l.getAttribute('href') === '#' + en.target.id));
        const on = links.find(l => l.classList.contains('on'));
        const nav = on && on.parentElement;
        if (on && nav) nav.scrollTo({ left: on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2, behavior: 'auto' });
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(l => { const sec = root.querySelector(l.getAttribute('href')); if (sec) navObserver.observe(sec); });
  }
  // Poengstolper vokser inn
  root.querySelectorAll('.bar-fill').forEach(f => { const w = f.style.width; f.style.width = '0%'; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.width = w; })); });
  const driverSel = root.querySelector('#drive-driver');
  if (driverSel && onDriverChange) driverSel.addEventListener('change', () => onDriverChange(driverSel.value));

  if (onNoteChange) {
    const ta = root.querySelector('#drive-note'), status = root.querySelector('#note-status');
    let timer = null;
    ta.addEventListener('input', () => {
      status.textContent = 'Lagrer …';
      clearTimeout(timer);
      timer = setTimeout(async () => { await onNoteChange(ta.value.trim()); status.textContent = 'Lagret.'; }, 600);
    });
  }
  if (onMarkNote) root.querySelectorAll('.mark-note').forEach(ta => {
    let timer = null;
    const i = Number(ta.closest('.mark-row').dataset.i);
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => onMarkNote(i, ta.value.trim()), 600); });
  });
  root.querySelectorAll('.quicknav a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const el = root.querySelector(a.getAttribute('href'));
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 118;
      window.scrollTo({ top: y, behavior: smooth });
      if (el.id === 'quality-section') { const d = el.querySelector('details'); if (d) d.open = true; }
    }
  }));
  countUp(root.querySelector('.sign text'), r.overall);
  if (onDelete) root.querySelector('#btn-delete-drive').addEventListener('click', onDelete);
  const fetchBtn = root.querySelector('#btn-fetch');
  if (fetchBtn && onFetch) fetchBtn.addEventListener('click', onFetch);
  const shareBtn = document.getElementById('btn-share');
  if (onShare && shareBtn) shareBtn.onclick = () => onShare(buildSummary(r, { subtitle, note, marks: rawMarks, enrich, driver, focusResults }));
}

const markCount = (marks, cats) => marks.filter(m => cats.includes(m.cat)).length;

/* Dagens øvingsmål: vurderer hvert valgt mål mot turen. state: ok | no | na */
export function evaluateFocus(focus, { r, sp = null, road = null, marks = [], log = null }) {
  const out = [];
  const man = r.maneuvers || { laneChanges: [], roundabouts: [] };
  const rbs = road && road.roundabouts && (road.roundabouts.length || road.fromNvdb) ? road.roundabouts : man.roundabouts;
  for (const id of focus || []) {
    const def = FOCUS.find(f => f.id === id);
    if (!def) continue;
    const res = { id, label: def.label, state: 'na', text: '' };
    const cnt = k => r.events.filter(e => e.kind === k).length;
    if (['brake', 'accel', 'turn'].includes(id)) {
      const sc = r.scores[id], n = cnt(id);
      res.state = sc >= 90 ? 'ok' : 'no';
      res.text = `${sc} poeng, ${n === 0 ? 'ingen hendelser' : n === 1 ? 'én hendelse' : n + ' hendelser'}`;
    } else if (id === 'smooth') {
      res.state = r.scores.smooth >= 85 ? 'ok' : 'no';
      res.text = `${r.scores.smooth} poeng`;
    } else if (id === 'limits') {
      if (!sp) res.text = 'Slå på Veidata i innstillinger for å måle fartsgrenser';
      else { res.state = sp.secondsOver <= 10 ? 'ok' : 'no'; res.text = sp.secondsOver ? `${n0(sp.secondsOver)} s over grensen` : 'Aldri over grensen'; }
    } else if (id === 'roundabout') {
      if (!rbs.length) res.text = 'Ingen rundkjøringer på ruten';
      else {
        const withEv = rbs.filter(x => (x.events || r.events.filter(e => e.t >= x.tFrom - 3 && e.t <= x.tTo + 3).map(e => e.n)).length);
        res.state = withEv.length ? 'no' : 'ok';
        res.text = `${rbs.length} ${rbs.length === 1 ? 'rundkjøring' : 'rundkjøringer'}${withEv.length ? `, ${withEv.length} med brå hendelse` : ', ingen brå hendelser'}`;
      }
    } else if (id === 'lane') {
      const lc = man.laneChanges;
      if (!lc.length) res.text = 'Ingen feltskifter funnet';
      else {
        const flagged = lc.filter(l => marks.some(m => ['speil', 'skulder', 'blink'].includes(m.cat) && m.t >= l.tFrom - 10 && m.t <= l.tTo + 10));
        res.state = flagged.length ? 'no' : 'ok';
        res.text = `${lc.length} ${lc.length === 1 ? 'feltskifte' : 'feltskifter'}${flagged.length ? `, ledsageren merket ${flagged.length}` : ', ingen merknader fra ledsager'}`;
      }
    } else if (id === 'junction') {
      const stops = road ? road.stops : [], gw = road ? road.giveway : [];
      if (!road) res.text = 'Slå på Veidata i innstillinger for å finne kryss';
      else if (!stops.length && !gw.length) res.text = 'Ingen stopp- eller vikepliktkryss funnet';
      else {
        const rolled = stops.filter(x => !x.full).length;
        const fast = gw.filter(g => g.approachKmh > 40).length;
        res.state = rolled || fast ? 'no' : 'ok';
        res.text = [stops.length ? `${stops.length} stoppskilt${rolled ? `, ${rolled} uten helt stopp` : ', helt stopp ved alle'}` : '', gw.length ? `${gw.length} vikepliktkryss${fast ? `, ${fast} med høy fart inn` : ''}` : ''].filter(Boolean).join(' · ');
      }
    } else if (id === 'mirror') {
      const n = markCount(marks, ['speil', 'skulder']);
      res.state = n ? 'no' : 'ok';
      res.text = n ? `Ledsageren merket speil eller skulder ${n === 1 ? 'én gang' : n + ' ganger'}` : 'Ingen merknader fra ledsager';
    } else if (id === 'dark') {
      const min = log ? Math.round(log.light.dark / 60) : 0;
      res.state = min >= 15 ? 'ok' : min > 0 ? 'no' : 'na';
      res.text = min ? `${min} min i mørke` : 'Turen var i dagslys';
    }
    out.push(res);
  }
  return out;
}

/* Samkjøring: det som skjedde, med alle kildene som så det (v0.8.0) */
const SIT_ICON = { away: 'eye', event: 'warn', lane: 'shift', start: 'play', speed: 'speed' };
const LEVEL_LABEL = { high: 'Alvorlig', medium: 'Bør øves på', low: 'Liten ting', ok: 'Bra' };
function situationSection(sits, sum) {
  const shown = sits.filter(s => s.level !== 'ok').sort((a, b) => (LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) || (a.t - b.t));
  const good = sits.filter(s => s.level === 'ok');
  const item = s => `<li><button type="button" class="man-item sit-item" data-lat="${s.lat}" data-lon="${s.lon}">
      <span class="man-ico sit-${s.level}">${icon(SIT_ICON[s.kind] || 'info', 20)}</span>
      <span class="ev-text"><strong>${esc(s.title)}</strong><span class="muted small">${mss(s.t)} · ${LEVEL_LABEL[s.level]}</span><span class="sit-text">${esc(s.text)}</span>
        <span class="src-chips">${s.sources.map(k => `<span class="src-chip">${SOURCE_LABEL[k]}</span>`).join('')}</span></span>
      ${icon('chev', 18)}</button></li>`;
  return `<section class="card" id="situation-section">
      <h2 class="card-title">${icon('layers')}Situasjoner</h2>
      <p class="muted small">GPS, bevegelse${sits.some(s => s.sources.includes('camera')) ? ', førerkamera' : ''}${sits.some(s => s.sources.includes('road')) ? ', veidata' : ''} og ledsagerens merker satt sammen.${sum.high ? ` ${sum.high} alvorlig${sum.high === 1 ? '' : 'e'}, ${sum.medium} å øve på.` : ''}</p>
      ${shown.length ? `<ul class="man-list">${shown.map(item).join('')}</ul>` : '<p>Ingen situasjoner å øve på. Bra!</p>'}
      ${good.length ? `<details class="adv"><summary>${good.length} ${good.length === 1 ? 'situasjon' : 'situasjoner'} gikk bra</summary><ul class="man-list">${good.map(item).join('')}</ul></details>` : ''}
    </section>`;
}

/* Langs vegen (veidata v2): gangfelt, fartsdempere, lyskryss og skilt som turen passerte */
function alongRoad(road) {
  const c = road.crossings || [], b = road.bumps || [], s = road.signals || [], g = road.signs || [];
  if (!c.length && !b.length && !s.length && !g.length) return '';
  const avg = a => Math.round(a.reduce((t, x) => t + x.kmh, 0) / a.length);
  const fastC = c.filter(x => x.kmh >= 45).length, fastB = b.filter(x => x.kmh > 35).length;
  const rows = [
    c.length ? `<li><strong>Gangfelt:</strong> ${c.length} passert, snitt ${avg(c)} km/t${fastC ? `, ${fastC} i 45 km/t eller mer` : ''}.</li>` : '',
    b.length ? `<li><strong>Fartsdempere:</strong> ${b.length}, snitt ${avg(b)} km/t${fastB ? `, ${fastB} over 35 km/t` : ''}.</li>` : '',
    s.length ? `<li><strong>Lyskryss:</strong> ${s.length}${s.filter(x => x.stopped).length ? `, stoppet ved ${s.filter(x => x.stopped).length}` : ''}.</li>` : '',
    g.filter(x => x.kind === 'barn').length ? `<li><strong>Skiltet Barn:</strong> ${g.filter(x => x.kind === 'barn').map(x => `høyst ${x.maxKmh} km/t etter skiltet`).join(', ')}.</li>` : '',
    g.filter(x => x.kind !== 'barn').length ? `<li><strong>Farlig sving:</strong> ${g.filter(x => x.kind !== 'barn').map(x => `${x.kmh} km/t ved skiltet${x.events.length ? ', brå hendelse etterpå' : ''}`).join(', ')}.</li>` : ''
  ].join('');
  return `<h3 class="mt">Langs vegen</h3><ul class="along-list">${rows}</ul><p class="muted small">Fra Statens vegvesen (NVDB). Skilt teller bare når de sto på høyre side av bilen.</p>`;
}

function maneuverSection(r, road, log, marks, hasRoadData) {
  const man = r.maneuvers || { laneChanges: [], roundabouts: [] };
  const rbs = road && road.fromNvdb ? road.roundabouts : man.roundabouts;
  const items = [];
  for (const x of rbs) {
    const ev = x.events || r.events.filter(e => e.t >= x.tFrom - 3 && e.t <= x.tTo + 3).map(e => e.n);
    const dir = Number.isFinite(x.net) ? (Math.abs(x.net) < 35 ? 'rett fram' : x.net > 150 ? 'helt rundt' : x.net > 0 ? 'til venstre' : 'til høyre') : '';
    items.push({ t: x.t, lat: x.lat, lon: x.lon, ico: 'round', ok: !ev.length,
      title: `Rundkjøring${x.name ? ' · ' + x.name.replace(/^.*?X\s*/, '') : ''}`, sub: `${mss(x.t)}${dir ? ' · ' + dir : ''}`, verdict: ev.length ? `${ev.length === 1 ? 'Én brå hendelse' : ev.length + ' brå hendelser'} (${ev.join(', ')})` : 'Ingen brå hendelser' });
  }
  const truth = laneTruth(man.laneChanges, marks);
  man.laneChanges.forEach((x, k) => {
    const mk = marks.filter(m => m.t >= x.tFrom - 10 && m.t <= x.tTo + 10 && isRemark(m));
    const fasit = truth ? (truth.hits[k] ? ' · bekreftet av ledsager' : ' · ikke merket av ledsager') : '';
    items.push({ t: x.t, lat: x.lat, lon: x.lon, ico: 'lane', ok: !mk.length,
      title: `Feltskifte til ${x.dir}`, sub: `${mss(x.t)} · ${kmh(x.kmh)}${fasit}`, verdict: mk.length ? `Ledsager merket ${mk.map(m => MARK_CATS[m.cat].label.toLowerCase()).join(', ')}` : 'Ingen merknader' });
  });
  for (const m of (truth ? truth.missed : [])) {
    items.push({ t: m.t, lat: m.lat, lon: m.lon, ico: 'shift', ok: true, title: 'Feltskifte merket av ledsager', sub: mss(m.t), verdict: 'Ikke funnet av appen' });
  }
  for (const x of (road ? road.stops : [])) {
    items.push({ t: x.t, lat: x.lat, lon: x.lon, ico: 'stop', ok: x.full, title: 'Stoppskilt', sub: mss(x.t), verdict: x.full ? 'Helt stopp' : `Rullende stopp (laveste ${x.minKmh} km/t)` });
  }
  items.sort((a, b) => a.t - b.t);
  const gw = road ? road.giveway : [];
  const avgIn = gw.length ? gw.reduce((s, g) => s + g.approachKmh, 0) / gw.length : 0;
  const tot = log ? log.total.sec || 1 : 1;
  const mix = log ? ['by', 'land', 'motor'].map(k => ({ k, sec: log.sec[k], pct: log.sec[k] / tot * 100 })) : [];
  return `<section class="card" id="maneuver-section">
      <h2 class="card-title">${icon('round')}Veier og manøvrer</h2>
      ${log ? `<div class="road-mix" role="img" aria-label="Fordeling av kjøretid på veityper">${mix.filter(m => m.sec > 0).map(m => `<span class="mix-${m.k}" style="width:${m.pct.toFixed(1)}%"></span>`).join('')}</div>
      <ul class="legend">${mix.filter(m => m.sec >= 30).map(m => `<li><span class="dot mix-dot mix-${m.k}"></span>${ROAD_LABEL[m.k].split(' og')[0]} ${Math.round(m.sec / 60)} min</li>`).join('')}</ul>
      <p class="muted small">${['day', 'twilight', 'dark'].filter(k => log.light[k] > 30).map(k => `${LIGHT_LABEL[k]} ${Math.round(log.light[k] / 60)} min`).join(' · ')}${log.roadSource === 'fart' ? ' · Veitype anslått ut fra farten' : ''}</p>` : ''}
      ${truth ? `<p class="lane-truth">${icon('shift', 18)}<span>Fasit: ledsageren merket ${truth.marked} ${truth.marked === 1 ? 'feltskifte' : 'feltskifter'}, appen fant ${truth.found} av dem${truth.extra ? `, og ${truth.extra} som ikke var merket` : ''}.</span></p>` : ''}
      ${items.length ? `<ul class="man-list">${items.map(it => `<li><button type="button" class="man-item" data-lat="${it.lat}" data-lon="${it.lon}">
          <span class="man-ico ${it.ok ? 'ok' : 'no'}">${icon(it.ico, 20)}</span>
          <span class="ev-text"><strong>${esc(it.title)}</strong><span class="muted small">${esc(it.sub)}</span><span class="man-verdict ${it.ok ? 'ok' : 'no'}">${esc(it.verdict)}</span></span>
          ${icon('chev', 18)}</button></li>`).join('')}</ul>` : '<p class="muted">Ingen rundkjøringer, feltskifter eller stoppskilt funnet på turen.</p>'}
      ${road && road.crossings ? alongRoad(road) : ''}
      ${gw.length ? `<details class="gw"><summary><span><strong>Vikeplikt:</strong> ${gw.length} ${gw.length === 1 ? 'kryss' : 'kryss'} der dere bremset ned · snitt ${kmh(avgIn)} inn</span></summary>
        <ul class="gw-list">${gw.map(g => `<li><button type="button" class="man-item small" data-lat="${g.lat}" data-lon="${g.lon}"><span>${mss(g.t)}</span><span>${kmh(g.approachKmh)} → ${kmh(g.minKmh)}</span>${icon('chev', 16)}</button></li>`).join('')}</ul>
        <p class="muted small">Om dere måtte vike for trafikk, kan ikke appen vite. Lav fart inn mot krysset gir tid til å se.</p></details>` : ''}
      ${hasRoadData ? '' : '<p class="muted small">Slå på <strong>Veidata</strong> i innstillinger for stoppskilt, vikeplikt og rundkjøringer fra Statens vegvesen. Feltskifter og rundkjøringer måles ellers med sensorene.</p>'}
      <p class="muted small">Feltskifter finnes i GPS-sporet (sideforflytning på 2,5–5 m) og bekreftes med gyroskopet. Under 45 km/t og der veien svinger ujevnt telles de ikke, så noen kan mangle.</p>
    </section>`;
}

/* Kamera-testversjonen: speil- og skulderblikk fra hodets retning */
const GLANCE_LABEL = { left: 'Venstre speil', right: 'Høyre speil', rear: 'Bakspeil', shoulderL: 'Skulder venstre', shoulderR: 'Skulder høyre' };
/* Veikameraet (testappen): avstand til bilen foran, sammen med GPS-farten. */
function roadSection(r, ctx = {}) {
  const rd = r.road, cp = ctx.cameraPlan || null, ln = rd.lane || null;
  const pc = v => Math.round(v * 100) + ' %';
  const REASON = { veiblikk: 'jevne veiblikk', nedbremsing: 'ved nedbremsing', 'bil nær foran': 'bil nær foran' };
  const cov = Math.round(rd.coverage * 100);
  const cam = r.camera;
  return `<section class="card" id="road-section">
      <h2 class="card-title">${icon('layers')}Veien foran <span class="beta-tag">Test</span></h2>
      <div class="road-stats">
        <div><strong>${rd.medianHeadway !== null ? n1(rd.medianHeadway) + ' s' : '–'}</strong><span class="muted small">vanlig avstand i tid</span></div>
        <div><strong>${rd.medianDist !== null ? rd.medianDist + ' m' : '–'}</strong><span class="muted small">vanlig avstand</span></div>
        <div><strong>${rd.close.length}</strong><span class="muted small">ganger for nær</span></div>
      </div>
      <p>${rd.close.length ? `For kort avstand til bilen foran ${rd.close.length === 1 ? 'én gang' : rd.close.length + ' ganger'}. Se Situasjoner.` : rd.medianHeadway !== null ? 'Ingen perioder med for kort avstand til bilen foran.' : 'Det var sjelden en bil rett foran når veikameraet så veien.'} Hold minst 2 sekunder, og 3 i mørke eller på glatt vei.</p>
      ${ln ? `<h3 class="mt">Plassering i feltet <span class="beta-tag">Test</span></h3>
      <p>${ln.medianOffset !== null ? `Bilen lå typisk ${Math.abs(ln.medianOffset).toFixed(2).replace('.', ',')} m ${ln.medianOffset > 0.05 ? 'til høyre for' : ln.medianOffset < -0.05 ? 'til venstre for' : 'fra'} midten av feltet, og varierte rundt ${ln.spread.toFixed(2).replace('.', ',')} m.${ln.nearEdge ? ` Nær en feltlinje i ${ln.nearEdge} bilder.` : ''}` : 'For få bilder med begge feltlinjene til å si noe om plasseringen.'}</p>
      <p class="muted small">Begge feltlinjene ble funnet i ${pc(ln.share)} av veibildene i minst 40 km/t. Forutsetter at telefonen står midt i bilen; står den til siden, forskyves tallene.</p>` : ''}
      ${cp && cp.share ? `<h3 class="mt">Kameratid</h3>
      <p>Førerkameraet så føreren ${pc(cp.share.front)} av tiden, veikameraet veien ${pc(cp.share.road)}, og ${pc(cp.share.blind)} gikk med til bytting (snitt ${cp.switchAvg ?? '–'} ms). ${cp.looks} veiblikk: ${Object.entries(cp.byReason || {}).map(([k, n]) => `${n} ${REASON[k] || k}`).join(', ') || 'ingen'}. Ingen veiblikk i svinger eller under 15 km/t.</p>
      ${cp.settings && cp.settings.reasons && cp.settings.reasons.length ? `<p class="muted small">${cp.settings.reasons.map(esc).join('. ')}.</p>` : ''}
      ${cp.perf && cp.perf.drops ? `<p class="notice">Telefonen ble treg ${cp.perf.drops} ${cp.perf.drops === 1 ? 'gang' : 'ganger'} (varm?), og kameraet gikk ned til 5 bilder i sekundet. Unngå direkte sol, og ha lader i.</p>` : ''}` : ''}
      <p class="muted small">Veikameraet så veien ${cov} % av tiden${cam && cam.frontShare !== undefined ? `, førerkameraet føreren ${Math.round(cam.frontShare * 100)} %` : ''}. Opptil ${rd.maxCars} biler i bildet samtidig${rd.peopleSeen ? `, folk eller syklister i ${rd.peopleSeen} bilder` : ''}. Avstanden anslås ut fra hvor bred bilen ser ut og kan bomme med 20–30 %. Mellom bildene fra veikameraet antas avstanden å være den samme, så lenge farten var nesten lik.</p>
    </section>`;
}

function cameraSection(r, ctx = {}) {
  const c = r.camera;
  const T = Math.max(1, r.points.length ? r.points[r.points.length - 1].t : 1);
  const cov = Math.round(c.coverage * 100);
  if (!c.calibrated) return `<section class="card" id="camera-section">
      <h2 class="card-title">${icon('mirror')}Speil og skulderblikk <span class="beta-tag">Test</span></h2>
      <p>Kameraet var på og så ansiktet ${cov} % av tiden, men det var ikke kalibrert. Hodets vinkler er lagret, så turen kan vurderes nå: sett telefonen i holderen akkurat der den sto under turen, og kalibrer.</p>
      ${ctx.onCalibrate ? `<button type="button" class="btn primary" id="btn-calib-drive">${icon('target', 20)}Kalibrer og vurder turen</button>
      ${ctx.hasCalib ? `<button type="button" class="btn secondary" id="btn-use-calib">Bruk kalibreringen jeg har</button><p class="muted small">Passer bare hvis holderen sto på samme sted.</p>` : ''}` : ''}
    </section>`;
  const W = 340, H = 64, x = t => (Math.max(0, Math.min(T, t)) / T * W).toFixed(1);
  const rowY = { rear: 10, left: 22, right: 34, shoulderL: 46, shoulderR: 46 };
  const ticks = c.glances.map(g => `<rect class="gl-${g.cls}" x="${x(g.t)}" y="${rowY[g.cls] - 4}" width="${Math.max(2, (g.dur / T) * W).toFixed(1)}" height="8" rx="1.5"/>`).join('');
  const lanes = c.lane.map(l => `<path class="gl-lane ${l.mirror && l.shoulder ? 'ok' : l.mirror === false || l.shoulder === false ? 'no' : 'unk'}" d="M${x(l.t)} 54 l-4 8 h8 z"/>`).join('');
  const gap = c.longestGap > 5 ? `<rect class="gl-gap" x="${x(c.longestGapAt)}" y="2" width="${Math.max(2, c.longestGap / T * W).toFixed(1)}" height="50"/>` : '';
  const yes = (ok, txt) => ok === null ? `<span class="cam-chip unk" title="Førerkameraet så veien akkurat da">? ${txt}</span>` : `<span class="cam-chip ${ok ? 'ok' : 'no'}">${ok ? icon('check', 14) : '✕'} ${txt}</span>`;
  const laneOk = c.lane.filter(l => l.mirror && l.shoulder).length;
  const verdict = c.perMin >= 6 ? 'Hyppige speilblikk – bra!' : c.perMin >= 3 ? 'Jevnlige speilblikk. Prøv å sjekke speilene litt oftere.' : 'Få speilblikk registrert. Øv på å sjekke speilene hvert 5.–8. sekund.';
  return `<section class="card" id="camera-section">
      <h2 class="card-title">${icon('mirror')}Speil og skulderblikk <span class="beta-tag">Test</span></h2>
      <div class="cam-stats">
        <div><strong>${n1(c.perMin)}</strong><span class="muted small">speilblikk per minutt</span></div>
        <div><strong>${c.longestGap > 5 ? Math.round(c.longestGap) + ' s' : '–'}</strong><span class="muted small">lengste tid uten speil</span></div>
        <div><strong>${c.lane.length ? `${laneOk} av ${c.lane.length}` : '–'}</strong><span class="muted small">feltskifter med speil og skulder</span></div>
      </div>
      <p>${verdict}</p>
      <svg class="cam-timeline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Tidslinje over blikk gjennom turen">
        ${gap}<line x1="0" x2="${W}" y1="52" y2="52" class="gl-axis"/>${ticks}${lanes}
      </svg>
      <ul class="legend"><li><span class="dot gl-dot gl-rear"></span>Bakspeil</li><li><span class="dot gl-dot gl-left"></span>Venstre</li><li><span class="dot gl-dot gl-right"></span>Høyre</li><li><span class="dot gl-dot gl-shoulderL"></span>Skulder</li><li><span class="dot gl-dot gl-gap"></span>Lengste pause</li><li>▲ Feltskifte</li></ul>
      <p class="muted small">${['left', 'right', 'rear', 'shoulderL', 'shoulderR'].filter(k => c.counts[k]).map(k => `${GLANCE_LABEL[k]} ${c.counts[k]}`).join(' · ') || 'Ingen blikk registrert'}</p>
      ${c.start ? `<h3 class="mt">Igangkjøring</h3><p>${yes(c.start.mirror, 'Speil før start')} ${yes(c.start.shoulder, 'Skulderblikk venstre')}</p>` : ''}
      ${c.lane.length ? `<h3 class="mt">Feltskifter</h3>${c.laneSource === 'marks' ? '<p class="muted small">Feltskiftene ledsageren merket. Speil 15–1 s før merket og skulderblikk 12–0 s før.</p>' : ''}<ul class="cam-lanes">${c.lane.map(l => `<li><span>${mss(l.t)} · ${l.dir ? 'til ' + esc(l.dir) : 'merket'}</span><span>${yes(l.mirror, 'Speil')} ${yes(l.shoulder, 'Skulder')}</span></li>`).join('')}</ul>` : ''}
      <p class="muted small">Kameraet så ansiktet ${cov} % av tiden${cov < 70 ? ' – flytt holderen så ansiktet er bedre synlig' : ''}. Dette er en test: kameraet ser hodet, ikke øynene, så korte blikk med bare øynene blir ikke med. Bruk tallene som en pekepinn og snakk med ledsageren om dem.</p>
      ${c.drift > 6 ? `<p class="notice">«Rett fram» flyttet seg ${Math.round(c.drift)}° i forhold til kalibreringen. Appen justerer for det, men kalibrer på nytt hvis holderen er flyttet.</p>` : ''}
      ${ctx.onCalibrate ? '<button type="button" class="link" id="btn-calib-drive">Stemmer ikke speilene? Kalibrer på nytt for denne turen</button>' : ''}
    </section>`;
}

function thTxt(r, k) {
  const t = r.thresholds && r.thresholds[k];
  if (!t) return '–';
  const f = v => (v / 9.81).toFixed(2).replace('.', ',');
  return `brå over ${f(t.brisk)} g, kraftig over ${f(t.harsh)} g`;
}

/* Ekte kart (Leaflet + Kartverket). Ruten tegnes som vei med gul midtlinje, hendelser som nummer. */
function initRealMap(root, r, marks, sp, onEventTap) {
  const L = window.L;
  const el = root.querySelector('#lmap');
  const mobile = L.Browser.mobile;
  const map = L.map(el, {
    zoomControl: true, attributionControl: true, scrollWheelZoom: false,
    dragging: !mobile, tap: false, zoomSnap: 0.5
  });
  leafletMap = map;
  L.tileLayer(TILE_URL, { maxZoom: 18, minZoom: 5, crossOrigin: true,
    attribution: '© <a href="https://www.kartverket.no/" target="_blank" rel="noopener">Kartverket</a>' }).addTo(map);
  const ll = r.points.map(p => [p.lat, p.lon]);
  L.polyline(ll, { className: 'route-edge', weight: 11, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
  L.polyline(ll, { className: 'route-asphalt', weight: 7, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
  L.polyline(ll, { className: 'route-lane', weight: 1.5, dashArray: '8 7', interactive: false }).addTo(map);
  if (sp) {
    let run = [];
    const flush = () => { if (run.length > 1) L.polyline(run, { className: 'route-over', weight: 7, lineCap: 'round', interactive: false }).addTo(map); run = []; };
    r.points.forEach((p, i) => { if (Number.isFinite(sp.limits[i]) && p.kmh - sp.limits[i] >= 4) run.push([p.lat, p.lon]); else flush(); });
    flush();
  }
  const icon = (html, cls, size) => L.divIcon({ html, className: cls, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  const first = r.points[0], last = r.points[r.points.length - 1];
  L.marker([first.lat, first.lon], { icon: icon('<span>Start</span>', 'lm-start', 22), interactive: false, keyboard: false }).addTo(map);
  L.marker([last.lat, last.lon], { icon: icon('<span>Slutt</span>', 'lm-end', 22), interactive: false, keyboard: false }).addTo(map);
  for (const m of marks) if (Number.isFinite(m.lat)) {
    L.marker([m.lat, m.lon], { icon: icon(`<span>${m.letter}</span>`, 'lm-mark', 28), interactive: false, keyboard: false }).addTo(map);
  }
  for (const e of r.events) {
    const mk = L.marker([e.lat, e.lon], { icon: icon(`<span class="lm-ev lm-${KIND_CSS[e.kind]}" data-n="${e.n}">${e.n}</span>`, 'lm-ev-wrap', 36),
      title: `${e.n}. ${eventLabel(e)}`, riseOnHover: true, zIndexOffset: 1000 }).addTo(map);
    mk.on('click', () => onEventTap(String(e.n)));
  }
  map.fitBounds(L.latLngBounds(ll), { padding: [28, 28] });
  setupReplay(root, r, map);
  // «Utforsk kartet»: fullskjerm med flytting (på mobil er dra av ellers, så siden kan rulles)
  const wrap = root.querySelector('#lmap-wrap'), btn = root.querySelector('#btn-map-expand');
  btn.addEventListener('click', () => {
    const on = !wrap.classList.contains('expanded');
    wrap.classList.toggle('expanded', on);
    document.body.classList.toggle('map-open', on);
    btn.textContent = on ? 'Lukk kartet' : 'Utforsk kartet';
    if (on || !mobile) map.dragging.enable(); else map.dragging.disable();
    setTimeout(() => { if (leafletMap === map) map.invalidateSize(); }, 50);
  });
  setTimeout(() => { if (leafletMap === map) map.invalidateSize(); }, 100);
}

/* Avspilling: en prikk kjører ruten med tid og fart, og hendelser blinker når de passeres. */
function setupReplay(root, r, map) {
  const L = window.L;
  const btn = root.querySelector('#btn-replay'), hud = root.querySelector('#replay-hud');
  if (!btn) return;
  let factor = 20, raf = null, marker = null, t = 0, last = 0, playing = false;
  const pts = r.points, tMax = pts[pts.length - 1].t;
  root.querySelectorAll('.seg-mini button').forEach(b => b.onclick = () => { factor = Number(b.dataset.x); root.querySelectorAll('.seg-mini button').forEach(x => x.classList.toggle('on', x === b)); });
  const posAt = tt => {
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].t < tt) lo = m + 1; else hi = m; }
    const b = pts[lo], a = pts[Math.max(0, lo - 1)];
    const f = b.t > a.t ? Math.min(1, Math.max(0, (tt - a.t) / (b.t - a.t))) : 1;
    return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, kmh: a.kmh + (b.kmh - a.kmh) * f };
  };
  const label = btn.querySelector('span');
  const setIcon = name => { const old = btn.querySelector('svg'); if (old) old.outerHTML = icon(name, 18); };
  const stop = () => { playing = false; if (raf) cancelAnimationFrame(raf); raf = null; setIcon('play'); label.textContent = t > 0 && t < tMax ? 'Fortsett' : 'Spill av turen'; };
  const frame = now => {
    if (!playing || leafletMap !== map) return;
    t = Math.min(tMax, t + (now - last) / 1000 * factor); last = now;
    const p = posAt(t);
    marker.setLatLng([p.lat, p.lon]);
    if (!map.getBounds().pad(-0.15).contains([p.lat, p.lon])) map.panTo([p.lat, p.lon], { animate: false });
    root.querySelector('#replay-time').textContent = mss(t);
    root.querySelector('#replay-speed').textContent = kmh(p.kmh);
    const ev = r.events.find(e => Math.abs(e.t - t) < factor * 0.6);
    root.querySelector('#replay-ev').textContent = ev ? `${ev.n}. ${eventLabel(ev)}` : '';
    root.querySelectorAll('.lm-ev').forEach(m => m.classList.toggle('active', ev && m.dataset.n === String(ev.n)));
    if (t >= tMax) { stop(); t = 0; return; }
    raf = requestAnimationFrame(frame);
  };
  btn.onclick = () => {
    if (playing) { stop(); return; }
    if (!marker) marker = L.marker([pts[0].lat, pts[0].lon], { icon: L.divIcon({ html: '<span></span>', className: 'replay-dot', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, zIndexOffset: 2000 }).addTo(map);
    if (t === 0) map.setView([pts[0].lat, pts[0].lon], Math.max(map.getZoom(), 15), { animate: false });
    hud.hidden = false; playing = true; last = performance.now(); label.textContent = 'Pause'; setIcon('pause');
    raf = requestAnimationFrame(frame);
  };
}

/* Kort tekst for opplesning etter turen. */
export function spokenSummary(r, { focusResults = [], marks = [], sp = null } = {}) {
  const parts = [];
  parts.push(`Turen er ferdig. ${r.overall} poeng. ${rating(r.overall)}.`);
  parts.push(`${km(r.stats.km)} på ${duration(r.stats.duration)}.`);
  parts.push(r.events.length ? `${r.events.length === 1 ? 'Én hendelse' : r.events.length + ' hendelser'}.` : 'Ingen brå hendelser.');
  const good = ['brake', 'accel', 'turn', 'smooth'].filter(k => r.scores[k] >= 90).map(k => CATS[k].toLowerCase());
  if (good.length) parts.push(`Dette gikk bra: ${good.join(', ')}.`);
  const tip = r.tips.find(t => t.cat !== 'good');
  if (tip) parts.push(`Det viktigste å jobbe med: ${tip.text}`);
  if (sp && sp.secondsOver > 0) parts.push(`${Math.round(sp.secondsOver)} sekunder over fartsgrensen.`);
  for (const f of focusResults) parts.push(`Mål: ${f.label}, ${f.state === 'ok' ? 'nådd' : f.state === 'no' ? 'øv mer' : 'ikke målt'}.`);
  if (marks.length) parts.push(`Ledsageren merket ${marks.length === 1 ? 'ett sted' : marks.length + ' steder'}. Snakk om dem sammen.`);
  return parts.join(' ').replace(/km\/t/g, 'kilometer i timen').replace(/ km /g, ' kilometer ').replace(/(\d) km\b/g, '$1 kilometer').replace(/ min\b/g, ' minutter');
}

/* Detaljer for én hendelse: fart og kraft ±20 s, før/etter, terskler, gate, fartsgrense og nære merker. */
export function eventDetail(r, e, { marks = [], names = { events: {} }, sp = null } = {}) {
  if (!e) return '';
  const pts = r.points, G = 9.81;
  const idx = []; for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i].t - e.t) <= 20) idx.push(i);
  const series = r.series || {};
  const force = i => {
    if (e.kind === 'turn') return Math.abs((series.lat || [])[i] || 0) / G;
    const a = (series.along || [])[i] || 0;
    return (e.kind === 'brake' ? -a : a) / G;
  };
  const near = t => { let best = null; for (const i of idx) if (!best || Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i; return best; };
  const iBefore = near(e.t - 5), iAfter = near(e.t + 5), iPeak = near(e.t);
  const vB = iBefore !== null ? pts[iBefore].kmh : NaN, vA = iAfter !== null ? pts[iAfter].kmh : NaN, vP = iPeak !== null ? pts[iPeak].kmh : NaN;
  const th = r.thresholds && r.thresholds[e.kind];
  const start = r.points[e.i0] ? r.points[e.i0].t : e.t;
  const dur = Number.isFinite(e.tEnd) ? Math.max(1, Math.round(e.tEnd - (r.t0 || 0) - start + 1)) : 1;
  const limit = sp && iPeak !== null && Number.isFinite(sp.limits[iPeak]) ? sp.limits[iPeak] : null;
  const nearMarks = marks.filter(m => Math.abs(m.t - e.t) <= 20);
  const ms2 = (e.g * G).toFixed(1).replace('.', ',');
  const what = e.kind === 'brake'
    ? `Farten falt fra ${kmh(vB)} til ${kmh(vA)} på ti sekunder. Kraftigste nedbremsing var ${ms2} m/s² (${gee(e.g)}).`
    : e.kind === 'accel'
      ? `Farten økte fra ${kmh(vB)} til ${kmh(vA)} på ti sekunder. Kraftigste akselerasjon var ${ms2} m/s² (${gee(e.g)}).`
      : `Sidekraften var ${ms2} m/s² (${gee(e.g)}) i ${kmh(vP)}. Det kjennes som å bli presset ut mot siden i setet.`;
  const advice = e.kind === 'brake' ? 'Se lenger fram og slipp gassen tidligere, så kan bremsen tas gradvis.'
    : e.kind === 'accel' ? 'Trykk gassen gradvis inn, og la farten bygge seg opp over flere sekunder.'
    : 'Ta ned farten før svingen, og hold jevn fart gjennom den.';
  // minigraf
  const W = 600, H = 190, pl = 40, pr = 62, pt = 14, pb = 28;
  const vMax = Math.max(30, ...idx.map(i => pts[i].kmh)) * 1.1;
  const gMax = Math.max(0.5, th ? th.harsh / G * 1.2 : 0.5, ...idx.map(force));
  const X = t => pl + (t - (e.t - 20)) / 40 * (W - pl - pr);
  const Yv = v => pt + (1 - v / vMax) * (H - pt - pb);
  const Yg = g => pt + (1 - Math.max(0, g) / gMax) * (H - pt - pb);
  const vLine = idx.map((i, k) => `${k ? 'L' : 'M'}${X(pts[i].t).toFixed(1)} ${Yv(pts[i].kmh).toFixed(1)}`).join('');
  const gLine = idx.map((i, k) => `${k ? 'L' : 'M'}${X(pts[i].t).toFixed(1)} ${Yg(force(i)).toFixed(1)}`).join('');
  const thLines = th ? [['brisk', 'brå'], ['harsh', 'kraftig']].map(([k, lbl]) => `<line x1="${pl}" x2="${W - pr}" y1="${Yg(th[k] / G).toFixed(1)}" y2="${Yg(th[k] / G).toFixed(1)}" class="th-line"/><text x="${W - pr + 4}" y="${(Yg(th[k] / G) + 4).toFixed(1)}" class="axis">${lbl}</text>`).join('') : '';
  const ticks = [-20, -10, 0, 10, 20].map(s => `<text x="${X(e.t + s).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="axis">${s > 0 ? '+' : ''}${s} s</text>`).join('');
  const chart = idx.length > 2 ? `<svg class="chart ev-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fart og kraft rundt hendelse ${e.n}">
    <line x1="${X(e.t).toFixed(1)}" x2="${X(e.t).toFixed(1)}" y1="${pt}" y2="${H - pb}" class="ev-now"/>
    ${thLines}
    <path d="${vLine}" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="1 0"/>
    <path d="${gLine}" fill="none" stroke="var(--${KIND_CSS[e.kind]})" stroke-width="3" class="g-line"/>
    <text x="${pl - 6}" y="${pt + 4}" text-anchor="end" class="axis">${n0(vMax)}</text><text x="${pl - 6}" y="${H - pb}" text-anchor="end" class="axis">0</text>
    <text x="${W - pr + 4}" y="${pt + 4}" class="axis">${gMax.toFixed(1).replace('.', ',')} g</text>
    ${ticks}
  </svg>
  <p class="ev-legend muted small"><span class="dot line" style="background:var(--muted)"></span>Fart (km/t) <span class="dot line" style="background:var(--${KIND_CSS[e.kind]})"></span>${e.kind === 'turn' ? 'Sidekraft' : e.kind === 'brake' ? 'Nedbremsing' : 'Akselerasjon'} (g)</p>` : '';
  return `${chart}
    <p>${what}</p>
    <dl class="stats ev-stats">
      <div><dt>Varighet over grensen</dt><dd>${dur} s</dd></div>
      <div><dt>Styrke</dt><dd>${gee(e.g)} · ${gWord(e.g)}</dd></div>
      ${th ? `<div><dt>Grense brå / kraftig</dt><dd>${(th.brisk / G).toFixed(2).replace('.', ',')} / ${(th.harsh / G).toFixed(2).replace('.', ',')} g</dd></div>` : ''}
      ${limit ? `<div><dt>Fartsgrense her</dt><dd>${limit} km/t</dd></div>` : ''}
      ${names.events && names.events[e.n] ? `<div><dt>Sted</dt><dd>${esc(names.events[e.n])}</dd></div>` : ''}
    </dl>
    ${nearMarks.length ? `<p class="ev-marks">${nearMarks.map(m => `Ledsager merket <strong>${m.letter}</strong> ${Math.abs(Math.round(m.t - e.t))} s ${m.t >= e.t ? 'etter' : 'før'}${m.note ? `: «${esc(m.note)}»` : '.'}`).join(' ')}</p>` : ''}
    <p class="ev-advice"><strong>Tips:</strong> ${advice}</p>
    <button type="button" class="btn secondary btn-show-map">Vis i kartet</button>`;
}

function delta(now, before, words = false) {
  const d = Math.round(now - before);
  if (d === 0) return words ? 'Likt som sist.' : '<span class="delta same">=</span>';
  const up = d > 0;
  if (words) return up ? `${d} poeng bedre.` : `${-d} poeng svakere.`;
  return `<span class="delta ${up ? 'up' : 'down'}" aria-label="${up ? 'opp' : 'ned'} ${Math.abs(d)}">${up ? '▲' : '▼'} ${Math.abs(d)}</span>`;
}

function countUp(el, target) {
  if (!el || prefersReduced()) return;
  const t0 = performance.now(), dur = 900;
  const tick = now => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  el.textContent = '0';
  requestAnimationFrame(tick);
}

function prefersReduced() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* Fartsgrense-skilt med poengsummen */
export function speedSign(score, size = 148) {
  return `<svg class="sign" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Poengsum ${score}">
    <circle cx="50" cy="50" r="48" fill="#fff"/>
    <circle cx="50" cy="50" r="42" fill="none" stroke="#c8102e" stroke-width="12"/>
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-weight="800" font-size="${score >= 100 ? 34 : 42}" fill="#111">${score}</text>
  </svg>`;
}

function routeMap(r, marks = []) {
  r = { ...r, marks };
  const pts = r.points;
  if (pts.length < 2) return '<p class="muted">Ingen rute å vise.</p>';
  const meanLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const cos = Math.cos(meanLat * Math.PI / 180);
  const xs = pts.map(p => p.lon * cos), ys = pts.map(p => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 600, pad = 40;
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const scale = (W - 2 * pad) / spanX;
  let H = Math.round(spanY * scale + 2 * pad);
  let s = scale;
  if (H > 600) { s = (600 - 2 * pad) / spanY; H = 600; }
  if (H < 240) H = 240;
  const offX = (W - spanX * s) / 2, offY = (H - spanY * s) / 2;
  const X = x => offX + (x - minX) * s, Y = y => offY + (y - minY) * s;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(ys[i]).toFixed(1)}`).join('');
  const sx = X(xs[0]), sy = Y(ys[0]), ex = X(xs[xs.length - 1]), ey = Y(ys[ys.length - 1]);
  const markPins = (r.marks || []).filter(m => Number.isFinite(m.lat)).map(m => {
    const mx = X(m.lon * cos), my = Y(-m.lat);
    return `<g class="markpin" transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})" aria-label="Merke ${m.letter}">
      <rect x="-13" y="-13" width="26" height="26" rx="4" transform="rotate(45)" fill="var(--ink)" stroke="var(--surface)" stroke-width="2.5"/>
      <text text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="800" fill="var(--surface)">${m.letter}</text>
    </g>`;
  }).join('');
  const markers = r.events.map(e => {
    const mx = X(e.lon * cos), my = Y(-e.lat);
    return `<g class="marker" data-n="${e.n}" transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})" role="button" tabindex="0" aria-label="Hendelse ${e.n}">
      <circle r="22" class="halo"/>
      <circle r="17" fill="${KIND_COLOR[e.kind]}" stroke="#fff" stroke-width="3"/>
      <text text-anchor="middle" dominant-baseline="central" font-size="17" font-weight="800" fill="#fff">${e.n}</text>
    </g>`;
  }).join('');
  // Målestokk: 1 enhet i x = 1 grad ≈ 111 320 m
  const mPerUnit = 111320 / s;
  const nice = [50, 100, 200, 500, 1000, 2000, 5000].find(v => v / mPerUnit >= 70) || 5000;
  const barLen = nice / mPerUnit;
  const scaleBar = `<g class="scalebar" transform="translate(16 ${H - 18})">
    <line x1="0" x2="${barLen.toFixed(1)}" y1="0" y2="0" stroke="var(--ink)" stroke-width="3"/>
    <line x1="0" x2="0" y1="-6" y2="0" stroke="var(--ink)" stroke-width="3"/>
    <line x1="${barLen.toFixed(1)}" x2="${barLen.toFixed(1)}" y1="-6" y2="0" stroke="var(--ink)" stroke-width="3"/>
    <text x="${(barLen / 2).toFixed(1)}" y="-9" text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)">${nice >= 1000 ? nice / 1000 + ' km' : nice + ' m'}</text>
  </g>`;
  const north = `<g class="north" transform="translate(${W - 30} 34)">
    <path d="M0 -18 L8 10 L0 4 L-8 10 Z" fill="var(--ink)"/>
    <text y="26" text-anchor="middle" font-size="14" font-weight="800" fill="var(--ink)">N</text>
  </g>`;
  return `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kart over ruten med ${r.events.length} hendelser">
    <path d="${d}" fill="none" stroke="var(--road-edge)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--asphalt)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--lane)" stroke-width="1.8" stroke-dasharray="9 7" stroke-linecap="butt" stroke-linejoin="round"/>
    <g class="endpoint">
      <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="12" fill="var(--good)" stroke="#fff" stroke-width="3"/>
      ${label(sx, sy, 'Start', W)}
      <rect x="${(ex - 11).toFixed(1)}" y="${(ey - 11).toFixed(1)}" width="22" height="22" fill="var(--road-edge)" stroke="#fff" stroke-width="3"/>
      ${label(ex, ey, 'Slutt', W)}
    </g>
    ${markPins}
    ${markers}
    ${north}
    ${scaleBar}
  </svg>`;
}

function label(x, y, text, W) {
  const left = x > W - 80;
  return `<text x="${(left ? x - 20 : x + 20).toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="${left ? 'end' : 'start'}" class="map-label" font-size="18" font-weight="700" stroke="var(--surface)" stroke-width="4" paint-order="stroke" fill="var(--ink)">${text}</text>`;
}

function scoreBar(k, v, prevV) {
  const cls = v >= 90 ? 'good' : v >= 75 ? 'mid' : 'bad';
  return `<div class="bar-row">
    <span class="bar-label">${k === 'limits' ? 'Fartsgrense' : CATS[k]}</span>
    <span class="bar"><span class="bar-fill ${cls}" style="width:${v}%"></span></span>
    <span class="bar-val">${v}${prevV !== null && prevV !== undefined ? delta(v, prevV) : ''}</span>
  </div>`;
}

function speedChart(r, gaps, marks = [], sp = null) {
  const pts = r.points;
  if (pts.length < 2) return '';
  const W = 600, H = 260, pl = 46, pr = 14, pt = 16, pb = 36;
  const tMax = pts[pts.length - 1].t || 1;
  const vMax = Math.max(...pts.map(p => p.kmh), 10, ...(sp ? sp.limits.filter(Number.isFinite) : [0]));
  const yMax = Math.max(Math.ceil((vMax + 8) / 10) * 10, 40);
  const X = t => pl + (t / tMax) * (W - pl - pr);
  const Y = v => pt + (1 - v / yMax) * (H - pt - pb);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.kmh).toFixed(1)}`).join('');
  const area = `${line}L${X(tMax).toFixed(1)} ${Y(0).toFixed(1)}L${X(0).toFixed(1)} ${Y(0).toFixed(1)}Z`;
  const grid = LIMITS.filter(l => l <= yMax).map(l =>
    `<line x1="${pl}" x2="${W - pr}" y1="${Y(l).toFixed(1)}" y2="${Y(l).toFixed(1)}" class="grid"/>
     <text x="${pl - 6}" y="${(Y(l) + 4).toFixed(1)}" text-anchor="end" class="axis">${l}</text>`).join('');
  const nTicks = Math.min(6, Math.max(2, Math.floor(tMax / 60)));
  const ticks = [];
  for (let i = 0; i <= nTicks; i++) {
    const t = (tMax * i) / nTicks;
    ticks.push(`<text x="${X(t).toFixed(1)}" y="${H - 10}" text-anchor="${i === 0 ? 'start' : i === nTicks ? 'end' : 'middle'}" class="axis">${mss(t)}</text>`);
  }
  const gapRects = gaps.map(g => {
    const a = Math.max(0, g.from - (r.t0 || 0)), b = Math.min(tMax, g.to - (r.t0 || 0));
    if (b <= a) return '';
    return `<rect x="${X(a).toFixed(1)}" y="${pt}" width="${Math.max(2, X(b) - X(a)).toFixed(1)}" height="${H - pt - pb}" fill="var(--muted)" opacity="0.25"/>`;
  }).join('');
  const dots = r.events.map(e => {
    const p = nearest(pts, e.t);
    return `<circle cx="${X(e.t).toFixed(1)}" cy="${Y(p.kmh).toFixed(1)}" r="7" fill="${KIND_COLOR[e.kind]}" stroke="#fff" stroke-width="2"/>
      <text x="${X(e.t).toFixed(1)}" y="${(Y(p.kmh) - 11).toFixed(1)}" text-anchor="middle" class="axis" font-weight="700">${e.n}</text>`;
  }).join('');
  let limitPath = '', overRects = '';
  if (sp) {
    const parts = [];
    for (let i = 0; i < pts.length; i++) {
      const L = sp.limits[i];
      if (!Number.isFinite(L)) { continue; }
      const x0 = i > 0 ? X((pts[i - 1].t + pts[i].t) / 2) : X(pts[i].t);
      const x1 = i < pts.length - 1 ? X((pts[i].t + pts[i + 1].t) / 2) : X(pts[i].t);
      parts.push(`M${x0.toFixed(1)} ${Y(L).toFixed(1)}L${x1.toFixed(1)} ${Y(L).toFixed(1)}`);
      if (pts[i].kmh - L >= 4) overRects += `<rect x="${x0.toFixed(1)}" y="${Y(pts[i].kmh).toFixed(1)}" width="${Math.max(1, x1 - x0).toFixed(1)}" height="${Math.max(0, Y(L) - Y(pts[i].kmh)).toFixed(1)}" class="over-area"/>`;
    }
    limitPath = `<path d="${parts.join('')}" class="limit-line"/>`;
  }
  const markLines = marks.map(m => `<line x1="${X(m.t).toFixed(1)}" x2="${X(m.t).toFixed(1)}" y1="${pt}" y2="${(H - pb).toFixed(1)}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 4"/>
    <text x="${X(m.t).toFixed(1)}" y="${pt + 12}" text-anchor="middle" class="axis" font-weight="800">${m.letter}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fart over tid">
    ${grid}
    ${gapRects}
    ${markLines}
    <path d="${area}" fill="var(--accel)" opacity="0.12"/>
    ${overRects}
    <path d="${line}" fill="none" stroke="var(--accel)" stroke-width="2.5" stroke-linejoin="round"/>
    ${limitPath}
    <line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" class="axis-line"/>
    ${ticks.join('')}
    <text x="${W - pr}" y="${pt + 4}" text-anchor="end" class="axis">km/t</text>
    ${dots}
  </svg>`;
}

function nearest(pts, t) {
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].t < t) lo = m + 1; else hi = m; }
  return pts[lo];
}

/* Trend per kategori (fire linjer). results: eldste først. */
export function categoryTrendChart(results) {
  if (results.length < 2) return '';
  const W = 600, H = 230, pl = 40, pr = 16, pt = 16, pb = 30;
  const X = i => pl + (i / (results.length - 1)) * (W - pl - pr);
  const Y = v => pt + (1 - v / 100) * (H - pt - pb);
  const cats = [['brake', 'var(--brake)'], ['accel', 'var(--accel)'], ['turn', 'var(--turn)'], ['smooth', 'var(--good)']];
  const lines = cats.map(([k, c]) => `<path d="${results.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(r.scores[k]).toFixed(1)}`).join('')}" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>`).join('');
  return `<svg class="chart trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Poeng per kategori over ${results.length} turer">
    ${[50, 75, 90].map(l => `<line x1="${pl}" x2="${W - pr}" y1="${Y(l).toFixed(1)}" y2="${Y(l).toFixed(1)}" class="grid"/><text x="${pl - 6}" y="${(Y(l) + 4).toFixed(1)}" text-anchor="end" class="axis big">${l}</text>`).join('')}
    ${lines}
    <text x="${pl}" y="${H - 6}" class="axis big">Eldste</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end" class="axis big">Nyeste</text>
  </svg>
  <ul class="legend">${cats.map(([k, c]) => `<li><span class="dot line" style="background:${c}"></span>${CATS[k]}</li>`).join('')}</ul>`;
}

/* Liten trendgraf på hjemskjermen */
export function trendChart(scores, goal = null) {
  if (scores.length < 2) return '';
  const W = 600, H = 230, pl = 40, pr = 16, pt = 16, pb = 30;
  const X = i => pl + (i / (scores.length - 1)) * (W - pl - pr);
  const Y = v => pt + (1 - v / 100) * (H - pt - pb);
  const line = scores.map((s, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(s).toFixed(1)}`).join('');
  const dots = scores.map((s, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(s).toFixed(1)}" r="7" fill="${s >= 90 ? 'var(--good)' : s >= 75 ? 'var(--turn)' : 'var(--brake)'}" stroke="var(--surface)" stroke-width="2"/>`).join('');
  return `<svg class="chart trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Poengtrend over ${scores.length} turer">
    ${[50, 75, 90].map(l => `<line x1="${pl}" x2="${W - pr}" y1="${Y(l).toFixed(1)}" y2="${Y(l).toFixed(1)}" class="grid"/><text x="${pl - 6}" y="${(Y(l) + 4).toFixed(1)}" text-anchor="end" class="axis big">${l}</text>`).join('')}
    ${Number.isFinite(goal) ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" class="goal-line"/><text x="${W - pr}" y="${(Y(goal) - 6).toFixed(1)}" text-anchor="end" class="axis big goal-text">Mål ${goal}</text>` : ''}
    <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>
    ${dots}
    <text x="${pl}" y="${H - 6}" class="axis big">Eldste</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end" class="axis big">Nyeste</text>
  </svg>`;
}
