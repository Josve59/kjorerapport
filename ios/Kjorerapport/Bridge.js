// Broen mellom nettappen og iPhone-appen (lastes før nettappen). Posisjonen kommer fra appen (CoreLocation),
// så den fortsetter med låst skjerm; opptakeren sier fra når et opptak starter og stopper, og får målingene
// fra tiden appen var i bakgrunnen (window.__kjBackfill → hendelsen «kjbackfill»).
(() => {
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kj;
  if (!handler) return;
  const call = (cmd, arg) => handler.postMessage({ cmd, ...(arg || {}) }).catch(() => null);
  window.kjNative = { platform: 'ios', recStart: () => call('recStart'), recStop: () => call('recStop'), info: () => call('info'), status: s => call('recStatus', s),
    // Kameraene (CameraHub.swift): bildene hentes fra /cam/user.jpg og /cam/environment.jpg, bilene kommer som «kjcamdets»
    camInfo: () => call('camInfo'), camStart: o => call('camStart', o), camStop: () => call('camStop'), camConfig: o => call('camConfig', o),
    review: () => call('review'),
    // Kjørerapport Pluss (PlusStore.swift): engangskjøp i App Store; endringer kommer som hendelsen «kjplus»
    plusStatus: () => call('plusStatus'), plusBuy: () => call('plusBuy'), plusRestore: () => call('plusRestore'), plusRedeem: () => call('plusRedeem') };
  window.__kjPlus = owned => { window.dispatchEvent(new CustomEvent('kjplus', { detail: { owned } })); };
  window.__kjCamDets = r => { window.dispatchEvent(new CustomEvent('kjcamdets', { detail: r })); };

  const watchers = new Map();
  let nextId = 1;
  const toPosition = p => ({
    coords: { latitude: p.lat, longitude: p.lon, accuracy: p.acc, speed: p.speed, heading: p.heading, altitude: p.alt, altitudeAccuracy: null },
    timestamp: p.ts
  });
  window.__kjGeo = p => {
    const pos = toPosition(p);
    for (const w of [...watchers.values()]) { try { w.ok(pos); } catch (e) { console.error(e); } }
  };
  window.__kjGeoError = code => {
    const err = { code, message: code === 1 ? 'Ingen tilgang til posisjon' : 'Fant ikke posisjon', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    for (const w of [...watchers.values()]) { if (w.err) try { w.err(err); } catch (e) { console.error(e); } }
  };
  const geolocation = {
    watchPosition(ok, err) { const id = nextId++; watchers.set(id, { ok, err }); call('geoStart'); return id; },
    clearWatch(id) { watchers.delete(id); if (!watchers.size) call('geoStop'); },
    getCurrentPosition(ok, err) {
      const id = geolocation.watchPosition(p => { geolocation.clearWatch(id); ok(p); }, e => { geolocation.clearWatch(id); if (err) err(e); });
    }
  };
  try { Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true }); } catch (e) { console.error(e); }

  window.__kjBackfill = list => { window.dispatchEvent(new CustomEvent('kjbackfill', { detail: list })); };

  // Deling, utskrift og vibrasjon gjør ingenting i en WKWebView, så appen gjør dem selv (NativeRecorder.swift):
  // delearket til iPhone (også for sikkerhetskopier og eksport), iPhone-utskrift, og haptikk i stedet for vibrasjon.
  const b64 = buf => {
    const a = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const define = (obj, key, value) => { try { Object.defineProperty(obj, key, { value, configurable: true, writable: true }); } catch (e) { console.error(e); } };
  define(navigator, 'share', async (data = {}) => {
    const files = [];
    for (const f of data.files || []) files.push({ name: f.name, data: b64(await f.arrayBuffer()) });
    const r = await call('share', { title: data.title || '', text: data.text || '', url: data.url || '', files });
    if (!r || !r.completed) { const e = new Error('Delingen ble avbrutt'); e.name = 'AbortError'; throw e; }
  });
  define(navigator, 'canShare', () => true);
  define(navigator, 'vibrate', p => { call('haptic', { pattern: Array.isArray(p) ? p : [p] }); return true; });
  define(window, 'print', async () => {
    window.dispatchEvent(new Event('beforeprint'));
    await call('print');
    window.dispatchEvent(new Event('afterprint'));
  });
})();
