// Broen mellom nettappen og iPhone-appen (lastes før nettappen). Posisjonen kommer fra appen (CoreLocation),
// så den fortsetter med låst skjerm; opptakeren sier fra når et opptak starter og stopper, og får målingene
// fra tiden appen var i bakgrunnen (window.__kjBackfill → hendelsen «kjbackfill»).
(() => {
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kj;
  if (!handler) return;
  const call = (cmd, arg) => handler.postMessage({ cmd, ...(arg || {}) }).catch(() => null);
  window.kjNative = { platform: 'ios', recStart: () => call('recStart'), recStop: () => call('recStop') };

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
})();
