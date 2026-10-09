# Run & capture

The procedure, for an agent starting cold. `../rules/` holds the constraints;
this is the order you do things in. Verified by hand against
`llm-infrastrcuture-layer-in-chemotion` and against four bug branches on
`main`. The reasons behind each step, in a readable layout:
https://claude.ai/artifact/Q86WrE4wNgcv31xEWotEFA

Once: `cp env/eln.env.example env/eln.env`, edit it, `npm install`.

## A. Run the ELN — `./bin/eln-up.sh`, re-runnable

1. **Worktree.** `git worktree add` the branch, then copy the gitignored
   working set (`.env`, `.env.development`, `config/*.yml`). A bare worktree
   will not boot; Rails dies on one missing file per boot.
2. **Dependencies.** Copy `node_modules` from the primary checkout; the
   one-shot `deps` service reconciles the branch delta. Clone the homedir
   volume, never share it — a branch gem installed into a shared volume breaks
   every `rails` run in the stack someone is developing on.
3. **Database.** `pg_dump` the source into your own copy, selected with
   `DATABASE_URL` because `database.yml` hardcodes the dev name. A copied dev
   database is **not a clean fixture**: it carries the output of old bugs, and
   that output is indistinguishable from current behaviour unless you read the
   code.
4. **Compose up** `app webpacker worker` on your own ports. The dev-server host
   is pinned to the container name, not the `webpacker` alias — every chemotion
   project registers that alias, the name round-robins, and Rails then proxies
   `/packs` to another branch's build. Point the HMR socket at your own port;
   do not disable HMR, because the refresh transform still emits
   `$RefreshReg$` and the bundle breaks.
5. **Unlock a login** on your copy: `update!` (not `update`, which returns
   `false` silently) plus `update_columns(locked_at: nil, failed_attempts: 0)`,
   or Devise keeps rejecting a correct password.
6. **Health.** The script polls `/users/sign_in` and prints the HEAD. A port
   answering is not evidence of which code answered.

Then, when you change Ruby under `lib/` or need a clean boot:
`./bin/eln-restart.sh` — it refuses to start while an old puma holds the port.
To prove a checkout reached the browser rather than just the disk:
`./bin/wait-bundle.sh present '<a string only the new code contains>'`.

## B. One flow — `harness/tasks/<task>/flow.js`

Copy `harness/tasks/TEMPLATE/flow.js`. Six beats:

1. **Fixture** through `rails()`, before the browser. Never through the page's
   request context: a non-GET without a CSRF token resets the Rails session,
   and the flow then fails six steps later looking like a bad selector.
2. **`startSession(name, who, { viewport })`** — pre-authenticated via
   `storageState`, so the first frame is the app and not a sign-in form.
3. **`drv.markStart()`** once the subject screen is up; the encoder drops
   everything before it. Worth 15–22 s per take.
4. **Act.** `drv.click` (default), `clickPlain` (menus — a glide across a
   dropdown fires `mousemove` on every item and the press is swallowed),
   `clickUntil` (transient UI), `clear`+`select`, `type`, `hold(ms, why)`.
   Never bare `fill`/`selectOption`. About 1 s to arrive, press, 450 ms to
   settle, 1 s before the next move.
5. **Assert on the server**, then `drv.pass()` each proven claim. No proof, no
   file.
6. **`shot()`** for a still — `locators: [a, b]` crops the union when a popover
   is portalled — or **`finish()`** for the animation.

Pacing and trim are one setting: the trim caps a still stretch, so the cap must
sit above the pause the pacing asks for, or every deliberate pause is quietly
clipped and the take feels rushed for reasons invisible in the flow code.

## C. Ship

```
./bin/capture.sh <task> | 'admin-*' | all    # serial: shared DB
./bin/review.sh                              # review.html, from sidecars only
./bin/publish.sh                             # refuses unevidenced assets
```

Then choose the docs tree by `lastVersion` — see `rules/saurus-docs.md`.

## D. E2E without media

Same flow with the camera off: drop the pointer, the pacing and `shot()`; keep
the fixture and every assertion. Plain `locator.click()`. Assert the DOM for
what the user sees and the server for what was stored, assert the absence of
removed controls, dump a full-page screenshot on throw, exit non-zero.

For specs that belong to the product rather than to a document, write Cypress
in the ELN repo instead — see `agents/03-e2e-author.md`.

## Traps

| Symptom | Cause and fix |
|---|---|
| press does nothing | the glide swept a dropdown; `clickPlain` |
| `boundingBox()` null | the node re-rendered and detached; re-measure immediately before clicking |
| click succeeds, nothing happens | coordinates outside the viewport, or no handler attached yet; scroll in, re-measure, assert on screen |
| disabled control ignores you | `pointer-events: none`; assert the disabled state and its tooltip |
| empty list in the shot | direct navigation raced the fetch; click the nav element |
| wrong section's control | a shared ancestor and `.first()`; anchor on the heading, take the next control in document order |
| blank frames, dead tabs | another stack's HMR socket; point it at your own port |
| half the packs 404 | the `webpacker` alias round-robined; pin the container name |
| renderer dies mid-flow | memory; `--disable-dev-shm-usage`, and do not cap the JS heap |
| stale toast in frame | `clearPendingNotices()` in warmup — and republish after re-recording |
| a row wraps onto two lines | viewport too narrow; 1920×1080, collapse the sidebar, assert the midpoints |
| `getByRole` finds nothing | often a real accessibility gap; use a CSS selector and file it |
| you tested stale Ruby | `lib/**/*.rb` is `require`d, not autoloaded; `./bin/eln-restart.sh` |
| rubocop clean locally, red in CI | CI installs rubocop unpinned with `NewCops: enable`; `./bin/eln-rubocop.sh` |
| `DatabaseCleaner` errors outside examples | two spec runs share the test database; re-run before believing it |
