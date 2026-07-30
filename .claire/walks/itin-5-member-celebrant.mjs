import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const URL = "http://localhost:3000/trips/sweep-trip-a/itinerary";
const VP = { width: 375, height: 812 };

const browser = await chromium.launch();

// ---- MEMBER-GOING ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-member-going.json`, viewport: VP });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1000);
  const t = await page.evaluate(() => document.body.innerText);
  console.log("=== MEMBER-GOING TEXT ===\n" + t);
  await page.screenshot({ path: `${SHOTS}/itin-member-01-full.png`, fullPage: true });

  // disclosure triggers
  const disc = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button[aria-expanded]")).map((b) => ({
      text: (b.textContent || "").trim().slice(0, 60), expanded: b.getAttribute("aria-expanded"),
    }))
  );
  console.log("disclosures:", JSON.stringify(disc));

  // open first flag disclosure on Welcome Dinner
  const wcard = page.locator("article", { hasText: "Welcome Dinner" });
  const trigger = wcard.locator("button[aria-expanded]").first();
  if (await trigger.count()) {
    await trigger.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/itin-member-02-flags-open.png`, fullPage: true });
    console.log("flag panel text:", await wcard.innerText());
    // toggle a chip
    const chip = wcard.locator("button", { hasText: /No booze|Veggie|vegetarian/i }).first();
    if (await chip.count()) {
      await chip.click();
      await page.waitForTimeout(1200);
      console.log("chip aria-pressed:", await chip.getAttribute("aria-pressed"));
      await page.screenshot({ path: `${SHOTS}/itin-member-03-flag-set.png`, fullPage: true });
    }
  }

  // item RSVP: tap "Skip me" on Welcome Dinner, reload, verify persist
  const skip = wcard.locator("button", { hasText: "Skip me" }).first();
  await skip.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/itin-member-04-skip.png` });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(900);
  const w2 = await page.locator("article", { hasText: "Welcome Dinner" }).innerText();
  console.log("Welcome Dinner card after skip+reload:\n", w2);
  await page.screenshot({ path: `${SHOTS}/itin-member-05-skip-reload.png`, fullPage: true });
  await ctx.close();
}

// ---- CELEBRANT ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-celebrant.json`, viewport: VP });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1000);
  const t = await page.evaluate(() => document.body.innerText);
  console.log("=== CELEBRANT TEXT ===\n" + t);
  console.log("LEAK CHECK — Roast:", t.includes("Roast"), "| Budget Sync:", t.includes("Budget Sync"), "| 'Something planned' placeholder:", /Something planned|planned/i.test(t));
  await page.screenshot({ path: `${SHOTS}/itin-celebrant-01-full.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
