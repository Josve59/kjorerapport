/* Føre (0.12.0): ledsageren velger føret før turen. Det gir en skala over hvor mye som er kjørt på glatt føre
   (som veityper og lysforhold), og vurderingen av bremsing, gass og svinger tilpasses grepet.
   Friksjonstallene er midten av typiske verdier fra Statens vegvesens Teknologirapport 2493 «Salting av veger»
   (SINTEF 2007, tabell 3): tørr asfalt 0,8–1,0, våt asfalt 0,4–0,9, hardpakket snø 0,2–0,3, is 0,1–0,3 (våt is 0,1–0,15).
   Vinterkravet i Statens vegvesens håndbok R610 er friksjon over 0,25 på riksvei med snø og is. Bremselengden øker
   med 1/friksjon: på våt is blir den rundt sju ganger så lang som på tørr asfalt. Brå bremsing på glatt vei bruker en større del av
   grepet enn samme bremsing på tørr vei, så grensene for «brå» og «kraftig» skaleres ned med friksjonen. Skaleringen
   er dempet (kvadratroten av forholdet) og har et gulv, så små rykk og målestøy ikke blir hendelser på is.
   Ren modul, testes i Node. */

export const SURFACES = [
  { id: 'dry', label: 'Tørt', short: 'Tørt', mu: 0.9, icon: 'sun' },
  { id: 'wet', label: 'Vått', short: 'Vått', mu: 0.65, icon: 'drop' },
  { id: 'snow', label: 'Snø eller slaps', short: 'Snø', mu: 0.25, icon: 'snow' },
  { id: 'ice', label: 'Is', short: 'Is', mu: 0.15, icon: 'snow' }
];
export const SURFACE_LABEL = Object.fromEntries(SURFACES.map(s => [s.id, s.label]));
export const SLIPPERY = new Set(['snow', 'ice']);

/* Faktor på grensene for brå og kraftig bremsing/gass/sving: 1 på tørt, lavere på glatt føre.
   0.26.2: mye mildere. Før var faktoren √(μ/0,9), aldri under 0,4, altså 0,41 på is og 0,53 på snø. Grensene i
   analysis.js er satt etter vanlig kjøring, og poengene faller fort når de senkes: på «Is» ble vanlige nedbremsinger
   (0,18 g) og rundkjøringer hendelser, og gode turer fikk 25 poeng (19. nov. kl. 20.05: 71 hendelser, 95 poeng med
   tørre grenser; 12. nov. kl. 09.49: 25 mot 98). Selv faktor 0,7 ga 53 og 70 poeng på to vanlige tørre turer.
   Nå er grensene høyst 15 % lavere: litt strengere på glatt føre, uten at vanlig kjøring blir feil. */
const FACTOR = { dry: 1, wet: 0.95, snow: 0.88, ice: 0.85 };
export function surfaceFactor(id) {
  return Object.hasOwn(FACTOR, id) ? FACTOR[id] : 1;
}

/* Stemmer føret med målingene (0.26.2)? På is (μ 0,15) går det ikke an å bremse eller svinge med 0,3 g uten å skli.
   Har minst tre hendelser mer enn 1,3 × friksjonen for føret, var veien trolig mindre glatt enn valgt.
   events: rapportens hendelser ({ g }). → { n, maxG } eller null */
export function surfaceDoubt(events, id) {
  const s = SURFACES.find(x => x.id === id);
  if (!s || !SLIPPERY.has(id)) return null;
  const over = (events || []).filter(e => e && Number.isFinite(e.g) && e.g > s.mu * 1.3);
  return over.length >= 3 ? { n: over.length, maxG: Math.max(...over.map(e => e.g)) } : null;
}

/* Forslag til føre når turen starter: det som ble valgt sist samme dag, ellers tørt fra april til oktober og ingen
   forslag om vinteren (da må ledsageren velge). */
export function suggestSurface(last, now = new Date()) {
  if (last && last.id && last.day === dayKey(now) && SURFACES.some(x => x.id === last.id)) return last.id;
  return [10, 11, 0, 1, 2].includes(now.getMonth()) ? '' : 'dry';
}
export const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/* Tiden på turen fordelt på føre (hele turen har samme føre). Ukjent føre (eldre turer) telles som «unknown». */
export function surfaceSplit(id, sec) {
  const out = { dry: 0, wet: 0, snow: 0, ice: 0, unknown: 0 };
  out[SURFACES.some(x => x.id === id) ? id : 'unknown'] += sec;
  return out;
}

export const SOURCES = [
  'Statens vegvesen, Teknologirapport 2493 «Salting av veger» (SINTEF 2007), tabell 3',
  'Statens vegvesen, håndbok R610 «Standard for drift og vedlikehold av riksveger», vinterdrift',
  'Trygg Trafikk: bremselengden på snø er minst dobbelt så lang som på tørr asfalt'
];
