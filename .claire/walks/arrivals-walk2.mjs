import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-going.json";
const URL = "http://localhost:3000/trips/sweep-trip-a/arrivals";
const viewport = { width: 375, height: 812 };
const log = (...a) => console.log("[walk]", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH, viewport });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[console-error]", m.text()); });

await page.goto(URL);
await page.waitForSelector("text=Who's landing when");

// inspect each card's text + check horizontal overflow
const cards = page.locator("article");
for (let i = 0; i < await cards.count(); i++) {
  log(`card ${i}:`, JSON.stringify(await cards.nth(i).innerText()));
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth ? document.documentElement.scrollWidth : 0);
log("horizontal overflow scrollWidth:", overflow);

// --- add flight with UA 1234, arrive-before-leave
await page.getByRole("button", { name: "Add your travel" }).click();
await page.waitForSelector("#leg-kind");
await page.fill("#leg-depart", "2026-08-01T18:00");
await page.fill("#leg-arrive", "2026-08-01T10:00");
await page.fill("#airline-picker-input", "united");
const uaOpt = page.locator("ul[role='listbox'] li", { hasText: "United Airlines" });
await uaOpt.waitFor({ timeout: 5000 });
await uaOpt.click();
await page.fill("#flight-number-input", "1234");
await page.fill("#leg-confirmation", "QAX123");
await page.fill("#leg-notes", "[arrivals-qa] leg B arrive-before-leave");
await page.getByRole("button", { name: "Save it" }).click();
await page.waitForTimeout(2500);
await page.goto(URL);
await page.waitForSelector("text=Who's landing when");
await page.screenshot({ path: `${SHOTS}/arrivals-08-manifest-after-UA-add.png`, fullPage: true });
const myCard = page.locator("article", { hasText: "[arrivals-qa] leg B" });
log("UA card count:", await myCard.count());
if (await myCard.count()) log("UA card text:", JSON.stringify(await myCard.first().innerText()));

// --- double-submit test: two rapid clicks on Save
await page.getByRole("button", { name: "Add your travel" }).click();
await page.waitForSelector("#leg-kind");
await page.fill("#leg-arrive", "2026-08-02T11:00");
await page.fill("#leg-notes", "[arrivals-qa] double-submit test");
const save = page.getByRole("button", { name: "Save it" });
await Promise.all([save.click(), save.click({ force: true }).catch(() => {})]);
await page.waitForTimeout(2500);
await page.goto(URL);
await page.waitForSelector("text=Who's landing when");
const dbl = page.locator("article", { hasText: "double-submit test" });
log("double-submit cards created:", await dbl.count());
await page.screenshot({ path: `${SHOTS}/arrivals-09-after-double-submit.png`, fullPage: true });

await browser.close();
