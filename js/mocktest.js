/* Prøve-oppkjøring (1.1.0): en tur vurdert omtrent slik som på førerprøven, i de områdene appen kan se. Det er ikke
   sensorens vurdering: appen ser bare det GPS, bevegelse, kamera, mikrofon og veidata får med seg, og sier fra om det
   den ikke kan se. Feil som ofte gir stryk på førerprøven (for høy fart, rulling gjennom stopp, for fort inn i kryss,
   farlige situasjoner) gjør at turen ikke er «klar».
   r: analysen, sits: situasjonene (buildSituations), sp: fart mot fartsgrensene, road: veidata vurdert mot turen.
   Ren funksjon, testes i Node. → { verdict: 'bra'|'nesten'|'ikke', areas: [{ id, label, state, text }], minutes, short } */

export const MOCK_MIN = 20;   // en prøve-oppkjøring bør vare rundt 25 minutter kjøring

const count = (sits, kind, levels) => sits.filter(s => s.kind === kind && levels.includes(s.level)).length;
const times = n => (n === 1 ? 'én gang' : `${n} ganger`);

export function mockTest(r, { sits = [], sp = null, road = null } = {}) {
  const areas = [];
  const add = (id, label, state, text, serious = false) => areas.push({ id, label, state, text, serious });

  // 1. Fart: over fartsgrensen, og fart inn i kryss uten skilt
  if (sp) {
    const big = (sp.episodes || []).filter(e => e.maxKmh - e.limit >= 10);
    const per10 = r.stats.km > 0 ? sp.secondsOver / r.stats.km * 10 : 0;
    if (big.length) add('speed', 'Fart og fartsgrenser', 'øv', `${times(big.length)} 10 km/t eller mer over fartsgrensen. Det gir ofte stryk.`, true);
    else if (per10 >= 5) add('speed', 'Fart og fartsgrenser', 'øv', `Litt over fartsgrensen ${Math.round(sp.secondsOver)} s til sammen. Følg med på skiltene.`);
    else add('speed', 'Fart og fartsgrenser', 'ok', 'Holdt fartsgrensene.');
  } else add('speed', 'Fart og fartsgrenser', 'ukjent', 'Fartsgrensene ble ikke hentet. Slå på «Fartsgrense og veidata».');

  // 2. Kryss og vikeplikt: stoppskilt, kryss uten skilt (høyreregelen)
  if (road) {
    const rolled = (road.stops || []).filter(x => !x.full).length;
    const jHigh = count(sits, 'junction', ['high']), jMed = count(sits, 'junction', ['medium']);
    const parts = [];
    if (rolled) parts.push(`stoppet ikke helt ved stoppskiltet ${times(rolled)}`);
    if (jHigh + jMed) parts.push(`for fort inn i kryss uten skilt ${times(jHigh + jMed)}`);
    const seen = (road.stops || []).length + (road.giveway || []).length + (road.junctions || []).length + (road.signals || []).length;
    if (parts.length) add('junctions', 'Kryss og vikeplikt', 'øv', `${parts.join(', ').replace(/^./, c => c.toUpperCase())}.`, rolled > 0 || jHigh > 0);
    else add('junctions', 'Kryss og vikeplikt', seen ? 'ok' : 'ukjent', seen ? `${seen} kryss uten feil appen kan se.` : 'Ingen kryss med skilt eller lys på turen.');
  } else add('junctions', 'Kryss og vikeplikt', 'ukjent', 'Veidataene ble ikke hentet.');

  // 3. Observasjon: speil, skulderblikk og blikket på veien (førerkameraet)
  const cam = r.camera && r.camera.calibrated ? r.camera : null;
  if (cam) {
    const awayHigh = count(sits, 'away', ['high']);
    const laneMiss = count(sits, 'lane', ['medium']);
    const parts = [];
    if (awayHigh) parts.push(`blikket lenge borte fra veien ${times(awayHigh)}`);
    if (laneMiss) parts.push(`feltskifte uten speil ${times(laneMiss)}`);
    if (Number.isFinite(cam.perMin) && cam.perMin < 4) parts.push(`få speilblikk (${String(Math.round(cam.perMin * 10) / 10).replace('.', ',')} i minuttet)`);
    if (parts.length) add('observe', 'Speil, skulderblikk og blikk', 'øv', `${parts.join(', ').replace(/^./, c => c.toUpperCase())}.`, awayHigh > 0);
    else add('observe', 'Speil, skulderblikk og blikk', 'ok', 'Speil og skulderblikk der det trengtes, og blikket på veien.');
  } else add('observe', 'Speil, skulderblikk og blikk', 'ukjent', 'Førerkameraet var ikke med. På førerprøven er dette noe av det sensor ser mest etter.');

  // 4. Feltskifte, påkjøring og blinklys
  {
    const merges = sits.filter(s => s.kind === 'merge'), slow = merges.filter(s => s.level === 'medium').length;
    const blinks = sits.filter(s => s.kind === 'blink'), missed = blinks.filter(s => s.level !== 'ok').length;
    const parts = [];
    if (slow) parts.push(`for lav fart på påkjøringen ${times(slow)}`);
    if (blinks.length >= 3 && missed / blinks.length > 0.3) parts.push(`hørte ikke blinklyset ${missed} av ${blinks.length} ganger`);
    const known = merges.length + blinks.length + ((r.maneuvers && r.maneuvers.laneChanges) || []).length;
    if (parts.length) add('lanes', 'Feltskifte, påkjøring og blinklys', 'øv', `${parts.join(', ').replace(/^./, c => c.toUpperCase())}.`);
    else add('lanes', 'Feltskifte, påkjøring og blinklys', known ? 'ok' : 'ukjent', known ? 'Ingen feil appen kan se.' : 'Ingen feltskifter eller påkjøringer på turen.');
  }

  // 5. Avstand til bilen foran (veikameraet)
  if (r.road) {
    const high = count(sits, 'close', ['high']), med = count(sits, 'close', ['medium']);
    if (high || med >= 2) add('distance', 'Avstand til bilen foran', 'øv', `For kort avstand ${times(high + med)}. Hold minst 2 sekunder.`, high > 0);
    else add('distance', 'Avstand til bilen foran', 'ok', 'God avstand til bilen foran.');
  } else add('distance', 'Avstand til bilen foran', 'ukjent', 'Veikameraet var ikke med.');

  // 6. Gangfelt og myke trafikanter
  {
    const high = count(sits, 'crossing', ['high']), med = count(sits, 'crossing', ['medium']);
    const n = road ? (road.crossings || []).length : 0;
    if (high || med) add('crossing', 'Gangfelt', 'øv', `For høy fart ved gangfelt ${times(high + med)}${high ? ', med folk i nærheten' : ''}.`, high > 0);
    else add('crossing', 'Gangfelt', n ? 'ok' : 'ukjent', n ? `${n} gangfelt passert i rolig fart.` : 'Ingen gangfelt appen vet om på turen.');
  }

  // 7. Jevn og rolig kjøring
  {
    const harsh = (r.events || []).filter(e => e.level === 'harsh').length;
    const per10 = r.stats.km > 0 ? (r.events || []).length / r.stats.km * 10 : 0;
    if (harsh) add('smooth', 'Jevn og rolig kjøring', 'øv', `${times(harsh)} kraftig bremsing, gass eller sving.`, (r.events || []).some(e => e.level === 'harsh' && e.kind === 'brake'));
    else if (per10 > 3) add('smooth', 'Jevn og rolig kjøring', 'øv', `${(r.events || []).length} brå hendelser. Se langt fram og planlegg tidligere.`);
    else add('smooth', 'Jevn og rolig kjøring', 'ok', 'Jevn og rolig.');
  }

  const minutes = Math.round((r.stats.duration || 0) / 60);
  const serious = areas.some(a => a.serious) || sits.some(s => s.level === 'high');
  const work = areas.some(a => a.state === 'øv');
  // «Ser bra ut» bare når fart og kryss er målt og minst fire områder er kjent (1.1.1): uten nett og kamera visste
  // appen nesten ingenting, men sa likevel «bra»
  const known = areas.filter(a => a.state !== 'ukjent').length;
  const enough = known >= 4 && ['speed', 'junctions'].every(id => areas.find(a => a.id === id).state !== 'ukjent');
  return { verdict: serious ? 'ikke' : work ? 'nesten' : enough ? 'bra' : 'ukjent', areas, minutes, short: minutes < MOCK_MIN, known, total: areas.length };
}

export const MOCK_TEXT = {
  bra: { title: 'Ser bra ut', text: 'Appen fant ingen feil som ofte gir stryk. Sensor på førerprøven ser mer enn appen, så snakk med trafikklæreren om hvor klar eleven er.' },
  nesten: { title: 'Nesten', text: 'Ingen alvorlige feil, men noe å øve mer på før oppkjøringen.' },
  ikke: { title: 'Ikke klar ennå', text: 'Appen fant feil som ofte gir stryk på førerprøven. Øv på dem og ta en ny prøve-oppkjøring.' },
  ukjent: { title: 'For lite målt', text: 'Appen fant ingen feil, men fikk ikke målt nok til å si om turen ville holdt. Slå på «Fartsgrense og veidata», og bruk gjerne kameraet.' }
};
