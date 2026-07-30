import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const BASE = "http://localhost:3000";
const viewport = { width: 375, height: 812 };
const log = (...a) => console.log("[me-05]", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport });
const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message));

// 1. /login rendering + voice
await page.goto(`${BASE}/login`);
await page.waitForSelector("h1, form");
await page.screenshot({ path: `${SHOTS}/me-16-login.png`, fullPage: true });
log("login text >>>\n" + await page.locator("body").innerText() + "\n<<<");

// 2. deep-link while logged out
await page.goto(`${BASE}/trips/sweep-trip-a/itinerary`);
await page.waitForTimeout(1000);
log("deep link /trips/sweep-trip-a/itinerary ->", page.url());
await page.screenshot({ path: `${SHOTS}/me-17-deeplink-redirect.png`, fullPage: true });

// 3. legal pages
for (const p of ["/legal/privacy", "/legal/terms"]) {
  const resp = await page.goto(`${BASE}${p}`);
  await page.waitForTimeout(500);
  log(p, "status:", resp?.status(), "url:", page.url());
  const t = await page.locator("body").innerText();
  log(p + " text (first 900) >>>\n" + t.slice(0, 900) + "\n<<<");
  await page.screenshot({ path: `${SHOTS}/me-18-${p.replace(/\//g, "_")}.png`, fullPage: true });
}
// also check bare /privacy /terms redirects (folders exist at app/privacy? no — app/legal only; but app/ had privacy,terms dirs? earlier ls showed privacy + terms at app root)
for (const p of ["/privacy", "/terms"]) {
  const resp = await page.goto(`${BASE}${p}`);
  log(p, "status:", resp?.status(), "final url:", page.url());
}

// 4. 404 behavior
const r404 = await page.goto(`${BASE}/definitely-not-a-page-xyz`);
await page.waitForTimeout(500);
log("404 status:", r404?.status());
log("404 text >>>\n" + (await page.locator("body").innerText()).slice(0, 600) + "\n<<<");
await page.screenshot({ path: `${SHOTS}/me-19-404.png`, fullPage: true });

// 404 links
log("404 links:", JSON.stringify(await page.locator("a:visible").allInnerTexts()));

// 5. nonexistent trip while logged out
await page.goto(`${BASE}/trips/nonexistent-trip-slug`);
await page.waitForTimeout(800);
log("nonexistent trip (logged out) ->", page.url());

await browser.close();
log("DONE");
