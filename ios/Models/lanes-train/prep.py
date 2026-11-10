# comma10k (MIT) -> bilder (JPEG, full størrelse) og etiketter (PNG: 0 = annet, 1 = vei, 2 = feltlinje, 3 = egen bil).
# Farger fra comma10k/README: vei #402020, feltlinjer #ff0000 (ikke piler og gangfelt), egen bil #cc00ff.
# hood.json: hvor panseret begynner (andel av høyden), så treningsutsnittet kan ende ved panserkanten slik appens
# veibånd ender ved dashbordkanten.
import os, json, numpy as np
from multiprocessing import Pool
from PIL import Image
SRC = 'raw'; DST = 'data'
def one(name):
    out_i = f'{DST}/img/{name[:-4]}.jpg'; out_m = f'{DST}/lbl/{name}'
    try:
        im = Image.open(f'{SRC}/imgs/{name}').convert('RGB')
        mk = np.asarray(Image.open(f'{SRC}/masks/{name}').convert('RGB'))
    except Exception as e:
        return name, 'bad', None
    if mk.shape[:2] != (im.size[1], im.size[0]): return name, 'size', None
    r, g, b = mk[..., 0].astype(int), mk[..., 1].astype(int), mk[..., 2].astype(int)
    lbl = np.zeros(mk.shape[:2], np.uint8)
    lbl[(abs(r - 0x40) < 8) & (abs(g - 0x20) < 8) & (abs(b - 0x20) < 8)] = 1
    lbl[(r > 200) & (g < 60) & (b < 60)] = 2
    lbl[(abs(r - 0xcc) < 8) & (g < 8) & (b > 247)] = 3
    car = (lbl == 3).mean(axis=1); H = len(car); top = H
    while top > 0 and car[top - 1] >= 0.5: top -= 1      # nederste sammenhengende del der egen bil fyller minst halve raden
    if not os.path.exists(out_i): im.save(out_i, quality=92)
    if not os.path.exists(out_m): Image.fromarray(lbl).save(out_m)
    return name, 'ok', round(top / H, 4)
if __name__ == '__main__':
    os.makedirs(f'{DST}/img', exist_ok=True); os.makedirs(f'{DST}/lbl', exist_ok=True)
    names = sorted(n for n in os.listdir(f'{SRC}/masks') if n.endswith('.png') and os.path.exists(f'{SRC}/imgs/{n}'))
    with Pool(14) as p: res = p.map(one, names, chunksize=32)
    hood = {n[:-4]: h for n, s, h in res if s == 'ok'}
    json.dump(hood, open(f'{DST}/hood.json', 'w'))
    v = np.array(list(hood.values()))
    print(len(names), 'bilder;', len(hood), 'ok;', [(n, s) for n, s, _ in res if s != 'ok'][:5])
    print('panserkant, andel av høyden: median %.2f, 5-95 %% %.2f-%.2f, uten panser %d' % (np.median(v), np.percentile(v, 5), np.percentile(v, 95), int((v >= 0.999).sum())))
