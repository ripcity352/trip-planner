// [expqa] Expenses functional walk — founder persona
import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const URL = "http://localhost:3000/trips/sweep-trip-a/expenses";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-founder.json";

const log = (...a) => console.log("[expqa]", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") log("CONSOLE ERROR:", m.text());
});

await page.goto(URL);
await page.getByText("Who paid for what").waitFor({ timeout: 15000 });
await page.screenshot({ path: `${SHOTS}/expqa-01-founder-baseline.png`, fullPage: true });

// Dump baseline expenses + totals
const baseline = await page.evaluate(() => document.body.innerText);
log("BASELINE PAGE TEXT >>>\n" + baseline + "\n<<<");

// --- Open add form ---
await page.getByRole("button", { name: "Log a spend" }).click();
await page.getByText("Who's splitting it?").waitFor();
await page.screenshot({ path: `${SHOTS}/expqa-02-add-form-chips.png`, fullPage: true });

// Chip pre-selection state
const chips = await page.$$eval("fieldset button[aria-pressed]", (btns) =>
  btns.map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute("aria-pressed") }))
);
log("SPLIT CHIPS:", JSON.stringify(chips, null, 2));

// --- Empty submit ---
await page.getByRole("button", { name: "Log it" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/expqa-03-empty-submit-errors.png`, fullPage: true });
const emptyErrs = await page.$$eval('[role="alert"]', (els) => els.map((e) => e.textContent.trim()));
log("EMPTY-SUBMIT ERRORS:", JSON.stringify(emptyErrs));

// --- Invalid amount ---
await page.fill("#expense-description", "[expqa] bad amount test");
await page.fill("#expense-amount", "abc");
await page.getByRole("button", { name: "Log it" }).click();
await page.waitForTimeout(500);
log("INVALID-AMOUNT ERRORS:", JSON.stringify(await page.$$eval('[role="alert"]', (els) => els.map((e) => e.textContent.trim()))));
await page.fill("#expense-amount", "0");
await page.getByRole("button", { name: "Log it" }).click();
await page.waitForTimeout(500);
log("ZERO-AMOUNT ERRORS:", JSON.stringify(await page.$$eval('[role="alert"]', (els) => els.map((e) => e.textContent.trim()))));
await page.screenshot({ path: `${SHOTS}/expqa-04-invalid-amount.png`, fullPage: true });

// --- Zero-participant submit: unselect all chips ---
const pressedChips = await page.$$("fieldset button[aria-pressed='true']");
for (const c of pressedChips) await c.click();
await page.fill("#expense-amount", "60");
await page.getByRole("button", { name: "Log it" }).click();
await page.waitForTimeout(600);
log("NO-SPLIT ERRORS:", JSON.stringify(await page.$$eval('[role="alert"]', (els) => els.map((e) => e.textContent.trim()))));
await page.screenshot({ path: `${SHOTS}/expqa-05-no-split-selected.png`, fullPage: true });

// --- Valid add: $61.13 across default (going+maybe) selection ---
// re-select defaults: click every unpressed chip whose text lacks "not coming"/"hasn't said"
const allChips = await page.$$("fieldset button[aria-pressed]");
let selectedNames = [];
for (const c of allChips) {
  const txt = (await c.textContent()).trim();
  const pressed = (await c.getAttribute("aria-pressed")) === "true";
  const shouldSelect = !txt.includes("not coming") && !txt.includes("hasn't said");
  if (shouldSelect !== pressed) await c.click();
  if (shouldSelect) selectedNames.push(txt);
}
log("SELECTED FOR SPLIT:", JSON.stringify(selectedNames));
await page.fill("#expense-description", "[expqa] founder taco run");
await page.fill("#expense-amount", "61.13");
await page.getByRole("button", { name: "Log it" }).click();
await page.getByText("[expqa] founder taco run").waitFor({ timeout: 10000 });
await page.screenshot({ path: `${SHOTS}/expqa-06-added-6113.png`, fullPage: true });
log("AFTER ADD >>>\n" + (await page.evaluate(() => document.body.innerText)) + "\n<<<");

// --- Persistence: reload ---
await page.reload();
await page.getByText("[expqa] founder taco run").waitFor({ timeout: 10000 });
log("persisted after reload: OK");

// --- Double-submit race: add expense, click Log it twice fast ---
await page.getByRole("button", { name: "Log a spend" }).click();
await page.getByText("Who's splitting it?").waitFor();
await page.fill("#expense-description", "[expqa] double tap");
await page.fill("#expense-amount", "10");
const submitBtn = page.getByRole("button", { name: "Log it" });
await Promise.all([submitBtn.click(), submitBtn.click({ force: true }).catch(() => {})]);
await page.waitForTimeout(2500);
await page.reload();
await page.getByText("Who paid for what").waitFor();
const dblCount = await page.getByText("[expqa] double tap").count();
log("DOUBLE-TAP expense count after reload:", dblCount);
await page.screenshot({ path: `${SHOTS}/expqa-07-double-tap.png`, fullPage: true });

await browser.close();
log("DONE");
