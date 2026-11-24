# Slik sender du Kjørerapport til App Store

**24. november: klar til innsending med 1.0.16.** Gjennomgangen 24. november fant ti ting som er rettet i 1.0.16 (utviklerverktøyene, lærervisningen, trafikkskolesiden, tellingen av kjøp, personvern, posisjon, tekster). To ting gjenstår før du sender inn: én lang prøvetur med den nye bilmodellen (1.0.15 og nyere), og helst at en trafikklærer har lest gjennom teorien. Regn med 1–2 timer arbeid, og så 1–3 dager venting på Apple.

Detaljene (tekstene, svarene og begrunnelsene) står i [README.md](README.md). Her er rekkefølgen.

---

## Allerede ferdig

- [x] Appen 1.0.0: opptak og rapport, begge kameraene, teorien (420 spørsmål, 123 skilt, prøver, teoribok), sikkerhetskontrollen med quiz, opplæringsplan, trafikklærer med meldinger, Pluss-kjøpet og koder fra trafikkskolen
- [x] Modellene som selges ligger i appen: bilmodellen «D-FINE small norsk» (1.0.15) og feltmodellen n3 (1.0.5; Audi krediteres under Om appen › Lisenser og kilder)
- [x] Ikon (lyst og mørkt), tillatelsestekster, personvernmanifest som stemmer med etiketten, eksportsvar (ingen kryptering)
- [x] App Store-bilder i [`skjermbilder/`](skjermbilder/) (6,9"): 8 nye bilder av 1.0.0 fra 22. november, teorien først
- [x] Beskrivelse ([`beskrivelse.txt`](beskrivelse.txt)), navn, undertittel, nøkkelord, kampanjetekst (README del 2)
- [x] Personvern: https://svendsenmedia.net/kjorerapport/personvern/
- [x] Hjelp og kontakt (støtte-URL): https://svendsenmedia.net/kjorerapport/hjelp/
- [x] Notat til App Review på engelsk (README del 7), med en egen skolekode til Apple i `.local-test/skolekoder/apple-review.txt`
- [x] Bilde av Pluss-siden til kjøpene: [`kjop-pluss-review.png`](kjop-pluss-review.png)
- [x] Testkjøp i Xcode (`ios/Pluss.storekit`)
- [x] Valgene dine (22. november): navnet Kjørerapport, meldinger «ja» i aldersgrensen, personvernetiketten, n2 med kreditering til Audi

---

## Dag 1: når du har fylt 18

### 1. Meld deg inn i Apple Developer Program
- Gå til developer.apple.com/programs/enroll og logg inn med Apple-ID-en din (tofaktor må være på).
- Velg **Individual / Sole Proprietor** (ikke Organization: et ENK er ikke et eget selskap for Apple).
- Betal (rundt 1 200 kr i året). Godkjenning tar vanligvis 1–2 dager.

### 2. Avtaler, bank og skatt (App Store Connect › Business)
- Godta **Paid Applications Agreement**. Uten den kan ikke Pluss selges.
- Legg inn bankkonto (gjerne ENK-kontoen) og skatteskjemaet (W-8BEN, for deg som ikke er amerikaner).
- Søk om **App Store Small Business Program** (developer.apple.com). Da tar Apple 15 % i stedet for 30 %.

---

## Dag 2: når kontoen er godkjent

### 3. Koble Xcode til den nye kontoen
- Åpne `ios/Kjorerapport.xcodeproj` i Xcode.
- Under **Signing & Capabilities**: velg det nye teamet ditt på **begge** målene, *Kjorerapport* og *KjorerapportWidgets*.
- La «Automatically manage signing» stå på. Xcode registrerer app-ID-ene selv.
- Teamet i prosjektet er i dag det gratis teamet ditt. Får det betalte teamet en annen ID, bytter Xcode den i prosjektet når du velger det. Si fra til Claude, så committes endringen.

### 4. Opprett appen i App Store Connect
- My Apps › **+** › New App:
  - Plattform: iOS
  - Navn: **Kjørerapport: Øvelseskjøring**
  - Primærspråk: Norsk (bokmål)
  - Bundle ID: **net.svendsenmedia.kjorerapport**
  - SKU: kjorerapport
- Er navnet opptatt, prøv «Kjørerapport – øvelseskjøring» eller si fra til Claude.

### 5. Opprett kjøpet (Monetization › In-App Purchases)
Ett kjøp, **Non-Consumable**. Feltene står i README del 12:
- **Pluss**: ID `net.svendsenmedia.kjorerapport.pluss`, **499 kr**, **Familiedeling AV** (bestemt 23. nov.: Pluss er per person). Ikke slå den på: Apple lar deg ikke slå den av igjen.

Ikke lag den gamle prøveperioden (`…pluss.trial14`). Appen har ingen prøveperiode lenger.

Når appen er ute i App Store: be Claude legge App Store-lenken i `APP_STORE_URL` i `elev/elev.js` (1.0.8). Da får elevene fra trafikkskolene en knapp rett til appen i stedet for «søk etter Kjørerapport».

Last opp `kjop-pluss-review.png` som review-bilde, og lim inn review-notatet.

### 6. Last opp appen
- I Xcode: velg **Any iOS Device (arm64)** øverst, så **Product › Archive**.
- Når arkivet er ferdig: **Distribute App › App Store Connect › Upload**.
- Hver ny opplasting må ha et høyere byggnummer. Det heter *Build* under General: 1, 2, 3 og så videre.

### 7. Test med TestFlight (anbefalt)
- Etter 10–30 minutter dukker bygget opp under **TestFlight**. Installer TestFlight-appen på telefonen og legg deg selv til som tester.
- Prøv:
  - en kort tur
  - de 10 gratis teorispørsmålene, og at resten av teorien er låst
  - «Kjøp», og at teorien låses opp
  - «Gjenopprett kjøp»

  Kjøp i TestFlight er gratis. Fra 1.0.16 har TestFlight ikke utviklerdelen (Visning, testknapper, veibilder): Apple tester i det samme miljøet, så TestFlight viser appen slik kundene og Apple ser den. Utviklerdelen finnes bare i bygg fra Xcode (`ios/ship.sh`).

### 8. Fyll ut appsiden (App Store-fanen)
| Felt | Hva |
|---|---|
| Bilder (6,9") | De 8 bildene i `skjermbilder/`, i nummerrekkefølge |
| Kampanjetekst, beskrivelse, nøkkelord | README del 2 og `beskrivelse.txt` |
| Støtte-URL | https://svendsenmedia.net/kjorerapport/hjelp/ |
| Markedsførings-URL | https://svendsenmedia.net/kjorerapport/ (valgfri) |
| Personvern-URL | https://svendsenmedia.net/kjorerapport/personvern/ |
| Kategori | Utdanning (Education), og Navigasjon som nummer to |
| Aldersgrense | «Messaging and Chat»: **Ja**. Alt annet: «Nei/Ingen» (README del 6). Blir resultatet 16+ eller høyere, stopp og si fra |
| App Privacy | Tre typer, alle «App Functionality», ikke koblet til deg, ingen sporing: **Precise Location**, **User ID** og **Device ID** (README del 4) |
| Innholdsrettigheter | Ja, appen bruker tredjepartsdata, og du har rett til det (åpne lisenser: NVDB og Kartverket) |
| Pris | Gratis |
| Tilgjengelighet | Bare Norge |
| Copyright | © 2026 Svendsen Media |
| App Review | Notatet i README del 7, ditt navn, telefon og e-post. Bytt REVIEW_CODE med koden i `.local-test/skolekoder/apple-review.txt`. Ingen innlogging trengs. |
| Kjøp | Legg til kjøpet på versjonen (det må sendes sammen med første versjon) |

### 9. Send til vurdering
- Velg bygget under «Build», og trykk **Add for Review › Submit**.
- Apple svarer ofte innen 1–2 døgn. Får du avslag, lim inn begrunnelsen til Claude, så fikser vi det.
- Velg «Manually release» hvis du vil bestemme dagen selv.

---

## Etterpå
- Svar på anmeldelser i App Store Connect.
- Nye versjoner: øk *Version* (1.0.1, 1.1 …) og *Build*, last opp, og send inn på nytt.
- Gratis koder til en pilotskole: Pluss › Offer Codes (README del 12). Betalte skoleavtaler: egne koder med `node tools/skolekoder.mjs lag "Skolens navn" antall` (README del 12).
