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
await page.waitForSelector("text=[itin] Pool Party");

// Open edit on Pool Party card
const card = page.locator("article", { hasText: "[itin] Pool Party" });
await card.locator("button", { hasText: "Edit" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/itin-edit-01-form.png`, fullPage: true });
const formText = await page.evaluate(() => document.body.innerText);
console.log("EDIT FORM VISIBLE FIELDS:\n", formText.split("MONDAY · AUG 3")[1] ?? formText);

// dump inputs in the edit form
const inputs = await page.evaluate(() =>
  Array.from(document.querySelectorAll("input, select, textarea")).map((i) => ({
    id: i.id, type: i.type, name: i.name, value: i.value,
  }))
);
console.log("INPUTS:", JSON.stringify(inputs, null, 1));

// Set a start datetime via the datetime-local input if present
const dtInputs = await page.locator('input[type="datetime-local"]').all();
console.log("datetime-local count:", dtInputs.length);
if (dtInputs.length >= 1) {
  await dtInputs[0].fill("2026-08-03T14:00");
  if (dtInputs.length >= 2) await dtInputs[1].fill("2026-08-03T13:00"); // end BEFORE start — adversarial
}
const save = page.locator("button", { hasText: /^Save/ }).first();
await save.click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/itin-edit-02-endbeforestart.png`, fullPage: true });
const t1 = await page.evaluate(() => document.body.innerText);
console.log("end-before-start accepted?", t1.includes("2:00 PM") ? "time shown: " + (t1.match(/2:00 PM[^\n]*/) || [""])[0] : "no time shown", "| any error:", (t1.match(/[Ee]nd.*before|before.*start|error/gi) || []).join(","));

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("h1");
await page.waitForTimeout(700);
const t2 = await page.evaluate(() => document.body.innerText);
console.log("AFTER RELOAD Pool Party block:", (t2.split("[itin] Pool Party")[1] || "").split("MONDAY")[0]);

// Delete the Range Test Kayak item — check confirm affordance
const kcard = page.locator("article", { hasText: "[itin] Range Test Kayak" });
await kcard.locator("button", { hasText: "Edit" }).click();
await page.waitForTimeout(500);
const delBtn = page.locator("button", { hasText: /delete|remove/i }).first();
console.log("delete btn text:", await delBtn.textContent().catch(() => "NOT FOUND"));
await page.screenshot({ path: `${SHOTS}/itin-edit-03-editkayak.png`, fullPage: true });
await delBtn.click();
await page.waitForTimeout(400);
console.log("after 1st click delete btn text:", await delBtn.textContent().catch(() => "gone"));
await page.screenshot({ path: `${SHOTS}/itin-edit-04-delete-confirm.png`, fullPage: true });
await delBtn.click();
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("h1");
await page.waitForTimeout(700);
const t3 = await page.evaluate(() => document.body.innerText);
console.log("Kayak gone after delete+reload:", !t3.includes("Range Test Kayak"));
await page.screenshot({ path: `${SHOTS}/itin-edit-05-after-delete.png`, fullPage: true });

await browser.close();
