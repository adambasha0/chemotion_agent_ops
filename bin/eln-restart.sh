#!/usr/bin/env bash
# Restart Rails in the capture container, and refuse to proceed if the old
# server is still holding the port.
#
# Three traps this encodes, each of which leaves you testing stale code while
# everything looks healthy:
#   1. pkill alone is not enough - the old puma keeps the port and the new one
#      silently fails to bind. Assert zero before, exactly one after.
#   2. lib/**/*.rb is require'd, not autoloaded, so Ruby changes there never
#      hot-reload. A branch that only touches lib/ needs this.
#   3. Rails reads the pack manifest at boot. Restart while webpacker is
#      recompiling and it pins pre-rebuild chunk names, after which the page
#      asks for a chunk that no longer exists and paints blank.
. "$(dirname "$0")/_common.sh"

rm -rf "$ELN_TREE"/tmp/cache/bootsnap* || true
docker exec "$APP" bash -lc \
  "pkill -9 -f puma; pkill -9 -f 'rails s'; sleep 3; rm -f /home/ubuntu/app/tmp/pids/server.pid" || true
sleep 2
n=$(docker exec "$APP" bash -lc "ps aux | grep -c '[p]uma'" || echo 0)
echo "puma before start: $n"
[ "$n" = "0" ] || { echo "REFUSING TO START: $n puma still alive" >&2; exit 1; }

docker exec -d -e SHAKAPACKER_DEV_SERVER_HOST="${ELN_PROJECT}-webpacker-1" "$APP" \
  bash -lc 'cd /home/ubuntu/app && bundle exec rails s -p 3000 -b 0.0.0.0 > /home/ubuntu/app/log/capture-server.log 2>&1'

for i in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$ELN_BASE/users/sign_in" || true)" = "200" ] \
    && { echo "up after ${i}s"; break; }
  sleep 1
done
n=$(docker exec "$APP" bash -lc "ps aux | grep -c '[p]uma'")
echo "puma after start: $n"
[ "$n" = "1" ] || { echo "EXPECTED EXACTLY 1 PUMA, GOT $n" >&2; exit 1; }
