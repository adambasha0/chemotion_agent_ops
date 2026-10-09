# Sourced by every script here. Fails loudly on anything missing, because each
# of these scripts silently does the wrong thing against a half-set
# environment.
set -euo pipefail
OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVF="${ELN_ENV_FILE:-$OPS/env/eln.env}"

if [ -f "$ENVF" ]; then
  # The file provides DEFAULTS: anything already exported wins. That lets CI
  # pass values with no file at all, and lets one variable be overridden for a
  # single run without editing the file. `set -a; . file` would do the
  # opposite and quietly clobber what the caller passed.
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    k="${line%%=*}"; v="${line#*=}"
    case "$k" in *[!A-Za-z0-9_]*) continue ;; esac
    [ -n "${!k:-}" ] || export "$k=$v"
  done < "$ENVF"
elif [ -z "${ELN_BASE:-}" ]; then
  echo "no $ENVF and ELN_BASE is not set - copy env/eln.env.example and edit it" >&2
  exit 2
fi

: "${ELN_PROVIDER:=local}"
: "${ELN_PROJECT:=chemotion_capture}"
: "${ELN_PORT:=3001}"
export ELN_PROVIDER ELN_PROJECT ELN_PORT
COMPOSE=(docker compose --env-file "$ENVF" -f "$OPS/env/compose.capture.yml")
APP="${ELN_APP_CONTAINER:-${ELN_PROJECT}-app-1}"

need() { for v in "$@"; do [ -n "${!v:-}" ] || { echo "$v is not set (env, or $ENVF)" >&2; exit 2; }; done; }
say() { printf '\n\033[1m>>> %s\033[0m\n' "$*"; }
local_only() {
  [ "$ELN_PROVIDER" = "local" ] || {
    echo "$(basename "$0") only applies to ELN_PROVIDER=local (this is '$ELN_PROVIDER')." >&2
    echo "For a deployed instance use ./bin/dokploy.sh." >&2
    exit 2; }
}
