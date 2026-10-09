---
name: release-docs
description: Update the Chemotion documentation site for a new ELN release or version. Use when asked to document a release, refresh a version folder, bring the docs in step with a new ELN version, or decide which pages and screenshots a release invalidates. Covers turning a commit range into a work list, which version tree to edit, capturing new media, and retiring assets without breaking the other versions.
---

# Documenting an ELN release

An epic, not a task. A release is 30-40 merged pull requests, three
documentation trees and a few hundred images, and the failure mode is a pass
that reads as thorough and leaves half the screenshots describing software that
no longer exists.

So: inventory first, decide second, work one bullet at a time, and treat the
asset sweep as a separate pass with its own tool. Never hold the whole release
in your head.

## 1. Inventory the release before deciding anything

```bash
scripts/release_inventory.py --from v3.1.2 --to v3.1.3 \
  --eln /path/to/chemotion_ELN --docs /path/to/chemotion_saurus > WORKLIST.md
```

That gives you merged pull requests grouped by what they are, the user-facing
strings the range added and removed, and - the entry that matters most - every
documentation page that still names a string this release removed. Those pages
tell a reader to click something that is gone, so they are the first work, not
the last.

Two things about the grouping. Labels on this repository are applied unevenly,
so the script falls back to the conventional-commit prefix in the title, which
is applied consistently. And anything it cannot classify lands in
`unclassified` - read those, do not assume they are noise. On v3.1.2 → v3.1.3
that was 22 fixes and 2 enhancements out of 33 PRs.

Write the work list to a file and commit it. It is the thing that makes the
pass resumable, and a release pass always spans more than one sitting.

## 2. Decide, per bullet, and record the decision

For each entry, one of three outcomes, written next to it:

- **documents** - a page changes. Name the page and the tree.
- **no doc** - and why in half a line. "internal query shape", "test only",
  "fixes a crash with no visible behaviour".
- **needs looking at** - you cannot tell from the diff. These need an instance.

A bullet with no decision is the only unacceptable state. Half of a release is
usually "no doc", and saying so explicitly is what stops the next pass from
re-reading all of it.

## 3. Pick the tree. This is where passes go wrong

`lastVersion` in `docusaurus.config.js` decides which tree production serves at
`/docs/...`. Read it; do not assume.

At the time of writing it is `v3`, which means:

| Tree | Served at | Edit it when |
|---|---|---|
| `versioned_docs/version-v3/` | `/docs/…` — **what visitors see** | the change is in v3.x |
| `docs/` | `/docs/next/…` | the change is in the unreleased version |
| `versioned_docs/version-v2/` | `/docs/v2/…` | v2 is actually wrong, not merely old |

An older tree describing older behaviour is **correct**. Do not modernise it.
The only reason to touch v2 is a statement that was wrong when it shipped, or
an asset reference that breaks the build.

If the release is the one that cuts a new version, the snapshot comes first and
everything else follows from it:

```bash
npm run docusaurus -- docs:version <version-that-is-ENDING>
```

That freezes today's `docs/` into `versioned_docs/version-<id>`, adds it to
`versions.json`, and leaves `docs/` as the next version in progress. Then move
`lastVersion` and update both `versions` maps and the navbar dropdown. Moving
`lastVersion` changes what the relative links in each tree's root `index.mdx`
resolve to, and **the build does not catch that class of error** - check those
links by hand.

## 4. Work one bullet at a time, and capture only what you must

For each "documents" bullet: read the code, not the PR title. The PR says what
the author intended; the component says what the reader will see. Gates matter
most - who can see the feature at all is usually the first thing a reader needs.

If a screen changed, capture it rather than describing it from the diff:
`docs/RUNBOOK.md`, and the `ui-capture` skill for the discipline. An asset
without a provenance sidecar does not reach the site - `bin/publish.sh` refuses
it. If you could not capture something, say which screen and why, in the pull
request body. Never reuse an old image under new wording.

Replace an asset **in place**, keeping its filename, whenever the new one shows
the same thing. Every reference in every tree then keeps working. A new name
means finding them all, and you will miss one.

## 5. Sweep the assets as its own pass

```bash
scripts/audit_assets.py --docs /path/to/chemotion_saurus --tree v3
```

**`static/img` is one namespace shared by every version tree.** This is the
trap the pass exists to avoid: removing a reference from v3 does not make the
file deletable, because `docs/` and v2 very likely use it too. Measured on the
real site, v3 referenced 212 assets and **not one of them was exclusive to v3**.
So the default outcome of "deprecate this screenshot from the version folder"
is: remove the reference, keep the file.

The audit also reports:

- **referenced but not on disk** - `onBrokenMarkdownImages` is `throw`, so each
  one fails the build. The audit only counts pages that are actually built:
  Docusaurus excludes underscore-prefixed paths (`**/_*/**`) from every docs
  plugin, so a dangling image on one of those breaks nothing. Pass
  `--include-excluded` to see them anyway - they are untidy, not urgent. Three
  such references existed in the v2 tree, left behind when a cleanup deleted
  the images from the shared namespace but scoped `versioned_docs` out.
- **referenced by nothing** - left behind by an earlier edit. Check `git log`
  before deleting; an asset can be waiting for a branch that has not merged.

## 6. Make the media make sense, not merely exist

Go through the version folder's images once, as a reader:

- Does the screenshot show the version this tree documents, or a later one? A
  newer screenshot in an older tree is a quiet lie.
- Does an animation show a flow that still exists end to end, or one that now
  has an extra step?
- Is anything cropped so tightly that the control cannot be located on the real
  screen?
- Is an inline icon sized? An unsized icon renders at full width in production.
  `style={{ height: "1.9em", width: "auto", verticalAlign: "middle" }}`.
- Are there still GIFs where a WebP would be a tenth the size? Replace on
  touch, not as a project.

## 7. Finish the pass properly

- The work list has a decision on every bullet.
- `scripts/audit_assets.py` reports no missing files for the trees you touched.
- The changed MDX compiles (`@mdx-js/mdx`); let CI run the full build.
- One pull request per release pass, with the commit range in the body and the
  work list attached or linked. A reviewer must be able to check your prose
  against the diff rather than against your prose.
- Stop any instance you booted: `./bin/teardown.sh`.

## What not to do

- Do not rewrite a page you did not need to touch. A release pass that
  reformats half the site cannot be reviewed.
- Do not document an unreleased feature in the released tree. If it is merged
  but unshipped it belongs in `docs/`, with
  `:::caution[Not in a released version yet]`.
- Do not delete an asset because one tree stopped using it. Run the audit.
- Do not describe a screen you did not open.
