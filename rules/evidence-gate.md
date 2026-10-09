# The evidence gate

The rule every agent and every workflow in this repo obeys.

**A screenshot is a claim, and a claim needs evidence.** The worst outcome is
not a failed run. It is a convincing file, or a fluent paragraph, that states
the opposite of what the software does.

This is not hypothetical. `chemotion_saurus` commit `0968878b` wrote junk media
under a message claiming a successful recapture. An agent that cannot boot an
instance will still happily write confident, well-formed, wrong documentation.

## What the gate requires

1. **No asset without a sidecar.** Every file in a task's `out/` has a `.json`
   beside it recording the flow, the ELN commit filmed, the sha256, and the
   assertions that passed. `bin/publish.sh` refuses the rest.
2. **No sidecar without assertions.** An empty `assertions_passed` is refused
   the same way. A flow that cannot prove its outcome throws instead of writing
   a file.
3. **Assertions are server-side where the claim is about state.** A green toast
   is the UI's opinion. Re-read the record through the API or `rails runner`.
4. **No documentation of a screen nobody ran.** A docs PR that ships no new
   asset must say, in its body, which screens could not be captured and why.
   Reusing an old image under new wording is the failure this gate exists to
   stop.
5. **No raw take as a fallback.** If trimming or encoding fails, the run fails.
   A 60-second untrimmed recording under a caption promising a short one is a
   quiet substitution.
6. **Every docs PR names its commit range.** `<ELN sha>..<ELN sha>`, so a
   reviewer can check the prose against the diff rather than against the prose.

## What it does not require

Completeness. Some interactions do not survive synthetic input — a structure
editor in an iframe, some drag-and-drop. When one does not, say so, leave the
existing asset in place, and claim no coverage you do not have. A documented
gap is worth more than a plausible substitute.

## Where it is enforced

| Point | Mechanism |
|---|---|
| asset → docs repo | `bin/publish.sh` exits non-zero on any unevidenced file |
| review page | `make_review.py` prints the unevidenced count and exits non-zero |
| docs PR | opened as **draft**, labelled for human review, never auto-merged |
| capture job | a flow that throws fails the job; no partial publish |
