/* Guider (0.10.1): korte veiledninger som dukker opp på Hjem når de er nyttige, én om gangen, og som kan lukkes
   med ×. Alle ligger også under Innstillinger › Guider og tips, og kan vises på Hjem igjen derfra.
   Ren modul uten nettleseravhengighet, så valget av guide kan testes i Node.
   ctx: { real: antall ekte turer, cameraOn, calibrated, roadCam, native, unbacked: turer uten sikkerhetskopi, dark: mørketid } */

export const GUIDES = [
  {
    id: 'start', icon: 'play', title: 'Slik fungerer det',
    lead: 'Tre ting å vite før første tur.',
    when: c => c.real === 0,
    steps: [
      ['Fest telefonen', 'i en holder med skjermen mot ledsageren. Føreren rører ikke telefonen under kjøring.'],
      ['Ledsageren trykker «Start»', 'når sjekkene er grønne. Under turen vises bare fartsgrensen, og det piper før fotobokser.'],
      ['Hold «Stopp» inne', 'i ett sekund når dere er framme. Rapporten med neste øvingstur kommer med én gang.']
    ]
  },
  {
    id: 'holder', icon: 'pin', title: 'Gjør klar telefonen i bilen',
    lead: 'Jo stødigere telefonen står, jo bedre blir målingene.',
    when: c => c.real < 3,
    steps: [
      ['Fast holder rett ved rattet', 'så nær førerens vanlige synsfelt som mulig, men uten å skjule utsynet gjennom frontruta. Det er kravet i forskriften om mobiltelefon i bil. Ikke midt på dashbordet mot passasjersiden, og ikke på kollisjonsputene.'],
      ['Stødig og stående', 'En telefon som vipper eller ligger løst, gir falske bremser og svinger. Med kameraet på skal det se føreren.'],
      ['Lader i', 'på lange turer. GPS, skjerm og kamera bruker mye strøm.'],
      ['Gå ut av andre apper', 'og la Kjørerapport stå åpen. I iPhone-appen fortsetter opptaket også med låst skjerm.']
    ]
  },
  {
    id: 'camera', icon: 'camera', title: 'Kameraet: få gode målinger',
    lead: 'Kalibrer der telefonen faktisk står under kjøring.',
    when: c => c.cameraOn,
    steps: [
      ['Kalibrer i holderen', 'med føreren i førersetet. Flyttes holderen eller setet, sier appen fra før turen (kalibrering tar 30 sekunder).'],
      ['Ansiktet godt synlig', 'og ikke for mye motlys. Solbriller er greit, men kapse langt ned i pannen gjør det vanskeligere.'],
      ['Veikameraet ser best', 'når telefonen står nær frontruta. Demp skjermen om kvelden, så den ikke speiler seg i ruta.'],
      ['Ingen bilder lagres', 'bare vinkler og tall. Rapporten får «Speil og skulderblikk» og «Veien foran».']
    ]
  },
  {
    id: 'report', icon: 'chart', title: 'Slik leser du rapporten',
    lead: 'Rapporten viser det som bør øves på, ikke en karakter.',
    when: c => c.real >= 1,
    steps: [
      ['Kort fortalt', 'øverst sier hva som gikk bra og hva dere kan øve på neste gang.'],
      ['Situasjoner', 'er steder der noe skjedde: fartshumper, gangfelt, kryss og fart over grensen. Trykk for å se hvor.'],
      ['Kartet', 'viser ruten. Trykk på det for å utforske i full skjerm, og trykk på et nummer for å se hendelsen.'],
      ['Spill av turen', 'og snakk sammen om situasjonene mens dere husker dem.']
    ]
  },
  {
    id: 'backup', icon: 'shield', title: 'Ta vare på turene',
    lead: 'Turene ligger bare på denne telefonen.',
    when: c => c.unbacked >= 3,
    steps: [
      ['Ta kopi', 'under Innstillinger › Data. Lagre filen i Filer, iCloud Drive eller send den til deg selv.'],
      ['Ny telefon?', 'Velg «Gjenopprett» og filen, så kommer turene og innstillingene tilbake.']
    ]
  },
  {
    id: 'teacher', icon: 'school', title: 'Del med trafikklæreren',
    lead: 'Trafikklæreren ser fort hva dere har øvd på.',
    when: c => c.real >= 3,
    steps: [
      ['Fanen Trafikklærer', 'samler turene, timene og det som bør øves på, på én side.'],
      ['Del eller skriv ut', 'oppsummeringen før neste kjøretime.']
    ]
  },
  {
    id: 'dark', icon: 'moon', title: 'Mørkekjøring',
    lead: 'Det er mørketid. Mørkekjøring er en del av opplæringen.',
    when: c => c.dark && c.real >= 1,
    steps: [
      ['Planlegg en kveldstur', 'på landevei. Appen registrerer selv hvor mye som kjøres i mørke og skumring.'],
      ['Hold lengre avstand', 'til bilen foran: minst 3 sekunder i mørke eller på glatt vei.'],
      ['Demp skjermen', 'så den ikke blender føreren eller speiler seg i frontruta.']
    ]
  }
];

/* Guiden som skal vises på Hjem nå (den første som passer og ikke er lukket), eller null. */
export function guideFor(ctx, closed = {}) {
  return GUIDES.find(g => !closed[g.id] && g.when(ctx)) || null;
}

/* Mørketid (oktober–februar), for mørkeguiden */
export const isDarkSeason = (d = new Date()) => [9, 10, 11, 0, 1].includes(d.getMonth());
