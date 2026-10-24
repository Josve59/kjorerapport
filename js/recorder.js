/* Sensoropptak: GPS + gyroskop + tyngdekraft, lagret i IndexedDB med sjekkpunkt hvert 10. sekund.
   Alle tidsstempler er sekunder siden opptaket startet (performance.now()). */

import { newId, putDrive, putChunk } from './db.js';

const RAD = Math.PI / 180;
const MOTION_INTERVAL = 1 / 20;      // ca. 20 Hz lagring
const CHECKPOINT_MS = 10000;
const LP_ALPHA = 0.05;               // lavpass for tyngdekraft når acceleration mangler

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
  const state = { acc: NaN, motionCount: 0, motionOk: false, gpsOk: false, gpsError: null, motionSeen: 0 };
  let lastMotion = 0;
  const onMotion = () => { state.motionSeen++; lastMotion = performance.now(); };
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
    this.replay = opts.replay || null;        // { data, speed } – utvikleralternativ: spill av demotur
    this.reset();
  }

  reset() {
    this.drive = null;
    this.t0 = 0;
    this.buf = { loc: [], gyro: [], grav: [] };
    this.seq = 0;
    this.lastMotionT = -1;
    this.grav = null;
    this.gaps = [];
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
      gaps: [],
      counts: { loc: 0, gyro: 0, grav: 0 },
      appVersion: 1
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
    if (!('wakeLock' in navigator)) { this.wakeLockFailed = true; this.emit(); return; }
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLockFailed = false;
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch {
      this.wakeLock = null;
      this.wakeLockFailed = true;
    }
    this.emit();
  }

  handleVisibility() {
    if (!this.running) return;
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = this.now();
    } else {
      if (this.hiddenAt !== null) {
        const gap = { from: this.hiddenAt, to: this.now() };
        this.hiddenAt = null;
        if (gap.to - gap.from > 1) {
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
    this.acc = c.accuracy;
    this.gpsError = null;
    if (this.lastFix && Number.isFinite(c.accuracy) && c.accuracy <= 50) {
      this.distance += haversine(this.lastFix, sample);
    }
    if (Number.isFinite(c.accuracy) && c.accuracy <= 50) this.lastFix = sample;
    this.lastFixWall = performance.now();
  }

  /* Bevegelse: rotationRate i grader/s → rad/s. Tyngdekraft = inkl. − uten, eller lavpass. */
  handleMotion(e, tOverride) {
    const t = Number.isFinite(tOverride) ? tOverride : this.now();
    const inc = e.accelerationIncludingGravity;
    const acc = e.acceleration;
    let g = null;
    if (inc && acc && inc.x !== null && acc.x !== null) {
      g = { x: inc.x - acc.x, y: inc.y - acc.y, z: inc.z - acc.z };
      this.grav = g;
    } else if (inc && inc.x !== null) {
      if (!this.grav) this.grav = { x: inc.x, y: inc.y, z: inc.z };
      else this.grav = {
        x: this.grav.x + LP_ALPHA * (inc.x - this.grav.x),
        y: this.grav.y + LP_ALPHA * (inc.y - this.grav.y),
        z: this.grav.z + LP_ALPHA * (inc.z - this.grav.z)
      };
      g = this.grav;
    }
    this.motionCount++;
    if (t - this.lastMotionT < MOTION_INTERVAL) return;   // nedsampling til ca. 20 Hz
    this.lastMotionT = t;
    const r = e.rotationRate;
    if (r && r.alpha !== null && r.alpha !== undefined) {
      this.buf.gyro.push({ t, x: r.beta * RAD, y: r.gamma * RAD, z: r.alpha * RAD });
    }
    if (g) this.buf.grav.push({ t, x: g.x, y: g.y, z: g.z });
  }

  async checkpoint() {
    if (!this.drive) return;
    const b = this.buf;
    if (!b.loc.length && !b.gyro.length && !b.grav.length) return;
    this.buf = { loc: [], gyro: [], grav: [] };
    this.drive.counts.loc += b.loc.length;
    this.drive.counts.gyro += b.gyro.length;
    this.drive.counts.grav += b.grav.length;
    this.drive.distanceM = this.distance;
    this.drive.duration = this.now();
    this.drive.gaps = this.gaps;
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
    await putDrive(this.drive);
    return this.drive;
  }

  emit() {
    const gpsAge = this.lastFixWall ? (performance.now() - this.lastFixWall) / 1000 : Infinity;
    this.onStatus({
      elapsed: this.now(),
      distanceM: this.distance,
      acc: this.acc,
      gpsFresh: gpsAge < 5,
      gpsError: this.gpsError || null,
      motionCount: this.motionCount,
      locCount: this.locCount,
      wakeLockFailed: this.wakeLockFailed,
      lastCheckpoint: this.lastCheckpoint,
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
        const g = gyro[gi], q = grav[Math.min(gi, grav.length - 1)];
        gi++;
        // Opptakeren forventer grader/s (som nettleseren gir), så vi konverterer tilbake.
        this.handleMotion({
          rotationRate: { alpha: g.z / RAD, beta: g.x / RAD, gamma: g.y / RAD },
          acceleration: { x: 0, y: 0, z: 0 },
          accelerationIncludingGravity: { x: q.x, y: q.y, z: q.z }
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

function haversine(a, b) {
  const R = 6371000, k = Math.PI / 180;
  const dLat = (b.lat - a.lat) * k, dLon = (b.lon - a.lon) * k;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
