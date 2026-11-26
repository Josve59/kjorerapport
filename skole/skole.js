/* Skolesiden (1.0.8, uten pakke fra 1.2.0). Trafikkskolen lager elevtilganger til Kjørerapport Pluss her: ett trykk gir
   en kode og en ferdig SMS med lenke til eleven (elev/index.html). Koden gjelder til læreren trykker «Fikk lappen», og
   skolen får faktura måneden etter for kodene som ble tatt i bruk. Ingen konto: lenken skolen fikk (…/skole/#nøkkel)
   er nøkkelen. Den står etter «#», så den sendes aldri til nettstedet; siden sender den bare til kodeserveren
   (server/skolekoder/worker.js). Elevens navn kan skrives på koden: det krypteres her med en nøkkel fra lenken
   (merke.js), så serveren aldri får navnet. */
import { serverUrl } from '../js/skolekode.js';
import { qrSvg } from './qr.js';
import { labelKey, sealLabel, openLabel, MAX_LABEL } from './merke.js';

const KEY = 'kjorerapport.skolenokkel';

const $ = s => document.querySelector(s);
const app = $('#app');
// Kontaktadressen står ett sted: i bunnteksten på siden (index.html)
const CONTACT = (($('footer a[href^="mailto:"]') || {}).textContent || '').trim();
const mailto = (subject = '', body = '') => `mailto:${CONTACT}${subject ? `?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}` : ''}`;
const contactLink = () => `<a href="${mailto()}">${CONTACT}</a>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (t, year = false) => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
const kr = n => n.toLocaleString('nb-NO') + ' kr';
// «2027-02» → «februar»
const monthName = m => { const [y, mo] = String(m).split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('nb-NO', { month: 'long', timeZone: 'UTC' }); };
const nextMonth = m => { const [y, mo] = String(m).split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
const elever = n => `${n} ${n === 1 ? 'elev' : 'elever'}`;

/* Nøkkelen fra lenken huskes når den virker, så siden også virker fra et bokmerke uten «#…». En gammel eller feil
   lenke skal ikke skrive over en som virker. */
function readToken() {
  const h = decodeURIComponent(location.hash.slice(1)).trim();
  try { return h || localStorage.getItem(KEY) || ''; } catch { return h; }
}
const remember = () => { try { localStorage.setItem(KEY, token); } catch { /* privat modus */ } };
const token = readToken();
const keyP = token && globalThis.crypto && crypto.subtle ? labelKey(token).catch(() => null) : Promise.resolve(null);
let data = null, fresh = null, filter = 'alle', search = '';

async function api(method, path, body) {
  let r;
  try {
    r = await fetch(serverUrl() + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { return { error: 'nett' }; }
  const d = await r.json().catch(() => ({}));
  return r.ok ? d : { error: d.error || 'server', status: r.status };
}

/* Status for en utdelt kode. En ubrukt kode som er stengt, er trukket tilbake. */
const statusOf = (r, now = Date.now()) => (r.fullfort ? 'ferdig' : r.trukket || (!r.forst && r.stengt) ? 'trukket' : !r.forst ? 'ubrukt' : r.stengt ? 'stengt' : r.til && r.til <= now ? 'utlopt' : 'i-bruk');
const LABEL = { 'ubrukt': ['Ikke tatt i bruk', 'wait'], 'i-bruk': ['I bruk', 'ok'], 'ferdig': ['Fikk lappen', 'ok'], 'stengt': ['Stengt', 'off'], 'trukket': ['Trukket tilbake', 'wait'], 'utlopt': ['Utløpt', 'wait'] };
const FILTERS = [['alle', 'Alle'], ['i-bruk', 'I bruk'], ['ubrukt', 'Ikke tatt i bruk'], ['ferdig', 'Fikk lappen'], ['stengt', 'Stengt']];
const inFilter = (r, f) => { const st = statusOf(r); return f === 'alle' || (f === 'stengt' ? ['stengt', 'trukket', 'utlopt'].includes(st) : st === f); };
const norm = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const nameOf = r => (typeof r.navnTekst === 'string' ? r.navnTekst : '');
const matches = r => !search.trim() || (norm(search) && norm(r.kode).includes(norm(search))) || nameOf(r).toLowerCase().includes(search.trim().toLowerCase());

/* SMS-lenken (1.0.8): med elevens nummer åpnes Meldinger med både mottaker og tekst. Nummeret brukes bare her i skolens
   nettleser; det lagres ikke og sendes ikke til serveren. «?&body=» virker på både iPhone og Android. */
const smsHref = (num, body) => `sms:${String(num || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')}?&body=${encodeURIComponent(body)}`;
/* Gratis måter å nå eleven på uten SMS-leverandør: e-post fra skolens eget e-postprogram, delingsmenyen på enheten og
   QR-kode på skjermen. Feltet tar enten mobilnummer eller e-post; ingenting av det lagres eller sendes til serveren. */
const isMail = v => /@/.test(String(v || ''));
const mailHref = (to, kode) => `mailto:${isMail(to) ? encodeURIComponent(String(to).trim()).replace(/%40/g, '@') : ''}?subject=${encodeURIComponent(`Kjørerapport Pluss fra ${data.navn}`)}&body=${encodeURIComponent(messageFor(kode))}`;
const canShare = () => typeof navigator.share === 'function';
// Telefoner og Mac kan åpne SMS fra en lenke; på en vanlig PC er e-post den naturlige hovedknappen
const smsFirst = /iPhone|iPad|Android|Macintosh/.test(navigator.userAgent);
// Relativt til denne siden, så lenken virker både på svendsenmedia.net/kjorerapport/ og på den gamle adressen
const linkFor = kode => new URL(`../elev/?kode=${encodeURIComponent(kode)}&fra=${encodeURIComponent(data.navn)}`, location.href).href;
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
/* Navnet på en kode: → teksten (tom: fjern navnet) eller null (avbrutt) */
function askName(kode, current) {
  const d = $('#name-dlg'), inp = $('#name-input');
  $('#name-code').textContent = kode;
  inp.value = current || ''; inp.maxLength = MAX_LABEL;
  return new Promise(res => {
    const done = v => { if (d.open) d.close(); res(v); };
    $('#name-form').onsubmit = e => { e.preventDefault(); done(inp.value.trim()); };
    $('#name-cancel').onclick = () => done(null);
    d.oncancel = e => { e.preventDefault(); done(null); };
    d.showModal();
    setTimeout(() => inp.focus(), 30);
  });
}

/* QR-koden til elevsiden i et vindu, når eleven står hos skolen */
function showQr(kode) {
  const d = $('#qr');
  $('#qr-img').innerHTML = qrSvg(linkFor(kode), { label: `QR-kode for ${kode}` }) || '<p>Lenken er for lang for en QR-kode. Send den på SMS eller e-post i stedet.</p>';
  $('#qr-code').textContent = kode;
  $('#qr-close').onclick = () => d.close();
  d.onclick = e => { if (e.target === d) d.close(); };   // trykk utenfor lukker
  d.showModal();
}

function problem(title, text, retry = false) {
  app.innerHTML = `<section class="card"><h1 style="font-size:1.6rem">${esc(title)}</h1><p>${text}</p>${retry ? '<button type="button" class="btn secondary" id="retry">Prøv igjen</button>' : ''}</section>`;
  const b = $('#retry'); if (b) b.onclick = load;
}

async function load() {
  if (!token) {
    problem('Åpne lenken dere fikk', `Denne siden virker bare med lenken trafikkskolen fikk fra Kjørerapport. Har dere mistet den, send en e-post til ${contactLink()}, så får dere en ny.`);
    return;
  }
  const d = await api('GET', '/v1/skole');
  if (d.status === 401) {
    try { if (localStorage.getItem(KEY) === token) localStorage.removeItem(KEY); } catch { /* */ }   // den lagrede virker ikke lenger (ny lenke)
    problem('Lenken virker ikke', `Lenken er ikke riktig, eller dere har fått en ny. Bruk den nyeste lenken, eller send en e-post til ${contactLink()}.`);
    return;
  }
  if (d.error) { problem('Får ikke kontakt', 'Sjekk nettet og prøv igjen om litt.', true); return; }
  // Navnene leses her i nettleseren (null: skrevet med en eldre lenke og kan ikke leses)
  const key = await keyP;
  for (const r of d.koder || []) r.navnTekst = key ? await openLabel(key, r.merke) : '';
  data = { ...d, laerere: d.laerere || [] };
  remember();
  document.title = `Elevtilganger – ${d.navn}`;
  render();
}

function rowHtml(r) {
  const st = statusOf(r), [label, cls] = LABEL[st], name = nameOf(r);
  const meta = [r.utdelt ? `Sendt ${day(r.utdelt)}` : null, r.forst ? `tatt i bruk ${day(r.forst)}` : null,
    r.fullfort ? `fikk lappen ${day(r.fullfort, true)}` : r.til && st === 'i-bruk' ? (r.varig ? 'gjelder til eleven har fått lappen' : `gjelder til ${day(r.til, true)}`) : null,
    r.forst && st === 'i-bruk' ? `${r.telefoner} av ${data.maks} telefoner` : null].filter(Boolean).join(' · ');
  const naming = ['navn', name ? 'Endre navn' : 'Gi navn'];
  const acts = st === 'ubrukt' ? [['qr', 'QR-kode'], ['kopier', 'Kopier meldingen'], naming, ['steng', 'Trekk tilbake']]
    : st === 'i-bruk' ? [['fullfor', 'Fikk lappen'], naming, ...(r.telefoner ? [['ny-telefon', 'Ny telefon']] : []), ['steng', 'Steng']]
    : st === 'ferdig' || st === 'stengt' ? [naming, ['apne', 'Åpne igjen']] : [];
  const who = name ? `<span class="row-name">${esc(name)}</span>` : r.navnTekst === null ? '<span class="muted small">Navnet kan ikke leses med denne lenken</span>' : '';
  return `<li><div class="row-top"><span class="row-who">${who}<span class="code${who ? ' sub' : ''}">${esc(r.kode)}</span></span><span class="pill ${cls}">${label}</span></div>
    <p class="meta">${esc(meta)}</p>
    <div class="actions">${acts.map(([a, t]) => `<button type="button" class="btn ${a === 'fullfor' ? 'primary' : 'secondary'} small" data-act="${a}" data-kode="${esc(r.kode)}" aria-label="${t}: ${esc(name || r.kode)}">${t}</button>`).join('')}</div></li>`;
}
function renderList() {
  const list = $('#rows');
  if (!list) return;
  const rows = data.koder.filter(r => inFilter(r, filter) && matches(r));
  list.innerHTML = rows.length ? rows.map(rowHtml).join('')
    : `<li class="muted">${data.koder.length ? 'Ingen koder passer.' : 'Ingen tilganger er delt ut ennå. Trykk «Gi en elev tilgang» for å begynne.'}</li>`;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === filter)));
}

/* Trafikklærerne (1.2.0): lærerkodene kommer fra Kjørerapport. Skolen kan stenge en når læreren slutter. */
function teachersHtml() {
  const askMail = mailto(`Lærerkoder til ${data.navn}`, 'Hei!\n\nVi vil ha lærerkoder til disse trafikklærerne:\n\n\nHilsen\n');
  const rows = data.laerere.map(t => {
    const st = t.stengt ? 'stengt' : t.forst ? 'i-bruk' : 'ubrukt', [label, cls] = LABEL[st];
    const acts = st === 'stengt' ? [['apne', 'Åpne igjen']] : [...(t.telefoner ? [['ny-telefon', 'Ny telefon']] : []), ['steng', 'Steng']];
    return `<li><div class="row-top"><span class="row-who"><span class="row-name">${esc(t.navn || 'Trafikklærer')}</span><span class="code sub">${esc(t.kode)}</span></span><span class="pill ${cls}">${label}</span></div>
      <p class="meta">${esc([t.forst ? `tatt i bruk ${day(t.forst)}` : 'ikke tatt i bruk ennå', t.forst && !t.stengt ? `${t.telefoner} av 2 telefoner` : null].filter(Boolean).join(' · '))}</p>
      <div class="actions">${acts.map(([a, x]) => `<button type="button" class="btn secondary small" data-act="${a}" data-kode="${esc(t.kode)}" data-laerer="1" aria-label="${x}: ${esc(t.navn)}">${x}</button>`).join('')}</div></li>`;
  }).join('');
  return `<section aria-labelledby="h-laerere">
      <h2 id="h-laerere">Trafikklærere</h2>
      <p class="muted small">Hver trafikklærer har sin egen lærerkode. Den låser opp trafikklærerversjonen av appen: elevlisten, meldinger med elevene og «har fått lappen». Stenger dere en lærerkode, mister læreren den innen en uke.</p>
      ${rows ? `<ul class="rows" id="teacher-rows">${rows}</ul>` : ''}
      <a class="btn secondary small" href="${askMail}">${rows ? 'Be om flere lærerkoder' : 'Be om lærerkoder'}</a>
    </section>`;
}

function render() {
  const n = f => data.koder.filter(r => inFilter(r, f)).length;
  const full = data.nye >= data.grense;
  const nowLine = data.denneMnd ? `Så langt i ${monthName(data.mnd)} har ${elever(data.denneMnd)} tatt koden i bruk (${kr(data.denneMnd * data.pris)} inkl. mva). Det kommer på fakturaen i ${monthName(nextMonth(data.mnd))}.` : `Ingen nye elever har tatt koden i bruk i ${monthName(data.mnd)} ennå.`;
  const lastLine = data.forrigeMnd ? ` I ${monthName(data.forrige)} tok ${elever(data.forrigeMnd)} koden i bruk.` : '';
  app.innerHTML = `
    <section class="sign-card" aria-label="Elevtilganger">
      <p class="eyebrow">${esc(data.navn)}</p>
      <p class="big-num">${data.iBruk}</p>
      <p style="margin:0;font-weight:700">${data.iBruk === 1 ? 'elev har' : 'elever har'} Pluss fra dere nå</p>
      <ul class="stats" style="margin-top:12px"><li>${data.ubrukt} sendt, ikke tatt i bruk</li><li>${data.ferdig} fikk lappen</li></ul>
    </section>
    <button type="button" class="btn ${fresh ? 'secondary' : 'yellow'} wide" id="give"${full ? ' disabled' : ''}>${fresh ? 'Gi en elev til tilgang' : 'Gi en elev tilgang'}</button>
    ${full ? `<p class="notice">Dere har laget ${data.nye} koder i ${monthName(data.mnd)}, som er grensen per måned. Trenger dere flere, send en e-post til ${contactLink()}.</p>` : ''}
    ${fresh ? `
    <section class="card" id="fresh" aria-labelledby="h-fresh" style="margin-top:16px">
      <h2 id="h-fresh">Klar til å sende</h2>
      <p class="muted small" style="margin:0">Koden</p>
      <div class="code-line"><p class="code">${esc(fresh)}</p><button type="button" class="linkbtn" id="copy-code">Kopier koden</button></div>
      <label class="field" for="fresh-name">Elevens navn <span class="muted small">(valgfritt, bare dere kan lese det)</span>
        <input type="text" id="fresh-name" maxlength="${MAX_LABEL}" autocomplete="off" placeholder="Navn eller elevnummer" value="${esc(nameOf(data.koder.find(r => r.kode === fresh) || {}))}"></label>
      <div class="msg">${esc(messageFor(fresh))}</div>
      <label class="field" for="send-to">Elevens mobil eller e-post <span class="muted small">(valgfritt, lagres ikke)</span>
        <input type="text" id="send-to" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="912 34 567 eller e-post"></label>
      <div class="actions">
        <a class="btn ${smsFirst ? 'yellow' : 'secondary'} small" id="sms-send" href="${smsHref('', messageFor(fresh))}">Send som SMS</a>
        <a class="btn ${smsFirst ? 'secondary' : 'yellow'} small" id="mail-send" href="${mailHref('', fresh)}">Send på e-post</a>
        ${canShare() ? '<button type="button" class="btn secondary small" id="share-msg">Del meldingen</button>' : ''}
        <button type="button" class="btn secondary small" id="copy-msg">Kopier meldingen</button>
        <button type="button" class="btn secondary small" id="show-qr">Vis QR-kode</button>
      </div>
      <button type="button" class="linkbtn" id="fresh-done" style="margin-top:12px">Ferdig</button>
    </section>` : ''}
    <section aria-labelledby="h-koder">
      <h2 id="h-koder">Elevene</h2>
      <div class="filters">
        <input type="search" id="search" placeholder="Søk etter navn eller kode" aria-label="Søk etter navn eller kode" autocomplete="off" value="${esc(search)}">
        <div class="seg" role="group" aria-label="Vis">${FILTERS.map(([f, t]) => `<button type="button" data-f="${f}" aria-pressed="${f === filter}">${t} (${n(f)})</button>`).join('')}</div>
      </div>
      <ul class="rows" id="rows"></ul>
    </section>
    ${teachersHtml()}
    <section aria-labelledby="h-faktura">
      <h2 id="h-faktura">Faktura</h2>
      <p>${kr(data.pris)} per elev inkl. mva. Dere får faktura på e-post i begynnelsen av hver måned for elevene som tok koden i bruk måneden før. Hver elev faktureres én gang, uansett hvor lenge eleven bruker koden. En kode som aldri blir tatt i bruk, koster ingenting.</p>
      <p class="muted small">${esc(nowLine + lastLine)}</p>
    </section>
    <section>
      <details class="card"><summary><strong>Slik virker det</strong></summary>
        <ol class="steps" style="margin-top:12px">
          <li>Trykk «Gi en elev tilgang». Dere får en kode og en ferdig melding med lenke. Skriv gjerne elevens navn, så finner dere koden igjen.</li>
          <li>Send meldingen til eleven, slik det passer dere: skriv mobilnummeret og trykk «Send som SMS», skriv e-posten og trykk «Send på e-post», bruk «Del meldingen», eller vis QR-koden hvis eleven står hos dere. Nummer og e-post lagres ikke.</li>
          <li>Eleven trykker på lenken. Med iPhone laster eleven ned appen og limer inn koden. Med Android åpnes nettversjonen av Kjørerapport, ferdig låst opp.</li>
          <li>Når eleven har fått lappen, trykker dere «Fikk lappen» her, eller læreren trykker «har fått lappen» på eleven i trafikklærerversjonen. Da avsluttes tilgangen.</li>
        </ol>
        <ul class="steps">
          <li>Koden gjelder til eleven har fått lappen, men høyst ${data.maaneder} måneder fra eleven tar den i bruk. Den virker på ${data.maks} telefoner. Har eleven fått ny telefon og brukt opp plassene, trykk «Ny telefon».</li>
          <li>Tar eleven aldri koden i bruk, kan dere trekke den tilbake. Trykk «Steng» når en elev slutter uten å ta lappen.</li>
          <li>Elevens navn krypteres i nettleseren med nøkkelen i lenken deres. Kjørerapport lagrer bare den krypterte teksten og ikke nøkkelen, så vi kan ikke lese navnene. Får dere en ny lenke, kan navnene ikke leses med den, og må skrives på nytt.</li>
          <li>Lenken til denne siden er nøkkelen deres. Lagre den som bokmerke, og ikke del den utenfor skolen. Har den kommet på avveie, send en e-post til ${contactLink()}, så får dere en ny.</li>
        </ul>
      </details>
    </section>`;
  renderList();
  wire();
}

/* Lagrer navnet på en kode (kryptert). → true når det er lagret */
async function saveName(kode, text) {
  const key = await keyP;
  if (!key) { toast('Nettleseren kan ikke kryptere navnet.'); return false; }
  const merke = await sealLabel(key, text);
  const r = await api('POST', '/v1/skole/merke', { kode, merke });
  if (r.error) { toast('Fikk ikke lagret navnet. Prøv igjen.'); return false; }
  const row = data.koder.find(x => x.kode === kode);
  if (row) { row.merke = merke; row.navnTekst = merke ? await openLabel(key, merke) : ''; }
  return true;
}

function wire() {
  $('#give').onclick = async e => {
    const b = e.currentTarget; b.disabled = true;
    const r = await api('POST', '/v1/skole/ny');
    if (r.error) { b.disabled = false; toast(r.error === 'grense' ? 'Grensen for nye koder denne måneden er nådd.' : 'Fikk ikke laget koden. Prøv igjen.'); return; }
    fresh = r.kode;
    await load();
    const f = $('#fresh'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const done = $('#fresh-done'); if (done) done.onclick = () => { fresh = null; render(); };
  const fn = $('#fresh-name');
  if (fn) fn.onchange = async () => { if (await saveName(fresh, fn.value)) { toast(fn.value.trim() ? 'Navnet er lagret' : 'Navnet er fjernet'); renderList(); } };
  const sendTo = $('#send-to'), smsSend = $('#sms-send'), mailSend = $('#mail-send');
  if (sendTo) sendTo.oninput = () => {
    const v = sendTo.value;
    smsSend.href = smsHref(isMail(v) ? '' : v, messageFor(fresh));
    mailSend.href = mailHref(v, fresh);
  };
  const share = $('#share-msg');
  if (share) share.onclick = async () => {
    try { await navigator.share({ title: 'Kjørerapport Pluss', text: messageFor(fresh) }); }
    catch (e) { if (e && e.name === 'AbortError') return; toast(await copy(messageFor(fresh)) ? 'Meldingen er kopiert' : 'Kunne ikke dele'); }
  };
  const sq = $('#show-qr'); if (sq) sq.onclick = () => showQr(fresh);
  const cm = $('#copy-msg'); if (cm) cm.onclick = async () => toast(await copy(messageFor(fresh)) ? 'Meldingen er kopiert' : 'Kunne ikke kopiere');
  const cc = $('#copy-code'); if (cc) cc.onclick = async () => toast(await copy(fresh) ? 'Koden er kopiert' : 'Kunne ikke kopiere');
  $('#search').oninput = e => { search = e.target.value; renderList(); };
  document.querySelectorAll('.seg button').forEach(b => { b.onclick = () => { filter = b.dataset.f; renderList(); }; });
  const onAct = async e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const kode = b.dataset.kode, act = b.dataset.act, teacher = !!b.dataset.laerer;
    const row = teacher ? data.laerere.find(r => r.kode === kode) : data.koder.find(r => r.kode === kode), st = row && statusOf(row);
    const who = teacher ? (row && row.navn) || kode : nameOf(row || {}) || kode;
    if (act === 'kopier') { toast(await copy(messageFor(kode)) ? 'Meldingen er kopiert' : 'Kunne ikke kopiere'); return; }
    if (act === 'qr') { showQr(kode); return; }
    if (act === 'navn') {
      const v = await askName(kode, nameOf(row || {}));
      if (v === null) return;
      if (await saveName(kode, v)) { toast(v ? 'Navnet er lagret' : 'Navnet er fjernet'); renderList(); }
      return;
    }
    if (act === 'fullfor' && !await ask('Har eleven fått lappen?', `Gratulerer! ${who} mister Pluss fra dere neste gang appen sjekker koden, innen en uke når telefonen er på nett. Turene blir liggende i elevens app. Eleven faktureres ikke på nytt.`, 'Fikk lappen')) return;
    if (act === 'steng' && st === 'ubrukt' && !await ask('Trekke tilbake koden?', `${who} kan ikke ta koden i bruk, og den faktureres ikke.`, 'Trekk tilbake')) return;
    if (act === 'steng' && st !== 'ubrukt' && !await ask(teacher ? 'Stenge lærerkoden?' : 'Stenge koden?', teacher ? `${who} mister trafikklærerversjonen innen en uke.` : `${who} mister Pluss innen en uke. Eleven har tatt koden i bruk, og faktureres som før.`, 'Steng')) return;
    if (act === 'ny-telefon' && !await ask('Ny telefon?', `${who} kan ta koden i bruk på ${teacher ? 2 : data.maks} nye telefoner.`, 'Ny telefon')) return;
    b.disabled = true;
    const r = await api('POST', '/v1/skole/' + act, { kode });
    if (r.error) { b.disabled = false; toast('Det gikk ikke. Prøv igjen.'); return; }
    toast(act === 'fullfor' ? `Gratulerer til ${who}!` : act === 'steng' ? (r.tilbake ? 'Koden er trukket tilbake' : 'Koden er stengt') : act === 'ny-telefon' ? 'Klar for ny telefon' : 'Koden virker igjen');
    if (fresh === kode && act === 'steng') fresh = null;
    await load();
  };
  $('#rows').onclick = onAct;
  const tr = $('#teacher-rows'); if (tr) tr.onclick = onAct;
}

// Tilbake fra Meldinger eller e-posten: hent tallene på nytt (ikke midt i et vindu)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && data && !document.querySelector('dialog[open]')) load(); });
load();
