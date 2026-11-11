# Trener TwinLiteNet+ large fra bunnen av på comma10k (MIT), uten BDD100K. Samme inn- og utdata som Lanes.mlmodelc:
# 640x384 RGB 0-1 (et 16:9-bånd skalert til 640x360 med 12 grå rader over og under), ut feltlinje og vei.
# Kjøres fra en arbeidsmappe med data/ (se prep.py og connect.py). Skriver best.pth, last.pth, final.pth og train.log der.
# 1. Fra bunnen av, etiketter som comma10k:   KJ_LBL=lbl python train.py --epochs 22 --low 16
# 2. Etterlæring på hele linjer (connect.py):  python train.py --init best.pth --epochs 9 --low 6 --lr 4e-4
# Måling: python train.py --eval vekter.pth   |   Fart: python train.py --bench   |   Fortsett etter stopp: --resume
# KJ_AUG=2: trener også med regn, vindusvisker, motlys, tåke, skygger og speiling i ruta (se weather).
# KJ_HARD=1: måler på testbildene med de samme forstyrrelsene, én fast per bilde.
# KJ_A2D2=mappe: tar også med A2D2-bildene (prep_a2d2.py) i treningen. Sammen med KJ_TEST=a2d2 måles det på
# A2D2-turene som er holdt utenfor (test_scenes.json) i stedet for på comma10k.
import os, sys, math, time, json, random, argparse, copy, numpy as np, torch, torch.nn.functional as F
from PIL import Image, ImageFilter, ImageDraw
from scipy.ndimage import uniform_filter1d
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))   # tln_model.py ligger i mappen over
import tln_model as T

DATA = 'data'
# Etiketter: lbl2 = strekene i stiplede linjer bundet sammen (connect.py), lbl = som comma10k (bare malingen).
# Miljøvariabel, så den også gjelder i datalasterens egne prosesser.
LBL = os.environ.get('KJ_LBL', 'lbl2')
AUG = os.environ.get('KJ_AUG', '1')
HARD = os.environ.get('KJ_HARD')
A2D2 = os.environ.get('KJ_A2D2')
TEST = os.environ.get('KJ_TEST')
FX = 910.0                # comma two-kameraet: 1164x874, brennvidde 910 px (65 grader bredt)
HOOD = None

def hood():
    global HOOD
    if HOOD is None:
        HOOD = json.load(open(f'{DATA}/hood.json'))
        if A2D2: HOOD.update({f'{A2D2}|{n}': h for n, h in json.load(open(f'{A2D2}/hood.json')).items()})   # navn: mappe|bilde
    return HOOD

def split():
    names = sorted(n for n in hood() if '|' not in n)
    tr, te = [n for i, n in enumerate(names) if i % 20], [n for i, n in enumerate(names) if i % 20 == 0]
    if A2D2:   # A2D2 er film: hele turer holdes utenfor, ellers ligner testbildene på nabobildene i treningen
        held = set(json.load(open(f'{A2D2}/test_scenes.json'))); a = sorted(n for n in hood() if '|' in n)
        tr += [n for n in a if n.split('|')[1][:14] not in held]
        if TEST == 'a2d2': te = [n for n in a if n.split('|')[1][:14] in held]
    return tr, te

def band(W, H, hood_y, rng, train):
    """Utsnitt som telefonens veibånd: hele bredden av et stående 16:9-bilde (rundt 42 grader), 16:9, og
    nederst ved panserkanten slik appens bånd ender ved dashbordkanten."""
    if train:
        fov = rng.uniform(34 if AUG == '1' else 30, 58)   # telefonen ser veien litt nærmere enn 34 grader gir
        w = min(W, 2 * FX * math.tan(math.radians(fov / 2))); h = w * 9 / 16
        x0 = (W - w) / 2 + rng.uniform(-0.5, 0.5) * (W - w)
        y1 = (hood_y + rng.uniform(-0.10, 0.05)) * H
    else:
        w = 2 * FX * math.tan(math.radians(21)); h = w * 9 / 16; x0 = (W - w) / 2; y1 = hood_y * H
    y1 = min(H, max(h, y1))
    return (x0, y1 - h, x0 + w, y1)

def photometric(x, rng, nrng):
    x = x * rng.uniform(0.6, 1.3) + rng.uniform(-0.08, 0.08)
    m = x.mean(); x = (x - m) * rng.uniform(0.7, 1.3) + m
    g = x.mean(axis=2, keepdims=True); x = g + (x - g) * rng.uniform(0.5, 1.4)
    if rng.random() < 0.3:   # mørke: mørkt og støyete bilde, lysnet med gamma slik appen gjør i mørket
        x = np.clip(x, 0, 1) * rng.uniform(0.12, 0.45) + nrng.normal(0, rng.uniform(0.004, 0.02), x.shape)
        x = np.clip(x, 0, 1) ** rng.uniform(0.45, 0.8)
    return np.clip(x, 0, 1).astype(np.float32)

def u8(x): return Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8))

def blob(h, w, cx, cy, sx, sy):
    y = np.arange(h, dtype=np.float32)[:, None]; x = np.arange(w, dtype=np.float32)[None]
    return np.exp(-((x - cx) ** 2 / (2 * sx * sx) + (y - cy) ** 2 / (2 * sy * sy)))

def darken(x, rng, nrng):
    x = np.clip(x, 0, 1) * rng.uniform(0.12, 0.45) + nrng.normal(0, rng.uniform(0.004, 0.02), x.shape)
    return np.clip(x, 0, 1) ** rng.uniform(0.45, 0.8)

def shadows(x, rng):
    """Skygger over veien (trær, bruer, stolper): mørke felt med myke kanter, flate fordi de ligger på bakken."""
    h, w = x.shape[:2]; im = Image.new('L', (w, h), 0); dr = ImageDraw.Draw(im)
    for _ in range(rng.randint(2, 9)):
        cx = rng.uniform(-0.1, 1.1) * w; cy = rng.uniform(0.35, 1.0) * h
        a = rng.uniform(0, math.pi); L = rng.uniform(0.2, 0.9) * w; t = rng.uniform(0.01, 0.12) * w
        dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2 * 0.35; nx, ny = -math.sin(a) * t / 2, math.cos(a) * t / 2 + 1
        dr.polygon([(cx - dx - nx, cy - dy - ny), (cx + dx - nx, cy + dy - ny), (cx + dx + nx, cy + dy + ny), (cx - dx + nx, cy - dy + ny)], fill=255)
    m = np.asarray(im.filter(ImageFilter.GaussianBlur(rng.uniform(1, 5) * w / 640)), np.float32)[..., None] / 255
    return x * (1 - m * rng.uniform(0.3, 0.65))

def glare(x, rng, dark):
    """Motlys: billykter i mørket eller lav sol. Lys kjerne, glorie og av og til en stripe bortover."""
    h, w = x.shape[:2]; add = np.zeros((h, w), np.float32)
    for _ in range(rng.randint(1, 4) if dark else 1):
        cx = rng.uniform(0.05, 0.95) * w; cy = rng.uniform(0.15, 0.6) * h
        s = rng.uniform(0.004, 0.016) * w if dark else rng.uniform(0.03, 0.08) * w
        add += rng.uniform(0.8, 2.0) * blob(h, w, cx, cy, s, s)
        g = s * rng.uniform(5, 12); add += rng.uniform(0.1, 0.5) * blob(h, w, cx, cy, g, g)
        if rng.random() < 0.4: add += rng.uniform(0.1, 0.4) * blob(h, w, cx, cy, s * rng.uniform(15, 40), s * rng.uniform(0.4, 1.0))
    return x + add[..., None] * np.array([1.0, rng.uniform(0.9, 1.0), rng.uniform(0.7, 1.0)], np.float32)

def haze(x, rng, dark):
    """Tåke, regnrøyk eller skitten rute: mindre kontrast, mest langt framme."""
    h = x.shape[0]
    a = rng.uniform(0.15, 0.6) * (0.4 + 0.6 * np.clip(1.3 - np.arange(h, dtype=np.float32) / h * 1.6, 0, 1))[:, None, None]
    return x * (1 - a) + a * (rng.uniform(0.1, 0.3) if dark else rng.uniform(0.55, 0.9))

def reflection(x, rng, nrng):
    """Dashbordet som speiler seg i frontruta: et svakt, uskarpt mønster oppå bildet, av og til med en tydelig form (et ark)."""
    h, w = x.shape[:2]; c = rng.randint(3, 9)
    g = (nrng.random((max(2, c * h // w + 1), c + 1)) * 255).astype(np.uint8)
    m = np.asarray(Image.fromarray(g).resize((w, h), Image.BICUBIC), np.float32) / 255
    if rng.random() < 0.5:
        im = Image.new('L', (w, h), 0); cx, cy = rng.uniform(0.1, 0.9) * w, rng.uniform(0.3, 0.9) * h
        ImageDraw.Draw(im).polygon([(cx + rng.uniform(-0.25, 0.25) * w, cy + rng.uniform(-0.2, 0.2) * h) for _ in range(4)], fill=255)
        m = np.maximum(m * 0.5, np.asarray(im.filter(ImageFilter.GaussianBlur(rng.uniform(1, 4))), np.float32) / 255)
    tint = np.array([rng.uniform(0.7, 1), rng.uniform(0.7, 1), rng.uniform(0.6, 1)], np.float32)
    return x + m[..., None] * rng.uniform(0.04, 0.2) * tint

def rain(x, rng):
    """Regn på ruta: dråper som gjør bildet uskarpt i flekker, og av og til vindusviskeren som en mørk stripe."""
    h, w = x.shape[:2]
    soft = np.asarray(u8(x).filter(ImageFilter.GaussianBlur(rng.uniform(2, 5) * w / 640)), np.float32) / 255
    im = Image.new('L', (w, h), 0); dr = ImageDraw.Draw(im)
    for _ in range(rng.randint(15, 140)):
        cx, cy = rng.uniform(0, w), rng.uniform(0, h); r = rng.uniform(0.004, 0.022) * w; e = rng.uniform(1, 1.6)
        dr.ellipse([cx - r, cy - r * e, cx + r, cy + r * e], fill=255)
    m = np.asarray(im.filter(ImageFilter.GaussianBlur(1)), np.float32)[..., None] / 255
    x = x * (1 - m) + (soft * rng.uniform(0.9, 1.25) + rng.uniform(0, 0.04)) * m
    if rng.random() < 0.35:   # viskeren svinger om et punkt under bildet
        im = Image.new('L', (w, h), 0); px = rng.uniform(-0.2, 1.2) * w; py = h * rng.uniform(1.0, 1.5); a = math.radians(rng.uniform(-80, 80))
        ImageDraw.Draw(im).line([(px, py), (px + math.sin(a) * 2 * w, py - math.cos(a) * 2 * w)], fill=255, width=max(3, int(rng.uniform(0.012, 0.04) * w)))
        m = np.asarray(im.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 6))), np.float32)[..., None] / 255
        x = x * (1 - m * rng.uniform(0.6, 0.95))
    return x

def soften(x, rng):
    """Uskarpt av bevegelse (bortover eller nedover) eller av lav oppløsning."""
    h, w = x.shape[:2]
    if rng.random() < 0.5: return uniform_filter1d(x, rng.randint(3, 9), axis=rng.choice((0, 1)), mode='nearest')
    f = rng.uniform(0.4, 0.7)
    return np.asarray(u8(x).resize((int(w * f), int(h * f)), Image.BILINEAR).resize((w, h), Image.BILINEAR), np.float32) / 255

KINDS = ('regn', 'motlys', 'tåke', 'skygger', 'speiling')
def weather(x, rng, nrng, kind=None):
    """Lys og farge som photometric, og i tillegg det en telefon bak frontruta møter: skygger, motlys, tåke, speiling
    og regn. kind=None: tilfeldig utvalg (trening). Ellers akkurat den ene forstyrrelsen (testen med KJ_HARD)."""
    on = lambda p, k: (rng.random() < p) if kind is None else (kind == k)
    dark = float(x.mean()) < 0.24
    if on(0.15, 'skygger') and (not dark or kind): x = shadows(x, rng)
    if kind is None:
        x = x * rng.uniform(0.6, 1.3) + rng.uniform(-0.08, 0.08)
        m = x.mean(); x = (x - m) * rng.uniform(0.7, 1.3) + m
        g = x.mean(axis=2, keepdims=True); x = g + (x - g) * rng.uniform(0.5, 1.4)
        if rng.random() < 0.3: x = darken(x, rng, nrng); dark = True
    elif kind == 'motlys' and not dark and rng.random() < 0.6: x = darken(x, rng, nrng); dark = True
    if on(0.25 if dark else 0.06, 'motlys'): x = glare(x, rng, dark)
    if on(0.10, 'tåke'): x = haze(x, rng, dark)
    if on(0.12, 'speiling'): x = reflection(x, rng, nrng)
    if on(0.12, 'regn'): x = rain(x, rng)
    if kind is None and rng.random() < 0.1: x = soften(x, rng)
    if kind is None and rng.random() < 0.3: x = x + nrng.normal(0, rng.uniform(0.003, 0.015), x.shape)
    return np.clip(x, 0, 1).astype(np.float32)

class DS(torch.utils.data.Dataset):
    def __init__(s, names, train, low=False): s.names, s.train, s.low = names, train, low
    def __len__(s): return len(s.names)
    def __getitem__(s, i):
        rng = random.Random() if s.train else random.Random(i)
        nrng = np.random.default_rng(rng.getrandbits(32))
        n = s.names[i]; root, f = n.split('|') if '|' in n else (DATA, n)
        im = Image.open(f'{root}/img/{f}.jpg').convert('RGB'); lb = Image.open(f'{root}/{LBL}/{f}.png')
        box = band(*im.size, hood()[n], rng, s.train)
        if s.train and rng.random() < 0.5:   # telefonen står sjelden helt rett
            ang = rng.uniform(-4, 4); c = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
            im = im.rotate(ang, Image.BILINEAR, center=c); lb = lb.rotate(ang, Image.NEAREST, center=c)
        im = im.crop(box).resize((640, 360), Image.BILINEAR)
        lb = lb.crop(box).resize((640, 360), Image.NEAREST)
        W, H, P = (480, 270, 9) if s.low else (640, 360, 12)
        y = np.asarray(lb)
        if s.low:   # 3/4 størrelse i de første rundene: linjene gjøres 2 px tykkere på hver side før de krympes
            lane = Image.fromarray(((y == 2) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).resize((W, H), Image.BOX)
            road = Image.fromarray((((y == 1) | (y == 2)) * 255).astype(np.uint8)).resize((W, H), Image.BOX)
            y = (np.asarray(road) > 127).astype(np.uint8); y[np.asarray(lane) > 76] = 2
            im = im.resize((W, H), Image.BILINEAR)
        if s.train and rng.random() < 0.1: im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 1.5)))
        x = np.asarray(im, np.float32) / 255
        if s.train:
            if rng.random() < 0.5: x, y = x[:, ::-1], y[:, ::-1]
            x = photometric(x, rng, nrng) if AUG == '1' else weather(x, rng, nrng)
        elif HARD: x = weather(x, rng, nrng, KINDS[i % len(KINDS)])
        X = np.full((H + 2 * P, W, 3), 114 / 255, np.float32); X[P:P + H] = x
        Y = np.zeros((H + 2 * P, W), np.uint8); Y[P:P + H] = y
        return torch.from_numpy(X).permute(2, 0, 1).contiguous(), torch.from_numpy(Y.astype(np.int64))

def seg_loss(logits, t, w_pos):
    """Vektet kryssentropi + Dice per bilde. Stabilt fra bunnen av: Tversky alene på tynne linjer ga ustabil trening
    (forsøk 2 sluttet å lære etter runde 4 og fikk ugyldige tall i runde 9 med halv presisjon)."""
    logits = logits.float()
    ce = F.cross_entropy(logits, t, weight=torch.tensor([1.0, w_pos], device=logits.device))
    p = F.softmax(logits, 1)[:, 1]; tf = t.float()
    dice = 1 - (2 * (p * tf).sum((1, 2)) + 1) / (p.sum((1, 2)) + tf.sum((1, 2)) + 1)
    return ce + dice.mean()

def runs(row, maxw=None, minw=1):
    on = np.concatenate([[False], row, [False]]); d = np.diff(on.astype(np.int8))
    st, en = np.where(d == 1)[0], np.where(d == -1)[0]
    return [(a, b) for a, b in zip(st, en) if b - a >= minw and (maxw is None or b - a <= maxw)]

def centre_run(row):
    best, bd = None, 1e9
    for a, b in runs(row, minw=8):
        dd = 0 if a <= 320 < b else min(abs(a - 320), abs(b - 320))
        if dd < bd: best, bd = (a, b), dd
    return best

def score(L, R, Y):
    """Som appen leser svaret (LaneDetector.swift): midten av hver linjebit hver 2. rad, og veikantene rundt midten hver 4. rad."""
    s = dict(tp=0, fp=0, fn=0, inter=0, union=0, edge=0.0, edges=0, miss=0, rows=0)
    gl, gr = Y == 2, (Y == 1) | (Y == 2)
    for r in range(12, 372, 2):
        p = [(a + b) / 2 for a, b in runs(L[r], 60)]; g = [(a + b) / 2 for a, b in runs(gl[r], 60)]
        used = set()
        for x in p:
            j = min((j for j in range(len(g)) if j not in used), key=lambda j: abs(g[j] - x), default=None)
            if j is not None and abs(g[j] - x) <= 8: used.add(j); s['tp'] += 1
            else: s['fp'] += 1
        s['fn'] += len(g) - len(used)
    s['inter'] += int((R & gr).sum()); s['union'] += int((R | gr).sum())
    for r in range(12, 372, 4):
        g = centre_run(gr[r])
        if not g: continue
        s['rows'] += 1; p = centre_run(R[r])
        if not p: s['miss'] += 1; continue
        s['edge'] += (abs(p[0] - g[0]) + abs(p[1] - g[1])) / 2; s['edges'] += 1
    return s

def evaluate(model, names, dev):
    model.eval(); tot = None
    dl = torch.utils.data.DataLoader(DS(names, False), batch_size=16, num_workers=8)
    with torch.no_grad():
        for X, Y in dl:
            da, ll = model(X.to(dev))
            L = (ll[:, 1] > ll[:, 0]).cpu().numpy(); R = (da[:, 1] > da[:, 0]).cpu().numpy()
            for i in range(len(X)):
                s = score(L[i], R[i], Y[i].numpy())
                tot = s if tot is None else {k: tot[k] + s[k] for k in tot}
    p = tot['tp'] / max(1, tot['tp'] + tot['fp']); r = tot['tp'] / max(1, tot['tp'] + tot['fn'])
    return dict(lane_p=round(p, 3), lane_r=round(r, 3), lane_f1=round(2 * p * r / max(1e-9, p + r), 3),
                road_iou=round(tot['inter'] / max(1, tot['union']), 3), edge_px=round(tot['edge'] / max(1, tot['edges']), 1),
                edge_miss=round(tot['miss'] / max(1, tot['rows']), 3))

class EMA:
    """Glidende snitt av vektene: jevnere og som regel litt bedre enn de siste vektene."""
    def __init__(s, model, decay=0.999): s.m = copy.deepcopy(model).eval(); s.decay = decay; s.n = 0
    @torch.no_grad()
    def update(s, model):
        s.n += 1; d = min(s.decay, (1 + s.n) / (10 + s.n))
        for (k, v), (_, w) in zip(s.m.state_dict().items(), model.state_dict().items()):
            if v.dtype.is_floating_point: v.mul_(d).add_(w.detach(), alpha=1 - d)
            else: v.copy_(w)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--epochs', type=int, default=28); ap.add_argument('--low', type=int, default=20)
    ap.add_argument('--bench', action='store_true'); ap.add_argument('--eval'); ap.add_argument('--resume', action='store_true')
    ap.add_argument('--init', help='start fra disse vektene (etterlæring) i stedet for fra bunnen av')
    ap.add_argument('--bs', type=int, default=32); ap.add_argument('--lr', type=float, default=1e-3)
    ap.add_argument('--amp', action='store_true'); ap.add_argument('--workers', type=int, default=10); ap.add_argument('--cfg', default='large')
    a = ap.parse_args(); dev = 'mps'
    tr, va = split()
    if a.eval:
        m = T.load(a.cfg, a.eval).to(dev)
        print(json.dumps({'weights': a.eval, 'n': len(va), **evaluate(m, va, dev)})); sys.exit()
    torch.manual_seed(0)
    model = T.TwinLiteNetPlus(a.cfg).to(dev); ema = EMA(model)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    per = len(tr) // a.bs; total = a.epochs * per; warm = 400
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * (0.01 + 0.99 * 0.5 * (1 + math.cos(math.pi * min(1, s / total)))))
    if a.init:
        sd = torch.load(a.init, map_location='cpu', weights_only=True); model.load_state_dict(sd); ema.m.load_state_dict(sd)
        print('starter fra', a.init, flush=True)
    best = -1; start = 0
    if a.resume and os.path.exists('last.pth'):
        ck = torch.load('last.pth', map_location='cpu', weights_only=True)
        model.load_state_dict(ck['model']); ema.m.load_state_dict(ck['ema']); ema.n = ck['ema_n']; opt.load_state_dict(ck['opt']); sched.load_state_dict(ck['sched'])
        start = ck['epoch']; best = ck['best']; print('fortsetter etter runde', start, flush=True)
    mk = lambda low: torch.utils.data.DataLoader(DS(tr, True, low), batch_size=a.bs, shuffle=True, num_workers=a.workers, drop_last=True, persistent_workers=True, prefetch_factor=4)
    dl = None; cur_low = None; t0 = time.time(); step = 0; bad = 0
    print(f'{len(tr)} trening, {len(va)} test, {per} steg per runde, {a.low} runder i 3/4 størrelse av {a.epochs}, etiketter {LBL}', flush=True)
    for ep in range(start, a.epochs):
        low = ep < a.low
        if low != cur_low: del dl; dl = mk(low); cur_low = low
        model.train(); run_loss = 0
        for X, Y in dl:
            X, Y = X.to(dev), Y.to(dev)
            lane = (Y == 2).float()[:, None]
            if not low: lane = F.max_pool2d(lane, 5, 1, 2)   # linjene 2 px tykkere på hver side: comma10k-linjene er 2-6 px, og
                                                            # modellen (laget for BDD100Ks tykke linjer) tegner ikke så tynt. Appen bruker bare midten.
            lane = lane[:, 0].long(); road = ((Y == 1) | (Y == 2)).long()
            with torch.autocast('mps', dtype=torch.float16, enabled=a.amp):
                da, ll = model(X)
            loss = seg_loss(ll, lane, 4.0) + seg_loss(da, road, 1.0)
            if not torch.isfinite(loss):
                bad += 1; print('tapet er ikke et tall, hopper over steget', flush=True); opt.zero_grad(set_to_none=True)
                if bad > 20: print('AVBRUTT: for mange ugyldige steg', flush=True); sys.exit(3)
                continue
            opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); ema.update(model); step += 1
            run_loss += loss.item()
            if a.bench and step in (15, 45):
                if step == 15: tb = time.time()
                else: print(f'{(time.time() - tb) / 30:.3f} s per steg (lav={low}), tap {run_loss / step:.3f}', flush=True); sys.exit()
        ev = evaluate(ema.m, va, dev)
        rec = {'epoch': ep + 1, 'low': low, 'loss': round(run_loss / max(1, per), 4), 'min': round((time.time() - t0) / 60, 1), **ev}
        print(json.dumps(rec), flush=True)
        with open('train.log', 'a') as f: f.write(json.dumps(rec) + '\n')
        sc = ev['lane_f1'] + ev['road_iou']
        if not low and sc > best: best = sc; torch.save(ema.m.state_dict(), 'best.pth')
        torch.save({'model': model.state_dict(), 'ema': ema.m.state_dict(), 'ema_n': ema.n, 'opt': opt.state_dict(), 'sched': sched.state_dict(), 'epoch': ep + 1, 'best': best}, 'last.pth')
    torch.save(ema.m.state_dict(), 'final.pth'); print('ferdig', flush=True)
