/* IndexedDB-lagring. To tabeller:
   - drives: metadata + ferdig analyse per tur
   - chunks: råsensordata i biter (én bit per sjekkpunkt, hvert 10. sekund)
   Rådata beholdes så gamle turer kan analyseres på nytt når algoritmen blir bedre. */

const DB_NAME = 'kjorerapport';
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
  const raw = { loc: [], gyro: [], grav: [], acc: [] };
  for (const c of chunks) {
    for (const k of ['loc', 'gyro', 'grav', 'acc']) if (c[k]) for (const s of c[k]) raw[k].push(s);
  }
  return raw;
}

export async function updateDrive(id, patch) {
  const d = await getDrive(id);
  if (!d) return null;
  Object.assign(d, patch);
  await putDrive(d);
  return d;
}

/* Importerer en eksportert JSON-fil (eller rå {loc,gyro,grav}) som en ny tur. */
export async function importDrive(payload, { keepId = false } = {}) {
  const input = payload && payload.input ? payload.input : payload;
  if (!input || !Array.isArray(input.loc) || input.loc.length < 2) throw new Error('Fant ingen GPS-data i filen.');
  const xyz = arr => (arr || []).map(g => ({ t: num(g.t), x: num(g.x), y: num(g.y), z: num(g.z) }));
  const raw = {
    loc: input.loc.map(p => ({ t: num(p.t), lat: num(p.lat), lon: num(p.lon), speed: num(p.speed), bearing: num(p.bearing), acc: num(p.acc) })),
    gyro: xyz(input.gyro), grav: xyz(input.grav), acc: xyz(input.acc)
  };
  const meta = payload && payload.drive ? payload.drive : {};
  const id = keepId && typeof meta.id === 'string' && meta.id ? meta.id : newId();
  if (keepId && await getDrive(id)) return { skipped: true, id };
  const drive = {
    id,
    startedAt: typeof meta.startedAt === 'string' && !isNaN(Date.parse(meta.startedAt)) ? meta.startedAt : new Date().toISOString(),
    endedAt: meta.endedAt || null,
    status: 'done',
    imported: true,
    demo: !!meta.demo,
    interrupted: !!meta.interrupted,
    note: typeof meta.note === 'string' ? meta.note : '',
    gaps: Array.isArray(meta.gaps) ? meta.gaps : [],
    marks: Array.isArray(meta.marks) ? meta.marks.filter(m => Number.isFinite(m.t)).map(m => ({ t: m.t, note: typeof m.note === 'string' ? m.note : '', cat: typeof m.cat === 'string' ? m.cat : 'annet' })) : [],
    focus: Array.isArray(meta.focus) ? meta.focus.filter(f => typeof f === 'string').slice(0, 3) : [],
    counts: { loc: raw.loc.length, gyro: raw.gyro.length, grav: raw.grav.length, acc: raw.acc.length },
    diag: meta.diag && typeof meta.diag === 'object' ? meta.diag : null,
    driver: typeof meta.driver === 'string' ? meta.driver.slice(0, 40) : '',
    appVersion: 3
  };
  await putDrive(drive);
  await putChunk(drive.id, 0, raw);
  return drive;
}
const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));

/* Eksportformat for én tur (brukes av eksport og sikkerhetskopi). */
export async function exportPayload(drive) {
  const raw = await getRaw(drive.id);
  return {
    drive: { id: drive.id, startedAt: drive.startedAt, endedAt: drive.endedAt || null, sensitivity: drive.sensitivity, gaps: drive.gaps || [],
      marks: drive.marks || [], demo: !!drive.demo, interrupted: !!drive.interrupted, imported: !!drive.imported, note: drive.note || '',
      diag: drive.diag || null, counts: drive.counts || null, driver: drive.driver || '', focus: drive.focus || [] },
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
const SETTINGS_KEY = 'kjorerapport.settings';
const DEFAULTS = { sensitivity: 'normal', theme: 'auto', hideInstallHint: false, drivers: [], activeDriver: '' };
export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* privat modus o.l. */ }
}
