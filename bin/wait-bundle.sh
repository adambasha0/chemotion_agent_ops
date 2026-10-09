#!/usr/bin/env bash
# Gate on the JavaScript the browser is actually served, not on what is on disk.
# This is how you know a checkout reached the bundle instead of the browser
# still being handed the old code.
#
#   ./bin/wait-bundle.sh present '<string the new code contains>'
#   ./bin/wait-bundle.sh absent  '<string the old code contained>'
. "$(dirname "$0")/_common.sh"
local_only
mode="${1:?usage: wait-bundle.sh present|absent <marker>}"
marker="${2:?missing marker}"
url="http://localhost:${ELN_DEV_SERVER_PORT:-3036}/packs/js/application.js"
for i in $(seq 1 90); do
  body=$(curl -s -m 90 "$url" || true)
  if [ -n "$body" ]; then
    if printf '%s' "$body" | grep -qF -- "$marker"; then found=1; else found=0; fi
    case "$mode" in
      present) [ "$found" = 1 ] && { echo "marker present: $marker"; exit 0; } ;;
      absent)  [ "$found" = 0 ] && { echo "marker absent as expected: $marker"; exit 0; } ;;
      *) echo "usage: wait-bundle.sh present|absent <marker>" >&2; exit 2 ;;
    esac
  fi
  sleep 4
done
echo "BUNDLE NEVER REACHED THE EXPECTED STATE ($mode: $marker)" >&2; exit 1
