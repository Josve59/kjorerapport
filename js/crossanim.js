/* Spiller av et kryss fra trafficsvg.js (0.22.0): trafikantene kjører langs banene sine, gruppe for gruppe, i den
   rekkefølgen reglene gir. Brukes i «Hvem kjører først?», etter svar i øvingen og i teoriboka.
   Kjøretøy setter i gang rolig og holder så farten; den som stopper i bildet (fotgjenger, bil inn i en innkjørsel),
   bremser rolig ned. Med «Reduser bevegelse» på flytter de seg uten animasjon, ett steg om gangen. */

const SPEED = { car: 92, bus: 78, bike: 58, person: 26 };   // enheter per sekund (tegningen er 200 enheter bred)
const ACC_T = 0.7;                                          // sekunder å komme opp i fart
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const wait = ms => new Promise(r => setTimeout(r, ms));

const parts = (svg, id) => {
  const g = svg.querySelector(`.cx-mover[data-id="${id}"]`), path = svg.querySelector(`.cx-paths path[data-id="${id}"]`);
  return g && path ? { g, path, kind: g.dataset.kind, len: path.getTotalLength() } : null;
};
/* Står i bildet når banen slutter: da bremser den ned i stedet for å kjøre ut */
const endsInside = (path, len) => { const p = path.getPointAtLength(len); return p.x > 0 && p.x < 200 && p.y > 0 && p.y < 200; };

function pose(m, s) {
  const p = m.path.getPointAtLength(s);
  m.g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
  if (m.kind === 'person') return;
  const a = m.path.getPointAtLength(Math.max(0, s - 0.6)), b = m.path.getPointAtLength(Math.min(m.len, s + 0.6));
  const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;   // tegnet med fronten opp
  m.g.querySelector('.cx-body').setAttribute('transform', `rotate(${ang.toFixed(1)})`);
}

/* Strekning etter t sekunder: akselerer, hold farten, og brems ned til slutt hvis den stopper i bildet */
function distanceAt(t, v, len, stops) {
  const ta = ACC_T, da = v * ta / 2;
  if (stops) {
    if (2 * da >= len) { const tt = Math.sqrt(len / (v / ta)); return t < tt ? (v / ta) * t * t / 2 : t < 2 * tt ? len - (v / ta) * (2 * tt - t) ** 2 / 2 : len; }
    const tc = (len - 2 * da) / v;
    if (t < ta) return v * t * t / (2 * ta);
    if (t < ta + tc) return da + v * (t - ta);
    const r = Math.min(ta, t - ta - tc);
    return Math.min(len, da + v * tc + v * r - v * r * r / (2 * ta));
  }
  if (t < ta) return Math.min(len, v * t * t / (2 * ta));
  return Math.min(len, da + v * (t - ta));
}

/* Setter alle tilbake der de starter, med pilene synlige */
export function resetCrossing(svg) {
  svg.querySelectorAll('.cx-mover').forEach(g => { const m = parts(svg, g.dataset.id); if (m) pose(m, 0); });
  const ar = svg.querySelector('.cx-arrows'); if (ar) ar.classList.remove('cx-hide');
}

/* order: [['B'], ['A']] – gruppene kjører etter hverandre. onStep(i) kalles når gruppe i starter, og med
   order.length når alt er ferdig. Returnerer { stop(), done }. */
export function playCrossing(svg, order, { onStep, gap = 380 } = {}) {
  let stopped = false, raf = 0;
  resetCrossing(svg);
  const ar = svg.querySelector('.cx-arrows'); if (ar) ar.classList.add('cx-hide');
  const still = reduced();
  const moveGroup = ids => new Promise(res => {
    const items = ids.map(id => parts(svg, id)).filter(Boolean).map(m => ({ ...m, v: SPEED[m.kind] || 80, stops: endsInside(m.path, m.len) }));
    if (still) { items.forEach(m => pose(m, m.len)); res(); return; }
    const t0 = performance.now();
    const tick = now => {
      if (stopped) { res(); return; }
      const t = (now - t0) / 1000;
      let done = true;
      for (const m of items) { const s = distanceAt(t, m.v, m.len, m.stops); pose(m, s); if (s < m.len - 0.01) done = false; }
      if (done) res(); else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  const done = (async () => {
    await wait(still ? 0 : 250);
    for (let i = 0; i < order.length && !stopped; i++) {
      if (onStep) onStep(i);
      await moveGroup(order[i]);
      if (!stopped) await wait(still ? 1100 : gap);
    }
    if (!stopped && onStep) onStep(order.length);
  })();
  return { stop() { stopped = true; cancelAnimationFrame(raf); }, done };
}
