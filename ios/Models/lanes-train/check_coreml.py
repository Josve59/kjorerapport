# Core ML fp16 mot PyTorch fp32 på testbilder: andel like piksler for feltlinje og vei
# python check_coreml.py vekter.pth Lanes.mlpackage
import sys, time, numpy as np, torch, coremltools as ct
from PIL import Image
from train import DS, split   # train først: den legger mappen med tln_model.py i søkestien
import tln_model as T
_, va = split(); ds = DS(va[::8], False)
m = T.load('large', sys.argv[1]); ml = ct.models.MLModel(sys.argv[2], compute_units=ct.ComputeUnit.CPU_AND_GPU)
same_l = same_r = tot = 0; lane_px = lane_same = 0; ms = []
for i in range(len(ds)):
    X, _ = ds[i]
    with torch.no_grad(): da, ll = m(X[None])
    L = (ll[0, 1] > ll[0, 0]).numpy(); R = (da[0, 1] > da[0, 0]).numpy()
    img = Image.fromarray((X.permute(1, 2, 0).numpy() * 255).round().astype(np.uint8))
    t0 = time.time(); r = ml.predict({'image': img}); ms.append((time.time() - t0) * 1000)
    L2 = r['lanes'][0, 0] > 0; R2 = r['road'][0, 0] > 0
    same_l += (L == L2).sum(); same_r += (R == R2).sum(); tot += L.size
    lane_px += (L | L2).sum(); lane_same += (L & L2).sum()
print(f'{len(ds)} bilder: feltlinje-piksler like {100 * same_l / tot:.3f} %, vei-piksler like {100 * same_r / tot:.3f} %, '
      f'linjepiksler felles {100 * lane_same / max(1, lane_px):.1f} %, {np.median(ms[3:]):.1f} ms per bilde (Mac GPU)')
