# Appens vei gjennom modellen: samme punkter som LaneDetector.swift (midt på hver linjebit annenhver rad, veikant
# hver fjerde rad) i et tenkt stående kamerabilde 720x1280 med veibåndet nederst ved 0,73. Skriver punktene for hver
# modell og fasitpunktene (alle rader) til en JSON-fil som applevel.mjs sender gjennom appens egen linjetilpasning.
# python applevel.py ut.json navn=vekter.pth [navn=vekter.pth ...]     (KJ_LBL=lbl for fasit uten sammenbundne streker)
import sys, json, numpy as np, torch
from train import DS, split   # train først: den legger mappen med tln_model.py i søkestien
import tln_model as T
args = sys.argv[1:]; out = args.pop(0)
W, H, RB = 720, 1280, 0.73
bh = W * 9 / 16; y1 = RB * H; y0 = y1 - bh; sx = W / 640; sy = bh / 360
fy = lambda r: y0 + (r - 12 + 0.5) * sy
def runs(row):
    on = np.concatenate([[False], row, [False]]); d = np.diff(on.astype(np.int8))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))
def answer(L, R):
    pts = []
    for r in range(12, 372, 2):
        for a, b in runs(L[r]):
            if b - a <= 60: pts += [round((a + b) / 2 * sx), round(fy(r))]
    road = []
    for r in range(12, 372, 4):
        best = None; bd = 1e9
        for a, b in runs(R[r]):
            if b - a < 8: continue
            dd = 0 if a <= 320 < b else min(abs(a - 320), abs(b - 320))
            if dd < bd: best, bd = (a, b), dd
        if best: road += [round(fy(r)), round(best[0] * sx), round(best[1] * sx)]
    return {'pts': pts[:1800], 'road': road}
if __name__ == '__main__':
    _, va = split(); ds = DS(va, False)
    models = {a.split('=')[0]: T.load('large', a.split('=')[1]).to('mps') for a in args}
    res = []
    dl = torch.utils.data.DataLoader(ds, batch_size=16, num_workers=8)
    n = 0
    with torch.no_grad():
        for X, Y in dl:
            outs = {}
            for name, m in models.items():
                da, ll = m(X.to('mps'))
                outs[name] = ((ll[:, 1] > ll[:, 0]).cpu().numpy(), (da[:, 1] > da[:, 0]).cpu().numpy())
            for i in range(len(X)):
                y = Y[i].numpy(); gt = []
                for r in range(12, 372):
                    for a, b in runs(y[r] == 2): gt += [round((a + b) / 2 * sx, 1), round(fy(r), 1)]
                e = {'name': va[n], 'w': W, 'h': H, 'gt': gt, 'lum': float(X[i, :, 12:372].mean() * 255)}
                for name in models: e[name] = answer(outs[name][0][i], outs[name][1][i])
                res.append(e); n += 1
    json.dump({'rb': RB, 'models': list(models), 'frames': res}, open(out, 'w'))
    print(len(res), 'bilder ->', out)
