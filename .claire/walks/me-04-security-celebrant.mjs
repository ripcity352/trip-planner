import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const BASE = "http://localhost:3000";
const AUTH_DIR = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const viewport = { width: 375, height: 812 };
const log = (...a) => console.log("[me-04]", ...a);

const browser = await chromium.launch();

// ---- 1. member-going: security page validation ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/persona-sweep-member-going.json`, viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log("PAGEERROR:", e.message));
  await page.goto(`${BASE}/account/sign-in-and-security`);
  await page.waitForSelector("h1");
  await page.screenshot({ path: `${SHOTS}/me-09-security.png`, fullPage: true });
  log("security text >>>\n" + await page.locator("section").first().innerText() + "\n<<<");

  // empty submit
  await page.getByTestId("change-password-button").click();
  await page.waitForTimeout(500);
  log("empty-submit error:", await page.locator("#security-error").textContent().catch(() => "(none)"));
  await page.screenshot({ path: `${SHOTS}/me-10-security-empty.png`, fullPage: true });

  // short new password
  await page.getByTestId("current-password-input").fill("Sweep-e2e-123");
  await page.getByTestId("new-password-input").fill("abc");
  await page.getByTestId("change-password-button").click();
  await page.waitForTimeout(500);
  log("short-pw error:", await page.locator("#security-error").textContent().catch(() => "(none)"));
  await page.screenshot({ path: `${SHOTS}/me-11-security-short.png`, fullPage: true });

  // wrong current password
  await page.getByTestId("current-password-input").fill("Wrong-pass-999");
  await page.getByTestId("new-password-input").fill("Another-valid-123");
  await page.getByTestId("change-password-button").click();
  await page.waitForTimeout(4000);
  log("wrong-current error:", await page.locator("#security-error").textContent().catch(() => "(none)"));
  await page.screenshot({ path: `${SHOTS}/me-12-security-wrongcurrent.png`, fullPage: true });

  // back navigation affordance?
  log("security page links:", JSON.stringify(await page.locator("a:visible").allInnerTexts()));
  log("nav visible?", await page.locator("nav").count());
  await ctx.close();
}

// ---- 2. cross-persona name propagation: member-going renames, celebrant checks roster ----
{
  const ctxA = await browser.newContext({ storageState: `${AUTH_DIR}/persona-sweep-member-going.json`, viewport });
  const pA = await ctxA.newPage();
  await pA.goto(`${BASE}/trips/sweep-trip-a/me`);
  await pA.waitForSelector("h1");
  await pA.getByRole("button", { name: /edit/i }).first().click();
  await pA.waitForSelector('input[name="displayName"]');
  await pA.locator('input[name="displayName"]').fill("[me] Propagation Check");
  await pA.getByRole("button", { name: /save/i }).first().click();
  await pA.waitForTimeout(1500);

  const ctxB = await browser.newContext({ storageState: `${AUTH_DIR}/persona-sweep-celebrant.json`, viewport });
  const pB = await ctxB.newPage();
  await pB.goto(`${BASE}/trips/sweep-trip-a/roster`);
  await pB.waitForSelector("h1");
  const rb = await pB.locator("body").innerText();
  log("celebrant roster shows renamed member:", rb.includes("[me] Propagation Check"));
  await pB.screenshot({ path: `${SHOTS}/me-13-roster-propagation.png`, fullPage: true });

  // celebrant /me view
  await pB.goto(`${BASE}/trips/sweep-trip-a/me`);
  await pB.waitForSelector("h1");
  log("celebrant /me >>>\n" + await pB.locator("section").first().innerText() + "\n<<<");
  await pB.screenshot({ path: `${SHOTS}/me-14-celebrant-me.png`, fullPage: true });
  await ctxB.close();

  // restore
  await pA.reload();
  await pA.waitForSelector("h1");
  await pA.getByRole("button", { name: /edit/i }).first().click();
  await pA.waitForSelector('input[name="displayName"]');
  await pA.locator('input[name="displayName"]').fill("Sweep Member Going");
  await pA.getByRole("button", { name: /save/i }).first().click();
  await pA.waitForTimeout(1500);
  await pA.reload();
  log("restored name:", await pA.locator("dd").first().textContent());
  await ctxA.close();
}

// ---- 3. member-late: sign out flow ----
{
  const ctx = await browser.newContext({ storageState: `${AUTH_DIR}/persona-sweep-member-late.json`, viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/trips/sweep-trip-a/me`);
  await page.waitForSelector("h1");
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(/login|^http:\/\/localhost:3000\/$/, { timeout: 10000 }).catch(() => log("no redirect after sign out; url =", page.url()));
  log("after sign-out url:", page.url());
  await page.screenshot({ path: `${SHOTS}/me-15-signed-out.png`, fullPage: true });
  // try to go back to authed page
  await page.goto(`${BASE}/trips/sweep-trip-a/me`);
  await page.waitForTimeout(1500);
  log("re-visit authed page after signout ->", page.url());
  await ctx.close();
}

await browser.close();
log("DONE");
