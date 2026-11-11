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
import { createLiveLimit, createLiveRoad } from './livelimit.js';
import { trackCurvature, aheadCurvature, kappaPrior } from './roadshape.js';
import { createAtkSounds, unlockSound, playSound } from './sound.js';
import { createSpeedWarn } from './speedwarn.js';
import { SURFACES, SURFACE_LABEL, surfaceFactor, suggestSurface, surfaceSplit, dayKey } from './surface.js';
import { CLASS_LABEL, CALIB_STEPS, MIRRORS, closeMirrorText, calibrationFromSamples, classifyPose, evaluateMirrors, toGaze, gazeCalib, useGaze } from './camera.js';
import { roadSummary } from './road.js';
import { laneX, scaleLane } from './lanes.js';
import { createCamLimit } from './signs.js';
import { GUIDES, guideFor, isDarkSeason } from './guides.js';
import { hasPlus, plusState, refreshPlus, buyPlus, restorePlus, redeemPlus, startTrial, trialActive, trialDaysLeft, onPlusChange, setDevPlus, reportLocked, gateFor, PLUS_FEATURES, FREE_REPORTS } from './plus.js';
import { readiness, READY_TEXT } from './readiness.js';
import { checkCalibration, facePosition } from './calibcheck.js';
import { openDevChart } from './devchart.js';
import { gameState, unlockedBy, BADGES } from './game.js';
import { createTestDrives, removeTestDrives, TEST_STUDENTS } from './testdata.js';
import { VIEW_MODES, setViewMode, viewMode, isTeacher, isSchool, plusFor, modeFromLegacy, schoolInfo, students, scopeDriver, personKey, recordDriver, homeworkFor } from './modes.js';

export const APP_VERSION = '0.13.7';
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
  // Bare til toppen når skjermen byttes: før 0.11.3 hoppet Opplæring til toppen for hvert kryss (skjermen tegnes på nytt)
  if (changed) window.scrollTo(0, 0);
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
  // Føre (0.12.0): på glatt føre er grensene for brå bremsing, gass og sving lavere
  const sf = surfaceFactor(drive.surface);
  if (sf !== 1) opts.factor = +(opts.factor * sf).toFixed(3);
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

/* Kamerakortet under Innstillinger (0.12.0, før på Hjem) */
function updateCamCard() {
  const settings = getSettings(), calibrated = !!getCalib();
  $('#btn-go-camera').classList.toggle('warn', hasPlus() && !!settings.cameraOn && !calibrated);
  $('#cam-card-text').textContent = !hasPlus() ? (plusState().trialAvailable ? 'Prøv Pluss gratis i 14 dager: speil- og skulderblikk, og bilen foran og feltlinjene med veikameraet.' : 'Med Pluss: speil- og skulderblikk, og bilen foran og feltlinjene med veikameraet.')
    : !settings.cameraOn ? 'Kalibrer og se hva kameraet oppfatter, før dere tar det med på tur.'
    : calibrated ? (roadWanted() ? 'Kalibrert og slått på, med veikameraet samtidig. Trykk for å teste.' : 'Kalibrert og slått på. Trykk for å teste eller kalibrere på nytt.')
    : 'Ikke kalibrert. Trykk her og kalibrer før turen – det tar 30 sekunder.';
}

/* ---------- Hjem ---------- */
let homeSeq = 0;
async function renderHome() {
  show('home');
  const tok = ++homeSeq, stale = () => tok !== homeSeq;   // en eldre tegning skal ikke skrive over en nyere (0.12.0)
  ensureStudent();
  const settings = getSettings();
  const list = $('#drive-list');
  if (!list.children.length || list.querySelector('.empty')) list.innerHTML = '<li class="skeleton-row"></li><li class="skeleton-row"></li><li class="skeleton-row"></li>';
  const me = settings.name || settings.activeDriver || '';
  $('#start-hello').textContent = isTeacher() ? (settings.activeStudent ? `Kjøretime med ${settings.activeStudent}` : 'Velg en elev') : me ? `Hei, ${me}!` : 'Klar for en tur?';
  $('#btn-go-precheck').lastChild.textContent = isTeacher() ? 'Start kjøretime' : 'Start kjøretur';
  const calibrated = !!getCalib();
  updateCamCard();
  const allDrives = await listDrives();
  if (stale()) return;
  for (const d of allDrives) if (d.status === 'recording') { d.status = 'done'; d.interrupted = true; await putDrive(d); }

  // Elever (0.12.0): bare trafikklæreren bytter mellom elever. Eleven ser alle sine egne turer.
  const studs = isTeacher() ? students(settings) : [];
  const filter = isTeacher() ? (settings.activeStudent || '') : '';
  const chips = $('#driver-chips');
  if (isTeacher()) {
    chips.innerHTML = studs.map(x => `<button type="button" class="chip ${x.name === filter ? 'on' : ''}" data-d="${esc(x.name)}" aria-pressed="${x.name === filter}">${esc(x.name)}</button>`).join('')
      + `<button type="button" class="chip add" id="btn-chip-add">${icon('plus', 16)}Elev</button>`;
    chips.hidden = false;
    chips.querySelectorAll('.chip[data-d]').forEach(c => c.onclick = () => { saveSettings({ ...getSettings(), activeStudent: c.dataset.d }); renderHome(); });
    $('#btn-chip-add').onclick = () => { location.hash = '#/trafikklaerer'; };
  } else chips.hidden = true;
  const drives = isTeacher() ? allDrives.filter(d => (d.driver || '') === filter) : allDrives;

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
  if (stale()) return;

  // Liste gruppert etter tid
  let html = '', lastGroup = '';
  for (const { d, res } of rows) {
    const g = groupLabel(d.startedAt);
    if (g !== lastGroup) { html += `<li class="group-head">${esc(g)}</li>`; lastGroup = g; }
    const tags = [d.demo ? 'demo' : '', d.imported ? 'importert' : '', d.interrupted ? 'avbrutt' : ''].filter(Boolean);
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
  list.innerHTML = rows.length ? html : `<li class="empty"><span class="empty-ico">${icon('wheel', 40)}</span><strong>${isTeacher() ? (filter ? `Ingen kjøretimer med ${esc(filter)} enda` : 'Velg eller legg til en elev') : 'Ingen turer enda'}</strong><span class="muted small">Første rapport kommer når dere har kjørt en tur.</span></li>`;
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
          ${diff ? `<span class="delta-pill ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '▲ ' + diff : diff < 0 ? '▼ ' + -diff : '='} fra forrige</span>` : ''}</span></span>
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

  // Kjøreutvikling (0.12.0): 0–100, trykk for full skjerm med zoom og perioder (js/devchart.js)
  const chrono = results.slice().reverse();
  const mode = settings.trendMode === 'cats' ? 'cats' : 'total';
  const devData = rows.filter(x => x.res && isReal(x.d)).reverse().map(x => ({ id: x.d.id, t: Date.parse(x.d.startedAt), overall: x.res.overall, scores: x.res.scores, km: x.res.stats.km }));
  $('#trend').innerHTML = chrono.length >= 2 ? `<div class="trend-head"><h2 class="card-title">${icon('chart')}Kjøreutvikling</h2>
      <div class="mini-seg" role="group" aria-label="Vis">
        <button type="button" data-m="total" class="${mode === 'total' ? 'on' : ''}" aria-pressed="${mode === 'total'}">Samlet</button>
        <button type="button" data-m="cats" class="${mode === 'cats' ? 'on' : ''}" aria-pressed="${mode === 'cats'}">Kategorier</button>
      </div></div>
      <button type="button" class="trend-open" aria-label="Åpne kjøreutviklingen i full skjerm">${mode === 'cats' ? categoryTrendChart(chrono) : trendChart(chrono.map(r => r.overall), Number.isFinite(gScore) ? gScore : null)}
      <span class="trend-zoom">${icon('zoom', 16)}Trykk for å zoome og velge periode</span></button>` : '';
  $('#trend').querySelectorAll('.mini-seg button').forEach(b => b.onclick = () => { saveSettings({ ...getSettings(), trendMode: b.dataset.m }); renderHome(); });
  const to = $('#trend .trend-open');
  if (to) to.onclick = () => openDevChart(devData, { goal: Number.isFinite(gScore) ? gScore : null, mode, onOpen: id => { location.hash = '#/rapport/' + id; } });
  if (!allDrives.length && !settings.introSeen) openIntro();

  // Dagens forslag i startkortet
  const sugRows = await gatherRows(scopeDriver(settings));
  if (stale()) return;
  // Fremgang (0.12.0): nivå, ukesringer, uker på rad og merker
  const gc = $('#game-card');
  if (sugRows.length) {
    const g = gameState(sugRows);
    gc.innerHTML = gameCardHtml(g);
    gc.hidden = false;
    gc.querySelector('button').onclick = () => { location.hash = '#/fremgang'; };
  } else gc.hidden = true;
  // Lekser fra læreren (skolevisningen)
  const hh = $('#homework-home');
  const hw = isSchool() ? homeworkFor(settings) : null;
  hh.innerHTML = hw ? homeworkCardHtml(hw, false) : '';
  hh.hidden = !hw;
  const sug = suggestFocus(sugRows);
  const sl = $('#suggest-line');
  if (sug.length) { sl.textContent = `Forslag i dag: ${sug.map(x => (FOCUS.find(f => f.id === x.id) || {}).label).join(', ').toLowerCase()}`; sl.hidden = false; } else sl.hidden = true;

  // Påminnelse om sikkerhetskopi
  const bb = $('#backup-banner');
  const realCount = allDrives.filter(isReal).length;
  // Hjelp for nye brukere forsvinner når de har kommet i gang (0.11.5): demoturen ligger da under Innstillinger
  $('#btn-demo').hidden = realCount >= 3;
  $('#start-sub').hidden = realCount >= 3;
  const lastB = settings.lastBackupAt ? Date.parse(settings.lastBackupAt) : 0;
  const newSince = allDrives.filter(d => isReal(d) && Date.parse(d.startedAt) > lastB).length;
  const snoozed = settings.backupSnoozeUntil && Date.parse(settings.backupSnoozeUntil) > Date.now();
  if (realCount >= 2 && newSince >= 2 && Date.now() - lastB > 7 * 86400000 && !snoozed) {
    bb.innerHTML = `<span>${icon('shield', 20)}<span>${newSince} turer er ikke sikkerhetskopiert.</span></span><span class="banner-actions"><button type="button" class="link" id="btn-bb-later">Senere</button><button type="button" class="btn small-btn secondary" id="btn-bb-now">Ta kopi</button></span>`;
    bb.hidden = false;
    $('#btn-bb-now').onclick = async () => { await backupAll(await listDrives()); bb.hidden = true; };
    $('#btn-bb-later').onclick = () => { saveSettings({ ...getSettings(), backupSnoozeUntil: new Date(Date.now() + 7 * 86400000).toISOString() }); bb.hidden = true; };
  } else bb.hidden = true;


  // Faresteder og opplæring
  const more = $('#more-cards');
  if (sugRows.length || realCount) {
    const allRows = sugRows;
    const spots = hotspots(allRows.map(x => ({ id: x.d.id, points: x.res.points, items: hotspotItems(x) })));
    const plan = planProgress(allRows);
    const rd = readiness(allRows, { plan: planState().mine });
    more.innerHTML = `<button type="button" class="card t-cta" id="btn-go-teacher"><span class="card-title">${icon('school')}Til trafikklæreren</span><span class="muted small">Det som er øvd siden forrige kjøretime, klart til å vise fram eller dele</span><span class="last-cta">Åpne ${icon('chev', 18)}</span></button>
      ${spots.length ? `<button type="button" class="card mini-card" id="btn-go-spots"><span class="card-title">${icon('pin')}Faresteder</span><strong>${spots.length}</strong><span class="muted small">${spots.length === 1 ? 'sted' : 'steder'} med flere hendelser</span></button>` : ''}
      <button type="button" class="card mini-card" id="btn-go-plan"${spots.length ? '' : ' style="grid-column: 1 / -1"'}><span class="card-title">${icon('school')}Opplæring</span><strong>${plan.done} av ${plan.total}</strong><span class="muted small">punkter krysset av</span></button>`;
    more.hidden = false;
    if (spots.length) $('#btn-go-spots').onclick = () => { location.hash = '#/faresteder'; };
    $('#btn-go-plan').onclick = () => { location.hash = '#/opplaering'; };
    $('#btn-go-teacher').onclick = () => { location.hash = '#/trafikklaerer'; };
    // «Hva må du øve mer på?» (0.12.0, før «Klar for oppkjøring?»): eget kort på Hjem, gratis å se, skjermen hører til Pluss
    const rc = $('#ready-card');
    rc.innerHTML = `<button type="button" class="card t-cta ready-cta lv-${rd.level}" id="btn-go-ready"><span class="card-title">${icon('flag')}${esc(practiceTitle())}${hasPlus() ? '' : `<span class="lock-tag">${icon('lock', 14)}Pluss</span>`}</span>${rd.next[0] ? `<span class="ready-next">${esc(rd.next[0].label)}</span>` : ''}<span class="ready-mini"><strong>${rd.done} av ${rd.counted}</strong> <span class="muted small">på plass før oppkjøringen</span></span><span class="goal-bar"><span style="width:${rd.counted ? Math.round(rd.done / rd.counted * 100) : 0}%"></span></span><span class="last-cta">Se alt ${icon('chev', 18)}</span></button>`;
    rc.hidden = false;
    $('#btn-go-ready').onclick = () => { location.hash = '#/klar'; };
  } else { more.hidden = true; $('#ready-card').hidden = true; }
  $('#update-banner').hidden = !swUpdateReady;
  renderInstallHint();
}

function logFor(d, res) {
  const limits = d.enrich && Array.isArray(d.enrich.limits) && d.enrich.limits.length === res.points.length ? d.enrich.limits.map(v => (v === null ? NaN : v)) : null;
  const log = driveLog(res, Date.parse(d.startedAt), limits);
  log.surface = surfaceSplit(d.surface, log.total.sec);   // føre (0.12.0)
  return log;
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

/* ---------- Kjørerapport Pluss (0.11.0) ---------- */
/* Pluss-siden: hva Pluss gir (funksjonen brukeren kom fra øverst), pris, kjøp, gjenopprett og kode fra trafikkskolen */
async function renderPlus(feature = null) {
  show('pluss');
  const root = $('#plus-root');
  const draw = () => {
    const st = plusState(), owned = hasPlus();
    const order = feature && PLUS_FEATURES[feature] ? [feature, ...Object.keys(PLUS_FEATURES).filter(k => k !== feature)] : Object.keys(PLUS_FEATURES);
    const price = st.price ? `Kjøp for ${esc(st.price)}` : 'Kjøp Pluss';
    const owns = st.owned || st.dev === true || !st.native, trial = owned && !owns && trialActive(), canTrial = !owned && st.native && st.trialAvailable;
    const days = trialDaysLeft(), endTxt = st.trialEnd ? new Date(st.trialEnd).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' }) : '';
    root.innerHTML = `
      <section class="plus-hero">
        <span class="plus-badge">${icon('check', 18)}Pluss</span>
        <h2>${trial ? `Prøveperioden: ${days} ${days === 1 ? 'dag' : 'dager'} igjen` : owned ? 'Du har Pluss. Takk!' : feature && PLUS_FEATURES[feature] ? `${esc(PLUS_FEATURES[feature].title)} er en del av Pluss` : 'Få mer ut av øvingskjøringen'}</h2>
        <p>${trial ? `Alt i Pluss er låst opp til ${esc(endTxt)}. Etterpå er det gratis delene som før, og alle turene dine er med videre. Kjøper du, beholder du Pluss for godt.` : owned ? 'Alt i appen er låst opp, for hele familien med Familiedeling.' : 'Ett kjøp, ikke abonnement. Gjelder til førerkortet er i boks, og for hele familien med Familiedeling.'}</p>
      </section>
      <section class="card plus-list">${order.map(k => { const f = PLUS_FEATURES[k]; return `<div class="plus-item${k === feature && !owned ? ' focus' : ''}"><span class="plus-ico">${icon(f.icon, 22)}</span><span><strong>${esc(f.title)}</strong><span class="muted small">${esc(f.text)}</span></span>${owned ? `<span class="plus-ok">${icon('check', 18)}</span>` : ''}</div>`; }).join('')}</section>
      ${owned && !trial ? `<button type="button" class="btn secondary" id="plus-back">Tilbake</button>` : `
      ${canTrial ? `<button type="button" class="btn primary plus-buy" id="plus-trial">Prøv gratis i 14 dager</button>` : ''}
      <button type="button" class="btn ${canTrial ? 'secondary' : 'primary'} plus-buy" id="plus-buy"${st.native && !st.available && st.loaded ? ' aria-describedby="plus-note"' : ''}>${price}</button>
      <p class="muted small center" id="plus-note">${st.native && st.loaded && !st.available ? 'Får ikke kontakt med App Store akkurat nå. Prøv igjen med nett.' : canTrial ? 'Prøven er gratis og stopper av seg selv etter 14 dager. Ingenting trekkes, og det fornyes ikke.' : `Betales med Apple-ID-en din. Ingen automatisk fornyelse.${!owned && st.native && st.trialEnd ? ' Prøveperioden er brukt.' : ''}`}</p>`}
      ${owned && !trial ? '' : `
      <div class="plus-links"><button type="button" class="link" id="plus-restore">Gjenopprett kjøp</button><button type="button" class="link" id="plus-code">Kode fra trafikkskolen</button></div>`}
      <p class="muted small plus-free">Gratis for alle: opptak, rapport, kart, fartsgrense, fotoboksvarsel, kjørelogg og rapportene for de ${FREE_REPORTS} siste turene. Turene dine er alltid dine: de kan eksporteres og tas kopi av, også uten Pluss.</p>`;
    const back = root.querySelector('#plus-back');
    if (back) back.onclick = () => goBack();
    const act = async (btn, fn, okText) => {
      btn.disabled = true; const old = btn.textContent; btn.textContent = 'Venter på App Store …';
      const r = await fn();
      btn.disabled = false; btn.textContent = old;
      if (r.error === 'avbrutt') return;
      if (fn === startTrial ? r.owned : r.bought) { vibrate([30, 60, 30]); toast(okText, { type: 'ok' }); if (gateFor(location.hash)) route(); else draw(); return; }
      if (r.error === 'avbrutt') return;
      if (!r.error && fn === redeemPlus) { toast('Koden behandles. Pluss låses opp av seg selv når App Store har godkjent den.', { ms: 5000 }); return; }
      if (r.error === 'venter') { infoDialog({ title: 'Venter på godkjenning', text: 'Kjøpet må godkjennes (for eksempel av en forelder med «Spør før kjøp»). Pluss låses opp av seg selv når det er godkjent.' }); return; }
      if (r.error) infoDialog({ title: 'Kjøpet gikk ikke', text: r.error });
      else if (fn === restorePlus) infoDialog({ title: 'Fant ikke Pluss', text: 'Det er ikke kjøpt Pluss med denne Apple-ID-en. Er det kjøpt av noen andre i familien, må Familiedeling være slått på.' });
    };
    const buy = root.querySelector('#plus-buy');
    if (buy) buy.onclick = () => act(buy, buyPlus, 'Pluss er låst opp. God tur!');
    const tr = root.querySelector('#plus-trial');
    if (tr) tr.onclick = () => act(tr, startTrial, 'Prøveperioden er i gang: Pluss er låst opp i 14 dager.');
    const res = root.querySelector('#plus-restore');
    if (res) res.onclick = () => act(res, restorePlus, 'Pluss er gjenopprettet.');
    const code = root.querySelector('#plus-code');
    if (code) code.onclick = () => act(code, redeemPlus, 'Koden er brukt. Pluss er låst opp.');
  };
  draw();
  await refreshPlus();
  if (!screens.pluss.hidden) draw();
}

/* Tre små ting som viser Pluss rundt i appen: låsene på fanene, raden i Innstillinger og kamerakortet på Hjem */
function updatePlusMarks() {
  const plus = hasPlus();
  document.querySelectorAll('#tabbar a[data-tab="plan"], #tabbar a[data-tab="teacher"]').forEach(a => a.classList.toggle('locked', !plus));
}

/* ---------- Guider (0.10.1) ---------- */
const guideSteps = g => `<ol class="steps-list">${g.steps.map(([b, t], i) => `<li><span class="step-num">${i + 1}</span><span><strong>${esc(b)}</strong> ${esc(t)}</span></li>`).join('')}</ol>`;

/* Guide-fanen (0.12.0): alle guidene på ett sted nederst i appen, i stedet for kort som dukker opp på Hjem.
   Den som passer best nå (js/guides.js) står øverst og er åpen. */
async function renderGuides() {
  show('guides');
  const s = getSettings(), drives = await listDrives();
  const real = drives.filter(isReal).length;
  const best = guideFor({ real, cameraOn: !!s.cameraOn && hasPlus(), calibrated: !!getCalib(), roadCam: roadWanted(), native: !!window.kjNative, unbacked: 0, dark: isDarkSeason() }, {});
  const order = best ? [best, ...GUIDES.filter(g => g !== best)] : GUIDES;
  $('#guide-list').innerHTML = order.map(g => `<details class="card guide-item" id="guide-${g.id}"${g === best ? ' open' : ''}>
      <summary><span class="guide-ico">${icon(g.icon, 20)}</span><span class="guide-titles">${g === best ? '<span class="eyebrow">Passer nå</span>' : ''}<strong>${esc(g.title)}</strong><span class="muted small">${esc(g.lead)}</span></span>${icon('chev', 18)}</summary>
      ${guideSteps(g)}</details>`).join('');
  $('#btn-guides-intro').onclick = () => openIntro();
}

/* ---------- Kamera ---------- */
const calibKey = () => personKey(getSettings());
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
/* Gikk brukeren fra siden mens kameraet startet? Da slås det av igjen (0.11.3), ellers sto kamera og GPS på i
   bakgrunnen til neste sidebytte. Svarer true når siden er forlatt. */
function leftDuringStart(hash) {
  if (location.hash === hash || (recorder && recorder.running)) return false;
  if (cam.state().running) cam.stopCamera();
  if (camUnsub) { camUnsub(); camUnsub = null; }
  return true;
}

/* Førerens plass fra kalibreringen (0.13.2): førervelgeren i facecam.js starter der, ikke ved det første ansiktet */
const driverHome = () => { const c = getCalib(); return (c && c.pos) || null; };

async function ensureCamera(videoEl, onStatus = () => {}) {
  if (cam.state().running && cam.state().road === roadWanted()) { await cam.attachVideo(videoEl); return; }
  await cam.startCamera(videoEl, { road: roadWanted(), home: driverHome() });
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
    $('#cam-calib-status').innerHTML = c ? `${icon('check', 18)} Kalibrert${c.at ? ' ' + esc(date(c.at)) : ''}. ${c.close ? `${esc(closeMirrorText(c.close))}: kalibrer gjerne på nytt og snu hodet tydeligere.` : 'Kalibrer på nytt hvis holderen er flyttet.'}` : `${icon('info', 18)} Ikke kalibrert ennå. Sett telefonen i holderen der den skal stå under kjøring, og trykk «Kalibrer».`;
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
      if (run === 3 && c && !['forward', 'other', 'none'].includes(cls)) {   // 3 bilder (~0,35 s), som i rapporten
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
      if (leftDuringStart('#/kamera')) return false;
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
let calibAbort = null;   // releaseOverlays avbryter kalibreringen når brukeren går til en annen side (0.11.3)
async function runCalibration() {
  const overlay = $('#calib-overlay'), stepEl = $('#calib-step'), count = $('#calib-count'), progress = $('#calib-progress'), face = $('#calib-face');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let cancelled = false;
  $('#calib-cancel').onclick = () => { cancelled = true; };
  calibAbort = () => { cancelled = true; overlay.hidden = true; stopSpeaking(); };
  overlay.hidden = false;
  const offFace = cam.onPose(p => { face.textContent = p ? 'Kameraet ser ansiktet' : 'Kameraet ser ikke ansiktet – snu deg litt tilbake'; face.dataset.ok = p ? '1' : '0'; });
  const byTarget = {};
  // Den gamle plassen brukes ikke mens det kalibreres (0.13.2): holderen kan være flyttet, og det er derfor de kalibrerer
  cam.setDriverHome(null);
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
      if (cancelled) break;
      byTarget[step.id] = got;
    }
  } finally { offFace(); overlay.hidden = true; calibAbort = null; }
  if (cancelled) { stopSpeaking(); cam.setDriverHome(driverHome()); return null; }
  vibrate([30, 60, 30]);
  const c = calibrationFromSamples(byTarget);
  if (c.ok) {
    const pos = facePosition(byTarget.forward || []);   // hvor ansiktet sto, så appen ser om holderen flytter seg (0.12.0)
    if (pos) c.pos = pos;
    c.at = new Date().toISOString(); saveCalib(c); cam.setDriverHome(driverHome()); speak('Ferdig. Kalibreringen er lagret.');
    // To speil nær hverandre (v0.11.1): lagret, men si fra, så de kan kalibrere på nytt med tydeligere hodebevegelser
    if (c.close) infoDialog({ title: 'Kalibreringen er lagret, men …', text: `${closeMirrorText(c.close)}, så appen kan blande dem. Kalibrer gjerne på nytt og snu hodet tydelig mot hvert speil. Hjelper ikke det, vinkle holderen litt mer mot føreren (den skal fortsatt stå ved rattet).` });
    else toast('Kalibreringen er lagret.', { type: 'ok' });
    return c;
  }
  cam.setDriverHome(driverHome());
  speak('Kalibreringen ble ikke god nok.');
  infoDialog({ title: 'Kalibreringen ble ikke god nok', text: c.problem === 'missing' ? 'Kameraet så ikke ansiktet lenge nok i ett eller flere trinn. Sjekk at ansiktet er godt synlig og at det er lyst nok.' : c.problem === 'close' ? 'Telefonen ser for liten forskjell mellom rett fram og et av speilene. Vinkle holderen litt mer mot føreren (den skal stå ved rattet), og snu hodet tydelig mot speilet.' : 'Venstre og høyre speil ble ikke skilt fra hverandre. Prøv igjen, og snu hodet tydelig.' });
  return null;
}

/* ---------- Kjørelogg ---------- */
async function renderLog() {
  show('log');
  const root = $('#log-root');
  root.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div>';
  const settings = getSettings();
  const filter = isTeacher() ? (settings.activeStudent || '') : '';
  const all = await listDrives(), plus = hasPlus();
  const drives = all.filter(d => isReal(d) && (!filter || d.driver === filter));
  const lockedIds = new Set(drives.filter(d => reportLocked(all, d.id, plus)).map(d => d.id));   // rapporter som krever Pluss
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
  // Faresteder (0.12.1, før under Opplæring): steder der det har skjedd noe flere ganger hører til turene
  const spots = hotspots(rows.map(x => ({ id: x.d.id, points: x.res.points, items: hotspotItems({ ...x, marks: markRows(x.d.marks || [], x.res) }) })));
  const spotsCard = `<button type="button" class="card t-cta spots-cta" id="btn-log-spots"><span class="card-title">${icon('pin')}Faresteder${hasPlus() ? '' : `<span class="lock-tag">${icon('lock', 14)}Pluss</span>`}</span>
      <span class="muted small">${spots.length ? `${spots.length} ${spots.length === 1 ? 'sted' : 'steder'} der det har skjedd noe flere ganger` : 'Steder der det skjer noe flere ganger, vist på kartet'}</span><span class="last-cta">Se på kartet ${icon('chev', 18)}</span></button>`;
  const wkFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
  // Ukenummer (ISO 8601, som i norske kalendere) med mandagens dato under (0.12.1)
  const isoWeek = t => { const d = new Date(t); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const jan4 = new Date(d.getFullYear(), 0, 4, 12); return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7); };
  root.innerHTML = `
    ${filter ? `<p class="eyebrow pad">Elev: ${esc(filter)}</p>` : ''}
    <section class="tiles">
      <div class="tile"><span class="tile-val">${fmtHours(tot.total.sec)}</span><span class="tile-label">kjøretid</span></div>
      <div class="tile"><span class="tile-val">${km(tot.total.km)}</span><span class="tile-label">kjørt</span></div>
      <div class="tile"><span class="tile-val">${rows.length}</span><span class="tile-label">${rows.length === 1 ? 'tur' : 'turer'}</span></div>
      <div class="tile"><span class="tile-val">${fmtHours(tot.light.dark)}</span><span class="tile-label">i mørke</span></div>
    </section>
    <section class="card"><h2 class="card-title">${icon('map')}Veityper</h2>${bar(tot.sec, ['by', 'land', 'motor'], ROAD_LABEL, 'mix')}
</section>
    <section class="card"><h2 class="card-title">${icon('moon')}Lysforhold</h2>${bar(tot.light, ['day', 'twilight', 'dark'], LIGHT_LABEL, 'light')}
</section>
    <section class="card"><h2 class="card-title">${icon('snow')}Føre</h2>${['dry', 'wet', 'snow', 'ice'].some(k => tot.surface[k] > 0) ? `${bar(tot.surface, ['dry', 'wet', 'snow', 'ice'], SURFACE_LABEL, 'surf')}
      ${tot.surface.unknown > 0 ? `<p class="muted small">${fmtHours(tot.surface.unknown)} er kjørt før føre kunne velges.</p>` : ''}` : '<p class="muted small">Føre er ikke valgt på noen tur ennå. Velg det når du starter en tur.</p>'}</section>
    <section class="card"><h2 class="card-title">${icon('chart')}Siste åtte uker</h2>
      <div class="week-bars" role="img" aria-label="Kjøretid per uke">${weeks.map(w => `<div class="wk"><span class="wk-val">${w.sec ? Math.round(w.sec / 60) : ''}</span><span class="wk-bar" style="height:${Math.max(2, w.sec / maxW * 100)}%"></span><span class="wk-lbl"><strong>${isoWeek(w.start)}</strong>${new Date(w.start).getDate()}.${new Date(w.start).getMonth() + 1}.</span></div>`).join('')}</div>
      <p class="muted small">Minutter per uke. Under: ukenummer og mandagens dato.</p></section>
    ${spotsCard}
    <details class="card how-calc"><summary>Slik regnes det</summary>
      <p class="muted small"><strong>Veitype</strong> ut fra fartsgrensen (Statens vegvesen), ellers anslått ut fra farten. <strong>Mørke</strong> er når sola står mer enn 6° under horisonten, skumring mellom 0 og 6°. <strong>Føre</strong> velges før hver tur. På snø og is er grensene for brå bremsing og svinger lavere, fordi bilen har mindre grep.</p></details>
    <h2 class="section-title">Alle turer</h2>
    <ul class="drives log-list card">${rows.map(x => `<li><button type="button" class="drive${lockedIds.has(x.d.id) ? ' locked' : ''}" data-id="${x.d.id}">
      <span class="drive-main"><strong>${esc(shortDay(x.d.startedAt))}</strong>
      <span class="muted small">${[fmtHours(x.log.total.sec), km(x.log.total.km), x.log.light.dark > 60 ? `${fmtHours(x.log.light.dark)} mørke` : ''].filter(Boolean).join(SEP)}</span>
</span>
      ${scoreBadge(x.res.overall, 40)}</button></li>`).join('')}</ul>
    <button type="button" class="btn secondary" id="btn-log-csv2">${icon('download', 20)}Eksporter loggen (regneark)</button>`;
  root.querySelectorAll('.drive').forEach(b => b.onclick = () => { location.hash = '#/rapport/' + b.dataset.id; });
  const csv = () => exportLogCsv(rows, filter);
  root.querySelector('#btn-log-csv2').onclick = csv;
  $('#btn-log-spots').onclick = () => { location.hash = '#/faresteder'; };
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
  const filter = isTeacher() ? (getSettings().activeStudent || '') : '';
  const rows = await gatherRows(scopeDriver(getSettings()));
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
let teacherSeq = 0;
/* Trafikklæreren har alltid en elev valgt når det finnes elever (0.12.0) */
function ensureStudent() {
  if (!isTeacher()) return;
  const s = getSettings(), list = students(s);
  if (list.length && !list.some(x => x.name === s.activeStudent)) saveSettings({ ...s, activeStudent: list[0].name });
}
async function renderTeacher() {
  show('teacher');
  const tok = ++teacherSeq;   // en eldre tegning (f.eks. før visningen ble byttet) skal ikke skrive over denne
  ensureStudent();
  const root = $('#teacher-root');
  const s = getSettings(), key = personKey(s), driver = isTeacher() ? (s.activeStudent || '') : '';
  // Fanen er ulik i hver utgave (0.12.0): eleven viser fram, skoleeleven ser skolen og leksene, læreren har elevene
  $('#teacher-title').textContent = isTeacher() ? 'Elever' : 'Til trafikklæreren';
  $('#t-lead').textContent = isTeacher() ? (driver ? `Det ${driver} har øvd siden forrige time.` : 'Velg en elev over.') : isSchool() ? 'Skolen ser dette automatisk. Du kan også vise det fram eller dele det.' : 'Vis trafikklæreren hva som er øvd siden forrige kjøretime, eller del det som en melding.';
  $('#teacher-top').innerHTML = isTeacher() ? teacherStudentsHtml(s) : isSchool() ? schoolCardHtml(s) : '';
  if (isTeacher()) wireTeacherStudents();
  $('.t-controls').hidden = isTeacher() && !driver;
  $('#btn-teacher-done').hidden = isTeacher() && !driver;
  const lesson = (s.lessons || {})[key] || '';
  let mode = s.teacherPeriod || (lesson ? 'lesson' : '30');
  if (mode === 'lesson' && !lesson) mode = '30';
  document.querySelectorAll('input[name=tperiod]').forEach(r => {
    r.checked = r.value === mode;
    r.onchange = () => { saveSettings({ ...getSettings(), teacherPeriod: r.value }); renderTeacher(); };
  });
  const dateIn = $('#t-lesson'), noteIn = $('#t-note');
  dateIn.value = lesson;
  $('#t-lesson-wrap').classList.toggle('has-value', !!lesson);   // tomt datofelt viser «Velg dato» (iPhone viser ellers et blankt felt)
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
  document.querySelector('#teacher .page-actions').hidden = isTeacher() && !driver;
  if (isTeacher() && !driver) { root.innerHTML = ''; return; }
  const rows = await gatherRows(scopeDriver(s));
  if (tok !== teacherSeq) return;
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

async function addTestStudents() {
  await createTestDrives();
  const cur = getSettings(), list = students(cur).filter(x => !TEST_STUDENTS.some(t => t.name === x.name));
  saveSettings({ ...cur, students: [...list, ...TEST_STUDENTS.map(t => ({ name: t.name, email: t.email, test: true }))], activeStudent: cur.activeStudent || TEST_STUDENTS[0].name,
    homework: { ...(cur.homework || {}), Emma: { focus: ['roundabout', 'brake'], note: 'Kjør rundkjøringene ved Moholt et par ganger, og brems tidlig før rødt lys.', from: 'trafikklæreren', setAt: new Date().toISOString() } } });
  toast('Tre testelever med turer er lagt inn.', { type: 'ok', ms: 2500 });
}
async function removeTestStudents() {
  await removeTestDrives();
  const cur = getSettings(), list = students(cur).filter(x => !x.test);
  saveSettings({ ...cur, students: list, drivers: (cur.drivers || []).filter(n => !TEST_STUDENTS.some(t => t.name === n)), activeStudent: list[0] ? list[0].name : '' });
  toast('Testelevene er fjernet.', { type: 'ok', ms: 2000 });
}
/* ---------- Fremgang (0.12.0) ---------- */
/* Tre ringer inni hverandre, som Aktivitet på Apple Watch: øving (ytterst), variasjon og myk kjøring */
const RING_COLOR = { minutes: 'var(--lv1)', variety: 'var(--lv2)', smooth: 'var(--good)' };
function ringsSvg(rings, size = 96) {
  const c = size / 2, w = size * 0.11;
  return `<svg class="rings" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${rings.map(r => `${r.label} ${Math.round(r.progress * 100)} %`).join(', ')}">${rings.map((r, i) => {
    const rad = c - w / 2 - i * (w + 2), len = 2 * Math.PI * rad;
    return `<circle cx="${c}" cy="${c}" r="${rad}" fill="none" stroke="${RING_COLOR[r.id]}" stroke-opacity=".2" stroke-width="${w}"/>
      <circle class="ring-fill" cx="${c}" cy="${c}" r="${rad}" fill="none" stroke="${RING_COLOR[r.id]}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(len * Math.max(0.001, r.progress)).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>`;
  }).join('')}</svg>`;
}
function gameCardHtml(g) {
  const nb = g.badges.filter(b => b.earned).length;
  return `<button type="button" class="card game-card">
      <span class="game-top">${ringsSvg(g.rings, 92)}
        <span class="game-text"><span class="eyebrow">Nivå ${g.level.n}</span><strong>${esc(g.level.name)}</strong>
          <span class="goal-bar xp"><span style="width:${Math.round(g.level.progress * 100)}%"></span></span>
          <span class="muted small">${g.level.to - g.level.xp} XP til nivå ${g.level.n + 1}</span></span></span>
      <span class="ring-stats">${g.rings.map(r => `<span><span class="dot" style="background:${RING_COLOR[r.id]}"></span><strong>${r.value}${r.id === 'minutes' ? ' min' : ''}</strong><span class="muted small">${esc(r.label.toLowerCase())}</span></span>`).join('')}</span>
      <span class="game-row"><span class="streak">${icon('flame', 18)}<strong>${g.streak}</strong> ${g.streak === 1 ? 'uke' : 'uker'} på rad</span><span class="badge-count">${icon('award', 18)}<strong>${nb}</strong> av ${g.badges.length} merker</span></span>
      <span class="last-cta">Se fremgangen ${icon('chev', 18)}</span>
    </button>`;
}
const badgeHtml = b => `<li class="merke ${b.earned ? 'got' : 'locked'}"><span class="badge-ico">${icon(b.earned ? b.icon : 'lock', 26)}</span><strong>${esc(b.title)}</strong><span class="muted small">${esc(b.text)}</span>${b.earned ? `<span class="muted small badge-at">${esc(date(b.earned.at))}</span>` : ''}</li>`;
async function renderProgress() {
  show('progress');
  const root = $('#progress-root');
  const rows = await gatherRows(scopeDriver(getSettings()));
  if (!rows.length) { root.innerHTML = `<div class="empty card"><span class="empty-ico">${icon('award', 40)}</span><strong>Ingen turer ennå</strong><span class="muted small">Kjør en tur, så får du det første merket.</span></div>`; return; }
  const g = gameState(rows);
  const got = g.badges.filter(b => b.earned), locked = g.badges.filter(b => !b.earned);
  root.innerHTML = `
    <section class="card level-hero"><span class="level-num">${g.level.n}</span><span><span class="eyebrow">Nivå ${g.level.n}</span><h2>${esc(g.level.name)}</h2>
      <span class="goal-bar xp"><span style="width:${Math.round(g.level.progress * 100)}%"></span></span>
      <span class="muted small">${g.level.to - g.level.xp} XP til nivå ${g.level.n + 1}</span></span></section>
    <section class="card"><h2 class="card-title">${icon('target')}Denne uka</h2>
      <div class="rings-big">${ringsSvg(g.rings, 132)}<ul class="ring-list">${g.rings.map(r => `<li><span class="dot" style="background:${RING_COLOR[r.id]}"></span><span><strong>${esc(r.label)}</strong> ${r.value}${r.id === 'minutes' ? ' min' : ''} av ${r.goal}${r.id === 'minutes' ? ' min' : r.id === 'smooth' ? ' i snitt' : ''}
        <span class="muted small">${r.id === 'minutes' ? 'Minutter øvelseskjøring' : r.id === 'variety' ? (r.have.length ? `Har kjørt: ${esc(r.have.join(', '))}` : 'By, landevei, motorvei, mørke, rundkjøring eller glatt føre') : 'Snittpoeng på ukas turer'}</span></span></li>`).join('')}</ul></div>
      <p class="streak big">${icon('flame', 22)}<span><strong>${g.streak} ${g.streak === 1 ? 'uke' : 'uker'} på rad</strong><span class="muted small">${g.streak ? 'Kjør minst én tur i uka for å holde rekka.' : 'Kjør en tur denne uka for å starte en rekke.'}</span></span></p></section>
    ${g.records.length ? `<section class="card"><h2 class="card-title">${icon('star')}Rekorder</h2><ul class="record-list">${g.records.map(r => `<li${r.driveId ? ` data-id="${r.driveId}" class="tap"` : ''}><span>${esc(r.label)}<span class="muted small">${esc(date(r.at))}</span></span><strong>${esc(r.value)}</strong></li>`).join('')}</ul></section>` : ''}
    <h2 class="group-title">${icon('award', 18)}Merker · ${got.length} av ${g.badges.length}</h2>
    <ul class="badge-grid">${got.map(badgeHtml).join('')}${locked.map(badgeHtml).join('')}</ul>
    <p class="muted small center">Du får 1 XP per minutt øving og 25 XP per merke.</p>`;
  root.querySelectorAll('.record-list li.tap').forEach(li => li.onclick = () => { location.hash = '#/rapport/' + li.dataset.id; });
}
/* Det turen låste opp, øverst i rapporten (med en liten feiring første gang den åpnes) */
async function unlockHtml(drive) {
  if (!isReal(drive)) return '';
  const rows = await gatherRows(isTeacher() ? (drive.driver || '') : null);
  const u = unlockedBy(rows, drive.id);
  if (!u || (!u.badges.length && !u.levelUp && !u.records.length)) return '';
  return `<section class="card unlock-card">
      <p class="eyebrow">${icon('star', 16)}Nytt på denne turen · +${u.xpGain} XP</p>
      ${u.levelUp ? `<p class="unlock-level">Nivå ${u.levelUp.n}: <strong>${esc(u.levelUp.name)}</strong></p>` : ''}
      ${u.badges.length ? `<ul class="unlock-badges">${u.badges.map(b => `<li><span class="badge-ico">${icon(b.icon, 24)}</span><span><strong>${esc(b.title)}</strong><span class="muted small">${esc(b.text)}</span></span></li>`).join('')}</ul>` : ''}
      ${u.records.length ? `<p class="unlock-rec">${icon('star', 18)}Ny rekord: ${u.records.map(r => `${esc(r.label.toLowerCase())} (${esc(r.value)})`).join(', ')}</p>` : ''}
      <a class="last-cta" href="#/fremgang">Se fremgangen ${icon('chev', 16)}</a>
    </section>`;
}
function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['var(--lv1)', 'var(--lv2)', 'var(--good)', 'var(--link)', 'var(--brake)'];
  box.innerHTML = Array.from({ length: 36 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${colors[i % colors.length]};animation-delay:${(i % 9) * 60}ms;--dx:${((i * 53) % 80) - 40}px;--r:${(i * 97) % 360}deg"></i>`).join('');
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}

/* Skolekortet (0.12.0): trafikkskolen eleven er koblet til, neste time og leksene fra læreren */
function schoolCardHtml(s) {
  const sc = schoolInfo(s);
  if (!sc) return '';
  const next = sc.nextLesson ? new Date(sc.nextLesson) : null;
  return `<section class="card school-card">
      <p class="eyebrow">${icon('school', 16)}Koblet til trafikkskole</p>
      <h2>${esc(sc.name)}</h2>
      <p class="muted">Lærer: <strong>${esc(sc.teacher)}</strong>${next ? ` · neste time ${esc(cap(dayFmt.format(next)))} kl. ${timeFmt.format(next)}` : ''}</p>
      <p class="sync-line">${icon('check', 16)}<span>Turene deles automatisk med skolen${sc.test ? ' (kommer når delingen er klar – nå er dette en test)' : ''}</span></p>
    </section>${homeworkCardHtml(homeworkFor(s), false)}`;
}
/* Lekser fra læreren: hva eleven skal øve på til neste time */
function homeworkCardHtml(hw, edit) {
  if (!hw && !edit) return '';
  const sel = new Set(hw ? hw.focus || [] : []);
  if (!edit) return `<section class="card homework-card"><h2 class="card-title">${icon('book')}Lekser til neste time</h2>
      <div class="chips wrap">${FOCUS.filter(f => sel.has(f.id)).map(f => `<span class="chip on">${esc(f.label)}</span>`).join('')}</div>
      ${hw.note ? `<p>${esc(hw.note)}</p>` : ''}<p class="muted small">Fra ${esc(hw.from || 'trafikklæreren')}. Velges som dagens øvingsmål når du starter en tur.</p></section>`;
  return `<section class="card homework-card"><h2 class="card-title">${icon('book')}Lekser til neste time</h2>
      <p class="muted small">Velg opptil tre. Eleven ser dem på Hjem og får dem som øvingsmål før turen.</p>
      <div class="chips wrap" id="hw-chips">${FOCUS.map(f => `<button type="button" class="chip ${sel.has(f.id) ? 'on' : ''}" data-f="${f.id}" aria-pressed="${sel.has(f.id)}">${esc(f.label)}</button>`).join('')}</div>
      <label class="field">Beskjed til eleven<textarea id="hw-note" rows="2" placeholder="F.eks. «Kjør gjerne rundkjøringene ved Moholt flere ganger.»">${esc(hw && hw.note || '')}</textarea></label>
    </section>`;
}
/* Trafikklæreren: elevlisten, legg til elev og leksene til eleven som er valgt */
function teacherStudentsHtml(s) {
  const list = students(s), cur = s.activeStudent || '';
  return `<section class="card students-card">
      <h2 class="card-title">${icon('users')}Elevene dine</h2>
      ${list.length ? `<ul class="student-list">${list.map(x => `<li><button type="button" class="student ${x.name === cur ? 'on' : ''}" data-d="${esc(x.name)}"><span class="student-ava" aria-hidden="true">${esc(x.name.slice(0, 1).toUpperCase())}</span><span><strong>${esc(x.name)}</strong><span class="muted small">${x.email ? esc(x.email) : 'Ingen Apple-ID lagt inn'}</span></span>${x.name === cur ? `<span class="tag">Valgt</span>` : ''}</button></li>`).join('')}</ul>`
        : '<p class="muted">Ingen elever ennå. Legg til en elev med navn og e-posten til Apple-ID-en deres.</p>'}
      <div class="add-student"><input id="new-student" type="text" maxlength="40" placeholder="Navn" aria-label="Navn på ny elev"><input id="new-student-mail" type="email" inputmode="email" autocomplete="off" placeholder="E-post (Apple-ID)" aria-label="E-post til elevens Apple-ID"><button type="button" class="btn secondary" id="btn-add-student">${icon('plus', 18)}Legg til</button></div>
      <p class="muted small">Med e-posten deles elevens turer automatisk med deg når delingen er klar. Fram til da kan du ta opp kjøretimer på eleven her, og legge inn testelever for å prøve.</p>
      ${list.some(x => x.test) ? '<button type="button" class="link" id="btn-test-students-del">Fjern testelevene</button>' : '<button type="button" class="link" id="btn-test-students">Legg inn tre testelever med turer</button>'}
    </section>${cur ? homeworkCardHtml(homeworkFor(s, cur), true) : ''}`;
}
function wireTeacherStudents() {
  document.querySelectorAll('#teacher-top .student').forEach(b => b.onclick = () => { saveSettings({ ...getSettings(), activeStudent: b.dataset.d }); renderTeacher(); });
  $('#btn-add-student').onclick = () => {
    const name = $('#new-student').value.trim().slice(0, 40), email = $('#new-student-mail').value.trim().slice(0, 80);
    if (!name) { toast('Skriv navnet til eleven.', { ms: 2000 }); return; }
    const cur = getSettings(), list = students(cur).filter(x => x.name !== name);
    saveSettings({ ...cur, students: [...list, { name, email }], activeStudent: name });
    toast(`${name} er lagt til.`, { type: 'ok', ms: 2000 });
    renderTeacher();
  };
  const t = $('#btn-test-students'), td = $('#btn-test-students-del');
  if (t) t.onclick = async () => { t.disabled = true; t.textContent = 'Lager turer …'; await addTestStudents(); renderTeacher(); };
  if (td) td.onclick = async () => { await removeTestStudents(); renderTeacher(); };
  const chips = $('#hw-chips');
  if (!chips) return;
  const name = getSettings().activeStudent;
  const save = patch => { const cur = getSettings(), hw = { focus: [], note: '', ...(homeworkFor(cur, name) || {}), ...patch, from: 'trafikklæreren', setAt: new Date().toISOString() }; saveSettings({ ...cur, homework: { ...(cur.homework || {}), [name]: hw } }); };
  chips.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    const sel = new Set((homeworkFor(getSettings(), name) || {}).focus || []);
    if (sel.has(c.dataset.f)) sel.delete(c.dataset.f);
    else { if (sel.size >= 3) { toast('Velg høyst tre.', { ms: 2000 }); return; } sel.add(c.dataset.f); }
    save({ focus: [...sel] });
    c.classList.toggle('on', sel.has(c.dataset.f)); c.setAttribute('aria-pressed', sel.has(c.dataset.f));
  });
  $('#hw-note').onchange = e => save({ note: e.target.value.trim().slice(0, 300) });
}

/* ---------- Hva må du øve mer på? (0.12.0, før «Klar for oppkjøring?» fra 0.11.2) ---------- */
const practiceTitle = () => isTeacher() ? 'Hva må eleven øve mer på?' : 'Hva må du øve mer på?';
async function renderReady() {
  show('ready');
  $('#ready-title').textContent = practiceTitle();
  const root = $('#ready-root');
  const driver = isTeacher() ? (getSettings().activeStudent || '') : '';
  root.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div>';
  const rows = await gatherRows(scopeDriver(getSettings()));
  const r = readiness(rows, { plan: planState().mine });
  const t = READY_TEXT[r.level];
  const groups = [...new Set(r.items.map(i => i.group))];
  const mark = i => i.ok === true ? `<span class="rd-ok">${icon('check', 18)}</span>` : i.ok === false ? '<span class="rd-no"></span>' : '<span class="rd-na">–</span>';
  // Det som bør øves på står først (0.12.0), så hvor mye som er på plass før oppkjøringen
  root.innerHTML = `
    ${r.next.length ? `<section class="card rd-next-card"><h2 class="card-title">${icon('target')}Øv på dette nå</h2><ul class="rd-next">${r.next.map(i => `<li>${icon('chev', 18)}<span><strong>${esc(i.label)}</strong><span class="muted small">${esc(i.tip)}</span></span></li>`).join('')}</ul></section>` : ''}
    <section class="card ready-head lv-${r.level}">
      <p class="eyebrow">${driver ? esc(driver) : 'Før oppkjøringen'}</p>
      <h2>${esc(t.title)}</h2>
      <p class="plan-prog"><strong>${r.done}</strong> av ${r.counted} punkter på plass</p>
      <span class="goal-bar"><span style="width:${r.counted ? Math.round(r.done / r.counted * 100) : 0}%"></span></span>
      ${t.text ? `<p>${esc(t.text)}</p>` : ''}
    </section>
    ${groups.map(g => `<h2 class="group-title">${esc(g)}</h2><section class="card"><ul class="rd-list">${r.items.filter(i => i.group === g).map(i => `<li class="rd-item">${mark(i)}<span><strong>${esc(i.label)}</strong><span class="muted small">${esc(i.have)}${i.need && i.need.length <= 24 ? ` · mål ${esc(i.need)}` : ''}</span>${i.ok === null && i.tip ? `<span class="muted small">${esc(i.tip)}</span>` : ''}${i.ok !== null ? `<span class="goal-bar thin"><span style="width:${Math.round(i.progress * 100)}%"></span></span>` : ''}</span></li>`).join('')}</ul></section>`).join('')}
    <p class="muted small ready-note">Målene er appens egne, satt ut fra vanlige råd for øvelseskjøring. Det er trafikklæreren som vurderer når du er klar for oppkjøring, og ingen app kan love at du består.</p>
    <button type="button" class="btn secondary" id="btn-ready-teacher">${icon('school', 20)}Vis trafikklæreren</button>`;
  $('#btn-ready-teacher').onclick = () => { location.hash = '#/trafikklaerer'; };
}

function planState() {
  const s = getSettings();
  const key = personKey(s);
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
  const driver = isTeacher() ? (s.activeStudent || '') : '';
  const rows = await gatherRows(scopeDriver(s));
  const ev = curriculumEvidence(rows);
  const { key, mine } = planState();
  const prog = planProgress();
  const dfmt = iso => new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  // Faresteder er flyttet til Turer (0.12.1): Opplæring er bare læreplanen
  root.innerHTML = `
    <section class="card plan-head">
      <p class="eyebrow">${driver ? esc(driver) : esc(s.name || 'Din opplæring')}</p>
      <p class="plan-prog"><strong>${prog.done}</strong> av ${prog.total} punkter krysset av</p>
      <span class="goal-bar"><span style="width:${(prog.done / prog.total * 100).toFixed(0)}%"></span></span>
      <p class="muted small">Etter læreplanen for klasse B. Trafikkskolen avgjør hva som er gjennomført.</p>
    </section>
    ${CURRICULUM.map(st => `<h2 class="group-title">${esc(st.stage)}</h2><section class="card"><ul class="plan-list">${st.items.map(it => {
      const e = it.auto ? ev[it.auto] : null;
      const st2 = mine[it.id] || {};
      return `<li><label class="plan-item"><input type="checkbox" data-id="${it.id}" ${st2.done ? 'checked' : ''}>
        <span><strong>${esc(it.label)}</strong>${st2.done && st2.at ? `<span class="muted small">Krysset av ${dfmt(st2.at)}</span>` : ''}
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
  renderSurfacePicker();
  // Lekser fra læreren (0.12.0) blir dagens øvingsmål, én gang per nye lekse
  { const st = getSettings(), hw = (isSchool() || isTeacher()) ? homeworkFor(st) : null;
    if (hw && hw.focus && hw.focus.length && st.hwApplied !== hw.setAt) { saveSettings({ ...st, focus: hw.focus.slice(0, 3), hwApplied: hw.setAt }); toast('Leksene fra læreren er valgt som dagens øvingsmål.', { type: 'ok', ms: 2500 }); } }
  renderFocusChips();
  renderFocusSuggestions();
  const camCheck = $('#check-camera'), roadCheck = $('#check-road');
  const camWanted = () => !!getSettings().cameraOn && hasPlus();   // kameraene er en del av Pluss (0.11.0)
  camCheck.hidden = !camWanted();
  const showRoadCheck = () => {
    roadCheck.hidden = !(camWanted() && roadWanted());
    if (!roadCheck.hidden && !roadCheck.dataset.state) setCheck(roadCheck, null, 'Starter sammen med førerkameraet');
  };
  roadCheck.dataset.state = '';
  showRoadCheck();
  cam.roadSupported().then(v => { roadOk = v; showRoadCheck(); }).catch(() => {});
  const preCalib = $('#btn-pre-calib');
  preCalib.hidden = true;
  if (camWanted()) setCheck(camCheck, null, getCalib() ? 'Starter når du gir tilgang' : 'Ikke kalibrert – du kan kalibrere her når kameraet er i gang');
  preCalib.onclick = async () => {
    unlockSpeech();
    await runCalibration();
    camCheck.classList.remove('todo');
    preCalib.lastChild.textContent = getCalib() ? 'Kalibrer på nytt' : 'Kalibrer nå';
  };
  $('#precheck-error').textContent = '';
  if (stopPrecheck) { stopPrecheck(); stopPrecheck = null; }

  btnPerm.onclick = async ev => {
    btnPerm.disabled = true;
    btnPerm.textContent = 'Venter på svar …';
    let motion = await requestMotionPermission();
    // Startet av appen selv (uten trykk) kan ikke spørsmålet stilles på nytt: da avgjør sensordataene om det virker
    if (ev && ev.auto && motion === 'denied') motion = 'unknown';
    if (motion === 'denied') setCheck(mot, false, 'Tilgang avslått. Slå på «Bevegelse og retning» i Safari-innstillingene.');
    else if (motion === 'unsupported') setCheck(mot, false, 'Ingen bevegelsessensorer på denne enheten');
    else setCheck(mot, null, 'Venter på data …');
    if (motion !== 'denied' && motion !== 'unsupported' && !getSettings().permOk) saveSettings({ ...getSettings(), permOk: true });
    try {
      await requestLocationOnce();
      setCheck(gps, null, 'Venter på god nok nøyaktighet …');
    } catch (err) {
      setCheck(gps, false, err.code === 1 ? 'Posisjonstilgang avslått. Tillat posisjon for denne appen i Innstillinger.' : 'Fikk ikke posisjon. Gå ut i friluft og prøv igjen.');
    }
    if (leftDuringStart('#/sjekk')) return;
    if (camWanted()) {
      try {
        await cam.startCamera($('#pre-video'), { road: roadWanted(), home: driverHome() });
        await cam.loadModel(t => setCheck(camCheck, null, t));
        cam.startLoop(8);
        if (camUnsub) camUnsub();
        // Kalibreringssjekk (0.12.0): stemmer kalibreringen med der telefonen og føreren er nå? Hvis ikke blir
        // «Kalibrer på nytt» et punkt å gjøre før turen.
        let seen = 0, n = 0;
        const recent = [];
        const offPose = cam.onPose(p => {
          n++; if (p) { seen++; recent.push(p); if (recent.length > 40) recent.shift(); }
          if (n % 8) return;
          const share = seen / 8; seen = 0;
          if (share <= 0.6) { setCheck(camCheck, null, 'Ser ikke ansiktet – juster holderen'); return; }
          const chk = checkCalibration(getCalib(), recent);
          const todo = chk.state === 'moved' || chk.state === 'none';
          setCheck(camCheck, chk.state === 'ok' || chk.state === 'old' ? true : chk.state === 'wait' ? null : false, chk.text);
          camCheck.classList.toggle('todo', todo);
          preCalib.classList.toggle('primary', todo); preCalib.classList.toggle('secondary', !todo);
        });
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
    if (leftDuringStart('#/sjekk')) return;
    btnPerm.hidden = true;
    $('#step-perm').dataset.state = 'done';
    $('#perm-text').textContent = 'Tilgang gitt.';
    $('#step-check').dataset.state = 'active';
    btnStart.textContent = 'Venter på GPS …';
    const since = performance.now();
    const fixMotion = $('#btn-motion-fix');
    fixMotion.hidden = true;
    fixMotion.onclick = async () => { const r = await requestMotionPermission(); if (r === 'granted') { motion = 'granted'; fixMotion.hidden = true; setCheck(mot, null, 'Venter på data …'); } else setCheck(mot, false, 'Tilgang avslått. Slå på «Bevegelse og retning» for appen i Innstillinger.'); };
    stopPrecheck = startPrecheck(st => {
      const waited = (performance.now() - since) / 1000;
      if (st.gpsError) setCheck(gps, false, st.gpsError.code === 1 ? 'Posisjonstilgang avslått' : 'Ingen GPS-signal');
      else if (Number.isFinite(st.acc)) setCheck(gps, st.gpsOk, `${n0(st.acc)} m nøyaktighet${st.gpsOk ? '' : ' (må være 20 m eller bedre' + (waited > 10 ? ' – blir ofte bedre når bilen står ute og står stille)' : ')')}`);
      // Ingen data etter 3 s (f.eks. når siden ble åpnet uten trykk): én knapp som ber om tilgangen i et trykk
      const noMotion = !st.motionSeen && waited > 3 && motion !== 'unsupported';
      fixMotion.hidden = !noMotion;
      if (noMotion) setCheck(mot, null, 'Får ingen bevegelsesdata. Trykk på knappen under.');
      else if (motion !== 'denied' && motion !== 'unsupported') setCheck(mot, st.motionOk, st.motionOk ? 'Bevegelsesdata mottas' : 'Ingen bevegelsesdata enda – beveg telefonen litt');
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
  // iPhone-appen husker tilgangen (0.11.5): da starter sjekken med en gang, uten et ekstra trykk
  if (window.kjNative && getSettings().permOk) btnPerm.onclick({ auto: true });
}

/* Dagens øvingsmål: opptil tre, huskes til neste tur. */
async function renderFocusSuggestions() {
  const el = $('#focus-suggest');
  const rows = await gatherRows(scopeDriver(getSettings()));
  const sug = suggestFocus(rows);
  if (!sug.length) { el.hidden = true; return; }
  const label = id => (FOCUS.find(f => f.id === id) || {}).label || id;
  const sum = $('#focus-summary');
  if (sum && !(getSettings().focus || []).length) sum.textContent = `Forslag: ${sug.map(x => label(x.id)).join(', ')}`;
  el.innerHTML = `<p class="sug-title">${icon('target', 18)}Forslag ut fra de siste turene</p>
    <ul class="sug-list">${sug.map(x => `<li><strong>${esc(label(x.id))}</strong><span class="muted small">${esc(x.reason)}</span></li>`).join('')}</ul>
    <button type="button" class="btn secondary small-btn" id="btn-use-sug">Bruk forslagene</button>`;
  el.hidden = false;
  $('#btn-use-sug').onclick = () => { saveSettings({ ...getSettings(), focus: sug.map(x => x.id) }); renderFocusChips(); toast('Dagens mål er satt.', { type: 'ok', ms: 1800 }); };
}

function renderFocusChips() {
  const box = $('#focus-chips');
  const sel = new Set((getSettings().focus || []).filter(id => FOCUS.some(f => f.id === id)));
  // Sammendraget i den lukkede boksen (0.11.5): valgene står der, listen åpnes bare når man vil endre
  const sum = $('#focus-summary');
  if (sum) sum.textContent = sel.size ? FOCUS.filter(f => sel.has(f.id)).map(f => f.label).join(', ') : 'Valgfritt';
  box.innerHTML = FOCUS.map(f => `<button type="button" class="chip ${sel.has(f.id) ? 'on' : ''}" data-f="${f.id}" aria-pressed="${sel.has(f.id)}">${esc(f.label)}</button>`).join('');
  box.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    const cur = new Set(getSettings().focus || []);
    if (cur.has(c.dataset.f)) cur.delete(c.dataset.f);
    else { if (cur.size >= 3) { toast('Velg høyst tre mål per tur.', { ms: 2000 }); return; } cur.add(c.dataset.f); }
    saveSettings({ ...getSettings(), focus: [...cur] });
    renderFocusChips();
  });
}

/* Føre (0.12.0): velges før turen. Forslaget er det som ble valgt tidligere i dag (om vinteren må det velges). */
const currentSurface = () => suggestSurface(getSettings().lastSurface);
function renderSurfacePicker() {
  const seg = $('#surface-seg'), cur = currentSurface();
  seg.innerHTML = SURFACES.map(x => `<label><input type="radio" name="surface" value="${x.id}" ${x.id === cur ? 'checked' : ''}><span>${esc(x.short)}</span></label>`).join('');
  seg.classList.toggle('need', !cur);
  $('#surface-note').textContent = !cur ? 'Velg føret, så blir vurderingen riktig på glatt vei.' : cur === 'snow' || cur === 'ice' ? 'Glatt føre: grensene for brå bremsing og svinger er lavere i dag.' : '';
  seg.querySelectorAll('input').forEach(r => r.onchange = () => { saveSettings({ ...getSettings(), lastSurface: { id: r.value, day: dayKey(new Date()) } }); renderSurfacePicker(); });
}

/* Elev (0.12.0): bare trafikklæreren velger hvem som kjører. Eleven kjører alltid selv. */
function renderDriverPicker() {
  const s = getSettings();
  const wrap = $('.driver-pick'), sel = $('#driver-select');
  wrap.hidden = !isTeacher();
  if (!isTeacher()) return;
  const list = students(s);
  sel.innerHTML = `<option value="">Velg elev</option>${list.map(x => `<option value="${esc(x.name)}" ${x.name === s.activeStudent ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="__new">Ny elev …</option>`;
  sel.onchange = async () => {
    if (sel.value === '__new') {
      const name = ((await promptDialog({ title: 'Ny elev', placeholder: 'Navn', ok: 'Legg til', maxLength: 40 })) || '').trim().slice(0, 40);
      if (name) { const cur = getSettings(); saveSettings({ ...cur, students: [...students(cur).filter(x => x.name !== name), { name, email: '' }], activeStudent: name }); }
      renderDriverPicker();
      renderFocusSuggestions();
      return;
    }
    saveSettings({ ...getSettings(), activeStudent: sel.value });
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
  // Fartsvarsel (0.12.0): rød kant (og pip hvis valgt) når farten er for høy
  const speedWarn = settings.speedWarn !== false || settings.speedSound ? createSpeedWarn() : null;
  const speedBeep = !!settings.speedSound;
  if (speedBeep) unlockSound();
  const recEl = $('#record');
  recEl.style.setProperty('--speed-warn', 0); recEl.classList.remove('speeding');
  const warnSpeed = (kmh, limit, t) => {
    if (!speedWarn) return;
    const w = speedWarn.step({ kmh, limit, t });
    const show = settings.speedWarn !== false ? w.level : 0;
    recEl.style.setProperty('--speed-warn', show.toFixed(2));
    recEl.classList.toggle('speeding', show > 0);
    if (w.beep && speedBeep) playSound('fart');
  };
  const dist = $('#rec-dist'), gps = $('#rec-gps'), warn = $('#rec-warn'), saved = $('#rec-saved'), markCount = $('#rec-marks');
  warn.innerHTML = '';
  saved.textContent = '';
  markCount.textContent = '';
  renderMarkGrid({});
  let gapMsg = '', gapShown = null, stillSince = null, lastNativeStatus = -Infinity;   // lang pause: minn om å stoppe turen (v0.9.3, før Trondheim–Storlien)
  // Aktiv fartsgrense fra NVDB (v0.9.4), når «Veidata» er på. Endringene lagres med turen for sammenligning.
  const live = !replay && settings.netLimits !== false ? createLiveLimit({ atk: true }) : null;
  const liveLog = [];
  liveLimitNow = null; camLimit.reset(); camSignNew = null; roadTrack.length = 0; liveRoad = null;
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
    driver: replay ? '' : recordDriver(settings),
    focus: replay ? [] : (settings.focus || []),
    surface: replay ? '' : currentSurface(),
    calib: replay ? null : getCalib(),
    replay,
    onStatus: st => {
      if (st.replayDone) { finishRecording(); return; }
      cam.setSpeed(st.kmh);   // fartsskilt leses bare når bilen kjører
      if (!replay && st.pos && cam.state().road) feedRoadShape(st, live);
      if (live) {
        const res = live.update(st.pos && { ...st.pos, acc: st.acc });   // GPS-ens usikkerhet: veien bilen er på, holdes (0.13.1)
        // Skilt fra veikameraet (midlertidige og digitale skilt) går foran NVDB til neste skilt, 3 km eller ny NVDB-strekning
        if (camSignNew) { camLimit.sign(camSignNew.limit, st.distanceM, res.limit); liveLog.push({ t: Math.round(st.elapsed), limit: camSignNew.limit, src: 'kamera' }); camSignNew = null; }
        const cl = camLimit.current(st.distanceM, res.limit);
        const lim = cl ? cl.limit : res.limit;
        liveLimitNow = lim;
        limitSign.textContent = lim ?? '–';
        limitSign.classList.toggle('none', lim === null);
        limitSign.classList.toggle('cam', !!cl && !cl.agree);
        // Under kjøring (0.12.0): teksten under skiltet vises bare når skiltet ikke er det vanlige
        limitNote.textContent = cl ? (cl.agree ? '' : 'Skilt sett av kameraet')
          : res.limit !== null ? '' : res.status === 'feil' ? 'Ingen nett' : res.status === 'ukjent' ? 'Ukjent fartsgrense' : 'Henter fartsgrense …';
        speedEl.textContent = Number.isFinite(st.kmh) ? n0(st.kmh) : '–';
        warnSpeed(st.kmh, lim, st.elapsed);
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
        limitNote.textContent = '';
        speedEl.textContent = Number.isFinite(st.kmh) ? n0(st.kmh) : '–';
        warnSpeed(st.kmh, z.limit, st.elapsed);
      }
      dist.textContent = km(st.distanceM / 1000);
      // iPhone-appen: avstanden til Live Activity på låseskjermen (v0.9.22)
      if (window.kjNative && window.kjNative.status && !replay && st.elapsed - lastNativeStatus >= 10) { lastNativeStatus = st.elapsed; window.kjNative.status({ distanceM: st.distanceM }); }
      if (st.gpsError) { gps.textContent = 'GPS: ingen signal'; gps.dataset.state = 'fail'; }
      else if (st.warmup) { gps.textContent = 'GPS: venter på fersk posisjon …'; gps.dataset.state = 'wait'; }
      else if (!st.gpsFresh) { gps.textContent = 'GPS: venter …'; gps.dataset.state = 'wait'; }
      else { gps.textContent = st.acc <= 20 ? 'GPS ok' : `GPS: ${n0(st.acc)} m`; gps.dataset.state = st.acc <= 20 ? 'ok' : 'wait'; }
      // Under kjøring vises bare det ledsageren må reagere på (0.11.5): god GPS og vanlig lagring er stille
      gps.hidden = gps.dataset.state === 'ok';
      const behind = st.lastCheckpoint !== null && st.elapsed - st.lastCheckpoint > 90;
      saved.textContent = behind ? `Sist lagret for ${n0(st.elapsed - st.lastCheckpoint)} s siden` : '';
      const undoBtn = $('#btn-undo-mark'), lastMark = recorder && recorder.marks[recorder.marks.length - 1];
      undoBtn.hidden = !lastMark;
      if (lastMark) undoBtn.lastChild.textContent = `Angre «${MARK_CATS[lastMark.cat].label}» (${fmtClock(lastMark.t)})`;
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
    recVideo.hidden = false; hitV.hidden = false;
    if (camUnsub) camUnsub();
    let seen = 0, n = 0, face = 'Kamera: på', lastRoad = null;
    const pillText = () => {
      const st = cam.state();
      // Kamerapillen vises bare når noe er galt (0.12.0)
      camPill.hidden = camPill.dataset.state === 'ok' && !st.stalled && !st.perf.slow;
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
    camPill.textContent = 'Kamera: på'; camPill.dataset.state = 'ok'; camPill.hidden = true;
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

/* Veiens form til feltlinjene i veikameraet (0.10.3): svingen nå fra GPS-sporet (siste 6 s), svingen foran fra veiens
   linje i Statens vegvesens data (fartsgrensestrekningene), og felt og feltbredde der bilen er (lite område). */
const roadTrack = [];
let liveRoad = null;
const bearingDeg = (a, b) => (Math.atan2((b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
function feedRoadShape(st, live) {
  const now = performance.now() / 1000, last = roadTrack[roadTrack.length - 1];
  if (!last || last.lat !== st.pos.lat || last.lon !== st.pos.lon) roadTrack.push({ lat: st.pos.lat, lon: st.pos.lon, t: now });
  while (roadTrack.length && now - roadTrack[0].t > 6) roadTrack.shift();
  const moving = st.kmh >= 15;
  const a = roadTrack[Math.max(0, roadTrack.length - 4)], b = roadTrack[roadTrack.length - 1];
  const heading = a && b && a !== b ? bearingDeg(a, b) : null;
  const kNow = moving ? trackCurvature(roadTrack) : null;
  const ahead = live && moving && Number.isFinite(heading) ? aheadCurvature(live.near(st.pos), st.pos, heading) : null;
  const prior = moving ? kappaPrior(kNow, ahead) : { kappa: 0, weight: 2 };   // sakte (kø, kryss): ingen forventet sving
  if (live && !liveRoad) liveRoad = createLiveRoad();
  const info = liveRoad ? liveRoad.update(st.pos, heading) : null;
  cam.setRoadShape({ kappa: prior ? prior.kappa : null, kappaWeight: prior ? prior.weight : 1,
    laneWidth: info ? info.laneWidth : null, lanes: info ? info.lanes : null, src: ahead ? 'veidata' : Number.isFinite(kNow) ? 'gps' : null });
}
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
      if (faceRun.n >= 3 && !['forward', 'other', 'none'].includes(faceRun.cls)) { faceLog.unshift({ cls: faceRun.cls, t: faceRun.t0, dur: now - faceRun.t0 }); faceLog.length = Math.min(faceLog.length, 6); }
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
  // Feltlinjer (0.10.3): buer langs veien, prøvd i 16 punkter og glattet hvert for seg. Feltet fargelegges svakt mellom
  // linjene, og en linje kameraet ikke så (tegnet etter feltbredden) er stiplet
  // Veien foran fra feltmodellen (0.13.0): svakt blått felt mellom kantene
  if (v.lane && v.lane.road && v.lane.road.length > 2) {
    const k = v.w / v.lane.W, rd = v.lane.road;
    g.save(); g.fillStyle = 'rgba(64, 156, 255, 0.14)'; g.beginPath();
    rd.forEach(([y, xl], i) => (i ? g.lineTo(X(xl * k), Y(y * k)) : g.moveTo(X(xl * k), Y(y * k))));
    rd.slice().reverse().forEach(([y, , xr]) => g.lineTo(X(xr * k), Y(y * k)));
    g.closePath(); g.fill(); g.restore();
  }
  if (v.lane) {
    const k = v.w / v.lane.W, N = 16;
    const sample = L => { const S = scaleLane(L, k); return Array.from({ length: N }, (_, i) => { const y = S.yBottom + (S.yTop - S.yBottom) * i / (N - 1); return [laneX(S, y), y]; }); };
    const lines = {};
    for (const side of ['left', 'right']) {
      const raw = v.lane[side], o = camEase.lanes[side];
      if (!raw) { delete camEase.lanes[side]; continue; }
      const pts = sample(raw);
      const eased = o && o.pts.length === N ? pts.map(([x, y], i) => [o.pts[i][0] + (x - o.pts[i][0]) * aLane, o.pts[i][1] + (y - o.pts[i][1]) * aLane]) : pts;
      camEase.lanes[side] = { pts: eased };
      lines[side] = { pts: eased, predicted: !!raw.predicted, edge: raw.edge || null };
    }
    if (lines.left && lines.right) {
      g.fillStyle = lines.right.edge ? 'rgba(255, 167, 38, 0.12)' : 'rgba(61, 220, 132, 0.16)'; g.beginPath();
      lines.left.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      lines.right.pts.slice().reverse().forEach(([x, y]) => g.lineTo(X(x), Y(y)));
      g.closePath(); g.fill();
    }
    g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [side, col] of [['left', '#3ddc84'], ['right', '#ff4fd8']]) {
      const Ln = lines[side];
      if (!Ln) continue;
      g.save(); g.strokeStyle = col;
      if (Ln.predicted) { g.setLineDash([10, 9]); g.globalAlpha = 0.6; }
      // Veikant og midten av veien uten oppmalte linjer (0.13.3): oransje prikker, så de ikke forveksles med linjer
      if (Ln.edge) { g.strokeStyle = '#ffa726'; g.setLineDash([2, 10]); g.globalAlpha = 0.9; }
      g.beginPath(); Ln.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke();
      g.restore();
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
    `<div>${laneSeenText(v.lane)}${off !== null ? ` · ${Math.abs(off).toFixed(2).replace('.', ',')} m ${off > 0.05 ? 'til høyre' : off < -0.05 ? 'til venstre' : 'midt i'}` : ''}</div>`,
    `<div class="muted">${roadShapeText(v.lane)}</div>`,
    `<div>Skilt: ${v.lastSign ? `<strong>${v.lastSign.limit}</strong> (lest ${v.lastSign.reads} ganger, ${Math.round((performance.now() - v.lastSign.at) / 1000)} s siden)` : 'ingen lest ennå'}${liveLimitNow ? ` · grense nå ${liveLimitNow}` : ''}</div>`,
    `<div class="muted">${v.roadBottom ? `Dashbordkant ${Math.round(v.roadBottom * 100)} % (blå strek)` : 'Dashbordkant ikke funnet ennå'}${Number.isFinite(v.lum) ? ` · lys ${v.lum}` : ''}${Number.isFinite(st.perf.dfineMs) && st.perf.dfineMs ? ` · D-FINE ${Math.round(st.perf.dfineMs)} ms` : ''}${st.perf.laneMlMs ? ` · feltmodell ${Math.round(st.perf.laneMlMs)} ms` : ''}${st.perf.flowTries ? ` · følger i bildet ${Math.round(100 * st.perf.flowHits / st.perf.flowTries)} %` : ''}</div>`
  ].join('');
}
/* Hva kameraet så av feltlinjene (0.10.3): sette linjer, og om en er tegnet etter feltbredden */
function laneSeenText(ln) {
  if (!ln) return 'Ingen feltlinjer';
  if ((ln.left && ln.left.edge) || (ln.right && ln.right.edge)) return 'Ingen oppmalte linjer – veikanten og midten av veien (feltmodell)';
  const seen = ['left', 'right'].filter(k => ln[k] && !ln[k].predicted).length, guess = ['left', 'right'].some(k => ln[k] && ln[k].predicted);
  const txt = seen === 2 ? 'Begge feltlinjer' : seen === 1 ? (guess ? 'Én feltlinje, den andre etter feltbredden' : 'Én feltlinje') : 'Ingen feltlinjer';
  return ln.ml ? `${txt} (feltmodell)` : txt;
}
/* Svingen og feltene: «Sving til høyre, radius 240 m (veidata) · tofeltsvei · felt 3,25 m» */
function roadShapeText(ln) {
  if (!ln) return '';
  const k = Number.isFinite(ln.kappa) ? ln.kappa : ln.prior, parts = [];
  if (Number.isFinite(k) && Math.abs(k) > 1 / 1500) parts.push(`Sving til ${k > 0 ? 'høyre' : 'venstre'}, radius ${Math.round(1 / Math.abs(k) / 10) * 10} m${ln.src === 'veidata' ? ' (veidata)' : ln.src === 'gps' ? ' (GPS)' : ''}`);
  else if (Number.isFinite(k)) parts.push('Rett fram');
  if (ln.lanes) parts.push(ln.lanes.total === 2 && ln.lanes.ours === 1 ? 'tofeltsvei' : `${ln.lanes.ours} ${ln.lanes.ours === 1 ? 'felt' : 'felt'} i vår retning`);
  if (ln.laneWidth) parts.push(`felt ${String(ln.laneWidth).replace('.', ',')} m`);
  return parts.join(' · ');
}

/* Fullskjerm for førerkameraet (k0.7.6): ansiktet med omriss, øyne og regnbuehinner, en pil for blikket, et kart
   over speilene fra kalibreringen med en prikk for hvor føreren ser nå (fylt: blikket med øynene, ring: bare hodet),
   hva appen tror føreren ser på, og de siste blikkene. Alt glir mykt (punktene 50 ms, blikket 90 ms). */
function drawFaceView(g, cw, ch, v, st, info) {
  const maskText = v.mask ? '<div class="muted">Ledsagerens side er skjult for ansiktsmodellen</div>' : '';
  if (!v.lm || !v.pose) {
    camEase.face = null;
    info.innerHTML = '<div>Førerkamera</div><div class="muted">Ser ikke ansiktet – juster holderen</div>' + maskText;
    return;
  }
  const now = performance.now(), dt = Math.min(250, Math.max(0, now - (camEase.t || now)));
  camEase.t = now;
  const a = tau => 1 - Math.exp(-dt / tau);
  // Kamerabildet vises speilvendt med «contain»
  const s = Math.min(cw / v.w, ch / v.h), ox = (cw - v.w * s) / 2, oy = (ch - v.h * s) / 2;
  const X = x => ox + (1 - x) * v.w * s, Y = y => oy + y * v.h * s;
  // Ledsagerens side, malt svart for ansiktsmodellen (0.13.2): mørk her også, så det synes
  if (v.mask) {
    const x0 = X(v.mask.to), x1 = X(v.mask.from);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0, oy, x1 - x0, v.h * s);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '600 12px system-ui, sans-serif'; g.textBaseline = 'top';
    g.fillText('Skjult (ledsager)', x0 + 8, oy + 8);
  }
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
    faceLog.length ? `<div class="muted">${faceLog.map(l => `${CLASS_LABEL[l.cls]} ${l.dur.toFixed(1).replace('.', ',')} s (${Math.round(nowS - l.t)} s siden)`).join('<br>')}</div>` : '',
    maskText
  ].join('');
}
async function finishRecording() {
  if (!recorder || !recorder.running) return;
  const rec = recorder;
  recorder = null;
  vibrate([60, 60, 60]);
  $('#record').classList.add('busy');
  $('#record').classList.remove('speeding'); $('#record').style.setProperty('--speed-warn', 0);
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

/* En rapport som blir ferdig etter at brukeren har gått videre, skal ikke tegnes over neste side (0.11.3) */
let reportSeq = 0;
async function renderDriveReport(id, { keepScroll = false } = {}) {
  const tok = ++reportSeq, stale = () => tok !== reportSeq || location.hash !== '#/rapport/' + id;
  const y = window.scrollY;
  if (!keepScroll) { show('report'); $('#report-root').innerHTML = '<p class="muted">Analyserer turen …</p>'; }
  const root = $('#report-root');
  const drive = await getDrive(id);
  if (stale()) return;
  if (!drive) { root.innerHTML = '<p class="notice">Fant ikke turen.</p>'; return; }
  const drives = await listDrives();
  if (stale()) return;
  // Pluss (0.11.0): rapportene for de eldre turene er låst uten Pluss. Turen ligger der og kan eksporteres.
  if (reportLocked(drives, id, hasPlus())) {
    show('report');
    $('#report-bar-title').textContent = 'Rapport';
    $('#report-actions').innerHTML = '';
    root.innerHTML = `<section class="card plus-locked"><span class="plus-ico">${icon('list', 24)}</span>
      <h2>Turen ${esc(date(drive.startedAt))}</h2>
      <p>Uten Pluss vises rapportene for de ${FREE_REPORTS} siste turene. Denne turen er eldre. Den er ikke slettet, og kan eksporteres.</p>
      <button type="button" class="btn primary" id="btn-locked-plus">Se Pluss</button>
      <button type="button" class="btn secondary" id="btn-locked-export">${icon('download', 20)}Eksporter turen</button></section>`;
    $('#btn-locked-plus').onclick = () => { location.hash = '#/pluss'; };
    $('#btn-locked-export').onclick = () => exportDrive(id);
    return;
  }
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
    if (stale()) return;
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
    // Nytt på denne turen (0.12.0): merker, nivå og rekorder øverst i rapporten
    const unlock = await unlockHtml(drive);
    if (stale()) return;
    const drawBase = (status) => renderReport(root, r, {
      prevScore: prev ? prev.overall : null, prev,
      // Tittelen er når turen var (0.12.2): «Kjørerapport» står allerede øverst
      title: shortDay(drive.startedAt), subtitle: date(drive.startedAt) + (drive.driver ? ' · ' + drive.driver : '') + (tags.length ? ' · ' + tags.join(', ') : ''),
      eyebrow: [isTeacher() && drive.driver ? drive.driver : '', ...tags].filter(Boolean).join(' · '),
      realMap: settings.netMap !== false,
      customThresholds: !!(settings.th),
      driver: drive.driver || '', drivers: isTeacher() ? students(settings).map(x => x.name) : [],   // bare trafikklæreren flytter turer mellom elever (0.12.0)
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
    const draw = status => {
      drawBase(status);
      if (!unlock) return;
      const hero = root.querySelector('.hero');
      if (hero) hero.insertAdjacentHTML('beforebegin', unlock);
    };
    if (unlock) { const cur = getSettings(), seen = cur.celebrated || {}; if (!seen[id]) { saveSettings({ ...cur, celebrated: { ...seen, [id]: 1 } }); setTimeout(celebrate, 400); } }
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
          const el = root.querySelector('#enrich-status'); if (el) el.textContent = text.replace(/ (…|%)/g, '\u00a0$1');
        });
        enrich.attemptedAt = new Date().toISOString(); enrich.error = null;
        drive.enrich = enrich;
        await putDrive(drive);
        if (location.hash === '#/rapport/' + id) await renderDriveReport(id, { keepScroll: true });
      } catch (err) {
        drive.enrich = { ...(drive.enrich || {}), attemptedAt: new Date().toISOString(), error: err.message };
        await putDrive(drive);
        enriching = false;
        if (location.hash !== '#/rapport/' + id) return;   // brukeren har gått videre
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
    if (stale()) return;
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
  updateCamCard();
  // Pluss (0.11.0), bare i iPhone-appen
  const pr = $('#plus-row');
  pr.hidden = !plusState().native;
  if (!pr.hidden) {
    const pst = plusState(), inTrial = !pst.owned && trialActive(), dl = trialDaysLeft();
    pr.innerHTML = inTrial ? `<span class="plus-ico">${icon('check', 22)}</span><span><strong>Kjørerapport Pluss</strong><span class="muted small">Prøveperiode: ${dl} ${dl === 1 ? 'dag' : 'dager'} igjen</span></span><button type="button" class="btn small-btn primary" id="btn-plus-row">Kjøp</button>`
      : hasPlus() ? `<span class="plus-ico">${icon('check', 22)}</span><span><strong>Kjørerapport Pluss</strong><span class="muted small">Låst opp. Takk!</span></span>`
      : `<span class="plus-ico">${icon('check', 22)}</span><span><strong>Kjørerapport Pluss</strong><span class="muted small">${pst.trialAvailable ? 'Prøv gratis i 14 dager: kameraene, opplæringsplanen, klar for oppkjøring og alle rapportene' : 'Kameraene, opplæringsplanen, trafikklæreren, klar for oppkjøring og alle rapportene'}</span></span><button type="button" class="btn small-btn primary" id="btn-plus-row">Se Pluss</button>`;
    const b = pr.querySelector('#btn-plus-row');
    if (b) b.onclick = () => { location.hash = '#/pluss'; };
  }
  renderViewModes();
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
  // Fartsvarsel (0.12.0): synlig kant er på som standard, lyden velges selv. Krever fartsgrensen fra Statens vegvesen.
  { const el = $('#speedWarn'); el.checked = settings.speedWarn !== false; el.onchange = () => saveSettings({ ...getSettings(), speedWarn: el.checked }); }
  { const el = $('#speedSound'); el.checked = !!settings.speedSound; el.onchange = () => { saveSettings({ ...getSettings(), speedSound: el.checked }); if (el.checked) { unlockSound(); playSound('fart'); } }; }
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

/* Deg (0.12.0): eleven har bare sitt eget navn. Trafikklæreren har elevene i fanen Elever. */
function renderDriverSettings() {
  const s = getSettings();
  const inp = $('#my-name');
  $('#name-field').hidden = isTeacher();
  $('#students-note').hidden = !isTeacher();
  $('#goals-title').hidden = false;
  inp.value = s.name || s.activeDriver || '';
  inp.onchange = () => saveSettings({ ...getSettings(), name: inp.value.trim().slice(0, 40) });
}

/* Visning (0.12.0, midlertidig): bytt mellom gratis, Pluss, koblet til trafikkskole og trafikklærer. Bare i
   testbyggene (Xcode og TestFlight) og i nettversjonen; App Store-utgaven følger alltid App Store. */
async function viewModesAllowed() {
  if (!window.kjNative) return true;
  const info = window.kjNative.info ? await window.kjNative.info().catch(() => null) : null;
  return !!(info && info.devTools);
}
async function renderViewModes() {
  const card = $('#view-mode-card');
  if (!(await viewModesAllowed())) { card.hidden = true; return; }
  card.hidden = false;
  const box = $('#mode-list'), cur = viewMode();
  box.innerHTML = VIEW_MODES.map(([id, label, text]) => `<label class="mode-opt"><input type="radio" name="viewmode" value="${id}" ${id === cur ? 'checked' : ''}><span><strong>${esc(label)}</strong><span class="muted small">${esc(text)}</span></span></label>`).join('');
  box.querySelectorAll('input').forEach(r => r.onchange = () => {
    applyViewMode(r.value);
    saveSettings({ ...getSettings(), viewMode: r.value, devPlus: '' });
    toast(`Visning: ${VIEW_MODES.find(x => x[0] === r.value)[1]}.`, { type: 'ok', ms: 2000 });
    renderSettings();
  });
}
function applyViewMode(m) {
  setViewMode(m);
  setDevPlus(plusFor(viewMode()));
  document.body.dataset.mode = viewMode();
  const t = document.querySelector('.tabbar a[data-tab="teacher"]');
  if (t) { t.lastElementChild.textContent = isTeacher() ? 'Elever' : 'Trafikklærer'; }
  updatePlusMarks();
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
/* Introene (v0.9.18, kameraintro 0.12.0): sider som sveipes, med prikker, «Hopp over» og en knapp nederst.
   #intro ved første start; #cam-intro første gang Pluss er låst opp (kameraene er det nye). */
function openIntro(id = 'intro') {
  if (introOpen) return;
  introOpen = true;
  const box = document.getElementById(id), q = sel => box.querySelector(sel);
  const pagesEl = q('.intro-pages'), pages = [...pagesEl.children], dots = q('.intro-dots');
  const next = q('.intro-next'), skip = q('.intro-skip'), alt = q('.intro-demo');
  const seenKey = id === 'intro' ? 'introSeen' : 'camIntroSeen';
  const lastText = id === 'intro' ? 'Kom i gang' : 'Kalibrer kameraet';
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
    next.textContent = last ? lastText : 'Fortsett';
    alt.style.visibility = last ? '' : 'hidden';   // plassen holdes av, så knappen står stille
    skip.style.visibility = last ? 'hidden' : '';
  };
  const close = then => {
    saveSettings({ ...getSettings(), [seenKey]: true });
    box.hidden = true; introOpen = false;
    document.body.classList.remove('intro-open');
    pagesEl.onscroll = null;
    if (then) then(); else if (opener && opener.focus) opener.focus();
  };
  pagesEl.onscroll = () => setPage(Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth)));
  [...dots.children].forEach((d, k) => { d.onclick = () => goTo(k); });
  next.onclick = () => { if (cur < pages.length - 1) goTo(cur + 1); else close(id === 'intro' ? null : () => { location.hash = '#/kamera'; }); };
  skip.onclick = () => close();
  alt.onclick = () => close(id === 'intro' ? () => { location.hash = '#/demo'; } : null);
  box.hidden = false;
  document.body.classList.add('intro-open');
  pagesEl.scrollLeft = 0;
  setPage(0);
  const h = q('h2');
  h.setAttribute('tabindex', '-1');
  h.focus({ preventScroll: true });
}
/* Kameraintroen kommer én gang når Pluss blir låst opp (kjøp, prøve, kode eller skolen), men ikke før eller under kjøring */
function maybeCamIntro() {
  const h = location.hash || '#/';
  if (!hasPlus() || getSettings().camIntroSeen || introOpen || ['#/sjekk', '#/opptak', '#/kamera'].includes(h) || (recorder && recorder.running)) return;
  if (!getSettings().introSeen) return;   // første start: den vanlige introen først
  openIntro('cam-intro');
}

/* ---------- Ruting ---------- */
/* Fanelinjen (v0.9.16): hvilken fane som er valgt, og om linjen vises. Skjult før og under kjøring og på
   kameraskjermen (en oppgave med fokus). En rapport hører til fanen den ble åpnet fra. */
const TAB_ROOTS = { '#/': 'home', '#/logg': 'trips', '#/opplaering': 'plan', '#/trafikklaerer': 'teacher', '#/guider': 'guide' };
let lastTab = '#/';
function updateTabbar(h) {
  const bar = $('#tabbar');
  if (!bar) return;
  const hide = ['#/sjekk', '#/opptak', '#/kamera'].includes(h);
  bar.hidden = hide;
  document.body.classList.toggle('has-tabbar', !hide);
  if (TAB_ROOTS[h]) lastTab = h;
  const active = TAB_ROOTS[h] || ({ '#/demo': 'home', '#/innstillinger': 'home', '#/pluss': 'home', '#/fremgang': 'home', '#/klar': 'home', '#/faresteder': 'trips' })[h] || TAB_ROOTS[lastTab];
  bar.querySelectorAll('a').forEach(a => {
    const on = a.dataset.tab === active;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
/* Fanelinjen reagerer på første trykk (0.12.3). Mens siden ruller etter et sveip, brukte iPhone det første trykket
   til å stoppe rullingen, og lenken trengte et trykk til. Nå byttes fanen når fingeren slippes (hvis den ikke har
   flyttet seg), uavhengig av rullingen. Trykk på fanen du er på: tilbake til toppen, som i iPhone-apper. */
function wireTabbar() {
  const bar = $('#tabbar');
  let down = null;
  const go = a => {
    const h = a.getAttribute('href');
    if ((location.hash || '#/') === h) window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    else location.hash = h;
  };
  bar.addEventListener('touchstart', e => { const t = e.touches[0]; down = { x: t.clientX, y: t.clientY, a: e.target.closest('a'), at: Date.now() }; if (down.a) down.a.classList.add('press'); }, { passive: true });
  bar.addEventListener('touchmove', e => { const t = e.touches[0]; if (down && Math.hypot(t.clientX - down.x, t.clientY - down.y) > 12) { if (down.a) down.a.classList.remove('press'); down = null; } }, { passive: true });
  bar.addEventListener('touchend', e => {
    const d = down; down = null;
    bar.querySelectorAll('a.press').forEach(x => x.classList.remove('press'));
    if (!d || !d.a || Date.now() - d.at > 800) return;
    e.preventDefault();   // ingen ekstra «klikk» etterpå
    go(d.a);
  });
  bar.addEventListener('touchcancel', () => { down = null; bar.querySelectorAll('a.press').forEach(x => x.classList.remove('press')); });
  bar.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); go(a); });   // mus og tastatur
}

/* Tilbake: fra en rapport til fanen den kom fra, fra Faresteder til Turer, ellers til Hjem */
function goBack() {
  const h = location.hash;
  location.hash = h === '#/faresteder' ? '#/logg' : h === '#/pluss' ? (guidesFrom || '#/') : gateFor(h) && !hasPlus() ? '#/' : (h.startsWith('#/rapport/') || h === '#/demo') ? lastTab : '#/';
}

/* Overlegg som låser siden (fullskjerm kart og kamera) lukkes ved hvert skjermbytte. Før 0.10.1 kunne «Tilbake»
   med kartet i fullskjerm la body stå med overflow: hidden, og da kunne ingenting i appen rulles. */
function releaseOverlays() {
  document.body.classList.remove('map-open');
  document.querySelectorAll('.dev-full').forEach(el => el.remove());   // kjøreutviklingen i full skjerm (0.12.0)
  if (!introOpen) document.body.classList.remove('intro-open');
  closeMapOverlay();
  closeCamView();
  if (calibAbort) calibAbort();
}

let guidesFrom = null, prevHash = null;   // Guider åpnes fra Hjem eller Innstillinger, og «Tilbake» går dit
function route() {
  const h = location.hash || '#/';
  if (h === '#/pluss' && prevHash !== h) guidesFrom = prevHash;
  if (h !== prevHash) window.scrollTo(0, 0);   // ny side (også rapport til rapport) begynner øverst
  prevHash = h;
  if (recorder && recorder.running && h !== '#/opptak') { location.hash = '#/opptak'; return; }
  releaseOverlays();
  updateTabbar(h);
  if (stopPrecheck && h !== '#/sjekk') { stopPrecheck(); stopPrecheck = null; }
  if (!h.startsWith('#/rapport/') && h !== '#/kamera' && h !== '#/sjekk') stopSpeaking();
  if (h !== '#/kamera') calibForDrive = null;
  // Kameraet står bare på i kameratesten, før kjøring og under opptak
  if (!['#/kamera', '#/sjekk', '#/opptak'].includes(h) && cam.state().running && !(recorder && recorder.running)) { cam.stopCamera(); if (camUnsub) { camUnsub(); camUnsub = null; } }
  // Pluss (0.11.0): skjermene som hører til Pluss viser Pluss-siden i stedet, med den funksjonen øverst
  const gate = gateFor(h);
  if (gate && !hasPlus()) {
    if (cam.state().running && !(recorder && recorder.running)) { cam.stopCamera(); if (camUnsub) { camUnsub(); camUnsub = null; } }   // f.eks. prøven gikk ut på kameraskjermen
    renderPlus(gate); return;
  }
  if (h === '#/') renderHome();
  else if (h === '#/pluss') renderPlus();
  else if (h === '#/sjekk') renderPrecheck();
  else if (h === '#/opptak') { if (!recorder) location.hash = '#/'; }
  else if (h === '#/demo') renderDemoReport();
  else if (h === '#/demotur') { location.replace('#/opptak'); startRecording({ data: makeDemo(7, { yaw: 0.7, pitch: 0.35 }), speed: 10 }); }   // demoturen direkte (Avansert, testing)
  else if (h === '#/innstillinger') renderSettings();
  else if (h === '#/logg') renderLog();
  else if (h === '#/trafikklaerer') renderTeacher();
  else if (h === '#/klar') renderReady();
  else if (h === '#/fremgang') renderProgress();
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
  ['home', 'precheck', 'record', 'report', 'settings', 'log', 'spots', 'plan', 'camera', 'teacher', 'guides', 'pluss', 'ready', 'progress'].forEach(n => { screens[n] = document.getElementById(n); });
  // Bevegelsesdata (0.12.4): iPhone gir dem bare etter et trykk. «Start kjøretur» er trykket, så tilgangen bes om her;
  // sjekken før kjøring starter av seg selv uten trykk, og fikk ellers aldri data.
  $('#btn-go-precheck').onclick = () => { requestMotionPermission().catch(() => {}); location.hash = '#/sjekk'; };
  $('#btn-go-camera').onclick = () => { location.hash = '#/kamera'; };
  $('#btn-demo').onclick = () => { location.hash = '#/demo'; };
  document.querySelectorAll('.btn-gear').forEach(b => b.onclick = () => { location.hash = '#/innstillinger'; });
  document.querySelectorAll('.btn-back').forEach(b => b.onclick = goBack);
  wireTabbar();
  setupLongPress($('#btn-stop'), finishRecording);
  // Pluss: status fra App Store ved start; endres den (kjøp, Familiedeling, refusjon), tegnes skjermen på nytt
  // «Pluss (test)» gjelder bare der utviklerdelen finnes (Xcode og TestFlight). En innstilling fra TestFlight skal ikke
  // låse opp Pluss i App Store-utgaven (0.11.4).
  const wantedMode = modeFromLegacy(getSettings());
  if (wantedMode !== 'app') viewModesAllowed().then(ok => { if (ok) { applyViewMode(wantedMode); route(); } }).catch(() => {});
  let plusWas = hasPlus();
  onPlusChange(plus => {
    updatePlusMarks();
    if (plus === plusWas) return;
    plusWas = plus;
    if (plus) setTimeout(maybeCamIntro, 600);
    // Bare skjermene som ser annerledes ut med og uten Pluss tegnes på nytt (ikke sjekken før kjøring eller opptaket)
    const h = location.hash || '#/';
    if (!(recorder && recorder.running) && (gateFor(h) || h.startsWith('#/rapport/') || ['#/', '#/logg', '#/innstillinger', '#/pluss'].includes(h))) route();
  });
  // Første status fra App Store kommer etter at Hjem er tegnet: tegn Hjem på nytt hvis prøveperioden kan tilbys
  refreshPlus().then(() => { updatePlusMarks(); if (!hasPlus() && plusState().trialAvailable && !screens.home.hidden) renderHome(); }).catch(() => {});
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
