#!/bin/sh
# Kjører testturen i Trondheim (testrute-trondheim.txt) i simulatoren, langs ekte gater, så fartsgrensen fra NVDB
# kan testes. Rette linjer mellom noen få punkter går gjennom kvartaler og gir «Fartsgrense ukjent her».
#   ./sim-rute.sh            50 km/t (14 m/s)
#   ./sim-rute.sh 8          rundt 30 km/t
#   ./sim-rute.sh stopp      stopper den simulerte posisjonen
set -e
cd "$(dirname "$0")"
if [ "$1" = "stopp" ]; then xcrun simctl location booted clear; exit 0; fi
SPEED="${1:-14}"
POINTS=$(grep -v '^#' testrute-trondheim.txt | tr '\n' ' ')
# shellcheck disable=SC2086
xcrun simctl location booted start --speed="$SPEED" --distance=10 $POINTS
