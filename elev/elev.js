/* Elevsiden (1.0.8): lenken fra trafikkskolen (skole/skole.js) har koden og skolens navn. Siden viser koden, og
   hvordan eleven kommer i gang: iPhone-appen med koden, eller nettversjonen på Android, låst opp av «?kode=».
   Den spør ikke serveren: koden sjekkes først når eleven bruker den i appen. */
import { looksLikeCode, formatCode, normalizeCode } from '../js/skolekode.js';

/* Lenken til appen i App Store. Fylles inn når appen er ute (appstore/innsending.md). Tom: eleven søker selv. */
const APP_STORE_URL = '';

const $ = s => document.querySelector(s);
const q = new URLSearchParams(location.search);
const raw = q.get('kode') || '', from = (q.get('fra') || '').trim().slice(0, 80);
const ok = looksLikeCode(raw), code = ok ? formatCode(normalizeCode(raw)) : '';
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

if (from) { $('#from').textContent = `Fra ${from}`; $('#from').hidden = false; }
if (!ok) {
  $('#code').textContent = 'Mangler';
  $('#copy').hidden = true;
  $('#terms').textContent = 'Lenken mangler koden, eller den er skrevet av feil. Spør trafikkskolen om en ny lenke.';
} else {
  $('#code').textContent = code;
  $('#web').href = `../app/?kode=${encodeURIComponent(code)}`;   // nettversjonen ligger under app/ (1.0.8)
}
if (APP_STORE_URL) $('#ios-store').innerHTML = `Last ned <strong>Kjørerapport</strong> fra App Store: <a href="${APP_STORE_URL}">åpne App Store</a>.`;
// Android og PC først når eleven ikke har iPhone
if (!isIOS) $('#app').insertBefore($('#android'), $('#ios'));

$('#copy').onclick = async () => {
  const b = $('#copy');
  let done = false;
  try { await navigator.clipboard.writeText(code); done = true; } catch { /* eldre nettlesere: koden står på skjermen */ }
  b.textContent = done ? 'Koden er kopiert' : 'Merk og kopier koden over';
  setTimeout(() => { b.textContent = 'Kopier koden'; }, 2500);
};
