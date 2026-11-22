// Bilde av Pluss-siden til App Review (kjøpene i App Store Connect): Pluss av, som for en ny bruker, med prisen slik
// App Store svarer (simulatoren startet uten Xcode har ingen testkjøp). 499 kr og ingen prøveperiode (0.23.0).
// Visningen må stå på «Som App Store» (viewMode 'app'), ellers slår testbygget på Pluss selv.
if (window.kjNative) window.kjNative.plusStatus = async () => ({ owned: false, available: true, price: '499,00 kr', trialAvailable: false, trialEnd: null });
import(new URL('js/plus.js', location.href).href).then(async p => {
  p.setDevPlus(null);
  await p.refreshPlus().catch(() => {});
  setTimeout(() => { location.hash = '#/innstillinger'; setTimeout(() => { location.hash = '#/pluss'; }, 600); }, 1500);
});
