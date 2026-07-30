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
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") log("CONSOLE ERR:", m.text()); });
page.on("pageerror", (e) => log("PAGE ERR:", e.message));

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/crew-${name}.png`, fullPage: true });
  log("shot", name);
}

// ---------- 1. Roster page as founder ----------
await page.goto(`${BASE}/trips/sweep-trip-a/roster`);
await page.waitForSelector("text=Crew", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(800);
await shot("01-founder-roster");
const rosterText = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
log("ROSTER TEXT >>>\n" + rosterText + "\n<<<");

// count manage buttons
const manageBtns = page.locator('button[aria-label*="anage"], button[aria-label*="Manage"]');
log("manage buttons:", await manageBtns.count());
const allBtns = await page.locator("button").allInnerTexts();
log("buttons:", JSON.stringify(allBtns));
const ariaLabels = await page.locator("button[aria-label]").evaluateAll(els => els.map(e => e.getAttribute("aria-label")));
log("aria-labels:", JSON.stringify(ariaLabels));

// ---------- 2. Open manage on member-maybe's row, flip role ----------
// find the row containing "maybe" persona name. Names unknown — dump rows.
const rows = page.locator("ul > li");
const rowCount = await rows.count();
for (let i = 0; i < rowCount; i++) log(`row[${i}]:`, (await rows.nth(i).innerText()).replace(/\n/g, " | "));

// use aria-labels to find a manageable row (manage button exists)
const manageCount = await page.locator("li button[aria-label]").count();
log("row manage buttons:", manageCount);

// Pick the manage button on a plain attendee row (not celebrant) — use first li that has a manage button and no "roster chips". We'll open each and log the panel.
if (manageCount > 0) {
  const firstManage = page.locator("li button[aria-label]").first();
  const label = await firstManage.getAttribute("aria-label");
  log("opening manage:", label);
  await firstManage.click();
  await page.waitForTimeout(400);
  await shot("02-founder-manage-open");
  const panelBtns = await page.locator("li button").allInnerTexts();
  log("panel buttons:", JSON.stringify(panelBtns));

  // Role flip: click "Make co-organizer" if present
  const makeCo = page.getByRole("button", { name: /co-organizer/i }).first();
  if (await makeCo.count()) {
    const txt = await makeCo.innerText();
    log("role flip button text:", txt);
    await makeCo.click();
    await page.waitForTimeout(1500);
    await shot("03-founder-after-roleflip");
    log("after flip text:", (await page.locator("main").innerText()).slice(0, 1500));
    // flip back: reopen manage on same member
    const label2 = label;
    const btn2 = page.locator(`li button[aria-label="${label2}"]`);
    if (await btn2.count()) {
      await btn2.click();
      await page.waitForTimeout(300);
      const backBtn = page.getByRole("button", { name: /back to crew|co-organizer/i }).first();
      const backTxt = await backBtn.innerText();
      log("flip-back button:", backTxt);
      await backBtn.click();
      await page.waitForTimeout(1500);
      await shot("04-founder-after-flipback");
    } else {
      log("WARN: could not find manage button again after flip");
      await shot("04-founder-flipback-missing");
    }
  }
}

// ---------- 3. Arm remove (do NOT commit) ----------
const manage2 = page.locator("li button[aria-label]").first();
if (await manage2.count()) {
  await manage2.click();
  await page.waitForTimeout(300);
  const removeBtn = page.getByRole("button", { name: /remove/i }).first();
  if (await removeBtn.count()) {
    await removeBtn.click(); // arm only
    await page.waitForTimeout(300);
    await shot("05-founder-remove-armed");
    log("armed confirm:", await page.locator("li").filter({ has: removeBtn }).innerText().catch(() => "n/a"));
    // close without committing
    await page.getByRole("button", { name: /close|cancel|never mind/i }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

// ---------- 4. Celebrant reassign (two-step) on celebrant row: clear-mode check ----------
// Find celebrant row (has celebrant chip). Dump for evidence, open its manage.
const celebRow = page.locator("li").filter({ hasText: /guest of honor|celebrant|honoree/i }).first();
if (await celebRow.count()) {
  log("celebrant row:", (await celebRow.innerText()).replace(/\n/g, " | "));
  const celebManage = celebRow.locator("button[aria-label]").first();
  if (await celebManage.count()) {
    await celebManage.click();
    await page.waitForTimeout(300);
    await shot("06-founder-celebrant-clearmode");
    log("celebrant panel:", (await celebRow.innerText()).replace(/\n/g, " | "));
    // arm the clear (two-step, don't commit second)
    const clearBtn = celebRow.locator("button").filter({ hasText: /crew|back/i }).first();
    if (await clearBtn.count()) {
      await clearBtn.click();
      await page.waitForTimeout(300);
      await shot("07-founder-celebrant-clear-armed");
      log("clear armed:", (await celebRow.innerText()).replace(/\n/g, " | "));
    }
    await celebRow.getByRole("button", { name: /close/i }).click().catch(() => {});
  } else {
    log("NOTE: no manage affordance on celebrant row");
  }
}

// Reassign path: open manage on a NON-celebrant row and arm "this trip's for them"
const plainRow = page.locator("li").filter({ hasText: /Maybe|Invited/i }).first();
if (await plainRow.count()) {
  const pm = plainRow.locator("button[aria-label]").first();
  if (await pm.count()) {
    await pm.click();
    await page.waitForTimeout(300);
    const celebrateBtn = plainRow.locator("button").filter({ hasText: /for them|celebrant|honor/i }).first();
    if (await celebrateBtn.count()) {
      log("assign button:", await celebrateBtn.innerText());
      await celebrateBtn.click(); // arms (someone holds the seat)
      await page.waitForTimeout(300);
      await shot("08-founder-celebrant-reassign-armed");
      log("reassign armed:", (await plainRow.innerText()).replace(/\n/g, " | "));
    } else {
      log("no celebrant-assign button in panel");
    }
    await plainRow.getByRole("button", { name: /close/i }).click().catch(() => {});
  }
}

// ---------- 5. Invites page ----------
await page.goto(`${BASE}/trips/sweep-trip-a/invites`);
await page.waitForTimeout(1200);
await shot("09-founder-invites");
log("INVITES TEXT >>>\n" + (await page.locator("main").innerText().catch(() => "n/a")) + "\n<<<");

// open create form if behind a toggle
const newBtn = page.getByRole("button", { name: /new|create|mint|link/i }).first();
if (await newBtn.count()) {
  log("create toggle:", await newBtn.innerText());
  await newBtn.click();
  await page.waitForTimeout(400);
  await shot("10-founder-invite-form");
}

// invalid input: usesLeft = 0
const uses = page.locator("#invite-uses-left");
if (await uses.count()) {
  await uses.fill("0");
  const submit = page.locator('button[type="submit"]').last();
  await submit.click();
  await page.waitForTimeout(600);
  await shot("11-founder-invite-uses0");
  log("uses=0 form text:", (await page.locator("form").innerText()).replace(/\n/g, " | "));

  // invalid: past expiry
  await uses.fill("");
  await page.locator("#invite-expires-at").fill("2020-01-01T00:00");
  await submit.click();
  await page.waitForTimeout(1200);
  await shot("12-founder-invite-past-expiry");
  log("past-expiry result:", (await page.locator("main").innerText()).slice(0, 1800).replace(/\n/g, " | "));

  // valid: blank both → unlimited invite
  await page.locator("#invite-expires-at").fill("");
  await submit.click();
  await page.waitForTimeout(1500);
  await shot("13-founder-invite-created");
  const mainTxt = await page.locator("main").innerText();
  log("after create:", mainTxt.slice(0, 2000).replace(/\n/g, " | "));

  // grab first token shown
  const tokenEl = page.locator("li code, li [class*=mono], li span").first();
  // copy link via button and read clipboard
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const copyBtn = page.getByRole("button", { name: /copy/i }).first();
  if (await copyBtn.count()) {
    await copyBtn.click();
    await page.waitForTimeout(400);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => "clip-err:" + e.message);
    log("CLIPBOARD:", clip);
    fs.writeFileSync(`${SHOTS}/../crew-invite-url.txt`, String(clip));
    await shot("14-founder-after-copy");
  }

  // revoke flow on the invite we just created (first live row) — two-step?
  const revokeBtn = page.getByRole("button", { name: /revoke/i }).first();
  if (await revokeBtn.count()) {
    await revokeBtn.click();
    await page.waitForTimeout(400);
    await shot("15-founder-revoke-step1");
    log("after revoke tap1:", (await page.locator("main").innerText()).slice(0, 1500).replace(/\n/g, " | "));
    // find confirm
    const confirm = page.getByRole("button", { name: /revoke|confirm|yes|kill/i }).first();
    if (await confirm.count()) {
      log("revoke confirm btn:", await confirm.innerText());
      await confirm.click();
      await page.waitForTimeout(1500);
      await shot("16-founder-after-revoke");
      log("after revoke:", (await page.locator("main").innerText()).slice(0, 1800).replace(/\n/g, " | "));
    }
  }

  // create a SECOND invite (leave live) for logged-out landing test
  const newBtn2 = page.getByRole("button", { name: /new|create|mint|link/i }).first();
  if (await newBtn2.count() && !(await page.locator("#invite-uses-left").count())) {
    await newBtn2.click(); await page.waitForTimeout(300);
  }
  if (await page.locator("#invite-uses-left").count()) {
    await page.locator('button[type="submit"]').last().click();
    await page.waitForTimeout(1500);
    const copy2 = page.getByRole("button", { name: /copy/i }).first();
    if (await copy2.count()) {
      await copy2.click();
      await page.waitForTimeout(300);
      const clip2 = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
      log("CLIPBOARD2:", clip2);
      fs.writeFileSync(`${SHOTS}/../crew-invite-url.txt`, String(clip2));
    }
  }
  // reload to verify persistence
  await page.reload();
  await page.waitForTimeout(1000);
  await shot("17-founder-invites-reload");
  log("invites after reload:", (await page.locator("main").innerText()).slice(0, 1800).replace(/\n/g, " | "));
}

await browser.close();
log("DONE");
