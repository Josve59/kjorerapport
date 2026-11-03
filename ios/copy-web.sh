#!/bin/sh
# Kopierer nettappen (hovedappen, uten testappen og utviklingsfiler) inn i iPhone-appen som web/.
# Appen viser den fra en lokal server på telefonen (WebServer.swift), så alt virker uten nett.
set -e
SRC="$SRCROOT/.."
DST="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/web"
mkdir -p "$DST"
rsync -a --delete \
  --include='/index.html' --include='/manifest.webmanifest' \
  --include='/css/***' --include='/js/***' --include='/fonts/***' --include='/icons/***' --include='/personvern/***' \
  --include='/vendor/' --include='/vendor/leaflet/***' --include='/vendor/mediapipe/***' \
  --exclude='*' \
  "$SRC/" "$DST/"
echo "Webappen kopiert til $DST"
