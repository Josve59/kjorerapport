# Finjusterer D-FINE small (appens bilmodell) på veibildene fra telefonen og comma10k, med boksene fra en stor
# modell (dfine-xlarge-coco, bare COCO) som fasit. Samme utsnitt og lysning som appen (RoadDetector.swift).
#   python tren.py <ut-mappe> --fasit a.json b.json ... --test test.json [--runder 8] [--lr 5e-5] [--batch 8]
# a.json …: fra kjor.py med modellen «ref» (fasiten). test.json: fra kjor.py med «ref» og «obj» (en annen stor modell).
import sys, os, json, math, random, time, copy, argparse
import numpy as np, torch
from PIL import Image, ImageEnhance
from transformers import DFineForObjectDetection
import torch.nn.functional as F
from transformers.models.d_fine import modeling_d_fine as M

# F.linear med 1D-vekt krasjer på MPS i treningen («mps.matmul contracting dimensions differ 15936 & 33») og kan ikke
# konverteres til Core ML: samme omskriving som ios/Models/convert-dfine.py, regner nøyaktig det samme
def _integral(self, pred_corners, project):
    b, q, _ = pred_corners.shape
    p = F.softmax(pred_corners.reshape(-1, self.max_num_bins + 1), dim=1)
    return torch.matmul(p, project.to(p.device).reshape(-1, 1)).reshape(b, q, 4)
M.DFineIntegral.forward = _integral

ap = argparse.ArgumentParser()
ap.add_argument('ut')
ap.add_argument('--fasit', nargs='+', required=True)
ap.add_argument('--test', required=True)
ap.add_argument('--start', default='ustc-community/dfine-small-coco')
ap.add_argument('--runder', type=int, default=8)
ap.add_argument('--lr', type=float, default=5e-5)
ap.add_argument('--batch', type=int, default=8)
ap.add_argument('--maks', type=int, default=0, help='høyst så mange treningsbilder (0 = alle)')
ap.add_argument('--fasitgrense', type=float, default=0.5, help='boksene fra fasiten med minst denne scoren er fasit')
a = ap.parse_args()
os.makedirs(a.ut, exist_ok=True)
random.seed(1); torch.manual_seed(1)
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
CLS = {'person': 0, 'bicycle': 1, 'car': 2, 'motorcycle': 3, 'bus': 5, 'truck': 7}
BASE = os.path.dirname(os.path.abspath(__file__))

def crop_for(w, h, rb):
    if h > w and rb is not None:
        s = w
        return 0, round(max(0, min(h - s, rb * h - 0.9 * s))), s, s
    if h > w:
        return 0, round((h - w) * 0.5), w, w
    return 0, 0, w, h

# Treningsbilder: boksene fra fasiten (score ≥ 0,5), uten bilens egen panser
items = []
for fp in a.fasit:
    d = json.load(open(fp)); root = os.path.dirname(os.path.abspath(fp))
    for k, f in d['frames'].items():
        boxes = [(CLS[b['cls']], b['x'], b['y'], b['w'], b['h']) for b in f['ref'] if b['score'] >= a.fasitgrense and b['w'] <= 0.7 * f['W'] and b['cls'] in CLS]
        items.append({'path': os.path.join(d.get('root', root), k), 'dark': f['dark'], 'crop': f['crop'], 'W': f['W'], 'H': f['H'], 'boxes': boxes})
random.shuffle(items)
if a.maks: items = items[:a.maks]
print(f'{len(items)} treningsbilder, {sum(len(i["boxes"]) for i in items)} bokser', flush=True)

def prep(img, crop, dark, boxes, train):
    sx, sy, sw, sh = crop
    if train:   # litt annet utsnitt og lys, så modellen tåler at holderen og lyset varierer
        s = random.uniform(0.85, 1.0)
        nw, nh = sw * s, sh * s
        sx, sy = sx + random.uniform(0, sw - nw), sy + random.uniform(0, sh - nh)
        sw, sh = nw, nh
    im = img.crop((round(sx), round(sy), round(sx + sw), round(sy + sh))).resize((640, 640), Image.BILINEAR)
    flip = train and random.random() < 0.5
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if train:
        im = ImageEnhance.Brightness(im).enhance(random.uniform(0.75, 1.25))
        im = ImageEnhance.Contrast(im).enhance(random.uniform(0.8, 1.2))
    x = np.asarray(im, dtype=np.float32) / 255.
    if dark: x = np.power(x, 0.5)   # som appen i mørket
    labels, bx = [], []
    for c, x0, y0, w, h in boxes:
        a0, b0, a1, b1 = max(x0, sx), max(y0, sy), min(x0 + w, sx + sw), min(y0 + h, sy + sh)
        if a1 <= a0 or b1 <= b0 or (a1 - a0) * (b1 - b0) < 0.5 * w * h: continue   # mest utenfor utsnittet
        cx, cy, ww, hh = ((a0 + a1) / 2 - sx) / sw, ((b0 + b1) / 2 - sy) / sh, (a1 - a0) / sw, (b1 - b0) / sh
        if flip: cx = 1 - cx
        labels.append(c); bx.append([cx, cy, ww, hh])
    return torch.from_numpy(x).permute(2, 0, 1), {'class_labels': torch.tensor(labels, dtype=torch.long), 'boxes': torch.tensor(bx, dtype=torch.float32).reshape(-1, 4)}

# Test: turen som holdes utenfor (bilder fra kjor.py med samme utsnitt), mot to store modeller
test = json.load(open(a.test)); troot = test.get('root', os.path.dirname(os.path.abspath(a.test)))
GROUP = {'car': 'v', 'truck': 'v', 'bus': 'v', 'motorcycle': 'v', 'person': 'p', 'bicycle': 'b'}
NAMES = {0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}
def iou(p, q):
    ix = max(0, min(p[0] + p[2], q[0] + q[2]) - max(p[0], q[0])); iy = max(0, min(p[1] + p[3], q[1] + q[3]) - max(p[1], q[1]))
    i = ix * iy; u = p[2] * p[3] + q[2] * q[3] - i
    return i / u if u > 0 else 0
def keep(cls, score, w, h, W):
    if w > 0.7 * W: return False
    if cls == 'person': return score >= 0.5 and h / max(w, 1) <= 4.5
    return score >= 0.35

@torch.no_grad()
def evaluate(model):
    model.eval()
    res = {}
    for refname in ['ref', 'obj']:
        res[refname] = {g: [0, 0, 0] for g in 'vpb'}   # funnet, fasit, ekstra
    for k, f in test['frames'].items():
        img = Image.open(os.path.join(troot, k)).convert('RGB')
        x, _ = prep(img, f['crop'], f['dark'], [], False)
        o = model(pixel_values=x[None].to(dev))
        p = o.logits.sigmoid()[0].float().cpu(); b = o.pred_boxes[0].float().cpu()
        sx, sy, sw, sh = f['crop']; mine = []
        for q in range(p.shape[0]):
            for ci, name in NAMES.items():
                sc = float(p[q, ci])
                if sc < 0.35: continue
                cx, cy, bw, bh = b[q].tolist()
                bx = (sx + (cx - bw / 2) * sw, sy + (cy - bh / 2) * sh, bw * sw, bh * sh)
                if keep(name, sc, bx[2], bx[3], f['W']): mine.append((GROUP[name], sc, bx))
        mine.sort(key=lambda m: -m[1])
        for refname in ['ref', 'obj']:
            truth = [(GROUP[t['cls']], (t['x'], t['y'], t['w'], t['h'])) for t in f.get(refname, []) if t['score'] >= 0.5 and t['w'] <= 0.7 * f['W'] and t['cls'] in GROUP]
            loose = [(GROUP[t['cls']], (t['x'], t['y'], t['w'], t['h'])) for t in f.get(refname, []) if t['score'] >= 0.3 and t['cls'] in GROUP]
            used = set()
            for g, sc, bx in mine:
                best, bi = 0, -1
                for i, (tg, tb) in enumerate(truth):
                    if i in used or tg != g: continue
                    v = iou(bx, tb)
                    if v > best: best, bi = v, i
                if best >= 0.5: used.add(bi); res[refname][g][0] += 1
                elif not any(tg == g and iou(bx, tb) >= 0.3 for tg, tb in loose): res[refname][g][2] += 1
            for tg, _ in truth: res[refname][tg][1] += 1
    model.train()
    return res

# COCO val2017 med ekte fasit (162 bilder, 575 kjøretøy): blir modellen dårligere på vanlige bilder?
COCO_DIR = os.path.join(BASE, '..', 'dfine', 'coco-val')
coco_gt = json.load(open(os.path.join(COCO_DIR, 'gt.json')))
VEH = {'car', 'truck', 'bus', 'motorcycle'}
@torch.no_grad()
def evaluate_coco(model, thr=0.3):
    model.eval(); tp = fp = fn = 0
    for g in coco_gt:
        img = Image.open(os.path.join(COCO_DIR, f"{g['id']}.jpg")).convert('RGB'); W, H = img.size
        x = torch.from_numpy(np.asarray(img.resize((640, 640), Image.BILINEAR), dtype=np.float32) / 255.).permute(2, 0, 1)[None].to(dev)
        o = model(pixel_values=x); p = o.logits.sigmoid()[0].float().cpu(); b = o.pred_boxes[0].float().cpu()
        dets = []
        for q in range(p.shape[0]):
            for ci, name in NAMES.items():
                if name in VEH and float(p[q, ci]) >= thr:
                    cx, cy, bw, bh = b[q].tolist(); dets.append((float(p[q, ci]), ((cx - bw / 2) * W, (cy - bh / 2) * H, bw * W, bh * H)))
        gts = [tuple(o['bbox']) for o in g['gt'] if o['cls'] in VEH]; used = set()
        for sc, bx in sorted(dets, key=lambda d: -d[0]):
            best, bi = 0, -1
            for i, t in enumerate(gts):
                if i in used: continue
                v = iou(bx, t)
                if v > best: best, bi = v, i
            if best >= 0.5: used.add(bi); tp += 1
            else: fp += 1
        fn += len(gts) - len(used)
    model.train()
    return {'tp': tp, 'fn': fn, 'fp': fp}

def fmt(r):
    out = []
    for refname in ['ref', 'obj']:
        v = r[refname]
        out.append(refname + ': ' + ' · '.join(f"{n} {v[g][0]}/{v[g][1]} ({round(100 * v[g][0] / max(1, v[g][1]))} %, +{v[g][2]})" for g, n in [('v', 'kjøretøy'), ('p', 'folk'), ('b', 'sykkel')]))
    return ' | '.join(out)
def score(r):   # samlet mål: funnet minus halvparten av de ekstra, mot begge fasitene
    s = 0
    for refname in ['ref', 'obj']:
        for g in 'vpb': s += r[refname][g][0] - 0.5 * r[refname][g][2]
    return s

model = DFineForObjectDetection.from_pretrained(a.start, use_safetensors=True).to(dev)
model.train()
ema = copy.deepcopy(model).eval()
for p in ema.parameters(): p.requires_grad_(False)
back = [p for n, p in model.named_parameters() if 'backbone' in n]
rest = [p for n, p in model.named_parameters() if 'backbone' not in n]
opt = torch.optim.AdamW([{'params': back, 'lr': a.lr * 0.5}, {'params': rest, 'lr': a.lr}], weight_decay=1e-4)
steps = a.runder * math.ceil(len(items) / a.batch); warm = min(300, steps // 10)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / steps))))

r0 = evaluate(model); c0 = evaluate_coco(model); r0['coco'] = c0
print('før:', fmt(r0), f'| coco 0,3: {c0["tp"]}/{c0["tp"] + c0["fn"]} (+{c0["fp"]})', flush=True)
best = score(r0) + 2 * (c0['tp'] - 0.25 * c0['fp']); json.dump({'for': r0}, open(os.path.join(a.ut, 'logg.json'), 'w'))
log = {'for': r0, 'runder': []}
step, t0 = 0, time.time()
for ep in range(a.runder):
    random.shuffle(items)
    tot, n = 0, 0
    for i in range(0, len(items), a.batch):
        xs, ls = [], []
        for it in items[i:i + a.batch]:
            img = Image.open(it['path']).convert('RGB')
            x, l = prep(img, it['crop'], it['dark'], it['boxes'], True)
            xs.append(x); ls.append({k: v.to(dev) for k, v in l.items()})
        out = model(pixel_values=torch.stack(xs).to(dev), labels=ls)
        loss = out.loss
        opt.zero_grad(); loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 0.1)
        opt.step(); sched.step(); step += 1
        with torch.no_grad():
            d = min(0.999, (1 + step) / (10 + step))
            for pe, pm in zip(ema.parameters(), model.parameters()): pe.mul_(d).add_(pm.detach(), alpha=1 - d)
            for be, bm in zip(ema.buffers(), model.buffers()): be.copy_(bm)
        tot += float(loss); n += 1
        if step % 50 == 0: print(f'runde {ep + 1} steg {step}/{steps} tap {tot / n:.3f} · {time.time() - t0:.0f} s', flush=True)
    r = evaluate(ema); c = evaluate_coco(ema); r['coco'] = c
    sc = score(r) + 2 * (c['tp'] - 0.25 * c['fp'])
    print(f'runde {ep + 1}: {fmt(r)} | coco 0,3: {c["tp"]}/{c["tp"] + c["fn"]} (+{c["fp"]})', flush=True)
    ema.save_pretrained(os.path.join(a.ut, f'r{ep + 1}'))
    log['runder'].append(r); json.dump(log, open(os.path.join(a.ut, 'logg.json'), 'w'))
    if sc > best:
        best = sc; ema.save_pretrained(os.path.join(a.ut, 'best'))
        print(f'  ny beste ({sc:.0f}), lagret', flush=True)
ema.save_pretrained(os.path.join(a.ut, 'siste'))
print('ferdig', flush=True)
