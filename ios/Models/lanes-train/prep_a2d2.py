# A2D2 fra Audi (CC BY-ND 4.0, tyske veier) -> samme form som prep.py lager av comma10k:
# data/img (JPEG), data/lbl (PNG: 0 = annet, 1 = vei, 2 = feltlinje, 3 = egen bil) og data/hood.json.
# Leser rett fra tar-filen (camera_lidar_semantic_bboxes.tar, 52 GB, 12 497 bilder fra frontkameraet), så de 38 GB
# med PNG-bilder aldri pakkes ut. Bildene er som kameraet tok dem, med tønneforvrengning: de rettes opp og skaleres
# til brennvidde 910 px, som comma10k-bildene, så utsnittene i train.py blir like for begge.
# Kjøres i en egen arbeidsmappe med raw/<tar-filen>:   python prep_a2d2.py [antall]   (antall = bare de første, for prøve)
# Etterpå: connect.py (lbl -> lbl2) i samme mappe. Testbildene er hele kjøreturer (test_scenes.json), ikke hvert 20. bilde.
import os, sys, io, json, math, tarfile, threading, numpy as np
from scipy import ndimage as ndi
from multiprocessing import Pool
from PIL import Image
TAR = 'raw/camera_lidar_semantic_bboxes.tar'; DST = 'data'
# Frontkameraet, fra cams_lidars.json: CamMatrixOriginal og Distortion (OpenCV-modellen, bare k1)
FXO, FYO, CXO, CYO, K1 = 1844.1774, 1841.5212, 964.4299, 679.5332, -0.2611313
F2 = 1820.0                                  # rettet bilde i dobbel størrelse, halveres til slutt
def straight(d):
    """Fra forvrengt til rett koordinat langs en akse gjennom bildesenteret: løser x(1 + k1 x²) = d."""
    x = d
    for _ in range(20): x -= (x * (1 + K1 * x * x) - d) / (1 + 3 * K1 * x * x)
    return x
# Det største rette utsnittet uten svarte kanter: fra midten av hver bildekant (der rettingen trekker bildet lengst inn)
XL, XR = straight(-CXO / FXO), straight((1920 - CXO) / FXO); YT, YB = straight(-CYO / FYO), straight((1208 - CYO) / FYO)
CX2, CY2 = -F2 * XL, -F2 * YT; W2, H2 = int(F2 * (XR - XL)) // 2 * 2, int(F2 * (YB - YT)) // 2 * 2
ROAD = ('RD normal street', 'Zebra crossing', 'Painted driv. instr.', 'Drivable cobblestone', 'Slow drive area',
        'RD restricted area', 'Speed bumper')      # veiflaten slik comma10k merker den: alt en kan kjøre på, også maling som ikke er linjer
LANE = ('Solid line', 'Dashed line')
EGO = ('Ego car',)

def mesh(n=64):
    """Nett for PIL: hver rute i det rettede bildet hentes fra en firkant i det forvrengte."""
    xs = np.round(np.linspace(0, W2, n + 1)).astype(int); ys = np.round(np.linspace(0, H2, round(n * H2 / W2) + 1)).astype(int)
    def src(u, v):
        x, y = (u - CX2) / F2, (v - CY2) / F2; k = 1 + K1 * (x * x + y * y)
        return FXO * x * k + CXO, FYO * y * k + CYO
    return [((int(x0), int(y0), int(x1), int(y1)), (*src(x0, y0), *src(x0, y1), *src(x1, y1), *src(x1, y0)))
            for y0, y1 in zip(ys[:-1], ys[1:]) for x0, x1 in zip(xs[:-1], xs[1:])]
MESH = mesh()

def codes(class_list):
    """Fargene i etikettbildene -> våre koder."""
    out = {}
    for hexc, name in class_list.items():
        base = name.rstrip(' 0123456789')
        c = 2 if base in LANE else 1 if base in ROAD else 3 if base in EGO else 0
        if c: out[int(hexc[1:], 16)] = c
    return out

def across(lbl):
    """Linjer på tvers av veien (stopplinjer, kanten av gangfelt) er feltlinjer i A2D2. Appen skal bare ha linjene langs
    veien, og comma10k har nesten ingen på tvers, så de gjøres om til vei: rette, smale biter som ligger under
    10 grader fra vannrett, og alle vannrette strekk på minst 56 px (der en tverrlinje henger sammen med en feltlinje)."""
    lane = lbl == 2; lab, _ = ndi.label(lane, np.ones((3, 3)))
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = np.nonzero(lab[sl] == i)
        if len(xs) < 30: continue
        w, v = np.linalg.eigh(np.cov(np.vstack([xs, ys]))); d = v[:, 1]
        ang = abs(math.degrees(math.atan2(d[1], d[0]))); ang = min(ang, 180 - ang)
        if 4 * math.sqrt(w[1]) >= 40 and w[1] >= 16 * max(w[0], 0.25) and ang < 10: lbl[sl][lab[sl] == i] = 1
    lane = lbl == 2; on = np.diff(np.pad(lane, ((0, 0), (1, 1))).astype(np.int8), axis=1)
    for (r, a), (_, b) in zip(np.argwhere(on == 1), np.argwhere(on == -1)):
        if b - a >= 56: lbl[r, a:b] = 1
    return lbl

def one(job):
    kind, name, data, lut = job
    try:
        im = Image.open(io.BytesIO(data)).convert('RGB')
    except Exception:
        return kind, name, None
    if im.size != (1920, 1208): return kind, name, None
    if kind == 'img':
        out = im.transform((W2, H2), Image.MESH, MESH, Image.BILINEAR).reduce(2)
        out.save(f'{DST}/img/{name}.jpg', quality=92)
        return kind, name, 0
    a = np.asarray(im.transform((W2, H2), Image.MESH, MESH, Image.NEAREST)).astype(np.int32)
    key = (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
    full = np.zeros(key.shape, np.uint8)
    for k, c in lut.items(): full[key == k] = c
    # Halvering: en rute er linje når minst en fjerdedel av den er det (tynne linjer langt framme skal ikke forsvinne),
    # ellers det det er mest av.
    q = full.reshape(H2 // 2, 2, W2 // 2, 2).transpose(0, 2, 1, 3).reshape(H2 // 2, W2 // 2, 4)
    lane = (q == 2).sum(2); road = ((q == 1) | (q == 2)).sum(2); ego = (q == 3).sum(2)
    lbl = np.zeros(lane.shape, np.uint8); lbl[road >= 2] = 1; lbl[ego >= 2] = 3; lbl[lane >= 1] = 2
    lbl = across(lbl)
    car = (lbl == 3).mean(axis=1); H = len(car); top = H
    # Panseret: nederste sammenhengende del der egen bil fyller minst halve raden
    while top > 0 and car[top - 1] >= 0.5: top -= 1
    # Frontkameraet ser ikke panseret: da er verdien 1, og utsnittet ender ved bildekanten. Horisonten havner rundt 37 %
    # fra toppen av utsnittet, omtrent som i comma10k (telefonens veibånd har den ved 21 %: ingen av kameraene ser så langt ned).
    Image.fromarray(lbl).save(f'{DST}/lbl/{name}.png')
    return kind, name, round(top / H, 4)

GATE = threading.BoundedSemaphore(60)     # ikke les mer av tar-filen inn i minnet enn arbeiderne rekker å ta unna
def jobs(limit):
    lut = None; n = 0
    with tarfile.open(TAR) as tf:
        for m in tf:
            p = m.name.split('/')
            if m.name.endswith('class_list.json'): lut = codes(json.load(tf.extractfile(m))); continue
            if not m.isfile() or not m.name.endswith('.png') or len(p) < 5 or p[3] != 'cam_front_center': continue
            kind = 'img' if p[2] == 'camera' else 'lbl' if p[2] == 'label' else None
            if not kind: continue
            scene, _, _, num = p[4][:-4].split('_'); name = f'{scene}_{num}'
            if os.path.exists(f'{DST}/img/{name}.jpg' if kind == 'img' else f'{DST}/lbl/{name}.png') and kind == 'img': continue
            GATE.acquire()
            yield kind, name, tf.extractfile(m).read(), lut
            n += 1
            if limit and n >= limit: return

if __name__ == '__main__':
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    os.makedirs(f'{DST}/img', exist_ok=True); os.makedirs(f'{DST}/lbl', exist_ok=True)
    hood = {}; bad = []; ni = 0
    with Pool(10) as p:
        for kind, name, r in p.imap_unordered(one, jobs(limit)):
            GATE.release()
            if r is None: bad.append(name)
            elif kind == 'lbl': hood[name] = r
            else: ni += 1
            if (ni + len(hood)) % 2000 == 0: print(ni, 'bilder,', len(hood), 'etiketter', flush=True)
    hood = {n: h for n, h in hood.items() if os.path.exists(f'{DST}/img/{n}.jpg')}
    json.dump(hood, open(f'{DST}/hood.json', 'w'))
    v = np.array(list(hood.values())); scenes = sorted({n[:14] for n in hood})
    print(len(hood), 'bilder med etikett;', len(bad), 'ubrukelige;', len(scenes), 'turer')
    print('panserkant, andel av høyden: median %.2f, 5-95 %% %.2f-%.2f' % (np.median(v), np.percentile(v, 5), np.percentile(v, 95)))
    for s in scenes: print(s, sum(1 for n in hood if n[:14] == s))
