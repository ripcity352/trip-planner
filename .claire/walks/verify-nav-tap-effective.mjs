import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-pending.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-a", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

// Effective hit area = elementFromPoint probe just outside the visual box
const result = await page.evaluate(() => {
  const probe = (el, label) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    // point 4px ABOVE the visual top edge
    const above = document.elementFromPoint(cx, r.top - 4);
    // point 5px above (for 6px-slop surfaces)
    const above5 = document.elementFromPoint(cx, r.top - 5);
    return {
      label,
      visual: { w: Math.round(r.width), h: Math.round(r.height) },
      hitAt4pxAbove: el.contains(above) || above === el,
      hitAt5pxAbove: el.contains(above5) || above5 === el,
      after: getComputedStyle(el, "::after").content,
    };
  };
  const out = [];
  const chip = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Going");
  if (chip) out.push(probe(chip, "RSVP chip Going"));
  const menu = document.querySelector('button[aria-label="Account menu"]');
  if (menu) out.push(probe(menu, "Account menu"));
  const link = [...document.querySelectorAll("a")].find((a) => a.textContent.includes("See the dates"));
  if (link) out.push(probe(link, "See the dates link"));
  return out;
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
