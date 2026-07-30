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
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERR:", m.text().slice(0, 200)); });

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Add an item");

// 1. Open add form
await page.click("text=Add an item");
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/itin-crud-01-addform.png`, fullPage: true });
console.log("ADD FORM TEXT:\n", await page.evaluate(() => document.body.innerText));

// 2. Submit empty
const saveBtn = page.locator("button", { hasText: /save|add/i }).last();
console.log("save button text:", await saveBtn.textContent());
await saveBtn.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/itin-crud-02-empty-submit.png`, fullPage: true });
const errs = await page.evaluate(() => Array.from(document.querySelectorAll("p")).map(p => p.innerText).filter(t => t && t.length < 120));
console.log("after empty submit paragraphs:", JSON.stringify(errs));

// 3. Fill and submit — day outside trip range (Aug 10) to test validation
await page.fill("#add-title", "[itin] Range Test Kayak");
await page.fill("#add-day", "2026-08-10");
await page.screenshot({ path: `${SHOTS}/itin-crud-03-filled-outrange.png` });
await saveBtn.click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/itin-crud-04-after-outrange.png`, fullPage: true });
const t1 = await page.evaluate(() => document.body.innerText);
console.log("OUT-OF-RANGE accepted?", t1.includes("Range Test Kayak") ? "YES appears on page" : "no", "| AUG 10 header:", /AUG 10|Aug 10/i.test(t1));

// 4. Add a normal item on Aug 3 (empty day)
if (!(await page.locator("#add-title").isVisible())) { await page.click("text=Add an item"); await page.waitForTimeout(400); }
await page.fill("#add-title", "[itin] Pool Party");
await page.selectOption("#add-kind", "activity").catch(async () => {
  console.log("kind select fallback; options:", await page.locator("#add-kind option").allTextContents().catch(()=>"n/a"));
});
await page.fill("#add-day", "2026-08-03");
await page.fill("#add-address", "123 Palm St, Miami");
await page.fill("#add-dress", "swim");
await page.fill("#add-tags", "pool, chill");
await page.screenshot({ path: `${SHOTS}/itin-crud-05-filled.png`, fullPage: true });
await saveBtn.click();
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("h1");
await page.waitForTimeout(800);
const t2 = await page.evaluate(() => document.body.innerText);
console.log("Pool Party persisted:", t2.includes("[itin] Pool Party"), "| Aug 3 header:", /AUG 3/i.test(t2));
console.log("Day order check — page text:\n", t2);
await page.screenshot({ path: `${SHOTS}/itin-crud-06-after-add-reload.png`, fullPage: true });

await browser.close();
