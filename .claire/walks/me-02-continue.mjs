import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const BASE = "http://localhost:3000";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-going.json";
const viewport = { width: 375, height: 812 };
const log = (...a) => console.log("[me-02]", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH, viewport });
const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message));

await page.goto(`${BASE}/trips/sweep-trip-a/me`);
await page.waitForSelector("h1");
await page.getByRole("button", { name: /edit/i }).first().click();
await page.waitForSelector('input[name="displayName"]');

const nameField = page.locator('input[name="displayName"]');
const phoneField = page.locator('input[name="phone"]');
const saveBtn = page.getByRole("button", { name: /save/i }).first();
const origName = await nameField.inputValue();
log("origName:", origName);

// Overlong name (fill directly)
await nameField.fill("X".repeat(200));
log("value len after fill:", (await nameField.inputValue()).length);
await saveBtn.click();
await page.waitForTimeout(600);
log("long-name errors:", await page.locator('[id]').filter({ hasText: /./ }).evaluateAll(els => els.filter(e => e.id.includes("error")).map(e => e.textContent)));
const panelText = await page.locator("form").first().innerText();
log("panel after long name >>>\n" + panelText + "\n<<<");
await page.screenshot({ path: `${SHOTS}/me-04-long-name.png`, fullPage: true });

// Invalid phone
await nameField.fill("[me] Goingster");
await phoneField.fill("not-a-phone");
await saveBtn.click();
await page.waitForTimeout(600);
log("bad-phone panel >>>\n" + await page.locator("form").first().innerText() + "\n<<<");
await page.screenshot({ path: `${SHOTS}/me-05-bad-phone.png`, fullPage: true });

// Valid save + rapid double click (idempotency / double-submit)
await phoneField.fill("");
await saveBtn.click();
await saveBtn.click().catch((e) => log("second click rejected:", e.message.split("\n")[0]));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/me-06-saved.png`, fullPage: true });

// Reload persistence
await page.reload();
await page.waitForSelector("h1");
log("name after reload:", await page.locator("dd").first().textContent());

// Roster propagation
await page.goto(`${BASE}/trips/sweep-trip-a/roster`);
await page.waitForSelector("h1");
const rosterText = await page.locator("body").innerText();
log("roster contains new name:", rosterText.includes("[me] Goingster"));
await page.screenshot({ path: `${SHOTS}/me-07-roster.png`, fullPage: true });

// Restore original name
await page.goto(`${BASE}/trips/sweep-trip-a/me`);
await page.waitForSelector("h1");
await page.getByRole("button", { name: /edit/i }).first().click();
await page.waitForSelector('input[name="displayName"]');
await page.locator('input[name="displayName"]').fill(origName);
await page.getByRole("button", { name: /save/i }).first().click();
await page.waitForTimeout(1500);
log("restored to:", origName);

// Day chips toggle
await page.reload();
await page.waitForSelector("button[aria-pressed]");
const chips = page.locator("button[aria-pressed]");
log("chips:", await chips.count());
const first = chips.first();
const before = await first.getAttribute("aria-pressed");
log("chip0 before:", before, "label:", (await first.innerText()).replace(/\n/g, " "));
await first.click();
await page.waitForFunction(
  (prev) => document.querySelector("button[aria-pressed]")?.getAttribute("aria-pressed") !== prev,
  before, { timeout: 6000 }
).catch(() => log("WARN chip state did not flip"));
log("chip0 after click:", await first.getAttribute("aria-pressed"));
await page.screenshot({ path: `${SHOTS}/me-08-chip-toggled.png`, fullPage: true });
await page.reload();
await page.waitForSelector("button[aria-pressed]");
const persisted = await page.locator("button[aria-pressed]").first().getAttribute("aria-pressed");
log("chip0 after reload:", persisted);
if (persisted !== before) {
  await page.locator("button[aria-pressed]").first().click();
  await page.waitForTimeout(1200);
  log("toggled back");
}

await browser.close();
log("DONE");
