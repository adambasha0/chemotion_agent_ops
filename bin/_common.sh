# Sourced by every script here. Loads env/eln.env and fails loudly on anything
# missing, because every one of these scripts silently does the wrong thing
# against a half-set environment.
set -euo pipefail
OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVF="${ELN_ENV_FILE:-$OPS/env/eln.env}"
[ -f "$ENVF" ] || { echo "no $ENVF - copy env/eln.env.example and edit it" >&2; exit 2; }
set -a; . "$ENVF"; set +a
: "${ELN_PROJECT:=chemotion_capture}"
: "${ELN_PORT:=3001}"
export ELN_PROJECT ELN_PORT
COMPOSE=(docker compose --env-file "$ENVF" -f "$OPS/env/compose.capture.yml")
APP="${ELN_APP_CONTAINER:-${ELN_PROJECT}-app-1}"

need() { for v in "$@"; do [ -n "${!v:-}" ] || { echo "$v is not set in $ENVF" >&2; exit 2; }; done; }
say() { printf '\n\033[1m>>> %s\033[0m\n' "$*"; }
