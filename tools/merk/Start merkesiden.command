#!/bin/sh
# Dobbeltklikk i Finder: starter merkesiden på Macen og åpner den i nettleseren. Lukk Terminal-vinduet for å stoppe.
# Uavhengig av Claude-appen (den stoppet merkesiden midt i merkingen 22. nov.).
cd "$(dirname "$0")/../.."
OKT="${1:-$(ls -d .local-test/veibilder/*/ 2>/dev/null | grep -v -- '-merk/' | grep -v -- '-ark/' | while read d; do [ -f "${d%/}-merk/forslag.json" ] && echo "${d%/}"; done | tail -1)}"
if [ -z "$OKT" ]; then echo "Fant ingen økt med forslag i .local-test/veibilder/"; read -r _; exit 1; fi
if curl -s -o /dev/null http://localhost:8790/api/sett; then
  echo "Merkesiden kjører allerede."
else
  "$HOME/.local/node-v22/bin/node" tools/merk/server.mjs "$OKT" 8790 &
  sleep 1
fi
open http://localhost:8790
echo "Merkesiden: http://localhost:8790  (økt $(basename "$OKT")). La dette vinduet stå åpent mens du merker."
wait
