/* Skjermene for teori og sikkerhetskontroll (0.14.0). app.js styrer rutene og gir en kontekst:
   ctx = { progress(): fremgang, save(p), driveTags(): Promise<[{ tag, why }]>, go(hash), vibrate(ms) }.
   Rutene: #/teori (oversikt), #/teori/ov (øving), #/teori/prove (prøve), #/teori/resultat, #/sikkerhetskontroll,
   #/sikkerhetskontroll/ov. Øving og prøve holdes i minnet; en påbegynt prøve lagres også lokalt, så den overlever
   at appen lukkes. */
import { icon, speak, stopSpeaking, confirmDialog, sheetDialog, formDialog, toast } from './ui.js';
import { esc } from './format.js';
import { THEMES, QUESTIONS } from './theory-b.js';
import { SAFETY, SAFETY_AREAS, CAR_TYPES } from './safety-check.js';
import { figure, crossingMovers } from './trafficsvg.js';
import { SIGNS, SIGN_GROUPS, SIGN_QUESTIONS, SIGN_PICK_QUESTIONS, SIGN_REF } from './theory-signs.js';
import { playCrossing } from './crossanim.js';
import { CROSS_PUZZLES, MOVER_NAMES, PUZZLE_BY_SCENE, crossKey, flatOrder, checkOrder, orderText, pickCross, crossSolved } from './theory-crossings.js';
import { hasTheory, FREE_THEORY } from './plus.js';
import { planReminders } from './remind.js';
import { isDemoMode } from './db.js';

/* Påminnelse om dagens teori (0.24.0): bare i iPhone-appen, og bare med Pluss. Kalles når oversikten tegnes, når
   valget endres, når dagens mål nås og når appen startes (app.js). */
const canRemind = () => !!(typeof window !== 'undefined' && window.kjNative && window.kjNative.remindSet);
export async function syncReminders(p) {
  if (!canRemind()) return;
  try {
    const r = p && p.remind;
    if (!r || !r.on || !hasTheory()) { await window.kjNative.remindClear(); return; }
    const plan = dailyPlan(QUESTIONS, p), day = practiceDays(p, Date.now(), plan.goal);
    await window.kjNative.remindSet(planReminders({ time: r.time, today: day.today, goal: plan.goal, examDate: p.examDate }));
  } catch { /* varsler er ikke viktigere enn resten av appen */ }
}
import { EXAM, LEARNED, READY_RULE, READY_TEXT, HARD_SHARE, level, answer, isLearned, isWrong, themeStats, pickPractice, buildExam, scoreExam, theoryReady, addExam,
  optionOrder, safetyFor, pickSafety, markSafety, safetyStats, theoryBrief, practiceDays, toggleMark, readinessPercent, dailyPlan } from './theory.js';
import { BOOK, sectionFor, bookChapter, SURFACES, stopDistance, impactSpeed } from './theory-book.js';

const byId = new Map(QUESTIONS.concat(SIGN_QUESTIONS, SIGN_PICK_QUESTIONS).map(q => [q.id, q]));
const SIGN_POOL = SIGN_QUESTIONS.concat(SIGN_PICK_QUESTIONS);   // skiltprøven: hva betyr skiltet, og hvilket skilt er det (0.20.0)
/* Teorien ligger i Opplæring-fanen (0.20.0), som egen underfane */
export const THEORY_HOME = '#/opplaering/teori';
const theme = id => THEMES.find(t => t.id === id) || { title: '', icon: 'quiz' };
const LETTERS = 'ABCD';
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ---------- Tilstand ---------- */
let practice = null;   // { title, filter, items: [id], orders, i, chosen, results: [bool], back: rute å gå tilbake til }
let drill = null;      // sikkerhetskontroll: { items: [id], i, shown, results: [bool] }
let examTimer = null;
const EXAM_KEY = isDemoMode() ? 'kj-teori-prove-demo' : 'kj-teori-prove';   // demoen (0.24.0) har sin egen prøve
const loadExam = () => { try { return JSON.parse(localStorage.getItem(EXAM_KEY) || 'null'); } catch { return null; } };
const saveExam = e => { try { if (e) localStorage.setItem(EXAM_KEY, JSON.stringify(e)); else localStorage.removeItem(EXAM_KEY); } catch { /* privat modus */ } };
let lastResult = null;   // siste leverte prøve, til resultatskjermen

let player = null;     // et kryss som spilles av (0.22.0)
const stopPlayer = () => { if (player) { player.stop(); player = null; } };
export function stopTheory() { if (examTimer) { clearInterval(examTimer); examTimer = null; } stopSpeaking(); stopPlayer(); }
export const examInProgress = () => { const e = loadExam(); return e && !e.done ? e : null; };
/* Status til trafikklærersiden (teacher.js) */
export const teacherTheory = p => theoryBrief(p, { questions: QUESTIONS, signQuestions: SIGN_QUESTIONS, tasks: SAFETY });
/* Hvor tilbakeknappen fører fra en øverunde: skiltøving tilbake til skiltene */
export const practiceBack = () => (practice && practice.back) || THEORY_HOME;

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
  // Uten Pluss (0.23.0): de gratis spørsmålene, og sikkerhetskontrollen som en del av Pluss
  if (!hasTheory()) {
    const done = freeDone(p);
    return `<button type="button" class="card mini-card" id="${ids[0]}"><span class="card-title">${icon('quiz')}Teoriprøven</span><strong>${done >= FREE_THEORY.length ? `${done} av ${FREE_THEORY.length}` : '10 gratis'}</strong><span class="muted small">${done >= FREE_THEORY.length ? 'gratis spørsmål tatt' : 'spørsmål å prøve'}</span></button>
    <button type="button" class="card mini-card" id="${ids[1]}"><span class="card-title">${icon('wrench')}Sikkerhets&shy;kontroll</span><strong>${SAFETY.length} oppgaver</strong><span class="muted small">med Pluss</span></button>`;
  }
  if (t.exam) { big = `${Object.keys(t.exam.answers).length} av ${t.exam.ids.length}`; small = 'Prøve påbegynt, fortsett'; }
  else if (last) { big = `${last.correct} av ${last.total}`; small = t.ready.level === 'klar' ? 'Klar for teoriprøven' : last.passed ? 'Siste prøve bestått' : 'Siste prøve ikke bestått'; }
  else { big = `${t.learned} lært`; small = `av ${t.total} spørsmål`; }
  return `<button type="button" class="card mini-card" id="${ids[0]}"><span class="card-title">${icon('quiz')}Teoriprøven</span><strong>${esc(big)}</strong><span class="muted small">${esc(small)}</span></button>
    <button type="button" class="card mini-card" id="${ids[1]}"><span class="card-title">${icon('wrench')}Sikkerhets&shy;kontroll</span><strong>${t.safety.known} av ${t.safety.total}</strong><span class="muted small">oppgaver du kan</span></button>`;
}

const readLine = q => `${q.q} ${q.a.map((a, i) => `${LETTERS[i]}: ${a}.`).join(' ')}`;
const speakBtn = id => `<button type="button" class="icon-btn q-speak" id="${id}" aria-label="Les opp">${icon('volume', 22)}</button>`;

/* ---------- Oversikt (underfanen «Teori og sikkerhet» i Opplæring) ----------
   0.20.0: hierarki som resten av appen. Skiltkortet er teoriprøven med dagsmålet, så store snarveier med bilder,
   så det turene tyder på, så temaene.
   0.21.0 (sammenlignet med Teoritentamen): hvor klar du er i prosent, prøvedato med daglig plan, teoriboka og
   bokmerker som snarveier, og mestring i prosent per tema. */
const dayLine = d => `<span class="th-day-main">${d.today >= d.goal ? `${icon('check', 18)}<span>Dagens mål er nådd: ${d.today} svar i dag</span>`
  : `${icon('target', 18)}<span>I dag: ${d.today} av ${d.goal} spørsmål</span>`}</span>`;
const dateFmt = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' }); };
const planLine = pl => pl.daysLeft === null ? `${icon('clock', 16)}<span>Legg inn prøvedatoen og få en plan</span>`
  : pl.daysLeft < 0 ? `${icon('clock', 16)}<span>Prøvedatoen er passert. Legg inn en ny</span>`
  : `${icon('clock', 16)}<span>${pl.daysLeft === 0 ? 'Teoriprøven er i dag' : pl.daysLeft === 1 ? 'Teoriprøven er i morgen' : `Teoriprøven om ${pl.daysLeft} dager`}</span>`;
/* Ring med prosent, i skiltkortet */
const ring = pct => { const c = 2 * Math.PI * 26; return `<svg class="th-ring" viewBox="0 0 64 64" width="72" height="72" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="var(--primary)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="800" fill="#fff">${pct}<tspan font-size="11" font-weight="700">%</tspan></text></svg>`; };
export const planFor = p => dailyPlan(QUESTIONS, p);
/* ---------- Uten Pluss (0.23.0): 10 gratis spørsmål, og hva som følger med Pluss ----------
   Eieren: teorien er det store salgspunktet. Uten Pluss vises de 10 gratis spørsmålene som det ene valget (gul knapp),
   og resten av teorien som låste fliser som fører til Pluss-siden. */
const TO_PLUS = '#/pluss/teori';
const freeDone = p => FREE_THEORY.filter(id => p.q[id]).length;
function renderTheoryFree(root, ctx) {
  const p = ctx.progress(), done = freeDone(p), all = done >= FREE_THEORY.length;
  const right = FREE_THEORY.filter(id => p.q[id] && p.q[id].run > 0).length;
  const lockTile = (fig, title, sub) => `<button type="button" class="th-tile th-locked" data-plus="1">
      <span class="th-tile-fig" aria-hidden="true">${fig}</span><strong>${title}</strong><span class="muted small">${sub}</span>
      <span class="lock-tag">${icon('lock', 14)}Pluss</span></button>`;
  root.innerHTML = `
    <section class="sign-card th-sign lv-start">
      <p class="eyebrow">Teoriprøven klasse B</p>
      <h2 class="th-sign-head">${all ? `${right} av ${FREE_THEORY.length} riktige` : done ? 'Fortsett der du slapp' : 'Prøv 10 gratis spørsmål'}</h2>
      <p>${all ? `Det var de 10 gratis spørsmålene. Med Pluss får du alle ${QUESTIONS.length}, prøver som den ekte og hele teoriboka.` : 'Ti av de beste spørsmålene i appen, med tegninger, kryss som spilles av og forklaring etter hvert svar.'}</p>
      ${done && !all ? `<span class="th-bar"><span style="width:${done / FREE_THEORY.length * 100}%"></span></span><p class="th-exam-meta">${done} av ${FREE_THEORY.length} tatt</p>` : ''}
      <button type="button" class="btn primary" id="th-free">${icon('quiz', 20)}${all ? 'Se hva du får med Pluss' : done ? 'Fortsett de gratis spørsmålene' : 'Prøv 10 gratis spørsmål'}</button>
      ${all ? `<button type="button" class="btn secondary" id="th-free-again">${icon('repeat', 20)}Ta de 10 igjen</button>` : ''}
    </section>
    <h2 class="group-title">Med Pluss</h2>
    <div class="th-tiles">
      ${lockTile(`<span class="th-tile-ico">${icon('clock', 30)}</span>`, 'Prøve som den ekte', '45 oppgaver og 90 minutter, litt vanskeligere enn den ekte')}
      ${lockTile(`<span class="th-tile-ico th-ico-book">${icon('book', 30)}</span>`, 'Teoriboka', 'Reglene tema for tema, med tegninger')}
      ${lockTile(figure('scene:kryss-tre'), 'Hvem kjører først?', `${CROSS_PUZZLES.length} kryss som spilles av`)}
      ${lockTile(`<span class="th-mini-signs">${['sign:202', 'sign:362:80', 'sign:146'].map(figure).join('')}</span>`, 'Skiltprøven', `Alle ${SIGNS.length} skiltene, og skiltkort`)}
      ${lockTile(figure('lamp:abs'), 'Sikkerhets&shy;kontrollen', `Alle ${SAFETY.length} oppgavene fra oppkjøringen`)}
      ${lockTile(`<span class="th-tile-ico">${icon('repeat', 30)}</span>`, 'Øv på feilene', 'Det du bommet på, kommer igjen')}
    </div>
    <section class="card th-plus-card">
      <h2 class="card-title">${icon('check')}Alt i teorien med Pluss</h2>
      <ul class="th-why"><li>${QUESTIONS.length} spørsmål i de sju temaene på prøven</li><li>Hvor klar du er i prosent, og en plan fram til prøvedatoen</li><li>Ett kjøp, ikke abonnement, for hele familien</li></ul>
      <button type="button" class="btn secondary" id="th-to-plus">Se Pluss</button>
    </section>
    <p class="muted small th-note">Spørsmålene er appens egne, skrevet ut fra vegtrafikkloven, trafikkreglene og skiltforskriften. Den ekte prøven har andre spørsmål, men de samme temaene.</p>`;
  const free = () => startPractice(ctx, { title: 'Gratis spørsmål', ids: FREE_THEORY, n: FREE_THEORY.length, pool: 'alle', free: true });
  root.querySelector('#th-free').onclick = () => (all ? ctx.go(TO_PLUS) : free());
  const again = root.querySelector('#th-free-again'); if (again) again.onclick = free;
  root.querySelectorAll('[data-plus], #th-to-plus').forEach(b => b.onclick = () => ctx.go(TO_PLUS));
}

export async function renderTheoryHub(root, ctx) {
  stopTheory();
  if (!hasTheory()) { renderTheoryFree(root, ctx); return; }
  const p = ctx.progress();
  const sum = theorySummary(p);
  const st = themeStats(QUESTIONS, p, THEMES);
  const exams = p.exams.slice(-10);
  const ongoing = sum.exam, plan = planFor(p), day = practiceDays(p, Date.now(), plan.goal);
  const rd = readinessPercent(QUESTIONS, p, THEMES);
  const head = { start: 'Øv deg til teoriprøven', ovelse: 'Øv videre', nesten: 'Nesten klar', klar: 'Klar for teoriprøven' }[sum.ready.level];
  const signsOk = signsLearned(p), wrongN = sum.wrong, marks = (p.marks || []).filter(id => byId.has(id)).length;
  const tile = (id, fig, title, sub, pct, disabled = false) => `<button type="button" class="th-tile" id="${id}" ${disabled ? 'disabled' : ''}>
      <span class="th-tile-fig" aria-hidden="true">${fig}</span><strong>${title}</strong><span class="muted small">${sub}</span>
      ${pct === null ? '' : `<span class="th-bar"><span style="width:${pct}%"></span></span>`}</button>`;
  root.innerHTML = `
    <section class="sign-card th-sign lv-${sum.ready.level}">
      <div class="th-sign-top">
        <div><p class="eyebrow">Teoriprøven klasse B</p><h2 class="th-sign-head">${esc(head)}</h2></div>
        <div class="th-ready-pct" role="img" aria-label="${rd.percent} prosent klar for teoriprøven">${ring(rd.percent)}<span>klar</span></div>
      </div>
      <p class="th-day">${dayLine(day)}${day.streak > 1 ? `<span class="th-streak">${icon('flame', 18)}${day.streak} dager på rad</span>` : ''}</p>
      <span class="goal-bar th-day-bar"><span style="width:${Math.min(100, day.today / day.goal * 100)}%"></span></span>
      <button type="button" class="th-date" id="th-date">${planLine(plan)}${plan.daysLeft !== null && plan.daysLeft >= 0 ? `<span class="th-date-d">${esc(dateFmt(p.examDate))}</span>` : ''}${icon('chev', 16)}</button>
      ${canRemind() ? `<button type="button" class="th-date" id="th-remind">${icon('bell', 16)}<span>${p.remind && p.remind.on ? `Påminnelse hver dag kl. ${esc(p.remind.time.replace(':', '.'))}` : 'Få en påminnelse hver dag'}</span>${icon('chev', 16)}</button>` : ''}
      ${exams.length ? `<div class="th-dots" aria-label="De siste prøvene">${exams.map(e => `<span class="th-dot ${e.correct >= EXAM.solid ? 'ok' : e.passed ? 'mid' : 'no'}" title="${e.correct} av ${e.total}">${e.correct}</span>`).join('')}</div>` : ''}
      <p class="th-ready">${esc(READY_TEXT[sum.ready.level])}</p>
      <button type="button" class="btn primary" id="th-exam">${icon('clock', 20)}${ongoing ? 'Fortsett prøven' : 'Ta en prøve'}</button>
      <p class="th-exam-meta">${ongoing ? `${Object.keys(ongoing.answers).length} av ${ongoing.ids.length} oppgaver besvart` : `${EXAM.n} oppgaver · ${EXAM.minutes} minutter · ${EXAM.pass} riktige for å bestå`}</p>
    </section>
    <h2 class="group-title">Øv nå</h2>
    <div class="th-tiles">
      ${tile('th-mix', figure('scene:rundkjoring'), 'Rask øving', '10 blandede spørsmål', null)}
      ${tile('th-to-book', `<span class="th-tile-ico th-ico-book">${icon('book', 30)}</span>`, 'Teoriboka', 'Les reglene, tema for tema', null)}
      <button type="button" class="th-tile th-tile-wide" id="th-cross">
        <span class="th-tile-fig" aria-hidden="true">${figure('scene:kryss-tre')}</span>
        <span class="th-wide-txt"><strong>Hvem kjører først?</strong><span class="muted small">Trykk på bilene i riktig rekkefølge, og se krysset spilles av.</span>
          <span class="muted small">${crossSolved(p)} av ${CROSS_PUZZLES.length} kryss riktig sist</span><span class="th-bar"><span style="width:${Math.round(crossSolved(p) / CROSS_PUZZLES.length * 100)}%"></span></span></span></button>
      ${tile('th-to-signs', `<span class="th-mini-signs">${['sign:202', 'sign:362:80', 'sign:146'].map(figure).join('')}</span>`, 'Skiltprøven', `${signsOk} av ${SIGNS.length} skilt lært`, Math.round(signsOk / SIGNS.length * 100))}
      ${tile('th-to-safety', figure('lamp:abs'), 'Sikkerhets&shy;kontrollen', `${sum.safety.known} av ${sum.safety.total} oppgaver kan du`, sum.safety.total ? Math.round(sum.safety.known / sum.safety.total * 100) : 0)}
      ${tile('th-wrong', `<span class="th-tile-ico">${icon('repeat', 30)}</span>`, 'Øv på feilene', wrongN ? `${wrongN} spørsmål å rette opp` : 'Ingen feil å øve på nå', null, !wrongN)}
      ${tile('th-marks', `<span class="th-tile-ico th-ico-mark">${icon('star', 30)}</span>`, 'Bokmerker', marks ? `${marks} spørsmål du har merket` : 'Merk spørsmål med stjernen', null, !marks)}
    </div>
    <section class="card th-drive" id="th-drive" hidden></section>
    <h2 class="group-title">Temaene på prøven</h2>
    <p class="muted small th-note th-note-top">Prosenten viser hvor godt du kan temaet: lærte spørsmål teller fullt, riktige sist teller halvt.</p>
    <section class="card th-themes"><ul class="th-list">${THEMES.map(t => {
      const s = st[t.id], pct = rd.byTheme[t.id] || 0;
      return `<li><button type="button" class="th-theme" data-theme="${t.id}">
        <span class="th-ico th-ico-${t.id}">${icon(t.icon, 22)}</span>
        <span class="th-tt"><span class="th-tt-head"><strong>${esc(t.title)}</strong><span class="th-pct ${pct >= 80 ? 'ok' : pct >= 40 ? 'mid' : ''}">${pct} %</span></span><span class="muted small">${esc(t.blurb)}</span>
          <span class="th-bar"><span style="width:${pct}%"></span></span><span class="muted small">${s.learned} av ${s.total} lært${s.seen ? ` · ${Math.round(s.right / Math.max(1, s.answers) * 100)} % riktige svar` : ''}</span></span>
        ${icon('chev', 18)}</button></li>`;
    }).join('')}</ul></section>
    <p class="muted small th-note">Prøven her er laget litt vanskeligere enn den ekte: minst ${Math.round(HARD_SHARE * 10)} av 10 oppgaver er vanskelige, og du bør ha ${EXAM.solid} riktige, ikke ${EXAM.pass}, før du regner deg som klar. ${exams.length ? `Prikkene viser de siste prøvene: grønn er ${EXAM.solid} eller mer. ` : ''}Prosenten «klar» veier temaene som på prøven, og de siste prøvene teller halvparten. Et spørsmål er lært når du har svart riktig på det ${LEARNED} ganger på rad. Spørsmålene er appens egne, skrevet ut fra vegtrafikkloven, trafikkreglene og skiltforskriften. Den ekte prøven har andre spørsmål, men de samme temaene.</p>
    ${Object.keys(p.q).length || p.exams.length ? '<button type="button" class="link th-reset" id="th-reset">Begynn på nytt</button>' : ''}`;
  root.querySelector('#th-exam').onclick = () => { if (!examInProgress()) startExam(ctx); ctx.go('#/teori/prove'); };
  root.querySelector('#th-wrong').onclick = () => startPractice(ctx, { title: 'Feilene dine', wrongOnly: true, n: 15 });
  root.querySelector('#th-mix').onclick = () => startPractice(ctx, { title: 'Rask øving', n: 10 });
  root.querySelector('#th-to-book').onclick = () => ctx.go('#/teori/bok');
  root.querySelector('#th-cross').onclick = () => startCross(ctx);
  root.querySelector('#th-marks').onclick = () => { const ids = (ctx.progress().marks || []).filter(id => byId.has(id)); if (ids.length) startPractice(ctx, { title: 'Bokmerker', ids, n: ids.length, pool: ids.some(id => byId.get(id).sign) ? 'alle' : 'teori' }); };
  root.querySelector('#th-to-safety').onclick = () => ctx.go('#/sikkerhetskontroll');
  root.querySelector('#th-to-signs').onclick = () => ctx.go('#/teori/skilt');
  root.querySelector('#th-date').onclick = async () => {
    const cur = ctx.progress();
    const v = await formDialog({ title: 'Når har du teoriprøven?', text: 'Appen fordeler spørsmålene du ikke har lært ennå på dagene som er igjen, og setter dagens mål etter det. Du kan endre datoen når du vil.',
      body: `<label class="field"><span>Dato for teoriprøven</span><input type="date" class="sheet-input" id="th-date-in" value="${esc(cur.examDate || '')}"></label>${cur.examDate ? '<label class="toggle-row"><input type="checkbox" id="th-date-clear"> Fjern datoen</label>' : ''}`,
      read: d => (d.querySelector('#th-date-clear') && d.querySelector('#th-date-clear').checked ? '' : d.querySelector('#th-date-in').value || '') });
    if (v === null) return;
    ctx.save({ ...ctx.progress(), examDate: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '' });
    renderTheoryHub(root, ctx);
  };
  const rem = root.querySelector('#th-remind');
  if (rem) rem.onclick = async () => {
    const cur = ctx.progress().remind || { on: false, time: '18:00' };
    const v = await formDialog({ title: 'Påminnelse om dagens teori', text: 'Telefonen minner deg på dagens spørsmål til et fast klokkeslett. Har du nådd dagens mål, kommer det ingen påminnelse den dagen. Med prøvedato sier den hvor mange dager det er igjen.',
      body: `<label class="toggle-row"><input type="checkbox" id="th-rem-on" ${cur.on ? 'checked' : ''}> Påminnelse hver dag</label><label class="field"><span>Klokkeslett</span><input type="time" class="sheet-input" id="th-rem-time" value="${esc(cur.time)}"></label>`,
      read: d => ({ on: d.querySelector('#th-rem-on').checked, time: d.querySelector('#th-rem-time').value || '18:00' }) });
    if (v === null) return;
    let on = v.on;
    if (on) {
      const a = await window.kjNative.remindAuth().catch(() => null);
      if (!a || !a.granted) { on = false; toast('Varsler er slått av for Kjørerapport. Slå dem på under Innstillinger › Varslinger på iPhonen.', { ms: 6000 }); }
    }
    ctx.save({ ...ctx.progress(), remind: { on, time: v.time } });
    await syncReminders(ctx.progress());
    if (on) toast(`Påminnelse hver dag kl. ${v.time.replace(':', '.')}.`, { type: 'ok' });
    renderTheoryHub(root, ctx);
  };
  syncReminders(p);
  root.querySelectorAll('.th-theme').forEach(b => b.onclick = () => startPractice(ctx, { title: theme(b.dataset.theme).title, theme: b.dataset.theme, n: 10 }));
  const reset = root.querySelector('#th-reset');
  if (reset) reset.onclick = async () => {
    if (!await confirmDialog({ title: 'Begynne på nytt?', text: 'Svarene og prøvene dine slettes, så alle spørsmål blir nye igjen. Sikkerhetskontrollen, bokmerkene og prøvedatoen beholdes.', ok: 'Begynn på nytt', danger: true })) return;
    const cur = ctx.progress();
    ctx.save({ ...cur, q: {}, exams: [], days: {} }); saveExam(null);
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
function startPractice(ctx, { title, n = 10, pool = 'teori', back = THEORY_HOME, ...filter }) {
  // De gratis spørsmålene (0.23.0) kommer alltid i samme rekkefølge, det beste først
  const items = filter.free ? FREE_THEORY.map(id => byId.get(id)).filter(Boolean)
    : pickPractice(pool === 'skilt' ? SIGN_POOL : pool === 'alle' ? QUESTIONS.concat(SIGN_POOL) : QUESTIONS, ctx.progress(), { n, ...filter });
  if (!items.length) { toast('Ingen spørsmål å øve på her akkurat nå.', { type: 'ok' }); return; }
  practice = { title, back, filter: { n, pool, back, ...filter }, items: items.map(q => q.id), orders: Object.fromEntries(items.map(q => [q.id, optionOrder(q)])), i: 0, chosen: null, results: [] };
  ctx.go('#/teori/ov');
}

export function renderPractice(root, ctx) {
  if (!practice) { ctx.go(THEORY_HOME); return; }
  if (!hasTheory() && !practice.filter.free) { practice = null; ctx.go(TO_PLUS); return; }   // øving utenom de gratis krever Pluss
  stopSpeaking(); stopPlayer();
  const P = practice;
  if (P.i >= P.items.length) return renderPracticeDone(root, ctx);
  const q = byId.get(P.items[P.i]), t = theme(q.t), answered = P.chosen !== null, right = P.chosen === 0;
  const marked = (ctx.progress().marks || []).includes(q.id), more = sectionFor(q.id);
  const [rule, rest] = splitRule(q.why);
  const pct = (P.i + (answered ? 1 : 0)) / P.items.length * 100, from = P.shown === undefined ? pct : P.shown;
  const combo = right ? runEnd(P.results) : 0;
  const play = [q.img, q.wimg].map(k => String(k || '').replace(/^scene:/, '')).find(k => PUZZLE_BY_SCENE.has(k));
  root.innerHTML = `
    <div class="q-top"><span class="q-step"><strong>${esc(P.title)}</strong><span class="muted small">${P.i + 1} av ${P.items.length}</span></span>
      <button type="button" class="icon-btn q-bm ${marked ? 'on' : ''}" id="q-bm" aria-pressed="${marked}" aria-label="${marked ? 'Fjern bokmerket' : 'Bokmerk spørsmålet'}">${icon('star', 22)}</button>
      <button type="button" class="icon-btn" id="q-close" aria-label="Avslutt øvingen">${icon('close', 22)}</button></div>
    <span class="th-bar q-prog"><span id="q-prog-fill" style="width:${from}%"></span></span>
    <section class="card q-card ${answered ? '' : 'q-enter'}">
      <p class="eyebrow">${esc(q.eyebrow || t.title)}${level(q) >= 3 ? ' <span class="q-hard">Vanskelig</span>' : ''}</p>
      ${q.img ? `<div class="q-fig q-zoom" role="button" tabindex="0" aria-label="Vis tegningen større" data-fig="${esc(q.img)}">${figure(q.img)}</div>` : ''}
      <div class="q-head"><h2 class="q-text">${esc(q.q)}</h2>${speakBtn('q-read')}</div>
      <div class="q-opts ${q.pick ? 'q-pick' : ''}" role="group" aria-label="Svaralternativer">${P.orders[q.id].map((oi, k) => {
        const cls = !answered ? '' : oi === 0 ? 'right' : oi === P.chosen ? 'wrong' : 'dim';
        const mark = answered && oi === 0 ? icon('check', 20, 'q-mark') : answered && oi === P.chosen ? icon('close', 20, 'q-mark') : '';
        // Bildesvar (0.20.0): skiltet er svaret. Etter svaret står navnet under, så du lærer også de andre skiltene.
        if (q.pick) return `<button type="button" class="q-opt q-opt-pic ${cls}" data-oi="${oi}" ${answered ? 'disabled' : ''} aria-label="Skilt ${LETTERS[k]}${answered ? `: ${esc(q.a[oi])}` : ''}"><span class="q-letter">${LETTERS[k]}</span><span class="q-pic">${figure(q.imgs[oi])}</span>${answered ? `<span class="q-pic-name">${esc(q.a[oi])}</span>` : ''}${mark}</button>`;
        return `<button type="button" class="q-opt ${cls}" data-oi="${oi}" ${answered ? 'disabled' : ''}><span class="q-letter">${LETTERS[k]}</span><span>${esc(q.a[oi])}</span>${mark}</button>`;
      }).join('')}</div>
    </section>
    ${answered ? `<section class="card q-why ${right ? 'ok' : 'no'}" aria-live="polite">
      <p class="q-verdict"><span class="q-verdict-ico">${icon(right ? 'check' : 'close', 22)}</span>${right ? 'Riktig!' : 'Ikke riktig'}${combo >= 3 ? `<span class="q-combo">${icon('flame', 16)}${combo} på rad</span>` : ''}</p>
      ${q.wimg && !play ? `<div class="q-fig q-wfig q-zoom" role="button" tabindex="0" aria-label="Vis tegningen større" data-fig="${esc(q.wimg)}">${figure(q.wimg)}</div>` : ''}
      ${play ? `<div class="cx-player"><button type="button" class="btn secondary cx-playbtn" data-play="${play}">${icon('play', 20)}Se hvem som kjører først</button></div>` : ''}
      <p class="q-rule">${esc(rule)}</p>${rest ? `<p>${esc(rest)}</p>` : ''}
      <p class="muted small">${icon('book', 16)} ${esc(q.ref)}</p>
      ${more ? `<button type="button" class="link q-more" id="q-more">${icon('book', 18)}<span>Les mer i teoriboka: ${esc(bookSection(more).title)}</span>${icon('chev', 16)}</button>` : ''}
    </section>
    <div class="q-dock"><button type="button" class="btn primary" id="q-next">${P.i + 1 < P.items.length ? 'Neste spørsmål' : 'Se hvordan det gikk'}${icon('chev', 20)}</button></div>` : ''}`;
  root.querySelector('#q-close').onclick = () => { const back = P.back; practice = null; ctx.go(back); };
  root.querySelector('#q-read').onclick = () => speak(answered ? `${q.q} Riktig svar: ${q.a[0]}. ${q.why}` : q.pick ? q.q : readLine({ ...q, a: P.orders[q.id].map(i => q.a[i]) }));
  root.querySelectorAll('.q-opt').forEach(b => b.onclick = () => {
    if (P.chosen !== null) return;
    P.chosen = +b.dataset.oi;
    P.results.push(P.chosen === 0);
    const goal = planFor(ctx.progress()).goal, before = practiceDays(ctx.progress(), Date.now(), goal).today;
    ctx.save(answer(ctx.progress(), q.id, P.chosen));
    ctx.vibrate(P.chosen === 0 ? 15 : [30, 40, 30]);
    // Dagsmålet nådd akkurat nå: litt feiring, som i andre øvingsapper (0.20.0)
    const d = practiceDays(ctx.progress(), Date.now(), goal);
    if (before < d.goal && d.today >= d.goal) { toast(`Dagens mål er nådd: ${d.goal} spørsmål!`, { type: 'ok' }); if (ctx.celebrate) setTimeout(ctx.celebrate, 300); syncReminders(ctx.progress()); }
    renderPractice(root, ctx);
    const w = root.querySelector('.q-why'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  const next = root.querySelector('#q-next');
  if (next) next.onclick = () => { P.i++; P.chosen = null; renderPractice(root, ctx); window.scrollTo(0, 0); };
  // Bokmerke (0.21.0): stjernen lagrer spørsmålet, så du kan øve på det igjen fra oversikten
  root.querySelector('#q-bm').onclick = () => {
    ctx.save(toggleMark(ctx.progress(), q.id));
    const on = (ctx.progress().marks || []).includes(q.id), btn = root.querySelector('#q-bm');
    btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); btn.setAttribute('aria-label', on ? 'Fjern bokmerket' : 'Bokmerk spørsmålet');
    toast(on ? 'Lagt til i bokmerkene.' : 'Fjernet fra bokmerkene.', { type: 'ok' });
  };
  const moreBtn = root.querySelector('#q-more');
  if (moreBtn) moreBtn.onclick = () => ctx.go(`#/teori/bok/${more.chapter}/${more.section}`);   // øvingen står der du var når du kommer tilbake
  wireZoom(root);
  wirePlayers(root);
  // Framdriften glir fram fra der den var (0.22.0)
  const fill = root.querySelector('#q-prog-fill');
  if (fill && from !== pct) requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct + '%'; }));
  P.shown = pct;
}
/* Antall riktige på rad på slutten av runden */
const runEnd = rs => { let n = 0; for (let i = rs.length - 1; i >= 0 && rs[i]; i--) n++; return n; };

/* «Se hvem som kjører først»: spiller av krysset i øvingen og i teoriboka (0.22.0). Knappen står i en .cx-player;
   har den ingen tegning fra før, legges en inn over knappen. */
function wirePlayers(root) {
  root.querySelectorAll('[data-play]').forEach(btn => btn.onclick = () => {
    const pz = PUZZLE_BY_SCENE.get(btn.dataset.play), box = btn.closest('.cx-player');
    if (!pz || !box) return;
    if (!box.querySelector('.cx-fig')) box.insertAdjacentHTML('afterbegin', `<div class="q-fig cx-fig">${figure('scene:' + pz.scene)}</div>`);
    if (!box.querySelector('.cx-cap')) box.querySelector('.cx-fig').insertAdjacentHTML('afterend', '<p class="cx-cap" aria-live="polite"></p>');
    const cap = box.querySelector('.cx-cap');
    btn.innerHTML = `${icon('repeat', 20)}Spill av igjen`;
    stopPlayer();
    player = playCrossing(box.querySelector('.cx-fig svg'), pz.order, {
      onStep: i => { cap.textContent = i < pz.steps.length ? `${i + 1}. ${pz.steps[i]}` : `Rekkefølgen: ${orderText(flatOrder(pz))}.`; }
    });
  });
}

/* Den første setningen i forklaringen er regelen: den uthevet, resten under (0.21.0) */
function splitRule(text) {
  const m = String(text).match(/^(.+?[.!?])\s+(?=[A-ZÆØÅ«0-9])/);
  return m ? [m[1], text.slice(m[0].length)] : [text, ''];
}
/* Trykk på en tegning: vis den stor i et ark (0.21.0) */
function wireZoom(root) {
  root.querySelectorAll('.q-zoom').forEach(el => {
    const open = () => sheetDialog({ body: `<div class="q-fig q-fig-big">${figure(el.dataset.fig)}</div>` });
    el.onclick = open;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
}

function renderPracticeDone(root, ctx) {
  const P = practice, ok = P.results.filter(Boolean).length, day = practiceDays(ctx.progress(), Date.now(), planFor(ctx.progress()).goal);
  const sumFig = q => (q.sign ? `<span class="q-sum-sign">${figure(q.pick ? q.imgs[0] : q.img)}</span>` : '');
  root.innerHTML = `
    <section class="sign-card th-sign ${ok === P.items.length ? 'lv-klar' : ok >= P.items.length * 0.85 ? 'lv-nesten' : 'lv-ovelse'}">
      <p class="eyebrow">${esc(P.title)}</p>
      <h2 class="th-sign-head">${ok} av ${P.items.length} riktige</h2>
      <p>${ok === P.items.length ? 'Alt riktig. Bra jobbet!' : P.filter.free && !hasTheory() ? 'Forklaringen står ved hvert spørsmål når du tar dem igjen.' : 'Spørsmålene du svarte feil på, kommer igjen neste gang du øver.'}</p>
      ${P.filter.free && !hasTheory() ? '' : `<p class="th-day">${dayLine(day)}${day.streak > 1 ? `<span class="th-streak">${icon('flame', 18)}${day.streak} dager på rad</span>` : ''}</p>
      <span class="goal-bar th-day-bar"><span style="width:${Math.min(100, day.today / day.goal * 100)}%"></span></span>`}
    </section>
    <section class="card"><ul class="q-sum">${P.items.map((id, i) => `<li class="${P.results[i] ? 'ok' : 'no'}">${icon(P.results[i] ? 'check' : 'close', 18)}${sumFig(byId.get(id))}<span>${esc(byId.get(id).label || byId.get(id).q)}</span></li>`).join('')}</ul></section>
    ${P.filter.free && !hasTheory() ? `<section class="card th-plus-card"><h2 class="card-title">${icon('check')}Det var de 10 gratis</h2>
      <p>Med Pluss får du alle ${QUESTIONS.length} spørsmålene, prøver som den ekte, teoriboka, skiltprøven og sikkerhetskontrollen. Ett kjøp, for hele familien.</p></section>
    <button type="button" class="btn primary" id="q-plus">Se Pluss</button>
    <button type="button" class="btn secondary" id="q-again">${icon('repeat', 20)}Ta de 10 igjen</button>`
    : `<button type="button" class="btn primary" id="q-again">${icon('repeat', 20)}Øv videre</button>`}
    <button type="button" class="btn secondary" id="q-hub">Til oversikten</button>`;
  if (ok === P.items.length && P.items.length >= 5 && ctx.celebrate) setTimeout(ctx.celebrate, 300);
  const qp = root.querySelector('#q-plus'); if (qp) qp.onclick = () => { practice = null; ctx.go(TO_PLUS); };
  root.querySelector('#q-again').onclick = () => startPractice(ctx, { title: P.title, ...P.filter });
  root.querySelector('#q-hub').onclick = () => { const back = P.back; practice = null; ctx.go(back); };
}

/* ---------- Teoriboka (0.21.0) ----------
   Kort lesestoff per tema (theory-book.js), som teorikurset hos andre øvingstjenester. «Les mer» etter et svar går
   rett til delen spørsmålet hører til, og hver del har en knapp for å øve på akkurat de spørsmålene. */
const bookSection = ({ chapter, section }) => ((bookChapter(chapter) || { sections: [] }).sections.find(x => x.id === section)) || { title: '' };
export const bookTitle = path => { const ch = bookChapter(String(path || '').split('/')[0]); return ch ? theme(ch.id).title : 'Teoriboka'; };
const calcHtml = () => `<div class="bk-calc" id="bk-calc">
    <h3 class="bk-calc-title">${icon('speed', 20)}Regn ut stopplengden</h3>
    <label class="field bk-calc-speed"><span>Fart: <strong id="calc-v">80</strong> km/t</span><input type="range" min="30" max="120" step="10" value="80" id="calc-speed" aria-label="Fart i km/t"></label>
    <div class="segment calc-seg" role="radiogroup" aria-label="Føre">${SURFACES.map((f, i) => `<label><input type="radio" name="calc-f" value="${f.id}" ${i === 0 ? 'checked' : ''}><span>${esc(f.label)}</span></label>`).join('')}</div>
    <div id="calc-out" aria-live="polite"></div>
    <div class="sim" id="sim">
      <p class="sim-q"><strong>Et barn springer ut i veien.</strong> Barnet står der du ville stanset fra 50 km/t på samme føre. Rekker du å stanse?</p>
      <div class="sim-fig" id="sim-fig"></div>
      <button type="button" class="btn secondary" id="sim-play">${icon('play', 20)}Spill av</button>
      <p class="sim-res" id="sim-res" aria-live="polite"></p>
    </div>
    <p class="muted small">Omtrentlige tall: reaksjonstid 1 sekund og vanlige friksjonstall for føret. Den virkelige bremselengden varierer med dekk, bil, vei og hvor hardt du bremser.</p>
  </div>`;
/* Stopplengden spilt av (0.22.0): bilen kjører i reaksjonstida (grått), bremser (rødt) og stanser, eller treffer
   barnet. Tida går som i virkeligheten, men korter ned når hele forløpet ville tatt mer enn 4 sekunder (glatt føre). */
const G = 9.81;
function simSvg(kmh, mu) {
  const d = stopDistance(kmh, mu), kid = stopDistance(50, mu).total, span = Math.max(d.total, kid) * 1.1, k = 250 / span, x0 = 36;
  return { k, x0, d, kid, svg: `<svg viewBox="0 0 300 88" class="sim-svg" role="img" aria-label="Veien foran bilen, med barnet ${Math.round(kid)} meter fram">
    <rect x="0" y="28" width="300" height="40" rx="6" fill="#5a6066"/><line x1="0" y1="31" x2="300" y2="31" stroke="#f4f4f4" stroke-width="1.4"/><line x1="0" y1="65" x2="300" y2="65" stroke="#f4f4f4" stroke-width="1.4"/>
    <rect id="sim-r" x="${x0}" y="44" width="0" height="8" rx="3" fill="#aab2ba"/><rect id="sim-b" x="${x0}" y="44" width="0" height="8" rx="3" fill="#e2563f"/>
    <g transform="translate(${(x0 + kid * k).toFixed(1)} 48)"><line class="sim-ink-l" x1="0" y1="-32" x2="0" y2="-22" stroke-width="1.2" stroke-dasharray="2 2"/>
      <text class="sim-ink" y="-36" text-anchor="middle" font-size="12" font-weight="800">${Math.round(kid)} m</text>
      <g transform="scale(1.45)"><circle cy="-8" r="3.4" fill="#f5c518"/><path d="M0 -4 V5 M0 5 L-3 11 M0 5 L3 11 M-4.5 -1 L0 -3 L4.5 0" stroke="#f5c518" stroke-width="2.6" stroke-linecap="round" fill="none"/></g></g>
    <g id="sim-car" transform="translate(${x0} 48)"><rect x="-32" y="-10" width="32" height="20" rx="6" fill="#2e7dd1" stroke="rgba(0,0,0,.4)"/><rect x="-12" y="-7.5" width="6" height="15" rx="2" fill="#dbe9f5"/><rect x="-2.5" y="-8" width="2.5" height="3.5" rx=".8" fill="#fff4bf"/><rect x="-2.5" y="4.5" width="2.5" height="3.5" rx=".8" fill="#fff4bf"/></g>
    <g id="sim-hit" opacity="0"><circle cx="${(x0 + kid * k).toFixed(1)}" cy="48" r="17" fill="none" stroke="#e2563f" stroke-width="3.5"/></g>
  </svg>` };
}
let simRaf = 0;
function wireCalc(root) {
  const el = root.querySelector('#bk-calc');
  if (!el) return;
  const read = () => ({ v: +el.querySelector('#calc-speed').value, f: SURFACES.find(x => x.id === el.querySelector('input[name=calc-f]:checked').value) });
  let sim = null;
  const draw = () => {
    cancelAnimationFrame(simRaf);
    const { v, f } = read();
    const d = stopDistance(v, f.mu), max = stopDistance(120, f.mu).total;
    el.querySelector('#calc-v').textContent = v;
    el.querySelector('#calc-out').innerHTML = `<div class="calc-bar"><span class="calc-r" style="width:${d.reaction / max * 100}%"></span><span class="calc-b" style="width:${d.braking / max * 100}%"></span></div>
      <dl class="calc-nums"><div><dt>Reaksjon</dt><dd>${Math.round(d.reaction)} m</dd></div><div><dt>Bremsing</dt><dd>${Math.round(d.braking)} m</dd></div><div class="calc-sum"><dt>Stopplengde</dt><dd>${Math.round(d.total)} m</dd></div></dl>`;
    sim = simSvg(v, f.mu);
    el.querySelector('#sim-fig').innerHTML = sim.svg;
    el.querySelector('#sim-res').textContent = '';
    el.querySelector('#sim-res').className = 'sim-res';
  };
  const play = () => {
    draw();
    const { v, f } = read(), vm = v / 3.6, a = f.mu * G, tb = vm / a, T = 1 + tb, scale = Math.min(1, 4 / T);
    const hit = sim.d.total > sim.kid + 0.5, end = hit ? sim.kid : sim.d.total;
    const car = el.querySelector('#sim-car'), r = el.querySelector('#sim-r'), b = el.querySelector('#sim-b');
    const pos = t => (t <= 1 ? vm * t : Math.min(sim.d.total, vm + vm * (t - 1) - a * (t - 1) ** 2 / 2));
    const show = s => {
      const x = sim.x0 + s * sim.k;
      car.setAttribute('transform', `translate(${x.toFixed(1)} 48)`);
      const rx = Math.min(s, sim.d.reaction) * sim.k;
      r.setAttribute('width', rx.toFixed(1));
      b.setAttribute('x', (sim.x0 + rx).toFixed(1)); b.setAttribute('width', Math.max(0, (s - sim.d.reaction) * sim.k).toFixed(1));
    };
    const finish = () => {
      show(end);
      const res = el.querySelector('#sim-res'), gap = sim.kid - sim.d.total;
      if (hit) { el.querySelector('#sim-hit').setAttribute('opacity', '1'); res.className = 'sim-res no'; res.textContent = `Du treffer barnet i ${Math.round(impactSpeed(v, f.mu, sim.kid))} km/t. ${sim.kid <= sim.d.reaction ? 'Du rakk ikke å begynne å bremse.' : 'Bilen har ikke fått bremset ned i tide.'}`; }
      else { res.className = 'sim-res ok'; res.textContent = gap < 0.5 ? 'Du stanser akkurat ved barnet.' : `Du stanser ${Math.round(gap)} m før barnet.`; }
    };
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    const t0 = performance.now();
    const tick = now => {
      const t = (now - t0) / 1000 / scale, s = pos(t);
      if (s >= end - 0.01 || t >= T) { finish(); return; }
      show(s); simRaf = requestAnimationFrame(tick);
    };
    simRaf = requestAnimationFrame(tick);
  };
  el.querySelector('#calc-speed').oninput = draw;
  el.querySelectorAll('input[name=calc-f]').forEach(x => x.onchange = draw);
  el.querySelector('#sim-play').onclick = play;
  draw();
}
export function renderBook(root, ctx, path = '') {
  stopSpeaking(); stopPlayer();
  const [chId, secId] = String(path).split('/');
  const p = ctx.progress(), rd = readinessPercent(QUESTIONS, p, THEMES);
  const ch = chId ? bookChapter(chId) : null;
  // Uten Pluss (0.23.0): bare delene de gratis spørsmålene hører til, så «Les mer» virker der
  const free = !hasTheory();
  const open = free && ch ? new Set(FREE_THEORY.map(sectionFor).filter(s => s && s.chapter === ch.id).map(s => s.section)) : null;
  const secs = ch ? ch.sections.filter(x => !open || open.has(x.id)) : [];
  if (free && (!ch || !secs.length)) { ctx.go(TO_PLUS); return; }
  if (!ch) {
    root.innerHTML = `
      <section class="sign-card th-sign"><p class="eyebrow">Teoriboka</p><h2 class="th-sign-head">Reglene, tema for tema</h2>
        <p>Kort lesestoff til hvert tema på teoriprøven, med tegninger. Les en del, og øv på spørsmålene som hører til. Etter hvert svar i øvingen kan du gå rett hit med «Les mer».</p></section>
      <section class="card th-themes"><ul class="th-list">${BOOK.map(c => `<li><button type="button" class="th-theme" data-ch="${c.id}">
        <span class="th-ico th-ico-${c.id}">${icon(theme(c.id).icon, 22)}</span>
        <span class="th-tt"><span class="th-tt-head"><strong>${esc(theme(c.id).title)}</strong><span class="th-pct ${(rd.byTheme[c.id] || 0) >= 80 ? 'ok' : (rd.byTheme[c.id] || 0) >= 40 ? 'mid' : ''}">${rd.byTheme[c.id] || 0} %</span></span>
          <span class="muted small">${esc(c.intro)}</span><span class="muted small">${c.sections.length} deler</span></span>
        ${icon('chev', 18)}</button></li>`).join('')}</ul></section>
      <p class="muted small th-note">Teoriboka er appens egen, skrevet ut fra vegtrafikkloven, trafikkreglene, skiltforskriften og de andre forskriftene, slik de står på Lovdata. Den er en kort oppsummering, ikke hele regelverket.</p>`;
    root.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => ctx.go(`#/teori/bok/${b.dataset.ch}`));
    return;
  }
  const qn = s => s.qs.filter(id => byId.has(id)).length;
  root.innerHTML = `
    <p class="muted bk-intro">${esc(ch.intro)}</p>
    <nav class="bk-toc" aria-label="Delene i kapitlet">${secs.map(x => `<a href="#/teori/bok/${ch.id}/${x.id}" class="bk-toc-link" data-sec="${x.id}">${esc(x.title)}</a>`).join('')}</nav>
    ${secs.map(x => `<section class="card bk-sec" id="bk-${x.id}">
      <h2 class="card-title">${esc(x.title)}</h2>
      ${x.points.map(pt => { const pl = PUZZLE_BY_SCENE.get(String(pt.fig || '').replace(/^scene:/, '')); return `<div class="bk-pt">
        ${pl ? `<div class="cx-player"><div class="q-fig cx-fig bk-fig">${figure(pt.fig)}</div><p class="cx-cap" aria-live="polite"></p>
          <button type="button" class="link cx-playbtn" data-play="${pl.scene}">${icon('play', 18)}Spill av krysset</button></div>`
        : pt.fig ? `<div class="q-fig q-zoom bk-fig" role="button" tabindex="0" aria-label="Vis tegningen større" data-fig="${esc(pt.fig)}">${figure(pt.fig)}</div>` : ''}
        <p class="bk-rule">${esc(pt.b)}</p>${pt.t ? `<p class="bk-text">${esc(pt.t)}</p>` : ''}</div>`; }).join('')}
      ${x.calc === 'stopp' ? calcHtml() : ''}
      ${free ? '' : `<button type="button" class="btn secondary bk-go" data-sec="${x.id}">${icon('quiz', 20)}Øv på dette (${qn(x)} spørsmål)</button>`}
    </section>`).join('')}
    ${free ? `<section class="card th-plus-card"><h2 class="card-title">${icon('book')}Resten av teoriboka er en del av Pluss</h2>
      <p>Alle de sju temaene, ${BOOK.reduce((n, c) => n + c.sections.length, 0)} deler med tegninger, og øving på akkurat det du leser.</p>
      <button type="button" class="btn primary" id="bk-plus">Se Pluss</button></section>`
    : `<button type="button" class="btn primary" id="bk-all">${icon('quiz', 20)}Øv på hele temaet</button>
    ${ch.id === 'skilt' ? `<button type="button" class="btn secondary" id="bk-signs">${icon('sign', 20)}Til skiltprøven: alle ${SIGNS.length} skiltene</button>` : ''}`}`;
  root.querySelectorAll('.bk-go').forEach(b => b.onclick = () => {
    const x = ch.sections.find(y => y.id === b.dataset.sec), ids = x.qs.filter(id => byId.has(id));
    startPractice(ctx, { title: x.title, ids, n: ids.length, back: `#/teori/bok/${ch.id}/${x.id}` });
  });
  const all = root.querySelector('#bk-all');
  if (all) all.onclick = () => startPractice(ctx, { title: theme(ch.id).title, theme: ch.id, n: 10, back: `#/teori/bok/${ch.id}` });
  const bp = root.querySelector('#bk-plus'); if (bp) bp.onclick = () => ctx.go(TO_PLUS);
  const sg = root.querySelector('#bk-signs'); if (sg) sg.onclick = () => ctx.go('#/teori/skilt');
  // Innholdslista bytter adresse uten ny side i historikken, og ruller til delen
  root.querySelectorAll('.bk-toc-link').forEach(a => a.onclick = e => { e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); scrollToSec(a.dataset.sec); });
  wireZoom(root);
  wirePlayers(root);
  wireCalc(root);
  if (secId) requestAnimationFrame(() => scrollToSec(secId));
}
function scrollToSec(id) {
  const el = document.getElementById('bk-' + id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 76;   // under den faste topplinja
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

/* ---------- Skiltprøven ---------- */
const signsLearned = p => SIGN_QUESTIONS.filter(q => isLearned(p.q[q.id])).length;
const signState = e => !e ? 'ny' : isWrong(e) ? 'feil' : isLearned(e) ? 'lart' : 'ov';
const SIGN_STATE_TEXT = { ny: 'Ikke øvd ennå', feil: 'Feil sist', ov: 'Under øving', lart: 'Lært' };

export function renderSignHub(root, ctx) {
  stopTheory();
  const p = ctx.progress();
  const learned = signsLearned(p), wrong = SIGN_POOL.filter(q => isWrong(p.q[q.id])).length;
  root.innerHTML = `
    <section class="sign-card th-sign ${learned === SIGNS.length ? 'lv-klar' : learned ? 'lv-nesten' : 'lv-start'}">
      <p class="eyebrow">Skiltprøven</p>
      <h2>Kjenn igjen skiltene</h2>
      <span class="th-bar"><span style="width:${learned / SIGNS.length * 100}%"></span></span>
      <p class="muted small">${learned} av ${SIGNS.length} skilt lært. Et skilt er lært når du har svart riktig på det ${LEARNED} ganger på rad.</p>
      <button type="button" class="btn primary" id="sg-go">${icon('quiz', 20)}Øv på skiltene</button>
      <button type="button" class="btn secondary" id="sg-cards">${icon('layers', 20)}Skiltkort: snu og lær</button>
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
  const go = (title, extra = {}) => startPractice(ctx, { title, pool: 'skilt', back: '#/teori/skilt', n: 10, ...extra });   // halvparten «hva betyr», halvparten «hvilket skilt»
  root.querySelector('#sg-go').onclick = () => go('Skiltprøven');
  root.querySelector('#sg-cards').onclick = () => startCards(ctx);
  const w = root.querySelector('#sg-wrong'); if (w) w.onclick = () => go('Skiltene du bommet på', { wrongOnly: true, n: 15 });
  root.querySelectorAll('.sg-group-go').forEach(b => b.onclick = () => {
    const g = SIGN_GROUPS.find(x => x.id === b.dataset.group);
    go(g.title, { ids: SIGN_POOL.filter(q => SIGNS.find(s => s.id === q.sign).g === g.id).map(q => q.id) });
  });
  root.querySelectorAll('.sg-tile').forEach(b => b.onclick = () => {
    const s = SIGNS.find(x => x.id === b.dataset.sign), st = signState(ctx.progress().q['sk' + s.id]);
    sheetDialog({
      body: `<div class="q-fig small">${figure(s.img)}</div><div class="q-head"><h2 class="q-text">${esc(s.name)}</h2>${speakBtn('sg-read').replace('<button', '<button value=""')}</div>
        <p>${esc(s.meaning)}</p><p class="muted small">${icon('book', 16)} Skiltforskriften, skilt ${SIGN_REF[s.id] || s.id} · ${SIGN_STATE_TEXT[st]}</p>`,
      onOpen: d => { const r = d.querySelector('#sg-read'); if (r) r.onclick = e => { e.preventDefault(); speak(`${s.name}. ${s.meaning}`); }; }
    }).then(stopSpeaking);
  });
}

/* ---------- Skiltkort (0.22.0) ----------
   Et roligere alternativ til skiltprøven: se skiltet, snu kortet og si selv om du kunne det. Sveip til høyre for
   «Kan det» og til venstre for «Øv mer»; de du må øve mer på, kommer igjen litt senere i bunken. Kortene lagres ikke
   som svar i skiltprøven, så «lært» der betyr fortsatt riktige svar på prøvespørsmålene. */
let cards = null;   // { deck: [skiltnr], i, flipped, known: [], again: Set, total }
const CARD_N = 20;
function newCards(p) {
  const shuffle = a => a.map(x => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  const list = [...shuffle(SIGNS.filter(s => signState(p.q['sk' + s.id]) !== 'lart')), ...shuffle(SIGNS.filter(s => signState(p.q['sk' + s.id]) === 'lart'))].slice(0, CARD_N).map(s => s.id);
  return { deck: list.slice(), i: 0, flipped: false, known: [], again: new Set(), total: list.length };
}
function startCards(ctx) { cards = newCards(ctx.progress()); ctx.go('#/teori/skiltkort'); }
export function renderCards(root, ctx) {
  stopSpeaking();
  if (!cards) cards = newCards(ctx.progress());
  const K = cards;
  if (K.i >= K.deck.length) return renderCardsDone(root, ctx);
  const s = SIGNS.find(x => x.id === K.deck[K.i]), seen = K.known.length + K.again.size;
  root.innerHTML = `
    <div class="q-top"><span class="q-step"><strong>Skiltkort</strong><span class="muted small">${Math.min(K.total, K.known.length + 1)} av ${K.total} · ${K.known.length} kan du</span></span>
      <button type="button" class="icon-btn" id="fc-close" aria-label="Avslutt">${icon('close', 22)}</button></div>
    <span class="th-bar q-prog"><span style="width:${K.known.length / K.total * 100}%"></span></span>
    <div class="fc-stage">
      <button type="button" class="fc-card ${K.flipped ? 'flipped' : ''}" id="fc-card" aria-label="${K.flipped ? `${esc(s.name)}. ${esc(s.meaning)}` : 'Skiltkort. Trykk for å snu og se hva skiltet betyr'}">
        <span class="fc-inner">
          <span class="fc-face fc-front" aria-hidden="${K.flipped}"><span class="fc-fig">${figure(s.img)}</span><span class="fc-hint">${icon('repeat', 18)}Hva betyr skiltet? Trykk for å snu</span></span>
          <span class="fc-face fc-back" aria-hidden="${!K.flipped}"><span class="fc-fig small">${figure(s.img)}</span><strong class="fc-name">${esc(s.name)}</strong><span class="fc-mean">${esc(s.meaning)}</span><span class="muted small">Skilt ${s.id === '306' ? '306.0' : s.id}</span></span>
        </span>
        <span class="fc-stamp fc-stamp-yes" aria-hidden="true">${icon('check', 22)}Kan det</span><span class="fc-stamp fc-stamp-no" aria-hidden="true">${icon('repeat', 22)}Øv mer</span>
      </button>
    </div>
    <div class="fc-actions"><button type="button" class="btn secondary" id="fc-no">${icon('repeat', 20)}Øv mer</button><button type="button" class="btn primary" id="fc-yes">${icon('check', 20)}Kan det</button></div>
    <p class="muted small fc-tip">${seen ? 'Sveip kortet til høyre hvis du kunne det, eller til venstre for å øve mer.' : 'Snu kortet når du har tenkt deg om. Sveip til høyre hvis du kunne det, til venstre for å øve mer.'}</p>`;
  const card = root.querySelector('#fc-card');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const decide = (ok, dir = ok ? 1 : -1) => {
    if (ok) K.known.push(s.id);
    else { K.again.add(s.id); K.deck.splice(Math.min(K.deck.length, K.i + 4), 0, s.id); }   // kommer igjen om noen kort
    ctx.vibrate(ok ? 12 : [20, 30, 20]);
    const next = () => { K.i++; K.flipped = false; renderCards(root, ctx); };
    if (reduce) { next(); return; }
    card.style.transition = 'transform .28s ease-in, opacity .28s ease-in';
    card.style.transform = `translateX(${dir * 120}%) rotate(${dir * 18}deg)`; card.style.opacity = '0';
    setTimeout(next, 260);
  };
  // Trykk snur, sveip avgjør
  let x0 = null, dx = 0, moved = false;
  card.onpointerdown = e => { x0 = e.clientX; dx = 0; moved = false; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; };
  card.onpointermove = e => {
    if (x0 === null) return;
    dx = e.clientX - x0; if (Math.abs(dx) > 8) moved = true;
    if (!moved) return;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    card.classList.toggle('yes', dx > 50); card.classList.toggle('no', dx < -50);
  };
  const up = () => {
    if (x0 === null) return;
    x0 = null;
    if (moved && Math.abs(dx) > 90) { decide(dx > 0); return; }
    card.style.transition = 'transform .2s ease-out'; card.style.transform = ''; card.classList.remove('yes', 'no');
    if (!moved) { K.flipped = !K.flipped; card.classList.toggle('flipped', K.flipped); card.setAttribute('aria-label', K.flipped ? `${s.name}. ${s.meaning}` : 'Skiltkort. Trykk for å snu og se hva skiltet betyr'); }
  };
  card.onpointerup = up; card.onpointercancel = up;
  card.onkeydown = e => { if (e.key === 'ArrowRight') decide(true); if (e.key === 'ArrowLeft') decide(false); };
  card.onclick = e => e.preventDefault();   // pekerhendelsene over gjør jobben (også for tastatur: Enter gir click)
  card.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') { K.flipped = !K.flipped; card.classList.toggle('flipped', K.flipped); } });
  root.querySelector('#fc-yes').onclick = () => decide(true);
  root.querySelector('#fc-no').onclick = () => decide(false);
  root.querySelector('#fc-close').onclick = () => { cards = null; ctx.go('#/teori/skilt'); };
}
function renderCardsDone(root, ctx) {
  const K = cards, again = [...K.again], firstTry = K.known.filter(id => !K.again.has(id)).length;
  root.innerHTML = `
    <section class="sign-card th-sign ${firstTry === K.total ? 'lv-klar' : 'lv-nesten'}">
      <p class="eyebrow">Skiltkort</p>
      <h2 class="th-sign-head">${firstTry} av ${K.total} kunne du med en gang</h2>
      <p>${again.length === 1 ? 'Dette skiltet måtte du øve mer på. Ta det i skiltprøven, så teller det som lært.' : again.length ? `Disse ${again.length} skiltene måtte du øve mer på. Ta dem i skiltprøven, så teller de som lært.` : 'Alle satt med en gang. Ta skiltprøven, så teller de som lært.'}</p>
    </section>
    ${again.length ? `<section class="card"><ul class="sg-grid fc-again">${again.map(id => { const s = SIGNS.find(x => x.id === id); return `<li><span class="sg-tile"><span class="sg-fig">${figure(s.img)}</span><span class="sg-name">${esc(s.name)}</span></span></li>`; }).join('')}</ul></section>` : ''}
    ${again.length ? `<button type="button" class="btn primary" id="fc-test">${icon('quiz', 20)}Øv på ${again.length === 1 ? 'det' : 'disse'} i skiltprøven</button>` : ''}
    <button type="button" class="btn ${again.length ? 'secondary' : 'primary'}" id="fc-new">${icon('layers', 20)}Nye skiltkort</button>
    <button type="button" class="btn secondary" id="fc-hub">Til skiltene</button>`;
  if (!again.length && K.total >= 10 && ctx.celebrate) setTimeout(ctx.celebrate, 300);
  const t = root.querySelector('#fc-test');
  if (t) t.onclick = () => { const ids = SIGN_POOL.filter(q => again.includes(q.sign)).map(q => q.id); cards = null; startPractice(ctx, { title: 'Skiltene fra kortene', pool: 'skilt', ids, n: ids.length, back: '#/teori/skilt' }); };
  root.querySelector('#fc-new').onclick = () => { cards = newCards(ctx.progress()); renderCards(root, ctx); window.scrollTo(0, 0); };
  root.querySelector('#fc-hub').onclick = () => { cards = null; ctx.go('#/teori/skilt'); };
}

/* ---------- Hvem kjører først? (0.22.0) ----------
   Eieren ønsket animasjoner og framstillinger som gjør det lettere å øve. Her trykker eleven på trafikantene i den
   rekkefølgen de kjører, og ser så krysset spilles av med forklaring for hvert steg. Svarene lagres som kx-<id>. */
let cross = null;   // { items: [id], i, tapped: [id], checked, results: [bool] }
const newCross = p => ({ items: pickCross(p).map(pz => pz.id), i: 0, tapped: [], checked: false, results: [] });
function startCross(ctx) { cross = newCross(ctx.progress()); ctx.go('#/teori/kryss'); }
export function renderCross(root, ctx) {
  stopSpeaking(); stopPlayer();
  if (!cross) cross = newCross(ctx.progress());
  const X = cross;
  if (X.i >= X.items.length) return renderCrossDone(root, ctx);
  const pz = CROSS_PUZZLES.find(x => x.id === X.items[X.i]), movers = crossingMovers(pz.scene);
  const checked = X.checked, right = checked && checkOrder(pz, X.tapped), more = sectionFor(pz.qid);
  const [rule, rest] = splitRule(pz.why), combo = right ? runEnd(X.results) : 0;
  const shown = checked ? flatOrder(pz) : X.tapped;
  root.innerHTML = `
    <div class="q-top"><span class="q-step"><strong>Hvem kjører først?</strong><span class="muted small">${X.i + 1} av ${X.items.length}</span></span>
      <button type="button" class="icon-btn" id="cx-close" aria-label="Avslutt">${icon('close', 22)}</button></div>
    <span class="th-bar q-prog"><span style="width:${(X.i + (checked ? 1 : 0)) / X.items.length * 100}%"></span></span>
    <section class="card q-card ${checked ? '' : 'q-enter'}">
      ${checked ? `<p class="cx-verdict ${right ? 'ok' : 'no'}"><span class="q-verdict-ico">${icon(right ? 'check' : 'close', 20)}</span>${right ? 'Riktig!' : 'Ikke riktig'}${combo >= 3 ? `<span class="q-combo">${icon('flame', 16)}${combo} på rad</span>` : ''}</p>`
        : `<p class="eyebrow">Vikeplikt${pz.lvl >= 3 ? ' <span class="q-hard">Vanskelig</span>' : ''}</p>`}
      <div class="q-fig cx-fig ${checked ? '' : 'cx-tap'}" id="cx-fig">${figure('scene:' + pz.scene)}</div>
      <p class="cx-cap" id="cx-cap" aria-live="polite">${checked ? '' : X.tapped.length ? `Valgt: ${esc(orderText(X.tapped))}` : ''}</p>
      <h2 class="q-text">${esc(pz.intro)} Hvem skal først?</h2>
      ${checked ? '' : `<p class="muted small cx-help">Trykk på trafikantene i den rekkefølgen de kjører, i bildet eller på knappene under.</p>`}
      <div class="cx-chips" role="group" aria-label="Trafikantene">${movers.map(m => { const n = shown.indexOf(m.id) + 1; return `<button type="button" class="cx-chip ${n ? 'on' : ''} ${checked ? 'ok' : ''}" data-id="${m.id}" ${checked || n ? 'disabled' : ''}><span class="cx-n">${n || ''}</span>${esc(MOVER_NAMES[m.id] || m.id)}</button>`; }).join('')}</div>
      ${!checked && X.tapped.length ? `<button type="button" class="link cx-undo" id="cx-undo">${icon('undo', 18)}Angre</button>` : ''}
    </section>
    ${checked ? `<section class="card q-why ${right ? 'ok' : 'no'}">
      <p class="cx-answer">Rekkefølgen: <strong>${esc(orderText(flatOrder(pz)))}</strong>${right ? '' : `<span class="muted"> · du svarte ${esc(orderText(X.tapped, false))}</span>`}</p>
      <ol class="cx-steps">${pz.steps.map((st, i) => `<li data-step="${i}">${esc(st)}</li>`).join('')}</ol>
      <p class="q-rule">${esc(rule)}</p>${rest ? `<p>${esc(rest)}</p>` : ''}
      <p class="muted small">${icon('book', 16)} ${esc(pz.ref)}</p>
      <button type="button" class="btn secondary" id="cx-replay">${icon('repeat', 20)}Spill av igjen</button>
      ${more ? `<button type="button" class="link q-more" id="cx-more">${icon('book', 18)}<span>Les mer i teoriboka: ${esc(bookSection(more).title)}</span>${icon('chev', 16)}</button>` : ''}
    </section>
    <div class="q-dock"><button type="button" class="btn primary" id="cx-next">${X.i + 1 < X.items.length ? 'Neste kryss' : 'Se hvordan det gikk'}${icon('chev', 20)}</button></div>` : ''}`;
  const svg = root.querySelector('#cx-fig svg');
  // Tallene på trafikantene: det eleven har valgt, og etter svaret den riktige rekkefølgen
  shown.forEach((id, i) => { const g = svg.querySelector(`.cx-mover[data-id="${id}"]`); if (g) g.insertAdjacentHTML('beforeend', `<g class="cx-num ${checked ? 'ok' : ''}" transform="translate(11 -15)"><g class="cx-num-in"><circle r="7.5"/><text text-anchor="middle" dominant-baseline="central" y=".6">${i + 1}</text></g></g>`); });
  root.querySelector('#cx-close').onclick = () => { cross = null; ctx.go(THEORY_HOME); };
  if (!checked) {
    const tap = id => {
      if (X.checked || X.tapped.includes(id) || !movers.some(m => m.id === id)) return;
      X.tapped.push(id); ctx.vibrate(8);
      const left = movers.map(m => m.id).filter(x => !X.tapped.includes(x));
      if (left.length === 1) X.tapped.push(left[0]);   // den siste gir seg selv
      if (X.tapped.length === movers.length) {
        X.checked = true;
        const ok = checkOrder(pz, X.tapped);
        X.results.push(ok);
        const goal = planFor(ctx.progress()).goal, before = practiceDays(ctx.progress(), Date.now(), goal).today;
        ctx.save(answer(ctx.progress(), crossKey(pz.id), ok ? 0 : 1));
        ctx.vibrate(ok ? 15 : [30, 40, 30]);
        const d = practiceDays(ctx.progress(), Date.now(), goal);
        if (before < d.goal && d.today >= d.goal) { toast(`Dagens mål er nådd: ${d.goal} svar!`, { type: 'ok' }); if (ctx.celebrate) setTimeout(ctx.celebrate, 300); }
      }
      renderCross(root, ctx);
    };
    svg.addEventListener('click', e => { const g = e.target.closest('.cx-mover'); if (g) tap(g.dataset.id); });
    root.querySelectorAll('.cx-chip').forEach(b => b.onclick = () => tap(b.dataset.id));
    const undo = root.querySelector('#cx-undo');
    if (undo) undo.onclick = () => { X.tapped.pop(); renderCross(root, ctx); };
    return;
  }
  // Etter svaret: spill av krysset, steg for steg
  const cap = root.querySelector('#cx-cap'), steps = root.querySelectorAll('.cx-steps li');
  const play = () => {
    stopPlayer();
    svg.querySelectorAll('.cx-num').forEach(n => n.remove());
    player = playCrossing(svg, pz.order, { onStep: i => {
      cap.textContent = i < pz.steps.length ? `${i + 1}. ${pz.steps[i]}` : `Rekkefølgen: ${orderText(flatOrder(pz))}.`;
      steps.forEach((li, k) => li.classList.toggle('on', k === i));
    } });
  };
  setTimeout(() => { if (root.contains(svg)) play(); }, 450);
  root.querySelector('#cx-replay').onclick = play;
  const mb = root.querySelector('#cx-more');
  if (mb) mb.onclick = () => ctx.go(`#/teori/bok/${more.chapter}/${more.section}`);
  root.querySelector('#cx-next').onclick = () => { X.i++; X.tapped = []; X.checked = false; renderCross(root, ctx); window.scrollTo(0, 0); };
}
function renderCrossDone(root, ctx) {
  const X = cross, ok = X.results.filter(Boolean).length;
  root.innerHTML = `
    <section class="sign-card th-sign ${ok === X.items.length ? 'lv-klar' : ok >= X.items.length * 0.8 ? 'lv-nesten' : 'lv-ovelse'}">
      <p class="eyebrow">Hvem kjører først?</p>
      <h2 class="th-sign-head">${ok} av ${X.items.length} kryss riktig</h2>
      <p>${ok === X.items.length ? 'Alt riktig. Du kan vikepliktreglene i disse kryssene!' : 'Kryssene du bommet på, kommer først neste gang.'}</p>
    </section>
    <section class="card"><ul class="q-sum">${X.items.map((id, i) => { const pz = CROSS_PUZZLES.find(x => x.id === id); return `<li class="${X.results[i] ? 'ok' : 'no'}">${icon(X.results[i] ? 'check' : 'close', 18)}<span class="q-sum-sign cx-sum-fig">${figure('scene:' + pz.scene)}</span><span>${esc(pz.intro)}</span></li>`; }).join('')}</ul></section>
    <button type="button" class="btn primary" id="cx-again">${icon('repeat', 20)}Nye kryss</button>
    <button type="button" class="btn secondary" id="cx-hub">Til oversikten</button>`;
  if (ok === X.items.length && ctx.celebrate) setTimeout(ctx.celebrate, 300);
  root.querySelector('#cx-again').onclick = () => { cross = newCross(ctx.progress()); renderCross(root, ctx); window.scrollTo(0, 0); };
  root.querySelector('#cx-hub').onclick = () => { cross = null; ctx.go(THEORY_HOME); };
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
  if (!E) { ctx.go(lastResult ? '#/teori/resultat' : THEORY_HOME); return; }
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
    saveExam(null); stopTheory(); ctx.go(THEORY_HOME);
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
  if (!R) { ctx.go(THEORY_HOME); return; }
  const wrong = R.wrong.map(id => byId.get(id));
  root.innerHTML = `
    <section class="sign-card th-sign ${R.correct >= EXAM.solid ? 'lv-klar' : R.passed ? 'lv-nesten' : 'lv-ovelse'}">
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
        ${q.wimg ? `<div class="q-fig q-wfig small">${figure(q.wimg)}</div>` : ''}<p>${esc(q.why)}</p><p class="muted small">${icon('book', 16)} ${esc(q.ref)}</p></details>`;
    }).join('')}` : ''}
    <button type="button" class="btn secondary" id="r-hub">Til oversikten</button>`;
  const w = root.querySelector('#r-wrong');
  if (w) w.onclick = () => startPractice(ctx, { title: 'Feilene fra prøven', ids: R.wrong, n: R.wrong.length });
  root.querySelector('#r-new').onclick = () => { startExam(ctx); ctx.go('#/teori/prove'); };
  root.querySelector('#r-hub').onclick = () => ctx.go(THEORY_HOME);
}

/* ---------- Sikkerhetskontrollen ---------- */
export function renderSafetyHub(root, ctx) {
  stopSpeaking();
  const p = ctx.progress();
  const list = safetyFor(SAFETY, p.car), stats = safetyStats(SAFETY, p, p.car);
  const known = id => !!(p.safety[id] && p.safety[id].known);
  root.innerHTML = `
    <section class="sign-card th-sign ${stats.known === stats.total ? 'lv-klar' : stats.known ? 'lv-nesten' : 'lv-start'}">
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
      <section class="sign-card th-sign ${ok === D.items.length ? 'lv-klar' : 'lv-nesten'}"><p class="eyebrow">Sikkerhetskontrollen</p><h2>${ok} av ${D.items.length} kunne du</h2>
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

