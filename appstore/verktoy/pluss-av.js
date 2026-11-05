// Bilde av Pluss-siden til App Review (kjøpene i App Store Connect): Pluss av, som for en ny bruker, med pris og
// prøveperiode slik App Store svarer (simulatoren startet uten Xcode har ingen testkjøp).
if (window.kjNative) window.kjNative.plusStatus = async () => ({ owned: false, available: true, price: '349,00 kr', trialAvailable: true, trialEnd: null });
import(new URL('js/plus.js', location.href).href).then(p => { p.setDevPlus(null); setTimeout(() => { location.hash = '#/'; setTimeout(() => { location.hash = '#/pluss'; }, 400); }, 1500); });
