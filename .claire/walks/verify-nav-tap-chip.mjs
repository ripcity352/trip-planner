import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-pending.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-a", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const chip = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Going");
  const r = chip.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const pts = [-1, -2, -3, -3.5, -4, 1].map((dy) => {
    const el = document.elementFromPoint(cx, (dy < 0 ? r.top : r.bottom) + dy);
    return { dy, hit: chip.contains(el) || el === chip, got: el ? el.tagName + "." + (el.className || "").toString().slice(0, 40) : null };
  });
  const cs = getComputedStyle(chip, "::after");
  return { rect: { top: r.top, h: r.height }, pts, after: { content: cs.content, position: cs.position, top: cs.top, bottom: cs.bottom, inset: cs.inset } };
});
console.log(JSON.stringify(result, null, 2));

// Real click precision test: mouse click 3px above chip top — does RSVP change?
const chipBox = await page.locator("button", { hasText: "Going" }).first().boundingBox();
await page.mouse.click(chipBox.x + chipBox.width / 2, chipBox.y - 3);
await page.waitForTimeout(2000);
const pressed = await page.locator("button", { hasText: "Going" }).first().getAttribute("aria-pressed");
console.log("aria-pressed after click 3px above:", pressed);
await browser.close();
