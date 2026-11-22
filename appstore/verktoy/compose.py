# App Store-bilder: 1320 × 2868 (6,9"), overskrift øverst og skjermbildet under med avrundede hjørner.
# 1.0.0 (22.11.2026): fargene fra designprofilen «Skilt og vei» (veiblå bakgrunn som skiltkortet, gul midtlinje),
# og telefonen står likt på alle bildene, så settet ser helt ut i App Store.
#   ~/.local/mlenv/bin/python compose.py      (råbildene ligger i raw/raw-<navn>.png, navnene står i captions.json)
import json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.path.join(HERE, 'raw')   # råbildene fra simulatoren: raw-<navn>.png
OUT = os.path.join(HERE, '..', 'skjermbilder')
FONT = os.path.join(HERE, '..', '..', 'fonts', 'overpass-latin.woff2')
W, H = 1320, 2868
BRAND, BRAND2 = (11, 76, 180), (8, 59, 143)       # --brand og --brand-2 i css/theme.css
INK, SUB, ACC = (255, 255, 255), (211, 224, 247), (245, 197, 24)   # tekst og undertekst som i skiltkortet, midtlinjegul
BEZEL, SHADOW = (15, 26, 43), (2, 18, 52)
MARGIN = 110
PHONE_TOP, PHONE_BOTTOM = 704, 70   # skjermens øverste kant, og luft under telefonen

def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    return f

def wrap(draw, text, f, maxw):
    words = text.split()
    if draw.textlength(text, font=f) <= maxw: return [text]
    # To jevne linjer i stedet for ett ord alene på siste linje («… siden / sist.»), helst delt etter komma eller punktum
    best = None
    for i in range(1, len(words)):
        a, b = ' '.join(words[:i]), ' '.join(words[i:])
        wa, wb = draw.textlength(a, font=f), draw.textlength(b, font=f)
        score = max(wa, wb) - (180 if a[-1] in ',.' else 0)
        if wa <= maxw and wb <= maxw and (best is None or score < best[0]): best = (score, [a, b])
    if best: return best[1]
    lines, cur = [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=f) <= maxw: cur = t
        else: lines.append(cur); cur = w
    return lines + [cur]

def background():
    # Skrå overgang fra veiblå til mørkere blå, som skiltkortet i appen
    top, bot = Image.new('RGB', (W, H), BRAND), Image.new('RGB', (W, H), BRAND2)
    mask = Image.linear_gradient('L').rotate(-20, resample=Image.BICUBIC, expand=True)
    mask = mask.resize((W * 2, H * 2)).crop((W // 2, H // 2, W // 2 + W, H // 2 + H))
    return Image.composite(bot, top, mask)

def compose(raw, title, sub, out):
    im = background()
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((MARGIN, 150, MARGIN + 120, 166), 8, fill=ACC)   # gul strek som midtlinja i appens veibilde
    ft, fs = font(104, 800), font(50, 500)
    y = 210
    title_lines, sub_lines = wrap(d, title, ft, W - 2 * MARGIN), wrap(d, sub, fs, W - 2 * MARGIN)
    if len(title_lines) > 2 or len(sub_lines) > 2: raise SystemExit(f'For lang tekst: {title}')
    for line in title_lines:
        d.text((MARGIN, y), line, font=ft, fill=INK); y += 118
    y += 18
    for line in sub_lines:
        d.text((MARGIN, y), line, font=fs, fill=SUB); y += 66
    if y + 40 > PHONE_TOP - 14: raise SystemExit(f'Teksten går inn i telefonen: {title}')
    shot = Image.open(raw).convert('RGB')
    sh = H - PHONE_TOP - PHONE_BOTTOM; sw = round(shot.width * sh / shot.height)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    x, top, r, b = (W - sw) // 2, PHONE_TOP, 112, 14
    mask = Image.new('L', (sw, sh), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), r, fill=255)
    # Skygge og en mørk kant rundt «telefonen»
    shadow = Image.new('L', (W, H), 0); ImageDraw.Draw(shadow).rounded_rectangle((x, top + 30, x + sw, top + sh + 30), r + b, fill=140)
    im.paste(SHADOW, (0, 0), shadow.filter(ImageFilter.GaussianBlur(44)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x - b, top - b, x + sw + b, top + sh + b), r + b, fill=BEZEL)
    im.paste(shot, (x, top), mask)
    im.save(out, optimize=True)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for i, (raw, title, sub) in enumerate(json.load(open(os.path.join(HERE, 'captions.json'))), 1):
        compose(f'{SP}/raw-{raw}.png', title, sub, f'{OUT}/{i:02d}-{raw}.png')
        print('laget', i, raw)
