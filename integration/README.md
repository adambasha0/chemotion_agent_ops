# Wiring this into the other repos

Two files, one in each repo. Both are untested skeletons — read them before
installing them.

## chemotion_ELN

Copy `eln-side-snippet.yml` to `.github/workflows/doc-impact.yml`. That is the
whole change. A label on a PR produces a comment; nothing in the ELN repo is
written, and no instance is booted.

`pull_request_target` runs the workflow from the base branch, so a PR cannot
alter what runs. The job never checks out the PR head as code it executes — it
only diffs it.

## chemotion_saurus

Nothing. The capture workflow checks it out and opens a draft PR against it
with a token that has no other rights.

## The one thing that needs a machine

`capture-and-doc-pr.yml` needs a self-hosted runner labelled
`[self-hosted, chemotion-capture]` with docker, the postgres container, and
`eln.env` placed **outside** the workspace. The KIT host that already runs
Dokploy is the obvious candidate. Until that exists, run the capture half by
hand — `bin/eln-up.sh` then `bin/capture.sh` — which is how every asset in the
docs today was produced.

## Order to install

1. Nothing automated. Run the existing Cypress suite in the ELN and find out
   what passes (`.github/workflows/end-to-end.yml`, currently dispatch-only).
2. The ELN snippet. Let the triage agent comment for a few weeks and read what
   it gets wrong. It writes nothing, so the blast radius is a comment.
3. The runner, then the capture workflow behind a `docs:capture` label — never
   on every merge, or it boots an ELN forty times a week for changes nobody
   documents.
