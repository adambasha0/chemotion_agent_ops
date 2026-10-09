// Shared driver for Chemotion capture flows and E2E checks.
//
// History: grown over two sessions against chemotion_ELN. The pointer overlay,
// xlsx parsing and measured trim come from the bug-evidence harness; the
// provenance sidecars, PNG stills, markStart/hold and animated WebP from the
// AI/LLM documentation captures. VP8, not VP9: the ffmpeg bundled with
// Playwright has libvpx only, and the VP9 call silently fell back to shipping
// the raw untrimmed take.
//
// Everything environment-specific comes from env vars; see env/eln.env.example.
const { chromium, request } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BASE = process.env.ELN_BASE || 'http://localhost:3001';
// Dev-only logins on a throwaway database copy. Never committed: export them,
// or source env/eln.env. Login is a POST, never typed on camera.
const USERS = {
  admin: {
    login: process.env.ELN_ADMIN_LOGIN || 'ADM',
    password: process.env.ELN_ADMIN_PASSWORD || '',
  },
  user: {
    login: process.env.ELN_USER_LOGIN || 'CU1',
    password: process.env.ELN_USER_PASSWORD || '',
  },
};
// The container the app runs in, for `rails runner`. Defaults to the capture
// project's container, never the development stack's: rails() writes, and the
// development database is not ours to write.
const APP_CONTAINER = process.env.ELN_APP_CONTAINER || 'chemotion_capture-app-1';
// The tree the app serves, so a sidecar can record the SHA that was filmed.
const WT = process.env.ELN_TREE || '/home/dolma/repo/chemotion_ELN';
// Where flows write. One directory per task, created by the runner.
const ROOT = process.env.CAPTURE_ROOT || path.resolve(__dirname, '..');
// A flow writes next to itself, in harness/tasks/<task>/out - the layout the
// review page and publish.sh walk. CAPTURE_OUT overrides it.
function defaultOut() {
  const main = require.main && require.main.filename;
  if (main && path.basename(path.dirname(main)) !== 'lib') {
    return path.join(path.dirname(main), 'out');
  }
  return path.join(ROOT, 'out');
}
const OUT = process.env.CAPTURE_OUT || defaultOut();
const WORK = process.env.CAPTURE_WORK || path.join(ROOT, 'work');

const CURSOR_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById('__cur')) return;
    const s = document.createElement('style');
    s.textContent = \`
      #__cur{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        background:rgba(255,64,0,.35);border:2px solid #ff4000;z-index:2147483647;pointer-events:none;
        left:-100px;top:-100px;transition:none;box-shadow:0 0 6px rgba(0,0,0,.4)}
      .__rip{position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
        border:3px solid #ff4000;z-index:2147483646;pointer-events:none;animation:__rk .55s ease-out forwards}
      @keyframes __rk{from{transform:scale(.4);opacity:1}to{transform:scale(4.5);opacity:0}}
      #__pulse{position:fixed;right:12px;top:50%;width:6px;height:60px;margin-top:-30px;border-radius:3px;
        background:#ff4000;opacity:0;z-index:2147483646;pointer-events:none;transition:opacity .25s}
    \`;
    document.head.appendChild(s);
    const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
    const p = document.createElement('div'); p.id = '__pulse'; document.body.appendChild(p);
    let x = -100, y = -100;
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; c.style.left = x + 'px'; c.style.top = y + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = '__rip';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
    let t = null;
    const pulse = () => { p.style.opacity = '.8'; clearTimeout(t); t = setTimeout(() => { p.style.opacity = '0'; }, 260); };
    addEventListener('wheel', pulse, true);
    addEventListener('scroll', pulse, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Fail extends Error {}
function assert(cond, msg) { if (!cond) throw new Fail('ASSERTION FAILED: ' + msg); }

// ---------------------------------------------------------------- pointer
class Driver {
  constructor(page) {
    this.page = page; this.x = 720; this.y = 500; this.asserts = [];
    this.t0 = Date.now();        // set again by startSession once recording begins
    this.startOffsetMs = 0;      // everything before this is cut from the take
    this.holds = [];             // windows the trimmer must not collapse
  }

  // Mark where the documented action begins. Recording starts when the browser
  // context is created, so getting to the screen under discussion is always on
  // camera - the ELN landing page, the admin dashboard, a profile overlay -
  // and none of that belongs in an animation about one control. Call this once
  // the starting screen is on screen; the encoder drops every frame before it.
  markStart() {
    this.startOffsetMs = Date.now() - this.t0;
    console.log(`  [mark] take starts at +${(this.startOffsetMs / 1000).toFixed(1)}s`);
  }

  pass(msg) { this.asserts.push(msg); console.log('  [ok] ' + msg); }

  async glide(x, y, ms = 420) {
    const steps = Math.max(6, Math.round(ms / 16));
    const x0 = this.x; const y0 = this.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await sleep(16);
    }
    this.x = x; this.y = y;
  }

  // Scroll into view, re-measure, assert on-screen, glide, pause, click.
  //
  // The pauses are not padding. A viewer has to see the pointer ARRIVE on a
  // control and press it before whatever the press causes appears, or the
  // recording reads as if the app acted on its own. pauseBefore buys the
  // arrival; settle keeps the pointer on the control while the effect renders
  // instead of leaving for the next target in the same frame.
  async click(locator, opts = {}) {
    // Defaults are deliberately slow. A documentation animation is read, not
    // skimmed: the pointer must sit on a control for a beat before pressing,
    // and the result must stay up for a beat after, or a viewer cannot tell
    // which control caused what. Nothing here is shorter than a second.
    const { glideMs = 420, pauseBefore = 1000, settle = 450, pauseAfter = 1000,
            dx = 0, dy = 0, jump = false } = opts;
    await locator.waitFor({ state: 'visible', timeout: 15000 });

    const vp = this.page.viewportSize();
    let b = await this.stableBox(locator);
    // Only scroll when the target really is off screen. Scrolling a topbar
    // element that is already visible shifts the sticky header under the
    // pointer and the press lands on nothing.
    if (!b || b.y < 0 || b.y + b.height > vp.height) {
      await locator.scrollIntoViewIfNeeded();
      await sleep(250);
      b = await this.stableBox(locator);
    }
    assert(b, 'target has a bounding box');
    const cx = b.x + b.width / 2 + dx;
    const cy = b.y + b.height / 2 + dy;
    assert(cx >= 0 && cy >= 0 && cx <= vp.width && cy <= vp.height,
      `click target is inside the viewport (got ${Math.round(cx)},${Math.round(cy)} vs ${vp.width}x${vp.height})`);

    if (jump) {
      // Transient menus only. Sweeping the pointer ACROSS a dropdown fires a
      // mousemove on every item on the way and the following press is then
      // swallowed - the menu closes with nothing activated. One move to the
      // target avoids that, and over the ~40px a menu item sits from its
      // trigger it still reads as a deliberate move rather than a teleport.
      await this.page.mouse.move(cx, cy);
      this.x = cx; this.y = cy;
    } else {
      await this.glide(cx, cy, glideMs);
    }
    await sleep(pauseBefore);
    // Glide first so the drawn pointer is seen arriving, then let Playwright
    // dispatch the press. Raw mouse.down/up at computed coordinates looked
    // equivalent but was silently lost by transient UI - a dropdown would
    // close with nothing activated - because it skips the actionability
    // checks that wait for the element to be stable and hit-testable.
    await locator.click({ timeout: 15000 });
    await sleep(settle);      // the effect lands here, pointer still on target
    await sleep(pauseAfter);
  }

  // Click, then prove the click actually did something, and try again if it
  // did not. Menu items are the reason: a dropdown can swallow a synthetic
  // press and close with nothing activated, and the flow then fails many
  // steps later against a screen it never reached.
  async clickUntil(locator, verify, opts = {}) {
    const { attempts = 3, verifyMs = 8000, reopen = null } = opts;
    for (let i = 1; i <= attempts; i++) {
      if (reopen && i > 1) await reopen();
      await this.click(locator, opts);
      try {
        await verify.waitFor({ state: 'visible', timeout: verifyMs });
        return;
      } catch (e) {
        if (i === attempts) {
          throw new Fail(`click produced no visible effect after ${attempts} attempts`);
        }
        console.log(`  [retry ${i}] the click had no effect, trying again`);
      }
    }
  }

  // A deliberate pause that the trimmer is forbidden to shorten.
  //
  // Ordinary pauses are capped by STILL_BUDGET, which is the point - it is what
  // stops a recording idling. But when a specific beat has to last a specific
  // time ("two seconds on the edited field before saving"), capping it defeats
  // the instruction. hold() records the window so the encoder keeps every frame
  // inside it, however still the screen is.
  async hold(ms, why = '') {
    const from = Date.now() - this.t0;
    await sleep(ms);
    this.holds.push([from, Date.now() - this.t0]);
    if (why) console.log(`  [hold] ${(ms / 1000).toFixed(1)}s - ${why}`);
  }

  // A <select> changed with selectOption alone produces a value change with
  // no visible interaction at all - the classic "the effect happened before
  // anyone clicked anything" frame. Press the control first, then change it.
  async select(locator, option, opts = {}) {
    await this.click(locator, { pauseAfter: 500, ...opts });
    await locator.selectOption(option);
    await sleep(1200);      // the chosen value must be readable before moving on
  }

  // Same reasoning for clearing a field: fill('') mutates it invisibly.
  async clear(locator) {
    await this.click(locator, { pauseAfter: 160 });
    await locator.press('Control+a');
    await sleep(220);
    await locator.press('Delete');
    await sleep(320);
  }

  // The minimal, most reliable press: no scroll, no re-measure, no glide -
  // just move the pointer onto the target and let Playwright dispatch.
  //
  // The ELN topbar needs this. A glide across the app before clicking the
  // user menu leaves the press inert: the menu opens and shuts with nothing
  // activated. The pointer still appears on each target, it just does not
  // sweep there.
  async clickPlain(locator, opts = {}) {
    const { pauseBefore = 1000, pauseAfter = 1200 } = opts;
    await locator.waitFor({ state: 'visible', timeout: 20000 });
    const b = await locator.boundingBox();
    if (b) {
      await this.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      this.x = b.x + b.width / 2; this.y = b.y + b.height / 2;
    }
    await sleep(pauseBefore);
    await locator.click({ timeout: 20000 });
    await sleep(pauseAfter);
  }

  // Poll until the element reports the same box twice in a row, so we aim at
  // a settled layout instead of one mid-render.
  async stableBox(locator, tries = 25) {
    let prev = null;
    for (let i = 0; i < tries; i++) {
      const b = await locator.boundingBox().catch(() => null);
      if (b && b.width > 0 && b.height > 0 && prev
          && Math.abs(b.x - prev.x) < 1 && Math.abs(b.y - prev.y) < 1) return b;
      prev = b;
      await sleep(160);
    }
    return prev;
  }

  async hoverOver(locator, ms = 400) {
    await locator.scrollIntoViewIfNeeded();
    const b = await this.stableBox(locator);
    assert(b, 'hover target has a bounding box');
    await this.glide(b.x + b.width / 2, b.y + b.height / 2, ms);
  }

  async type(locator, text, delay = 85, opts = {}) {
    const { replace = false } = opts;
    if (replace) await this.clear(locator);
    else await this.click(locator, { pauseAfter: 180 });
    await locator.type(text, { delay });
    await sleep(520);   // let the form react before the pointer moves away
  }

  async wheel(dy, chunks = 6) {
    for (let i = 0; i < chunks; i++) { await this.page.mouse.wheel(0, dy / chunks); await sleep(110); }
    await sleep(300);
  }
}

// ---------------------------------------------------------------- session
// Sign in OUTSIDE the recorded context.
//
// Video recording begins the moment a browser context is created, so logging
// in on the page put the sign-in form - and for a beat the sign-up link - at
// the head of every animation. Nobody reading the docs needs to watch that.
// The credentials go through a throwaway request context instead, and the
// recorded context is created already carrying the session cookie.
async function signedInState(who) {
  const { login: id, password } = USERS[who];
  assert(id, `known user "${who}"`);
  // Devise authenticates on user[login], not user[email]; posting the wrong key
  // returns a cheerful 200 with "Invalid Login or password" in the body. And an
  // empty password fails the same way, which is worth naming rather than
  // leaving as a mystery sign-in failure.
  assert(password, `a password for "${who}" - set ELN_${who.toUpperCase()}_PASSWORD in env/eln.env`);
  const ctx = await request.newContext({ baseURL: BASE });
  await ctx.get('/users/sign_in');                       // sets the CSRF cookie
  const resp = await ctx.post('/users/sign_in', {
    form: { 'user[login]': id, 'user[password]': password },
    maxRedirects: 5,
  });
  assert(resp.ok(), `sign-in succeeded for ${id}`);
  const probe = await ctx.get('/api/v1/users/current.json');
  assert(probe.ok(), `the session is live for ${id} (GET current.json ${probe.status()})`);
  const state = await ctx.storageState();
  await ctx.dispose();
  return state;
}

async function startSession(name, who = 'user', opts = {}) {
  const { landing = who === 'admin' ? '/admin' : '/mydb',
          viewport = { width: 1440, height: 900 } } = opts;
  const videoDir = path.join(WORK, name);
  fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const storageState = await signedInState(who);

  // This machine runs two ELN stacks and another session's captures, so free
  // RAM is tight and the tab was crashing ("Target crashed") mid-flow.
  // --disable-dev-shm-usage is the fix. Do NOT add --js-flags=--max-old-space-size
  // or --renderer-process-limit here: capping the heap under the ELN's very
  // large bundle makes the renderer recycle mid-flow, which surfaces as
  // elements losing their bounding box between waitFor and click.
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--force-device-scale-factor=1',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
    ],
  });
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: videoDir, size: viewport },
    acceptDownloads: true,
    deviceScaleFactor: 1,
    storageState,
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  (page error) ' + String(e).slice(0, 160)));
  const drv = new Driver(page);
  drv.t0 = Date.now();

  // Land on the app, not on about:blank, so the first frame of the recording
  // is already the product.
  await page.goto(BASE + landing, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  return { browser, context, page, videoDir, drv };
}

// Kept so flows read top-to-bottom, but the session is established before the
// recording starts; this only proves it and never shows a sign-in form.
async function login(page, who = 'user') {
  const r = await page.request.get(BASE + '/api/v1/users/current.json');
  assert(r.ok(), `already signed in as ${who} when recording started`);
  return r;
}

// The webpacker dev server compiles on first request after a restart, ~19 s,
// and serves a blank page meanwhile. A recording started in that window is
// white. Warm the bundle before the browser is even launched.
// Acknowledge every pending notification before a take. This database is a
// copy of a development one and carries notifications from earlier work - SDS
// extractions run on other days, import reports - which pop into the corner
// partway through a recording and have nothing to do with the feature being
// documented. Only our own copy is touched.
function clearPendingNotices() {
  try {
    const n = rails(`
      updated = Notification.where(is_ack: false).update_all(is_ack: true)
      puts "::" + updated.to_s
    `).trim();
    if (n && n !== '0') console.log(`  [notices] acknowledged ${n} pending notification(s)`);
  } catch (e) {
    console.log('  [notices] could not clear notifications: ' + e.message.slice(0, 80));
  }
}

async function warmup(timeoutMs = 180000) {
  clearPendingNotices();
  const started = Date.now();
  const { execFileSync } = require('child_process');
  let lastCode = '';
  while (Date.now() - started < timeoutMs) {
    try {
      lastCode = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}',
        BASE + '/packs/js/runtime.js']).toString().trim();
      if (lastCode === '200') {
        console.log(`  [warm] bundle served in ${Math.round((Date.now() - started) / 1000)}s`);
        return;
      }
    } catch (e) { /* app still restarting */ }
    await sleep(3000);
  }
  throw new Fail(`webpacker never served /packs/js/runtime.js (last ${lastCode})`);
}

// Log in over HTTP first so the video starts on the app, not the sign-in form,
// and no password is ever typed on camera.
async function login(page, who = 'user') {
  const { login: id, password } = USERS[who];
  assert(id, `known user "${who}"`);
  // Devise authenticates on user[login], not user[email]; posting the wrong key
  // returns a cheerful 200 with "Invalid Login or password" in the body. And an
  // empty password fails the same way, which is worth naming rather than
  // leaving as a mystery sign-in failure.
  assert(password, `a password for "${who}" - set ELN_${who.toUpperCase()}_PASSWORD in env/eln.env`);
  await page.goto(BASE + '/users/sign_in', { waitUntil: 'domcontentloaded' });
  const resp = await page.request.post(BASE + '/users/sign_in', {
    form: { 'user[login]': id, 'user[password]': password },
    maxRedirects: 5,
  });
  assert(resp.ok(), `sign-in POST succeeded for ${id}`);
  return resp;
}

// The admin app is one React page: ADMIN_PAGES is state, there is no URL or
// hash per section, so the sidebar entry has to be clicked. Navigating to
// /admin#ai or similar just lands on the dashboard.
async function openAdminLlmConfig(drv) {
  const page = drv.page;
  await dismissBanners(page).catch(() => {});
  const entry = page.locator('text=AI / LLM Config').first();
  let marked = false;
  let seen = false;
  for (let attempt = 1; attempt <= 3 && !seen; attempt++) {
    await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
    try {
      await entry.waitFor({ state: 'visible', timeout: 45000 });
      // The admin dashboard loading is not part of any of these stories.
      if (!marked) { drv.markStart(); marked = true; }
      seen = true;
    } catch (e) {
      // Either a cold bundle (blank page) or - the trap that cost an hour -
      // the OTHER stack's webpacker answered and served main, whose admin
      // sidebar has no AI / LLM Config entry at all.
      const items = await page.locator('.tree-view__title, .sidebar li').allInnerTexts()
        .catch(() => []);
      console.log(`  [retry ${attempt}] admin sidebar: ${JSON.stringify(items.slice(0, 20))}`);
      if (attempt === 3) {
        throw new Fail('the admin sidebar never showed "AI / LLM Config". If the '
          + 'other entries are present, the app was served main\'s JS bundle: '
          + 'check SHAKAPACKER_DEV_SERVER_HOST pins the container name.');
      }
      await sleep(5000);
    }
  }
  await sleep(900);
  await drv.click(entry, { pauseAfter: 900 });
  // Wait for the real heading, not the spinner that reads "Loading AI configuration…".
  await page.getByRole('heading', { name: 'AI / LLM Configuration' })
    .waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForResponse(
    (r) => /\/api\/v1\/admin\/llm_providers/.test(r.url()) && r.status() === 200,
    { timeout: 30000 },
  ).catch(() => {});
  await sleep(900);
  drv.pass('admin AI / LLM Configuration section is open');
}

// User profile: the settings overlay opens from the topbar dropdown labelled
// with the user's own name (its id is a generated react-aria one, so it can
// only be found by role + text), then the AI entry in the overlay's sidebar.
// Note the sidebar says "AI/LLM Settings" and the card header says
// "AI / LLM Settings" - two different strings, both real.
async function openUserLlmSettings(drv) {
  const page = drv.page;
  await waitForAppReady(page);
  await dismissBanners(page);

  // The topbar has exactly two .dropdown-toggle buttons - Info & Support, then
  // the user menu labelled with the user's own name. Its id is a generated
  // react-aria one, so position is the only stable handle.
  const userMenu = page.locator('.btn-topbar.dropdown-toggle').last();
  await userMenu.waitFor({ state: 'visible', timeout: 30000 });
  await drv.clickPlain(userMenu, { pauseAfter: 900 });

  // Scope to the OPEN menu. An unscoped getByRole('button', {name:'Settings'})
  // resolves somewhere else on the page and clicks nothing useful.
  const menu = page.locator('.dropdown-menu.show').first();
  await menu.waitFor({ state: 'visible', timeout: 15000 });
  const settings = menu.locator('.dropdown-item').filter({ hasText: /^Settings$/ }).first();
  await settings.waitFor({ state: 'visible', timeout: 15000 });

  // The settings overlay has its own sidebar; "Account" is its first entry and
  // the cheapest proof that the overlay actually opened.
  const overlayOpen = page.locator('.tree-view__title').filter({ hasText: /^Account$/ }).first();
  // Short hop, not a sweep: gliding far across the page leaves the trigger and
  // the menu closes mid-flight.
  for (let attempt = 1; ; attempt++) {
    await drv.clickPlain(settings, { pauseAfter: 1300 });
    if (await overlayOpen.isVisible().catch(() => false)) break;
    assert(attempt < 3, 'the Settings menu item opened the profile overlay');
    console.log(`  [retry ${attempt}] Settings did not open the overlay`);
    await drv.clickPlain(userMenu, { pauseAfter: 900 });
    await menu.waitFor({ state: 'visible', timeout: 10000 });
  }

  const entry = page.locator('.tree-view__title').filter({ hasText: /^AI\/LLM Settings$/ }).first();
  await entry.waitFor({ state: 'visible', timeout: 30000 });
  // Getting here crosses the sample list and the profile overlay's own first
  // pane; neither is what these animations are about. The take starts on the
  // AI/LLM entry, about to be clicked.
  drv.markStart();
  await drv.clickUntil(entry,
    page.getByText('AI / LLM Settings', { exact: true }).first(),
    { pauseAfter: 1200 });

  await page.getByText('AI / LLM Settings', { exact: true })
    .first().waitFor({ state: 'visible', timeout: 30000 });
  await sleep(900);
  drv.pass('user AI / LLM Settings panel is open');
}

// The sidebar renders before React has finished wiring the topbar handlers.
// Click the user menu in that window and Bootstrap opens the dropdown while
// the ELN's own onClick is not attached yet: the item highlights, the menu
// closes on the press, and nothing happens. Wait for the element table, which
// only appears once the app has actually booted.
async function waitForAppReady(page) {
  await page.waitForSelector('.sidebar', { timeout: 60000 });
  await page.waitForSelector('.elements-table-header, .list-center-box, #tabList',
    { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(1800);
}

// One-off announcement banners sit over the app and swallow the first click
// of a flow. Dismiss them before recording anything meaningful.
async function dismissBanners(page) {
  // Seeded messages raise toasts that sit over the app and intercept pointer
  // events - "<strong>…</strong> from <div data-rht-toaster> subtree intercepts
  // pointer events" is how Playwright reports it, several steps into a flow.
  // They are unrelated to the feature being documented, so clear them.
  await page.evaluate(() => {
    document.querySelectorAll('[data-rht-toaster]').forEach((t) => {
      t.querySelectorAll(':scope > div').forEach((n) => n.remove());
    });
  }).catch(() => {});
  for (const label of ['Got it', 'Dismiss', 'Close']) {
    const b = page.getByRole('button', { name: label, exact: true }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await sleep(500);
    }
  }
}

// Assert an alert really says what the flow claims, so a recording can never
// show a red alert while its caption promises a green one.
async function expectAlert(drv, text, variant = 'success') {
  const page = drv.page;
  const alert = page.locator(`.alert-${variant}`).filter({ hasText: text }).first();
  await alert.waitFor({ state: 'visible', timeout: 30000 });
  drv.pass(`${variant} alert reads "${text}"`);
  return alert;
}

// Run Ruby in the app container. Fixture setup and teardown go through this,
// never through page.request: a non-GET issued from the browser context
// without a CSRF token makes Rails reset the session, and the flow then walks
// into a logged-out app several steps later, where the failure looks like a
// missing selector rather than a lost login.
function rails(code) {
  // The script goes in on stdin ("rails runner -"), not as an argv string:
  // multi-line Ruby inside a shell argument breaks on the first newline.
  const out = execFileSync('docker', [
    'exec', '-i', APP_CONTAINER, 'bash', '-lc',
    'cd /home/ubuntu/app && bundle exec rails runner -',
  ], { input: code, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  // Rails dev boot chatter precedes anything we print; our own output is
  // marked so it can be picked out.
  const lines = out.split('\n').filter((l) => l.startsWith('::'));
  return lines.map((l) => l.slice(2)).join('\n');
}

// ---------------------------------------------------------------- stills
// A PNG gets the same provenance sidecar as a video: a still with no evidence
// behind it is exactly the failure mode that produced commit 0968878b.
async function shot(drv, name, opts = {}) {
  const { locator = null, locators = null, padding = 12, fullPage = false,
          extra = {} } = opts;

  // A popover or dropdown renders in a portal, outside the container it
  // belongs to, so cropping to that container clips it. Pass several locators
  // and the shot covers the union of their boxes.
  if (locators && locators.length) {
    const boxes = [];
    for (const l of locators) {
      await l.scrollIntoViewIfNeeded().catch(() => {});
      const b = await l.boundingBox();
      assert(b, 'each crop target has a bounding box');
      boxes.push(b);
    }
    const vp = drv.page.viewportSize();
    const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - padding);
    const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - padding);
    const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + padding);
    const y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + padding);
    fs.mkdirSync(OUT, { recursive: true });
    const dest2 = path.join(OUT, name + '.png');
    await drv.page.screenshot({ path: dest2, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
    const buf2 = fs.readFileSync(dest2);
    fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({
      flow: name, kind: 'png', git_sha: gitSha(),
      recorded_at: new Date().toISOString(), bytes: buf2.length,
      sha256: crypto.createHash('sha256').update(buf2).digest('hex'),
      assertions_passed: drv.asserts.slice(), ...extra,
    }, null, 2));
    console.log(`  -> ${dest2} (${buf2.length} bytes, union of ${locators.length} boxes)`);
    return dest2;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, name + '.png');
  if (locator) {
    await locator.scrollIntoViewIfNeeded();
    await sleep(400);
    const b = await locator.boundingBox();
    assert(b, `crop target for ${name} has a bounding box`);
    const vp = drv.page.viewportSize();
    await drv.page.screenshot({
      path: dest,
      clip: {
        x: Math.max(0, b.x - padding),
        y: Math.max(0, b.y - padding),
        width: Math.min(vp.width - Math.max(0, b.x - padding), b.width + padding * 2),
        height: Math.min(vp.height - Math.max(0, b.y - padding), b.height + padding * 2),
      },
    });
  } else {
    await drv.page.screenshot({ path: dest, fullPage });
  }
  const buf = fs.readFileSync(dest);
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({
    flow: name,
    kind: 'png',
    git_sha: gitSha(),
    recorded_at: new Date().toISOString(),
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    assertions_passed: drv.asserts.slice(),
    ...extra,
  }, null, 2));
  console.log(`  -> ${dest} (${buf.length} bytes)`);
  return dest;
}

// ---------------------------------------------------------------- xlsx
function xlsxSheets(buf) {
  const tmp = fs.mkdtempSync('/tmp/xlsx-');
  const f = path.join(tmp, 'x.xlsx');
  fs.writeFileSync(f, buf);
  const py = `
import sys, json, zipfile, xml.etree.ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z=zipfile.ZipFile(sys.argv[1]); shared=[]
if 'xl/sharedStrings.xml' in z.namelist():
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
        shared.append(''.join(t.text or '' for t in si.iter(NS+'t')))
names=[sh.get('name') for sh in ET.fromstring(z.read('xl/workbook.xml')).iter(NS+'sheet')]
out={}
for i,name in enumerate(names,1):
    p='xl/worksheets/sheet%d.xml'%i
    if p not in z.namelist(): continue
    rows=[]
    for row in ET.fromstring(z.read(p)).iter(NS+'row'):
        cells=[]
        for c in row.iter(NS+'c'):
            t=c.get('t'); v=c.find(NS+'v')
            if t=='s': cells.append(shared[int(v.text)] if v is not None else '')
            elif t in ('inlineStr','str'):
                cells.append(''.join(x.text or '' for x in c.iter(NS+'t')) or (v.text if v is not None else ''))
            else: cells.append(v.text if v is not None and v.text else '')
        rows.append(cells)
    out[name]=rows
print(json.dumps(out))
`;
  const pf = path.join(tmp, 's.py');
  fs.writeFileSync(pf, py);
  const res = execFileSync('python3', [pf, f], { maxBuffer: 64 * 1024 * 1024 }).toString();
  fs.rmSync(tmp, { recursive: true, force: true });
  return JSON.parse(res);
}

async function saveDownload(download, dest) {
  await download.saveAs(dest);
  return fs.readFileSync(dest);
}

// ---------------------------------------------------------------- video post
const FFMPEG = (() => {
  const base = path.join(process.env.HOME, '.cache/ms-playwright');
  const d = fs.readdirSync(base).find((x) => x.startsWith('ffmpeg-'));
  return path.join(base, d, 'ffmpeg-linux');
})();

function ffprobeDuration(file) {
  // No ffprobe in the playwright bundle; ffmpeg reports duration on stderr.
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) {
    const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(e.stderr.toString());
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  }
  return null;
}

// Measured trimming, then an ANIMATED WEBP.
//
// Why not a webm, as the original harness did: the ffmpeg that ships with
// playwright is a minimal build. Its only filters are crop/format/pad/scale/
// trim/transpose/flips - no fps, no select, no setpts - and its only decoder
// is VP8. It cannot read PNGs back, so an image sequence cannot be re-encoded
// and arbitrary frame selection is impossible inside ffmpeg.
//
// So ffmpeg is used only for what it can do (decode the take to PNG frames at
// a fixed rate, scaled), and Pillow does the selection and the encoding.
// Animated WebP is the right target anyway: it animates inline in an <img>
// like a GIF, needs no <video> element, and is roughly an order of magnitude
// smaller than the equivalent GIF - which matters when static/img is already
// 335 MB of them.
function trimAndEncode(srcWebm, destWebp, startOffsetMs = 0, holds = []) {
  const tmp = fs.mkdtempSync('/tmp/vtrim-');
  // image2 is a muxer here; image2pipe is demux-only in this build.
  // Sample and play back at the SAME rate, so a pause that survives the trim
  // lasts on screen exactly as long as the frame budget says it does.
  execFileSync(FFMPEG, ['-y', '-i', srcWebm, '-r', '12', '-vf', 'scale=1180:-2',
    path.join(tmp, 'f%05d.png')], { stdio: 'ignore' });

  const py = `
import sys, os, io, struct, json
from PIL import Image

d, dest = sys.argv[1], sys.argv[2]
start_ms = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
holds_ms = json.loads(sys.argv[4]) if len(sys.argv) > 4 else []
names = sorted(f for f in os.listdir(d) if f.endswith('.png'))
frames = [Image.open(os.path.join(d, n)).convert('RGB') for n in names]
# Drop everything before the marked start, keeping half a second of lead so the
# first pointer move is not clipped off.
head = max(0, int(start_ms / 1000.0 * 12) - 6)
dropped_head = min(head, max(0, len(frames) - 1))
frames = frames[dropped_head:]
if not frames:
    print(json.dumps({'error': 'no frames decoded'})); sys.exit(1)

# Mean absolute difference between consecutive frames, on a coarse subsample.
small = [f.resize((160, max(1, int(160 * f.height / f.width)))) for f in frames]
px = [list(s.tobytes()) for s in small]
diffs = [0.0]
for k in range(1, len(px)):
    a, b = px[k-1], px[k]
    n = min(len(a), len(b))
    step = 7
    idx = range(0, n, step)
    diffs.append(sum(abs(a[j]-b[j]) for j in idx) / max(1, len(idx)))

FPS = 12
THRESH = 1.2
# Every still stretch collapses to the same beat - long enough to register the
# step that just happened, short enough that the recording never feels idle.
# Previously only stretches over 1.7 s were touched, and everything shorter
# played in full, which is what made the takes feel slack.
# 14 frames at 12 fps is 1.17 s. The budget is the CAP on a still stretch, so
# it has to sit above the second the pacing asks for, or the trim would quietly
# shorten every deliberate pause back below it.
STILL_BUDGET = 14
TAIL_HOLD    = 26          # frames -> ~2.2 s to read the final state

last = len(diffs) - 1
while last > 0 and diffs[last] < THRESH:
    last -= 1
last = min(len(diffs) - 1, last + TAIL_HOLD)

# Frame windows the flow asked to be preserved verbatim, shifted by the head
# that was already dropped.
protected = set()
for a, b in holds_ms:
    lo = max(0, int(a / 1000.0 * FPS) - dropped_head)
    hi = max(0, int(b / 1000.0 * FPS) - dropped_head)
    protected.update(range(lo, hi + 1))

keep, run = [], 0
for k in range(last + 1):
    if diffs[k] < THRESH and k not in protected:
        run += 1
        if run > STILL_BUDGET:
            continue          # dead frame: drop it outright
    else:
        run = 0
    keep.append(k)

out = [frames[k] for k in keep]
out[0].save(dest, format='WEBP', save_all=True, append_images=out[1:],
            duration=int(round(1000.0/FPS)), loop=0, quality=62, method=5)
print(json.dumps({'sourceFrames': len(frames) + dropped_head, 'keptFrames': len(out),
                  'seconds': round(len(out)/float(FPS), 1),
                  'headFramesDropped': dropped_head,
                  'protectedFrames': len(protected)}))
`;
  const pf = path.join(tmp, 'enc.py');
  fs.writeFileSync(pf, py);
  const res = JSON.parse(execFileSync('python3', [pf, tmp, destWebp, String(startOffsetMs),
    JSON.stringify(holds)],
    { maxBuffer: 256 * 1024 * 1024 }).toString().trim().split('\n').pop());
  fs.rmSync(tmp, { recursive: true, force: true });
  return res;
}

function gitSha() {
  return execFileSync('git', ['-C', WT, 'rev-parse', 'HEAD']).toString().trim();
}

async function finish({ browser, context, page, videoDir, drv }, name, extra = {}) {
  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video.path();
  const dest = path.join(OUT, name + '.webp');
  fs.mkdirSync(OUT, { recursive: true });
  // No silent fallback to the raw take: a 60 s untrimmed recording shipped
  // under a caption promising a short one is exactly the kind of quiet
  // substitution this harness exists to prevent.
  const stats = trimAndEncode(raw, dest, drv.startOffsetMs, drv.holds);
  const buf = fs.readFileSync(dest);
  const meta = {
    flow: name,
    script: require.main ? path.relative(ROOT, require.main.filename) : null,
    work_dir: path.basename(videoDir),
    git_sha: gitSha(),
    recorded_at: new Date().toISOString(),
    duration_seconds: stats.seconds,
    raw_duration_seconds: ffprobeDuration(raw),
    frames: `${stats.keptFrames} kept of ${stats.sourceFrames}`,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    assertions_passed: drv.asserts,
    ...extra,
  };
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(meta, null, 2));
  console.log(`  -> ${dest} (${meta.duration_seconds}s from ${meta.raw_duration_seconds}s, `
    + `${stats.keptFrames}/${stats.sourceFrames} frames, ${Math.round(buf.length / 1024)} KB)`);
  return meta;
}

module.exports = {
  BASE, USERS, OUT, WORK, WT, APP_CONTAINER, sleep, assert, Fail, Driver, startSession, login,
  openAdminLlmConfig, openUserLlmSettings, dismissBanners, waitForAppReady,
  clearPendingNotices,
  expectAlert, shot, rails, warmup,
  xlsxSheets, saveDownload, trimAndEncode, finish, gitSha,
};
