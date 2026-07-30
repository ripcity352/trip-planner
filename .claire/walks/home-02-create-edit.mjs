import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const vp = { width: 375, height: 812 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-founder.json`, viewport: vp });
const page = await ctx.newPage();
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", m => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });

const shot = (n) => page.screenshot({ path: `${SHOTS}/home-${n}.png`, fullPage: true });
const text = async () => (await page.evaluate(() => document.body.innerText));

// ---- CREATE TRIP ----
await page.goto("http://localhost:3000/trips/new", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);

// empty submit
await page.getByRole("button", { name: /lock it in/i }).click();
await page.waitForTimeout(1200);
console.log("EMPTY SUBMIT URL:", page.url());
console.log(await text());
await shot("10-newtrip-empty-submit");

// invalid dates: To before From, with name
await page.fill('input[name="name"]', "[home] Test Trip");
const dateInputs = await page.locator('input[type="date"]').count();
console.log("date inputs:", dateInputs);
if (dateInputs >= 2) {
  await page.locator('input[type="date"]').nth(0).fill("2026-09-10");
  await page.locator('input[type="date"]').nth(1).fill("2026-09-05");
}
await shot("11-newtrip-filled-invalid-dates");
await page.getByRole("button", { name: /lock it in/i }).click();
await page.waitForTimeout(1500);
console.log("\nINVALID DATES SUBMIT URL:", page.url());
console.log(await text());
await shot("12-newtrip-invalid-dates-result");

// If it created the trip already, note it. Otherwise fix dates and submit.
if (page.url().includes("/trips/new")) {
  await page.locator('input[type="date"]').nth(1).fill("2026-09-12");
  await page.getByRole("button", { name: /lock it in/i }).click();
  await page.waitForTimeout(2500);
}
console.log("\nAFTER VALID SUBMIT URL:", page.url());
console.log(await text());
await shot("13-newtrip-created");

// ---- TRIP EDIT on trip A ----
await page.goto("http://localhost:3000/trips/sweep-trip-a", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /^edit$/i }).first().click();
await page.waitForTimeout(800);
await shot("14-tripA-edit-sheet");
console.log("\nEDIT SHEET:\n", await text());

// list form fields in sheet
const fields = await page.evaluate(() =>
  [...document.querySelectorAll("input, textarea, select")].map(i => ({ name: i.name, type: i.type, value: i.value }))
);
console.log("FIELDS:", JSON.stringify(fields, null, 1));

await browser.close();
