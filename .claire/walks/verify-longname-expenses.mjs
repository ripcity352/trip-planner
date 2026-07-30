import { chromium } from "@playwright/test";

const SHOTS =
  "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState:
    "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-declined.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-a/expenses");
await page.waitForSelector("article", { timeout: 15000 });
await page.waitForTimeout(500);

const metrics = await page.evaluate(() => ({
  bodyScrollWidth: document.body.scrollWidth,
  docScrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
}));
console.log("PAGE METRICS:", JSON.stringify(metrics));

await page.screenshot({ path: `${SHOTS}/verify-longname-page.png`, fullPage: false });

// scroll right to show overflow if any
await page.evaluate(() => window.scrollTo(9999, 0));
await page.screenshot({ path: `${SHOTS}/verify-longname-page-scrolled.png` });
await page.evaluate(() => window.scrollTo(0, 0));

// Open the add-expense sheet (member persona — find the add button)
const addBtn = page
  .getByRole("button", { name: /add|log|expense/i })
  .first();
let sheetChecked = false;
try {
  await addBtn.click({ timeout: 5000 });
  await page.waitForSelector("fieldset", { timeout: 8000 });
  await page.waitForTimeout(400);
  const sheetMetrics = await page.evaluate(() => {
    const chips = [...document.querySelectorAll("fieldset button")];
    const widths = chips.map((c) => Math.round(c.getBoundingClientRect().width));
    return {
      bodyScrollWidth: document.body.scrollWidth,
      chipWidths: widths,
      maxChip: Math.max(...widths, 0),
    };
  });
  console.log("SHEET METRICS:", JSON.stringify(sheetMetrics));
  await page.screenshot({ path: `${SHOTS}/verify-longname-sheet.png` });
  sheetChecked = true;
} catch (e) {
  console.log("SHEET: could not open add sheet:", e.message?.slice(0, 120));
}
console.log("sheetChecked:", sheetChecked);
await browser.close();
