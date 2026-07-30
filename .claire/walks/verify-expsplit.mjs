import { chromium } from "@playwright/test";
import fs from "node:fs";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-founder.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-a/expenses");
await page.getByRole("button", { name: /log a spend/i }).click();
await page.getByLabel(/what was it/i).fill("[verify-expsplit] zero split test").catch(() => {});
// fallback: fill first two text inputs
const desc = page.locator("form input").first();
await desc.fill("[verify-expsplit] zero split test");
await page.locator('input[inputmode="decimal"], input[name="amountDollars"]').first().fill("42.00");

// tap off every pressed chip
const chips = page.locator('button[aria-pressed="true"]');
let n = await chips.count();
console.log("pre-selected chips:", n);
while (n > 0) {
  await chips.first().click();
  await page.waitForTimeout(150);
  n = await chips.count();
}
await page.screenshot({ path: `${SHOTS}/verify-expsplit-1-chips-off.png`, fullPage: true });
await page.getByRole("button", { name: /add it|log it|save/i }).last().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/verify-expsplit-2-after-submit.png`, fullPage: true });
const body = await page.locator("body").innerText();
console.log("has generic copy:", body.includes("Something in there isn't quite right"));
console.log("mentions split/person near error:", /at least one|split it with|pick.*person/i.test(body));
await browser.close();
