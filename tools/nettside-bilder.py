# Bildene til nettsiden (forside.html og trafikkskole/, 1.0.8), laget av de samme råbildene som App Store-bildene
# (appstore/verktoy/raw/, testeleven «Emma», ingen ekte turer):
#   forside/telefon-<navn>.webp   telefonen alene, med gjennomsiktig bakgrunn, så den passer i lys og mørk modus
#   forside/deling.jpg            1200 × 630 til lenker som deles (Messenger, SMS, Facebook)
# Telefonen har samme form som i App Store-bildene (appstore/verktoy/compose.py).
#   ~/.local/mlenv/bin/python tools/nettside-bilder.py
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'appstore', 'verktoy', 'raw')
OUT = os.path.join(ROOT, 'forside')
FONT = os.path.join(ROOT, 'fonts', 'overpass-latin.woff2')
BRAND, BRAND2 = (11, 76, 180), (8, 59, 143)
INK, SUB, ACC, BEZEL = (255, 255, 255), (211, 224, 247), (245, 197, 24), (15, 26, 43)
NAMES = ['teori', 'sporsmal', 'kryss', 'sikkerhet', 'rapport', 'opptak', 'kart', 'laerer']


def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    return f


def phone(name, screen_h):
    """Telefonen med mørk kant og avrundede hjørner (forholdene fra compose.py: r 112 og kant 14 ved 2094 px)."""
    shot = Image.open(os.path.join(RAW, f'raw-{name}.png')).convert('RGB')
    s = screen_h / 2094
    sw = round(shot.width * screen_h / shot.height)
    r, b = round(112 * s), max(2, round(14 * s))
    shot = shot.resize((sw, screen_h), Image.LANCZOS)
    im = Image.new('RGBA', (sw + 2 * b, screen_h + 2 * b), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, sw + 2 * b - 1, screen_h + 2 * b - 1), r + b, fill=BEZEL + (255,))
    mask = Image.new('L', (sw, screen_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, screen_h - 1), r, fill=255)
    im.paste(shot, (b, b), mask)
    return im


def share_image():
    W, H = 1200, 630
    top, bot = Image.new('RGB', (W, H), BRAND), Image.new('RGB', (W, H), BRAND2)
    grad = Image.linear_gradient('L').rotate(-30, resample=Image.BICUBIC, expand=True).resize((W * 2, H * 2)).crop((W // 2, H // 2, W // 2 + W, H // 2 + H))
    im = Image.composite(bot, top, grad).convert('RGBA')
    # To telefoner til høyre, den ene litt bak
    back, front = phone('kart', 470), phone('teori', 520)
    im.alpha_composite(back, (700, 120))
    im.alpha_composite(front, (880, 70))
    d = ImageDraw.Draw(im)
    # Hvit kantlinje innenfor kanten, som på et skilt (tegnes over telefonene)
    d.rounded_rectangle((14, 14, W - 15, H - 15), 34, outline=(255, 255, 255, 235), width=5)
    d.rounded_rectangle((78, 120, 178, 132), 6, fill=ACC)
    d.text((78, 158), 'KJØRERAPPORT', font=font(30, 700), fill=SUB)
    y = 206
    for line in ['Øv til lappen,', 'med en rapport', 'etter hver tur.']:
        d.text((76, y), line, font=font(66, 800), fill=INK); y += 76
    d.text((78, y + 22), 'Teori, sikkerhetskontroll og øvelseskjøring', font=font(28, 500), fill=SUB)
    im.convert('RGB').save(os.path.join(OUT, 'deling.jpg'), quality=86, optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for n in NAMES:
        p = phone(n, 1180)
        p.save(os.path.join(OUT, f'telefon-{n}.webp'), quality=84, method=6)
        print('laget', f'telefon-{n}.webp', p.size)
    share_image()
    print('laget deling.jpg')
