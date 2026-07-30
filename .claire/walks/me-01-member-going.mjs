import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const BASE = "http://localhost:3000";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-going.json";
const viewport = { width: 375, height: 812 };

const log = (...a) => console.log("[me-01]", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH, viewport });
const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") log("CONSOLE-ERR:", m.text().slice(0, 200)); });

// 1. /me page
await page.goto(`${BASE}/trips/sweep-trip-a/me`);
await page.waitForSelector("h1");
await page.screenshot({ path: `${SHOTS}/me-01-profile.png`, fullPage: true });
log("h1:", await page.locator("h1").first().textContent());
const bodyText = await page.locator("section").first().innerText();
log("PAGE TEXT >>>\n" + bodyText + "\n<<<");

// 2. Open editor
const editBtn = page.getByRole("button", { name: /edit/i }).first();
await editBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/me-02-editor-open.png`, fullPage: true });

// find inputs
const nameInput = page.locator("input").filter({ hasNot: page.locator("[type=hidden]") }).first();
const inputs = page.locator("form input:visible");
log("visible inputs in editor:", await inputs.count());
for (let i = 0; i < await inputs.count(); i++) {
  log("input", i, await inputs.nth(i).getAttribute("name"), await inputs.nth(i).inputValue());
}

// 3. Empty-name submit
const nameField = page.locator('input[name="displayName"]');
const phoneField = page.locator('input[name="phone"]');
const origName = await nameField.inputValue();
log("origName:", origName);
await nameField.fill("");
const saveBtn = page.getByRole("button", { name: /save/i }).first();
await saveBtn.click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/me-03-empty-name.png`, fullPage: true });
log("after empty-name submit, errors visible:", await page.locator('[role="alert"], .text-destructive, p').allInnerTexts().then(t => t.filter(x => x && x.length < 120).join(" | ")));

// 4. Overlong name
await nameField.fill("X".repeat(200));
await saveBtn.click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/me-04-long-name.png`, fullPage: true });

// 5. Invalid phone
await nameField.fill("[me] Goingster");
await phoneField.fill("not-a-phone");
await saveBtn.click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/me-05-bad-phone.png`, fullPage: true });

// 6. Valid save
await phoneField.fill("");
await saveBtn.click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/me-06-saved.png`, fullPage: true });

// 7. Reload persistence
await page.reload();
await page.waitForSelector("h1");
const afterReload = await page.locator("dd").first().textContent();
log("name after reload:", afterReload);

// 8. Roster propagation
await page.goto(`${BASE}/trips/sweep-trip-a/roster`);
await page.waitForSelector("h1");
const rosterText = await page.locator("body").innerText();
log("roster contains new name:", rosterText.includes("[me] Goingster"));
await page.screenshot({ path: `${SHOTS}/me-07-roster.png`, fullPage: true });

// 9. Restore original name
await page.goto(`${BASE}/trips/sweep-trip-a/me`);
await page.waitForSelector("h1");
await page.getByRole("button", { name: /edit/i }).first().click();
await page.locator('input[name="displayName"]').fill(origName);
await page.getByRole("button", { name: /save/i }).first().click();
await page.waitForTimeout(1200);
log("restored name to:", origName);

// 10. Day chips: toggle first chip
await page.reload();
await page.waitForSelector("h1");
const chips = page.locator("button[aria-pressed]");
const chipCount = await chips.count();
log("day chips count:", chipCount);
if (chipCount > 0) {
  const first = chips.first();
  const before = await first.getAttribute("aria-pressed");
  const label = await first.innerText();
  log("chip0 label:", JSON.stringify(label), "pressed:", before);
  await first.click();
  await page.waitForFunction(
    (prev) => document.querySelector("button[aria-pressed]")?.getAttribute("aria-pressed") !== prev,
    before, { timeout: 5000 }
  ).catch(() => log("chip aria-pressed did not change"));
  const after = await first.getAttribute("aria-pressed");
  log("chip0 pressed after click:", after);
  await page.screenshot({ path: `${SHOTS}/me-08-chip-toggled.png`, fullPage: true });
  await page.reload();
  await page.waitForSelector("button[aria-pressed]");
  const persisted = await page.locator("button[aria-pressed]").first().getAttribute("aria-pressed");
  log("chip0 pressed after reload:", persisted);
  // toggle back
  if (persisted !== before) {
    await page.locator("button[aria-pressed]").first().click();
    await page.waitForTimeout(1000);
    log("toggled chip back");
  }
}

// 11. Sign-in & security page
await page.goto(`${BASE}/account/sign-in-and-security`);
await page.waitForSelector("h1");
await page.screenshot({ path: `${SHOTS}/me-09-security.png`, fullPage: true });
log("security page text >>>\n" + await page.locator("section").first().innerText() + "\n<<<");

// 11a. empty submit
await page.getByTestId("change-password-button").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/me-10-security-empty.png`, fullPage: true });
log("empty-submit error:", await page.locator("#security-error").textContent().catch(() => "(none)"));

// 11b. short new password
await page.getByTestId("current-password-input").fill("Sweep-e2e-123");
await page.getByTestId("new-password-input").fill("abc");
await page.getByTestId("change-password-button").click();
await page.waitForTimeout(500);
log("short-pw error:", await page.locator("#security-error").textContent().catch(() => "(none)"));
await page.screenshot({ path: `${SHOTS}/me-11-security-short.png`, fullPage: true });

// 11c. wrong current password
await page.getByTestId("current-password-input").fill("Wrong-pass-999");
await page.getByTestId("new-password-input").fill("Another-valid-123");
await page.getByTestId("change-password-button").click();
await page.waitForTimeout(3000);
log("wrong-current error:", await page.locator("#security-error").textContent().catch(() => "(none)"));
await page.screenshot({ path: `${SHOTS}/me-12-security-wrongcurrent.png`, fullPage: true });

// 12. Is there a back link from security page?
const links = await page.locator("a").allInnerTexts();
log("links on security page:", JSON.stringify(links));

await browser.close();
log("DONE");
