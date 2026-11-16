/* Teoriboka (0.21.0): kort lesestoff per tema, slik gode øvingstjenester har et teorikurs ved siden av spørsmålene.
   Bygd på de samme kildene som spørsmålene (vegtrafikkloven, trafikkreglene, skiltforskriften, bruksforskriften,
   førerkort- og trafikkopplæringsforskriften) og på forklaringene i theory-b.js, som er faktasjekket mot Lovdata.
   Hver del: punkter med b (regelen, uthevet), t (kort forklaring) og fig (tegning fra trafficsvg.js), og qs: spørsmålene
   som hører til delen. «Les mer» etter et svar går til delen spørsmålet står i. calc: en kalkulator i delen.
   Rene data og små hjelpefunksjoner, testes i Node. */

const P = (b, t = '', fig = '') => ({ b, t, fig });

export const BOOK = [
  {
    id: 'fart', intro: 'Hvor fort du kjører, hvor du plasserer bilen, og hvor langt du trenger for å stanse.',
    sections: [
      { id: 'stopplengde', title: 'Stopplengde og avstand', calc: 'stopp', qs: ['f01', 'f02', 'f03', 'f04', 'f11', 'f12', 'f13', 'f14', 'f39'],
        points: [
          P('Stopplengde er reaksjonslengde pluss bremselengde.', 'Først kjører du videre mens du reagerer, så bremser bilen ned. Stopplengden er hele strekningen fra du oppdager en fare til bilen står stille.', 'diagram:stopp'),
          P('Dobbel fart gir dobbel reaksjonslengde og omtrent fire ganger så lang bremselengde.', 'Du bruker like lang tid på å reagere i alle farter, men i dobbel fart kjører du dobbelt så langt på den tiden. Bremselengden øker med kvadratet av farten.', 'diagram:dobbel'),
          P('Del farten i km/t på 3,6, så får du meter per sekund.', '80 km/t er rundt 22 meter i sekundet. Ser du ned i to sekunder, kjører du rundt 45 meter uten å se veien.', 'diagram:sekund-80-2'),
          P('Avstanden til bilen foran skal være så stor at du ikke kjører på om den bremser.', 'Hvor stor den må være, avhenger av fart, føre og sikt. Tell sekunder fra bilen foran passerer et fast punkt til du gjør det: jo høyere fart og dårligere føre, jo flere sekunder trenger du. Sekundene er en tommelfingerregel, ikke selve regelen.', 'diagram:tidsavstand'),
          P('Se langt fram.', 'Da oppdager du det som skjer i god tid, kan slippe gassen i stedet for å bremse hardt, og kjøringen blir både tryggere og jevnere.')
        ] },
      { id: 'sikt', title: 'Sikt, bakketopper og mørke', qs: ['f05', 'f06', 'f35', 'f36', 'f32', 'f33', 'f34', 'f44'],
        points: [
          P('Du skal kunne stanse på den strekningen du ser.', 'Fartsgrensen er bare en øvre grense. Over en bakketopp eller i en uoversiktlig sving kan riktig fart være mye lavere.', 'view:bakketopp'),
          P('På smal vei uten midtlinje har dere i praksis bare halve sikten hver.', 'Møtende kan komme midt i veien. Hold godt til høyre og senk farten før toppen.', 'view:bakketopp-smal'),
          P('I mørket er det lyset som avgjør hvor langt du ser.', 'En fotgjenger i mørke klær uten refleks ser du med nærlys ofte først når personen er rundt 25–30 meter foran. Med refleks ser du personen mye tidligere. Senk farten der du kan vente gående.', 'view:morke'),
          P('Lys skal alltid være på under kjøring, også om dagen.', 'Kjørelys holder om dagen. Når lys eller sikt krever det, bruker du nærlys. Blend ned fra fjernlys når du møter noen og når du kjører bak andre. Tåkebaklys bruker du bare når sikten er svært dårlig.')
        ] },
      { id: 'fore', title: 'Føre og veigrep', qs: ['f07', 'f08', 'f09', 'f10'],
        points: [
          P('Glattest er det ofte rundt null grader.', 'Da kan det ligge et tynt lag vann på isen. Våt is gir dårligst veggrep, og bremselengden kan bli mange ganger så lang som på tørr asfalt. Vær særlig forsiktig på bruer, i skygge og der veien ser blank ut.'),
          P('På glatt vei: lav fart, god avstand og myke bevegelser.', 'Da har du mest veggrep å gå på når du må bremse eller svinge.'),
          P('Vannplaning: dekkene flyter oppå vannet og mister grepet.', 'Det skjer lettere i høy fart, med slitte dekk og i dype vannsamlinger. Slipp gassen, hold rattet rolig og unngå å bremse hardt til dekkene får tak igjen.')
        ] },
      { id: 'felt', title: 'Plassering og feltvalg', qs: ['f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f40'],
        points: [
          P('Høyre felt er hovedregelen.', 'Venstre felt bruker du blant annet til forbikjøring og når du skal svinge til venstre.'),
          P('Velg felt i god tid før du svinger.', 'Skal du til venstre, legger du deg i feltet lengst til venstre. Skal du til høyre, i feltet lengst til høyre. Svinger du inn på en vei med flere felt i din retning, kan du velge det feltet som passer best.'),
          P('Ved sving til venstre på tovegs vei holder du så nær midten som mulig.', 'Da kan de bak deg kjøre forbi på høyre side. I en enveiskjørt gate legger du deg så langt til venstre som det er trygt.'),
          P('I rundkjøringen blinker du til høyre når du skal ut.', 'Skal du ta første avkjøring, ligger du i høyre felt og blinker til høyre allerede før du kjører inn. Skal du lenger, begynner du å blinke når du passerer avkjøringen før den du skal ta.'),
          P('Skal du av motorveien, legger du deg i feltet for fartsreduksjon så snart det begynner.', 'Bremse ned gjør du der, ikke i hovedfeltet.')
        ] },
      { id: 'forbikjoring', title: 'Forbikjøring', qs: ['f23', 'f24', 'f25', 'f26', 'f27', 'f41', 'f42', 'f43', 'r20', 'r21', 's47'],
        points: [
          P('Forbikjøring er forbudt der sikten er hindret av bakketopp, kurve eller annet.', 'Unntakene er felt der møtende trafikk ikke er tillatt, for eksempel på vei med midtdeler, og forbikjøring av en sykkel, moped eller motorsykkel som holder seg til høyre i feltet. Også da må du ha god plass og sikt.'),
          P('Like før og i kryss er forbikjøring forbudt, med noen unntak.', 'Det er lov i kryss med trafikklys eller politi, når den kryssende veien har vikeplikt etter skilt, på vei med to eller flere felt i din retning, når den foran svinger til venstre og du kjører forbi til høyre, og når du kjører forbi en sykkel, moped eller motorsykkel som holder seg til høyre i feltet. Høyreregelen er ikke vikeplikt etter skilt.'),
          P('Svinger bilen foran til venstre, kjører du forbi på høyre side.', 'Det må være plass i kjørebanen: veiskulderen er ikke for biler.', 'scene:forbi-venstresving'),
          P('Før du kjører forbi, må du være sikker på tre ting.', 'Veien er fri langt nok fram, ingen bak deg har begynt å kjøre forbi deg, og du kommer trygt inn igjen uten å hindre den du kjørte forbi.'),
          P('Kjør ikke forbi et kjøretøy som skjuler noe av gangfeltet foran.', 'Det kan ha stanset eller bremset for en fotgjenger du ikke ser.', 'scene:gangfelt-skjult'),
          P('Den som blir forbikjørt, holder til høyre og øker ikke farten.')
        ] },
      { id: 'tegn', title: 'Speil, tegn og planovergang', qs: ['f28', 'f29', 'f30', 'f31', 'f37', 'f38', 'f45', 'f46'],
        points: [
          P('Ta skulderblikk før du skifter felt eller kjører ut.', 'Skrått bak på hver side ser du verken i innvendig eller utvendig speil.', 'diagram:blindsone'),
          P('Gi tegn med blinklys i god tid når du svinger eller flytter bilen merkbart sidelengs.'),
          P('Hornet bruker du bare for å varsle om fare.'),
          P('Ved planovergang ser du etter tog, også når den er sikret.', 'Hold så lav fart at du kan stanse. Hvitt blinkende lys viser at anlegget virker, og rødt blink betyr at du skal stanse.'),
          P('En rytter følger reglene for kjøretøy.', 'Kjør sakte forbi med god avstand: hester kan skvette av lyd og bevegelse.')
        ] }
    ]
  },
  {
    id: 'trafikanter', intro: 'Hvordan du tar hensyn til barn, gående, syklister og andre, og hva som tar oppmerksomheten din.',
    sections: [
      { id: 'myke', title: 'Barn og gående', qs: ['t01', 't03', 't08', 't20', 't21', 't24', 't30', 't31', 't32'],
        points: [
          P('Ser du barn ved veien, holder du særlig lav fart og er klar til å stanse straks.', 'Barn tenker på leken, ikke på trafikken. En ball i veien kan bety at et barn kommer etter.', 'scene:ball'),
          P('Det samme gjelder ved skolepatrulje, og når du ser noen med hvit stokk eller som er hemmet i trafikken.', 'Ikke bruk hornet: det kan skremme.'),
          P('Må gående gå i kjørebanen, går de ytterst til venstre.', 'Først skal de bruke fortau, gangvei eller veiskulder. Til venstre møter de trafikken og ser bilene som kommer, men er det farlig der, kan de gå på høyre side. Den som leier sykkel, går ytterst til høyre. Regn med gående på begge sider.', 'diagram:gaende'),
          P('Gående kan krysse veien der det ikke er gangfelt i nærheten.', 'De skal gå rett over og ikke skape fare. Du har som hovedregel ikke vikeplikt for dem der, men svinger du i et kryss, har du vikeplikt for gående som krysser veien du svinger inn i.'),
          P('Vis hensyn mot dem som er ved veien.', 'Senk farten, så du ikke spruter vann eller søle på dem.')
        ] },
      { id: 'sykkel', title: 'Syklister og motorsykler', qs: ['t04', 't05', 't06', 't23', 't29', 't34', 't35'],
        points: [
          P('Gi god sideavstand når du kjører forbi en syklist, og bare når det er trygt.', 'Syklisten kan vingle. Sperrelinjen må du ikke kjøre over, heller ikke for å komme forbi.', 'scene:syklist-forbi'),
          P('Syklister kan kjøre forbi biler på både venstre og høyre side.', 'Sjekk speil og skulder til høyre før du svinger til høyre. Andre sykler kjører de forbi på venstre side.'),
          P('En syklist som skal til venstre, kan holde til høyre og svinge der det passer.', 'Syklisten har da vikeplikt, men regn med at den kan krysse foran deg.'),
          P('Syklister og elsparkesykler kan bruke fortauet når det er lite folk og ikke til fare.', 'Forbi gående skal de holde god avstand og omtrent gangfart, høyst 6 km/t. Regn med at de kan komme fort når du krysser et fortau.'),
          P('Motorsykler er lette å overse.', 'De er smale, blir lett skjult, og farten er vanskelig å bedømme. Se en ekstra gang før du svinger eller kjører ut.')
        ] },
      { id: 'kollektiv', title: 'Buss, trikk og store kjøretøy', qs: ['t02', 't07', 't17', 't22', 't26'],
        points: [
          P('Ved buss eller trikk på holdeplass holder du særlig lav fart og er klar til å stanse.', 'Passasjerer kan gå ut foran eller bak.', 'scene:buss-holdeplass'),
          P('Står trikken ved holdeplass uten trafikkøy, stanser du og gir fri vei for dem som går av og på.', '', 'scene:trikk'),
          P('Hold deg unna rett bak og på siden av store kjøretøy.', 'De har store blindsoner, og i svinger kutter bakhjulene innover. Med god avstand ser du mer, og sjåføren ser deg i speilene.', 'scene:lastebil-hoyre'),
          P('Gult blinkende lys på arbeidskjøretøy betyr at de kan fravike en del regler.', 'Hold god avstand og vær klar for at kjøretøyet kan stanse, rygge eller svinge uventet.')
        ] },
      { id: 'foreren', title: 'Oppmerksomhet og samspill', qs: ['t09', 't10', 't11', 't12', 't13', 't18', 't19', 't25', 't27', 't28'],
        points: [
          P('Trøtthet, rus og uoppmerksomhet øker reaksjonstiden mest.'),
          P('Håndholdt mobil er forbudt under kjøring.', 'Det gjelder også i kø og når du venter på grønt lys. Brudd gir bot og tre prikker.'),
          P('Synsfeltet blir smalere når farten øker.', 'Barn, syklister og dyr på siden av veien blir lettere oversett.'),
          P('Frontstolpen kan skjule en fotgjenger.', 'Flytt hodet litt fram og tilbake, særlig når du svinger.', 'diagram:astolpe'),
          P('Blir du blendet av møtende, ser du mot høyre veikant og senker farten.'),
          P('Vis i god tid hva du skal, og følg med på hva andre skal.', 'Ikke vink andre over: det kan lede dem ut i fare fra trafikk du ikke ser. Stopper køen, venter du før gangfeltet så du ikke blir stående i det.')
        ] },
      { id: 'miljo', title: 'Miljø', qs: ['t14', 't15', 't16', 't33'],
        points: [
          P('Jevn fart, tidlig gasslipp og myke akselerasjoner gir lavest forbruk og minst utslipp.'),
          P('Unødig tomgang og unødvendig kjøring ved bebyggelse er forbudt.'),
          P('Piggdekk på bar asfalt sliter veien og lager svevestøv.')
        ] }
    ]
  },
  {
    id: 'ansvar', intro: 'Øvelseskjøring, førerkortet, rus og prikker, og hva du gjør ved et uhell.',
    sections: [
      { id: 'ovelse', title: 'Øvelseskjøring og førerkort', qs: ['a02', 'a03', 'a04', 'a05', 'a06', 'a07', 'a08', 'a41'],
        points: [
          P('Du kan begynne å øvelseskjøre bil fra du er 16 år, når trafikalt grunnkurs er fullført.'),
          P('Ledsageren må ha fylt 25 år og hatt førerkort for bil uten avbrudd de siste 5 årene.', 'Ledsageren regnes som fører, men trafikkreglene og reglene om rus og helse gjelder også for eleven. Det kan bare være én elev om gangen.'),
          P('Ta med bevis for trafikalt grunnkurs og legitimasjon med bilde.'),
          P('Bilen skal ha et ekstra speil til ledsageren og et L-skilt bak.', 'L-skiltet har rød L på hvit bunn. Ta det av når bilen brukes til annet.', 'pict:lskilt'),
          P('Fra 1. november til 15. mars må mørkekjøringen være tatt før du kan øvelseskjøre.'),
          P('Første førerkort for bil har 2 års prøveperiode.')
        ] },
      { id: 'prikker', title: 'Rus, prikker og førerretten', qs: ['a01', 'a09', 'a10', 'a11', 'a12', 'a25', 'a26', 'a27', 'a35', 'a37', 'a38', 'a39', 'a40', 'r05'],
        points: [
          P('Promillegrensen er 0,2.', 'Over den regnes du alltid som påvirket, men du kan være påvirket under den også. Bare tid får alkoholen ut av kroppen.'),
          P('Medisin med rød varseltrekant kan svekke evnen til å kjøre.', 'Spør legen eller apoteket før du kjører.', 'pict:medisin'),
          P('Åtte prikker på tre år gir tap av førerretten i seks måneder.', 'Blant annet brudd på vikeplikten, kjøring mot rødt lys, håndholdt mobil og for kort avstand gir tre prikker. I prøveperioden dobles prikkene, og mister du førerretten da, må du ta ny full førerprøve.'),
          P('Promille i prøveperioden gir tap av førerretten.', 'Mellom 0,2 og 0,5 promille mister du førerretten i inntil ett år i tillegg til boten. Over 0,5 promille mister du den som hovedregel i minst ett år, uansett prøveperiode.'),
          P('Forstår du at politiet kan komme til å etterforske kjøringen, må du ikke drikke alkohol de første seks timene.', 'Det gjelder for eksempel etter et uhell, og også andre rusmidler. Forbudet faller bort når politiet har tatt prøve eller bestemt at det ikke skal tas.'),
          P('Den som har voldt et uhell og blir straffet for ikke å ha hjulpet de skadde, mister førerretten for alltid.'),
          P('Kjør ikke når du er trøtt eller syk.', 'Bare hvile hjelper mot trøtthet. Stans på et trygt sted og ta en kort lur.')
        ] },
      { id: 'uhell', title: 'Uhell og førstehjelp', qs: ['a16', 'a17', 'a18', 'a19', 'a20', 'a21', 'a22', 'a23', 'a24'],
        points: [
          P('Ved uhell skal du stanse og hjelpe personer og dyr som er skadet.', 'Er noen drept eller skadet, og skaden ikke er ubetydelig, skal politiet varsles. Er det bare skade på ting, oppgir dere navn og adresse til hverandre. Er eieren ikke der, for eksempel ved en parkert bil, gir du beskjed til eieren eller politiet snarest.'),
          P('Har du kjørt på elg, hjort eller rådyr, melder du fra til politiet.', 'Har du kjørt på et husdyr eller kjæledyr, gir du beskjed til eieren, eller til politiet hvis du ikke får tak i eieren.'),
          P('Sikre stedet med nødsignallys, refleksvest og varseltrekant.', 'Varseltrekanten settes så langt bak at andre ser den i tide, om mulig minst 150 meter.', 'diagram:trekant'),
          P('Puster personen ikke normalt: ring 113 og start hjerte-lunge-redning.', '30 kompresjoner og 2 innblåsninger. Puster personen normalt, legger du den i stabilt sideleie og følger med på pusten.', 'diagram:nodnummer'),
          P('Brenner det i en tunnel, kjører du ut hvis du kan.', 'Kommer du ikke forbi, stanser du, slår på nødsignallyset og går bort fra røyken: til nærmeste nødutgang eller ut av tunnelen. La nøkkelen stå i bilen.')
        ] },
      { id: 'passasjer', title: 'Passasjerer og barn', qs: ['a13', 'a14', 'a15', 'a34'],
        points: [
          P('Føreren har ansvaret for at passasjerer under 15 år er sikret.'),
          P('Sett aldri et bakovervendt barnesete foran en kollisjonspute som er på.', 'Puten utløses med stor kraft. Slå den av, eller sett barnesetet i baksetet.'),
          P('Barn under 135 cm skal ha barnesete eller beltepute.', 'Hovedregelen er at barn under 150 cm skal bruke godkjent sikringsutstyr.'),
          P('Ha ikke med flere enn bilen er registrert for.')
        ] },
      { id: 'eier', title: 'Bilens stand og papirer', qs: ['a28', 'a29', 'a30', 'a31', 'a32', 'a33', 'a36'],
        points: [
          P('Føreren skal sjekke at bilen er i forsvarlig stand før kjøring.', 'Fjern snø, is og dugg fra alle ruter og speil, og snø fra taket.'),
          P('Alle registrerte biler skal ha ansvarsforsikring.'),
          P('Personbiler skal til EU-kontroll første gang innen fire år, og deretter hvert andre år.'),
          P('Selger du bilen, melder du eierskiftet innen 3 dager.')
        ] }
    ]
  },
  {
    id: 'kjoretoy', intro: 'Dekk, varsellamper, bremser og systemene i bilen.',
    sections: [
      { id: 'dekk', title: 'Dekk og kjetting', qs: ['k01', 'k02', 'k03', 'k04', 'k05', 'k06', 'k07', 'k24', 'k31', 'k32', 'k33', 'k34'],
        points: [
          P('Minste mønsterdybde for personbil er 1,6 mm om sommeren og 3 mm om vinteren.', 'Mål i hovedrillene. Vinterkravet gjelder fra 1. november til første søndag etter 2. påskedag, og i Nordland, Troms og Finnmark fra 16. oktober til 30. april.', 'diagram:monster'),
          P('Piggdekk er forbudt fra første mandag etter 2. påskedag til 31. oktober.', 'Unntaket er når føret gjør det nødvendig. I Nordland, Troms og Finnmark gjelder forbudet fra 1. mai til 15. oktober.'),
          P('Har bilen piggdekk, skal alle hjulene ha det.', 'Loven tillater ett unntak: piggdekk på én aksel og kjetting ellers. Pigger er bare lov i vinterdekk, og alle piggdekkene skal ha omtrent like mange.'),
          P('Kjettingen legger du på drivhjulene, der den gir trekkraft.', 'På en forhjulsdrevet bil er det forhjulene.'),
          P('Dekkene på samme aksel skal ha omtrent samme egenskaper.', 'Ulike dekk kan få bilen til å trekke skjevt eller skli når du bremser eller svinger.'),
          P('Etter en punktering kan du kortvarig bruke reservehjulet, selv om dekktypene da blir blandet.', 'Et lite, plass-sparende reservehjul er bare for kjøring til nærmeste reparasjonssted. Hold deg under farten som står på hjulet.'),
          P('Riktig lufttrykk står i instruksjonsboka eller på et merke i bilen.', 'Tallet på dekksiden er høyeste tillatte trykk for dekket. For lavt trykk gir dårligere styring og veggrep og høyere forbruk.'),
          P('Vinterdekk er merket M+S eller med et fjell med snøkrystall.', '', 'pict:vinterdekk')
        ] },
      { id: 'lamper', title: 'Varsellamper', qs: ['k11', 'k12', 'k13', 'k14', 'k15', 'k29'],
        points: [
          P('Rød lampe: stans så snart det er trygt.', 'For eksempel feil på bremser, oljetrykk eller kjøling.', 'lamp:olje'),
          P('Gul eller oransje lampe: noe må sjekkes snart.', 'For eksempel lavt dekktrykk eller feil på ABS eller motor.', 'lamp:motor'),
          P('Grønne og blå lamper viser at noe er slått på.', 'Den blå viser at fjernlyset er på.', 'lamp:fjernlys'),
          P('Når du starter bilen, lyser lampene et øyeblikk som en test.', 'En lampe som ikke slukker, varsler om en feil.', 'pict:dash'),
          P('Blinker blinklyset mye raskere enn vanlig, er en pære trolig ødelagt.')
        ] },
      { id: 'bremser', title: 'Bremser, styring og væsker', qs: ['k08', 'k09', 'k10', 'k16', 'k17', 'k18', 'k25', 'k26'],
        points: [
          P('Med ABS tråkker du hardt, holder pedalen inne og styrer.', 'ABS hindrer at hjulene låser seg, så du kan styre mens du bremser. Bremselengden blir ikke alltid kortere.', 'lamp:abs'),
          P('Antiskrens (ESC) bremser enkelthjul så bilen holder kursen.', 'Den kan ikke oppheve fysikken: for høy fart er fortsatt for høy fart.', 'lamp:esc'),
          P('Åpne aldri kjølesystemet når motoren er varm.', 'Systemet står under trykk, og varm væske kan sprute ut.', 'cap:kjole'),
          P('Synker bremsevæsken tydelig, kan det være slitte klosser eller lekkasje.', 'Kjør ikke hvis bremsepedalen føles myk.', 'cap:brems'),
          P('Bremseservoen på en bensin- eller dieselbil kan du sjekke selv.', 'Trå pedalen flere ganger med motoren av, hold den inne og start: pedalen skal synke litt. Gjør den ikke det, blir bremsingen mye tyngre.'),
          P('Bytt slitte viskerblader, og bruk vinterspylervæske om vinteren.')
        ] },
      { id: 'stotte', title: 'Førerstøtte og elbil', qs: ['k19', 'k20', 'k21', 'k22', 'k23', 'k30'],
        points: [
          P('Du har alltid ansvaret, også når førerstøttesystemene er på.'),
          P('Filholder og nødbrems hjelper, men du kan ikke stole på dem.', 'De ser ikke alt, og virker dårligere i mørke, regn og snø og der linjene er slitte.'),
          P('En elbil bremser når du slipper gassen, og kommer kortere i kulde.', 'Lær hvor kraftig bilen deres bremser, og husk at det er du som må bremse i tide.')
        ] },
      { id: 'sikring', title: 'Sikring, last og utstyr', qs: ['k27', 'k28', 'k35', 'k36', 'r30', 'r31'],
        points: [
          P('Hodestøtten skal være omtrent i høyde med toppen av hodet, nær bakhodet.'),
          P('Bilbeltet skal ligge lavt over hoftene og midt over skulderen.'),
          P('Last og sykler må ikke dekke lys eller kjennemerke.', 'Skjuler syklene dem, bruker du en lysbjelke med lys og registreringsnummer.', 'pict:sykkelstativ'),
          P('Last som stikker mer enn 1 meter ut bak, skal merkes.', 'I mørket også med en lykt med rødt lys.'),
          P('Tauer du en bil, skal tauet eller stanga være tydelig merket, også om dagen.', 'Bilen som blir trukket, må kunne bremses forsvarlig, og du kan bare trekke én bil om gangen.'),
          P('Utstyr som kobler ut avgassrensing eller varsler om trafikkontroll, er forbudt.')
        ] }
    ]
  },
  {
    id: 'regler', intro: 'Grunnregelen, fartsgrensene og reglene for stans og parkering.',
    sections: [
      { id: 'grunnregel', title: 'Grunnregelen og fartsgrensene', qs: ['r01', 'r02', 'r03', 'r04', 'r06', 'r16', 'r25'],
        points: [
          P('Grunnregelen: alle skal være hensynsfulle og varsomme, så det ikke oppstår fare.', 'Du skal heller ikke hindre eller forstyrre annen trafikk unødig. Den gjelder alltid, også der ingen annen regel sier noe.'),
          P('Fartsgrensen er 50 km/t i tettbygd strøk og 80 km/t utenfor, når ingen skilt sier noe annet.'),
          P('Fartsgrensen er den høyeste farten, ikke den riktige.', 'Farten skal alltid passe til stedet, føret, sikten og trafikken.'),
          P('Med tilhenger kjører du høyst 80 km/t der fartsgrensen er høyere.', 'Unntaket er når både bil og tilhenger er godkjent for 100 km/t.'),
          P('I gatetun og gågate kjører du i gangfart og har vikeplikt for gående.', 'I gatetun kan du bare parkere på merkede plasser.', 'sign:540')
        ] },
      { id: 'stans', title: 'Stans og parkering', qs: ['r09', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'r17', 'r18', 'r22', 'r23', 'r24', 'r26', 'r32', 'r35'],
        points: [
          P('Du kan ikke stanse nærmere enn 5 meter fra et kryss.', 'Avstanden regnes fra der fortauskanten eller veikanten begynner å runde.', 'diagram:5m-kryss'),
          P('Du kan ikke stanse på et gangfelt eller nærmere enn 5 meter foran det.', '', 'diagram:5m-gangfelt'),
          P('Andre steder der stans er forbudt:', 'I tunnel, på bakketopp og i uoversiktlig kurve, nærmere enn 5 meter fra en planovergang, helt eller delvis på fortau, i kollektiv-, sambruks- og sykkelfelt, og nærmere enn 20 meter fra skiltet for en bussholdeplass (kort av- og påstigning er lov når det ikke hindrer).'),
          P('Parkering er all hensetting av bilen, også når du blir sittende i den.', 'Bare kortest mulig stans for av- og påstigning eller lasting er ikke parkering. Parkering er forbudt foran innkjørsler, på møteplasser og på kjørebanen på forkjørsvei med fartsgrense over 50 km/t.'),
          P('Står bilen på en mørk vei der den er vanskelig å se, skal parkeringslyset være på.'),
          P('Går du fra bilen, sørger du for at den ikke kan sette seg i gang eller brukes av andre.')
        ] },
      { id: 'veier', title: 'Motorvei, felt og kryss', qs: ['r07', 'r08', 'r19', 'r27', 'r28', 'r29', 'r33', 'r34'],
        points: [
          P('På motorvei og motortrafikkvei er rygging, vending og stans forbudt.', 'Det gjelder også på skulderen og i av- og påkjøringene.', 'sign:502'),
          P('Bare motorvogner som lovlig kan kjøre minst 40 km/t, kan bruke motorvei.', 'Moped er forbudt der.'),
          P('Kollektivfelt, sambruksfelt og sykkelfelt har egne regler.', 'Elbiler kan bruke kollektivfelt om skilt ikke sier noe annet. Tungtrafikkfelt kan bare brukes av dem skiltet angir, og der gir elbil ikke noe unntak. Sykkelfeltet er bare for syklende og elsparkesykler.'),
          P('Kjør ikke inn i et kryss du ikke kommer ut av.', 'Blir du stående, stenger du for trafikken på den kryssende veien. Det gjelder også på grønt lys.', 'scene:ko-kryss'),
          P('Trafikkreglene gjelder også på parkeringsplasser som er åpne for alle.')
        ] }
    ]
  },
  {
    id: 'skilt', intro: 'Hvordan du kjenner igjen skiltgruppene, og hva linjene i veien betyr. Alle skiltene øver du på i skiltprøven.',
    sections: [
      { id: 'grupper', title: 'Skiltgruppene', qs: ['s24', 's25', 's26', 's27', 's28', 's29', 's30', 's31', 's33', 's46', 's48'],
        points: [
          P('Fareskilt er som regel trekanter med rød kant.', 'De varsler om fare: senk farten og vær klar.', 'sign:116'),
          P('Forbudsskilt er runde med rød kant, og gjelder som regel fram til nærmeste kryss.', 'Fartsgrensen er et unntak: den gjelder til den oppheves.', 'sign:372'),
          P('Påbudsskilt er runde og blå.', 'De viser det du skal gjøre.', 'sign:402'),
          P('Opplysningsskilt er blå firkanter.', 'De viser regler som gjelder på stedet.', 'sign:552'),
          P('Gul bunn på fare-, forbuds- og opplysningsskilt betyr midlertidig skilting, for eksempel ved veiarbeid.', 'Skiltene gjelder fullt ut så lenge de står. Mange vegvisere har gul bunn hele tiden, så for dem betyr det ikke noe midlertidig.'),
          P('På underskiltet «Tid» gjelder sorte tall hverdager unntatt lørdag, tall i parentes lørdager og røde tall søndager og helligdager.', 'Står det ingen røde tall, gjelder skiltet ikke på søndager og helligdager.'),
          P('Underskiltet «Anbefalt fart» er ikke en fartsgrense.', 'Er det glatt, mørkt eller dårlig sikt, må du kjøre saktere.')
        ] },
      { id: 'vikeskilt', title: 'Vikeplikt- og forkjørsskilt', qs: ['s01', 's02', 's03', 's04', 's05', 's06', 's32'],
        points: [
          P('Ved Vikeplikt (202) viker du for trafikk fra begge retninger.', '', 'sign:202'),
          P('Ved Stopp (204) stanser du helt, også når veien er fri.', 'Stans ved stopplinjen, og rull forsiktig fram hvis du ikke ser godt nok.', 'sign:204'),
          P('Forkjørsvei (206) gjelder til den oppheves.', 'Den oppheves av skilt 208, 202 eller 204, ikke av et kryss.', 'sign:206'),
          P('Forkjørskryss (210) og Farlig vegkryss (124) er ikke det samme.', 'Ved 210 har sideveiene vikeplikt for deg. Ved 124 gjelder høyreregelen.', 'sign:124'),
          P('Trafikklys gjelder foran vikepliktskilt.', 'Skiltet gjelder igjen når lyset er av eller blinker gult.')
        ] },
      { id: 'forbud', title: 'Fartsgrenser og forbud', qs: ['s07', 's08', 's09', 's10', 's11', 's12', 's13', 's14', 's15', 's44', 's45'],
        points: [
          P('Fartsgrensen gjelder til et nytt skilt opphever den.', 'Den gjelder også etter kryss. Etter skilt 364 «Slutt på særskilt fartsgrense» gjelder den generelle grensen.', 'sign:362:60'),
          P('Stans forbudt (370) og Parkering forbudt (372) gjelder på den siden der skiltet står.', 'Fram til nærmeste kryss eller nytt skilt. Ved 372 kan du stanse kort for av- og påstigning.', 'sign:370'),
          P('Forbikjøringsforbud (334) gjelder til skilt 336, ikke bare til krysset.', 'Du kan fortsatt kjøre forbi sykler og motorsykler.', 'sign:334'),
          P('Vendingsforbud (332) gjelder til og med første kryss.')
        ] },
      { id: 'pabud', title: 'Påbud og opplysning', qs: ['s16', 's17', 's18', 's19', 's20', 's21', 's22', 's23'],
        points: [
          P('Påbudt kjøreretning (402) viser hvilken vei du skal kjøre.', 'Påbudt kjørefelt (404) viser hvilken side du skal kjøre forbi, for eksempel på en trafikkøy.', 'sign:402'),
          P('Motorveg (502) og Motortrafikkveg (503) viser at egne regler gjelder.', 'Blant annet er rygging, vending og stans forbudt. Fartsgrensen står på egne skilt.', 'sign:502'),
          P('Ved Gangfelt (516) har du vikeplikt for gående som er i eller på vei ut i gangfeltet.', 'Fareskiltet 140 «Avstand til gangfelt» varsler et gangfelt lenger fram.', 'sign:516'),
          P('Envegskjøring (526): kjøring er bare tillatt i pilens retning.', '', 'sign:526'),
          P('Blindveg (527): veien er stengt lenger fram, så du må snu.', '', 'sign:527'),
          P('Parkering (552): parkering er tillatt, men andre regler gjelder fortsatt.', 'Du kan for eksempel ikke parkere nærmere enn 5 meter fra et kryss.', 'sign:552')
        ] },
      { id: 'oppmerking', title: 'Linjene i veien', qs: ['s34', 's35', 's36', 's37', 's38', 's39', 's40', 's41', 's42', 's43'],
        points: [
          P('Sperrelinje: du må ikke kjøre på eller over den.', 'Heller ikke for å svinge inn på en sidevei.', 'line:sperre'),
          P('Varsellinje: lange streker og korte mellomrom.', 'Den varsler kort sikt. Krysse den kan du, men bare når det er trygt.', 'line:varsel'),
          P('Kombinerte linjer: følg linjen som ligger nærmest deg.', '', 'line:kombi'),
          P('Vikelinjen viser hvor vikeplikten begynner, og stopplinjen hvor du skal stanse.', '', 'line:vike'),
          P('På et sperreområde med heltrukken kant kjører du ikke.', '', 'line:sperreomrade'),
          P('Går to felt sammen, kjører dere inn annenhver gang.', 'Står det skilt 532 «Kjørefelt slutter», har de i feltet som slutter, vikeplikt. Fra feltet for fartsøkning tilpasser du farten og fletter inn.', 'scene:fletting')
        ] }
    ]
  },
  {
    id: 'vikeplikt', intro: 'Hvem som skal vike: høyreregelen, sving, utkjøring, gangfelt, lys og politiets tegn.',
    sections: [
      { id: 'hoyreregel', title: 'Høyreregelen', qs: ['v01', 'v03', 'v31', 'v40'],
        points: [
          P('Uten skilt eller lys har du vikeplikt for dem som kommer fra høyre.', '', 'scene:hoyre'),
          P('Det gjelder også i T-kryss og på veier som ser ut som hovedvei.', 'Rundkjøringer har som regel vikepliktskilt. Uten skilt gjelder høyreregelen der også.', 'scene:t-kryss')
        ] },
      { id: 'sving', title: 'Sving og møtende', qs: ['v02', 'v09', 'v22', 'v29', 'v36', 'v41', 'v42'],
        points: [
          P('Svinger du til venstre, viker du for møtende som skal rett fram eller til høyre.', 'Også på grønt lys og på forkjørsvei.', 'scene:venstresving'),
          P('Svinger du, viker du for gående og syklende som skal rett fram.', 'Se i speilet og over skulderen før du svinger.', 'scene:hoyresving-sykkel'),
          P('Er veien delvis sperret, har den vikeplikt som har sperringen på sin side.', '', 'scene:sperret')
        ] },
      { id: 'utkjoring', title: 'Ut fra parkering, eiendom og veikanten', qs: ['v04', 'v05', 'v10', 'v11', 'v24', 'v25', 'v26', 'v32', 'v34', 'v35'],
        points: [
          P('Fra parkeringsplass, eiendom, bensinstasjon og gatetun har du vikeplikt for alle.', '', 'scene:parkering'),
          P('Rygger eller vender du, har du vikeplikt for all annen trafikk.', 'Ser du ikke godt nok bak bilen, ber du noen passe på eller går ut og ser selv.'),
          P('Kjører du ut fra veikanten eller over et fortau, har du vikeplikt.', 'Over fortau viker du for gående, og svinger du inn over et fortau, også for syklende der.', 'scene:innkjorsel-fortau'),
          P('Fra gang- og sykkelvei har syklisten vikeplikt for trafikken på veien.', 'Vær likevel forberedt på at syklisten ikke stanser.', 'scene:gs-vei')
        ] },
      { id: 'gangfelt', title: 'Gangfelt, buss og utrykning', qs: ['v06', 'v07', 'v08', 'v12', 'v13', 'v14'],
        points: [
          P('Ved gangfelt uten lys viker du for gående som er i eller på vei ut i det.', '', 'scene:gangfelt'),
          P('Buss som gir tegn fra holdeplass: vikeplikt der fartsgrensen er 60 km/t eller lavere.', '', 'scene:buss'),
          P('Gi fri vei for utrykningskjøretøy med blått blinklys, også uten sirene.', '', 'scene:utrykning'),
          P('Gi fri vei for tog og sporvogn, og stans om nødvendig.', 'Trafikklys og skilt går foran denne regelen, også overfor sporvognen. Ved en planovergang ser du likevel alltid etter tog, også når den har bom eller lys.'),
          P('Du må ikke hindre eller forstyrre gående i gruppe med en leder, et opptog eller et gravfølge.', 'Det gjelder også utenfor gangfelt, for eksempel barnehagebarn som går over veien med en voksen.')
        ] },
      { id: 'lys', title: 'Trafikklys og politiets tegn', qs: ['v15', 'v16', 'v17', 'v18', 'v19', 'v20', 'v21'],
        points: [
          P('Gult lys: stans, om du kan gjøre det uten fare.', '', 'light:gul'),
          P('Rødt og gult samtidig: gjør deg klar, men vent på grønt.', '', 'light:rodgul'),
          P('Gult blinklys: vær særlig oppmerksom. Skilt eller høyreregelen avgjør vikeplikten.', '', 'light:gulblink'),
          P('Politiets tegn går foran lys, skilt og regler.', 'Arm rett opp: stans for alle. Arm rettet ut til siden: de som kommer forfra eller bakfra, stanser.', 'pict:politi-opp')
        ] },
      { id: 'feltskifte', title: 'Rundkjøring og feltskifte', qs: ['v23', 'v27', 'v28', 'v30', 'v33', 'v43'],
        points: [
          P('I rundkjøring med vikepliktskilt viker du for dem som er i rundkjøringen.', '', 'scene:rundkjoring'),
          P('Den som skifter felt, har vikeplikt.', 'Ta ett felt om gangen, med blinklys og skulderblikk.', 'scene:tre-felt'),
          P('Vis vikeplikten tydelig ved å senke farten eller stanse i god tid.', 'Den du viker for, skal kunne fortsette uten å bremse eller bli usikker.')
        ] }
    ]
  }
];

/* Hvilken del av boka et spørsmål hører til: { chapter, section } eller null */
const INDEX = new Map();
for (const ch of BOOK) for (const s of ch.sections) for (const q of s.qs) if (!INDEX.has(q)) INDEX.set(q, { chapter: ch.id, section: s.id });
export const sectionFor = id => INDEX.get(id) || null;
export const bookChapter = id => BOOK.find(c => c.id === id) || null;

/* Stopplengde-kalkulatoren: reaksjonstid 1 sekund og vanlige friksjonstall (omtrentlig, som i teoriboka).
   Bremselengde = v² / (2 · μ · g), med v i m/s. */
export const SURFACES = [
  { id: 'torr', label: 'Tørr asfalt', mu: 0.8 },
  { id: 'vaat', label: 'Våt asfalt', mu: 0.5 },
  { id: 'sno', label: 'Snø', mu: 0.2 },
  { id: 'is', label: 'Is', mu: 0.1 }
];
export function stopDistance(kmh, mu, reaction = 1) {
  const v = kmh / 3.6;
  const r = v * reaction, b = (v * v) / (2 * mu * 9.81);
  return { reaction: r, braking: b, total: r + b };
}
/* Farten når du treffer noe som står «at» meter fram (0.22.0, til avspillingen i kalkulatoren). Treffer du før
   reaksjonstida er over, er farten uendret; ellers bremser bilen med friksjonen mu fram til treffpunktet. */
export function impactSpeed(kmh, mu, at, reaction = 1) {
  const v = kmh / 3.6, r = v * reaction;
  if (at <= r) return kmh;
  const v2 = v * v - 2 * mu * 9.81 * (at - r);
  return v2 > 0 ? Math.sqrt(v2) * 3.6 : 0;
}
