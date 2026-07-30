import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const URL = "http://localhost:3000/trips/sweep-trip-a/itinerary";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: `${AUTH}/persona-sweep-founder.json`,
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
page.on("console", (m) => console.log("CONSOLE[" + m.type() + "]:", m.text().slice(0, 300)));
page.on("response", async (r) => {
  if (r.request().method() === "POST") {
    console.log("POST", r.url().slice(0, 90), r.status());
  }
});

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=[itin] Pool Party");

const card = page.locator("article", { hasText: "[itin] Pool Party" });
await card.locator("button", { hasText: "Edit" }).click();
await page.waitForSelector("#edit-datetime");

// fill start only, with events
await page.fill("#edit-datetime", "2026-08-03T14:00");
await page.waitForTimeout(300);
console.log("input value after fill:", await page.inputValue("#edit-datetime"));
await page.screenshot({ path: `${SHOTS}/itin-time-01-filled.png`, fullPage: true });

await page.locator("button", { hasText: /^Save/ }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/itin-time-02-after-save.png`, fullPage: true });
const t = await page.evaluate(() => document.body.innerText);
console.log("visible errors:", (t.match(/wrong|error|couldn|try again/gi) || []).join(","));
console.log("card block:", (t.split("[itin] Pool Party")[1] || "").split("Edit")[0]);

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("h1");
await page.waitForTimeout(800);
const t2 = await page.evaluate(() => document.body.innerText);
console.log("after reload card block:", (t2.split("[itin] Pool Party")[1] || "").split("Apple Maps")[0]);
await page.screenshot({ path: `${SHOTS}/itin-time-03-reload.png`, fullPage: true });
await browser.close();
