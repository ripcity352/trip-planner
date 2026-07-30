import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const BASE = "http://localhost:3000";
const viewport = { width: 375, height: 812 };
const log = (...a) => console.log("[crew]", ...a);
const LIVE_TOKEN = "2525f028-aab2-4dca-b938-ba1206e258dc";

const browser = await chromium.launch();

async function persona(name, fn) {
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-${name}.json`, viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(name, "PAGE ERR:", e.message));
  try { await fn(page, ctx); } finally { await ctx.close(); }
}

// ---------- founder: commit a role flip + flip back (persistence) ----------
await persona("founder", async (page) => {
  await page.goto(`${BASE}/trips/sweep-trip-a/roster`);
  await page.waitForSelector('button[aria-label="Manage Sweep Member Late"]', { timeout: 15000 });
  // overflow check
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
  }));
  log("founder roster overflow:", JSON.stringify(overflow));
  await page.locator('button[aria-label="Manage Sweep Member Late"]').click();
  const flip = page.locator("li").filter({ hasText: "Sweep Member Late" }).locator("button", { hasText: "Make co-organizer" });
  await flip.click();
  await page.waitForSelector('li:has-text("Sweep Member Late") >> text=Co-Organizer', { timeout: 10000 });
  await page.screenshot({ path: `${SHOTS}/crew-30-late-now-co.png`, fullPage: true });
  log("role flip committed + rendered");
  // reload persistence
  await page.reload();
  await page.waitForSelector('li:has-text("Sweep Member Late") >> text=Co-Organizer', { timeout: 10000 });
  log("role persisted after reload");
  // flip back
  await page.locator('button[aria-label="Manage Sweep Member Late"]').click();
  await page.locator("li").filter({ hasText: "Sweep Member Late" }).locator("button", { hasText: "Back to crew" }).click();
  await page.waitForTimeout(1500);
  const row = await page.locator("li").filter({ hasText: "Sweep Member Late" }).first().innerText();
  log("after flip back:", row.replace(/\n/g, " | "));
  await page.screenshot({ path: `${SHOTS}/crew-31-late-back.png`, fullPage: true });
});

// ---------- member-going ----------
await persona("member-going", async (page) => {
  await page.goto(`${BASE}/trips/sweep-trip-a/roster`);
  await page.waitForSelector("text=Who's coming", { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/crew-32-membergoing-roster.png`, fullPage: true });
  log("member-going roster >>>\n" + (await page.locator("main").first().innerText()) + "\n<<<");
  const manage = await page.locator("li button[aria-label]").count();
  log("member-going manage buttons:", manage);
  const inviteCta = await page.locator('a:has-text("Add to the crew")').count();
  log("member-going invite CTA:", inviteCta);
  // direct nav to invites — expect 404
  const resp = await page.goto(`${BASE}/trips/sweep-trip-a/invites`);
  await page.waitForTimeout(600);
  log("member-going /invites status:", resp?.status());
  await page.screenshot({ path: `${SHOTS}/crew-33-membergoing-invites-404.png`, fullPage: true });
});

// ---------- member-pending ----------
await persona("member-pending", async (page) => {
  await page.goto(`${BASE}/trips/sweep-trip-a/roster`);
  await page.waitForSelector("text=Who's coming", { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/crew-34-memberpending-roster.png`, fullPage: true });
  log("member-pending roster >>>\n" + (await page.locator("main").first().innerText()) + "\n<<<");
});

// ---------- logged-out invite landing ----------
{
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/invite/${LIVE_TOKEN}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/crew-35-invite-landing-loggedout.png`, fullPage: true });
  log("landing >>>\n" + (await page.locator("body").innerText()).slice(0, 2500) + "\n<<<");
  // bogus token
  await page.goto(`${BASE}/invite/not-a-real-token`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/crew-36-invite-bogus-token.png`, fullPage: true });
  log("bogus landing >>>\n" + (await page.locator("body").innerText()).slice(0, 1500) + "\n<<<");
  await ctx.close();
}

await browser.close();
log("DONE");
