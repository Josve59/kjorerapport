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
  S('104', 'fare', 'Bratt bakke', 'Varsler om bratt bakke. Hvor bratt den er, kan stå på et underskilt (stigningsgrad i prosent).'),
  S('106', 'fare', 'Smalere veg', 'Varsler om at vegen blir smalere. Vær klar til å slippe fram møtende.'),
  S('108', 'fare', 'Ujevn veg', 'Varsler om ujevn veg, for eksempel humper, telehiv eller hull.'),
  S('109', 'fare', 'Fartshump', 'Varsler om fartshump eller annen fartsdemper i vegen.'),
  S('110', 'fare', 'Vegarbeid', 'Varsler om vegarbeid. Det kan være folk, maskiner og løs grus i vegen. Ved vegarbeid kan fareskiltene ha gul bunn.'),
  S('112', 'fare', 'Steinsprut', 'Varsler om løs grus eller stein i kjørebanen som hjulene kan slynge opp. Senk farten og hold god avstand til bilen foran.'),
  S('114', 'fare', 'Rasfare', 'Varsler om fare for ras av stein, jord eller snø, og om at det kan ligge stein eller snø i kjørebanen.'),
  S('116', 'fare', 'Glatt kjørebane', 'Varsler om fare for glatt kjørebane på grunn av særlige forhold, for eksempel is i en skyggefull sving.'),
  S('117', 'fare', 'Farlig vegskulder', 'Varsler om at vegskulderen er bløt, lav eller på annen måte farlig å kjøre ut på. Hold deg i kjørebanen.'),
  S('118', 'fare', 'Bevegelig bru', 'Varsler om bru som kan heves eller svinges til side, for eksempel for å slippe fram båter. Følg lys og bommer ved brua.'),
  S('120', 'fare', 'Kai, strand eller ferjeleie', 'Varsler om at vegen ender ved en kai, en strand eller et ferjeleie, så du kan kjøre rett i vannet. Senk farten.'),
  S('122', 'fare', 'Tunnel', 'Varsler om tunnel. I tunnelen er det forbudt å stanse.'),
  S('124', 'fare', 'Farlig vegkryss', 'Varsler om et farlig kryss der vanlig vikeplikt gjelder: du har vikeplikt for kjørende fra høyre.'),
  S('126', 'fare', 'Rundkjøring', 'Varsler om rundkjøring lenger fram.'),
  S('132', 'fare', 'Trafikklyssignal', 'Varsler om trafikklys som du ellers kunne se for sent.'),
  S('134', 'fare', 'Planovergang med bom', 'Varsler om planovergang med bom: der jernbanen krysser vegen. Det er forbudt å stanse nærmere planovergangen enn 5 meter.'),
  S('135', 'fare', 'Planovergang uten bom', 'Varsler om planovergang uten bom, der jernbanen krysser vegen. Se og lytt etter tog, og stans om et tog kommer.'),
  S('136', 'fare', 'Avstandsskilt', 'Gir forvarsel om planovergang (skilt 134 eller 135). Det står tre skilt etter hverandre, med tre, to og én rød stripe: færre striper betyr at du er nærmere.'),
  S('138', 'fare', 'Jernbanespor', 'Står der jernbane eller forstadsbane krysser vegen i plan. Se etter tog i begge retninger.'),
  S('139', 'fare', 'Sporvogn', 'Varsler om at sporvogn (trikk) krysser eller kjører i vegen. Du skal gi fri veg for sporvogn, og stanse om det trengs.'),
  S('140', 'fare', 'Avstand til gangfelt', 'Varsler om gangfelt lenger fram, der du ellers ikke ser det i god tid.'),
  S('142', 'fare', 'Barn', 'Varsler om sted der barn ofte ferdes eller er, for eksempel ved skole, barnehage eller lekeplass.'),
  S('144', 'fare', 'Syklende', 'Varsler om sted der syklende ofte krysser eller kjører ut i vegen, eller om syklende i tunnel.'),
  S('146', 'fare', 'Dyr', 'Varsler om at dyr ofte krysser eller går langs vegen. Symbolet viser hvilket dyr, her elg.'),
  S('148', 'fare', 'Møtende trafikk', 'Varsler om at kjørebanen har trafikk i begge retninger, for eksempel etter en strekning med midtdeler.'),
  S('149', 'fare', 'Kø', 'Varsler om at det ofte er kø lenger fram. Senk farten og vær klar til å stanse.'),
  S('150', 'fare', 'Fly', 'Varsler om at fly kan fly lavt over eller nær vegen, for eksempel ved en flyplass.'),
  S('151', 'fare', 'Militær aktivitet', 'Varsler om militær aktivitet ved vegen, for eksempel militære kjøretøy som krysser eller kjører ut i vegen.'),
  S('152', 'fare', 'Sidevind', 'Varsler om sted der det ofte blåser sterk sidevind.'),
  S('153', 'fare', 'Trafikkulykke', 'Varsler om en trafikkulykke lenger fram. Senk farten, vær klar til å stanse og følg anvisninger fra politi og redningsfolk.'),
  S('154', 'fare', 'Skiløpere', 'Varsler om sted der skiløpere ofte krysser vegen, for eksempel der en skiløype går over.'),
  S('155', 'fare', 'Ridende', 'Varsler om sted der ridende ofte krysser eller rir ut i vegen. Kjør sakte og med god avstand forbi, så hesten ikke blir skremt.'),
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
  S('306.1', 'forbud', 'Forbudt for motorvogn med unntak av liten elektrisk motorvogn', 'Forbudt å kjøre forbi skiltet med motorvogn, for eksempel bil og motorsykkel. Liten elektrisk motorvogn, som elsparkesykkel, er unntatt.'),
  S('306.3', 'forbud', 'Forbudt for alle traktorer og for motorredskap konstruert for fart mindre enn 40 km/t', 'Forbudt å kjøre forbi skiltet med traktor, og med motorredskap som er laget for lavere fart enn 40 km/t.'),
  S('306.4', 'forbud', 'Forbudt for motorsykkel og moped', 'Forbudt å kjøre forbi skiltet med motorsykkel og moped.'),
  S('306.5', 'forbud', 'Forbudt for lastebil og trekkbil', 'Forbudt å kjøre forbi skiltet med lastebil og trekkbil. Personbil kan kjøre forbi.'),
  S('306.6', 'forbud', 'Forbudt for syklende og fører av liten elektrisk motorvogn', 'Forbudt å sykle eller kjøre liten elektrisk motorvogn, som elsparkesykkel, forbi skiltet.'),
  S('306.7', 'forbud', 'Forbudt for gående', 'Forbudt for gående å ferdes forbi skiltet. De må bruke en annen veg.'),
  S('306.8', 'forbud', 'Forbudt for gående, syklende og fører av liten elektrisk motorvogn', 'Forbudt for gående, syklende og elsparkesykler forbi skiltet. Står ofte ved tunneler og veger med mye og rask trafikk.'),
  S('306.9', 'forbud', 'Forbudt for ridende', 'Forbudt å ri forbi skiltet, for eksempel på hest.'),
  S('306.10', 'forbud', 'Forbudt for liten elektrisk motorvogn', 'Forbudt å kjøre liten elektrisk motorvogn, som elsparkesykkel, forbi skiltet. Gjelder både på vegen og på fortauet.'),
  S('308', 'forbud', 'Forbudt for transport av farlig gods', 'Forbudt for kjøretøy som frakter farlig gods og skal være merket med oransje skilt. Står ofte foran tunneler.'),
  S('310', 'forbud', 'Forbudt for motorvogn med flere enn to hjul og med tillatt totalvekt høyere enn angitt', 'Forbudt for motorvogn med flere enn to hjul når den tillatte totalvekten er høyere enn tallet på skiltet. Tillatt totalvekt står i vognkortet.'),
  S('312', 'forbud', 'Breddegrense', 'Forbudt for kjøretøy som er bredere enn det skiltet viser, medregnet lasten.'),
  S('314', 'forbud', 'Høydegrense', 'Forbudt for kjøretøy som er høyere enn det skiltet viser, medregnet lasten. Husk takboks og last på taket.'),
  S('316', 'forbud', 'Lengdegrense', 'Forbudt for kjøretøy eller vogntog som er lengre enn det skiltet viser, medregnet lasten. Husk tilhengeren.'),
  S('318.1', 'forbud', 'Totalvektgrense for kjøretøy', 'Forbudt for kjøretøy som veier mer enn angitt, med last og folk (aktuell totalvekt). For vogntog gjelder grensen hvert kjøretøy for seg.'),
  S('318.2', 'forbud', 'Totalvektgrense for vogntog', 'Forbudt for vogntog som til sammen veier mer enn angitt (aktuell totalvekt). Gjelder også enkeltkjøretøy som veier mer.'),
  S('320', 'forbud', 'Aksellastgrense', 'Forbudt for kjøretøy der vekten på én aksel (aktuell aksellast) er høyere enn angitt.'),
  S('322', 'forbud', 'Boggilastgrense', 'Forbudt for kjøretøy der vekten på en boggi, to aksler tett sammen, er høyere enn angitt.'),
  S('324', 'forbud', 'Stopp for angitt formål', 'Forbudt å kjøre videre før du har stanset for det formålet som står på skiltet, for eksempel kontroll.'),
  S('326', 'forbud', 'Stopp for toll', 'Du skal stanse for tollklarering etter tollreglene. Står ved grensa.'),
  S('330', 'forbud', 'Svingeforbud', 'Forbudt å svinge den veien pilen viser. Gjelder i krysset skiltet står i eller ved.'),
  S('332', 'forbud', 'Vendingsforbud', 'Forbudt å vende (snu). Gjelder til og med første kryss.'),
  S('334', 'forbud', 'Forbikjøringsforbud', 'Forbudt å kjøre forbi motorvogn med flere enn to hjul. Gjelder til skilt 336, eller så langt underskiltet sier.'),
  S('335', 'forbud', 'Forbikjøringsforbud for lastebil', 'Forbudt for lastebil med tillatt totalvekt over 3500 kg å kjøre forbi motorvogn med flere enn to hjul. Personbil kan kjøre forbi.'),
  S('336', 'forbud', 'Slutt på forbikjøringsforbud', 'Forbikjøringsforbudet slutter. Forbikjøring er igjen lov der det ellers er trygt og tillatt.'),
  S('337', 'forbud', 'Slutt på forbikjøringsforbud for lastebil', 'Forbikjøringsforbudet for lastebil slutter. Lastebil kan igjen kjøre forbi der det ellers er trygt og tillatt.'),
  S('362', 'forbud', 'Fartsgrense', 'Forbudt å kjøre fortere enn tallet. Gjelder til ny fartsgrense, skilt 364, fartsgrensesone, gatetun eller gågate. Gul bunn betyr midlertidig fartsgrense.', 'sign:362:60'),
  S('364', 'forbud', 'Slutt på særskilt fartsgrense', 'Den skiltede fartsgrensen slutter. Da gjelder den generelle: 50 km/t i tettbygd strøk og 80 km/t utenfor.', 'sign:364:60'),
  S('366', 'forbud', 'Fartsgrensesone', 'Hele området innenfor har fartsgrensen på skiltet, til skilt 368, gatetun eller gågate. Varsler også at det kan være fartshumper.', 'sign:366:30'),
  S('368', 'forbud', 'Slutt på fartsgrensesone', 'Fartsgrensesonen slutter. Se etter nytt fartsgrenseskilt, ellers gjelder den generelle fartsgrensen.', 'sign:368:30'),
  S('370', 'forbud', 'Stans forbudt', 'Forbudt å stanse på den siden av vegen skiltet står, fram til nærmeste kryss eller nytt skilt.'),
  S('372', 'forbud', 'Parkering forbudt', 'Forbudt å parkere på den siden av vegen skiltet står, fram til nærmeste kryss eller nytt skilt. Kortest mulig stans for å slippe av eller ta på folk eller varer er lov.'),
  S('376', 'forbud', 'Parkeringssone', 'Grense for et område med egne regler for parkering eller stans. Reglene står med symboler og tekst på skiltet, og gjelder til skilt 378.'),
  S('378', 'forbud', 'Slutt på parkeringssone', 'Parkeringssonen slutter. Etter skiltet gjelder de vanlige reglene for stans og parkering.'),
  // Påbudsskilt, § 10
  S('402', 'pabud', 'Påbudt kjøreretning', 'Du skal forlate krysset i den retningen pilen viser.'),
  S('404', 'pabud', 'Påbudt kjørefelt', 'Du skal kjøre forbi skiltet på den siden pilen peker mot.'),
  S('406', 'pabud', 'Påbudt rundkjøring', 'Du kjører inn i en rundkjøring og skal kjøre rundt i pilenes retning.'),
  S('408', 'pabud', 'Påbudt kjøreretning i rundkjøring', 'Tavla står i rundkjøringen, midt imot der du kjører inn. Pilene viser at du skal kjøre til høyre, rundt øya.'),
  // Opplysningsskilt, § 12
  S('502', 'opplysning', 'Motorveg', 'Reglene for motorveg gjelder: det er forbudt å stanse, rygge og vende, og bare motorvogn som lovlig kan kjøre minst 40 km/t, får kjøre der. Gjelder til skilt 504 «Slutt på motorveg».'),
  S('503', 'opplysning', 'Motortrafikkveg', 'Reglene for motortrafikkveg gjelder: som på motorveg er det forbudt å stanse, rygge og vende, og bare motorvogn som lovlig kan kjøre minst 40 km/t, får kjøre der.'),
  S('504', 'opplysning', 'Slutt på motorveg', 'Motorvegen slutter, og reglene for motorveg gjelder ikke lenger. Se etter ny fartsgrense.'),
  S('505', 'opplysning', 'Slutt på motortrafikkveg', 'Motortrafikkvegen slutter, og reglene for motortrafikkveg gjelder ikke lenger. Se etter ny fartsgrense.'),
  S('506', 'opplysning', 'Tungtrafikkfelt', 'Kjørefelt for motorvogn med tillatt totalvekt høyere enn tallet på skiltet. Med personbil skal du ikke kjøre der. Gjelder til skilt 507 eller første kryss.'),
  S('507', 'opplysning', 'Slutt på tungtrafikkfelt', 'Tungtrafikkfeltet slutter. Etter skiltet kan alle kjøre i feltet, om ikke annet er skiltet.'),
  S('508', 'opplysning', 'Kollektivfelt', 'Feltet er for buss, og for drosje når skiltet viser det. Bil kan ikke bruke det, men elbil og hydrogenbil kan, om ikke annet er skiltet. Stans er forbudt.'),
  S('509', 'opplysning', 'Sambruksfelt', 'Feltet er for buss, drosje og bil med minst så mange personer i som tallet viser, for eksempel 2+. Gjelder til skilt 511 eller første kryss.'),
  S('510', 'opplysning', 'Slutt på kollektivfelt', 'Kollektivfeltet slutter. Etter skiltet kan alle kjøre i feltet, om ikke annet er skiltet.'),
  S('511', 'opplysning', 'Slutt på sambruksfelt', 'Sambruksfeltet slutter. Etter skiltet kan alle kjøre i feltet, om ikke annet er skiltet.'),
  S('512', 'opplysning', 'Holdeplass for buss', 'Stans er forbudt nærmere skiltet enn 20 meter, utenom kort av- og påstigning. Der fartsgrensen er 60 eller lavere, har du vikeplikt for buss som gir tegn om å kjøre ut.'),
  S('513', 'opplysning', 'Holdeplass for sporvogn', 'Holdeplass for sporvogn (trikk). Kjører du forbi til høyre for en trikk ved holdeplass uten trafikkøy, skal du stanse og slippe passasjerene av og på.'),
  S('514', 'opplysning', 'Holdeplass for drosje', 'Holdeplass for drosje (taxi). Andre må ikke stanse der eller nærmere skiltet enn 20 meter, utenom kort av- og påstigning.'),
  S('516', 'opplysning', 'Gangfelt', 'Kryssingssted for gående. Du har vikeplikt for gående som er ute i gangfeltet eller på vei ut i det.'),
  S('518', 'opplysning', 'Gangveg', 'Vei som er laget for gående. Det er forbudt å kjøre bil der.'),
  S('520', 'opplysning', 'Sykkelveg', 'Vei som er laget for syklende og elsparkesykler. Andre kjørende får ikke bruke den.'),
  S('521.1', 'opplysning', 'Sykkelfelt – sideplassert', 'Kjørebanen har eget felt for syklende og liten elektrisk motorvogn. Du skal ikke kjøre bil i sykkelfeltet, og det er forbudt å stanse der.'),
  S('522', 'opplysning', 'Gang- og sykkelveg', 'Vei for gående, syklende og elsparkesykler. Det er forbudt å kjøre bil der.'),
  S('524', 'opplysning', 'Møteplass', 'Sted på smal veg der kjøretøy kan møtes. Det er forbudt å parkere på møteplassen.'),
  S('526', 'opplysning', 'Envegskjøring', 'Kjøring er bare lov i pilens retning, fram til første kryss.'),
  S('527', 'opplysning', 'Blindveg', 'Vegen er stengt lenger fram, så du kommer ikke gjennom.'),
  S('528', 'opplysning', 'Valgfritt kjørefelt', 'Du kan kjøre forbi skiltet på den siden du vil. Står for eksempel på en trafikkøy der begge feltene fører videre.'),
  S('530', 'opplysning', 'Sammenfletting', 'To kjørefelt blir til ett. Dere fletter: farten tilpasses, og bilene kjører vekselvis inn, én fra hvert felt.'),
  S('531', 'opplysning', 'Felt for fartsøkning', 'Feltet for fartsøkning går inn i kjørefeltet ved siden av, og trafikken fletter. Kommer du fra påkjøringen, tilpasser du farten. Er du i feltet, gjør du det lett å kjøre inn.'),
  S('532', 'opplysning', 'Kjørefelt slutter', 'Et kjørefelt slutter lenger fram. Er du i feltet som slutter, skal du skifte felt, og du har vikeplikt for dem som er i feltet du skal inn i.'),
  S('534', 'opplysning', 'Kjørefelt begynner', 'Et nytt kjørefelt begynner, så det blir flere felt i din retning. Bruk høyre felt når du ikke kjører forbi.'),
  S('536', 'opplysning', 'Påkjøring fortsetter i eget kjørefelt', 'Trafikken fra påkjøringen fortsetter i sitt eget felt, så den trenger ikke flette inn. Det blir ett felt mer.'),
  S('538', 'opplysning', 'Kjørefeltinndeling', 'Viser hvor mange kjørefelt det er, og hvilken retning hvert felt har. Pil ned betyr møtende trafikk i det feltet.'),
  S('539', 'opplysning', 'Endret kjøremønster', 'Varsler om at kjørefeltene er lagt om, for eksempel ved vegarbeid. Følg pilene: de viser hvordan feltene går. Gul bunn betyr midlertidig skilt.'),
  S('540', 'opplysning', 'Gatetun', 'Området er et gatetun: du kjører ikke fortere enn gangfart, har vikeplikt for gående og parkerer bare på merkede plasser. Gjelder til skilt 542 «Slutt på gatetun».'),
  S('542', 'opplysning', 'Slutt på gatetun', 'Gatetunet slutter. Vanlige regler og fartsgrenser gjelder igjen, og den som kjører ut fra gatetunet, har vikeplikt.'),
  S('548', 'opplysning', 'Gågate', 'Forbudt å kjøre motorvogn, unntatt elsparkesykkel, om ikke et underskilt gir unntak. Den som har lov til å kjøre der, holder gangfart og har vikeplikt for gående. Parkering er forbudt.'),
  S('550', 'opplysning', 'Slutt på gågate', 'Gågaten slutter. Den som kjører ut fra gågaten, har vikeplikt for annen trafikk.'),
  S('552', 'opplysning', 'Parkering', 'Parkering er tillatt her, så lenge det ikke bryter med reglene om stans og parkering. Underskilt kan gi tid og vilkår.'),
  S('555', 'opplysning', 'Havarilomme', 'Utvidelse ved vegen, ofte i tunnel, der du kan stanse om bilen får stopp eller ved en ulykke. Der finnes ofte nødtelefon (SOS).'),
  S('556', 'opplysning', 'Automatisk trafikkontroll – punktmåling', 'Farten blir målt med kamera på stedet (fotoboks).'),
  S('556.2', 'opplysning', 'Automatisk trafikkontroll – strekningsmåling', 'Farten måles over en lengre strekning: kameraer tar tiden mellom to punkter og regner ut gjennomsnittsfarten.'),
  S('558', 'opplysning', 'Videokontroll/-overvåking', 'Trafikken på stedet blir overvåket eller kontrollert med videokamera.'),
  S('565', 'opplysning', 'Feil kjøreretning', 'Du er på vei inn mot kjøreretningen, for eksempel i en avkjøring fra motorveg. Stans og snu.'),
  S('570.1', 'opplysning', 'Nødutgang', 'Viser nødutgang i tunnel. Ved brann eller ulykke går du ut her, til fots.'),
  S('570.2', 'opplysning', 'Retning og avstand til nødutgang', 'Viser retning og avstand til nærmeste nødutgang i tunnelen, så du kan komme deg ut til fots ved brann eller ulykke.')
];

/* Skilt der forskriften har et undernummer, men id-en er beholdt så lagret fremgang ikke går tapt */
export const SIGN_REF = { 306: '306.0', 556: '556.1' };   // nummeret i forskriften, der id-en er kortere
const REF = SIGN_REF;

/* Grupper som ligner, når en gruppe har for få skilt til tre gale svar */
const NEAR = { pabud: ['forbud'], vike: ['forbud', 'fare'], fare: ['vike'], forbud: ['pabud'], opplysning: ['pabud'] };

/* Ett spørsmål per skilt. Gale svar trekkes med frø fra skiltets nummer, så spørsmålet er det samme hver gang. */
// Frø per skilt: punktumet tas ut, så 306.1 og 306.10 får hvert sitt (+'306.10' er 306.1). Hele tall er som før.
const seedOf = id => Number(String(id).replace('.', ''));
export const SIGN_QUESTIONS = SIGNS.map(s => {
  const rand = rng(seedOf(s.id) * 7919);
  const same = shuffle(SIGNS.filter(x => x.g === s.g && x.id !== s.id), rand);
  const near = shuffle(SIGNS.filter(x => (NEAR[s.g] || []).includes(x.g)), rand);
  const wrong = same.concat(near).slice(0, 3).map(x => x.name);
  const group = SIGN_GROUPS.find(g => g.id === s.g);
  return { id: 'sk' + s.id, t: 'skilt', sign: s.id, eyebrow: group.title, label: s.name, q: 'Hva betyr dette skiltet?',
    a: [s.name, ...wrong], why: s.meaning, ref: `Skiltforskriften, skilt ${REF[s.id] || s.id}`, img: s.img };
});

/* Bildesvar (0.20.0): «Hvilket skilt er …?» med fire skilt å velge mellom. Øves sammen med skiltprøven, men teller
   ikke med i «lært» der (lært betyr at du kjenner igjen hva et skilt betyr). imgs følger rekkefølgen i a. */
export const SIGN_PICK_QUESTIONS = SIGNS.map(s => {
  const rand = rng(seedOf(s.id) * 104729);
  const same = shuffle(SIGNS.filter(x => x.g === s.g && x.id !== s.id), rand);
  const near = shuffle(SIGNS.filter(x => (NEAR[s.g] || []).includes(x.g)), rand);
  const opts = [s, ...same.concat(near).slice(0, 3)];
  const group = SIGN_GROUPS.find(g => g.id === s.g);
  return { id: 'sp' + s.id, t: 'skilt', sign: s.id, pick: true, eyebrow: group.title, label: s.name, q: `Hvilket skilt er «${s.name}»?`,
    a: opts.map(x => x.name), imgs: opts.map(x => x.img), why: s.meaning, ref: `Skiltforskriften, skilt ${REF[s.id] || s.id}` };
});
