// S1 - the rebuilt SDS extraction control and its mode picker.
//
// The old UI (an AI / Vendor site toggle plus a sparkle "Extract Safety Data"
// button) was replaced on the branch by a single "Extract from sheet" button
// that opens a popover asking how the sheet should be read. This captures the
// new control with that popover open, which is the screen the documentation
// has to describe.
//
// The popover only renders when an AI provider resolves for the user
// (GET /api/v1/llm/available), and the "View last AI extraction" link only
// renders when the chemical already carries an aiExtraction result - so the
// fixture arranges both rather than hoping the seeded data has them.
const {
  startSession, login, shot, sleep, assert, rails, warmup, BASE,
} = require('../../lib/lib');

const USER_ID = 2; // CU1

(async () => {
  const fixture = rails(`
    user = User.find(${USER_ID})

    # The institution gate must be open or the control never offers AI at all.
    g = Matrice.find_by(name: 'aiGlobalProvider')
    g&.update!(enabled: true, exclude_ids: (g.exclude_ids || []) - [user.id])
    User.gen_matrix

    # A reachable institution provider, so llm/available is true.
    p = LlmProvider.find_or_initialize_by(scope: 'global', name: 'Local Ollama')
    p.api_protocol = 'openai'
    p.base_url = 'http://ai4chemotion-ollama-1:11434'
    p.default_model = 'qwen2.5:0.5b'
    p.enabled = true
    p.save!

    # A sample of this user whose chemical has a genuinely saved sheet, i.e. a
    # /safety_sheets/<vendor>/<file>.pdf path - the gate the button checks.
    pattern = '/safety_sheets/[A-Za-z0-9_-]+/[A-Za-z0-9._-]+\\\\.pdf'
    chem = Chemical.joins(sample: :collections)
                   .where(collections: { user_id: user.id })
                   .where("chemicals.chemical_data::text ~ ?", pattern)
                   .order('chemicals.sample_id desc').first
    raise 'no sample of this user has a saved safety data sheet' unless chem

    sample = Sample.find(chem.sample_id)
    col = sample.collections.where(user_id: user.id).first

    # Give the row a previous AI result so the "View last AI extraction" link
    # is present. cd32530f7 renamed this key from ai4chemotion to aiExtraction.
    data = chem.chemical_data
    entry = data[0] ||= {}
    entry['aiExtraction'] = {
      'extracted_at' => Time.current.iso8601,
      'model'        => 'llama3.1:8b',
      'chemical'     => sample.molecule&.iupac_name.to_s,
      'cas'          => sample.xref&.dig('cas').to_s,
    }
    entry['extractedProperties'] = {
      'boiling_point' => '138 °C', 'melting_point' => '13 °C',
      'density' => '0.861 g/cm3', 'form' => 'liquid', 'color' => 'colourless',
    }
    chem.chemical_data = data
    chem.save!

    puts "::" + [col.id, sample.id, sample.short_label].join('|')
  `).trim().split('|');
  const [collectionId, sampleId, label] = fixture;
  assert(sampleId, `fixture found a sample with a saved sheet (${label})`);

  await warmup();
  // 1440px left the saved-sheet row too narrow: the row number and the
  // Extract button wrapped onto separate lines, so the screenshot showed a
  // broken layout rather than the control. Wider viewport, and the collections
  // sidebar collapsed, to give the detail pane room.
  const s = await startSession('s1_sds_extract_control', 'user',
    { viewport: { width: 1920, height: 1080 } });
  const { page, drv } = s;
  try {
    await login(page, 'user');

    const avail = await (await page.request.get(`${BASE}/api/v1/llm/available`)).json();
    assert(avail.available === true,
      'an AI provider resolves for this user, so the mode picker is offered');
    drv.pass('server: GET /api/v1/llm/available reports available');

    await page.goto(`${BASE}/mydb/collection/${collectionId}/sample/${sampleId}`,
      { waitUntil: 'domcontentloaded' });
    await sleep(6000);

    // clickPlain, not click: a glide across the sample detail leaves the press
    // inert in this app.
    // Collapse the collections sidebar if the app offers the control; it buys
    // the detail pane a few hundred pixels.
    for (const sel of ['.collapse-panel-button', '[title*="collapse" i]',
                       'button[aria-label*="collapse" i]']) {
      const c = page.locator(sel).first();
      if (await c.count() && await c.isVisible().catch(() => false)) {
        await c.click().catch(() => {});
        await sleep(900);
        drv.pass(`collapsed a side pane via ${sel}`);
        break;
      }
    }

    const inventoryTab = page.locator('[role="tab"]').filter({ hasText: /^Inventory$/ }).first();
    await inventoryTab.waitFor({ state: 'visible', timeout: 30000 });
    await drv.clickPlain(inventoryTab, { pauseAfter: 2500 });
    drv.pass('the sample detail shows an Inventory tab');

    const safety = page.locator('.accordion-button').filter({ hasText: /^Safety$/ }).first();
    await safety.waitFor({ state: 'visible', timeout: 30000 });
    if ((await safety.getAttribute('aria-expanded')) === 'false') {
      await drv.clickPlain(safety, { pauseAfter: 1500 });
    }

    const sheets = page.locator('[data-component="SafetySheets"]').first();
    await sheets.waitFor({ state: 'visible', timeout: 30000 });
    assert((await sheets.getAttribute('data-empty')) !== 'true',
      'the Safety section lists at least one sheet');
    drv.pass(`the Safety section lists ${await sheets.getAttribute('data-count')} sheet(s)`);

    // The saved-sheets heading carries an "N of 5" counter on this branch.
    const savedHeading = page.getByText('Safety Sheets saved in the database', { exact: false }).first();
    await savedHeading.waitFor({ state: 'visible', timeout: 15000 });
    drv.pass(`saved-sheets heading reads "${(await savedHeading.innerText()).trim()}"`);

    const trigger = page.locator('#extract-sds').first();
    await trigger.waitFor({ state: 'visible', timeout: 20000 });
    const label0 = (await trigger.innerText()).trim();
    assert(label0 === 'Extract from sheet',
      `the trigger is labelled "Extract from sheet" (got "${label0}")`);
    assert(await trigger.isEnabled(), 'the trigger is enabled for a saved sheet');
    drv.pass('the row offers one button, "Extract from sheet"');

    // Opening the picker is the subject of the shot.
    await drv.clickPlain(trigger, { pauseAfter: 1600 });

    const picker = page.locator('.sds-mode-picker').first();
    await picker.waitFor({ state: 'visible', timeout: 15000 });
    const pickerText = (await picker.innerText()).replace(/\s+/g, ' ');
    for (const t of [
      'How should this sheet be read?',
      'Built-in reader',
      'Default',
      'Parses the sheet on the server in seconds',
      'AI extraction',
      'Your AI provider reads the sheet; takes up to a minute, review the result',
      'View last AI extraction',
    ]) {
      assert(pickerText.includes(t), `the picker shows "${t}" (got "${pickerText}")`);
      drv.pass(`picker shows: "${t}"`);
    }

    assert(await page.locator('#extract-sds-builtin').first().isVisible(),
      'the built-in reader option is present');
    assert(await page.locator('#extract-sds-ai').first().isVisible(),
      'the AI extraction option is present');

    // Neither the removed toggle nor the removed button may appear anywhere.
    const body = await page.locator('body').innerText();
    for (const gone of ['Vendor site', 'Extract Safety Data']) {
      assert(!body.includes(gone), `"${gone}" is gone from the UI`);
      drv.pass(`the removed control "${gone}" is absent`);
    }

    // The row must not wrap. If the sheet title and the Extract button end up
    // on different lines the layout is broken, and a screenshot of it would
    // document a rendering fault as if it were the UI.
    const titleLink = page.locator('a').filter({ hasText: /^Safety Data Sheet from/ }).first();
    const tb = await titleLink.boundingBox();
    const bb = await trigger.boundingBox();
    assert(tb && bb, 'the sheet title and the Extract button both have boxes');
    const titleMid = tb.y + tb.height / 2;
    const btnMid = bb.y + bb.height / 2;
    assert(Math.abs(titleMid - btnMid) < 28,
      `the sheet row is on one line (title mid ${Math.round(titleMid)} vs button mid ${Math.round(btnMid)})`);
    drv.pass('the saved-sheet row renders on a single line, nothing wrapped');

    // Bring the whole block into frame before measuring. Opening the picker
    // pushes the page down, so the sheets container's top can sit above the
    // viewport; the union crop then clamps at 0 and the shot starts mid-row.
    await sheets.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -90));
    await sleep(900);
    const sb = await sheets.boundingBox();
    const pb = await picker.boundingBox();
    assert(sb && pb, 'both crop targets are measurable after scrolling');
    assert(sb.y >= 0, `the sheets box starts inside the viewport (y=${Math.round(sb.y)})`);
    assert(pb.y + pb.height <= 1080,
      `the picker ends inside the viewport (bottom=${Math.round(pb.y + pb.height)})`);
    drv.pass('the sheet row and the picker are both fully in frame');

    // Move the pointer off the button so the drawn cursor does not sit on the
    // label a reader is meant to read.
    await drv.glide(260, 520, 320);
    await sleep(600);

    await shot(drv, 'ai_sds_extraction_button', {
      // The picker is portalled below the row, so crop the union of the two.
      locators: [page.locator('[data-component="SafetySheets"]').first(), picker],
      padding: 16,
      extra: {
        replaces: 'static/img/ai_sds_extraction_button.png',
        doc: 'docs/eln/ui/ai-features.mdx',
        shows: 'the Extract from sheet button with the mode picker open',
        sample: `${label} (id ${sampleId})`,
      },
    });
    // The result dialog is deliberately NOT captured here.
    //
    // Its contents are a model's output. Producing a truthful screenshot needs
    // a real extraction, which needs the local Ollama container and a job
    // worker; neither is running and the machine has no memory for them. The
    // fixture above supplies only "a previous extraction exists", which is a
    // real state and is what makes the "View last AI extraction" link render -
    // it does not invent an extraction result to photograph. Asserting the
    // renamed title still costs nothing, so it is asserted without a shot.
    const link = page.getByRole('button', { name: 'View last AI extraction' }).first();
    await link.waitFor({ state: 'visible', timeout: 10000 });
    await drv.clickPlain(link, { pauseAfter: 1500 });
    const modal = page.locator('.modal.show').first();
    await modal.waitFor({ state: 'visible', timeout: 20000 });
    const title = (await modal.locator('.modal-title').first().innerText()).trim();
    assert(title === 'Extracted Data using AI',
      `the dialog is titled "Extracted Data using AI" (got "${title}")`);
    assert(!(await modal.innerText()).includes('using LLM'),
      'the old "Extracted Data using LLM" title is gone');
    drv.pass(`result dialog title is now "${title}", not "Extracted Data using LLM"`);

    console.log('S1 OK');
  } catch (e) {
    console.error('S1 FAILED: ' + e.message);
    await page.screenshot({ path: require('../../lib/lib').WORK + '/s1_failure.png', fullPage: true })
      .catch(() => {});
    process.exitCode = 1;
  } finally {
    await s.context.close().catch(() => {});
    await s.browser.close().catch(() => {});
  }
})();
