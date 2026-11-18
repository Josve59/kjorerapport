/* Påminnelse om dagens teori (0.24.0). Eleven velger et klokkeslett, og iPhone-appen legger inn et lokalt varsel for
   hver av de neste dagene (Reminders.swift). Teksten regnes ut her, så den kan si hvor mange dager det er til
   teoriprøven. Listen lages på nytt hver gang appen åpnes og når dagens mål er nådd: da faller dagens varsel bort.
   Ren modul, testes i Node. */

export const REMIND_DAYS = 14;
export const DEFAULT_TIME = '18:00';
const LINES = [
  g => `Dagens mål: ${g} spørsmål. Ti minutter holder.`,
  g => `${g} spørsmål i dag, så holder du rekka.`,
  g => `Klar for dagens teori? ${g} spørsmål venter.`
];
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDiff = (a, iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((new Date(y, m - 1, d) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); };

/* → [{ id: 'YYYY-MM-DD', at: ISO-tid, title, body }] for dagene fra i dag. time 'HH:MM' (lokal tid), today: svar i dag,
   goal: dagens mål, examDate: 'YYYY-MM-DD' eller ''. Etter prøvedagen kommer ingen flere. */
export function planReminders({ time = DEFAULT_TIME, now = Date.now(), today = 0, goal = 10, examDate = '', days = REMIND_DAYS } = {}) {
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(time) ? time.split(':').map(Number) : DEFAULT_TIME.split(':').map(Number);
  const base = new Date(now), out = [];
  const exam = /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? examDate : '';
  for (let d = 0; d < days; d++) {
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d, hh, mm);
    if (d === 0 && (at.getTime() <= now || today >= goal)) continue;   // i dag: allerede passert, eller målet er nådd
    const left = exam ? dayDiff(at, exam) : null;
    if (left !== null && left < 0) break;
    const body = left === 0 ? 'Teoriprøven er i dag. Lykke til!'
      : left === 1 ? 'Teoriprøven er i morgen. Ta en siste runde med feilene dine.'
      : left !== null ? `Teoriprøven om ${left} dager. Dagens mål: ${goal} spørsmål.`
      : LINES[d % LINES.length](goal);
    out.push({ id: key(at), at: at.toISOString(), title: 'Dagens teori', body });
    if (left === 0) break;
  }
  return out;
}
