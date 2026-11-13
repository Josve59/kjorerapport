/* Tegninger til teorispørsmålene (0.14.0): skilt, oppmerking, trafikklys og kryss, som SVG laget i koden. Skiltene er
   forenklet etter skiltforskriften (formen, fargene og symbolet), nok til å kjenne dem igjen. Skiltforskriften er en
   forskrift, så skiltene kan brukes fritt (åndsverkloven § 14).
   figure(key) → SVG-tekst. key: 'sign:362:60', 'sign:362:50:gul', 'line:sperre', 'light:gul', 'scene:hoyre'.
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
  208: () => `${SIGNS[206]()}<clipPath id="c208"><polygon points="50,15 85,50 50,85 15,50"/></clipPath><g clip-path="url(#c208)" stroke="${BLK}" stroke-width="3.5"><line x1="30" y1="22" x2="78" y2="70"/><line x1="22" y1="30" x2="70" y2="78"/><line x1="38" y1="14" x2="86" y2="62"/></g>`,
  210: () => tri(`<rect x="44" y="36" width="12" height="40" fill="${BLK}"/><rect x="30" y="53" width="40" height="5" fill="${BLK}"/>`),
  302: () => `<circle cx="50" cy="50" r="46" fill="${RED}"/><rect x="18" y="42" width="64" height="16" fill="${WH}"/>`,
  306: () => ring(),
  362: (n = 60, gul) => `${ring(gul ? YEL : WH)}${num(n)}`,
  364: (n = 60) => `<circle cx="50" cy="50" r="45" fill="${WH}" stroke="${BLK}" stroke-width="2"/>${num(n, '#9a9a9a')}<clipPath id="c364"><circle cx="50" cy="50" r="40"/></clipPath><g clip-path="url(#c364)" stroke="${BLK}" stroke-width="2.5"><line x1="78" y1="30" x2="32" y2="76"/><line x1="70" y1="22" x2="24" y2="68"/><line x1="84" y1="38" x2="40" y2="82"/></g>`,
  370: () => `<circle cx="50" cy="50" r="41" fill="${BLUE}" stroke="${RED}" stroke-width="9"/><g stroke="${RED}" stroke-width="9"><line x1="23" y1="23" x2="77" y2="77"/><line x1="77" y1="23" x2="23" y2="77"/></g>`,
  372: () => `<circle cx="50" cy="50" r="41" fill="${BLUE}" stroke="${RED}" stroke-width="9"/><line x1="23" y1="23" x2="77" y2="77" stroke="${RED}" stroke-width="9"/>`,
  334: () => `${ring()}<g transform="translate(0 -1)">${carRear(35, RED)}${carRear(65, BLK)}</g>`,
  402: () => `${blueDisc}${arrowUp()}`,
  404: () => `${blueDisc}<g transform="rotate(135 50 50)">${arrowUp()}</g>`,
  502: () => `${blueSquare}<rect x="18" y="26" width="64" height="9" fill="${WH}"/><path d="M24 84 L40 40 H46 L42 84 Z M76 84 L60 40 H54 L58 84 Z" fill="${WH}"/>`,
  503: () => `${blueSquare}<path d="M16 62 L22 50 L34 46 L44 36 H64 L74 46 L84 49 V62 Z" fill="${WH}"/><circle cx="32" cy="63" r="7" fill="${WH}" stroke="${BLUE}" stroke-width="3"/><circle cx="70" cy="63" r="7" fill="${WH}" stroke="${BLUE}" stroke-width="3"/>`,
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
  124: () => tri(`<rect x="45" y="36" width="10" height="43" fill="${BLK}"/><rect x="30" y="58" width="40" height="10" fill="${BLK}"/>`),
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
  540: () => zone(`<rect x="22" y="31" width="56" height="58" rx="4" fill="${BLUE}"/><polygon points="58,46 67,38 76,46 76,56 58,56" fill="${WH}"/>${runner(36, 42, 40, WH)}${runner(55, 60, 25, WH)}<circle cx="70" cy="82" r="4" fill="${WH}"/>`),
  548: () => zone(`<rect x="22" y="31" width="56" height="58" rx="4" fill="${BLUE}"/><text x="50" y="43" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10" fill="${WH}">Gågate</text>${runner(43, 48, 38, WH)}${runner(59, 61, 25, WH)}`),
};

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
  hoyre: () => scene(`${roads('nesw')}
    ${car(110, 160, '#2e7dd1', 'A')}${arrow('M110 143 V66', '#2e7dd1')}
    ${car(160, 90, '#d9472b', 'B', -90)}${arrow('M143 90 H66', '#d9472b')}`,
    'Kryss uten skilt eller lys. Bil A kommer nedenfra og skal rett fram. Bil B kommer fra høyre side av bildet og skal rett fram.'),
  venstresving: () => scene(`${roads('nesw')}
    ${car(110, 160, '#2e7dd1', 'A')}${arrow('M110 143 V108 Q110 90 92 90 H40', '#2e7dd1')}
    ${car(90, 40, '#d9472b', 'B', 180)}${arrow('M90 57 V150', '#d9472b')}`,
    'Kryss. Bil A kommer nedenfra og skal svinge til venstre. Bil B kommer ovenfra mot A og skal rett fram.'),
  't-kryss': () => scene(`${roads('esw')}
    ${car(40, 110, '#2e7dd1', 'A', 90)}${arrow('M57 110 H150', '#2e7dd1')}
    ${car(110, 170, '#d9472b', 'B')}${arrow('M110 153 V128', '#d9472b')}`,
    'T-kryss uten skilt. Bil A kjører fra venstre mot høyre på den gjennomgående veien. Bil B kommer nedenfra fra sideveien.'),
  parkering: () => scene(`${roads('ew')}<rect x="96" y="134" width="74" height="56" rx="6" fill="#8a9097"/><rect x="104" y="118" width="16" height="18" fill="${ASP}"/><g stroke="#f4f4f4" stroke-width="1.4"><line x1="132" y1="140" x2="132" y2="160"/><line x1="148" y1="140" x2="148" y2="160"/></g><text x="156" y="182" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="18" fill="#fff">P</text>
    ${car(40, 110, '#2e7dd1', 'A', 90)}${arrow('M57 110 H92', '#2e7dd1')}
    ${car(112, 154, '#d9472b', 'B')}${arrow('M112 137 V118 Q112 110 122 110 H162', '#d9472b')}`,
    'Vei med en parkeringsplass nedenfor. Bil A kjører på veien fra venstre mot høyre. Bil B kjører ut fra parkeringsplassen.'),
  buss: () => scene(`${roads('ew')}<path d="M112 120 L122 132 H176 L186 120 Z" fill="${ASP}"/>
    ${bus(150, 122, 90, true)}${arrow('M128 116 Q132 110 150 110 H186', '#d9472b')}
    ${car(40, 110, '#2e7dd1', 'A', 90)}${arrow('M57 110 H96', '#2e7dd1')}
    ${smallSpeed(30, 146, 50)}`,
    'Vei med fartsgrense 50. En buss står ved holdeplassen foran bil A, blinker til venstre og skal kjøre ut.'),
  gangfelt: () => scene(`${roads('ns')}${zebra(83, 62, 36, 24, false)}${person(129, 78)}
    ${car(110, 160, '#2e7dd1', 'A')}${arrow('M110 143 V98', '#2e7dd1')}`,
    'Gangfelt uten trafikklys. En fotgjenger står ved kanten og er på vei ut i gangfeltet. Bil A nærmer seg nedenfra.'),
  'hoyresving-sykkel': () => scene(`${roads('nesw', { shoulderS: true })}
    ${car(110, 172, '#2e7dd1', 'A')}${arrow('M110 155 V130 Q110 110 130 110 H178', '#2e7dd1')}
    ${bike(124.5, 146)}${arrow('M124.5 130 V58', '#111')}`,
    'Kryss. Bil A kommer nedenfra og skal svinge til høyre. En syklist på vegskulderen til høyre for bilen skal rett fram.'),
  rundkjoring: () => scene(`${roundabout()}${shark(100, 118, 152, 1)}
    ${smallSign202(134, 168)}
    ${car(109, 178, '#2e7dd1', 'A')}${arrow('M109 161 V152', '#2e7dd1')}
    ${car(56, 122, '#d9472b', 'B', 140)}${arrow('M67 135 Q80 150 96 150', '#d9472b')}`,
    'Rundkjøring med vikepliktskilt ved innkjøringen. Bil A skal kjøre inn nedenfra. Bil B er allerede i rundkjøringen og kommer fra venstre mot A.'),
  'sving-gangfelt': () => scene(`${roads('nesw')}${zebra(132, 82, 22, 36, true)}${person(143, 98)}
    ${car(108, 160, '#2e7dd1', 'A')}${arrow('M108 143 V128 Q108 110 126 110 H182', '#2e7dd1')}`,
    'Kryss. Bil A kommer nedenfra og skal svinge til høyre. I veien A svinger inn i, er det et gangfelt der en fotgjenger går over.'),
  // Nye i 0.16.0, til vanskelige vikepliktspørsmål
  'kryss-tre': () => scene(`${roads('nesw')}
    ${car(110, 162, '#2e7dd1', 'A')}${arrow('M110 145 V62', '#2e7dd1')}
    ${car(162, 90, '#d9472b', 'B', -90)}${arrow('M145 90 H62', '#d9472b')}
    ${car(38, 110, '#2f9e5b', 'C', 90)}${arrow('M55 110 H138', '#2f9e5b')}`,
    'Kryss uten skilt eller lys. Bil A kommer nedenfra, bil B fra høyre side av bildet og bil C fra venstre side. Alle skal rett fram.'),
  'forkjorsvei-venstre': () => scene(`${roads('nesw')}${shark(100, 120, 124, 1)}${shark(80, 100, 76, -1)}
    ${smallSign206(30, 140)}${smallSign202(134, 146)}
    ${car(36, 110, '#2e7dd1', 'A', 90)}${arrow('M53 110 H88 Q110 110 110 88 V30', '#2e7dd1')}
    ${car(164, 90, '#d9472b', 'B', -90)}${arrow('M147 90 H40', '#d9472b')}
    ${car(110, 168, '#2f9e5b', 'C')}${arrow('M110 151 V132', '#2f9e5b')}`,
    'Kryss der veien fra venstre til høyre er forkjørsvei. Bil A kjører på forkjørsveien fra venstre og skal svinge til venstre. Bil B kommer imot på forkjørsveien og skal rett fram. Bil C står ved vikepliktskiltet i sideveien nedenfra og skal rett fram.'),
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
  fjernlys: ['bla', 'Kontrollampe for fjernlys', c => `${headlamp(c)}<path d="M46 36 H20 M46 46 H20 M46 56 H20 M46 66 H20" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`]
};
const lampSvg = k => {
  const [col, label, draw] = LAMPS[k], c = LAMP[col];
  return svg(`<rect width="100" height="100" rx="20" fill="#15191c"/><g opacity=".45" filter="url(#lgl)">${draw(c)}</g>${draw(c)}`.replace('<rect', '<defs><filter id="lgl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter></defs><rect'), label, '0 0 100 100', 'tsvg-lamp');
};

export function figure(key) {
  if (!key || typeof key !== 'string') return '';
  const [kind, a, b, c] = key.split(':');
  if (kind === 'sign' && SIGNS[a]) return svg(SIGNS[a](b, c === 'gul'), 'Trafikkskilt', '0 0 100 100', 'tsvg-sign');
  if (kind === 'line' && LINES[a]) return LINES[a]();
  if (kind === 'light' && LIGHTS[a]) return light(a);
  if (kind === 'scene' && SCENES[a]) return SCENES[a]();
  if (kind === 'lamp' && LAMPS[a]) return lampSvg(a);
  return '';
}

export const FIGURE_KEYS = [
  ...Object.keys(SIGNS).map(k => 'sign:' + k), ...Object.keys(LINES).map(k => 'line:' + k),
  ...Object.keys(LIGHTS).map(k => 'light:' + k), ...Object.keys(SCENES).map(k => 'scene:' + k), ...Object.keys(LAMPS).map(k => 'lamp:' + k)
];
