/* Tegninger til teorispørsmålene (0.14.0): skilt, oppmerking, trafikklys og kryss, som SVG laget i koden. Skiltene er
   forenklet etter skiltforskriften (formen, fargene og symbolet), nok til å kjenne dem igjen. Skiltforskriften er en
   forskrift, så skiltene kan brukes fritt (åndsverkloven § 14).
   figure(key) → SVG-tekst. key: 'sign:362:60', 'sign:362:50:gul', 'line:sperre', 'light:gul', 'scene:hoyre', 'bil:peilepinne' (deler av bilen, 0.28.1).
   Skjermleserteksten (aria-label) avslører ikke svaret. Ren funksjon, testes i Node. */

const RED = '#c8102e', BLUE = '#0b5aa6', YEL = '#f5c400', BLK = '#141414', WH = '#ffffff';

const svg = (body, label, vb = '0 0 100 100', cls = '') =>
  `<svg class="tsvg ${cls}" viewBox="${vb}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const tri = (sym, fill = WH) => `<polygon points="50,10 92,84 8,84" fill="${fill}" stroke="${RED}" stroke-width="8" stroke-linejoin="round"/>${sym}`;
const ring = (inner = WH, w = 10) => `<circle cx="50" cy="50" r="${46 - w / 2}" fill="${inner}" stroke="${RED}" stroke-width="${w}"/>`;
const blueDisc = `<circle cx="50" cy="50" r="46" fill="${BLUE}" stroke="${WH}" stroke-width="2"/>`;
const blueSquare = `<rect x="6" y="6" width="88" height="88" rx="8" fill="${BLUE}" stroke="${WH}" stroke-width="3"/>`;
const num = (n, fill = BLK, size = 40) => `<text x="50" y="51" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="${fill}">${n}</text>`;
const arrowUp = (fill = WH) => `<path d="M44 78 V44 H34 L50 22 L66 44 H56 V78 Z" fill="${fill}"/>`;
/* Bil sett bakfra (til forbikjøringsforbud) */
const carRear = (x, fill) => `<g transform="translate(${x} 0)"><path d="M-11 44 L-8 34 H8 L11 44 Z" fill="${fill}"/><rect x="-14" y="43" width="28" height="15" rx="3" fill="${fill}"/><rect x="-13" y="57" width="6" height="6" rx="1" fill="${fill}"/><rect x="7" y="57" width="6" height="6" rx="1" fill="${fill}"/></g>`;

/* Tre piler i ring mot klokka, som trafikken i en rundkjøring */
function roundArrows(cx, cy, r, color, w) {
  const arcs = [], hl = w * 1.35, hw = w;
  for (let k = 0; k < 3; k++) {
    const a0 = (-90 + k * 120) * Math.PI / 180, a1 = a0 - 85 * Math.PI / 180;
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const t = [Math.sin(a1), -Math.cos(a1)];   // retningen videre mot klokka ved enden
    const h = [p1[0] + t[0] * hl, p1[1] + t[1] * hl], n = [Math.cos(a1) * hw, Math.sin(a1) * hw];
    arcs.push(`<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 0 0 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" fill="none" stroke="${color}" stroke-width="${w}"/><polygon points="${(p1[0] + n[0]).toFixed(1)},${(p1[1] + n[1]).toFixed(1)} ${h[0].toFixed(1)},${h[1].toFixed(1)} ${(p1[0] - n[0]).toFixed(1)},${(p1[1] - n[1]).toFixed(1)}" fill="${color}"/>`);
  }
  return arcs.join('');
}
/* Sonetavle: hvit med «Sone» øverst; ended: grått med sorte skråstriper (slutt på sonen) */
const zone = (inner, ended = false) => `<rect x="12" y="4" width="76" height="92" rx="6" fill="${WH}" stroke="${BLK}" stroke-width="2"/><text x="50" y="23" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="16" fill="${ended ? '#9a9a9a' : BLK}">Sone</text>${inner}${ended ? `<g stroke="${BLK}" stroke-width="2.5"><line x1="84" y1="14" x2="22" y2="92"/><line x1="76" y1="8" x2="16" y2="84"/><line x1="86" y1="26" x2="30" y2="94"/></g>` : ''}`;
/* Sykkel sett fra siden, midt i (x, y), skalert */
const bicycle = (x, y, k = 1, col = BLK) => `<g transform="translate(${x} ${y}) scale(${k}) translate(-50 -66)" fill="none" stroke="${col}" stroke-width="${(3 / k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"><circle cx="36" cy="70" r="8.5"/><circle cx="64" cy="70" r="8.5"/><path d="M36 70 L50 70 L45 56 Z M45 56 H61 L50 70 M61 56 L64 70 M45 56 L43 51 M39 51 H47 M61 56 L59 50 H64"/></g>`;
const slash = () => `<line x1="24" y1="24" x2="76" y2="76" stroke="${RED}" stroke-width="8"/>`;
/* «Slutt på»-skilt: sorte skråstriper over et grått symbol (klippes til skiltet) */
const ended = id => `<clipPath id="${id}"><circle cx="50" cy="50" r="40"/></clipPath><g clip-path="url(#${id})" stroke="${BLK}" stroke-width="2.5"><line x1="78" y1="30" x2="32" y2="76"/><line x1="70" y1="22" x2="24" y2="68"/><line x1="84" y1="38" x2="40" y2="82"/></g>`;
/* Person som går eller løper, h høy fra top */
const runner = (x, top, h, col = BLK) => {
  const P = (dx, dy) => `${(x + dx * h).toFixed(1)} ${(top + dy * h).toFixed(1)}`;
  return `<circle cx="${(x + 0.02 * h).toFixed(1)}" cy="${(top + 0.1 * h).toFixed(1)}" r="${(0.1 * h).toFixed(1)}" fill="${col}"/><g stroke="${col}" stroke-width="${(0.11 * h).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M${P(0.02, 0.26)} L${P(-0.04, 0.58)} L${P(-0.22, 0.98)}"/><path d="M${P(-0.04, 0.58)} L${P(0.14, 0.78)} L${P(0.08, 0.98)}"/><path d="M${P(-0.18, 0.5)} L${P(0.01, 0.32)} L${P(0.2, 0.44)}"/></g>`;
};

const SIGNS = {
  202: () => `<polygon points="8,14 92,14 50,88" fill="${WH}" stroke="${RED}" stroke-width="8" stroke-linejoin="round"/>`,
  204: () => {
    const p = [];
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; p.push(`${(50 + 45 * Math.cos(a)).toFixed(1)},${(50 + 45 * Math.sin(a)).toFixed(1)}`); }
    return `<polygon points="${p.join(' ')}" fill="${RED}" stroke="${WH}" stroke-width="3"/>${num('STOP', WH, 25)}`;
  },
  206: () => `<polygon points="50,4 96,50 50,96 4,50" fill="${WH}" stroke="${BLK}" stroke-width="1.5"/><polygon points="50,15 85,50 50,85 15,50" fill="${YEL}"/>`,
  // Stripene holdes innenfor den gule flaten (klippes), så de ikke stikker ut over kanten
  208: () => `${SIGNS[206]()}<clipPath id="c208"><polygon points="50,15 85,50 50,85 15,50"/></clipPath><g clip-path="url(#c208)"><line x1="16" y1="84" x2="84" y2="16" stroke="${BLK}" stroke-width="13"/></g>`,
  210: () => tri(`<rect x="44" y="36" width="12" height="40" fill="${BLK}"/><rect x="30" y="53" width="40" height="5" fill="${BLK}"/>`),
  302: () => `<circle cx="50" cy="50" r="46" fill="${RED}"/><rect x="18" y="42" width="64" height="16" fill="${WH}"/>`,
  306: () => ring(),
  362: (n = 60, gul) => `${ring(gul ? YEL : WH)}${num(n)}`,
  364: (n = 60) => `<circle cx="50" cy="50" r="45" fill="${WH}" stroke="${BLK}" stroke-width="2"/>${num(n, BLK)}<clipPath id="c364"><circle cx="50" cy="50" r="40"/></clipPath><g clip-path="url(#c364)" stroke="${BLK}" stroke-width="2.5"><line x1="78" y1="30" x2="32" y2="76"/><line x1="70" y1="22" x2="24" y2="68"/><line x1="84" y1="38" x2="40" y2="82"/></g>`,
  370: () => `<circle cx="50" cy="50" r="41" fill="${BLUE}" stroke="${RED}" stroke-width="9"/><g stroke="${RED}" stroke-width="9"><line x1="23" y1="23" x2="77" y2="77"/><line x1="77" y1="23" x2="23" y2="77"/></g>`,
  372: () => `<circle cx="50" cy="50" r="41" fill="${BLUE}" stroke="${RED}" stroke-width="9"/><line x1="23" y1="23" x2="77" y2="77" stroke="${RED}" stroke-width="9"/>`,
  334: () => `${ring()}<g transform="translate(0 -1)">${carRear(35, RED)}${carRear(65, BLK)}</g>`,
  402: () => `${blueDisc}${arrowUp()}`,
  404: () => `${blueDisc}<g transform="rotate(135 50 50)">${arrowUp()}</g>`,
  502: () => `${blueSquare}<rect x="18" y="26" width="64" height="9" fill="${WH}"/><path d="M24 84 L40 40 H46 L42 84 Z M76 84 L60 40 H54 L58 84 Z" fill="${WH}"/>`,
  // Bilen sett forfra, som på det norske skiltet (før: sett fra siden)
  503: () => `${blueSquare}${carFront(50, 60, 1.9, WH, BLUE)}`,
  516: () => `${blueSquare}<polygon points="50,14 88,82 12,82" fill="${WH}"/><g fill="${BLK}"><rect x="22" y="74" width="10" height="5"/><rect x="38" y="74" width="10" height="5"/><rect x="54" y="74" width="10" height="5"/><rect x="70" y="74" width="8" height="5"/><circle cx="52" cy="36" r="5"/></g><g stroke="${BLK}" stroke-width="5" stroke-linecap="round" fill="none"><path d="M51 42 L48 56 L56 70"/><path d="M48 56 L40 68"/><path d="M50 45 L59 52"/><path d="M50 45 L42 51"/></g>`,
  526: () => `<rect x="6" y="24" width="88" height="52" rx="6" fill="${BLUE}" stroke="${WH}" stroke-width="3"/><path d="M18 44 H58 V34 L82 50 L58 66 V56 H18 Z" fill="${WH}"/>`,
  527: () => `${blueSquare}<rect x="43" y="40" width="14" height="46" fill="${WH}"/><rect x="25" y="24" width="50" height="14" fill="${RED}"/>`,
  552: () => `${blueSquare}${num('P', WH, 64)}`,
  100: () => tri(`<path d="M40 76 V58 Q40 44 56 42" fill="none" stroke="${BLK}" stroke-width="7"/><polygon points="54,33 68,42 54,51" fill="${BLK}"/>`),
  109: () => tri(`<path d="M24 74 Q50 46 76 74 Z" fill="${BLK}"/>`),
  126: () => tri(roundArrows(50, 58, 13, BLK, 4.5)),
  132: () => tri(`<rect x="41" y="33" width="18" height="44" rx="5" fill="${BLK}"/><circle cx="50" cy="42" r="5" fill="#e53935"/><circle cx="50" cy="55" r="5" fill="#fbc02d"/><circle cx="50" cy="68" r="5" fill="#43a047"/>`),
  138: () => `<g transform="rotate(45 50 50)"><rect x="4" y="42" width="92" height="16" rx="2" fill="${WH}" stroke="${RED}" stroke-width="4"/></g><g transform="rotate(-45 50 50)"><rect x="4" y="42" width="92" height="16" rx="2" fill="${WH}" stroke="${RED}" stroke-width="4"/></g>`,
  156: () => tri(`<rect x="45.5" y="34" width="9" height="28" rx="2" fill="${BLK}"/><circle cx="50" cy="71" r="5" fill="${BLK}"/>`),
  // Skiltprøven (0.15.0). Symbolene holdes innenfor den hvite flaten i trekanten, som er smal øverst.
  102: () => tri(`<path d="M44 79 V70 C44 60 56 62 56 52 V48" fill="none" stroke="${BLK}" stroke-width="6"/><polygon points="49,49 63,49 56,37" fill="${BLK}"/>`),
  104: () => tri(`<polygon points="27,62 74,79 27,79" fill="${BLK}"/><g transform="translate(45 68.5) rotate(19.9)"><path d="M-11 -2 H11 V-6 H7 L4 -11 H-5 L-8.5 -6 H-11 Z" fill="${BLK}"/><circle cx="-6" cy="-1.5" r="2.6" fill="${BLK}" stroke="${WH}" stroke-width="1"/><circle cx="6" cy="-1.5" r="2.6" fill="${BLK}" stroke="${WH}" stroke-width="1"/></g>`),
  106: () => tri(`<path d="M36 80 V68 L43 58 V40 M64 80 V68 L57 58 V40" fill="none" stroke="${BLK}" stroke-width="5"/>`),
  108: () => tri(`<path d="M22 79 V73 H28 Q35 57 42 73 H58 Q65 57 72 73 H78 V79 Z" fill="${BLK}"/>`),
  110: () => tri(`<polygon points="60,79 82,79 73,69" fill="${BLK}"/><circle cx="46" cy="41" r="4.5" fill="${BLK}"/><g stroke="${BLK}" stroke-width="4.5" stroke-linecap="round" fill="none"><path d="M47 47 L50 62 L43 78"/><path d="M50 62 L57 78"/><path d="M48 52 L60 58"/></g><path d="M54 47 L67 66" stroke="${BLK}" stroke-width="3" stroke-linecap="round"/><polygon points="63,65 71,62 74,70 66,73" fill="${BLK}"/>`, YEL),
  114: () => tri(`<polygon points="70,79 70,64 62,46 54,41 54,79" fill="${BLK}"/><circle cx="45" cy="52" r="3.5" fill="${BLK}"/><circle cx="40" cy="63" r="4.5" fill="${BLK}"/><circle cx="32" cy="74" r="4" fill="${BLK}"/>`),
  116: () => tri(`<g transform="rotate(-12 50 47) translate(50 47) scale(.62) translate(-50 -48)">${carRear(50, BLK)}</g><path d="M44 79 C37 72 50 68 44 59 M56 79 C49 72 62 68 56 59" fill="none" stroke="${BLK}" stroke-width="3"/>`),
  122: () => tri(`<path d="M32 79 V64 A18 20 0 0 1 68 64 V79 H60 V66 A10 11 0 0 0 40 66 V79 Z" fill="${BLK}"/>`),
  124: () => tri(`<g transform="rotate(45 50 61)"><rect x="45" y="41" width="10" height="40" fill="${BLK}"/><rect x="30" y="56" width="40" height="10" fill="${BLK}"/></g>`),   // skrått kryss som på det ekte skiltet (0.20.0)
  134: () => tri(`<g fill="${BLK}"><rect x="31" y="58" width="38" height="5"/><rect x="31" y="68" width="38" height="5"/><rect x="34" y="52" width="5" height="27"/><rect x="47.5" y="52" width="5" height="27"/><rect x="61" y="52" width="5" height="27"/></g>`),
  140: () => tri(`<g fill="${BLK}"><rect x="31" y="74" width="7" height="4"/><rect x="41" y="74" width="7" height="4"/><rect x="51" y="74" width="7" height="4"/><rect x="61" y="74" width="7" height="4"/><circle cx="50" cy="42" r="4"/></g><g stroke="${BLK}" stroke-width="4" stroke-linecap="round" fill="none"><path d="M49 47 L47 59 L53 71"/><path d="M47 59 L41 70"/><path d="M49 50 L56 56"/><path d="M49 50 L42 55"/></g>`),
  142: () => tri(`${runner(43, 40, 38)}${runner(60, 52, 27)}`),
  144: () => tri(`<g fill="none" stroke="${BLK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><circle cx="36" cy="70" r="8.5"/><circle cx="64" cy="70" r="8.5"/><path d="M36 70 L50 70 L45 56 Z M45 56 H61 L50 70 M61 56 L64 70 M45 56 L43 51 M39 51 H47 M61 56 L59 50 H64"/></g><circle cx="49" cy="35.5" r="4" fill="${BLK}"/><path d="M48 40 L45 51 M48 42 L58 49 M45 51 L51 60 L50 66" fill="none" stroke="${BLK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  146: () => tri(`<g transform="translate(52 66) scale(.82) translate(-52 -66)" fill="${BLK}"><ellipse cx="56" cy="60" rx="13" ry="7"/><ellipse cx="48" cy="55" rx="6" ry="5"/><rect x="45" y="63" width="3" height="16"/><rect x="50" y="63" width="3" height="15"/><rect x="60" y="63" width="3" height="16"/><rect x="65" y="62" width="3" height="16"/><polygon points="44,53 38,47 35,50 42,60"/><polygon points="39,46 31,50 29,55 33,56 38,52"/><path d="M38 47 L35 41 M36.5 44 L32 42 M38 47 L42 41 M40 44 L45 43" stroke="${BLK}" stroke-width="2.5" stroke-linecap="round"/></g>`),
  148: () => tri(`<path d="M42 40 V64" stroke="${BLK}" stroke-width="5"/><polygon points="35,62 49,62 42,76" fill="${BLK}"/><path d="M58 78 V52" stroke="${BLK}" stroke-width="5"/><polygon points="51,53 65,53 58,39" fill="${BLK}"/>`),
  152: () => tri(`<rect x="34" y="48" width="3.5" height="31" fill="${BLK}"/><g fill="${BLK}"><polygon points="38,50 46,51.7 46,61.4 38,62"/><polygon points="50,52.6 57,54.1 57,60.7 50,61.1"/><polygon points="60,54.7 66,56 66,60 60,60.4"/></g>`),
  330: () => `${ring()}<path d="M58 74 V52 Q58 43 48 43 H42" fill="none" stroke="${BLK}" stroke-width="7"/><polygon points="43,34 43,52 30,43" fill="${BLK}"/>${slash()}`,
  332: () => `${ring()}<path d="M60 74 V48 A10 10 0 0 0 40 48 V56" fill="none" stroke="${BLK}" stroke-width="7"/><polygon points="33,55 47,55 40,68" fill="${BLK}"/>${slash()}`,
  336: () => `<circle cx="50" cy="50" r="45" fill="${WH}" stroke="${BLK}" stroke-width="2"/><g transform="translate(0 -1)">${carRear(35, '#9a9a9a')}${carRear(65, '#9a9a9a')}</g>${ended('c336')}`,
  366: (n = 30) => zone(`<circle cx="50" cy="61" r="25" fill="${WH}" stroke="${RED}" stroke-width="7"/><text x="50" y="62" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="24" fill="${BLK}">${n}</text>`),
  368: (n = 30) => zone(`<circle cx="50" cy="61" r="25" fill="${WH}" stroke="#9a9a9a" stroke-width="5"/><text x="50" y="62" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="24" fill="#9a9a9a">${n}</text>`, true),
  406: () => `${blueDisc}${roundArrows(50, 50, 22, WH, 7)}`,
  524: () => `${blueSquare}${num('M', WH, 60)}`,
  556: () => `${blueSquare}<rect x="40" y="16" width="14" height="8" rx="2" fill="${WH}"/><rect x="27" y="22" width="46" height="28" rx="5" fill="${WH}"/><circle cx="50" cy="36" r="10" fill="${BLUE}"/><circle cx="50" cy="36" r="5" fill="${WH}"/><g fill="none" stroke="${WH}" stroke-width="5" stroke-linecap="round"><path d="M34 60 Q50 69 66 60"/><path d="M26 70 Q50 83 74 70"/><path d="M18 80 Q50 97 82 80"/></g>`,
  // Nye i 0.16.0, tegnet etter de ekte skiltene
  212: () => `<circle cx="50" cy="50" r="41" fill="${WH}" stroke="${RED}" stroke-width="9"/><rect x="35" y="25" width="7" height="34" fill="${BLK}"/><polygon points="28,57 49,57 38.5,76" fill="${BLK}"/><rect x="58" y="41" width="7" height="34" fill="${RED}"/><polygon points="51,43 72,43 61.5,24" fill="${RED}"/>`,
  214: () => `${blueSquare}<rect x="31" y="20" width="7" height="38" fill="${RED}"/><polygon points="24,56 45,56 34.5,78" fill="${RED}"/><rect x="59" y="38" width="9" height="46" fill="${WH}"/><polygon points="50,40 77,40 63.5,16" fill="${WH}"/>`,
  518: () => `${blueSquare}${runner(42, 18, 66, WH)}${runner(64, 46, 40, WH)}`,
  520: () => `${blueSquare}${bicycle(50, 58, 1.5, WH)}`,
  522: () => `${blueSquare}${runner(43, 12, 38, WH)}${runner(59, 26, 25, WH)}${bicycle(50, 74, 1.05, WH)}`,
  540: () => zone(tunInner(BLUE)),
  548: () => zone(gaInner(BLUE)),
};

/* ==================== Flere skilt i skiltprøven ====================
   Fareskilt, forbudsskilt, påbudsskilt og opplysningsskilt en bilfører møter, tegnet forenklet etter de norske
   skiltene (form, farge og symbol). Symbolene i fareskiltene holdes innenfor den hvite flaten i trekanten. */
const GREY = '#9a9a9a', GREEN = '#1f8f4e', ORANGE = '#f28c28';
const tx = (x, y, s, size, fill = BLK) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="${fill}">${s}</text>`;
/* Innholdet i gatetun- og gågateskiltet; grått på «Slutt på»-skiltene */
function tunInner(c) { return `<rect x="22" y="31" width="56" height="58" rx="4" fill="${c}"/><polygon points="58,46 67,38 76,46 76,56 58,56" fill="${WH}"/>${runner(36, 42, 40, WH)}${runner(55, 60, 25, WH)}<circle cx="70" cy="82" r="4" fill="${WH}"/>`; }
function gaInner(c) { return `<rect x="22" y="31" width="56" height="58" rx="4" fill="${c}"/><text x="50" y="43" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10" fill="${WH}">Gågate</text>${runner(43, 48, 38, WH)}${runner(59, 61, 25, WH)}`; }
/* Bil sett forfra, midt i (x, y): 30 bred og 25 høy før skalering. edge: kant rundt, når biler ligger over hverandre */
const CAR_F = '<path d="M-11 -8 L-8 -17 Q-7.4 -19 -5 -19 H5 Q7.4 -19 8 -17 L11 -8 Z"/><rect x="-15" y="-9" width="30" height="11" rx="3"/><rect x="-14" y="1" width="6" height="5" rx="1.5"/><rect x="8" y="1" width="6" height="5" rx="1.5"/>';
function carFront(x, y, k, fill, bg, rot = 0, edge = '') {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${k})">${edge ? `<g fill="${edge}" stroke="${edge}" stroke-width="${(3 / k).toFixed(1)}" stroke-linejoin="round">${CAR_F}</g>` : ''}<g fill="${fill}">${CAR_F}</g><g fill="${bg}"><path d="M-8 -9.5 L-6 -16 H6 L8 -9.5 Z"/><circle cx="-10" cy="-4" r="2.6"/><circle cx="10" cy="-4" r="2.6"/><rect x="-5" y="-4.6" width="10" height="2" rx="1"/></g></g>`;
}
/* Bil sett fra siden, fronten mot høyre */
const carSide = (x, y, k, fill, bg, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${k})"><path d="M-16 3 V-3 Q-16 -5 -13 -5.5 L-7 -11 H5 L10 -5.5 L14 -4.5 Q16 -4 16 -2 V3 Z" fill="${fill}"/><path d="M-6 -9.5 H-0.8 V-5.8 H-10 Z M0.8 -9.5 H4.4 L8 -5.8 H0.8 Z" fill="${bg}"/><g fill="${fill}" stroke="${bg}" stroke-width="1.4"><circle cx="-9" cy="3" r="3.6"/><circle cx="9" cy="3" r="3.6"/></g></g>`;
/* Lastebil fra siden, fronten mot venstre: 36 bred */
const lorrySide = (x, y, k, col, bg) => `<g transform="translate(${x} ${y}) scale(${k})" fill="${col}"><rect x="-6" y="-14" width="24" height="14.5" rx="1"/><path d="M-18 1 V-7.5 L-14.5 -13 H-8 V1 Z"/><path d="M-16.4 -7.6 L-13.8 -11.4 H-9.6 V-7.6 Z" fill="${bg}"/><rect x="-18" y="0" width="36" height="2.6"/><g stroke="${bg}" stroke-width="1.2"><circle cx="-12.5" cy="4" r="3.4"/><circle cx="8" cy="4" r="3.4"/><circle cx="14.6" cy="4" r="3.4"/></g></g>`;
/* Lastebil sett bakfra (til forbikjøringsforbud for lastebil) */
const lorryRear = (x, fill) => `<g transform="translate(${x} 0)"><rect x="-12" y="30" width="24" height="28" rx="2" fill="${fill}"/><rect x="-11" y="57" width="7" height="6" rx="1" fill="${fill}"/><rect x="4" y="57" width="7" height="6" rx="1" fill="${fill}"/></g>`;
/* Buss og sporvogn fra siden: 40 brede */
const busSide = (x, y, k, col, bg) => `<g transform="translate(${x} ${y}) scale(${k})"><rect x="-20" y="-11" width="40" height="15" rx="3" fill="${col}"/><g fill="${bg}">${[-17.5, -10.5, -3.5, 3.5, 10.5].map(wx => `<rect x="${wx}" y="-9" width="6" height="5" rx=".6"/>`).join('')}</g><g fill="${col}" stroke="${bg}" stroke-width="1.5"><circle cx="-11" cy="4" r="4"/><circle cx="11" cy="4" r="4"/></g></g>`;
const tramSide = (x, y, k, col, bg) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0 -10 L-6 -15.5 L0 -21 L6 -15.5 Z M-7 -21 H7" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/><rect x="-20" y="-10" width="40" height="13" rx="2.5" fill="${col}"/><g fill="${bg}">${[-17, -10, -3, 4, 11].map(wx => `<rect x="${wx}" y="-8" width="6" height="4.5" rx=".6"/>`).join('')}</g><g fill="${col}"><circle cx="-13" cy="4.5" r="2.4"/><circle cx="-7" cy="4.5" r="2.4"/><circle cx="7" cy="4.5" r="2.4"/><circle cx="13" cy="4.5" r="2.4"/><rect x="-24" y="7.2" width="48" height="1.8"/></g></g>`;
/* Motorsykkel med fører, fronten mot høyre */
const moto = (x, y, k, col, bg) => `<g transform="translate(${x} ${y}) scale(${k})"><g fill="${col}"><circle cx="-12" cy="0" r="6.5"/><circle cx="12" cy="0" r="6.5"/><path d="M-15 -7 L-13 -9.5 H-3 L0 -12 H7 L9.5 -7.5 L5 -2 H-5 L-9 -5 H-13 Z"/><circle cx="3" cy="-22" r="4.3"/></g><g fill="${bg}"><circle cx="-12" cy="0" r="4"/><circle cx="12" cy="0" r="4"/></g><g fill="${col}"><circle cx="-12" cy="0" r="1.4"/><circle cx="12" cy="0" r="1.4"/></g><g fill="none" stroke="${col}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 0 L8 -13 L5 -14.5" stroke-width="2.6"/><path d="M1.5 -17.5 L-6 -10.5" stroke-width="6.5"/><path d="M1 -15.5 L7.5 -13.5" stroke-width="3.2"/><path d="M-6 -10.5 L1.5 -8 L0.5 -3" stroke-width="3.8"/><path d="M-5 -2 L-12 0" stroke-width="2"/></g></g>`;
/* Hest med rytter, mot høyre, tegnet til trekanten (x 28–70, y 33–79) */
const horseRider = col => `<g fill="${col}"><ellipse cx="45" cy="62" rx="13" ry="7"/><path d="M53 58 L58 47 L63 46 L61 63 Z"/><path d="M58 47 L62 44 L70 52 L67 55 L61 51 Z"/><path d="M60 45 L60.5 40.5 L63 44 Z"/><rect x="33" y="63" width="3.4" height="16" rx="1.2"/><rect x="38" y="64" width="3.4" height="15" rx="1.2"/><rect x="52" y="64" width="3.4" height="15" rx="1.2"/><path d="M57 63 L61 69 L58 79 H55 L57 70 L54 66 Z"/><circle cx="46" cy="37" r="4"/></g><g fill="none" stroke="${col}" stroke-linecap="round" stroke-linejoin="round"><path d="M33 58 Q28 62 29 72" stroke-width="3"/><path d="M45.5 42 L47 54" stroke-width="6"/><path d="M47 54 L52 59 L51 66" stroke-width="4.2"/><path d="M46 45 L53 50 L58 49" stroke-width="3.2"/></g>`;
/* Rett pil fra (x0, y0) til spissen (x1, y1), skaftet w bredt */
function arrowTo(x0, y0, x1, y1, w, col) {
  const a = Math.atan2(x1 - x0, y0 - y1) * 180 / Math.PI, L = Math.hypot(x1 - x0, y1 - y0), h = w * 2;
  return `<g transform="translate(${x0} ${y0}) rotate(${a.toFixed(1)})" fill="${col}"><rect x="${-w / 2}" y="${(h - L).toFixed(1)}" width="${w}" height="${(L - h).toFixed(1)}"/><polygon points="${-w * 1.5},${(h - L).toFixed(1)} 0,${(-L).toFixed(1)} ${w * 1.5},${(h - L).toFixed(1)}"/></g>`;
}
/* Buet pil: d er skaftet, spissen settes i enden (x, y) i retningen a (grader, 0 = opp) */
const curveArrow = (d, x, y, a, w, col) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/><polygon points="${-w * 1.5},0.5 0,${-w * 2} ${w * 1.5},0.5" transform="translate(${x} ${y}) rotate(${a})" fill="${col}"/>`;
/* Hvit tavle med sort kant (feltskiltene 530–538) */
const whiteBoard = `<rect x="16" y="4" width="68" height="92" rx="6" fill="${WH}" stroke="${BLK}" stroke-width="3.5"/>`;
/* «Slutt på»-skilt med blå bunn: rød skråstrek fra nede til venstre */
const endRed = id => `<clipPath id="${id}"><rect x="6" y="6" width="88" height="88" rx="8"/></clipPath><line x1="6" y1="94" x2="94" y2="6" stroke="${RED}" stroke-width="10" clip-path="url(#${id})"/>`;
/* Fotoboksen fra skilt 556, flyttet og skalert */
const cam = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k}) translate(-50 -50)"><rect x="40" y="16" width="14" height="8" rx="2" fill="${WH}"/><rect x="27" y="22" width="46" height="28" rx="5" fill="${WH}"/><circle cx="50" cy="36" r="10" fill="${BLUE}"/><circle cx="50" cy="36" r="5" fill="${WH}"/><g fill="none" stroke="${WH}" stroke-width="5" stroke-linecap="round"><path d="M34 60 Q50 69 66 60"/><path d="M26 70 Q50 83 74 70"/><path d="M18 80 Q50 97 82 80"/></g></g>`;
/* Person som løper mot høyre (nødutgang), tegnet til skilt 570.1 */
const exitRunner = col => `<circle cx="42" cy="27" r="5.5" fill="${col}"/><g fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M39 37 L32 54"/><path d="M32 54 L44 62 L42 76"/><path d="M32 54 L25 66 L14 66"/><path d="M38 39 L48 45 L54 39"/><path d="M37 39 L27 43 L21 38"/></g>`;
const mirror = (body, cx = 50) => `<g transform="translate(${2 * cx} 0) scale(-1 1)">${body}</g>`;
const truckFront = `<path d="M25 62 V29 Q25 20 34 20 H66 Q75 20 75 29 V62 Z" fill="${WH}"/><rect x="21" y="40" width="58" height="22" rx="4" fill="${WH}"/><rect x="26" y="60" width="12" height="13" rx="2.5" fill="${WH}"/><rect x="62" y="60" width="12" height="13" rx="2.5" fill="${WH}"/>`;
const carRearBig = `<path d="M18 66 V48 Q18 43 23 42 L28 27 Q29.5 23 34 23 H66 Q70.5 23 72 27 L77 42 Q82 43 82 48 V66 Z" fill="${WH}"/><rect x="20" y="64" width="13" height="10" rx="2.5" fill="${WH}"/><rect x="67" y="64" width="13" height="10" rx="2.5" fill="${WH}"/>`;
const wideBlue = (y = 24, h = 52) => `<rect x="4" y="${y}" width="92" height="${h}" rx="6" fill="${BLUE}" stroke="${WH}" stroke-width="3"/>`;

Object.assign(SIGNS, {
  // Fareskilt, § 4
  112: () => tri(`${carFront(35, 72, .68, BLK, WH)}<rect x="19" y="76.5" width="62" height="2.5" fill="${BLK}"/><g fill="${BLK}"><circle cx="66" cy="62" r="4"/><circle cx="57" cy="55" r="3"/><circle cx="72" cy="71" r="3.6"/><circle cx="62" cy="72" r="2.4"/></g><path d="M44 70 L53 58 M45 72 L61 64 M46 74 L67 72" stroke="${BLK}" stroke-width="1.6" stroke-linecap="round"/>`),
  117: () => tri(`<polygon points="19,79 19,72 57,72 59,79" fill="${BLK}"/><polygon points="59,79 58,76.5 81,76.5 82,79" fill="${GREY}"/>${carFront(46, 66.5, .8, BLK, WH, 14)}`),
  118: () => tri(`<g fill="${BLK}"><rect x="23" y="64" width="16" height="15"/><rect x="63" y="64" width="13" height="15"/></g><path d="M37 64 L57 39" stroke="${BLK}" stroke-width="4.5" stroke-linecap="round"/><path d="M40 70 q3 -3 6 0 t6 0 t6 0 t5 0 M40 76 q3 -3 6 0 t6 0 t6 0 t5 0" fill="none" stroke="${BLK}" stroke-width="2.2"/>`),
  120: () => tri(`<polygon points="21,79 29,58 51,58 51,79" fill="${BLK}"/>${carSide(59, 55, .9, BLK, WH, 38)}<path d="M51 72 q3.5 -3 7 0 t7 0 t7 0 M51 78 q3.5 -3 7 0 t7 0 t7 0 t6 0" fill="none" stroke="${BLK}" stroke-width="2.2"/>`),
  135: () => tri(`<g fill="${BLK}"><rect x="27" y="60" width="28" height="10" rx="2"/><rect x="31" y="52" width="5" height="9"/><rect x="43" y="56" width="5" height="5" rx="1.5"/><path d="M54 52 H67 V71 H54 Z"/><rect x="25" y="69" width="44" height="3"/><rect x="23" y="66" width="4" height="5"/><circle cx="35" cy="74.5" r="4"/><circle cx="45" cy="74.5" r="4"/><circle cx="61" cy="75.5" r="3"/><circle cx="38" cy="47" r="3.2"/><circle cx="43" cy="42" r="3.8"/><rect x="17" y="78.6" width="66" height="1.6"/></g><rect x="57" y="55" width="7" height="6" fill="${WH}"/>`),
  // Avstandsskilt: tre, to og én rød stripe før planovergangen; her det første (tre striper)
  136: () => `<clipPath id="c136"><rect x="38" y="4" width="24" height="92"/></clipPath><rect x="38" y="4" width="24" height="92" fill="${WH}"/><g clip-path="url(#c136)" fill="${RED}">${[24, 46, 68].map(y => `<polygon points="36,${y + 12} 64,${y - 2} 64,${y + 6} 36,${y + 20}"/>`).join('')}</g><rect x="38" y="4" width="24" height="92" fill="none" stroke="${BLK}" stroke-width="1.5"/>`,
  139: () => tri(tramSide(50, 67, 1.05, BLK, WH)),
  149: () => tri(`${carFront(45, 58, .7, BLK, WH, 0, WH)}${carFront(52.5, 65.5, .7, BLK, WH, 0, WH)}${carFront(60, 73, .7, BLK, WH, 0, WH)}`),
  150: () => tri(`<g fill="${BLK}"><path d="M27 60 Q29 56.5 34 56.5 H68 L72 60 L68 63.5 H34 Q29 63.5 27 60 Z"/><polygon points="45,57 54,43 59,43 55,57"/><polygon points="45,63 54,77 59,77 55,63"/><polygon points="64,57 68,49 71.5,49 70,57"/><polygon points="64,63 68,71 71.5,71 70,63"/></g>`),
  151: () => tri(`<g fill="${BLK}"><rect x="26" y="68" width="48" height="10" rx="5"/><polygon points="28,69 33,62 67,62 72,69"/><path d="M42 62 V58 Q42 54 46 54 H60 Q64 54 64 58 V62 Z"/><rect x="30" y="55.5" width="13" height="2.6"/></g><g fill="${WH}">${[33, 41, 49, 57, 65].map(x => `<circle cx="${x}" cy="73" r="2.2"/>`).join('')}</g>`),
  153: () => tri(carFront(50, 60, 1, BLK, WH, 160)),
  154: () => tri(`<circle cx="57" cy="40" r="4.2" fill="${BLK}"/><g fill="none" stroke="${BLK}" stroke-linecap="round" stroke-linejoin="round"><path d="M55 45 L47 57" stroke-width="5.5"/><path d="M47 57 L55 64 L58 72" stroke-width="4.2"/><path d="M47 57 L40 65 L32 70" stroke-width="4.2"/><path d="M54 48 L62 53 L68 52" stroke-width="3.4"/><path d="M53 48 L45 52 L39 51" stroke-width="3.4"/><path d="M67 50 L63 74 M40 48 L27 70" stroke-width="1.8"/><path d="M46 75 H73 Q76 75 76 72" stroke-width="2.6"/><path d="M21 68 L41 72.5" stroke-width="2.6"/></g>`),
  155: () => tri(horseRider(BLK)),
  // Forbudsskilt, § 8. Skråstreken ligger over symbolet, som på de ekte skiltene.
  '306.1': () => `${ring()}${carFront(50, 37, .95, BLK, WH)}${moto(50, 70, 1, BLK, WH)}${slash()}`,
  '306.3': () => `${ring()}<g fill="${BLK}"><path d="M47 30 H66 L68 52 H47 Z"/><rect x="26" y="48" width="26" height="12" rx="2"/><rect x="34" y="38" width="3" height="11"/><circle cx="60" cy="62" r="13"/><circle cx="33" cy="66" r="8"/></g><path d="M50.5 33.5 H63.5 L64.8 48 H50.5 Z" fill="${WH}"/><circle cx="60" cy="62" r="4.5" fill="${WH}"/><circle cx="33" cy="66" r="3" fill="${WH}"/>${slash()}`,
  '306.4': () => `${ring()}${moto(50, 61, 1.35, BLK, WH)}${slash()}`,
  '306.5': () => `${ring()}${lorrySide(50, 54, 1.5, BLK, WH)}${slash()}`,
  '306.6': () => `${ring()}${bicycle(50, 54, 1.25)}${slash()}`,
  '306.7': () => `${ring()}${runner(50, 22, 56)}${slash()}`,   // oppreist og mot høyre, som det ekte skiltet
  '306.8': () => `${ring()}${bicycle(39, 66, .85)}${mirror(runner(39, 22, 36))}${slash()}`,
  '306.9': () => `${ring()}<g transform="translate(50 53) scale(-1.2 1.2) translate(-49 -57)">${horseRider(BLK)}</g>${slash()}`,
  '306.10': () => `${ring()}<g fill="none" stroke="${BLK}" stroke-linecap="round" stroke-linejoin="round"><path d="M34 70 L42 28 M36 27 H48" stroke-width="4.5"/><path d="M38 68 H62" stroke-width="5"/><circle cx="34" cy="70" r="6" stroke-width="3.5"/><circle cx="66" cy="70" r="6" stroke-width="3.5"/></g><path d="M49 47 L43 57 H47 L44 66 L52 54 H48 L51 47 Z" fill="${BLK}"/>${slash()}`,
  308: () => `${ring()}<rect x="30" y="27" width="40" height="34" rx="2" fill="${BLK}"/><rect x="35" y="32" width="30" height="22" fill="${ORANGE}"/><rect x="38" y="61" width="24" height="5" fill="${BLK}"/><rect x="31" y="62" width="8" height="12" rx="2" fill="${BLK}"/><rect x="61" y="62" width="8" height="12" rx="2" fill="${BLK}"/><rect x="39" y="66.5" width="22" height="2.5" fill="${BLK}"/>${slash()}`,
  310: () => `${ring()}<path d="M27 66 V32 Q27 24 35 24 H65 Q73 24 73 32 V66 Z" fill="${BLK}"/><rect x="29" y="64" width="11" height="12" rx="2" fill="${BLK}"/><rect x="60" y="64" width="11" height="12" rx="2" fill="${BLK}"/>${tx(50, 46, '3,5t', 19, WH)}`,
  312: () => `${ring()}${tx(50, 41, '2,3', 27)}${tx(50, 66, 'm', 21)}<polygon points="17,34 26,41 17,48" fill="${BLK}"/><polygon points="83,34 74,41 83,48" fill="${BLK}"/>`,
  314: () => `${ring()}${tx(50, 51, '3,5 m', 24)}<polygon points="41,16 59,16 50,25" fill="${BLK}"/><polygon points="41,84 59,84 50,75" fill="${BLK}"/>`,
  316: () => `${ring()}${lorrySide(50, 36, 1, BLK, WH)}${tx(50, 57, '15', 20)}<path d="M22 57 L30 52 V62 Z M78 57 L70 52 V62 Z" fill="${BLK}"/><rect x="29" y="55.6" width="7" height="2.8" fill="${BLK}"/><rect x="64" y="55.6" width="7" height="2.8" fill="${BLK}"/>${tx(50, 74, 'm', 17)}`,
  '318.1': () => `${ring()}${tx(50, 38, '12', 30)}${tx(50, 64, 'tonn', 19)}`,
  '318.2': () => `${ring()}${lorrySide(36, 38, .75, BLK, WH)}<g fill="${BLK}"><rect x="52" y="28" width="21" height="11" rx="1"/><rect x="49" y="38" width="4" height="1.6"/><circle cx="58" cy="41.5" r="2.6"/><circle cx="67" cy="41.5" r="2.6"/></g>${tx(50, 63, '30 t', 26)}`,
  320: () => `${ring()}${tx(50, 36, '3 t', 25)}<g fill="${BLK}"><rect x="25" y="53" width="9" height="15" rx="2.5"/><rect x="66" y="53" width="9" height="15" rx="2.5"/><rect x="33" y="59" width="34" height="3"/><circle cx="50" cy="60.5" r="4"/></g>`,
  322: () => `${ring()}${tx(50, 36, '10 t', 25)}<path d="M28 66 Q28 52 40 52 H60 Q72 52 72 66" fill="none" stroke="${BLK}" stroke-width="3.5"/><g fill="${BLK}" stroke="${WH}" stroke-width="1.5"><circle cx="40" cy="64" r="8"/><circle cx="60" cy="64" r="8"/></g><circle cx="40" cy="64" r="2.8" fill="${WH}"/><circle cx="60" cy="64" r="2.8" fill="${WH}"/>`,
  324: () => `${ring()}${tx(50, 36, 'STOPP', 15)}<rect x="22" y="47" width="56" height="7" rx="3.5" fill="${BLK}"/>${tx(50, 64, 'Kontroll', 13)}`,
  326: () => `${ring()}${tx(50, 35, 'Toll', 18)}<rect x="22" y="47" width="56" height="7" rx="3.5" fill="${BLK}"/>${tx(50, 64, 'Customs', 13)}`,
  335: () => `${ring()}<g transform="translate(0 -1)">${lorryRear(35, RED)}${carRear(65, BLK)}</g>`,
  337: () => `<circle cx="50" cy="50" r="45" fill="${WH}" stroke="${BLK}" stroke-width="2"/><g transform="translate(0 -1)">${lorryRear(35, GREY)}${carRear(65, GREY)}</g>${ended('c337')}`,
  376: () => zone(`<rect x="30" y="31" width="40" height="40" rx="3" fill="${BLUE}"/>${tx(50, 52, 'P', 34, WH)}${tx(50, 84, '08–18', 13)}`),
  378: () => zone(`<rect x="28" y="32" width="44" height="44" rx="3" fill="${GREY}"/>${tx(50, 55, 'P', 36, WH)}`, true),
  // Påbudsskilt, § 10: tavla står i rundkjøringen, midt imot der du kjører inn
  408: () => `<rect x="2" y="34" width="96" height="32" rx="3" fill="${BLUE}" stroke="${WH}" stroke-width="2"/><g fill="${WH}">${[9, 39, 69].map(x => `<path d="M${x} 47 H${x + 13} V41 L${x + 23} 50 L${x + 13} 59 V53 H${x} Z"/>`).join('')}</g>`,
  // Opplysningsskilt, § 12
  504: () => `${SIGNS[502]()}${endRed('c504')}`,
  505: () => `${SIGNS[503]()}${endRed('c505')}`,
  506: () => `${blueSquare}${truckFront}${tx(50, 47, '7,5 t', 19)}`,
  507: () => `${SIGNS[506]()}${endRed('c507')}`,
  508: () => `${blueSquare}${busSide(50, 52, 1.6, WH, BLUE)}`,
  509: () => `${blueSquare}${carRearBig}${tx(50, 50, '2+', 30)}`,
  510: () => `${SIGNS[508]()}${endRed('c510')}`,
  511: () => `${SIGNS[509]()}${endRed('c511')}`,
  512: () => `${wideBlue()}${busSide(50, 51, 1.75, WH, BLUE)}`,
  513: () => `${wideBlue(18, 64)}${tramSide(50, 55, 1.5, WH, BLUE)}`,
  514: () => `${wideBlue(30, 40)}${tx(50, 51, 'Taxi', 28, WH)}`,
  '521.1': () => `${blueSquare}${bicycle(62, 58, 1.0, WH)}<g stroke="${WH}" stroke-width="4" stroke-dasharray="9 7"><line x1="32" y1="12" x2="32" y2="90"/></g>`,   // sideplassert: én linje, sykkelen til høyre (521.2 har to)
  528: () => `${blueSquare}${arrowTo(46, 22, 22, 72, 8, WH)}${arrowTo(54, 22, 78, 72, 8, WH)}`,
  530: () => `${whiteBoard}${curveArrow('M34 92 V74 C34 60 50 58 50 46 V34', 50, 34, 0, 8, RED)}<path d="M66 92 V74 C66 60 50 58 50 46" fill="none" stroke="${RED}" stroke-width="8"/>`,
  531: () => `${whiteBoard}${arrowTo(36, 92, 36, 12, 8, BLK)}${arrowTo(62, 92, 62, 12, 8, RED)}<path d="M80 86 L62 64" stroke="${RED}" stroke-width="8"/>`,
  532: () => `${whiteBoard}${arrowTo(36, 92, 36, 12, 8, BLK)}${curveArrow('M64 92 V62 C64 52 60 48 55 44', 55, 44, -51, 8, RED)}`,
  534: () => `${whiteBoard}${arrowTo(36, 92, 36, 12, 8, BLK)}${curveArrow('M36 80 C36 64 64 66 64 48 V30', 64, 30, 0, 8, BLK)}`,
  536: () => `${whiteBoard}${arrowTo(36, 92, 36, 12, 8, BLK)}${curveArrow('M80 88 C70 78 64 68 64 54 V30', 64, 30, 0, 8, BLK)}`,
  538: () => `${whiteBoard}${arrowTo(30, 12, 30, 86, 7, BLK)}${arrowTo(51, 88, 51, 14, 7, BLK)}${arrowTo(70, 88, 70, 14, 7, BLK)}`,
  539: () => `<rect x="6" y="6" width="88" height="88" rx="6" fill="${YEL}" stroke="${BLK}" stroke-width="1.5"/>${arrowTo(28, 16, 28, 80, 7, BLK)}${curveArrow('M70 94 V80 C70 62 52 62 52 46 V34', 52, 34, 0, 7, BLK)}<path d="M64 6 V14 Q64 22 72 22 Q80 22 80 14 V6 Z M64 94 V86 Q64 78 72 78 Q80 78 80 86 V94 Z" fill="${BLK}"/>`,
  542: () => zone(tunInner(GREY), true),
  550: () => zone(gaInner(GREY), true),
  555: () => `${blueSquare}<path d="M20 9 H40 V28 L62 40 V60 L40 72 V91 H20 Z" fill="${WH}"/><line x1="40" y1="29" x2="40" y2="71" stroke="${BLK}" stroke-width="3" stroke-dasharray="5 4"/>${tx(51, 40, 'S', 12)}${tx(51, 50, 'O', 12)}${tx(51, 60, 'S', 12)}`,
  '556.2': () => `${blueSquare}${cam(36, 63, .5)}${cam(64, 37, .5)}`,
  558: () => `${blueSquare}<g transform="rotate(-28 52 40)" fill="${WH}"><rect x="36" y="31" width="40" height="18" rx="2"/><path d="M36 34 L27 30 V50 L36 46 Z"/></g><rect x="60" y="48" width="5" height="34" fill="${WH}"/>`,
  565: () => `<rect x="14" y="4" width="72" height="92" rx="5" fill="${RED}" stroke="${WH}" stroke-width="2"/>${tx(50, 16, 'STOPP', 15, WH)}<g transform="translate(50 50) scale(.9) translate(-50 -47)"><g fill="${BLK}" stroke="${WH}" stroke-width="1.2"><rect x="36" y="27" width="6" height="20" rx="3"/><rect x="43" y="23" width="6" height="22" rx="3"/><rect x="50" y="24" width="6" height="22" rx="3"/><rect x="57" y="28" width="6" height="19" rx="3"/><rect x="62" y="44" width="6" height="16" rx="3" transform="rotate(40 65 52)"/><rect x="36" y="40" width="27" height="30" rx="7"/></g><circle cx="49.5" cy="56" r="6.5" fill="${RED}" stroke="${WH}" stroke-width="1"/><rect x="45" y="54.8" width="9" height="2.4" fill="${WH}"/></g>${tx(50, 85, 'SNU', 15, WH)}`,
  '570.1': () => `<rect x="6" y="6" width="88" height="88" rx="8" fill="${GREEN}" stroke="${WH}" stroke-width="3"/><rect x="64" y="20" width="16" height="60" fill="${WH}"/>${exitRunner(WH)}`,
  '570.2': () => `<polygon points="3,30 84,30 97,50 84,70 3,70" fill="${GREEN}" stroke="${WH}" stroke-width="2" stroke-linejoin="round"/><g transform="translate(3 27) scale(.45)">${exitRunner(WH)}</g>${arrowTo(30, 42, 58, 42, 4, WH)}${tx(46, 60, '150 m', 11, WH)}<rect x="64" y="36" width="10" height="28" fill="${WH}"/>`
});

/* ---------- Oppmerking: veien sett ovenfra, kjøreretning oppover ---------- */
/* Bil sett ovenfra (0.16.0): skygge, frontrute (foran = opp før rotering), tak, bakrute, speil og lys.
   Bokstaven står i et hvitt merke midt på bilen og står alltid rett. */
const car = (x, y, fill, label = '', rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-8.5" y="-14.5" width="17" height="29" rx="5.5" fill="#000" opacity=".2" transform="translate(1.2 1.6)"/><rect x="-10.4" y="-6.5" width="2.4" height="3.2" rx="1" fill="${fill}"/><rect x="8" y="-6.5" width="2.4" height="3.2" rx="1" fill="${fill}"/><rect x="-8.5" y="-14.5" width="17" height="29" rx="5.5" fill="${fill}" stroke="rgba(0,0,0,.45)" stroke-width="1"/><path d="M-6.6 -7.5 Q0 -10.5 6.6 -7.5 L5.6 -2.8 H-5.6 Z" fill="#dbe9f5"/><rect x="-5.6" y="-2.8" width="11.2" height="9.6" rx="1.5" fill="rgba(0,0,0,.16)"/><path d="M-5.6 7.6 H5.6 L6.2 10.6 Q0 12.2 -6.2 10.6 Z" fill="#c9dbe9"/><rect x="-6.6" y="-14.3" width="3.6" height="1.7" rx=".8" fill="#fff4bf"/><rect x="3" y="-14.3" width="3.6" height="1.7" rx=".8" fill="#fff4bf"/></g>${label ? `<g transform="translate(${x} ${y})"><circle r="6.2" fill="#fff" stroke="${fill}" stroke-width="1.6"/><text y=".4" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="8.5" fill="#14181b">${label}</text></g>` : ''}`;
const road = (body, label) => svg(`<rect width="120" height="160" rx="10" fill="#c9d3c4"/><rect x="20" y="0" width="80" height="160" fill="#5a6066"/><g stroke="#f4f4f4" stroke-width="2"><line x1="24" y1="0" x2="24" y2="160"/><line x1="96" y1="0" x2="96" y2="160"/></g>${body}`, label, '0 0 120 160', 'tsvg-scene');
const LINES = {
  sperre: () => road(`<line x1="60" y1="0" x2="60" y2="160" stroke="${YEL}" stroke-width="3.5"/>${car(78, 128, '#2e7dd1')}`, 'Vei med gul linje i midten'),
  varsel: () => road(`<line x1="60" y1="0" x2="60" y2="160" stroke="${YEL}" stroke-width="3.5" stroke-dasharray="26 7"/>${car(78, 128, '#2e7dd1')}`, 'Vei med gul linje i midten'),
  kombi: () => road(`<line x1="56" y1="0" x2="56" y2="160" stroke="${YEL}" stroke-width="3"/><line x1="64" y1="0" x2="64" y2="160" stroke="${YEL}" stroke-width="3" stroke-dasharray="10 12"/>${car(80, 128, '#2e7dd1')}`, 'Vei med en heltrukken og en stiplet gul linje. Bilen kjører i høyre felt, nærmest den stiplede.'),
  vike: () => road(`<line x1="60" y1="0" x2="60" y2="160" stroke="${YEL}" stroke-width="3" stroke-dasharray="10 12"/><g fill="#f4f4f4">${[66, 76, 86].map(x => `<polygon points="${x - 4},58 ${x + 4},58 ${x},68"/>`).join('')}</g>${car(78, 128, '#2e7dd1')}`, 'Trekanter malt tvers over kjørefeltet foran bilen'),
  stopp: () => road(`<line x1="60" y1="0" x2="60" y2="160" stroke="${YEL}" stroke-width="3" stroke-dasharray="10 12"/><rect x="61" y="58" width="35" height="6" fill="#f4f4f4"/>${car(78, 128, '#2e7dd1')}`, 'Hvit tverrgående linje over kjørefeltet foran bilen')
};

/* ---------- Trafikklys ---------- */
const LIGHT_ON = { rod: '#ff3b30', gul: '#ffcc00', gronn: '#34c759' };
const lamp = (cy, color, on, blink) => `<circle cx="30" cy="${cy}" r="14" fill="${on ? LIGHT_ON[color] : '#2b2f33'}"${blink ? ' class="tsvg-blink"' : ''}/>${on ? `<circle cx="30" cy="${cy}" r="14" fill="none" stroke="${LIGHT_ON[color]}" stroke-opacity=".35" stroke-width="6"${blink ? ' class="tsvg-blink"' : ''}/>` : ''}`;
const LIGHTS = {
  rod: { on: ['rod'], label: 'Trafikklys som viser rødt' },
  rodgul: { on: ['rod', 'gul'], label: 'Trafikklys som viser rødt og gult samtidig' },
  gronn: { on: ['gronn'], label: 'Trafikklys som viser grønt' },
  gul: { on: ['gul'], label: 'Trafikklys som viser gult' },
  gulblink: { on: ['gul'], blink: true, label: 'Trafikklys der det gule lyset blinker' }
};
const light = k => {
  const L = LIGHTS[k];
  return svg(`<rect x="8" y="6" width="44" height="118" rx="10" fill="#111417"/>${lamp(30, 'rod', L.on.includes('rod'))}${lamp(65, 'gul', L.on.includes('gul'), L.blink)}${lamp(100, 'gronn', L.on.includes('gronn'))}`, L.label, '0 0 60 130', 'tsvg-light');
};

/* ---------- Kryss sett ovenfra (200 × 200). Trafikken kjører på høyre side. ---------- */
/* 0.16.0: fortau og avrundede hjørner, biler med vinduer, lys og speil, og piler i bilens farge med hvit kant */
const GRASS = '#c9d3c4', ASP = '#5a6066', LINE = '#f2d24a', SIDE = '#dcdfd8';
const CAR_COLORS = { '#2e7dd1': '#1d5fa6', '#d9472b': '#a8321b', '#2f9e5b': '#1e7442', '#111': '#111' };
const MARK = { '#1d5fa6': 'ahb', '#a8321b': 'ahr', '#1e7442': 'ahg', '#111': 'ahk' };
const arrow = (d, color = '#111') => {
  const c = CAR_COLORS[color] || color, m = MARK[c] || 'ahk';
  return `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${m})"/>`;
};
const marker = (id, c) => `<marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>`;
const defs = `<defs>${Object.entries(MARK).map(([c, id]) => marker(id, c)).join('')}<clipPath id="scl"><rect width="200" height="200" rx="12"/></clipPath></defs>`;
const vLine = (y0, y1, x = 100) => `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${LINE}" stroke-width="2" stroke-dasharray="8 8"/>`;
const hLine = (x0, x1, y = 100) => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${LINE}" stroke-width="2" stroke-dasharray="8 8"/>`;
const grass = (x, y, w, h, rx = 14) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${GRASS}"/>`;
/* Veiene i et kryss: arms er de armene som finnes (n, e, s, w). Fortau (6 px) langs veien og runde hjørner. */
function roads(arms = 'nesw', { shoulderS = false } = {}) {
  const has = c => arms.includes(c);
  let s = `<rect width="200" height="200" fill="${SIDE}"/>`;
  if (has('n')) s += `<rect x="80" y="0" width="40" height="100" fill="${ASP}"/>`;
  if (has('s')) s += `<rect x="80" y="100" width="${shoulderS ? 48 : 40}" height="100" fill="${ASP}"/>`;
  if (has('w')) s += `<rect x="0" y="80" width="100" height="40" fill="${ASP}"/>`;
  if (has('e')) s += `<rect x="100" y="80" width="100" height="40" fill="${ASP}"/>`;
  s += `<rect x="80" y="80" width="40" height="40" fill="${ASP}"/>`;
  const se = shoulderS ? 134 : 126;
  s += grass(-30, -30, 104, 104) + grass(126, -30, 104, 104) + grass(-30, 126, 104, 104) + grass(se, 126, 230 - se, 104);
  if (!has('n')) s += grass(-30, -30, 260, 104);
  if (!has('s')) s += grass(-30, 126, 260, 104);
  if (!has('w')) s += grass(-30, -30, 104, 260);
  if (!has('e')) s += grass(126, -30, 104, 260);
  if (has('n')) s += vLine(0, 76);
  if (has('s')) s += vLine(124, 200);
  if (has('w')) s += hLine(0, 76);
  if (has('e')) s += hLine(124, 200);
  if (shoulderS) s += `<line x1="120.5" y1="126" x2="120.5" y2="200" stroke="#f4f4f4" stroke-width="1.5"/>`;
  return s;
}
/* Vikelinje (haitenner) tvers over et felt; spissene peker mot den som kommer */
const shark = (x0, x1, y, dir = 1) => { const out = []; for (let x = x0 + 1; x + 5 <= x1; x += 6.5) out.push(`<polygon points="${x},${y} ${x + 5},${y} ${x + 2.5},${y + dir * 6}" fill="#f4f4f4"/>`); return out.join(''); };
const sharkV = (y0, y1, x, dir = 1) => { const out = []; for (let y = y0 + 1; y + 5 <= y1; y += 6.5) out.push(`<polygon points="${x},${y} ${x},${y + 5} ${x + dir * 6},${y + 2.5}" fill="#f4f4f4"/>`); return out.join(''); };
/* Fotgjenger (sett fra siden, så den kjennes igjen) og syklist sett ovenfra */
const person = (x, y) => `<g stroke="#14181b" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="${x}" cy="${y - 12}" r="3.9" fill="#14181b" stroke="none"/><path d="M${x} ${y - 7} V${y + 2} M${x} ${y + 2} L${x - 4.5} ${y + 10} M${x} ${y + 2} L${x + 4} ${y + 10} M${x - 5} ${y - 4} L${x} ${y - 6} L${x + 5} ${y - 2}"/></g>`;
const bike = (x, y, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-1.4" y="-12" width="2.8" height="24" rx="1.4" fill="#2a2f33"/><line x1="-5" y1="-7" x2="5" y2="-7" stroke="#2a2f33" stroke-width="2" stroke-linecap="round"/><ellipse cx="0" cy="0" rx="5.6" ry="3.4" fill="#e3a21a"/><circle cx="0" cy="-1.5" r="3" fill="#1f2a33"/></g>`;
const scene = (body, label) => svg(`${defs}<g clip-path="url(#scl)"><rect width="200" height="200" fill="${GRASS}"/>${body}</g>`, label, '0 0 200 200', 'tsvg-scene');
const zebra = (x, y, w, h, vertical) => {
  const out = [];
  if (vertical) for (let yy = y; yy < y + h; yy += 8) out.push(`<rect x="${x}" y="${yy}" width="${w}" height="5" fill="#f4f4f4"/>`);
  else for (let xx = x; xx < x + w; xx += 8) out.push(`<rect x="${xx}" y="${y}" width="5" height="${h}" fill="#f4f4f4"/>`);
  return out.join('');
};
const smallSign202 = (x, y) => `<line x1="${x}" y1="${y + 6}" x2="${x}" y2="${y + 14}" stroke="#6b7177" stroke-width="1.6"/><polygon points="${x - 7},${y - 6} ${x + 7},${y - 6} ${x},${y + 7}" fill="#fff" stroke="${RED}" stroke-width="2.4" stroke-linejoin="round"/>`;
const smallSign206 = (x, y) => `<line x1="${x}" y1="${y + 8}" x2="${x}" y2="${y + 15}" stroke="#6b7177" stroke-width="1.6"/><polygon points="${x},${y - 9} ${x + 9},${y} ${x},${y + 9} ${x - 9},${y}" fill="#fff" stroke="#14181b" stroke-width="1"/><polygon points="${x},${y - 6} ${x + 6},${y} ${x},${y + 6} ${x - 6},${y}" fill="${YEL}"/>`;
const smallSpeed = (x, y, n) => `<g transform="translate(${x} ${y})"><line x1="0" y1="10" x2="0" y2="17" stroke="#6b7177" stroke-width="1.6"/><circle r="10" fill="#fff" stroke="${RED}" stroke-width="2.5"/><text y="1" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10" fill="#111">${n}</text></g>`;
const bus = (x, y, rot, blinkLeft = false) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-9" y="-26" width="18" height="52" rx="4" fill="#000" opacity=".18" transform="translate(1.2 1.6)"/><rect x="-9" y="-26" width="18" height="52" rx="4" fill="#d9472b" stroke="rgba(0,0,0,.45)" stroke-width="1"/><rect x="-7" y="-24" width="14" height="5" rx="1.5" fill="#dbe9f5"/><rect x="-6" y="-14" width="12" height="34" rx="2" fill="rgba(0,0,0,.14)"/>${blinkLeft ? '<circle cx="-7.5" cy="-24.5" r="2.8" fill="#ffb300" class="tsvg-blink"/>' : ''}</g>`;
/* Rundkjøring: ring, øy og fire armer (2 felt inn og ut). twoLanes: stiplet linje mellom indre og ytre felt. */
function roundabout(twoLanes = false) {
  const R = twoLanes ? 64 : 58, isl = twoLanes ? 30 : 26;
  let s = `<rect width="200" height="200" fill="${SIDE}"/>${grass(-30, -30, 106, 106, 30)}${grass(124, -30, 106, 106, 30)}${grass(-30, 124, 106, 106, 30)}${grass(124, 124, 106, 106, 30)}`;
  s += `<circle cx="100" cy="100" r="${R + 6}" fill="${SIDE}"/><circle cx="100" cy="100" r="${R}" fill="${ASP}"/>`;
  s += `<rect x="82" y="150" width="36" height="50" fill="${ASP}"/><rect x="0" y="82" width="50" height="36" fill="${ASP}"/><rect x="150" y="82" width="50" height="36" fill="${ASP}"/><rect x="82" y="0" width="36" height="50" fill="${ASP}"/>`;
  s += vLine(0, 40) + vLine(160, 200) + hLine(0, 40) + hLine(160, 200);
  if (twoLanes) s += `<circle cx="100" cy="100" r="47" fill="none" stroke="#f4f4f4" stroke-width="1.6" stroke-dasharray="7 7"/>`;
  return s + `<circle cx="100" cy="100" r="${isl + 3}" fill="${SIDE}"/><circle cx="100" cy="100" r="${isl}" fill="${GRASS}"/>`;
}

const SCENES = {
  'rundkjoring-to': () => scene(`${roundabout(true)}
    ${car(111.5, 154.3, '#d9472b', 'B', 78)}${arrow('M122.6 150.7 A55.5 55.5 0 0 0 150.3 76.5', '#d9472b')}
    ${car(131.5, 122.1, '#2e7dd1', 'A', 35)}${arrow('M140 110 Q156 106 184 109', '#2e7dd1')}`,
    'Rundkjøring med to felt. Bil A ligger i det indre feltet og skal ut i neste avkjøring til høyre. Bil B ligger i det ytre feltet litt bak A og skal videre rundt.')
};

/* ---------- Varsellamper i instrumentpanelet (0.16.0), til sikkerhetskontrollen ---------- */
/* Symbolene følger de vanlige internasjonale symbolene (ISO 2575), forenklet. Mørk bakgrunn som i bilen, lampen lyser. */
const LAMP = { rod: '#ff453a', gul: '#ffb020', gronn: '#32d74b', bla: '#4a9dff' };
const paren = c => `<path d="M25 30 A28 28 0 0 0 25 70 M75 30 A28 28 0 0 1 75 70" fill="none" stroke="${c}" stroke-width="5.5" stroke-linecap="round"/>`;
const bang = (x, y, c, h = 20) => `<rect x="${x - 3}" y="${y}" width="6" height="${h * .62}" rx="2" fill="${c}"/><circle cx="${x}" cy="${y + h * .88}" r="3.4" fill="${c}"/>`;
const headlamp = c => `<path d="M56 30 Q80 30 80 50 Q80 70 56 70 Z" fill="none" stroke="${c}" stroke-width="5.5" stroke-linejoin="round"/>`;
const LAMPS = {
  brems: ['rod', 'Varsellampe for bremser', c => `<circle cx="50" cy="50" r="19" fill="none" stroke="${c}" stroke-width="5.5"/>${paren(c)}${bang(50, 37, c, 26)}`],
  abs: ['gul', 'Varsellampe for ABS', c => `<circle cx="50" cy="50" r="19" fill="none" stroke="${c}" stroke-width="5.5"/>${paren(c)}<text x="50" y="51" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="13" fill="${c}">ABS</text>`],
  lading: ['rod', 'Varsellampe for lading', c => `<rect x="22" y="36" width="56" height="34" rx="4" fill="none" stroke="${c}" stroke-width="5.5"/><rect x="30" y="28" width="11" height="8" rx="1.5" fill="${c}"/><rect x="59" y="28" width="11" height="8" rx="1.5" fill="${c}"/><path d="M30 53 H41 M59 53 H70 M64.5 47.5 V58.5" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`],
  dekk: ['gul', 'Varsellampe for dekktrykk', c => `<path d="M29 30 C21 46 22 62 31 71 H69 C78 62 79 46 71 30" fill="none" stroke="${c}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 78 V82 M42 78 V82 M50 78 V82 M58 78 V82 M66 78 V82" stroke="${c}" stroke-width="4" stroke-linecap="round"/>${bang(50, 34, c, 30)}`],
  olje: ['rod', 'Varsellampe for oljetrykk', c => `<path d="M20 50 Q12 50 14 42 L22 44" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/><rect x="22" y="44" width="38" height="22" rx="3" fill="${c}"/><rect x="34" y="37" width="10" height="7" rx="1.5" fill="${c}"/><path d="M58 50 L80 38" stroke="${c}" stroke-width="6" stroke-linecap="round"/><path d="M82 50 Q78 58 82 62 Q86 58 82 50 Z" fill="${c}"/>`],
  styring: ['gul', 'Varsellampe for styring', c => `<circle cx="44" cy="50" r="22" fill="none" stroke="${c}" stroke-width="5.5"/><circle cx="44" cy="50" r="6" fill="${c}"/><path d="M24 46 H38 M50 46 H64 M44 56 V71" stroke="${c}" stroke-width="5"/>${bang(79, 32, c, 34)}`],
  naerlys: ['gronn', 'Kontrollampe for nærlys', c => `${headlamp(c)}<path d="M46 36 L22 44 M46 46 L22 54 M46 56 L22 64 M46 66 L22 74" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`],
  fjernlys: ['bla', 'Kontrollampe for fjernlys', c => `${headlamp(c)}<path d="M46 36 H20 M46 46 H20 M46 56 H20 M46 66 H20" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`],
  // Nye i 0.20.0
  motor: ['gul', 'Gul varsellampe for motoren', c => `<path d="M16 50 H24 V42 H32 V34 H56 V40 H64 L71 33 H82 V71 H71 L64 64 H52 V72 H32 V64 H24 V58 H16 Z" fill="none" stroke="${c}" stroke-width="5.5" stroke-linejoin="round"/>`],
  esc: ['gul', 'Lampe for antiskrens (ESC)', c => `<path d="M30 50 L36 34 H64 L70 50 V60 H30 Z" fill="none" stroke="${c}" stroke-width="5.5" stroke-linejoin="round"/><path d="M33 60 V66 M67 60 V66" stroke="${c}" stroke-width="6" stroke-linecap="round"/><path d="M38 72 C30 78 46 82 38 90 M62 72 C54 78 70 82 62 90" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`],
  blink: ['gronn', 'Kontrollampe for blinklys', c => `<path d="M12 50 L34 30 V42 H45 V58 H34 V70 Z M88 50 L66 30 V42 H55 V58 H66 V70 Z" fill="${c}"/>`],
  takebak: ['gul', 'Kontrollampe for tåkebaklys', c => `<path d="M44 30 Q20 30 20 50 Q20 70 44 70 Z" fill="none" stroke="${c}" stroke-width="5.5" stroke-linejoin="round"/><path d="M54 36 H82 M54 50 H82 M54 64 H82" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M68 26 C60 34 76 42 68 50 C60 58 76 66 68 74" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`],
  belte: ['rod', 'Varsellampe for bilbelte', c => `<circle cx="44" cy="22" r="8" fill="${c}"/><path d="M44 34 V58 H64 V80" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M44 40 L60 48" stroke="${c}" stroke-width="6" stroke-linecap="round"/><path d="M28 34 L62 64" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/><circle cx="66" cy="67" r="5" fill="none" stroke="${c}" stroke-width="3.5"/>`]
};
const lampSvg = k => {
  const [col, label, draw] = LAMPS[k], c = LAMP[col];
  return svg(`<rect width="100" height="100" rx="20" fill="#15191c"/><g opacity=".45" filter="url(#lgl)">${draw(c)}</g>${draw(c)}`.replace('<rect', '<defs><filter id="lgl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter></defs><rect'), label, '0 0 100 100', 'tsvg-lamp');
};

/* ==================== Flere tegninger (0.20.0) ====================
   Eieren ønsket mye mer å se på i teoriøvingen. Tegningene under er av to slag:
   - til spørsmålet (img): situasjonen spørsmålet handler om, uten å røpe svaret;
   - til forklaringen (wimg i theory-b.js): vises først etter svaret, og kan derfor vise tall og regler.
   Samme stil som kryssene over: veien sett ovenfra, høyrekjøring, bil A er deg (blå). */
const WL = '#f4f4f4', GREY_CAR = '#8a9097', GREY_CAR2 = '#6b7280';
const vroad = (x0, x1, edges = true) => `<rect x="${x0}" y="0" width="${x1 - x0}" height="200" fill="${ASP}"/>${edges ? `<g stroke="${WL}" stroke-width="1.6"><line x1="${x0 + 2}" y1="0" x2="${x0 + 2}" y2="200"/><line x1="${x1 - 2}" y1="0" x2="${x1 - 2}" y2="200"/></g>` : ''}`;
const wdash = (x, y0 = 0, y1 = 200) => `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${WL}" stroke-width="1.8" stroke-dasharray="9 9"/>`;
const wsolid = (x, y0 = 0, y1 = 200, w = 1.8) => `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${WL}" stroke-width="${w}"/>`;
/* Blinklys på en bil: side -1 venstre, 1 høyre, foran og bak, i bilens retning */
const carBlink = (x, y, rot, side) => `<g transform="translate(${x} ${y}) rotate(${rot})"><circle cx="${side * 7.4}" cy="-13.6" r="2.6" fill="#ffb300" class="tsvg-blink"/><circle cx="${side * 7.4}" cy="13.6" r="2.6" fill="#ffb300" class="tsvg-blink"/></g>`;
const truck = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-9.5" y="-30" width="19" height="60" rx="3" fill="#000" opacity=".18" transform="translate(1.2 1.6)"/><rect x="-9.5" y="-12" width="19" height="42" rx="2" fill="#e3e6ea" stroke="rgba(0,0,0,.45)" stroke-width="1"/><rect x="-9" y="-30" width="18" height="16" rx="3" fill="#2e7d5b" stroke="rgba(0,0,0,.45)" stroke-width="1"/><rect x="-7" y="-28.5" width="14" height="4.5" rx="1.2" fill="#dbe9f5"/></g>`;
const ambulance = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-9" y="-17" width="18" height="34" rx="3.5" fill="#000" opacity=".18" transform="translate(1.2 1.6)"/><rect x="-9" y="-17" width="18" height="34" rx="3.5" fill="#f7f7f2" stroke="rgba(0,0,0,.5)" stroke-width="1"/><rect x="-9" y="2" width="18" height="4" fill="#d9472b"/><path d="M-7 -10 Q0 -13 7 -10 L6 -6 H-6 Z" fill="#cfe0ee"/><rect x="-6.5" y="-4.5" width="5" height="3" rx="1" fill="#2f6bff" class="tsvg-blink"/><rect x="1.5" y="-4.5" width="5" height="3" rx="1" fill="#2f6bff"/><rect x="-6.5" y="11" width="5" height="3" rx="1" fill="#2f6bff"/><rect x="1.5" y="11" width="5" height="3" rx="1" fill="#2f6bff" class="tsvg-blink"/></g>`;
const tram = (x, y) => `<g transform="translate(${x} ${y})"><rect x="-11" y="-46" width="22" height="92" rx="5" fill="#000" opacity=".18" transform="translate(1.2 1.6)"/><rect x="-11" y="-46" width="22" height="92" rx="5" fill="#2a6fc0" stroke="rgba(0,0,0,.45)" stroke-width="1"/><rect x="-8" y="-43" width="16" height="6" rx="2" fill="#dbe9f5"/><rect x="-7" y="-30" width="14" height="66" rx="2" fill="rgba(255,255,255,.18)"/>${[-24, 0, 24].map(d => `<rect x="9" y="${d - 5}" width="3" height="10" rx="1" fill="#f6d55c"/>`).join('')}</g>`;
const kid = (x, y) => `<g transform="translate(${x} ${y}) scale(.8) translate(${-x} ${-y})">${person(x, y)}</g>`;
const ballAt = (x, y) => `<circle cx="${x}" cy="${y}" r="4.2" fill="#e8423a" stroke="#fff" stroke-width="1"/><path d="M${x - 3} ${y - 1.5} Q${x} ${y + 1.5} ${x + 3} ${y - 1.5}" stroke="#fff" stroke-width="1" fill="none"/><path d="M${x + 7} ${y - 3} H${x + 13} M${x + 7} ${y + 1} H${x + 15} M${x + 7} ${y + 5} H${x + 12}" stroke="#14181b" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>`;
const house = (x, y, w, h, roof = '#a8321b') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e9e1d3" stroke="rgba(0,0,0,.35)"/><path d="M${x - 2} ${y} H${x + w + 2} L${x + w / 2} ${y - h * .35} Z" fill="${roof}" opacity=".9"/>`;
const cone = (x, y) => `<polygon points="${x},${y - 5} ${x + 3.5},${y + 3} ${x - 3.5},${y + 3}" fill="#f57c00" stroke="#fff" stroke-width=".8"/>`;
const barrier = (x0, x1, y) => { let s = `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="6" fill="#fff" stroke="#c8102e" stroke-width="1"/>`; for (let x = x0 + 1; x < x1 - 3; x += 8) s += `<rect x="${x}" y="${y}" width="4" height="6" fill="#c8102e"/>`; return s; };
const people = (pts) => pts.map(([x, y]) => person(x, y)).join('');

Object.assign(SCENES, {
  'forbi-venstresving': () => scene(`<rect x="0" y="50" width="76" height="40" fill="${ASP}"/>${vroad(70, 140)}<rect x="70" y="50" width="4" height="40" fill="${ASP}"/>${hLine(0, 70, 70)}${vLine(0, 200)}
    ${car(107, 100, '#d9472b', 'B')}${carBlink(107, 100, 0, -1)}${arrow('M107 84 V72 Q107 60 95 60 H40', '#d9472b')}
    ${car(114, 168, '#2e7dd1', 'A')}`,
    'Vei med ett felt i hver retning og en sidevei til venstre. Bil B foran deg blinker til venstre og har lagt seg inntil midtlinjen. Du er bil A bak.'),
  'gangfelt-skjult': () => scene(`${vroad(64, 136)}${wdash(100)}${zebra(67, 52, 66, 22, false)}${person(80, 66)}
    ${car(82, 96, '#d9472b', 'B')}
    ${car(118, 168, '#2e7dd1', 'A')}${arrow('M118 151 V116', '#2e7dd1')}`,
    'Vei med to felt i samme retning og et gangfelt foran. I venstre felt har bil B stanset foran gangfeltet, og en fotgjenger er på vei over. Du er bil A i høyre felt.'),
  'syklist-forbi': () => scene(`${vroad(76, 124)}${vLine(0, 200)}
    ${bike(117, 98)}${arrow('M117 84 V60', '#111')}
    ${car(88, 34, '#2f9e5b', 'C', 180)}
    ${car(111, 168, '#2e7dd1', 'A')}`,
    'Vei med ett felt i hver retning. En syklist sykler ytterst til høyre foran deg. Lenger fram kommer bil C imot. Du er bil A.'),
  'lastebil-hoyre': () => scene(`${roads('nesw', { shoulderS: true })}
    ${truck(110, 142, 0)}${carBlink(110, 142, 0, 1)}<g transform="translate(110 142)"><circle cx="8" cy="-28" r="2.6" fill="#ffb300" class="tsvg-blink"/></g>${arrow('M110 110 Q112 108 128 108 H190', '#111')}
    ${car(119, 188, '#2e7dd1', 'A')}`,
    'Kryss. En lastebil foran deg blinker til høyre og skal svinge til høyre. Du er bil A, like bak og til høyre for lastebilen.'),
  ball: () => scene(`<rect x="52" y="0" width="14" height="200" fill="${SIDE}"/><rect x="134" y="0" width="14" height="200" fill="${SIDE}"/>${vroad(66, 134, false)}
    ${house(8, 30, 34, 26)}${house(10, 120, 32, 24, '#5f6b76')}${house(158, 60, 34, 26, '#5f6b76')}${house(160, 150, 32, 24)}
    ${car(124, 64, GREY_CAR)}${car(124, 120, GREY_CAR2)}${ballAt(108, 93)}
    ${car(94, 170, '#2e7dd1', 'A')}${arrow('M94 153 V116', '#2e7dd1')}`,
    'Gate i et boligområde med biler parkert langs kanten. En ball triller ut i veien mellom to parkerte biler foran deg. Du er bil A.'),
  'buss-holdeplass': () => scene(`${vroad(76, 124)}<rect x="124" y="0" width="16" height="200" fill="${SIDE}"/>${vLine(0, 200)}
    ${bus(112, 76, 0)}${people([[132, 64], [133, 90]])}
    ${car(112, 168, '#2e7dd1', 'A')}${arrow('M112 151 V118', '#2e7dd1')}`,
    'Vei med ett felt i hver retning. En buss har stanset ved holdeplassen foran deg, og det står folk ved holdeplassen. Du er bil A bak bussen.'),
  trikk: () => scene(`${vroad(56, 144)}${vLine(0, 200)}<rect x="144" y="0" width="16" height="200" fill="${SIDE}"/><g stroke="#9aa1a7" stroke-width="1.6"><line x1="106" y1="0" x2="106" y2="200"/><line x1="118" y1="0" x2="118" y2="200"/></g>
    ${tram(112, 78)}${people([[132, 70], [152, 86]])}${arrow('M126 92 H148', '#111')}
    ${car(134, 170, '#2e7dd1', 'A')}`,
    'Gate med trikkeskinner. En trikk står ved en holdeplass uten trafikkøy, og folk går av på høyre side og over til fortauet. Du er bil A og vil forbi på høyre side av trikken.'),
  'ko-gangfelt': () => scene(`${vroad(76, 124)}${vLine(0, 200)}${zebra(78, 96, 44, 20, false)}
    ${car(112, 72, GREY_CAR)}${car(112, 38, GREY_CAR2)}
    ${car(112, 166, '#2e7dd1', 'A')}`,
    'Det står kø foran deg. Den bakerste bilen i køen står like på den andre siden av et gangfelt. Du er bil A.'),
  'ko-kryss': () => scene(`${roads('nesw')}
    ${car(110, 56, GREY_CAR)}${car(110, 22, GREY_CAR2)}
    ${car(110, 164, '#2e7dd1', 'A')}${arrow('M110 147 V126', '#2e7dd1')}`,
    'Kryss. På den andre siden av krysset står det kø. Du er bil A og skal rett fram.'),
  sykkelfelt: () => scene(`<rect x="140" y="38" width="60" height="40" fill="${ASP}"/>${vroad(76, 140)}<rect x="136" y="38" width="6" height="40" fill="${ASP}"/>${vLine(0, 200)}${wsolid(125, 0, 38, 2.6)}${wsolid(125, 78, 200, 2.6)}${hLine(144, 200, 58)}
    ${bike(133, 116)}
    ${car(112, 164, '#2e7dd1', 'A')}${carBlink(112, 164, 0, 1)}${arrow('M112 147 V124', '#2e7dd1')}`,
    'Vei med sykkelfelt til høyre, avgrenset med en bred heltrukken hvit linje. Du er bil A og skal svinge til høyre i krysset foran. En syklist kommer i sykkelfeltet.'),
  fletting: () => scene(`<polygon points="64,200 136,200 136,120 120,64 120,0 80,0 80,64 64,120" fill="${ASP}"/><polyline points="66,200 66,120 82,64 82,0" fill="none" stroke="${WL}" stroke-width="1.6"/><polyline points="134,200 134,120 118,64 118,0" fill="none" stroke="${WL}" stroke-width="1.6"/>${wdash(100, 110, 200)}
    ${car(82, 140, '#d9472b', 'B')}${arrow('M82 123 V112 Q82 96 95 84', '#d9472b')}
    ${car(118, 160, '#2e7dd1', 'A')}${arrow('M118 143 V122 Q118 104 106 92', '#2e7dd1')}`,
    'To felt i samme retning går sammen til ett felt. Bil A er i høyre felt og bil B i venstre felt.'),
  pakjoring: () => scene(`<rect x="40" y="0" width="16" height="200" fill="${GRASS}"/><polygon points="56,0 120,0 120,30 144,80 144,200 56,200" fill="${ASP}"/><line x1="58" y1="0" x2="58" y2="200" stroke="${YEL}" stroke-width="1.8"/>${wdash(88)}<polyline points="142,200 142,80 120,32 120,0" fill="none" stroke="${WL}" stroke-width="1.6"/><line x1="120" y1="200" x2="120" y2="80" stroke="${WL}" stroke-width="2.6" stroke-dasharray="4 4"/>
    ${car(104, 104, '#d9472b', 'B')}${arrow('M104 87 V40', '#d9472b')}
    ${car(132, 156, '#2e7dd1', 'A')}${carBlink(132, 156, 0, -1)}${arrow('M132 139 V96 Q132 80 112 66', '#2e7dd1')}`,
    'Påkjøring til motorvei. Du er bil A i feltet for fartsøkning og skal inn på motorveien. Bil B kjører i høyre felt på motorveien.'),
  feltslutt: () => scene(`<polygon points="64,200 136,200 136,110 104,48 104,0 64,0" fill="${ASP}"/><line x1="66" y1="0" x2="66" y2="200" stroke="${WL}" stroke-width="1.6"/><polyline points="134,200 134,110 102,48 102,0" fill="none" stroke="${WL}" stroke-width="1.6"/>${wdash(100, 104, 200)}
    ${car(82, 118, '#d9472b', 'B')}${arrow('M82 101 V60', '#d9472b')}
    ${car(118, 164, '#2e7dd1', 'A')}`,
    'Vei med to felt i samme retning. Høyre felt slutter lenger fram. Du er bil A i høyre felt, og bil B kjører i venstre felt.'),
  utrykning: () => scene(`${vroad(76, 124)}${vLine(0, 200)}
    ${car(112, 80, '#2e7dd1', 'A')}
    ${ambulance(112, 160, 0)}`,
    'Vei med ett felt i hver retning. Bak deg kommer en ambulanse med blått blinklys. Du er bil A.'),
  'tre-felt': () => scene(`${vroad(52, 148)}${wdash(84)}${wdash(116)}
    ${car(68, 64, '#2f9e5b', 'C')}${car(100, 88, '#d9472b', 'B')}
    ${car(132, 166, '#2e7dd1', 'A')}${carBlink(132, 166, 0, -1)}${arrow('M132 149 C132 120 70 130 70 96', '#2e7dd1')}`,
    'Vei med tre felt i samme retning. Du er bil A i høyre felt og skal over i venstre felt. Bil B kjører i midtfeltet og bil C i venstre felt.'),
});

/* ==================== Kryss som kan spilles av (0.22.0) ====================
   Eieren ønsket animasjoner som gjør det lettere å øve. Kryssene under er tegnet som bakgrunn pluss trafikanter, og
   hver trafikant har en bane (d) fra der den står og videre. Den samme tegningen er stillbildet i spørsmålene
   (scene:<navn>), og crossanim.js spiller den av: trafikantene kjører langs banene i den rekkefølgen reglene gir.
   Bil, sykkel og buss er tegnet med fronten opp og dreies etter banen; fotgjengeren står oppreist. */
const CBLUE = '#2e7dd1', REDC = '#d9472b', GREENC = '#2f9e5b';
const badge = (label, fill) => `<g class="cx-badge"><circle r="6.2" fill="#fff" stroke="${fill}" stroke-width="1.6"/><text y=".4" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="8.5" fill="#14181b">${label}</text></g>`;
const MOVER_BODY = {
  car: m => car(0, 0, m.col) + (m.blink ? carBlink(0, 0, 0, m.blink) : ''),
  bike: () => bike(0, 0),
  person: () => person(0, 0),
  bus: m => bus(0, 0, 0, !!m.blink)
};
/* Startpunktet er det første punktet i banen */
export const pathStart = d => { const m = String(d).match(/^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/); return m ? [+m[1], +m[2]] : [0, 0]; };
const moverSvg = m => { const [x, y] = pathStart(m.d); return `<g class="cx-mover" data-id="${m.id}" data-kind="${m.kind}" transform="translate(${x} ${y})"><circle class="cx-hit" r="19" fill="transparent" stroke="none"/><g class="cx-body" transform="rotate(${m.kind === 'person' ? 0 : m.rot || 0})">${MOVER_BODY[m.kind](m)}</g>${m.kind === 'car' ? badge(m.id, m.col) : ''}</g>`; };
const P202 = () => smallSign202(134, 168);
const CROSS = {
  hoyre: { bg: () => roads('nesw'), label: 'Kryss uten skilt eller lys. Bil A kommer nedenfra og skal rett fram. Bil B kommer fra høyre side av bildet og skal rett fram.', movers: [
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M110 160 V-30', arrow: 'M110 143 V66' },
    { id: 'B', kind: 'car', col: REDC, rot: -90, d: 'M160 90 H-30', arrow: 'M143 90 H66' }] },
  venstresving: { bg: () => roads('nesw'), label: 'Kryss. Bil A kommer nedenfra og skal svinge til venstre. Bil B kommer ovenfra mot A og skal rett fram.', movers: [
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M110 160 V108 Q110 90 92 90 H-30', arrow: 'M110 143 V108 Q110 90 92 90 H40' },
    { id: 'B', kind: 'car', col: REDC, rot: 180, d: 'M90 40 V230', arrow: 'M90 57 V150' }] },
  't-kryss': { bg: () => roads('esw'), label: 'T-kryss uten skilt. Bil A kjører fra venstre mot høyre på den gjennomgående veien. Bil B kommer nedenfra fra sideveien og skal svinge til venstre.', movers: [
    { id: 'A', kind: 'car', col: CBLUE, rot: 90, d: 'M40 110 H230', arrow: 'M57 110 H150' },
    { id: 'B', kind: 'car', col: REDC, rot: 0, d: 'M110 170 V108 Q110 90 92 90 H-30', arrow: 'M110 153 V108 Q110 90 92 90 H66' }] },
  parkering: { bg: () => `${roads('ew')}<rect x="96" y="134" width="74" height="56" rx="6" fill="#8a9097"/><rect x="104" y="118" width="16" height="18" fill="${ASP}"/><g stroke="#f4f4f4" stroke-width="1.4"><line x1="132" y1="140" x2="132" y2="160"/><line x1="148" y1="140" x2="148" y2="160"/></g><text x="156" y="182" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="18" fill="#fff">P</text>`,
    label: 'Vei med en parkeringsplass nedenfor. Bil A kjører på veien fra venstre mot høyre. Bil B kjører ut fra parkeringsplassen.', movers: [
    { id: 'A', kind: 'car', col: CBLUE, rot: 90, d: 'M40 110 H230', arrow: 'M57 110 H92' },
    { id: 'B', kind: 'car', col: REDC, rot: 0, d: 'M112 154 V122 Q112 110 124 110 H230', arrow: 'M112 137 V122 Q112 110 124 110 H162' }] },
  buss: { bg: () => `${roads('ew')}<path d="M112 120 L122 132 H176 L186 120 Z" fill="${ASP}"/>${smallSpeed(30, 146, 50)}`,
    label: 'Vei med fartsgrense 50. En buss står ved holdeplassen foran bil A, blinker til venstre og skal kjøre ut.', movers: [
    { id: 'bus', kind: 'bus', blink: true, rot: 90, d: 'M150 122 C168 122 172 110 194 110 H330', arrow: 'M128 116 Q132 110 150 110 H186', acol: REDC },
    { id: 'A', kind: 'car', col: CBLUE, rot: 90, d: 'M40 110 H330', arrow: 'M57 110 H96' }] },
  gangfelt: { bg: () => `${roads('ns')}${zebra(83, 62, 36, 24, false)}`, label: 'Gangfelt uten trafikklys. En fotgjenger står ved kanten og er på vei ut i gangfeltet. Bil A nærmer seg nedenfra.', movers: [
    { id: 'P', kind: 'person', d: 'M129 78 H62' },
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M110 160 V-30', arrow: 'M110 143 V98' }] },
  'hoyresving-sykkel': { bg: () => roads('nesw', { shoulderS: true }), label: 'Kryss. Bil A kommer nedenfra og skal svinge til høyre. En syklist på vegskulderen til høyre for bilen skal rett fram.', movers: [
    { id: 'S', kind: 'bike', rot: 0, d: 'M124.5 146 V128 Q124.5 114 116 106 V-30', arrow: 'M124.5 132 V128 Q124.5 114 116 106 V58', acol: '#111' },
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M110 172 V130 Q110 110 130 110 H230', arrow: 'M110 155 V130 Q110 110 130 110 H178' }] },
  rundkjoring: { bg: () => `${roundabout()}${shark(100, 118, 152, 1)}${P202()}`, label: 'Rundkjøring med vikepliktskilt ved innkjøringen. Bil A skal kjøre inn nedenfra. Bil B er allerede i rundkjøringen og kommer fra venstre mot A.', movers: [
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M109 178 V158 Q109 147 120 141 A44 44 0 0 0 128 65 Q112 55 110 42 V-30', arrow: 'M109 161 V152' },
    { id: 'B', kind: 'car', col: REDC, rot: 140, d: 'M56 122 A46 46 0 0 0 100 146 A46 46 0 0 0 141 121 Q149 110 164 110 H230', arrow: 'M67 135 Q80 150 96 150' }] },
  'sving-gangfelt': { bg: () => `${roads('nesw')}${zebra(132, 82, 22, 36, true)}`, label: 'Kryss. Bil A kommer nedenfra og skal svinge til høyre. I veien A svinger inn i, er det et gangfelt der en fotgjenger går over.', movers: [
    { id: 'P', kind: 'person', d: 'M143 98 V136' },
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M108 160 V128 Q108 110 126 110 H230', arrow: 'M108 143 V128 Q108 110 126 110 H182' }] },
  'kryss-tre': { bg: () => roads('nesw'), label: 'Kryss uten skilt eller lys. Bil A kommer nedenfra, bil B fra høyre side av bildet og bil C fra venstre side. Alle skal rett fram.', movers: [
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M110 162 V-30', arrow: 'M110 145 V62' },
    { id: 'B', kind: 'car', col: REDC, rot: -90, d: 'M162 90 H-30', arrow: 'M145 90 H62' },
    { id: 'C', kind: 'car', col: GREENC, rot: 90, d: 'M38 110 H230', arrow: 'M55 110 H138' }] },
  'forkjorsvei-venstre': { bg: () => `${roads('nesw')}${shark(100, 120, 124, 1)}${shark(80, 100, 76, -1)}${smallSign206(30, 140)}${smallSign202(134, 146)}`,
    label: 'Kryss der veien fra venstre til høyre er forkjørsvei. Bil A kjører på forkjørsveien fra venstre og skal svinge til venstre. Bil B kommer imot på forkjørsveien og skal rett fram. Bil C står ved vikepliktskiltet i sideveien nedenfra og skal rett fram.', movers: [
    { id: 'A', kind: 'car', col: CBLUE, rot: 90, d: 'M36 110 H88 Q110 110 110 88 V-30', arrow: 'M53 110 H88 Q110 110 110 88 V30' },
    { id: 'B', kind: 'car', col: REDC, rot: -90, d: 'M164 90 H-30', arrow: 'M147 90 H40' },
    { id: 'C', kind: 'car', col: GREENC, rot: 0, d: 'M110 168 V-30', arrow: 'M110 151 V132' }] },
  sperret: { bg: () => `${vroad(76, 124)}${vLine(0, 200)}${barrier(102, 122, 62)}${cone(104, 78)}${cone(112, 82)}${cone(120, 86)}`,
    label: 'Vei med ett felt i hver retning. Lenger fram er feltet ditt sperret av et vegarbeid. Bil B kommer imot i det andre feltet. Du er bil A.', movers: [
    { id: 'B', kind: 'car', col: REDC, rot: 180, d: 'M88 34 V230', arrow: 'M88 51 V80' },
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M112 160 V122 C112 106 88 108 88 92 V56 C88 42 112 44 112 28 V-30' }] },
  'gs-vei': { bg: () => `<rect x="124" y="62" width="76" height="16" fill="#7d848b"/>${vroad(76, 124)}${vLine(0, 200)}`,
    label: 'Vei der en gang- og sykkelvei kommer inn fra høyre, uten sykkelkryssing eller gangfelt. En syklist på gang- og sykkelveien skal krysse veien. Du er bil A.', movers: [
    { id: 'S', kind: 'bike', rot: -90, d: 'M152 70 H52', arrow: 'M140 70 H128', acol: '#111' },
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M112 164 V-30', arrow: 'M112 147 V104' }] },
  'utkjorsel-gs': { bg: () => `<rect x="0" y="16" width="200" height="40" fill="${ASP}"/>${hLine(0, 200, 36)}<rect x="0" y="74" width="200" height="16" fill="#7d848b"/><rect x="0" y="120" width="200" height="80" fill="#9aa1a7"/><rect x="88" y="56" width="24" height="64" fill="${ASP}"/><rect x="88" y="74" width="24" height="16" fill="#7d848b"/>
    <g stroke="${WL}" stroke-width="1.4">${[20, 46, 140, 166].map(x => `<line x1="${x}" y1="150" x2="${x}" y2="200"/>`).join('')}</g>${car(33, 176, GREY_CAR)}${car(153, 178, GREY_CAR2)}`,
    label: 'Du er bil A og kjører ut fra en parkeringsplass. Utkjørselen krysser en gang- og sykkelvei før veien. En syklist kommer på gang- og sykkelveien fra høyre.', movers: [
    { id: 'S', kind: 'bike', rot: -90, d: 'M160 82 H-30', arrow: 'M148 82 H124', acol: '#111' },
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, d: 'M100 140 V62 Q100 46 116 46 H230', arrow: 'M100 123 V66' }] },
  'innkjorsel-fortau': { bg: () => `${vroad(56, 104, false)}${vLine(0, 200, 80)}<rect x="104" y="0" width="14" height="200" fill="${SIDE}"/><rect x="118" y="60" width="44" height="26" fill="#8f969c"/>${house(162, 46, 34, 52, '#5f6b76')}`,
    label: 'Du er bil A og skal svinge til høyre inn i en innkjørsel. Innkjørselen går over fortauet, og en fotgjenger går på fortauet.', movers: [
    { id: 'P', kind: 'person', d: 'M111 112 V8' },
    { id: 'A', kind: 'car', col: CBLUE, rot: 0, blink: 1, d: 'M92 164 V84 Q92 73 104 73 H142', arrow: 'M92 147 V84 Q92 73 104 73 H150' }] }
};
function crossingBody(k) {
  const s = CROSS[k];
  return `${s.bg()}<g class="cx-movers">${s.movers.map(moverSvg).join('')}</g><g class="cx-arrows">${s.movers.filter(m => m.arrow).map(m => arrow(m.arrow, m.acol || m.col || '#111')).join('')}</g><g class="cx-paths">${s.movers.map(m => `<path data-id="${m.id}" d="${m.d}" fill="none"/>`).join('')}</g>`;
}
Object.assign(SCENES, Object.fromEntries(Object.keys(CROSS).map(k => [k, () => scene(crossingBody(k), CROSS[k].label)])));
/* Til crossanim.js og testene: hvilke kryss som kan spilles av, og trafikantene i dem */
export const CROSS_KEYS = Object.keys(CROSS);
export const crossingMovers = k => (CROSS[k] ? CROSS[k].movers.map(({ id, kind, d }) => ({ id, kind, d })) : []);

/* Veien sett fra førersetet (200 × 130) */
const view = (body, label) => svg(`<defs><linearGradient id="vsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9d6f2"/><stop offset="1" stop-color="#e4eef7"/></linearGradient></defs>${body}`, label, '0 0 200 130', 'tsvg-view');
const crestRoad = (half, centre) => {
  // Veien stiger mot en bakketopp ved y = 64 og forsvinner der
  // Veien går opp en kul og forsvinner over toppen, fortsatt bred (ikke mot et forsvinningspunkt, som en flat vei).
  // Trærne bak toppen er halvt skjult: der bak ser du ikke.
  const top = 62, ctl = 2 * top - 78, wt = half * 0.42;   // ctl: kontrollpunktet som gir toppen av kulen akkurat ved veiens topp
  let s = `<rect width="200" height="130" fill="url(#vsky)"/>`;
  s += `<g fill="#5d7a4c">${[[30, 58], [44, 54], [158, 56], [172, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('')}</g>`;
  s += `<path d="M0 78 Q100 ${ctl} 200 78 V130 H0 Z" fill="#8fae78"/><path d="M0 78 Q100 ${ctl} 200 78 V84 Q100 ${ctl + 6} 0 84 Z" fill="#7f9f69"/>`;
  s += `<polygon points="${100 - half},130 ${100 + half},130 ${100 + wt},${top} ${100 - wt},${top}" fill="${ASP}"/>`;
  s += `<polygon points="${100 - half},130 ${100 - half + 5},130 ${100 - wt + 1.6},${top} ${100 - wt},${top}" fill="${WL}"/><polygon points="${100 + half - 5},130 ${100 + half},130 ${100 + wt},${top} ${100 + wt - 1.6},${top}" fill="${WL}"/>`;
  if (centre) s += [[126, 108, 3.4], [98, 84, 2.6], [74, 64, 2]].map(([y0, y1, w]) => `<polygon points="${100 - w},${y0} ${100 + w},${y0} ${100 + w * .8},${y1} ${100 - w * .8},${y1}" fill="${YEL}"/>`).join('');
  return s;
};
const VIEWS = {
  bakketopp: () => view(crestRoad(78, true), 'Veien foran deg går opp mot en bakketopp. Du ser ikke hva som er på den andre siden.'),
  'bakketopp-smal': () => view(crestRoad(40, false), 'En smal vei uten midtlinje går opp mot en bakketopp. Du ser ikke hva som er på den andre siden.'),
  morke: () => svg(`<defs><linearGradient id="vbeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3c4" stop-opacity=".55"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></linearGradient></defs>
    <rect width="200" height="130" fill="#0b1020"/><rect y="62" width="200" height="68" fill="#121722"/><polygon points="22,130 178,130 104,62 96,62" fill="#20252c"/>
    <polygon points="30,130 170,130 116,84 84,84" fill="url(#vbeam)"/>
    <g fill="#e8d36a" opacity=".55">${[[124, 112, 3], [98, 92, 2]].map(([y0, y1, w]) => `<polygon points="${100 - w},${y0} ${100 + w},${y0} ${100 + w * .7},${y1} ${100 - w * .7},${y1}" />`).join('')}</g>
    <g fill="#262c36"><circle cx="128" cy="62" r="2.6"/><rect x="125.6" y="64.5" width="4.8" height="9" rx="1.5"/><rect x="126" y="73" width="1.7" height="6"/><rect x="128.3" y="73" width="1.7" height="6"/></g>`,
    'Mørk landevei med nærlys. Lyset når et stykke fram. En fotgjenger i mørke klær står i veikanten lenger fram.', '0 0 200 130', 'tsvg-view')
};

/* Små bilder av ting (piktogrammer) */
const pict = (body, label, vb = '0 0 120 120') => svg(body, label, vb, 'tsvg-pict');
const officer = arm => `<rect x="10" y="10" width="100" height="100" rx="16" fill="#e8eef7"/>
  <g stroke-linecap="round" stroke-linejoin="round">
  <circle cx="60" cy="30" r="9" fill="#e8c4a0"/><path d="M49 25 H71 L69 19 H51 Z" fill="#14213d"/><rect x="47" y="24" width="26" height="4" rx="1.5" fill="#14213d"/>
  <path d="M46 42 H74 L72 80 H48 Z" fill="#d7f21f" stroke="#14213d" stroke-width="2"/><path d="M48 60 H72 M48 66 H72" stroke="#c9ced3" stroke-width="3"/>
  <path d="M51 80 L49 104 M69 80 L71 104" stroke="#14213d" stroke-width="8"/>
  ${arm === 'opp' ? '<path d="M72 46 L76 8" stroke="#14213d" stroke-width="7"/><path d="M48 46 L42 74" stroke="#14213d" stroke-width="7"/>'
    : '<path d="M72 46 L106 46" stroke="#14213d" stroke-width="7"/><path d="M48 46 L42 74" stroke="#14213d" stroke-width="7"/>'}</g>`;
const PICTS = {
  'politi-opp': () => pict(officer('opp'), 'Politibetjent som holder armen rett opp'),
  'politi-side': () => pict(officer('side'), 'Politibetjent som holder armen rettet ut til siden'),
  medisin: () => pict(`<path d="M20 44 L44 30 H100 L76 44 Z" fill="#dfe6ee" stroke="#6b7177" stroke-width="1.5" stroke-linejoin="round"/><path d="M76 44 L100 30 V84 L76 98 Z" fill="#c9d3de" stroke="#6b7177" stroke-width="1.5" stroke-linejoin="round"/><rect x="20" y="44" width="56" height="54" fill="#fff" stroke="#6b7177" stroke-width="1.5"/><rect x="20" y="52" width="56" height="8" fill="#2a6fc0"/><path d="M27 66 H58 M27 72 H50" stroke="#9aa1a7" stroke-width="3" stroke-linecap="round"/><polygon points="58,74 70,94 46,94" fill="#c8102e"/>`, 'En medisinpakke med en rød varseltrekant på'),
  lskilt: () => pict(`<path d="M22 58 L32 30 H88 L98 58 Z" fill="#5a6f8c"/><path d="M34 34 H86 L93 55 H27 Z" fill="#cfe0ee"/><rect x="14" y="56" width="92" height="38" rx="8" fill="#6c84a6"/><rect x="18" y="62" width="14" height="10" rx="2" fill="#d9472b"/><rect x="88" y="62" width="14" height="10" rx="2" fill="#d9472b"/><rect x="18" y="94" width="16" height="10" rx="3" fill="#2a2f33"/><rect x="86" y="94" width="16" height="10" rx="3" fill="#2a2f33"/><rect x="45" y="62" width="30" height="28" rx="2" fill="#fff" stroke="#2a2f33" stroke-width="1.5"/><path d="M53 66 H59 V82 H68 V87 H53 Z" fill="#c8102e"/>`, 'Bil sett bakfra med L-skilt: rød L på hvit bunn'),
  vinterdekk: () => pict(`<rect x="10" y="22" width="100" height="76" rx="14" fill="#2a2f33"/><path d="M18 84 L38 46 L48 62 L58 40 L70 62 L80 50 L100 84 Z" fill="none" stroke="#f4f4f4" stroke-width="3.5" stroke-linejoin="round"/><g stroke="#f4f4f4" stroke-width="2.6" stroke-linecap="round" transform="translate(59 70)"><path d="M0 -10 V10 M-8.7 -5 L8.7 5 M-8.7 5 L8.7 -5"/></g><text x="60" y="114" text-anchor="middle" font-weight="800" font-size="13" fill="var(--ink, #14181b)">M+S</text>`, 'Merkingen på et vinterdekk: fjell med tre topper og snøkrystall, og M+S', '0 0 120 120'),
  sykkelstativ: () => pict(`<path d="M22 58 L32 30 H88 L98 58 Z" fill="#5a6f8c"/><path d="M34 34 H86 L93 55 H27 Z" fill="#cfe0ee"/><rect x="14" y="56" width="92" height="38" rx="8" fill="#6c84a6"/><rect x="18" y="70" width="14" height="12" rx="2" fill="#d9472b"/><rect x="88" y="70" width="14" height="12" rx="2" fill="#d9472b"/><rect x="45" y="80" width="30" height="9" rx="1.5" fill="#fff" stroke="#2a2f33"/><rect x="10" y="74" width="100" height="5" rx="2" fill="#2a2f33"/>${bicycle(42, 76, .9, '#14181b')}${bicycle(78, 80, .9, '#14181b')}`, 'Bil sett bakfra med to sykler på et sykkelstativ. Syklene dekker baklysene og kjennemerket.'),
  dash: () => svg(`<rect width="220" height="110" rx="18" fill="#15191c"/><circle cx="40" cy="58" r="29" fill="none" stroke="#3a4148" stroke-width="5"/><circle cx="180" cy="58" r="29" fill="none" stroke="#3a4148" stroke-width="5"/><path d="M40 58 L27 41" stroke="#ff6b4a" stroke-width="3" stroke-linecap="round"/><path d="M180 58 L167 41" stroke="#ff6b4a" stroke-width="3" stroke-linecap="round"/>
    ${[['brems', 86, 22], ['olje', 110, 22], ['lading', 134, 22], ['abs', 86, 52], ['motor', 110, 52], ['belte', 134, 52], ['blink', 98, 82], ['fjernlys', 122, 82]].map(([k, x, y]) => `<g transform="translate(${x - 11} ${y - 11}) scale(.22)">${LAMPS[k][2](LAMP[LAMPS[k][0]])}</g>`).join('')}`,
    'Instrumentpanelet med mange varsellamper som lyser samtidig', '0 0 220 110', 'tsvg-dash')
};

/* Lokkene under panseret er merket med symboler (forenklet): motorolje, kjølevæske, bremsevæske og spylervæske */
const capSvg = (sym, label) => pict(`<circle cx="60" cy="60" r="46" fill="#f2c230" stroke="#b58b10" stroke-width="3"/><circle cx="60" cy="60" r="38" fill="none" stroke="#c99a12" stroke-width="2" stroke-dasharray="3 5"/><g fill="none" stroke="#14181b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${sym}</g>`, label);
const CAPS = {
  olje: () => capSvg(`<path d="M30 58 H64 L78 48 L82 52 L68 72 H30 Z" fill="#14181b"/><path d="M40 58 V52 H52 V58"/><path d="M86 60 Q83 66 86 69 Q89 66 86 60 Z" fill="#14181b" stroke-width="2"/>`, 'Lokket for motorolje er merket med en oljekanne'),
  kjole: () => capSvg(`<path d="M60 26 V60"/><circle cx="60" cy="66" r="7" fill="#14181b"/><path d="M62 34 H70 M62 44 H70"/><path d="M30 84 Q37 78 44 84 T58 84 T72 84 T86 84"/>`, 'Lokket for kjølevæske er merket med et termometer i væske'),
  brems: () => capSvg(`<circle cx="60" cy="60" r="15"/><path d="M38 42 A26 26 0 0 0 38 78 M82 42 A26 26 0 0 1 82 78"/>`, 'Lokket for bremsevæske er merket med bremsesymbolet'),
  spyler: () => capSvg(`<path d="M26 80 Q60 30 94 80 Z"/><path d="M60 80 V70"/><path d="M60 70 Q52 58 44 56 M60 70 Q60 56 60 50 M60 70 Q68 58 76 56" stroke-width="3.5" stroke-dasharray="2 5"/>`, 'Lokket for spylervæske er merket med en frontrute med spylerstråle')
};

/* Forklaringstegninger, vises etter svaret. Følger lys og mørk modus (tekst i appens farger). */
const DT = 'font-size="10" fill="var(--ink, #14181b)"', DM = 'font-size="9" fill="var(--muted, #4b586b)"';
const diagram = (body, label, vb) => svg(defs + body, label, vb, 'tsvg-diagram');   // defs: pilspissene til arrow()
const sideCar = (x, y, fill) => `<g transform="translate(${x} ${y}) rotate(90)">${car(0, 0, fill)}</g>`;
const strip = (y, h = 22) => `<rect x="0" y="${y}" width="240" height="${h}" rx="4" fill="${ASP}"/>`;   // ett felt, bilen midt i
const bracket = (x0, x1, y, text, up = true, col = 'var(--ink, #14181b)') => `<path d="M${x0} ${y + (up ? 5 : -5)} V${y} H${x1} V${y + (up ? 5 : -5)}" fill="none" stroke="${col}" stroke-width="1.4"/><text x="${(x0 + x1) / 2}" y="${y + (up ? -4 : 12)}" text-anchor="middle" ${DT} font-weight="700">${text}</text>`;
const secondsDiagram = (v, t) => {
  const mps = v / 3.6, px = 168 / (mps * 2);   // to sekunder fyller bredden
  const x0 = 46, segs = Array.from({ length: t }, (_, i) => [x0 + i * mps * px, x0 + (i + 1) * mps * px]);
  return diagram(`${strip(46)}${sideCar(30, 57, '#2e7dd1')}
    ${segs.map(([a, b], i) => `${bracket(a, b, 38, `${i + 1}. sekund`)}<line x1="${b}" y1="44" x2="${b}" y2="70" stroke="var(--muted, #4b586b)" stroke-width="1" stroke-dasharray="2 2"/>`).join('')}
    ${bracket(x0, segs[segs.length - 1][1], 82, `${v} km/t: rundt ${t === 1 ? Math.round(mps) : Math.round(mps * t / 5) * 5} meter`, false)}`,
    `I ${v} km/t kjører du rundt ${Math.round(mps)} meter i sekundet${t > 1 ? `, og rundt ${Math.round(mps * t / 5) * 5} meter på ${t} sekunder` : ''}.`, '0 0 240 100');
};
const DIAGRAMS = {
  stopp: () => diagram(`${strip(40)}${sideCar(26, 51, '#2e7dd1')}
    <rect x="40" y="70" width="78" height="6" rx="2" fill="var(--muted, #4b586b)" opacity=".55"/><rect x="118" y="70" width="104" height="6" rx="2" fill="var(--brake, #c0392b)"/>
    ${bracket(40, 118, 32, 'Reaksjonslengde')}${bracket(118, 222, 32, 'Bremselengde')}${bracket(40, 222, 90, 'Stopplengde', false)}`,
    'Stopplengden er reaksjonslengden pluss bremselengden.', '0 0 240 108'),
  dobbel: () => {
    const row = (y, label, r, b, rTxt, bTxt) => `<text x="0" y="${y + 9}" ${DT} font-weight="700">${label}</text>
      <rect x="62" y="${y}" width="${r}" height="12" rx="2" fill="var(--muted, #4b586b)" opacity=".55"/><rect x="${62 + r}" y="${y}" width="${b}" height="12" rx="2" fill="var(--brake, #c0392b)"/>
      ${rTxt ? `<text x="${62 + r / 2}" y="${y - 4}" text-anchor="middle" ${DM}>${rTxt}</text><text x="${62 + r + b / 2}" y="${y - 4}" text-anchor="middle" ${DM}>${bTxt}</text>` : ''}`;
    return diagram(`${row(18, '50 km/t', 22, 19)}${row(58, '100 km/t', 44, 76, 'reaksjon × 2', 'bremsing × 4')}
      <rect x="62" y="88" width="10" height="8" rx="2" fill="var(--muted, #4b586b)" opacity=".55"/><text x="76" y="95" ${DM}>Reaksjonslengde</text><rect x="152" y="88" width="10" height="8" rx="2" fill="var(--brake, #c0392b)"/><text x="166" y="95" ${DM}>Bremselengde</text>`,
      'Dobbel fart: reaksjonslengden blir dobbelt så lang, og bremselengden omtrent fire ganger så lang.', '0 0 240 104');
  },
  tidsavstand: () => diagram(`${strip(40)}<line x1="150" y1="18" x2="150" y2="40" stroke="var(--ink, #14181b)" stroke-width="2"/><rect x="143" y="8" width="14" height="12" rx="2" fill="#2a6fc0"/>
    ${sideCar(172, 51, '#d9472b')}${sideCar(64, 51, '#2e7dd1')}
    <text x="64" y="84" text-anchor="middle" ${DM}>Du</text><text x="172" y="84" text-anchor="middle" ${DM}>Bilen foran</text>
    <text x="120" y="98" text-anchor="middle" ${DT} font-weight="700">Tell sekundene mellom bilen foran og deg</text>`,
    'Velg et fast punkt, som en stolpe. Tell sekunder fra bilen foran passerer punktet til du gjør det.', '0 0 240 106'),
  blindsone: () => diagram(`<rect width="200" height="200" rx="12" fill="${ASP}"/>${wdash(40)}${wdash(160)}
    <polygon points="100,86 74,200 126,200" fill="#4a9dff" opacity=".28"/><polygon points="70,92 34,200 58,200" fill="#4a9dff" opacity=".35"/><polygon points="130,92 142,200 166,200" fill="#4a9dff" opacity=".35"/>
    <polygon points="70,104 10,118 10,170 46,170" fill="#ff453a" opacity=".45"/><polygon points="130,104 190,118 190,170 154,170" fill="#ff453a" opacity=".45"/>
    <g transform="translate(100 96) scale(2.4)">${car(0, 0, '#2e7dd1')}</g>
    <text x="14" y="150" font-size="10" font-weight="700" fill="#fff">Blindsone</text><text x="186" y="150" text-anchor="end" font-size="10" font-weight="700" fill="#fff">Blindsone</text>
    <text x="100" y="192" text-anchor="middle" font-size="9" fill="#fff">Blått: det speilene viser</text>`,
    'Bilen sett ovenfra. Blått er det speilene viser. Rødt er blindsonene skrått bak på hver side, som du bare ser med skulderblikk.', '0 0 200 200'),
  astolpe: () => diagram(`<rect width="200" height="150" rx="12" fill="${ASP}"/>${zebra(20, 30, 70, 20, false)}
    <polygon points="80,121 86,117 45,0 -32,0" fill="#000" opacity=".35"/>
    ${person(38, 44)}
    <g transform="translate(100 140) scale(2.6)">${car(0, 0, '#2e7dd1')}</g>
    <path d="M80 121 L86 117" stroke="#14181b" stroke-width="4.5" stroke-linecap="round"/><circle cx="92" cy="134" r="3.2" fill="#ffd34d" stroke="#14181b"/>
    <text x="192" y="20" text-anchor="end" font-size="10" font-weight="700" fill="#fff">Skjult bak</text><text x="192" y="32" text-anchor="end" font-size="10" font-weight="700" fill="#fff">frontstolpen</text>`,
    'Frontstolpen ved siden av frontruta skygger for et område foran til venstre. Der kan en fotgjenger være skjult, særlig når du svinger.', '0 0 200 150'),
  '5m-kryss': () => diagram(`<rect width="200" height="200" rx="12" fill="${GRASS}"/><rect x="76" y="0" width="48" height="200" fill="${ASP}"/><rect x="124" y="30" width="76" height="44" fill="${ASP}"/>
    <path d="M124 74 Q124 74 124 74" /><rect x="124" y="74" width="76" height="126" fill="${GRASS}"/><path d="M124 92 Q124 74 142 74 H124 Z" fill="${ASP}"/>${vLine(0, 200)}
    <rect x="102" y="92" width="20" height="36" fill="var(--brake, #c0392b)" opacity=".5"/><circle cx="124" cy="92" r="3.2" fill="#ffd34d" stroke="#14181b"/>
    <path d="M136 92 V128" stroke="#14181b" stroke-width="1.4"/><path d="M132 92 H140 M132 128 H140" stroke="#14181b" stroke-width="1.4"/><text x="144" y="114" font-size="11" font-weight="800" fill="#14181b">5 m</text>
    ${car(112, 156, '#8a9097')}<text x="132" y="146" font-size="9" fill="#14181b">Gul prikk: her</text><text x="132" y="157" font-size="9" fill="#14181b">begynner kanten</text><text x="132" y="168" font-size="9" fill="#14181b">å runde</text>`,
    'Du kan ikke stanse i krysset eller nærmere enn 5 meter fra det. De 5 meterne regnes fra der fortauskanten eller vegkanten begynner å runde.', '0 0 200 200'),
  '5m-gangfelt': () => diagram(`<rect width="200" height="200" rx="12" fill="${GRASS}"/><rect x="76" y="0" width="48" height="200" fill="${ASP}"/>${vLine(0, 200)}${zebra(78, 62, 44, 22, false)}
    <rect x="102" y="84" width="20" height="36" fill="var(--brake, #c0392b)" opacity=".5"/><rect x="77" y="61" width="46" height="24" fill="none" stroke="var(--brake, #c0392b)" stroke-width="2"/>
    <path d="M136 84 V120" stroke="#14181b" stroke-width="1.4"/><path d="M132 84 H140 M132 120 H140" stroke="#14181b" stroke-width="1.4"/><text x="144" y="106" font-size="11" font-weight="800" fill="#14181b">5 m</text>
    ${car(112, 150, '#8a9097')}`,
    'Du kan ikke stanse på gangfeltet eller nærmere enn 5 meter foran det.', '0 0 200 200'),
  trekant: () => diagram(`${strip(40)}${sideCar(214, 51, '#2e7dd1')}<circle cx="200" cy="44" r="2.4" fill="#ffb300" class="tsvg-blink"/><circle cx="200" cy="58" r="2.4" fill="#ffb300" class="tsvg-blink"/>
    <polygon points="40,36 50,54 30,54" fill="#fff" stroke="#c8102e" stroke-width="3" stroke-linejoin="round"/>
    ${bracket(40, 200, 84, 'om mulig minst 150 m', false)}${arrow('M2 51 H22', '#111')}`,
    'Varseltrekanten settes så langt bak bilen at andre ser den i tide, om mulig minst 150 meter.', '0 0 240 100'),
  nodnummer: () => diagram([['110', 'Brann', '#d9472b'], ['112', 'Politi', '#1d5fa6'], ['113', 'Ambulanse', '#1e7442']].map(([n, t, c], i) => `<g transform="translate(${4 + i * 80} 6)"><rect width="72" height="60" rx="10" fill="${c}"/><text x="36" y="30" text-anchor="middle" font-size="22" font-weight="800" fill="#fff">${n}</text><text x="36" y="50" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${t}</text></g>`).join(''),
    '110 er brann, 112 er politi, og 113 er medisinsk nødhjelp (ambulanse).', '0 0 240 72'),
  monster: () => diagram(`<path d="M10 30 H230 V70 H10 Z" fill="#2a2f33"/>${[44, 100, 156, 212].map(x => `<rect x="${x - 9}" y="30" width="18" height="18" fill="var(--bg, #eef2f8)"/>`).join('')}
    <rect x="96" y="12" width="8" height="34" fill="#9aa1a7"/><rect x="88" y="8" width="24" height="6" rx="2" fill="#6b7177"/>
    <text x="10" y="90" ${DT} font-weight="700">Sommer: minst 1,6 mm</text><text x="230" y="90" text-anchor="end" ${DT} font-weight="700">Vinter: minst 3 mm</text>
    <text x="120" y="106" text-anchor="middle" ${DM}>Mål i hovedrillene på personbil</text>`,
    'Mønsterdybden måles i hovedrillene. En personbil skal ha minst 1,6 mm om sommeren og 3 mm om vinteren.', '0 0 240 112'),
  gaende: () => diagram(`<rect width="200" height="150" rx="12" fill="${GRASS}"/><rect x="60" y="0" width="80" height="150" fill="${ASP}"/>${vLine(0, 150)}
    ${person(64, 96)}${arrow('M64 78 V52', '#111')}
    ${car(86, 34, '#d9472b', '', 180)}${arrow('M86 52 V70', '#d9472b')}
    <text x="146" y="84" font-size="10" font-weight="700" fill="#14181b">Gå mot</text><text x="146" y="96" font-size="10" font-weight="700" fill="#14181b">trafikken</text>`,
    'Uten fortau går gående ytterst til venstre, så de møter bilene og ser dem komme.', '0 0 200 150')
};
DIAGRAMS['sekund-80-1'] = () => secondsDiagram(80, 1);
DIAGRAMS['sekund-80-2'] = () => secondsDiagram(80, 2);

/* Nye oppmerkinger (0.20.0) */
Object.assign(LINES, {
  sperreomrade: () => road(`<clipPath id="csperr"><polygon points="60,22 70,48 70,112 60,138 50,112 50,48"/></clipPath><g clip-path="url(#csperr)" stroke="${YEL}" stroke-width="3">${Array.from({ length: 14 }, (_, i) => `<line x1="40" y1="${10 + i * 11}" x2="80" y2="${30 + i * 11}"/>`).join('')}</g><polygon points="60,22 70,48 70,112 60,138 50,112 50,48" fill="none" stroke="${YEL}" stroke-width="2.6" stroke-linejoin="round"/><line x1="60" y1="0" x2="60" y2="22" stroke="${YEL}" stroke-width="3" stroke-dasharray="10 12"/><line x1="60" y1="138" x2="60" y2="160" stroke="${YEL}" stroke-width="3" stroke-dasharray="10 12"/>${car(82, 128, '#2e7dd1')}`, 'Vei med et sperreområde midt i veien: skrå gule striper med heltrukken gul kant rundt.'),
  pil: () => road(`<line x1="60" y1="0" x2="60" y2="160" stroke="#f4f4f4" stroke-width="2.4"/>
    <path d="M37 98 V70 H32 L40 58 L48 70 H43 V98 Z" fill="#f4f4f4"/><path d="M77 98 V74 Q77 66 85 66 H86 V61 L95 69 L86 77 V72 H85 Q83 72 83 74 V98 Z" fill="#f4f4f4"/>
    ${car(40, 132, '#2e7dd1')}`, 'To felt i samme retning før et kryss. Du er i venstre felt, der det er malt en pil rett fram. En heltrukken hvit linje skiller det fra feltet til høyre, som har pil til høyre.')
});

/* ==================== Bilen (0.28.1): deler sensor kan spørre om i sikkerhetskontrollen ====================
   Hver tegning står på en egen flis med faste farger: mørk som motorrommet og dashbordet, ellers lys. Da ser den lik ut
   i lys og mørk modus. Skjermleserteksten sier hva du ser, ikke hva som er riktig; 'bil:<navn>:anon' gir en nøytral tekst. */
const BAY = '#2b3138', TILE = '#e8eef7', METAL = '#c9ced3', BODY = '#6c84a6', BODY2 = '#5a6f8c', GLASS = '#cfe0ee', INK = '#14181b', W2 = '#e9eef6';
const tileBg = (fill = TILE) => `<rect width="120" height="120" rx="18" fill="${fill}"/>`;
const clipTile = (id, body, fill = TILE) => `<clipPath id="${id}"><rect width="120" height="120" rx="18"/></clipPath><g clip-path="url(#${id})"><rect width="120" height="120" fill="${fill}"/>${body}</g>`;
/* Vifte fra (cx, cy), vinkler i grader med 0 = opp og med klokka */
const sector = (cx, cy, r, a0, a1) => { const P = a => `${(cx + r * Math.sin(a * Math.PI / 180)).toFixed(1)} ${(cy - r * Math.cos(a * Math.PI / 180)).toFixed(1)}`; return `M${cx} ${cy} L${P(a0)} A${r} ${r} 0 0 1 ${P(a1)} Z`; };
/* Gjennomsiktig beholder med væske og merkene MAX og MIN til høyre */
const tank = (id, x, y, w, h, rx, lvl, fluid, maxY, minY, wall = '#ebe8de') => `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${wall}" stroke="#b9b5a6" stroke-width="1.5"/><g clip-path="url(#${id})"><rect x="${x}" y="${lvl}" width="${w}" height="${h}" fill="${fluid}" opacity=".85"/><line x1="${x}" y1="${lvl}" x2="${x + w}" y2="${lvl}" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/></g>${[[maxY, 'MAX'], [minY, 'MIN']].map(([yy, t]) => `<line x1="${x + w - 22}" y1="${yy}" x2="${x + w - 5}" y2="${yy}" stroke="${INK}" stroke-width="2"/>${tx(x + w - 34, yy, t, 8, INK)}`).join('')}`;
const numBadge = (x, y, n) => `<circle cx="${x}" cy="${y}" r="7" fill="${YEL}" stroke="${INK}" stroke-width="1"/>${tx(x, y + 0.5, n, 9, INK)}`;
/* Liten person til dekktrykkmerket */
const miniPerson = (x, y) => `<circle cx="${x}" cy="${y - 3}" r="2" fill="${INK}"/><path d="M${x - 3} ${y + 4} Q${x} ${y - 1.5} ${x + 3} ${y + 4} Z" fill="${INK}"/>`;
const BIL = {
  peilepinne: () => pict(`${tileBg(BAY)}<circle cx="19" cy="24" r="8" fill="none" stroke="#f2c230" stroke-width="4"/><rect x="26" y="21" width="9" height="6" rx="2" fill="#f2c230"/>
    <rect x="34" y="22.6" width="72" height="2.8" rx="1.4" fill="${METAL}"/><rect x="94" y="22.6" width="12" height="2.8" rx="1.4" fill="#b07a1a"/>
    <path d="M100 29 L87 42" stroke="#9aa1a7" stroke-width="1.4" stroke-dasharray="3 3"/>
    <clipPath id="cpeil"><circle cx="60" cy="76" r="35"/></clipPath><circle cx="60" cy="76" r="36" fill="#1c2126" stroke="#9aa1a7" stroke-width="2"/>
    <g clip-path="url(#cpeil)"><path d="M14 68 H82 Q90 68 90 76 Q90 84 82 84 H14 Z" fill="${METAL}"/>
      <g stroke="#7c848c" stroke-width="1.2">${[44, 50, 56, 62, 68].map(x => `<line x1="${x}" y1="68" x2="${x + 6}" y2="84"/>`).join('')}</g>
      <path d="M58 68 H82 Q90 68 90 76 Q90 84 82 84 H58 Z" fill="#b07a1a" opacity=".9"/>
      <rect x="39.5" y="64" width="3" height="24" fill="${INK}"/><rect x="72.5" y="64" width="3" height="24" fill="${INK}"/></g>
    ${tx(43, 58, 'MAX', 8.5, WH)}${tx(74, 58, 'MIN', 8.5, WH)}`, 'Peilepinnen for motorolje. Nederst på pinnen, vist forstørret, er merkene MAX og MIN.'),
  kjolevaeske: () => pict(`${tileBg(BAY)}<path d="M30 92 Q14 96 8 116" stroke="#15191c" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M92 46 Q108 46 112 28" stroke="#15191c" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${tank('ckjol', 28, 34, 64, 66, 10, 64, '#e0609a', 52, 82)}
    <rect x="49" y="25" width="22" height="10" fill="#ebe8de"/><rect x="42" y="12" width="36" height="15" rx="4" fill="#1f2328"/><path d="M48 14 V25 M54 14 V25 M60 14 V25 M66 14 V25 M72 14 V25" stroke="#3a4148" stroke-width="2"/>`,
    'Ekspansjonstanken for kjølevæske med svart lokk. På siden av tanken er merkene MAX og MIN.'),
  bremsevaeske: () => pict(`${tileBg(BAY)}<rect x="20" y="94" width="80" height="14" rx="4" fill="#8a9097"/><path d="M34 108 V120 M86 108 V120" stroke="#b9895a" stroke-width="3"/>
    ${tank('cbrem', 32, 46, 56, 48, 7, 68, '#e3b341', 58, 82, '#efeadb')}
    <rect x="50" y="38" width="20" height="9" fill="#efeadb"/><rect x="38" y="22" width="44" height="18" rx="6" fill="#f2c230"/>
    <g fill="none" stroke="${INK}" stroke-width="2"><circle cx="60" cy="31" r="4.5"/><path d="M53 26.5 A8 8 0 0 0 53 35.5 M67 26.5 A8 8 0 0 1 67 35.5"/></g>`,
    'Beholderen for bremsevæske med gult lokk og bremsesymbolet. På siden er merkene MAX og MIN.'),
  dybdemaler: () => pict(clipTile('cdyb', `<rect x="0" y="88" width="120" height="32" fill="#2a2f33"/><g fill="#2a2f33"><rect x="0" y="70" width="36" height="19"/><rect x="50" y="70" width="26" height="19"/><rect x="90" y="70" width="30" height="19"/></g>
    <rect x="22" y="64" width="42" height="6" rx="1.5" fill="#8a9097"/><rect x="41.8" y="70" width="2.4" height="17.5" fill="#6b7177"/>
    <rect x="31" y="9" width="24" height="55" rx="3" fill="#e3e7ec" stroke="#6b7177" stroke-width="1.2"/>
    <g stroke="${INK}" stroke-width="1">${Array.from({ length: 11 }, (_, i) => `<line x1="31" y1="${(58 - i * 3.6).toFixed(1)}" x2="${i % 5 ? 36 : 40}" y2="${(58 - i * 3.6).toFixed(1)}"/>`).join('')}</g>
    ${tx(47, 58, '0', 7, INK)}${tx(47, 40, '5', 7, INK)}${tx(48, 22, '10', 7, INK)}${tx(43, 14, 'mm', 6.5, INK)}<rect x="31" y="39" width="12" height="2" fill="${RED}"/>`),
    'Mønsterdybdemåler satt ned i en rille i dekket, med skala i millimeter'),
  lufttrykk: () => pict(clipTile('cluft', `<rect x="18" y="0" width="102" height="120" fill="#9fb0c3"/><rect x="0" y="0" width="20" height="120" fill="#2a2f33"/><rect x="18" y="0" width="5" height="120" fill="#3a4148"/><rect x="100" y="86" width="10" height="16" rx="2" fill="#6b7177"/>
    <rect x="30" y="14" width="70" height="82" rx="4" fill="#fff" stroke="#6b7177" stroke-width="1"/>
    ${tx(65, 23, 'Dekktrykk', 8.5, INK)}${tx(65, 31.5, '205/55 R16', 6, '#4b586b')}
    <path d="M33 36 H97 M33 46 H97 M33 62 H97 M33 78 H97 M58 36 V78" stroke="#c4cad1" stroke-width="1"/>
    ${tx(71, 41, 'Foran', 6.5, INK)}${tx(89, 41, 'Bak', 6.5, INK)}
    ${miniPerson(42, 54)}${miniPerson(49, 54)}${miniPerson(38, 70)}${miniPerson(44, 70)}${miniPerson(50, 70)}<rect x="53" y="66" width="4" height="7" rx="1" fill="${INK}"/>
    ${tx(71, 54, '2,3', 8, INK)}${tx(89, 54, '2,3', 8, INK)}${tx(71, 70, '2,5', 8, INK)}${tx(89, 70, '2,9', 8, INK)}${tx(65, 87, 'bar, kalde dekk', 6.5, '#4b586b')}`),
    'Et merke i dørkarmen med en tabell over lufttrykket i dekkene foran og bak, med lite og mye last'),
  lysbryter: () => {
    const cx = 50, cy = 68, pos = (a, r = 37) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
    const park = ([x, y]) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" fill="none" stroke="${W2}" stroke-width="1.6" stroke-linecap="round"><path d="M-2.5 -5 A5 5 0 0 0 -2.5 5 Z M2.5 -5 A5 5 0 0 1 2.5 5 Z"/><path d="M-8 -4.5 L-11 -6 M-8.5 0 H-12 M-8 4.5 L-11 6 M8 -4.5 L11 -6 M8.5 0 H12 M8 4.5 L11 6"/></g>`;
    const sym = (k, [x, y], s) => `<g transform="translate(${(x - 50 * s).toFixed(1)} ${(y - 50 * s).toFixed(1)}) scale(${s})">${LAMPS[k][2](W2)}</g>`;
    const A = [-70, -24, 22, 66], [p0, pA, pP, pN] = A.map(a => pos(a));
    return pict(`${tileBg(BAY)}${A.map(a => { const [x, y] = pos(a, 27.5); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${W2}"/>`; }).join('')}
      ${tx(p0[0], p0[1], '0', 10, W2)}${tx(pA[0], pA[1], 'AUTO', 8, W2)}${park(pP)}${sym('naerlys', pN, .22)}
      <circle cx="${cx}" cy="${cy}" r="23" fill="#3a4148"/><circle cx="${cx}" cy="${cy}" r="19" fill="#20252b"/>
      <g transform="translate(${cx} ${cy}) rotate(-24)"><rect x="-5.5" y="-19" width="11" height="38" rx="5.5" fill="#4a525a"/><circle cx="0" cy="-13" r="2" fill="${W2}"/></g>
      <rect x="84" y="86" width="28" height="22" rx="5" fill="#3a4148"/>${sym('takebak', [98, 97], .2)}`,
      'En dreiebryter for lys i dashbordet med fire stillinger, og en knapp ved siden av');
  },
  nodblink: () => pict(`${tileBg(BAY)}<rect x="8" y="46" width="104" height="28" rx="6" fill="#20252b"/>
    <rect x="24" y="28" width="72" height="64" rx="14" fill="#111417" stroke="#4a525a" stroke-width="2"/><rect x="29" y="33" width="62" height="54" rx="11" fill="#2a2f35"/>
    <polygon points="60,43 82,80 38,80" fill="none" stroke="#ff453a" stroke-width="6" stroke-linejoin="round"/><polygon points="60,57 70,74 50,74" fill="none" stroke="#ff453a" stroke-width="3" stroke-linejoin="round"/>`,
    'En knapp med en rød trekant midt i dashbordet'),
  viskere: () => {
    const glass = 'M17 80 L32 18 Q60 12 88 18 L103 80 Z', arm = (px, a, L = 40) => {
      const t = f => [px + f * L * Math.sin(a * Math.PI / 180), 86 - f * L * Math.cos(a * Math.PI / 180)].map(v => v.toFixed(1));
      const [x0, y0] = t(0.3), [x1, y1] = t(1);
      return `<line x1="${px}" y1="86" x2="${x1}" y2="${y1}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
    };
    const drops = [[38, 26], [46, 22], [56, 27], [64, 21], [74, 26], [84, 23], [92, 34], [96, 46], [30, 33], [52, 36], [80, 36], [98, 62], [70, 31]];
    return pict(clipTile('cvisk', `<rect width="120" height="120" fill="#dbe5ef"/><path d="M0 98 L14 80 H106 L120 98 V120 H0 Z" fill="${BODY}"/>
      <clipPath id="cglas"><path d="${glass}"/></clipPath><path d="${glass}" fill="${GLASS}"/>
      <g clip-path="url(#cglas)"><g fill="#fff" opacity=".55"><path d="${sector(46, 86, 42, -70, 22)}"/><path d="${sector(84, 86, 42, -70, 22)}"/></g>
        <g fill="#7fa3c6">${drops.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.4" ry="2"/>`).join('')}</g></g>
      <path d="${glass}" fill="none" stroke="#4a5d78" stroke-width="3" stroke-linejoin="round"/><rect x="14" y="80" width="92" height="7" fill="#2a2f33"/>
      ${arm(46, -25)}${arm(84, -25)}`), 'Frontruta sett utenfra, med to vindusviskere');
  },
  belte: () => pict(clipTile('cbelt', `<path d="M-6 -8 L52 50" stroke="#4b5560" stroke-width="13"/><path d="M-6 -8 L52 50" stroke="#6a7682" stroke-width="1.2" stroke-dasharray="3 3"/>
    <g transform="translate(54 52) rotate(-45)"><rect x="-10" y="-7" width="20" height="11" rx="3" fill="#3a4148"/><path d="M-7 3 H7 V18 Q7 22 3 22 H-3 Q-7 22 -7 18 Z" fill="${METAL}" stroke="#8a9097" stroke-width="1"/><rect x="-3" y="11" width="6" height="5" rx="1" fill="${TILE}"/></g>
    <g transform="translate(86 84) rotate(-45)"><rect x="-5" y="22" width="10" height="30" fill="#4b5560"/><rect x="-12" y="-4" width="24" height="32" rx="6" fill="#1f2328"/><rect x="-8" y="-3" width="16" height="4" rx="1" fill="#000"/><rect x="-7" y="6" width="14" height="9" rx="2" fill="#d9472b"/></g>
    ${arrowTo(52, 80, 66, 94, 3, '#2e7dd1')}`), 'Et bilbelte: låsetungen på beltet og beltelåsen den festes i'),
  'ratt-slark': () => pict(`${tileBg()}<g transform="translate(60 68)">
    <circle r="38" fill="none" stroke="#2a2f33" stroke-width="9"/><path d="M-34 4 H-14 M14 4 H34 M0 16 V34" stroke="#2a2f33" stroke-width="8"/>
    <rect x="-16" y="-12" width="32" height="28" rx="9" fill="#3a4148"/><rect x="-2" y="-43" width="4" height="9" rx="1" fill="#f2c230"/>
    ${curveArrow('M0 -50 A50 50 0 0 0 -20.3 -45.7', -20.3, -45.7, -114, 3, '#d9472b')}${curveArrow('M0 -50 A50 50 0 0 1 20.3 -45.7', 20.3, -45.7, 114, 3, '#d9472b')}</g>`,
    'Et ratt med små piler øverst som viser en liten bevegelse fram og tilbake'),
  panser: () => pict(`${tileBg()}<rect x="6" y="6" width="108" height="51" rx="10" fill="#2b3138"/><path d="M6 47 H114" stroke="#3a4148" stroke-width="2"/>
    <g transform="translate(54 30) rotate(-8)"><rect x="-27" y="-10" width="54" height="20" rx="10" fill="#9aa1a7"/>
      <g fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><path d="M-12 5 V1 L-7 -2 H3 L6 1 H12 V5 Z"/><path d="M6 1 L13 -7"/></g></g>
    ${curveArrow('M86 22 Q94 30 88 41', 88, 41, -149, 2.4, YEL)}${numBadge(16, 16, 1)}
    <clipPath id="cpan"><rect x="6" y="62" width="108" height="52" rx="10"/></clipPath><g clip-path="url(#cpan)"><rect x="6" y="62" width="108" height="52" fill="#dbe5ef"/>
      <path d="M2 84 L18 68 H102 L118 84 Z" fill="${BODY}"/><rect x="2" y="84" width="116" height="7" fill="#15191c"/><rect x="57" y="84" width="10" height="5" rx="1" fill="${METAL}"/>
      <rect x="2" y="91" width="116" height="24" fill="${BODY2}"/><rect x="34" y="94" width="52" height="16" rx="4" fill="#2a2f33"/><path d="M38 99 H82 M38 104 H82" stroke="#3a4148" stroke-width="2"/>
      <path d="M10 94 H30 L28 101 H12 Z M110 94 H90 L92 101 H108 Z" fill="#eef3f8"/></g>
    <circle cx="62" cy="86.5" r="8.5" fill="none" stroke="${YEL}" stroke-width="2.4" stroke-dasharray="4 3"/>${numBadge(16, 72, 2)}`,
    'Øverst et håndtak inne i bilen med symbol av en bil med åpent panser. Nederst fronten på bilen med panseret litt åpent og en liten sperre under kanten.'),
  lader: () => pict(clipTile('clad', `<path d="M0 100 Q60 92 120 100" stroke="${BODY2}" stroke-width="2" fill="none"/>
    <rect x="16" y="24" width="56" height="56" rx="13" fill="#1f2328"/><path d="M6 22 Q0 52 6 82 L16 80 V24 Z" fill="${BODY2}"/>
    <path d="M28 40 H60 A20 20 0 1 1 28 40 Z" fill="#2f353b" stroke="#4a525a" stroke-width="2"/>
    <g fill="#15191c" stroke="#9aa1a7" stroke-width="1.4">${[[39, 44, 2.2], [49, 44, 2.2], [34, 53, 3.4], [44, 53, 3.4], [54, 53, 3.4], [39, 62, 3.4], [49, 62, 3.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
    <g transform="translate(86 84) rotate(35)"><path d="M24 0 Q42 0 52 18" stroke="#1f2328" stroke-width="7" fill="none"/><rect x="-10" y="-12" width="36" height="24" rx="8" fill="#2a2f35"/><rect x="-15" y="-10" width="7" height="20" rx="2" fill="#3a4148"/><rect x="-2" y="-12" width="5" height="24" fill="#3a4148"/></g>`, BODY),
    'Ladeluken på en elbil står åpen og viser ladekontakten. En ladeplugg av type 2 er på vei inn.'),
  'kamera-radar': () => pict(clipTile('ckam', `<path d="M4 120 V70 Q4 56 18 54 H102 Q116 56 116 70 V120 Z" fill="${BODY}"/>
    <path d="M22 56 L34 16 Q60 11 86 16 L98 56 Z" fill="${GLASS}" stroke="#4a5d78" stroke-width="3" stroke-linejoin="round"/>
    <rect x="58.5" y="15" width="3" height="8" fill="#2a2f33"/><rect x="47" y="22" width="26" height="9" rx="3" fill="#2a2f33"/>
    <rect x="52" y="13" width="16" height="11" rx="2.5" fill="${INK}"/><circle cx="60" cy="18.5" r="3" fill="#4a9dff"/><circle cx="60" cy="18.5" r="1.2" fill="#dbe9f5"/>
    <path d="M30 54 L56 47 M64 54 L90 47" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <path d="M10 66 H34 L30 76 H13 Z M110 66 H86 L90 76 H107 Z" fill="#eef3f8"/>
    <rect x="34" y="72" width="52" height="26" rx="6" fill="#2a2f33"/><path d="M38 78 H82 M38 85 H82 M38 92 H82" stroke="#3a4148" stroke-width="2"/>
    <rect x="52" y="78" width="16" height="14" rx="3" fill="#8a9097" stroke="${METAL}" stroke-width="1.2"/>
    <g fill="none" stroke="${YEL}" stroke-width="2" stroke-linecap="round"><path d="M46 78 Q42 85 46 92 M74 78 Q78 85 74 92 M40 74 Q34 85 40 96 M80 74 Q86 85 80 96 M47 13 Q44 18.5 47 24 M73 13 Q76 18.5 73 24"/></g>
    <rect x="6" y="100" width="108" height="10" rx="4" fill="${BODY2}"/>`, '#dbe5ef'),
    'Fronten på en bil: et kamera øverst på frontruta ved innerspeilet, og en radar midt i grillen'),
  bremselys: () => pict(clipTile('cbl', `<rect y="104" width="120" height="16" fill="#9aa1a7"/>
    <path d="M22 58 L32 30 H88 L98 58 Z" fill="${BODY2}"/><path d="M34 37 H86 L93 55 H27 Z" fill="${GLASS}"/>
    <rect x="14" y="56" width="92" height="38" rx="8" fill="${BODY}"/><rect x="18" y="94" width="16" height="10" rx="3" fill="#2a2f33"/><rect x="86" y="94" width="16" height="10" rx="3" fill="#2a2f33"/>
    <rect x="45" y="76" width="30" height="10" rx="1.5" fill="#fff" stroke="#2a2f33"/>
    <g fill="#ff3b30" opacity=".35"><ellipse cx="25" cy="66" rx="16" ry="11"/><ellipse cx="95" cy="66" rx="16" ry="11"/><ellipse cx="60" cy="33" rx="22" ry="6"/></g>
    <g fill="#ff3b30"><rect x="16" y="61" width="19" height="10" rx="2.5"/><rect x="85" y="61" width="19" height="10" rx="2.5"/><rect x="47" y="31" width="26" height="4" rx="2"/></g>
    <g fill="#ffd2cc" opacity=".8"><rect x="19" y="63" width="8" height="2.5" rx="1"/><rect x="88" y="63" width="8" height="2.5" rx="1"/></g>`, '#dfe6ee'),
    'Bil sett bakfra der bremselysene lyser: ett på hver side og ett høyt oppe midt bak'),
  'hjul-skade': () => {
    const at = (r, i, n) => { const a = i * 2 * Math.PI / n; return [(58 + r * Math.sin(a)).toFixed(1), (62 - r * Math.cos(a)).toFixed(1)]; };
    const notches = Array.from({ length: 30 }, (_, i) => { const [x1, y1] = at(43.5, i, 30), [x2, y2] = at(48, i, 30); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }).join('');
    return pict(`${tileBg()}<defs><radialGradient id="gbule" cx=".38" cy=".38" r=".7"><stop offset="0" stop-color="#7a828b"/><stop offset=".55" stop-color="#3f464e"/><stop offset="1" stop-color="#23282d"/></radialGradient></defs>
      <circle cx="58" cy="62" r="48" fill="#2a2f33"/><g stroke="#16191c" stroke-width="2">${notches}</g><circle cx="58" cy="62" r="37" fill="none" stroke="#3a4148" stroke-width="1.2"/>
      <g transform="translate(58 62)"><circle r="27" fill="#aeb5bc"/><circle r="25" fill="#5a626b"/><g fill="${METAL}">${Array.from({ length: 5 }, (_, i) => `<rect x="-3.5" y="-25" width="7" height="18" rx="2" transform="rotate(${i * 72})"/>`).join('')}</g><circle r="8" fill="${METAL}"/><circle r="3" fill="#8a9097"/></g>
      <ellipse cx="87" cy="38" rx="9.5" ry="7" transform="rotate(45 87 38)" fill="#111417"/><ellipse cx="85" cy="36" rx="9.5" ry="7" transform="rotate(45 85 36)" fill="url(#gbule)"/>
      <circle cx="85" cy="36" r="14" fill="none" stroke="${ORANGE}" stroke-width="2.4" stroke-dasharray="4 3"/>`, 'Et dekk sett fra siden, med en bule på dekksiden');
  }
};

/* ==================== Flere tegninger til teorien (0.28.1) ====================
   Til temaer som går igjen i flere spørsmål: førstehjelp, barnesete, trøtthet, lys i mørket og tåke, barn ved veien,
   syklister, vogntog i sving, plassering i kryss, veggrep, stansforbud og prikker. */
const SKIN = '#e8c4a0';
Object.assign(PICTS, {
  sideleie: () => pict(`<rect x="6" y="6" width="108" height="108" rx="16" fill="${TILE}"/><g transform="translate(2 -20)">
    <rect x="6" y="94" width="108" height="5" rx="2.5" fill="#c4cdd8"/>
    <g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M34 86 L20 92 L9 90" stroke="#1f5aa0" stroke-width="6"/><path d="M70 87 L88 91 L108 91" stroke="#14213d" stroke-width="8"/>
      <path d="M32 80 L70 84" stroke="#2a6fc0" stroke-width="14"/><path d="M68 80 L82 92 L101 88" stroke="#5b78b3" stroke-width="8.5"/><path d="M40 77 L47 89 L27 87" stroke="#4a8fe0" stroke-width="6"/>
      <path d="M11 78 q-3 -3 0 -6 M7 79 q-3.5 -4.5 0 -9" stroke="#6b7177" stroke-width="1.6"/></g>
    <circle cx="22" cy="76" r="9.5" fill="${SKIN}"/><path d="M15 69 A9.5 9.5 0 0 1 31.5 74 Q24 67 15 69 Z" fill="#5b3a29"/><circle cx="26" cy="87" r="3.4" fill="${SKIN}"/><circle cx="9" cy="90" r="3.2" fill="${SKIN}"/></g>`,
    'En person som ligger i stabilt sideleie: på siden, med hånden under kinnet og det øverste beinet bøyd'),
  barnesete: () => pict(`<rect x="6" y="6" width="108" height="108" rx="16" fill="${TILE}"/>
    <path d="M8 54 L36 16 H112" fill="none" stroke="#9fb0c3" stroke-width="4" stroke-linejoin="round"/>
    <path d="M8 54 H30 Q38 54 38 62 V66 Q38 72 30 72 H8 Z" fill="#6b7280"/><rect x="8" y="102" width="104" height="6" rx="3" fill="#9aa1a7"/>
    <path d="M50 86 H100 Q104 86 104 92 V98 H50 Q46 98 46 92 Z" fill="#4b5560"/><rect x="70" y="98" width="10" height="5" fill="#3a4148"/>
    <path d="M96 90 L103 44 Q104 38 109 39 Q114 40 113 46 L106 94 Z" fill="#4b5560"/><rect x="104" y="27" width="11" height="12" rx="4" fill="#4b5560" transform="rotate(10 109 33)"/>
    <path d="M48 86 L54 52 Q56 44 64 46 L68 48 Q66 62 76 68 L96 72 Q100 74 98 80 L94 86 Z" fill="#d9472b"/>
    <path d="M58 52 Q76 28 96 70" fill="none" stroke="#a8321b" stroke-width="3"/>
    <circle cx="64" cy="56" r="7" fill="${SKIN}"/><path d="M69 62 L86 72" stroke="#f2c230" stroke-width="9" stroke-linecap="round"/>
    <path d="M42 38 L37 58" stroke="#6b7177" stroke-width="1"/><rect x="35" y="24" width="68" height="16" rx="5" fill="#15191c"/>
    <g fill="none" stroke="#ffb020" stroke-width="1.5" stroke-linecap="round"><circle cx="43" cy="29" r="1.8" fill="#ffb020"/><path d="M43 31.5 L44 36 H48"/><circle cx="51" cy="31" r="3"/><path d="M41 38 L54 26"/></g>
    ${tx(79, 32.5, 'AIRBAG OFF', 6.5, '#ffb020')}`,
    'Et bakovervendt barnesete i forsetet. Lampen på dashbordet viser at kollisjonsputen er slått av.'),
  trott: () => pict(`<rect x="6" y="6" width="108" height="108" rx="16" fill="${TILE}"/><clipPath id="ctrott"><rect x="6" y="6" width="108" height="108" rx="16"/></clipPath><g clip-path="url(#ctrott)">
    <path d="M22 118 Q24 84 60 82 Q96 84 98 118 Z" fill="#2a6fc0"/><rect x="53" y="68" width="14" height="16" fill="${SKIN}"/>
    <circle cx="60" cy="52" r="20" fill="${SKIN}"/><path d="M40 48 Q42 30 60 30 Q78 30 80 48 Q72 38 60 39 Q48 38 40 48 Z" fill="#5b3a29"/>
    <path d="M47 50 H57 M63 50 H73" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="M48 52 Q52 55 56 52 M64 52 Q68 55 72 52" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="60" cy="63" rx="4.5" ry="5.5" fill="#7a2e2e"/>
    <path d="M14 122 Q60 92 106 122" stroke="#2a2f33" stroke-width="9" fill="none"/></g>
    ${tx(88, 32, 'Z', 13, '#4b586b')}${tx(97, 21, 'z', 10, '#4b586b')}${tx(104, 13, 'z', 8, '#4b586b')}`,
    'En trøtt fører som gjesper bak rattet')
});

Object.assign(VIEWS, {
  motlys: () => svg(`<defs><radialGradient id="vglare" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe6" stop-opacity="1"/><stop offset=".25" stop-color="#fff3c4" stop-opacity=".75"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>
    <linearGradient id="vbeam2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3c4" stop-opacity=".45"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></linearGradient></defs>
    <rect width="200" height="130" fill="#0b1020"/><rect y="62" width="200" height="68" fill="#121722"/><polygon points="16,130 184,130 104,62 96,62" fill="#20252c"/>
    <polygon points="40,130 168,130 114,90 86,90" fill="url(#vbeam2)"/>
    <polygon points="176,130 182,130 104.6,62 103.8,62" fill="#d6dbe0" opacity=".75"/><polygon points="18,130 22,130 96.2,62 95.6,62" fill="#d6dbe0" opacity=".25"/>
    <g fill="#e8d36a" opacity=".55">${[[124, 112, 3], [98, 92, 2], [84, 76, 1.4]].map(([y0, y1, w]) => `<polygon points="${100 - w},${y0} ${100 + w},${y0} ${100 + w * .7},${y1} ${100 - w * .7},${y1}"/>`).join('')}</g>
    <circle cx="88" cy="72" r="42" fill="url(#vglare)"/><g stroke="#fffbe6" stroke-opacity=".35" stroke-width="1"><path d="M58 72 H118 M88 50 V94 M70 58 L106 86 M70 86 L106 58"/></g>
    <circle cx="82" cy="72" r="3" fill="#fff"/><circle cx="94" cy="72" r="3" fill="#fff"/>`,
    'Mørk vei. En bil kommer imot med sterke lys som stråler mot deg.', '0 0 200 130', 'tsvg-view'),
  take: () => svg(`<defs><radialGradient id="vfog" cx=".5" cy=".8" r=".75"><stop offset="0" stop-color="#b9c0c7"/><stop offset=".6" stop-color="#7d858e"/><stop offset="1" stop-color="#3a4149"/></radialGradient>
    <linearGradient id="vfog2" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#aab2ba" stop-opacity=".95"/><stop offset=".72" stop-color="#aab2ba" stop-opacity=".55"/><stop offset="1" stop-color="#aab2ba" stop-opacity="0"/></linearGradient>
    <radialGradient id="vred" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff5a4a" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a4a" stop-opacity="0"/></radialGradient></defs>
    <rect width="200" height="130" fill="url(#vfog)"/><polygon points="14,130 186,130 116,78 84,78" fill="#4d545b"/>
    <polygon points="172,130 178,130 115,78 114,78" fill="#e6e9ec" opacity=".6"/><g fill="#e8d36a" opacity=".6">${[[126, 110, 3], [100, 90, 2]].map(([y0, y1, w]) => `<polygon points="${100 - w},${y0} ${100 + w},${y0} ${100 + w * .7},${y1} ${100 - w * .7},${y1}"/>`).join('')}</g>
    <rect x="89" y="70" width="22" height="11" rx="3" fill="#59616a" opacity=".55"/>
    <rect width="200" height="130" fill="url(#vfog2)"/>
    <g opacity=".75"><circle cx="92" cy="77" r="10" fill="url(#vred)"/><circle cx="108" cy="77" r="6.5" fill="url(#vred)"/><circle cx="92" cy="77" r="1.8" fill="#ff8a7a"/><circle cx="108" cy="77" r="1.4" fill="#ff8a7a"/></g>`,
    'Tett tåke i mørket. Du ser bare et kort stykke av veien, og lysene på en bil foran synes så vidt.', '0 0 200 130', 'tsvg-view')
});

Object.assign(SCENES, {
  'barn-veikant': () => scene(`<rect x="52" y="0" width="14" height="200" fill="${SIDE}"/><rect x="134" y="0" width="14" height="200" fill="${SIDE}"/>${vroad(66, 134, false)}
    ${house(8, 30, 34, 26)}${house(10, 130, 32, 24, '#5f6b76')}${house(158, 40, 34, 26, '#5f6b76')}${house(160, 140, 32, 24)}
    ${car(124, 40, GREY_CAR)}${kid(139, 96)}${kid(146, 108)}<circle cx="152" cy="118" r="3.6" fill="#e8423a" stroke="#fff" stroke-width="1"/>${kid(60, 70)}
    ${car(104, 172, '#2e7dd1', 'A')}${arrow('M104 155 V120', '#2e7dd1')}`,
    'Gate i et boligområde. Noen barn leker på fortauet ved veien foran deg, og et barn står ved kanten på den andre siden. Du er bil A.')
});

const turnPanel = (x0, id, kind) => {
  const two = kind !== 'en', cx = kind === 'v' ? 47 : kind === 'h' ? 54 : 23;
  const path = kind === 'h' ? `M${cx} 57 V48 Q${cx} 36 66 36 H76` : `M${cx} 57 V32 Q${cx} 19 ${cx - 13} 19 H-4`;
  return `<g transform="translate(${x0} 0)"><clipPath id="${id}"><rect width="76" height="96" rx="10"/></clipPath><g clip-path="url(#${id})"><rect width="76" height="96" fill="${GRASS}"/>
    <rect x="14" y="0" width="48" height="96" fill="${ASP}"/><rect x="0" y="10" width="76" height="34" fill="${ASP}"/>
    <line x1="0" y1="27" x2="14" y2="27" stroke="${LINE}" stroke-width="1.6" stroke-dasharray="5 5"/><line x1="62" y1="27" x2="76" y2="27" stroke="${LINE}" stroke-width="1.6" stroke-dasharray="5 5"/>
    ${two ? `<line x1="38" y1="44" x2="38" y2="96" stroke="${LINE}" stroke-width="1.6" stroke-dasharray="6 6"/>` : `<path d="M50 90 V78 H46 L52 70 L58 78 H54 V90 Z" fill="${WL}" opacity=".8"/>`}
    ${car(cx, 74, '#2e7dd1')}${arrow(path, '#2e7dd1')}</g></g>`;
};

Object.assign(DIAGRAMS, {
  'plassering-sving': () => diagram(`${turnPanel(0, 'ctpv', 'v')}${turnPanel(82, 'ctph', 'h')}${turnPanel(164, 'ctpe', 'en')}
    ${[[38, 'Til venstre', 'nær midten'], [120, 'Til høyre', 'nær høyre kant'], [202, 'Enveiskjørt', 'langt til venstre']].map(([x, a, b]) => `<text x="${x}" y="108" text-anchor="middle" ${DT} font-weight="700">${a}</text><text x="${x}" y="120" text-anchor="middle" ${DM}>${b}</text>`).join('')}`,
    'Plassering før sving. Til venstre på en vei med møtende trafikk: så nær midten som mulig. Til høyre: så nær høyre kant som mulig. Til venstre fra en enveiskjørt gate: så langt til venstre som det er trygt.', '0 0 240 124'),
  veggrep: () => {
    const rows = [['Tørr asfalt', 20], ['Våt asfalt', 32], ['Hardpakket snø', 64], ['Is i sterk kulde', 92], ['Våt is, rundt 0 °C', 236]];
    return diagram(`<text x="0" y="10" ${DT} font-weight="700">Bremselengde i samme fart, omtrent</text>
      ${rows.map(([t, w], i) => { const y = 26 + i * 21; return `<text x="0" y="${y}" ${DM}>${t}</text><rect x="0" y="${y + 4}" width="${w}" height="9" rx="2" fill="var(--brake, #c0392b)" opacity="${(.6 + i * .1).toFixed(2)}"/>`; }).join('')}
      <text x="0" y="132" ${DM}>Glattest når det ligger vann på isen</text>`,
      'Bremselengden i samme fart på ulikt føre. Tørr asfalt gir kortest, så våt asfalt, hardpakket snø og is i sterk kulde. Våt is rundt null grader gir den klart lengste, mange ganger så lang som på tørr asfalt.', '0 0 240 138');
  },
  'syklist-avstand': () => diagram(`<rect x="0" y="6" width="240" height="80" rx="6" fill="${ASP}"/><g stroke="${WL}" stroke-width="1.6"><line x1="0" y1="9" x2="240" y2="9"/><line x1="0" y1="83" x2="240" y2="83"/></g>
    <line x1="0" y1="46" x2="240" y2="46" stroke="${LINE}" stroke-width="2" stroke-dasharray="10 10"/>
    <path d="M118 76 q7 -5 14 0 t14 0 t14 0 t14 0" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-dasharray="3 3"/>
    ${bike(184, 76, 90)}${sideCar(150, 49, '#2e7dd1')}${arrow('M172 49 H200', '#2e7dd1')}
    <path d="M182 59 V70 M179 59 H185 M179 70 H185" stroke="#fff" stroke-width="1.6"/>
    <text x="120" y="100" text-anchor="middle" ${DT} font-weight="700">God sideavstand, også om du må vente bak</text>
    <text x="120" y="113" text-anchor="middle" ${DM}>Syklisten kan vingle: vind, hull og glatte partier</text>`,
    'En bil kjører forbi en syklist og ligger delvis over midtlinjen for å gi god sideavstand. Syklisten kan vingle, så vent bak til det er plass og trygt.', '0 0 240 118'),
  'stans-avstand': () => {
    const ico = {
      kryss: `<rect width="20" height="20" rx="4" fill="${GRASS}"/><rect x="7" width="6" height="20" fill="${ASP}"/><rect y="7" width="20" height="6" fill="${ASP}"/>`,
      gang: `<rect width="20" height="20" rx="4" fill="${ASP}"/>${[3, 8.5, 14].map(x => `<rect x="${x}" y="3" width="3" height="14" fill="${WL}"/>`).join('')}`,
      plan: `<g transform="scale(.2)">${SIGNS[138]()}</g>`,
      buss: `<g transform="translate(0 1) scale(.2)">${SIGNS[512]()}</g>`
    };
    const rows = [['kryss', 'Kryss', 'fra der kanten begynner å runde', '5 m'], ['gang', 'Gangfelt og sykkelkryssing', 'foran kryssingen', '5 m'], ['plan', 'Planovergang', 'fra sporet', '5 m'], ['buss', 'Holdeplass for buss', 'regnet fra holdeplasskiltet', '20 m']];
    return diagram(`<text x="0" y="10" ${DT} font-weight="700">Ikke stans nærmere enn</text>
      ${rows.map(([k, a, b, m], i) => { const y = 22 + i * 26; return `<g transform="translate(0 ${y})">${ico[k]}</g><text x="28" y="${y + 8}" ${DT} font-weight="700">${a}</text><text x="28" y="${y + 19}" ${DM}>${b}</text>
        <rect x="198" y="${y + 1}" width="42" height="18" rx="9" fill="var(--brake, #c0392b)" opacity=".16"/><text x="219" y="${y + 14}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--brake, #c0392b)">${m}</text>`; }).join('')}`,
      'Her er det forbudt å stanse: i kryss og nærmere enn 5 meter, på og 5 meter foran gangfelt og sykkelkryssing, nærmere en planovergang enn 5 meter, og nærmere enn 20 meter fra skiltet for bussholdeplass.', '0 0 240 124');
  },
  'vogntog-sving': () => diagram(`<g clip-path="url(#scl)">${roads('nesw')}
    <path d="M101 124 C99 96 104 88 130 90 H200 V120 H142 Q121 124 119 146 V124 Z" fill="#ffb300" opacity=".35"/>
    <polygon points="120,128 182,152 182,200 120,200" fill="#ff453a" opacity=".38"/>
    <path d="M101 124 C99 96 104 88 130 90 H200" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 4"/>
    <path d="M119 186 V146 Q121 124 142 120 H200" fill="none" stroke="#d9472b" stroke-width="2.4" stroke-dasharray="5 4"/>
    ${truck(110, 156, 0)}${carBlink(110, 156, 0, 1)}
    <text x="196" y="22" text-anchor="end" font-size="10" font-weight="700" fill="#14181b">Bakhjulene kutter</text><text x="196" y="34" text-anchor="end" font-size="10" font-weight="700" fill="#14181b">hjørnet</text>
    <path d="M168 38 L138 116" stroke="#14181b" stroke-width="1.2"/>
    <text x="8" y="22" font-size="10" font-weight="700" fill="#14181b">Fronten svinger</text><text x="8" y="34" font-size="10" font-weight="700" fill="#14181b">vidt ut</text>
    <path d="M40 38 L98 100" stroke="#14181b" stroke-width="1.2"/>
    <text x="194" y="180" text-anchor="end" font-size="10" font-weight="700" fill="#14181b">Blindsone</text></g>`,
    'Et vogntog som skal svinge til høyre. Fronten går vidt ut mot midten av krysset, og bakhjulene kutter hjørnet. Langs høyre side og rett bak ser ikke sjåføren deg.', '0 0 200 200'),
  prikker: () => diagram(`<text x="0" y="10" ${DT} font-weight="700">Prikker i løpet av tre år</text>
    ${Array.from({ length: 8 }, (_, i) => { const x = 14 + i * 27; return `<circle cx="${x}" cy="32" r="10" fill="${i === 7 ? 'var(--brake, #c0392b)' : 'var(--muted, #4b586b)'}" opacity="${i === 7 ? 1 : .3}"/><text x="${x}" y="35.5" text-anchor="middle" font-size="10" font-weight="800" fill="${i === 7 ? 'var(--on-color, #fff)' : 'var(--ink, #14181b)'}">${i + 1}</text>`; }).join('')}
    <text x="240" y="60" text-anchor="end" font-size="10" font-weight="700" fill="var(--brake, #c0392b)">8 prikker: du mister føreretten i 6 måneder</text>
    <text x="0" y="78" ${DM}>Hver prikk teller i tre år</text>
    <text x="0" y="98" ${DT} font-weight="700">I prøveperioden blir prikkene doblet</text>`,
    'Får du 8 prikker i løpet av tre år, mister du føreretten i seks måneder. Hver prikk teller i tre år. I prøveperioden gir et brudd dobbelt så mange prikker.', '0 0 240 104')
});

/* Hver tegning får egne id-er (0.22.0). Pilspisser og utsnitt pekes til med id, og når samme id finnes i en skjult
   skjerm lenger opp i dokumentet, viser nettleseren ikke pilspissen. */
let uid = 0;
/* ==================== Slik sjekker du (1.1.1): sikkerhetskontrollen steg for steg ====================
   Små tegninger av hvordan en kontroll gjøres, i samme stil som bil: (faste farger, like i lys og mørk modus). De vises
   etter hverandre med en kort tekst under (HOWTO i safety-check.js, howtoStrip i theoryui.js). 'slik:<navn>'. */
const OKC = '#1f8f4e', NOC = '#d9472b', AMB = '#ffb020', FLOOR = '#9aa1a7';
const hOk = (x, y, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${OKC}" stroke="#fff" stroke-width="1.5"/><path d="M${x - r * .45} ${y + r * .02} L${x - r * .1} ${y + r * .38} L${x + r * .48} ${y - r * .34}" fill="none" stroke="#fff" stroke-width="${(r * .28).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const hNo = (x, y, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${NOC}" stroke="#fff" stroke-width="1.5"/><path d="M${x - r * .38} ${y - r * .38} L${x + r * .38} ${y + r * .38} M${x + r * .38} ${y - r * .38} L${x - r * .38} ${y + r * .38}" stroke="#fff" stroke-width="${(r * .28).toFixed(1)}" stroke-linecap="round"/>`;
/* Bil sett ovenfra med fronten opp. front: lysene foran på, rear: 'lys' eller 'brems', blink: alle blinklys, reverse: ryggelys */
function hTop(cx, cy, { k = 1, rot = 0, front = false, rear = null, blink = false, reverse = false, wheels = false } = {}) {
  const glow = [
    front ? '<path d="M-13 -31 L-24 -62 H-4 L-7 -31 Z M13 -31 L24 -62 H4 L7 -31 Z" fill="#fff4b8" opacity=".75"/>' : '',
    rear === 'brems' ? '<ellipse cx="-10" cy="33" rx="11" ry="7" fill="#ff3b30" opacity=".45"/><ellipse cx="10" cy="33" rx="11" ry="7" fill="#ff3b30" opacity=".45"/>' : '',
    reverse ? '<path d="M-12 31 L-21 56 H-5 Z M12 31 L21 56 H5 Z" fill="#fff" opacity=".7"/>' : '',
    blink ? [[-15, -29], [15, -29], [-15, 29], [15, 29], [-20, -8], [20, -8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${AMB}" opacity=".45"/>`).join('') : ''
  ].join('');
  const wh = wheels ? '<g fill="#2a2f33"><rect x="-19" y="-24" width="5" height="12" rx="2"/><rect x="14" y="-24" width="5" height="12" rx="2"/><rect x="-19" y="12" width="5" height="12" rx="2"/><rect x="14" y="12" width="5" height="12" rx="2"/></g>' : '';
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${k})">${glow}${wh}
    <rect x="-16" y="-31" width="32" height="62" rx="9" fill="${BODY}"/><path d="M-12 -15 Q0 -19 12 -15 L10 -4 H-10 Z" fill="${GLASS}"/>
    <rect x="-11" y="-3" width="22" height="18" rx="3" fill="${BODY2}"/><path d="M-10 16 H10 L12 23 Q0 26 -12 23 Z" fill="${GLASS}"/>
    <rect x="-20" y="-10" width="5" height="4" rx="1.5" fill="${BODY2}"/><rect x="15" y="-10" width="5" height="4" rx="1.5" fill="${BODY2}"/>
    <g fill="${front ? '#fffbe0' : W2}"><rect x="-14" y="-31" width="8" height="3" rx="1.5"/><rect x="6" y="-31" width="8" height="3" rx="1.5"/></g>
    <g fill="${rear ? '#ff3b30' : '#a8321b'}"><rect x="-14" y="28" width="8" height="3" rx="1.5"/><rect x="6" y="28" width="8" height="3" rx="1.5"/></g>
    ${reverse ? '<g fill="#fff"><rect x="-6" y="28" width="3" height="3" rx="1"/><rect x="3" y="28" width="3" height="3" rx="1"/></g>' : ''}
    ${blink ? `<g fill="${AMB}">${[[-15, -29], [15, -29], [-15, 29], [15, 29], [-20, -8], [20, -8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`).join('')}</g>` : ''}</g>`;
}
/* Bil sett bakfra (som bil:bremselys): brake, reverse og plate er lys som lyser */
const hRear = ({ brake = false, reverse = false, plate = false } = {}) => `<rect y="104" width="120" height="16" fill="${FLOOR}"/>
  <path d="M22 58 L32 30 H88 L98 58 Z" fill="${BODY2}"/><path d="M34 37 H86 L93 55 H27 Z" fill="${GLASS}"/>
  <rect x="14" y="56" width="92" height="38" rx="8" fill="${BODY}"/><rect x="18" y="94" width="16" height="10" rx="3" fill="#2a2f33"/><rect x="86" y="94" width="16" height="10" rx="3" fill="#2a2f33"/>
  ${brake ? '<g fill="#ff3b30" opacity=".35"><ellipse cx="25" cy="66" rx="16" ry="11"/><ellipse cx="95" cy="66" rx="16" ry="11"/><ellipse cx="60" cy="33" rx="22" ry="6"/></g>' : ''}
  ${reverse ? '<g fill="#fff" opacity=".7"><ellipse cx="27" cy="82" rx="13" ry="8"/><ellipse cx="93" cy="82" rx="13" ry="8"/></g>' : ''}
  <g fill="${brake ? '#ff3b30' : '#a8321b'}"><rect x="16" y="61" width="19" height="10" rx="2.5"/><rect x="85" y="61" width="19" height="10" rx="2.5"/>${brake ? '<rect x="47" y="31" width="26" height="4" rx="2"/>' : ''}</g>
  <g fill="${reverse ? '#ffffff' : '#c9ced3'}"><rect x="22" y="79" width="10" height="5" rx="1.5"/><rect x="88" y="79" width="10" height="5" rx="1.5"/></g>
  ${plate ? '<ellipse cx="60" cy="76" rx="20" ry="7" fill="#fff8d0" opacity=".8"/>' : ''}<rect x="45" y="77" width="30" height="10" rx="1.5" fill="#fff" stroke="#2a2f33"/>`;
/* Bil sett fra siden med fronten mot høyre, hjulene står på y */
const hSide = (x, y, k = 1) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M-40 -7 V-12 Q-40 -16 -36 -17 L-22 -19 L-12 -31 Q-10 -33 -6 -33 H14 Q18 -33 20 -30 L28 -19 L38 -16 Q42 -15 42 -11 V-7 Q42 -3 38 -3 H-36 Q-40 -3 -40 -7 Z" fill="${BODY}"/>
  <path d="M-9 -29 H3 V-20 H-17 Z M7 -29 H13 Q16 -29 17 -27 L23 -20 H7 Z" fill="${GLASS}"/>${[-24, 26].map(c => `<circle cx="${c}" cy="-3" r="8" fill="#2a2f33"/><circle cx="${c}" cy="-3" r="3.5" fill="${METAL}"/>`).join('')}</g>`;
/* Pedal sett fra siden med festet øverst til høyre; a < 0 er trådd inn. Foten med sko og bukseben når foot er sann. */
function hPedal(a, { foot = false, ghost = false } = {}) {
  const r = a * Math.PI / 180, px = 84 + (-5 * Math.cos(r) - 56 * Math.sin(r)), py = 14 + (-5 * Math.sin(r) + 56 * Math.cos(r));
  const shoe = foot ? `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${(a - 24).toFixed(1)})"><path d="M-46 -10 L-62 -40" stroke="#3b4f74" stroke-width="15" stroke-linecap="round"/><path d="M-40 -14 Q-50 -6 -44 3 L6 4 Q13 2 10 -5 L-2 -12 Z" fill="#7a5233"/></g>` : '';
  return `<g ${ghost ? 'opacity=".3"' : ''}><g transform="translate(84 14) rotate(${a})"><path d="M0 0 L-5 54" stroke="#3a4148" stroke-width="5" stroke-linecap="round"/><rect x="-17" y="51" width="24" height="9" rx="3" fill="#2a2f33" transform="rotate(-18 -5 55)"/></g>${shoe}</g>`;
}
const hPedalBox = body => pict(`${tileBg()}<rect x="0" y="100" width="120" height="20" fill="${FLOOR}"/><rect x="92" y="6" width="22" height="16" rx="3" fill="#c4cdd8"/>${body}`, '');
/* Tank forstørret med MAX og MIN, nivået midt mellom */
const hLevel = (id, fluid, label) => pict(`${tileBg(BAY)}${tank(id, 26, 16, 52, 92, 10, 58, fluid, 40, 84)}
  ${arrowTo(98, 72, 84, 62, 2.4, YEL)}${hOk(98, 104, 10)}`, label);
const hPerson = (x, y, { vest = false, k = 1 } = {}) => `<g transform="translate(${x} ${y}) scale(${k})"><circle cx="0" cy="-34" r="7" fill="${SKIN}"/><path d="M-10 -24 Q0 -28 10 -24 L12 0 H-12 Z" fill="${vest ? '#d6ff3a' : '#2a6fc0'}"/>${vest ? '<path d="M-11 -14 H11 M-11 -8 H11" stroke="#c9ced3" stroke-width="2.5"/>' : ''}<path d="M-7 0 V20 M7 0 V20" stroke="#14213d" stroke-width="6" stroke-linecap="round"/></g>`;
const hSnow = (x, y, r = 7, col = '#4a9dff') => `<g stroke="${col}" stroke-width="1.8" stroke-linecap="round" transform="translate(${x} ${y})">${[0, 60, 120].map(a => `<line x1="0" y1="${-r}" x2="0" y2="${r}" transform="rotate(${a})"/>`).join('')}</g>`;
const hSun = (x, y, r = 6) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${YEL}"/><g stroke="${YEL}" stroke-width="1.8" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="0" y1="${-r - 3}" x2="0" y2="${-r - 6}" transform="rotate(${a})"/>`).join('')}</g></g>`;
const hThermo = (x, y, hot) => `<g transform="translate(${x} ${y})"><rect x="-5" y="-30" width="10" height="34" rx="5" fill="#fff" stroke="${INK}" stroke-width="1.5"/><circle cx="0" cy="8" r="8" fill="${hot ? NOC : '#4a9dff'}" stroke="${INK}" stroke-width="1.5"/><rect x="-2" y="${hot ? -26 : -6}" width="4" height="${hot ? 30 : 10}" fill="${hot ? NOC : '#4a9dff'}"/></g>`;
const hTread = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#2a2f33"/><g fill="#15191c">${[0.22, 0.42, 0.62, 0.82].map(f => `<rect x="${(x + w * f - 2).toFixed(1)}" y="${y}" width="4" height="${h}"/>`).join('')}</g>`;
const SLIK = {
  /* Motorolje */
  flatt: () => pict(`${tileBg()}<rect x="0" y="86" width="120" height="34" fill="${FLOOR}"/>${hSide(56, 86, 1)}
    <rect x="30" y="98" width="52" height="12" rx="6" fill="#e9f0d4" stroke="#6b7177"/><circle cx="56" cy="104" r="4" fill="#a7d04a"/><path d="M50 98 V110 M62 98 V110" stroke="#6b7177"/>
    <circle cx="96" cy="26" r="15" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M96 26 V16 M96 26 L104 30" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>${tx(96, 50, '5 min', 8.5, INK)}`,
    'En bil som står på flatt underlag, et vater og en klokke'),
  'pinne-ut': () => pict(`${tileBg(BAY)}<g transform="rotate(-38 40 70)"><rect x="34" y="20" width="3.5" height="88" rx="1.7" fill="${METAL}"/><circle cx="35.7" cy="14" r="8" fill="none" stroke="#f2c230" stroke-width="4"/><rect x="32" y="80" width="7" height="22" fill="#b07a1a" opacity=".9"/></g>
    <path d="M70 84 Q84 70 102 80 Q108 92 96 100 Q80 106 70 96 Z" fill="#e9eef6"/><path d="M76 88 Q86 82 96 88" stroke="#c4cdd8" stroke-width="2" fill="none"/>
    ${curveArrow('M38 52 Q26 40 22 24', 22, 24, -20, 2.6, YEL)}`, 'Peilepinnen trekkes ut og tørkes av med en klut'),
  'pinne-inn': () => pict(`${tileBg(BAY)}<rect x="18" y="74" width="84" height="40" rx="8" fill="#1c2126"/><rect x="54" y="56" width="12" height="22" fill="#15191c"/>
    <rect x="58.3" y="10" width="3.4" height="80" rx="1.7" fill="${METAL}"/><circle cx="60" cy="8" r="7" fill="none" stroke="#f2c230" stroke-width="4"/>
    ${arrowTo(36, 26, 36, 60, 3, YEL)}${tx(36, 18, '1', 10, YEL)}${arrowTo(84, 60, 84, 26, 3, YEL)}${tx(84, 68, '2', 10, YEL)}`, 'Peilepinnen stikkes helt inn og trekkes ut igjen'),
  /* Kjølevæske */
  kald: () => pict(`${tileBg()}${hThermo(36, 62, false)}${hSnow(36, 22, 8)}${hOk(84, 64, 18)}${tx(84, 98, 'kald motor', 8.5, INK)}`, 'Et termometer som viser kaldt, og et grønt merke'),
  'varm-lokk': () => pict(`${tileBg(BAY)}<rect x="34" y="62" width="52" height="46" rx="8" fill="#ebe8de"/><rect x="40" y="44" width="40" height="18" rx="5" fill="#1f2328"/>
    <g fill="none" stroke="#e9eef6" stroke-width="2.4" stroke-linecap="round" opacity=".85"><path d="M48 38 q-6 -8 0 -14 q6 -8 0 -16"/><path d="M60 36 q-6 -8 0 -14 q6 -8 0 -16"/><path d="M72 38 q-6 -8 0 -14 q6 -8 0 -16"/></g>
    ${hThermo(18, 78, true)}${hNo(96, 34, 14)}`, 'Lokket på kjølevæsketanken med damp, et varmt termometer og et rødt kryss'),
  'niva-kjole': () => hLevel('cnk', '#e0609a', 'Kjølevæsketanken forstørret: nivået står mellom MAX og MIN'),
  'niva-brems': () => hLevel('cnb', '#e3b341', 'Bremsevæskebeholderen forstørret: nivået står mellom MAX og MIN'),
  /* Spylervæske */
  'spyler-fyll': () => pict(`${tileBg(BAY)}<rect x="30" y="74" width="60" height="38" rx="6" fill="#2f6fb5" opacity=".9"/><rect x="50" y="62" width="20" height="14" fill="#2f6fb5" opacity=".9"/>
    <g transform="rotate(-35 38 30)"><rect x="18" y="16" width="34" height="40" rx="6" fill="#4a9dff"/><rect x="22" y="8" width="12" height="10" rx="2" fill="#2a6fc0"/><rect x="24" y="30" width="22" height="14" rx="2" fill="#fff"/></g>
    <path d="M56 50 Q60 56 60 64" stroke="#4a9dff" stroke-width="4" fill="none" stroke-linecap="round"/>${hSnow(96, 24, 9, '#9fd0ff')}${tx(96, 44, '−25 °C', 8, W2)}`, 'En kanne med vinterspylervæske helles på beholderen'),
  'spyler-test': () => pict(clipTile('csp', `<rect width="120" height="120" fill="#dbe5ef"/><path d="M0 98 L14 80 H106 L120 98 V120 H0 Z" fill="${BODY}"/>
    <path d="M17 80 L32 18 Q60 12 88 18 L103 80 Z" fill="${GLASS}" stroke="#4a5d78" stroke-width="3" stroke-linejoin="round"/><rect x="14" y="80" width="92" height="7" fill="#2a2f33"/>
    <g fill="#4a9dff">${[[40, 76], [42, 64], [45, 52], [48, 42], [52, 34], [80, 76], [78, 64], [75, 52], [72, 42], [68, 34]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8"/>`).join('')}</g>
    <g fill="#4a9dff" opacity=".35"><ellipse cx="54" cy="32" rx="9" ry="6"/><ellipse cx="66" cy="32" rx="9" ry="6"/></g>${hOk(100, 104, 10)}`, '#dbe5ef'), 'Spylerstrålene treffer frontruta'),
  /* Dekk */
  'dybde-sone': () => pict(`${tileBg()}${hTread(22, 10, 76, 100)}<rect x="31.5" y="10" width="57" height="100" fill="${YEL}" opacity=".22"/>
    <path d="M31.5 10 V110 M88.5 10 V110" stroke="${YEL}" stroke-width="2" stroke-dasharray="4 3"/>${tx(60, 60, '¾', 22, '#fff')}
    <rect x="${(22 + 76 * .42 - 2).toFixed(1)}" y="80" width="4" height="9" fill="${NOC}"/>${arrowTo(58, 104, 54, 92, 2.4, NOC)}`, 'Slitebanen på et dekk sett ovenfra. Den midterste delen er merket.'),
  'dybde-krav': () => pict(`${tileBg()}${hSun(32, 22)}${hSnow(88, 22, 9)}
    <rect x="16" y="44" width="32" height="56" rx="3" fill="#fff"/><rect x="16" y="84" width="32" height="16" fill="#2a2f33"/><rect x="16" y="44" width="32" height="56" rx="3" fill="none" stroke="#6b7177" stroke-width="1.5"/>
    <rect x="72" y="44" width="32" height="56" rx="3" fill="#fff"/><rect x="72" y="70" width="32" height="30" fill="#2a2f33"/><rect x="72" y="44" width="32" height="56" rx="3" fill="none" stroke="#6b7177" stroke-width="1.5"/>
    <path d="M14 84 H50 M70 70 H106" stroke="${NOC}" stroke-width="2"/>${tx(32, 110, '1,6 mm', 9, INK)}${tx(88, 110, '3 mm', 9, INK)}`,
    'Krav til mønsterdybde: sommer og vinter'),
  trykkmaler: () => pict(`${tileBg()}<circle cx="46" cy="64" r="44" fill="#2a2f33"/><circle cx="46" cy="64" r="27" fill="#aeb5bc"/><circle cx="46" cy="64" r="8" fill="${METAL}"/>
    <rect x="60" y="78" width="5" height="12" rx="1" fill="#15191c" transform="rotate(35 62 84)"/>
    <g transform="rotate(35 70 92)"><rect x="66" y="58" width="14" height="38" rx="4" fill="#f2c230" stroke="${INK}" stroke-width="1.2"/><rect x="69" y="64" width="8" height="12" rx="1.5" fill="#1c2126"/></g>${tx(73, 70, '2,3', 6, '#7cf27c')}
    ${hThermo(104, 46, false)}`, 'En trykkmåler satt på ventilen på hjulet, og et kaldt termometer'),
  slitasje: () => pict(`${tileBg()}<path d="M12 46 Q12 34 24 34 H96 Q108 34 108 46 V96 H12 Z" fill="#2a2f33"/>
    <path d="M12 46 Q12 34 24 34 H40 L34 54 Q22 58 12 58 Z" fill="${TILE}"/><g fill="${TILE}">${[46, 62, 78].map(x => `<rect x="${x}" y="34" width="6" height="14"/>`).join('')}</g>
    <path d="M12 58 Q22 58 34 54 L40 34" fill="none" stroke="${NOC}" stroke-width="2.5" stroke-dasharray="4 3"/>${tx(60, 108, 'innerkant slitt', 8.5, INK)}`, 'Et dekk sett i snitt, der den ene kanten er mer slitt enn resten'),
  spiker: () => pict(`${tileBg()}${hTread(18, 10, 84, 100)}<circle cx="58" cy="56" r="7" fill="${METAL}" stroke="#6b7177" stroke-width="1.5"/><path d="M54 56 H62 M58 52 V60" stroke="#6b7177" stroke-width="1.6"/>
    <circle cx="58" cy="56" r="16" fill="none" stroke="${NOC}" stroke-width="2.4" stroke-dasharray="4 3"/>`, 'En skrue i slitebanen på et dekk'),
  /* Lys */
  refleks: () => pict(`${tileBg()}<rect x="0" y="0" width="120" height="22" fill="#c4cdd8"/><path d="M0 22 H120" stroke="#8a9097" stroke-width="2"/>
    <g fill="#ff3b30" opacity=".5"><ellipse cx="48" cy="20" rx="12" ry="5"/><ellipse cx="72" cy="20" rx="12" ry="5"/></g>${hTop(60, 66, { rot: 180, rear: 'brems' })}
    <path d="M60 64 L60 26 M60 26 L56 34" stroke="${YEL}" stroke-width="1.8" stroke-dasharray="3 3" fill="none"/>${arrowTo(96, 86, 96, 46, 3, '#2e7dd1')}`,
    'En bil sett ovenfra rygger mot en vegg. Bremselysene lyser rødt på veggen.'),
  hjelper: () => pict(clipTile('chj', `${hRear({ brake: true })}${hPerson(104, 84, { k: .8 })}`, '#dfe6ee'), 'Bil sett bakfra med bremselysene på, og en person som står bak og ser'),
  rundt: () => pict(`${tileBg()}<ellipse cx="60" cy="60" rx="44" ry="52" fill="none" stroke="#8a9097" stroke-width="2" stroke-dasharray="5 4"/>
    ${hTop(60, 60, { front: true, rear: 'lys' })}${hPerson(104, 70, { k: .5 })}${curveArrow('M100 36 Q108 46 106 56', 106, 56, 170, 2.2, '#2e7dd1')}`,
    'Bil sett ovenfra med lysene på, og en stiplet vei rundt bilen'),
  'rundt-blink': () => pict(`${tileBg()}<ellipse cx="60" cy="60" rx="44" ry="52" fill="none" stroke="#8a9097" stroke-width="2" stroke-dasharray="5 4"/>
    ${hTop(60, 60, { blink: true })}${hPerson(104, 70, { k: .5 })}`, 'Bil sett ovenfra med alle blinklysene på, og en stiplet vei rundt bilen'),
  revers: () => pict(clipTile('crev', `${hRear({ reverse: true, plate: true })}<rect x="92" y="6" width="22" height="22" rx="5" fill="#2a2f33"/>${tx(103, 17.5, 'R', 13, '#fff')}`, '#dfe6ee'),
    'Bil sett bakfra med ryggelysene og skiltlyset på'),
  horn: () => pict(`${tileBg()}<g transform="translate(56 66)"><circle r="40" fill="none" stroke="#2a2f33" stroke-width="9"/><path d="M-36 4 H-14 M14 4 H36 M0 16 V36" stroke="#2a2f33" stroke-width="8"/>
    <rect x="-16" y="-12" width="32" height="28" rx="9" fill="#3a4148"/></g><path d="M44 54 Q56 46 68 54 L66 74 H46 Z" fill="${SKIN}"/>
    <g fill="none" stroke="#2e7dd1" stroke-width="2.4" stroke-linecap="round"><path d="M86 24 q8 6 0 14"/><path d="M94 18 q12 12 0 26"/><path d="M102 12 q16 18 0 38"/></g>`, 'En hånd trykker midt på rattet, og lyd kommer ut'),
  /* Bremser */
  'pedal-fast': () => hPedalBox(`${hPedal(-44, { ghost: true })}${hNo(112, 92, 7)}${hPedal(-12, { foot: true })}${hOk(26, 24, 12)}`).replace('aria-label=""', 'aria-label="En fot trår på bremsepedalen, som stopper høyt og fast"'),
  'brems-rett': () => pict(`${tileBg()}<rect x="30" y="0" width="60" height="120" fill="#5a6066"/><path d="M60 0 V120" stroke="#f4f4f4" stroke-width="2" stroke-dasharray="8 8"/>
    <rect x="30" y="18" width="60" height="4" fill="#f4f4f4"/>${hTop(45, 58, { k: .7, rear: 'brems' })}${arrowTo(45, 104, 45, 88, 3, YEL)}${hOk(102, 30, 10)}`, 'En bil som bremser og stanser rett før en stopplinje'),
  'servo-pump': () => hPedalBox(`${hPedal(-8, { foot: true })}<path d="M98 50 V80" stroke="#2e7dd1" stroke-width="3"/><polygon points="94,52 98,44 102,52" fill="#2e7dd1"/><polygon points="94,78 98,86 102,78" fill="#2e7dd1"/>
    ${tx(26, 24, '×5', 14, INK)}<circle cx="26" cy="50" r="11" fill="#fff" stroke="${INK}" stroke-width="1.5"/><path d="M21 45 L31 55" stroke="${NOC}" stroke-width="2.4"/>${tx(26, 68, 'motor av', 7.5, INK)}`).replace('aria-label=""', 'aria-label="En fot pumper bremsepedalen fem ganger med motoren av"'),
  'servo-start': () => hPedalBox(`${hPedal(-14, { foot: true })}<rect x="10" y="10" width="36" height="36" rx="18" fill="#2a2f33" stroke="${METAL}" stroke-width="2"/>${tx(28, 24, 'START', 6.5, '#fff')}${tx(28, 34, 'STOP', 6.5, '#fff')}<circle cx="28" cy="28" r="20" fill="none" stroke="${OKC}" stroke-width="2.5"/>`).replace('aria-label=""', 'aria-label="Foten holder bremsepedalen inne mens startknappen trykkes"'),
  'servo-synk': () => hPedalBox(`${hPedal(-14, { ghost: true })}${hPedal(-24, { foot: true })}${arrowTo(104, 62, 108, 78, 2.4, OKC)}${hOk(26, 24, 12)}`).replace('aria-label=""', 'aria-label="Bremsepedalen synker litt ned når motoren starter"'),
  pbrems: () => pict(`${tileBg(BAY)}<rect x="22" y="40" width="48" height="56" rx="12" fill="#3a4148"/><rect x="28" y="46" width="36" height="44" rx="9" fill="#20252b"/>
    <g fill="none" stroke="${W2}" stroke-width="2.4"><circle cx="46" cy="68" r="11"/><path d="M33 58 A17 17 0 0 0 33 78 M59 58 A17 17 0 0 1 59 78"/></g>${tx(46, 68.5, 'P', 11, W2)}
    ${curveArrow('M46 30 Q46 22 54 20', 54, 20, 80, 2.4, YEL)}
    <g transform="translate(94 32)"><circle r="14" fill="#15191c"/><g fill="none" stroke="#ff453a" stroke-width="2"><circle r="6.5"/><path d="M-10 -6 A11 11 0 0 0 -10 6 M10 -6 A11 11 0 0 1 10 6"/></g>${tx(0, 0.5, 'P', 7, '#ff453a')}</g>`,
    'En bryter for elektrisk parkeringsbrems, og varsellampen med P som lyser rødt'),
  'pbrems-test': () => pict(`${tileBg()}<rect x="0" y="92" width="120" height="28" fill="${FLOOR}"/>${hSide(54, 92, 1)}
    ${arrowTo(80, 64, 106, 64, 3, '#2e7dd1')}<rect x="104" y="48" width="5" height="32" rx="2" fill="${NOC}"/>${hOk(22, 22, 11)}`, 'En bil som står stille selv om den prøver å kjøre fram'),
  /* Styring */
  'hjul-rett': () => pict(`${tileBg()}<path d="M51 0 V120 M69 0 V120" stroke="#c4cdd8" stroke-width="1.5" stroke-dasharray="4 4"/>${hTop(60, 66, { k: 1.3, wheels: true })}${hOk(100, 22, 10)}`, 'Bil sett ovenfra med forhjulene rett fram'),
  /* Sikt */
  innerspeil: () => pict(`${tileBg()}<rect x="56" y="4" width="8" height="16" rx="2" fill="#2a2f33"/><rect x="10" y="20" width="100" height="44" rx="16" fill="#2a2f33"/>
    <clipPath id="cis"><rect x="14" y="24" width="92" height="36" rx="13"/></clipPath><g clip-path="url(#cis)"><rect x="14" y="24" width="92" height="36" fill="#6b7a8c"/>
    <path d="M24 60 L30 30 H90 L96 60 Z" fill="${GLASS}"/><path d="M60 60 V34" stroke="#f4f4f4" stroke-width="1.5" stroke-dasharray="3 3"/></g>${hOk(98, 92, 11)}${tx(54, 92, 'hele bakruta', 9, INK)}`,
    'Innerspeilet: hele bakruta synes i speilet'),
  sidespeil: () => pict(`${tileBg()}<path d="M14 30 Q14 18 28 18 H96 Q108 18 108 32 V74 Q108 90 92 90 H30 Q14 90 14 74 Z" fill="#2a2f33"/>
    <clipPath id="css"><path d="M19 32 Q19 23 30 23 H94 Q103 23 103 34 V72 Q103 85 90 85 H32 Q19 85 19 72 Z"/></clipPath><g clip-path="url(#css)"><rect x="14" y="18" width="94" height="72" fill="#cfe0ee"/>
    <rect x="14" y="56" width="94" height="34" fill="#5a6066"/><path d="M40 90 L58 56 M88 90 L66 56" stroke="#f4f4f4" stroke-width="2"/><rect x="88" y="18" width="20" height="72" fill="${BODY}"/></g>
    ${arrowTo(98, 108, 98, 92, 2.4, YEL)}${hOk(24, 104, 10)}`, 'Sidespeilet: så vidt litt av egen bil i kanten, ellers veien bak'),
  defrost: () => pict(`${tileBg(BAY)}<rect x="10" y="34" width="46" height="46" rx="10" fill="#3a4148"/><rect x="64" y="34" width="46" height="46" rx="10" fill="#3a4148"/>
    <g fill="none" stroke="${W2}" stroke-width="2" stroke-linecap="round"><path d="M20 52 Q33 44 46 52 L44 62 H22 Z"/><path d="M27 70 q2 -4 0 -7 M33 70 q2 -4 0 -7 M39 70 q2 -4 0 -7"/>
      <rect x="74" y="46" width="26" height="16" rx="2"/><path d="M81 74 q2 -4 0 -7 M87 74 q2 -4 0 -7 M93 74 q2 -4 0 -7"/></g>
    <rect x="27" y="38" width="12" height="3" rx="1.5" fill="${AMB}"/><rect x="81" y="38" width="12" height="3" rx="1.5" fill="${AMB}"/>`,
    'To knapper: defroster for frontruta og for bakruta, begge slått på'),
  skrape: () => pict(clipTile('cskr', `<rect width="120" height="120" fill="#dbe5ef"/><rect x="10" y="10" width="100" height="84" rx="10" fill="#e9f3fb" stroke="#4a5d78" stroke-width="3"/>
    <g fill="#ffffff" opacity=".9">${[[24, 22], [40, 30], [60, 20], [82, 28], [96, 40], [30, 54], [52, 62], [76, 70], [92, 80], [22, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7"/>`).join('')}</g>
    <path d="M40 96 L62 10" stroke="${GLASS}" stroke-width="16"/><g transform="rotate(15 70 90)"><rect x="58" y="70" width="28" height="9" rx="2" fill="#2e7dd1"/><rect x="68" y="78" width="8" height="30" rx="3" fill="#1d5fa6"/></g>`, '#dbe5ef'),
    'En isskrape fjerner is fra ruta'),
  /* Utstyr */
  vest: () => pict(`${tileBg()}${hPerson(42, 84, { vest: true, k: 1.4 })}<g transform="translate(94 40)"><polygon points="0,-16 15,10 -15,10" fill="none" stroke="#ff453a" stroke-width="4" stroke-linejoin="round"/><polygon points="0,-6 7,6 -7,6" fill="none" stroke="#ff453a" stroke-width="2" stroke-linejoin="round"/></g>`,
    'En person med refleksvest, og symbolet for nødsignallys'),
  sete: () => pict(`${tileBg()}<path d="M30 96 L24 46 Q24 38 32 38 Q38 40 38 46 L42 86 H82 Q88 86 88 92 V98 H34 Z" fill="#4b5560"/><rect x="24" y="22" width="14" height="14" rx="5" fill="#4b5560"/>
    <circle cx="36" cy="30" r="7" fill="${SKIN}"/><path d="M34 40 L40 76 H70" stroke="#2a6fc0" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M70 76 L82 62 L102 76" stroke="#14213d" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M40 48 L58 58 L78 44" stroke="${SKIN}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="84" cy="38" r="14" fill="none" stroke="#2a2f33" stroke-width="4" transform="rotate(-20 84 38)"/>
    <path d="M104 76 L108 94" stroke="#3a4148" stroke-width="4"/>`, 'En fører i setet med litt bøyde knær og armer'),
  hodestotte: () => pict(`${tileBg()}<path d="M30 118 L24 60 Q24 52 32 52 L52 52 Q58 54 56 62 L52 118 Z" fill="#4b5560"/><rect x="24" y="14" width="22" height="30" rx="8" fill="#4b5560"/><path d="M31 44 V52 M39 44 V52" stroke="#8a9097" stroke-width="2.5"/>
    <circle cx="60" cy="34" r="17" fill="${SKIN}"/><path d="M43 30 Q46 15 62 16 Q74 18 76 28 Q66 22 56 24 Q48 26 43 30 Z" fill="#5b3a29"/><path d="M48 52 L54 76 H78" stroke="#2a6fc0" stroke-width="14" stroke-linecap="round" fill="none"/>
    <path d="M14 16 H100" stroke="${YEL}" stroke-width="2" stroke-dasharray="4 3"/>${hOk(96, 62, 11)}`, 'Hodestøtten er i høyde med toppen av hodet og nær bakhodet'),
  rykk: () => pict(clipTile('cryk', `<path d="M-6 -8 L60 58" stroke="#4b5560" stroke-width="13"/><path d="M-6 -8 L60 58" stroke="#6a7682" stroke-width="1.2" stroke-dasharray="3 3"/>
    ${arrowTo(62, 60, 92, 90, 4, '#2e7dd1')}<g transform="translate(36 86)"><rect x="-10" y="-4" width="20" height="16" rx="4" fill="#2a2f33"/><path d="M-6 -4 V-10 A6 6 0 0 1 6 -10 V-4" fill="none" stroke="#2a2f33" stroke-width="3"/></g>${hOk(96, 24, 11)}`),
    'Et bilbelte som rykkes raskt, og en lås: beltet skal låse seg'),
  kabel: () => pict(`${tileBg()}<path d="M8 88 Q40 70 52 50" stroke="#1f2328" stroke-width="7" fill="none"/><g transform="translate(58 42) rotate(-40)"><rect x="-10" y="-12" width="36" height="24" rx="8" fill="#2a2f35"/><rect x="-15" y="-10" width="7" height="20" rx="2" fill="#3a4148"/></g>
    <circle cx="66" cy="38" r="22" fill="none" stroke="#2e7dd1" stroke-width="4"/><path d="M82 54 L98 70" stroke="#2e7dd1" stroke-width="6" stroke-linecap="round"/>
    <g transform="translate(96 100)"><circle r="12" fill="#ff8a3d"/><circle r="4" fill="#3a4148"/></g>${hNo(108, 86, 8)}`, 'Ladekabelen og pluggen sees over med lupe. En skjøteledning er krysset ut.')
};
function uniqueIds(s) {
  const ids = new Set([...s.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  if (!ids.size) return s;
  const n = ++uid;
  for (const id of ids) s = s.split(` id="${id}"`).join(` id="${id}-${n}"`).split(`url(#${id})`).join(`url(#${id}-${n})`);
  return s;
}
export function figure(key) { return uniqueIds(figureRaw(key)); }
function figureRaw(key) {
  if (!key || typeof key !== 'string') return '';
  const [kind, a, b, c] = key.split(':');
  if (kind === 'sign' && SIGNS[a]) return svg(SIGNS[a](b, c === 'gul'), 'Trafikkskilt', '0 0 100 100', 'tsvg-sign');
  if (kind === 'line' && LINES[a]) return LINES[a]();
  if (kind === 'light' && LIGHTS[a]) return light(a);
  if (kind === 'scene' && SCENES[a]) return SCENES[a]();
  if (kind === 'lamp' && LAMPS[a]) return b === 'anon' ? lampSvg(a).replace(/aria-label="[^"]*"/, 'aria-label="Symbol i instrumentpanelet"') : lampSvg(a);
  if (kind === 'view' && VIEWS[a]) return VIEWS[a]();
  if (kind === 'pict' && PICTS[a]) return PICTS[a]();
  if (kind === 'cap' && CAPS[a]) return CAPS[a]();
  if (kind === 'diagram' && DIAGRAMS[a]) return DIAGRAMS[a]();
  if (kind === 'bil' && BIL[a]) return b === 'anon' ? BIL[a]().replace(/aria-label="[^"]*"/, 'aria-label="Tegning av en del av bilen"') : BIL[a]();
  if (kind === 'slik' && SLIK[a]) return SLIK[a]();
  return '';
}

export const FIGURE_KEYS = [
  ...Object.keys(SIGNS).map(k => 'sign:' + k), ...Object.keys(LINES).map(k => 'line:' + k),
  ...Object.keys(LIGHTS).map(k => 'light:' + k), ...Object.keys(SCENES).map(k => 'scene:' + k), ...Object.keys(LAMPS).map(k => 'lamp:' + k),
  ...Object.keys(VIEWS).map(k => 'view:' + k), ...Object.keys(PICTS).map(k => 'pict:' + k), ...Object.keys(CAPS).map(k => 'cap:' + k),
  ...Object.keys(DIAGRAMS).map(k => 'diagram:' + k), ...Object.keys(BIL).map(k => 'bil:' + k), ...Object.keys(SLIK).map(k => 'slik:' + k)
];
