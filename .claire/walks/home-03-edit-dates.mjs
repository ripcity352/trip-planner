import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const vp = { width: 375, height: 812 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-founder.json`, viewport: vp });
const page = await ctx.newPage();
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 300)));
const shot = (n) => page.screenshot({ path: `${SHOTS}/home-${n}.png`, fullPage: true });
const text = async () => (await page.evaluate(() => document.body.innerText));

// ---- EDIT MY OWN TEST TRIP ----
await page.goto("http://localhost:3000/trips/home-test-trip", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.getByLabel("Edit trip name and location").click();
await page.waitForTimeout(600);
await shot("20-edit-sheet-open");
console.log("EDIT SHEET OPEN:\n", (await text()).slice(0, 800));

// empty name submit
await page.fill('input[name="name"]', "");
await page.getByRole("button", { name: /save it/i }).click();
await page.waitForTimeout(1000);
console.log("\nEMPTY NAME RESULT:\n", (await text()).slice(0, 800));
await shot("21-edit-empty-name");

// valid edit
await page.fill('input[name="name"]', "[home] Test Trip Renamed");
await page.fill('input[name="location"]', "Las Vegas");
await page.getByRole("button", { name: /save it/i }).click();
await page.waitForTimeout(2000);
console.log("\nAFTER SAVE URL:", page.url());
console.log((await text()).slice(0, 600));
await shot("22-edit-saved");

// reload persistence
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
console.log("\nAFTER RELOAD:\n", (await text()).slice(0, 600));
await shot("23-edit-reload");

// dated trip: can dates be changed? check /dates on the new dated trip + trip A
await page.goto("http://localhost:3000/trips/home-test-trip/dates", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
console.log("\nMY TRIP /dates:\n", (await text()).slice(0, 900));
await shot("24-mytrip-dates-decided");

await page.goto("http://localhost:3000/trips/sweep-trip-a/dates", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
console.log("\nTRIP A /dates:\n", (await text()).slice(0, 900));
await shot("25-tripA-dates");

await browser.close();
