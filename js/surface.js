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

const MU_DRY = 0.9, FLOOR = 0.4;
/* Faktor på grensene for brå og kraftig bremsing/gass/sving: 1 på tørt, lavere på glatt føre */
export function surfaceFactor(id) {
  const s = SURFACES.find(x => x.id === id);
  if (!s) return 1;
  return Math.max(FLOOR, Math.sqrt(s.mu / MU_DRY));
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
