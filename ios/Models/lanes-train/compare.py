# Sammenligner to vektfiler på testbildene (hvert 20. comma10k-bilde, ikke brukt i treningen), samlet og delt i
# lyse og mørke bilder. Mørkt = snittlys i utsnittet under 60 av 255. Måler det appen bruker (se score i train.py).
# python compare.py gammel.pth ny.pth [flere.pth ...]
# KJ_HARD=1: de samme bildene med regn, motlys, tåke, skygger eller speiling lagt på (se weather i train.py), delt per forstyrrelse.
# KJ_A2D2=mappe KJ_TEST=a2d2: måler på A2D2-turene som er holdt utenfor, samlet og per tur.
import sys, json, numpy as np, torch
from train import DS, split, score, HARD, KINDS, TEST   # train først: den legger mappen med tln_model.py i søkestien
import tln_model as T
def run(path, names, dev='mps'):
    m = T.load('large', path).to(dev); out = []
    dl = torch.utils.data.DataLoader(DS(names, False), batch_size=16, num_workers=8)
    with torch.no_grad():
        for X, Y in dl:
            da, ll = m(X.to(dev))
            L = (ll[:, 1] > ll[:, 0]).cpu().numpy(); R = (da[:, 1] > da[:, 0]).cpu().numpy()
            for i in range(len(X)):
                s = score(L[i], R[i], Y[i].numpy()); s['lum'] = float(X[i, :, 12:372].mean() * 255); s['kind'] = KINDS[len(out) % len(KINDS)]; s['name'] = names[len(out)]; out.append(s)
    return out
def summ(rows):
    t = {k: sum(r[k] for r in rows) for k in rows[0] if k not in ('lum', 'kind', 'name')}
    p = t['tp'] / max(1, t['tp'] + t['fp']); r = t['tp'] / max(1, t['tp'] + t['fn'])
    return dict(n=len(rows), funnet=round(100 * r), riktige=round(100 * p), f1=round(2 * p * r / max(1e-9, p + r), 3),
                vei_iou=round(100 * t['inter'] / max(1, t['union'])), kant_px=round(t['edge'] / max(1, t['edges']), 1), kant_mangler=round(100 * t['miss'] / max(1, t['rows']), 1))
if __name__ == '__main__':
    _, va = split()
    res = {p: run(p, va) for p in sys.argv[1:]}
    groups = [('alle', lambda r: True), ('lyse', lambda r: r['lum'] >= 60), ('mørke', lambda r: r['lum'] < 60)]
    if HARD: groups = [('alle', lambda r: True)] + [(k, lambda r, k=k: r['kind'] == k) for k in KINDS]
    tur = lambda n: n.split('|')[1][:14]
    if TEST == 'a2d2': groups += [(t[2:], lambda r, t=t: tur(r['name']) == t) for t in sorted({tur(n) for n in va})]
    for name, sel in groups:
        for p, rows in res.items():
            rows = [r for r in rows if sel(r)]
            if rows: print(f'{name:12s} {"/".join(p.split("/")[-2:]):18s}', json.dumps(summ(rows), ensure_ascii=False))
