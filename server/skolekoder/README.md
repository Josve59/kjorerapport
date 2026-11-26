# Skolekoder – server og verktøy (0.27.0)

Trafikkskoler kjøper tilgang til Kjørerapport Pluss for elevene sine. Kjøpet skjer utenom App Store, og er tillatt etter App Store Review Guidelines 3.1.3(c): salg direkte til organisasjoner for elevene deres.

- Eieren lager én kode per elev med `tools/skolekoder.mjs`.
- Skolen deler kodene ut.
- Eleven skriver koden i appen: Pluss → «Kode fra trafikkskolen».

Appen viser aldri pris eller hvor koden kjøpes.

## Hvordan det virker

**Kodene**
- Én kode er én elev, for eksempel `K7MX-29QF-H4TA`. Kodene har 12 tegn, uten 0/O og 1/I/L, så de er lette å skrive av.
- En kode virker på høyst 2 telefoner, slik at eleven kan bytte telefon.
- Tilgangen varer 12 måneder fra første gang koden brukes. Det kan settes per skole.

**Bevis og sjekk**
- Serveren svarer med et signert bevis (ECDSA P-256). Appen sjekker beviset selv med den offentlige nøkkelen i `js/skolekode.js`, så tilgangen virker uten nett.
- Appen spør serveren igjen etter en uke. En stengt kode slutter da å virke.

**Ingen personopplysninger**
Serveren lagrer bare dette:
- koden;
- skolens navn;
- når koden ble tatt i bruk;
- en tilfeldig nøkkel per installasjon av appen.

Til App Store-personvernet: «Identifikatorer – enhets-ID», ikke knyttet til brukeren, ikke sporing.

**Gir hele Pluss**
En gyldig kode gir hele Pluss. Det gjelder også teorien i nettversjonen, som elever med Android bruker.

**Skolesiden (1.0.8)**
Trafikkskolen lager elevtilganger selv på sin egen side (uten pakke fra 1.2.0, se «Til lappen» under), `…/skole/#nøkkel` (`skole/index.html`, `skole/skole.js`):
- Ingen konto. Lenken er skolens nøkkel. Den står etter «#», så den sendes aldri til nettstedet, bare til kodeserveren. Serveren lagrer bare SHA-256 av nøkkelen.
- «Gi en elev tilgang» lager en kode og en ferdig SMS med lenke til elevsiden (`elev/index.html`). Elevsiden viser koden og hvordan eleven kommer i gang på iPhone (appen) og Android (nettversjonen, låst opp av `?kode=`).
- Tar eleven aldri koden i bruk, kan skolen trekke den tilbake, og den faktureres ikke. «Fikk lappen», «Ny telefon» og «Steng» som i eierens verktøy.
- Elevens navn kan skrives på koden, kryptert i skolens nettleser (1.2.0). Serveren har bare den krypterte teksten.
- Lærerkodene til skolen står for seg på siden, og skolen kan stenge dem.
- Cloudflares liste over nøkler kan ligge opptil et minutt etter. Koder skolen har rørt de siste fem minuttene, leses derfor direkte (`nylig` i skolens post), så tallene stemmer med en gang og grensen per måned ikke kan overskrides.

**Telling av Pluss-kjøp (1.0.7)**
Pluss kjøpes per person i App Store, uten Familiedeling. For å se om kjøp deles på mange telefoner, melder iPhone-appen seg høyst én gang i uka (`POST /v1/pluss`):
- med et anonymt kjøpsnummer: SHA-256 av Apples kjøps-ID, laget på telefonen (`PlusStore.swift`). Serveren kan ikke finne kjøpet hos Apple eller vite hvem som kjøpte;
- og den tilfeldige nøkkelen for installasjonen.

Serveren lagrer bare nummeret, nøkkelen og når appen sist meldte seg. Ingenting stenges. En telefon regnes som i bruk når den har meldt seg de siste 14 dagene. `node tools/skolekoder.mjs pluss` viser hvor mange kjøp som er i bruk på 1, 2, 3 og 4 eller flere telefoner. 2 kan være et bytte av telefon; 3 eller flere på én gang tyder på deling. Til App Store-personvernet: «Kjøp – kjøpshistorikk», ikke knyttet til brukeren, ikke sporing.

## Filer

- `worker.js` – serveren, en Cloudflare Worker uten avhengigheter.
- `wrangler.toml` – oppsett for Cloudflare.
- `dev.mjs` – den samme serveren lokalt på Macen, med lagring i en fil: `node server/skolekoder/dev.mjs` (port 8787).
- `../../tools/skolekoder.mjs` – eierens verktøy.
- `../../js/skolekode.js` – appens del.
- `../../tests/skolekode.test.mjs` – testene.

**Hemmeligheter**
De ligger i `.local-test/skolekoder/`, som holdes utenfor git:

- `privat.jwk.json` – den private nøkkelen;
- `admin.txt` – nøkkelen til verktøyet.

**Ta vare på dem** (for eksempel i en passordbehandler). Uten den private nøkkelen kan ikke serveren lage bevis appen godtar. En ny nøkkel krever en ny versjon av appen, men elevene får nytt bevis av seg selv neste gang appen spør, så lenge koden gjelder.

## Satt opp 20. november 2026

Serveren svarer på `https://kjorerapport-skolekoder.jo-9fc.workers.dev`. Den ble satt opp med `node tools/skolekoder-oppsett.mjs`, som snakker direkte med Cloudflares API, fordi wrangler/npm ikke finnes på Macen.

- **Første gang:** skriptet lager KV-lagringen, laster opp `worker.js` med lagringen og hemmelighetene, slår på adressen og venter til serveren svarer.
- **Senere:** kjør det på nytt etter en endring i `worker.js`. Kodene beholdes.
- **Tilgangsnøkkelen:** skriptet bruker tilgangsnøkkelen (API-token) fra `.local-test/skolekoder/cf-token.txt`. Den heter «Kjorerapport skolekoder», har bare Workers-rettigheter på kontoen, og går ut 20. november 2027.

## Sette opp serveren med wrangler (alternativ)

Gratisnivået hos Cloudflare Workers holder godt: 100 000 forespørsler og 1 000 skrivinger per dag.

1. **Eieren** lager en konto på cloudflare.com, med egen e-post og eget passord.
2. Wrangler, Cloudflares verktøy, kjøres med `npx wrangler@latest …` fra denne mappen. Det lastes ned fra npm første gang.
3. `npx wrangler login` åpner nettleseren. **Eieren** logger inn og godkjenner.
4. `npx wrangler kv namespace create CODES`. Skriv id-en den svarer med inn i `wrangler.toml`.
5. `npx wrangler secret put ADMIN_SECRET`. Lim inn innholdet i `.local-test/skolekoder/admin.txt`.
6. `npx wrangler secret put SIGN_KEY < ../../.local-test/skolekoder/privat.jwk.json`
7. `npx wrangler deploy`. Den svarer med adressen, for eksempel `https://kjorerapport-skolekoder.<navn>.workers.dev`.
8. Skriv adressen i `SERVER` i `js/skolekode.js` og i `.local-test/skolekoder/url.txt`.
9. Lag en ny versjon av appen (versjon, README, tester, `ios/ship.sh`).

Før `SERVER` er satt, går «Kode fra trafikkskolen» i appen til Apples tilbudskoder som før. De passer til gratis prøveskoler.

## Drift: sletting og varsling (25. november 2026)

**Sletting hver natt.** Personvernerklæringen lover at kodedataene «slettes senest ett år etter at den gikk ut». Serveren gjør det selv nå:
- **Når:** en Cron Trigger kjører `cleanup` kl. 03.17 UTC. `tools/skolekoder-oppsett.mjs` setter den opp, og kjører slettingen én gang med en gang.
- **Når en kode går ut:**
  - en brukt kode går ut når tilgangen er slutt;
  - en stengt kode går ut da den ble stengt (`stengtT`, lagres fra nå av);
  - en ubrukt, åpen kode går aldri ut. Den har ingen opplysninger om noen.
- **Skolens telling:** sletter serveren en brukt kode fra en skole, øker `arkivBrukt` i skolens oppføring. Skolen får altså ikke tilgangen tilbake, og tallene på skolesiden står.
- **Kjøpstellingen fra 1.0.7:** den er tatt ut av appen og personvernerklæringen i 1.0.16. `/v1/pluss` svarer nå 410 og lagrer ingenting. Det som var lagret, ble slettet 25. november, og det var én oppføring.
- **Grense per natt:** høyst 400 slettinger, resten tas natten etter.
- **For hånd:** `POST /admin/rydd { "prov": true }` viser hva som ville blitt slettet, uten å slette.

**Varsling.**
- **Helsesjekken:** `GET /v1/helse` svarer 200 når tre ting er i orden: lagringen svarer, nøkkelen kan signere, og slettingen har gått de siste 36 timene. Ellers svarer den 503. Den leser bare og skriver aldri.
- **Daglig sjekk:** `.github/workflows/drift.yml` kjører på GitHub hver morgen kl. 06.23 norsk tid. Den spør helsesjekken og åpner fem sider: forsiden, nettversjonen, skolesiden, elevsiden og personvern.
- **E-post:** feiler en sjekk, sender GitHub e-post til den som sist endret tidsplanen. Det er eieren, siden det pushes fra GitHub Desktop.
- **NB:** GitHub slår av tidsplanen etter 60 dager uten endringer i repoet. Da må den slås på igjen under Actions.

Gratisplanen hos Cloudflare tåler rundt 1 000 lagringer i døgnet. Ta Workers Paid (rundt 5 dollar i måneden) før skolene deler ut hundrevis av tilganger samme dag.

## Bruk

```
node tools/skolekoder.mjs lag "Trafikkskolen AS" 150        # 150 koder, regneark i Nedlastinger
node tools/skolekoder.mjs liste "Trafikkskolen AS"          # hvor mange som er brukt (grunnlag for faktura)
node tools/skolekoder.mjs steng K7MX-29QF-H4TA              # koden slutter å virke innen en uke
node tools/skolekoder.mjs nullstill K7MX-29QF-H4TA          # eleven har brukt begge telefonene og har fått ny
node tools/skolekoder.mjs lag "Testgruppe" 1 3 25            # én felles testlenke: 3 måneder, høyst 25 telefoner
node tools/skolekoder.mjs apne K7MX-29QF-H4TA               # angrer «steng»: koden virker igjen
node tools/skolekoder.mjs pluss                             # hvor mange telefoner hvert Pluss-kjøp brukes på
node tools/skolekoder.mjs skole "Trafikkskolen AS" pris=450   # skolens side; skriver ut lenken til skolen
node tools/skolekoder.mjs laerer "Trafikkskolen AS" "Kari Nilsen"   # lærerkode til én lærer, med ferdig melding
node tools/skolekoder.mjs skoler                            # alle skolene: i bruk, sendt, fikk lappen, denne og forrige måned
node tools/skolekoder.mjs faktura                           # fakturagrunnlaget for forrige måned (eller: faktura 2026-12)
node tools/skolekoder.mjs skole-endre "Trafikkskolen AS" pris=400 grense=300   # egen pris eller grense per måned
node tools/skolekoder.mjs ny-lenke "Trafikkskolen AS"       # lenken har kommet på avveie: ny lenke, den gamle slutter å virke
```

**Til lappen (1.2.0, eieren 26. november 2026):** ingen pakker lenger. Skolen lager elevkoder selv på sin side, høyst
200 nye i måneden (`grense`). En elevkode gjelder til læreren trykker «Fikk lappen» (på skolesiden, eller «har fått
lappen» i trafikklærerversjonen), men høyst 36 måneder fra første bruk. Beviset i appen gjelder 60 dager om gangen og
fornyes hver uke, så en avsluttet kode slutter å virke også på en telefon som ikke er på nett. Appen sier «Gratulerer
med lappen!» når koden er avsluttet.

**Ny skole, steg for steg:** avtale med skolen → `skole "Navn" pris=450` → send lenken til den som har ansvaret →
`laerer "Navn" "Lærer"` for hver trafikklærer, og send meldingen verktøyet skriver ut.

**Faktura hver måned:** `faktura` i begynnelsen av måneden viser hver skole med antall elever som tok koden i bruk
måneden før, pris og sum inkl. mva, og lagrer kodene i et regneark i Nedlastinger. Hver elevkode faktureres én gang.
Lærerkoder, testkoder og koder fra pakkene før 1.2.0 (betalt på forhånd) er ikke med.

**Lærerkoder:** én per lærer, to telefoner, gjelder til de stenges (skolen kan stenge dem på sin side når en lærer
slutter). Med lærerkoden kan læreren avslutte elever fra samme skole. Elevens kode følger med meldingene fra eleven.

**Navn på kodene:** skolen kan skrive elevens navn på koden. Det krypteres i skolens nettleser med en nøkkel fra lenken
(`skole/merke.js`), og serveren lagrer bare den krypterte teksten. Etter `ny-lenke` kan navnene ikke leses, og skolen
må skrive dem på nytt.

**Testlenke (0.27.4):** `https://kjorerapport.jo-9fc.workers.dev/?kode=KODE` låser opp Pluss av seg selv i nettversjonen. En kode kan gjelde høyst 50 telefoner; elevkoder er 2 som før.

## Teste lokalt

```
node server/skolekoder/dev.mjs
KJ_KODE_URL=http://localhost:8787 node tools/skolekoder.mjs lag "Test" 2
```

Sett så `localStorage['kjorerapport.kodeServer'] = 'http://localhost:8787'` i nettleseren, og bruk en av kodene under Pluss.
