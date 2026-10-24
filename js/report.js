/* Rapportvisning – ren SVG/HTML, ingen nettverk. */
import { CATS, rating } from './analysis.js';
import { esc, km, kmh, gee, mss, duration, n0, n1 } from './format.js';
import { analyzeSpeeding } from './enrich.js';

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

/* Ledsagerens merker med fart og tid relativt til rapporten. */
function markRows(marks, r) {
  return (marks || []).map((m, i) => {
    const t = m.t - (r.t0 || 0);
    const p = r.points.length ? nearest(r.points, t) : null;
    return { i, letter: MARK_LETTER(i), t, kmh: p ? p.kmh : NaN, lat: p ? p.lat : NaN, lon: p ? p.lon : NaN, note: m.note || '' };
  });
}

export function eventsPer10km(r) {
  return r.stats.km > 0.2 ? r.events.length / r.stats.km * 10 : 0;
}

/* Tekstoppsummering til deling (meldinger, e-post, AirDrop). */
export function buildSummary(r, ctx = {}) {
  const lines = [];
  lines.push(`Kjørerapport${ctx.subtitle ? ' – ' + ctx.subtitle : ''}`);
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
    for (const m of marks) lines.push(`${m.letter}. ${mss(m.t)}${Number.isFinite(m.kmh) ? ', ' + kmh(m.kmh) : ''}${names.marks[m.i] ? ', ' + names.marks[m.i] : ''}${m.note ? ' – ' + m.note : ''}`);
  }
  if (ctx.note) lines.push(`Notat: ${ctx.note}`);
  lines.push('Testversjon. Målingene er veiledende og erstatter ikke ledsager eller trafikklærer.');
  return lines.join('\n');
}

export function renderReport(root, r, ctx = {}) {
  const { prevScore = null, prev = null, title = 'Rapport', subtitle = '', gaps = [], interrupted = false,
    note = null, onNoteChange = null, onDelete = null, onShare = null, marks: rawMarks = [], onMarkNote = null,
    enrich = null, enrichStatus = null, canFetch = false, onFetch = null } = ctx;
  const positives = ['brake', 'accel', 'turn', 'smooth'].filter(k => r.scores[k] >= 90);
  const marks = markRows(rawMarks, r);
  const short = r.stats.km < 1;
  const names = enrich && enrich.names ? enrich.names : { events: {}, marks: {} };
  const sp = speedingFor(r, enrich);
  root.innerHTML = `
    <header class="report-head">
      <div class="report-title">
        <h1>${esc(title)}</h1>
        ${onShare ? '<button type="button" class="btn small-btn secondary" id="btn-share">Del rapport</button>' : ''}
      </div>
      ${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}
      ${enrichStatus ? `<p class="enrich-status ${enrichStatus.error ? 'error' : ''}" id="enrich-status" aria-live="polite">${esc(enrichStatus.text)}${enrichStatus.error && onFetch ? ' <button type="button" class="link" id="btn-fetch">Prøv igjen</button>' : ''}</p>`
        : (enrich && enrich.error && canFetch && onFetch ? `<p class="enrich-status error">Forrige henting feilet: ${esc(enrich.error)} <button type="button" class="link" id="btn-fetch">Prøv igjen</button></p>` : '')}
    </header>
    <nav class="quicknav" aria-label="Hopp til">
      <a href="#map-section">Rute</a><a href="#score-section">Poeng</a>${sp ? '<a href="#limits-section">Fartsgrense</a>' : ''}<a href="#speed-section">Fart</a><a href="#events-section">Hendelser</a>${marks.length ? '<a href="#marks-section">Merker</a>' : ''}
    </nav>
    ${short ? `<p class="notice">Kort tur (${km(r.stats.km)}). Grunnlaget er tynt, så poengene bør ikke vektlegges. Kjør minst noen kilometer for en rapport som betyr noe.</p>` : ''}
    ${interrupted ? `<p class="notice">Opptaket ble avbrutt før «Stopp» ble trykket. Rapporten gjelder den delen som ble lagret.</p>` : ''}
    ${gaps.length ? `<p class="notice">Appen var skjult ${gaps.length === 1 ? 'én gang' : gaps.length + ' ganger'} underveis (til sammen ${n0(gaps.reduce((s, g) => s + (g.to - g.from), 0))} s). Disse hullene er markert grått i fartsgrafen.</p>` : ''}
    <section class="hero card">
      ${speedSign(r.overall)}
      <div class="hero-text">
        <p class="rating">${esc(rating(r.overall))}</p>
        <dl class="stats">
          <div><dt>Distanse</dt><dd>${km(r.stats.km)}</dd></div>
          <div><dt>Tid</dt><dd>${duration(r.stats.duration)}</dd></div>
          <div><dt>Snittfart</dt><dd>${kmh(r.stats.avgKmh)}</dd></div>
          <div><dt>Toppfart</dt><dd>${kmh(r.stats.maxKmh)}</dd></div>
          <div><dt>Stopp</dt><dd>${r.stats.stops}</dd></div>
          <div><dt>Hendelser per 10 km</dt><dd>${n1(eventsPer10km(r))}</dd></div>
        </dl>
        ${prevScore !== null ? `<p class="compare">Forrige tur: ${n0(prevScore)} poeng. Denne turen: ${n0(r.overall)}. ${delta(r.overall, prevScore, true)}</p>` : ''}
      </div>
    </section>

    ${onNoteChange ? `<section class="card note-card">
      <label for="drive-note"><h2>Notat</h2></label>
      <textarea id="drive-note" rows="2" placeholder="Hva øvde dere på? F.eks. «rundkjøringer og feltskifte»">${esc(note || '')}</textarea>
      <p class="muted small" id="note-status">Lagres automatisk.</p>
    </section>` : ''}

    <section class="card" id="map-section">
      <h2>Ruten</h2>
      ${routeMap(r, marks)}
      <ul class="legend">
        <li><span class="dot" style="background:var(--good)"></span>Start</li>
        <li><span class="dot square" style="background:var(--road-edge)"></span>Slutt</li>
        <li><span class="dot" style="background:var(--brake)"></span>Bremsing</li>
        <li><span class="dot" style="background:var(--accel)"></span>Akselerasjon</li>
        <li><span class="dot" style="background:var(--turn)"></span>Sving</li>
        ${marks.length ? '<li><span class="dot diamond" style="background:var(--ink)"></span>Merke</li>' : ''}
      </ul>
      <p class="muted small">Trykk på et nummer i kartet eller i listen over hendelser for å koble dem sammen.</p>
    </section>

    <section class="card" id="score-section">
      <h2>Slik gikk det</h2>
      ${prev ? '<p class="muted small">Pilene viser endring fra forrige tur.</p>' : ''}
      ${r.perKm ? `<p class="muted small">Poengene er justert for distanse: trekk regnes per 10 km${r.kmFactor > 1.01 ? ', og turer under 5 km regnes som 5 km' : ''}.</p>` : ''}
      <div class="bars">${['brake', 'accel', 'turn', 'smooth'].map(k => scoreBar(k, r.scores[k], prev ? prev.scores[k] : null)).join('')}</div>
    </section>

    ${sp ? `<section class="card" id="limits-section">
      <h2>Fartsgrenser</h2>
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

    ${positives.length ? `<section class="card">
      <h2>Dette gikk bra</h2>
      <ul class="positives">${positives.map(k => `<li><strong>${CATS[k]}:</strong> ${POSITIVE[k]}</li>`).join('')}</ul>
    </section>` : ''}

    <section class="card">
      <h2>Dette kan du jobbe med</h2>
      <div class="tips">${r.tips.map(t => `<div class="tip tip-${t.cat}"><p>${esc(t.text)}</p></div>`).join('')}</div>
    </section>

    <section class="card" id="speed-section">
      <h2>Fart underveis</h2>
      ${speedChart(r, gaps, marks, sp)}
      ${sp ? '<p class="muted small">Rød stiplet linje er fartsgrensen. Rødt felt er tid over grensen.</p>' : ''}
    </section>

    <section class="card" id="events-section">
      <h2>Hendelser</h2>
      ${r.events.length ? `<ol class="events">${r.events.map(e => `
        <li><button type="button" class="event" data-n="${e.n}" style="--c:${KIND_COLOR[e.kind]}">
          <span class="num">${e.n}</span>
          <span class="ev-text"><strong>${esc(eventLabel(e))}</strong><span class="muted">${mss(e.t)} inn i turen, ${kmh(e.speedKmh)}</span>${names.events[e.n] ? `<span class="ev-place">${esc(names.events[e.n])}</span>` : ''}</span>
          <span class="ev-g">${gee(e.g)}<span class="g-word muted">${gWord(e.g)}</span></span>
        </button></li>`).join('')}</ol>` : '<p class="muted">Ingen brå hendelser registrert på denne turen.</p>'}
    </section>

    ${marks.length ? `<section class="card" id="marks-section">
      <h2>Ledsagerens merker</h2>
      <p class="muted small">Tidspunkt ledsageren merket underveis. Skriv hva som skjedde, så blir det med i rapporten.</p>
      <ol class="marks">${marks.map(m => `
        <li class="mark-row" data-i="${m.i}">
          <span class="num mark-num">${m.letter}</span>
          <span class="ev-text"><strong>${mss(m.t)} inn i turen${Number.isFinite(m.kmh) ? ', ' + kmh(m.kmh) : ''}</strong>${names.marks[m.i] ? `<span class="ev-place">${esc(names.marks[m.i])}</span>` : ''}
            ${onMarkNote ? `<textarea class="mark-note" rows="1" placeholder="Hva skjedde? F.eks. «glemte speil før feltskifte»" aria-label="Kommentar til merke ${m.letter}">${esc(m.note)}</textarea>`
              : (m.note ? `<span>${esc(m.note)}</span>` : '<span class="muted">Ingen kommentar</span>')}
          </span>
        </li>`).join('')}</ol>
    </section>` : ''}

    <section class="card">
      <details>
        <summary>Slik måles det</summary>
        <div class="method">
          <p>Appen bruker telefonens GPS og bevegelsessensorer. Alt beregnes på telefonen, og ingenting sendes noe sted.</p>
          <p><strong>Bremsing og akselerasjon</strong> beregnes fra hvordan GPS-farten endrer seg fra sekund til sekund. Over ${(2.5 * (ctx.factor || 1)).toFixed(1).replace('.', ',')} m/s² regnes det som brått, og over ${(3.5 * (ctx.factor || 1)).toFixed(1).replace('.', ',')} m/s² som kraftig.</p>
          <p><strong>Svinger</strong> måles som sidekraft: fart ganger hvor raskt bilen roterer. ${r.source === 'gyro'
            ? 'Rotasjonen kom fra gyroskopet, projisert på tyngdekraften, så det spiller ingen rolle hvordan telefonen står i holderen.'
            : 'Gyroskopdata manglet på denne turen, så rotasjonen ble beregnet fra GPS-retningen i stedet. Det er grovere og kan gå glipp av korte svinger.'}</p>
          <p><strong>Jevn fart</strong> ser på hvor mye farten varierer mens bilen er i bevegelse.</p>
          <p><strong>Hendelser per 10 km</strong> gjør det lettere å sammenligne korte og lange turer.</p>
          <p><strong>Motor:</strong> ${r.alongSource === 'acc'
            ? `v3 – bremsing og gass ble målt med akselerometeret (100 ganger i sekundet) og kalibrert mot GPS (samsvar ${Math.round((r.accFit ? r.accFit.r2 : 0) * 100)} %). Det fanger korte, harde bremser som GPS glatter bort.`
            : (r.engine === 'v3' ? 'v3 var valgt, men akselerometerdata manglet eller passet dårlig med GPS (løs holder?), så GPS-fart ble brukt.' : 'v1 – bremsing og gass fra GPS-fart.')}</p>
          <p>Hendelser som ligger mindre enn to sekunder fra hverandre slås sammen til én. Poengsummen trekker mest for kraftige hendelser, og samlet poengsum vekter bremsing 30 %, svinger 25 %, jevn fart 25 % og akselerasjon 20 %.</p>
          ${sp ? `<p><strong>Fartsgrenser</strong> hentes fra Statens vegvesen etter turen. Hvert GPS-punkt kobles til nærmeste fartsgrensestrekning innen 25 m, så i kryss og ved avkjøringer kan grensen bomme et sekund eller to. Poeng: 100 minus 1,5 per sekund over grensen, minus 10 per episode med 10 km/t eller mer over.</p>` : ''}
          <p>Følsomhet: ${esc(ctx.sensitivityLabel || 'Normal')}.</p>
        </div>
      </details>
    </section>

    ${onDelete ? '<button type="button" class="btn danger" id="btn-delete-drive">Slett denne turen</button>' : ''}
    <footer class="report-foot">Testversjon. Målingene er veiledende og erstatter ikke ledsager eller trafikklærer.</footer>
  `;

  const smooth = prefersReduced() ? 'auto' : 'smooth';
  const select = n => {
    root.querySelectorAll('.marker').forEach(m => m.classList.toggle('active', m.dataset.n === n));
    root.querySelectorAll('.event').forEach(b => b.classList.toggle('active', b.dataset.n === n));
  };
  // Hendelse i listen → marker på kartet
  root.querySelectorAll('.event').forEach(btn => btn.addEventListener('click', () => {
    select(btn.dataset.n);
    root.querySelector('#map-section').scrollIntoView({ behavior: smooth, block: 'start' });
  }));
  // Marker på kartet → hendelse i listen
  root.querySelectorAll('.marker').forEach(m => m.addEventListener('click', () => {
    select(m.dataset.n);
    const row = root.querySelector(`.event[data-n="${m.dataset.n}"]`);
    if (row) row.scrollIntoView({ behavior: smooth, block: 'center' });
  }));

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
    if (el) el.scrollIntoView({ behavior: smooth, block: 'start' });
  }));
  countUp(root.querySelector('.sign text'), r.overall);
  if (onDelete) root.querySelector('#btn-delete-drive').addEventListener('click', onDelete);
  const fetchBtn = root.querySelector('#btn-fetch');
  if (fetchBtn && onFetch) fetchBtn.addEventListener('click', onFetch);
  if (onShare) root.querySelector('#btn-share').addEventListener('click', () => onShare(buildSummary(r, { subtitle, note, marks: rawMarks, enrich })));
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

/* Liten trendgraf på hjemskjermen */
export function trendChart(scores) {
  if (scores.length < 2) return '';
  const W = 600, H = 230, pl = 40, pr = 16, pt = 16, pb = 30;
  const X = i => pl + (i / (scores.length - 1)) * (W - pl - pr);
  const Y = v => pt + (1 - v / 100) * (H - pt - pb);
  const line = scores.map((s, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(s).toFixed(1)}`).join('');
  const dots = scores.map((s, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(s).toFixed(1)}" r="7" fill="${s >= 90 ? 'var(--good)' : s >= 75 ? 'var(--turn)' : 'var(--brake)'}" stroke="var(--surface)" stroke-width="2"/>`).join('');
  return `<svg class="chart trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Poengtrend over ${scores.length} turer">
    ${[50, 75, 90].map(l => `<line x1="${pl}" x2="${W - pr}" y1="${Y(l).toFixed(1)}" y2="${Y(l).toFixed(1)}" class="grid"/><text x="${pl - 6}" y="${(Y(l) + 4).toFixed(1)}" text-anchor="end" class="axis big">${l}</text>`).join('')}
    <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>
    ${dots}
    <text x="${pl}" y="${H - 6}" class="axis big">Eldste</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end" class="axis big">Nyeste</text>
  </svg>`;
}
