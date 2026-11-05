/* «Hva må du øve mer på?» (0.12.0, før «Klar for oppkjøring?» fra 0.11.2): appens oversikt over hva som er på plass før oppkjøringen, og hva dere bør øve mer
   på. Bygger på turene (mengde, variasjon, mørke, jevn kjøring, fart, situasjoner, speilblikk) og opplæringsplanen
   (den obligatoriske opplæringen). Det er ikke en vurdering av om eleven består: trafikklæreren avgjør når eleven er
   klar, og sier det tydelig. Målene er appens egne, satt ut fra vanlige råd, og er ment som veiledning.
   rows: ekte turer, nyeste først [{ d, res, log, sp, road }] (som gatherRows i app.js). Ren funksjon, testes i Node. */

export const READY = {
  km: 2000,                // også kravet for rabatt på bilforsikringen hos flere selskaper
  byMin: 60, landMin: 60, motorMin: 30, darkMin: 60,
  recent: 5, minDrives: 3, score: 85,
  speedSecPer10km: 5,
  roundabouts: 10, laneChanges: 10, junctions: 20,
  mirrorsPerMin: 6, laneCheckShare: 0.8
};
// Obligatorisk før oppkjøringen (læreplanen for klasse B): id-ene i opplæringsplanen (insights.js)
export const MANDATORY = ['tgk', 'teori', 'trinn2', 'trinn3', 'bane', 'veg'];
const MANDATORY_LABEL = { tgk: 'trafikalt grunnkurs', teori: 'teoriprøven', trinn2: 'veiledningstime trinn 2', trinn3: 'veiledningstime trinn 3', bane: 'sikkerhetskurs på bane', veg: 'sikkerhetskurs på veg' };

const hm = sec => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} t${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`; };
const list = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}` : a[0] || '');
const nf = n => Math.round(n).toLocaleString('nb-NO').replace(/ /g, ' ');

export function readiness(rows, { plan = {} } = {}) {
  const items = [];
  const sum = f => rows.reduce((s, x) => s + (f(x) || 0), 0);
  const recent = rows.slice(0, READY.recent);

  // 1. Mengde
  const km = sum(x => x.res.stats.km);
  items.push({ id: 'km', group: 'Øving', label: 'Mengde øvelseskjøring', ok: km >= READY.km, have: `${nf(km)} km`, need: `${nf(READY.km)} km`,
    progress: Math.min(1, km / READY.km), tip: `Kjør mer: ${nf(Math.max(0, READY.km - km))} km igjen til ${nf(READY.km)} km, som også er kravet for rabatt på bilforsikringen hos flere selskaper.` });

  // 2. Variasjon: by, landevei, motorvei
  const sec = k => sum(x => (x.log ? x.log.sec[k] : 0));
  const by = sec('by'), land = sec('land'), motor = sec('motor');
  const missing = [by < READY.byMin * 60 ? 'by og tettsted' : null, land < READY.landMin * 60 ? 'landevei' : null, motor < READY.motorMin * 60 ? 'motorvei' : null].filter(Boolean);
  items.push({ id: 'variety', group: 'Øving', label: 'Variert kjøring', ok: !missing.length, have: `by ${hm(by)} · landevei ${hm(land)} · motorvei ${hm(motor)}`,
    need: `by ${READY.byMin} min · landevei ${READY.landMin} min · motorvei ${READY.motorMin} min`,
    progress: (Math.min(1, by / 60 / READY.byMin) + Math.min(1, land / 60 / READY.landMin) + Math.min(1, motor / 60 / READY.motorMin)) / 3,
    tip: missing.length ? `Øv mer på ${list(missing)}.` : '' });

  // 3. Mørke
  const dark = sum(x => (x.log ? x.log.light.dark : 0));
  items.push({ id: 'dark', group: 'Øving', label: 'Kjøring i mørke', ok: dark >= READY.darkMin * 60, have: hm(dark), need: `${READY.darkMin} min`,
    progress: Math.min(1, dark / 60 / READY.darkMin), tip: 'Ta noen kveldsturer, gjerne på landevei uten gatelys.' });

  // 4. Jevn kjøring de siste turene
  if (recent.length >= READY.minDrives) {
    const avg = Math.round(recent.reduce((s, x) => s + x.res.overall, 0) / recent.length);
    const harsh = recent.slice(0, 3).reduce((s, x) => s + x.res.events.filter(e => e.level === 'harsh').length, 0);
    items.push({ id: 'smooth', group: 'Kjøringen', label: 'Jevn og rolig kjøring', ok: avg >= READY.score && harsh === 0,
      have: `snitt ${avg} poeng siste ${recent.length} turer${harsh ? ` · ${harsh} kraftige hendelser siste 3` : ''}`, need: `minst ${READY.score} poeng, ingen kraftige hendelser`,
      progress: Math.min(1, avg / READY.score) * (harsh ? 0.8 : 1), tip: harsh ? 'Se på de kraftige hendelsene i rapportene: hvor skjedde de, og hva kunne vært gjort tidligere?' : 'Øv på å bremse og gi gass mykere: se langt fram og slipp gassen tidlig.' });
  } else items.push({ id: 'smooth', group: 'Kjøringen', label: 'Jevn og rolig kjøring', ok: null, have: `${recent.length} ${recent.length === 1 ? 'tur' : 'turer'}`, need: `${READY.minDrives} turer`, progress: recent.length / READY.minDrives, tip: '' });

  // 5. Fart: tid over fartsgrensen (krever Veidata)
  const withSp = recent.filter(x => x.sp);
  if (withSp.length) {
    const kmSp = withSp.reduce((s, x) => s + x.res.stats.km, 0), over = withSp.reduce((s, x) => s + x.sp.secondsOver, 0);
    const per10 = kmSp > 0 ? over / kmSp * 10 : 0;
    const serious = withSp.reduce((s, x) => s + (x.sp.episodes || []).filter(e => e.over >= 10).length, 0);
    items.push({ id: 'speed', group: 'Kjøringen', label: 'Holder fartsgrensen', ok: per10 < READY.speedSecPer10km && serious === 0,
      have: `${Math.round(per10)} s over grensen per 10 km${serious ? ` · ${serious} ganger 10 km/t eller mer over` : ''}`, need: `under ${READY.speedSecPer10km} s per 10 km`,
      progress: per10 <= READY.speedSecPer10km ? 1 : READY.speedSecPer10km / per10, tip: 'Følg med på skiltene og fartsmåleren, særlig der grensen går ned.' });
  } else items.push({ id: 'speed', group: 'Kjøringen', label: 'Holder fartsgrensen', ok: null, have: 'ingen fartsgrenser hentet', need: '', progress: 0, tip: 'Slå på «Veidata» i Innstillinger, så sammenligner appen farten med fartsgrensen.' });

  // 6. Situasjoner: rundkjøringer, feltskifter, kryss med vikeplikt eller stopp
  const rb = sum(x => ((x.road && x.road.roundabouts) || (x.res.maneuvers && x.res.maneuvers.roundabouts) || []).length);
  const lc = sum(x => ((x.res.maneuvers && x.res.maneuvers.laneChanges) || []).length);
  const hasRoad = rows.some(x => x.road);
  const jn = sum(x => ((x.road && x.road.giveway) || []).length + ((x.road && x.road.stops) || []).length);
  const sitMissing = [rb < READY.roundabouts ? 'rundkjøringer' : null, lc < READY.laneChanges ? 'to felt i samme retning, så dere kan øve på feltskifte' : null, hasRoad && jn < READY.junctions ? 'kryss med vikeplikt' : null].filter(Boolean);
  items.push({ id: 'situations', group: 'Kjøringen', label: 'Rundkjøringer, feltskifte og kryss', ok: !sitMissing.length,
    have: `${rb} ${rb === 1 ? 'rundkjøring' : 'rundkjøringer'} · ${lc} ${lc === 1 ? 'feltskifte' : 'feltskifter'}${hasRoad ? ` · ${jn} kryss` : ''}`, need: `${READY.roundabouts} rundkjøringer · ${READY.laneChanges} feltskifter${hasRoad ? ` · ${READY.junctions} kryss` : ''}`,
    progress: (Math.min(1, rb / READY.roundabouts) + Math.min(1, lc / READY.laneChanges) + (hasRoad ? Math.min(1, jn / READY.junctions) : 1)) / 3,
    tip: sitMissing.length ? `Velg en rute med flere ${list(sitMissing)}.` : '' });

  // 7. Speil og skulderblikk (bare når kameraet har vært med)
  const cams = recent.filter(x => x.res.camera && x.res.camera.calibrated && x.res.camera.frontShare >= 0.5).slice(0, 3);
  if (cams.length) {
    const perMin = cams.reduce((s, x) => s + x.res.camera.perMin, 0) / cams.length;
    const checks = cams.flatMap(x => x.res.camera.lane || []).filter(l => l.mirror !== null);   // andelen teller fra 3 feltskifter
    const share = checks.length >= 3 ? checks.filter(l => l.mirror && l.shoulder !== false).length / checks.length : null;
    const ok = perMin >= READY.mirrorsPerMin && (share === null || share >= READY.laneCheckShare);
    items.push({ id: 'mirrors', group: 'Kjøringen', label: 'Speil og skulderblikk', ok,
      have: `${perMin.toFixed(1).replace('.', ',')} speilblikk i minuttet${share !== null ? ` · ${Math.round(share * 100)} % av feltskiftene med speil og skulder` : ''}`,
      need: `${READY.mirrorsPerMin} i minuttet${share !== null ? ', 80 % av feltskiftene' : ''}`, progress: share === null ? Math.min(1, perMin / READY.mirrorsPerMin) : (Math.min(1, perMin / READY.mirrorsPerMin) + Math.min(1, share / READY.laneCheckShare)) / 2,
      tip: 'Sjekk speilene hvert 5.–8. sekund, og alltid speil og skulder før feltskifte og avkjøring.' });
  } else items.push({ id: 'mirrors', group: 'Kjøringen', label: 'Speil og skulderblikk', ok: null, have: 'kameraet ikke brukt', need: '', progress: 0, tip: 'Bruk kameraet på noen turer, så ser appen om speilene sjekkes.' });

  // 8. Obligatorisk opplæring (krysset av i opplæringsplanen)
  const doneM = MANDATORY.filter(id => plan[id] && plan[id].done);
  const left = MANDATORY.filter(id => !doneM.includes(id)).map(id => MANDATORY_LABEL[id]);
  items.push({ id: 'mandatory', group: 'Opplæringen', label: 'Obligatorisk opplæring', ok: !left.length, have: `${doneM.length} av ${MANDATORY.length} krysset av`, need: `${MANDATORY.length} av ${MANDATORY.length}`,
    progress: doneM.length / MANDATORY.length, tip: left.length ? `Gjenstår: ${left.join(', ')}. Kryss av i Opplæring når det er gjort.` : '' });

  const counted = items.filter(i => i.ok !== null), done = counted.filter(i => i.ok).length;
  const level = rows.length < READY.minDrives ? 'tidlig' : done === counted.length ? 'klar' : done >= counted.length - 2 ? 'nesten' : 'ikke';
  const next = items.filter(i => i.ok === false && i.tip).slice(0, 3);
  return { items, done, counted: counted.length, level, next };
}

export const READY_TEXT = {
  tidlig: { title: 'For tidlig å si', text: 'Kjør noen turer til, så viser appen hva som er på plass og hva dere bør øve på.' },
  ikke: { title: 'Ikke klar ennå', text: 'Fortsett å øve. Punktene under viser hva som gjenstår.' },
  nesten: { title: 'Nesten der', text: 'Det meste er på plass. Øv på det som gjenstår, og snakk med trafikklæreren om når oppkjøringen kan bestilles.' },
  klar: { title: 'Ser klar ut', text: 'Alt appen kan måle, er på plass. Snakk med trafikklæreren om å bestille oppkjøring.' }
};
