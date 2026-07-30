import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH_DIR = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const URL = "http://localhost:3000/trips/sweep-trip-a/arrivals";
const viewport = { width: 375, height: 812 };
const log = (...a) => console.log("[walk]", ...a);
const browser = await chromium.launch();

// ---------- member-going: edit UA leg (notes only) ----------
{
  const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/persona-sweep-member-going.json`, viewport });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector("text=Who's landing when");
  const uaCard = page.locator("article", { hasText: "[arrivals-qa] leg B" });
  await uaCard.getByRole("button", { name: "Edit" }).click();
  await page.waitForSelector("#leg-notes");
  await page.screenshot({ path: `${SHOTS}/arrivals-10-edit-form-prefill.png`, fullPage: true });
  log("edit prefill airline input:", JSON.stringify(await page.inputValue("#airline-picker-input")));
  log("edit prefill flight number:", JSON.stringify(await page.inputValue("#flight-number-input")));
  log("edit prefill depart:", await page.inputValue("#leg-depart"), "arrive:", await page.inputValue("#leg-arrive"));
  await page.fill("#leg-notes", "[arrivals-qa] leg B EDITED notes only");
  await page.getByRole("button", { name: "Save it" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/arrivals-11-after-edit-save.png`, fullPage: true });
  await ctx.close();
}

// ---------- founder view ----------
{
  const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/persona-sweep-founder.json`, viewport });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector("text=Who's landing when");
  await page.screenshot({ path: `${SHOTS}/arrivals-12-founder-view.png`, fullPage: true });
  const cards = page.locator("article");
  const n = await cards.count();
  log("founder sees", n, "cards");
  for (let i = 0; i < n; i++) {
    const t = await cards.nth(i).innerText();
    const hasEdit = await cards.nth(i).getByRole("button", { name: "Edit" }).count();
    log(`card ${i} edit=${hasEdit}:`, JSON.stringify(t.slice(0, 90)));
  }
  await ctx.close();
}

await browser.close();
