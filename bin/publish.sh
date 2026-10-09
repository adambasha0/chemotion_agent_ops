#!/usr/bin/env bash
# Copy verified media into the docs site.
#
# Refuses any asset without a provenance sidecar, or whose sidecar records no
# assertions. That combination is exactly how a confident claim with nothing
# behind it reaches the repository - see rules/evidence-gate.md.
#
#   ./bin/publish.sh                      into $SAURUS_REPO/static/img
#   ./bin/publish.sh <some/img/dir>
. "$(dirname "$0")/_common.sh"
IMG="${1:-$SAURUS_REPO/static/img}"
[ -d "$IMG" ] || { echo "no such directory: $IMG" >&2; exit 2; }

copied=0; refused=0
while IFS= read -r media; do
  side="${media%.*}.json"; name="$(basename "$media")"
  if [ ! -f "$side" ]; then
    echo "REFUSED $name - no provenance sidecar" >&2; refused=$((refused+1)); continue
  fi
  n=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1])).get('assertions_passed') or []))" "$side")
  if [ "$n" -lt 1 ]; then
    echo "REFUSED $name - sidecar records no assertions" >&2; refused=$((refused+1)); continue
  fi
  cp -f "$media" "$IMG/$name"; echo "  $name ($n assertions)"; copied=$((copied+1))
done < <(find "$OPS/harness/tasks" -path '*/out/*' \( -name '*.webp' -o -name '*.png' -o -name '*.gif' \) | sort)
echo "$copied copied into $IMG, $refused refused"
[ "$refused" -eq 0 ]
