import sys, time, torch, numpy as np, coremltools as ct
from transformers import DFineForObjectDetection
import torch.nn.functional as F
from transformers.models.d_fine import modeling_d_fine as M
def _integral(self, pred_corners, project):
    b, q, _ = pred_corners.shape
    p = F.softmax(pred_corners.reshape(-1, self.max_num_bins + 1), dim=1)
    return torch.matmul(p, project.reshape(-1, 1)).reshape(b, q, 4)
M.DFineIntegral.forward = _integral   # F.linear med 1D-vekt kan ikke konverteres
mid, out = sys.argv[1], sys.argv[2]
model = DFineForObjectDetection.from_pretrained(mid, anchor_image_size=[640, 640]).eval()
class Wrap(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, x):
        o = s.m(pixel_values=x)
        return o.logits, o.pred_boxes
w = Wrap(model).eval()
x = torch.rand(1, 3, 640, 640)
with torch.no_grad():
    ref = w(x)
    tr = torch.jit.trace(w, x, strict=False)
print('traced', mid, sum(p.numel() for p in model.parameters()) / 1e6, 'M params')
ml = ct.convert(tr, inputs=[ct.ImageType(name='image', shape=(1, 3, 640, 640), scale=1 / 255.0, color_layout=ct.colorlayout.RGB)],
                outputs=[ct.TensorType(name='logits'), ct.TensorType(name='boxes')],
                minimum_deployment_target=ct.target.iOS17, compute_precision=ct.precision.FLOAT16, convert_to='mlprogram')
ml.short_description = f'D-FINE ({mid}), Apache 2.0. Input 640x640 RGB. Outputs logits [1,300,80], boxes cx,cy,w,h 0-1.'
ml.save(out)
print('saved', out)
