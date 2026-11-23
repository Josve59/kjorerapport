# Måler feltmodeller på eierens merkede veibilder som er holdt utenfor (samme utvalg som finetune_norge.py --hold),
# og eventuelt bare bildene fra en posisjon og ut (--fra 100: bilder en eldre modell ikke ble trent på).
# Kjøres fra .local-test/lanes-comma/:
#   ~/.local/mlenv/bin/python -W ignore ../../ios/Models/lanes-train/eval_norge.py --okt ../veibilder/<økt> --hold 5 --fra 100 n2=n2/best.pth ny=norge2/best.pth
import os, sys, json, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import finetune_norge as FN
import tln_model as T

ap = argparse.ArgumentParser()
ap.add_argument('--okt', nargs='+', required=True); ap.add_argument('--hold', type=int, default=5); ap.add_argument('--fra', type=int, default=1)
ap.add_argument('modeller', nargs='+', help='navn=vekter.pth')
a = ap.parse_args(); dev = 'mps'
items = FN.samples(a.okt)
test = [s for k, s in enumerate(items) if k % a.hold == a.hold - 1]
order = {}
for d in a.okt:
    for i, f in enumerate(json.load(open(os.path.abspath(d) + '-merk/forslag.json'))['frames']): order[f'{os.path.basename(os.path.abspath(d))}/{f["id"]}'] = i + 1
test = [s for s in test if order[s['id']] >= a.fra]
start = T.load('large', a.modeller[0].split('=', 1)[1]).to(dev)
xs = [FN.band_img(s) for s in test]
for s in test: s['lane'] = FN.lane_mask(s)
ds = FN.NorDS(test, xs, FN.pseudo_road(start, xs, dev), False)
print(f'{len(test)} bilder holdt utenfor (fra posisjon {a.fra})')
for m in a.modeller:
    name, path = m.split('=', 1)
    print(name.ljust(12), json.dumps(FN.eval_ds(T.load('large', path).to(dev), ds, dev)), flush=True)
