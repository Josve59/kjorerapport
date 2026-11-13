/* Skjermene for teori og sikkerhetskontroll (0.14.0). app.js styrer rutene og gir en kontekst:
   ctx = { progress(): fremgang, save(p), driveTags(): Promise<[{ tag, why }]>, go(hash), vibrate(ms) }.
   Rutene: #/teori (oversikt), #/teori/ov (øving), #/teori/prove (prøve), #/teori/resultat, #/sikkerhetskontroll,
   #/sikkerhetskontroll/ov. Øving og prøve holdes i minnet; en påbegynt prøve lagres også lokalt, så den overlever
   at appen lukkes. */
import { icon, speak, stopSpeaking, confirmDialog, sheetDialog, toast } from './ui.js';
import { esc } from './format.js';
import { THEMES, QUESTIONS } from './theory-b.js';
import { SAFETY, SAFETY_AREAS, CAR_TYPES } from './safety-check.js';
import { figure } from './trafficsvg.js';
import { SIGNS, SIGN_GROUPS, SIGN_QUESTIONS } from './theory-signs.js';
import { EXAM, LEARNED, READY_RULE, READY_TEXT, HARD_SHARE, level, answer, isLearned, isWrong, themeStats, pickPractice, buildExam, scoreExam, theoryReady, addExam,
  optionOrder, safetyFor, pickSafety, markSafety, safetyStats, theoryBrief } from './theory.js';

const byId = new Map(QUESTIONS.concat(SIGN_QUESTIONS).map(q => [q.id, q]));
const theme = id => THEMES.find(t => t.id === id) || { title: '', icon: 'quiz' };
const LETTERS = 'ABCD';
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ---------- Tilstand ---------- */
let practice = null;   // { title, filter, items: [id], orders, i, chosen, results: [bool], back: rute å gå tilbake til }
let drill = null;      // sikkerhetskontroll: { items: [id], i, shown, results: [bool] }
let examTimer = null;
const EXAM_KEY = 'kj-teori-prove';
const loadExam = () => { try { return JSON.parse(localStorage.getItem(EXAM_KEY) || 'null'); } catch { return null; } };
const saveExam = e => { try { if (e) localStorage.setItem(EXAM_KEY, JSON.stringify(e)); else localStorage.removeItem(EXAM_KEY); } catch { /* privat modus */ } };
let lastResult = null;   // siste leverte prøve, til resultatskjermen

export function stopTheory() { if (examTimer) { clearInterval(examTimer); examTimer = null; } stopSpeaking(); }
export const examInProgress = () => { const e = loadExam(); return e && !e.done ? e : null; };
/* Status til trafikklærersiden (teacher.js) */
export const teacherTheory = p => theoryBrief(p, { questions: QUESTIONS, signQuestions: SIGN_QUESTIONS, tasks: SAFETY });
/* Hvor tilbakeknappen fører fra en øverunde: skiltøving tilbake til skiltene */
export const practiceBack = () => (practice && practice.back) || '#/teori';

/* Kort sammendrag til Hjem og Opplæring */
export function theorySummary(p) {
  const r = theoryReady(p);
  const st = themeStats(QUESTIONS, p, THEMES);
  const learned = Object.values(st).reduce((s, x) => s + x.learned, 0);
  const s = safetyStats(SAFETY, p, p.car);
  return { ready: r, learned, total: QUESTIONS.length, safety: s, wrong: QUESTIONS.filter(q => isWrong(p.q[q.id])).length, exam: examInProgress() };
}

/* De to små kortene på Hjem og i Opplæring. Etter første prøve er det siste resultatet det viktigste tallet. */
export function theoryMiniCards(p, ids) {
  const t = theorySummary(p), last = p.exams[p.exams.length - 1];
  let big, small;
  if (t.exam) { big = `${Object.keys(t.exam.answers).length} av ${t.exam.ids.length}`; small = 'Prøve påbegynt, fortsett'; }
  else if (last) { big = `${last.correct} av ${last.total}`; small = t.ready.level === 'klar' ? 'Klar for teoriprøven' : last.passed ? 'Siste prøve bestått' : 'Siste prøve ikke bestått'; }
  else { big = `${t.learned} lært`; small = `av ${t.total} spørsmål`; }
  return `<button type="button" class="card mini-card" id="${ids[0]}"><span class="card-title">${icon('quiz')}Teoriprøven</span><strong>${esc(big)}</strong><span class="muted small">${esc(small)}</span></button>
    <button type="button" class="card mini-card" id="${ids[1]}"><span class="card-title">${icon('wrench')}Sikkerhets&shy;kontroll</span><strong>${t.safety.known} av ${t.safety.total}</strong><span class="muted small">oppgaver du kan</span></button>`;
}

const readLine = q => `${q.q} ${q.a.map((a, i) => `${LETTERS[i]}: ${a}.`).join(' ')}`;
const speakBtn = id => `<button type="button" class="icon-btn q-speak" id="${id}" aria-label="Les opp">${icon('volume', 22)}</button>`;

/* ---------- Oversikt ---------- */
export async function renderTheoryHub(root, ctx) {
  stopTheory();
  const p = ctx.progress();
  const sum = theorySummary(p);
  const st = themeStats(QUESTIONS, p, THEMES);
  const exams = p.exams.slice(-10);
  const ongoing = sum.exam;
  const head = { start: 'Øv deg til teoriprøven', ovelse: 'Øv videre', nesten: 'Nesten klar', klar: 'Klar for teoriprøven' }[sum.ready.level];
  root.innerHTML = `
    <section class="card th-hero lv-${sum.ready.level}">
      <p class="eyebrow">Teoriprøven klasse B</p>
      <h2>${esc(head)}</h2>
      ${exams.length ? `<div class="th-dots" aria-label="De siste prøvene">${exams.map(e => `<span class="th-dot ${e.correct >= EXAM.solid ? 'ok' : e.passed ? 'mid' : 'no'}" title="${e.correct} av ${e.total}">${e.correct}</span>`).join('')}</div>
        <p class="muted small">Minst ${EXAM.solid} riktige på ${sum.ready.solid} av de ${Math.min(exams.length, READY_RULE.last)} siste prøvene. Grensen på den ekte prøven er ${EXAM.pass}, men her sikter du mot ${EXAM.solid} for å ha margin.</p>` : ''}
      <p>${esc(READY_TEXT[sum.ready.level])}</p>
      <p class="muted small">${ongoing ? `${Object.keys(ongoing.answers).length} av ${ongoing.ids.length} oppgaver besvart` : `${EXAM.n} oppgaver · ${EXAM.minutes} minutter · ${EXAM.pass} riktige for å bestå`}</p>
      <button type="button" class="btn primary" id="th-exam">${icon('clock', 20)}${ongoing ? 'Fortsett prøven' : 'Ta en prøve'}</button>
    </section>
    <div class="btn-row">
      <button type="button" class="btn secondary" id="th-wrong" ${sum.wrong ? '' : 'disabled'}>${icon('repeat', 20)}Øv på feilene${sum.wrong ? ` (${sum.wrong})` : ''}</button>
      <button type="button" class="btn secondary" id="th-mix">${icon('quiz', 20)}Blandet øving</button>
    </div>
    <section class="card th-drive" id="th-drive" hidden></section>
    <h2 class="group-title">Temaene på prøven</h2>
    <section class="card th-themes"><ul class="th-list">${THEMES.map(t => {
      const s = st[t.id], pct = s.total ? Math.round(s.learned / s.total * 100) : 0;
      return `<li><button type="button" class="th-theme" data-theme="${t.id}">
        <span class="th-ico">${icon(t.icon, 22)}</span>
        <span class="th-tt"><strong>${esc(t.title)}</strong><span class="muted small">${esc(t.blurb)}</span>
          <span class="th-bar"><span style="width:${pct}%"></span></span><span class="muted small">${s.learned} av ${s.total} lært${s.seen ? ` · ${Math.round(s.right / Math.max(1, s.answers) * 100)} % riktige svar` : ''}</span></span>
        ${icon('chev', 18)}</button></li>`;
    }).join('')}</ul></section>
    <button type="button" class="card t-cta th-signs-cta" id="th-to-signs"><span class="card-title">${icon('sign')}Skiltprøven</span><span class="muted small">${signsLearned(p)} av ${SIGNS.length} skilt lært. Se alle skiltene og hva de betyr, og øv til du kjenner dem igjen.</span><span class="last-cta">Åpne ${icon('chev', 18)}</span></button>
    <button type="button" class="card t-cta th-safety-cta" id="th-to-safety"><span class="card-title">${icon('wrench')}Sikkerhetskontrollen på oppkjøringen</span><span class="muted small">${sum.safety.known} av ${sum.safety.total} oppgaver kan du. Øv ved bilen på det sensor kan spørre om.</span><span class="last-cta">Åpne ${icon('chev', 18)}</span></button>
    <p class="muted small th-note">Prøven her er laget litt vanskeligere enn den ekte: minst ${Math.round(HARD_SHARE * 10)} av 10 oppgaver er vanskelige, og du bør ha ${EXAM.solid} riktige, ikke ${EXAM.pass}, før du regner deg som klar. Et spørsmål er lært når du har svart riktig på det ${LEARNED} ganger på rad. Spørsmålene er appens egne, skrevet ut fra vegtrafikkloven, trafikkreglene og skiltforskriften. Den ekte prøven har andre spørsmål, men de samme temaene.</p>
    ${Object.keys(p.q).length || p.exams.length ? '<button type="button" class="link th-reset" id="th-reset">Begynn på nytt</button>' : ''}`;
  root.querySelector('#th-exam').onclick = () => { if (!examInProgress()) startExam(ctx); ctx.go('#/teori/prove'); };
  root.querySelector('#th-wrong').onclick = () => startPractice(ctx, { title: 'Feilene dine', wrongOnly: true, n: 15 });
  root.querySelector('#th-mix').onclick = () => startPractice(ctx, { title: 'Blandet øving', n: 10 });
  root.querySelector('#th-to-safety').onclick = () => ctx.go('#/sikkerhetskontroll');
  root.querySelector('#th-to-signs').onclick = () => ctx.go('#/teori/skilt');
  root.querySelectorAll('.th-theme').forEach(b => b.onclick = () => startPractice(ctx, { title: theme(b.dataset.theme).title, theme: b.dataset.theme, n: 10 }));
  const reset = root.querySelector('#th-reset');
  if (reset) reset.onclick = async () => {
    if (!await confirmDialog({ title: 'Begynne på nytt?', text: 'Svarene og prøvene dine slettes, så alle spørsmål blir nye igjen. Sikkerhetskontrollen beholdes.', ok: 'Begynn på nytt', danger: true })) return;
    const cur = ctx.progress();
    ctx.save({ ...cur, q: {}, exams: [] }); saveExam(null);
    renderTheoryHub(root, ctx);
  };
  // Fra turene: det turene tyder på at eleven bør lese seg opp på (fylles inn når turene er lest)
  const tags = await ctx.driveTags().catch(() => []);
  const box = root.querySelector('#th-drive');
  if (box && tags.length) {
    const qs = QUESTIONS.filter(q => (q.tags || []).some(t => tags.some(x => x.tag === t)));
    box.innerHTML = `<h2 class="card-title">${icon('flag')}Fra turene dine</h2>
      <ul class="th-why">${tags.slice(0, 4).map(t => `<li>${esc(t.why)}</li>`).join('')}</ul>
      <p class="muted small">Spørsmål om reglene bak det turene viser.</p>
      <button type="button" class="btn secondary" id="th-drive-go">${icon('quiz', 20)}Øv på dette (${Math.min(10, qs.length)} spørsmål)</button>`;
    box.hidden = false;
    box.querySelector('#th-drive-go').onclick = () => startPractice(ctx, { title: 'Fra turene dine', tags: tags.map(t => t.tag), n: 10 });
  }
}

/* ---------- Øving med svar og forklaring etter hvert spørsmål ---------- */
function startPractice(ctx, { title, n = 10, pool = 'teori', back = '#/teori', ...filter }) {
  const items = pickPractice(pool === 'skilt' ? SIGN_QUESTIONS : QUESTIONS, ctx.progress(), { n, ...filter });
  if (!items.length) { toast('Ingen spørsmål å øve på her akkurat nå.', { type: 'ok' }); return; }
  practice = { title, back, filter: { n, pool, back, ...filter }, items: items.map(q => q.id), orders: Object.fromEntries(items.map(q => [q.id, optionOrder(q)])), i: 0, chosen: null, results: [] };
  ctx.go('#/teori/ov');
}

export function renderPractice(root, ctx) {
  if (!practice) { ctx.go('#/teori'); return; }
  stopSpeaking();
  const P = practice;
  if (P.i >= P.items.length) return renderPracticeDone(root, ctx);
  const q = byId.get(P.items[P.i]), t = theme(q.t), answered = P.chosen !== null, right = P.chosen === 0;
  root.innerHTML = `
    <div class="q-top"><span class="q-step"><strong>${esc(P.title)}</strong><span class="muted small">${P.i + 1} av ${P.items.length}</span></span>
      <button type="button" class="icon-btn" id="q-close" aria-label="Avslutt øvingen">${icon('close', 22)}</button></div>
    <span class="th-bar q-prog"><span style="width:${(P.i + (answered ? 1 : 0)) / P.items.length * 100}%"></span></span>
    <section class="card q-card">
      <p class="eyebrow">${esc(q.eyebrow || t.title)}${level(q) >= 3 ? ' <span class="q-hard">Vanskelig</span>' : ''}</p>
      ${q.img ? `<div class="q-fig">${figure(q.img)}</div>` : ''}
      <div class="q-head"><h2 class="q-text">${esc(q.q)}</h2>${speakBtn('q-read')}</div>
      <div class="q-opts" role="group" aria-label="Svaralternativer">${P.orders[q.id].map((oi, k) => {
        const cls = !answered ? '' : oi === 0 ? 'right' : oi === P.chosen ? 'wrong' : 'dim';
        return `<button type="button" class="q-opt ${cls}" data-oi="${oi}" ${answered ? 'disabled' : ''}><span class="q-letter">${LETTERS[k]}</span><span>${esc(q.a[oi])}</span>${answered && oi === 0 ? icon('check', 20, 'q-mark') : answered && oi === P.chosen ? icon('close', 20, 'q-mark') : ''}</button>`;
      }).join('')}</div>
    </section>
    ${answered ? `<section class="card q-why ${right ? 'ok' : 'no'}" aria-live="polite">
      <p class="q-verdict">${right ? `${icon('check', 20)}Riktig` : `${icon('close', 20)}Ikke riktig`}</p>
      <p>${esc(q.why)}</p>
      <p class="muted small">${icon('book', 16)} ${esc(q.ref)}</p>
    </section>
    <div class="q-dock"><button type="button" class="btn primary" id="q-next">${P.i + 1 < P.items.length ? 'Neste spørsmål' : 'Se hvordan det gikk'}${icon('chev', 20)}</button></div>` : ''}`;
  root.querySelector('#q-close').onclick = () => { const back = P.back; practice = null; ctx.go(back); };
  root.querySelector('#q-read').onclick = () => speak(answered ? `${q.q} Riktig svar: ${q.a[0]}. ${q.why}` : readLine({ ...q, a: P.orders[q.id].map(i => q.a[i]) }));
  root.querySelectorAll('.q-opt').forEach(b => b.onclick = () => {
    if (P.chosen !== null) return;
    P.chosen = +b.dataset.oi;
    P.results.push(P.chosen === 0);
    ctx.save(answer(ctx.progress(), q.id, P.chosen));
    ctx.vibrate(P.chosen === 0 ? 15 : [30, 40, 30]);
    renderPractice(root, ctx);
    const w = root.querySelector('.q-why'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  const next = root.querySelector('#q-next');
  if (next) next.onclick = () => { P.i++; P.chosen = null; renderPractice(root, ctx); window.scrollTo(0, 0); };
}

function renderPracticeDone(root, ctx) {
  const P = practice, ok = P.results.filter(Boolean).length;
  root.innerHTML = `
    <section class="card th-hero ${ok === P.items.length ? 'lv-klar' : ok >= P.items.length * 0.85 ? 'lv-nesten' : 'lv-ovelse'}">
      <p class="eyebrow">${esc(P.title)}</p>
      <h2>${ok} av ${P.items.length} riktige</h2>
      <p>${ok === P.items.length ? 'Alt riktig. Bra jobbet!' : 'Spørsmålene du svarte feil på, kommer igjen neste gang du øver.'}</p>
    </section>
    <section class="card"><ul class="q-sum">${P.items.map((id, i) => `<li class="${P.results[i] ? 'ok' : 'no'}">${icon(P.results[i] ? 'check' : 'close', 18)}${byId.get(id).sign ? `<span class="q-sum-sign">${figure(byId.get(id).img)}</span>` : ''}<span>${esc(byId.get(id).label || byId.get(id).q)}</span></li>`).join('')}</ul></section>
    <button type="button" class="btn primary" id="q-again">${icon('repeat', 20)}Øv videre</button>
    <button type="button" class="btn secondary" id="q-hub">Til oversikten</button>`;
  root.querySelector('#q-again').onclick = () => startPractice(ctx, { title: P.title, ...P.filter });
  root.querySelector('#q-hub').onclick = () => { const back = P.back; practice = null; ctx.go(back); };
}

/* ---------- Skiltprøven ---------- */
const signsLearned = p => SIGN_QUESTIONS.filter(q => isLearned(p.q[q.id])).length;
const signState = e => !e ? 'ny' : isWrong(e) ? 'feil' : isLearned(e) ? 'lart' : 'ov';
const SIGN_STATE_TEXT = { ny: 'Ikke øvd ennå', feil: 'Feil sist', ov: 'Under øving', lart: 'Lært' };

export function renderSignHub(root, ctx) {
  stopTheory();
  const p = ctx.progress();
  const learned = signsLearned(p), wrong = SIGN_QUESTIONS.filter(q => isWrong(p.q[q.id])).length;
  root.innerHTML = `
    <section class="card th-hero ${learned === SIGNS.length ? 'lv-klar' : learned ? 'lv-nesten' : 'lv-start'}">
      <p class="eyebrow">Skiltprøven</p>
      <h2>Kjenn igjen skiltene</h2>
      <span class="th-bar"><span style="width:${learned / SIGNS.length * 100}%"></span></span>
      <p class="muted small">${learned} av ${SIGNS.length} skilt lært. Et skilt er lært når du har svart riktig på det ${LEARNED} ganger på rad.</p>
      <button type="button" class="btn primary" id="sg-go">${icon('quiz', 20)}Øv på skiltene</button>
      ${wrong ? `<button type="button" class="btn secondary" id="sg-wrong">${icon('repeat', 20)}Øv på feilene (${wrong})</button>` : ''}
    </section>
    <p class="muted small th-note">Trykk på et skilt for å se hva det betyr.</p>
    ${SIGN_GROUPS.map(g => {
      const list = SIGNS.filter(s => s.g === g.id);
      return `<h2 class="group-title">${esc(g.title)}</h2>
      <section class="card sg-card"><p class="muted small sg-blurb">${esc(g.blurb)}</p>
        <ul class="sg-grid">${list.map(s => { const st = signState(p.q['sk' + s.id]); return `<li><button type="button" class="sg-tile" data-sign="${s.id}" aria-label="${esc(s.name)}: ${SIGN_STATE_TEXT[st]}">
          <span class="sg-fig">${figure(s.img)}</span><span class="sg-name">${esc(s.name)}</span><span class="sg-dot ${st}" aria-hidden="true"></span></button></li>`; }).join('')}</ul>
        <button type="button" class="btn secondary sg-group-go" data-group="${g.id}">${icon('quiz', 20)}Øv på ${esc(g.title.toLowerCase())}</button>
      </section>`;
    }).join('')}
    <p class="muted small th-note">Navnene og betydningen er hentet fra skiltforskriften. Tegningene er forenklet, så de ekte skiltene kan se litt annerledes ut.</p>`;
  const go = (title, extra = {}) => startPractice(ctx, { title, pool: 'skilt', back: '#/teori/skilt', n: 10, ...extra });
  root.querySelector('#sg-go').onclick = () => go('Skiltprøven');
  const w = root.querySelector('#sg-wrong'); if (w) w.onclick = () => go('Skiltene du bommet på', { wrongOnly: true, n: 15 });
  root.querySelectorAll('.sg-group-go').forEach(b => b.onclick = () => {
    const g = SIGN_GROUPS.find(x => x.id === b.dataset.group);
    go(g.title, { ids: SIGN_QUESTIONS.filter(q => SIGNS.find(s => s.id === q.sign).g === g.id).map(q => q.id) });
  });
  root.querySelectorAll('.sg-tile').forEach(b => b.onclick = () => {
    const s = SIGNS.find(x => x.id === b.dataset.sign), st = signState(ctx.progress().q['sk' + s.id]);
    sheetDialog({
      body: `<div class="q-fig small">${figure(s.img)}</div><div class="q-head"><h2 class="q-text">${esc(s.name)}</h2>${speakBtn('sg-read').replace('<button', '<button value=""')}</div>
        <p>${esc(s.meaning)}</p><p class="muted small">${icon('book', 16)} Skiltforskriften, skilt ${s.id === '306' ? '306.0' : s.id} · ${SIGN_STATE_TEXT[st]}</p>`,
      onOpen: d => { const r = d.querySelector('#sg-read'); if (r) r.onclick = e => { e.preventDefault(); speak(`${s.name}. ${s.meaning}`); }; }
    }).then(stopSpeaking);
  });
}

/* ---------- Prøve som den ekte ---------- */
function startExam(ctx) {
  const p = ctx.progress();
  const recent = p.exams.slice(-2).flatMap(e => e.ids || []);
  const ids = buildExam(QUESTIONS, { recent });
  const e = { ids, orders: Object.fromEntries(ids.map(id => [id, optionOrder(byId.get(id))])), answers: {}, flagged: [], i: 0, startedAt: Date.now(), done: false };
  saveExam(e);
  return e;
}

export function renderExam(root, ctx) {
  const E = examInProgress();
  if (!E) { ctx.go(lastResult ? '#/teori/resultat' : '#/teori'); return; }
  stopSpeaking();
  const left = () => Math.max(0, EXAM.minutes * 60 - (Date.now() - E.startedAt) / 1000);
  const id = E.ids[E.i], q = byId.get(id), done = Object.keys(E.answers).length;
  const flagged = E.flagged.includes(id);
  root.innerHTML = `
    <div class="q-top"><span class="q-step"><strong>Oppgave ${E.i + 1} av ${E.ids.length}</strong><span class="muted small">${done} besvart</span></span>
      <span class="q-timer" id="q-timer">${icon('clock', 18)}<span>${mmss(left())}</span></span>
      <button type="button" class="icon-btn" id="q-grid-btn" aria-label="Oversikt over oppgavene" aria-expanded="false">${icon('layers', 22)}</button></div>
    <span class="th-bar q-prog"><span id="q-prog" style="width:${done / E.ids.length * 100}%"></span></span>
    <div class="q-grid" id="q-grid" hidden>${E.ids.map((x, k) => `<button type="button" class="q-cell ${E.answers[x] !== undefined ? 'done' : ''} ${k === E.i ? 'cur' : ''} ${E.flagged.includes(x) ? 'flag' : ''}" data-k="${k}" aria-label="Oppgave ${k + 1}${E.answers[x] !== undefined ? ', besvart' : ''}${E.flagged.includes(x) ? ', merket' : ''}">${k + 1}</button>`).join('')}</div>
    <section class="card q-card">
      ${q.img ? `<div class="q-fig">${figure(q.img)}</div>` : ''}
      <div class="q-head"><h2 class="q-text">${esc(q.q)}</h2>${speakBtn('q-read')}</div>
      <div class="q-opts" role="radiogroup" aria-label="Svaralternativer">${E.orders[id].map((oi, k) => `<button type="button" role="radio" aria-checked="${E.answers[id] === oi}" class="q-opt ${E.answers[id] === oi ? 'picked' : ''}" data-oi="${oi}"><span class="q-letter">${LETTERS[k]}</span><span>${esc(q.a[oi])}</span></button>`).join('')}</div>
      <button type="button" class="link q-flag ${flagged ? 'on' : ''}" id="q-flag">${icon('flag', 18)}${flagged ? 'Merket for å se på igjen' : 'Merk for å se på igjen'}</button>
    </section>
    <div class="q-dock two">
      <button type="button" class="btn secondary" id="q-prev" ${E.i ? '' : 'disabled'}>${icon('back', 20)}Forrige</button>
      ${E.i + 1 < E.ids.length ? `<button type="button" class="btn secondary" id="q-nextx">Neste${icon('chev', 20)}</button>` : `<button type="button" class="btn primary" id="q-last">Lever</button>`}
    </div>
    <button type="button" class="btn primary q-deliver" id="q-deliver">Lever prøven</button>
    <button type="button" class="link q-quit" id="q-quit">Avbryt prøven</button>`;
  const go = k => { E.i = k; saveExam(E); renderExam(root, ctx); window.scrollTo(0, 0); };
  root.querySelectorAll('.q-opt').forEach(b => b.onclick = () => {
    E.answers[id] = +b.dataset.oi; saveExam(E); ctx.vibrate(10);
    root.querySelectorAll('.q-opt').forEach(x => { const on = x === b; x.classList.toggle('picked', on); x.setAttribute('aria-checked', on); });
    root.querySelector('.q-step .muted').textContent = `${Object.keys(E.answers).length} besvart`;
    root.querySelector('#q-prog').style.width = `${Object.keys(E.answers).length / E.ids.length * 100}%`;
    const cell = root.querySelector('.q-cell.cur'); if (cell) cell.classList.add('done');
  });
  root.querySelector('#q-read').onclick = () => speak(readLine({ ...q, a: E.orders[id].map(i => q.a[i]) }));
  root.querySelector('#q-flag').onclick = () => { E.flagged = flagged ? E.flagged.filter(x => x !== id) : E.flagged.concat(id); saveExam(E); renderExam(root, ctx); };
  root.querySelector('#q-prev').onclick = () => go(E.i - 1);
  const nx = root.querySelector('#q-nextx'); if (nx) nx.onclick = () => go(E.i + 1);
  const gridBtn = root.querySelector('#q-grid-btn'), grid = root.querySelector('#q-grid');
  gridBtn.onclick = () => { grid.hidden = !grid.hidden; gridBtn.setAttribute('aria-expanded', !grid.hidden); };
  grid.querySelectorAll('.q-cell').forEach(c => c.onclick = () => go(+c.dataset.k));
  const askDeliver = async () => {
    const open = E.ids.length - Object.keys(E.answers).length, marked = E.flagged.filter(x => E.answers[x] !== undefined).length;
    const text = open ? `${open} ${open === 1 ? 'oppgave er' : 'oppgaver er'} ikke besvart, og ${open === 1 ? 'den' : 'de'} teller som feil.` : marked ? `Du har merket ${marked} ${marked === 1 ? 'oppgave' : 'oppgaver'} for å se på igjen. Du kan ikke endre svarene etterpå.` : 'Du har svart på alle oppgavene. Du kan ikke endre svarene etterpå.';
    if (await confirmDialog({ title: 'Levere prøven?', text, ok: 'Lever' })) deliver(ctx);
  };
  root.querySelector('#q-deliver').onclick = askDeliver;
  const last = root.querySelector('#q-last'); if (last) last.onclick = askDeliver;
  root.querySelector('#q-quit').onclick = async () => {
    if (!await confirmDialog({ title: 'Avbryte prøven?', text: 'Svarene på denne prøven blir ikke lagret.', ok: 'Avbryt prøven', cancel: 'Fortsett', danger: true })) return;
    saveExam(null); stopTheory(); ctx.go('#/teori');
  };
  // Klokka: tida går også når appen er lukket, som på den ekte prøven. Når den er ute, leveres prøven.
  if (examTimer) clearInterval(examTimer);
  examTimer = setInterval(() => {
    const el = document.getElementById('q-timer');
    if (!el || location.hash !== '#/teori/prove') { clearInterval(examTimer); examTimer = null; return; }
    const s = left();
    el.querySelector('span').textContent = mmss(s);
    el.classList.toggle('low', s < 300);
    if (s <= 0) { clearInterval(examTimer); examTimer = null; toast('Tida er ute. Prøven er levert.', { type: 'ok' }); deliver(ctx); }
  }, 1000);
}

function deliver(ctx) {
  const E = examInProgress();
  if (!E) return;
  const r = scoreExam(QUESTIONS, E.ids, E.answers);
  let p = ctx.progress();
  for (const id of E.ids) if (E.answers[id] !== undefined) p = answer(p, id, E.answers[id]);
  p = addExam(p, r, { sec: Math.round((Date.now() - E.startedAt) / 1000), ids: E.ids });
  ctx.save(p);
  lastResult = { ...r, answers: E.answers, ids: E.ids, sec: Math.round((Date.now() - E.startedAt) / 1000) };
  saveExam(null); stopTheory();
  ctx.vibrate(r.passed ? [20, 60, 20] : 40);
  ctx.go('#/teori/resultat');
}

export function renderExamResult(root, ctx) {
  const R = lastResult;
  if (!R) { ctx.go('#/teori'); return; }
  const wrong = R.wrong.map(id => byId.get(id));
  root.innerHTML = `
    <section class="card th-hero ${R.correct >= EXAM.solid ? 'lv-klar' : R.passed ? 'lv-nesten' : 'lv-ovelse'}">
      <p class="eyebrow">Prøve · ${mmss(Math.min(R.sec, EXAM.minutes * 60))} brukt</p>
      <h2>${R.correct >= EXAM.solid ? 'Bestått med margin' : R.passed ? 'Bestått, uten margin' : 'Ikke bestått'}</h2>
      <p class="th-score"><strong>${R.correct}</strong> av ${R.total} riktige <span class="muted">· ${EXAM.pass} kreves på den ekte prøven</span></p>
      <p>${R.correct === R.total ? 'Alt riktig!' : R.correct >= EXAM.solid ? 'Godt over grensen. Se gjennom feilene under, så du lærer av dem.' : R.passed ? `Over grensen på den ekte prøven, men sikt mot ${EXAM.solid} riktige så du har margin. Øv på feilene under.` : `Du trengte ${EXAM.pass - R.correct} riktige til. Øv på feilene, og ta en ny prøve.`}</p>
      ${R.hard && R.hard.n ? `<p class="muted small">Vanskelige oppgaver: ${R.hard.correct} av ${R.hard.n} riktige.</p>` : ''}
    </section>
    <h2 class="group-title">Per tema</h2>
    <section class="card"><div class="bars">${THEMES.filter(t => R.byTheme[t.id]).map(t => {
      const b = R.byTheme[t.id], v = Math.round(b.correct / b.n * 100);
      return `<div class="bar-row"><span class="bar-label">${esc(t.title)}</span><span class="bar"><span class="bar-fill ${v >= 90 ? 'good' : v >= 75 ? 'mid' : 'bad'}" style="width:${v}%"></span></span><span class="bar-val">${b.correct}/${b.n}</span></div>`;
    }).join('')}</div></section>
    ${wrong.length ? `<button type="button" class="btn primary" id="r-wrong">${icon('repeat', 20)}Øv på feilene fra prøven (${wrong.length})</button>` : ''}
    <button type="button" class="btn ${wrong.length ? 'secondary' : 'primary'}" id="r-new">${icon('clock', 20)}Ta en ny prøve</button>
    ${wrong.length ? `<h2 class="group-title">Det du svarte feil på</h2>
    ${wrong.map(q => {
      const a = R.answers[q.id];
      return `<details class="card r-wrong"><summary><span>${esc(q.q)}</span>${icon('chev', 18)}</summary>
        ${q.img ? `<div class="q-fig small">${figure(q.img)}</div>` : ''}
        <p class="r-ans no">${icon('close', 18)}${a === undefined ? 'Ikke besvart' : esc(q.a[a])}</p>
        <p class="r-ans ok">${icon('check', 18)}${esc(q.a[0])}</p>
        <p>${esc(q.why)}</p><p class="muted small">${icon('book', 16)} ${esc(q.ref)}</p></details>`;
    }).join('')}` : ''}
    <button type="button" class="btn secondary" id="r-hub">Til oversikten</button>`;
  const w = root.querySelector('#r-wrong');
  if (w) w.onclick = () => startPractice(ctx, { title: 'Feilene fra prøven', ids: R.wrong, n: R.wrong.length });
  root.querySelector('#r-new').onclick = () => { startExam(ctx); ctx.go('#/teori/prove'); };
  root.querySelector('#r-hub').onclick = () => ctx.go('#/teori');
}

/* ---------- Sikkerhetskontrollen ---------- */
export function renderSafetyHub(root, ctx) {
  stopSpeaking();
  const p = ctx.progress();
  const list = safetyFor(SAFETY, p.car), stats = safetyStats(SAFETY, p, p.car);
  const known = id => !!(p.safety[id] && p.safety[id].known);
  root.innerHTML = `
    <section class="card th-hero ${stats.known === stats.total ? 'lv-klar' : stats.known ? 'lv-nesten' : 'lv-start'}">
      <p class="eyebrow">Oppkjøringen</p>
      <h2>Sensor tar en stikkprøve</h2>
      <p>Før kjøringen får du noen tilfeldige oppgaver om bilen. Du skal vise hvordan du kontrollerer noe, og kunne forklare hva en feil kan skyldes og føre til. Du kan også bli bedt om å bruke førerstøttesystemene i bilen.</p>
      <p class="plan-prog"><strong>${stats.known}</strong> av ${stats.total} oppgaver kan du</p>
      <span class="goal-bar"><span style="width:${stats.total ? Math.round(stats.known / stats.total * 100) : 0}%"></span></span>
      <button type="button" class="btn primary" id="s-drill">${icon('wrench', 20)}Øv som på oppkjøringen</button>
    </section>
    <section class="card">
      <p class="sug-title">Bilen du kjører opp med</p>
      <div class="chips wrap" role="group" aria-label="Biltype">${CAR_TYPES.map(c => `<button type="button" class="chip ${p.car === c.id ? 'on' : ''}" data-car="${c.id}" aria-pressed="${p.car === c.id}">${esc(c.label)}</button>`).join('')}</div>
      <p class="muted small">${p.car ? 'Oppgavene er tilpasset biltypen.' : 'Velg biltype, så vises bare oppgavene som passer.'} Bilene er ulike: se i instruksjonsboka hvor tingene sitter i bilen dere skal kjøre opp med, og øv ved bilen.</p>
    </section>
    ${SAFETY_AREAS.map(a => {
      const items = list.filter(t => t.area === a.id);
      if (!items.length) return '';
      return `<h2 class="group-title">${icon(a.icon, 16)}${esc(a.title)}</h2><section class="card s-area">${items.map(t => `
        <details class="s-task" data-id="${t.id}"><summary><span class="s-state ${known(t.id) ? 'ok' : ''}">${known(t.id) ? icon('check', 16) : ''}</span><span>${esc(t.task)}</span>${icon('chev', 18)}</summary>
          ${t.img ? `<div class="s-lamp">${figure(t.img)}</div>` : ''}<ol class="s-how">${t.how.map(h => `<li>${esc(h)}</li>`).join('')}</ol>
          <p class="s-fault"><strong>Hvis noe er feil:</strong> ${esc(t.fault)}</p>
          <div class="btn-row"><button type="button" class="btn small-btn ${known(t.id) ? 'primary' : 'secondary'}" data-know="1">${icon('check', 18)}Kan denne</button><button type="button" class="btn small-btn secondary" data-know="0">Øv mer</button></div>
        </details>`).join('')}</section>`;
    }).join('')}`;
  root.querySelector('#s-drill').onclick = () => {
    const items = pickSafety(SAFETY, ctx.progress(), { car: ctx.progress().car, n: 5 });
    drill = { items: items.map(t => t.id), i: 0, shown: false, results: [] };
    ctx.go('#/sikkerhetskontroll/ov');
  };
  root.querySelectorAll('[data-car]').forEach(b => b.onclick = () => {
    const cur = ctx.progress();
    ctx.save({ ...cur, car: cur.car === b.dataset.car ? '' : b.dataset.car });
    renderSafetyHub(root, ctx);
  });
  root.querySelectorAll('.s-task [data-know]').forEach(b => b.onclick = () => {
    const id = b.closest('.s-task').dataset.id;
    ctx.save(markSafety(ctx.progress(), id, b.dataset.know === '1'));
    const y = window.scrollY;
    renderSafetyHub(root, ctx);
    window.scrollTo(0, y);
  });
}

export function renderSafetyDrill(root, ctx) {
  if (!drill) { ctx.go('#/sikkerhetskontroll'); return; }
  stopSpeaking();
  const D = drill, all = new Map(SAFETY.map(t => [t.id, t]));
  if (D.i >= D.items.length) {
    const ok = D.results.filter(Boolean).length;
    root.innerHTML = `
      <section class="card th-hero ${ok === D.items.length ? 'lv-klar' : 'lv-nesten'}"><p class="eyebrow">Sikkerhetskontrollen</p><h2>${ok} av ${D.items.length} kunne du</h2>
        <p>${ok === D.items.length ? 'Godt forberedt på disse.' : 'De du ikke kunne, kommer først neste gang.'}</p></section>
      <section class="card"><ul class="q-sum">${D.items.map((id, i) => `<li class="${D.results[i] ? 'ok' : 'no'}">${icon(D.results[i] ? 'check' : 'close', 18)}<span>${esc(all.get(id).task)}</span></li>`).join('')}</ul></section>
      <button type="button" class="btn primary" id="d-again">${icon('repeat', 20)}Fem nye oppgaver</button>
      <button type="button" class="btn secondary" id="d-hub">Til oversikten</button>`;
    root.querySelector('#d-again').onclick = () => { const items = pickSafety(SAFETY, ctx.progress(), { car: ctx.progress().car, n: 5 }); drill = { items: items.map(t => t.id), i: 0, shown: false, results: [] }; renderSafetyDrill(root, ctx); window.scrollTo(0, 0); };
    root.querySelector('#d-hub').onclick = () => { drill = null; ctx.go('#/sikkerhetskontroll'); };
    return;
  }
  const t = all.get(D.items[D.i]), area = SAFETY_AREAS.find(a => a.id === t.area);
  root.innerHTML = `
    <div class="q-top"><span class="q-step"><strong>Sikkerhetskontroll</strong><span class="muted small">Oppgave ${D.i + 1} av ${D.items.length}</span></span>
      <button type="button" class="icon-btn" id="d-close" aria-label="Avslutt">${icon('close', 22)}</button></div>
    <span class="th-bar q-prog"><span style="width:${(D.i + (D.shown ? 1 : 0)) / D.items.length * 100}%"></span></span>
    <section class="card q-card">
      <p class="eyebrow">${icon(area.icon, 14)} ${esc(area.title)} · sensor sier</p>
      ${t.img ? `<div class="q-fig s-lamp">${figure(t.img)}</div>` : ''}<div class="q-head"><h2 class="q-text">«${esc(t.task)}»</h2>${speakBtn('d-read')}</div>
      <p class="muted small">Gjør det ved bilen eller si høyt hvordan du gjør det. Forklar også hva en feil kan føre til.</p>
    </section>
    ${D.shown ? `<section class="card q-why">
      <p class="q-verdict">${icon('wrench', 20)}Slik gjør du det</p>
      <ol class="s-how">${t.how.map(h => `<li>${esc(h)}</li>`).join('')}</ol>
      <p class="s-fault"><strong>Hvis noe er feil:</strong> ${esc(t.fault)}</p>
    </section>
    <div class="btn-row"><button type="button" class="btn primary" id="d-yes">${icon('check', 20)}Kunne det</button><button type="button" class="btn secondary" id="d-no">Må øve mer</button></div>`
    : '<button type="button" class="btn primary" id="d-show">Vis svaret</button>'}`;
  root.querySelector('#d-close').onclick = () => { drill = null; ctx.go('#/sikkerhetskontroll'); };
  root.querySelector('#d-read').onclick = () => speak(D.shown ? `${t.task} ${t.how.join(' ')} Hvis noe er feil: ${t.fault}` : t.task);
  const show = root.querySelector('#d-show');
  if (show) show.onclick = () => { D.shown = true; renderSafetyDrill(root, ctx); };
  const mark = ok => { ctx.save(markSafety(ctx.progress(), t.id, ok)); D.results.push(ok); D.i++; D.shown = false; renderSafetyDrill(root, ctx); window.scrollTo(0, 0); };
  const yes = root.querySelector('#d-yes'), no = root.querySelector('#d-no');
  if (yes) yes.onclick = () => mark(true);
  if (no) no.onclick = () => mark(false);
}

