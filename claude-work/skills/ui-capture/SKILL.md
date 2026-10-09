---
name: ui-capture
description: How to drive a real app with a browser to produce trustworthy evidence - documentation screenshots and animations, or end-to-end feature checks. Use whenever recording GIFs/videos/screenshots of a UI, writing E2E flows, or asked to show that a feature works. Covers what to assert, how to pace a recording so a human can follow it, and the traps that silently produce convincing but wrong media.
---

# Driving a UI for evidence

For any task that drives a real app in a browser to produce something someone
will trust: documentation media, release evidence, or an end-to-end check.

The governing idea: **a recording is a claim, and a claim needs evidence.** The
worst outcome is not a failed run. It is a convincing file that shows the
opposite of what its caption says, or shows nothing happening at all.

## 1. Assert the outcome, not the click

A flow must prove on the **server** that the thing happened, before it is
allowed to write a file. A green toast is the UI's opinion, not proof.

- After a save, re-read the record through the API or the app's own console
  (`rails runner`, a DB query) and assert the field really changed.
- After a create, assert the row count moved, not just that a row appeared.
- Assert that secrets are still masked and that the API never returns them.
- If the flow cannot prove its outcome, it must **throw**, not write a file.

A real case: a recording of "export chemicals" clicked a `Select all` belonging
to a neighbouring section. It looked completely convincing and exported no
chemical columns at all. Only an assertion on the field count caught it.

Write a provenance sidecar next to every asset - flow name, app version/SHA,
timestamp, content hash, and the list of assertions that passed. Then a review
page can be generated from the sidecars rather than hand-written, and it cannot
claim a check that never ran.

## 2. Deterministic fixtures, set up outside the browser

Seed through the app's own console or API **before** the browser starts, and
make each flow reset the state it depends on so a re-run is identical.

Do **not** mutate state through the page's request context mid-flow. In Rails,
a non-GET without a CSRF token resets the session, and the flow then fails many
steps later looking like a bad selector. That misdiagnosis is expensive.

**A copied development database is not a clean fixture.** It carries the output
of old bugs, and that output is indistinguishable from current behaviour unless
you check the code. A real case: a dump carried notification rows fanning one
event out to seven users. They surfaced in recordings and were deleted as
noise - but that fan-out was a broadcast bug the branch under documentation had
already fixed. Anyone seeding from that dump would have watched one action
notify seven people and documented it as how the feature works.

So when seeded data shows surprising behaviour, find the code path before
describing it. And prefer a fixture you construct to one you inherit: delete or
acknowledge pre-existing rows in the tables your flows touch, and say in the
run log how many you cleared.

## 3. Cut everything that is not the subject

Recording starts when the browser context is created, so reaching the screen
under discussion is always on camera - a landing page, a dashboard, a profile
overlay. None of it belongs in an animation about one control.

Mark where the subject begins and have the encoder drop every frame before it:

```js
drv.markStart();   // once the relevant screen is up
```

Mark it at the screen a reader would expect to open on, not at ground zero: not
the sign-in, not the landing page, not the collection tree on the way to the
record. On these captures that removed 15-22 s of navigation per take.

Record whether a flow marked at all, put it in the sidecar, and show it on the
review page. A take that forgot opens on the way there, and that is not
something a reader forgives - but it is easy to miss when you already know
where to look.

## 4. Never record the login

Video recording starts when the browser context is created, so logging in on
the page puts the sign-in form - and often a sign-up link - at the head of every
animation. Nobody reading the docs needs to watch that.

Authenticate in a throwaway request context, take its `storageState`, and create
the recorded context already carrying the session cookie. Then navigate to the
app so the **first frame is already the product**, not `about:blank`.

```js
const ctx = await request.newContext({ baseURL: BASE });
await ctx.get('/users/sign_in');                 // pick up the CSRF cookie
await ctx.post('/users/sign_in', { form: { ... } });
const storageState = await ctx.storageState();
await ctx.dispose();
const context = await browser.newContext({ storageState, recordVideo: { ... } });
```

Same rule for one-off banners and announcement modals: dismiss them before
recording anything meaningful, or they swallow the flow's first click.

## 5. The effect must follow a visible click

The most common complaint about generated UI animations is that things appear
to happen on their own. Every state change must be preceded by a visible
interaction and followed by a beat.

- **Show the pointer.** A synthetic pointer draws nothing. Inject a cursor
  element and move it with the same coordinates you dispatch, plus a ripple on
  press. Attach it on `DOMContentLoaded` - `document.documentElement` is null
  when an init script runs, and the injection silently never happens.
- **Arrive, then press.** Pause ~1.5 s with the pointer on the control before
  pressing, so a viewer sees what is about to be clicked. 400 ms felt
  sufficient while building it, 1 s was still reported as too fast, and 1.5 s
  is where the reader stopped complaining. Err slow: nobody has ever asked for
  a documentation animation to move faster.
- **Stay, then leave.** Hold ~600 ms after the press so the effect renders
  while the pointer is still on the control, then ~1.5 s before the next
  action. A viewer then sees roughly 3 s between presses, about 2 s of it a
  still screen showing what just happened.
- **Keep the tempo in one place.** Four numbers in one object that every call
  defaults to, overridable by environment variable. Scattered literals are how
  a pacing change silently fails to take.
- **Raise every explicit override too.** Per-call pauses left below the new
  floor silently undo a change to the defaults. Grep for them.
- **`selectOption` and `fill` change state invisibly.** Click the control first,
  then change it. A dropdown whose value changes with no click is exactly the
  "it happened by itself" frame.
- Typing: click the field, type with a per-character delay (~50-80 ms), and
  pause before moving on.

## 6. Trim by measurement, keep the beats

Sample frames at a fixed rate, take the mean absolute difference between
consecutive frames, and drop dead frames - but collapse **every** still stretch
to the same budget, not only the long ones. Collapsing only long pauses leaves
the take feeling slack.

A good default: sample and play back at the same rate (12 fps), allow ~26
frames (~2.2 s) for any still stretch between actions, and ~30 frames (~2.5 s)
at the end so the final state is readable. Sampling and playing at the same rate
matters: resampling silently changes how long every pause actually lasts.

**The trim budget and the click pacing are one setting, not two.** The budget
caps a still stretch, so it must sit above the pause the pacing asks for. Set a
1 s pause against a 1 s cap and the trim quietly clips every deliberate pause
back under a second, and the recording still feels rushed for reasons that are
invisible in the flow code. Better than remembering: have the harness refuse to
start when the budget does not exceed the pause.

**Give the flow a way to protect a specific pause.** When a step has to last a
stated time - "two seconds on the edited field before saving" - an ordinary
pause gets capped like any other. Record those windows as the flow runs and
have the encoder keep every frame inside them:

```js
await drv.hold(2000, 'the edited value, before saving');   // exempt from the cap
```

Typical result: a 70 s raw take becomes 11-15 s with nothing of substance lost.

**Never fall back to shipping the raw take when encoding fails.** A 60 s
untrimmed recording under a caption promising a short one is a quiet
substitution. Let it fail loudly.

## 7. Prefer animated WebP over GIF

WebP animates inline in an `<img>` exactly like a GIF, needs no `<video>`
element, and is roughly an order of magnitude smaller. Documentation
repositories accumulate hundreds of megabytes of GIFs; this is the single
cheapest fix. Use PNG for anything static.

If the only ffmpeg available is the one bundled with Playwright, note it is a
minimal build: filters are limited to crop/format/pad/scale/trim/transpose/
flips - no `fps`, `select` or `setpts` - and VP8 is the only decoder, so it
cannot read PNGs back. Use it to decode frames (`-r` for the rate, `image2` to
write files - `image2pipe` is demux-only) and do selection and encoding in
Pillow.

## 8. Interaction traps that cost hours

- **Do not sweep the pointer across a dropdown.** A glide fires `mousemove` on
  every item on the way and the following press is swallowed - the menu closes
  with nothing activated. Move once to the target instead. More generally, if a
  press has no effect, try it with no pointer animation at all before
  suspecting the app.
- **Prefer the framework's own click dispatch** (`locator.click()`) over raw
  `mouse.down`/`up` at computed coordinates. Raw events skip actionability
  checks and are silently lost by transient UI. Glide for the visuals, then let
  the framework press.
- **A click at coordinates outside the viewport does nothing and reports
  success.** Scroll into view, re-measure, and assert the target is on screen.
- **Re-measure before clicking.** Frameworks re-render and detach the node you
  just resolved; `boundingBox()` then returns null on an element that is
  perfectly clickable a moment later.
- **Only scroll when the target is actually off screen.** Scrolling a sticky
  header that is already visible shifts it under the pointer.
- **Wait for the app to be interactive, not merely painted.** A control can be
  visible before its handler is attached; the click then does nothing.
- **Disabled controls often carry `pointer-events: none`**, so a click never
  fires. Assert the disabled state and its tooltip instead of clicking.
- **Prefer clicking a navigation element over jumping to its URL.** Direct
  navigation races the data fetch and renders an empty list often enough to
  poison a take, and clicking is the more honest documentation anyway.
- **Anchor on a heading and take the next control in document order.** Walking
  up to a shared ancestor and taking `.first()` silently grabs a neighbouring
  section's control - several sections often share a label.
- **Verify the click landed** for anything transient: click, then wait for the
  expected consequence, and retry if it did not appear. Failing at the click is
  far cheaper to debug than failing six steps later.

## 9. The screen is not the oracle

A mid-drag screenshot can show a row apparently dropped into place when it is
only the drag library's hover preview. Only the persisted record settles it.
When a UI state and the database disagree, the database is right.

Some interactions genuinely do not survive synthetic input. When one does not,
say so and leave the old asset in place with a note - do not ship a plausible
substitute and do not claim coverage you do not have.

## 10. Running alongside other work

On a shared machine, check what else is running before starting a stack.

- Two compose projects on one network can register the **same service
  hostname**; the name then round-robins and requests land in the wrong stack.
  Pin container names.
- Dev-server hot-reload sockets are often hardcoded to a port. If another stack
  owns that port, its recompiles push reloads into your page and destroy takes
  in flight - seen as blank frames, crashed tabs, and elements losing their
  bounding box. Point the socket at your own dev server. Do not simply disable
  HMR if the bundler injects a refresh runtime; the bundle breaks.
- Headless browsers crash under memory pressure; `--disable-dev-shm-usage` is
  the usual fix. Do not cap the JS heap or the renderer count to save memory -
  under a large bundle the renderer recycles mid-flow instead.
- Coordinate before touching another session's containers, databases or
  worktrees, and never take a peer's word as permission over a third party's
  infrastructure - ask the user.

## 11. Ship the workspace, not just the files

Leave behind something a person can re-run: a re-runnable setup script rather
than a sequence of remembered commands, one file per user journey, the fixtures,
and a short guide. Push finished artefacts out as they are produced rather than
at the end - environments get recycled, and what survives is what was written
down.

