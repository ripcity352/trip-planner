import path from "node:path";
import { expect, test } from "@playwright/test";

// Visual baseline for the M4 design-system home-tab anatomy mockup.
//
// Source: `notes/mockups/home.html` — a static design artifact (issue #212)
// that captures the three-block home anatomy (hero → Up Next → Who's-In)
// with the real bachelor-theme token set (surface-base, ink-primary, accent-heat)
// and the full type stack (Fraunces display, Switzer body, JetBrains Mono).
//
// NOTE: This is a mockup-level fixture, not a component fixture. The signature
// React components (pulse-poll, blur-gradient, hype-stack, for-your-eyes-only,
// hairline-card) are not yet built; those fixtures will be added when the
// components ship. The home mockup + placeholder are what keep the pipeline
// honest today.
//
// Font loading: home.html pulls Fraunces + JetBrains Mono from Google Fonts
// and Switzer from Fontshare via CDN. If network is unavailable (offline CI),
// system-ui fallbacks render instead — the layout snapshot will still match
// within tolerance because the fallback is set on body and the diff is
// structural, not typographic. If you see font-related drift in CI, add a
// `--ignore-https-errors` flag or host the fonts locally.
test("home mockup matches baseline", async ({ page }) => {
  const fixturePath = path.resolve(
    __dirname,
    "../../notes/mockups/home.html",
  );
  await page.goto(`file://${fixturePath}`);
  // Wait for fonts to load so the baseline captures the design-system
  // typography rather than a system-font fallback.
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("home.png");
});
