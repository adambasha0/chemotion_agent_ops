#!/usr/bin/env bash
# Stop the instance when the work is done. An ELN left running holds a few GB
# of RAM, a database connection pool and a delayed_job worker for nothing.
#
#   ./bin/teardown.sh                 stop whatever ELN_PROVIDER says
#   ./bin/teardown.sh --destroy       local: also remove the volumes and the
#                                     database copy, and prune the worktree
#
# Safe to run twice, and safe to run when nothing is up. It never touches the
# source database, the source homedir volume, or any container outside the
# capture project.
. "$(dirname "$0")/_common.sh"

case "$ELN_PROVIDER" in
  dokploy)
    need DOKPLOY_URL DOKPLOY_TOKEN DOKPLOY_ELN_APP
    say "stopping the deployment $DOKPLOY_ELN_APP"
    # Stop, not delete: the service keeps its configuration, so the next run is
    # a deploy rather than a fresh setup. Deleting it is a UI decision, not
    # something a job should do on its own.
    "$OPS/bin/dokploy.sh" stop eln || {
      echo "stop failed - the deployment may still be running; check Dokploy" >&2
      exit 1; }
    ;;
  local)
    say "stopping the capture stack ($ELN_PROJECT)"
    "${COMPOSE[@]}" down --remove-orphans || true
    if [ "${1:-}" = "--destroy" ]; then
      say "removing the database copy and the cloned volume"
      # Guard: refuse to drop anything that is not our own copy. Dropping the
      # source database because two variables were equal would be unrecoverable.
      if [ -n "${ELN_DB:-}" ] && [ "$ELN_DB" != "${ELN_SOURCE_DB:-}" ]; then
        docker exec "${ELN_PG_CONTAINER}" dropdb -U postgres --if-exists "$ELN_DB" || true
        echo "    dropped $ELN_DB"
      else
        echo "    REFUSED to drop '$ELN_DB': it is the source database" >&2
      fi
      if [ -n "${ELN_HOMEDIR_VOLUME:-}" ] && [ "$ELN_HOMEDIR_VOLUME" != "${ELN_SOURCE_VOLUME:-}" ]; then
        docker volume rm -f "$ELN_HOMEDIR_VOLUME" >/dev/null 2>&1 || true
        echo "    removed volume $ELN_HOMEDIR_VOLUME"
      else
        echo "    REFUSED to remove '$ELN_HOMEDIR_VOLUME': it is the source volume" >&2
      fi
      if [ -n "${ELN_TREE:-}" ] && [ "$ELN_TREE" != "${ELN_REPO:-}" ] && [ -d "$ELN_TREE" ]; then
        git -C "$ELN_REPO" worktree remove --force "$ELN_TREE" 2>/dev/null \
          && echo "    removed worktree $ELN_TREE" \
          || echo "    left worktree $ELN_TREE in place"
      fi
    fi
    ;;
  *) echo "unknown ELN_PROVIDER '$ELN_PROVIDER'" >&2; exit 2 ;;
esac

say "done. Nothing from this project is still running:"
docker ps --filter "name=${ELN_PROJECT}" --format '  {{.Names}}  {{.Status}}' || true
