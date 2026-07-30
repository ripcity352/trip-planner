import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const BASE = "http://localhost:3000";
const C = "sweep-trip-c";
const A = "sweep-trip-a";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";

const browser = await chromium.launch();
const vp = { width: 375, height: 812 };
const log = (...a) => console.log(...a);

// ---- c-member: empty trip C, every tab's empty state ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-c-member.json`, viewport: vp });
  const page = await ctx.newPage();
  for (const [name, path] of [["home", ""], ["itinerary", "/itinerary"], ["announcements", "/announcements"], ["roster", "/roster"], ["me", "/me"], ["expenses", "/expenses"], ["arrivals", "/arrivals"], ["dates", "/dates"]]) {
    await page.goto(`${BASE}/trips/${C}${path}`);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SHOTS}/nav-10-emptyC-${name}.png`, fullPage: true });
    const txt = await page.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 600));
    log(`== empty C ${name} ==`, txt);
  }
  await ctx.close();
}

// ---- member-pending: trip A home (what does a pending member see?) ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-member-pending.json`, viewport: vp });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/trips/${A}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/nav-11-pending-home.png`, fullPage: true });
  log("== pending home ==", await page.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 500)));
  await ctx.close();
}

// ---- celebrant: trip A home + roster (micro-affordances not gates) ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-celebrant.json`, viewport: vp });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/trips/${A}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/nav-12-celebrant-home.png`, fullPage: true });
  const navLinks = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Trip navigation"]');
    return nav ? [...nav.querySelectorAll("a")].map((a) => a.textContent.trim()) : null;
  });
  log("celebrant tabs:", JSON.stringify(navLinks));
  // deep link to expenses as celebrant
  await page.goto(`${BASE}/trips/${A}/expenses`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/nav-13-celebrant-expenses.png`, fullPage: true });
  log("== celebrant expenses ==", await page.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 400)));
  await ctx.close();
}

// ---- landscape + keyboard-overlap probe on a form (member-going, me page availability / profile) ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-member-going.json`, viewport: { width: 812, height: 375 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/trips/${A}/me`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/nav-14-landscape-me.png`, fullPage: false });
  const navRect = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Trip navigation"]');
    return nav ? nav.getBoundingClientRect().toJSON() : null;
  });
  log("landscape nav rect:", JSON.stringify(navRect), "viewport h=375");
  await ctx.close();
}

// ---- tap-target audit on densest screen (trip A home, member-going, 375px) ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-member-going.json`, viewport: vp });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/trips/${A}`);
  await page.waitForTimeout(2000);
  const small = await page.evaluate(() => {
    const els = [...document.querySelectorAll("a, button")];
    return els
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { t: (el.getAttribute("aria-label") || el.textContent.trim()).slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((e) => e.h > 0 && (e.h < 40 || e.w < 40));
  });
  log("small tap targets on home:", JSON.stringify(small, null, 1));

  // slow-network loading state probe on tab switch
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 1200, downloadThroughput: 50000, uploadThroughput: 20000 });
  await page.click('nav[aria-label="Trip navigation"] a[href*="roster"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/nav-15-slow-transition.png`, fullPage: false });
  const during = await page.evaluate(() => ({ url: location.pathname, txt: document.body.innerText.slice(0, 120) }));
  log("during slow transition:", JSON.stringify(during));
  await page.waitForTimeout(6000);
  log("after slow transition:", page.url());
  await ctx.close();
}

await browser.close();
