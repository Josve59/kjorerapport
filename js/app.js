/* Kjørerapport – skjermer og navigasjon. Alt skjer lokalt på telefonen. */
import { analyze, makeDemo, SENSITIVITY, TH } from './analysis.js';
import { Recorder, requestMotionPermission, requestLocationOnce, startPrecheck } from './recorder.js';
import { listDrives, getDrive, putDrive, updateDrive, importDrive, deleteDrive, deleteAll, getSettings, saveSettings, exportPayload, toJSON, requestPersistentStorage } from './db.js';
import { renderReport, trendChart, categoryTrendChart, eventsPer10km, speedingFor, markRows, eventLabel } from './report.js';
import { enrichDrive, evaluateRoad } from './enrich.js';
import { suggestFocus, hotspots, sameRoute, curriculumEvidence, CURRICULUM } from './insights.js';
import { esc, km, n0, n1, date, duration } from './format.js';
import { icon, toast, confirmDialog, infoDialog, promptDialog, routeThumb, scoreBadge, MARK_CATS, FOCUS, speak, stopSpeaking } from './ui.js';
import { driveLog, sumLogs, ROAD_LABEL, LIGHT_LABEL } from './log.js';

export const APP_VERSION = '0.7.8';
let speakNext = null;
const $ = sel => document.querySelector(sel);
const screens = {};
let recorder = null;
let stopPrecheck = null;
let swUpdateReady = null;
let installPrompt = null;
let persistState = null;

function show(name) {
  const target = screens[name];
  const changed = target.hidden;
  Object.values(screens).forEach(s => { if (s !== target) s.hidden = true; });
  target.hidden = false;
  if (changed) { target.classList.remove('enter'); void target.offsetWidth; target.classList.add('enter'); }
  window.scrollTo(0, 0);
}

/* Fyller [data-icon]-elementer med SVG-ikoner. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.iconDone) return;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, el.classList.contains('icon-btn') ? 24 : 20));
    el.dataset.iconDone = '1';
  });
}

const monthFmt = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' });
const shortDayFmt = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' });
const SEP = '<span class="sep">·</span>';
function shortDay(iso) {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  const day = days <= 0 ? 'I dag' : days === 1 ? 'I går' : cap(shortDayFmt.format(d));
  return `${day}, ${timeFmt.format(d)}`;
}
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
function groupLabel(iso) {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days <= 0) return 'I dag';
  if (days === 1) return 'I går';
  if (days < 7) return 'Siste 7 dager';
  return cap(monthFmt.format(d));
}
function niceDay(iso) {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  const day = days <= 0 ? 'I dag' : days === 1 ? 'I går' : cap(dayFmt.format(d));
  return `${day} kl. ${timeFmt.format(d)}`;
}

function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* ignorer */ }
}

function applyTheme() {
  const t = getSettings().theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ---------- Analyse av lagret tur (med mellomlagring) ---------- */
function currentSensitivity() {
  const s = getSettings();
  return SENSITIVITY[s.sensitivity] || SENSITIVITY.normal;
}

function analysisOptions() {
  const s = getSettings();
  return {
    factor: currentSensitivity().factor,
    engine: s.engine === 'v1' ? 'v1' : 'v3',
    perKm: s.perKm !== false,
    cityAware: s.cityAware !== false,
    th: s.th && typeof s.th === 'object' ? s.th : undefined
  };
}

async function analyzeDrive(drive) {
  const opts = analysisOptions();
  const key = `${opts.factor}|${opts.engine}|${opts.perKm}|${opts.cityAware}|${opts.th ? JSON.stringify(opts.th) : '-'}|10`;
  if (drive.result && drive.resultKey === key) return drive.result;
  const { getRaw } = await import('./db.js');
  const raw = await getRaw(drive.id);
  let result;
  try {
    result = analyze(raw, opts);
  } catch (err) {
    drive.result = null; drive.error = err.message; drive.resultKey = key;
    await putDrive(drive);
    throw err;
  }
  drive.result = result; drive.error = null; drive.resultKey = key;
  await putDrive(drive);
  return result;
}

const isReal = d => !d.demo && !d.imported;
const num = v => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));

/* ---------- Hjem ---------- */
async function renderHome() {
  show('home');
  const settings = getSettings();
  const list = $('#drive-list');
  if (!list.children.length || list.querySelector('.empty')) list.innerHTML = '<li class="skeleton-row"></li><li class="skeleton-row"></li><li class="skeleton-row"></li>';
  $('#start-hello').textContent = settings.activeDriver ? `Hei, ${settings.activeDriver}!` : 'Klar for en tur?';
  const allDrives = await listDrives();
  for (const d of allDrives) if (d.status === 'recording') { d.status = 'done'; d.interrupted = true; await putDrive(d); }

  // Førerfilter
  const driverNames = [...new Set([...(settings.drivers || []), ...allDrives.map(d => d.driver).filter(Boolean)])];
  let filter = settings.homeDriver || '';
  if (filter && !driverNames.includes(filter)) filter = '';
  const chips = $('#driver-chips');
  if (driverNames.length) {
    chips.innerHTML = ['', ...driverNames].map(n => `<button type="button" class="chip ${n === filter ? 'on' : ''}" data-d="${esc(n)}" aria-pressed="${n === filter}">${n ? esc(n) : 'Alle'}</button>`).join('');
    chips.hidden = false;
    chips.querySelectorAll('.chip').forEach(c => c.onclick = () => { saveSettings({ ...getSettings(), homeDriver: c.dataset.d }); renderHome(); });
  } else chips.hidden = true;
  const drives = filter ? allDrives.filter(d => d.driver === filter) : allDrives;

  const rows = [];
  const results = [];     // bare ekte opptak – demo og importerte turer holdes utenfor oppsummering og trend
  let best = null, lastReal = null, prevReal = null;
  for (const d of drives) {
    let res = null;
    try { res = await analyzeDrive(d); } catch { /* for lite data */ }
    if (res && isReal(d)) {
      results.push(res);
      if (!best || res.overall > best.overall) best = res;
      if (!lastReal) lastReal = { d, res };
      else if (!prevReal && (d.driver || '') === (lastReal.d.driver || '')) prevReal = { d, res };
    }
    rows.push({ d, res });
  }

  // Liste gruppert etter tid
  let html = '', lastGroup = '';
  for (const { d, res } of rows) {
    const g = groupLabel(d.startedAt);
    if (g !== lastGroup) { html += `<li class="group-head">${esc(g)}</li>`; lastGroup = g; }
    const tags = [d.driver && !filter ? d.driver : '', d.demo ? 'demo' : '', d.imported ? 'importert' : '', d.interrupted ? 'avbrutt' : ''].filter(Boolean);
    const meta = res ? [km(res.stats.km), duration(res.stats.duration)] : ['For lite data'];
    html += `<li>
      <button type="button" class="drive" data-id="${d.id}">
        ${routeThumb(res ? res.points : null)}
        <span class="drive-main"><strong>${esc(shortDay(d.startedAt))}</strong>
          <span class="muted small">${meta.map(esc).join(SEP)}</span>
          ${tags.length ? `<span class="tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
          ${d.note ? `<span class="muted small note-snippet">${esc(d.note)}</span>` : ''}</span>
        ${res ? scoreBadge(res.overall, 44) : '<span class="score muted">–</span>'}
      </button>
    </li>`;
  }
  list.innerHTML = rows.length ? html : `<li class="empty"><span class="empty-ico">${icon('wheel', 40)}</span><strong>${filter ? `Ingen turer for ${esc(filter)} enda` : 'Ingen turer enda'}</strong><span class="muted small">Første rapport kommer når dere har kjørt en tur.</span></li>`;
  list.querySelectorAll('.drive').forEach(b => b.addEventListener('click', () => { location.hash = '#/rapport/' + b.dataset.id; }));
  $('#drive-section').hidden = false;

  // Siste tur
  const lastCard = $('#last-drive');
  if (lastReal) {
    const r = lastReal.res;
    const diff = prevReal ? r.overall - prevReal.res.overall : null;
    const tip = r.tips && r.tips[0] ? r.tips[0].text : '';
    lastCard.innerHTML = `<button type="button" class="card last-card" data-id="${lastReal.d.id}">
      <span class="last-head"><span class="eyebrow">Siste tur</span><span class="muted small">${esc(shortDay(lastReal.d.startedAt))}</span></span>
      <span class="last-body">${scoreBadge(r.overall, 76)}
        <span class="last-text"><strong>${esc(ratingShort(r.overall))}</strong>
          <span class="muted">${[km(r.stats.km), duration(r.stats.duration), `${r.events.length} ${r.events.length === 1 ? 'hendelse' : 'hendelser'}`].join(SEP)}</span>
          ${diff !== null ? `<span class="delta-pill ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '▲ ' + diff : diff < 0 ? '▼ ' + -diff : '='} fra forrige</span>` : ''}</span></span>
      ${tip ? `<span class="last-tip">${icon('info', 18)}<span>${esc(tip)}</span></span>` : ''}
      <span class="last-cta">Se rapporten ${icon('chev', 18)}</span>
    </button>`;
    lastCard.hidden = false;
    lastCard.querySelector('button').onclick = () => { location.hash = '#/rapport/' + lastReal.d.id; };
  } else lastCard.hidden = true;

  // Oppsummering (2×2)
  const sum = $('#summary');
  if (results.length) {
    const totalKm = results.reduce((s, r) => s + r.stats.km, 0);
    const avg = results.reduce((s, r) => s + r.overall, 0) / results.length;
    const ev10 = totalKm > 0.2 ? results.reduce((s, r) => s + r.events.length, 0) / totalKm * 10 : 0;
    sum.innerHTML = `
      <div class="tile"><span class="tile-val">${results.length}</span><span class="tile-label">${results.length === 1 ? 'tur' : 'turer'}</span></div>
      <div class="tile"><span class="tile-val">${km(totalKm)}</span><span class="tile-label">kjørt</span></div>
      <div class="tile"><span class="tile-val">${n0(avg)}</span><span class="tile-label">snittpoeng · beste ${best.overall}</span></div>
      <div class="tile"><span class="tile-val">${n1(ev10)}</span><span class="tile-label">hendelser per 10 km</span></div>`;
    sum.hidden = false;
  } else sum.hidden = true;

  // Kjørelogg (kort)
  const logCard = $('#log-card');
  const realRows = rows.filter(x => x.res && isReal(x.d));
  if (realRows.length) {
    const tot = sumLogs(realRows.map(x => logFor(x.d, x.res)));
    logCard.innerHTML = `<button type="button" class="card log-card-btn">
      <span class="card-title">${icon('book')}Kjørelogg</span>
      <span class="log-row"><span><strong>${fmtHours(tot.total.sec)}</strong><span class="muted small">øvelseskjøring</span></span>
        <span><strong>${km(tot.total.km)}</strong><span class="muted small">kjørt</span></span>
        <span><strong>${fmtHours(tot.light.dark)}</strong><span class="muted small">i mørke</span></span></span>
      <span class="last-cta">Se loggen ${icon('chev', 18)}</span></button>`;
    logCard.querySelector('button').onclick = () => { location.hash = '#/logg'; };
    logCard.hidden = false;
  } else logCard.hidden = true;

  // Mål: snitt av de tre siste ekte turene, med fremdriftsstolpe
  const goalCard = $('#goals');
  const gScore = num(settings.goalScore), gEv = num(settings.goalEv10);
  if (results.length && (Number.isFinite(gScore) || Number.isFinite(gEv))) {
    const last = results.slice(0, 3);
    const lastKm = last.reduce((s, r) => s + r.stats.km, 0);
    const avgScore = last.reduce((s, r) => s + r.overall, 0) / last.length;
    const ev10 = lastKm > 0.2 ? last.reduce((s, r) => s + r.events.length, 0) / lastKm * 10 : 0;
    const row = (label, ok, pct, txt) => `<li class="${ok ? 'goal-ok' : 'goal-no'}">
      <span class="goal-top"><strong>${label}</strong><span class="goal-state">${ok ? icon('check', 18) + 'Nådd' : txt}</span></span>
      <span class="goal-bar"><span style="width:${Math.max(4, Math.min(100, pct))}%"></span></span></li>`;
    goalCard.innerHTML = `<h2 class="card-title">${icon('target')}Mål</h2><p class="muted small">Snitt av ${last.length === 1 ? 'siste tur' : `de ${last.length} siste turene`}${filter ? ` for ${esc(filter)}` : ''}.</p><ul class="goal-list">
      ${Number.isFinite(gScore) ? row(`Poengsum minst ${n0(gScore)}`, avgScore >= gScore, avgScore / gScore * 100, `${n0(avgScore)} nå`) : ''}
      ${Number.isFinite(gEv) ? row(`Høyst ${n1(gEv)} hendelser per 10 km`, ev10 <= gEv, ev10 <= gEv ? 100 : gEv / Math.max(ev10, 0.01) * 100, `${n1(ev10)} nå`) : ''}
    </ul>`;
    goalCard.hidden = false;
  } else goalCard.hidden = true;

  // Trend: samlet eller per kategori
  const chrono = results.slice().reverse();
  const mode = settings.trendMode === 'cats' ? 'cats' : 'total';
  $('#trend').innerHTML = chrono.length >= 2 ? `<div class="trend-head"><h2 class="card-title">${icon('chart')}Utvikling</h2>
      <div class="mini-seg" role="group" aria-label="Vis">
        <button type="button" data-m="total" class="${mode === 'total' ? 'on' : ''}" aria-pressed="${mode === 'total'}">Samlet</button>
        <button type="button" data-m="cats" class="${mode === 'cats' ? 'on' : ''}" aria-pressed="${mode === 'cats'}">Kategorier</button>
      </div></div>
      ${mode === 'cats' ? categoryTrendChart(chrono) : trendChart(chrono.map(r => r.overall), Number.isFinite(gScore) ? gScore : null)}` : '';
  $('#trend').querySelectorAll('.mini-seg button').forEach(b => b.onclick = () => { saveSettings({ ...getSettings(), trendMode: b.dataset.m }); renderHome(); });
  $('#howto').hidden = allDrives.length > 0;

  // Dagens forslag i startkortet
  const sugRows = await gatherRows(settings.activeDriver || '');
  const sug = suggestFocus(sugRows);
  const sl = $('#suggest-line');
  if (sug.length) { sl.textContent = `Forslag i dag: ${sug.map(x => (FOCUS.find(f => f.id === x.id) || {}).label).join(', ').toLowerCase()}`; sl.hidden = false; } else sl.hidden = true;

  // Påminnelse om sikkerhetskopi
  const bb = $('#backup-banner');
  const realCount = allDrives.filter(isReal).length;
  const lastB = settings.lastBackupAt ? Date.parse(settings.lastBackupAt) : 0;
  const newSince = allDrives.filter(d => isReal(d) && Date.parse(d.startedAt) > lastB).length;
  const snoozed = settings.backupSnoozeUntil && Date.parse(settings.backupSnoozeUntil) > Date.now();
  if (realCount >= 2 && newSince >= 2 && Date.now() - lastB > 7 * 86400000 && !snoozed) {
    bb.innerHTML = `<span>${icon('shield', 20)}<span>${newSince} turer er ikke sikkerhetskopiert.</span></span><span class="banner-actions"><button type="button" class="link" id="btn-bb-later">Senere</button><button type="button" class="btn small-btn primary" id="btn-bb-now">Ta kopi</button></span>`;
    bb.hidden = false;
    $('#btn-bb-now').onclick = async () => { await backupAll(await listDrives()); bb.hidden = true; };
    $('#btn-bb-later').onclick = () => { saveSettings({ ...getSettings(), backupSnoozeUntil: new Date(Date.now() + 7 * 86400000).toISOString() }); bb.hidden = true; };
  } else bb.hidden = true;

  // Faresteder og opplæring
  const more = $('#more-cards');
  if (sugRows.length || realCount) {
    const allRows = filter ? sugRows : await gatherRows(null);
    const spots = hotspots(allRows.map(x => ({ id: x.d.id, points: x.res.points, items: hotspotItems(x) })));
    const plan = planProgress(allRows);
    more.innerHTML = `<button type="button" class="card mini-card" id="btn-go-spots"><span class="card-title">${icon('pin')}Faresteder</span><strong>${spots.length}</strong><span class="muted small">${spots.length === 1 ? 'sted' : 'steder'} med flere hendelser</span></button>
      <button type="button" class="card mini-card" id="btn-go-plan"><span class="card-title">${icon('school')}Opplæring</span><strong>${plan.done} av ${plan.total}</strong><span class="muted small">punkter krysset av</span></button>`;
    more.hidden = false;
    $('#btn-go-spots').onclick = () => { location.hash = '#/faresteder'; };
    $('#btn-go-plan').onclick = () => { location.hash = '#/opplaering'; };
  } else more.hidden = true;
  $('#update-banner').hidden = !swUpdateReady;
  renderInstallHint();
}

function logFor(d, res) {
  const limits = d.enrich && Array.isArray(d.enrich.limits) && d.enrich.limits.length === res.points.length ? d.enrich.limits.map(v => (v === null ? NaN : v)) : null;
  return driveLog(res, Date.parse(d.startedAt), limits);
}
function fmtHours(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} t ${String(m % 60).padStart(2, '0')} min`;
}

/* Ekte turer med analyse, logg, fartsgrenser, veidata og merker – grunnlag for innsikt. Nyeste først. */
async function gatherRows(driver = null) {
  const drives = (await listDrives()).filter(d => isReal(d) && (driver === null || (d.driver || '') === driver));
  const rows = [];
  for (const d of drives) {
    let res;
    try { res = await analyzeDrive(d); } catch { continue; }
    const sp = speedingFor(res, d.enrich || null);
    const road = d.enrich && d.enrich.road ? { ...evaluateRoad(res.points, d.enrich.road, res.events), fromNvdb: true } : null;
    rows.push({ d, res, sp, road, log: logFor(d, res), marks: markRows(d.marks || [], res) });
  }
  return rows;
}

/* ---------- Kjørelogg ---------- */
async function renderLog() {
  show('log');
  const root = $('#log-root');
  root.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div>';
  const settings = getSettings();
  const filter = settings.homeDriver || '';
  const drives = (await listDrives()).filter(d => isReal(d) && (!filter || d.driver === filter));
  const rows = [];
  for (const d of drives) { try { const res = await analyzeDrive(d); rows.push({ d, res, log: logFor(d, res) }); } catch { /* for lite data */ } }
  if (!rows.length) { root.innerHTML = `<div class="empty card"><span class="empty-ico">${icon('book', 40)}</span><strong>Ingen turer i loggen enda</strong><span class="muted small">Ekte opptak legges inn her automatisk.</span></div>`; return; }
  const tot = sumLogs(rows.map(x => x.log));
  const bar = (obj, keys, labels, cls) => {
    const sum = keys.reduce((s, k) => s + obj[k], 0) || 1;
    return `<div class="road-mix">${keys.filter(k => obj[k] > 0).map(k => `<span class="${cls}-${k}" style="width:${(obj[k] / sum * 100).toFixed(1)}%"></span>`).join('')}</div>
      <ul class="legend">${keys.map(k => `<li><span class="dot mix-dot ${cls}-${k}"></span>${labels[k]}: ${fmtHours(obj[k])}</li>`).join('')}</ul>`;
  };
  // Uker (siste 8)
  // Uker regnes på kalenderdato (ikke millisekunder), så overgang til sommer-/vintertid ikke forskyver dem
  const weekStart = d => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - day); return x; };
  const key = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const thisWeek = weekStart(Date.now());
  const weeks = Array.from({ length: 8 }, (_, i) => { const w = new Date(thisWeek); w.setDate(w.getDate() - (7 - i) * 7); return { start: w.getTime(), key: key(w), sec: 0 }; });
  for (const x of rows) { const w = weeks.find(w => w.key === key(weekStart(Date.parse(x.d.startedAt)))); if (w) w.sec += x.log.total.sec; }
  const maxW = Math.max(...weeks.map(w => w.sec), 1);
  const wkFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
  root.innerHTML = `
    ${filter ? `<p class="eyebrow pad">Fører: ${esc(filter)}</p>` : ''}
    <section class="tiles">
      <div class="tile"><span class="tile-val">${fmtHours(tot.total.sec)}</span><span class="tile-label">kjøretid</span></div>
      <div class="tile"><span class="tile-val">${km(tot.total.km)}</span><span class="tile-label">kjørt</span></div>
      <div class="tile"><span class="tile-val">${rows.length}</span><span class="tile-label">${rows.length === 1 ? 'tur' : 'turer'}</span></div>
      <div class="tile"><span class="tile-val">${fmtHours(tot.light.dark)}</span><span class="tile-label">i mørke</span></div>
    </section>
    <section class="card"><h2 class="card-title">${icon('map')}Veityper</h2>${bar(tot.sec, ['by', 'land', 'motor'], ROAD_LABEL, 'mix')}
      <p class="muted small">Ut fra fartsgrensen når Veidata er på, ellers anslått ut fra farten.</p></section>
    <section class="card"><h2 class="card-title">${icon('moon')}Lysforhold</h2>${bar(tot.light, ['day', 'twilight', 'dark'], LIGHT_LABEL, 'light')}
      <p class="muted small">Regnet ut fra solhøyden der og da. Mørke er når sola står mer enn 6° under horisonten.</p></section>
    <section class="card"><h2 class="card-title">${icon('chart')}Siste åtte uker</h2>
      <div class="week-bars" role="img" aria-label="Kjøretid per uke">${weeks.map(w => `<div class="wk"><span class="wk-val">${w.sec ? Math.round(w.sec / 60) : ''}</span><span class="wk-bar" style="height:${Math.max(2, w.sec / maxW * 100)}%"></span><span class="wk-lbl">${wkFmt.format(new Date(w.start))}</span></div>`).join('')}</div>
      <p class="muted small">Minutter per uke, fra mandag.</p></section>
    <h2 class="section-title">Alle turer</h2>
    <ul class="drives log-list card">${rows.map(x => `<li><button type="button" class="drive" data-id="${x.d.id}">
      <span class="drive-main"><strong>${esc(shortDay(x.d.startedAt))}</strong>
      <span class="muted small">${[fmtHours(x.log.total.sec), km(x.log.total.km), x.log.light.dark > 60 ? `${fmtHours(x.log.light.dark)} mørke` : ''].filter(Boolean).join(SEP)}</span>
      ${x.d.driver && !filter ? `<span class="tags"><span class="tag">${esc(x.d.driver)}</span></span>` : ''}</span>
      ${scoreBadge(x.res.overall, 40)}</button></li>`).join('')}</ul>
    <button type="button" class="btn secondary" id="btn-log-csv2">${icon('download', 20)}Eksporter loggen (regneark)</button>`;
  root.querySelectorAll('.drive').forEach(b => b.onclick = () => { location.hash = '#/rapport/' + b.dataset.id; });
  const csv = () => exportLogCsv(rows, filter);
  $('#btn-log-csv').onclick = csv;
  root.querySelector('#btn-log-csv2').onclick = csv;
}

async function exportLogCsv(rows, filter) {
  const dec = v => String(Math.round(v * 10) / 10).replace('.', ',');
  const min = v => String(Math.round(v / 60));
  const head = ['Dato', 'Klokkeslett', 'Fører', 'Minutter', 'Km', 'By (min)', 'Landevei (min)', 'Motorvei (min)', 'Mørke (min)', 'Skumring (min)', 'Poeng', 'Hendelser', 'Notat'];
  const lines = [head.join(';')];
  for (const x of rows.slice().reverse()) {
    const d = new Date(x.d.startedAt);
    const cell = v => `"${String(v).replace(/"/g, '""')}"`;
    lines.push([d.toLocaleDateString('nb-NO'), d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }), cell(x.d.driver || ''), min(x.log.total.sec), dec(x.log.total.km),
      min(x.log.sec.by), min(x.log.sec.land), min(x.log.sec.motor), min(x.log.light.dark), min(x.log.light.twilight), x.res.overall, x.res.events.length, cell(x.d.note || '')].join(';'));
  }
  const name = `kjorelogg${filter ? '-' + filter.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-') : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
  const file = new File(['\ufeff' + lines.join('\r\n')], name, { type: 'text/csv' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Kjørelogg' }); return; } catch { /* avbrutt */ } }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Loggen er lastet ned.', { type: 'ok' });
}

function hotspotItems(x) {
  const items = x.res.events.map(e => ({ lat: e.lat, lon: e.lon, type: 'event', kind: e.kind, label: eventLabel(e), t: e.t, name: x.d.enrich && x.d.enrich.names && x.d.enrich.names.events ? x.d.enrich.names.events[e.n] : '' }));
  for (const m of x.marks) if (Number.isFinite(m.lat) && m.cat !== 'felt') items.push({ lat: m.lat, lon: m.lon, type: 'mark', kind: 'mark', label: `Ledsager: ${MARK_CATS[m.cat].label.toLowerCase()}`, t: m.t, name: x.d.enrich && x.d.enrich.names && x.d.enrich.names.marks ? x.d.enrich.names.marks[m.i] : '' });
  return items;
}

let spotsMap = null;
async function renderSpots() {
  show('spots');
  const root = $('#spots-root');
  root.innerHTML = '<div class="skeleton-row"></div>';
  const filter = getSettings().homeDriver || '';
  const rows = await gatherRows(filter || null);
  const spots = hotspots(rows.map(x => ({ id: x.d.id, points: x.res.points, items: hotspotItems(x) })));
  if (spotsMap) { spotsMap.remove(); spotsMap = null; }
  const KIND = { brake: 'Bremsing', accel: 'Akselerasjon', turn: 'Sving', mark: 'Ledsagerens merker' };
  root.innerHTML = `
    <p class="muted pad">Steder der det har vært flere hendelser eller merker fra ledsageren${filter ? ` for ${esc(filter)}` : ''}, samlet fra ${rows.length} ${rows.length === 1 ? 'tur' : 'turer'}.</p>
    ${window.L && getSettings().netMap !== false && rows.length ? '<div class="card"><div id="spots-map" class="lmap"></div></div>' : ''}
    ${spots.length ? `<ul class="drives spot-list card">${spots.map((h, i) => `<li><button type="button" class="drive spot" data-i="${i}">
        <span class="spot-n spot-${h.main}">${h.count}</span>
        <span class="drive-main"><strong>${esc(h.items.find(it => it.name)?.name || `Sted ${i + 1}`)}</strong>
          <span class="muted small">${h.drives > 1 ? `På ${h.drives} av ${h.passes} turer som passerte` : 'Samme tur'} · ${esc(KIND[h.main] || '')}</span>
          <span class="muted small">${esc([...new Set(h.items.map(it => it.label))].join(', '))}</span></span>
        ${icon('chev', 18)}</button></li>`).join('')}</ul>`
      : `<div class="empty card"><span class="empty-ico">${icon('pin', 40)}</span><strong>Ingen faresteder ennå</strong><span class="muted small">Når samme sted får flere hendelser eller merker, dukker det opp her. Det blir mer nyttig jo flere turer dere kjører.</span></div>`}`;
  if (root.querySelector('#spots-map')) {
    const L = window.L;
    const map = L.map('spots-map', { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false });
    spotsMap = map;
    L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png', { maxZoom: 18, attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>' }).addTo(map);
    const all = [];
    for (const x of rows) { const ll = x.res.points.map(p => [p.lat, p.lon]); all.push(...ll); L.polyline(ll, { className: 'spots-route', weight: 4, interactive: false }).addTo(map); }
    spots.forEach((h, i) => {
      const r = 10 + Math.min(16, h.count * 3);
      L.circleMarker([h.lat, h.lon], { radius: r, className: `spot-circle spot-${h.main}`, weight: 3 }).addTo(map).on('click', () => { root.querySelector(`.spot[data-i="${i}"]`)?.scrollIntoView({ block: 'center' }); });
    });
    if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
    root.querySelectorAll('.spot').forEach(b => b.onclick = () => { const h = spots[Number(b.dataset.i)]; map.setView([h.lat, h.lon], 17); root.querySelector('#spots-map').scrollIntoView({ block: 'center' }); });
    setTimeout(() => { if (spotsMap === map) map.invalidateSize(); }, 150);
  } else root.querySelectorAll('.spot').forEach(b => b.onclick = () => {});
}

function planState() {
  const s = getSettings();
  const key = s.activeDriver || '_';
  return { key, all: s.curriculum || {}, mine: (s.curriculum || {})[key] || {} };
}
function planProgress() {
  const { mine } = planState();
  const total = CURRICULUM.reduce((n, st) => n + st.items.length, 0);
  const done = Object.values(mine).filter(v => v && v.done).length;
  return { done, total };
}
async function renderPlan() {
  show('plan');
  const root = $('#plan-root');
  const s = getSettings();
  const driver = s.activeDriver || '';
  const rows = await gatherRows(driver);
  const ev = curriculumEvidence(rows);
  const { key, mine } = planState();
  const prog = planProgress();
  const dfmt = iso => new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  root.innerHTML = `
    <section class="card plan-head">
      <p class="eyebrow">${driver ? esc(driver) : 'Fører ikke valgt'}</p>
      <p class="plan-prog"><strong>${prog.done}</strong> av ${prog.total} punkter krysset av</p>
      <span class="goal-bar"><span style="width:${(prog.done / prog.total * 100).toFixed(0)}%"></span></span>
      <p class="muted small">Basert på hovedtrekkene i læreplanen for førerkort klasse B. Trafikkskolen avgjør hva som er gjennomført. Grå tekst viser hva appen har sett på turene.</p>
    </section>
    ${CURRICULUM.map(st => `<h2 class="group-title">${esc(st.stage)}</h2><section class="card"><ul class="plan-list">${st.items.map(it => {
      const e = it.auto ? ev[it.auto] : null;
      const st2 = mine[it.id] || {};
      return `<li><label class="plan-item"><input type="checkbox" data-id="${it.id}" ${st2.done ? 'checked' : ''}>
        <span><strong>${esc(it.label)}</strong>${st2.done && st2.at ? ` <span class="muted small">· ${dfmt(st2.at)}</span>` : ''}
        ${it.help ? `<span class="muted small">${esc(it.help)}</span>` : ''}
        ${it.auto ? `<span class="plan-ev ${e && e.good ? 'good' : ''}">${e ? esc(e.text) : 'Ikke øvd på turene ennå'}</span>` : ''}</span></label></li>`;
    }).join('')}</ul></section>`).join('')}`;
  root.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => {
    const cur = getSettings();
    const allC = { ...(cur.curriculum || {}) };
    const m = { ...(allC[key] || {}) };
    m[cb.dataset.id] = cb.checked ? { done: true, at: new Date().toISOString() } : { done: false };
    allC[key] = m;
    saveSettings({ ...cur, curriculum: allC });
    if (cb.checked) vibrate(20);
    renderPlan();
  });
}

function ratingShort(score) {
  if (score >= 90) return 'Rolig og trygg kjøring';
  if (score >= 75) return 'Bra, noen ting å jobbe med';
  if (score >= 55) return 'Ujevn kjøring';
  return 'Mye brå kjøring';
}

function renderInstallHint() {
  const el = $('#install-hint');
  const s = getSettings();
  if (isStandalone() || s.hideInstallHint) { el.hidden = true; return; }
  if (installPrompt) {
    el.innerHTML = `<p><strong>Installer appen</strong> så den får eget ikon og virker uten nett.</p>
      <button type="button" class="btn secondary" id="btn-install">Installer Kjørerapport</button>
      <button type="button" class="link" id="btn-hide-install">Ikke nå</button>`;
    $('#btn-install').onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; el.hidden = true; };
  } else if (isIOS()) {
    el.innerHTML = `<p><strong>Legg til på Hjem-skjerm</strong> for eget ikon og bruk uten nett: trykk Del-knappen <span class="share-glyph" aria-hidden="true">⎙</span> nederst i Safari, og velg «Legg til på Hjem-skjerm».</p>
      <p class="small"><strong>Viktig:</strong> Safari kan slette lagrede turer etter 7 dager uten bruk hvis appen ikke ligger på Hjem-skjermen. Ta en sikkerhetskopi i Innstillinger.</p>
      <button type="button" class="link" id="btn-hide-install">Skjul dette</button>`;
  } else { el.hidden = true; return; }
  el.hidden = false;
  $('#btn-hide-install').onclick = () => { saveSettings({ ...getSettings(), hideInstallHint: true }); el.hidden = true; };
}

/* ---------- Før kjøring ---------- */
function renderPrecheck() {
  show('precheck');
  const btnPerm = $('#btn-permissions');
  const btnStart = $('#btn-start-record');
  const btnAnyway = $('#btn-start-anyway');
  const gps = $('#check-gps'), mot = $('#check-motion');
  btnStart.disabled = true;
  btnStart.textContent = 'Venter på tilgang';
  btnAnyway.hidden = true;
  btnPerm.hidden = false;
  btnPerm.disabled = false;
  btnPerm.textContent = 'Gi tilgang';
  $('#step-perm').dataset.state = 'active';
  $('#step-check').dataset.state = 'todo';
  $('#perm-text').textContent = 'Appen trenger posisjon og bevegelse. Alt lagres bare på telefonen.';
  setCheck(gps, null, 'Venter på tilgang');
  setCheck(mot, null, 'Venter på tilgang');
  const hold = $('#check-holder');
  setCheck(hold, null, 'Venter på bevegelsesdata');
  renderDriverPicker();
  renderFocusChips();
  renderFocusSuggestions();
  $('#precheck-error').textContent = '';
  if (stopPrecheck) { stopPrecheck(); stopPrecheck = null; }

  btnPerm.onclick = async () => {
    btnPerm.disabled = true;
    btnPerm.textContent = 'Venter på svar …';
    const motion = await requestMotionPermission();
    if (motion === 'denied') setCheck(mot, false, 'Tilgang avslått. Slå på «Bevegelse og retning» i Safari-innstillingene.');
    else if (motion === 'unsupported') setCheck(mot, false, 'Ingen bevegelsessensorer på denne enheten');
    else setCheck(mot, null, 'Venter på data …');
    try {
      await requestLocationOnce();
      setCheck(gps, null, 'Venter på god nok nøyaktighet …');
    } catch (err) {
      setCheck(gps, false, err.code === 1 ? 'Posisjonstilgang avslått. Tillat posisjon for denne appen i Innstillinger.' : 'Fikk ikke posisjon. Gå ut i friluft og prøv igjen.');
    }
    btnPerm.hidden = true;
    $('#step-perm').dataset.state = 'done';
    $('#perm-text').textContent = 'Tilgang gitt.';
    $('#step-check').dataset.state = 'active';
    btnStart.textContent = 'Venter på GPS …';
    const since = performance.now();
    stopPrecheck = startPrecheck(st => {
      const waited = (performance.now() - since) / 1000;
      if (st.gpsError) setCheck(gps, false, st.gpsError.code === 1 ? 'Posisjonstilgang avslått' : 'Ingen GPS-signal');
      else if (Number.isFinite(st.acc)) setCheck(gps, st.gpsOk, `${n0(st.acc)} m nøyaktighet${st.gpsOk ? '' : ' (må være 20 m eller bedre' + (waited > 10 ? ' – blir ofte bedre når bilen står ute og står stille)' : ')')}`);
      if (motion !== 'denied' && motion !== 'unsupported') setCheck(mot, st.motionOk, st.motionOk ? 'Bevegelsesdata mottas' : 'Ingen bevegelsesdata enda – beveg telefonen litt');
      if (st.steady === null) setCheck(hold, null, 'Venter på bevegelsesdata');
      else setCheck(hold, st.steady, st.steady ? 'Telefonen står stødig' : 'Telefonen beveger seg – fest den i holderen og slipp den');
      btnStart.disabled = !(st.gpsOk && st.motionOk);
      btnStart.textContent = !btnStart.disabled ? 'Start opptak'
        : !st.motionOk ? 'Venter på bevegelsesdata …'
        : Number.isFinite(st.acc) ? `Venter på GPS (${n0(st.acc)} m) …` : 'Venter på GPS …';
      $('#step-check').dataset.state = btnStart.disabled ? 'active' : 'done';
      if (!btnStart.disabled && !btnStart.dataset.buzzed) { vibrate(30); btnStart.dataset.buzzed = '1'; }
      // Nødutgang: etter 20 s venting med brukbar GPS (≤ 40 m) kan man starte likevel.
      const anyway = !st.gpsOk && st.motionOk && Number.isFinite(st.acc) && st.acc <= 40 && waited > 20;
      btnAnyway.hidden = !anyway;
      if (anyway) btnAnyway.textContent = `Start likevel (${n0(st.acc)} m nøyaktighet)`;
    });
  };
  delete btnStart.dataset.buzzed;
  btnStart.onclick = () => startRecording();
  btnAnyway.onclick = () => startRecording();
}

/* Dagens øvingsmål: opptil tre, huskes til neste tur. */
async function renderFocusSuggestions() {
  const el = $('#focus-suggest');
  const rows = await gatherRows(getSettings().activeDriver || '');
  const sug = suggestFocus(rows);
  if (!sug.length) { el.hidden = true; return; }
  const label = id => (FOCUS.find(f => f.id === id) || {}).label || id;
  el.innerHTML = `<p class="sug-title">${icon('target', 18)}Forslag ut fra de siste turene</p>
    <ul class="sug-list">${sug.map(x => `<li><strong>${esc(label(x.id))}</strong><span class="muted small">${esc(x.reason)}</span></li>`).join('')}</ul>
    <button type="button" class="btn secondary small-btn" id="btn-use-sug">Bruk forslagene</button>`;
  el.hidden = false;
  $('#btn-use-sug').onclick = () => { saveSettings({ ...getSettings(), focus: sug.map(x => x.id) }); renderFocusChips(); toast('Dagens mål er satt.', { type: 'ok', ms: 1800 }); };
}

function renderFocusChips() {
  const box = $('#focus-chips');
  const sel = new Set((getSettings().focus || []).filter(id => FOCUS.some(f => f.id === id)));
  box.innerHTML = FOCUS.map(f => `<button type="button" class="chip ${sel.has(f.id) ? 'on' : ''}" data-f="${f.id}" aria-pressed="${sel.has(f.id)}">${esc(f.label)}</button>`).join('');
  box.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    const cur = new Set(getSettings().focus || []);
    if (cur.has(c.dataset.f)) cur.delete(c.dataset.f);
    else { if (cur.size >= 3) { toast('Velg høyst tre mål per tur.', { ms: 2000 }); return; } cur.add(c.dataset.f); }
    saveSettings({ ...getSettings(), focus: [...cur] });
    renderFocusChips();
  });
}

/* Hvem kjører? Velges før start og lagres på turen. */
function renderDriverPicker() {
  const s = getSettings();
  const sel = $('#driver-select');
  const drivers = s.drivers || [];
  sel.innerHTML = `<option value="">Ikke valgt</option>${drivers.map(d => `<option value="${esc(d)}" ${d === s.activeDriver ? 'selected' : ''}>${esc(d)}</option>`).join('')}<option value="__new">Legg til fører …</option>`;
  sel.onchange = async () => {
    if (sel.value === '__new') {
      const name = ((await promptDialog({ title: 'Ny fører', placeholder: 'Navn', ok: 'Legg til', maxLength: 40 })) || '').trim().slice(0, 40);
      if (name) {
        const list = [...new Set([...(getSettings().drivers || []), name])];
        saveSettings({ ...getSettings(), drivers: list, activeDriver: name });
      }
      renderDriverPicker();
      renderFocusSuggestions();
      return;
    }
    saveSettings({ ...getSettings(), activeDriver: sel.value });
    renderFocusSuggestions();
  };
}

function setCheck(el, ok, text) {
  el.querySelector('.check-text').textContent = text;
  el.dataset.state = ok === null ? 'wait' : ok ? 'ok' : 'fail';
}

/* ---------- Opptak ---------- */
async function startRecording(replay = null) {
  if (stopPrecheck) { stopPrecheck(); stopPrecheck = null; }
  show('record');
  const settings = getSettings();
  const elapsed = $('#rec-elapsed'), dist = $('#rec-dist'), gps = $('#rec-gps'), warn = $('#rec-warn'), saved = $('#rec-saved'), markCount = $('#rec-marks');
  warn.innerHTML = '';
  saved.textContent = '';
  markCount.textContent = '';
  renderMarkGrid({});
  let gapMsg = '';
  recorder = new Recorder({
    sensitivity: settings.sensitivity,
    appVersion: APP_VERSION,
    driver: replay ? '' : (settings.activeDriver || ''),
    focus: replay ? [] : (settings.focus || []),
    replay,
    onStatus: st => {
      if (st.replayDone) { finishRecording(); return; }
      elapsed.textContent = fmtClock(st.elapsed);
      dist.textContent = km(st.distanceM / 1000);
      if (st.gpsError) { gps.textContent = 'GPS: ingen signal'; gps.dataset.state = 'fail'; }
      else if (st.warmup) { gps.textContent = 'GPS: venter på fersk posisjon …'; gps.dataset.state = 'wait'; }
      else if (!st.gpsFresh) { gps.textContent = 'GPS: venter …'; gps.dataset.state = 'wait'; }
      else { gps.textContent = `GPS: ${n0(st.acc)} m`; gps.dataset.state = st.acc <= 20 ? 'ok' : 'wait'; }
      saved.textContent = st.lastCheckpoint === null ? 'Lagrer første bit om litt' : `Sist lagret for ${n0(st.elapsed - st.lastCheckpoint)} s siden · ${st.locCount} GPS-punkter`;
      const pill = $('#rec-marks-pill');
      pill.hidden = !st.marks;
      const undoBtn = $('#btn-undo-mark'), lastMark = recorder && recorder.marks[recorder.marks.length - 1];
      undoBtn.hidden = !lastMark;
      if (lastMark) undoBtn.lastChild.textContent = `Angre «${MARK_CATS[lastMark.cat].label}» (${fmtClock(lastMark.t)})`;
      pill.textContent = st.marks ? `${st.marks} ${st.marks === 1 ? 'merke' : 'merker'}` : '';
      if (st.markCats) renderMarkCounts(st.markCats);
      if (st.returnedFromGap) gapMsg = `Appen var skjult i ${n0(st.returnedFromGap.to - st.returnedFromGap.from)} sekunder. Hullet er markert i dataene. Hold appen åpen under kjøring.`;
      const msgs = [];
      if (st.wakeLockFailed) msgs.push('Sett Autolås til Aldri mens du kjører.');
      if (gapMsg) msgs.push(gapMsg);
      warn.innerHTML = msgs.map(m => `<p class="notice">${esc(m)}</p>`).join('');
    }
  });
  try {
    await recorder.start();
    vibrate(80);
  } catch (err) {
    infoDialog({ title: 'Kunne ikke starte opptaket', text: err.message });
    location.hash = '#/';
  }
}

function renderMarkGrid() {
  const undo = $('#btn-undo-mark');
  undo.hidden = true;
  undo.onclick = () => {
    if (!recorder || !recorder.running) return;
    const m = recorder.undoMark();
    if (m) { vibrate(20); toast(`Fjernet merket «${MARK_CATS[m.cat].label}» fra ${fmtClock(m.t)}.`, { type: 'ok', ms: 2500 }); }
  };
  const grid = $('#mark-grid');
  grid.innerHTML = Object.entries(MARK_CATS).map(([k, c]) => `<button type="button" class="mark-btn" data-cat="${k}" aria-label="Merk: ${c.label}">${icon(c.icon, 26)}<span>${c.label}</span><span class="mark-n" aria-hidden="true"></span></button>`).join('');
  grid.querySelectorAll('.mark-btn').forEach(b => b.onclick = () => {
    if (!recorder || !recorder.running) return;
    const m = recorder.mark(b.dataset.cat);
    if (m) { vibrate(40); b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 450); }
  });
}
function renderMarkCounts(counts) {
  document.querySelectorAll('#mark-grid .mark-btn').forEach(b => { const n = counts[b.dataset.cat] || 0; b.querySelector('.mark-n').textContent = n ? n : ''; });
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
}

async function finishRecording() {
  if (!recorder || !recorder.running) return;
  const rec = recorder;
  recorder = null;
  vibrate([60, 60, 60]);
  $('#record').classList.add('busy');
  const drive = await rec.stop();
  $('#record').classList.remove('busy');
  if (getSettings().autoSpeak) speakNext = drive.id;
  location.hash = '#/rapport/' + drive.id;
}

/* Langt trykk (1 s) på Stopp */
function setupLongPress(btn, onDone) {
  let timer = null, startAt = 0, raf = null;
  const ring = btn.querySelector('.progress');
  const reset = () => {
    if (timer) clearTimeout(timer); timer = null;
    if (raf) cancelAnimationFrame(raf); raf = null;
    btn.classList.remove('pressing');
    ring.style.setProperty('--p', 0);
  };
  const tick = () => {
    const p = Math.min(1, (performance.now() - startAt) / 1000);
    ring.style.setProperty('--p', p);
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  const begin = () => { startAt = performance.now(); btn.classList.add('pressing'); tick(); timer = setTimeout(() => { reset(); onDone(); }, 1000); };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); begin(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, reset));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !timer) { e.preventDefault(); begin(); } });
  btn.addEventListener('keyup', reset);
}

/* ---------- Rapport ---------- */
/* Tilbakemelding på e-post. Brukeren ser og kan endre alt før det sendes. r: rapporten, hvis den gjelder en tur. */
const FEEDBACK_TO = 'Jo@svendsenmedia.net';
function feedbackHref(r = null, tag = '') {
  const ua = navigator.userAgent;
  const ios = ua.match(/OS (\d+)_(\d+)/);
  const device = /iPhone/.test(ua) ? 'iPhone' + (ios ? ` · iOS ${ios[1]}.${ios[2]}` : '') : /Android/.test(ua) ? 'Android' : 'datamaskin';
  const lines = ['Hei!', '', 'Hva stemte?', '', '', 'Hva stemte ikke? (for eksempel en hendelse som ikke skjedde, eller noe som ble oversett)', '', '',
    'Hva savner du?', '', '', 'Er du elev, ledsager eller trafikklærer?', '', '', '––––', `Kjørerapport ${APP_VERSION} · ${device}`];
  if (r) lines.push(`${tag ? tag + ': ' : 'Tur: '}${r.overall} poeng · ${r.stats.km.toFixed(1).replace('.', ',')} km · ${Math.round(r.stats.duration / 60)} min · ${r.events.length} hendelser · motor ${r.engine || 'v3'} · følsomhet ${currentSensitivity().label}`);
  return `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent('Tilbakemelding på Kjørerapport')}&body=${encodeURIComponent(lines.join('\n'))}`;
}

async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ title: 'Kjørerapport', text }); return; } catch { /* avbrutt */ }
  }
  try { await navigator.clipboard.writeText(text); toast('Oppsummeringen er kopiert. Lim den inn i en melding.', { type: 'ok' }); }
  catch { infoDialog({ title: 'Kunne ikke dele', text: 'Merk teksten i rapporten og kopier den manuelt.' }); }
}

async function renderDriveReport(id, { keepScroll = false } = {}) {
  const y = window.scrollY;
  if (!keepScroll) { show('report'); $('#report-root').innerHTML = '<p class="muted">Analyserer turen …</p>'; }
  const root = $('#report-root');
  const drive = await getDrive(id);
  if (!drive) { root.innerHTML = '<p class="notice">Fant ikke turen.</p>'; return; }
  const drives = await listDrives();
  const idx = drives.findIndex(d => d.id === id);
  let prev = null;
  // Sammenlign bare med forrige ekte opptak, og bare hvis denne turen selv er ekte.
  if (!drive.demo && !drive.imported) {
    for (let i = idx + 1; i < drives.length; i++) if (drives[i].result && isReal(drives[i]) && (drives[i].driver || '') === (drive.driver || '')) { prev = drives[i].result; break; }
  }
  const sens = currentSensitivity();
  const tags = [drive.demo ? 'demotur via opptakeren' : '', drive.imported ? 'importert' : ''].filter(Boolean);
  const routeRows = [];
  try {
    const r = await analyzeDrive(drive);
    const settings = getSettings();
    // Samme rute: andre ekte turer (samme fører) som har kjørt samme strekning
    if (isReal(drive)) {
      for (const d of drives) {
        if (!isReal(d) || !d.result || (d.driver || '') !== (drive.driver || '')) continue;
        if (d.id !== drive.id && !sameRoute(r.points, d.result.points)) continue;
        routeRows.push({ id: d.id, date: shortDay(d.startedAt), overall: d.id === drive.id ? r.overall : d.result.overall, events: (d.id === drive.id ? r : d.result).events.length, duration: (d.id === drive.id ? r : d.result).stats.duration, current: d.id === drive.id, ts: Date.parse(d.startedAt) });
      }
      routeRows.sort((a, b) => a.ts - b.ts);
    }
    const wants = { limits: !!settings.netLimits, names: !!settings.netNames };
    const missing = (wants.limits && !(drive.enrich && drive.enrich.limits)) || (wants.names && !(drive.enrich && drive.enrich.names));
    const draw = (status) => renderReport(root, r, {
      prevScore: prev ? prev.overall : null, prev,
      title: 'Kjørerapport', subtitle: date(drive.startedAt) + (drive.driver ? ' · ' + drive.driver : '') + (tags.length ? ' · ' + tags.join(', ') : ''),
      realMap: settings.netMap !== false,
      customThresholds: !!(settings.th),
      driver: drive.driver || '', drivers: settings.drivers || [],
      onDriverChange: async name => { await updateDrive(id, { driver: name }); renderDriveReport(id, { keepScroll: true }); },
      startedAt: drive.startedAt, focus: drive.focus || [],
      sameRoute: routeRows,
      onSpeak: text => { if (!speak(text)) toast('Telefonen støtter ikke opplesning.', { type: 'error' }); },
      feedbackHref: feedbackHref(r),
      gaps: drive.gaps || [], interrupted: !!drive.interrupted, factor: sens.factor, sensitivityLabel: sens.label,
      note: drive.note || '',
      marks: drive.marks || [],
      enrich: drive.enrich || null,
      diag: drive.diag || null,
      enrichStatus: status || null,
      canFetch: (wants.limits || wants.names) && missing && navigator.onLine,
      onFetch: () => runEnrich(true),
      onMarkNote: async (i, text) => { const d = await getDrive(id); if (d && d.marks && d.marks[i]) { d.marks[i].note = text; await putDrive(d); } },
      onNoteChange: async text => { await updateDrive(id, { note: text }); },
      onShare: shareText,
      onDelete: async () => { if (await confirmDialog({ title: 'Slette turen?', text: 'Turen og rådataene slettes fra telefonen. Dette kan ikke angres.', ok: 'Slett', danger: true })) { await deleteDrive(id); toast('Turen er slettet.', { type: 'ok' }); location.hash = '#/'; } }
    });
    let enriching = false;
    const runEnrich = async (manual) => {
      if (enriching || !missing || !navigator.onLine) return;
      const last = drive.enrich && drive.enrich.attemptedAt ? Date.parse(drive.enrich.attemptedAt) : 0;
      if (!manual && Date.now() - last < 3600000) return;   // ikke mas ved gjentatte feil
      enriching = true;
      const el0 = root.querySelector('#enrich-status');
      if (!el0) { const yy = window.scrollY; draw({ text: 'Starter …' }); window.scrollTo(0, yy); }
      const marksRows = (drive.marks || []).map((m, i) => { const t = m.t - (r.t0 || 0); const pt = r.points.length ? r.points.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a) : null; return { i, lat: pt ? pt.lat : NaN, lon: pt ? pt.lon : NaN }; });
      try {
        const enrich = await enrichDrive(r, marksRows, wants, drive.enrich, text => {
          const el = root.querySelector('#enrich-status'); if (el) el.textContent = text;
        });
        enrich.attemptedAt = new Date().toISOString(); enrich.error = null;
        drive.enrich = enrich;
        await putDrive(drive);
        if (location.hash === '#/rapport/' + id) await renderDriveReport(id, { keepScroll: true });
      } catch (err) {
        drive.enrich = { ...(drive.enrich || {}), attemptedAt: new Date().toISOString(), error: err.message };
        await putDrive(drive);
        enriching = false;
        const yy = window.scrollY;
        draw({ text: 'Kunne ikke hente: ' + err.message, error: true });
        window.scrollTo(0, yy);
      }
    };
    draw(null);
    if (keepScroll) window.scrollTo(0, y);
    if (speakNext === id) { speakNext = null; const b = document.getElementById('btn-speak'); if (b) setTimeout(() => b.click(), 600); }
    if (missing && navigator.onLine) runEnrich(false);
  } catch (err) {
    root.innerHTML = `<section class="card"><h2>Ikke nok data</h2><p>${esc(err.message)}</p>
      <p class="muted">Turen startet ${esc(date(drive.startedAt))}. Rådataene er lagret, så du kan slette turen eller beholde den.</p>
      <button type="button" class="btn danger" id="btn-del-drive">Slett denne turen</button></section>`;
    $('#btn-del-drive').onclick = async () => { if (await confirmDialog({ title: 'Slette turen?', ok: 'Slett', danger: true })) { await deleteDrive(id); toast('Turen er slettet.', { type: 'ok' }); location.hash = '#/'; } };
  }
}

async function renderDemoReport() {
  show('report');
  const root = $('#report-root');
  const sens = currentSensitivity();
  const opts = analysisOptions();
  const r = analyze(makeDemo(), opts);
  renderReport(root, r, {
    prevScore: null, prev: null,
    title: 'Demotur', subtitle: 'Simulert tur i Trondheim sentrum. Ikke lagret.',
    realMap: getSettings().netMap !== false, customThresholds: !!getSettings().th,
    factor: sens.factor, sensitivityLabel: sens.label, onShare: shareText,
    feedbackHref: feedbackHref(r, 'Demotur')
  });
}

/* ---------- Innstillinger ---------- */
async function renderSettings() {
  show('settings');
  const settings = getSettings();
  $('#btn-feedback').href = feedbackHref();
  document.querySelectorAll('input[name=sensitivity]').forEach(r => {
    r.checked = r.value === settings.sensitivity;
    r.onchange = () => { saveSettings({ ...getSettings(), sensitivity: r.value }); toast(`Følsomhet: ${r.parentElement.textContent.trim()}.`, { type: 'ok', ms: 2000 }); };
  });
  document.querySelectorAll('input[name=theme]').forEach(r => {
    r.checked = r.value === (settings.theme || 'auto');
    r.onchange = () => { saveSettings({ ...getSettings(), theme: r.value }); applyTheme(); };
  });
  document.querySelectorAll('input[name=engine]').forEach(r => {
    r.checked = r.value === (settings.engine === 'v1' ? 'v1' : 'v3');
    r.onchange = () => { saveSettings({ ...getSettings(), engine: r.value }); toast(`Analysemotor: ${r.value}.`, { type: 'ok', ms: 2000 }); };
  });
  ['netLimits', 'netNames'].forEach(key => {
    const el = $('#' + key);
    el.checked = !!settings[key];
    el.onchange = () => { saveSettings({ ...getSettings(), [key]: el.checked }); };
  });
  // Kart og by-tilpasset jevn fart er på som standard
  { const el = $('#autoSpeak'); el.checked = !!settings.autoSpeak; el.onchange = () => { saveSettings({ ...getSettings(), autoSpeak: el.checked }); if (el.checked) speak('Rapporten leses opp når turen er ferdig.'); }; }
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => {
    const mb = (e.usage || 0) / 1048576;
    $('#storage-status').textContent = `Turene og kartbitene bruker ${mb < 1 ? 'under 1' : n0(mb)} MB på telefonen.`;
  }).catch(() => {});
  $('#last-backup').textContent = settings.lastBackupAt ? `Siste sikkerhetskopi: ${date(settings.lastBackupAt)}.` : 'Ingen sikkerhetskopi tatt ennå.';
  [['netMap', '#netMap'], ['cityAware', '#cityAware']].forEach(([key, sel]) => {
    const el = $(sel);
    el.checked = settings[key] !== false;
    el.onchange = () => { saveSettings({ ...getSettings(), [key]: el.checked }); };
  });
  // Mål
  [['goalScore', '#goal-score'], ['goalEv10', '#goal-ev10']].forEach(([key, sel]) => {
    const el = $(sel);
    el.value = Number.isFinite(num(settings[key])) ? String(settings[key]).replace('.', ',') : '';
    el.onchange = () => { const v = num(el.value); saveSettings({ ...getSettings(), [key]: Number.isFinite(v) && v >= 0 ? v : null }); };
  });
  renderDriverSettings();
  renderThresholdSettings();
  { const el = $('#perKm'); el.checked = settings.perKm !== false; el.onchange = () => { saveSettings({ ...getSettings(), perKm: el.checked }); toast('Lagret. Turene analyseres på nytt.', { type: 'ok', ms: 2000 }); }; }
  const sel = $('#export-select');
  const drives = await listDrives();
  sel.innerHTML = drives.length ? drives.map(d => `<option value="${d.id}">${esc(date(d.startedAt))}${d.demo ? ' (demo)' : ''}${d.note ? ' – ' + esc(d.note.slice(0, 30)) : ''}</option>`).join('') : '<option value="">Ingen turer</option>';
  $('#btn-export').disabled = !drives.length;
  $('#btn-export').onclick = () => exportDrive(sel.value);
  $('#persist-status').textContent = persistState === true ? 'Varig lagring er på. Nettleseren skal ikke slette turene dine.'
    : persistState === false ? 'Varig lagring: nettleseren sa nei. Legg appen på Hjem-skjermen og ta sikkerhetskopi.'
    : 'Varig lagring: ukjent i denne nettleseren. Ta sikkerhetskopi jevnlig.';
  $('#btn-backup').disabled = !drives.length;
  $('#btn-backup').onclick = () => backupAll(drives);
  $('#restore-file').onchange = async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const list = Array.isArray(payload.drives) ? payload.drives : [payload];
      let added = 0, skipped = 0;
      for (const item of list) { const r = await importDrive(item, { keepId: true }); if (r && r.skipped) skipped++; else added++; }
      e.target.value = '';
      let restoredSettings = false;
      if (payload.settings && typeof payload.settings === 'object' && await confirmDialog({ title: 'Gjenopprette innstillingene også?', text: 'Førere, mål, følsomhet, terskler og andre valg fra sikkerhetskopien erstatter de du har nå.', ok: 'Ja, gjenopprett', cancel: 'Behold mine' })) {
        const cur = getSettings();
        saveSettings({ ...cur, ...payload.settings, lastBackupAt: cur.lastBackupAt });
        applyTheme();
        restoredSettings = true;
      }
      toast(`${added} ${added === 1 ? 'tur' : 'turer'} gjenopprettet${skipped ? `, ${skipped} fantes fra før` : ''}${restoredSettings ? ', og innstillingene' : ''}.`, { type: 'ok' });
      location.hash = '#/';
    } catch (err) {
      infoDialog({ title: 'Kunne ikke gjenopprette', text: err.message });
      e.target.value = '';
    }
  };
  $('#import-file').onchange = async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const d = await importDrive(payload);
      e.target.value = '';
      location.hash = '#/rapport/' + d.id;
    } catch (err) {
      infoDialog({ title: 'Kunne ikke importere', text: err.message });
      e.target.value = '';
    }
  };
  $('#btn-reanalyze').onclick = async () => {
    for (const d of drives) { d.result = null; await putDrive(d); }
    toast('Alle turer analyseres på nytt når de åpnes.', { type: 'ok' });
  };
  $('#btn-delete-all').onclick = async () => {
    if (await confirmDialog({ title: 'Slette alle turer?', text: 'Alle turer og rådata slettes fra telefonen. Ta en sikkerhetskopi først hvis du vil beholde dem.', ok: 'Slett alt', danger: true })) { await deleteAll(); toast('Alle turer er slettet.', { type: 'ok' }); location.hash = '#/'; }
  };
  // Skjult utvikleralternativ: trykk 7 ganger på versjonsnummeret
  let taps = 0, last = 0;
  $('#version').onclick = () => {
    const now = Date.now();
    taps = now - last < 1500 ? taps + 1 : 1; last = now;
    if (taps >= 7) { $('#dev-section').hidden = false; taps = 0; }
  };
  // Demoen spilles av med telefonen «montert» skrått, så akselerometerdata og v3-motoren også testes.
  $('#btn-dev-demo').onclick = () => startRecording({ data: makeDemo(7, { yaw: 0.7, pitch: 0.35 }), speed: 60 });
  $('#btn-dev-demo-slow').onclick = () => startRecording({ data: makeDemo(7, { yaw: 0.7, pitch: 0.35 }), speed: 10 });
}

function renderDriverSettings() {
  const s = getSettings();
  const list = $('#driver-list');
  const drivers = s.drivers || [];
  list.innerHTML = drivers.length ? drivers.map(d => `<li><span>${esc(d)}${d === s.activeDriver ? ' <span class="muted small">(valgt)</span>' : ''}</span>
    <button type="button" class="link danger-link" data-d="${esc(d)}" aria-label="Fjern ${esc(d)}">Fjern</button></li>`).join('') : '<li class="muted small">Ingen førere lagt inn. Turer lagres da uten navn.</li>';
  list.querySelectorAll('button[data-d]').forEach(b => b.onclick = async () => {
    if (!(await confirmDialog({ title: `Fjerne ${b.dataset.d}?`, text: 'Turene beholder navnet.', ok: 'Fjern', danger: true }))) return;
    const cur = getSettings();
    saveSettings({ ...cur, drivers: (cur.drivers || []).filter(x => x !== b.dataset.d), activeDriver: cur.activeDriver === b.dataset.d ? '' : cur.activeDriver });
    renderDriverSettings();
  });
  $('#btn-add-driver').onclick = () => {
    const input = $('#new-driver');
    const name = input.value.trim().slice(0, 40);
    if (!name) return;
    const cur = getSettings();
    saveSettings({ ...cur, drivers: [...new Set([...(cur.drivers || []), name])], activeDriver: cur.activeDriver || name });
    input.value = '';
    renderDriverSettings();
    toast(`${name} er lagt til.`, { type: 'ok', ms: 2000 });
  };
}

function renderThresholdSettings() {
  const s = getSettings();
  const base = s.th || TH;
  const G = 9.81;
  document.querySelectorAll('.th-input').forEach(inp => {
    const [k, lvl] = inp.dataset.k.split('.');
    inp.value = String(Math.round(base[k][lvl] * 100) / 100).replace('.', ',');
    const out = inp.parentElement.querySelector('.th-g');
    const showG = () => { const v = num(inp.value); out.textContent = Number.isFinite(v) ? `= ${(v / G).toFixed(2).replace('.', ',')} g` : ''; };
    showG();
    inp.oninput = showG;
    inp.onchange = () => {
      const cur = getSettings();
      const th = JSON.parse(JSON.stringify(cur.th || TH));
      const v = num(inp.value);
      if (Number.isFinite(v) && v > 0 && v < 15) th[k][lvl] = v;
      saveSettings({ ...cur, th });
      toast('Egne terskler er lagret.', { type: 'ok', ms: 2000 });
      renderThresholdSettings();
    };
  });
  $('#th-status').textContent = s.th ? 'Egne terskler er i bruk.' : 'Standard terskler fra prototypen.';
  $('#btn-th-reset').onclick = () => { const cur = getSettings(); delete cur.th; saveSettings(cur); renderThresholdSettings(); toast('Standard terskler er tilbake.', { type: 'ok', ms: 2000 }); };
}

async function exportDrive(id) {
  if (!id) return;
  const drive = await getDrive(id);
  const payload = { app: 'Kjørerapport', version: APP_VERSION, exportedAt: new Date().toISOString(), ...(await exportPayload(drive)) };
  await shareFile(toJSON(payload), `kjorerapport-${drive.startedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`);
}

async function backupAll(drives) {
  const items = [];
  for (const d of drives) items.push(await exportPayload(d));
  const { lastBackupAt, backupSnoozeUntil, ...settings } = getSettings();
  const payload = { app: 'Kjørerapport', version: APP_VERSION, exportedAt: new Date().toISOString(), settings, drives: items };
  await shareFile(toJSON(payload), `kjorerapport-sikkerhetskopi-${new Date().toISOString().slice(0, 10)}.json`);
  saveSettings({ ...getSettings(), lastBackupAt: new Date().toISOString() });
  toast(`Sikkerhetskopi med ${items.length} ${items.length === 1 ? 'tur' : 'turer'} og innstillinger er laget.`, { type: 'ok' });
}

async function shareFile(json, name) {
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kjørerapport' }); return; } catch { /* avbrutt */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- Ruting ---------- */
function route() {
  const h = location.hash || '#/';
  if (recorder && recorder.running && h !== '#/opptak') { location.hash = '#/opptak'; return; }
  if (stopPrecheck && h !== '#/sjekk') { stopPrecheck(); stopPrecheck = null; }
  if (!h.startsWith('#/rapport/')) stopSpeaking();
  if (h === '#/') renderHome();
  else if (h === '#/sjekk') renderPrecheck();
  else if (h === '#/opptak') { if (!recorder) location.hash = '#/'; }
  else if (h === '#/demo') renderDemoReport();
  else if (h === '#/innstillinger') renderSettings();
  else if (h === '#/logg') renderLog();
  else if (h === '#/faresteder') renderSpots();
  else if (h === '#/opplaering') renderPlan();
  else if (h.startsWith('#/rapport/')) renderDriveReport(h.slice('#/rapport/'.length));
  else location.hash = '#/';
}

function init() {
  applyTheme();
  hydrateIcons();
  ['home', 'precheck', 'record', 'report', 'settings', 'log', 'spots', 'plan'].forEach(n => { screens[n] = document.getElementById(n); });
  $('#btn-go-precheck').onclick = () => { location.hash = '#/sjekk'; };
  $('#btn-demo').onclick = () => { location.hash = '#/demo'; };
  $('#btn-settings').onclick = () => { location.hash = '#/innstillinger'; };
  document.querySelectorAll('.btn-back').forEach(b => b.onclick = () => { location.hash = '#/'; });
  setupLongPress($('#btn-stop'), finishRecording);
  $('#btn-update').onclick = () => { if (swUpdateReady) swUpdateReady.postMessage('skipWaiting'); };
  $('#version').textContent = `Kjørerapport versjon ${APP_VERSION}`;
  window.addEventListener('hashchange', route);
  let printOpened = [];
  window.addEventListener('beforeprint', () => {
    printOpened = [...document.querySelectorAll('#report details:not([open])')];
    printOpened.forEach(d => { d.open = true; });
  });
  window.addEventListener('afterprint', () => { printOpened.forEach(d => { d.open = false; }); printOpened = []; });
  window.addEventListener('beforeunload', e => { if (recorder && recorder.running) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (!screens.home.hidden) renderInstallHint(); });
  registerSW();
  requestPersistentStorage().then(r => { persistState = r; });
  route();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const track = w => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { swUpdateReady = w; $('#update-banner').hidden = false; } }); };
    track(reg.waiting); reg.addEventListener('updatefound', () => track(reg.installing));
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || (recorder && recorder.running)) return;
      refreshing = true; location.reload();
    });
  }).catch(err => console.warn('Service worker feilet', err));
}

document.addEventListener('DOMContentLoaded', init);
