# Kontrollark for linjene appen ender med: fasit, og for to modeller masken (rødt) og appens linjer oppå
# (grønn = regnet som riktig, magenta = regnet som feil). Velger bildene der B har en feil linje og A ikke har det.
# python sheet_app.py linjer.json oppsett A=vekter.pth B=vekter.pth ut.jpg [start antall]
import sys, json, numpy as np, torch
from PIL import Image, ImageDraw
from train import DS   # train først: den legger mappen med tln_model.py i søkestien
import tln_model as T
D = json.load(open(sys.argv[1])); bn = sys.argv[2]
(an, ap), (bname, bp) = [a.split('=') for a in sys.argv[3:5]]; OUT = sys.argv[5]
s0 = int(sys.argv[6]) if len(sys.argv) > 6 else 0; N = int(sys.argv[7]) if len(sys.argv) > 7 else 12
bad = lambda n, m: any(not l['good'] for l in D[n][bn][m])
pick = [n for n in sorted(D) if bad(n, bname) and not bad(n, an)][s0:s0 + N]
print(len(pick), 'bilder'); ms = {an: T.load('large', ap), bname: T.load('large', bp)}
W, H = 426, 240; y0 = 0.73 * 1280 - 405; S = 1.125
def tile(x, L, lines=None):
    im = (x * 255).astype(np.float32); im[L] = im[L] * 0.35 + np.array([255, 30, 30]) * 0.65
    t = Image.fromarray(im.astype(np.uint8)).resize((W, H)); d = ImageDraw.Draw(t)
    for l in lines or []:
        p = [((l['xs'][i] / S) * W / 640, ((l['xs'][i + 1] - y0) / S) * H / 360) for i in range(0, len(l['xs']), 2)]
        d.line(p, fill=(0, 255, 80) if l['good'] else (255, 0, 255), width=2)
    return t
ds = DS(pick, False)
sheet = Image.new('RGB', (W * 3 + 8, (H + 4) * len(pick) + 20), (20, 20, 20)); d = ImageDraw.Draw(sheet)
for j, t in enumerate(['fasit', an, bname]): d.text((j * (W + 4) + 6, 4), t, fill=(255, 255, 255))
for i, n in enumerate(pick):
    X, Y = ds[i]; x = X.permute(1, 2, 0).numpy()[12:372]; y = Y.numpy()[12:372]
    tiles = [tile(x, y == 2)]
    for m in (an, bname):
        with torch.no_grad(): da, ll = ms[m](X[None])
        tiles.append(tile(x, (ll[0, 1] > ll[0, 0]).numpy()[12:372], D[n][bn][m]))
    for j, t in enumerate(tiles): sheet.paste(t, (j * (W + 4), 20 + i * (H + 4)))
    d.text((4, 22 + i * (H + 4)), n[:14], fill=(255, 255, 0))
sheet.save(OUT, quality=85); print('lagret', OUT)
