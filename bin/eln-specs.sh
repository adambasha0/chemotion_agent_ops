#!/usr/bin/env bash
# rspec in the container against the capture tree.
#
#   ./bin/eln-specs.sh spec/models/sample_spec.rb
#
# The test database is shared between trees, so a concurrent run surfaces as
# DatabaseCleaner.clean_with(:truncation) erroring outside of examples. That is
# contention, not a regression: re-run before believing it.
. "$(dirname "$0")/_common.sh"
local_only
docker exec "$APP" bash -lc "cd /home/ubuntu/app && RAILS_ENV=test bundle exec rspec $*"
