/* Visninger av appen (0.12.0). Appen finnes i to utgaver som deler det meste:
   - for elever (gratis, med Pluss, og koblet til en trafikkskole: da følger skolen med og Pluss er inkludert)
   - for trafikklærere (elevliste, bytte mellom elevene, se profilen deres og ta opp kjøretimer på en valgt elev)
   Inntil delingen med trafikkskolen finnes (automatisk synk med Apple-ID, når utviklerkontoen er på plass), kan
   visningen byttes under Innstillinger i testbyggene, så alle fire kan prøves i samme app. Ren modul, testes i Node. */

export const VIEW_MODES = [
  ['app', 'Som App Store', 'Gratis eller Pluss etter det App Store sier'],
  ['free', 'Gratis', 'Uten Pluss'],
  ['plus', 'Pluss', 'Kjøpt Pluss, ikke koblet til en trafikkskole'],
  ['school', 'Koblet til trafikkskole', 'Skolen ser turene, gir lekser, og Pluss er inkludert'],
  ['teacher', 'Trafikklærer', 'Elevliste, elevprofiler og kjøretimer på en valgt elev']
];

let mode = 'app';
export function setViewMode(m) { mode = VIEW_MODES.some(x => x[0] === m) ? m : 'app'; return mode; }
export const viewMode = () => mode;
export const isTeacher = () => mode === 'teacher';
export const isSchool = () => mode === 'school';
/* Pluss i hver visning: true/false overstyrer App Store, null = som App Store sier */
export const plusFor = m => ({ free: false, plus: true, school: true, teacher: true })[m] ?? null;
/* Gammel innstilling «Pluss (test)» (0.11.0–0.11.6) blir til en visning */
export const modeFromLegacy = s => (s && s.viewMode) || ({ on: 'plus', off: 'free' })[s && s.devPlus] || 'app';

/* Trafikkskolen eleven er koblet til. Ekte kobling kommer med synken; i visningen brukes en testskole. */
export function schoolInfo(s = {}, now = new Date()) {
  if (s.school && s.school.name) return s.school;
  if (!isSchool()) return null;
  const next = new Date(now); next.setDate(next.getDate() + ((4 - next.getDay() + 7) % 7 || 7)); next.setHours(15, 0, 0, 0);   // neste torsdag kl. 15
  return { name: 'Trondheim Trafikkskole', teacher: 'Kari Nilsen', nextLesson: next.toISOString(), test: true };
}

/* Elevene til trafikklæreren: [{ name, email }]. Navn fra eldre førerlister tas med. */
export function students(s = {}) {
  const list = Array.isArray(s.students) ? s.students.filter(x => x && x.name) : [];
  const names = new Set(list.map(x => x.name));
  for (const n of s.drivers || []) if (n && !names.has(n)) { list.push({ name: n, email: '' }); names.add(n); }
  return list;
}

/* Hvem appen viser data for: trafikklæreren ser én elev om gangen, eleven ser alle sine egne turer (null = alle) */
export const scopeDriver = (s = {}) => (isTeacher() ? (s.activeStudent || '') : null);
/* Nøkkelen for det som lagres per person (opplæringsplan, kjøretimer, kalibrering). Eleven beholder sin gamle nøkkel. */
export const personKey = (s = {}) => (isTeacher() ? (s.activeStudent || '_') : (s.activeDriver || '_'));
/* Navnet turen merkes med når den tas opp */
export const recordDriver = (s = {}) => (isTeacher() ? (s.activeStudent || '') : (s.activeDriver || ''));

/* Lekser fra trafikklæreren: { focus: [øvingsmål-id], note, from, setAt }. Lagres per elev (i trafikklærervisningen
   skriver læreren dem, i skolevisningen ser eleven dem). */
export function homeworkFor(s = {}, name = null) {
  const all = s.homework || {};
  const key = name ?? (isTeacher() ? (s.activeStudent || '') : (s.name || s.activeDriver || ''));
  if (all[key]) return all[key];
  if (!isTeacher()) { const any = Object.values(all).sort((a, b) => String(b.setAt).localeCompare(String(a.setAt)))[0]; if (any) return any; }
  return null;
}
