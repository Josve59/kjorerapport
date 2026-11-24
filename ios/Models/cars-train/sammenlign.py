# Hvor godt finner appens bilmodell (small) bilene og folkene som en stor modell finner, på veibildene fra telefonen?
#   python sammenlign.py maal-a.json [modell ...]       (standard: small medium)
# Fasit: den store modellen (ref) med score ≥ 0,5. Appens grenser (road.js): kjøretøy ≥ 0,35, person ≥ 0,5 og ikke
# for smal (h/w ≤ 4,5). Bilens egen panser (bredere enn 70 % av bildet) tas bort, som i appen.
import sys, json
from collections import defaultdict

path = sys.argv[1]
names = sys.argv[2:] or ['small', 'medium']
R = json.load(open(path))['frames']
GROUP = {'car': 'kjøretøy', 'truck': 'kjøretøy', 'bus': 'kjøretøy', 'motorcycle': 'kjøretøy', 'person': 'person', 'bicycle': 'sykkel'}

def keep(d, W, thr_v=0.35, thr_p=0.5):
    if d['w'] > 0.7 * W:
        return False
    if d['cls'] == 'person':
        return d['score'] >= thr_p and d['h'] / max(d['w'], 1) <= 4.5
    return d['score'] >= thr_v

def iou(a, b):
    ix = max(0, min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x']))
    iy = max(0, min(a['y'] + a['h'], b['y'] + b['h']) - max(a['y'], b['y']))
    i = ix * iy
    u = a['w'] * a['h'] + b['w'] * b['h'] - i
    return i / u if u > 0 else 0

def size(d):
    h = d['h']
    return '<20 px' if h < 20 else '20–40 px' if h < 40 else '40–80 px' if h < 80 else '≥80 px'

for name in names:
    hit = defaultdict(lambda: [0, 0])     # nøkkel → [funnet, fasit]
    extra = defaultdict(int); kept = defaultdict(int)
    for k, f in R.items():
        W = f['W']
        truth = [d for d in f['ref'] if d['score'] >= 0.5 and d['w'] <= 0.7 * W]
        mine = sorted([d for d in f[name] if keep(d, W)], key=lambda d: -d['score'])
        used = set()
        for d in mine:
            kept[GROUP[d['cls']]] += 1
            best, bi = 0, -1
            for i, t in enumerate(truth):
                if i in used or GROUP[t['cls']] != GROUP[d['cls']]:
                    continue
                v = iou(d, t)
                if v > best:
                    best, bi = v, i
            if best >= 0.5:
                used.add(bi)
            else:
                # Ekstra bare hvis den store modellen ikke ser noe der heller (score ≥ 0,3)
                if not any(GROUP[t['cls']] == GROUP[d['cls']] and t['score'] >= 0.3 and iou(d, t) >= 0.3 for t in f['ref']):
                    extra[GROUP[d['cls']]] += 1
        light = 'mørkt' if f['dark'] else 'lyst'
        for i, t in enumerate(truth):
            g = GROUP[t['cls']]
            for key in [(g,), (g, size(t)), (g, light)]:
                hit[key][1] += 1
                if i in used:
                    hit[key][0] += 1
    print(f'\n== {name} mot den store modellen ({len(R)} bilder)')
    for g in ['kjøretøy', 'person', 'sykkel']:
        a, b = hit[(g,)]
        if not b:
            continue
        parts = [f'{s} {hit[(g, s)][0]}/{hit[(g, s)][1]}' for s in ['<20 px', '20–40 px', '40–80 px', '≥80 px'] if hit[(g, s)][1]]
        lights = [f'{l} {round(100 * hit[(g, l)][0] / hit[(g, l)][1])} %' for l in ['lyst', 'mørkt'] if hit[(g, l)][1]]
        print(f'  {g:9} funnet {a}/{b} = {round(100 * a / b)} % · ' + ' · '.join(parts) + ' · ' + ' · '.join(lights) + f' · ekstra (ingen i fasiten) {extra[g]} av {kept[g]}')
