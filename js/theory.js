/* Teori og sikkerhetskontroll (0.14.0): øving til teoriprøven for klasse B og sikkerhetskontrollen på oppkjøringen.
   Prøven er bygget som Statens vegvesens: 45 oppgaver, 90 minutter, 38 riktige for å bestå, ett riktig svar per
   oppgave, og du kan gå fram og tilbake før du leverer (vegvesen.no, «Gjennomføring av teoriprøven», 2026).
   Temaene følger vegvesenets temaliste for klasse B (august 2020).
   Spørsmålene er appens egne, skrevet ut fra vegtrafikkloven, trafikkreglene, skiltforskriften og forskrift om bruk av
   kjøretøy. Ingen spørsmål er hentet fra den ekte prøven eller fra andre tjenester.
   Fremgangen ligger i innstillingene (og dermed i sikkerhetskopien): { q, exams, safety, car }.
   Rene funksjoner, testes i Node. */

export const EXAM = { n: 45, pass: 38, minutes: 90 };

/* Hvor mange oppgaver hvert tema får på en prøve (sum 45). Vegvesenet oppgir ikke fordelingen; denne følger hvor mye
   hvert tema dekker i temalisten. */
export const EXAM_QUOTA = { fart: 9, trafikanter: 4, ansvar: 8, kjoretoy: 6, regler: 4, skilt: 7, vikeplikt: 7 };

/* Et spørsmål regnes som lært når det er besvart riktig tre ganger på rad */
export const LEARNED = 3;

/* Klar for teoriprøven: bestått minst 3 av de 5 siste prøvene, og den siste */
export const READY_RULE = { last: 5, passed: 3 };

export const emptyProgress = () => ({ q: {}, exams: [], safety: {}, car: '' });

/* Fremgang fra innstillingene, alltid med alle felt */
export function normProgress(p) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    q: o.q && typeof o.q === 'object' ? o.q : {},
    exams: Array.isArray(o.exams) ? o.exams : [],
    safety: o.safety && typeof o.safety === 'object' ? o.safety : {},
    car: typeof o.car === 'string' ? o.car : ''
  };
}

/* Tilfeldige tall med frø, så prøver og rekkefølge kan gjentas i testene */
export function rng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* Rekkefølgen svaralternativene vises i. I dataene står det riktige svaret alltid først (indeks 0). */
export const optionOrder = (q, rand = Math.random) => shuffle(q.a.map((_, i) => i), rand);

/* Ett svar: ny fremgang (den gamle endres ikke). chosen = indeksen i q.a, riktig er 0. */
export function answer(p, id, chosen, now = Date.now()) {
  const prev = p.q[id] || { n: 0, ok: 0, run: 0 };
  const right = chosen === 0;
  const e = { n: prev.n + 1, ok: prev.ok + (right ? 1 : 0), run: right ? prev.run + 1 : 0, last: now, ...(right ? {} : { miss: now }) };
  if (right && prev.miss) e.miss = prev.miss;
  return { ...p, q: { ...p.q, [id]: e } };
}

export const isLearned = e => !!e && e.run >= LEARNED;
/* «Feil å øve på»: besvart feil sist (og ikke rettet opp siden) */
export const isWrong = e => !!e && e.n > 0 && e.run === 0;

/* Per tema: antall spørsmål, besvart, lært og andel riktige */
export function themeStats(questions, p, themes) {
  const out = {};
  for (const t of themes) out[t.id] = { total: 0, seen: 0, learned: 0, right: 0, answers: 0 };
  for (const q of questions) {
    const s = out[q.t]; if (!s) continue;
    const e = p.q[q.id];
    s.total++;
    if (e) { s.seen++; s.right += e.ok; s.answers += e.n; if (isLearned(e)) s.learned++; }
  }
  return out;
}

/* Spørsmål til en øverunde. Først de som ble besvart feil, så nye, så de som ikke er lært, og til slutt de lærte som
   ikke er sett på lenge. filter: tema, merker (fra turene), bare feil eller en egen liste. */
export function pickPractice(questions, p, { theme = null, tags = null, wrongOnly = false, ids = null, n = 10, now = Date.now(), rand = Math.random } = {}) {
  let pool = questions;
  if (ids) { const set = new Set(ids); pool = pool.filter(q => set.has(q.id)); }
  if (theme) pool = pool.filter(q => q.t === theme);
  if (tags && tags.length) pool = pool.filter(q => (q.tags || []).some(t => tags.includes(t)));
  if (wrongOnly) pool = pool.filter(q => isWrong(p.q[q.id]));
  const score = q => {
    const e = p.q[q.id];
    if (!e) return 3 + rand();
    if (isWrong(e)) return 4 + rand();
    if (!isLearned(e)) return 2 + e.run * -0.3 + rand();
    const days = (now - (e.last || 0)) / 864e5;
    return Math.min(1.5, days / 14) + rand() * 0.5;
  };
  const picked = pool.map(q => ({ q, s: score(q) })).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.q);
  return shuffle(picked, rand);
}

/* En prøve som den ekte: oppgaver fra hvert tema etter kvoten, helst ikke de samme som på de to siste prøvene.
   Har et tema for få spørsmål, fylles resten fra de andre temaene. → liste med id-er */
export function buildExam(questions, { quota = EXAM_QUOTA, n = EXAM.n, recent = [], rand = Math.random } = {}) {
  const used = new Set(recent);
  const pick = (pool, k) => {
    const fresh = shuffle(pool.filter(q => !used.has(q.id)), rand), old = shuffle(pool.filter(q => used.has(q.id)), rand);
    return fresh.concat(old).slice(0, k);
  };
  let chosen = [];
  for (const [t, k] of Object.entries(quota)) chosen = chosen.concat(pick(questions.filter(q => q.t === t), k));
  if (chosen.length < n) {
    const have = new Set(chosen.map(q => q.id));
    chosen = chosen.concat(pick(questions.filter(q => !have.has(q.id)), n - chosen.length));
  }
  return shuffle(chosen.slice(0, n), rand).map(q => q.id);
}

/* Retting av en prøve. answers: { id: valgt indeks i q.a }. → { correct, total, passed, byTheme, wrong: [id] } */
export function scoreExam(questions, ids, answers, { pass = EXAM.pass } = {}) {
  const byId = new Map(questions.map(q => [q.id, q]));
  const byTheme = {}, wrong = [];
  let correct = 0;
  for (const id of ids) {
    const q = byId.get(id); if (!q) continue;
    const b = byTheme[q.t] || (byTheme[q.t] = { n: 0, correct: 0 });
    b.n++;
    if (answers[id] === 0) { correct++; b.correct++; } else wrong.push(id);
  }
  return { correct, total: ids.length, passed: correct >= pass, byTheme, wrong };
}

/* Hvor klar du er for teoriprøven, ut fra de siste prøvene */
export function theoryReady(p, { last = READY_RULE.last, passed = READY_RULE.passed } = {}) {
  const ex = p.exams.slice(-last);
  const ok = ex.filter(e => e.passed).length;
  const lastOk = ex.length ? ex[ex.length - 1].passed : false;
  if (!ex.length) return { level: 'start', passed: 0, taken: 0, need: passed };
  if (ok >= passed && lastOk) return { level: 'klar', passed: ok, taken: ex.length, need: passed };
  return { level: ok >= 1 ? 'nesten' : 'ovelse', passed: ok, taken: ex.length, need: passed };
}

export const READY_TEXT = {
  start: 'Ta en prøve når du har øvd litt på temaene. Den er bygget som den ekte: 45 oppgaver og 90 minutter.',
  ovelse: 'Øv mer på temaene der du har flest feil, og ta en ny prøve.',
  nesten: 'Du er på vei. Bestå 3 av 5 prøver på rad, og den siste, før du bestiller teoriprøven.',
  klar: 'Du har bestått flere prøver på rad. Du ser klar ut for teoriprøven.'
};

/* En prøve lagres med bare det som trengs for oversikten og «øv på feilene fra prøven» (høyst 20 prøver) */
export function addExam(p, result, { at = Date.now(), sec = null, ids = [] } = {}) {
  const e = { at, correct: result.correct, total: result.total, passed: result.passed, byTheme: result.byTheme, wrong: result.wrong, ids, ...(sec !== null ? { sec } : {}) };
  return { ...p, exams: p.exams.concat([e]).slice(-20) };
}

/* ---------- Sikkerhetskontrollen ---------- */

/* Oppgavene for biltypen: 'el' (elbil), 'fossil' (bensin eller diesel), 'hybrid' (begge deler), '' (ikke valgt: alle) */
export function safetyFor(tasks, car = '') {
  if (!car) return tasks;
  return tasks.filter(t => !t.car || t.car === 'alle' || t.car === car || (car === 'hybrid' && (t.car === 'fossil' || t.car === 'el')));
}

/* Som på oppkjøringen: noen tilfeldige oppgaver fra ulike områder, helst de du ikke kan ennå */
export function pickSafety(tasks, p, { car = '', n = 5, rand = Math.random } = {}) {
  const pool = shuffle(safetyFor(tasks, car), rand);
  const known = t => !!(p.safety[t.id] && p.safety[t.id].known);
  const out = [], areas = new Set();
  // Det du ikke kan, først, fra ulike områder; så resten av det du ikke kan; så det du kan, også fra ulike områder
  for (const group of [pool.filter(t => !known(t)), pool.filter(known)]) {
    for (const t of group) { if (out.length >= n) break; if (!areas.has(t.area)) { out.push(t); areas.add(t.area); } }
    for (const t of group) { if (out.length >= n) break; if (!out.includes(t)) out.push(t); }
  }
  return out;
}

export function markSafety(p, id, known, now = Date.now()) {
  return { ...p, safety: { ...p.safety, [id]: { known: !!known, at: now } } };
}

export function safetyStats(tasks, p, car = '') {
  const list = safetyFor(tasks, car);
  return { total: list.length, known: list.filter(t => p.safety[t.id] && p.safety[t.id].known).length };
}

/* ---------- Fra turene ---------- */

/* Hva turene tyder på at eleven bør lese seg opp på. signals: { speeding, crests, close, dark, slippery, laneNoMirror,
   roundabouts } (tall fra de siste turene) → [{ tag, why }] i rekkefølgen de bør øves. */
export function tagsFromDrives(s = {}) {
  const out = [];
  if (s.crests > 0) out.push({ tag: 'bakketopp', why: `For høy fart over ${s.crests} ${s.crests === 1 ? 'bakketopp' : 'bakketopper'}` });
  if (s.speeding > 0) out.push({ tag: 'fart', why: `Over fartsgrensen ${s.speeding} ${s.speeding === 1 ? 'gang' : 'ganger'}` });
  if (s.close > 0) out.push({ tag: 'avstand', why: `For kort avstand til bilen foran ${s.close} ${s.close === 1 ? 'gang' : 'ganger'}` });
  if (s.laneNoMirror > 0) out.push({ tag: 'feltskifte', why: `${s.laneNoMirror} ${s.laneNoMirror === 1 ? 'feltskifte' : 'feltskifter'} uten speilblikk` });
  if (s.slippery > 0) out.push({ tag: 'glatt', why: 'Turer på glatt føre' });
  if (s.dark > 0) out.push({ tag: 'morket', why: 'Turer i mørket' });
  if (s.roundabouts > 0) out.push({ tag: 'rundkjoring', why: `${s.roundabouts} ${s.roundabouts === 1 ? 'rundkjøring' : 'rundkjøringer'}` });
  return out;
}
