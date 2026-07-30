import { chromium } from "@playwright/test";
const shots = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-c-member.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-c");
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(1500);
const body = await page.textContent("body");
console.log("has NowNext empty copy:", body.includes("No items on the itinerary yet"));
console.log("has itinerary card copy:", body.includes("Nothing booked yet. The organizers are on it."));
await page.screenshot({ path: shots + "/verify-nav-dup-empty-full.png", fullPage: true });
await browser.close();
