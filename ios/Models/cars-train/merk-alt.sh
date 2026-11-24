#!/bin/sh
# Fasit fra den store modellen (dfine-xlarge-coco, bare COCO) for treningsbildene, og testturen 23. nov. kl. 19.33
# med to store modeller (COCO og Objects365+COCO, den siste bare til måling) og appens small og medium.
set -e
cd "$(dirname "$0")"
export HF_HUB_OFFLINE=1
PY="$HOME/.local/mlenv/bin/python"
V=../veibilder
"$PY" -I -W ignore kjor.py fasit-norge.json ref=ustc-community/dfine-xlarge-coco -- \
  $V/2026-11-22-213012 $V/2026-11-23-204459 $V/2026-11-23-021625 $V/2026-11-23-145606 $V/2026-11-23-192710 $V/2026-11-23-203834 | tail -1
"$PY" -I -W ignore kjor.py fasit-comma.json ref=ustc-community/dfine-xlarge-coco -- ../lanes-comma/data/img --hver 5 | tail -1
"$PY" -I -W ignore kjor.py test-1933.json ref=ustc-community/dfine-xlarge-coco obj=ustc-community/dfine-xlarge-obj2coco \
  small=ustc-community/dfine-small-coco medium=ustc-community/dfine-medium-coco -- $V/2026-11-23-193321 --hver 3 | tail -1
