# D-FINE for the road camera (Core ML)

`DFine.mlmodelc` is **D-FINE medium, trained on Objects365 and COCO** (COCO AP about 55). Until 0.10.1 it was xlarge (AP about 59).

**Why medium:** on the iPhone, on the drives on 3 Nov, xlarge took 380 ms per frame on a cool phone and 660 ms after 14 minutes (heat). That is only 1.5–2.5 answers a second, and the driver camera slowed down too. On the Mac, medium is 2.2 times faster than xlarge (7 against 15 ms), so it should give about twice as many answers and less heat. It found the same cars on the night snapshots (38 against 39 boxes). It comes from [Peterande/D-FINE](https://github.com/Peterande/D-FINE) under Apache 2.0, via Hugging Face `ustc-community/dfine-medium-obj2coco`. It is compiled for Core ML (fp16, iOS 17+).

- **Input:** `image`, 640×640 RGB (values 0–1, no normalisation).
- **Output:** `logits` [1, 300, 80] (COCO classes) and `boxes` [1, 300, 4] (cx, cy, w, h, 0–1). `RoadDetector.swift` decodes them the same way as `kamera/js/dfine.js`.

**The weights are stored in parts** (`weight.bin.part00`, …) under 50 MB each, because GitHub refuses files over 100 MB. Medium needs only one part (39 MB); xlarge needed three. `copy-web.sh` joins them into the app at build time.

**How it was made** (`convert-dfine.py`, Python 3.9, torch 2.8, transformers 4.57, coremltools 9.0):

```
python convert-dfine.py ustc-community/dfine-medium-obj2coco DFine.mlpackage
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

# Lane lines and the road ahead (Core ML, 0.13.0)

`Lanes.mlmodelc` is **TwinLiteNet+ large** ([chequanghuy/TwinLiteNetPlus](https://github.com/chequanghuy/TwinLiteNetPlus), MIT, 1.94 M parameters, 4 MB), trained on BDD100K (dashcam drives by day and night, in rain and snow). It marks every pixel as lane line or not, and drivable road or not. BDD100K lane IoU 34.2 %, drivable area mIoU 92.9 %.

**Why:** the simple image analysis in the web app (`js/lanes.js`) took kerbs, road edges, guardrails and snow poles for lane lines and flickered. On 168 night frames from 2 Nov the model found the real lines where the old method followed guardrails, and drew nothing on roads without markings instead of a road edge.

- **Input:** `image`, 640×384 RGB (0–1). `LaneDetector.swift` takes a 16:9 band of the portrait road frame right above the dashboard edge, scales it to 640×360 and adds 12 grey rows (114) above and below, as in training.
- **Output:** `lanes` and `road`, [1, 1, 384, 640]: above 0 = lane line / drivable road.
- `LaneDetector.swift` sends the middle of each lane-line run (every 2nd row) and the left and right edge of the road ahead (every 4th row) to the web app, which fits the lane lines from those points (`detectLanes(…, { points })`) and keeps them steady over time.

**How it was made** (Python 3.9, torch 2.8, coremltools 9.0): `tln_model.py` is the model written out again from the project's `model/model.py` (same layer names, so the weights load with `strict=True`); weights `large.pth` from the project's Google Drive, loaded with `weights_only=True`.

```
python convert-lanes.py - large.pth Lanes.mlpackage
xcrun coremlcompiler compile Lanes.mlpackage .
```

fp16 Core ML matches PyTorch fp32 on a night frame (lane and road pixels 100 % the same).

**Licence note:** the code and weights are MIT, but BDD100K's own terms are for research and non-commercial use. Check this (as with Objects365 for D-FINE) before the app is sold.
