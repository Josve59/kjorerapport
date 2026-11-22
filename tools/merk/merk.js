/* Merkesiden for feltlinjer (1.0.5). Viser veibåndet (der feltmodellen ser) forstørret, med forslagene som linjer
   eieren retter. Linjene lagres i kamerabildets piksler (720×1280) når bildet godkjennes. */
const $ = s => document.querySelector(s);
const cv = $('#cv'), g = cv.getContext('2d');
let list = [], idx = 0, cur = null, img = null;
let lines = [], sel = -1, drawing = null, history = [], dirty = false;
let drag = null, hover = null;
let crop = { y0: 0, y1: 1280 }, s = 1, light = 1.5, showRoad = false;

const api = async (url, opts) => { const r = await fetch(url, opts); if (!r.ok) throw new Error(await r.text()); return r.json(); };

async function start() {
  const st = await api('/api/sett');
  list = st.frames;
  document.title = `Merk feltlinjer · ${st.session}`;
  const first = list.findIndex(f => !f.status);
  await open(first >= 0 ? first : 0);
  progress();
}

function progress() {
  const ok = list.filter(f => f.status === 'ok').length, hopp = list.filter(f => f.status === 'hopp').length;
  $('#progress').textContent = `${ok + hopp} av ${list.length} gått gjennom · ${ok} godkjent · ${hopp} hoppet over`;
  $('#bar').style.width = `${(ok + hopp) / Math.max(1, list.length) * 100}%`;
}

/* Bildet og linjene byttes først når begge er lastet, og bare for siste bilde som ble bedt om. Mens et bilde laster,
   lagres ingenting (rask bla med piltastene lagret ellers linjene fra ett bilde på et annet). */
let openSeq = 0, loading = false;
async function open(i) {
  if (i < 0 || i >= list.length) return;
  const tok = ++openSeq, f = list[i];
  loading = true;
  let data, im;
  try {
    data = await api(`/api/bilde/${f.id}`);
    im = await new Promise((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = rej; x.src = `/img/${f.id}.jpg`; });
  } catch (err) { if (tok === openSeq) { loading = false; $('#state').textContent = 'Fikk ikke lastet bildet: ' + (err.message || err); } return; }
  if (tok !== openSeq) return;   // et nyere bilde er bedt om
  loading = false;
  idx = i; cur = data; img = im; sel = -1; drawing = null; history = []; dirty = false; hover = null; drag = null;
  $('#drawhint').hidden = true; cv.classList.remove('drawing');
  const e = cur.etikett;
  lines = e ? e.lines.map(l => ({ pts: l.pts.map(p => [...p]), from: 'lagret' })) : cur.lines.map(l => ({ pts: l.pts.map(p => [...p]), from: 'forslag' }));
  crop = { y0: Math.max(0, cur.y0 - 110), y1: Math.min(1280, cur.y1 + 20) };
  $('#frame-id').textContent = `Bilde ${i + 1} av ${list.length} · ${f.id}`;
  $('#meta').textContent = [Number.isFinite(cur.kmh) ? `${Math.round(cur.kmh)} km/t` : '', cur.dark ? 'mørkt' : 'lyst'].filter(Boolean).join(' · ');
  // Claudes gjennomgang: hva som ble fjernet fra forslagene, og om bildet trolig bør hoppes over
  const c = cur.claude, note = $('#claude');
  note.hidden = !c || !!cur.etikett;
  if (c) note.textContent = c.hopp ? `Claude foreslår å hoppe over${c.note ? `: ${c.note}` : ''}.`
    : c.fjernet ? `Claude fjernet ${c.fjernet} forslag${c.note ? ` (${c.note})` : ''}.` : 'Claude har sett gjennom forslagene.';
  state();
  layout();
}

function state() {
  const f = list[idx], el = $('#state');
  const s0 = f.status === 'ok' ? 'ok' : f.status === 'hopp' ? 'hopp' : 'ny';
  el.dataset.s = s0;
  const n = lines.length, word = n === 1 ? 'linje' : 'linjer';
  el.textContent = s0 === 'ok' ? `Godkjent${dirty ? ' · endret, ikke lagret' : ''} · ${n} ${word}` : s0 === 'hopp' ? 'Hoppet over' : `Ikke gått gjennom · ${n} ${word}`;
  $('#btn-del').disabled = sel < 0;
}

function layout() {
  const box = $('#stage').getBoundingClientRect();
  const w = 720, h = crop.y1 - crop.y0;
  s = Math.min((box.width - 24) / w, (box.height - 24) / h, 2.2);
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * s * dpr); cv.height = Math.round(h * s * dpr);
  cv.style.width = `${w * s}px`; cv.style.height = `${h * s}px`;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

const X = x => x * s, Y = y => (y - crop.y0) * s;
const fromEvent = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / s, (ev.clientY - r.top) / s + crop.y0]; };

function draw() {
  if (!img) return;
  const w = 720 * s, h = (crop.y1 - crop.y0) * s;
  g.clearRect(0, 0, w, h);
  g.filter = `brightness(${light}) contrast(${1 + (light - 1) * 0.25})`;
  g.drawImage(img, 0, crop.y0, 720, crop.y1 - crop.y0, 0, 0, w, h);
  g.filter = 'none';
  if (showRoad && cur.road) {
    g.fillStyle = 'rgba(80,150,255,.9)';
    for (let i = 0; i + 2 < cur.road.length; i += 3) for (const x of [cur.road[i + 1], cur.road[i + 2]]) g.fillRect(X(x) - 1.5, Y(cur.road[i]) - 1.5, 3, 3);
  }
  const all = drawing ? [...lines, { pts: drawing, from: 'ny', drawing: true }] : lines;
  all.forEach((l, i) => {
    const on = i === sel || l.drawing, proposal = l.from === 'forslag';
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    // Mørk kant under, så linjen synes på lys vei
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = on ? 7 : 5;
    path(l.pts); g.stroke();
    g.strokeStyle = proposal ? '#ff9f1a' : '#ffd400'; g.lineWidth = on ? 4 : 2.5;
    if (proposal && !on) g.setLineDash([10, 7]);
    path(l.pts); g.stroke();
    g.restore();
    if (on || hover && hover.line === i) for (const [k, p] of l.pts.entries()) {
      const hot = hover && hover.line === i && hover.node === k;
      g.beginPath(); g.arc(X(p[0]), Y(p[1]), hot ? 7 : 5, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#111'; g.stroke();
    }
  });
}
function path(pts) { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); }

function snapshot() { history.push(JSON.stringify(lines)); if (history.length > 80) history.shift(); dirty = true; }
function undo() { if (!history.length) return; lines = JSON.parse(history.pop()); sel = -1; state(); draw(); }

/* Treff: et punkt (innen 12 px på skjermen) eller en linje (innen 12 px) */
function hit(x, y) {
  const r = 12 / s, rl = 12 / s;
  for (let i = lines.length - 1; i >= 0; i--) for (const [k, p] of lines[i].pts.entries()) if (Math.hypot(p[0] - x, p[1] - y) <= r) return { line: i, node: k };
  for (let i = lines.length - 1; i >= 0; i--) {
    const pts = lines[i].pts;
    for (let k = 1; k < pts.length; k++) { const d = segDist([x, y], pts[k - 1], pts[k]); if (d.d <= rl) return { line: i, seg: k }; }
  }
  return null;
}
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
  return { d: Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]), t };
}

cv.addEventListener('pointerdown', ev => {
  const [x, y] = fromEvent(ev);
  if (drawing) { drawing.push([x, y]); draw(); return; }
  const h = hit(x, y);
  if (h && h.node !== undefined) {
    if (ev.altKey || ev.button === 2) {   // fjern punktet (en linje trenger minst to)
      if (lines[h.line].pts.length > 2) { snapshot(); lines[h.line].pts.splice(h.node, 1); if (lines[h.line].from === 'forslag') lines[h.line].from = 'rettet'; }
      sel = h.line; state(); draw(); return;
    }
    sel = h.line; snapshot(); drag = h; cv.setPointerCapture(ev.pointerId);
  } else if (h && h.seg !== undefined) {
    if (sel === h.line) {   // nytt punkt på den valgte linjen, og dra det med en gang
      snapshot(); lines[h.line].pts.splice(h.seg, 0, [x, y]); if (lines[h.line].from === 'forslag') lines[h.line].from = 'rettet';
      drag = { line: h.line, node: h.seg }; cv.setPointerCapture(ev.pointerId);
    } else sel = h.line;
  } else sel = -1;
  state(); draw();
});
cv.addEventListener('pointermove', ev => {
  const [x, y] = fromEvent(ev);
  if (drag) {
    const L = lines[drag.line]; L.pts[drag.node] = [Math.max(0, Math.min(720, x)), Math.max(crop.y0, Math.min(crop.y1, y))];
    if (L.from === 'forslag') L.from = 'rettet';
    draw(); return;
  }
  const h = drawing ? null : hit(x, y);
  const key = h ? `${h.line}:${h.node}` : '';
  if (key !== (hover ? `${hover.line}:${hover.node}` : '')) { hover = h; draw(); }
  cv.style.cursor = drawing ? 'crosshair' : h ? (h.node !== undefined ? 'grab' : 'pointer') : 'default';
});
cv.addEventListener('pointerup', () => { if (drag) { drag = null; state(); } });
cv.addEventListener('contextmenu', ev => ev.preventDefault());
cv.addEventListener('dblclick', () => { if (drawing) finishLine(); });

function newLine() {
  if (drawing) { finishLine(); return; }
  drawing = []; sel = -1;
  $('#drawhint').hidden = false; cv.classList.add('drawing'); draw();
}
function finishLine() {
  // Dobbeltklikk legger inn samme punkt to ganger: dropp punkter som ligger oppå hverandre
  const pts = (drawing || []).filter((p, k, a) => !k || Math.hypot(p[0] - a[k - 1][0], p[1] - a[k - 1][1]) > 3);
  if (pts.length >= 2) { snapshot(); lines.push({ pts, from: 'ny' }); sel = lines.length - 1; }
  drawing = null; $('#drawhint').hidden = true; cv.classList.remove('drawing'); state(); draw();
}
function cancelLine() { drawing = null; $('#drawhint').hidden = true; cv.classList.remove('drawing'); draw(); }
function delLine() { if (sel < 0) return; snapshot(); lines.splice(sel, 1); sel = -1; state(); draw(); }
function clearAll() { if (!lines.length) return; snapshot(); lines = []; sel = -1; state(); draw(); }

async function save(status) {
  if (loading || !cur) return false;
  if (drawing) finishLine();
  const f = list[idx];
  if (f.id !== cur.id) return false;
  const fra = { forslag: lines.filter(l => l.from === 'forslag').length, rettet: lines.filter(l => l.from === 'rettet').length, ny: lines.filter(l => l.from === 'ny').length };
  await api(`/api/etikett/${f.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, lines: lines.map(l => ({ pts: l.pts })), fra }) });
  f.status = status; f.n = lines.length; dirty = false;
  progress();
  return true;
}
let saving = false;
async function approve() { if (saving) return; saving = true; try { if (await save('ok')) await open(Math.min(list.length - 1, idx + 1)); } finally { saving = false; } }
async function skip() { if (saving) return; saving = true; try { if (await save('hopp')) await open(Math.min(list.length - 1, idx + 1)); } finally { saving = false; } }
// Piltastene blar fra bildet som er bedt om sist, så mange trykk etter hverandre går like langt
let target = 0;
async function go(d) {
  if (dirty && !loading && !confirm('Endringene på dette bildet er ikke godkjent. Gå videre likevel?')) return;
  target = Math.max(0, Math.min(list.length - 1, (loading ? target : idx) + d));
  await open(target);
}
async function nextTodo() {
  for (let k = 1; k <= list.length; k++) { const j = (idx + k) % list.length; if (!list[j].status) { if (dirty && !confirm('Endringene på dette bildet er ikke godkjent. Gå videre likevel?')) return; await open(j); return; } }
  alert('Alle bildene er gått gjennom. Takk!');
}

$('#btn-ok').onclick = approve;
$('#btn-skip').onclick = skip;
$('#btn-new').onclick = newLine;
$('#btn-del').onclick = delLine;
$('#btn-clear').onclick = clearAll;
$('#btn-prev').onclick = () => go(-1);
$('#btn-next').onclick = () => go(1);
$('#btn-todo').onclick = nextTodo;
$('#light').oninput = e => { light = Number(e.target.value); draw(); };
$('#show-road').onchange = e => { showRoad = e.target.checked; draw(); };
window.addEventListener('resize', layout);
window.addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox' && ev.target.type !== 'range') return;
  const k = ev.key;
  if ((ev.metaKey || ev.ctrlKey) && k.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (k === 'Enter') { ev.preventDefault(); if (drawing) finishLine(); else approve(); }
  else if (k === 'n' || k === 'N') newLine();
  else if (k === 'Escape') { if (drawing) cancelLine(); else { sel = -1; state(); draw(); } }
  else if (k === 'Backspace' || k === 'Delete') { ev.preventDefault(); if (drawing) { drawing.pop(); draw(); } else delLine(); }
  else if (k === 's' || k === 'S') skip();
  else if (k === 'ArrowRight') go(1);
  else if (k === 'ArrowLeft') go(-1);
  else if (k === 'l' || k === 'L') { light = light >= 4 ? 1 : light + 0.75; $('#light').value = light; draw(); }
  else if (k === 'v' || k === 'V') { showRoad = !showRoad; $('#show-road').checked = showRoad; draw(); }
});

start().catch(err => { $('#progress').textContent = 'Fikk ikke kontakt med serveren: ' + err.message; });
