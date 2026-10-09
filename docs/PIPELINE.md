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
                                          reads the diff + the docs
                                          no instance, seconds
        ◀───────────────────────────────  one comment: needed / check / none
        │
   human agrees, adds docs:capture
        │
        └──────────────────────────────▶ Agent 2  capture + document
                                          boots the branch   (self-hosted)
                                          runs the flows
                                          evidence gate ─── fails here, stops
                                          writes the prose
                                                      │
                                                      └────────▶ DRAFT PR
                                                                 human reviews
                                                                 human merges
```

Two triggers, because the costs differ by three orders of magnitude.

| | Trigger | Needs | Cost |
|---|---|---|---|
| Agent 1 | a label on a PR | the diff and the docs tree | seconds |
| Agent 2 | `docs:capture`, or a dispatch | a booted ELN, seeded DB, worker | 20–40 min |

Running Agent 2 on every merge would boot an ELN dozens of times a week for
changes nobody documents. Keep it behind an explicit label.

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
| `.github/workflows/*` | **untested skeletons.** Each names what to verify at the top |
| self-hosted runner | does not exist yet |

The parameterisation is new: every script now reads `env/eln.env` instead of
carrying one session's paths and passwords. Nothing has been re-run end to end
since that change, so expect the first `./bin/eln-up.sh` on a fresh checkout to
surface a missing variable or two.

## What this deliberately does not hold

- **The Cypress suite.** Tests live in `chemotion_ELN`, with the code they
  test. See `agents/03-e2e-author.md`.
- **A merge button.** Nothing here merges anything.
- **Credentials.** `env/eln.env` is gitignored; the example file is not a
  working one.
