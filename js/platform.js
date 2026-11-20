/* Hvilken telefon og nettleser appen kjører i (0.27.6), så veiledningen stemmer: iPhone-appen, Safari på iPhone,
   eller Android (Chrome, Samsung Internet, Firefox). Bare til tekster og valg av veiledning, ikke til å skru av ting. */
const ua = () => (typeof navigator !== 'undefined' && navigator.userAgent) || '';

export const isNativeApp = () => typeof window !== 'undefined' && !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kj);
export const isAndroid = () => /Android/i.test(ua());
export const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
export const isStandalone = () => typeof window !== 'undefined' && ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true);

export function browserName() {
  const u = ua();
  if (/SamsungBrowser/i.test(u)) return 'Samsung Internet';
  if (/Firefox|FxiOS/i.test(u)) return 'Firefox';
  if (/EdgA|Edg\//.test(u)) return 'Edge';
  if (/CriOS|Chrome/i.test(u)) return 'Chrome';
  if (/Safari/i.test(u)) return 'Safari';
  return 'nettleseren';
}

/* Hvor man slår på en tilgang som er avslått: kamera, posisjon eller bevegelse. Ord, ikke lenker: innstillingene kan
   ikke åpnes fra en nettside. */
export function permissionHelp(kind) {
  const what = { camera: 'Kamera', location: 'Posisjon', motion: 'Bevegelsessensorer' }[kind] || kind;
  if (isNativeApp()) return `Slå det på i iPhone-innstillingene: Innstillinger › Kjørerapport › ${kind === 'motion' ? 'Bevegelse og trening' : what}.`;
  if (isIOS()) {
    if (kind === 'motion') return 'Lukk fanen, åpne siden på nytt og trykk «Tillat» når Safari spør om bevegelse og retning.';
    if (kind === 'location') return 'Slå på Innstillinger › Personvern og sikkerhet › Stedstjenester › Safari-nettsteder › «Når appen er i bruk», og tillat posisjon når Safari spør.';
    return `Trykk menyknappen ved adressefeltet i Safari (aA eller ☰), velg Nettstedsinnstillinger og tillat ${what.toLowerCase()}.`;
  }
  if (isAndroid()) {
    const b = browserName();
    if (b === 'Samsung Internet') return `Trykk på låsen i adressefeltet, velg Tillatelser og slå på ${what.toLowerCase()}.`;
    if (b === 'Firefox') return `Trykk på låsen i adressefeltet og slå på ${what.toLowerCase()}.`;
    return `Trykk på låsen eller ikonet til venstre i adressefeltet i ${b}, velg Tillatelser og slå på ${what.toLowerCase()}.`;
  }
  return `Tillat ${what.toLowerCase()} for denne siden i nettleserens innstillinger.`;
}

/* Hvordan appen legges på Hjem-skjermen (nettversjonen). null når den alt er installert eller er iPhone-appen. */
export function installHelp() {
  if (isNativeApp() || isStandalone()) return null;
  if (isIOS()) return { title: 'Legg til på Hjem-skjerm', how: 'trykk Del-knappen nederst i Safari og velg «Legg til på Hjem-skjerm»', ios: true };
  if (isAndroid()) {
    const b = browserName();
    const how = b === 'Samsung Internet' ? 'trykk menyen ☰ nederst og velg «Legg til side på» › «Startskjerm»'
      : b === 'Firefox' ? 'trykk menyen ⋮ og velg «Installer» eller «Legg til på startskjermen»'
      : 'trykk menyen ⋮ øverst til høyre og velg «Installer app» eller «Legg til på startskjermen»';
    return { title: 'Legg til på startskjermen', how, ios: false };
  }
  return { title: 'Installer appen', how: 'bruk nettleserens meny og velg «Installer» eller «Legg til på startskjermen»', ios: false };
}

/* Når skjermen ikke kan holdes på (uten Wake Lock): hva brukeren selv må stille */
export function screenLockHelp() {
  if (isIOS() || isNativeApp()) return 'Sett Autolås til Aldri mens du kjører (Innstillinger › Skjerm og lysstyrke).';
  if (isAndroid()) return 'Slå av strømsparing, og sett tidsavbrudd for skjermen til lengst mulig mens du kjører (Innstillinger › Skjerm).';
  return 'Hold skjermen på mens du kjører.';
}
