/* Felles UI-byggeklosser: ikoner, toast, dialoger, rutebilde. Ingen avhengigheter. */

const P = {
  back: 'M15 5l-7 7 7 7',
  gear: 'M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm7.4-2.5a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L14.9 3h-4l-.4 2.4a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.4 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.3 7.3 0 0 0 1.7 1l.4 2.4h4l.4-2.4a7.3 7.3 0 0 0 1.7-1l2.5 1 2-3.5z',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  print: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z',
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  chart: 'M4 19h16M7 16V9M12 16V5M17 16v-4',
  speed: 'M5 17a8 8 0 1 1 14 0M12 13l4-4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  note: 'M5 4h10l4 4v12H5zM15 4v4h4M8 13h8M8 17h5',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  check: 'M5 12.5l4.5 4.5L19 7',
  warn: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  close: 'M6 6l12 12M18 6L6 18',
  chev: 'M9 5l7 7-7 7',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  wheel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14v7M10 12L3.5 9.5M14 12l6.5-2.5',
  mirror: 'M4 8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM12 14v5M9 19h6',
  shoulder: 'M9 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM5 21v-2a5 5 0 0 1 5-5h2M16 13l3 3-3 3M19 16h-6',
  blink: 'M9 6l-6 6 6 6M15 6l6 6-6 6',
  lane: 'M6 3v18M18 3v18M12 4v3M12 10v4M12 17v3',
  shift: 'M4 3v18M20 3v18M9 20c0-6 6-7 6-13M12.5 9.5L15 7l2.5 2.5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  round: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v5M12 17v5M2 12h5M17 12h5',
  stop: 'M8 3h8l5 5v8l-5 5H8l-5-5V8zM8 12h8',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  school: 'M3 9l9-5 9 5-9 5zM7 11v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5M21 9v6',
  checkbox: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'
};

/* Leser opp tekst med norsk stemme hvis telefonen har en. Returnerer false hvis tale ikke støttes. */
export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const v = voices.find(x => /^nb|^no/i.test(x.lang)) || voices.find(x => /nn|da|sv/i.test(x.lang));
  if (v) u.voice = v;
  u.lang = v ? v.lang : 'nb-NO';
  u.rate = 1;
  synth.speak(u);
  return true;
}
export function stopSpeaking() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }

/* Ledsagerens hurtigknapper */
export const MARK_CATS = {
  speil: { label: 'Speil', icon: 'mirror' },
  skulder: { label: 'Skulder', icon: 'shoulder' },
  blink: { label: 'Blinklys', icon: 'blink' },
  plass: { label: 'Plassering', icon: 'lane' },
  fart: { label: 'Fart', icon: 'speed' },
  annet: { label: 'Annet', icon: 'flag' },
  // Ikke en merknad, men fasit: ledsageren trykker like etter hvert feltskifte (v0.7.6)
  felt: { label: 'Feltskifte', icon: 'shift', neutral: true },
  // Fasit for fartsgrensen (v0.9.4): trykk når appens fartsgrense ikke stemmer med skiltet eller bilen
  grense: { label: 'Feil grense', icon: 'speed', neutral: true }
};
/* Merker som ikke er tilbakemelding på kjøringen */
export const isRemark = m => m.cat !== 'annet' && !(MARK_CATS[m.cat] && MARK_CATS[m.cat].neutral);

/* Dagens øvingsmål (maks tre per tur) */
export const FOCUS = [
  { id: 'brake', label: 'Myk bremsing' },
  { id: 'accel', label: 'Rolig akselerasjon' },
  { id: 'turn', label: 'Svinger' },
  { id: 'smooth', label: 'Jevn fart' },
  { id: 'limits', label: 'Fartsgrenser' },
  { id: 'roundabout', label: 'Rundkjøringer' },
  { id: 'lane', label: 'Feltskifte' },
  { id: 'junction', label: 'Kryss og vikeplikt' },
  { id: 'mirror', label: 'Speil og skulderblikk' },
  { id: 'dark', label: 'Mørkekjøring' }
];

export function icon(name, size = 22, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`;
}

/* ---------- Toast ---------- */
let toastTimer = null;
export function toast(text, { type = 'info', ms = 3200 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'warn' : type === 'ok' ? 'check' : 'info', 20)}<span></span>`;
  el.querySelector('span').textContent = text;
  clearTimeout(toastTimer);
  // Tidtakeren starter først når meldingen vises, ellers kan den bli stående hvis siden var skjult
  requestAnimationFrame(() => { el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms); });
}

/* ---------- Dialoger (erstatter alert/confirm/prompt) ---------- */
function dialogShell() {
  let d = document.getElementById('app-dialog');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'app-dialog';
    d.className = 'sheet';
    document.body.appendChild(d);
  }
  return d;
}

export function confirmDialog({ title, text = '', ok = 'OK', cancel = 'Avbryt', danger = false }) {
  return new Promise(resolve => {
    const d = dialogShell();
    d.innerHTML = `<form method="dialog" class="sheet-body">
      <h2>${esc(title)}</h2>
      ${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <div class="sheet-actions">
        ${cancel ? `<button value="cancel" class="btn secondary">${esc(cancel)}</button>` : ''}
        <button value="ok" class="btn ${danger ? 'danger-fill' : 'primary'}">${esc(ok)}</button>
      </div></form>`;
    const done = () => { d.removeEventListener('close', done); resolve(d.returnValue === 'ok'); };
    d.addEventListener('close', done);
    d.returnValue = '';
    openDialog(d);
  });
}

export function infoDialog({ title, text = '', ok = 'OK' }) {
  return confirmDialog({ title, text, ok, cancel: '' });
}

export function promptDialog({ title, text = '', placeholder = '', ok = 'Lagre', value = '', maxLength = 60 }) {
  return new Promise(resolve => {
    const d = dialogShell();
    d.innerHTML = `<form method="dialog" class="sheet-body">
      <h2>${esc(title)}</h2>
      ${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <input class="sheet-input" maxlength="${maxLength}" placeholder="${esc(placeholder)}" value="${esc(value)}" aria-label="${esc(title)}">
      <div class="sheet-actions">
        <button value="cancel" class="btn secondary" formnovalidate>Avbryt</button>
        <button value="ok" class="btn primary">${esc(ok)}</button>
      </div></form>`;
    const input = d.querySelector('input');
    const done = () => { d.removeEventListener('close', done); resolve(d.returnValue === 'ok' ? input.value.trim() : null); };
    d.addEventListener('close', done);
    d.returnValue = '';
    openDialog(d);
    setTimeout(() => input.focus(), 50);
  });
}

function openDialog(d) {
  if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
  else { d.setAttribute('open', ''); }
  // Trykk på bakgrunnen lukker
  d.onclick = e => { if (e.target === d) d.close('cancel'); };
}

/* ---------- Lite rutebilde (miniatyr) ---------- */
export function routeThumb(points, size = 56) {
  if (!points || points.length < 2) return `<span class="thumb thumb-empty">${icon('map', 22)}</span>`;
  const step = Math.max(1, Math.floor(points.length / 80));
  const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const meanLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const cos = Math.cos(meanLat * Math.PI / 180);
  const xs = pts.map(p => p.lon * cos), ys = pts.map(p => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const pad = 8, s = (size - 2 * pad) / span;
  const ox = (size - (maxX - minX) * s) / 2, oy = (size - (maxY - minY) * s) / 2;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(ox + (xs[i] - minX) * s).toFixed(1)} ${(oy + (ys[i] - minY) * s).toFixed(1)}`).join('');
  const last = pts.length - 1;
  return `<svg class="thumb" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="var(--road-edge)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--lane)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${(ox + (xs[0] - minX) * s).toFixed(1)}" cy="${(oy + (ys[0] - minY) * s).toFixed(1)}" r="3.5" fill="var(--good)"/>
    <rect x="${(ox + (xs[last] - minX) * s - 3).toFixed(1)}" y="${(oy + (ys[last] - minY) * s - 3).toFixed(1)}" width="6" height="6" fill="var(--ink)"/>
  </svg>`;
}

/* Liten poengskive (fartsgrenseskilt) til lister */
export function scoreBadge(score, size = 46) {
  return `<svg class="badge" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${score} poeng">
    <circle cx="50" cy="50" r="47" fill="#fff"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="#c8102e" stroke-width="13"/>
    <text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-weight="800" font-size="${score >= 100 ? 32 : 40}" fill="#111">${score}</text>
  </svg>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
