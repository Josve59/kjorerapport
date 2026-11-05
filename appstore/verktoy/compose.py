# App Store-bilder: 1320 × 2868 (6,9"), overskrift øverst og skjermbildet under med avrundede hjørner.
import sys, json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.path.join(HERE, 'raw')   # råbildene fra simulatoren: raw-<navn>.png
OUT = os.path.join(HERE, '..', 'skjermbilder')
FONT = os.path.join(HERE, '..', '..', 'fonts', 'overpass-latin.woff2')
W, H = 1320, 2868
BG, INK, SUB, ACC = (27, 31, 34), (247, 248, 246), (190, 197, 201), (245, 198, 26)

def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    return f

def wrap(draw, text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=f) <= maxw: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur)
    return lines

def compose(raw, title, sub, out):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    # Gul strek som i appens veibilde
    d.rounded_rectangle((110, 150, 230, 166), 8, fill=ACC)
    ft, fs = font(104, 800), font(50, 500)
    y = 210
    for line in wrap(d, title, ft, W - 220):
        d.text((110, y), line, font=ft, fill=INK); y += 118
    y += 18
    for line in wrap(d, sub, fs, W - 220):
        d.text((110, y), line, font=fs, fill=SUB); y += 66
    shot = Image.open(raw).convert('RGB')
    sw = 1010; sh = round(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    top = max(y + 60, 640)
    x = (W - sw) // 2
    mask = Image.new('L', (sw, sh), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), 72, fill=255)
    # Skygge og en tynn kant rundt «telefonen»
    shadow = Image.new('L', (W, H), 0); ImageDraw.Draw(shadow).rounded_rectangle((x, top + 24, x + sw, top + sh + 24), 80, fill=150)
    im.paste((0, 0, 0), (0, 0), shadow.filter(ImageFilter.GaussianBlur(40)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x - 14, top - 14, x + sw + 14, top + sh + 14), 86, fill=(58, 64, 69))
    im.paste(shot, (x, top), mask)
    im.save(out, optimize=True)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for i, (raw, title, sub) in enumerate(json.load(open(os.path.join(HERE, 'captions.json'))), 1):
        compose(f'{SP}/raw-{raw}.png', title, sub, f'{OUT}/{i:02d}-{raw}.png')
        print('laget', i, raw)
