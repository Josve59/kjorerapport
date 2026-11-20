/* Telefon og nettleser (0.27.6): riktig veiledning på Android, iPhone-Safari og i iPhone-appen */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAndroid, isIOS, browserName, permissionHelp, installHelp, screenLockHelp } from '../js/platform.js';

const UA = {
  pixelChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1'
};
function as(ua, run, { touch = 5, win = {} } = {}) {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), w = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua, maxTouchPoints: touch }, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: { matchMedia: () => ({ matches: false }), navigator: {}, ...win }, configurable: true });
  try { return run(); } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
    if (w) Object.defineProperty(globalThis, 'window', w); else delete globalThis.window;
  }
}

test('Android gjenkjennes, med riktig nettleser', () => {
  as(UA.pixelChrome, () => { assert.ok(isAndroid()); assert.ok(!isIOS()); assert.equal(browserName(), 'Chrome'); });
  as(UA.samsung, () => { assert.ok(isAndroid()); assert.equal(browserName(), 'Samsung Internet'); });
  as(UA.firefoxAndroid, () => { assert.ok(isAndroid()); assert.equal(browserName(), 'Firefox'); });
  as(UA.iphoneSafari, () => { assert.ok(isIOS()); assert.ok(!isAndroid()); assert.equal(browserName(), 'Safari'); });
});

test('veiledningen nevner ikke Safari eller Autolås på Android', () => {
  as(UA.pixelChrome, () => {
    for (const k of ['camera', 'location', 'motion']) assert.doesNotMatch(permissionHelp(k), /Safari|iPhone/);
    assert.match(installHelp().how, /Installer app/);
    assert.doesNotMatch(screenLockHelp(), /Autolås/);
  });
  as(UA.samsung, () => assert.match(installHelp().how, /Startskjerm/));
  as(UA.iphoneSafari, () => { assert.match(installHelp().how, /Del-knappen/); assert.match(screenLockHelp(), /Autolås/); });
});

test('installeringshjelp vises ikke i iPhone-appen eller når appen alt er installert', () => {
  as(UA.iphoneSafari, () => assert.equal(installHelp(), null), { win: { webkit: { messageHandlers: { kj: {} } } } });
  as(UA.pixelChrome, () => assert.equal(installHelp(), null), { win: { matchMedia: () => ({ matches: true }) } });
});
