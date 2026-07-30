import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const BASE = "http://localhost:3000";
const A = "sweep-trip-a";
const B = "sweep-trip-b";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-going.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
const log = (...a) => console.log(...a);

async function navState() {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Trip navigation"]');
    if (!nav) return { present: false };
    const links = [...nav.querySelectorAll("a")].map((a) => ({
      label: a.textContent.trim(),
      href: a.getAttribute("href"),
      current: a.getAttribute("aria-current") === "page",
      h: Math.round(a.getBoundingClientRect().height),
    }));
    return { present: true, links };
  });
}

async function pageTitleText() {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const h2 = document.querySelector("h2");
    return { docTitle: document.title, h1: h1?.textContent?.trim(), h2: h2?.textContent?.trim() };
  });
}

// 1. /trips index — multi-trip list
await page.goto(`${BASE}/trips`);
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/nav-01-trips-index.png`, fullPage: true });
log("== /trips ==", JSON.stringify(await pageTitleText()));
log("nav on /trips:", JSON.stringify(await navState()));
const tripLinks = await page.evaluate(() =>
  [...document.querySelectorAll("a")].map((a) => ({ t: a.textContent.trim().slice(0, 60), href: a.getAttribute("href") })).filter((l) => l.href?.includes("/trips/"))
);
log("trip links:", JSON.stringify(tripLinks, null, 1));

// 2. Trip A home
await page.goto(`${BASE}/trips/${A}`);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/nav-02-tripA-home.png`, fullPage: true });
log("== trip A home ==", JSON.stringify(await pageTitleText()));
log("nav:", JSON.stringify(await navState()));
// is there a way back to /trips or a trip switcher?
const headerLinks = await page.evaluate(() =>
  [...document.querySelectorAll("header a, header button")].map((el) => ({ tag: el.tagName, t: el.textContent.trim().slice(0, 40), href: el.getAttribute("href"), aria: el.getAttribute("aria-label") }))
);
log("header controls:", JSON.stringify(headerLinks, null, 1));

// 3. Visit each tab, record active state + page heading
for (const [tab, path] of [["plans", "itinerary"], ["posts", "announcements"], ["crew", "roster"], ["me", "me"]]) {
  await page.goto(`${BASE}/trips/${A}/${path}`);
  await page.waitForTimeout(1500);
  const ns = await navState();
  const tt = await pageTitleText();
  log(`== tab ${tab} (/${path}) ==`, JSON.stringify(tt), "active:", JSON.stringify(ns.links?.filter((l) => l.current)));
  await page.screenshot({ path: `${SHOTS}/nav-03-tab-${tab}.png`, fullPage: false });
}

// 4. Off-tab routes: expenses, arrivals, dates — which tab is active?
for (const path of ["expenses", "arrivals", "dates", "invites"]) {
  await page.goto(`${BASE}/trips/${A}/${path}`);
  await page.waitForTimeout(1500);
  const ns = await navState();
  const tt = await pageTitleText();
  log(`== off-tab /${path} ==`, JSON.stringify(tt), "active tabs:", JSON.stringify(ns.links?.filter((l) => l.current)), "nav present:", ns.present);
  await page.screenshot({ path: `${SHOTS}/nav-04-offtab-${path}.png`, fullPage: false });
}

// 5. Back-button behavior: home -> drill into itinerary -> back
await page.goto(`${BASE}/trips/${A}`);
await page.waitForTimeout(1500);
await page.click('nav[aria-label="Trip navigation"] a[href*="itinerary"]');
await page.waitForTimeout(1500);
log("after tab click url:", page.url());
await page.goBack();
await page.waitForTimeout(1200);
log("after back url:", page.url());

// 6. Multi-trip: navigate to trip B home directly, check nav keeps trip B context
await page.goto(`${BASE}/trips/${B}`);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/nav-05-tripB-home.png`, fullPage: true });
log("== trip B home ==", JSON.stringify(await pageTitleText()));
log("nav hrefs:", JSON.stringify((await navState()).links?.map((l) => l.href)));

// 7. Bad deep links: nonexistent trip, nonexistent subpage
await page.goto(`${BASE}/trips/not-a-real-trip`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/nav-06-bad-trip.png`, fullPage: true });
log("== bad trip ==", JSON.stringify(await pageTitleText()), page.url());
const bodyTxt = await page.evaluate(() => document.body.innerText.slice(0, 400));
log("bad trip body:", JSON.stringify(bodyTxt));

await page.goto(`${BASE}/trips/${A}/nonexistent-page`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/nav-07-bad-subpage.png`, fullPage: true });
log("== bad subpage ==", JSON.stringify(await page.evaluate(() => document.body.innerText.slice(0, 300))));

// 8. Scroll restoration: scroll down on itinerary, go to posts, come back via tab
await page.goto(`${BASE}/trips/${A}/itinerary`);
await page.waitForTimeout(1800);
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(400);
const s1 = await page.evaluate(() => window.scrollY);
await page.click('nav[aria-label="Trip navigation"] a[href*="announcements"]');
await page.waitForTimeout(1500);
await page.goBack();
await page.waitForTimeout(1500);
const s2 = await page.evaluate(() => window.scrollY);
log("scroll restore: before", s1, "after back", s2);

await browser.close();
