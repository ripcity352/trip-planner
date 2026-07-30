import { chromium } from "@playwright/test";
const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-founder.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-a/announcements");
const cta = page.getByRole("button", { name: /post an update/i });
if (await cta.isVisible({ timeout: 10000 }).catch(() => false)) await cta.click();
await page.waitForSelector("textarea", { timeout: 15000 });
const body = "[verify] Saturday schedule:\n- 10am golf\n- 1pm lunch\n- 7pm steakhouse\nDon't be late.";
await page.fill("textarea", body);
await page.getByRole("button", { name: /send it/i }).click();
await page.waitForSelector("text=[verify] Saturday schedule", { timeout: 15000 });
await page.reload();
const el = page.locator("article p", { hasText: "[verify] Saturday schedule" }).first();
await el.waitFor({ timeout: 15000 });
const info = await el.evaluate((n) => {
  const cs = getComputedStyle(n);
  return { whiteSpace: cs.whiteSpace, textRaw: JSON.stringify(n.textContent), innerText: JSON.stringify(n.innerText), height: n.getBoundingClientRect().height, lineHeight: cs.lineHeight };
});
console.log(JSON.stringify(info, null, 2));
await el.scrollIntoViewIfNeeded();
await page.screenshot({ path: SHOTS + "/verify-posts-multiline.png" });
await browser.close();
