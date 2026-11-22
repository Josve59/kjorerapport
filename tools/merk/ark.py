# Kontrollark for gjennomgang av forslagene: veibåndet lysnet, hvert forslag i egen farge med nummeret ved toppen.
# python tools/merk/ark.py <økt-mappe> <ut-mappe> [per_ark=6] [fra=0] [til=alle]   → ark-001.jpg, ark-002.jpg, …
import sys, json, os
from PIL import Image, ImageDraw, ImageEnhance, ImageFont
d, outd = sys.argv[1], sys.argv[2]
per = int(sys.argv[3]) if len(sys.argv) > 3 else 6
fra = int(sys.argv[4]) if len(sys.argv) > 4 else 0
til = int(sys.argv[5]) if len(sys.argv) > 5 else None
fs = json.load(open(d + '-merk/forslag.json'))['frames'][fra:til]
os.makedirs(outd, exist_ok=True)
COL = [(255, 60, 60), (60, 200, 255), (255, 220, 0), (80, 255, 120), (255, 80, 255), (255, 150, 40), (180, 140, 255), (255, 255, 255)]
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
S = 0.75
for a in range(0, len(fs), per):
    tiles = []
    for f in fs[a:a + per]:
        y0 = max(0, f['y0'] - 110); y1 = min(1280, f['y1'] + 20)
        im = Image.open(os.path.join(d, f['id'] + '.jpg')).convert('RGB').crop((0, y0, 720, y1))
        im = ImageEnhance.Brightness(im).enhance(1.7)
        im = im.resize((int(720 * S), int((y1 - y0) * S))); g = ImageDraw.Draw(im)
        for k, l in enumerate(f['lines']):
            c = COL[k % len(COL)]; pts = [(x * S, (y - y0) * S) for x, y in l['pts']]
            g.line(pts, fill=(0, 0, 0), width=6); g.line(pts, fill=c, width=3)
            tx, ty = min(pts, key=lambda p: p[1])
            g.rectangle([tx - 2, ty - 26, tx + 22, ty - 2], fill=(0, 0, 0)); g.text((tx + 2, ty - 26), str(l['id']), fill=c, font=font)
        g.rectangle([0, 0, 300, 28], fill=(0, 0, 0)); g.text((4, 2), f"{f['id']}  {len(f['lines'])} forslag", fill=(255, 255, 255), font=font)
        tiles.append(im)
    TW = max(t.width for t in tiles); TH = max(t.height for t in tiles); cols = 2; rows = (len(tiles) + 1) // 2
    sh = Image.new('RGB', (cols * TW + 8, rows * TH + 8 * rows), (40, 40, 40))
    for i, t in enumerate(tiles): sh.paste(t, ((i % 2) * (TW + 8), (i // 2) * (TH + 8)))
    sh.save(os.path.join(outd, f'ark-{fra // per + a // per + 1:03d}.jpg'), quality=82)
print(len(fs), 'bilder ->', outd)
