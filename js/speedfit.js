/* Fart etter forholdene (0.13.13). Totalpoengene bygde bare på bremsing, gass, svinger og jevn fart, så en tur kunne få
   98 poeng selv om føreren kjørte for fort. En trafikklærer vurderte turen 12. nov. kl. 11.51 til 90–92: litt for høy
   fart på noen landeveier og over uoversiktlige bakketopper.
   Her måles to ting:
   1. Bakketopper. Når bilen går over en topp, vipper nesa ned. Telefonens rotasjonssensor måler hvor fort (om bilens
      tverrakse), og sammen med farten gir det toppens radius. Radiusen gir sikten: hvor langt fram føreren (øyehøyde
      1,1 m) ser noe som er 0,6 m høyt. Farten er for høy når bilen ikke rekker å stoppe på den sikten (1 s reaksjon,
      bremsing 0,7 g på tørr vei, mindre på glatt føre). På vei uten oppmalte linjer (veikameraet) skal den stoppe på
      halve sikten til en møtende bil (1,2 m høy), fordi begge må stoppe.
   2. Tid over fartsgrensen (fra rapportens fartsgrenser), vektet etter hvor mye over og hvor lenge.
   De to gir en fartsdel (0–100) som teller 40 % av totalpoengene. Vektene er satt så turen over havner på rundt 90
   (8 bakketopper og 7 perioder over fartsgrensen på 47 km), altså etter én tur og én trafikklærer: de bør justeres
   når flere turer er vurdert. Farten regnes som for høy først når den er 5 km/t over det sikten tillater.
   Rene funksjoner, testes i Node. */

const G = 9.81, RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Hvor hardt bilen kan bremse i forhold til tørr vei (samme demping som surface.js, men aldri under 0,6: føret som
   velges før turen gjelder sjelden hele veien) */
const GRIP = { dry: 1, wet: 0.85, snow: 0.6, ice: 0.6 };

/* Farten (m/s) som rekker å stoppe på strekningen s (m): v·reaksjon + v²/(2·brems) = s */
export function stopSpeed(s, dec, react = 1) {
  const a = 1 / (2 * dec);
  return (-react + Math.sqrt(react * react + 4 * a * Math.max(0, s))) / (2 * a);
}

/* Sikten over en topp med radius R (m), fra øyehøyde h1 til noe som er h2 høyt */
export const crestSight = (R, h2 = 0.6, h1 = 1.1) => Math.sqrt(2 * R * h1) + Math.sqrt(2 * R * h2);

/* Bakketoppene på en tur. input: { loc: [{t, speed}], gyro, grav, acc: [{t, x, y, z}], road: [{t, lane: {l, r}}] }.
   axes: 'webkit' når rotasjonssensoren er lagret med WebKit-rekkefølgen (analysens gyroAxes). t0: turens start i
   opptakstid, så tidene ut er som i rapporten. → null uten nok data, ellers
   { n (topper i alt), crests: [{ t, kmh, safeKmh, radius, sight, narrow }] } med toppene der farten var for høy. */
export function crestSpeed(input, { axes = 'standard', surface = '', t0 = 0, marginKmh = 5 } = {}) {
  const loc = (input.loc || []).filter(p => Number.isFinite(p.t) && Number.isFinite(p.speed) && p.speed >= 0);
  const grav = input.grav || [], acc = input.acc || [];
  if (loc.length < 60 || grav.length < 100 || acc.length < 100 || !(input.gyro || []).length) return null;
  const gyro = axes === 'webkit' ? input.gyro.map(g => ({ t: g.t, x: g.z, y: g.x, z: g.y })) : input.gyro;
  // Tyngden i snitt over turen: telefonen står fast, og tyngden øyeblikk for øyeblikk heller i svinger (sidekraften)
  let ux = 0, uy = 0, uz = 0;
  for (const g of grav) { ux += g.x; uy += g.y; uz += g.z; }
  const um = Math.hypot(ux, uy, uz); if (!um) return null;
  ux /= um; uy /= um; uz /= um;
  // Kjøreretningen i telefonens ramme: akselerasjonen (uten tyngde) der GPS-farten endrer seg
  const aG = loc.map((p, i) => (i && i < loc.length - 1 && loc[i + 1].t > loc[i - 1].t ? (loc[i + 1].speed - loc[i - 1].speed) / (loc[i + 1].t - loc[i - 1].t) : 0));
  let fx = 0, fy = 0, fz = 0, li = 0, used = 0;
  for (const a of acc) {
    while (li < loc.length - 1 && loc[li + 1].t <= a.t) li++;
    const w = aG[li];
    if (!Number.isFinite(w) || Math.abs(w) < 0.4 || !Number.isFinite(a.x)) continue;
    fx += w * a.x; fy += w * a.y; fz += w * a.z; used++;
  }
  const fd = fx * ux + fy * uy + fz * uz; fx -= fd * ux; fy -= fd * uy; fz -= fd * uz;
  const fm = Math.hypot(fx, fy, fz);
  if (used < 100 || !fm) return null;
  fx /= fm; fy /= fm; fz /= fm;
  // Tverraksen (mot høyre): rotasjon om den er nesa opp (+) eller ned (−)
  const lx = uy * fz - uz * fy, ly = uz * fx - ux * fz, lz = ux * fy - uy * fx;
  const q = gyro.filter(w => Number.isFinite(w.t) && Number.isFinite(w.x)).map(w => ({ t: w.t, r: w.x * lx + w.y * ly + w.z * lz }));
  if (q.length < 200) return null;
  const hz = (q.length - 1) / (q[q.length - 1].t - q[0].t), half = Math.max(1, Math.round(0.75 * hz));
  const pre = [0]; for (const x of q) pre.push(pre[pre.length - 1] + x.r);
  const rate = i => { const a = Math.max(0, i - half), b = Math.min(q.length, i + half + 1); return (pre[b] - pre[a]) / (b - a); };
  // Topper: nesa går ned minst 0,5 grader i sekundet, sammenhengende, i fart
  const eps = []; let cur = null; li = 0;
  for (let i = 1; i < q.length; i++) {
    while (li < loc.length - 1 && loc[li + 1].t <= q[i].t) li++;
    const v = loc[li].speed, r = rate(i), dt = Math.min(0.5, q[i].t - q[i - 1].t);
    if (r < -0.5 * RAD && v > 8) {
      if (!cur) cur = { t: q[i].t, tEnd: q[i].t, i0: i, i1: i, dth: 0, ds: 0, acc: 0, n: 0 };
      cur.dth += -r * dt; cur.ds += v * dt; cur.acc += aG[li]; cur.n++; cur.tEnd = q[i].t; cur.i1 = i;
    } else if (cur) { eps.push(cur); cur = null; }
  }
  if (cur) eps.push(cur);
  const grip = GRIP[surface] || 1, dec = 0.7 * G * grip;
  const road = input.road || [];
  let ri = 0;
  // Andelen bilder med begge feltlinjene rundt toppen (null uten veikamera)
  const lined = (a, b) => { while (ri < road.length && road[ri].t < a - 3) ri++; let n = 0, both = 0; for (let k = ri; k < road.length && road[k].t <= b + 3; k++) { n++; if (road[k].lane && road[k].lane.l && road[k].lane.r) both++; } return n >= 5 ? both / n : null; };
  const crests = []; let n = 0;
  for (const e of eps) {
    const dur = e.tEnd - e.t;
    if (e.dth < 2 * RAD || dur < 1.2) continue;
    if (e.acc / e.n < -1.5) continue;   // bremsing: nesa dykker uten at det er en topp
    // Radius = fart / hvor fort nesa går ned der toppen er krappest (midten av den øvre tredjedelen av de glattede
    // målingene). Glattingen strekker en kort topp ut i tid, så strekning delt på vinkel ville gitt for stor radius.
    // For topper kortere enn glattingen (1,5 s) blir radiusen fortsatt litt for stor, altså i førerens favør.
    const top = [];
    for (let i = e.i0; i <= e.i1; i++) top.push(-rate(i));
    top.sort((x, y) => y - x);
    const peak = top[Math.floor(top.length / 6)];
    const R = (e.ds / dur) / peak;
    if (!(R >= 40 && R <= 3000)) continue;
    n++;
    const share = lined(e.t, e.tEnd), narrow = share !== null && share < 0.2;
    const sight = crestSight(R);
    const safe = narrow ? Math.min(stopSpeed(sight, dec), stopSpeed(crestSight(R, 1.2) / 2, dec)) : stopSpeed(sight, dec);
    const kmh = e.ds / dur * 3.6, safeKmh = safe * 3.6;
    if (kmh > safeKmh + marginKmh) crests.push({ t: Math.round((e.t - t0) * 10) / 10, kmh: Math.round(kmh), safeKmh: Math.round(safeKmh), radius: Math.round(R), sight: Math.round(narrow ? Math.min(sight, crestSight(R, 1.2) / 2) : sight), narrow });
  }
  return { n, crests };
}

/* Fartsdelen av poengene. speeding: fra analyzeSpeeding ({ episodes: [{ tFrom, tTo, over }] }) eller null uten
   fartsgrenser. crest: fra crestSpeed eller null. km: turens lengde. Trekk per 10 km, med gulv på 5 km som de andre
   delpoengene. → null når ingen av delene er målt, ellers { score, limitPen, crestPen, over (antall perioder),
   crests (antall topper) }. */
export function speedScore({ speeding = null, crest = null, km = 0 } = {}) {
  if (!speeding && !crest) return null;
  const k = 10 / Math.max(km, 5);
  let limitPen = null, crestPen = null;
  if (speeding) {
    let p = 0;
    for (const e of speeding.episodes || []) {
      const over = Number.isFinite(e.over) ? e.over : e.maxKmh - e.limit;
      p += (over >= 20 ? 13 : over >= 10 ? 8 : 4) * clamp((e.tTo - e.tFrom) / 8, 0.5, 2);
    }
    limitPen = Math.round(p * k * 10) / 10;
  }
  if (crest) {
    let p = 0;
    for (const c of crest.crests || []) p += c.kmh - c.safeKmh >= 15 ? 8 : 4;
    crestPen = Math.round(Math.min(25, p * k) * 10) / 10;
  }
  return { score: Math.round(clamp(100 - (limitPen || 0) - (crestPen || 0), 0, 100)), limitPen, crestPen,
    over: speeding ? (speeding.episodes || []).length : null, crests: crest ? (crest.crests || []).length : null };
}

/* Totalpoengene: kjøringen (bremsing, gass, svinger, jevn fart) teller 60 % og farten 40 %. Uten fartsdel: som før. */
export const totalScore = (base, speed) => (speed ? Math.round(0.6 * base + 0.4 * speed.score) : base);
