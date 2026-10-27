/* Sensoropptak: GPS + gyroskop + tyngdekraft, lagret i IndexedDB med sjekkpunkt hvert 10. sekund.
   Alle tidsstempler er sekunder siden opptaket startet (performance.now()). */

import { newId, putDrive, putChunk } from './db.js';
import { RAD, deriveGravity, shouldStore, gyroFromRotationRate, linearFromEvent, gapFromHidden, haversine, isStaleStartFix } from './sensors.js';

const CHECKPOINT_MS = 10000;

/* iOS krever at dette kalles fra et trykk. Returnerer 'granted' | 'denied' | 'unsupported'. */
export async function requestMotionPermission() {
  if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try { return await DeviceMotionEvent.requestPermission(); }
    catch { return 'denied'; }
  }
  return 'granted';
}

export function requestLocationOnce(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Ingen posisjonstjeneste'));
    navigator.geolocation.getCurrentPosition(resolve, reject,
      { enableHighAccuracy: true, maximumAge: 0, timeout });
  });
}

/* Liten "live-sjekk"-overvåker for før-kjøring-skjermen. */
export function startPrecheck(onUpdate) {
  const state = { acc: NaN, motionCount: 0, motionOk: false, gpsOk: false, gpsError: null, motionSeen: 0, steady: null };
  let lastMotion = 0, lastG = 0;
  const gWin = [];   // tyngdekraftretning siste ca. 2 s, for «står stødig»
  const onMotion = e => {
    state.motionSeen++; lastMotion = performance.now();
    const g = e.accelerationIncludingGravity;
    if (g && Number.isFinite(g.x) && lastMotion - lastG > 50) {
      lastG = lastMotion;
      const m = Math.hypot(g.x, g.y, g.z) || 1;
      gWin.push({ t: lastMotion, x: g.x / m, y: g.y / m, z: g.z / m });
      while (gWin.length && lastMotion - gWin[0].t > 2000) gWin.shift();
    }
  };
  window.addEventListener('devicemotion', onMotion);
  const watchId = navigator.geolocation ? navigator.geolocation.watchPosition(pos => {
    state.acc = pos.coords.accuracy;
    state.gpsOk = Number.isFinite(state.acc) && state.acc <= 20;
    state.gpsError = null;
    onUpdate({ ...state });
  }, err => { state.gpsError = err; state.gpsOk = false; onUpdate({ ...state }); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }) : null;
  const timer = setInterval(() => {
    state.motionOk = performance.now() - lastMotion < 2000 && state.motionSeen > 5;
    if (gWin.length >= 15) {
      const mean = gWin.reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y, z: a.z + v.z }), { x: 0, y: 0, z: 0 });
      const mm = Math.hypot(mean.x, mean.y, mean.z) || 1;
      const spread = Math.max(...gWin.map(v => Math.acos(Math.min(1, (v.x * mean.x + v.y * mean.y + v.z * mean.z) / mm)) * 180 / Math.PI));
      state.steady = spread < 4;
    } else state.steady = null;
    onUpdate({ ...state });
  }, 500);
  return () => {
    window.removeEventListener('devicemotion', onMotion);
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    clearInterval(timer);
  };
}

export class Recorder {
  constructor(opts = {}) {
    this.onStatus = opts.onStatus || (() => {});
    this.sensitivity = opts.sensitivity || 'normal';
    this.appVersion = opts.appVersion || null;
    this.driver = opts.driver || '';
    this.focus = Array.isArray(opts.focus) ? opts.focus.slice(0, 3) : [];
    this.calib = opts.calib || null;
    this.replay = opts.replay || null;        // { data, speed } – utvikleralternativ: spill av demotur
    this.reset();
  }

  reset() {
    this.drive = null;
    this.t0 = 0;
    this.buf = { loc: [], gyro: [], grav: [], acc: [], head: [], road: [] };
    this.headOk = 0; this.headN = 0; this.roadN = 0; this.roadLead = 0; this.speed = NaN;
    this.seq = 0;
    this.lastMotionT = -1;
    this.grav = null;
    this.gaps = [];
    this.marks = [];
    this.hiddenAt = null;
    this.distance = 0;
    this.lastFix = null;
    this.lastFixWall = 0;
    this.locCount = 0;
    this.motionCount = 0;
    this.acc = NaN;
    this.wakeLock = null;
    this.wakeLockFailed = false;
    this.running = false;
    this.lastCheckpoint = null;
    this.diag = {
      motionEvents: 0, hasLinearAcc: false, hasIncGravity: false, hasGyro: false,
      gpsFixes: 0, gpsAccuracies: [], wakeLock: 'ukjent', standalone: isStandalone(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '', replay: !!this.replay
    };
  }

  /* Sekunder siden start. I avspillingsmodus går klokka raskere, så tidsstemplene blir som på en ekte tur. */
  now() {
    const s = (performance.now() - this.t0) / 1000;
    return this.replay ? s * (this.replay.speed || 60) : s;
  }

  async start() {
    this.reset();
    this.t0 = performance.now();
    this.running = true;
    this.drive = {
      id: newId(),
      startedAt: new Date().toISOString(),
      status: 'recording',
      sensitivity: this.sensitivity,
      demo: !!this.replay,
      driver: this.driver,
      focus: this.focus,
      calib: this.calib || null,
      gaps: [],
      marks: [],
      counts: { loc: 0, gyro: 0, grav: 0, acc: 0, head: 0, road: 0 },
      appVersion: 3
    };
    await putDrive(this.drive);

    this._onMotion = e => this.handleMotion(e);
    this._onVis = () => this.handleVisibility();
    document.addEventListener('visibilitychange', this._onVis);

    if (this.replay) {
      this.startReplay();
    } else {
      window.addEventListener('devicemotion', this._onMotion);
      this.watchId = navigator.geolocation.watchPosition(
        pos => this.handlePosition(pos),
        err => { this.gpsError = err; this.emit(); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
    }
    this.checkpointTimer = setInterval(() => this.checkpoint(), CHECKPOINT_MS);
    this.statusTimer = setInterval(() => this.emit(), 1000);
    await this.acquireWakeLock();
    this.emit();
    return this.drive.id;
  }

  async acquireWakeLock() {
    if (!('wakeLock' in navigator)) { this.wakeLockFailed = true; this.diag.wakeLock = 'ikke støttet'; this.emit(); return; }
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLockFailed = false;
      this.diag.wakeLock = 'ok';
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch (err) {
      this.wakeLock = null;
      this.wakeLockFailed = true;
      this.diag.wakeLock = 'feilet: ' + (err && err.name ? err.name : 'ukjent');
    }
    this.emit();
  }

  handleVisibility() {
    if (!this.running) return;
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = this.now();
    } else {
      if (this.hiddenAt !== null) {
        const gap = gapFromHidden(this.hiddenAt, this.now());
        this.hiddenAt = null;
        if (gap) {
          this.gaps.push(gap);
          this.drive.gaps = this.gaps;
          this.returnedFromGap = gap;
        }
      }
      this.acquireWakeLock();
      this.emit();
    }
  }

  /* GPS: {t, lat, lon, speed, bearing, acc}. null blir NaN. */
  handlePosition(pos, tOverride) {
    const c = pos.coords;
    const t = Number.isFinite(tOverride) ? tOverride : this.now();
    // Oppvarming: gamle eller unøyaktige fikser før første gode posisjon forkastes (ga 416 km/t på første ekte tur).
    const age = Number.isFinite(pos.timestamp) ? Date.now() - pos.timestamp : NaN;
    if (!this.replay && isStaleStartFix(c.accuracy, age, this.gpsLocked)) { this.diag.staleStartFixes = (this.diag.staleStartFixes || 0) + 1; this.warmup = true; return; }
    this.gpsLocked = true;
    this.warmup = false;
    const sample = {
      t,
      lat: c.latitude,
      lon: c.longitude,
      speed: c.speed === null || c.speed === undefined ? NaN : c.speed,
      bearing: c.heading === null || c.heading === undefined ? NaN : c.heading,
      acc: c.accuracy
    };
    this.buf.loc.push(sample);
    this.locCount++;
    this.diag.gpsFixes++;
    if (Number.isFinite(c.accuracy) && this.diag.gpsAccuracies.length < 2000) this.diag.gpsAccuracies.push(Math.round(c.accuracy));
    this.acc = c.accuracy;
    this.gpsError = null;
    if (this.lastFix && Number.isFinite(c.accuracy) && c.accuracy <= 50) {
      this.distance += haversine(this.lastFix, sample);
    }
    if (Number.isFinite(c.accuracy) && c.accuracy <= 50) this.lastFix = sample;
    this.speed = sample.speed;
    this.lastFixWall = performance.now();
  }

  /* Bevegelse: rotationRate i grader/s → rad/s. Tyngdekraft = inkl. − uten, eller lavpass.
     Lineær akselerasjon (uten tyngdekraft) lagres også – brukes av v3-motoren. */
  handleMotion(e, tOverride) {
    const t = Number.isFinite(tOverride) ? tOverride : this.now();
    const { grav, state } = deriveGravity(e.accelerationIncludingGravity, e.acceleration, this.grav);
    this.grav = state;
    this.motionCount++;
    const d = this.diag;
    d.motionEvents++;
    if (!d.hasLinearAcc && e.acceleration && Number.isFinite(e.acceleration.x)) d.hasLinearAcc = true;
    if (!d.hasIncGravity && e.accelerationIncludingGravity && Number.isFinite(e.accelerationIncludingGravity.x)) d.hasIncGravity = true;
    if (!d.hasGyro && e.rotationRate && Number.isFinite(e.rotationRate.alpha)) d.hasGyro = true;
    if (!shouldStore(t, this.lastMotionT)) return;   // nedsampling til ca. 20 Hz
    this.lastMotionT = t;
    const g = gyroFromRotationRate(e.rotationRate);
    if (g) this.buf.gyro.push({ t, x: g.x, y: g.y, z: g.z });
    if (grav) this.buf.grav.push({ t, x: grav.x, y: grav.y, z: grav.z });
    const lin = linearFromEvent(e.acceleration);
    if (lin) this.buf.acc.push({ t, x: lin.x, y: lin.y, z: lin.z });
  }

  /* Ledsagerens merke: et tidspunkt å kommentere etterpå. Ingen tilbakemelding til føreren. */
  /* Hodets retning fra kameraet (grader). pose = null når ansiktet ikke ses. */
  addHead(pose) {
    if (!this.running) return;
    const t = this.now();
    this.headN++;
    if (pose) this.headOk++;
    this.buf.head.push(pose ? { t, yaw: Math.round(pose.yaw * 10) / 10, pitch: Math.round(pose.pitch * 10) / 10, ok: true } : { t, ok: false });
  }

  /* Veikameraet: tall om veien foran (aldri bilder). */
  addRoad(r) {
    if (!this.running) return;
    this.roadN++;
    if (r.lead) this.roadLead++;
    this.buf.road.push({ t: this.now(), cars: r.cars, people: r.people, lead: r.lead ? { cls: r.lead.cls, dist: r.lead.dist, wpx: r.lead.wpx } : null });
  }

  mark(cat = 'annet') {
    if (!this.running) return null;
    const t = this.now(), last = this.marks[this.marks.length - 1];
    if (last && last.cat === cat && t - last.t < 2.5) return null;   // dobbelttrykk
    const m = { t, note: '', cat };
    this.marks.push(m);
    this.drive.marks = this.marks;
    this.emit();
    return m;
  }

  /* Angrer siste merke (feiltrykk). Returnerer merket som ble fjernet. */
  undoMark() {
    if (!this.running || !this.marks.length) return null;
    const m = this.marks.pop();
    this.drive.marks = this.marks;
    this.emit();
    return m;
  }

  async checkpoint() {
    if (!this.drive) return;
    const b = this.buf;
    if (!b.loc.length && !b.gyro.length && !b.grav.length && !b.acc.length && !b.head.length && !b.road.length) return;
    this.buf = { loc: [], gyro: [], grav: [], acc: [], head: [], road: [] };
    this.drive.counts.loc += b.loc.length;
    this.drive.counts.gyro += b.gyro.length;
    this.drive.counts.grav += b.grav.length;
    this.drive.counts.acc += b.acc.length;
    this.drive.counts.head = (this.drive.counts.head || 0) + b.head.length;
    this.drive.counts.road = (this.drive.counts.road || 0) + b.road.length;
    this.drive.marks = this.marks;
    this.drive.distanceM = this.distance;
    this.drive.duration = this.now();
    this.drive.gaps = this.gaps;
    this.drive.diag = this.diagSummary();
    try {
      await putChunk(this.drive.id, this.seq++, b);
      await putDrive(this.drive);
      this.lastCheckpoint = this.now();
    } catch (err) {
      console.error('Sjekkpunkt feilet', err);
    }
  }

  async stop() {
    if (!this.running) return this.drive;
    this.running = false;
    clearInterval(this.checkpointTimer);
    clearInterval(this.statusTimer);
    if (this.replayTimer) { clearInterval(this.replayTimer); this.replayTimer = null; }
    window.removeEventListener('devicemotion', this._onMotion);
    document.removeEventListener('visibilitychange', this._onVis);
    if (this.watchId !== undefined && this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.wakeLock) { try { await this.wakeLock.release(); } catch { /* ignorer */ } this.wakeLock = null; }
    await this.checkpoint();
    this.drive.status = 'done';
    this.drive.endedAt = new Date().toISOString();
    this.drive.duration = this.now();
    this.drive.distanceM = this.distance;
    this.drive.diag = this.diagSummary();
    await putDrive(this.drive);
    return this.drive;
  }

  /* Kort oppsummering av hva telefonen leverte – lagres på turen og blir med i eksport. */
  diagSummary() {
    const d = this.diag;
    const sec = Math.max(1, this.replay ? this.now() : (performance.now() - this.t0) / 1000);
    const acc = d.gpsAccuracies.slice().sort((a, b) => a - b);
    return {
      motionHz: Math.round(d.motionEvents / sec * 10) / 10,
      motionEvents: d.motionEvents,
      hasLinearAcc: d.hasLinearAcc, hasIncGravity: d.hasIncGravity, hasGyro: d.hasGyro,
      gpsFixes: d.gpsFixes, gpsHz: Math.round(d.gpsFixes / sec * 100) / 100,
      gpsMedianAcc: acc.length ? acc[Math.floor(acc.length / 2)] : null,
      wakeLock: d.wakeLock, standalone: d.standalone, replay: d.replay,
      gaps: this.gaps.length, marks: this.marks.length,
      road: this.roadN ? { samples: this.roadN, leadShare: Math.round(this.roadLead / this.roadN * 100) / 100 } : null,
      camera: this.headN ? { samples: this.headN, faceShare: Math.round(this.headOk / this.headN * 100) / 100, hz: Math.round(this.headN / sec * 10) / 10 } : null, staleStartFixes: d.staleStartFixes || 0,
      userAgent: d.userAgent, appVersion: this.appVersion || null
    };
  }

  emit() {
    const gpsAge = this.lastFixWall ? (performance.now() - this.lastFixWall) / 1000 : Infinity;
    this.onStatus({
      elapsed: this.now(),
      distanceM: this.distance,
      acc: this.acc,
      kmh: Number.isFinite(this.speed) ? this.speed * 3.6 : NaN,
      gpsFresh: gpsAge < 5,
      warmup: !!this.warmup,
      gpsError: this.gpsError || null,
      motionCount: this.motionCount,
      locCount: this.locCount,
      wakeLockFailed: this.wakeLockFailed,
      lastCheckpoint: this.lastCheckpoint,
      marks: this.marks.length,
      markCats: this.marks.reduce((o, m) => { o[m.cat] = (o[m.cat] || 0) + 1; return o; }, {}),
      returnedFromGap: this.returnedFromGap || null
    });
    this.returnedFromGap = null;
  }

  /* Utvikler: mater demoturen gjennom nøyaktig samme håndterere som ekte sensorer. */
  startReplay() {
    const { data } = this.replay;
    const loc = data.loc.slice().sort((a, b) => a.t - b.t);
    const gyro = data.gyro.slice().sort((a, b) => a.t - b.t);
    const grav = data.grav.slice().sort((a, b) => a.t - b.t);
    const acc = (data.acc || []).slice().sort((a, b) => a.t - b.t);
    let li = 0, gi = 0;
    this.replayDone = false;
    this.replayTimer = setInterval(() => {
      const simT = this.now();
      while (li < loc.length && loc[li].t <= simT) {
        const p = loc[li++];
        this.handlePosition({ coords: { latitude: p.lat, longitude: p.lon, speed: p.speed,
          heading: Number.isFinite(p.bearing) ? p.bearing : null, accuracy: p.acc } }, p.t);
      }
      while (gi < gyro.length && gyro[gi].t <= simT) {
        const g = gyro[gi], q = grav[Math.min(gi, grav.length - 1)], a = acc.length ? acc[Math.min(gi, acc.length - 1)] : null;
        gi++;
        // Opptakeren forventer grader/s (som nettleseren gir), så vi konverterer tilbake.
        this.handleMotion({
          rotationRate: { alpha: g.z / RAD, beta: g.x / RAD, gamma: g.y / RAD },
          acceleration: a ? { x: a.x, y: a.y, z: a.z } : { x: 0, y: 0, z: 0 },
          accelerationIncludingGravity: a ? { x: q.x + a.x, y: q.y + a.y, z: q.z + a.z } : { x: q.x, y: q.y, z: q.z }
        }, g.t);
      }
      if (li >= loc.length && gi >= gyro.length) {
        this.replayDone = true;
        clearInterval(this.replayTimer); this.replayTimer = null;
        this.onStatus({ replayDone: true });
      }
    }, 20);
  }
}

function isStandalone() {
  try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  catch { return false; }
}
