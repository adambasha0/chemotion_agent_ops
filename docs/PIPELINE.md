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
| `scripts/release_inventory.py` | run on v3.1.2 → v3.1.3: 33 PRs classified, 22 fixes and 2 enhancements separated from the noise |
| `scripts/audit_assets.py` | run on the real site: found that **none** of v3's 212 assets is exclusive to v3, and three dangling references in a v2 directory Docusaurus excludes from the build (reported at first as build-breaking, which was wrong — the script now honours the exclusion) |
| `.github/workflows/issue-triage.yml` | mechanical half written and reviewed; the agent half untested |
| `bin/teardown.sh` | written here; the compose half is the inverse of a command that ran many times, the Dokploy half is unverified |
| `bin/dokploy.sh` | **unverified API paths.** `--dry-run` prints the calls; confirm them against your Dokploy |
| `docs/DOKPLOY.md` | procedure A executed end to end; procedure B's values read from the compose file |
| `.github/workflows/doc-impact-triage.yml` | **run live** on adambasha0/chemotion_ELN_megorei PR #1, triggered by assignment: posted the comment, correctly reporting a renamed button going stale in all three docs trees. The agent step is still unexercised — no API key was configured |
| `.github/workflows/issue-triage.yml` | the mechanical half shares the proven shape; the workflow itself not yet fired |
| `.github/workflows/capture-and-doc-pr.yml` | **untested skeleton.** Names what to verify at the top |
| self-hosted runner | does not exist, and the dokploy path does not need one |

### What the live run proved, and what it did not

Proved: the reusable workflow resolves across repositories, the diff comes from
the API with no checkout of the branch, `pre_triage.py` runs on a hosted runner
and finds the case that matters, and the comment lands on the right pull
request through the assignment trigger.

Not proved: the agent step. No `ANTHROPIC_API_KEY` was configured, so the
comment was the mechanical half, labelled as such. That is the design — the
plumbing does not depend on the model — but the prompt itself has still never
run in CI.

Two bugs only a live run would have found, both in the posting step:
`gh pr comment` resolves the repository from a git remote and this workspace
has no checkout at its root; and a `[ -s file ] && { ... }` guard exits the
step under `set -e` when the file is *empty*, which is the happy path.

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

## Jobs, and what triggers each

| Agent | Trigger | Instance | Writes |
|---|---|---|---|
| 1 doc impact | PR opened, labelled, or agent assigned | none | a comment |
| 2 capture + document | `docs:capture`, or a dispatch | yes — stopped afterwards | a draft PR on the docs site |
| 3 E2E author | deferred | — | — |
| 4 PR review | by hand | sometimes | a review file |
| 5 issue triage | issue opened, or agent assigned | none | a comment |

Agents 1 and 5 both run a deterministic pre-check first and comment even with
no API key configured, so the plumbing is provable on its own and the model's
judgement is an addition rather than a dependency.

The release pass is not an agent in this table. It is an epic a person or an
agent works through with the `release-docs` skill, using `release_inventory.py`
to turn the range into a work list and `audit_assets.py` to retire assets
without breaking the other version trees.
