# Wiring this into the other repos

Two files, one in each repo. Both are untested skeletons — read them before
installing them.

## chemotion_ELN

Copy `eln-side-snippet.yml` to `.github/workflows/agent-triage.yml`. That is
the whole change. It fires on:

| Event | What runs |
|---|---|
| a PR is opened | doc impact triage |
| a PR is labelled `new feature` / `enhancement` / `bug` / `feature` | doc impact triage |
| the agent is **assigned** to a PR | doc impact triage |
| an issue is opened | issue triage |
| the agent is **assigned** to an issue | issue triage |

Assignment is the deliberate hand-off — more precise than a label, and it
records who asked. Set `AGENT_HANDLE` in the snippet, and update the two
`github.event.assignee.login` comparisons to match it (GitHub expressions
cannot read `env` in a job-level `if`).

Nothing in the ELN repo is written and no instance is booted. A re-run edits
its own comment rather than adding a second one.

`pull_request_target` runs the workflow from the base branch, so a PR cannot
alter what runs. The job never checks out the PR head as code it executes — it
only diffs it.

## chemotion_saurus

Nothing. The capture workflow checks it out and opens a draft PR against it
with a token that has no other rights.

## Secrets the workflows need

| Secret | Used by | For |
|---|---|---|
| `ANTHROPIC_API_KEY` | both | the agent |
| `ELN_BASE` | capture | the deployed instance's URL |
| `ELN_EXEC` | capture | the shell that `rails runner` reaches, for fixtures |
| `ELN_*_LOGIN` / `ELN_*_PASSWORD` | capture | the dev logins on that instance |
| `DOKPLOY_URL` / `DOKPLOY_TOKEN` / `DOKPLOY_ELN_APP` | capture | deploying the ref |
| `SAURUS_PR_TOKEN` | capture | pushing a branch and opening the draft PR |

`SAURUS_PR_TOKEN` should be a GitHub App installation token scoped to
`chemotion_saurus` with contents and pull-requests write, and nothing else. The
triage workflow never holds it.

## Order to install

1. **The ELN snippet.** Let the triage agent comment for a few weeks and read
   what it gets wrong. It writes nothing, so the blast radius is a comment.
2. **A Dokploy deployment** of the ELN branch you want filmed, plus an
   `ELN_EXEC` that reaches its shell. `docs/DOKPLOY.md`.
3. **The capture workflow**, behind a `docs:capture` label — never on every
   merge, or it deploys an ELN dozens of times a week for changes nobody
   documents.

A self-hosted runner is only needed for `ELN_PROVIDER=local`, which is the
fallback. The Dokploy path runs on a GitHub-hosted runner.
