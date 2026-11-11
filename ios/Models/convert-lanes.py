import sys, numpy as np, torch, coremltools as ct
from PIL import Image
import tln_model as T
# python convert-lanes.py - lanes-comma10k.pth Lanes.mlpackage [merke]
# merke: for testvekter som ikke er de i git (f.eks. n2). Det lagres som modellens versjon, og LaneDetector.swift sender det
# med i svaret, så eksporten fra en kjøretur viser hvilke vekter som kjørte.
m = T.load('large', sys.argv[2])
class Wrap(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, x):
        da, ll = s.m(x)
        return ll[:, 1:2] - ll[:, 0:1], da[:, 1:2] - da[:, 0:1]   # > 0: feltlinje / kjørbar vei
w = Wrap(m).eval(); x = torch.rand(1, 3, 384, 640)
with torch.no_grad(): tr = torch.jit.trace(w, x)
ml = ct.convert(tr, inputs=[ct.ImageType(name='image', shape=(1, 3, 384, 640), scale=1 / 255.0, color_layout=ct.colorlayout.RGB)],
                outputs=[ct.TensorType(name='lanes'), ct.TensorType(name='road')],
                minimum_deployment_target=ct.target.iOS17, compute_precision=ct.precision.FLOAT16, convert_to='mlprogram')
ml.short_description = 'TwinLiteNet+ large (MIT, chequanghuy/TwinLiteNetPlus), trained from scratch on comma10k (MIT, comma.ai). Input 640x384 RGB. Outputs lanes, road [1,1,384,640]: >0 = lane line / road.'
ml.author = 'Kjorerapport'
if len(sys.argv) > 4:
    ml.version = sys.argv[4]
    ml.short_description = f'TwinLiteNet+ large (MIT, chequanghuy/TwinLiteNetPlus), test weights {sys.argv[4]} (see ios/Models/README.md). Input 640x384 RGB. Outputs lanes, road [1,1,384,640]: >0 = lane line / road.'
ml.save(sys.argv[3])
