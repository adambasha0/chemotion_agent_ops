# Agent 3 — E2E author

> **Deferred.** Not being worked on. The documentation pipeline comes first;
> this file is the plan for when it is picked up, including the one finding
> worth keeping in view: the ELN's Cypress suite already exists and its
> workflow is dispatch-only, so the first task is checking whether it passes,
> not writing specs.

**Where the work goes** `chemotion_ELN`, in the existing Cypress suite under
`spec/cypress/end_to_end/`. Not in this repo. Tests live with the code they
test, and a suite in a separate repo always tests a version it does not
control.

## Read this before proposing a framework

The ELN already has:

- ~17 specs in `spec/cypress/end_to_end/`, including `create_reaction.cy.js`
  and `reaction_variations.cy.js`
- `cypress-rails` app_commands: `factory_bot`, `scenarios`, `clean`, `eval` —
  the deterministic-fixture mechanism, already built
- `.github/workflows/end-to-end.yml`, which is **`on: workflow_dispatch` only**
- 16 Capybara feature specs in `spec/features/`

So the first task is not writing specs. It is finding out whether the suite
passes today, and getting it to run on pull requests or nightly. Adding
coverage to a suite nobody runs adds nothing.

## The ladder

Climb it. Each rung reuses the fixtures of the one below.

| # | Feature | Why here |
|---|---|---|
| 1 | login, collections | shortest path; mostly already covered |
| 2 | create / edit a sample | one form, one record, easy assertions |
| 3 | inventory and safety data | file upload, a nested tab |
| 4 | wellplates | drag and drop, but onto a grid |
| 5 | reactions | several linked records; `create_reaction.cy.js` exists |
| 6 | reaction variations | computed columns, many rows |
| 7 | the reaction scheme | last, and expect it to resist |

## Rung 7, honestly

The structure editor runs in an iframe and the scheme is built by dragging.
Two things follow:

- **The canvas is not the oracle.** A mid-drag DOM state shows a molecule
  apparently dropped into place when it is only the library's hover preview.
  Assert on the persisted reaction through the API, not on the canvas.
- **Some of it may not be drivable at all.** If synthetic input cannot place a
  reactant, say so in the spec's comment and cover what you can. A green test
  that proves nothing is worse than a documented gap.

## Rules

- One behaviour per spec, named for the behaviour.
- Fixtures through `cy.appScenario` / `factory_bot`, never by clicking the app
  into the right state.
- Assert the persisted record, not just the rendered row.
- A spec that fails intermittently is a bug report, not a spec. Quarantine it
  with the reason, and open an issue.
