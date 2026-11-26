/* Meldinger mellom elev og trafikklærer, og elevoversikten for læreren (0.18.0). Rene funksjoner, testes i Node.
   Det finnes ingen server: en melding sendes som en fil (Meldinger, AirDrop eller e-post) med teksten, turene den
   gjelder og leksene. Mottakeren åpner filen i Kjørerapport, og meldingen havner i samtalen. Når en ekte deling
   kommer, byttes bare måten filen kommer fram på; meldingene og turene ser likt ut.
   En melding kan gjelde en hel tur, en hendelse, et merke fra ledsageren eller en strekning. Den knyttes til tid og
   sted i turen, ikke hendelsesnummeret, for numrene endres når følsomheten endres. */

export const PKG_KIND = 'kjorerapport-melding';
export const PKG_V = 1;
export const TEACHER_THREAD = 'laerer';   // elevens samtale med læreren sin
const MAX_TEXT = 1000;

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const fin = v => (Number.isFinite(v) ? v : null);
export const newMsgId = (now = Date.now(), rnd = Math.random) => `m${now.toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`;

/* Hva en melding gjelder. kind: 'tur' | 'hendelse' | 'merke' | 'strekning'. t/tTo: sekunder inn i turen. */
export function cleanRef(ref) {
  if (!ref || typeof ref !== 'object' || typeof ref.driveId !== 'string' || !ref.driveId) return null;
  const kind = ['tur', 'hendelse', 'merke', 'strekning'].includes(ref.kind) ? ref.kind : 'tur';
  return { driveId: ref.driveId.slice(0, 80), kind, startedAt: str(ref.startedAt, 40), label: str(ref.label, 120),
    ...(fin(ref.t) !== null ? { t: ref.t } : {}), ...(fin(ref.tTo) !== null ? { tTo: ref.tTo } : {}),
    ...(fin(ref.lat) !== null && fin(ref.lon) !== null ? { lat: ref.lat, lon: ref.lon } : {}) };
}

export function cleanMessage(m) {
  if (!m || typeof m !== 'object') return null;
  const text = str(m.text, MAX_TEXT).trim(), ref = cleanRef(m.ref);
  if (!text && !ref) return null;
  return { id: str(m.id, 40) || newMsgId(), from: m.from === 'laerer' ? 'laerer' : 'elev', name: str(m.name, 40),
    // Alltid som UTC-tekst (0.18.3): samtalen sorteres på teksten, og en dato med tidssone ellers ville havnet feil
    at: typeof m.at === 'string' && !isNaN(Date.parse(m.at)) ? new Date(m.at).toISOString() : new Date().toISOString(), text, ...(ref ? { ref } : {}) };
}

/* Legger meldinger inn i en samtale uten doble (samme id), eldste først */
export function mergeThread(thread = [], incoming = [], { read = false } = {}) {
  const byId = new Map(thread.map(m => [m.id, m]));
  for (const m of incoming) if (m && !byId.has(m.id)) byId.set(m.id, { ...m, read, sent: true });
  return [...byId.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/* Uleste meldinger fra den andre (me: 'elev' eller 'laerer') */
export const unread = (thread = [], me) => thread.filter(m => m.from !== me && !m.read).length;
export const markRead = (thread = [], me) => thread.map(m => (m.from !== me && !m.read ? { ...m, read: true } : m));
export const unsent = (thread = [], me) => thread.filter(m => m.from === me && !m.sent);

/* Kort tekst om hva meldingen gjelder */
const mmss = s => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
export function refLabel(ref) {
  if (!ref) return '';
  const day = ref.startedAt ? new Date(ref.startedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : '';
  const where = ref.kind === 'strekning' && ref.t !== undefined && ref.tTo !== undefined ? `strekningen ${mmss(ref.t)}–${mmss(ref.tTo)}`
    : (ref.kind === 'hendelse' || ref.kind === 'merke') && ref.t !== undefined ? `${ref.label ? ref.label.toLowerCase() : ref.kind} ved ${mmss(ref.t)}`
    : 'hele turen';
  return `${day ? `Turen ${day}` : 'Turen'}: ${where}`;
}

/* Turen slik den sendes: analysen (posisjoner hvert sekund, hendelser, poeng) og veidataene, ikke rådataene fra
   sensorene. Det holder filen liten (noen hundre kB) og læreren ser det samme som eleven. */
export function shareDrive(d) {
  return { id: d.id, startedAt: d.startedAt, endedAt: d.endedAt || null, driver: d.driver || '', note: d.note || '', marks: d.marks || [],
    focus: d.focus || [], surface: d.surface || '', ...(d.noFace ? { noFace: true } : {}), ...(d.mock ? { mock: true } : {}), ...(d.excluded ? { excluded: d.excluded } : {}),
    result: d.result || null, enrich: d.enrich ? { ...d.enrich, error: null } : null, cameraPlan: d.cameraPlan || null };
}

/* Elevens faste ID (0.18.3): et tilfeldig tegn-sett som lages én gang på elevens telefon og følger hver melding. Læreren
   kjenner eleven igjen på den, også når navnet er skrevet annerledes («emma», «Emma H.»). Ikke et personnummer. */
export const newPersonId = (rnd = Math.random) => 'p' + Array.from({ length: 16 }, () => Math.floor(rnd() * 36).toString(36)).join('');
const cleanId = v => (typeof v === 'string' && /^[a-z0-9]{6,40}$/i.test(v) ? v : '');
/* Teorien eleven har øvd (0.18.3): sendes med, så læreren ser teori og sikkerhetskontroll. Bare et objekt av rimelig størrelse. */
const cleanTheory = t => (t && typeof t === 'object' && !Array.isArray(t) && JSON.stringify(t).length < 300000 ? t : null);

/* Pakken som sendes. from: { role: 'elev' | 'laerer', name, id }, to: navnet til mottakeren (eleven, når læreren sender) */
/* Elevens kode fra trafikkskolen (1.2.0): følger med til læreren, så «har fått lappen» hos læreren kan avslutte den.
   Bare tegnene kodene lages av (uten 0, 1, I, L og O). → «K7MX29QFH4TA» eller '' */
export const cleanSchoolCode = c => { const v = String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); return /^[2-9A-HJKMNP-Z]{12}$/.test(v) ? v : ''; };

export function buildPackage({ from, to = '', messages = [], drives = [], homework = null, theory = null, appVersion = '', now = new Date() }) {
  const id = cleanId(from && from.id), th = cleanTheory(theory), role = from && from.role === 'laerer' ? 'laerer' : 'elev';
  const kode = role === 'elev' ? cleanSchoolCode(from && from.kode) : '';
  return { app: 'Kjørerapport', kind: PKG_KIND, v: PKG_V, appVersion, sentAt: now.toISOString(),
    from: { role, name: str(from && from.name, 40), ...(id ? { id } : {}), ...(kode ? { kode } : {}) }, to: str(to, 40),
    messages: messages.map(cleanMessage).filter(Boolean), drives: drives.filter(d => d && d.result).map(shareDrive), ...(homework ? { homework } : {}), ...(th ? { theory: th } : {}) };
}

/* Hvilken elev i lærerens liste en melding er fra (0.18.3): først den faste ID-en, så navnet uten hensyn til store og
   små bokstaver. list: [{ name, ids }]. → navnet slik det står i lista, eller null (læreren må velge). */
export function matchStudent(list = [], from = {}) {
  const id = cleanId(from.id);
  if (id) { const hit = list.find(x => Array.isArray(x.ids) && x.ids.includes(id)); if (hit) return hit.name; }
  const name = String(from.name || '').trim().toLowerCase();
  if (!name) return null;
  const same = list.filter(x => x.name.toLowerCase() === name);
  // Har eleven med samme navn allerede en annen ID, er det en annen elev med samme navn: læreren må velge
  if (same.length === 1 && !(id && Array.isArray(same[0].ids) && same[0].ids.length)) return same[0].name;
  return null;
}

export const isPackage = p => !!p && typeof p === 'object' && p.kind === PKG_KIND;

/* Leser en pakke fra en fil. Kaster en feil med vanlige ord hvis den ikke kan brukes. */
export function readPackage(p) {
  if (!isPackage(p)) throw new Error('Filen er ikke en melding fra Kjørerapport.');
  if (Number(p.v) > PKG_V) throw new Error('Meldingen er laget med en nyere versjon av appen. Oppdater appen og prøv igjen.');
  const role = p.from && p.from.role === 'laerer' ? 'laerer' : 'elev';
  const from = { role, name: str(p.from && p.from.name, 40).trim(), id: cleanId(p.from && p.from.id), kode: role === 'elev' ? cleanSchoolCode(p.from && p.from.kode) : '' };
  const messages = (Array.isArray(p.messages) ? p.messages : []).map(cleanMessage).filter(Boolean).map(m => ({ ...m, from: from.role, name: m.name || from.name }));
  const drives = (Array.isArray(p.drives) ? p.drives : []).filter(d => d && typeof d.id === 'string' && d.result && Array.isArray(d.result.points) && d.result.points.length > 1);
  const hw = p.homework && typeof p.homework === 'object' ? { focus: (Array.isArray(p.homework.focus) ? p.homework.focus : []).filter(f => typeof f === 'string').slice(0, 3), note: str(p.homework.note, 300), setAt: str(p.homework.setAt, 40), from: from.name || 'trafikklæreren' } : null;
  return { from, to: str(p.to, 40), messages, drives, homework: hw, theory: from.role === 'elev' ? cleanTheory(p.theory) : null, sentAt: str(p.sentAt, 40) };
}

/* Filnavn uten æøå og mellomrom */
export function packageName(to, now = new Date()) {
  const slug = String(to || '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `kjorerapport-melding${slug ? '-' + slug : ''}-${now.toISOString().slice(0, 10)}.json`;
}

/* ---------- Elevoversikten (læreren) ---------- */
const DAY = 86400000;
/* Én rad per elev: siste tur, øving siste 30 dager, snittpoeng og retning, meldinger, og om eleven trenger oppfølging.
   drives: lagrede turer med ferdig analyse (d.result), students: [{ name, email }], threads: { navn: [meldinger] } */
export function studentOverview(drives, students, threads = {}, now = Date.now()) {
  return students.map(st => {
    const own = drives.filter(d => (d.driver || '') === st.name && d.result && d.result.stats && !d.demo && !d.excluded)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    const last = own[0] ? Date.parse(own[0].startedAt) : null;
    const recent = own.filter(d => now - Date.parse(d.startedAt) <= 30 * DAY);
    const avg = list => (list.length ? Math.round(list.reduce((s, d) => s + d.result.overall, 0) / list.length) : null);
    const avgNow = avg(own.slice(0, 5)), avgBefore = own.length >= 6 ? avg(own.slice(5, 10)) : null;
    const thread = threads[st.name] || [];
    const lastMsg = thread[thread.length - 1] || null;
    const newMsgs = unread(thread, 'laerer');
    // Ubesvart (0.18.3): siste melding er fra eleven, også etter at læreren har lest den
    const awaiting = !newMsgs && !!lastMsg && lastMsg.from === 'elev';
    const idle = last === null ? null : Math.floor((now - last) / DAY);
    const flags = [];
    if (newMsgs) flags.push({ id: 'msg', text: `${newMsgs} ${newMsgs === 1 ? 'ny melding' : 'nye meldinger'}`, tone: 'info' });
    else if (awaiting) flags.push({ id: 'reply', text: 'Eleven venter på svar', tone: 'info' });
    if (avgNow !== null && avgNow < 70) flags.push({ id: 'score', text: `Snitt ${avgNow} poeng`, tone: 'warn' });
    if (avgNow !== null && avgBefore !== null && avgBefore - avgNow >= 5) flags.push({ id: 'down', text: `Ned ${avgBefore - avgNow} poeng`, tone: 'warn' });
    if (idle !== null && idle >= 14) flags.push({ id: 'idle', text: `Ikke kjørt på ${idle} dager`, tone: 'warn' });
    if (last === null) flags.push({ id: 'none', text: 'Ingen turer ennå', tone: 'muted' });
    // Høyere tall = mer å følge opp (sorteringen «Trenger oppfølging»)
    const need = (newMsgs ? 100 : awaiting ? 60 : 0) + (avgNow !== null && avgNow < 70 ? 30 + (70 - avgNow) : 0) + (avgNow !== null && avgBefore !== null ? Math.max(0, avgBefore - avgNow) * 2 : 0) + (idle !== null && idle >= 14 ? 10 + Math.min(20, idle - 14) : 0);
    return { name: st.name, email: st.email || '', test: !!st.test, count: own.length, last, idle,
      min30: Math.round(recent.reduce((s, d) => s + (d.result.stats.duration || 0), 0) / 60), km30: recent.reduce((s, d) => s + (d.result.stats.km || 0), 0),
      avg: avgNow, trend: avgNow !== null && avgBefore !== null ? avgNow - avgBefore : null, newMsgs, awaiting, lastMsgAt: lastMsg ? lastMsg.at : null, flags, need };
  });
}

export const SORTS = [['need', 'Trenger oppfølging'], ['recent', 'Sist aktiv'], ['msg', 'Nyeste melding'], ['name', 'Navn']];
const byName = (a, b) => a.name.localeCompare(b.name, 'nb');
export function sortStudents(list, mode = 'need') {
  const l = list.slice();
  if (mode === 'name') return l.sort(byName);
  if (mode === 'recent') return l.sort((a, b) => (b.last || 0) - (a.last || 0) || byName(a, b));
  if (mode === 'msg') return l.sort((a, b) => String(b.lastMsgAt || '').localeCompare(String(a.lastMsgAt || '')) || byName(a, b));
  return l.sort((a, b) => b.need - a.need || (b.last || 0) - (a.last || 0) || byName(a, b));
}
/* Søk på navn eller e-post, uten å bry seg om store og små bokstaver */
export function filterStudents(list, q = '') {
  const s = String(q).trim().toLowerCase();
  return s ? list.filter(x => x.name.toLowerCase().includes(s) || x.email.toLowerCase().includes(s)) : list;
}
