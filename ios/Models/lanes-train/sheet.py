# Kontaktark: testbilder med fasit og svar fra to modeller (rødt = feltlinje, grønt = kjørbar vei)
# python sheet.py a.pth b.pth ut.jpg [antall]
import sys, numpy as np, torch
from PIL import Image, ImageDraw
from train import DS, split   # train først: den legger mappen med tln_model.py i søkestien
import tln_model as T
A, B, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; N = int(sys.argv[4]) if len(sys.argv) > 4 else 10
_, va = split(); pick = va[::max(1, len(va) // N)][:N]
ms = [T.load('large', p) for p in (A, B)]
def over(x, L, R):
    im = (x * 255).astype(np.float32)
    im[R] = im[R] * 0.6 + np.array([0, 200, 0]) * 0.4
    im[L] = [255, 30, 30]
    return Image.fromarray(im.astype(np.uint8))
rows = []
ds = DS(pick, False)
for i in range(len(pick)):
    X, Y = ds[i]; x = X.permute(1, 2, 0).numpy()[12:372]; y = Y.numpy()[12:372]
    tiles = [over(x, y == 2, y >= 1)]
    for m in ms:
        with torch.no_grad(): da, ll = m(X[None])
        tiles.append(over(x, (ll[0, 1] > ll[0, 0]).numpy()[12:372], (da[0, 1] > da[0, 0]).numpy()[12:372]))
    rows.append(tiles)
W, H = 320, 180
sheet = Image.new('RGB', (W * 3 + 8, (H + 4) * len(rows) + 20), (20, 20, 20)); d = ImageDraw.Draw(sheet)
for j, t in enumerate(['fasit', A.split('/')[-1], B.split('/')[-1]]): d.text((j * (W + 4) + 6, 4), t, fill=(255, 255, 255))
for i, tiles in enumerate(rows):
    for j, t in enumerate(tiles): sheet.paste(t.resize((W, H)), (j * (W + 4), 20 + i * (H + 4)))
sheet.save(OUT, quality=85); print('lagret', OUT)
