# chemotion_agent_ops

Scripts, rules and workflows for running Chemotion, capturing evidence from it,
and keeping `chemotion_saurus` in step with `chemotion_ELN`.

Built for agents, usable by people. Everything here was extracted from work
that was done by hand first — the provenance of each piece is in
[docs/PIPELINE.md](docs/PIPELINE.md).

## Start here

| You want to | Read |
|---|---|
| run an ELN branch and film it | [docs/RUNBOOK.md](docs/RUNBOOK.md) |
| know why a run can be refused | [rules/evidence-gate.md](rules/evidence-gate.md) |
| edit the documentation site | [rules/saurus-docs.md](rules/saurus-docs.md) |
| automate the docs update | [docs/PIPELINE.md](docs/PIPELINE.md) |
| document a whole release | [claude-work/skills/release-docs](claude-work/skills/release-docs/SKILL.md) |
| triage a reported issue | [claude-work/skills/issue-triage](claude-work/skills/issue-triage/SKILL.md) |
| get an instance on Dokploy | [docs/DOKPLOY.md](docs/DOKPLOY.md) |
| add E2E coverage (deferred) | [agents/03-e2e-author.md](agents/03-e2e-author.md) |
| pick this up as a new agent | [claude-work/README.md](claude-work/README.md) |

## Quick start

```bash
cp env/eln.env.example env/eln.env     # edit it: instance, logins, docs repo
npm install

./bin/dokploy.sh deploy eln <branch>   # a deployed instance, preferred
./bin/dokploy.sh wait eln
# or, on this machine:
./bin/eln-up.sh

./bin/capture.sh all                   # runs the flows
./bin/review.sh && open review.html    # every claim, from the sidecars
./bin/publish.sh                       # into the docs site, if it earns it
./bin/teardown.sh                      # stop the instance - do not skip this
```

## Layout

```
bin/        dokploy, run, restart, seed, lint, spec, capture, review, publish, teardown
scripts/    deterministic analysis: pre-triage, release inventory, asset audit
env/        the compose file and the one env file everything reads
harness/    lib/    the driver: pointer, pacing, assertions, trim, sidecars
            tasks/  one directory per user journey; TEMPLATE/ to copy
rules/      the constraints an agent must obey, not advice
agents/     one prompt per job in the pipeline
claude-work/ onboarding, and the skills to install into ~/.claude/skills/
.github/    reusable workflows (untested skeletons)
integration/ the one file chemotion_ELN needs
docs/       the runbook and the pipeline
```

## The one rule

A screenshot is a claim, and a claim needs evidence. An asset with no
provenance sidecar, or a sidecar with no assertions, does not reach the
documentation — `bin/publish.sh` refuses it and exits non-zero. An agent that
cannot boot an instance will still write confident, fluent, wrong
documentation; this is the mechanism that makes that fail loudly instead of
quietly. See [rules/evidence-gate.md](rules/evidence-gate.md).

## Status

The local scripts and the harness have run. The GitHub workflows have not, and
say so at the top of each file; `bin/dokploy.sh`'s API paths are unverified and
`--dry-run` prints them. So the capture half is two manual commands today.
[docs/PIPELINE.md](docs/PIPELINE.md) has the full table.
