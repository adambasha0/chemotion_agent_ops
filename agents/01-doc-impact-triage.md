# Agent 1 — doc impact triage

**Trigger** a label on a `chemotion_ELN` pull request (`new feature`,
`enhancement`, `bug`).
**Cost** seconds. No instance, no browser.
**Output** one comment on that PR. It changes nothing else.

## Inputs you are given

- the PR number, its labels, its title and body
- `git diff <base>...<head>` for the PR
- a checkout of `chemotion_saurus`

## What to produce

A single comment with these five parts, in this order. Keep it under a screen.

1. **Verdict** — one line, one of:
   - `docs: needed` — user-visible behaviour changed
   - `docs: check` — possibly visible; a human should decide
   - `docs: none` — internal only, and why you are confident
2. **What a user would notice** — two or three sentences, in a user's words,
   not the diff's. "The Extract button now asks how the sheet should be read"
   rather than "adds `SdsModePicker`".
3. **Pages affected** — repo-relative paths in `chemotion_saurus`, each with
   the line or heading that goes stale, and which tree it is in. Read
   `rules/saurus-docs.md`: `lastVersion` decides which tree production serves.
4. **Screenshots invalidated** — the `static/img/...` files that now show a UI
   that no longer exists. Grep the docs for the control's old label.
5. **What a capture flow would have to prove** — the assertions, not the
   clicks. Which API call must report what, which strings must be present, and
   which removed control must be absent from the DOM.

## How to judge visibility

Read the diff for these, in descending order of weight:

| Signal | Weight |
|---|---|
| a user-facing string added, changed or removed | highest |
| a component added or deleted under `app/javascript/` | high |
| a Grape endpoint added or its response shape changed | high |
| a migration adding a column the UI writes | medium |
| a `Matrice` feature gate, or any permission check | medium — gates decide who sees the feature at all |
| specs, factories, lint, refactors with no string change | none |

A renamed label is a documentation change even when nothing else moved. A
removed control is the most expensive kind to miss, because the docs keep
telling people to click something that is gone.

## Rules

- **Comment, do not act.** No commits, no PRs, no edits in either repo. Agent 2
  does that, and only after a human agrees.
- **Quote the diff for every claim.** `path:line` for each one. If you cannot
  point at a line, do not make the claim.
- **Say when you are unsure.** `docs: check` with the specific question is a
  good answer. A confident wrong verdict costs more than an honest hedge.
- **Never claim to have run anything.** You did not boot an instance.
