import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const BASE = "http://localhost:3000";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-going.json";
const viewport = { width: 375, height: 812 };
const log = (...a) => console.log("[me-03]", ...a);
const ORIG = "Sweep Member Going";

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH, viewport });
const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message));

async function openEditor() {
  await page.goto(`${BASE}/trips/sweep-trip-a/me`);
  await page.waitForSelector("h1");
  await page.getByRole("button", { name: /edit/i }).first().click();
  await page.waitForSelector('input[name="displayName"]');
}
async function save() {
  await page.getByRole("button", { name: /save/i }).first().click();
}

// A. Set name to prefixed test value + verify propagation
await openEditor();
await page.locator('input[name="displayName"]').fill("[me] Goingster");
await save();
await page.waitForSelector('input[name="displayName"]', { state: "detached", timeout: 8000 }).catch(() => log("panel did not close after save"));
await page.reload();
await page.waitForSelector("h1");
log("name after save+reload:", await page.locator("dd").first().textContent());

await page.goto(`${BASE}/trips/sweep-trip-a/roster`);
await page.waitForSelector("h1");
const rosterBody = await page.locator("body").innerText();
log("roster shows new name:", rosterBody.includes("[me] Goingster"));
await page.screenshot({ path: `${SHOTS}/me-07-roster.png`, fullPage: true });

// B. invalid phone (panel stays open on client-validation failure)
await openEditor();
await page.locator('input[name="phone"]').fill("not-a-phone");
await save();
await page.waitForTimeout(600);
log("bad-phone form text >>>\n" + await page.locator("form").filter({ has: page.locator('input[name="phone"]') }).innerText() + "\n<<<");
await page.screenshot({ path: `${SHOTS}/me-05-bad-phone.png`, fullPage: true });

// C. valid phone normalizes?
await page.locator('input[name="phone"]').fill("415 555 1212");
await save();
await page.waitForTimeout(1500);
const meText = await page.locator("section").first().innerText();
log("profile after phone save >>>\n" + meText + "\n<<<");
await page.screenshot({ path: `${SHOTS}/me-06b-phone-saved.png`, fullPage: true });

// D. clear phone + restore name
await page.getByRole("button", { name: /edit/i }).first().click();
await page.waitForSelector('input[name="displayName"]');
await page.locator('input[name="displayName"]').fill(ORIG);
await page.locator('input[name="phone"]').fill("");
await save();
await page.waitForTimeout(1500);
await page.reload();
await page.waitForSelector("h1");
log("restored profile:", (await page.locator("dl").innerText()).replace(/\n/g, " | "));

// E. Day chips toggle + persistence
const chips = page.locator("button[aria-pressed]");
await page.waitForSelector("button[aria-pressed]");
const before = await chips.first().getAttribute("aria-pressed");
log("chip0 before:", before);
await chips.first().click();
await page.waitForFunction(
  (prev) => document.querySelector("button[aria-pressed]")?.getAttribute("aria-pressed") !== prev,
  before, { timeout: 6000 }
).catch(() => log("WARN chip state did not flip"));
log("chip0 after click:", await chips.first().getAttribute("aria-pressed"));
await page.screenshot({ path: `${SHOTS}/me-08-chip-toggled.png`, fullPage: true });
await page.reload();
await page.waitForSelector("button[aria-pressed]");
const persisted = await page.locator("button[aria-pressed]").first().getAttribute("aria-pressed");
log("chip0 after reload:", persisted, persisted !== before ? "(persisted)" : "(NOT persisted)");
if (persisted !== before) {
  await page.locator("button[aria-pressed]").first().click();
  await page.waitForTimeout(1500);
  log("toggled back; now:", await page.locator("button[aria-pressed]").first().getAttribute("aria-pressed"));
}

await browser.close();
log("DONE");
