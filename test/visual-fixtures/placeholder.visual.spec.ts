import path from "node:path";
import { expect, test } from "@playwright/test";

// Single-fixture smoke test that proves the visual-regression pipeline runs
// end-to-end: load a standalone HTML file, capture a screenshot, and diff it
// against a committed baseline. The real signature-pattern fixtures
// (pulse-poll, blur-gradient, hype-stack, for-your-eyes-only, hairline-card)
// will be added when those components ship. Until then, this placeholder is
// what keeps the pipeline honest.
test("placeholder fixture matches baseline", async ({ page }) => {
  const fixturePath = path.resolve(__dirname, "_placeholder.html");
  await page.goto(`file://${fixturePath}`);
  await expect(page).toHaveScreenshot("placeholder.png");
});
