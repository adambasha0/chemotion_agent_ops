# The pipeline

What this automates, where the human stays, and what has actually been run.

```
chemotion_ELN                          chemotion_agent_ops            chemotion_saurus
─────────────                          ───────────────────            ────────────────
PR labelled
 new feature / enhancement / bug
        │
        │  calls reusable workflow
        └──────────────────────────────▶ Agent 1  triage
                                          pre_triage.py: deterministic,
                                            no model, always runs
                                          then the agent reviews it
                                          no instance, seconds
        ◀───────────────────────────────  one comment: needed / check / none
        │
   human agrees, adds docs:capture
        │
        └──────────────────────────────▶ Agent 2  capture + document
                                          deploys the ref on Dokploy
                                          (or boots it locally)
                                          runs the flows
                                          evidence gate ─── fails here, stops
                                          writes the prose
                                          stops the instance (always)
                                                      │
                                                      └────────▶ DRAFT PR
                                                                 human reviews
                                                                 human merges
```

Two triggers, because the costs differ by three orders of magnitude.

| | Trigger | Needs | Cost |
|---|---|---|---|
| Agent 1 | a PR opened, or labelled | the diff and the docs tree | seconds |
| Agent 2 | `docs:capture`, or a dispatch | an instance of that ref | 20–40 min |

Agent 1 runs on every new PR, so nothing depends on anyone remembering to
label. Agent 2 stays behind an explicit label: running it on every merge would
deploy an ELN dozens of times a week for changes nobody documents.

## Where the instance comes from

| | `dokploy` (default) | `local` (fallback) |
|---|---|---|
| Runner | GitHub-hosted | self-hosted, with docker |
| Boot | `bin/dokploy.sh deploy` | `bin/eln-up.sh` |
| Fixtures | `ELN_EXEC` must reach the app's shell | local `docker exec` |
| Commit recorded | `ELN_SHA`, the ref deployed | read from the worktree |

The fixture channel is the catch. `rails()` runs through whatever `ELN_EXEC`
names, so a deployment with no shell access cannot be seeded that way — the
flow then has to build its state through the app's own API and say so. See
`docs/DOKPLOY.md`.

## Where the human stays

- Agent 1 **comments only**. It writes nothing in either repo.
- Agent 2 opens a **draft** PR, labelled `needs-human-review`. It never marks
  ready and never merges.
- The evidence gate (`rules/evidence-gate.md`) can stop Agent 2 before it
  writes anything. That is the design, not a failure.

## State of play

| Piece | Status |
|---|---|
| `bin/eln-up.sh`, `eln-restart.sh`, `wait-bundle.sh`, `eln-rails.sh` | generalised from scripts that ran, by hand, many times |
| `bin/eln-specs.sh`, `eln-rubocop.sh` | same, extracted from the lint/spec gates |
| `harness/lib/lib.js` | drove 17 published assets and 8 bug recordings |
| `bin/capture.sh`, `review.sh`, `publish.sh` | ran for every asset currently in the docs |
| `harness/lib/make_review.py` | rewritten here to discover tasks instead of carrying a hand-written list; smoke-tested only |
| `rules/*`, `agents/*` | written down from practice; never executed as prompts |
| `scripts/pre_triage.py` | run against two real diffs; catches the case that matters (docs naming a removed control, in all three trees) |
| `bin/teardown.sh` | written here; the compose half is the inverse of a command that ran many times, the Dokploy half is unverified |
| `bin/dokploy.sh` | **unverified API paths.** `--dry-run` prints the calls; confirm them against your Dokploy |
| `docs/DOKPLOY.md` | procedure A executed end to end; procedure B's values read from the compose file |
| `.github/workflows/*` | **untested skeletons.** Each names what to verify at the top |
| self-hosted runner | does not exist, and the dokploy path does not need one |

The parameterisation is new: every script now reads `env/eln.env` instead of
carrying one session's paths and passwords. Nothing has been re-run end to end
since that change, so expect the first `./bin/eln-up.sh` on a fresh checkout to
surface a missing variable or two.

## What this deliberately does not hold

- **The Cypress suite.** Deferred, and when it happens it happens in
  `chemotion_ELN` with the code it tests. `agents/03-e2e-author.md` holds the
  plan.
- **A merge button.** Nothing here merges anything.
- **Credentials.** `env/eln.env` is gitignored; the example file is not a
  working one.
