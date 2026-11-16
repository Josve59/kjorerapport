/* «Hvem kjører først?» (0.22.0). Eieren ønsket at det skulle være lettere og morsommere å øve, med animasjoner.
   Eleven trykker på trafikantene i den rekkefølgen de kjører, og ser så krysset spilles av (crossanim.js).
   Hvert kryss bygger på et vikepliktspørsmål i theory-b.js (qid), som er faktasjekket mot trafikkreglene:
   rekkefølgen og forklaringen skal si det samme som det spørsmålet. Tegningene er scene:<scene> i trafficsvg.js. */
import { isWrong } from './theory.js';

const C = (id, lvl, qid, intro, order, steps, why, ref) => ({ id, scene: id, lvl, qid, intro, order: order.map(x => [].concat(x)), steps, why, ref });

export const CROSS_PUZZLES = [
  C('hoyre', 1, 'v01', 'Krysset har ingen skilt eller lys. Begge bilene skal rett fram.', ['B', 'A'],
    ['B kommer fra høyre for A og kjører først.', 'A har vikeplikt og kjører når B har passert.'],
    'Uten skilt eller lys gjelder høyreregelen: du har vikeplikt for kjøretøy som kommer fra høyre.', 'Trafikkreglene § 7 nr. 2'),
  C('venstresving', 1, 'v02', 'A skal svinge til venstre. B kommer imot og skal rett fram.', ['B', 'A'],
    ['B kjører rett fram og har ingen å vike for.', 'A svinger til venstre når B har passert.'],
    'Den som svinger til venstre, har vikeplikt for møtende som skal rett fram eller til høyre.', 'Trafikkreglene § 7 nr. 2'),
  C('parkering', 1, 'v04', 'B skal kjøre ut fra en parkeringsplass. A kjører på veien.', ['A', 'B'],
    ['A kjører videre på veien.', 'B har vikeplikt fra parkeringsplassen og kjører ut når A har passert.'],
    'Den som kommer fra parkeringsplass, eiendom, bensinstasjon og lignende, har vikeplikt for all annen trafikk. Det gjelder selv om B kommer fra høyre for A.', 'Trafikkreglene § 7 nr. 4'),
  C('gangfelt', 1, 'v08', 'Det er ingen trafikklys ved gangfeltet. Fotgjengeren er på vei ut i det.', ['P', 'A'],
    ['Fotgjengeren går over.', 'A kjører når gangfeltet er fritt.'],
    'Ved gangfelt uten lys eller politi har du vikeplikt for gående som er i gangfeltet eller på vei ut i det.', 'Trafikkreglene § 9 nr. 2'),
  C('rundkjoring', 1, 'v28', 'Det står vikepliktskilt der A skal kjøre inn. B er allerede i rundkjøringen.', ['B', 'A'],
    ['B er i rundkjøringen og kjører videre.', 'A kjører inn når B har passert.'],
    'Med vikepliktskilt ved innkjøringen viker du for dem som allerede er i rundkjøringen.', 'Skiltforskriften, skilt 202'),
  C('t-kryss', 2, 'v03', 'T-kryss uten skilt. A kjører rett fram på veien som ser ut som hovedveien. B kommer fra sideveien og skal svinge til venstre.', ['B', 'A'],
    ['B kommer fra høyre for A. B skal til venstre, men har ingen møtende å vike for, og kjører først.', 'A kjører når B er ute av krysset.'],
    'Høyreregelen gjelder også i T-kryss og på veier som ser ut som hovedvei, så lenge ingen skilt, lys eller politi sier noe annet. Er sideveien en avkjørsel fra eiendom, parkeringsplass eller gårdsvei, har den som kommer derfra, likevel vikeplikt.', 'Trafikkreglene § 7 nr. 2 og nr. 4'),
  C('buss', 2, 'v06', 'Fartsgrensen er 50 km/t. Bussen blinker for å kjøre ut fra holdeplassen, og A kommer bakfra.', ['bus', 'A'],
    ['Bussen gir tegn og kjører ut fra holdeplassen.', 'A slipper bussen ut og kjører etter.'],
    'På vei med fartsgrense 60 km/t eller lavere har du vikeplikt for buss som gir tegn om at den skal kjøre ut fra holdeplassen. Bussføreren skal likevel unngå fare.', 'Trafikkreglene § 7 nr. 5'),
  C('hoyresving-sykkel', 2, 'v09', 'A skal svinge til høyre. Syklisten på vegskulderen skal rett fram.', ['S', 'A'],
    ['Syklisten fortsetter rett fram.', 'A svinger til høyre når syklisten har passert.'],
    'Den som svinger, har vikeplikt for syklende som skal rett fram, også når de er på skulderen. Se i speilet og over skulderen før du svinger.', 'Trafikkreglene § 7 nr. 3'),
  C('sving-gangfelt', 2, 'v29', 'A skal svinge til høyre. I veien A svinger inn i, går en fotgjenger over gangfeltet.', ['P', 'A'],
    ['Fotgjengeren går over gangfeltet.', 'A svinger når gangfeltet er fritt.'],
    'Ved gangfelt uten lys eller politi har du vikeplikt for gående som er i gangfeltet, også når du svinger.', 'Trafikkreglene § 9 nr. 2'),
  C('sperret', 2, 'v22', 'Feltet til A er sperret av et vegarbeid. B kommer imot i det andre feltet.', ['B', 'A'],
    ['B har fri vei i sitt felt og kjører forbi.', 'A kjører rundt sperringen når B har passert.'],
    'Er en del av veien sperret, har den vikeplikt som har sperringen på sin side.', 'Trafikkreglene § 7 nr. 6'),
  C('gs-vei', 2, 'v26', 'Syklisten kommer fra en gang- og sykkelvei og skal krysse veien. Det er ingen sykkelkryssing.', ['A', 'S'],
    ['A kjører videre på veien.', 'Syklisten har vikeplikt og krysser når A har passert.'],
    'Den som vil inn på eller krysse veien fra sykkelvei, gangvei eller fortau, har vikeplikt for trafikk på veien. Vær likevel forberedt på at syklisten ikke stanser.', 'Trafikkreglene § 7 nr. 4'),
  C('innkjorsel-fortau', 2, 'v25', 'A skal svinge til høyre inn i en innkjørsel over fortauet. En fotgjenger går på fortauet.', ['P', 'A'],
    ['Fotgjengeren går videre på fortauet.', 'A svinger inn når fortauet er fritt.'],
    'Den som krysser fortau, har vikeplikt for gående der, og den som svinger inn over fortau, også for syklende.', 'Trafikkreglene § 7 nr. 3 og § 9 nr. 2'),
  C('kryss-tre', 3, 'v40', 'Krysset har ingen skilt eller lys, og alle tre bilene skal rett fram.', ['B', 'A', 'C'],
    ['B har ingen fra høyre og kjører først.', 'A har ventet på B og kjører så.', 'C har ventet på A og kjører sist.'],
    'Høyreregelen: A har B på sin høyre side, og C har A på sin høyre side. B har ingen fra høyre.', 'Trafikkreglene § 7 nr. 2'),
  C('forkjorsvei-venstre', 3, 'v42', 'Veien fra venstre til høyre er forkjørsvei. A skal svinge til venstre, B kommer imot og skal rett fram, og C står ved vikepliktskiltet i sideveien.', ['B', 'A', 'C'],
    ['B kjører rett fram på forkjørsveien og har ingen å vike for.', 'A svinger til venstre når B har passert.', 'C har vikepliktskilt og kjører til slutt.'],
    'Den som svinger til venstre, har vikeplikt for møtende, også på forkjørsvei. C har vikeplikt for både A og B, selv om C kommer fra As høyre side.', 'Trafikkreglene § 7 nr. 2 og skiltforskriften, skilt 202 og 206'),
  C('utkjorsel-gs', 3, 'v32', 'A kjører ut fra en parkeringsplass, og utkjøringen krysser en gang- og sykkelvei. Syklisten kommer fra høyre.', ['S', 'A'],
    ['Syklisten fortsetter på gang- og sykkelveien.', 'A har vikeplikt fra parkeringsplassen og kjører ut når syklisten har passert.'],
    'Den som kommer fra parkeringsplass, har vikeplikt for alle. Syklende fra sykkelvei har vikeplikt for trafikk på veien, men ikke for kjørende som kommer fra en parkeringsplass.', 'Trafikkreglene § 7 nr. 4 og § 9 nr. 2')
];

/* Navnene på trafikantene, slik de står på knappene og i svaret */
export const MOVER_NAMES = { A: 'Bil A', B: 'Bil B', C: 'Bil C', S: 'Syklisten', P: 'Fotgjengeren', bus: 'Bussen' };
const SHORT = { A: 'A', B: 'B', C: 'C', S: 'syklisten', P: 'fotgjengeren', bus: 'bussen' };
export const PUZZLE_BY_SCENE = new Map(CROSS_PUZZLES.map(p => [p.scene, p]));
export const crossKey = id => 'kx-' + id;   // svarene lagres sammen med teorisvarene, så dagsmålet teller dem

export const flatOrder = pz => pz.order.flat();
export const checkOrder = (pz, tapped) => tapped.length === flatOrder(pz).length && tapped.every((id, i) => id === flatOrder(pz)[i]);
/* «B, så A, så C» */
export function orderText(ids, capital = true) {
  const s = ids.map(id => SHORT[id] || id).join(', så ');
  return capital ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* En runde: de som er feil sist eller ikke prøvd først, de lette før de vanskelige, så resten */
export function pickCross(p, n = 6, rnd = Math.random) {
  const e = pz => (p.q || {})[crossKey(pz.id)];
  const rank = pz => (isWrong(e(pz)) ? 0 : !e(pz) ? 1 : 2);
  return CROSS_PUZZLES.map(pz => ({ pz, k: rank(pz) * 10 + pz.lvl + rnd() * 0.9 }))
    .sort((a, b) => a.k - b.k).slice(0, n).map(x => x.pz);
}
/* Kryss der siste svar var riktig */
export const crossSolved = p => CROSS_PUZZLES.filter(pz => { const e = (p.q || {})[crossKey(pz.id)]; return e && e.run > 0; }).length;
