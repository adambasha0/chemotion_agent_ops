#!/usr/bin/env bash
# RuboCop at the versions CI installs, not the ones in Gemfile.lock.
#
# CI does an unpinned `gem install rubocop ...` and .rubocop.yml sets
# NewCops: enable, so a lockfile several minor versions behind CI is exactly
# the gap where offences are invisible locally and fail the build.
. "$(dirname "$0")/_common.sh"
local_only
GH=/home/ubuntu/app/tmp/cigems
docker exec -e GEM_HOME=$GH "$APP" bash -lc \
  "gem list -i rubocop >/dev/null 2>&1 || gem install --no-document rubocop rubocop-rspec rubocop-rails rubocop-performance"
docker exec -e GEM_HOME=$GH "$APP" bash -lc "$GH/bin/rubocop --version"
docker exec -e GEM_HOME=$GH "$APP" bash -lc "cd /home/ubuntu/app && $GH/bin/rubocop --force-exclusion $*"
