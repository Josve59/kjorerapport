#!/bin/sh
# Tar ett App Store-bilde i simulatoren (iPhone 18 Pro Max, 6,9"). Bygg testbygget (Debug) og installer det først.
#   ./shot.sh "#/rapport/emma7" report 14     side, filnavn (raw/raw-report.png), sekunder å vente
# Første gang: ./shot.sh "#/" "" 25  (seed.js lager øvingsturene og laster siden på nytt)
# Simulatoren: lys modus, norsk språk, statuslinjen satt med «xcrun simctl status_bar <id> override --time 9:41 …».
HERE=$(cd "$(dirname "$0")" && pwd)
D=${KJ_DEVICE:-EA706BC6-A8DA-4173-B26B-1548FDAEBDCD}
mkdir -p "$HERE/raw"
xcrun simctl terminate $D net.svendsenmedia.kjorerapport 2>/dev/null
SIMCTL_CHILD_KJ_EVAL="$HERE/seed.js" SIMCTL_CHILD_KJ_HASH="$1" xcrun simctl launch $D net.svendsenmedia.kjorerapport > /dev/null
sleep "${3:-7}"
[ -n "$2" ] && xcrun simctl io $D screenshot "$HERE/raw/raw-$2.png" >/dev/null 2>&1 && echo "lagret $2"
