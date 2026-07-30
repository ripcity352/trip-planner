import { chromium } from "@playwright/test";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-going.json";
const URL = "http://localhost:3000/trips/sweep-trip-a/arrivals";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
for (let pass = 0; pass < 4; pass++) {
  await page.goto(URL);
  await page.waitForSelector("text=Who's landing when");
  // any card owned by me has an Edit button
  const edit = page.locator("article").getByRole("button", { name: "Edit" }).first();
  if (!(await edit.count())) break;
  await edit.click();
  await page.waitForSelector("#leg-kind");
  await page.getByRole("button", { name: "Delete travel" }).click();
  await page.waitForTimeout(2000);
}
await page.goto(URL);
await page.waitForSelector("text=Who's landing when");
console.log("[cleanup] my remaining editable cards:", await page.locator("article").getByRole("button", { name: "Edit" }).count());
console.log("[cleanup] total cards:", await page.locator("article").count());
await browser.close();
