---
name: issue-triage
description: Verify a reported Chemotion issue before anyone fixes it - is it real, is it still present, is it a duplicate - and recommend what to change. Use when triaging a new GitHub issue or bug report, when assigned to an issue to confirm it, or when asked whether a report is valid. Covers reproducing against the right version, what evidence a verdict needs, and how to recommend a change without writing it.
---

# Verifying a reported issue

The job is a **verdict with evidence**, not a fix. A triage that says
"confirmed" without saying what was run, on which version, is worth nothing to
the person who picks the issue up - and a triage that says "cannot reproduce"
when the reporter is right is worse, because it closes the door.

Two failure modes to avoid, in order of cost:

1. **Confirming from the code.** Reading a plausible bug into a diff and
   reporting it as reproduced. If you did not observe it, say you did not.
2. **Testing the wrong version.** A port answering is not evidence of which
   code answered. Half of "cannot reproduce" is really "reproduced on a
   different commit".

## 1. Read the report as written

Extract, and state back, what the reporter actually gave you:

| | |
|---|---|
| version | an ELN version, a commit, "production", or nothing |
| steps | the exact sequence, or the gap where one is missing |
| expected / actual | in their words, not yours |
| scope | one user, one record, one collection, or everything |

Where a field is missing, that is the first thing to ask for - and ask once,
with the specific question, rather than a checklist.

## 2. Establish the version before touching anything

- If they named a version, reproduce on **that** version first. A bug fixed
  since is still a real report, and the answer is "fixed in X", which is
  useful.
- If they named none, try the released version, then `main`. A difference
  between the two is itself the finding.
- Record the commit you ran. `docs/RUNBOOK.md` for getting an instance;
  `bin/eln-up.sh` prints the HEAD it booted for exactly this reason.

## 3. Reproduce, with a fixture you built

Seed the state through `rails runner` before the browser, never by clicking the
app into position - a reproduction nobody else can recreate is an anecdote.
Then one of four verdicts:

- **confirmed** - you observed it. Say on which commit, with the steps you ran.
- **confirmed, different cause** - the symptom is real, the mechanism is not
  what the report says. This is the most valuable triage outcome; say both.
- **not reproduced** - say exactly what you ran and what happened instead, so
  the reporter can point at the difference. Never phrase it as doubt about
  them.
- **already fixed** - name the commit or PR that fixed it, and the version it
  shipped in.

A fifth outcome exists and is often right: **not enough information**. Say
which one fact would settle it.

## 4. Check for the things that make a report a duplicate or a non-bug

- **Duplicate**: search open and closed issues for the symptom, not the title.
  Link what you find; do not close anything.
- **Already-documented behaviour**: search the documentation site. If the
  software does what the docs say and the reporter expected otherwise, the
  finding is a documentation or design question, and saying so is the triage.
- **A gate, not a bug**: a feature hidden because a permission or feature gate
  is off looks exactly like a broken feature. Check the gate before the code.
- **Seeded data**: a development database carries the output of old bugs.
  Reproducing on seeded data proves less than it appears to.

## 5. Recommend a change without making it

The recommendation is a direction with a reason, not a patch:

- the file and function where the behaviour originates (`path:line`)
- why that is the cause, in one or two sentences
- what the fix has to preserve - the other caller, the other version, the
  migration that depends on it
- the test that would fail today and pass after, which is the part most often
  skipped. A fix whose test passes against the unpatched code tests nothing.

If the fix is genuinely one line and obviously safe, say that too - but still
as a recommendation. Opening a pull request is a separate decision and belongs
to a human unless they asked for it.

## 6. What to post

One comment. Verdict first, then evidence, then recommendation, then what you
did not check. Label suggestions as suggestions - applying `bug` or `confirmed`
is a maintainer's call, and an agent that labels its own conclusions makes the
label meaningless.

```
**Verdict** confirmed on <sha> (<version>)

**Reproduced**
<fixture, steps, what happened>

**Cause**
<path:line, one or two sentences>

**Recommendation**
<direction, what to preserve, the test that should fail today>

**Not checked**
<versions, platforms, paths you did not cover>
```

## 7. When an agent is assigned rather than labelled

Being assigned to an issue is an instruction to triage it, not to fix it.
Confirm, recommend, and hand it back. If the assignment explicitly asks for a
fix, the branch comes off the default branch, the pull request is a draft, and
the test that proves the fix comes with it.

Never close an issue, never apply or remove a label, and never reassign.
Those are maintainer actions, and a triage that performs them is indistinguishable
from a triage that got it wrong.
