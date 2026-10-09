// <task name> - <the one screen or journey this proves>
//
// Copy this directory to harness/tasks/<your-task>/ and fill it in. The six
// beats below are the whole shape; EXAMPLE-sds-extract-control.js in this
// folder is a real one that shipped.
const {
  startSession, login, shot, finish, sleep, assert, rails, warmup, BASE,
} = require('../../lib/lib');

(async () => {
  // 1. FIXTURE, before the browser exists.
  //
  // Through rails(), never through the page's request context: in Rails a
  // non-GET without a CSRF token resets the session, and the flow then fails
  // many steps later looking like a bad selector.
  //
  // Print what the flow needs with a "::" marker - rails() returns only those
  // lines, so Rails' boot chatter cannot be mistaken for output. Raise in Ruby
  // if the state you need is absent: a flow that silently proceeds without its
  // fixture produces a convincing recording of the wrong thing.
  const fixture = rails(`
    user = User.find_by!(name_abbreviation: '${process.env.ELN_USER_LOGIN || 'CU1'}')
    # ... set up exactly the state this task shows, idempotently ...
    puts "::" + [user.id].join('|')
  `).trim().split('|');
  const [userId] = fixture;
  assert(userId, 'the fixture resolved a user');

  // A take started while webpack is recompiling is a white rectangle.
  await warmup();

  // 2. SESSION, pre-authenticated.
  //
  // Recording starts when the context is created, so signing in on the page
  // puts a login form at the head of every animation. startSession logs in
  // over HTTP and hands the cookie to the recorded context.
  //
  // 1920x1080 unless you have a reason: narrower viewports wrap rows, and a
  // wrapped row photographs a layout fault as if it were the UI.
  const s = await startSession('<asset-name>', 'user',
    { viewport: { width: 1920, height: 1080 } });
  const { page, drv } = s;

  try {
    await login(page, 'user');   // asserts the session is already live

    // Prove the precondition on the server before filming anything that
    // depends on it. The screen is not the oracle.
    // const r = await (await page.request.get(`${BASE}/api/v1/...`)).json();
    // assert(r.something === true, 'the feature is enabled for this user');
    // drv.pass('server: ... reports ...');

    await page.goto(`${BASE}/mydb/collection/...`, { waitUntil: 'domcontentloaded' });
    await sleep(6000);

    // 3. MARK THE SUBJECT.
    //
    // Everything before this - the sign-in, the landing page, the collection
    // tree, a profile overlay - is dropped by the encoder. Call it on the
    // screen a reader would expect to open on, not at ground zero. A flow that
    // never calls it records start_marked: false and the review page says so.
    drv.markStart();

    // 4. ACT. Every state change follows a visible click.
    //
    //   drv.click(locator)        glide, pause ~1s, press, settle ~450ms
    //   drv.clickPlain(locator)   menus and dropdowns: one move, no glide -
    //                             a sweep fires mousemove on every item and
    //                             the press is swallowed
    //   drv.clickUntil(l, verify) transient UI: press, confirm, retry
    //   drv.clear(l) / drv.select(l, v) / drv.type(l, text)
    //   drv.hold(ms, why)         a pause the trim must not cap
    //
    // Never bare fill() or selectOption(): a value that changes with no click
    // is exactly the "it happened by itself" frame readers complain about.
    //
    // The tempo comes from PACE in lib.js - the pointer sits 1.5 s on a
    // control, the effect renders for 0.6 s, the screen holds 1.5 s. Override
    // a pause only to make it LONGER; a per-call pause under PACE is how a
    // pacing change gets silently undone.
    const tab = page.locator('[role="tab"]').filter({ hasText: /^Inventory$/ }).first();
    await tab.waitFor({ state: 'visible', timeout: 30000 });
    await drv.clickPlain(tab, { pauseAfter: 2500 });
    drv.pass('the detail pane offers an Inventory tab');

    // 5. ASSERT, before any pixels are written.
    //
    // Re-read the record over the API or through rails() and prove the field
    // really changed, the count really moved, the key is still masked. Assert
    // absence too: a removed control must be gone from the DOM, not hidden.
    // A flow that cannot prove its outcome must throw, not write a file.

    // 6. WRITE THE ASSET.
    //
    // shot() for a still; pass `locators: [a, b]` to crop the union when a
    // popover renders in a portal outside its container.
    await shot(drv, '<asset-name>', {
      locator: page.locator('<the subject>').first(),
      padding: 12,
      extra: {
        replaces: 'static/img/<path>.png',
        doc: 'docs/eln/<page>.mdx',
        shows: '<what a reader is meant to see>',
      },
    });

    // For an animation, finish() instead - it trims, encodes the WebP and
    // writes the sidecar:
    // await finish(s, '<asset-name>', { doc: '...', shows: '...' });

    console.log('OK');
  } catch (e) {
    console.error('FAILED: ' + e.message);
    await page.screenshot({
      path: require('../../lib/lib').WORK + '/<asset-name>_failure.png', fullPage: true,
    }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await s.context.close().catch(() => {});
    await s.browser.close().catch(() => {});
  }
})();
