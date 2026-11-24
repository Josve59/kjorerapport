# Kjører D-FINE-modeller på veibildene fra telefonen, med samme utsnitt og lysning som appen (RoadDetector.swift):
# et kvadrat på bildets bredde rett over dashbordkanten (roadBottom), skalert til 640x640, gamma 0,5 i mørket.
# Skriver boksene i bildets piksler til <ut>.json. Ingen posisjoner finnes i bildene.
#   python kjor.py <ut.json> navn=modell-id ... -- <økt-mappe> ... [--hver N]
import sys, os, json, glob, time
import numpy as np, torch
from PIL import Image
from transformers import DFineForObjectDetection

args = sys.argv[1:]
out_path = args.pop(0)
sep = args.index('--')
specs, rest = args[:sep], args[sep + 1:]
every = 1
if '--hver' in rest:
    i = rest.index('--hver'); every = int(rest[i + 1]); rest = rest[:i] + rest[i + 2:]
dirs = rest
COCO = {0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
models = {}
for s in specs:
    k, v = s.split('=')
    models[k] = DFineForObjectDetection.from_pretrained(v, use_safetensors=True).eval().to(dev)

def crop_for(w, h, rb):
    if h > w and rb is not None:
        s = w
        return 0, round(max(0, min(h - s, rb * h - 0.9 * s))), s, s
    if h > w:
        return 0, round((h - w) * 0.5), w, w
    return 0, 0, w, h

frames = []
for d in dirs:
    fs = sorted(glob.glob(os.path.join(d, 'f*.jpg')) or glob.glob(os.path.join(d, '*.jpg')))[::every]
    frames += fs
res = {'models': specs, 'root': os.path.abspath(os.path.dirname(dirs[0]) or '.'), 'frames': {}}
t0 = time.time()
for n, f in enumerate(frames):
    meta = json.load(open(f[:-4] + '.json')) if os.path.exists(f[:-4] + '.json') else {}   # comma10k har ingen
    img = Image.open(f).convert('RGB')
    W, H = img.size
    sx, sy, sw, sh = crop_for(W, H, meta.get('roadBottom'))
    im = img.crop((sx, sy, sx + sw, sy + sh)).resize((640, 640), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32) / 255.
    if meta.get('dark'):
        a = np.power(a, 0.5)   # som CIGammaAdjust 0,5 i appen
    x = torch.from_numpy(a).permute(2, 0, 1)[None].to(dev)
    row = {'dark': bool(meta.get('dark')), 'kmh': meta.get('kmh'), 'crop': [sx, sy, sw, sh], 'W': W, 'H': H, 'phone': (meta.get('cars') or {}).get('dets'), 'ageMs': meta.get('carsAgeMs')}
    for k, m in models.items():
        with torch.no_grad():
            o = m(pixel_values=x)
        p = o.logits.sigmoid()[0].float().cpu()
        b = o.pred_boxes[0].float().cpu()
        dets = []
        for q in range(p.shape[0]):
            for ci, name in COCO.items():
                sc = float(p[q, ci])
                if sc < 0.15:
                    continue
                cx, cy, bw, bh = b[q].tolist()
                dets.append({'cls': name, 'score': round(sc, 3), 'x': round(sx + (cx - bw / 2) * sw, 1), 'y': round(sy + (cy - bh / 2) * sh, 1), 'w': round(bw * sw, 1), 'h': round(bh * sh, 1)})
        row[k] = dets
    res['frames'][os.path.relpath(f, os.path.dirname(dirs[0]) or '.')] = row
    if n % 100 == 0:
        print(f'{n}/{len(frames)} bilder, {time.time() - t0:.0f} s', flush=True)
json.dump(res, open(out_path, 'w'))
print(f'ferdig: {len(frames)} bilder på {time.time() - t0:.0f} s → {out_path}')
