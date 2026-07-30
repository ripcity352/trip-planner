import { chromium } from "@playwright/test";
const shots = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-founder.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
for (const route of ["expenses", "arrivals", "dates"]) {
  await page.goto(`http://localhost:3000/trips/sweep-trip-a/${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const nav = await page.$('nav[aria-label="Trip navigation"]');
  const active = nav ? await page.$$eval('nav[aria-label="Trip navigation"] a[aria-current="page"]', els => els.map(e => e.textContent.trim())) : "NO NAV";
  console.log(route, "url:", page.url(), "| nav present:", !!nav, "| active tabs:", JSON.stringify(active));
  await page.screenshot({ path: `${shots}/navverify-${route}.png` });
}
await browser.close();
