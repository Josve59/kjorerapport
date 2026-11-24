# Funnet og ekstra ved ulike grenser, mot to store modeller, på testturen (test-1933.json fra kjor.py).
#   python sveip.py test-1933.json [navn ...]               navn = modeller som alt er kjørt (small, medium)
#   python sveip.py test-1933.json --modell ny=run1/siste    kjører en lagret modell først (samme utsnitt som appen)
import sys, os, json
import numpy as np, torch
from PIL import Image

args = sys.argv[1:]
path = args.pop(0)
T = json.load(open(path)); root = T.get('root', os.path.dirname(os.path.abspath(path)))
extra_models = []
while '--modell' in args:
    i = args.index('--modell'); extra_models.append(args[i + 1].split('=')); args = args[:i] + args[i + 2:]
names = args or ['small', 'medium']
GROUP = {'car': 'v', 'truck': 'v', 'bus': 'v', 'motorcycle': 'v', 'person': 'p', 'bicycle': 'b'}
COCO = {0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}

if extra_models:
    import torch.nn.functional as F
    from transformers import DFineForObjectDetection
    from transformers.models.d_fine import modeling_d_fine as M
    def _integral(self, pc, project):
        b, q, _ = pc.shape
        p = F.softmax(pc.reshape(-1, self.max_num_bins + 1), dim=1)
        return torch.matmul(p, project.to(p.device).reshape(-1, 1)).reshape(b, q, 4)
    M.DFineIntegral.forward = _integral
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
    for name, mp in extra_models:
        m = DFineForObjectDetection.from_pretrained(mp, use_safetensors=True).eval().to(dev)
        for k, f in T['frames'].items():
            sx, sy, sw, sh = f['crop']
            im = Image.open(os.path.join(root, k)).convert('RGB').crop((sx, sy, sx + sw, sy + sh)).resize((640, 640), Image.BILINEAR)
            a = np.asarray(im, dtype=np.float32) / 255.
            if f['dark']: a = np.power(a, 0.5)
            with torch.no_grad():
                o = m(pixel_values=torch.from_numpy(a).permute(2, 0, 1)[None].to(dev))
            p = o.logits.sigmoid()[0].float().cpu(); b = o.pred_boxes[0].float().cpu()
            dets = []
            for q in range(p.shape[0]):
                for ci, cn in COCO.items():
                    s = float(p[q, ci])
                    if s < 0.1: continue
                    cx, cy, bw, bh = b[q].tolist()
                    dets.append({'cls': cn, 'score': s, 'x': sx + (cx - bw / 2) * sw, 'y': sy + (cy - bh / 2) * sh, 'w': bw * sw, 'h': bh * sh})
            f[name] = dets
        names.append(name)

def iou(a, b):
    ix = max(0, min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x'])); iy = max(0, min(a['y'] + a['h'], b['y'] + b['h']) - max(a['y'], b['y']))
    i = ix * iy; u = a['w'] * a['h'] + b['w'] * b['h'] - i
    return i / u if u > 0 else 0

def run(name, tv, tp):
    out = {}
    for ref in ['ref', 'obj']:
        r = {g: [0, 0, 0] for g in 'vp'}
        for f in T['frames'].values():
            W = f['W']
            mine = sorted([d for d in f[name] if d['w'] <= 0.7 * W and GROUP[d['cls']] in 'vp' and (d['score'] >= (tp if d['cls'] == 'person' else tv)) and (d['cls'] != 'person' or d['h'] / max(d['w'], 1) <= 4.5)], key=lambda d: -d['score'])
            truth = [t for t in f[ref] if t['score'] >= 0.5 and t['w'] <= 0.7 * W and GROUP[t['cls']] in 'vp']
            used = set()
            for d in mine:
                g = GROUP[d['cls']]; best, bi = 0, -1
                for i, t in enumerate(truth):
                    if i in used or GROUP[t['cls']] != g: continue
                    v = iou(d, t)
                    if v > best: best, bi = v, i
                if best >= 0.5: used.add(bi); r[g][0] += 1
                elif not any(GROUP[t['cls']] == g and t['score'] >= 0.3 and iou(d, t) >= 0.3 for t in f[ref]): r[g][2] += 1
            for t in truth: r[GROUP[t['cls']]][1] += 1
        out[ref] = r
    return out

for name in names:
    print(f'\n== {name}')
    for tv, tp in [(0.2, 0.3), (0.25, 0.35), (0.3, 0.4), (0.35, 0.5), (0.45, 0.6)]:
        o = run(name, tv, tp)
        s = ' | '.join(f"{ref}: kjøretøy {round(100 * o[ref]['v'][0] / o[ref]['v'][1])} % (+{o[ref]['v'][2]}) folk {round(100 * o[ref]['p'][0] / max(1, o[ref]['p'][1]))} % (+{o[ref]['p'][2]})" for ref in ['ref', 'obj'])
        print(f'  grense {tv}/{tp}: {s}')
