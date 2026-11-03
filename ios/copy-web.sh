#!/bin/sh
# Kopierer nettappen (hovedappen, uten testappen og utviklingsfiler) inn i iPhone-appen som web/.
# Appen viser den fra en lokal server på telefonen (WebServer.swift), så alt virker uten nett.
set -e
SRC="$SRCROOT/.."
RES="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
DST="$RES/web"
mkdir -p "$DST"
rsync -a --delete \
  --include='/index.html' --include='/manifest.webmanifest' \
  --include='/css/***' --include='/js/***' --include='/fonts/***' --include='/icons/***' --include='/personvern/***' --include='/trafikkskole/***' --include='/lisenser/***' \
  --include='/vendor/' --include='/vendor/leaflet/***' --include='/vendor/mediapipe/***' \
  --exclude='*' \
  "$SRC/" "$DST/"
echo "Webappen kopiert til $DST"

# Bilgjenkjenningen (D-FINE medium, ferdig kompilert Core ML, se Models/README.md). Vektfilen ligger i biter under 50 MB,
# fordi GitHub ikke tar imot filer over 100 MB; bitene settes sammen her.
MODEL="$SRCROOT/Models/DFine.mlmodelc"
OUT="$RES/DFine.mlmodelc"
mkdir -p "$OUT"
rsync -a --delete --exclude='weight.bin*' "$MODEL/" "$OUT/"
mkdir -p "$OUT/weights"
if [ ! -f "$OUT/weights/weight.bin" ] || [ -n "$(find "$MODEL/weights" -name 'weight.bin.part*' -newer "$OUT/weights/weight.bin")" ]; then
  cat "$MODEL/weights/"weight.bin.part* > "$OUT/weights/weight.bin"
fi
echo "D-FINE kopiert til $OUT"
