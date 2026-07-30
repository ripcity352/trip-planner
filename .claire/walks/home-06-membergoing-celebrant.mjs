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

// ---- MEMBER-GOING (is on trip B) ----
await run("member-going", async (page, shot, text) => {
  await page.goto("http://localhost:3000/trips/sweep-trip-b", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  console.log("== MEMBER-GOING TRIP B DASH ==\n", (await text()).slice(0, 1500));
  await shot("50-mgoing-tripB-dash");

  await page.goto("http://localhost:3000/trips/sweep-trip-b/dates", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  console.log("\n== MEMBER-GOING POLL ==\n", (await text()).slice(0, 1400));
  await shot("51-mgoing-poll");
  const btns = await page.evaluate(() => [...document.querySelectorAll("button")].map(b => b.innerText.trim()).filter(Boolean));
  console.log("MEMBER-GOING BUTTONS:", JSON.stringify(btns));

  // change vote on window 1 (currently yes) to Skip me, then back
  await page.getByRole("button", { name: "Skip me" }).first().click();
  await page.waitForTimeout(1500);
  console.log("\nAFTER SKIP:\n", (await text()).slice(0, 500));
  await shot("52-mgoing-skip");
  await page.getByRole("button", { name: "I'm in" }).first().click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const pressed = await page.evaluate(() =>
    [...document.querySelectorAll("button[aria-pressed]")].map(b => ({ t: b.innerText.trim(), p: b.getAttribute("aria-pressed") })));
  console.log("MEMBER-GOING RELOAD PRESSED:", JSON.stringify(pressed));
});

// ---- CELEBRANT view of poll ----
await run("celebrant", async (page, shot, text) => {
  await page.goto("http://localhost:3000/trips/sweep-trip-b/dates", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  console.log("\n== CELEBRANT POLL ==\n", (await text()).slice(0, 1600));
  await shot("53-celebrant-poll");
  const btns = await page.evaluate(() => [...document.querySelectorAll("button")].map(b => ({ t: b.innerText.trim(), p: b.getAttribute("aria-pressed") })).filter(b => b.t));
  console.log("CELEBRANT BUTTONS:", JSON.stringify(btns));

  // celebrant trip B dashboard null dates
  await page.goto("http://localhost:3000/trips/sweep-trip-b", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  console.log("\n== CELEBRANT TRIP B DASH ==\n", (await text()).slice(0, 1200));
  await shot("54-celebrant-tripB-dash");
});

await browser.close();
