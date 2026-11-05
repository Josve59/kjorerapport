# Slik sender du Kjørerapport til App Store

Alt i appen og alle tekster og bilder er klare. Det som står igjen, er det bare du kan gjøre: Apple-kontoen, avtalene og knappene. Regn med 1–2 timer arbeid, og så 1–3 dager venting på Apple.

Detaljene (tekstene, svarene og begrunnelsene) står i [README.md](README.md). Her er rekkefølgen.

---

## Allerede ferdig

- [x] Appen: opptak, rapport, Pluss med prøveperiode, «Hva må du øve mer på?», demotur for Apple
- [x] Ikon (lyst og mørkt), tillatelsestekster, personvernmanifest, eksportsvar (ingen kryptering)
- [x] 7 App Store-bilder i [`skjermbilder/`](skjermbilder/) (6,9", riktig størrelse)
- [x] Beskrivelse ([`beskrivelse.txt`](beskrivelse.txt)), navn, undertittel, nøkkelord, kampanjetekst (README del 2)
- [x] Personvern: https://josve59.github.io/kjorerapport/personvern/
- [x] Hjelp og kontakt (støtte-URL): https://josve59.github.io/kjorerapport/hjelp/
- [x] Notat til App Review på engelsk (README del 7)
- [x] Bilde av Pluss-siden til kjøpene: [`kjop-pluss-review.png`](kjop-pluss-review.png)
- [x] Testkjøp i Xcode (`ios/Pluss.storekit`)

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

### 4. Opprett appen i App Store Connect
- My Apps › **+** › New App:
  - Plattform: iOS
  - Navn: **Kjørerapport: Øvelseskjøring**
  - Primærspråk: Norsk (bokmål)
  - Bundle ID: **net.svendsenmedia.kjorerapport**
  - SKU: kjorerapport
- Er navnet opptatt, prøv «Kjørerapport – øvelseskjøring» eller si fra til Claude.

### 5. Opprett de to kjøpene (Monetization › In-App Purchases)
Begge er **Non-Consumable**. Feltene står i README del 12:
- **Pluss**: ID `net.svendsenmedia.kjorerapport.pluss`, 349 kr, Familiedeling på
- **14-day Trial**: ID `net.svendsenmedia.kjorerapport.pluss.trial14`, gratis

Til begge: last opp `kjop-pluss-review.png` som review-bilde, og lim inn review-notatet.

### 6. Last opp appen
- I Xcode: velg **Any iOS Device (arm64)** øverst, så **Product › Archive**.
- Når arkivet er ferdig: **Distribute App › App Store Connect › Upload**.
- Hver ny opplasting må ha et høyere byggnummer. Det heter *Build* under General: 1, 2, 3 og så videre.

### 7. Test med TestFlight (anbefalt)
- Etter 10–30 minutter dukker bygget opp under **TestFlight**. Installer TestFlight-appen på telefonen og legg deg selv til som tester.
- Prøv:
  - en kort tur
  - «Prøv gratis i 14 dager»
  - «Kjøp»
  - «Gjenopprett kjøp»

  Kjøp i TestFlight er gratis.

### 8. Fyll ut appsiden (App Store-fanen)
| Felt | Hva |
|---|---|
| Bilder (6,9") | De 7 bildene i `skjermbilder/`, i nummerrekkefølge |
| Kampanjetekst, beskrivelse, nøkkelord | README del 2 og `beskrivelse.txt` |
| Støtte-URL | https://josve59.github.io/kjorerapport/hjelp/ |
| Markedsførings-URL | https://josve59.github.io/kjorerapport/trafikkskole/ (valgfri) |
| Personvern-URL | https://josve59.github.io/kjorerapport/personvern/ |
| Kategori | Utdanning (Education), og Navigasjon som nummer to |
| Aldersgrense | Svar «Nei/Ingen» på alt (README del 6), da blir det 4+ |
| App Privacy | **Data Not Collected** (README del 4) |
| Innholdsrettigheter | Ja, appen bruker tredjepartsdata, og du har rett til det (åpne lisenser: NVDB og Kartverket) |
| Pris | Gratis |
| Tilgjengelighet | Bare Norge |
| Copyright | © 2026 Svendsen Media |
| App Review | Notatet i README del 7, ditt navn, telefon og e-post. Ingen innlogging trengs. |
| Kjøp | Legg til begge kjøpene på versjonen (de må sendes sammen med første versjon) |

### 9. Send til vurdering
- Velg bygget under «Build», og trykk **Add for Review › Submit**.
- Apple svarer ofte innen 1–2 døgn. Får du avslag, lim inn begrunnelsen til Claude, så fikser vi det.
- Velg «Manually release» hvis du vil bestemme dagen selv.

---

## Etterpå
- Svar på anmeldelser i App Store Connect.
- Nye versjoner: øk *Version* (1.0.1, 1.1 …) og *Build*, last opp, og send inn på nytt.
- Koder til trafikkskoler: Pluss › Offer Codes (README del 12).
