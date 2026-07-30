import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const vp = { width: 375, height: 812 };

const browser = await chromium.launch();

async function dump(page, name) {
  await page.screenshot({ path: `${SHOTS}/home-${name}.png`, fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  console.log(`\n===== ${name} (${page.url()}) =====\n${text.slice(0, 3500)}`);
}

const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-founder.json`, viewport: vp });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300)); });
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 300)));

// 1. trips index
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await dump(page, "01-index-founder");

// Maybe / redirects — try /trips too
await page.goto("http://localhost:3000/trips", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await dump(page, "02-trips-founder");

// 2. trip A dashboard
await page.goto("http://localhost:3000/trips/sweep-trip-a", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await dump(page, "03-tripA-dash-founder");

// 3. trip B dashboard (null dates)
await page.goto("http://localhost:3000/trips/sweep-trip-b", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await dump(page, "04-tripB-dash-founder");

// 4. trip B dates poll
await page.goto("http://localhost:3000/trips/sweep-trip-b/dates", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await dump(page, "05-tripB-dates-founder");

// 5. /trips/new
await page.goto("http://localhost:3000/trips/new", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await dump(page, "06-trips-new-founder");

await browser.close();
