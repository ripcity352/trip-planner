import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const vp = { width: 375, height: 812 };
const browser = await chromium.launch();

async function run(persona, fn) {
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-${persona}.json`, viewport: vp });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log(`[${persona} pageerror]`, String(e).slice(0, 300)));
  await fn(page, (n) => page.screenshot({ path: `${SHOTS}/home-${n}.png`, fullPage: true }),
    async () => (await page.evaluate(() => document.body.innerText)));
  await ctx.close();
}

// ---- FOUNDER: add-window empty + valid ----
await run("founder", async (page, shot, text) => {
  await page.goto("http://localhost:3000/trips/sweep-trip-b/dates", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /add a window/i }).click();
  await page.waitForTimeout(500);
  // empty submit — find the submit button inside form
  const submitName = await page.evaluate(() => {
    const f = document.querySelector("form");
    const b = f?.querySelector('button[type="submit"]');
    return b?.innerText.trim();
  });
  console.log("ADD-WINDOW SUBMIT LABEL:", submitName);
  if (submitName) {
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForTimeout(1000);
    console.log("EMPTY ADD RESULT:\n", (await text()).slice(0, 1400));
    await shot("35-addwindow-empty");
    // valid add
    await page.fill('input[name="label"], form input[type="text"]', "[home] October tryout").catch(() => {});
    const dates = page.locator('form input[type="date"]');
    await dates.nth(0).fill("2026-10-09");
    await dates.nth(1).fill("2026-10-12");
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    console.log("\nAFTER VALID ADD:\n", (await text()).slice(0, 1600));
    await shot("36-addwindow-added");
  }
  // any delete affordance on windows?
  const btns = await page.evaluate(() => [...document.querySelectorAll("button")].map(b => b.getAttribute("aria-label") || b.innerText.trim()));
  console.log("ALL BUTTON LABELS:", JSON.stringify(btns));
});

// ---- MEMBER-MAYBE: trip A dash + trip B dash + poll ----
await run("member-maybe", async (page, shot, text) => {
  await page.goto("http://localhost:3000/trips/sweep-trip-a", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  console.log("\n== MEMBER TRIP A DASH ==\n", (await text()).slice(0, 2000));
  await shot("40-member-tripA-dash");

  await page.goto("http://localhost:3000/trips/sweep-trip-b", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  console.log("\n== MEMBER TRIP B DASH (null dates) ==\n", (await text()).slice(0, 1600));
  await shot("41-member-tripB-dash");

  await page.goto("http://localhost:3000/trips/sweep-trip-b/dates", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  console.log("\n== MEMBER POLL VIEW ==\n", (await text()).slice(0, 1600));
  await shot("42-member-poll");
  // vote on second window
  const inBtns = page.getByRole("button", { name: "I'm in" });
  const count = await inBtns.count();
  console.log("member vote buttons:", count);
  if (count >= 2) {
    await inBtns.nth(1).click();
    await page.waitForTimeout(1500);
    console.log("\nMEMBER AFTER VOTE W2:\n", (await text()).slice(0, 1200));
    await shot("43-member-voted");
  }
  // trips index for member
  await page.goto("http://localhost:3000/trips", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  console.log("\n== MEMBER TRIPS INDEX ==\n", (await text()).slice(0, 600));
  await shot("44-member-index");
});

await browser.close();
