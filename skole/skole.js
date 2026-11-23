/* Skolesiden (1.0.8). Trafikkskolen kjøper en pakke med elevtilganger til Kjørerapport Pluss og deler dem ut her: ett
   trykk gir en kode og en ferdig SMS med lenke til eleven (elev/index.html). Ingen konto: lenken skolen fikk
   (…/skole/#nøkkel) er nøkkelen. Den står etter «#», så den sendes aldri til nettstedet; siden sender den bare til
   kodeserveren (server/skolekoder/worker.js). Ingen elevnavn lagres: vil skolen vite hvem som har hvilken kode, skriver
   den koden i sitt eget elevsystem. */
import { serverUrl } from '../js/skolekode.js';

const KEY = 'kjorerapport.skolenokkel';
const CONTACT = 'Jo@svendsenmedia.net';
const PACKS = [25, 50, 100, 200];
const PRICE = 350;   // kr per elev uten mva (eieren, 18. nov. 2026)

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (t, year = false) => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
const kr = n => n.toLocaleString('nb-NO') + ' kr';

/* Nøkkelen fra lenken huskes når den virker, så siden også virker fra et bokmerke uten «#…». En gammel eller feil
   lenke skal ikke skrive over en som virker. */
function readToken() {
  const h = decodeURIComponent(location.hash.slice(1)).trim();
  try { return h || localStorage.getItem(KEY) || ''; } catch { return h; }
}
const remember = () => { try { localStorage.setItem(KEY, token); } catch { /* privat modus */ } };
const token = readToken();
let data = null, fresh = null, filter = 'alle', search = '';

async function api(method, path, body) {
  let r;
  try {
    r = await fetch(serverUrl() + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { return { error: 'nett' }; }
  const d = await r.json().catch(() => ({}));
  return r.ok ? d : { error: d.error || 'server', status: r.status };
}

/* Status for en utdelt kode. En ubrukt kode som er stengt, er trukket tilbake (tilgangen er gitt tilbake). */
const statusOf = (r, now = Date.now()) => (r.trukket || (!r.forst && r.stengt) ? 'trukket' : !r.forst ? 'ubrukt' : r.stengt ? 'stengt' : r.til && r.til <= now ? 'utlopt' : 'i-bruk');
const LABEL = { 'ubrukt': ['Ikke tatt i bruk', 'wait'], 'i-bruk': ['I bruk', 'ok'], 'stengt': ['Stengt', 'off'], 'trukket': ['Trukket tilbake', 'wait'], 'utlopt': ['Utløpt', 'wait'] };
const FILTERS = [['alle', 'Alle'], ['i-bruk', 'I bruk'], ['ubrukt', 'Ikke tatt i bruk'], ['stengt', 'Stengt']];
const inFilter = (r, f) => { const st = statusOf(r); return f === 'alle' || (f === 'stengt' ? ['stengt', 'trukket', 'utlopt'].includes(st) : st === f); };
const norm = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

const linkFor = kode => `${location.origin}/elev/?kode=${encodeURIComponent(kode)}&fra=${encodeURIComponent(data.navn)}`;
const messageFor = kode => `Hei! ${data.navn} gir deg Kjørerapport Pluss: hele teorien med forklaringer, sikkerhetskontrollen og en rapport etter hver øvelsestur. Trykk her for å komme i gang: ${linkFor(kode)}`;

let toastTimer;
function toast(text) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* eldre nettlesere */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* */ }
  ta.remove();
  return ok;
}
function ask(title, text, ok) {
  const d = $('#ask');
  $('#ask-title').textContent = title; $('#ask-text').textContent = text; $('#ask-ok').textContent = ok;
  return new Promise(res => {
    const done = v => { if (d.open) d.close(); res(v); };
    d.querySelectorAll('button').forEach(b => { b.onclick = () => done(b.value === 'ja'); });
    d.oncancel = e => { e.preventDefault(); done(false); };
    d.showModal();
  });
}

function problem(title, text, retry = false) {
  app.innerHTML = `<section class="card"><h1 style="font-size:1.6rem">${esc(title)}</h1><p>${text}</p>${retry ? '<button type="button" class="btn secondary" id="retry">Prøv igjen</button>' : ''}</section>`;
  const b = $('#retry'); if (b) b.onclick = load;
}

async function load() {
  if (!token) {
    problem('Åpne lenken dere fikk', `Denne siden virker bare med lenken trafikkskolen fikk fra Kjørerapport. Har dere mistet den, send en e-post til <a href="mailto:${CONTACT}">${CONTACT}</a>, så får dere en ny.`);
    return;
  }
  const d = await api('GET', '/v1/skole');
  if (d.status === 401) {
    try { if (localStorage.getItem(KEY) === token) localStorage.removeItem(KEY); } catch { /* */ }   // den lagrede virker ikke lenger (ny lenke)
    problem('Lenken virker ikke', `Lenken er ikke riktig, eller dere har fått en ny. Bruk den nyeste lenken, eller send en e-post til <a href="mailto:${CONTACT}">${CONTACT}</a>.`);
    return;
  }
  if (d.error) { problem('Får ikke kontakt', 'Sjekk nettet og prøv igjen om litt.', true); return; }
  data = d;
  remember();
  document.title = `Elevtilganger – ${d.navn}`;
  render();
}

function rowHtml(r) {
  const st = statusOf(r), [label, cls] = LABEL[st];
  const meta = [r.utdelt ? `Sendt ${day(r.utdelt)}` : null, r.forst ? `tatt i bruk ${day(r.forst)}` : null,
    r.til && st !== 'trukket' ? `gjelder til ${day(r.til, true)}` : null, r.forst ? `${r.telefoner} av ${data.maks} telefoner` : null].filter(Boolean).join(' · ');
  const acts = st === 'ubrukt' ? [['kopier', 'Kopier meldingen'], ['steng', 'Trekk tilbake']]
    : st === 'i-bruk' ? [...(r.telefoner ? [['ny-telefon', 'Ny telefon']] : []), ['steng', 'Steng']]
    : st === 'stengt' ? [['apne', 'Åpne igjen']] : [];
  return `<li><div class="row-top"><span class="code">${esc(r.kode)}</span><span class="pill ${cls}">${label}</span></div>
    <p class="meta">${esc(meta)}</p>
    <div class="actions">${acts.map(([a, t]) => `<button type="button" class="btn secondary small" data-act="${a}" data-kode="${esc(r.kode)}" aria-label="${t}: ${esc(r.kode)}">${t}</button>`).join('')}</div></li>`;
}
function renderList() {
  const list = $('#rows');
  if (!list) return;
  const rows = data.koder.filter(r => inFilter(r, filter) && (!search || norm(r.kode).includes(search)));
  list.innerHTML = rows.length ? rows.map(rowHtml).join('')
    : `<li class="muted">${data.koder.length ? 'Ingen koder passer.' : 'Ingen tilganger er delt ut ennå. Trykk «Gi en elev tilgang» for å begynne.'}</li>`;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === filter)));
}

function render() {
  const used = data.brukt + data.ubrukt, pct = data.kjopt ? Math.min(100, Math.round(used / data.kjopt * 100)) : 0;
  const n = f => data.koder.filter(r => inFilter(r, f)).length;
  const order = data.bestilt
    ? `<p class="notice">Bestillingen på ${data.bestilt.antall} tilganger fra ${day(data.bestilt.t)} er mottatt. Tilgangene kommer her når den er behandlet.</p>`
    : !data.igjen ? '<p class="notice">Pakken er brukt opp. Bestill flere nederst på siden.</p>'
      : data.igjen <= 10 ? `<p class="notice">Det er bare ${data.igjen} igjen. <button type="button" class="linkbtn" id="to-order">Bestill flere</button></p>` : '';
  app.innerHTML = `
    <section class="sign-card" aria-label="Elevtilganger">
      <p class="eyebrow">${esc(data.navn)}</p>
      <p class="big-num">${data.igjen}</p>
      <p style="margin:0;font-weight:700">elevtilganger igjen å dele ut</p>
      <div class="meter" role="img" aria-label="${used} av ${data.kjopt} er delt ut"><span style="width:${pct}%"></span></div>
      <ul class="stats"><li>${data.brukt} i bruk</li><li>${data.ubrukt} sendt, ikke tatt i bruk</li><li>${data.kjopt} kjøpt</li></ul>
    </section>
    <button type="button" class="btn ${fresh ? 'secondary' : 'yellow'} wide" id="give"${data.igjen ? '' : ' disabled'}>${fresh ? 'Gi en elev til tilgang' : 'Gi en elev tilgang'}</button>
    ${order}
    ${fresh ? `
    <section class="card" id="fresh" aria-labelledby="h-fresh" style="margin-top:16px">
      <h2 id="h-fresh">Klar til å sende</h2>
      <p class="muted small" style="margin:0">Koden</p>
      <p class="code">${esc(fresh)}</p>
      <div class="msg">${esc(messageFor(fresh))}</div>
      <div class="actions">
        <a class="btn yellow small" href="sms:?&body=${encodeURIComponent(messageFor(fresh))}">Send som SMS</a>
        <button type="button" class="btn secondary small" id="copy-msg">Kopier meldingen</button>
        <button type="button" class="btn secondary small" id="copy-code">Kopier koden</button>
      </div>
      <p class="muted small" style="margin-top:12px">Skriv gjerne koden inn i elevsystemet deres, så vet dere hvem som har den. Kjørerapport lagrer ingen navn.</p>
      <button type="button" class="linkbtn" id="fresh-done">Ferdig</button>
    </section>` : ''}
    <section aria-labelledby="h-koder">
      <h2 id="h-koder">Utdelte tilganger</h2>
      <div class="filters">
        <input type="search" id="search" placeholder="Søk etter kode" aria-label="Søk etter kode" autocomplete="off" value="${esc(search)}">
        <div class="seg" role="group" aria-label="Vis">${FILTERS.map(([f, t]) => `<button type="button" data-f="${f}" aria-pressed="${f === filter}">${t} (${n(f)})</button>`).join('')}</div>
      </div>
      <ul class="rows" id="rows"></ul>
    </section>
    <section id="order-sec" aria-labelledby="h-order">
      <h2 id="h-order">Bestill flere</h2>
      <p>${PRICE} kr per elev uten mva. Dere får faktura på e-post, og tilgangene kommer på denne siden når bestillingen er behandlet.</p>
      <div class="actions" style="align-items:center">
        <label for="pack" class="muted small">Antall</label>
        <select id="pack">${PACKS.map(p => `<option value="${p}"${p === 50 ? ' selected' : ''}>${p} elever (${kr(p * PRICE)})</option>`).join('')}</select>
        <a class="btn primary small" id="order" href="#">Send bestilling</a>
      </div>
      <p class="muted small" style="margin-top:8px">Knappen åpner e-posten deres med bestillingen ferdig skrevet.</p>
    </section>
    <section>
      <details class="card"><summary><strong>Slik virker det</strong></summary>
        <ol class="steps" style="margin-top:12px">
          <li>Trykk «Gi en elev tilgang». Dere får en kode og en ferdig melding med lenke.</li>
          <li>Send meldingen til eleven på SMS, eller lim den inn i systemet dere bruker til elevene.</li>
          <li>Eleven trykker på lenken. Med iPhone laster eleven ned appen og limer inn koden. Med Android åpnes nettversjonen av Kjørerapport, ferdig låst opp.</li>
        </ol>
        <ul class="steps">
          <li>En tilgang er opptatt fra dere deler den ut. Tar eleven den aldri i bruk, kan dere trekke den tilbake, og den kommer tilbake i pakken.</li>
          <li>Koden virker på ${data.maks} telefoner i ${data.maaneder} måneder fra eleven tar den i bruk. Har eleven fått ny telefon og brukt opp plassene, trykk «Ny telefon».</li>
          <li>Trykk «Steng» når en elev slutter. En kode som er tatt i bruk, teller fortsatt som brukt.</li>
          <li>Lenken til denne siden er nøkkelen deres. Lagre den som bokmerke, og ikke del den utenfor skolen. Har den kommet på avveie, send en e-post til <a href="mailto:${CONTACT}">${CONTACT}</a>, så får dere en ny.</li>
        </ul>
      </details>
    </section>`;
  renderList();
  wire();
}

function orderMail() {
  const nPack = Number($('#pack').value);
  const subject = `Bestilling: ${nPack} elevtilganger til Kjørerapport`;
  const body = `Hei!\n\n${data.navn} vil bestille ${nPack} elevtilganger til Kjørerapport Pluss (${nPack} × ${PRICE} kr = ${kr(nPack * PRICE)} uten mva).\n\nFaktura sendes til:\nOrganisasjonsnummer:\n\nHilsen\n`;
  return `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function wire() {
  $('#give').onclick = async e => {
    const b = e.currentTarget; b.disabled = true;
    const r = await api('POST', '/v1/skole/ny');
    if (r.error) { b.disabled = false; toast(r.error === 'tomt' ? 'Pakken er brukt opp.' : 'Fikk ikke laget koden. Prøv igjen.'); return; }
    fresh = r.kode;
    await load();
    const f = $('#fresh'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const done = $('#fresh-done'); if (done) done.onclick = () => { fresh = null; render(); };
  const cm = $('#copy-msg'); if (cm) cm.onclick = async () => toast(await copy(messageFor(fresh)) ? 'Meldingen er kopiert' : 'Kunne ikke kopiere');
  const cc = $('#copy-code'); if (cc) cc.onclick = async () => toast(await copy(fresh) ? 'Koden er kopiert' : 'Kunne ikke kopiere');
  const to = $('#to-order'); if (to) to.onclick = () => $('#order-sec').scrollIntoView({ behavior: 'smooth' });
  $('#search').oninput = e => { search = norm(e.target.value); renderList(); };
  document.querySelectorAll('.seg button').forEach(b => { b.onclick = () => { filter = b.dataset.f; renderList(); }; });
  const pack = $('#pack'), order = $('#order');
  order.href = orderMail();
  pack.onchange = () => { order.href = orderMail(); };
  // Bestillingen sendes også til serveren, så eieren ser den selv om e-posten ikke blir sendt
  order.onclick = () => {
    fetch(serverUrl() + '/v1/skole/bestill', { method: 'POST', keepalive: true, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ antall: Number(pack.value) }) }).catch(() => {});
    setTimeout(load, 1500);
  };
  $('#rows').onclick = async e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const kode = b.dataset.kode, act = b.dataset.act, row = data.koder.find(r => r.kode === kode), st = row && statusOf(row);
    if (act === 'kopier') { toast(await copy(messageFor(kode)) ? 'Meldingen er kopiert' : 'Kunne ikke kopiere'); return; }
    if (act === 'steng' && st === 'ubrukt' && !await ask('Trekke tilbake koden?', `${kode} slutter å virke, og tilgangen kommer tilbake i pakken.`, 'Trekk tilbake')) return;
    if (act === 'steng' && st !== 'ubrukt' && !await ask('Stenge koden?', `Eleven mister Pluss innen en uke. Tilgangen teller fortsatt som brukt.`, 'Steng')) return;
    if (act === 'ny-telefon' && !await ask('Ny telefon for eleven?', `${kode} kan tas i bruk på ${data.maks} nye telefoner.`, 'Ny telefon')) return;
    b.disabled = true;
    const r = await api('POST', '/v1/skole/' + act, { kode });
    if (r.error) { b.disabled = false; toast('Det gikk ikke. Prøv igjen.'); return; }
    toast(act === 'steng' ? (r.tilbake ? 'Koden er trukket tilbake' : 'Koden er stengt') : act === 'ny-telefon' ? 'Klar for ny telefon' : 'Koden virker igjen');
    if (fresh === kode && act === 'steng') fresh = null;
    await load();
  };
}

// Tilbake fra Meldinger eller e-posten: hent tallene på nytt
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && data) load(); });
load();
