import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-pending.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-a", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const audit = await page.evaluate(() => {
  const els = [...document.querySelectorAll("a,button")];
  return els
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (el.textContent || "").trim().slice(0, 40),
        aria: el.getAttribute("aria-label"),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })
    .filter((e) => e.h > 0 && e.h < 44);
});
console.log(JSON.stringify(audit, null, 2));
await page.screenshot({ path: `${SHOTS}/verify-nav-tap-01-top.png` });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/verify-nav-tap-02-bottom.png` });
await browser.close();
