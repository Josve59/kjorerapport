#!/bin/sh
# Bygger iPhone-appen, installerer den på telefonen og starter den: ett steg i stedet for tre.
#   ios/ship.sh            → første tilkoblede iPhone
#   KJ_DEVICE=<id> ios/ship.sh
# Telefonen må være låst opp for at appen skal starte (installasjonen går uansett).
set -e
cd "$(dirname "$0")"
DD="$HOME/Library/Developer/Xcode/DerivedData/Kjorerapport-bcyiamysfvjksmfgavmvnjoxxcel"
DEVICE="${KJ_DEVICE:-}"
if [ -z "$DEVICE" ]; then
  TMP=$(mktemp)
  xcrun devicectl list devices --json-output "$TMP" >/dev/null 2>&1 || true
  DEVICE=$(python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
for x in d.get('result',{}).get('devices',[]):
    hp=x.get('hardwareProperties',{}); cp=x.get('connectionProperties',{})
    if hp.get('platform')=='iOS' and hp.get('reality')=='physical' and cp.get('tunnelState')!='unavailable':
        print(hp.get('udid','')); break
" "$TMP" 2>/dev/null)
  rm -f "$TMP"
fi
[ -n "$DEVICE" ] || { echo "Fant ingen tilkoblet iPhone (sett KJ_DEVICE)"; exit 1; }
if [ -d ../.local-test/app-models/Lanes.mlmodelc ]; then echo "Feltmodell: testvekter fra .local-test/app-models (ikke i git)"; fi
echo "Bygger for $DEVICE …"
xcodebuild -project Kjorerapport.xcodeproj -scheme Kjorerapport -configuration Debug -destination "id=$DEVICE" \
  -derivedDataPath "$DD" -allowProvisioningUpdates build 2>&1 | grep -E "error:|\*\* BUILD" || true
APP="$DD/Build/Products/Debug-iphoneos/Kjorerapport.app"
xcrun devicectl device install app --device "$DEVICE" "$APP" 2>&1 | tail -1
xcrun devicectl device process launch --terminate-existing --device "$DEVICE" net.svendsenmedia.kjorerapport 2>&1 | tail -1 \
  || echo "Installert, men ikke startet (er telefonen låst?)"
