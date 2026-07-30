import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "playwright/.auth/persona-sweep-member-late.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();

await page.goto("http://localhost:3000/trips/sweep-trip-a/arrivals");
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/verify-blank-01-arrivals.png`, fullPage: true });

// count existing cards mentioning our persona
const before = await page.locator("text=/Sweep Member Late/i").count();
console.log("before cards mentioning persona:", before);

// Find add button
const addBtn = page.getByRole("button", { name: /add your travel|add travel|edit your travel/i }).first();
console.log("add button text:", await addBtn.textContent().catch(() => "NOT FOUND"));
await addBtn.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/verify-blank-02-sheet.png`, fullPage: true });

// Submit with nothing filled
const saveBtn = page.getByRole("button", { name: /save it|save/i }).first();
console.log("save button:", await saveBtn.textContent().catch(() => "NOT FOUND"));
await saveBtn.click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/verify-blank-03-after-submit.png`, fullPage: true });

// any visible error?
const bodyText = await page.locator("body").innerText();
console.log("sheet still open (Save visible)?", await saveBtn.isVisible().catch(() => false));
console.log("contains 'wrong' or error-ish text?", /something went|try again|required/i.test(bodyText));

// Reload and check persistence
await page.reload();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/verify-blank-04-reload.png`, fullPage: true });
const after = await page.locator("text=/Sweep Member Late/i").count();
console.log("after reload, cards mentioning persona:", after);
const body2 = await page.locator("body").innerText();
console.log("---- page text after reload ----");
console.log(body2.slice(0, 3000));

await browser.close();
