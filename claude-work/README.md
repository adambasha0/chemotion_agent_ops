# claude-work

What an agent needs to know before working in the Chemotion repositories. Read
this first; it is short on purpose.

The name follows the convention in `chemotion_ELN`, where a gitignored
`claude-work/` holds a session's working material. The difference is that this
one is **committed**: the point is that the next agent does not start over.

## Install the skills

```bash
cp -r claude-work/skills/* ~/.claude/skills/
```

| Skill | Use it when |
|---|---|
| `ui-capture` | driving a real app in a browser to produce something someone will trust: documentation media, release evidence, an E2E check |

The skill is the principles — what to assert, how to pace a recording, the
traps that silently produce convincing but wrong media. `docs/RUNBOOK.md` is
the procedure for this particular app. Read the skill once; keep the runbook
open.

## The repositories

| Repo | What it is | Branch to work on |
|---|---|---|
| `ComPlat/chemotion_ELN` | Rails 6.1 + Grape + React, shakapacker | a feature branch, never `main` |
| `ComPlat/chemotion_saurus` | Docusaurus docs site, three ELN version trees | a branch off `main` |
| this one | the scripts, rules and workflows that join them | `main` |

## Five things that will cost you an hour each

1. **`lastVersion` decides which docs tree production serves.** It is `v3`
   today, so editing `docs/` alone changes a page nobody visits. Already
   happened once. `rules/saurus-docs.md`.
2. **A copied development database is not a clean fixture.** It carries the
   output of old bugs, and that output is indistinguishable from current
   behaviour unless you read the code. One dump here had notification rows
   fanning one event to seven users — a broadcast bug the branch had already
   fixed. Anyone seeding from it would have documented the bug as the feature.
3. **Two compose projects register the same `webpacker` hostname.** The name
   round-robins and Rails serves the other branch's JavaScript. Pin the
   container name.
4. **`lib/**/*.rb` is `require`d, not autoloaded.** A Ruby change there needs a
   full restart, and `pkill` alone leaves the old puma holding the port while
   the new one silently fails to bind. `bin/eln-restart.sh` asserts zero before
   and one after.
5. **A green toast is the UI's opinion.** Assert on the server before you write
   a file. `rules/evidence-gate.md` is not advisory.

## Before you finish

- Stop the instance: `./bin/teardown.sh`. A forgotten ELN holds several GB.
- Write down anything that cost you an hour. Add it to the traps table in
  `docs/RUNBOOK.md`, or to this list if it is about the repositories rather
  than the tooling.
- If you built working material worth keeping, commit it here rather than
  leaving it gitignored in a worktree. Both harnesses this repo came from were
  gitignored and nearly lost.

## Things that are deliberately not automated

- Merging anything. Every pull request this pipeline opens is a draft.
- Deleting a Dokploy service. Jobs stop instances; removing one is a decision.
- Documenting a screen nobody ran. If capture failed, the PR says which screens
  and why.
