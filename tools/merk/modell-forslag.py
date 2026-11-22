# Bedre forslag til feltlinjer (1.0.5): feltmodellen (n2) kjøres på nytt på Macen på hvert veibilde, med hele
# sannsynlighetskartet i stedet for punktene appen lagret, og speilvendt i tillegg (snittet demper støy). Stripene
# tilpasses jevne kurver, stiplede linjer bindes sammen, kurvene forlenges så langt modellen har støtte innenfor
# veien, og legges til slutt på malingen i bildet (lyse striper, gul farge for midtlinjen).
# Eierens første godkjente bilder 22. nov. viste at de gamle forslagene var korte biter, ofte litt ved siden av
# malingen; eieren tegner lange, jevne linjer fra panseret opp mot der veien forsvinner.
#   ~/.local/mlenv/bin/python -I tools/merk/modell-forslag.py .local-test/veibilder/<økt> [vekter.pth]
# Skriver nye linjer inn i <økt>-merk/forslag.json (de gamle tas vare på under «gamle»). Godkjente bilder røres ikke.
import sys, os, json
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'ios', 'Models'))
import torch
import tln_model as T

d = os.path.abspath(sys.argv[1])
wts = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, '.local-test', 'lanes-comma', 'n2', 'best.pth')
merk = d + '-merk'; ff = os.path.join(merk, 'forslag.json')
# Test: KJ_ALLE=1 tar også godkjente bilder, KJ_UT=<fil> skriver dit i stedet for forslag.json
ALLE = os.environ.get('KJ_ALLE') == '1'; UT = os.environ.get('KJ_UT') or ff
F = json.load(open(ff))
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
model = T.load('large', wts).to(dev)
W, H, P = 640, 360, 12

def run(band):
    """Lane- og vei-sannsynlighet (360×640) for et bånd (PIL, RGB), snitt av vanlig og speilvendt"""
    x = np.asarray(band.resize((W, H), Image.BILINEAR), np.float32) / 255
    X = np.full((H + 2 * P, W, 3), 114 / 255, np.float32); X[P:P + H] = x
    t = torch.from_numpy(np.stack([X, X[:, ::-1].copy()])).permute(0, 3, 1, 2).contiguous().to(dev)
    with torch.no_grad():
        da, ll = model(t)
        lp = torch.softmax(ll.float(), 1)[:, 1].cpu().numpy(); rp = torch.softmax(da.float(), 1)[:, 1].cpu().numpy()
    # Speilvendt: snitt (demper støy), maks, eller av (bare vanlig). Velges med KJ_TTA, standard «snitt»
    tta = os.environ.get('KJ_TTA', 'snitt')
    lane = lp[0] if tta == 'av' else np.maximum(lp[0], lp[1][:, ::-1]) if tta == 'maks' else (lp[0] + lp[1][:, ::-1]) / 2
    road = (rp[0] + rp[1][:, ::-1]) / 2
    return lane[P:P + H], road[P:P + H]

def runs(row, thr):
    on = np.concatenate([[False], row > thr, [False]]); dd = np.diff(on.astype(np.int8))
    return list(zip(np.where(dd == 1)[0], np.where(dd == -1)[0]))

def chains(pts):
    """Punkter (x, y, p) kjedes nedenfra og opp; samme regel som forslag.mjs, tettere punkter"""
    pts = sorted(pts, key=lambda q: (-q[1], q[0])); open_ = []
    for p in pts:
        best, bd = None, 1e9
        for c in open_:
            e = c[-1]; dy = e[1] - p[1]
            if dy < 0.5 or dy > 10: continue
            q = c[max(0, len(c) - 8)]
            slope = (e[0] - q[0]) / (e[1] - q[1]) if len(c) > 3 and e[1] != q[1] else 0
            dd = abs(p[0] - (e[0] + slope * (p[1] - e[1])))
            if dd < max(3, dy * 1.5) and dd < bd: bd, best = dd, c
        if best is not None: best.append(p)
        else: open_.append([p])
    return [c for c in open_ if len(c) >= 6]

def fit(c, deg=2):
    """Vektet polynom x(y) (grad 2, eller 1 for korte biter)"""
    a = np.array(c); ys, xs, w = a[:, 1], a[:, 0], a[:, 2]
    deg = deg if ys.max() - ys.min() > 60 else 1
    return np.polyfit(ys, xs, deg, w=w)

def join(cs):
    """Biter som ligger på forlengelsen av hverandre (stiplet linje, eller hull i mørket) bindes sammen"""
    cs = sorted(cs, key=lambda c: -max(q[1] for q in c)); changed = True
    while changed:
        changed = False
        for i in range(len(cs)):
            for j in range(len(cs)):
                if i == j: continue
                a, b = cs[i], cs[j]
                atop = min(q[1] for q in a); bbot = max(q[1] for q in b)
                gap = atop - bbot
                if gap < -4 or gap > 140: continue
                pa = fit(a, 1); x_at = np.polyval(pa, bbot)
                bx = [q[0] for q in b if q[1] >= bbot - 3]
                if abs(x_at - np.mean(bx)) <= 6 + 0.08 * max(0, gap):
                    cs[i] = a + b; cs.pop(j); changed = True; break
            if changed: break
    return cs

def ridge_snap(img, xs, ys, yellow_w):
    """Flytter hvert punkt til malingen innen ±7 px: lys stripe mot asfalten rundt (og gul der midtlinjen er gul)"""
    g = img.mean(2); out = []
    for x, y in zip(xs, ys):
        yi = int(round(y)); x0 = int(round(x))
        if yi < 0 or yi >= g.shape[0]: out.append(x); continue
        lo, hi = max(3, x0 - 7), min(g.shape[1] - 4, x0 + 7)
        if hi <= lo: out.append(x); continue
        row = g[yi]; best, bs = x, -1e9
        for xx in range(lo, hi + 1):
            ridge = row[xx] - 0.5 * (row[xx - 3] + row[xx + 3])
            r, gg, b = img[yi, xx]
            yel = (min(r, gg) - b) * yellow_w
            sc = ridge + yel - 0.4 * abs(xx - x)
            if sc > bs: bs, best = sc, xx
        out.append(best if bs > 4 else x)
    return np.array(out, float)

def paint_map(img, dark):
    """Hvor det ser ut som maling: lys stripe mot asfalten rundt (tre bredder, linjene er bredere nær bilen) og gul
    farge (midtlinjen). 0–2 per piksel. img: RGB float 0–255, hele bildet."""
    x = img / 255
    if dark: x = x ** 0.6
    g = x.mean(2) * 255
    ridge = np.zeros_like(g)
    for w in (3, 6, 10):
        l = np.roll(g, w, 1); r = np.roll(g, -w, 1)
        ridge = np.maximum(ridge, g - 0.5 * (l + r) - 0.25 * np.abs(l - r))   # lysere enn begge sider, ikke et trinn
    R, G, B = x[..., 0] * 255, x[..., 1] * 255, x[..., 2] * 255
    # Gult målt mot veien rett ved siden av (±30 px): gatelysene gjør hele veien gulaktig (turen 22. nov.)
    from scipy.ndimage import uniform_filter1d
    yel = np.minimum(R, G) - B
    yellow = yel - uniform_filter1d(yel, 61, axis=1) - 4
    bright = g - uniform_filter1d(g, 61, axis=1) - 4
    return np.clip(ridge / 35, 0, 1) + np.clip(yellow / 18, 0, 1) + 0.5 * np.clip(bright / 30, 0, 1)

def along(pm, X, Y):
    xs = np.clip(np.round(X).astype(int), 0, pm.shape[1] - 1); ys = np.clip(np.round(Y).astype(int), 0, pm.shape[0] - 1)
    return float(pm[ys, xs].mean())

def shift_to_paint(pm, X, Y, vh):
    """Flytter hele linjen sidelengs til malingen: k piksler nederst, mindre oppover mot horisonten (perspektiv).
    Modellen la ofte midtlinjen 10–20 px ved siden av den gule malingen (eierens bilder 22. nov.)."""
    ys = np.linspace(Y.min(), Y.max(), 40); xs = np.interp(ys, Y[::-1] if Y[0] > Y[-1] else Y, X[::-1] if Y[0] > Y[-1] else X)
    f = (ys - vh) / max(1, Y.max() - vh)
    s0 = along(pm, xs, ys); best, bk = s0, 0
    # Vris rundt forsvinningspunktet: modellens midtlinje bommet med opptil 76 px nederst, nesten 0 ved horisonten
    for k in range(-80, 81, 2):
        s = along(pm, xs + k * f, ys) - 0.0015 * abs(k)   # litt straff for store flytt: nærmeste maling vinner
        if s > best: best, bk = s, k
    if best < s0 * 1.25 + 0.05: bk = 0   # ingen tydelig bedre plass: bli der modellen sa
    return X + bk * (Y - vh) / max(1, Y.max() - vh), max(best, s0)

stats = {'bilder': 0, 'linjer': 0}
for fr in F['frames']:
    if not ALLE and os.path.exists(os.path.join(merk, fr['id'] + '.json')): continue   # godkjent av eieren: røres ikke
    meta = json.load(open(os.path.join(d, fr['id'] + '.json'))); L = meta['lanes']
    y0, y1 = L['y0'], L['y1']; gam = L.get('gamma', 1) or 1
    im = Image.open(os.path.join(d, fr['id'] + '.jpg')).convert('RGB')
    band = im.crop((0, y0, 720, y1))
    if gam < 0.99: band = Image.fromarray((255 * (np.asarray(band, np.float32) / 255) ** gam).astype(np.uint8))
    lane, road = run(band)
    sx, sy = 720 / W, (y1 - y0) / H
    # Veien: øverste rad med vei midt i bildet, og der panseret begynner (veien blir smalere nederst)
    wid = (road > 0.5).sum(1); rows = np.where(wid > 20)[0]
    if len(rows) < 10: fr['gamle'] = fr.get('gamle', fr['lines']); fr['lines'] = []; fr['modell'] = {'linjer': 0}; continue
    top = rows.min(); hood = H - 1; mx = 0
    for r in range(top, H):
        if wid[r] > mx: mx = wid[r]
        elif mx > W * 0.25 and wid[r] < 0.8 * mx and r > top + 0.6 * (H - top): hood = r - 2; break
    roadd = np.zeros_like(road, bool)
    for r in range(H):
        on = np.where(road[r] > 0.4)[0]
        if len(on): roadd[r, max(0, on.min() - 14):min(W, on.max() + 15)] = True
    pts = []
    for r in range(top, hood + 1):
        for a, b in runs(lane[r], 0.35):
            if b - a > 40: continue
            seg = lane[r, a:b]; xc = (np.arange(a, b) * seg).sum() / seg.sum()
            if roadd[r, int(xc)]: pts.append((xc, r, float(seg.max())))
    cs = join(chains(pts))
    full = np.asarray(im, np.float32)
    pm = paint_map(full, gam < 0.99 or bool(meta.get('dark')))
    vh = y0 + top * sy - 6   # omtrent horisonten: der veien slutter
    lines = []
    for c in cs:
        a = np.array(c); ylo, yhi = a[:, 1].min(), a[:, 1].max()
        if yhi - ylo < 14 or a[:, 2].mean() < float(os.environ.get('KJ_MINP', '0.5')): continue
        pf = fit(c)
        # Forleng opp og ned så lenge kurven ligger på vei og modellen gir litt støtte (hull opp til 40 rader)
        def extend(y, step, lim):
            last, yy = y, y
            while (step < 0 and yy > lim) or (step > 0 and yy < lim):
                yy += step; x = np.polyval(pf, yy)
                if x < 0 or x >= W or not roadd[int(yy), int(x)]: break
                lo, hi = max(0, int(x) - 4), min(W, int(x) + 5)
                if lane[int(yy), lo:hi].max() > 0.2: last = yy
                elif abs(yy - last) > 40: break
            return last
        ytop = extend(ylo, -1, top); ybot = extend(yhi, 1, hood)
        # Ikke tilbake til kurven nedenfor panseret
        ybot = min(ybot, hood)
        if ybot - ytop < 24: continue
        n = int(max(2, min(10, round((ybot - ytop) / 25) + 1)))
        ysm = np.linspace(ybot, ytop, n); xsm = np.polyval(pf, ysm)
        X = xsm * sx; Y = y0 + (ysm + 0.5) * sy
        X, paint = shift_to_paint(pm, X, Y, vh)
        X = ridge_snap(full, X, Y, 1.0)
        # Jevn igjen etter innrettingen
        pp = np.polyfit(Y, X, 2 if Y.max() - Y.min() > 60 else 1); X = np.polyval(pp, Y)
        # Kantlinjer går ofte ut av bildet nederst: kutt linjen ved bildekanten i stedet for å kaste den
        # (kantlinjen langs rekkverket forsvant i f00012 og f00017, der modellen så den tydelig)
        Yf = np.linspace(Y.min(), Y.max(), 200); Xf = np.polyval(pp, Yf); inside = (Xf >= 0) & (Xf <= 720)
        if inside.sum() < 20: continue
        Yi = Yf[inside]; ylo_i, yhi_i = Yi.min(), Yi.max()
        if yhi_i - ylo_i < 24: continue
        n2 = int(max(2, min(10, round((yhi_i - ylo_i) / 28) + 1)))
        Y = np.linspace(yhi_i, ylo_i, n2); X = np.clip(np.polyval(pp, Y), 0, 720)
        # Form: en feltlinje bøyer ikke tilbake og krummer lite på kort strekning (krøllete kurver i f00047, f00077)
        ext = yhi_i - ylo_i
        xm = np.polyval(pp, (ylo_i + yhi_i) / 2); chord = (np.polyval(pp, ylo_i) + np.polyval(pp, yhi_i)) / 2
        if abs(xm - chord) > 0.22 * ext + 8: continue   # mildt: kantlinjer i sving krummer (f00026)
        if len(pp) == 3 and pp[0] != 0:
            yv = -pp[1] / (2 * pp[0])   # der x snur
            if ylo_i + 10 < yv < yhi_i - 10: continue
        # Retning: forlenget opp til der veien slutter, må linjen treffe veien der (en løs bit på tvers gjør ikke det)
        top_img = y0 + (top + 0.5) * sy
        on = np.where(road[top] > 0.5)[0]
        if len(on) and ext < 90:   # bare korte biter: lange linjer i sving peker ikke rett mot enden av veien (f00618)
            p1 = np.polyfit(Y, X, 1); xt = np.polyval(p1, top_img)
            if xt < on.min() * sx - 0.2 * 720 or xt > on.max() * sx + 0.2 * 720: continue
        score = float(a[:, 2].mean()) * min(1, (ybot - ytop) / 120) + 0.5 * min(1, paint)
        lines.append({'pts': [[round(float(x), 1), round(float(y), 1)] for x, y in zip(X, Y)], 'score': round(score, 3)})
    # Nesten samme linje to ganger (to striper i modellen som havnet på samme maling): den beste blir
    def near(p, q):
        py = np.array([v[1] for v in p['pts']]); px = np.array([v[0] for v in p['pts']])
        qy = np.array([v[1] for v in q['pts']]); qx = np.array([v[0] for v in q['pts']])
        lo, hi = max(py.min(), qy.min()), min(py.max(), qy.max())
        if hi - lo < 0.5 * min(py.max() - py.min(), qy.max() - qy.min()): return False
        ys = np.linspace(lo, hi, 20)
        dd = np.abs(np.interp(ys, py[::-1], px[::-1]) - np.interp(ys, qy[::-1], qx[::-1]))
        # Samme linje: tett hele veien, eller tett øverst og bare litt fra hverandre nederst (de møtes mot horisonten)
        return float(dd.mean()) < 14 or (float(dd[:5].mean()) < 10 and float(dd[-5:].mean()) < 24)
    lines.sort(key=lambda l: -l['score']); uniq = []
    for l in lines:
        if not any(near(l, u) for u in uniq): uniq.append(l)
    lines = uniq
    # Linjer som krysser hverandre: den svakeste går ut
    def crosses(p, q):
        ys = sorted(set(int(v[1]) for v in p['pts']) & set(range(int(min(v[1] for v in q['pts'])), int(max(v[1] for v in q['pts'])) + 1)))
        if len(ys) < 8: return False
        fp = np.polyfit([v[1] for v in p['pts']], [v[0] for v in p['pts']], 1); fq = np.polyfit([v[1] for v in q['pts']], [v[0] for v in q['pts']], 1)
        dlt = np.polyval(fp, ys) - np.polyval(fq, ys)
        return np.sign(dlt.min()) != np.sign(dlt.max()) and abs(dlt.min()) > 6 and abs(dlt.max()) > 6
    lines.sort(key=lambda l: -l['score']); keep = []
    for l in lines:
        if any(crosses(l, k) for k in keep): continue
        keep.append(l)
    # Høyst fire linjer: flere er nesten alltid striper og speilinger (sjelden mer enn fire synlige linjer)
    keep = sorted(keep, key=lambda l: -l['score'])[:4]
    fr['gamle'] = fr.get('gamle', fr['lines'])
    fr['lines'] = [{'id': i + 1, 'type': 'ukjent', 'pts': l['pts'], 'score': l['score']} for i, l in enumerate(sorted(keep, key=lambda l: l['pts'][0][0]))]
    fr.pop('fjernet', None); fr.pop('claude', None)
    fr['modell'] = {'linjer': len(fr['lines'])}
    stats['bilder'] += 1; stats['linjer'] += len(fr['lines'])
F['modell'] = {'vekter': os.path.relpath(wts, ROOT), 'laget': __import__('datetime').datetime.now().isoformat(timespec='seconds')}
json.dump(F, open(UT, 'w'))
print(f"{stats['bilder']} bilder fikk nye forslag, {stats['linjer']} linjer")
