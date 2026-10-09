#!/usr/bin/env bash
# Rebuild review.html from the provenance sidecars and refresh dist/.
# Nothing on that page is hand-written: an assertion that is not in a sidecar
# does not appear on it.
. "$(dirname "$0")/_common.sh"
mkdir -p "$OPS/dist"
find "$OPS/harness/tasks" -path '*/out/*' \( -name '*.webp' -o -name '*.png' -o -name '*.gif' \) \
  -exec cp -f {} "$OPS/dist/" \;
python3 "$OPS/harness/lib/make_review.py"
echo "dist/: $(ls -1 "$OPS/dist" | wc -l) files, $(du -sh "$OPS/dist" | cut -f1)"
