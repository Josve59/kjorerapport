/* IndexedDB-lagring. To tabeller:
   - drives: metadata + ferdig analyse per tur
   - chunks: råsensordata i biter (én bit per sjekkpunkt, hvert 10. sekund)
   Rådata beholdes så gamle turer kan analyseres på nytt når algoritmen blir bedre. */

/* Demovisning for trafikkskoler (0.24.0): egen database og egne innstillinger, så eierens ekte turer, elever og
   adresser aldri vises i en demo, og aldri blandes med eksempeleleven. Valget leses én gang når appen starter. */
export const DEMO_FLAG = 'kjorerapport.demo';
const demo = (() => { try { return typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_FLAG) === '1'; } catch { return false; } })();
export const isDemoMode = () => demo;
export function setDemoMode(on) { try { if (on) localStorage.setItem(DEMO_FLAG, '1'); else localStorage.removeItem(DEMO_FLAG); } catch { /* privat modus */ } }
const DB_NAME = demo ? 'kjorerapport-demo' : 'kjorerapport';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('drives')) {
        const s = db.createObjectStore('drives', { keyPath: 'id' });
        s.createIndex('startedAt', 'startedAt');
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const c = db.createObjectStore('chunks', { keyPath: ['driveId', 'seq'] });
        c.createIndex('driveId', 'driveId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = fn(t);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export async function putDrive(drive) {
  const db = await open();
  await tx(db, ['drives'], 'readwrite', t => t.objectStore('drives').put(drive));
  return drive;
}

export async function getDrive(id) {
  const db = await open();
  return reqToPromise(db.transaction('drives').objectStore('drives').get(id));
}

export async function listDrives() {
  const db = await open();
  const all = await reqToPromise(db.transaction('drives').objectStore('drives').getAll());
  return all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export async function putChunk(driveId, seq, data) {
  const db = await open();
  await tx(db, ['chunks'], 'readwrite', t => t.objectStore('chunks').put({ driveId, seq, ...data }));
}

export async function getRaw(driveId) {
  const db = await open();
  const idx = db.transaction('chunks').objectStore('chunks').index('driveId');
  const chunks = await reqToPromise(idx.getAll(driveId));
  chunks.sort((a, b) => a.seq - b.seq);
  const raw = { loc: [], gyro: [], grav: [], acc: [], head: [], road: [], blink: [] };   // blink: blinklyset (1.1.0)
  for (const c of chunks) {
    for (const k of ['loc', 'gyro', 'grav', 'acc', 'head', 'road', 'blink']) if (c[k]) for (const s of c[k]) raw[k].push(s);
  }
  // I tidsrekkefølge: målinger fra låst skjerm (iPhone-appen) kan havne i en senere bit enn tiden tilsier
  for (const k of Object.keys(raw)) raw[k].sort((a, b) => a.t - b.t);
  return raw;
}

export async function updateDrive(id, patch) {
  const d = await getDrive(id);
  if (!d) return null;
  Object.assign(d, patch);
  await putDrive(d);
  return d;
}

/* Analysen i en tur fra en fil (0.18.3): den er laget på en annen telefon og kan være ødelagt eller endret. Tall må være
   tall og lister må være lister, så rapporten verken krasjer eller viser tekst fra filen som HTML. Null hvis den er ubrukelig. */
const finOr = (v, d = 0) => (Number.isFinite(v) ? v : d);
export function cleanResult(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.points) || r.points.length < 2) return null;
  const points = r.points.filter(p => p && Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (points.length < 2) return null;
  const arr = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
  const scores = r.scores && typeof r.scores === 'object' ? r.scores : {};
  return { ...r, points,
    events: arr(r.events).map((e, i) => ({ ...e, n: Number.isFinite(e.n) ? e.n : i + 1, t: finOr(e.t), kind: typeof e.kind === 'string' && /^[a-z_]{1,20}$/.test(e.kind) ? e.kind : 'brake' })),
    overall: Math.round(Math.min(100, Math.max(0, finOr(r.overall)))), overallBase: Math.round(Math.min(100, Math.max(0, finOr(r.overallBase, finOr(r.overall))))),
    scores: Object.fromEntries(['brake', 'accel', 'turn', 'smooth'].map(k => [k, Math.round(Math.min(100, Math.max(0, finOr(scores[k], 100))))])),
    stats: r.stats && typeof r.stats === 'object' ? r.stats : { km: 0, duration: 0 }, counts: r.counts && typeof r.counts === 'object' ? r.counts : {} };
}

/* Tur fra en melding (0.18.0): eleven sender analysen og veidataene, ikke rådataene. Hos læreren hører den til eleven
   (driver) og regnes med som en ekte tur (shared). Finnes turen fra før, oppdateres den. */
export async function importSharedDrive(sd, { from = '', at = new Date().toISOString(), driver = null } = {}) {
  if (!sd || typeof sd.id !== 'string' || !/^[\w.:-]{1,80}$/.test(sd.id) || !sd.result || !Array.isArray(sd.result.points)) return null;
  const old = await getDrive(sd.id);
  if (old && !old.shared) return old;   // en egen tur med rådata overskrives aldri
  const result = cleanResult(sd.result);
  if (!result) return null;
  const drive = {
    ...(old || {}),
    id: sd.id, startedAt: typeof sd.startedAt === 'string' && !isNaN(Date.parse(sd.startedAt)) ? sd.startedAt : new Date().toISOString(),
    endedAt: sd.endedAt || null, status: 'done', imported: false, demo: false,
    // Sendt på nytt (0.18.3): en tur mottakeren har flyttet til en annen elev, blir der
    driver: old ? (old.driver || '') : String(driver !== null ? driver : (from || sd.driver || '')).slice(0, 40),   // hos eleven: '' (egne turer)
    note: typeof sd.note === 'string' ? sd.note.slice(0, 500) : '',
    marks: Array.isArray(sd.marks) ? sd.marks.filter(m => m && Number.isFinite(m.t)).map(m => ({ t: m.t, note: typeof m.note === 'string' ? m.note : '', cat: markCat(m.cat) })) : [],
    focus: Array.isArray(sd.focus) ? sd.focus.filter(x => typeof x === 'string').slice(0, 3) : [], surface: typeof sd.surface === 'string' ? sd.surface.slice(0, 10) : '',
    ...(sd.noFace ? { noFace: true } : {}), result, resultKey: 'delt', enrich: sd.enrich && typeof sd.enrich === 'object' ? sd.enrich : null,
    cameraPlan: sd.cameraPlan && typeof sd.cameraPlan === 'object' ? sd.cameraPlan : null,
    shared: { from: String(from || '').slice(0, 40), at }, counts: { loc: sd.result.points.length }, appVersion: 3
  };
  // Holdt utenfor hos avsenderen, eller av mottakeren selv (0.18.3: mottakerens valg blir stående når turen kommer på nytt)
  if (sd.excluded && typeof sd.excluded === 'object') drive.excluded = { at: String(sd.excluded.at || ''), reason: String(sd.excluded.reason || '').slice(0, 80) };
  else if (!(old && old.excluded)) delete drive.excluded;
  await putDrive(drive);
  return drive;
}

/* Importerer en eksportert JSON-fil (eller rå {loc,gyro,grav}) som en ny tur. */
export async function importDrive(payload, { keepId = false } = {}) {
  // Delt tur fra en melding (0.18.0) i en sikkerhetskopi: uten rådata
  if (payload && payload.sharedDrive) { const ex = keepId ? await getDrive(payload.sharedDrive.id) : null; if (ex) return { skipped: true, id: ex.id }; return importSharedDrive(payload.sharedDrive, { ...(payload.shared || {}), driver: payload.sharedDrive.driver || '' }); }
  const input = payload && payload.input ? payload.input : payload;
  if (!input || !Array.isArray(input.loc) || input.loc.length < 2) throw new Error('Fant ingen GPS-data i filen.');
  const xyz = arr => (arr || []).map(g => ({ t: num(g.t), x: num(g.x), y: num(g.y), z: num(g.z) }));
  const raw = {
    loc: input.loc.map(p => ({ t: num(p.t), lat: num(p.lat), lon: num(p.lon), speed: num(p.speed), bearing: num(p.bearing), acc: num(p.acc) })),
    gyro: xyz(input.gyro), grav: xyz(input.grav), acc: xyz(input.acc),
    head: (input.head || []).map(h => ({ t: num(h.t), yaw: num(h.yaw), pitch: num(h.pitch), ...(Number.isFinite(num(h.ex)) ? { ex: num(h.ex), ey: num(h.ey) } : {}), ok: !!h.ok })),
    road: (input.road || []).map(r => ({ t: num(r.t), cars: num(r.cars) || 0, people: num(r.people) || 0, lead: r.lead && Number.isFinite(num(r.lead.dist)) ? { cls: /^[a-z_]{1,16}$/.test(r.lead.cls) ? r.lead.cls : 'car', dist: num(r.lead.dist), wpx: num(r.lead.wpx), ...(r.lead.src === 'baklys' ? { src: 'baklys' } : {}) } : null,
      lane: r.lane ? { l: !!r.lane.l, r: !!r.lane.r, offset: Number.isFinite(num(r.lane.offset)) ? num(r.lane.offset) : null, ...(Number.isFinite(num(r.lane.k)) ? { k: num(r.lane.k) } : {}), ...(Number.isFinite(num(r.lane.lw)) ? { lw: num(r.lane.lw) } : {}) } : null, lum: Number.isFinite(num(r.lum)) ? num(r.lum) : null, ...(r.night ? { night: true } : {}), ...(Number.isFinite(num(r.best)) ? { best: num(r.best) } : {}),
      ...(typeof r.img === 'string' && r.img.startsWith('data:image/jpeg;base64,') && r.img.length < 250000 ? { img: r.img } : {}) })),
    // Blinklyset (1.1.0): bare tall, klikk { t, s } og lydnivå { t, db }
    blink: (input.blink || []).filter(b => b && Number.isFinite(num(b.t))).map(b => (Number.isFinite(num(b.s)) ? { t: num(b.t), s: num(b.s) } : { t: num(b.t), db: num(b.db) })).filter(b => Number.isFinite(b.s) || Number.isFinite(b.db))
  };
  const meta = payload && payload.drive ? payload.drive : {};
  // Id-en havner i adresser og HTML: bare bokstaver, tall og . : _ - (1.0.16, som for delte turer)
  const id = keepId && typeof meta.id === 'string' && /^[\w.:-]{1,80}$/.test(meta.id) ? meta.id : newId();
  if (keepId && await getDrive(id)) return { skipped: true, id };
  const drive = {
    id,
    startedAt: typeof meta.startedAt === 'string' && !isNaN(Date.parse(meta.startedAt)) ? meta.startedAt : new Date().toISOString(),
    endedAt: meta.endedAt || null,
    status: 'done',
    imported: keepId ? !!meta.imported : true,   // gjenoppretting fra sikkerhetskopi beholder turen som ekte
    demo: !!meta.demo,
    interrupted: !!meta.interrupted,
    note: typeof meta.note === 'string' ? meta.note : '',
    gaps: Array.isArray(meta.gaps) ? meta.gaps : [],
    marks: Array.isArray(meta.marks) ? meta.marks.filter(m => Number.isFinite(m.t)).map(m => ({ t: m.t, note: typeof m.note === 'string' ? m.note : '', cat: markCat(m.cat) })) : [],
    focus: Array.isArray(meta.focus) ? meta.focus.filter(f => typeof f === 'string').slice(0, 3) : [],
    surface: typeof meta.surface === 'string' ? meta.surface.slice(0, 10) : '',
    ...(meta.mock ? { mock: true } : {}),   // prøve-oppkjøring (1.1.0)
    ...(meta.noFace ? { noFace: true } : {}),
    // Holdt utenfor utregningene (0.18.0), med grunn
    ...(meta.excluded && typeof meta.excluded === 'object' ? { excluded: { at: String(meta.excluded.at || ''), reason: String(meta.excluded.reason || '').slice(0, 80) } } : {}),
    liveLimits: Array.isArray(meta.liveLimits) ? meta.liveLimits.filter(x => x && Number.isFinite(x.t)).map(x => ({ t: x.t, limit: Number.isFinite(x.limit) ? x.limit : null, ...(x.src === 'kamera' ? { src: 'kamera', ...(Number.isFinite(x.ahead) ? { ahead: x.ahead } : {}) } : {}) })).slice(0, 5000) : [],
    counts: { loc: raw.loc.length, gyro: raw.gyro.length, grav: raw.grav.length, acc: raw.acc.length, head: raw.head.length, road: raw.road.length, ...(raw.blink.length ? { blink: raw.blink.length } : {}) },
    calib: meta.calib && typeof meta.calib === 'object' ? meta.calib : null,
    cameraPlan: meta.cameraPlan && typeof meta.cameraPlan === 'object' ? meta.cameraPlan : null,
    diag: meta.diag && typeof meta.diag === 'object' ? meta.diag : null,
    driver: typeof meta.driver === 'string' ? meta.driver.slice(0, 40) : '',
    appVersion: 3
  };
  await putDrive(drive);
  await putChunk(drive.id, 0, raw);
  return drive;
}
const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
/* Kategorien på et merke fra en fil (1.0.16): et kort ord, ellers «annet», så den aldri blir HTML */
const markCat = c => (typeof c === 'string' && /^[a-z_]{1,20}$/.test(c) ? c : 'annet');

/* Eksportformat for én tur (brukes av eksport og sikkerhetskopi). */
export async function exportPayload(drive) {
  // Delt tur (0.18.0): har ingen rådata, så analysen tas med
  if (drive.shared) return { sharedDrive: { id: drive.id, startedAt: drive.startedAt, endedAt: drive.endedAt || null, driver: drive.driver || '', note: drive.note || '', marks: drive.marks || [], focus: drive.focus || [], surface: drive.surface || '', ...(drive.noFace ? { noFace: true } : {}), ...(drive.excluded ? { excluded: drive.excluded } : {}), result: drive.result, enrich: drive.enrich || null, cameraPlan: drive.cameraPlan || null }, shared: drive.shared };
  const raw = await getRaw(drive.id);
  return {
    drive: { id: drive.id, startedAt: drive.startedAt, endedAt: drive.endedAt || null, sensitivity: drive.sensitivity, gaps: drive.gaps || [],
      marks: drive.marks || [], demo: !!drive.demo, interrupted: !!drive.interrupted, imported: !!drive.imported, note: drive.note || '',
      diag: drive.diag || null, counts: drive.counts || null, driver: drive.driver || '', focus: drive.focus || [], surface: drive.surface || '', calib: drive.calib || null, cameraPlan: drive.cameraPlan || null, liveLimits: drive.liveLimits || [],
      ...(drive.noFace ? { noFace: true } : {}), ...(drive.mock ? { mock: true } : {}), ...(drive.excluded ? { excluded: drive.excluded } : {}) },   // med i kopien (0.18.0)
    input: raw
  };
}

/* JSON med NaN → null og tall rundet til 6 desimaler (mindre filer, ingen tap som betyr noe). */
export function toJSON(obj) {
  return JSON.stringify(obj, (k, v) => (typeof v === 'number' ? (Number.isNaN(v) ? null : Math.round(v * 1e6) / 1e6) : v));
}

/* Varig lagring: ber nettleseren om å ikke kaste dataene. Returnerer true/false/null (ukjent). */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

export async function deleteDrive(id) {
  const db = await open();
  await tx(db, ['drives', 'chunks'], 'readwrite', t => {
    t.objectStore('drives').delete(id);
    const idx = t.objectStore('chunks').index('driveId');
    idx.openKeyCursor(IDBKeyRange.only(id)).onsuccess = e => {
      const cur = e.target.result;
      if (cur) { t.objectStore('chunks').delete(cur.primaryKey); cur.continue(); }
    };
  });
}

export async function deleteAll() {
  const db = await open();
  await tx(db, ['drives', 'chunks'], 'readwrite', t => {
    t.objectStore('drives').clear();
    t.objectStore('chunks').clear();
  });
}

/* Innstillinger er små og ufarlige, så de ligger i localStorage. */
const SETTINGS_KEY = demo ? 'kjorerapport.settings.demo' : 'kjorerapport.settings';
const DEFAULTS = { sensitivity: 'normal', theme: 'auto', hideInstallHint: false, drivers: [], activeDriver: '' };
export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* privat modus o.l. */ }
}
