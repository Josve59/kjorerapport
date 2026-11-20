/* Norsk formatering (nb-NO): desimalkomma, m:ss, datoer. */
const nf0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const df = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dfShort = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });

export const n0 = v => nf0.format(v);
export const n1 = v => nf1.format(v);
export const n2 = v => nf2.format(v);
/* Hardt mellomrom mellom tall og enhet, så «11,5» og «km» aldri havner på hver sin linje */
export const km = v => `${nf1.format(v)}\u00a0km`;
export const kmh = v => `${nf0.format(v)}\u00a0km/t`;
export const gee = v => `${nf2.format(v)}\u00a0g`;

export function mss(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function hms(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function duration(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}\u00a0min`;
  const h = Math.floor(m / 60);
  return `${h}\u00a0t ${String(m % 60).padStart(2, '0')}\u00a0min`;
}

/* Tid over fartsgrensen (0.13.4): sekunder når det er lite, ellers minutter. «376 s» er vanskelig å se for seg. */
export function overTime(sec, short = false) {
  const s = Math.max(0, Math.round(sec));
  if (s < 90) return short ? `${s}\u00a0s` : `${s} ${s === 1 ? 'sekund' : 'sekunder'}`;
  const m = Math.round(s / 60);
  return `${m}${short ? '\u00a0min' : ' minutter'}`;
}

export const date = iso => df.format(new Date(iso));
export const dateShort = iso => dfShort.format(new Date(iso));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
