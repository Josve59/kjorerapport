# Binder sammen strekene i stiplede linjer: data/lbl -> data/lbl2 (samme koder, 2 = feltlinje).
# comma10k merker bare selve malingen, så en stiplet linje er adskilte biter. Appen trenger linjen i hvert bilde
# (dagens modell, trent på BDD100K, tegner stiplede linjer hele), så mellomrommene fylles her før treningen:
# en bit bindes til neste bit oppover når den ligger i bitens retning, mellomrommet ikke er lengre enn et vanlig
# opphold (høyst 4 ganger bitens lengde og rundt 18 m på bakken), og det er vei hele veien mellom dem.
# python connect.py            (alle bildene)
# python connect.py navn ...   (bare disse, og skriver antall bindinger)
import os, sys, math, numpy as np
from multiprocessing import Pool
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
SRC = 'data/lbl'; DST = 'data/lbl2'
FH = 910.0 * 1.3                        # brennvidde · kamerahøyde (omtrent)

def vanish(P, H):
    """Forsvinningspunktet: der linjene gjennom bitene møtes (minste kvadrater, én runde uten de som bommer mest).
    Horisonten varierer mye mellom bilene (kameraet står ulikt), så den må finnes i hvert bilde."""
    R = [p for p in P if p['rel'] and p['len'] >= 12 and abs(p['d'][1]) > 0.25]
    def solve(R):
        M = np.zeros((2, 2)); v = np.zeros(2)
        for p in R:
            Q = np.eye(2) - np.outer(p['d'], p['d']); c = (p['up'] + p['dn']) / 2; w = min(p['len'], 200.0)
            M += w * Q; v += w * (Q @ c)
        if len(R) < 2 or np.linalg.cond(M) > 300: return None
        return np.linalg.solve(M, v)
    x = solve(R)
    if x is None: return None
    keep = [p for p in R if abs((x - (p['up'] + p['dn']) / 2) @ np.array([-p['d'][1], p['d'][0]])) < 40]
    x2 = solve(keep)
    if x2 is not None: x = x2
    return x if 0.2 * H < x[1] < 0.75 * H else None

def parts(lane):
    lab, n = ndi.label(lane, structure=np.ones((3, 3), int)); out = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        ys, xs = np.nonzero(lab[sl] == i + 1)
        if len(ys) < 5: continue
        ys = ys + sl[0].start; xs = xs + sl[1].start
        mx, my = xs.mean(), ys.mean()
        c = np.cov(np.stack([xs - mx, ys - my])); w, v = np.linalg.eigh(c); d = v[:, 1]
        if d[1] > 0: d = -d             # oppover i bildet
        t = (xs - mx) * d[0] + (ys - my) * d[1]; ln = t.max() - t.min() + 1; wid = len(ys) / ln
        c0 = np.array([mx, my])
        def end(sign):
            tt = t * sign; e = tt.max()
            if ln < 120:                # en strek: enden ligger på midtlinjen, og retningen er strekens egen
                return c0 + d * sign * e, d, wid
            # En lang linje kan bue: retning og ende fra den siste biten
            a = 40.0; n1 = tt >= e - a; n2 = (tt < e - a) & (tt >= e - 2.5 * a)
            c1 = np.array([xs[n1].mean(), ys[n1].mean()]); c2 = np.array([xs[n2].mean(), ys[n2].mean()])
            q = c1 - c2; q = q / (np.hypot(*q) + 1e-9)
            p = c1 + q * ((xs[n1] - c1[0]) * q[0] + (ys[n1] - c1[1]) * q[1]).max()
            return p, q * sign, max(1.5, n1.sum() / (a + 1))    # retningen peker alltid oppover langs linjen
        up, dup, wu = end(1); dn, ddn, wd = end(-1)
        out.append(dict(id=i + 1, up=up, dn=dn, dup=dup, ddn=ddn, wu=wu, wd=wd, len=ln, w=wid, d=d,
                        rel=bool(ln >= 10 and ln >= 2 * wid)))
    return lab, out

def connect(lbl):
    lane = lbl == 2
    if not lane.any(): return lbl, 0
    lab, P = parts(lane); H, W = lbl.shape; vp = vanish(P, H)
    used_up, used_dn, links = set(), set(), []
    inherit = {}
    for _ in range(6):
        cand = []
        for A in P:
            if A['id'] in used_up: continue
            # Korte biter langt framme har usikker egen retning: da gjelder retningen fra biten under i samme linje
            dA = inherit[A['id']] if A['id'] in inherit and A['len'] < 40 else (A['dup'] if A['rel'] else None)
            if dA is None: continue
            # Lengste opphold: 4 ganger bitens lengde i bildet, og i høyden det 18 m på bakken blir på denne avstanden
            if vp is None: cap = 2.5 * A['len'] + 4; capv = cap      # ukjent horisont: bare korte opphold
            else:
                u = max(5.0, A['up'][1] - vp[1])
                cap = 4 * A['len'] + 4; capv = 18 * u * u / (FH + 12 * u) + 15
            for B in P:
                if B is A or B['id'] in used_dn: continue
                g = B['dn'] - A['up']; G = float(np.hypot(*g))
                if G < 1.5 or G > cap or abs(g[1]) > capv: continue
                if g @ dA <= 0: continue
                if abs(g[0] * dA[1] - g[1] * dA[0]) > max(2.5, 0.12 * G): continue
                if B['len'] >= 15 and B['rel'] and abs(g[0] * B['ddn'][1] - g[1] * B['ddn'][0]) / G > 0.22: continue
                if B['len'] > 2.5 * A['len'] + 10: continue      # en kort bit nederst styrer ikke en lang linje lenger opp
                n = max(3, int(G)); ok = 0; hit = False
                for k in range(1, n):
                    x = A['up'][0] + g[0] * k / n; y = A['up'][1] + g[1] * k / n
                    xi, yi = int(round(x)), int(round(y))
                    if not (0 <= xi < W and 0 <= yi < H): continue
                    v = lbl[yi, xi]
                    if v == 1 or v == 2: ok += 1
                    o = lab[yi, xi]
                    if o and o != A['id'] and o != B['id']: hit = True; break
                if hit or ok < 0.85 * (n - 1): continue
                cand.append((G, A, B, g))
        if not cand: break
        new = 0
        for G, A, B, g in sorted(cand, key=lambda c: c[0]):
            if A['id'] in used_up or B['id'] in used_dn: continue
            used_up.add(A['id']); used_dn.add(B['id']); links.append((A, B)); new += 1
            inherit[B['id']] = g / G
        if not new: break
    if not links: return lbl, 0
    im = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(im)
    for A, B in links:
        g = B['dn'] - A['up']; G = np.hypot(*g); nrm = np.array([-g[1], g[0]]) / G
        a0 = A['up'] - g / G * 1.0; b0 = B['dn'] + g / G * 1.0
        wa = max(2.0, A['wu']); wb = max(2.0, min(B['wd'], wa))
        dr.polygon([tuple(a0 - nrm * wa / 2), tuple(a0 + nrm * wa / 2), tuple(b0 + nrm * wb / 2), tuple(b0 - nrm * wb / 2)], fill=255)
    out = lbl.copy(); out[(np.asarray(im) > 0) & (lbl == 1)] = 2
    return out, len(links)

def one(name):
    lbl = np.asarray(Image.open(f'{SRC}/{name}'))
    out, n = connect(lbl)
    Image.fromarray(out).save(f'{DST}/{name}')
    return n

if __name__ == '__main__':
    os.makedirs(DST, exist_ok=True)
    names = [a if a.endswith('.png') else a + '.png' for a in sys.argv[1:]] or sorted(os.listdir(SRC))
    with Pool(14) as p: res = p.map(one, names, chunksize=16)
    print(len(names), 'bilder,', sum(res), 'bindinger,', sum(1 for r in res if r), 'bilder med minst én')
