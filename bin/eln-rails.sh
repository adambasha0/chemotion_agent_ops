#!/usr/bin/env bash
# rails runner in the capture container, script on stdin.
#
#   echo 'puts User.count' | ./bin/eln-rails.sh
#   ./bin/eln-rails.sh < fixtures/seed.rb
#
# On stdin, not as an argv string: multi-line Ruby inside a shell argument
# breaks at the first newline.
. "$(dirname "$0")/_common.sh"
docker exec -i "$APP" bash -lc 'cd /home/ubuntu/app && bundle exec rails runner -'
