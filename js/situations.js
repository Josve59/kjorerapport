/* Samkjøring (v0.8.0): GPS, bevegelsessensorer, førerkamera, ledsagerens merker og veidata vurderes
   sammen til situasjoner. Hver kilde ser bare en del av bildet. Sammen kan de si hva som skjedde:
   en brå nedbremsing er mer alvorlig hvis blikket var borte fra veien rett før, og et feltskifte er
   bare bra hvis speilet ble sjekket først.
   Rene funksjoner uten nettleseravhengighet, så de kan testes i Node. Alle tider er relative til rapporten. */

export const SOURCE_LABEL = { gps: 'GPS', motion: 'Bevegelse', camera: 'Førerkamera', roadcam: 'Veikamera', marks: 'Ledsager', road: 'Veidata' };
export const LEVEL_ORDER = { high: 0, medium: 1, low: 2, ok: 3 };
const EVENT_TITLE = {
  brake: { brisk: 'Brå nedbremsing', harsh: 'Kraftig nedbremsing' },
  accel: { brisk: 'Brå akselerasjon', harsh: 'Kraftig akselerasjon' },
  turn: { brisk: 'Brå sving', harsh: 'Svært skarp sving' }
};
const AWAY_TITLE = { left: 'Langt blikk i venstre speil', right: 'Langt blikk i høyre speil', rear: 'Langt blikk i bakspeilet', shoulderL: 'Langt skulderblikk', shoulderR: 'Langt skulderblikk', other: 'Blikket borte fra veien' };

const n1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
const kmh = v => `${Math.round(v)} km/t`;

/* Avstand til bilen foran rett før t, fra veikameraet (siste bilde innen 4 s). Samme som leadAt i kamera/js/road.js. */
function leadBefore(road, t) {
  let best = null;
  for (const x of road.follow || []) { if (x.t > t) break; if (t - x.t <= 4) best = x; }
  return best;
}

function pointAt(points, t) {
  if (!points.length) return null;
  let lo = 0, hi = points.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid].t < t) lo = mid + 1; else hi = mid; }
  return points[lo];
}

/* r: analyse, camera: evaluateMirrors (kan mangle), marks: ledsagerens merker (relative tider),
   sp: fartsgrenser (episodes med tFrom/tTo/maxKmh/limit), road: veikameraet (roadSummary), kan mangle.
   nvdb: veidata vurdert mot turen (evaluateRoad): gangfelt, fartsdempere, lyskryss og skilt, kan mangle. */
export function buildSituations(r, { camera = null, marks = [], sp = null, road = null, nvdb = null } = {}) {
  const pts = r.points || [];
  const out = [];
  const away = camera && camera.calibrated ? camera.away || [] : [];
  const overAt = t => sp ? sp.episodes.find(e => t >= e.tFrom - 1 && t <= e.tTo + 1) : null;
  const awayBefore = (t, sec) => away.find(a => a.tEnd >= t - sec && a.t <= t);
  const add = s => { const p = pointAt(pts, s.t); out.push({ lat: p ? p.lat : NaN, lon: p ? p.lon : NaN, ...s }); };
  // Hvor var vi? (veidata) – brukes som sammenheng for hendelser og blikk
  const nv = nvdb || {};
  const placeAt = t => {
    // Lyskryss bare der farten gikk under 65 km/t; ellers er det trolig et signal på en annen veg (NVDB)
    if ((nv.signals || []).some(g => g.minKmh < 65 && t >= g.tFrom - 2 && t <= g.tTo + 2)) return 'ved lyskryss';
    if ((nv.crossings || []).some(c => Math.abs(c.t - t) <= 4)) return 'ved gangfelt';
    const bump = (nv.bumps || []).find(b => b.t - t >= 0 && b.t - t <= 4);
    if (bump) return 'rett før fartsdemper';
    const sign = (nv.signs || []).find(g => t >= g.t && t <= g.tTo);
    if (sign) return sign.kind === 'barn' ? 'etter skiltet Barn' : 'etter skiltet Farlig sving';
    return null;
  };

  // 1) Blikket borte fra veien (kamera + GPS)
  for (const a of away) {
    const over = overAt(a.t);
    const sources = ['camera', 'gps', ...(over ? ['road'] : [])];
    const mirror = ['left', 'right', 'rear'].includes(a.cls);
    const where = placeAt(a.t) || placeAt(a.tEnd);
    if (where) sources.push('road');
    add({
      t: a.t, kind: 'away', sources,
      level: a.dur >= 3 || a.metres >= 60 || (where && where !== 'rett før fartsdemper') ? 'high' : 'medium',
      title: (AWAY_TITLE[a.cls] || AWAY_TITLE.other) + (where ? ' ' + where : ''),
      text: `${n1(a.dur)} s i ${kmh(a.kmh)}: bilen kjørte ${Math.round(a.metres)} m uten at blikket var på veien foran.${over ? ` Samtidig ${Math.round(over.maxKmh - over.limit)} km/t over fartsgrensen.` : ''}${mirror ? ' Kikk raskt i speilet, flere ganger om nødvendig.' : ''}`
    });
  }

  // 2) Brå hendelser fra bevegelsessensorene, med det som skjedde rundt
  for (const e of r.events || []) {
    const before = awayBefore(e.t, 5);
    const over = overAt(e.t);
    const rb = (r.maneuvers?.roundabouts || []).find(x => e.t >= x.tFrom - 3 && e.t <= x.tTo + 3);
    const lead = road && e.kind === 'brake' ? leadBefore(road, e.t) : null;
    const sources = ['motion', 'gps', ...(before ? ['camera'] : []), ...(lead ? ['roadcam'] : []), ...(over ? ['road'] : [])];
    const where = rb ? null : placeAt(e.t);
    if (where && !sources.includes('road')) sources.push('road');
    const parts = [`${(e.g).toFixed(2).replace('.', ',')} g i ${kmh(e.speedKmh)}${rb ? ', i rundkjøring' : where ? ', ' + where : ''}.`];
    if (where === 'rett før fartsdemper' && e.kind === 'brake') parts.push('Brems tidligere og mykere før fartsdempere.');
    if (before) parts.push(`Blikket var borte fra veien i ${n1(before.dur)} s rett før.`);
    if (lead) parts.push(`Bilen foran var ca. ${Math.round(lead.dist)} m unna (${n1(lead.headway)} s) rett før.`);
    if (over) parts.push(`${Math.round(over.maxKmh - over.limit)} km/t over fartsgrensen.`);
    const tight = lead && lead.headway < 1.5;
    const level = (e.kind === 'brake' && (before || tight)) || (e.level === 'harsh' && over) ? 'high' : e.level === 'harsh' || before || over ? 'medium' : 'low';
    add({ t: e.t, kind: 'event', event: e.kind, n: e.n, sources, level, title: EVENT_TITLE[e.kind][e.level], text: parts.join(' ') });
  }

  // 3) Feltskifter: speil og skulderblikk (kamera), merket av ledsager eller funnet av sensorene
  if (camera && camera.calibrated) {
    // true = sett, false = ikke gjort (kameraet så føreren), null = ukjent (kameraet så veien da)
    const word = (v, yes, no) => v === true ? yes : v === false ? no : `${yes.toLowerCase()} ukjent`;
    const lvl = (m, s) => m === false ? 'medium' : s === false || m === null || s === null ? 'low' : 'ok';
    for (const l of camera.lane || []) {
      const ok = l.mirror && l.shoulder;
      const unknown = l.mirror === null || l.shoulder === null;
      add({
        t: l.t, kind: 'lane', sources: [l.marked ? 'marks' : 'motion', 'camera'],
        level: lvl(l.mirror, l.shoulder),
        title: `Feltskifte${l.dir ? ' til ' + l.dir : ''}`,
        text: ok ? 'Speil og skulderblikk før feltskiftet.'
          : l.mirror === false && l.shoulder === false ? 'Verken speil eller skulderblikk før feltskiftet.'
          : `${word(l.mirror, 'Speil', 'Ikke speil')}, ${word(l.shoulder, 'skulderblikk', 'ikke skulderblikk').toLowerCase()} før feltskiftet.${unknown ? ' Førerkameraet så veien akkurat da.' : ''}`
      });
    }
    if (camera.start) {
      const s = camera.start;
      add({ t: s.t, kind: 'start', sources: ['camera', 'gps'], level: lvl(s.mirror, s.shoulder), title: 'Igangkjøring',
        text: s.mirror && s.shoulder ? 'Speil og skulderblikk før dere kjørte ut.' : `${word(s.mirror, 'Speil', 'Ikke speil')} og ${word(s.shoulder, 'skulderblikk', 'ikke skulderblikk').toLowerCase()} før dere kjørte ut.` });
    }
  }

  // 4) Kort avstand til bilen foran (veikamera + GPS). Mellom bildene fra veikameraet er det bygget bro,
  //    så lenge farten vår var nesten den samme.
  for (const c of road ? road.close : []) {
    const over = overAt(c.t);
    add({ t: c.t, kind: 'close', sources: ['roadcam', 'gps', ...(over ? ['road'] : [])], level: c.minHeadway < 0.7 || over ? 'high' : 'medium',
      title: 'Kort avstand til bilen foran',
      text: `Ned mot ${n1(c.minHeadway)} s (ca. ${c.minDist} m) i ${kmh(c.kmh)} i ${Math.max(2, Math.round(c.dur))} s. Hold minst 2 sekunder, og 3 i mørke eller på glatt vei.${over ? ` Samtidig ${Math.round(over.maxKmh - over.limit)} km/t over fartsgrensen.` : ''}` });
  }

  // 5) Veidata (NVDB): gangfelt, fartsdempere og skilt, vurdert mot farten (GPS) og veikameraet
  const peopleNear = t => road && (road.people || []).some(p => Math.abs(p - t) <= 3);
  for (const c of nv.crossings || []) {
    const ppl = peopleNear(c.t);
    if (ppl && c.kmh > 30) add({ t: c.t, kind: 'crossing', sources: ['road', 'gps', 'roadcam'], level: 'high', title: 'Gangfelt med folk i nærheten',
      text: `${kmh(c.kmh)} forbi gangfeltet, og veikameraet så folk i nærheten. Senk farten og vær klar til å stoppe.` });
    else if (c.kmh >= 45) add({ t: c.t, kind: 'crossing', sources: ['road', 'gps'], level: 'low', title: `Gangfelt i ${kmh(c.kmh)}`,
      text: 'Ha en fart der du rekker å stoppe hvis noen skal krysse.' });
  }
  for (const b of nv.bumps || []) {
    if (b.kmh <= 35) continue;
    add({ t: b.t, kind: 'bump', sources: ['road', 'gps'], level: b.kmh > 45 ? 'medium' : 'low', title: `Fartsdemper i ${kmh(b.kmh)}`,
      text: `${b.type ? b.type + ', ' : ''}${b.approachKmh > b.kmh ? `ned fra ${kmh(b.approachKmh)}` : 'uten å senke farten'}. De fleste fartsdempere er laget for rundt 30 km/t.` });
  }
  for (const g of nv.signs || []) {
    if (g.kind === 'barn' && g.maxKmh > 40) add({ t: g.t, kind: 'sign', sources: ['road', 'gps'], level: g.maxKmh > 50 ? 'medium' : 'low', title: 'Skiltet Barn',
      text: `Opptil ${kmh(g.maxKmh)} de neste 150 m etter skiltet. Barn kan komme ut i vegen – ta det rolig.` });
    if (g.kind !== 'barn' && g.events.length) add({ t: g.t, kind: 'sign', sources: ['road', 'gps', 'motion'], level: 'medium', title: 'Farlig sving',
      text: `Brå hendelse etter skiltet Farlig sving (${kmh(g.kmh)} ved skiltet). Senk farten før svingen.` });
  }

  // 6) Fart over grensen (veidata + GPS), når den ikke allerede er med i en situasjon over
  if (sp) for (const ep of sp.episodes) {
    const over = Math.round(ep.maxKmh - ep.limit);
    if (over < 10 || out.some(s => s.t >= ep.tFrom - 1 && s.t <= ep.tTo + 1 && s.sources.includes('road'))) continue;
    add({ t: ep.tFrom, kind: 'speed', sources: ['road', 'gps'], level: over >= 20 ? 'high' : 'medium', title: `${over} km/t over fartsgrensen`,
      text: `${kmh(ep.maxKmh)} i ${ep.limit}-sone i ${Math.round(ep.tTo - ep.tFrom) || 1} s.` });
  }

  // Ledsagerens merknader i nærheten (ikke fasitmerker) knyttes til situasjonen
  for (const s of out) {
    const mk = (marks || []).filter(m => m.cat !== 'annet' && m.cat !== 'felt' && Math.abs(m.t - s.t) <= 10);
    if (mk.length) { s.marks = mk.map(m => m.cat); if (!s.sources.includes('marks')) s.sources.push('marks'); }
  }
  return out.sort((a, b) => a.t - b.t);
}

/* Kort oppsummering for toppen av rapporten. */
export function situationSummary(list) {
  const c = { high: 0, medium: 0, low: 0, ok: 0 };
  for (const s of list) c[s.level]++;
  return c;
}
