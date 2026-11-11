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
  --include='/css/***' --include='/js/***' --include='/fonts/***' --include='/icons/***' --include='/personvern/***' --include='/hjelp/***' --include='/trafikkskole/***' --include='/lisenser/***' \
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

# Feltlinjene (TwinLiteNet+ large med egne vekter fra comma10k, 4 MB, se Models/README.md): liten nok til å ligge i ett stykke
rsync -a --delete "$SRCROOT/Models/Lanes.mlmodelc/" "$RES/Lanes.mlmodelc/"
echo "Feltmodellen kopiert til $RES/Lanes.mlmodelc"

# Testvekter som ikke skal i git (0.13.7): ligger det en ferdig kompilert feltmodell i .local-test/app-models/, brukes den i
# stedet. Den er merket (convert-lanes.py), så eksporten viser at den kjørte. Slett mappen for å gå tilbake til vektene i git.
LOCAL="$SRC/.local-test/app-models/Lanes.mlmodelc"
if [ -d "$LOCAL" ]; then
  rsync -a --delete "$LOCAL/" "$RES/Lanes.mlmodelc/"
  echo "warning: Feltmodellen er testvekter fra $LOCAL (ikke i git)"
fi
