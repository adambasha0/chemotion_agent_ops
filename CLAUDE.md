# Working in this repo

Read `claude-work/README.md` first — it is the onboarding, and it is short.

Quick orientation:

- `docs/RUNBOOK.md` — how to get an instance and capture from it
- `docs/DOKPLOY.md` — the deployed route, preferred over booting locally
- `rules/` — binding constraints, not advice: the evidence gate, and which docs
  tree production actually serves
- `agents/` — one prompt per job in the pipeline
- `claude-work/skills/` — install into `~/.claude/skills/`

Two house rules:

1. **Assert on the server before writing a file.** An asset without a
   provenance sidecar does not reach the documentation; `bin/publish.sh`
   refuses it and exits non-zero.
2. **Stop the instance when you are done.** `./bin/teardown.sh`.
