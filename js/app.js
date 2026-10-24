/* Kjørerapport – skjermer og navigasjon. Alt skjer lokalt på telefonen. */
import { analyze, makeDemo, SENSITIVITY } from './analysis.js';
import { Recorder, requestMotionPermission, requestLocationOnce, startPrecheck } from './recorder.js';
import { listDrives, getDrive, putDrive, updateDrive, importDrive, deleteDrive, deleteAll, getSettings, saveSettings, exportPayload, toJSON, requestPersistentStorage } from './db.js';
import { renderReport, trendChart, eventsPer10km } from './report.js';
import { enrichDrive } from './enrich.js';
import { esc, km, n0, n1, date, duration } from './format.js';

export const APP_VERSION = '0.3.2';
const $ = sel => document.querySelector(sel);
const screens = {};
let recorder = null;
let stopPrecheck = null;
let swUpdateReady = null;
let installPrompt = null;
let persistState = null;

function show(name) {
  Object.values(screens).forEach(s => s.hidden = true);
  screens[name].hidden = false;
  window.scrollTo(0, 0);
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
  return { factor: currentSensitivity().factor, engine: s.engine === 'v3' ? 'v3' : 'v1', perKm: s.perKm !== false };
}

async function analyzeDrive(drive) {
  const opts = analysisOptions();
  const key = `${opts.factor}|${opts.engine}|${opts.perKm}|3`;
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

/* ---------- Hjem ---------- */
async function renderHome() {
  show('home');
  const list = $('#drive-list');
  list.innerHTML = '<li class="muted">Laster …</li>';
  const drives = await listDrives();
  for (const d of drives) if (d.status === 'recording') { d.status = 'done'; d.interrupted = true; await putDrive(d); }
  const items = [];
  const results = [];     // bare ekte opptak – demo og importerte turer holdes utenfor oppsummering og trend
  let best = null;
  const isReal = d => !d.demo && !d.imported;
  for (const d of drives) {
    let res = null;
    try { res = await analyzeDrive(d); } catch { /* for lite data */ }
    if (res && isReal(d)) { results.push(res); if (!best || res.overall > best.overall) best = { ...res, id: d.id }; }
    const tags = [d.demo ? 'demo' : '', d.imported ? 'importert' : '', d.interrupted ? 'avbrutt' : ''].filter(Boolean);
    items.push(`<li>
      <button type="button" class="drive" data-id="${d.id}">
        <span class="drive-main"><strong>${esc(date(d.startedAt))}</strong>
          <span class="muted">${res ? [km(res.stats.km), duration(res.stats.duration), ...tags].join('<span class="sep">·</span>') : ['For lite data til rapport', ...tags].join('<span class="sep">·</span>')}</span>
          ${d.note ? `<span class="muted small note-snippet">${esc(d.note)}</span>` : ''}</span>
        ${res ? `<span class="score ${res.overall >= 90 ? 'good' : res.overall >= 75 ? 'mid' : 'bad'}">${res.overall}</span>` : '<span class="score muted">–</span>'}
      </button>
    </li>`);
  }
  list.innerHTML = items.length ? items.join('') : '<li class="empty muted">Ingen turer enda. Fest telefonen i holderen, og trykk «Start kjøretur».</li>';
  list.querySelectorAll('.drive').forEach(b => b.addEventListener('click', () => { location.hash = '#/rapport/' + b.dataset.id; }));

  // Oppsummering
  const sum = $('#summary');
  if (results.length) {
    const totalKm = results.reduce((s, r) => s + r.stats.km, 0);
    const avg = results.reduce((s, r) => s + r.overall, 0) / results.length;
    const ev10 = totalKm > 0.2 ? results.reduce((s, r) => s + r.events.length, 0) / totalKm * 10 : 0;
    sum.innerHTML = `
      <div class="tile"><span class="tile-val">${results.length}</span><span class="tile-label">${results.length === 1 ? 'tur' : 'turer'}</span></div>
      <div class="tile"><span class="tile-val">${km(totalKm)}</span><span class="tile-label">til sammen</span></div>
      <div class="tile"><span class="tile-val">${n0(avg)}</span><span class="tile-label">snittpoeng</span></div>
      <div class="tile"><span class="tile-val">${best.overall}</span><span class="tile-label">beste tur</span></div>
      <div class="tile"><span class="tile-val">${n1(ev10)}</span><span class="tile-label">hendelser per 10 km</span></div>`;
    sum.hidden = false;
  } else sum.hidden = true;

  const scores = results.map(r => r.overall).reverse();
  $('#trend').innerHTML = scores.length >= 2 ? `<h2>Utvikling</h2><p class="muted small">Bare ekte opptak telles med her.</p>${trendChart(scores)}` : '';
  $('#howto').hidden = drives.length > 0;
  $('#update-banner').hidden = !swUpdateReady;
  renderInstallHint();
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
  btnAnyway.hidden = true;
  btnPerm.hidden = false;
  btnPerm.disabled = false;
  setCheck(gps, null, 'Venter på tilgang');
  setCheck(mot, null, 'Venter på tilgang');
  $('#precheck-error').textContent = '';
  if (stopPrecheck) { stopPrecheck(); stopPrecheck = null; }

  btnPerm.onclick = async () => {
    btnPerm.disabled = true;
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
    const since = performance.now();
    stopPrecheck = startPrecheck(st => {
      const waited = (performance.now() - since) / 1000;
      if (st.gpsError) setCheck(gps, false, st.gpsError.code === 1 ? 'Posisjonstilgang avslått' : 'Ingen GPS-signal');
      else if (Number.isFinite(st.acc)) setCheck(gps, st.gpsOk, `${n0(st.acc)} m nøyaktighet${st.gpsOk ? '' : ' (må være 20 m eller bedre' + (waited > 10 ? ' – blir ofte bedre når bilen står ute og står stille)' : ')')}`);
      if (motion !== 'denied' && motion !== 'unsupported') setCheck(mot, st.motionOk, st.motionOk ? 'Bevegelsesdata mottas' : 'Ingen bevegelsesdata enda – beveg telefonen litt');
      btnStart.disabled = !(st.gpsOk && st.motionOk);
      // Nødutgang: etter 20 s venting med brukbar GPS (≤ 40 m) kan man starte likevel.
      const anyway = !st.gpsOk && st.motionOk && Number.isFinite(st.acc) && st.acc <= 40 && waited > 20;
      btnAnyway.hidden = !anyway;
      if (anyway) btnAnyway.textContent = `Start likevel (${n0(st.acc)} m nøyaktighet)`;
    });
  };
  btnStart.onclick = () => startRecording();
  btnAnyway.onclick = () => startRecording();
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
  let gapMsg = '';
  recorder = new Recorder({
    sensitivity: settings.sensitivity,
    appVersion: APP_VERSION,
    replay,
    onStatus: st => {
      if (st.replayDone) { finishRecording(); return; }
      elapsed.textContent = fmtClock(st.elapsed);
      dist.textContent = km(st.distanceM / 1000);
      if (st.gpsError) { gps.textContent = 'GPS: ingen signal'; gps.dataset.state = 'fail'; }
      else if (!st.gpsFresh) { gps.textContent = 'GPS: venter …'; gps.dataset.state = 'wait'; }
      else { gps.textContent = `GPS: ${n0(st.acc)} m`; gps.dataset.state = st.acc <= 20 ? 'ok' : 'wait'; }
      saved.textContent = st.lastCheckpoint === null ? 'Lagrer første bit om litt' : `Sist lagret for ${n0(st.elapsed - st.lastCheckpoint)} s siden · ${st.locCount} GPS-punkter`;
      markCount.textContent = st.marks ? `${st.marks} ${st.marks === 1 ? 'merke' : 'merker'}` : '';
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
    alert('Kunne ikke starte opptak: ' + err.message);
    location.hash = '#/';
  }
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
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ title: 'Kjørerapport', text }); return; } catch { /* avbrutt */ }
  }
  try { await navigator.clipboard.writeText(text); alert('Oppsummeringen er kopiert. Lim den inn i en melding eller e-post.'); }
  catch { prompt('Kopier teksten:', text); }
}

async function renderDriveReport(id) {
  show('report');
  const root = $('#report-root');
  root.innerHTML = '<p class="muted">Analyserer turen …</p>';
  const drive = await getDrive(id);
  if (!drive) { root.innerHTML = '<p class="notice">Fant ikke turen.</p>'; return; }
  const drives = await listDrives();
  const idx = drives.findIndex(d => d.id === id);
  let prev = null;
  // Sammenlign bare med forrige ekte opptak, og bare hvis denne turen selv er ekte.
  if (!drive.demo && !drive.imported) {
    for (let i = idx + 1; i < drives.length; i++) if (drives[i].result && !drives[i].demo && !drives[i].imported) { prev = drives[i].result; break; }
  }
  const sens = currentSensitivity();
  const tags = [drive.demo ? 'demotur via opptakeren' : '', drive.imported ? 'importert' : ''].filter(Boolean);
  try {
    const r = await analyzeDrive(drive);
    const settings = getSettings();
    const wants = { limits: !!settings.netLimits, names: !!settings.netNames };
    const missing = (wants.limits && !(drive.enrich && drive.enrich.limits)) || (wants.names && !(drive.enrich && drive.enrich.names));
    const draw = (status) => renderReport(root, r, {
      prevScore: prev ? prev.overall : null, prev,
      title: 'Kjørerapport', subtitle: date(drive.startedAt) + (tags.length ? ' · ' + tags.join(', ') : ''),
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
      onDelete: async () => { if (confirm('Slette denne turen? Dette kan ikke angres.')) { await deleteDrive(id); location.hash = '#/'; } }
    });
    let enriching = false;
    const runEnrich = async (manual) => {
      if (enriching || !missing || !navigator.onLine) return;
      const last = drive.enrich && drive.enrich.attemptedAt ? Date.parse(drive.enrich.attemptedAt) : 0;
      if (!manual && Date.now() - last < 3600000) return;   // ikke mas ved gjentatte feil
      enriching = true;
      draw({ text: 'Starter …' });
      const marksRows = (drive.marks || []).map((m, i) => { const t = m.t - (r.t0 || 0); const pt = r.points.length ? r.points.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a) : null; return { i, lat: pt ? pt.lat : NaN, lon: pt ? pt.lon : NaN }; });
      try {
        const enrich = await enrichDrive(r, marksRows, wants, drive.enrich, text => {
          const el = root.querySelector('#enrich-status'); if (el) el.textContent = text;
        });
        enrich.attemptedAt = new Date().toISOString(); enrich.error = null;
        drive.enrich = enrich;
        await putDrive(drive);
        if (location.hash === '#/rapport/' + id) renderDriveReport(id);
      } catch (err) {
        drive.enrich = { ...(drive.enrich || {}), attemptedAt: new Date().toISOString(), error: err.message };
        await putDrive(drive);
        enriching = false;
        draw({ text: 'Kunne ikke hente: ' + err.message, error: true });
      }
    };
    draw(null);
    if (missing && navigator.onLine) runEnrich(false);
  } catch (err) {
    root.innerHTML = `<section class="card"><h2>Ikke nok data</h2><p>${esc(err.message)}</p>
      <p class="muted">Turen startet ${esc(date(drive.startedAt))}. Rådataene er lagret, så du kan slette turen eller beholde den.</p>
      <button type="button" class="btn danger" id="btn-del-drive">Slett denne turen</button></section>`;
    $('#btn-del-drive').onclick = async () => { if (confirm('Slette denne turen?')) { await deleteDrive(id); location.hash = '#/'; } };
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
    factor: sens.factor, sensitivityLabel: sens.label, onShare: shareText
  });
}

/* ---------- Innstillinger ---------- */
async function renderSettings() {
  show('settings');
  const settings = getSettings();
  document.querySelectorAll('input[name=sensitivity]').forEach(r => {
    r.checked = r.value === settings.sensitivity;
    r.onchange = () => { saveSettings({ ...getSettings(), sensitivity: r.value }); };
  });
  document.querySelectorAll('input[name=theme]').forEach(r => {
    r.checked = r.value === (settings.theme || 'auto');
    r.onchange = () => { saveSettings({ ...getSettings(), theme: r.value }); applyTheme(); };
  });
  document.querySelectorAll('input[name=engine]').forEach(r => {
    r.checked = r.value === (settings.engine === 'v3' ? 'v3' : 'v1');
    r.onchange = () => { saveSettings({ ...getSettings(), engine: r.value }); };
  });
  ['netLimits', 'netNames'].forEach(key => {
    const el = $('#' + key);
    el.checked = !!settings[key];
    el.onchange = () => { saveSettings({ ...getSettings(), [key]: el.checked }); };
  });
  document.querySelectorAll('input[name=perkm]').forEach(r => {
    r.checked = r.value === (settings.perKm === false ? 'off' : 'on');
    r.onchange = () => { saveSettings({ ...getSettings(), perKm: r.value === 'on' }); };
  });
  const sel = $('#export-select');
  const drives = await listDrives();
  sel.innerHTML = drives.length ? drives.map(d => `<option value="${d.id}">${esc(date(d.startedAt))}${d.demo ? ' (demo)' : ''}${d.note ? ' – ' + esc(d.note.slice(0, 30)) : ''}</option>`).join('') : '<option value="">Ingen turer</option>';
  $('#btn-export').disabled = !drives.length;
  $('#btn-export').onclick = () => exportDrive(sel.value);
  $('#persist-status').textContent = persistState === true ? 'Varig lagring: på. Nettleseren skal ikke slette turene dine.'
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
      alert(`${added} ${added === 1 ? 'tur' : 'turer'} gjenopprettet${skipped ? `, ${skipped} fantes fra før` : ''}.`);
      location.hash = '#/';
    } catch (err) {
      alert('Kunne ikke gjenopprette: ' + err.message);
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
      alert('Kunne ikke importere: ' + err.message);
      e.target.value = '';
    }
  };
  $('#btn-reanalyze').onclick = async () => {
    for (const d of drives) { d.result = null; await putDrive(d); }
    alert('Alle turer analyseres på nytt neste gang de åpnes.');
  };
  $('#btn-delete-all').onclick = async () => {
    if (confirm('Slette alle turer? Dette kan ikke angres.')) { await deleteAll(); alert('Alle turer er slettet.'); location.hash = '#/'; }
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

async function exportDrive(id) {
  if (!id) return;
  const drive = await getDrive(id);
  const payload = { app: 'Kjørerapport', version: APP_VERSION, exportedAt: new Date().toISOString(), ...(await exportPayload(drive)) };
  await shareFile(toJSON(payload), `kjorerapport-${drive.startedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`);
}

async function backupAll(drives) {
  const items = [];
  for (const d of drives) items.push(await exportPayload(d));
  const payload = { app: 'Kjørerapport', version: APP_VERSION, exportedAt: new Date().toISOString(), drives: items };
  await shareFile(toJSON(payload), `kjorerapport-sikkerhetskopi-${new Date().toISOString().slice(0, 10)}.json`);
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
  if (h === '#/') renderHome();
  else if (h === '#/sjekk') renderPrecheck();
  else if (h === '#/opptak') { if (!recorder) location.hash = '#/'; }
  else if (h === '#/demo') renderDemoReport();
  else if (h === '#/innstillinger') renderSettings();
  else if (h.startsWith('#/rapport/')) renderDriveReport(h.slice('#/rapport/'.length));
  else location.hash = '#/';
}

function init() {
  applyTheme();
  ['home', 'precheck', 'record', 'report', 'settings'].forEach(n => { screens[n] = document.getElementById(n); });
  $('#btn-go-precheck').onclick = () => { location.hash = '#/sjekk'; };
  $('#btn-demo').onclick = () => { location.hash = '#/demo'; };
  $('#btn-settings').onclick = () => { location.hash = '#/innstillinger'; };
  document.querySelectorAll('.btn-back').forEach(b => b.onclick = () => { location.hash = '#/'; });
  setupLongPress($('#btn-stop'), finishRecording);
  $('#btn-mark').onclick = () => {
    if (!recorder || !recorder.running) return;
    const m = recorder.mark();
    if (m) {
      vibrate(40);
      const b = $('#btn-mark');
      b.classList.add('flash');
      setTimeout(() => b.classList.remove('flash'), 400);
    }
  };
  $('#btn-update').onclick = () => { if (swUpdateReady) swUpdateReady.postMessage('skipWaiting'); };
  $('#version').textContent = `Kjørerapport versjon ${APP_VERSION}`;
  window.addEventListener('hashchange', route);
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
