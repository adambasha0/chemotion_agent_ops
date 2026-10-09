#!/usr/bin/env bash
# Run capture flows.
#
#   ./bin/capture.sh sds-extract-control    one task
#   ./bin/capture.sh 'admin-*'              a group
#   ./bin/capture.sh all
#
# Serial on purpose: the flows share one instance and one database, and two of
# them running at once corrupt each other's fixtures.
. "$(dirname "$0")/_common.sh"
set +e
SEL="${1:-all}"; [ "$SEL" = "all" ] && SEL='*'
cd "$OPS"
mapfile -t TASKS < <(cd harness/tasks && ls -d $SEL 2>/dev/null | grep -v '^TEMPLATE$' | sort -V)
if [ ${#TASKS[@]} -eq 0 ]; then
  echo "no task matches '$SEL'. available:" >&2
  (cd harness/tasks && ls -d */ | tr -d /) >&2
  exit 2
fi

# A recording started while webpack is recompiling is a white rectangle.
node -e "require('./harness/lib/lib').warmup(300000).catch(e=>{console.error(e.message);process.exit(1)})" || exit 1

pass=(); fail=()
for t in "${TASKS[@]}"; do
  printf '\n\033[1m=== %s ===\033[0m\n' "$t"
  if timeout 900 node "harness/tasks/$t/flow.js" 2>&1 \
       | grep -vE "warning:|already initialized|previous definition|^\s+from "; then
    pass+=("$t")
  else
    fail+=("$t")
  fi
done
printf '\n\033[1m%d passed, %d failed\033[0m\n' "${#pass[@]}" "${#fail[@]}"
[ ${#fail[@]} -gt 0 ] && printf 'failed: %s\n' "${fail[*]}"
# Media counts only once the review page has been rebuilt from the sidecars.
"$OPS/bin/review.sh" >/dev/null && echo "review page rebuilt"
[ ${#fail[@]} -eq 0 ]
