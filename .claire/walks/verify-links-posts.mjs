import { chromium } from "@playwright/test";
const shots = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-founder.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-a/announcements");
await page.waitForSelector("article", { timeout: 15000 });

// Post a new announcement with a URL
const textarea = page.locator("textarea").first();
if (await textarea.count()) {
  await textarea.fill("[verify-links] Details: https://example.com/plan?x=1&y=2");
  await page.locator('button[type="submit"], button:has-text("Post")').first().click();
  await page.waitForSelector('text=[verify-links]', { timeout: 15000 });
} else {
  console.log("NO TEXTAREA visible - founder compose form missing?");
}
await page.waitForTimeout(1000);
const card = page.locator("article", { hasText: "[verify-links]" }).first();
const anchors = await card.locator("a").count();
const bodyHtml = await card.innerHTML();
console.log("anchor count in card:", anchors);
console.log("card contains raw URL text:", bodyHtml.includes("https://example.com/plan?x=1&amp;y=2") || bodyHtml.includes("https://example.com/plan?x=1&y=2"));
await page.screenshot({ path: shots + "/verify-links-01-card.png", fullPage: false });
await browser.close();
