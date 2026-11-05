/* Kjøreutvikling i full skjerm (0.12.0). Trykk på grafen på Hjem, så åpnes den her:
   - tidsakse etter dato (ikke tur-nummer), poeng 0–100 alltid
   - velg periode (2 uker, måned, 3 måneder, år, alt), eller zoom fritt med to fingre og dra sidelengs
   - samlet poengsum eller hver kategori, med en glidende trendlinje (snitt av 3 turer) så retningen syns
   - trykk på et punkt for å se turen og åpne rapporten
   data: [{ id, t (ms), overall, scores: { brake, accel, turn, smooth }, km }], eldste først. */
import { CATS } from './analysis.js';
import { icon } from './ui.js';
import { esc, km as fmtKm } from './format.js';

const PERIODS = [['14', '2 uker'], ['30', 'Måned'], ['90', '3 mnd'], ['365', 'År'], ['all', 'Alt']];
const CAT_COLOR = { brake: 'var(--brake)', accel: 'var(--accel)', turn: 'var(--turn)', smooth: 'var(--good)' };
const DAY = 86400000;
const dFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const dFmtY = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/* Glidende snitt over de n siste turene (til trendlinjen) */
export function rolling(vals, n = 3) {
  return vals.map((_, i) => { const w = vals.slice(Math.max(0, i - n + 1), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
}
/* Oppsummering av en periode: snitt, beste og endring (snitt av de 3 første mot de 3 siste) */
export function periodStats(points) {
  if (!points.length) return null;
  const v = points.map(p => p.overall);
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  const k = Math.min(3, Math.floor(v.length / 2));
  const change = k >= 1 ? v.slice(-k).reduce((a, b) => a + b, 0) / k - v.slice(0, k).reduce((a, b) => a + b, 0) / k : null;
  return { n: v.length, avg, best: Math.max(...v), change };
}

export function openDevChart(data, { goal = null, mode = 'total', onOpen = null } = {}) {
  if (!data.length) return;
  const box = document.createElement('div');
  box.className = 'dev-full';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Kjøreutvikling');
  document.body.appendChild(box);
  document.body.classList.add('map-open');
  const tMin = data[0].t, tMax = data[data.length - 1].t;
  const span = Math.max(tMax - tMin, DAY);
  let view = { from: tMin - span * 0.04, to: tMax + span * 0.04 }, period = 'all', sel = null;
  const setPeriod = p => {
    period = p;
    if (p === 'all') view = { from: tMin - span * 0.04, to: tMax + span * 0.04 };
    else { const d = +p * DAY; view = { from: Math.max(tMax - d, tMin - d * 0.04), to: tMax + d * 0.04 }; if (tMax - d < tMin) view.from = tMax - d; }
    draw();
  };
  const close = () => { box.remove(); document.body.classList.remove('map-open'); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const W = 360, H = 260, pl = 34, pr = 10, pt = 12, pb = 28;
  const X = t => pl + (t - view.from) / (view.to - view.from) * (W - pl - pr);
  const Y = v => pt + (1 - v / 100) * (H - pt - pb);
  const T = x => view.from + (x - pl) / (W - pl - pr) * (view.to - view.from);

  function chartSvg() {
    const vis = data.filter(p => p.t >= view.from && p.t <= view.to);
    const grid = [0, 25, 50, 75, 100].map(l => `<line x1="${pl}" x2="${W - pr}" y1="${Y(l)}" y2="${Y(l)}" class="grid"/><text x="${pl - 5}" y="${Y(l) + 4}" text-anchor="end" class="axis">${l}</text>`).join('');
    // Datoer langs bunnen: 4 merker jevnt fordelt
    const yr = new Date(view.from).getFullYear() !== new Date(view.to).getFullYear();
    const ticks = [0, 1, 2, 3].map(i => { const x = pl + i / 3 * (W - pl - pr); return `<text x="${x}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}" class="axis">${(yr ? dFmtY : dFmt).format(new Date(T(x)))}</text>`; }).join('');
    const path = (vals, pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(vals[i]).toFixed(1)}`).join('');
    let series = '';
    if (mode === 'cats') {
      series = Object.keys(CATS).map(k => `<path d="${path(data.map(p => p.scores[k]), data)}" fill="none" stroke="${CAT_COLOR[k]}" stroke-width="2.5" stroke-linejoin="round"/>`).join('');
    } else {
      const trend = rolling(data.map(p => p.overall));
      series = `<path d="${path(trend, data)}" fill="none" stroke="var(--link)" stroke-width="5" stroke-opacity=".35" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${path(data.map(p => p.overall), data)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
        ${data.map((p, i) => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.overall).toFixed(1)}" r="${sel === i ? 8 : 5.5}" fill="${p.overall >= 90 ? 'var(--good)' : p.overall >= 75 ? 'var(--turn)' : 'var(--brake)'}" stroke="${sel === i ? 'var(--ink)' : 'var(--surface)'}" stroke-width="2"/>`).join('')}`;
    }
    const goalLine = Number.isFinite(goal) && mode !== 'cats' ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(goal)}" y2="${Y(goal)}" class="goal-line"/><text x="${W - pr}" y="${Y(goal) - 5}" text-anchor="end" class="axis goal-text">Mål ${goal}</text>` : '';
    return { vis, svg: `<svg class="chart dev-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Poeng over tid, ${vis.length} turer i utsnittet">
      <defs><clipPath id="dev-clip"><rect x="${pl}" y="0" width="${W - pl - pr}" height="${H}"/></clipPath></defs>
      ${grid}${ticks}${goalLine}<g clip-path="url(#dev-clip)">${series}</g></svg>` };
  }

  function draw() {
    const { vis, svg } = chartSvg();
    const st = periodStats(vis);
    const p = sel !== null ? data[sel] : null;
    box.innerHTML = `<div class="dev-head"><h2>Kjøreutvikling</h2><button type="button" class="icon-btn dev-close" aria-label="Lukk">${icon('close', 24)}</button></div>
      <div class="mini-seg dev-mode" role="group" aria-label="Vis"><button type="button" data-m="total" class="${mode === 'total' ? 'on' : ''}">Samlet</button><button type="button" data-m="cats" class="${mode === 'cats' ? 'on' : ''}">Kategorier</button></div>
      <div class="chips dev-periods" role="group" aria-label="Periode">${PERIODS.map(([k, l]) => `<button type="button" class="chip ${period === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="dev-stats">${st ? `<span><strong>${Math.round(st.avg)}</strong><span class="muted small">snitt</span></span><span><strong>${st.best}</strong><span class="muted small">beste</span></span>
        <span><strong class="${st.change > 0 ? 'up' : st.change < 0 ? 'down' : ''}">${st.change === null ? '–' : (st.change > 0 ? '+' : '') + Math.round(st.change)}</strong><span class="muted small">endring</span></span><span><strong>${st.n}</strong><span class="muted small">${st.n === 1 ? 'tur' : 'turer'}</span></span>` : '<span class="muted">Ingen turer i dette utsnittet.</span>'}</div>
      <div class="dev-chart">${svg}</div>
      ${mode === 'cats' ? `<ul class="legend">${Object.keys(CATS).map(k => `<li><span class="dot line" style="background:${CAT_COLOR[k]}"></span>${CATS[k]}</li>`).join('')}</ul>`
        : '<p class="muted small dev-help">Den brede blå linjen er snittet av de tre siste turene. Zoom med to fingre, dra sidelengs, og trykk på et punkt.</p>'}
      ${p ? `<div class="card dev-pick"><span><strong>${esc(cap(longFmt.format(new Date(p.t))))}</strong><span class="muted small">${p.overall} poeng · ${fmtKm(p.km)}</span></span>${onOpen ? `<button type="button" class="btn small-btn primary dev-open">Åpne rapporten</button>` : ''}</div>` : ''}`;
    box.querySelector('.dev-close').onclick = close;
    box.querySelectorAll('.dev-mode button').forEach(b => b.onclick = () => { mode = b.dataset.m; sel = null; draw(); });
    box.querySelectorAll('.dev-periods .chip').forEach(b => b.onclick = () => { sel = null; setPeriod(b.dataset.p); });
    const open = box.querySelector('.dev-open');
    if (open) open.onclick = () => { close(); onOpen(p.id); };
    wire(box.querySelector('.dev-chart'));
  }

  // Zoom med to fingre og dra med én (pekerhendelser), trykk for å velge et punkt
  function wire(el) {
    const ptrs = new Map();
    let start = null, moved = false;
    const svgX = clientX => { const r = el.getBoundingClientRect(); return (clientX - r.left) / r.width * W; };
    el.onpointerdown = e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e.clientX); moved = false; start = { view: { ...view }, xs: [...ptrs.values()] }; };
    el.onpointermove = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, e.clientX);
      const xs = [...ptrs.values()];
      if (!start || xs.length !== start.xs.length) { start = { view: { ...view }, xs }; return; }
      const v0 = start.view, w0 = v0.to - v0.from;
      const t0 = x => v0.from + (svgX(x) - pl) / (W - pl - pr) * w0;
      if (xs.length >= 2) {
        const a0 = t0(start.xs[0]), b0 = t0(start.xs[1]);
        const d1 = Math.abs(svgX(xs[1]) - svgX(xs[0])), d0 = Math.abs(svgX(start.xs[1]) - svgX(start.xs[0]));
        if (d1 < 8 || d0 < 8) return;
        const w = Math.min(Math.max(w0 * d0 / d1, DAY), (tMax - tMin) * 1.5 + 30 * DAY);
        const mid = (a0 + b0) / 2, midX = (svgX(xs[0]) + svgX(xs[1])) / 2;
        const from = mid - (midX - pl) / (W - pl - pr) * w;
        view = { from, to: from + w };
      } else {
        const dx = (svgX(xs[0]) - svgX(start.xs[0])) / (W - pl - pr) * w0;
        if (Math.abs(dx) > w0 * 0.01) moved = true;
        view = { from: v0.from - dx, to: v0.to - dx };
      }
      if (xs.length >= 2) moved = true;
      period = '';
      redrawChart();
    };
    const up = e => {
      const wasTap = ptrs.size === 1 && !moved;
      ptrs.delete(e.pointerId);
      if (!ptrs.size) start = null; else start = { view: { ...view }, xs: [...ptrs.values()] };
      if (wasTap && mode !== 'cats') {
        const r = el.getBoundingClientRect(), x = svgX(e.clientX), y = (e.clientY - r.top) / r.height * H;
        let best = null, bd = 24;
        data.forEach((p, i) => { const d = Math.hypot(X(p.t) - x, Y(p.overall) - y); if (d < bd) { bd = d; best = i; } });
        sel = best; draw();
      } else if (moved) draw();
    };
    el.onpointerup = up; el.onpointercancel = up;
  }
  function redrawChart() { const c = box.querySelector('.dev-chart'); if (c) c.innerHTML = chartSvg().svg; }

  draw();
  box.querySelector('.dev-close').focus();
}
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
