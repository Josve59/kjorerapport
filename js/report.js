/* Rapportvisning – ren SVG/HTML, ingen nettverk. */
import { CATS, rating } from './analysis.js';
import { esc, km, kmh, gee, mss, duration, n0 } from './format.js';

const KIND_COLOR = { brake: 'var(--brake)', accel: 'var(--accel)', turn: 'var(--turn)' };
const LABEL = {
  brake: { brisk: 'Brå nedbremsing', harsh: 'Kraftig nedbremsing' },
  accel: { brisk: 'Rask akselerasjon', harsh: 'Kraftig akselerasjon' },
  turn:  { brisk: 'Skarp sving', harsh: 'Svært skarp sving' }
};
const LIMITS = [30, 50, 60, 70, 80, 90, 110];

export function eventLabel(e) { return LABEL[e.kind][e.level]; }

export function renderReport(root, r, ctx = {}) {
  const { prevScore = null, title = 'Rapport', subtitle = '', gaps = [], interrupted = false } = ctx;
  root.innerHTML = `
    <header class="report-head">
      <h1>${esc(title)}</h1>
      ${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}
    </header>
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
        </dl>
        ${prevScore !== null ? `<p class="compare">Forrige tur: ${n0(prevScore)} poeng. Denne turen: ${n0(r.overall)}.</p>` : ''}
      </div>
    </section>

    <section class="card" id="map-section">
      <h2>Ruten</h2>
      ${routeMap(r)}
      <ul class="legend">
        <li><span class="dot" style="background:var(--good)"></span>Start</li>
        <li><span class="dot square" style="background:var(--road-edge)"></span>Slutt</li>
        <li><span class="dot" style="background:var(--brake)"></span>Bremsing</li>
        <li><span class="dot" style="background:var(--accel)"></span>Akselerasjon</li>
        <li><span class="dot" style="background:var(--turn)"></span>Sving</li>
      </ul>
    </section>

    <section class="card">
      <h2>Slik gikk det</h2>
      <div class="bars">${['brake', 'accel', 'turn', 'smooth'].map(k => scoreBar(k, r.scores[k])).join('')}</div>
    </section>

    <section class="card">
      <h2>Dette kan du jobbe med</h2>
      <div class="tips">${r.tips.map(t => `<div class="tip tip-${t.cat}"><p>${esc(t.text)}</p></div>`).join('')}</div>
    </section>

    <section class="card">
      <h2>Fart underveis</h2>
      ${speedChart(r, gaps)}
    </section>

    <section class="card">
      <h2>Hendelser</h2>
      ${r.events.length ? `<ol class="events">${r.events.map(e => `
        <li><button type="button" class="event" data-n="${e.n}" style="--c:${KIND_COLOR[e.kind]}">
          <span class="num">${e.n}</span>
          <span class="ev-text"><strong>${esc(eventLabel(e))}</strong><span class="muted">${mss(e.t)} inn i turen, ${kmh(e.speedKmh)}</span></span>
          <span class="ev-g">${gee(e.g)}</span>
        </button></li>`).join('')}</ol>` : '<p class="muted">Ingen brå hendelser registrert på denne turen.</p>'}
    </section>

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
          <p>Hendelser som ligger mindre enn to sekunder fra hverandre slås sammen til én. Poengsummen trekker mest for kraftige hendelser, og samlet poengsum vekter bremsing 30 %, svinger 25 %, jevn fart 25 % og akselerasjon 20 %.</p>
          <p>Følsomhet: ${esc(ctx.sensitivityLabel || 'Normal')}.</p>
        </div>
      </details>
    </section>

    <footer class="report-foot">Testversjon. Målingene er veiledende og erstatter ikke ledsager eller trafikklærer.</footer>
  `;

  // Trykk på hendelse → marker på kartet og rull dit
  root.querySelectorAll('.event').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = btn.dataset.n;
      root.querySelectorAll('.marker').forEach(m => m.classList.toggle('active', m.dataset.n === n));
      root.querySelectorAll('.event').forEach(b => b.classList.toggle('active', b === btn));
      root.querySelector('#map-section').scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
    });
  });
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

function routeMap(r) {
  const pts = r.points;
  if (pts.length < 2) return '<p class="muted">Ingen rute å vise.</p>';
  const meanLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const cos = Math.cos(meanLat * Math.PI / 180);
  const xs = pts.map(p => p.lon * cos), ys = pts.map(p => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 600, pad = 36;
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const scale = (W - 2 * pad) / spanX;
  let H = Math.round(spanY * scale + 2 * pad);
  let s = scale;
  if (H > 600) { s = (600 - 2 * pad) / spanY; H = 600; }
  if (H < 220) H = 220;
  const offX = (W - spanX * s) / 2, offY = (H - spanY * s) / 2;
  const X = x => offX + (x - minX) * s, Y = y => offY + (y - minY) * s;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(ys[i]).toFixed(1)}`).join('');
  const start = pts[0], end = pts[pts.length - 1];
  const sx = X(xs[0]), sy = Y(ys[0]), ex = X(xs[xs.length - 1]), ey = Y(ys[ys.length - 1]);
  const markers = r.events.map(e => {
    const mx = X(e.lon * cos), my = Y(-e.lat);
    return `<g class="marker" data-n="${e.n}" transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})">
      <circle r="22" class="halo"/>
      <circle r="17" fill="${KIND_COLOR[e.kind]}" stroke="#fff" stroke-width="3"/>
      <text text-anchor="middle" dominant-baseline="central" font-size="17" font-weight="800" fill="#fff">${e.n}</text>
    </g>`;
  }).join('');
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
    ${markers}
  </svg>`;
}

function label(x, y, text, W) {
  const left = x > W - 80;
  return `<text x="${(left ? x - 20 : x + 20).toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="${left ? 'end' : 'start'}" class="map-label" font-size="18" font-weight="700" stroke="var(--surface)" stroke-width="4" paint-order="stroke" fill="var(--ink)">${text}</text>`;
}

function scoreBar(k, v) {
  const cls = v >= 90 ? 'good' : v >= 75 ? 'mid' : 'bad';
  return `<div class="bar-row">
    <span class="bar-label">${CATS[k]}</span>
    <span class="bar"><span class="bar-fill ${cls}" style="width:${v}%"></span></span>
    <span class="bar-val">${v}</span>
  </div>`;
}

function speedChart(r, gaps) {
  const pts = r.points;
  if (pts.length < 2) return '';
  const W = 600, H = 260, pl = 46, pr = 14, pt = 16, pb = 36;
  const tMax = pts[pts.length - 1].t || 1;
  const vMax = Math.max(...pts.map(p => p.kmh), 10);
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
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fart over tid">
    ${grid}
    ${gapRects}
    <path d="${area}" fill="var(--accel)" opacity="0.12"/>
    <path d="${line}" fill="none" stroke="var(--accel)" stroke-width="2.5" stroke-linejoin="round"/>
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
  const W = 600, H = 170, pl = 40, pr = 16, pt = 14, pb = 28;
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
