#!/bin/sh
# Henter veibildene til modelltrening (1.0.4) fra telefonen til .local-test/veibilder/ (ikke i git).
# Telefonen må være koblet til og låst opp. Bildene ligger igjen på telefonen til de slettes i appen
# (Innstillinger › Utvikler › Slett veibildene).
#   tools/hent-veibilder.sh            → første tilkoblede iPhone
#   KJ_DEVICE=<id> tools/hent-veibilder.sh
set -e
cd "$(dirname "$0")/.."
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
DEST=".local-test/veibilder"
mkdir -p "$DEST"
xcrun devicectl device copy from --device "$DEVICE" --domain-type appDataContainer \
  --domain-identifier net.svendsenmedia.kjorerapport --source Documents/veibilder --destination "$DEST" 2>&1 | tail -2
echo "Økter i $DEST:"
for d in "$DEST"/*/; do [ -d "$d" ] && echo "  $(basename "$d"): $(ls "$d" | grep -c '\.jpg$') bilder"; done
