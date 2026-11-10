# Sammenligner to vektfiler på testbildene (hvert 20. comma10k-bilde, ikke brukt i treningen), samlet og delt i
# lyse og mørke bilder. Mørkt = snittlys i utsnittet under 60 av 255. Måler det appen bruker (se score i train.py).
# python compare.py gammel.pth ny.pth [flere.pth ...]
import sys, json, numpy as np, torch
from train import DS, split, score   # train først: den legger mappen med tln_model.py i søkestien
import tln_model as T
def run(path, names, dev='mps'):
    m = T.load('large', path).to(dev); out = []
    dl = torch.utils.data.DataLoader(DS(names, False), batch_size=16, num_workers=8)
    with torch.no_grad():
        for X, Y in dl:
            da, ll = m(X.to(dev))
            L = (ll[:, 1] > ll[:, 0]).cpu().numpy(); R = (da[:, 1] > da[:, 0]).cpu().numpy()
            for i in range(len(X)):
                s = score(L[i], R[i], Y[i].numpy()); s['lum'] = float(X[i, :, 12:372].mean() * 255); out.append(s)
    return out
def summ(rows):
    t = {k: sum(r[k] for r in rows) for k in rows[0] if k != 'lum'}
    p = t['tp'] / max(1, t['tp'] + t['fp']); r = t['tp'] / max(1, t['tp'] + t['fn'])
    return dict(n=len(rows), funnet=round(100 * r), riktige=round(100 * p), f1=round(2 * p * r / max(1e-9, p + r), 3),
                vei_iou=round(100 * t['inter'] / max(1, t['union'])), kant_px=round(t['edge'] / max(1, t['edges']), 1), kant_mangler=round(100 * t['miss'] / max(1, t['rows']), 1))
if __name__ == '__main__':
    _, va = split()
    res = {p: run(p, va) for p in sys.argv[1:]}
    for name, sel in (('alle', lambda r: True), ('lyse', lambda r: r['lum'] >= 60), ('mørke', lambda r: r['lum'] < 60)):
        for p, rows in res.items():
            rows = [r for r in rows if sel(r)]
            if rows: print(f'{name:6s} {"/".join(p.split("/")[-2:]):18s}', json.dumps(summ(rows), ensure_ascii=False))
