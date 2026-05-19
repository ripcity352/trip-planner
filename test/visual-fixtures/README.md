# Visual regression fixtures

This directory holds standalone HTML fixtures used by Playwright's pixel-diff
snapshot tests. Each fixture renders a single _signature pattern_ from the
design system in isolation (no app chrome, no routing, no network), so a
regression in any one pattern surfaces as a focused diff on a single
baseline image.

## Status: scaffold only

The pipeline is wired end-to-end, but the only real fixture today is
`_placeholder.html` — a 320×480 dark surface that proves screenshot capture,
baseline storage, and the CI workflow all work. The signature patterns
called out in issue #85 will ship as real fixtures when those components
are built:

- `pulse-poll.html` (default + voted state)
- `blur-gradient.html` (frosted slot in 3 sizes)
- `hype-stack.html` (final-frame snapshot — not the animated sequence)
- `for-your-eyes-only.html` (celebrant drawer)
- `hairline-card.html` (brutalist card variant)

Until those components land, the placeholder is what guards CI.

## How baselines work

- Baselines live under `__baselines__/<project>/<fixture>.png`, where
  `<project>` is one of `chromium`, `webkit`, or `Mobile-Chrome-Pixel-7-`
  (Playwright sanitizes the configured `"Mobile Chrome (Pixel 7)"`
  project name into a filesystem-safe form).
- Playwright config: `playwright.visual.config.ts`. Tolerance:
  `maxDiffPixelRatio: 0.02` (2% pixel difference per fixture).
- Tests match `**/*.visual.spec.ts` in this directory.

## Regenerating baselines

Only do this when **intentionally** redesigning a signature pattern, and
only with a maintainer reviewing the diff in the PR. Otherwise you are
ratifying the bug.

```sh
pnpm exec playwright install --with-deps chromium webkit
pnpm test:visual --update-snapshots
```

Commit the changed PNGs under `test/visual-fixtures/__baselines__/`. The
PR description must explain _what visual change you're ratifying_ and link
the design-system note that motivated it.

## Running the tests locally

```sh
pnpm test:visual
```

If a snapshot differs, Playwright writes the actual + diff PNGs into
`test/visual-fixtures/test-results/`. CI uploads that folder as an
artifact on failure.

## WebKit note

The WebKit download (~80 MB) can be slow or flaky on shared dev
machines. If you couldn't install it locally and pushed without a
`webkit/` baseline, CI's first run will **fail** on the missing
snapshot, then write the actual screenshot into
`visual-test-results` (uploaded as an artifact). Pull that artifact,
drop the PNG into `__baselines__/webkit/`, and push — that commit is
the maintainer-reviewed WebKit baseline.

Baselines for `chromium`, `webkit`, and `Mobile-Chrome-Pixel-7-` were
all generated locally in the initial scaffold commit, so this fallback
path is only relevant if a future contributor regenerates baselines on
a machine without WebKit.
