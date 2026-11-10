# Kontaktark: fasit før og etter sammenbinding (rødt = feltlinje, gult = lagt til)
# python sheet_gt.py ut.jpg start antall
import sys, numpy as np
from PIL import Image
from train import split, band, hood
import random
OUT = sys.argv[1]; S = int(sys.argv[2]); N = int(sys.argv[3])
_, va = split(); pick = va[S:S + N]
tiles = []
for n in pick:
    im = Image.open(f'data/img/{n}.jpg').convert('RGB')
    box = band(*im.size, hood()[n], random.Random(0), False)
    x = np.asarray(im.crop(box).resize((640, 360), Image.BILINEAR)).astype(np.float32)
    a = np.asarray(Image.open(f'data/lbl/{n}.png').crop(box).resize((640, 360), Image.NEAREST))
    b = np.asarray(Image.open(f'data/lbl2/{n}.png').crop(box).resize((640, 360), Image.NEAREST))
    x[(b == 2) & (a != 2)] = [255, 230, 0]; x[a == 2] = [255, 30, 30]
    tiles.append(Image.fromarray(x.astype(np.uint8)).resize((480, 270)))
C = 3; R = (len(tiles) + C - 1) // C
sheet = Image.new('RGB', (C * 484, R * 274), (20, 20, 20))
for i, t in enumerate(tiles): sheet.paste(t, ((i % C) * 484, (i // C) * 274))
sheet.save(OUT, quality=85); print('lagret', OUT)
