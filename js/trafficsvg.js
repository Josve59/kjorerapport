/* Tegninger til teorispørsmålene (0.14.0): skilt, oppmerking, trafikklys og kryss, som SVG laget i koden. Skiltene er
   forenklet etter skiltforskriften (formen, fargene og symbolet), nok til å kjenne dem igjen. Skiltforskriften er en
   forskrift, så skiltene kan brukes fritt (åndsverkloven § 14).
   figure(key) → SVG-tekst. key: 'sign:362:60', 'sign:362:50:gul', 'line:sperre', 'light:gul', 'scene:hoyre'.
   Skjermleserteksten (aria-label) avslører ikke svaret. Ren funksjon, testes i Node. */

const RED = '#c8102e', BLUE = '#0b5aa6', YEL = '#f5c400', BLK = '#141414', WH = '#ffffff';

const svg = (body, label, vb = '0 0 100 100', cls = '') =>
  `<svg class="tsvg ${cls}" viewBox="${vb}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const tri = sym => `<polygon points="50,10 92,84 8,84" fill="${WH}" stroke="${RED}" stroke-width="8" stroke-linejoin="round"/>${sym}`;
const ring = (inner = WH, w = 10) => `<circle cx="50" cy="50" r="${46 - w / 2}" fill="${inner}" stroke="${RED}" stroke-width="${w}"/>`;
const blueDisc = `<circle cx="50" cy="50" r="46" fill="${BLUE}" stroke="${WH}" stroke-width="2"/>`;
const blueSquare = `<rect x="6" y="6" width="88" height="88" rx="8" fill="${BLUE}" stroke="${WH}" stroke-width="3"/>`;
const num = (n, fill = BLK, size = 40) => `<text x="50" y="51" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="${fill}">${n}</text>`;
const arrowUp = (fill = WH) => `<path d="M44 78 V44 H34 L50 22 L66 44 H56 V78 Z" fill="${fill}"/>`;
/* Bil sett bakfra (til forbikjøringsforbud) */
const carRear = (x, fill) => `<g transform="translate(${x} 0)"><path d="M-11 44 L-8 34 H8 L11 44 Z" fill="${fill}"/><rect x="-14" y="43" width="28" height="15" rx="3" fill="${fill}"/><rect x="-13" y="57" width="6" height="6" rx="1" fill="${fill}"/><rect x="7" y="57" width="6" height="6" rx="1" fill="${fill}"/></g>`;

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
  126: () => {
    const cx = 50, cy = 58, r = 13, arcs = [];
    for (let k = 0; k < 3; k++) {
      const a0 = (-90 + k * 120) * Math.PI / 180, a1 = a0 - 85 * Math.PI / 180;   // mot klokka, som trafikken i en rundkjøring
      const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      const t = [Math.sin(a1), -Math.cos(a1)];   // retningen videre mot klokka ved enden
      const h = [p1[0] + t[0] * 6, p1[1] + t[1] * 6], n = [Math.cos(a1) * 4.5, Math.sin(a1) * 4.5];
      arcs.push(`<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 0 0 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" fill="none" stroke="${BLK}" stroke-width="4.5"/><polygon points="${(p1[0] + n[0]).toFixed(1)},${(p1[1] + n[1]).toFixed(1)} ${h[0].toFixed(1)},${h[1].toFixed(1)} ${(p1[0] - n[0]).toFixed(1)},${(p1[1] - n[1]).toFixed(1)}" fill="${BLK}"/>`);
    }
    return tri(arcs.join(''));
  },
  132: () => tri(`<rect x="41" y="33" width="18" height="44" rx="5" fill="${BLK}"/><circle cx="50" cy="42" r="5" fill="#e53935"/><circle cx="50" cy="55" r="5" fill="#fbc02d"/><circle cx="50" cy="68" r="5" fill="#43a047"/>`),
  138: () => `<g transform="rotate(45 50 50)"><rect x="4" y="42" width="92" height="16" rx="2" fill="${WH}" stroke="${RED}" stroke-width="4"/></g><g transform="rotate(-45 50 50)"><rect x="4" y="42" width="92" height="16" rx="2" fill="${WH}" stroke="${RED}" stroke-width="4"/></g>`,
  156: () => tri(`<rect x="45.5" y="34" width="9" height="28" rx="2" fill="${BLK}"/><circle cx="50" cy="71" r="5" fill="${BLK}"/>`)
};

/* ---------- Oppmerking: veien sett ovenfra, kjøreretning oppover ---------- */
/* Bil sett ovenfra, med frontruta foran. Bokstaven står alltid rett, litt bak frontruta. */
const car = (x, y, fill, label = '', rot = 0) => {
  const r = rot * Math.PI / 180, lx = (-Math.sin(r) * 4).toFixed(1), ly = (Math.cos(r) * 4).toFixed(1);
  return `<g transform="translate(${x} ${y})"><g transform="rotate(${rot})"><rect x="-8" y="-13" width="16" height="26" rx="4" fill="${fill}" stroke="#0d1013" stroke-width="1.2"/><rect x="-6" y="-9" width="12" height="5" rx="1.5" fill="#cfe3f5" opacity=".9"/></g>${label ? `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="9" fill="#fff">${label}</text>` : ''}</g>`;
};
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
const GRASS = '#c9d3c4', ASP = '#5a6066', LINE = '#f2d24a';
const arrow = (d, color = '#111') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#ah)"/>`;
const defs = `<defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#111"/></marker></defs>`;
const vRoad = `<rect x="80" y="0" width="40" height="200" fill="${ASP}"/>`, hRoad = `<rect x="0" y="80" width="200" height="40" fill="${ASP}"/>`;
const vLine = (y0, y1) => `<line x1="100" y1="${y0}" x2="100" y2="${y1}" stroke="${LINE}" stroke-width="2" stroke-dasharray="8 8"/>`;
const hLine = (x0, x1) => `<line x1="${x0}" y1="100" x2="${x1}" y2="100" stroke="${LINE}" stroke-width="2" stroke-dasharray="8 8"/>`;
/* Fotgjenger: hode, kropp, armer og bein, så den ikke forveksles med en pil */
const person = (x, y) => `<g stroke="#111" stroke-width="2.6" stroke-linecap="round" fill="none"><circle cx="${x}" cy="${y - 12}" r="3.8" fill="#111" stroke="none"/><path d="M${x} ${y - 7} V${y + 2} M${x} ${y + 2} L${x - 4} ${y + 10} M${x} ${y + 2} L${x + 4} ${y + 10} M${x - 5} ${y - 3} L${x + 5} ${y - 3}"/></g>`;
const bike = (x, y) => `<g transform="translate(${x} ${y})"><rect x="-2" y="-10" width="4" height="20" rx="2" fill="#111"/><circle cx="0" cy="-2" r="4" fill="#e3a21a"/></g>`;
const scene = (body, label) => svg(`${defs}<rect width="200" height="200" rx="12" fill="${GRASS}"/>${body}`, label, '0 0 200 200', 'tsvg-scene');
const zebra = (x, y, w, h, vertical) => {
  const out = [];
  if (vertical) for (let yy = y; yy < y + h; yy += 8) out.push(`<rect x="${x}" y="${yy}" width="${w}" height="5" fill="#f4f4f4"/>`);
  else for (let xx = x; xx < x + w; xx += 8) out.push(`<rect x="${xx}" y="${y}" width="5" height="${h}" fill="#f4f4f4"/>`);
  return out.join('');
};
const smallSign202 = (x, y) => `<polygon points="${x - 7},${y - 6} ${x + 7},${y - 6} ${x},${y + 7}" fill="#fff" stroke="${RED}" stroke-width="2.4" stroke-linejoin="round"/>`;

const SCENES = {
  hoyre: () => scene(`${vRoad}${hRoad}${vLine(0, 80)}${vLine(120, 200)}${hLine(0, 80)}${hLine(120, 200)}
    ${car(110, 158, '#2e7dd1', 'A')}${arrow('M110 140 V60')}
    ${car(158, 90, '#d9472b', 'B', -90)}${arrow('M140 90 H60')}`,
    'Kryss uten skilt eller lys. Bil A kommer nedenfra og skal rett fram. Bil B kommer fra høyre side av bildet og skal rett fram.'),
  venstresving: () => scene(`${vRoad}${hRoad}${vLine(0, 80)}${vLine(120, 200)}${hLine(0, 80)}${hLine(120, 200)}
    ${car(110, 158, '#2e7dd1', 'A')}${arrow('M110 140 V108 Q110 90 92 90 H52')}
    ${car(90, 40, '#d9472b', 'B', 180)}${arrow('M90 58 V150')}`,
    'Kryss. Bil A kommer nedenfra og skal svinge til venstre. Bil B kommer ovenfra mot A og skal rett fram.'),
  't-kryss': () => scene(`${hRoad}<rect x="80" y="100" width="40" height="100" fill="${ASP}"/>${hLine(0, 200)}${vLine(120, 200)}
    ${car(40, 110, '#2e7dd1', 'A', 90)}${arrow('M58 110 H150')}
    ${car(110, 170, '#d9472b', 'B')}${arrow('M110 152 V126')}`,
    'T-kryss uten skilt. Bil A kjører fra venstre mot høyre på den gjennomgående veien. Bil B kommer nedenfra fra sideveien.'),
  parkering: () => scene(`${hRoad}${hLine(0, 200)}<rect x="96" y="120" width="70" height="66" fill="#8a9097"/><text x="131" y="170" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="22" fill="#fff">P</text>
    ${car(40, 110, '#2e7dd1', 'A', 90)}${arrow('M58 110 H94')}
    ${car(112, 146, '#d9472b', 'B')}${arrow('M112 128 V112 Q112 108 120 108 H150')}`,
    'Vei med en parkeringsplass nedenfor. Bil A kjører på veien fra venstre mot høyre. Bil B kjører ut fra parkeringsplassen.'),
  buss: () => scene(`${hRoad}${hLine(0, 200)}<path d="M110 120 L120 132 H178 L188 120 Z" fill="${ASP}"/>
    <g transform="translate(150 122) rotate(90)"><rect x="-8" y="-24" width="16" height="48" rx="3" fill="#d9472b" stroke="#0d1013" stroke-width="1.2"/><circle cx="-7" cy="-22" r="2.6" fill="#ffb300"/></g>
    ${arrow('M126 118 Q128 110 150 110 H186')}
    ${car(40, 110, '#2e7dd1', 'A', 90)}${arrow('M58 110 H96')}
    <g transform="translate(30 140)"><circle r="10" fill="#fff" stroke="${RED}" stroke-width="2.5"/><text y="1" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10" fill="#111">50</text></g>`,
    'Vei med fartsgrense 50. En buss står ved holdeplassen foran bil A, blinker til venstre og skal kjøre ut.'),
  gangfelt: () => scene(`${vRoad}${vLine(0, 60)}${vLine(90, 200)}${zebra(82, 64, 36, 22, false)}${person(125, 76)}
    ${car(110, 158, '#2e7dd1', 'A')}${arrow('M110 140 V100')}`,
    'Gangfelt uten trafikklys. En fotgjenger står ved kanten og er på vei ut i gangfeltet. Bil A nærmer seg nedenfra.'),
  'hoyresving-sykkel': () => scene(`${vRoad}${hRoad}${vLine(0, 80)}${vLine(120, 200)}${hLine(0, 80)}${hLine(120, 200)}
    ${car(108, 158, '#2e7dd1', 'A')}${arrow('M108 140 V128 Q108 110 126 110 H170')}
    ${bike(124, 150)}${arrow('M124 136 V60', '#111')}`,
    'Kryss. Bil A kommer nedenfra og skal svinge til høyre. En syklist på vegskulderen til høyre for bilen skal rett fram.'),
  rundkjoring: () => scene(`<circle cx="100" cy="100" r="58" fill="${ASP}"/><circle cx="100" cy="100" r="26" fill="${GRASS}"/><rect x="82" y="150" width="36" height="50" fill="${ASP}"/><rect x="0" y="82" width="50" height="36" fill="${ASP}"/><rect x="150" y="82" width="50" height="36" fill="${ASP}"/><rect x="82" y="0" width="36" height="50" fill="${ASP}"/>
    ${smallSign202(132, 168)}
    ${car(108, 176, '#2e7dd1', 'A')}${arrow('M108 160 V150')}
    ${car(56, 122, '#d9472b', 'B', 140)}${arrow('M66 136 Q80 150 96 150')}`,
    'Rundkjøring med vikepliktskilt ved innkjøringen. Bil A skal kjøre inn nedenfra. Bil B er allerede i rundkjøringen og kommer fra venstre mot A.'),
  'sving-gangfelt': () => scene(`${vRoad}${hRoad}${vLine(0, 80)}${vLine(120, 200)}${hLine(0, 80)}${hLine(120, 200)}${zebra(132, 82, 22, 36, true)}${person(142, 96)}
    ${car(108, 158, '#2e7dd1', 'A')}${arrow('M108 140 V128 Q108 110 124 110 H180')}`,
    'Kryss. Bil A kommer nedenfra og skal svinge til høyre. I veien A svinger inn i, er det et gangfelt der en fotgjenger går over.')
};

export function figure(key) {
  if (!key || typeof key !== 'string') return '';
  const [kind, a, b, c] = key.split(':');
  if (kind === 'sign' && SIGNS[a]) return svg(SIGNS[a](b, c === 'gul'), 'Trafikkskilt', '0 0 100 100', 'tsvg-sign');
  if (kind === 'line' && LINES[a]) return LINES[a]();
  if (kind === 'light' && LIGHTS[a]) return light(a);
  if (kind === 'scene' && SCENES[a]) return SCENES[a]();
  return '';
}

export const FIGURE_KEYS = [
  ...Object.keys(SIGNS).map(k => 'sign:' + k), ...Object.keys(LINES).map(k => 'line:' + k),
  ...Object.keys(LIGHTS).map(k => 'light:' + k), ...Object.keys(SCENES).map(k => 'scene:' + k)
];
