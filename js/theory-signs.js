/* Skiltprøven (0.15.0): skiltene en bilfører må kjenne, med navn og betydning etter skiltforskriften
   (FOR-2005-10-07-1219, §§ 4–12). Navnene er forskriftens egne. Betydningen er skrevet kort, ut fra forskriftens tekst
   og trafikkreglene. Tegningene ligger i trafficsvg.js (nøkkelen i img).
   Spørsmålene lages fra listen: «Hva betyr dette skiltet?» med navnet som riktig svar (indeks 0, som i theory-b.js)
   og tre andre skilt fra samme gruppe som gale svar. Rene data, testes i Node. */
import { rng, shuffle } from './theory.js';

export const SIGN_GROUPS = [
  { id: 'fare', title: 'Fareskilt', blurb: 'Røde trekanter. Varsler om særlig fare: senk farten og vær klar.' },
  { id: 'vike', title: 'Vikeplikt- og forkjørsskilt', blurb: 'Hvem som skal vike i krysset.' },
  { id: 'forbud', title: 'Forbudsskilt', blurb: 'Runde skilt med rød kant. De fleste gjelder fram til nærmeste kryss.' },
  { id: 'pabud', title: 'Påbudsskilt', blurb: 'Runde blå skilt: det du skal gjøre.' },
  { id: 'opplysning', title: 'Opplysningsskilt', blurb: 'Blå firkanter: særlige regler som gjelder på stedet.' }
];

const S = (id, g, name, meaning, img = 'sign:' + id) => ({ id, g, name, meaning, img });

export const SIGNS = [
  // Fareskilt, § 4
  S('100', 'fare', 'Farlig sving', 'Varsler om en farlig sving. Pilen viser hvilken vei svingen går. Tilpass farten før svingen, ikke i den.'),
  S('102', 'fare', 'Farlige svinger', 'Varsler om flere farlige svinger etter hverandre. Den første svingen går den veien symbolet viser.'),
  S('104', 'fare', 'Bratt bakke', 'Varsler om bratt bakke. Tallet viser stigningen eller fallet i prosent.'),
  S('106', 'fare', 'Smalere veg', 'Varsler om at vegen blir smalere. Vær klar til å slippe fram møtende.'),
  S('108', 'fare', 'Ujevn veg', 'Varsler om ujevn veg, for eksempel humper, telehiv eller hull.'),
  S('109', 'fare', 'Fartshump', 'Varsler om fartshump eller annen fartsdemper i vegen.'),
  S('110', 'fare', 'Vegarbeid', 'Varsler om vegarbeid. Det kan være folk, maskiner og løs grus i vegen. Ved vegarbeid kan fareskiltene ha gul bunn.'),
  S('114', 'fare', 'Rasfare', 'Varsler om fare for ras av stein, jord eller snø, og om at det kan ligge stein eller snø i kjørebanen.'),
  S('116', 'fare', 'Glatt kjørebane', 'Varsler om fare for glatt kjørebane på grunn av særlige forhold, for eksempel is i en skyggefull sving.'),
  S('122', 'fare', 'Tunnel', 'Varsler om tunnel. I tunnelen er det forbudt å stanse.'),
  S('124', 'fare', 'Farlig vegkryss', 'Varsler om et farlig kryss der vanlig vikeplikt gjelder: du har vikeplikt for kjørende fra høyre.'),
  S('126', 'fare', 'Rundkjøring', 'Varsler om rundkjøring lenger fram.'),
  S('132', 'fare', 'Trafikklyssignal', 'Varsler om trafikklys som du ellers kunne se for sent.'),
  S('134', 'fare', 'Planovergang med bom', 'Varsler om planovergang med bom: der jernbanen krysser vegen. Det er forbudt å stanse nærmere planovergangen enn 5 meter.'),
  S('138', 'fare', 'Jernbanespor', 'Står der jernbane eller forstadsbane krysser vegen i plan. Se etter tog i begge retninger.'),
  S('140', 'fare', 'Avstand til gangfelt', 'Varsler om gangfelt lenger fram, der du ellers ikke ser det i god tid.'),
  S('142', 'fare', 'Barn', 'Varsler om sted der barn ofte ferdes eller er, for eksempel ved skole, barnehage eller lekeplass.'),
  S('144', 'fare', 'Syklende', 'Varsler om sted der syklende ofte krysser eller kjører ut i vegen, eller om syklende i tunnel.'),
  S('146', 'fare', 'Dyr', 'Varsler om at dyr ofte krysser eller går langs vegen. Symbolet viser hvilket dyr, her elg.'),
  S('148', 'fare', 'Møtende trafikk', 'Varsler om at kjørebanen har trafikk i begge retninger, for eksempel etter en strekning med midtdeler.'),
  S('152', 'fare', 'Sidevind', 'Varsler om sted der det ofte blåser sterk sidevind.'),
  S('156', 'fare', 'Annen fare', 'Varsler om en annen fare. Hva slags fare, står på et underskilt.'),
  // Vikeplikt- og forkjørsskilt, § 6
  S('202', 'vike', 'Vikeplikt', 'Du har vikeplikt for kjørende trafikk i begge retninger på vegen du kommer inn på.'),
  S('204', 'vike', 'Stopp', 'Du skal stanse helt ved stopplinjen, eller så nær kryssende veg som mulig, og har vikeplikt for kjørende i begge retninger.'),
  S('206', 'vike', 'Forkjørsveg', 'Du kjører på forkjørsveg: de som kommer fra sideveger og kryssende veger, har vikeplikt for deg. Gjelder til skilt 208, 202 eller 204.'),
  S('208', 'vike', 'Slutt på forkjørsveg', 'Forkjørsvegen slutter. Etter skiltet gjelder vanlig vikeplikt for kjørende fra høyre, om ikke annet er skiltet.'),
  S('212', 'vike', 'Vikeplikt overfor møtende kjørende', 'Forbudt å kjøre inn på den smale strekningen hvis møtende blir hindret. Den røde pilen er din retning: du venter på dem som kommer imot.'),
  S('214', 'vike', 'Møtende kjørende har vikeplikt', 'Møtende har vikeplikt for deg på den smale strekningen (de har skilt 212). Kjør likevel varsomt: noen kan allerede være på vei inn.'),
  S('210', 'vike', 'Forkjørskryss', 'Varsler om kryss der de som kommer fra sidevegen eller kryssende veg, har vikeplikt for deg.'),
  // Forbudsskilt, § 8
  S('302', 'forbud', 'Innkjøring forbudt', 'Forbudt å kjøre forbi skiltet. Står typisk der en enveiskjørt gate har utkjøring.'),
  S('306', 'forbud', 'Forbudt for alle kjøretøy', 'Trafikkforbud: forbudt å kjøre forbi skiltet med kjøretøy av alle slag.'),
  S('330', 'forbud', 'Svingeforbud', 'Forbudt å svinge den veien pilen viser. Gjelder i krysset skiltet står i eller ved.'),
  S('332', 'forbud', 'Vendingsforbud', 'Forbudt å vende (snu). Gjelder til og med første kryss.'),
  S('334', 'forbud', 'Forbikjøringsforbud', 'Forbudt å kjøre forbi motorvogn med flere enn to hjul. Gjelder til skilt 336, eller så langt underskiltet sier.'),
  S('336', 'forbud', 'Slutt på forbikjøringsforbud', 'Forbikjøringsforbudet slutter. Forbikjøring er igjen lov der det ellers er trygt og tillatt.'),
  S('362', 'forbud', 'Fartsgrense', 'Forbudt å kjøre fortere enn tallet. Gjelder til ny fartsgrense, skilt 364, fartsgrensesone, gatetun eller gågate. Gul bunn betyr midlertidig fartsgrense.', 'sign:362:60'),
  S('364', 'forbud', 'Slutt på særskilt fartsgrense', 'Den skiltede fartsgrensen slutter. Da gjelder den generelle: 50 km/t i tettbygd strøk og 80 km/t utenfor.', 'sign:364:60'),
  S('366', 'forbud', 'Fartsgrensesone', 'Hele området innenfor har fartsgrensen på skiltet, til skilt 368, gatetun eller gågate. Varsler også at det kan være fartshumper.', 'sign:366:30'),
  S('368', 'forbud', 'Slutt på fartsgrensesone', 'Fartsgrensesonen slutter. Se etter nytt fartsgrenseskilt, ellers gjelder den generelle fartsgrensen.', 'sign:368:30'),
  S('370', 'forbud', 'Stans forbudt', 'Forbudt å stanse på den siden av vegen skiltet står, fram til nærmeste kryss eller nytt skilt.'),
  S('372', 'forbud', 'Parkering forbudt', 'Forbudt å parkere på den siden av vegen skiltet står, fram til nærmeste kryss eller nytt skilt. Kortest mulig stans for å slippe av eller ta på folk eller varer er lov.'),
  // Påbudsskilt, § 10
  S('402', 'pabud', 'Påbudt kjøreretning', 'Du skal forlate krysset i den retningen pilen viser.'),
  S('404', 'pabud', 'Påbudt kjørefelt', 'Du skal kjøre forbi skiltet på den siden pilen peker mot.'),
  S('406', 'pabud', 'Påbudt rundkjøring', 'Du kjører inn i en rundkjøring og skal kjøre rundt i pilenes retning.'),
  // Opplysningsskilt, § 12
  S('502', 'opplysning', 'Motorveg', 'Reglene for motorveg gjelder: det er forbudt å stanse, rygge og vende, og bare motorvogn som lovlig kan kjøre minst 40 km/t, får kjøre der. Gjelder til skilt 504 «Slutt på motorveg».'),
  S('503', 'opplysning', 'Motortrafikkveg', 'Reglene for motortrafikkveg gjelder: som på motorveg er det forbudt å stanse, rygge og vende, og bare motorvogn som lovlig kan kjøre minst 40 km/t, får kjøre der.'),
  S('516', 'opplysning', 'Gangfelt', 'Kryssingssted for gående. Du har vikeplikt for gående som er ute i gangfeltet eller på vei ut i det.'),
  S('518', 'opplysning', 'Gangveg', 'Vei som er laget for gående. Det er forbudt å kjøre bil der.'),
  S('520', 'opplysning', 'Sykkelveg', 'Vei som er laget for syklende og elsparkesykler. Andre kjørende får ikke bruke den.'),
  S('522', 'opplysning', 'Gang- og sykkelveg', 'Vei for gående, syklende og elsparkesykler. Det er forbudt å kjøre bil der.'),
  S('524', 'opplysning', 'Møteplass', 'Sted på smal veg der kjøretøy kan møtes. Det er forbudt å parkere på møteplassen.'),
  S('526', 'opplysning', 'Envegskjøring', 'Kjøring er bare lov i pilens retning, fram til første kryss.'),
  S('527', 'opplysning', 'Blindveg', 'Vegen er stengt lenger fram, så du kommer ikke gjennom.'),
  S('540', 'opplysning', 'Gatetun', 'Området er et gatetun: du kjører ikke fortere enn gangfart, har vikeplikt for gående og parkerer bare på merkede plasser. Gjelder til skilt 542 «Slutt på gatetun».'),
  S('548', 'opplysning', 'Gågate', 'Forbudt å kjøre motorvogn, unntatt elsparkesykkel, om ikke et underskilt gir unntak. Den som har lov til å kjøre der, holder gangfart og har vikeplikt for gående. Parkering er forbudt.'),
  S('552', 'opplysning', 'Parkering', 'Parkering er tillatt her, så lenge det ikke bryter med reglene om stans og parkering. Underskilt kan gi tid og vilkår.'),
  S('556', 'opplysning', 'Automatisk trafikkontroll', 'Farten blir målt med kamera på stedet (fotoboks).')
];

/* Grupper som ligner, når en gruppe har for få skilt til tre gale svar */
const NEAR = { pabud: ['forbud'], vike: ['forbud', 'fare'], fare: ['vike'], forbud: ['pabud'], opplysning: ['pabud'] };

/* Ett spørsmål per skilt. Gale svar trekkes med frø fra skiltets nummer, så spørsmålet er det samme hver gang. */
export const SIGN_QUESTIONS = SIGNS.map(s => {
  const rand = rng(+s.id * 7919);
  const same = shuffle(SIGNS.filter(x => x.g === s.g && x.id !== s.id), rand);
  const near = shuffle(SIGNS.filter(x => (NEAR[s.g] || []).includes(x.g)), rand);
  const wrong = same.concat(near).slice(0, 3).map(x => x.name);
  const group = SIGN_GROUPS.find(g => g.id === s.g);
  return { id: 'sk' + s.id, t: 'skilt', sign: s.id, eyebrow: group.title, label: s.name, q: 'Hva betyr dette skiltet?',
    a: [s.name, ...wrong], why: s.meaning, ref: `Skiltforskriften, skilt ${s.id === '306' ? '306.0' : s.id}`, img: s.img };
});
