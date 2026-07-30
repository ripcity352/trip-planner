// [expqa] Part 2: double-tap verify, edit/delete (founder), member-going + member-no views
import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const URL = "http://localhost:3000/trips/sweep-trip-a/expenses";
const AUTH_DIR = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const log = (...a) => console.log("[expqa]", ...a);

const browser = await chromium.launch();

async function open(persona) {
  const ctx = await browser.newContext({
    storageState: `${AUTH_DIR}/persona-sweep-${persona}.json`,
    viewport: { width: 375, height: 812 },
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.getByText("Who paid for what").waitFor({ timeout: 15000 });
  return { ctx, page };
}

// ---------- FOUNDER: double-tap verify + edit + delete ----------
{
  const { ctx, page } = await open("founder");
  const dbl = await page.getByText("[expqa] double tap").count();
  log("double-tap rows present:", dbl);

  // EDIT the taco run: find its Edit button (last card with our text)
  const tacoCard = page.locator("li", { hasText: "[expqa] founder taco run" });
  await tacoCard.getByRole("button", { name: "Edit" }).click();
  await page.getByText("Who's splitting it?").waitFor();
  await page.screenshot({ path: `${SHOTS}/expqa-08-edit-sheet.png`, fullPage: true });
  // chip state in edit
  const chips = await page.$$eval("fieldset button[aria-pressed]", (btns) =>
    btns.map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute("aria-pressed") }))
  );
  log("EDIT CHIPS:", JSON.stringify(chips));
  // change amount to 100, drop one member (Sweep Member Late)
  await page.fill("#expense-amount-edit", "100").catch(async () => {
    // fallback: find amount input by label
    const amt = page.locator("input").filter({ has: page.locator(":scope") });
    const el = await page.getByLabel(/How much/).first();
    await el.fill("100");
  });
  const lateChip = page.locator("fieldset button", { hasText: "Sweep Member Late" });
  if ((await lateChip.getAttribute("aria-pressed")) === "true") await lateChip.click();
  await page.getByRole("button", { name: "Save it" }).click();
  await page.waitForTimeout(2000);
  await page.reload();
  await page.getByText("Who paid for what").waitFor();
  log("AFTER EDIT >>>\n" + (await page.evaluate(() => document.body.innerText)) + "\n<<<");
  await page.screenshot({ path: `${SHOTS}/expqa-09-after-edit.png`, fullPage: true });

  // DELETE the double-tap expense(s) I created
  while ((await page.getByText("[expqa] double tap").count()) > 0) {
    const card = page.locator("li", { hasText: "[expqa] double tap" }).first();
    await card.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Delete" }).first().waitFor();
    await page.screenshot({ path: `${SHOTS}/expqa-10-delete-step1.png`, fullPage: true });
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/expqa-11-delete-confirm.png`, fullPage: true });
    // confirm copy
    const confirmBtn = page.getByRole("button", { name: /Take this off the tab/ });
    if (await confirmBtn.count()) await confirmBtn.click();
    else await page.getByRole("button", { name: "Delete" }).first().click();
    await page.waitForTimeout(1500);
    await page.reload();
    await page.getByText("Who paid for what").waitFor();
  }
  log("double-tap rows after delete:", await page.getByText("[expqa] double tap").count());
  await ctx.close();
}

// ---------- MEMBER-GOING ----------
{
  const { ctx, page } = await open("member-going");
  await page.screenshot({ path: `${SHOTS}/expqa-12-member-going.png`, fullPage: true });
  const txt = await page.evaluate(() => document.body.innerText);
  log("MEMBER-GOING VIEW >>>\n" + txt + "\n<<<");
  log("member-going sees Edit buttons:", await page.getByRole("button", { name: "Edit" }).count());
  // add own expense
  await page.getByRole("button", { name: "Log a spend" }).click();
  await page.getByText("Who's splitting it?").waitFor();
  await page.fill("#expense-description", "[expqa] member gas money");
  await page.fill("#expense-amount", "45.50");
  // visibility select present?
  log("member-going visibility select count:", await page.locator("#expense-visibility").count());
  if (await page.locator("#expense-visibility").count()) {
    const opts = await page.$$eval("#expense-visibility option", (o) => o.map((x) => x.textContent));
    log("member-going visibility options:", JSON.stringify(opts));
  }
  await page.getByRole("button", { name: "Log it" }).click();
  await page.getByText("[expqa] member gas money").waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${SHOTS}/expqa-13-member-added.png`, fullPage: true });
  // member sees Edit only on own expense?
  log("member-going Edit count after own add:", await page.getByRole("button", { name: "Edit" }).count());
  await ctx.close();
}

// ---------- MEMBER-NO (declined) ----------
{
  const { ctx, page } = await open("member-declined").catch(() => null) ?? {};
  if (page) {
    const txt = await page.evaluate(() => document.body.innerText);
    log("MEMBER-NO VIEW >>>\n" + txt + "\n<<<");
    await page.screenshot({ path: `${SHOTS}/expqa-14-member-no.png`, fullPage: true });
    // open add form to see chip defaults from a declined member's perspective
    await page.getByRole("button", { name: "Log a spend" }).click();
    await page.getByText("Who's splitting it?").waitFor();
    const chips = await page.$$eval("fieldset button[aria-pressed]", (btns) =>
      btns.map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute("aria-pressed") }))
    );
    log("MEMBER-NO ADD-FORM CHIPS:", JSON.stringify(chips, null, 2));
    await page.screenshot({ path: `${SHOTS}/expqa-15-member-no-chips.png`, fullPage: true });
    await ctx.close();
  }
}

await browser.close();
log("DONE");
