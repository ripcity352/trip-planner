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
await page.screenshot({ path: `${SHOTS}/arrivals-01-manifest-member-going.png`, fullPage: true });
log("manifest loaded. cards:", await page.locator("article").count());
log("manifest text:", (await page.locator("section").innerText()).replace(/\n+/g, " | ").slice(0, 1500));

// --- open add sheet
await page.getByRole("button", { name: "Add your travel" }).click();
await page.waitForSelector("#leg-kind");
await page.screenshot({ path: `${SHOTS}/arrivals-02-add-form-defaults.png`, fullPage: true });
log("depart default:", await page.inputValue("#leg-depart"));
log("arrive default:", await page.inputValue("#leg-arrive"));

// --- TEST A: submit completely empty form
await page.getByRole("button", { name: "Save it" }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/arrivals-03-after-empty-submit.png`, fullPage: true });
const cardsAfterEmpty = await page.locator("article").count();
log("cards after empty submit:", cardsAfterEmpty, "sheet still open?", await page.locator("#leg-kind").count());

// reload to reset
await page.goto(URL);
await page.waitForSelector("text=Who's landing when");
log("cards after reload:", await page.locator("article").count());

// --- TEST B: add flight with arrive BEFORE leave, via airline picker
await page.getByRole("button", { name: "Add your travel" }).click();
await page.waitForSelector("#leg-kind");
await page.fill("#leg-depart", "2026-08-01T18:00");
await page.fill("#leg-arrive", "2026-08-01T10:00"); // before leave!
await page.fill("#airline-picker-input", "united");
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/arrivals-04-airline-typeahead.png`, fullPage: true });
const opt = page.getByRole("option").first();
if (await opt.count()) { log("first option:", await opt.innerText()); await opt.click(); }
await page.fill("#flight-number-input", "1234");
await page.fill("#leg-notes", "[arrivals-qa] test leg B arrive-before-leave");
await page.screenshot({ path: `${SHOTS}/arrivals-05-flight-filled.png`, fullPage: true });
await page.getByRole("button", { name: "Save it" }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/arrivals-06-after-save-flight.png`, fullPage: true });
log("sheet open after save?", await page.locator("#leg-kind").count());

// reload, verify persistence + display
await page.goto(URL);
await page.waitForSelector("text=Who's landing when");
await page.screenshot({ path: `${SHOTS}/arrivals-07-manifest-after-add.png`, fullPage: true });
const myCard = page.locator("article", { hasText: "[arrivals-qa] test leg B" });
log("my card count:", await myCard.count());
if (await myCard.count()) log("my card text:", (await myCard.first().innerText()).replace(/\n+/g, " | "));

await browser.close();
