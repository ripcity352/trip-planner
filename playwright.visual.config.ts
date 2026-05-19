import { defineConfig, devices } from "@playwright/test";

// Visual-regression Playwright config.
//
// Kept separate from `playwright.config.ts` (which runs the e2e suite against
// a live dev server) so that:
//   - visual tests don't need a webServer — fixtures are static HTML loaded
//     via file:// URLs
//   - the visual job in CI runs independently of the e2e job and surfaces
//     pixel diffs as its own first-class signal
//   - tolerances and snapshot paths are tuned for pixel-diff, not flow tests
//
// See `test/visual-fixtures/README.md` for how to regenerate baselines.
export default defineConfig({
  testDir: "./test/visual-fixtures",
  testMatch: "**/*.visual.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    // 2% per-fixture tolerance, matching the acceptance criteria in #85.
    // Anti-aliasing across renderer versions can move a handful of subpixels
    // even when the design is identical; tighter than 2% turns into a flake
    // farm. If you need stricter, scope it to a single `toHaveScreenshot`
    // call with a per-call option override.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    headless: true,
  },
  // Baselines land at:
  //   test/visual-fixtures/__baselines__/<project>/<arg>.png
  // The `<arg>` is the first argument to `toHaveScreenshot("...")`.
  snapshotPathTemplate: "{testDir}/__baselines__/{projectName}/{arg}{ext}",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome (Pixel 7)",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
