/* Kjørerapport – skjermer og navigasjon. Alt skjer lokalt på telefonen. */
import { analyze, makeDemo, SENSITIVITY, TH } from './analysis.js';
import { Recorder, requestMotionPermission, requestLocationOnce, startPrecheck } from './recorder.js';
import { listDrives, getDrive, putDrive, updateDrive, importDrive, deleteDrive, deleteAll, getSettings, saveSettings, exportPayload, toJSON, requestPersistentStorage } from './db.js';
import { renderReport, closeMapOverlay, trendChart, categoryTrendChart, eventsPer10km, speedingFor, markRows, eventLabel } from './report.js';
import { enrichDrive, evaluateRoad, ROAD_V, LIMITS_V } from './enrich.js';
import { suggestFocus, hotspots, sameRoute, curriculumEvidence, CURRICULUM } from './insights.js';
import { esc, km, n0, n1, date, duration } from './format.js';
import { icon, toast, confirmDialog, infoDialog, promptDialog, routeThumb, scoreBadge, MARK_CATS, FOCUS, speak, stopSpeaking } from './ui.js';
import { driveLog, sumLogs, ROAD_LABEL, LIGHT_LABEL } from './log.js';
import { teacherSummary, teacherText, teacherHtml } from './teacher.js';
import * as cam from './facecam.js';
import { createLiveLimit } from './livelimit.js';
import { createAtkSounds, unlockSound, playSound } from './sound.js';
import { CLASS_LABEL, CALIB_STEPS, MIRRORS, calibrationFromSamples, classifyPose, evaluateMirrors, toGaze, gazeCalib, useGaze } from './camera.js';
import { roadSummary } from './road.js';
import { createCamLimit } from './signs.js';
import { GUIDES, guideFor, isDarkSeason } from './guides.js';

export const APP_VERSION = '0.10.2';
let speakNext = null;
const $ = sel => document.querySelector(sel);
const screens = {};
let recorder = null;
let stopPrecheck = null;
let swUpdateReady = null, swReg = null;
let installPrompt = null;
let persistState = null;

function show(name) {
  const target = screens[name];
  const changed = target.hidden;
  Object.values(screens).forEach(s => { if (s !== target) s.hidden = true; });
  target.hidden = false;
  // Animasjonen fjernes når den er ferdig: en transform-animasjon som står igjen, gjør at «position: fixed» inni skjermen
  // (fullskjerm kart) låses til skjermen i stedet for vinduet (0.10.1)
  if (changed) { target.classList.remove('enter'); void target.offsetWidth; target.classList.add('enter'); target.addEventListener('animationend', () => target.classList.remove('enter'), { once: true }); }
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

/* Lys eller mørk følger alltid telefonen (v0.9.15, Apples retningslinjer: ingen egen innstilling i appen) */
function applyTheme() {
  document.documentElement.removeAttribute('data-theme');
}

function isStandalone() {
  // I iPhone-appen (window.kjNative) er appen alltid «installert»
  return !!window.kjNative || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
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
  const key = `${opts.factor}|${opts.engine}|${opts.perKm}|${opts.cityAware}|${opts.th ? JSON.stringify(opts.th) : '-'}|15`;
  if (drive.result && drive.resultKey === key) return drive.result;
  const { getRaw } = await import('./db.js');
  const raw = await getRaw(drive.id);
  let result;
  try {
    result = analyze(raw, opts);
    // Veikameraet (0.10.0): bildebredden gjør at bilens eget dashbord (over 70 % av bredden) ikke regnes som en bil
    const frameW = drive.cameraPlan && /^\d+x\d+$/.test(drive.cameraPlan.roadSize || '') ? +drive.cameraPlan.roadSize.split('x')[0] : null;
    if (raw.road && raw.road.length > 10) result.road = roadSummary(raw.road, result.points, { t0: result.t0, frameW });
    if (raw.head && raw.head.length > 20) result.camera = evaluateMirrors(raw.head, drive.calib, { points: result.points, t0: result.t0, laneChanges: result.maneuvers.laneChanges,
      markedLanes: (drive.marks || []).filter(m => m.cat === 'felt').map(m => m.t - result.t0) });
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
  const calibrated = !!getCalib();
  $('#btn-go-camera').classList.toggle('warn', !!settings.cameraOn && !calibrated);
  $('#cam-card-text').textContent = !settings.cameraOn ? 'Kalibrer og se hva kameraet oppfatter, før dere tar det med på tur.'
    : calibrated ? (roadWanted() ? 'Kalibrert og slått på, med veikameraet samtidig. Trykk for å teste.' : 'Kalibrert og slått på. Trykk for å teste eller kalibrere på nytt.')
    : 'Ikke kalibrert. Trykk her og kalibrer før turen – det tar 30 sekunder.';
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
  if (!allDrives.length && !settings.introSeen) openIntro();

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

  // Guide (0.10.1): den første som passer og ikke er lukket (demoturer teller ikke som turer)
  renderGuideCard({ real: realCount, cameraOn: !!settings.cameraOn, calibrated, roadCam: roadWanted(), native: !!window.kjNative,
    unbacked: bb.hidden ? newSince : 0, dark: isDarkSeason() });

  // Faresteder og opplæring
  const more = $('#more-cards');
  if (sugRows.length || realCount) {
    const allRows = filter ? sugRows : await gatherRows(null);
    const spots = hotspots(allRows.map(x => ({ id: x.d.id, points: x.res.points, items: hotspotItems(x) })));
    const plan = planProgress(allRows);
    more.innerHTML = `<button type="button" class="card t-cta" id="btn-go-teacher"><span class="card-title">${icon('school')}Til trafikklæreren</span><span class="muted small">Det som er øvd siden forrige kjøretime, klart til å vise fram eller dele</span><span class="last-cta">Åpne ${icon('chev', 18)}</span></button>
      ${spots.length ? `<button type="button" class="card mini-card" id="btn-go-spots"><span class="card-title">${icon('pin')}Faresteder</span><strong>${spots.length}</strong><span class="muted small">${spots.length === 1 ? 'sted' : 'steder'} med flere hendelser</span></button>` : ''}
      <button type="button" class="card mini-card" id="btn-go-plan"${spots.length ? '' : ' style="grid-column: 1 / -1"'}><span class="card-title">${icon('school')}Opplæring</span><strong>${plan.done} av ${plan.total}</strong><span class="muted small">punkter krysset av</span></button>`;
    more.hidden = false;
    if (spots.length) $('#btn-go-spots').onclick = () => { location.hash = '#/faresteder'; };
    $('#btn-go-plan').onclick = () => { location.hash = '#/opplaering'; };
    $('#btn-go-teacher').onclick = () => { location.hash = '#/trafikklaerer'; };
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
    const road = d.enrich && d.enrich.road ? { ...evaluateRoad(res.points, d.enrich.road, res.events, d.enrich.limits), fromNvdb: true } : null;
    rows.push({ d, res, sp, road, log: logFor(d, res), marks: markRows(d.marks || [], res) });
  }
  return rows;
}

/* ---------- Guider (0.10.1) ---------- */
const guideSteps = g => `<ol class="steps-list">${g.steps.map(([b, t], i) => `<li><span class="step-num">${i + 1}</span><span><strong>${esc(b)}</strong> ${esc(t)}</span></li>`).join('')}</ol>`;

function renderGuideCard(ctx) {
  const card = $('#guide-card');
  const g = guideFor(ctx, getSettings().guidesClosed || {});
  card.hidden = !g;
  if (!g) return;
  card.innerHTML = `<div class="guide-head"><span class="guide-ico">${icon(g.icon, 20)}</span><div class="guide-titles"><span class="eyebrow">Guide</span><h2>${esc(g.title)}</h2></div>
      <button type="button" class="guide-close" aria-label="Lukk guiden «${esc(g.title)}»">${icon('close', 20)}</button></div>
    <p class="muted guide-lead">${esc(g.lead)}</p>
    <details class="guide-steps"${g.id === 'start' ? ' open' : ''}><summary><span class="when-closed">Les guiden (${g.steps.length} punkter)</span><span class="when-open">Skjul</span></summary>${guideSteps(g)}</details>
    <a class="guide-more" href="#/guider">Alle guider og tips ${icon('chev', 14)}</a>`;
  card.querySelector('.guide-close').onclick = () => {
    const s = getSettings();
    saveSettings({ ...s, guidesClosed: { ...(s.guidesClosed || {}), [g.id]: true } });
    card.classList.add('closing');
    setTimeout(() => { card.hidden = true; card.classList.remove('closing'); }, 220);
    toast('Guiden er lukket. Du finner den under Innstillinger › Guider og tips.', { type: 'ok', ms: 3200 });
  };
}

function renderGuides() {
  show('guides');
  const closed = getSettings().guidesClosed || {};
  $('#guide-list').innerHTML = GUIDES.map(g => `<details class="card guide-item" id="guide-${g.id}">
      <summary><span class="guide-ico">${icon(g.icon, 20)}</span><span class="guide-titles"><strong>${esc(g.title)}</strong><span class="muted small">${esc(g.lead)}</span></span>${icon('chev', 18)}</summary>
      ${guideSteps(g)}${closed[g.id] ? '<p class="muted small">Lukket på Hjem.</p>' : ''}</details>`).join('');
  $('#btn-guides-reset').onclick = () => { saveSettings({ ...getSettings(), guidesClosed: {} }); toast('Guidene vises på Hjem igjen når de passer.', { type: 'ok' }); renderGuides(); };
}

/* ---------- Kamera ---------- */
const calibKey = () => getSettings().activeDriver || '_';
/* Kalibreringen for valgt fører. Finnes ingen, brukes den nyeste (holderen står som regel likt). */
function getCalib() {
  const all = getSettings().calib || {};
  const own = all[calibKey()];
  if (own && own.ok) return own;
  return Object.values(all).filter(c => c && c.ok).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0] || null;
}
function saveCalib(c) { const s = getSettings(); saveSettings({ ...s, calib: { ...(s.calib || {}), [calibKey()]: c } }); }
let camUnsub = null;
let calibForDrive = null;   // tur som skal få kalibreringen når den er ferdig (fra rapporten)

/* Veikameraet samtidig (0.10.0): bare i iPhone-appen, på telefoner som kan ha begge kameraene på (iPhone XS og nyere) */
let roadOk = false;
cam.roadSupported().then(v => { roadOk = v; }).catch(() => {});
const roadWanted = () => roadOk && getSettings().roadCam !== false;

/* Starter kameraet (og veikameraet når det er valgt) og ansiktsgjenkjenningen hvis de ikke allerede går. */
async function ensureCamera(videoEl, onStatus = () => {}) {
  if (cam.state().running && cam.state().road === roadWanted()) { await cam.attachVideo(videoEl); return; }
  await cam.startCamera(videoEl, { road: roadWanted() });
  await cam.loadModel(onStatus);
  cam.startLoop(8);
}

/* Kort tekst om hva veikameraet ser nå */
function roadText(r) {
  if (!r) return 'Veikameraet starter …';
  return `Veikamera på · ${r.lead ? `bil ${Math.round(r.lead.dist)} m foran${r.lead.src === 'baklys' ? ' (baklys)' : ''}` : `${r.cars} ${r.cars === 1 ? 'bil' : 'biler'}`}${r.lane && (r.lane.l || r.lane.r) ? ' · feltlinjer' : ''}${Number.isFinite(r.lum) && r.lum < 60 ? ' · mørkt' : ''}`;
}

/* Gir en lagret tur kalibreringen og ber om ny analyse. */
async function applyCalibToDrive(id, c) {
  await updateDrive(id, { calib: c, resultKey: null });
  toast('Turen er vurdert med kalibreringen.', { type: 'ok' });
}

async function renderCamera() {
  show('camera');
  roadOk = await cam.roadSupported().catch(() => false);
  const settings = getSettings();
  const video = $('#cam-video'), label = $('#cam-label'), nums = $('#cam-nums'), status = $('#cam-status'), log = $('#cam-log');
  const calibInfo = () => {
    const c = getCalib();
    $('#cam-calib-status').innerHTML = c ? `${icon('check', 18)} Kalibrert${c.at ? ' ' + esc(date(c.at)) : ''}. Kalibrer på nytt hvis holderen er flyttet.` : `${icon('info', 18)} Ikke kalibrert ennå. Sett telefonen i holderen der den skal stå under kjøring, og trykk «Kalibrer».`;
    $('#btn-cam-calib').lastChild.textContent = c ? 'Kalibrer på nytt' : 'Kalibrer';
  };
  calibInfo();
  const forDrive = $('#cam-for-drive');
  forDrive.hidden = !calibForDrive;
  if (calibForDrive) {
    const d = await getDrive(calibForDrive);
    forDrive.textContent = `Kalibrerer for turen ${d ? date(d.startedAt) : ''}. Sett telefonen i holderen slik den sto under turen. Etterpå vurderes turen på nytt.`;
  }
  const on = $('#cameraOn'); on.checked = !!settings.cameraOn;
  on.onchange = () => { saveSettings({ ...getSettings(), cameraOn: on.checked }); toast(on.checked ? 'Kameraet brukes under kjøring.' : 'Kameraet brukes ikke under kjøring.', { type: 'ok', ms: 2000 }); };
  const roadOn = $('#roadCam');
  $('#roadCam-row').hidden = !roadOk; $('#cam-road-intro').hidden = !roadOk;
  roadOn.checked = roadWanted();
  roadOn.onchange = async () => {
    saveSettings({ ...getSettings(), roadCam: roadOn.checked });
    toast(roadOn.checked ? 'Veikameraet brukes samtidig.' : 'Bare førerkameraet brukes.', { type: 'ok', ms: 2000 });
    if (cam.state().running) await startCam();   // start på nytt med eller uten veikameraet
  };
  const roadBox = $('#cam-road'), roadVideo = $('#cam-road-video'), roadTxt = $('#cam-road-text');
  let roadUnsubCam = null;
  const showRoad = async () => {
    if (roadUnsubCam) { roadUnsubCam(); roadUnsubCam = null; }
    roadBox.hidden = !cam.state().road;
    if (!cam.state().road) return;
    await cam.attachRoadVideo(roadVideo);
    roadTxt.textContent = roadText(null);
    let n = 0;
    roadUnsubCam = cam.onRoad(r => { if (++n % 5 === 0) roadTxt.textContent = roadText(r); });
  };
  video.closest('.cam-view').onclick = () => openCamView('user');
  roadBox.onclick = () => openCamView('environment');
  const recent = [];
  let lastCls = null, run = 0;
  const listen = () => {
    if (camUnsub) camUnsub();
    camUnsub = cam.onPose(pose => {
      const c = getCalib();
      const cls = classifyPose(pose, c);
      label.textContent = c ? CLASS_LABEL[cls] : (pose ? 'Ser ansiktet' : CLASS_LABEL.none);
      label.dataset.cls = c ? cls : (pose ? 'forward' : 'none');
      nums.textContent = pose ? `Sidelengs ${Math.round(pose.yaw)}° · opp/ned ${Math.round(pose.pitch)}° · ${cam.state().fps.toFixed(0)} bilder/s` : '';
      if (cls === lastCls) run++; else { lastCls = cls; run = 1; }
      if (run === 2 && c && !['forward', 'other', 'none'].includes(cls)) {
        recent.unshift({ cls, at: new Date() });
        recent.length = Math.min(recent.length, 8);
        log.innerHTML = recent.map(r => `<li><strong>${CLASS_LABEL[r.cls]}</strong><span class="muted small">${r.at.toLocaleTimeString('nb-NO')}</span></li>`).join('');
      }
    });
  };
  const startCam = async () => {
    try {
      status.textContent = 'Starter kameraet …';
      await ensureCamera(video, t => { status.textContent = t; });
      listen();
      await showRoad();
      status.textContent = 'Kameraet er på. Bildene lagres ikke.';
      $('#cam-stage').hidden = false;
      $('#btn-cam-start').hidden = true; $('#btn-cam-stop').hidden = false;
      calibInfo();
      return true;
    } catch (err) {
      status.textContent = '';
      infoDialog({ title: 'Kameraet startet ikke', text: err && err.name === 'NotAllowedError' ? 'Tilgang til kameraet ble avslått. Tillat kamera for appen i iPhone-innstillingene (Safari → Kamera), og prøv igjen.' : String(err && err.message || err) });
      return false;
    }
  };
  $('#btn-cam-start').onclick = startCam;
  $('#btn-cam-stop').onclick = () => { cam.stopCamera(); if (camUnsub) camUnsub(); camUnsub = null; if (roadUnsubCam) roadUnsubCam(); roadUnsubCam = null; $('#cam-stage').hidden = true; $('#btn-cam-start').hidden = false; $('#btn-cam-stop').hidden = true; status.textContent = 'Kameraet er av.'; calibInfo(); };
  $('#btn-cam-calib').onclick = async () => {
    unlockSpeech();
    if (!cam.state().running && !(await startCam())) return;
    const c = await runCalibration();
    calibInfo();
    if (c && calibForDrive) {
      const id = calibForDrive;
      calibForDrive = null;
      await applyCalibToDrive(id, c);
      location.hash = '#/rapport/' + id;
    }
  };
  if (cam.state().running) { await cam.attachVideo(video); listen(); await showRoad(); $('#cam-stage').hidden = false; $('#btn-cam-start').hidden = true; $('#btn-cam-stop').hidden = false; status.textContent = 'Kameraet er på. Bildene lagres ikke.'; }
  else { $('#cam-stage').hidden = true; $('#btn-cam-start').hidden = false; $('#btn-cam-stop').hidden = true; }
}

/* iPhone leser bare opp hvis den første opplesningen starter direkte fra et trykk. */
function unlockSpeech() { if ('speechSynthesis' in window) speak(' '); }

/* Kalibrering: fire blikk med nedtelling over hele skjermen. Instruksjonene leses opp,
   fordi føreren ser i speilene og ikke på skjermen. Returnerer kalibreringen, eller null. */
async function runCalibration() {
  const overlay = $('#calib-overlay'), stepEl = $('#calib-step'), count = $('#calib-count'), progress = $('#calib-progress'), face = $('#calib-face');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let cancelled = false;
  $('#calib-cancel').onclick = () => { cancelled = true; };
  overlay.hidden = false;
  const offFace = cam.onPose(p => { face.textContent = p ? 'Kameraet ser ansiktet' : 'Kameraet ser ikke ansiktet – snu deg litt tilbake'; face.dataset.ok = p ? '1' : '0'; });
  const byTarget = {};
  try {
    for (const [i, step] of CALIB_STEPS.entries()) {
      progress.textContent = `Steg ${i + 1} av ${CALIB_STEPS.length}`;
      stepEl.textContent = step.text;
      speak(step.text);
      for (let k = 3; k > 0; k--) { count.textContent = k; await wait(800); if (cancelled) break; }
      if (cancelled) break;
      count.textContent = 'Hold …';
      vibrate(30);
      const got = [];
      const off = cam.onPose(p => { if (p) got.push(p); });
      await wait(2200);
      off();
      byTarget[step.id] = got;
    }
  } finally { offFace(); overlay.hidden = true; }
  if (cancelled) { stopSpeaking(); return null; }
  vibrate([30, 60, 30]);
  const c = calibrationFromSamples(byTarget);
  if (c.ok) { c.at = new Date().toISOString(); saveCalib(c); speak('Ferdig. Kalibreringen er lagret.'); toast('Kalibreringen er lagret.', { type: 'ok' }); return c; }
  speak('Kalibreringen ble ikke god nok.');
  infoDialog({ title: 'Kalibreringen ble ikke god nok', text: c.problem === 'missing' ? 'Kameraet så ikke ansiktet lenge nok i ett eller flere trinn. Sjekk at ansiktet er godt synlig og at det er lyst nok.' : c.problem === 'close' ? 'Telefonen ser for liten forskjell mellom rett fram og et av speilene. Flytt holderen mer mot midten av bilen, og snu hodet tydelig mot speilet.' : 'Venstre og høyre speil ble ikke skilt fra hverandre. Prøv igjen, og snu hodet tydelig.' });
  return null;
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
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Kjørelogg' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
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

/* ---------- Til trafikklæreren (v0.9.13) ---------- */
async function renderTeacher() {
  show('teacher');
  const root = $('#teacher-root');
  const s = getSettings(), key = s.activeDriver || '_', driver = s.activeDriver || '';
  const lesson = (s.lessons || {})[key] || '';
  let mode = s.teacherPeriod || (lesson ? 'lesson' : '30');
  if (mode === 'lesson' && !lesson) mode = '30';
  document.querySelectorAll('input[name=tperiod]').forEach(r => {
    r.checked = r.value === mode;
    r.onchange = () => { saveSettings({ ...getSettings(), teacherPeriod: r.value }); renderTeacher(); };
  });
  const dateIn = $('#t-lesson'), noteIn = $('#t-note');
  dateIn.value = lesson;
  dateIn.onchange = () => {
    const cur = getSettings();
    saveSettings({ ...cur, lessons: { ...(cur.lessons || {}), [key]: dateIn.value }, teacherPeriod: dateIn.value ? 'lesson' : '30' });
    renderTeacher();
  };
  const note = (s.teacherNotes || {})[key] || '';
  if (document.activeElement !== noteIn) noteIn.value = note;
  let noteTimer = null;
  noteIn.oninput = () => { clearTimeout(noteTimer); noteTimer = setTimeout(() => { const cur = getSettings(); saveSettings({ ...cur, teacherNotes: { ...(cur.teacherNotes || {}), [key]: noteIn.value.trim() } }); }, 500); };
  noteIn.onchange = () => { const cur = getSettings(); saveSettings({ ...cur, teacherNotes: { ...(cur.teacherNotes || {}), [key]: noteIn.value.trim() } }); renderTeacher(); };
  root.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div>';
  const rows = await gatherRows(driver || null);
  // Fra starten av dagen for forrige time (lokal tid)
  const from = mode === 'lesson' ? new Date(lesson + 'T00:00:00').getTime() : mode === '30' ? Date.now() - 30 * 86400000 : null;
  const sum = teacherSummary(rows, { from, driver, plan: planState().mine });
  root.innerHTML = teacherHtml(sum, { note: noteIn.value.trim() });
  $('#btn-teacher-print').onclick = () => window.print();
  $('#btn-teacher-share').onclick = () => shareText(teacherText(sum, { note: noteIn.value.trim() }));
  $('#btn-teacher-done').onclick = () => {
    const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const cur = getSettings();
    saveSettings({ ...cur, lessons: { ...(cur.lessons || {}), [key]: iso }, teacherPeriod: 'lesson', teacherNotes: { ...(cur.teacherNotes || {}), [key]: '' } });
    noteIn.value = '';
    toast('Ny periode fra i dag. Neste oppsummering viser øvingen fram til neste time.', { type: 'ok' });
    renderTeacher();
  };
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
  const spots = hotspots(rows.map(x => ({ id: x.d.id, points: x.res.points, items: hotspotItems(x) })));
  root.innerHTML = `
    ${spots.length ? `<button type="button" class="card mini-card plan-spots" id="btn-plan-spots"><span class="card-title">${icon('pin')}Faresteder</span><span class="muted small">${spots.length} ${spots.length === 1 ? 'sted' : 'steder'} der det har skjedd noe flere ganger</span><span class="last-cta">Se på kartet ${icon('chev', 18)}</span></button>` : ''}
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
  const spotsBtn = root.querySelector('#btn-plan-spots');
  if (spotsBtn) spotsBtn.onclick = () => { location.hash = '#/faresteder'; };
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
  const camCheck = $('#check-camera'), roadCheck = $('#check-road');
  camCheck.hidden = !getSettings().cameraOn;
  const showRoadCheck = () => {
    roadCheck.hidden = !(getSettings().cameraOn && roadWanted());
    if (!roadCheck.hidden && !roadCheck.dataset.state) setCheck(roadCheck, null, 'Starter sammen med førerkameraet');
  };
  roadCheck.dataset.state = '';
  showRoadCheck();
  cam.roadSupported().then(v => { roadOk = v; showRoadCheck(); }).catch(() => {});
  const preCalib = $('#btn-pre-calib');
  preCalib.hidden = true;
  if (getSettings().cameraOn) setCheck(camCheck, null, getCalib() ? 'Starter når du gir tilgang' : 'Ikke kalibrert – du kan kalibrere her når kameraet er i gang');
  preCalib.onclick = async () => {
    unlockSpeech();
    await runCalibration();
    preCalib.lastChild.textContent = getCalib() ? 'Kalibrer på nytt' : 'Kalibrer nå';
  };
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
    if (getSettings().cameraOn) {
      try {
        await cam.startCamera($('#pre-video'), { road: roadWanted() });
        await cam.loadModel(t => setCheck(camCheck, null, t));
        cam.startLoop(8);
        if (camUnsub) camUnsub();
        let seen = 0, n = 0;
        const offPose = cam.onPose(p => { n++; if (p) seen++; if (n % 8 === 0) { const share = seen / 8; seen = 0; setCheck(camCheck, share > 0.6 ? true : null, share > 0.6 ? (getCalib() ? 'Ser føreren · kalibrert' : 'Ser føreren – men ikke kalibrert. Trykk «Kalibrer nå».') : 'Ser ikke ansiktet – juster holderen'); } });
        // Veikameraet: ser det noe? (biler eller feltlinjer, eller lys nok til å se veien)
        let offRoad = null;
        if (cam.state().road) {
          await cam.attachRoadVideo($('#pre-road-video'));
          let k = 0;
          offRoad = cam.onRoad(r => { if (++k % 8) return; setCheck(roadCheck, r.cars > 0 || (r.lane && (r.lane.l || r.lane.r)) ? true : null, roadText(r) + (cam.state().roadModel ? ` · ${cam.state().roadModel}` : '')); });
        } else if (!roadCheck.hidden) setCheck(roadCheck, false, 'Veikameraet startet ikke – bare førerkameraet brukes');
        camUnsub = () => { offPose(); if (offRoad) offRoad(); };
        preCalib.lastChild.textContent = getCalib() ? 'Kalibrer på nytt' : 'Kalibrer nå';
        preCalib.hidden = false;
      } catch (err) { setCheck(camCheck, false, err && err.name === 'NotAllowedError' ? 'Kameratilgang avslått' : 'Kameraet startet ikke'); }
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
  // Lyd ved fotobokser (v0.9.10 / k0.7.5): låses opp nå, i trykket på «Start», ellers spiller ikke iPhone lyden
  const atkSound = !replay && settings.netLimits !== false && settings.atkSound !== false ? createAtkSounds() : null;
  if (atkSound) unlockSound();
  const elapsed = $('#rec-elapsed'), dist = $('#rec-dist'), gps = $('#rec-gps'), warn = $('#rec-warn'), saved = $('#rec-saved'), markCount = $('#rec-marks');
  warn.innerHTML = '';
  saved.textContent = '';
  markCount.textContent = '';
  renderMarkGrid({});
  let gapMsg = '', gapShown = null, stillSince = null, lastNativeStatus = -Infinity;   // lang pause: minn om å stoppe turen (v0.9.3, før Trondheim–Storlien)
  // Aktiv fartsgrense fra NVDB (v0.9.4), når «Veidata» er på. Endringene lagres med turen for sammenligning.
  const live = !replay && settings.netLimits !== false ? createLiveLimit({ atk: true }) : null;
  const liveLog = [];
  liveLimitNow = null; camLimit.reset(); camSignNew = null;
  const limitBox = $('#rec-limit'), limitSign = $('#rec-limit-sign'), limitNote = $('#rec-limit-note'), speedEl = $('#rec-speed'), atkEl = $('#rec-atk');
  const atkPop = $('#atk-pop');
  atkEl.hidden = true; atkPop.hidden = true;
  let popUntil = 0;
  // Demoturen (v0.9.19) har egne fartsgrenser langs den tenkte ruta, så skiltet vises også under avspilling
  const demoLimits = replay && replay.data && replay.data.limits ? replay.data.limits : null;
  limitBox.hidden = !live && !demoLimits;
  recorder = new Recorder({
    sensitivity: settings.sensitivity,
    appVersion: APP_VERSION,
    driver: replay ? '' : (settings.activeDriver || ''),
    focus: replay ? [] : (settings.focus || []),
    calib: replay ? null : getCalib(),
    replay,
    onStatus: st => {
      if (st.replayDone) { finishRecording(); return; }
      cam.setSpeed(st.kmh);   // fartsskilt leses bare når bilen kjører
      if (live) {
        const res = live.update(st.pos);
        // Skilt fra veikameraet (midlertidige og digitale skilt) går foran NVDB til neste skilt, 3 km eller ny NVDB-strekning
        if (camSignNew) { camLimit.sign(camSignNew.limit, st.distanceM, res.limit); liveLog.push({ t: Math.round(st.elapsed), limit: camSignNew.limit, src: 'kamera' }); camSignNew = null; }
        const cl = camLimit.current(st.distanceM, res.limit);
        const lim = cl ? cl.limit : res.limit;
        liveLimitNow = lim;
        limitSign.textContent = lim ?? '–';
        limitSign.classList.toggle('none', lim === null);
        limitSign.classList.toggle('cam', !!cl && !cl.agree);
        limitNote.textContent = cl ? (cl.agree ? 'Fartsgrense (Statens vegvesen) · kameraet så samme skilt' : `Skilt sett av kameraet${cl.nvdb ? ` · Statens vegvesen: ${cl.nvdb}` : ''}`)
          : res.limit !== null ? 'Fartsgrense (Statens vegvesen)' : res.status === 'feil' ? 'Fartsgrense: ingen nett' : res.status === 'ukjent' ? 'Fartsgrense ukjent her' : 'Henter fartsgrense …';
        speedEl.textContent = Number.isFinite(st.kmh) ? n0(st.kmh) : '–';
        // Fotoboks foran eller strekningsmåling (v0.9.7)
        // Lite varsel fra 1 km, stort kort de siste 300 m og etter en strekningsmåling (k0.7.1). Kortet blir stående
        // 2 s etter at bilen har passert, og forsvinner så av seg selv.
        const atk = st.pos ? live.atk({ ...st.pos, t: st.elapsed, kmh: st.kmh }) : null;
        if (atkSound && st.pos) { const snd = atkSound.step(atk, { kmh: st.kmh, limit: liveLimitNow, t: st.elapsed }); if (snd) playSound(snd); }
        const big = atk && ((atk.kind === 'boks' || atk.kind === 'strekning-foran') ? atk.d <= 300 : atk.kind === 'ferdig');
        atkEl.hidden = !atk || big;
        if (atk && !big) { atkEl.textContent = atk.text; atkEl.dataset.kind = atk.kind; }
        if (big) {
          popUntil = st.elapsed + 2;
          atkPop.dataset.kind = atk.kind;
          atkPop.querySelector('.atk-pop-title').textContent = atk.kind === 'boks' ? 'Fotoboks' : atk.kind === 'ferdig' ? 'Strekningsmåling ferdig' : 'Strekningsmåling';
          atkPop.querySelector('.atk-pop-main').textContent = atk.kind === 'ferdig' ? `snitt ${atk.avg ?? '–'} km/t` : `om ${atk.d} m`;
          atkPop.querySelector('.atk-pop-sub').textContent = [liveLimitNow ? `Fartsgrense ${liveLimitNow}` : '', Number.isFinite(st.kmh) ? `du kjører ${n0(st.kmh)} km/t` : ''].filter(Boolean).join(' · ');
          atkPop.hidden = false;
        } else if (st.elapsed > popUntil) atkPop.hidden = true;
        const last = liveLog[liveLog.length - 1];
        if (!last || last.limit !== res.limit) liveLog.push({ t: Math.round(st.elapsed), limit: res.limit });
        if (recorder) recorder.liveLimits = liveLog;
      } else if (demoLimits) {
        let z = demoLimits[0];
        for (const x of demoLimits) if (st.elapsed >= x.t) z = x;
        liveLimitNow = z.limit;
        limitSign.textContent = z.limit;
        limitSign.classList.remove('none');
        limitNote.textContent = 'Fartsgrense i demoturen';
        speedEl.textContent = Number.isFinite(st.kmh) ? n0(st.kmh) : '–';
      }
      elapsed.textContent = fmtClock(st.elapsed);
      dist.textContent = km(st.distanceM / 1000);
      // iPhone-appen: avstanden til Live Activity på låseskjermen (v0.9.22)
      if (window.kjNative && window.kjNative.status && !replay && st.elapsed - lastNativeStatus >= 10) { lastNativeStatus = st.elapsed; window.kjNative.status({ distanceM: st.distanceM }); }
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
      if (st.returnedFromGap) { gapShown = st.returnedFromGap; gapMsg = `Appen var skjult i ${n0(st.returnedFromGap.to - st.returnedFromGap.from)} sekunder. Hullet er markert i dataene. Hold appen åpen under kjøring.`; }
      if (gapShown && recorder && !recorder.gaps.includes(gapShown)) { gapShown = null; gapMsg = ''; }   // iPhone-appen fylte inn hullet
      const msgs = [];
      if (replay) msgs.push(`Demotur: en tenkt tur i Trondheim spilles av i ${replay.speed || 60} ganger fart. Den stopper av seg selv, eller hold inne Stopp.`);
      if (st.wakeLockFailed && !replay && !window.kjNative) msgs.push('Sett Autolås til Aldri mens du kjører.');   // iPhone-appen holder skjermen på selv
      if (!(st.kmh >= 3) && st.gpsFresh) { if (stillSince === null) stillSince = st.elapsed; } else if (st.kmh >= 3) stillSince = null;
      if (stillSince !== null && st.elapsed - stillSince >= 600) msgs.push(`Dere har stått stille i ${Math.round((st.elapsed - stillSince) / 60)} minutter. Er dere framme eller tar pause? Hold inne Stopp for å avslutte turen, og start en ny etterpå. Da blir rapportene ryddigere.`);
      if (gapMsg) msgs.push(gapMsg);
      warn.innerHTML = msgs.map(m => `<p class="notice">${esc(m)}</p>`).join('');
    }
  });
  const camPill = $('#rec-cam'), recVideo = $('#rec-video'), recRoad = $('#rec-road-video'), hitV = $('#rec-video-hit'), hitR = $('#rec-road-hit');
  camPill.hidden = true; recVideo.hidden = true; recRoad.hidden = true; hitV.hidden = true; hitR.hidden = true;
  hitV.onclick = () => openCamView('user');
  hitR.onclick = () => openCamView('environment');
  if (!replay && settings.cameraOn && cam.state().running) {
    await cam.attachVideo(recVideo);
    recVideo.hidden = false; hitV.hidden = false; camPill.hidden = false;
    if (camUnsub) camUnsub();
    let seen = 0, n = 0, face = 'Kamera: på', lastRoad = null;
    const pillText = () => {
      const st = cam.state();
      camPill.textContent = st.stalled ? 'Kamera: får ingen bilder – starter på nytt …' : st.perf.slow ? 'Kamera: telefonen er treg (varm?)' : face + (st.road && lastRoad ? ` · ${lastRoad.lead ? `bil ${Math.round(lastRoad.lead.dist)} m foran${lastRoad.lead.src === 'baklys' ? ' (baklys)' : ''}` : 'vei'}` : '');
    };
    const offPose = cam.onPose(p => {
      if (recorder) recorder.addHead(p);
      n++; if (p) seen++;
      if (n % 16 === 0) { const ok = seen / 16 > 0.5; face = ok ? 'Kamera: ser føreren' : 'Kamera: ser ikke ansiktet'; camPill.dataset.state = ok ? 'ok' : 'wait'; seen = 0; pillText(); }
    });
    // Uten bilder kommer det ingen ansikter, så pillen oppdateres også av seg selv
    const pillTimer = setInterval(() => { if (!recorder) { clearInterval(pillTimer); return; } if (cam.state().stalled) { camPill.dataset.state = 'wait'; pillText(); } }, 2000);
    let offRoad = null;
    // Veikameraet samtidig (0.10.0): tall om veien foran til opptaket, og fartsskilt til skiltet på skjermen
    if (cam.state().road) {
      await cam.attachRoadVideo(recRoad);
      recRoad.hidden = false; hitR.hidden = false;
      let lastThumbAt = -Infinity, lastBigAt = -Infinity, k = 0;
      const startedAt = performance.now() / 1000;
      offRoad = cam.onRoad(r => {
        // Testbilder (utviklerdelen): et stort bilde (480 px) hvert 30. s, små (160 px) når det er en bil foran (høyst hvert 8. s)
        const nowS = performance.now() / 1000;
        const big = nowS - startedAt > 3 && nowS - lastBigAt >= 30;
        const small = !big && r.lead && nowS - lastThumbAt >= 8;
        if (settings.roadThumbs && (big || small)) { const img = cam.snapshot(big ? 480 : 160); if (img) { r.img = img; lastThumbAt = nowS; if (big) lastBigAt = nowS; } }
        if (r.sign) camSignNew = r.sign;
        if (r.signImg && !settings.roadThumbs) delete r.signImg;
        if (recorder) recorder.addRoad(r);
        lastRoad = r;
        if (++k % 5 === 0) pillText();
      });
    }
    camUnsub = () => { offPose(); if (offRoad) offRoad(); };
    camPill.textContent = 'Kamera: på'; camPill.dataset.state = 'ok';
  }
  try {
    await recorder.start();
    vibrate(80);
    // iPhone-appen: opptaket tåler låst skjerm (0.10.1), så si det første gangene
    if (!replay && window.kjNative && (getSettings().lockTipShown || 0) < 3) {
      saveSettings({ ...getSettings(), lockTipShown: (getSettings().lockTipShown || 0) + 1 });
      toast('Du kan låse skjermen. Opptaket fortsetter, og tiden vises på låseskjermen.', { type: 'ok', ms: 5000 });
    }
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
    if (m && m.cat === 'grense') m.note = `Appen viste ${liveLimitNow ?? '–'} km/t`;
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

let liveLimitNow = null;   // aktiv fartsgrense under opptak (km/t eller null)
// Fartsskilt lest av veikameraet (k0.7.6): gjelder foran NVDB til neste skilt, 3 km eller ny NVDB-strekning
const camLimit = createCamLimit();
let camSignNew = null;
/* Fullskjerm kamera (k0.7.2, i hovedappen fra 0.10.0): kamerabildet med det modellene ser tegnet oppå. Veikameraet:
   biler og folk (bokser), bilen foran med avstand og tidsluke, feltlinjene, dashbordkanten, plasseringen i feltet og
   fartsskilt. Førerkameraet: ansiktet, øynene og hvor føreren ser. Trykk på et lite kamerabilde; knappen nederst bytter
   kamera, ✕ eller et trykk hvor som helst lukker. Ingenting av dette lagres. */
let camViewRaf = null, camViewFacing = 'user';
// Myk visning (k0.7.5): boksene, feltlinjene og avstanden glir mot nye verdier (boksene på rundt 70 ms) i stedet for
// å hoppe hver gang et nytt svar kommer. Følgingen sier hvor bilen er nå; dette jevner bare ut det som tegnes.
const camEase = { boxes: new Map(), lanes: {}, dist: null, leadId: null, t: 0, face: null };
let camPoseUnsub = null, faceRun = { cls: null, n: 0, t0: 0 };
const faceLog = [];   // siste blikk i speil og over skulderen mens fullskjerm er åpen
// Ansiktets omriss og øynene (MediaPipe Face Mesh-punkter), og regnbuehinnene (468–477)
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_B = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const CLASS_COLOR = { forward: '#3ddc84', left: '#4fc3f7', right: '#ff4fd8', rear: '#ffd400', shoulderL: '#4fc3f7', shoulderR: '#ff4fd8', other: '#ff8a65', none: '#9e9e9e' };
async function openCamView(facing = 'user') {
  const box = $('#cam-full'), v = $('#cam-full-video'), sw = $('#cam-full-switch');
  if (!cam.state().running) return;
  camViewFacing = facing === 'environment' && cam.state().road ? 'environment' : 'user';
  box.hidden = false;
  v.classList.toggle('road', camViewFacing === 'environment');
  if (camViewFacing === 'environment') await cam.attachRoadVideo(v); else await cam.attachVideo(v);
  box.onclick = () => closeCamView();
  sw.hidden = !cam.state().road;
  sw.textContent = camViewFacing === 'environment' ? 'Vis førerkamera' : 'Vis veikamera';
  sw.onclick = e => { e.stopPropagation(); const other = camViewFacing === 'environment' ? 'user' : 'environment'; stopCamViewDraw(); openCamView(other); };
  // Førerkameraet: logg over blikkene mens visningen er åpen (to like klassifiseringer på rad = et blikk)
  faceLog.length = 0; faceRun = { cls: null, n: 0, t0: 0 };
  if (camPoseUnsub) camPoseUnsub();
  camPoseUnsub = cam.onPose(p => {
    const c = getCalib(), cls = c ? classifyPose(toGaze(p, c), gazeCalib(c)) : (p ? 'forward' : 'none'), now = performance.now() / 1000;
    if (cls === faceRun.cls) faceRun.n++;
    else {
      if (faceRun.n >= 2 && !['forward', 'other', 'none'].includes(faceRun.cls)) { faceLog.unshift({ cls: faceRun.cls, t: faceRun.t0, dur: now - faceRun.t0 }); faceLog.length = Math.min(faceLog.length, 6); }
      faceRun = { cls, n: 1, t0: now };
    }
  });
  const draw = () => { drawCamView(); camViewRaf = requestAnimationFrame(draw); };
  camViewRaf = requestAnimationFrame(draw);
}
// Testkrok når appen kjører lokalt (utvikling): åpne visningen uten et opptak
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !window.kjNative) {
  window.kjCamView = openCamView;
  // Tegner førervisningen fra et oppdiktet ansikt (test uten ekte ansikt foran kameraet)
  window.kjFaceView = v => { const box = $('#cam-full'), cv = $('#cam-full-canvas'); box.hidden = false; const dpr = window.devicePixelRatio || 1; cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr); const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cv.clientWidth, cv.clientHeight); drawFaceView(g, cv.clientWidth, cv.clientHeight, v, cam.state(), $('#cam-full-info')); };
}
function stopCamViewDraw() {
  if (camViewRaf) cancelAnimationFrame(camViewRaf);
  camViewRaf = null;
  if (camPoseUnsub) { camPoseUnsub(); camPoseUnsub = null; }
  camEase.face = null;
  camEase.boxes.clear(); camEase.lanes = {}; camEase.dist = null; camEase.t = 0;
}
async function closeCamView() {
  const box = $('#cam-full');
  if (box.hidden) return;
  box.hidden = true;
  stopCamViewDraw();
  $('#cam-full-video').srcObject = null;
  // I Safari leser ansiktsgjenkjenningen fra bildet som vises, så det må tilbake til skjermen bak
  if (cam.state().running && !cam.state().native) await cam.attachVideo(recorder ? $('#rec-video') : $('#cam-video'));
}
function drawCamView() {
  const cv = $('#cam-full-canvas'), info = $('#cam-full-info');
  const dpr = window.devicePixelRatio || 1, cw = cv.clientWidth, ch = cv.clientHeight;
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  const v = cam.view(camViewFacing), st = cam.state();
  if (v.facing !== 'environment') { drawFaceView(g, cw, ch, v, st, info); return; }
  if (!v.w) { info.innerHTML = '<div>Veikamera</div><div class="muted">Venter på første bilde …</div>'; return; }
  // Kamerabildet vises med «contain»: skala og forskyvning fra kamerabildets piksler til skjermen
  const s = Math.min(cw / v.w, ch / v.h), ox = (cw - v.w * s) / 2, oy = (ch - v.h * s) / 2;
  const X = x => ox + x * s, Y = y => oy + y * s;
  const kmh = recorder && Number.isFinite(recorder.speed) ? recorder.speed * 3.6 : NaN;
  const now = performance.now(), dt = Math.min(250, Math.max(0, now - (camEase.t || now)));
  camEase.t = now;
  const ease = tau => 1 - Math.exp(-dt / tau), aBox = ease(70), aLane = ease(120), aDist = ease(400);
  const seen = new Set();
  const smooth = d => {
    if (d.id == null) return d;
    seen.add(d.id);
    const o = camEase.boxes.get(d.id);
    const n = o ? { x: o.x + (d.x - o.x) * aBox, y: o.y + (d.y - o.y) * aBox, w: o.w + (d.w - o.w) * aBox, h: o.h + (d.h - o.h) * aBox } : { x: d.x, y: d.y, w: d.w, h: d.h };
    camEase.boxes.set(d.id, n);
    return { ...d, ...n };
  };
  const dets = (v.dets || []).map(smooth);
  const L = v.lead ? { ...v.lead } : null;
  if (L && L.box && L.id != null) L.box = camEase.boxes.get(L.id) || L.box;
  for (const id of camEase.boxes.keys()) if (!seen.has(id)) camEase.boxes.delete(id);
  // Avstanden til bilen foran glattes (ny bil: start på nytt)
  if (L && Number.isFinite(L.dist)) { camEase.dist = camEase.leadId === (L.id ?? L.src) && camEase.dist !== null ? camEase.dist + (L.dist - camEase.dist) * aDist : L.dist; camEase.leadId = L.id ?? L.src; L.dist = camEase.dist; }
  else { camEase.dist = null; camEase.leadId = null; }
  g.lineWidth = 2; g.font = '600 13px system-ui, sans-serif'; g.textBaseline = 'bottom';
  // Dashbordkanten
  if (v.roadBottom) { g.save(); g.setLineDash([8, 6]); g.strokeStyle = 'rgba(0,200,255,.9)'; g.beginPath(); g.moveTo(X(0), Y(v.roadBottom * v.h)); g.lineTo(X(v.w), Y(v.roadBottom * v.h)); g.stroke(); g.restore(); }
  // Feltlinjer (regnet på et lite bilde, skaleres opp)
  if (v.lane) {
    const k = v.w / v.lane.W;
    g.lineWidth = 5; g.lineCap = 'round';
    for (const [side, col] of [['left', '#3ddc84'], ['right', '#ff4fd8']]) {
      const raw = v.lane[side], o = camEase.lanes[side];
      if (!raw) { delete camEase.lanes[side]; continue; }
      const Ln = o ? Object.fromEntries(['xBottom', 'xTop', 'yBottom', 'yTop'].map(q => [q, o[q] + (raw[q] - o[q]) * aLane])) : { ...raw };
      camEase.lanes[side] = Ln;
      g.strokeStyle = col; g.beginPath(); g.moveTo(X(Ln.xBottom * k), Y(Ln.yBottom * k)); g.lineTo(X(Ln.xTop * k), Y(Ln.yTop * k)); g.stroke();
    }
    g.lineWidth = 2;
  }
  // Biler og folk
  const isLead = d => L && L.box && (L.id != null ? d.id === L.id : Math.abs(d.x - L.box.x) < 2 && Math.abs(d.w - L.box.w) < 2);
  for (const d of dets) {
    if (isLead(d)) continue;   // tegnes grønt under
    const person = d.cls === 'person' || d.cls === 'bicycle';
    g.strokeStyle = person ? '#ff4fd8' : '#ffd400'; g.fillStyle = g.strokeStyle;
    g.strokeRect(X(d.x), Y(d.y), d.w * s, d.h * s);
    g.fillText(`${{ car: 'bil', truck: 'lastebil', bus: 'buss', motorcycle: 'MC', bicycle: 'sykkel', person: 'person' }[d.cls] || d.cls} ${Math.round(d.score * 100)}`, X(d.x) + 2, Y(d.y) - 2);
  }
  // Bilen foran
  if (L && L.box) {
    g.lineWidth = 4; g.strokeStyle = '#00e676'; g.strokeRect(X(L.box.x), Y(L.box.y), L.box.w * s, L.box.h * s);
    g.font = '800 16px system-ui, sans-serif'; g.fillStyle = '#00e676';
    g.fillText(`${Math.round(L.dist)} m${kmh >= 20 ? ` · ${(L.dist / (kmh / 3.6)).toFixed(1).replace('.', ',')} s` : ''}`, X(L.box.x), Y(L.box.y) - 4);
  }
  // Fartsskilt (k0.7.6): røde rammer med tallet som ble lest
  for (const r of v.signReads || []) {
    g.lineWidth = 3; g.strokeStyle = '#ff1744'; g.strokeRect(X(r.box.x), Y(r.box.y), r.box.w * s, r.box.h * s);
    g.font = '800 16px system-ui, sans-serif'; g.fillStyle = '#ff1744'; g.fillText(`${r.limit}`, X(r.box.x), Y(r.box.y) - 3);
  }
  // Plassering i feltet: strek med midten av feltet og bilen
  const off = v.lane && Number.isFinite(v.lane.offset) ? v.lane.offset : null;
  if (off !== null) {
    const bw = Math.min(220, cw - 40), bx = (cw - bw) / 2, by = ch - Math.max(40, oy + 30);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(bx - 8, by - 14, bw + 16, 28);
    g.fillStyle = '#fff'; g.fillRect(bx, by - 1, bw, 2); g.fillRect(bx + bw / 2 - 1, by - 8, 2, 16);
    const px = bx + bw / 2 + Math.max(-1, Math.min(1, off / 1.6)) * bw / 2;
    g.fillStyle = Math.abs(off) > 0.75 ? '#ff5252' : '#3ddc84'; g.beginPath(); g.arc(px, by, 7, 0, Math.PI * 2); g.fill();
  }
  const n = a => (a || []).length;
  const cars = dets.filter(d => !['person', 'bicycle'].includes(d.cls)), ppl = dets.filter(d => ['person', 'bicycle'].includes(d.cls));
  info.innerHTML = [
    `<div>Veikamera · ${esc(st.perf.dfine || v.dfine || 'ingen bilgjenkjenning')}${v.night ? ' · mørkt' : ''}</div>`,
    `<div>${n(cars)} ${n(cars) === 1 ? 'bil' : 'biler'} · ${n(ppl)} ${n(ppl) === 1 ? 'person' : 'personer'}</div>`,
    `<div>${L ? `Bil foran ${Math.round(L.dist)} m${kmh >= 20 ? ` · ${(L.dist / (kmh / 3.6)).toFixed(1).replace('.', ',')} s` : ''}${L.src === 'baklys' ? ' (baklys)' : ''}` : 'Ingen bil rett foran'}</div>`,
    `<div>${v.lane && v.lane.left && v.lane.right ? `Begge feltlinjer · ${off !== null ? `${Math.abs(off).toFixed(2).replace('.', ',')} m ${off > 0.05 ? 'til høyre' : off < -0.05 ? 'til venstre' : 'midt i'}` : ''}` : v.lane && (v.lane.left || v.lane.right) ? 'Én feltlinje' : 'Ingen feltlinjer'}</div>`,
    `<div>Skilt: ${v.lastSign ? `<strong>${v.lastSign.limit}</strong> (lest ${v.lastSign.reads} ganger, ${Math.round((performance.now() - v.lastSign.at) / 1000)} s siden)` : 'ingen lest ennå'}${liveLimitNow ? ` · grense nå ${liveLimitNow}` : ''}</div>`,
    `<div class="muted">${v.roadBottom ? `Dashbordkant ${Math.round(v.roadBottom * 100)} % (blå strek)` : 'Dashbordkant ikke funnet ennå'}${Number.isFinite(v.lum) ? ` · lys ${v.lum}` : ''}${Number.isFinite(st.perf.dfineMs) && st.perf.dfineMs ? ` · D-FINE ${Math.round(st.perf.dfineMs)} ms` : ''}${st.perf.flowTries ? ` · følger i bildet ${Math.round(100 * st.perf.flowHits / st.perf.flowTries)} %` : ''}</div>`
  ].join('');
}
/* Fullskjerm for førerkameraet (k0.7.6): ansiktet med omriss, øyne og regnbuehinner, en pil for blikket, et kart
   over speilene fra kalibreringen med en prikk for hvor føreren ser nå (fylt: blikket med øynene, ring: bare hodet),
   hva appen tror føreren ser på, og de siste blikkene. Alt glir mykt (punktene 50 ms, blikket 90 ms). */
function drawFaceView(g, cw, ch, v, st, info) {
  if (!v.lm || !v.pose) {
    camEase.face = null;
    info.innerHTML = '<div>Førerkamera</div><div class="muted">Ser ikke ansiktet – juster holderen</div>';
    return;
  }
  const now = performance.now(), dt = Math.min(250, Math.max(0, now - (camEase.t || now)));
  camEase.t = now;
  const a = tau => 1 - Math.exp(-dt / tau);
  // Kamerabildet vises speilvendt med «contain»
  const s = Math.min(cw / v.w, ch / v.h), ox = (cw - v.w * s) / 2, oy = (ch - v.h * s) / 2;
  const X = x => ox + (1 - x) * v.w * s, Y = y => oy + y * v.h * s;
  const c = getCalib(), gz = c ? toGaze(v.pose, c) : v.pose, gc = c ? gazeCalib(c) : null;
  // Glatting av punktene og blikket
  let F = camEase.face;
  if (!F || F.lm.length !== v.lm.length) F = camEase.face = { lm: v.lm.map(p => ({ x: p.x, y: p.y })), yaw: gz.yaw, pitch: gz.pitch, hy: v.pose.yaw, hp: v.pose.pitch };
  else {
    const al = a(50), ag = a(90);
    for (let i = 0; i < v.lm.length; i++) { F.lm[i].x += (v.lm[i].x - F.lm[i].x) * al; F.lm[i].y += (v.lm[i].y - F.lm[i].y) * al; }
    F.yaw += (gz.yaw - F.yaw) * ag; F.pitch += (gz.pitch - F.pitch) * ag; F.hy += (v.pose.yaw - F.hy) * ag; F.hp += (v.pose.pitch - F.hp) * ag;
  }
  const cls = c ? classifyPose({ yaw: F.yaw, pitch: F.pitch }, gc) : 'forward', col = CLASS_COLOR[cls] || '#fff';
  const P = i => [X(F.lm[i].x), Y(F.lm[i].y)];
  const poly = (idx, close = true) => { g.beginPath(); idx.forEach((i, k) => { const [x, y] = P(i); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); if (close) g.closePath(); g.stroke(); };
  // Prikker for hele ansiktet, svakt
  g.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < Math.min(468, F.lm.length); i += 2) { const [x, y] = P(i); g.fillRect(x - 0.75, y - 0.75, 1.5, 1.5); }
  g.lineWidth = 2; g.strokeStyle = col; poly(FACE_OVAL);
  g.strokeStyle = '#fff'; poly(EYE_A); poly(EYE_B);
  // Regnbuehinnene: midten og ring
  if (F.lm.length >= 478) for (const [cI, rI] of [[468, 469], [473, 474]]) {
    const [x, y] = P(cI), [x2, y2] = P(rI), r = Math.max(2, Math.hypot(x2 - x, y2 - y));
    g.strokeStyle = '#4fc3f7'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#4fc3f7'; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
  }
  // Pil fra nesetippen: blikket i forhold til rett fram (eller hodet uten kalibrering)
  const fwd = gc && gc.forward ? gc.forward : { yaw: 0, pitch: 0 };
  const sx = gc && gc.left ? (gc.left.yaw - fwd.yaw < 0 ? 1 : -1) : 1, sp = gc && gc.rear ? (gc.rear.pitch - fwd.pitch > 0 ? 1 : -1) : 1;
  const rx = (F.yaw - fwd.yaw) * sx, ry = (F.pitch - fwd.pitch) * sp;   // rx < 0: mot førerens venstre (venstre på skjermen)
  const [nx, ny] = P(1), L = 3.2 * s * v.w / 100;
  g.lineWidth = 4; g.strokeStyle = col; g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + rx * L / 10, ny - ry * L / 10); g.stroke();
  // Kart over speilene: x = sidelengs, y = opp/ned, i grader fra rett fram
  const mw = Math.min(260, cw - 32), mh = 150, mx = (cw - mw) / 2, my = ch - mh - Math.max(24, oy + 16), k = mw / 100;
  const M = (yy, pp) => [mx + mw / 2 + yy * k, my + mh * 0.62 - pp * k];
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(mx - 8, my - 8, mw + 16, mh + 16);
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(mx, M(0, 0)[1]); g.lineTo(mx + mw, M(0, 0)[1]); g.moveTo(M(0, 0)[0], my); g.lineTo(M(0, 0)[0], my + mh); g.stroke();
  g.font = '600 12px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  if (gc && gc.ok) {
    for (const id of ['forward', ...MIRRORS]) {
      const t = gc[id], [x, y] = M((t.yaw - fwd.yaw) * sx, (t.pitch - fwd.pitch) * sp), on = cls === id;
      g.strokeStyle = CLASS_COLOR[id]; g.lineWidth = on ? 3 : 1.5; g.globalAlpha = on ? 1 : 0.7;
      g.beginPath(); g.arc(x, y, on ? 16 : 12, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff'; g.fillText({ forward: 'Fram', left: 'V', right: 'H', rear: 'Bak' }[id], x, y - 22);
      g.globalAlpha = 1;
    }
  } else { g.fillStyle = '#fff'; g.fillText('Ikke kalibrert', mx + mw / 2, my + 12); }
  // Hodet (ring) og blikket (fylt)
  const hx = (F.hy - (c ? c.forward.yaw : 0)) * sx, hp = (F.hp - (c ? c.forward.pitch : 0)) * sp;
  const clampM = (x, y) => [Math.max(mx, Math.min(mx + mw, x)), Math.max(my, Math.min(my + mh, y))];
  { const [x, y] = clampM(...M(hx, hp)); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke(); }
  { const [x, y] = clampM(...M(rx, ry)); g.fillStyle = col; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
  g.textAlign = 'start'; g.textBaseline = 'bottom';
  const p = v.pose, nowS = now / 1000;
  info.innerHTML = [
    `<div>Førerkamera · <strong style="color:${col}">${c ? CLASS_LABEL[cls] : 'Ser ansiktet'}</strong></div>`,
    `<div>Hode ${Math.round(p.yaw)}° / ${Math.round(p.pitch)}° · ${Number.isFinite(p.ex) ? `øyne ${Math.round(p.ex)}° / ${Math.round(p.ey)}°` : p.blink > 0.55 ? 'øyne lukket' : 'øyne –'}</div>`,
    `<div class="muted">${useGaze(c) ? 'Blikket = hode + øyne' : c ? 'Bare hodet – kalibrer på nytt for å ta med øynene' : 'Ikke kalibrert'} · ${st.fps.toFixed(0)} bilder/s · ${v.faceMs} ms</div>`,
    faceLog.length ? `<div class="muted">${faceLog.map(l => `${CLASS_LABEL[l.cls]} ${l.dur.toFixed(1).replace('.', ',')} s (${Math.round(nowS - l.t)} s siden)`).join('<br>')}</div>` : ''
  ].join('');
}
async function finishRecording() {
  if (!recorder || !recorder.running) return;
  const rec = recorder;
  recorder = null;
  vibrate([60, 60, 60]);
  $('#record').classList.add('busy');
  $('#atk-pop').hidden = true;
  closeCamView();
  // Veikameraet: bildestørrelse, modell og hvor rask telefonen var, lagret med turen
  const cs = cam.state();
  const camInfo = cs.road ? { mode: 'begge', roadSize: cs.roadSize, roadBottom: cs.roadBottom, model: cs.roadModel, perf: cs.perf } : null;
  const drive = await rec.stop();
  if (rec.liveLimits && rec.liveLimits.length) { await updateDrive(drive.id, { liveLimits: rec.liveLimits }); drive.liveLimits = rec.liveLimits; }
  if (camInfo) { await updateDrive(drive.id, { cameraPlan: camInfo }); drive.cameraPlan = camInfo; }
  if (camUnsub) { camUnsub(); camUnsub = null; }
  cam.stopCamera();
  $('#record').classList.remove('busy');
  if (getSettings().autoSpeak) speakNext = drive.id;
  location.hash = '#/rapport/' + drive.id;
  askForReview(drive);
}

/* Vurdering i App Store (iPhone-appen, 0.10.1): etter 5., 15. og 40. ekte tur, bare når turen gikk greit
   (minst 70 poeng). Apple bestemmer selv om spørsmålet vises. Vent til rapporten har vært oppe en stund. */
async function askForReview(drive) {
  if (!window.kjNative || !window.kjNative.review || drive.demo) return;
  const n = (await listDrives()).filter(isReal).length;
  if (![5, 15, 40].includes(n)) return;
  setTimeout(async () => {
    const d = await getDrive(drive.id);
    if (d && d.result && d.result.overall >= 70 && location.hash === '#/rapport/' + drive.id) window.kjNative.review();
  }, 8000);
}

/* Langt trykk (1 s) på Stopp: ringen rundt knappen fylles, og «Hold inne» blir «Hold …». Slipper man før,
   eller ruller siden, avbrytes det. */
function setupLongPress(btn, onDone) {
  let timer = null, startAt = 0, raf = null;
  const fill = btn.querySelector('.stop-fill'), hint = btn.querySelector('.stop-hint');
  const set = p => { fill.style.strokeDashoffset = String(100 - p * 100); };
  const reset = () => {
    if (timer) clearTimeout(timer); timer = null;
    if (raf) cancelAnimationFrame(raf); raf = null;
    btn.classList.remove('pressing');
    hint.textContent = 'Hold inne';
    set(0);
  };
  const tick = () => {
    const p = Math.min(1, (performance.now() - startAt) / 1000);
    set(p);
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  const begin = () => {
    startAt = performance.now(); btn.classList.add('pressing'); hint.textContent = 'Hold …'; vibrate(15); tick();
    timer = setTimeout(() => {
      timer = null;
      if (raf) cancelAnimationFrame(raf); raf = null;
      set(1); btn.classList.remove('pressing'); btn.classList.add('done'); hint.textContent = 'Stoppet';
      setTimeout(() => { btn.classList.remove('done'); hint.textContent = 'Hold inne'; set(0); }, 1500);
      onDone();
    }, 1000);
  };
  btn.addEventListener('pointerdown', e => { if (e.button > 0) return; btn.setPointerCapture?.(e.pointerId); begin(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, () => { if (timer) reset(); }));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !timer && !e.repeat) { e.preventDefault(); begin(); } });
  btn.addEventListener('keyup', () => { if (timer) reset(); });
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
    try { await navigator.share({ title: 'Kjørerapport', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
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
  const tags = [drive.demo ? 'demotur' : '', drive.imported ? 'importert' : ''].filter(Boolean);
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
    const wants = { limits: settings.netLimits !== false, names: settings.netNames !== false };   // på som standard
    const missing = (wants.limits && !(drive.enrich && drive.enrich.limits && drive.enrich.limitsV === LIMITS_V)) || (wants.limits && !(drive.enrich && drive.enrich.road && drive.enrich.road.v === ROAD_V)) || (wants.names && !(drive.enrich && drive.enrich.names));   // road v2: gangfelt, fartsdempere, lyskryss, skilt
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
      hasCalib: !!getCalib(),
      cameraPlan: drive.cameraPlan || null,
      onCalibrate: async useSaved => {
        if (useSaved && getCalib()) { await applyCalibToDrive(id, getCalib()); renderDriveReport(id, { keepScroll: true }); }
        else { calibForDrive = id; location.hash = '#/kamera'; }
      },
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
        // Vanlige feil sagt med vanlige ord (0.10.1): 5xx er Statens vegvesen, ellers som regel nettet
        const m = String(err && err.message || err);
        const why = /svarte 5\d\d/.test(m) ? 'Statens vegvesen svarer ikke akkurat nå. Prøv igjen om litt.'
          : /Failed to fetch|NetworkError|Load failed|network|offline/i.test(m) || !navigator.onLine ? 'Fant ikke nettet. Fartsgrensene hentes når du er på nett igjen.'
          : 'Kunne ikke hente fartsgrensene (' + m + ').';
        draw({ text: why, error: true });
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
  document.querySelectorAll('input[name=engine]').forEach(r => {
    r.checked = r.value === (settings.engine === 'v1' ? 'v1' : 'v3');
    r.onchange = () => { saveSettings({ ...getSettings(), engine: r.value }); toast(`Analysemotor: ${r.value}.`, { type: 'ok', ms: 2000 }); };
  });
  ['netLimits', 'netNames'].forEach(key => {
    const el = $('#' + key);
    el.checked = settings[key] !== false;
    el.onchange = () => { saveSettings({ ...getSettings(), [key]: el.checked }); };
  });
  // Lyd ved fotobokser: på som standard. Slås den på (eller trykkes «Prøv lyden»), spilles lyden for 300 m før.
  { const el = $('#atkSound'); el.checked = settings.atkSound !== false; el.onchange = () => { saveSettings({ ...getSettings(), atkSound: el.checked }); if (el.checked) { unlockSound(); playSound('naer'); } }; }
  $('#btn-test-sound').onclick = () => { unlockSound(); playSound('varsel'); setTimeout(() => playSound('naer'), 900); setTimeout(() => playSound('fart'), 1900); };
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
  $('#persist-status').textContent = window.kjNative ? 'Turene lagres i appen på denne telefonen. De slettes bare hvis du sletter dem selv eller fjerner appen. Ta kopi før du bytter telefon.'
    : persistState === true ? 'Varig lagring er på. Nettleseren skal ikke slette turene dine.'
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
  // Utvikleralternativ: trykk 7 ganger på versjonsnummeret. I iPhone-appen bare i Xcode og TestFlight
  // (Apple tillater ikke skjulte funksjoner i App Store-utgaven).
  let taps = 0, last = 0;
  $('#version').onclick = async () => {
    const now = Date.now();
    taps = now - last < 1500 ? taps + 1 : 1; last = now;
    if (taps < 7) return;
    taps = 0;
    if (window.kjNative) { const info = window.kjNative.info ? await window.kjNative.info() : null; if (!info || !info.devTools) return; }
    $('#dev-section').hidden = false;
  };
  // Demoen spilles av med telefonen «montert» skrått, så akselerometerdata og v3-motoren også testes.
  $('#btn-play-demo').onclick = () => { startRecording({ data: makeDemo(7, { yaw: 0.7, pitch: 0.35 }), speed: 10 }); location.hash = '#/opptak'; };
  $('#btn-dev-demo').onclick = () => startRecording({ data: makeDemo(7, { yaw: 0.7, pitch: 0.35 }), speed: 60 });
  const thumbs = $('#roadThumbs');
  thumbs.checked = !!getSettings().roadThumbs;
  thumbs.onchange = () => saveSettings({ ...getSettings(), roadThumbs: thumbs.checked });
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
  $('#th-status').textContent = s.th ? 'Egne terskler er i bruk.' : 'Standard terskler.';
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
  if (!(await shareFile(toJSON(payload), `kjorerapport-sikkerhetskopi-${new Date().toISOString().slice(0, 10)}.json`))) { toast('Sikkerhetskopien ble ikke lagret.', { type: 'info' }); return; }
  saveSettings({ ...getSettings(), lastBackupAt: new Date().toISOString() });
  toast(`Sikkerhetskopi med ${items.length} ${items.length === 1 ? 'tur' : 'turer'} og innstillinger er laget.`, { type: 'ok' });
}

/* Deler filen (delearket: Filer, AirDrop, e-post), ellers lastes den ned. Svarer false hvis delingen ble avbrutt. */
async function shareFile(json, name) {
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kjørerapport' }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}

/* ---------- Intro ved første start ---------- */
/* Vises én gang, før første tur. Sidene ligger side om side og sveipes (scroll-snap); knappen og prikkene
   blar i samme rad. Lukkes med «Kom i gang», «Hopp over» eller demoturen, og kan vises igjen fra Innstillinger. */
let introOpen = false;
function openIntro() {
  if (introOpen) return;
  introOpen = true;
  const box = $('#intro'), pagesEl = $('#intro-pages'), pages = [...pagesEl.children], dots = $('#intro-dots');
  const next = $('#intro-next'), skip = $('#intro-skip'), demo = $('#intro-demo');
  const opener = document.activeElement;
  dots.innerHTML = pages.map((_, i) => `<button type="button" aria-label="Side ${i + 1} av ${pages.length}"></button>`).join('');
  let cur = -1;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goTo = i => pagesEl.scrollTo({ left: i * pagesEl.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  const setPage = i => {
    if (i === cur) return;
    cur = i;
    const last = i === pages.length - 1;
    pages.forEach((p, k) => { p.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    [...dots.children].forEach((d, k) => { d.classList.toggle('on', k === i); if (k === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
    next.textContent = last ? 'Kom i gang' : 'Fortsett';
    demo.style.visibility = last ? '' : 'hidden';   // plassen holdes av, så knappen står stille
    skip.style.visibility = last ? 'hidden' : '';
  };
  const close = then => {
    saveSettings({ ...getSettings(), introSeen: true });
    box.hidden = true; introOpen = false;
    document.body.classList.remove('intro-open');
    pagesEl.onscroll = null;
    if (then) then(); else if (opener && opener.focus) opener.focus();
  };
  pagesEl.onscroll = () => setPage(Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth)));
  [...dots.children].forEach((d, k) => { d.onclick = () => goTo(k); });
  next.onclick = () => { if (cur < pages.length - 1) goTo(cur + 1); else close(); };
  skip.onclick = () => close();
  demo.onclick = () => close(() => { location.hash = '#/demo'; });
  box.hidden = false;
  document.body.classList.add('intro-open');
  pagesEl.scrollLeft = 0;
  setPage(0);
  $('#intro-t1').setAttribute('tabindex', '-1');
  $('#intro-t1').focus({ preventScroll: true });
}

/* ---------- Ruting ---------- */
/* Fanelinjen (v0.9.16): hvilken fane som er valgt, og om linjen vises. Skjult før og under kjøring og på
   kameraskjermen (en oppgave med fokus). En rapport hører til fanen den ble åpnet fra. */
const TAB_ROOTS = { '#/': 'home', '#/logg': 'trips', '#/opplaering': 'plan', '#/trafikklaerer': 'teacher' };
let lastTab = '#/';
function updateTabbar(h) {
  const bar = $('#tabbar');
  if (!bar) return;
  const hide = ['#/sjekk', '#/opptak', '#/kamera'].includes(h);
  bar.hidden = hide;
  document.body.classList.toggle('has-tabbar', !hide);
  if (TAB_ROOTS[h]) lastTab = h;
  const active = TAB_ROOTS[h] || ({ '#/demo': 'home', '#/innstillinger': 'home', '#/guider': 'home', '#/faresteder': 'plan' })[h] || TAB_ROOTS[lastTab];
  bar.querySelectorAll('a').forEach(a => {
    const on = a.dataset.tab === active;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
/* Tilbake: fra en rapport til fanen den kom fra, fra Faresteder til Opplæring, ellers til Hjem */
function goBack() {
  const h = location.hash;
  location.hash = h === '#/faresteder' ? '#/opplaering' : h === '#/guider' ? (guidesFrom || '#/') : (h.startsWith('#/rapport/') || h === '#/demo') ? lastTab : '#/';
}

/* Overlegg som låser siden (fullskjerm kart og kamera) lukkes ved hvert skjermbytte. Før 0.10.1 kunne «Tilbake»
   med kartet i fullskjerm la body stå med overflow: hidden, og da kunne ingenting i appen rulles. */
function releaseOverlays() {
  document.body.classList.remove('map-open');
  if (!introOpen) document.body.classList.remove('intro-open');
  closeMapOverlay();
  closeCamView();
}

let guidesFrom = null, prevHash = null;   // Guider åpnes fra Hjem eller Innstillinger, og «Tilbake» går dit
function route() {
  const h = location.hash || '#/';
  if (h === '#/guider' && prevHash !== '#/guider') guidesFrom = prevHash;
  prevHash = h;
  if (recorder && recorder.running && h !== '#/opptak') { location.hash = '#/opptak'; return; }
  releaseOverlays();
  updateTabbar(h);
  if (stopPrecheck && h !== '#/sjekk') { stopPrecheck(); stopPrecheck = null; }
  if (!h.startsWith('#/rapport/') && h !== '#/kamera' && h !== '#/sjekk') stopSpeaking();
  if (h !== '#/kamera') calibForDrive = null;
  // Kameraet står bare på i kameratesten, før kjøring og under opptak
  if (!['#/kamera', '#/sjekk', '#/opptak'].includes(h) && cam.state().running && !(recorder && recorder.running)) { cam.stopCamera(); if (camUnsub) { camUnsub(); camUnsub = null; } }
  if (h === '#/') renderHome();
  else if (h === '#/sjekk') renderPrecheck();
  else if (h === '#/opptak') { if (!recorder) location.hash = '#/'; }
  else if (h === '#/demo') renderDemoReport();
  else if (h === '#/demotur') { location.replace('#/opptak'); startRecording({ data: makeDemo(7, { yaw: 0.7, pitch: 0.35 }), speed: 10 }); }   // demoturen direkte (Avansert, testing)
  else if (h === '#/innstillinger') renderSettings();
  else if (h === '#/logg') renderLog();
  else if (h === '#/trafikklaerer') renderTeacher();
  else if (h === '#/faresteder') renderSpots();
  else if (h === '#/opplaering') renderPlan();
  else if (h === '#/kamera') renderCamera();
  else if (h === '#/guider') renderGuides();
  else if (h.startsWith('#/rapport/')) renderDriveReport(h.slice('#/rapport/'.length));
  else location.hash = '#/';
}

function init() {
  applyTheme();
  hydrateIcons();
  ['home', 'precheck', 'record', 'report', 'settings', 'log', 'spots', 'plan', 'camera', 'teacher', 'guides'].forEach(n => { screens[n] = document.getElementById(n); });
  $('#btn-go-precheck').onclick = () => { location.hash = '#/sjekk'; };
  $('#btn-go-camera').onclick = () => { location.hash = '#/kamera'; };
  $('#btn-demo').onclick = () => { location.hash = '#/demo'; };
  $('#btn-settings').onclick = () => { location.hash = '#/innstillinger'; };
  $('#btn-show-intro').onclick = () => openIntro();
  document.querySelectorAll('.btn-back').forEach(b => b.onclick = goBack);
  setupLongPress($('#btn-stop'), finishRecording);
  $('#btn-update').onclick = () => { if (swUpdateReady) swUpdateReady.postMessage('skipWaiting'); };
  $('#btn-check-update').onclick = async () => {
    if (!swReg) { toast('Oppdatering virker bare i appen fra nettadressen, ikke lokalt.', { type: 'info' }); return; }
    if (swUpdateReady) { $('#update-banner').hidden = false; toast('Ny versjon er klar. Trykk «Oppdater nå».', { type: 'ok' }); return; }
    toast('Ser etter ny versjon …', { ms: 1500 });
    try { await swReg.update(); } catch { toast('Fant ikke nettet. Prøv igjen med nett.', { type: 'error' }); return; }
    if (swReg.waiting || swUpdateReady) { swUpdateReady = swUpdateReady || swReg.waiting; $('#update-banner').hidden = false; toast('Ny versjon er klar. Trykk «Oppdater nå».', { type: 'ok' }); }
    else if (swReg.installing) toast('Laster ned ny versjon … «Oppdater nå» kommer om noen sekunder.', { type: 'ok', ms: 4000 });
    else toast(`Du har siste versjon (${APP_VERSION}).`, { type: 'ok' });
  };
  $('#version').textContent = `Kjørerapport versjon ${APP_VERSION}`;
  if (window.kjNative) $('#btn-check-update').parentElement.hidden = true;   // iPhone-appen oppdateres via App Store
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
  // iPhone-appen har filene i seg og oppdateres via App Store: ingen service worker
  if (!('serviceWorker' in navigator) || window.kjNative) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    swReg = reg;
    const ready = w => { swUpdateReady = w; $('#update-banner').hidden = false; };
    // En ny versjon som allerede ligger og venter (lastet ned forrige gang appen var åpen), vises med en gang.
    // Før ventet appen på en hendelse som allerede hadde skjedd, så «Oppdater nå» kom aldri (v0.9.5).
    const track = w => {
      if (!w) return;
      if (w.state === 'installed' && navigator.serviceWorker.controller) { ready(w); return; }
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ready(w); });
    };
    track(reg.waiting); reg.addEventListener('updatefound', () => track(reg.installing));
    // iPhone henter appen fram fra bakgrunnen uten å laste den på nytt, og ser da ikke etter ny versjon.
    // Se etter når appen blir synlig, og hver halvtime.
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || (recorder && recorder.running)) return;
      refreshing = true; location.reload();
    });
  }).catch(err => console.warn('Service worker feilet', err));
}

document.addEventListener('DOMContentLoaded', init);
