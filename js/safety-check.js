/* Sikkerhetskontrollen på oppkjøringen for klasse B (0.14.0). Kontroll før kjøring og sikkerhetskontroll skal alltid
   være med på prøven, og sensor tar en stikkprøve av oppgaver (trafikkopplæringsforskriften § 30-2, vegvesen.no
   «Oppkjøring», 2026). Du skal vise hvordan du kontrollerer noe, og kunne forklare hva en feil kan skyldes og føre til.
   Du kan også bli bedt om å bruke eller slå av førerstøttesystemer i bilen.
   Hver oppgave: id, area, car ('alle', 'fossil' for bensin og diesel, 'el' for elbil), task (slik sensor kan si det),
   how (slik gjør du det), fault (hvis noe er feil), og car-tips der bilene er ulike. Appens egne tekster. */

export const SAFETY_AREAS = [
  { id: 'lys', title: 'Lys', icon: 'sun' },
  { id: 'dekk', title: 'Dekk og hjul', icon: 'wheel' },
  { id: 'bremser', title: 'Bremser', icon: 'stop' },
  { id: 'styring', title: 'Styring', icon: 'wheel' },
  { id: 'vaesker', title: 'Væsker under panseret', icon: 'drop' },
  { id: 'varsel', title: 'Varsellamper', icon: 'warn' },
  { id: 'sikt', title: 'Sikt', icon: 'eye' },
  { id: 'utstyr', title: 'Sikkerhetsutstyr', icon: 'shield' },
  { id: 'el', title: 'Elbil', icon: 'bolt' },
  { id: 'stotte', title: 'Førerstøttesystemer', icon: 'sliders' }
];

export const CAR_TYPES = [
  { id: 'el', label: 'Elbil' },
  { id: 'fossil', label: 'Bensin eller diesel' },
  { id: 'hybrid', label: 'Hybrid' }
];

const T = (id, area, car, task, how, fault) => ({ id, area, car, task, how, fault });
/* Tegning av varsellampen (trafficsvg.js) for oppgavene der den hører til (0.16.0) */
const LAMP_FOR = { 'lys-naer': 'lamp:naerlys', 'lys-fjern': 'lamp:fjernlys', 'brems-abs': 'lamp:abs', 'vaeske-olje': 'lamp:olje', 'varsel-brems': 'lamp:brems', 'varsel-lading': 'lamp:lading', 'varsel-dekk': 'lamp:dekk', 'styr-servo': 'lamp:styring' };

const LIST = [
  /* ---------- Lys ---------- */
  T('lys-naer', 'lys', 'alle', 'Vis hvordan du slår på nærlyset, og kontroller at det virker.',
    ['Slå på nærlyset med lysbryteren (eller sjekk at automatisk lys står på).', 'Se at symbolet for nærlys lyser i instrumentpanelet.', 'Gå rundt bilen, eller se refleksen i en vegg eller i bilen foran, og sjekk at begge lyktene lyser.'],
    'En lykt som ikke lyser, gjør at du ser kortere og kan forveksles med en motorsykkel. Pæren eller lykten må byttes før du kjører i mørket.'),
  T('lys-fjern', 'lys', 'alle', 'Vis hvordan du slår på fjernlyset, og hvordan du ser at det er på.',
    ['Skyv eller trekk lysspaken som instruksjonsboka viser.', 'Det blå fjernlyssymbolet tennes i instrumentpanelet.', 'Vis også hvordan du blinker med fjernlyset (lyshornet).'],
    'Uten fjernlys ser du kort i mørket. Står fjernlyset på uten at du merker det, blender du andre: følg med på det blå symbolet.'),
  T('lys-blink', 'lys', 'alle', 'Kontroller blinklysene og nødsignallyset.',
    ['Slå på blinklys til venstre og til høyre, og hør og se at kontrollampen blinker i vanlig takt.', 'Slå på nødsignallyset med den røde trekantknappen.', 'Gå rundt bilen og sjekk alle blinklys foran, bak og på siden.'],
    'Blinker kontrollampen mye raskere enn vanlig, er ofte en pære gått. Da ser ikke andre hva du skal gjøre, og det må fikses før du kjører.'),
  T('lys-brems', 'lys', 'alle', 'Hvordan kan du kontrollere bremselysene når du er alene?',
    ['Rygg mot en vegg eller garasjeport, trå på bremsen og se refleksen i speilet.', 'Eller be noen stå bak bilen mens du bremser.', 'Sjekk alle bremselysene, også det høyt plasserte midt bak.'],
    'Uten bremselys merker ikke bilen bak at du bremser, og faren for påkjøring bakfra øker. En sikring eller pære kan være gått.'),
  T('lys-bak', 'lys', 'alle', 'Vis hvor tåkebaklyset slås på, og si når det skal brukes.',
    ['Vis bryteren, som ofte har symbol med lysstråler og en bølgete strek.', 'Kontrollampen er oransje eller gul.', 'Bruk det bare når sikten er svært dårlig, og slå det av igjen når sikten blir bedre.'],
    'Tåkebaklyset er sterkt og blender bilen bak hvis det står på i vanlig vær. Står det på uten at du vet det, kan det også skjule bremselysene.'),
  T('lys-andre', 'lys', 'alle', 'Kontroller parkeringslys, ryggelys og skiltlys.',
    ['Slå på parkeringslyset og gå rundt bilen.', 'Sett bilen i revers med bremsen inne, og se i en refleks eller få hjelp til å se at ryggelyset tennes.', 'Se at skiltlyset bak lyser.'],
    'Uten ryggelys ser ikke andre at du skal rygge. Uten skiltlys kan du få forelegg. Feilen er oftest en pære eller sikring.'),
  T('lys-horn', 'lys', 'alle', 'Vis hvordan du kontrollerer hornet.',
    ['Trykk kort på hornet, oftest midt på rattet.', 'Lyden skal være tydelig.'],
    'Uten horn kan du ikke varsle om fare. Bilen er ikke i forsvarlig stand før det er reparert.'),

  /* ---------- Dekk ---------- */
  T('dekk-monster', 'dekk', 'alle', 'Kontroller mønsterdybden på dekkene. Hva er kravet?',
    ['Mål i hovedrillene på de midterste tre fjerdedelene av slitebanen, gjerne med en mønsterdybdemåler.', 'Slitasjeindikatorene i rillene viser 1,6 mm.', 'Kravet er minst 1,6 mm om sommeren og minst 3 mm om vinteren (fra 1. november i Sør-Norge, fra 16. oktober i Nordland, Troms og Finnmark).'],
    'Lite mønster gir dårligere grep, særlig på våt og glatt vei, og større fare for vannplaning. Dekkene må byttes.'),
  T('dekk-trykk', 'dekk', 'alle', 'Hvor finner du riktig lufttrykk, og hvordan sjekker du det?',
    ['Riktig trykk står i instruksjonsboka, og ofte på et merke i dørkarmen eller under tanklokket.', 'Mål når dekkene er kalde, med en trykkmåler på en bensinstasjon eller en egen måler.', 'Mange biler har også dekktrykksvarsel: vis hvor du ser trykket i bilen deres.'],
    'For lavt trykk gir dårligere styring og lengre bremselengde, høyere forbruk og varmgang i dekket. Synker trykket raskt, kan dekket være punktert.'),
  T('dekk-skader', 'dekk', 'alle', 'Se over dekkene. Hva ser du etter?',
    ['Kutt, sprekker og buler på siden av dekket.', 'Ujevn slitasje, for eksempel mer slitt på innsiden eller ytterkanten.', 'Spiker eller skruer i slitebanen.'],
    'En bule betyr at dekket kan være skadet inni og kan sprekke. Ujevn slitasje kan bety feil hjulstilling eller feil lufttrykk.'),
  T('dekk-type', 'dekk', 'alle', 'Hva gjelder for dekkene om vinteren, og hvordan ser du at et dekk er et vinterdekk?',
    ['Vinterdekk er merket M+S eller med et fjellsymbol med snøfnugg.', 'Har bilen piggdekk, skal den ha det på alle hjul.', 'Piggdekk er tillatt fra 1. november til første søndag etter 2. påskedag i Sør-Norge, og ellers når føret gjør det nødvendig.'],
    'Sommerdekk på vinterføre gir svært dårlig grep. Bilen må ha dekk som passer føret.'),
  T('dekk-reserve', 'dekk', 'alle', 'Hva har bilen ved punktering?',
    ['Vis hvor reservehjulet, nødhjulet eller tetningssettet ligger.', 'Et nødhjul har lav maksfart, som står på hjulet, og skal bare brukes til nærmeste verksted.'],
    'Mange nye biler har bare tetningssett. Vet du ikke hva bilen har, blir en punktering mye vanskeligere å håndtere.'),

  /* ---------- Bremser ---------- */
  T('brems-fot', 'bremser', 'alle', 'Kontroller driftsbremsen før du kjører.',
    ['Trå på bremsepedalen: den skal være fast og ikke synke helt ned.', 'Kjør sakte fram og brems: bilen skal stanse rett, uten å trekke til siden.', 'Lytt etter skraping og pip.'],
    'En myk pedal kan bety luft i bremsene eller lekkasje. Trekker bilen skjevt, bremser hjulene ulikt. Ikke kjør før det er sjekket.'),
  T('brems-servo', 'bremser', 'fossil', 'Vis hvordan du kontrollerer bremseservoen.',
    ['Med motoren av: trå pedalen 4–5 ganger til den blir hard.', 'Hold pedalen inne og start motoren.', 'Pedalen skal synke litt: da virker servoen.'],
    'Uten servo må du trå mye hardere for å bremse, og bremselengden blir lengre om du ikke er forberedt.'),
  T('brems-park', 'bremser', 'alle', 'Vis hvordan du bruker og kontrollerer parkeringsbremsen.',
    ['Sett på parkeringsbremsen (spak, pedal eller knapp) og se at varsellampen tennes.', 'Prøv å kjøre forsiktig fram: bilen skal ikke rikke seg.', 'Løs den ut igjen og se at lampen slukker.'],
    'Holder ikke parkeringsbremsen, kan bilen rulle når den står i en bakke. Kjører du med den på, blir bremsene varme og slites.'),
  T('brems-vaeske', 'bremser', 'alle', 'Hvor kontrollerer du bremsevæsken, og hva ser du etter?',
    ['Vis beholderen under panseret: den er ofte merket med et bremsesymbol.', 'Nivået skal være mellom MIN og MAX.', 'Du skal ikke åpne den uten grunn: bremsevæske tar opp fukt.'],
    'Nivået synker litt når bremseklossene slites. Et raskt fall kan bety lekkasje, og bremsene kan svikte. Varsellampen for bremser kan tennes.'),
  T('brems-abs', 'bremser', 'alle', 'Hva gjør du hvis du må bremse så hardt du kan, og bilen har ABS?',
    ['Trå hardt og hold pedalen inne.', 'Det kan dure og vibrere i pedalen: det er ABS-en som jobber.', 'Styr utenom om det trengs.'],
    'Lyser varsellampen for ABS, virker bremsene som vanlige bremser uten ABS. Hjulene kan låse seg ved hard bremsing, og da kan du ikke styre.'),

  /* ---------- Styring ---------- */
  T('styr-slark', 'styring', 'alle', 'Kontroller styringen for slark.',
    ['Med bilen på og hjulene rett fram: vri rattet litt fram og tilbake.', 'Hjulene skal begynne å svinge nesten med en gang.', 'Kjenn etter at rattet går lett og jevnt fra side til side.'],
    'Mye slark betyr at det er slitte deler i styringen. Bilen styrer da upresist og kan bli farlig å kjøre.'),
  T('styr-servo', 'styring', 'alle', 'Hvordan merker du at servostyringen ikke virker?',
    ['Rattet blir tungt å vri, særlig når bilen står stille.', 'Mange biler viser en varsellampe for styring.', 'På eldre biler med hydraulisk servo kan nivået på servoolje sjekkes under panseret.'],
    'Uten servo er bilen fortsatt mulig å styre, men det krever mye mer kraft. Kjør forsiktig til verksted.'),
  T('styr-trekk', 'styring', 'alle', 'Bilen trekker til én side når du kjører rett fram. Hva kan det skyldes?',
    ['Ulikt lufttrykk i dekkene.', 'Feil hjulstilling.', 'At bremsen henger på ett hjul.'],
    'Sjekk lufttrykket først. Trekker bilen fortsatt, må den på verksted.'),

  /* ---------- Væsker ---------- */
  T('vaeske-olje', 'vaesker', 'fossil', 'Vis hvordan du kontrollerer motoroljen.',
    ['Bilen skal stå på flatt underlag, og motoren skal ha vært av noen minutter.', 'Trekk ut peilepinnen, tørk den av, stikk den helt inn og trekk den ut igjen.', 'Nivået skal være mellom MIN- og MAX-merket. Mange nye biler viser nivået på skjermen.', 'Etterfyll med oljen instruksjonsboka anbefaler, litt om gangen.'],
    'For lite olje kan gi store motorskader. Lyser oljetrykklampen rødt, skal du stanse straks og slå av motoren.'),
  T('vaeske-kjole', 'vaesker', 'alle', 'Vis hvordan du kontrollerer kjølevæsken.',
    ['Vis ekspansjonstanken under panseret.', 'Sjekk når motoren er kald: nivået skal være mellom MIN og MAX.', 'Åpne aldri lokket når motoren er varm. Systemet står under trykk.', 'En elbil har også kjølevæske for batteri og elektronikk: se instruksjonsboka.'],
    'For lite kjølevæske kan gi overoppheting og skader. Om vinteren må væsken tåle frost, ellers kan den fryse og sprenge deler.'),
  T('vaeske-spyler', 'vaesker', 'alle', 'Vis hvor du fyller spylervæske, og hva du bruker om vinteren.',
    ['Vis beholderen: lokket har ofte et symbol av frontrute med spylestråle.', 'Fyll vinterspylervæske når det kan bli frost.', 'Prøv spylerne og se at de treffer ruta.'],
    'Uten spylervæske kan du ikke få bort salt og skitt fra ruta, og sikten kan bli farlig dårlig på kort tid.'),
  T('vaeske-tank', 'vaesker', 'fossil', 'Hvordan ser du hvor mye drivstoff det er igjen, og hva slags drivstoff bilen bruker?',
    ['Drivstoffmåleren og rekkevidden står i instrumentpanelet. En lampe varsler når det er lite igjen.', 'Riktig drivstoff står ofte på innsiden av tanklokket og i instruksjonsboka.'],
    'Feil drivstoff kan ødelegge motoren. Ikke start bilen hvis du har fylt feil, få den slept til verksted.'),
  T('vaeske-panser', 'vaesker', 'alle', 'Vis hvordan du åpner og lukker panseret.',
    ['Trekk i panserhåndtaket inne i bilen, ofte nede ved førerdøra.', 'Finn sperren under panserkanten og løft panseret.', 'Bruk stagen hvis bilen har det. Lukk ved å slippe panseret fra lav høyde og sjekk at det er i lås.'],
    'Et panser som ikke er i lås, kan fly opp i fart og dekke hele frontruta.'),

  /* ---------- Varsellamper ---------- */
  T('varsel-farger', 'varsel', 'alle', 'Hva betyr fargene på varsellampene?',
    ['Rødt: alvorlig feil eller fare. Stans så snart det er trygt.', 'Gult eller oransje: feil eller noe som må sjekkes snart.', 'Grønt og blått: informasjon, for eksempel blinklys og fjernlys.'],
    'Vet du ikke hva en lampe betyr, slå den opp i instruksjonsboka. Rødt skal tas på alvor med en gang.'),
  T('varsel-start', 'varsel', 'alle', 'Hva skjer med varsellampene når du starter bilen?',
    ['Mange lamper tennes en kort stund når bilen slås på. Det er en test av lampene.', 'De skal slukke etter noen sekunder.', 'En lampe som blir stående, varsler om en feil.'],
    'Slukker ikke lampen for bremser, kollisjonsputer eller ABS, er det en feil som må sjekkes før du kjører.'),
  T('varsel-brems', 'varsel', 'alle', 'Varsellampen for bremser lyser under kjøring. Hva gjør du?',
    ['Sjekk først at parkeringsbremsen er helt løst ut.', 'Lyser den fortsatt, stans der det er trygt.', 'Kontroller bremsevæsken, og kjør ikke videre hvis nivået er lavt eller pedalen er myk.'],
    'Lampen kan bety lav bremsevæske eller feil i bremsesystemet. Bremsene kan svikte.'),
  T('varsel-lading', 'varsel', 'alle', 'Varsellampen for batteri eller lading lyser. Hva betyr det?',
    ['Bilen lader ikke 12-voltsbatteriet som den skal.', 'Slå av det strømmen du ikke trenger, og kjør til verksted.', 'Bilen kan stoppe når batteriet er tomt.'],
    'Uten lading går 12-voltsbatteriet tomt. Da kan bilen stoppe, og lys og vindusviskere kan slutte å virke.'),
  T('varsel-dekk', 'varsel', 'alle', 'Varsellampen for dekktrykk lyser. Hva gjør du?',
    ['Stans der det er trygt og se over dekkene.', 'Mål lufttrykket og fyll til riktig trykk.', 'Synker trykket igjen, kan dekket være punktert.'],
    'Kjører du lenge med for lite luft, kan dekket bli ødelagt og i verste fall sprekke.'),

  /* ---------- Sikt ---------- */
  T('sikt-viskere', 'sikt', 'alle', 'Kontroller vindusviskerne.',
    ['Prøv viskerne på alle hastigheter, også bakviskeren.', 'Se at de tørker rent uten striper.', 'Sjekk at gummien ikke er sprukket eller slitt.'],
    'Striper og slitte blader gir dårlig sikt, særlig i mørket med møtende lys. Bladene må byttes.'),
  T('sikt-rute', 'sikt', 'alle', 'Vis hvordan du får bort dugg og is fra rutene.',
    ['Slå på defrosteren til frontruta og bakruta.', 'Bruk varme og vifte mot frontruta, gjerne med klimaanlegget på: det tørker luften.', 'Skrap is fra alle ruter og speil før du kjører.'],
    'Kjører du med dugg eller is på rutene, ser du ikke fotgjengere og andre biler. Du skal ha fritt utsyn rundt hele bilen.'),
  T('sikt-speil', 'sikt', 'alle', 'Vis hvordan du stiller inn speilene.',
    ['Innvendig speil: hele bakruta skal synes.', 'Utvendige speil: så vidt litt av egen bil i kanten, resten veien bak og til siden.', 'Still dem inn før du kjører, ikke mens du kjører.'],
    'Feil innstilte speil gir større blindsoner. Skulderblikk trengs uansett før feltskifte.'),
  T('sikt-belte', 'sikt', 'alle', 'Kontroller bilbeltene.',
    ['Trekk beltet ut og se at det ikke er skadet.', 'Lås det og sjekk at låsen holder.', 'Rykk raskt i beltet: det skal låse seg.'],
    'Et belte som ikke låser seg, beskytter deg ikke i et sammenstøt.'),

  /* ---------- Sikkerhetsutstyr ---------- */
  T('utstyr-trekant', 'utstyr', 'alle', 'Vis hvor varseltrekanten er, og hvor du plasserer den.',
    ['Vis hvor den ligger, ofte i bagasjerommet eller i bakluka.', 'Ved stans på et farlig sted: slå på nødsignallyset, ta på refleksvest og sett trekanten godt bak bilen, om mulig minst 150 meter.', 'Varseltrekant er påbudt i bil.'],
    'Uten varsling kan andre kjøre rett inn i en bil som står i veien, særlig bak en sving eller bakketopp.'),
  T('utstyr-vest', 'utstyr', 'alle', 'Hvor er refleksvesten?',
    ['Den skal ligge lett tilgjengelig fra førerplassen, for eksempel i dørlommen.', 'Ta den på før du går ut av bilen i veien.'],
    'Ligger vesten i bagasjerommet, må du gå ut i trafikken uten vest for å hente den.'),
  T('utstyr-forstehjelp', 'utstyr', 'alle', 'Hva bør du ha med i bilen i tillegg til det som er påbudt?',
    ['Førstehjelpsutstyr.', 'Lommelykt.', 'Om vinteren: isskrape, snøbørste, varme klær og gjerne en spade.'],
    'Står du fast eller må hjelpe andre, er det godt å ha det du trenger.'),
  T('utstyr-hodestotte', 'utstyr', 'alle', 'Vis hvordan du stiller inn sete og hodestøtte.',
    ['Sitt så du når pedalene med litt bøyd kne og rattet med litt bøyde armer.', 'Hodestøtten skal være omtrent i høyde med toppen av hodet og nær bakhodet.'],
    'Feil sittestilling gjør det vanskelig å bremse og styre riktig. En lav hodestøtte gir større fare for nakkeskade.'),

  /* ---------- Elbil ---------- */
  T('el-klar', 'el', 'el', 'Hvordan ser du at bilen er klar til å kjøre?',
    ['Mange elbiler viser «Ready» eller et grønt bilsymbol når de er klare.', 'Det er nesten ingen lyd, så sjekk instrumentpanelet før du gir gass.'],
    'Fordi elbilen er stille, kan du tro at den er av når den er klar til å kjøre, og den kan rulle hvis du ikke bremser.'),
  T('el-rekkevidde', 'el', 'el', 'Hvor ser du hvor mye strøm det er igjen, og hva påvirker rekkevidden?',
    ['Vis batteriprosent og rekkevidde i instrumentpanelet.', 'Kulde, høy fart, oppvarming og tung last gir kortere rekkevidde.', 'Forvarm bilen mens den står i lading om vinteren.'],
    'Går batteriet tomt, stopper bilen. Når det er lite igjen, kan bilen begrense effekten, ofte vist med et skilpaddesymbol.'),
  T('el-lading', 'el', 'el', 'Vis hvordan du lader bilen, og hva du sjekker på ladekabelen.',
    ['Vis ladeluken og hvordan du kobler til og fra.', 'Sjekk at kabelen og pluggen ikke er skadet.', 'Bruk godkjent ladeutstyr. Lad ikke med skjøteledning.'],
    'En skadet kabel eller dårlig kontakt kan gi varmgang og brann.'),
  T('el-regen', 'el', 'el', 'Hva skjer når du slipper gassen i denne bilen, og hvordan stiller du det inn?',
    ['Bilen bremser med motoren og lader batteriet (regenerering).', 'Vis hvor du stiller hvor kraftig dette skal være, hvis bilen har det.', 'Du må fortsatt bruke bremsepedalen når du skal stanse raskt.'],
    'På glatt vei kan kraftig regenerering få hjulene til å skli. Vit hvordan bilen deres oppfører seg før du kjører på glatt føre.'),

  /* ---------- Førerstøttesystemer ---------- */
  T('stotte-cruise', 'stotte', 'alle', 'Vis hvordan du slår cruisekontrollen på og av.',
    ['Vis knappene på rattet eller spaken som instruksjonsboka beskriver.', 'Slå den på, sett farten, og vis hvordan du kobler den ut med knappen og med bremsen.', 'Har bilen adaptiv cruisekontroll, vis hvordan du stiller avstanden.'],
    'Cruisekontrollen holder farten også når forholdene endrer seg. Bruk den ikke på glatt vei, og følg alltid med selv.'),
  T('stotte-fil', 'stotte', 'alle', 'Vis hvordan du slår filholderen av og på, og fortell hva den gjør.',
    ['Vis knappen eller menyen der den slås av og på.', 'Den leser linjene i veien og kan styre litt eller varsle hvis du er på vei ut av feltet.', 'Den virker dårlig der linjene er slitte, mangler eller er dekket av snø.'],
    'Du har ansvaret for å holde bilen i feltet. Systemet kan svikte uten forvarsel.'),
  T('stotte-esc', 'stotte', 'alle', 'Hvor ser du at antiskrens (ESC) griper inn, og hvordan slår du den av?',
    ['En lampe blinker i instrumentpanelet når systemet jobber.', 'Vis knappen der den kan slås av. Den skal normalt alltid være på.', 'Den kan være lurt å slå av bare når du står fast i snø og må få hjulene til å spinne.'],
    'Lyser lampen hele tiden, er systemet slått av eller har en feil. Da sklir bilen lettere ut i svinger på glatt vei.'),
  T('stotte-nodbrems', 'stotte', 'alle', 'Bilen piper og varsler kollisjon foran. Hva gjør du?',
    ['Se fram med en gang, og brems kraftig hvis det trengs.', 'Systemet kan bremse selv, men stol ikke på det.', 'Vis i menyen hvor varselet kan stilles inn.'],
    'Systemet ser ikke alt, og virker dårligere i mørke, regn og snø. Du er alltid ansvarlig for avstanden.')
];

export const SAFETY = LIST.map(t => (LAMP_FOR[t.id] ? { ...t, img: LAMP_FOR[t.id] } : t));
