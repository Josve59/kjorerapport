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
const DAY = 86400000, MIN_W = 20 * 60000;   // zoom helt inn til 20 minutter (flere turer samme kveld)
const dFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const dFmtY = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
const tFmt = new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' });
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
  const pad = Math.max((tMax - tMin) * 0.05, 15 * 60000);
  const fitAll = () => ({ from: tMin - pad, to: tMax + pad });
  const maxW = Math.max(tMax - tMin + 2 * pad, 400 * DAY);
  let view = fitAll(), period = 'all', sel = null;
  // Utsnittet holdes innenfor grensene, og alltid med noe av dataene i
  const clamp = v => {
    let w = Math.min(Math.max(v.to - v.from, MIN_W), maxW), from = v.from;
    from = Math.min(Math.max(from, tMin - w * 0.9), tMax - w * 0.1);
    return { from, to: from + w };
  };
  const zoomBy = f => { const c = (view.from + view.to) / 2, w = (view.to - view.from) * f; view = clamp({ from: c - w / 2, to: c + w / 2 }); period = ''; sel = null; draw(); };
  const setPeriod = p => {
    period = p;
    if (p === 'all') view = fitAll();
    else { const d = +p * DAY; view = clamp({ from: tMax - d, to: tMax + d * 0.04 }); }
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
    // Kort utsnitt: klokkeslett. Langt: dato (med år når utsnittet går over nyttår).
    const yr = new Date(view.from).getFullYear() !== new Date(view.to).getFullYear();
    const short = view.to - view.from < 2 * DAY;
    const fmt = short ? tFmt : yr ? dFmtY : dFmt;
    const ticks = [0, 1, 2, 3].map(i => { const x = pl + i / 3 * (W - pl - pr); return `<text x="${x}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}" class="axis">${fmt.format(new Date(T(x)))}</text>`; }).join('');
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
      <div class="dev-zoom"><button type="button" class="btn secondary small-btn" data-z="out" aria-label="Zoom ut">−</button><button type="button" class="btn secondary small-btn" data-z="fit">Vis alt</button><button type="button" class="btn secondary small-btn" data-z="in" aria-label="Zoom inn">+</button></div>
      ${mode === 'cats' ? `<ul class="legend">${Object.keys(CATS).map(k => `<li><span class="dot line" style="background:${CAT_COLOR[k]}"></span>${CATS[k]}</li>`).join('')}</ul>`
        : '<p class="muted small dev-help">Den brede linjen er snittet av de tre siste turene. Knip for å zoome, dra sidelengs, og trykk på et punkt for å se turen.</p>'}
      ${p ? `<div class="card dev-pick"><span><strong>${esc(cap(longFmt.format(new Date(p.t))))}</strong><span class="muted small">${p.overall} poeng · ${fmtKm(p.km)}</span></span>${onOpen ? `<button type="button" class="btn small-btn primary dev-open">Åpne rapporten</button>` : ''}</div>` : ''}`;
    box.querySelector('.dev-close').onclick = close;
    box.querySelectorAll('.dev-mode button').forEach(b => b.onclick = () => { mode = b.dataset.m; sel = null; draw(); });
    box.querySelectorAll('.dev-periods .chip').forEach(b => b.onclick = () => { sel = null; setPeriod(b.dataset.p); });
    box.querySelectorAll('.dev-zoom button').forEach(b => b.onclick = () => { if (b.dataset.z === 'fit') { sel = null; setPeriod('all'); } else zoomBy(b.dataset.z === 'in' ? 0.5 : 2); });
    const open = box.querySelector('.dev-open');
    if (open) open.onclick = () => { close(); onOpen(p.id); };
    wire(box.querySelector('.dev-chart'));
  }

  // Zoom med to fingre og dra med én, trykk for å velge et punkt. Berøringshendelser på iPhone (0.12.2: mer pålitelig
  // enn pekerhendelser for to fingre), mus i nettleseren.
  function wire(el) {
    let start = null, moved = false, fingers = 0;
    const svgX = clientX => { const r = el.getBoundingClientRect(); return (clientX - r.left) / r.width * W; };
    const begin = xs => { start = { view: { ...view }, xs }; };
    const move = xs => {
      if (!start || xs.length !== start.xs.length) { begin(xs); return; }
      const v0 = start.view, w0 = v0.to - v0.from;
      const t0 = x => v0.from + (svgX(x) - pl) / (W - pl - pr) * w0;
      if (xs.length >= 2) {
        const d1 = Math.abs(svgX(xs[1]) - svgX(xs[0])), d0 = Math.abs(svgX(start.xs[1]) - svgX(start.xs[0]));
        if (d1 < 4 || d0 < 4) return;
        const w = Math.min(Math.max(w0 * d0 / d1, MIN_W), maxW);
        const mid = (t0(start.xs[0]) + t0(start.xs[1])) / 2, midX = (svgX(xs[0]) + svgX(xs[1])) / 2;
        const from = mid - (midX - pl) / (W - pl - pr) * w;
        view = clamp({ from, to: from + w });
        moved = true;
      } else {
        const dx = (svgX(xs[0]) - svgX(start.xs[0])) / (W - pl - pr) * w0;
        if (Math.abs(svgX(xs[0]) - svgX(start.xs[0])) > 6) moved = true;
        if (!moved) return;
        view = clamp({ from: v0.from - dx, to: v0.to - dx });
      }
      period = '';
      redrawChart();
    };
    const tap = (cx, cy) => {
      if (mode === 'cats') return;
      const r = el.getBoundingClientRect(), x = svgX(cx), y = (cy - r.top) / r.height * H;
      let best = null, bd = 28;
      data.forEach((p, i) => { const d = Math.hypot(X(p.t) - x, Y(p.overall) - y); if (d < bd) { bd = d; best = i; } });
      sel = best; draw();
    };
    const end = (rest, cx, cy) => {
      if (rest.length) { begin(rest); return; }
      const wasTap = fingers === 1 && !moved;
      start = null; fingers = 0;
      if (wasTap) tap(cx, cy); else if (moved) draw();
      moved = false;
    };
    const xsOf = list => [...list].map(t => t.clientX);
    el.addEventListener('touchstart', e => { e.preventDefault(); if (!start) moved = false; fingers = Math.max(fingers, e.touches.length); begin(xsOf(e.touches)); }, { passive: false });
    el.addEventListener('touchmove', e => { e.preventDefault(); move(xsOf(e.touches)); }, { passive: false });
    const te = e => { const c = e.changedTouches[0]; end(xsOf(e.touches), c.clientX, c.clientY); };
    el.addEventListener('touchend', te); el.addEventListener('touchcancel', te);
    // Mus (nettleseren på en datamaskin): dra og klikk
    el.onpointerdown = e => { if (e.pointerType !== 'mouse') return; el.setPointerCapture(e.pointerId); moved = false; fingers = 1; begin([e.clientX]); };
    el.onpointermove = e => { if (e.pointerType === 'mouse' && start) move([e.clientX]); };
    el.onpointerup = e => { if (e.pointerType === 'mouse' && start) end([], e.clientX, e.clientY); };
    el.onwheel = e => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.25 : 0.8); };
  }
  function redrawChart() { const c = box.querySelector('.dev-chart'); if (c) c.innerHTML = chartSvg().svg; }

  draw();
  box.querySelector('.dev-close').focus();
}
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
