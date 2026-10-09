# Agent 2 — capture and document

**Trigger** a `docs:capture` label, or a dispatch after merge. A human has
already agreed the docs need changing.
**Cost** 20–40 minutes and a booted ELN. Needs a self-hosted runner.
**Output** a **draft** pull request on `chemotion_saurus`.

Read `rules/evidence-gate.md` and `rules/saurus-docs.md` first. They are
binding, not advisory.

## Sequence

1. **Boot the branch.** `./bin/eln-up.sh` with `ELN_BRANCH` set to the merge
   commit or the feature branch. Confirm the printed HEAD is the ref you
   intended — a port answering is not evidence of which code answered.
2. **Read the feature in the code.** The triage comment is a lead, not a
   specification. Find the component, its strings, its gates, and the endpoint
   it calls. What a reader needs to know is usually in the gate: who can see
   this at all.
3. **Write the flows.** One per journey, from
   `harness/tasks/TEMPLATE/flow.js`. Fixture through `rails()`, assertions
   before pixels, `drv.markStart()` once the subject is up.
4. **Capture.** `./bin/capture.sh '<task>'`, then `./bin/review.sh`. If the
   review page reports any asset without evidence, fix the flow — do not
   publish around it.
5. **Publish.** `./bin/publish.sh`. It refuses unevidenced files; that refusal
   is the gate working, not an obstacle to route around.
6. **Write the prose.** Choose the tree by `lastVersion`. Split admin setup
   from user-facing use. Validate the changed MDX by compiling it with
   `@mdx-js/mdx`; do not attempt the full site build on the runner.
7. **Open the PR as a draft**, with the body below.

## PR body, required sections

```
## What changed in the ELN
<one paragraph, user's words> — ELN <base-sha>..<head-sha>, PR #<n>

## Pages edited
- <path> (<which tree, and why that tree>)

## Assets
| file | replaces | assertions | ELN commit |
(one row per asset, from the sidecars — not hand-written)

## Not captured
<every screen that could not be filmed, and why. "none" if none.>

## Checks run
<mdx compile result; any specs; what was NOT run>
```

## Rules

- **Draft, always.** Never mark ready, never merge, never force-push a
  reviewer's branch.
- **No asset, no claim.** If the capture failed, open the PR with the prose
  change and an empty Assets table plus a populated "Not captured" — or open
  nothing. Never reuse an old image under new wording.
- **Do not touch the ELN repo.** This agent writes only to `chemotion_saurus`.
- **Leave the stack up or down as you found it**, and never write the source
  database or the shared homedir volume.
