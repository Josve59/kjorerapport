/* Teori og sikkerhetskontroll (0.14.0): spørsmålene, prøven, øvingen og sikkerhetskontrollen */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM, EXAM_QUOTA, emptyProgress, normProgress, rng, answer, isLearned, isWrong, themeStats, pickPractice, buildExam, scoreExam, theoryReady, addExam,
  safetyFor, pickSafety, markSafety, safetyStats, tagsFromDrives, optionOrder, theoryBrief } from '../js/theory.js';
import { THEMES, QUESTIONS } from '../js/theory-b.js';
import { SAFETY, SAFETY_AREAS, CAR_TYPES } from '../js/safety-check.js';
import { figure, FIGURE_KEYS } from '../js/trafficsvg.js';
import { SIGNS, SIGN_GROUPS, SIGN_QUESTIONS } from '../js/theory-signs.js';

const TAGS = new Set(['bakketopp', 'fart', 'avstand', 'feltskifte', 'glatt', 'morket', 'rundkjoring', 'forbikjoring']);

test('teorispørsmålene: hele og riktig bygget', () => {
  const ids = new Set(), themes = new Set(THEMES.map(t => t.id));
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id), 'dobbel id ' + q.id); ids.add(q.id);
    assert.ok(themes.has(q.t), `${q.id}: ukjent tema ${q.t}`);
    assert.ok(q.q.length > 8 && q.q.endsWith('?'), `${q.id}: spørsmålet skal ende med spørsmålstegn`);
    assert.ok(q.a.length >= 3 && q.a.length <= 4, `${q.id}: 3–4 svar`);
    assert.equal(new Set(q.a.map(s => s.toLowerCase())).size, q.a.length, `${q.id}: like svar`);
    assert.ok(q.a.every(s => s.length >= 2 && !/alle (svarene|alternativene)/i.test(s)), `${q.id}: svarene blandes, så «alle svarene» passer ikke`);
    assert.ok(q.why.length > 30, `${q.id}: forklaring mangler`);
    assert.ok(q.ref.length > 4, `${q.id}: kilde mangler`);
    if (q.img) assert.ok(figure(q.img).startsWith('<svg'), `${q.id}: tegningen ${q.img} finnes ikke`);
    for (const t of q.tags || []) assert.ok(TAGS.has(t), `${q.id}: ukjent merke ${t}`);
  }
  // Nok spørsmål til at hver prøve kan fylle kvoten for hvert tema, med noe å velge mellom
  const per = Object.fromEntries(THEMES.map(t => [t.id, QUESTIONS.filter(q => q.t === t.id).length]));
  for (const [t, k] of Object.entries(EXAM_QUOTA)) assert.ok(per[t] >= 2 * k, `${t}: ${per[t]} spørsmål, kvoten er ${k}`);
  assert.equal(Object.values(EXAM_QUOTA).reduce((a, b) => a + b, 0), EXAM.n);
  assert.ok(QUESTIONS.length >= 200, `${QUESTIONS.length} spørsmål`);
});

test('tegningene: alle kan lages, og skjermleserteksten røper ikke svaret', () => {
  for (const k of FIGURE_KEYS) {
    const s = figure(k);
    assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'), k);
    if (k.startsWith('sign:')) assert.match(s, /aria-label="Trafikkskilt"/);
  }
  assert.match(figure('sign:362:80'), />80</);
  assert.match(figure('sign:362:50:gul'), /#f5c400/);
  assert.equal(figure('sign:999'), '');
  assert.equal(figure(''), '');
});

test('øving: feil først, så nye, og lært etter tre riktige på rad', () => {
  const qs = QUESTIONS.filter(q => q.t === 'vikeplikt');
  let p = emptyProgress();
  p = answer(p, 'v01', 2, 1000);
  assert.ok(isWrong(p.q.v01));
  const first = pickPractice(qs, p, { n: 5, rand: rng(1) });
  assert.ok(first.some(q => q.id === 'v01'), 'feilen kommer med');
  for (let i = 0; i < 3; i++) p = answer(p, 'v02', 0, 2000 + i);
  assert.ok(isLearned(p.q.v02) && !isWrong(p.q.v02));
  assert.equal(p.q.v02.ok, 3);
  const only = pickPractice(QUESTIONS, p, { wrongOnly: true, n: 10, rand: rng(2) });
  assert.deepEqual(only.map(q => q.id), ['v01']);
  const tagged = pickPractice(QUESTIONS, p, { tags: ['bakketopp'], n: 50, rand: rng(3) });
  assert.ok(tagged.length >= 5 && tagged.every(q => q.tags.includes('bakketopp')));
  const st = themeStats(QUESTIONS, p, THEMES);
  assert.equal(st.vikeplikt.seen, 2);
  assert.equal(st.vikeplikt.learned, 1);
  // Rekkefølgen på svarene blandes, men alle er med
  assert.deepEqual(optionOrder(QUESTIONS[0], rng(4)).slice().sort(), [0, 1, 2, 3]);
});

test('prøven: 45 oppgaver etter temakvoten, ny blanding hver gang, og bestått ved 38 riktige', () => {
  const ids = buildExam(QUESTIONS, { rand: rng(7) });
  assert.equal(ids.length, 45);
  assert.equal(new Set(ids).size, 45);
  const byId = new Map(QUESTIONS.map(q => [q.id, q]));
  for (const [t, k] of Object.entries(EXAM_QUOTA)) assert.equal(ids.filter(id => byId.get(id).t === t).length, k, t);
  const next = buildExam(QUESTIONS, { rand: rng(8), recent: ids });
  const overlap = next.filter(id => ids.includes(id)).length;
  assert.ok(overlap < 10, `${overlap} like som forrige prøve`);
  const answers = Object.fromEntries(ids.map((id, i) => [id, i < 38 ? 0 : 1]));
  const r = scoreExam(QUESTIONS, ids, answers);
  assert.deepEqual([r.correct, r.total, r.passed, r.wrong.length], [38, 45, true, 7]);
  delete answers[ids[0]];   // ubesvart teller som feil
  assert.equal(scoreExam(QUESTIONS, ids, answers).passed, false);
});

test('klar for teoriprøven: bestått 3 av de 5 siste, og den siste', () => {
  let p = emptyProgress();
  assert.equal(theoryReady(p).level, 'start');
  const res = ok => ({ correct: ok ? 40 : 30, total: 45, passed: ok, byTheme: {}, wrong: [] });
  p = addExam(p, res(false), { at: 1 });
  assert.equal(theoryReady(p).level, 'ovelse');
  p = addExam(p, res(true), { at: 2 }); p = addExam(p, res(true), { at: 3 });
  assert.equal(theoryReady(p).level, 'nesten');
  p = addExam(p, res(true), { at: 4 });
  assert.equal(theoryReady(p).level, 'klar');
  p = addExam(p, res(false), { at: 5 });
  assert.equal(theoryReady(p).level, 'nesten', 'siste prøve ikke bestått');
  for (let i = 0; i < 30; i++) p = addExam(p, res(true), { at: 10 + i });
  assert.equal(p.exams.length, 20, 'bare de 20 siste lagres');
  assert.deepEqual(normProgress(null), emptyProgress());
});

test('sikkerhetskontrollen: oppgavene, biltypen og stikkprøven', () => {
  const ids = new Set(), areas = new Set(SAFETY_AREAS.map(a => a.id));
  for (const t of SAFETY) {
    assert.ok(!ids.has(t.id), t.id); ids.add(t.id);
    assert.ok(areas.has(t.area), `${t.id}: ${t.area}`);
    assert.ok(['alle', 'fossil', 'el'].includes(t.car), t.id);
    assert.ok(t.task.length > 10 && t.how.length >= 2 && t.fault.length > 20, t.id);
  }
  for (const a of SAFETY_AREAS) assert.ok(SAFETY.some(t => t.area === a.id), 'tomt område ' + a.id);
  assert.deepEqual(CAR_TYPES.map(c => c.id), ['el', 'fossil', 'hybrid']);
  const el = safetyFor(SAFETY, 'el'), fossil = safetyFor(SAFETY, 'fossil'), hybrid = safetyFor(SAFETY, 'hybrid');
  assert.ok(!el.some(t => t.car === 'fossil') && el.some(t => t.car === 'el'));
  assert.ok(!fossil.some(t => t.car === 'el') && fossil.some(t => t.id === 'vaeske-olje'));
  assert.equal(hybrid.length, SAFETY.length);
  let p = emptyProgress();
  const five = pickSafety(SAFETY, p, { car: 'el', n: 5, rand: rng(3) });
  assert.equal(five.length, 5);
  assert.equal(new Set(five.map(t => t.area)).size, 5, 'fem ulike områder');
  for (const t of el.slice(0, el.length - 2)) p = markSafety(p, t.id, true, 1);
  const again = pickSafety(SAFETY, p, { car: 'el', n: 2, rand: rng(4) });
  assert.ok(again.every(t => !p.safety[t.id]), 'det du ikke kan, kommer først');
  assert.deepEqual(safetyStats(SAFETY, p, 'el'), { total: el.length, known: el.length - 2 });
});

test('fra turene: hva eleven bør lese seg opp på', () => {
  assert.deepEqual(tagsFromDrives({}), []);
  const t = tagsFromDrives({ crests: 2, speeding: 1, close: 0, dark: 3 });
  assert.deepEqual(t.map(x => x.tag), ['bakketopp', 'fart', 'morket']);
  assert.match(t[0].why, /2 bakketopper/);
  assert.match(t[1].why, /1 gang$/);
});

test('skiltprøven: hvert skilt har tegning, navn, betydning og fire ulike svar', () => {
  const groups = new Set(SIGN_GROUPS.map(g => g.id)), ids = new Set(), names = new Set();
  for (const s of SIGNS) {
    assert.ok(!ids.has(s.id), 'dobbelt skilt ' + s.id); ids.add(s.id);
    assert.ok(!names.has(s.name), 'likt navn ' + s.name); names.add(s.name);
    assert.ok(groups.has(s.g), `${s.id}: ukjent gruppe`);
    assert.ok(figure(s.img).startsWith('<svg'), `${s.id}: tegningen ${s.img} finnes ikke`);
    assert.ok(s.meaning.length > 30, `${s.id}: betydningen mangler`);
    // Nummeret bestemmer gruppen i skiltforskriften: 1xx fare, 2xx vikeplikt, 3xx forbud, 4xx påbud, 5xx opplysning
    assert.equal(s.g, { 1: 'fare', 2: 'vike', 3: 'forbud', 4: 'pabud', 5: 'opplysning' }[s.id[0]], s.id);
  }
  for (const g of SIGN_GROUPS) assert.ok(SIGNS.filter(s => s.g === g.id).length >= 3, 'for få skilt i ' + g.id);
  assert.equal(SIGN_QUESTIONS.length, SIGNS.length);
  for (const q of SIGN_QUESTIONS) {
    const s = SIGNS.find(x => x.id === q.sign);
    assert.equal(q.a[0], s.name, q.id);
    assert.equal(new Set(q.a).size, 4, `${q.id}: fire ulike svar`);
    assert.ok(q.a.slice(1).every(n => names.has(n) && n !== s.name), `${q.id}: gale svar er andre skilt`);
    assert.match(q.ref, new RegExp('skilt ' + q.sign), q.id);
  }
  // Øving på én gruppe: bare skiltene i gruppen
  const pabud = SIGN_QUESTIONS.filter(q => SIGNS.find(s => s.id === q.sign).g === 'pabud').map(q => q.id);
  const round = pickPractice(SIGN_QUESTIONS, emptyProgress(), { ids: pabud, n: 10, rand: rng(5) });
  assert.deepEqual(round.map(q => q.id).sort(), pabud.slice().sort());
  // Svar på skilt lagres som andre spørsmål, uten å telle med i temaene
  const p = answer(emptyProgress(), 'sk100', 0, 1);
  assert.equal(themeStats(QUESTIONS, p, THEMES).skilt.seen, 0);
});

test('status til trafikklæreren: tom før eleven har øvd, ellers prøver, spørsmål, skilt og sikkerhetskontroll', () => {
  const opts = { questions: QUESTIONS, signQuestions: SIGN_QUESTIONS, tasks: SAFETY };
  assert.equal(theoryBrief(emptyProgress(), opts), null);
  let p = emptyProgress();
  for (let i = 0; i < 3; i++) { p = answer(p, 'v01', 0, i); p = answer(p, 'sk100', 0, i); }
  p = markSafety(p, SAFETY[0].id, true, 1);
  p = addExam(p, { correct: 39, total: 45, passed: true, byTheme: {}, wrong: [] }, { at: 5 });
  const b = theoryBrief(p, opts);
  assert.deepEqual([b.learned, b.signs, b.safety.known, b.taken, b.passed, b.last.correct], [1, 1, 1, 1, 1, 39]);
  assert.equal(b.total, QUESTIONS.length);
  assert.equal(b.signsTotal, SIGN_QUESTIONS.length);
});
