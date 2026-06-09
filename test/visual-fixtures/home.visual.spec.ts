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
// Font loading: home.html self-hosts all three faces via @font-face
// (Fraunces + JetBrains Mono latin subsets in notes/mockups/fonts/, Switzer
// from the app's own public/fonts/switzer/ file), so the render needs no
// network and is deterministic across OS/runner — the #217 CDN-webfont
// caveat no longer applies.
test("home mockup matches baseline", async ({ page }) => {
  const fixturePath = path.resolve(
    __dirname,
    "../../notes/mockups/home.html",
  );
  await page.goto(`file://${fixturePath}`);
  // Block until every declared @font-face is loaded so the snapshot never
  // captures a fallback-font frame (font-display: block in the fixture
  // covers the paint side; this covers the timing side).
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("home.png");
});
