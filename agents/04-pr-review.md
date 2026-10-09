# Agent 4 — PR review

Not part of the docs pipeline; the same discipline applied to code review. Kept
here because the practice was already working in `chemotion_ELN` and the
conventions are worth not losing.

## Output

One review file per PR, then a comment linking it. Structure:

1. **Verdict** — approve / approve with comments / request changes, one line.
2. **Does the fix work?** Reproduce the reported behaviour before and after the
   patch. State which commits you tested.
3. **Do the tests test the fix?** The most valuable finding this practice has
   produced: a PR whose specs used a shallow render, so the new effect never
   ran in them — revert the fix and every spec still passed. Check that each
   new test fails against the unpatched code.
4. **Interaction with work in flight** — `git merge-tree` against `main` and
   against any branch that touches the same files. Say which order to merge in.
5. **Findings** — each one `path:line`, with the input that triggers it.
6. **Out of scope** — things you noticed that the PR did not cause. Label them
   as such rather than loading them onto the author.

## Rules

- Verify before reporting. A claim you have not reproduced is a question, so
  phrase it as one.
- Separate "this is wrong" from "I would have done it differently".
- Never push to someone else's branch.
