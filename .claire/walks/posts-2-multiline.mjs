import { chromium } from "@playwright/test";
const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-founder.json",
  viewport: { width: 375, height: 812 },
});
const p = await ctx.newPage();
await p.goto("http://localhost:3000/trips/sweep-trip-a/announcements");
await p.waitForSelector("#announcement-body", { timeout: 15000 });
await p.fill("#announcement-body", "[posts] Saturday schedule:\n- 10am golf\n- 1pm lunch\n- 7pm steakhouse\nDon't be late.");
await p.click('button:has-text("Send it")');
await p.waitForSelector("text=steakhouse", { timeout: 10000 });
const card = p.locator("article").filter({ hasText: "steakhouse" }).first();
await card.screenshot({ path: `${SHOTS}/posts-17-multiline.png` });
const box = await card.locator("p").first().boundingBox();
console.log("[posts] multiline body height px:", box?.height);
await browser.close();
