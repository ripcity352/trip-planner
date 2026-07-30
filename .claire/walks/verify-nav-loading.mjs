import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-going.json",
  viewport: { width: 375, height: 812 },
});
const page = await context.newPage();

// Load trip A home at full speed first
await page.goto("http://localhost:3000/trips/sweep-trip-a", { waitUntil: "domcontentloaded" });
await page.waitForSelector("nav[aria-label='Trip navigation']", { timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/verify-nav-00-home.png` });

// Throttle via CDP: 1.2s latency, 50KB/s
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 1200,
  downloadThroughput: 50 * 1024,
  uploadThroughput: 50 * 1024,
});

const crewTab = page.locator("nav[aria-label='Trip navigation'] a", { hasText: "crew" });

// Tap crew, then sample UI state at intervals
const t0 = Date.now();
await crewTab.click();

const samples = [];
for (const delay of [150, 400, 800, 1500, 3000, 6000, 10000]) {
  const elapsed = Date.now() - t0;
  if (elapsed < delay) await page.waitForTimeout(delay - elapsed);
  const state = await page.evaluate(() => {
    const active = document.querySelector("nav[aria-label='Trip navigation'] a[aria-current='page']");
    return {
      url: location.pathname,
      activeTab: active ? active.textContent.trim() : null,
      hasSpinnerOrSkeleton: !!document.querySelector("[class*='skeleton'],[class*='spinner'],[role='progressbar'],[aria-busy='true']"),
      h1: document.querySelector("h1")?.textContent?.trim()?.slice(0, 50) ?? null,
    };
  });
  samples.push({ ms: Date.now() - t0, ...state });
  await page.screenshot({ path: `${SHOTS}/verify-nav-t${String(delay).padStart(5, "0")}.png` });
  if (state.url.includes("/roster") && samples.length > 2) break;
}

console.log(JSON.stringify(samples, null, 2));
await browser.close();
