# D-FINE for the road camera (Core ML)

`DFine.mlmodelc` is **D-FINE xlarge, trained on Objects365 and COCO** (COCO AP about 59). It comes from [Peterande/D-FINE](https://github.com/Peterande/D-FINE) under Apache 2.0, via Hugging Face `ustc-community/dfine-xlarge-obj2coco`. It is compiled for Core ML (fp16, iOS 17+).

- **Input:** `image`, 640×640 RGB (values 0–1, no normalisation).
- **Output:** `logits` [1, 300, 80] (COCO classes) and `boxes` [1, 300, 4] (cx, cy, w, h, 0–1). `RoadDetector.swift` decodes them the same way as `kamera/js/dfine.js`.

**The weights are split into three parts.** `weights/weight.bin` is 120 MB, and GitHub refuses files over 100 MB. So it is stored as `weight.bin.part00–02`. `copy-web.sh` joins them into the app at build time.

**How it was made** (`convert-dfine.py`, Python 3.9, torch 2.8, transformers 4.57, coremltools 9.0):

```
python convert-dfine.py ustc-community/dfine-xlarge-obj2coco DFine.mlpackage
xcrun coremlcompiler compile DFine.mlpackage .
cd DFine.mlmodelc/weights && split -b 45m -d -a 2 weight.bin weight.bin.part && rm weight.bin
```

Two changes were needed for the conversion:
- `anchor_image_size=[640, 640]`: the anchors are computed once instead of inside the model.
- `DFineIntegral` uses `matmul` instead of `F.linear` with a 1-D weight, which coremltools cannot convert.

**Checked against PyTorch fp32** on 42 night snapshots from the drives on 2 Nov (boxes from 0.4, same class and overlap over 0.7):

| Model | Speed on the M5 Pro GPU | Same as PyTorch |
| --- | --- | --- |
| small | 5 ms | 55 of 56 |
| medium | 7 ms | 83 of 85 |
| large | 9.5 ms | 66 of 66 |
| xlarge | 15 ms | 57 of 57 |

- The Neural Engine took 84–209 ms, much slower, so the app uses the GPU (or «all», whichever is faster on the phone).
- 8-bit weights halved the size but matched only 52 of 57.
