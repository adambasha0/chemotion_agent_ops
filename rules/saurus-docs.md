# Writing in chemotion_saurus

What an agent must know before editing the documentation site. Checked against
`docusaurus.config.js` on 9 Oct 2026 — re-read it rather than trusting this
table, because the version map moves.

## Pick the right tree first

The ELN docs are versioned three ways, and **`lastVersion` decides which tree
production serves at `/docs/...`**. Today:

| Tree | Served at | Label |
|---|---|---|
| `versioned_docs/version-v3/` | `/docs/…` — **what visitors see** | ELN v3.x |
| `docs/` | `/docs/next/…` | ELN v4.x, unreleased |
| `versioned_docs/version-v2/` | `/docs/v2/…` | ELN v2.x |

So an edit in `docs/` alone changes a page almost nobody visits. This has
already caused one wasted round: an image fix landed in `docs/` while
production kept serving the broken one from `version-v3`.

Decide by where the feature is:

- **Shipped in the version `lastVersion` names** → edit that versioned tree,
  and `docs/` too if the page exists there.
- **Merged but unreleased** → edit `docs/`, and add a caution naming the
  release it is waiting for:
  `:::caution[Not in a released version yet]`
- **Changed in a way that invalidates an older tree's screenshots** → leave the
  older tree alone unless the page is actively wrong. A v2 page describing v2
  behaviour is correct.

Moving `lastVersion` changes what the relative links in each tree's root
`index.mdx` resolve to, and the build does not catch that class of error.

## Conventions that have bitten

- **Size an inline icon, do not ship a big PNG.** An icon referenced inline
  needs an explicit height or it renders at full width in production:
  `style={{ height: "1.9em", width: "auto", verticalAlign: "middle" }}`
- **Animated WebP, never new GIFs.** `static/img` already carries hundreds of
  megabytes of GIFs. WebP animates in an `<img>` identically at about a tenth
  the size. PNG for stills.
- **Assets keep their filenames.** Replacing `foo.png` in place keeps every
  reference, in every tree, working. A new name means finding them all.
- **`onBrokenLinks` and `onBrokenAnchors` are `throw`**, and so are broken
  markdown links and images. A bad relative path fails the build.
- **The build is heavy.** It has been OOM-killed on a developer machine.
  Validate MDX by compiling the changed files with `@mdx-js/mdx` and let CI
  run the full build on the PR.

## Voice

Write for someone trying to do the thing, not for someone auditing the
software. Say what the control does and what happens next. Split
administrator-level setup from what an ordinary user sees — they are different
readers with different permissions. Detailed enough to follow, not a tour of
every field.
