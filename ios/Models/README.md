# D-FINE for the road camera (Core ML)

`DFine.mlmodelc` is **D-FINE medium, trained on COCO only** (`ustc-community/dfine-medium-coco`, Apache 2.0). Until 0.13.4 it was the same model pretrained on Objects365 and then trained on COCO (`dfine-medium-obj2coco`, COCO AP about 55), and until 0.10.1 xlarge (AP about 59).

**Why COCO only (0.13.5):** Objects365 is listed as non-commercial, so a model trained on it may not be usable in an app that is sold. COCO's annotations are CC BY 4.0. On 162 COCO val2017 pictures with vehicles (575 cars, trucks, buses and motorcycles; neither model was trained on them), at the app's score of 0.35 and overlap 0.5 (`.local-test/dfine/compare.py`):

| Vehicles | obj2coco (before) | coco (now) |
| --- | --- | --- |
| All | 87 % found | 85 % found |
| At least 32 px | 94 % | 92 % |
| At least 96 px (close) | 97 % | 96 % |
| Right class (of those found) | 92–94 % | 93–94 % |

The loss is mostly small cars far away. Same size and speed, since it is the same model. Not compared in the dark: there were no night pictures to test on. Core ML fp16 matched PyTorch fp32 on 650 of 652 boxes (60 of the pictures).

**Why medium:** on the iPhone, on the drives on 3 Nov, xlarge took 380 ms per frame on a cool phone and 660 ms after 14 minutes (heat). That is only 1.5–2.5 answers a second, and the driver camera slowed down too. On the Mac, medium is 2.2 times faster than xlarge (7 against 15 ms), so it should give about twice as many answers and less heat. It found the same cars on the night snapshots (38 against 39 boxes). It comes from [Peterande/D-FINE](https://github.com/Peterande/D-FINE) under Apache 2.0, via Hugging Face `ustc-community/dfine-medium-coco` (0.13.4 and earlier: `dfine-medium-obj2coco`). It is compiled for Core ML (fp16, iOS 17+).

- **Input:** `image`, 640×640 RGB (values 0–1, no normalisation).
- **Output:** `logits` [1, 300, 80] (COCO classes) and `boxes` [1, 300, 4] (cx, cy, w, h, 0–1). `RoadDetector.swift` decodes them the same way as `kamera/js/dfine.js`.

**The weights are stored in parts** (`weight.bin.part00`, …) under 50 MB each, because GitHub refuses files over 100 MB. Medium needs only one part (39 MB); xlarge needed three. `copy-web.sh` joins them into the app at build time.

**How it was made** (`convert-dfine.py`, Python 3.9, torch 2.8, transformers 4.57, coremltools 9.0):

```
python convert-dfine.py ustc-community/dfine-medium-coco DFine.mlpackage
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

# Lane lines and the road ahead (Core ML, 0.13.0; own weights from 0.13.6)

`Lanes.mlmodelc` is **TwinLiteNet+ large** ([chequanghuy/TwinLiteNetPlus](https://github.com/chequanghuy/TwinLiteNetPlus), MIT, 1.94 M parameters, 4 MB). From 0.13.6 the weights are **our own, trained from scratch on comma10k** ([commaai/comma10k](https://github.com/commaai/comma10k), MIT, © 2020 Comma.ai, Inc.: 9 888 dashcam pictures labelled by hand, day and night). Until 0.13.5 the app used the project's weights trained on BDD100K, whose terms are for research and non-commercial use. The model marks every pixel as lane line or not, and road or not.

**Why a model (0.13.0):** the simple image analysis in the web app (`js/lanes.js`) took kerbs, road edges, guardrails and snow poles for lane lines and flickered.

- **Input:** `image`, 640×384 RGB (0–1). `LaneDetector.swift` takes a 16:9 band of the portrait road frame right above the dashboard edge, scales it to 640×360 and adds 12 grey rows (114) above and below, as in training.
- **Output:** `lanes` and `road`, [1, 1, 384, 640]: above 0 = lane line / road.
- `LaneDetector.swift` sends the middle of each lane-line run (every 2nd row) and the left and right edge of the road ahead (every 4th row) to the web app, which fits the lane lines from those points (`detectLanes(…, { points })`) and keeps them steady over time.
- **Road means the whole road surface** from 0.13.6, oncoming lanes included (comma10k's label). BDD100K's «drivable area» was narrower. The app uses it to drop lane points and cars that are off the road (`mlPoints`, `onRoad`) and for the road edges on unmarked roads (`roadEdgeLines`).

## How the weights were made (0.13.6)

Python 3.9, torch 2.8, scipy 1.13, coremltools 9.0, on the Mac's GPU (MPS, fp32: fp16 made the training unstable). `tln_model.py` is the model written out again from the project's `model/model.py`. The scripts are in `lanes-train/` and run from a work folder with the data (`.local-test/lanes-comma/`, 8 GB, not in git). The finished weights are `lanes-comma10k.pth`.

1. **Data:** comma10k at commit `6c205fe` (20 Feb 2026), `imgs/` and `masks/` in `raw/`. `prep.py` writes pictures and labels (road, lane markings, own car) and where the bonnet starts. Every 20th picture (495) is the test set, the other 9 393 are for training.
2. **Cropped like the phone** (`train.py`): a 16:9 band that ends at the bonnet edge, as the app's band ends at the dashboard edge. In training the band is 34–58° wide, tilted up to 4°, mirrored, with changed light and colour, and in 30 % of the pictures darkened, noisy and brightened with gamma, as the app does in the dark.
3. **First training from scratch:** `KJ_LBL=lbl python train.py --epochs 22 --low 16` (16 rounds at 3/4 size, then 6 at full size, 3 h 9 min). AdamW, batch 32, cross-entropy + Dice, the averaged (EMA) weights are kept.
4. **Dashes joined** (`connect.py`): comma10k labels only the paint, so the first model drew a dashed line as separate dashes. The BDD100K weights drew it as a whole line, which is what the app's line fit was tuned with. `connect.py` joins a dash to the next one up the road when it lies in the dash's direction, the gap is no longer than a normal gap (at most 4 times the dash, about 18 m on the ground) and there is road all the way between: 33 876 joins in 6 626 of the 9 888 pictures, checked on contact sheets (`sheet_gt.py`).
5. **Fine-tuned on the joined labels:** `python train.py --init best.pth --epochs 9 --low 6 --lr 4e-4` (81 min). The best full-size round is kept.
6. **Converted:**

```
python convert-lanes.py - lanes-comma10k.pth Lanes.mlpackage
xcrun coremlcompiler compile Lanes.mlpackage .
```

fp16 Core ML matches PyTorch fp32 on 62 test pictures (`check_coreml.py`): lane pixels 99.997 % the same, road pixels 99.994 %, 16 ms per picture on the Mac's GPU. Input and output are the same as before, so nothing in the Swift code changed.

## Compared with the BDD100K weights

On the 495 test pictures, against the labels with joined dashes (`compare.py`), and through the app's own line fit (`applevel.py` makes the same points as `LaneDetector.swift`, `applevel.mjs` sends them through `detectLanes` the way `js/facecam.js` does):

| | BDD100K (until 0.13.5) | First training | Fine-tuned (in the app) |
| --- | --- | --- | --- |
| Lane points found | 70 % | 75 % | 83 % |
| Reported points that are right | 73 % | 81 % | 80 % |
| The same in the 122 dark pictures | 70 % / 79 % | 74 % / 83 % | 82 % / 83 % |
| Right lines out of the app's line fit | 580 | 608 | 609 |
| Wrong lines | 42 | 39 | 41 |
| Pictures with no line | 85 | 68 | 69 |
| Dark pictures: right / wrong lines | 155 / 7 | 162 / 6 | 163 / 6 |
| Road, overlap with the labels | 72 % | 95 % | 95 % |

- **A line counts as right** when at least 5 rows near the car have a labelled line within 12 px and the median distance is 3 px or less (in the app's 240 px wide picture).
- **With the line fit set to the comma camera's horizon** (`comma` in `applevel.mjs`): 599 right and 121 wrong, 638 and 53, 646 and 70. In the 29 pictures where only the fine-tuned model had a wrong line, about 18 were real dashed lines that the labels lack (`sheet_app.py`), and about 6 were false: tar seams, and once a line across a car close in front.
- **The road number is unfair to the BDD100K weights:** they were trained to mark a narrower area.

**Not tested:**
- The test pictures come from the same source as the training pictures (comma's cameras, mostly American roads) and are new to the BDD100K weights. Neither set of weights is measured on pictures from the phone on Norwegian roads: the colour frames from the drives are gone.
- The phone's band shows the road a little closer than the training crops (the horizon about 21 % from the top of the band, 35–44 % in training).
- Speed and heat on the phone (same network, so no change is expected).
- The real test is a drive: compare lane lines and how often they flip in `tools/turrapport.mjs` with earlier exports, in the dark and on dashed lines.

## Tested on German roads (A2D2), 11 Nov 2026

The first test on pictures from another source than the training pictures. Audi's A2D2 ([a2d2.audi](https://www.a2d2.audi), CC BY-ND 4.0) has 12 497 labelled frames from the front camera on 18 drives in southern Germany, all in daylight.

- `prep_a2d2.py` reads `camera_lidar_semantic_bboxes.tar` (52 GB) without unpacking it, straightens the lens distortion, scales to the same focal length as comma10k (910 px) and writes the same label codes. Then `connect.py` as for comma10k. Work folder: `.local-test/a2d2/`.
- **Lines across the road** (stop lines, the edges of crossings) are lane lines in A2D2's labels. The app only wants the lines along the road, so `prep_a2d2.py` turns them into road.
- **Four whole drives are the test set** (`data/test_scenes.json`, 1 633 frames): a city drive (20181008095521), a motorway drive (20181108084007) and two short drives on wet country roads (20181204154421, 20181204170238). The frames are film, so every 20th frame would have been too close to its neighbours.
- Run with `KJ_A2D2=../a2d2/data KJ_TEST=a2d2` in front of `compare.py` and `applevel.py`. `KJ_A2D2` alone adds the other 14 drives (10 864 frames) to the training.

| A2D2 test drives | BDD100K (until 0.13.5) | comma10k (0.13.6) |
| --- | --- | --- |
| Lane points found | 82 % | 84 % |
| Reported points that are right | 69 % | 55 % |
| City: found / right | 66 % / 38 % | 68 % / 25 % |
| Motorway: found / right | 86 % / 82 % | 87 % / 72 % |
| Wet country roads: found / right | 85 % / 80 % and 84 % / 87 % | 91 % / 70 % and 91 % / 82 % |
| Right lines out of the app's line fit | 2 109 | 2 036 |
| Wrong lines | 398 | 671 |
| Pictures with no line | 226 | 115 |
| Road, overlap with the labels | 76 % | 93 % |
| Road edge, mean error (of 640 px) | 93 px | 16 px |

**What it shows:** the 0.13.6 weights find the road much better, but in city streets they draw lines that are not painted: along kerbs, along the cobbled gutter beside parked cars, on tram rails and on seams in the asphalt. On the motorway the extra lines are mostly the other carriageway and seams in the concrete. The BDD100K weights draw the lines across junctions instead. The road number is unfair to the BDD100K weights here too.

**Training with weather (`KJ_AUG=2`, run `n1`):** `weather()` in `train.py` adds shadows across the road, darkness, glare from headlights or a low sun, fog, reflections in the windscreen, rain drops with a wiper, blur and noise. `KJ_HARD=1` measures on the test pictures with one fixed disturbance each (artificial, and it favours a model trained with them). Fine-tuned from the 0.13.6 weights on comma10k only: `KJ_AUG=2 python train.py --init best.pth --epochs 10 --low 6 --lr 4e-4` (94 min).

| | 0.13.6 | n1 (comma10k + weather) |
| --- | --- | --- |
| comma10k test: found / right | 83 % / 80 % | 84 % / 81 % |
| The 122 dark pictures | 82 % / 83 % | 83 % / 83 % |
| App's line fit: right / wrong / no line | 609 / 41 / 69 | 615 / 30 / 75 |
| With disturbances: found / right | 81 % / 80 % | 83 % / 80 % |
| With shadows: road overlap / edge error | 89 % / 57 px | 94 % / 20 px |
| A2D2 test drives: found / right | 84 % / 55 % | 86 % / 56 % |
| A2D2, app's line fit: right / wrong / no line | 2 036 / 671 / 115 | 2 052 / 654 / 122 |

A little better on every set, but the extra lines in city streets are still there: they need training pictures that show such streets.

**Training with the A2D2 drives too (run `n2`, not in the app):** the 14 A2D2 drives that are not test drives added to comma10k, 20 257 pictures in all, fine-tuned from the 0.13.6 weights: `KJ_AUG=2 KJ_A2D2=../../a2d2/data python train.py --init best.pth --epochs 15 --low 8 --lr 4e-4` (287 min).

| | 0.13.6 | n1 | n2 (comma10k + A2D2 + weather) |
| --- | --- | --- | --- |
| comma10k test: found / right | 83 % / 80 % | 84 % / 81 % | 85 % / 81 % |
| The 122 dark pictures | 82 % / 83 % | 83 % / 83 % | 84 % / 83 % |
| Road edge, mean error (dark pictures) | 15.7 px (14.9) | 15.6 px (15.3) | 16.6 px (17.3) |
| App's line fit: right / wrong / no line (lost) | 609 / 41 / 69 (13) | 615 / 30 / 75 (14) | 621 / 26 / 75 (15) |
| With disturbances: found / right | 81 % / 80 % | 83 % / 80 % | 84 % / 80 % |
| A2D2 test drives: found / right | 84 % / 55 % | 86 % / 56 % | 89 % / 76 % |
| City: found / right | 68 % / 25 % | 70 % / 25 % | 75 % / 48 % |
| Motorway: found / right | 87 % / 72 % | 89 % / 73 % | 93 % / 87 % |
| Wet country roads: found / right | 91 % / 70 % and 91 % / 82 % | 91 % / 70 % and 92 % / 82 % | 93 % / 85 % and 94 % / 88 % |
| A2D2, app's line fit: right / wrong / no line (lost) | 2 036 / 671 / 115 (25) | 2 052 / 654 / 122 (27) | 2 147 / 216 / 263 (36) |
| A2D2 road: overlap / edge error | 93 % / 16 px | 93 % / 15 px | 97 % / 8 px |

- «No line (lost)»: pictures where the app's line fit gives no line, and in brackets those where the labels do have lines (`applevel.mjs`). The rest are streets with no painted line, where no line is the right answer. The BDD100K weights: 2 109 / 398 / 226 (48).
- The test is less independent for `n2` than for the others: the motorway drive and the two country drives were filmed on the same days as drives in the training. The city drive is the clean one. There the app's line fit gives 442 right and 198 wrong lines with `n2`, 389 and 574 with 0.13.6, 423 and 356 with BDD100K.
- Still wrong with `n2`: lines on tram rails, and a little worse road edge on dark comma10k pictures.
- **Not in the app:** A2D2 is CC BY-ND 4.0. Commercial use is allowed with attribution, but changed material may not be shared, and whether trained weights are changed material is not settled. The owner decides.

**Licence:** the model code is MIT (© 2025 Chế Quang Huy), the training pictures and labels are MIT (© 2020 Comma.ai, Inc.), and the weights are our own. Both notices are on the app's licence page (`lisenser/index.html`). Nothing in the lane model is limited to non-commercial use now.
