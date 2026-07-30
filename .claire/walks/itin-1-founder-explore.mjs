import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const URL = "http://localhost:3000/trips/sweep-trip-a/itinerary";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: `${AUTH}/persona-sweep-founder.json`,
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERR:", m.text()); });

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/itin-founder-01-top.png`, fullPage: false });
await page.screenshot({ path: `${SHOTS}/itin-founder-02-full.png`, fullPage: true });

// Dump visible text of the whole page
const text = await page.evaluate(() => document.body.innerText);
console.log("=== PAGE TEXT ===\n" + text);

// Dump buttons / interactive elements
const buttons = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button, a, summary, [role=button]")).map((b) => ({
    tag: b.tagName,
    text: (b.textContent || "").trim().slice(0, 60),
    aria: b.getAttribute("aria-label"),
    expanded: b.getAttribute("aria-expanded"),
  }))
);
console.log("=== INTERACTIVE ===\n" + JSON.stringify(buttons, null, 1));

await browser.close();
