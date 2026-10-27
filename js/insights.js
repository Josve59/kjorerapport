/* Innsikt på tvers av turer: forslag til øvingsmål, faresteder, samme rute og opplæringsplan.
   Rene funksjoner uten nettleseravhengighet, så de kan testes i Node. */

const RAD = Math.PI / 180;
export function metres(a, b) {
  const cos = Math.cos((a.lat + b.lat) / 2 * RAD);
  return Math.hypot((b.lon - a.lon) * RAD * cos * 6371000, (b.lat - a.lat) * RAD * 6371000);
}

/* ---------- Forslag til dagens øvingsmål ----------
   rows: nyeste først, [{ res, marks, sp, road, log }] for samme fører. Returnerer opptil tre forslag. */
export function suggestFocus(rows, now = new Date()) {
  const recent = rows.slice(0, 5);
  if (!recent.length) return [];
  const n = recent.length;
  const avg = f => recent.reduce((s, x) => s + f(x), 0) / n;
  const out = [];
  const turer = n === 1 ? 'siste tur' : `de ${n} siste turene`;
  const weakest = k => recent.filter(x => Math.min(x.res.scores.brake, x.res.scores.accel, x.res.scores.turn, x.res.scores.smooth) === x.res.scores[k]).length;
  for (const [id, k, label, limit] of [['brake', 'brake', 'Bremsing', 90], ['accel', 'accel', 'Akselerasjon', 90], ['turn', 'turn', 'Svinger', 90], ['smooth', 'smooth', 'Jevn fart', 85]]) {
    const a = avg(x => x.res.scores[k]);
    if (a < limit) {
      const w = weakest(k);
      out.push({ id, weight: limit - a + (w > n / 2 ? 5 : 0), reason: `${label}: snitt ${Math.round(a)} poeng på ${turer}${w > 1 ? `, svakest ${w} ganger` : ''}` });
    }
  }
  const withSp = recent.filter(x => x.sp);
  if (withSp.length) {
    const km = withSp.reduce((s, x) => s + x.res.stats.km, 0);
    const sec = withSp.reduce((s, x) => s + x.sp.secondsOver, 0);
    const per10 = km > 0.5 ? sec / km * 10 : 0;
    if (per10 > 10) out.push({ id: 'limits', weight: Math.min(40, per10 / 2), reason: `${Math.round(sec)} sekunder over fartsgrensen på ${turer}` });
  }
  const mirror = recent.reduce((s, x) => s + (x.marks || []).filter(m => m.cat === 'speil' || m.cat === 'skulder').length, 0);
  if (mirror >= 2) out.push({ id: 'mirror', weight: 8 * mirror / n + 4, reason: `Ledsageren merket speil eller skulder ${mirror} ganger` });
  const rbEv = recent.reduce((s, x) => s + ((x.road && x.road.roundabouts) || x.res.maneuvers?.roundabouts || []).filter(r => (r.events || []).length).length, 0);
  if (rbEv) out.push({ id: 'roundabout', weight: 12 * rbEv, reason: `Brå hendelser i ${rbEv} ${rbEv === 1 ? 'rundkjøring' : 'rundkjøringer'}` });
  const lane = recent.reduce((s, x) => s + (x.res.maneuvers?.laneChanges || []).filter(l => (x.marks || []).some(m => m.cat !== 'annet' && m.cat !== 'felt' && m.t >= l.tFrom - 10 && m.t <= l.tTo + 10)).length, 0);
  if (lane) out.push({ id: 'lane', weight: 10 * lane, reason: `Ledsageren merket noe ved ${lane} ${lane === 1 ? 'feltskifte' : 'feltskifter'}` });
  const fastGw = recent.reduce((s, x) => s + ((x.road && x.road.giveway) || []).filter(g => g.approachKmh > 40).length, 0);
  if (fastGw >= 2) out.push({ id: 'junction', weight: 6 * fastGw / n, reason: `Høy fart inn mot ${fastGw} vikepliktkryss` });
  const darkMin = rows.reduce((s, x) => s + (x.log ? x.log.light.dark / 60 : 0), 0);
  const m = now.getMonth();
  if ((m >= 9 || m <= 1) && darkMin < 30) out.push({ id: 'dark', weight: 9, reason: darkMin ? `Bare ${Math.round(darkMin)} min mørkekjøring så langt` : 'Ingen mørkekjøring registrert ennå, og det er mørketid' });
  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}

/* ---------- Faresteder ----------
   drives: [{ id, points:[{lat,lon}], items:[{lat,lon,type:'event'|'mark',kind,label,t}] }].
   Samler hendelser og merker innen 60 m, og teller hvor mange turer som passerte stedet. */
export function hotspots(drives, { radius = 60, passRadius = 40 } = {}) {
  const clusters = [];
  for (const d of drives) {
    for (const it of d.items) {
      if (!Number.isFinite(it.lat)) continue;
      let best = null, bd = Infinity;
      for (const c of clusters) { const dd = metres(c, it); if (dd < bd) { bd = dd; best = c; } }
      if (best && bd <= radius) {
        best.items.push({ ...it, driveId: d.id });
        const k = best.items.length;
        best.lat += (it.lat - best.lat) / k; best.lon += (it.lon - best.lon) / k;
        best.drives.add(d.id);
      } else clusters.push({ lat: it.lat, lon: it.lon, items: [{ ...it, driveId: d.id }], drives: new Set([d.id]) });
    }
  }
  const out = [];
  for (const c of clusters) {
    if (c.items.length < 2) continue;
    let passes = 0;
    for (const d of drives) {
      const step = Math.max(1, Math.floor(d.points.length / 400));
      for (let i = 0; i < d.points.length; i += step) if (metres(d.points[i], c) <= passRadius) { passes++; break; }
    }
    const kinds = {};
    for (const it of c.items) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
    const main = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0][0];
    out.push({ lat: c.lat, lon: c.lon, count: c.items.length, drives: c.drives.size, passes: Math.max(passes, c.drives.size), main, items: c.items });
  }
  return out.sort((a, b) => (b.drives - a.drives) || (b.count - a.count));
}

/* ---------- Samme rute ----------
   Andelen av rute a som ligger innen 80 m av rute b. Begge veier må være over 70 %. */
export function overlap(a, b, { samples = 40, within = 80 } = {}) {
  if (a.length < 2 || b.length < 2) return 0;
  const step = Math.max(1, Math.floor(b.length / 600));
  const bb = b.filter((_, i) => i % step === 0);
  let hit = 0;
  for (let s = 0; s < samples; s++) {
    const p = a[Math.floor(s / (samples - 1) * (a.length - 1))];
    if (bb.some(q => Math.abs(q.lat - p.lat) < 0.002 && metres(p, q) <= within)) hit++;
  }
  return hit / samples;
}
export function sameRoute(a, b) {
  return overlap(a, b) >= 0.7 && overlap(b, a) >= 0.7;
}

/* ---------- Opplæringsplan (klasse B) ----------
   Hovedtrekk fra læreplanen. auto: hva appen kan vise fra turene; resten krysses av manuelt. */
export const CURRICULUM = [
  { stage: 'Obligatorisk', items: [
    { id: 'tgk', label: 'Trafikalt grunnkurs', help: 'Inkludert førstehjelp og mørkekjøringsdemonstrasjon.' },
    { id: 'teori', label: 'Teoriprøven bestått' }
  ] },
  { stage: 'Trinn 2 – Kjøretøyet og grunnleggende kjøring', items: [
    { id: 'start', label: 'Igangkjøring, giring og stopp', auto: 'accel' },
    { id: 'brems', label: 'Jevn og kontrollert bremsing', auto: 'brake' },
    { id: 'styring', label: 'Styring og plassering ved lav fart' },
    { id: 'rygg', label: 'Rygging og parkering' },
    { id: 'trinn2', label: 'Veiledningstime på trinn 2' }
  ] },
  { stage: 'Trinn 3 – Trafikal del', items: [
    { id: 'by', label: 'Kjøring i by og tettsted', auto: 'by' },
    { id: 'land', label: 'Kjøring på landevei', auto: 'land' },
    { id: 'motor', label: 'Motorvei og motortrafikkvei', auto: 'motor' },
    { id: 'rund', label: 'Rundkjøringer', auto: 'roundabout' },
    { id: 'felt', label: 'Feltskifte og fletting', auto: 'lane' },
    { id: 'kryss', label: 'Kryss og vikeplikt', auto: 'junction' },
    { id: 'fart', label: 'Fartstilpasning og fartsgrenser', auto: 'limits' },
    { id: 'mork', label: 'Kjøring i mørke', auto: 'dark' },
    { id: 'trinn3', label: 'Veiledningstime på trinn 3' }
  ] },
  { stage: 'Trinn 4 – Avsluttende opplæring', items: [
    { id: 'bane', label: 'Sikkerhetskurs på bane' },
    { id: 'veg', label: 'Sikkerhetskurs på veg' },
    { id: 'selv', label: 'Selvstendig kjøring og planlegging av tur' },
    { id: 'prove', label: 'Førerprøven bestått' }
  ] }
];

/* Bevis fra turene for hvert auto-punkt. rows: alle ekte turer [{ res, log, sp, road }]. */
export function curriculumEvidence(rows) {
  const ev = {};
  const min = s => Math.round(s / 60);
  const sum = f => rows.reduce((s, x) => s + f(x), 0);
  const recent = rows.slice(0, 3);
  const avgScore = k => recent.length ? Math.round(recent.reduce((s, x) => s + x.res.scores[k], 0) / recent.length) : null;
  ev.accel = recent.length ? { text: `Akselerasjon snitt ${avgScore('accel')} poeng siste ${recent.length === 1 ? 'tur' : recent.length + ' turer'}`, good: avgScore('accel') >= 90 } : null;
  ev.brake = recent.length ? { text: `Bremsing snitt ${avgScore('brake')} poeng siste ${recent.length === 1 ? 'tur' : recent.length + ' turer'}`, good: avgScore('brake') >= 90 } : null;
  for (const k of ['by', 'land', 'motor']) {
    const m = min(sum(x => (x.log ? x.log.sec[k] : 0)));
    ev[k] = m ? { text: `${m} min øvd`, good: m >= 60 } : null;
  }
  const dark = min(sum(x => (x.log ? x.log.light.dark : 0)));
  ev.dark = dark ? { text: `${dark} min i mørke`, good: dark >= 60 } : null;
  const rb = sum(x => ((x.road && x.road.roundabouts) || x.res.maneuvers?.roundabouts || []).length);
  ev.roundabout = rb ? { text: `${rb} ${rb === 1 ? 'rundkjøring' : 'rundkjøringer'}`, good: rb >= 10 } : null;
  const lc = sum(x => (x.res.maneuvers?.laneChanges || []).length);
  ev.lane = lc ? { text: `${lc} feltskifter`, good: lc >= 10 } : null;
  const gw = sum(x => ((x.road && x.road.giveway) || []).length + ((x.road && x.road.stops) || []).length);
  ev.junction = gw ? { text: `${gw} kryss med vikeplikt eller stopp`, good: gw >= 20 } : null;
  const withSp = rows.filter(x => x.sp);
  if (withSp.length) {
    const km = withSp.reduce((s, x) => s + x.res.stats.km, 0);
    const sec = withSp.reduce((s, x) => s + x.sp.secondsOver, 0);
    ev.limits = { text: `${Math.round(sec)} s over grensen på ${Math.round(km)} km`, good: km > 20 && sec / km * 10 < 5 };
  } else ev.limits = null;
  return ev;
}
