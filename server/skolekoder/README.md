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

## Bruk

```
node tools/skolekoder.mjs lag "Trafikkskolen AS" 150        # 150 koder, regneark i Nedlastinger
node tools/skolekoder.mjs liste "Trafikkskolen AS"          # hvor mange som er brukt (grunnlag for faktura)
node tools/skolekoder.mjs steng K7MX-29QF-H4TA              # koden slutter å virke innen en uke
node tools/skolekoder.mjs nullstill K7MX-29QF-H4TA          # eleven har brukt begge telefonene og har fått ny
node tools/skolekoder.mjs lag "Testgruppe" 1 3 25            # én felles testlenke: 3 måneder, høyst 25 telefoner
```

**Testlenke (0.27.4):** `https://kjorerapport.jo-9fc.workers.dev/?kode=KODE` låser opp Pluss av seg selv i nettversjonen. En kode kan gjelde høyst 50 telefoner; elevkoder er 2 som før.

## Teste lokalt

```
node server/skolekoder/dev.mjs
KJ_KODE_URL=http://localhost:8787 node tools/skolekoder.mjs lag "Test" 2
```

Sett så `localStorage['kjorerapport.kodeServer'] = 'http://localhost:8787'` i nettleseren, og bruk en av kodene under Pluss.
