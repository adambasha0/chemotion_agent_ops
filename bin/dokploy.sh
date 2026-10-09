#!/usr/bin/env bash
# Deploy, redeploy or check an app on Dokploy.
#
#   ./bin/dokploy.sh deploy  eln|saurus [<branch>]
#   ./bin/dokploy.sh stop    eln|saurus      # when the job is done
#   ./bin/dokploy.sh status  eln|saurus
#   ./bin/dokploy.sh logs    eln|saurus      # the deployed container's log
#   ./bin/dokploy.sh wait    eln|saurus      # until ELN_BASE answers 200
#   ./bin/dokploy.sh --dry-run deploy eln    # print the calls, send nothing
#
# UNVERIFIED API PATHS. The endpoint names below are the shape Dokploy's API
# uses, but they have not been called against a live instance from here. Check
# them against your own Dokploy's API docs (its /swagger, or the Open API link
# in the UI) and override with DOKPLOY_DEPLOY_PATH / DOKPLOY_STATUS_PATH if
# they differ. Run --dry-run first; it prints every request and sends none.
#
# The click-path procedure these calls automate, which IS verified, is in
# docs/DOKPLOY.md. Prefer that for the first deployment of a service: this
# script is for redeploying one that already exists.
. "$(dirname "$0")/_common.sh"

DRY=0
[ "${1:-}" = "--dry-run" ] && { DRY=1; shift; }
CMD="${1:?usage: dokploy.sh [--dry-run] deploy|status|wait eln|saurus [branch]}"
WHICH="${2:?which app: eln or saurus}"
BRANCH="${3:-}"

need DOKPLOY_URL DOKPLOY_TOKEN
case "$WHICH" in
  eln)    APP_NAME="${DOKPLOY_ELN_APP:?DOKPLOY_ELN_APP is not set}"; KIND=compose ;;
  saurus) APP_NAME="${DOKPLOY_SAURUS_APP:?DOKPLOY_SAURUS_APP is not set}"; KIND=application ;;
  *) echo "unknown app '$WHICH' (eln|saurus)" >&2; exit 2 ;;
esac

DEPLOY_PATH="${DOKPLOY_DEPLOY_PATH:-/api/${KIND}.deploy}"
STATUS_PATH="${DOKPLOY_STATUS_PATH:-/api/${KIND}.one}"
STOP_PATH="${DOKPLOY_STOP_PATH:-/api/${KIND}.stop}"

call() { # call <path> <json>
  local url="$DOKPLOY_URL$1"
  if [ "$DRY" = 1 ]; then
    echo "DRY-RUN POST $url"; echo "  $2"; return 0
  fi
  curl -fsS -X POST "$url" \
    -H 'Content-Type: application/json' \
    -H "x-api-key: $DOKPLOY_TOKEN" \
    -d "$2"
}

case "$CMD" in
  deploy)
    # Dokploy deploys whatever branch the service is configured with, so set it
    # first when one was asked for. A deploy that silently builds the wrong
    # branch is the expensive failure here.
    [ -n "$BRANCH" ] && call "/api/${KIND}.update" \
      "{\"${KIND}Id\":\"$APP_NAME\",\"branch\":\"$BRANCH\"}"
    call "$DEPLOY_PATH" "{\"${KIND}Id\":\"$APP_NAME\"}"
    echo
    echo "deploy requested for $APP_NAME${BRANCH:+ on $BRANCH}"
    ;;
  stop)
    # Stop, not delete: the service keeps its configuration so the next run is
    # a deploy, not a fresh setup. Leaving an ELN running costs several GB for
    # nothing.
    call "$STOP_PATH" "{\"${KIND}Id\":\"$APP_NAME\"}"
    echo
    echo "stop requested for $APP_NAME"
    ;;
  logs)
    # Useful when a capture or a smoke check fails against a deployment and
    # the browser's view does not explain it: did the job worker start, did a
    # migration run, what did the 500 actually say. Observability, not a test
    # harness - see docs/DOKPLOY.md on why the Cypress suite cannot run here.
    call "${DOKPLOY_LOGS_PATH:-/api/${KIND}.logs}" \
      "{\"${KIND}Id\":\"$APP_NAME\",\"tail\":${DOKPLOY_LOG_LINES:-500}}"
    ;;
  status)
    call "$STATUS_PATH" "{\"${KIND}Id\":\"$APP_NAME\"}"
    ;;
  wait)
    need ELN_BASE
    # The API reporting "done" is not the app answering. Poll the app.
    for i in $(seq 1 120); do
      code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$ELN_BASE/users/sign_in" || true)
      [ "$code" = "200" ] && { echo "up after ${i}0s"; exit 0; }
      sleep 10
    done
    echo "NOT up after 20 min (last $code)" >&2; exit 1
    ;;
  *) echo "unknown command '$CMD'" >&2; exit 2 ;;
esac
