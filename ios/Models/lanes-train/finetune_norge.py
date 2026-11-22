# Finjusterer feltmodellen på eierens egne veibilder (1.0.5): norske vinterveier i mørket, med salt, snø og våt asfalt,
# tatt av telefonen i appen (FrameLog.swift) og merket på merkesiden (tools/merk/). Starter fra n2 og blander inn
# comma10k og A2D2, så modellen ikke glemmer vanlige veier.
# Fasit for veibildene: eierens linjer tegnet inn i båndet appen gir modellen (samme utsnitt, samme gamma i mørket),
# tykkere nær bilen. Veiflaten har eieren ikke merket: den tas fra startmodellen selv (så veihodet holder seg).
# Kjøres fra .local-test/lanes-comma/ (som train.py), f.eks.:
#   KJ_AUG=2 KJ_A2D2=../a2d2/data ~/.local/mlenv/bin/python -W ignore ../../ios/Models/lanes-train/finetune_norge.py \
#     --okt ../veibilder/2026-11-22-213012 --init n2/best.pth --ut norge1 --hold 5
# --hold 5: hvert 5. merkede bilde holdes utenfor og brukes til måling. --hold 0: alle brukes i treningen.
import os, sys, json, math, time, random, argparse, copy
import numpy as np, torch, torch.nn.functional as F
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train as TR   # DS, seg_loss, evaluate, score, EMA, weather, split
import tln_model as T

W, H, P = 640, 360, 12

def samples(okter):
    out = []
    for d in okter:
        d = os.path.abspath(d); merk = d + '-merk'
        order = [f['id'] for f in json.load(open(os.path.join(merk, 'forslag.json')))['frames']]
        for fid in order:
            p = os.path.join(merk, fid + '.json')
            if not os.path.exists(p): continue
            e = json.load(open(p))
            if e['status'] != 'ok': continue
            meta = json.load(open(os.path.join(d, fid + '.json')))
            out.append({'img': os.path.join(d, fid + '.jpg'), 'id': f'{os.path.basename(d)}/{fid}', 'y0': meta['lanes']['y0'], 'y1': meta['lanes']['y1'],
                        'gamma': meta['lanes'].get('gamma', 1) or 1, 'lines': e['lines']})
    return out

def band_img(s):
    im = Image.open(s['img']).convert('RGB').crop((0, s['y0'], 720, s['y1'])).resize((W, H), Image.BILINEAR)
    x = np.asarray(im, np.float32) / 255
    if s['gamma'] < 0.99: x = x ** s['gamma']   # som appen i mørket (LaneDetector: CIGammaAdjust)
    return x

def lane_mask(s):
    """Eierens linjer i båndets 640×360: 2 px tykk langt fram, 7 px nær bilen (perspektiv)"""
    m = Image.new('L', (W, H), 0); g = ImageDraw.Draw(m)
    sx, sy = W / 720, H / (s['y1'] - s['y0'])
    for l in s['lines']:
        pts = sorted(((x * sx, (y - s['y0']) * sy) for x, y in l['pts']), key=lambda q: q[1])
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            t = max(0, min(1, (ya + yb) / 2 / H))
            g.line([(xa, ya), (xb, yb)], fill=255, width=int(round(2 + 5 * t)))
    return np.asarray(m) > 127

@torch.no_grad()
def pseudo_road(model, xs, dev):
    """Veiflaten fra startmodellen (snitt med speilvendt): fasit for veihodet på eierens bilder"""
    out = []
    for x in xs:
        X = np.full((H + 2 * P, W, 3), 114 / 255, np.float32); X[P:P + H] = x
        t = torch.from_numpy(np.stack([X, X[:, ::-1].copy()])).permute(0, 3, 1, 2).contiguous().to(dev)
        da, _ = model(t); rp = torch.softmax(da.float(), 1)[:, 1].cpu().numpy()
        out.append(((rp[0] + rp[1][:, ::-1]) / 2)[P:P + H] > 0.5)
    return out

class NorDS(torch.utils.data.Dataset):
    """Eierens bilder: samme format som train.DS (640×384 med grå kant, fasit 0/1 vei/2 linje)"""
    def __init__(s, items, xs, roads, train): s.items, s.xs, s.roads, s.train = items, xs, roads, train
    def __len__(s): return len(s.items)
    def __getitem__(s, i):
        rng = random.Random() if s.train else random.Random(i); nrng = np.random.default_rng(rng.getrandbits(32))
        x = s.xs[i].copy(); y = s.roads[i].astype(np.uint8); y[s.items[i]['lane']] = 2
        if s.train:
            if rng.random() < 0.5:   # telefonen står sjelden helt rett
                ang = rng.uniform(-3, 3)
                xi = Image.fromarray((x * 255).astype(np.uint8)).rotate(ang, Image.BILINEAR)
                yi = Image.fromarray(y).rotate(ang, Image.NEAREST)
                x = np.asarray(xi, np.float32) / 255; y = np.asarray(yi)
            if rng.random() < 0.5: x, y = x[:, ::-1], y[:, ::-1]
            x = TR.weather(x, rng, nrng) if TR.AUG == '2' else TR.photometric(x, rng, nrng)
        X = np.full((H + 2 * P, W, 3), 114 / 255, np.float32); X[P:P + H] = x
        Y = np.zeros((H + 2 * P, W), np.uint8); Y[P:P + H] = y
        return torch.from_numpy(X).permute(2, 0, 1).contiguous(), torch.from_numpy(Y.astype(np.int64))

def eval_ds(model, ds, dev):
    model.eval(); tot = None
    with torch.no_grad():
        for X, Y in torch.utils.data.DataLoader(ds, batch_size=16, num_workers=0):
            da, ll = model(X.to(dev))
            L = (ll[:, 1] > ll[:, 0]).cpu().numpy(); R = (da[:, 1] > da[:, 0]).cpu().numpy()
            for k in range(len(X)):
                s = TR.score(L[k], R[k], Y[k].numpy()); tot = s if tot is None else {q: tot[q] + s[q] for q in tot}
    p = tot['tp'] / max(1, tot['tp'] + tot['fp']); r = tot['tp'] / max(1, tot['tp'] + tot['fn'])
    return dict(lane_p=round(p, 3), lane_r=round(r, 3), lane_f1=round(2 * p * r / max(1e-9, p + r), 3), road_iou=round(tot['inter'] / max(1, tot['union']), 3))

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--okt', nargs='+', required=True); ap.add_argument('--init', required=True); ap.add_argument('--ut', required=True)
    ap.add_argument('--hold', type=int, default=5); ap.add_argument('--epochs', type=int, default=4); ap.add_argument('--rep', type=int, default=24)
    ap.add_argument('--mix', type=int, default=1800, help='comma10k/A2D2-bilder per runde'); ap.add_argument('--lr', type=float, default=2e-4)
    ap.add_argument('--bs', type=int, default=16); ap.add_argument('--workers', type=int, default=6)
    a = ap.parse_args(); dev = 'mps'
    os.makedirs(a.ut, exist_ok=True); torch.manual_seed(0); random.seed(0)
    items = samples(a.okt)
    test = [s for k, s in enumerate(items) if a.hold and k % a.hold == a.hold - 1]; train = [s for s in items if s not in test]
    start = T.load('large', a.init).to(dev)
    def prep(lst):
        xs = [band_img(s) for s in lst]
        for s in lst: s['lane'] = lane_mask(s)
        return xs, pseudo_road(start, xs, dev)
    trX, trR = prep(train); teX, teR = prep(test) if test else ([], [])
    nor_tr = NorDS(train, trX, trR, True); nor_te = NorDS(test, teX, teR, False) if test else None
    # Kontroll på vanlige veier: et fast utvalg av comma10k-testbildene og A2D2-turene som er holdt utenfor
    tr_names, va_names = TR.split()
    rs = random.Random(1); va_c = rs.sample([n for n in va_names if '|' not in n], min(200, len(va_names)))
    held = set(json.load(open(f'{TR.A2D2}/test_scenes.json'))) if TR.A2D2 else set()
    a2_test = rs.sample([n for n in TR.hood() if '|' in n and n.split('|')[1][:14] in held], 300) if TR.A2D2 else []
    def report(m, tag):
        r = {'tag': tag, 'comma': TR.evaluate(m, va_c, dev) if va_c else None}
        if a2_test: r['a2d2'] = TR.evaluate(m, a2_test, dev)
        if nor_te: r['norge'] = eval_ds(m, nor_te, dev)
        print(json.dumps(r), flush=True); open(os.path.join(a.ut, 'log.jsonl'), 'a').write(json.dumps(r) + '\n'); return r
    print(f'{len(train)} norske bilder til trening (×{a.rep} per runde), {len(test)} holdt utenfor; {a.mix} comma10k/A2D2 per runde', flush=True)
    base = report(start, 'n2')
    model = T.load('large', a.init).to(dev); model.train(); ema = TR.EMA(model, 0.998)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    per = (len(train) * a.rep + a.mix) // a.bs; total = per * a.epochs
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda st: min(1, (st + 1) / 100) * (0.05 + 0.95 * 0.5 * (1 + math.cos(math.pi * min(1, st / total)))))
    big = TR.DS([n for n in tr_names], True)
    best, t0 = None, time.time()
    for ep in range(a.epochs):
        idx = random.Random(ep).sample(range(len(big)), a.mix)
        ds = torch.utils.data.ConcatDataset([torch.utils.data.Subset(big, idx)] + [nor_tr] * a.rep)
        dl = torch.utils.data.DataLoader(ds, batch_size=a.bs, shuffle=True, num_workers=a.workers, drop_last=True)
        model.train(); run = 0; n = 0
        for X, Y in dl:
            X, Y = X.to(dev), Y.to(dev)
            lane = F.max_pool2d((Y == 2).float()[:, None], 5, 1, 2)[:, 0].long(); road = ((Y == 1) | (Y == 2)).long()
            da, ll = model(X)
            loss = TR.seg_loss(ll, lane, 4.0) + TR.seg_loss(da, road, 1.0)
            if not torch.isfinite(loss): opt.zero_grad(set_to_none=True); continue
            opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); ema.update(model); run += loss.item(); n += 1
        r = report(ema.m, f'runde {ep + 1} ({(time.time() - t0) / 60:.1f} min, tap {run / max(1, n):.3f})')
        torch.save(ema.m.state_dict(), os.path.join(a.ut, f'runde{ep + 1}.pth'))
        # Beste: høyest på de norske testbildene (eller siste uten testbilder), uten å bli dårligere på vanlige veier
        ok = r['comma']['lane_f1'] >= base['comma']['lane_f1'] - 0.02 and (not a2_test or r['a2d2']['lane_f1'] >= base['a2d2']['lane_f1'] - 0.02)
        key = r['norge']['lane_f1'] if nor_te else ep
        if ok and (best is None or key >= best): best = key; torch.save(ema.m.state_dict(), os.path.join(a.ut, 'best.pth'))
    torch.save(ema.m.state_dict(), os.path.join(a.ut, 'final.pth')); print('ferdig', flush=True)
