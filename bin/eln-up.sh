#!/usr/bin/env bash
# Bring up an isolated ELN on the branch in ELN_BRANCH. Re-runnable: every step
# checks whether it is already done, so a half-finished run is recovered by
# running it again.
#
#   ./bin/eln-up.sh                 boot
#   ./bin/eln-up.sh --recreate-db   rebuild the database copy first
#
# It will not write the source database, will not touch the source homedir
# volume, and will not check out anything in the primary checkout.
. "$(dirname "$0")/_common.sh"
need ELN_REPO ELN_TREE ELN_BRANCH ELN_PG_CONTAINER ELN_SOURCE_DB ELN_DB \
     ELN_HOMEDIR_VOLUME ELN_SOURCE_VOLUME ELN_NETWORK

say "1/6 worktree $ELN_TREE @ $ELN_BRANCH"
if [ ! -d "$ELN_TREE" ]; then
  git -C "$ELN_REPO" worktree add "$ELN_TREE" "$ELN_BRANCH"
else
  echo "    present: $(git -C "$ELN_TREE" rev-parse --short HEAD) on $(git -C "$ELN_TREE" rev-parse --abbrev-ref HEAD)"
fi
# A bare worktree will not boot: .env, .env.development and the generated
# config/*.yml are all gitignored, so `git worktree add` produces none of them
# and Rails dies on the first one it misses, one boot at a time. Copy the whole
# working set in one go rather than discovering them individually.
for f in .env .env.development \
         config/database.yml config/datacollectors.yml config/radar.yml \
         config/shrine.yml config/storage.yml config/structure_editors.yml \
         config/ui_components.yml config/user_props.yml \
         public/welcome-message.md; do
  if [ -f "$ELN_REPO/$f" ] && [ ! -f "$ELN_TREE/$f" ]; then
    cp "$ELN_REPO/$f" "$ELN_TREE/$f"; echo "    copied $f"
  fi
done

say "2/6 node_modules"
if [ ! -d "$ELN_TREE/node_modules" ]; then
  echo "    copying from $ELN_REPO (a cold yarn install is far slower)"
  cp -a "$ELN_REPO/node_modules" "$ELN_TREE/node_modules"
else
  echo "    present"
fi

say "3/6 homedir volume $ELN_HOMEDIR_VOLUME"
if ! docker volume inspect "$ELN_HOMEDIR_VOLUME" >/dev/null 2>&1; then
  docker volume create "$ELN_HOMEDIR_VOLUME" >/dev/null
  # Cloned, never shared: a branch that needs a different gem version installs
  # it into this volume, and a shared volume would break every rails and rspec
  # run in the stack someone is developing on.
  docker run --rm -v "$ELN_SOURCE_VOLUME":/from:ro -v "$ELN_HOMEDIR_VOLUME":/to \
    alpine cp -a /from/. /to/
else
  echo "    present"
fi

say "4/6 database $ELN_DB"
[ "${1:-}" = "--recreate-db" ] && docker exec "$ELN_PG_CONTAINER" dropdb -U postgres --if-exists "$ELN_DB"
if docker exec "$ELN_PG_CONTAINER" psql -U postgres -XtAc \
     "SELECT 1 FROM pg_database WHERE datname='$ELN_DB'" | grep -q 1; then
  echo "    exists (--recreate-db to rebuild)"
else
  # pg_dump rather than CREATE DATABASE ... TEMPLATE: the template form needs
  # zero open connections on the source, and a running app holds some.
  docker exec "$ELN_PG_CONTAINER" createdb -U postgres "$ELN_DB"
  docker exec "$ELN_PG_CONTAINER" bash -c \
    "pg_dump -U postgres '$ELN_SOURCE_DB' | psql -q -U postgres '$ELN_DB'" >/dev/null
  echo "    copied $ELN_SOURCE_DB -> $ELN_DB"
fi
echo -n "    users: "
docker exec "$ELN_PG_CONTAINER" psql -U postgres -d "$ELN_DB" -XtAc "select count(*) from users"

say "5/6 containers"
"${COMPOSE[@]}" up -d --wait-timeout 900 app webpacker worker

say "6/6 health on $ELN_BASE"
for i in $(seq 1 120); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$ELN_BASE/users/sign_in" || true)
  if [ "$code" = "200" ]; then
    # A port answering is not evidence of which code answered. Print the SHA.
    echo "    up after ${i}0s, HEAD $(git -C "$ELN_TREE" rev-parse --short HEAD)"
    exit 0
  fi
  sleep 10
done
echo "    NOT up (last $code)" >&2
"${COMPOSE[@]}" logs --tail 40 app >&2
exit 1
