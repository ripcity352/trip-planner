# Visual regression fixtures

This directory holds standalone HTML fixtures used by Playwright's pixel-diff
snapshot tests. Each fixture renders a single _signature pattern_ from the
design system in isolation (no app chrome, no routing, no network), so a
regression in any one pattern surfaces as a focused diff on a single
baseline image.

## Status: two fixtures today

Two fixtures currently guard CI:

- `_placeholder.html` — a 320×480 dark surface that proves screenshot
  capture, baseline storage, and the CI workflow all work. Solid-color
  dominant, so it renders deterministically across OSes.
- `home.visual.spec.ts` → `notes/mockups/home.html` — the home-tab anatomy
  design artifact (#212). The first *real design* fixture.

The signature patterns called out in issue #85 will ship as real fixtures
when those components are built:

- `pulse-poll.html` (default + voted state)
- `blur-gradient.html` (frosted slot in 3 sizes)
- `hype-stack.html` (final-frame snapshot — not the animated sequence)
- `for-your-eyes-only.html` (celebrant drawer)
- `hairline-card.html` (brutalist card variant)

> **Cross-OS webfont caveat (#217).** `home.html` pulls Fraunces / Switzer /
> JetBrains Mono over CDN. The committed baseline was generated on macOS;
> CI runs on `ubuntu-latest`. It passes today within the 2% tolerance, but
> CDN webfonts are not a fully deterministic pixel-diff target across OS /
> runner. **Follow-up: self-host the fonts before this fixture gates
> required CI**, or regenerate its baseline on the CI runner. Until then,
> the deterministic `_placeholder` fixture is the reliable guard.

## How baselines work

- Baselines live under `__baselines__/<project>/<fixture>.png`, where
  `<project>` is `Mobile-Chrome` (Playwright sanitizes the configured
  `"Mobile Chrome"` project name into a filesystem-safe form).
- **Single browser (#217):** the config runs ONE project — Mobile Chrome
  at an explicit `375×812` viewport (the M3–M5 standard). The `chromium`
  (Desktop Chrome) and `webkit` (Desktop Safari) projects were dropped to
  keep baseline maintenance proportionate to a 2-dev project; re-add them
  post-M6 if a desktop surface needs guarding.
- Playwright config: `playwright.visual.config.ts`. Tolerance:
  `maxDiffPixelRatio: 0.02` (2% pixel difference per fixture).
- Tests match `**/*.visual.spec.ts` in this directory.

## Regenerating baselines

Only do this when **intentionally** redesigning a signature pattern, and
only with a maintainer reviewing the diff in the PR. Otherwise you are
ratifying the bug.

```sh
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test -c playwright.visual.config.ts --update-snapshots
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

## Cross-OS baseline note

Baselines are committed from the machine that runs `--update-snapshots`.
The deterministic `_placeholder` fixture renders the same across OSes; the
`home.html` webfont fixture can drift (see the caveat above). If CI's
`playwright pixel-diff` fails on a baseline you didn't intend to change,
Playwright writes the actual + diff PNGs into `test/visual-fixtures/
test-results/` and CI uploads that folder as an artifact — pull it to see
exactly what moved before deciding whether to re-baseline.
