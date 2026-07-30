import { chromium } from "@playwright/test";
import fs from "node:fs";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const BASE = "http://localhost:3000";
const viewport = { width: 375, height: 812 };
const log = (...a) => console.log("[crew]", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: `${AUTH}/persona-sweep-founder.json`,
  viewport,
});
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGE ERR:", e.message));

const main = () => page.locator("main").first();
async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/crew-${name}.png`, fullPage: true });
  log("shot", name);
}

await page.goto(`${BASE}/trips/sweep-trip-a/invites`);
await page.waitForTimeout(1200);
log("INVITES PAGE >>>\n" + (await main().innerText()) + "\n<<<");
await shot("20-invites-initial");

// find the create CTA (the tall primary button that is NOT Copy link / Revoke)
const btnTexts = await page.locator("button").allInnerTexts();
log("buttons:", JSON.stringify(btnTexts));
const createCta = page.locator("button").filter({ hasText: /^(?!.*copy)(?!.*revoke).*link|invite/i }).last();
// simpler: pick by known M3 string patterns
let cta = null;
for (const t of btnTexts) {
  if (t && !/copy|revoke|account|dev/i.test(t) && /link|invite|crew|new/i.test(t)) { cta = t; break; }
}
log("create CTA text guess:", cta);
if (cta) {
  await page.locator("button", { hasText: cta }).first().click();
  await page.waitForTimeout(400);
  await shot("21-invite-form-open");
  log("form:", (await main().innerText()).replace(/\n/g, " | "));
}

const uses = page.locator("#invite-uses-left");
const expires = page.locator("#invite-expires-at");
const submit = page.locator('button[type="submit"]').last();

if (await uses.count()) {
  // invalid: 0
  await uses.fill("0");
  await submit.click();
  await page.waitForTimeout(600);
  log("uses=0:", (await page.locator("form").innerText()).replace(/\n/g, " | "));
  await shot("22-uses0");

  // invalid: past expiry
  await uses.fill("");
  await expires.fill("2020-01-01T00:00");
  await submit.click();
  await page.waitForTimeout(1500);
  log("past expiry:", (await main().innerText()).slice(0, 1500).replace(/\n/g, " | "));
  await shot("23-past-expiry");

  // valid: uses=1, no expiry (for landing test later); count invites before/after
  const before = await page.locator("main li").count();
  await expires.fill("");
  await uses.fill("1");
  await submit.click();
  await page.waitForTimeout(2000);
  const after = await page.locator("main li").count();
  log(`invites before=${before} after=${after}`);
  await shot("24-created");
  log("after create:", (await main().innerText()).slice(0, 2000).replace(/\n/g, " | "));

  // copy the newest invite's link. Which row is newest — first or last?
  // Click every Copy link and log clipboard for each to map ordering.
  const copies = page.getByRole("button", { name: /copy/i });
  const n = await copies.count();
  log("copy buttons:", n);
  const urls = [];
  for (let i = 0; i < n; i++) {
    await copies.nth(i).click();
    await page.waitForTimeout(250);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => "ERR " + e.message);
    urls.push(clip);
    log(`copy[${i}] ->`, clip);
  }
  fs.writeFileSync(`${SHOTS}/../crew-invite-urls.json`, JSON.stringify(urls, null, 2));
  await shot("25-after-copy");

  // Revoke: create a throwaway invite, then revoke it (two-step observe).
  const cta2 = page.locator("button", { hasText: cta }).first();
  if (await cta2.count()) { await cta2.click(); await page.waitForTimeout(300); }
  if (await uses.count()) {
    await uses.fill("5");
    await submit.click();
    await page.waitForTimeout(2000);
  }
  // revoke the row whose uses says 5 remaining
  const row5 = page.locator("main li").filter({ hasText: /5/ }).first();
  const rv = (await row5.count()) ? row5.getByRole("button", { name: /revoke/i }) : page.getByRole("button", { name: /revoke/i }).last();
  if (await rv.count()) {
    await rv.first().click();
    await page.waitForTimeout(400);
    await shot("26-revoke-tap1");
    log("revoke tap1:", (await main().innerText()).slice(0, 2000).replace(/\n/g, " | "));
    // look for confirm affordance
    const confirmBtn = page.getByRole("button", { name: /revoke|yes|confirm/i }).last();
    log("confirm candidates:", JSON.stringify(await page.getByRole("button", { name: /revoke|yes|confirm|keep/i }).allInnerTexts()));
    await confirmBtn.click();
    await page.waitForTimeout(1500);
    await shot("27-after-revoke");
    log("after revoke:", (await main().innerText()).slice(0, 2000).replace(/\n/g, " | "));
  }

  // persistence
  await page.reload();
  await page.waitForTimeout(1200);
  await shot("28-reload");
  log("reload:", (await main().innerText()).slice(0, 2000).replace(/\n/g, " | "));
}

await browser.close();
log("DONE");
