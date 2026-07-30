import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const BASE = "http://localhost:3000/trips/sweep-trip-a/itinerary";

const browser = await chromium.launch();

// ---------------------------------------------------------------------
// Finding 8 (P0): time-save always fails — send UTC ISO into `time` col
// Finding 10 (P1): error copy blames "connection's flaky" on a
//   deterministic failure
// Finding 14 (P2): end-before-start accepted client-side, no refine
// ---------------------------------------------------------------------
{
  const ctx = await browser.newContext({
    storageState: `${AUTH}/persona-sweep-founder.json`,
    viewport: { width: 375, height: 812 },
  });
  const page = await ctx.newPage();
  const posts = [];
  page.on("response", async (r) => {
    if (r.request().method() === "POST") posts.push(`${r.url().slice(0, 90)} ${r.status()}`);
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");

  // create a fresh [v-itinerary] item to edit safely (don't touch seed content)
  await page.locator("button", { hasText: /Add an item/i }).click();
  await page.waitForSelector("#title, input[name='title']").catch(() => {});
  const titleInput = page.locator("input").first();
  await page.fill("#title", "[v-itinerary] Time Save Check").catch(async () => {
    await titleInput.fill("[v-itinerary] Time Save Check");
  });
  // day field — use a date inside the trip window so we isolate the time bug
  const dayInput = page.locator("input[type='date']").first();
  await dayInput.fill("2026-08-03");
  await page.locator("button", { hasText: /^Save|Add it/i }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/v-itin-01-created.png`, fullPage: true });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=[v-itinerary] Time Save Check");

  const card = page.locator("article", { hasText: "[v-itinerary] Time Save Check" });
  await card.locator("button", { hasText: "Edit" }).click();
  await page.waitForTimeout(500);

  // Finding 8: fill only start time, save, expect deterministic failure
  const startInput = page.locator("#edit-datetime, input[type='datetime-local']").first();
  await startInput.fill("2026-08-03T14:00");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/v-itin-02-time-filled.png`, fullPage: true });

  posts.length = 0;
  await page.locator("button", { hasText: /^Save/i }).first().click();
  await page.waitForTimeout(2000);
  const bodyText1 = await page.evaluate(() => document.body.innerText);
  console.log("F8/F10 — POSTs during save:", posts.join(" | "));
  console.log(
    "F8/F10 — error text present:",
    /Didn't save|connection's flaky|couldn/i.test(bodyText1)
  );
  await page.screenshot({ path: `${SHOTS}/v-itin-03-save-error.png`, fullPage: true });

  // Finding 14: now set End before Start (same day) and confirm no inline
  // validation blocks submit (form should still attempt submit / no
  // "end before start" message appears before hitting server)
  const endInput = page.locator("#edit-endtime, input[type='datetime-local']").nth(1);
  await endInput.fill("2026-08-03T10:00"); // before the 14:00 start
  await page.waitForTimeout(300);
  const preSubmitText = await page.evaluate(() => document.body.innerText);
  console.log(
    "F14 — inline 'end before start' validation message present pre-submit:",
    /end.*before.*start|invalid.*range/i.test(preSubmitText)
  );
  await page.screenshot({ path: `${SHOTS}/v-itin-04-endbeforestart.png`, fullPage: true });
  await page.locator("button", { hasText: /^Save/i }).first().click();
  await page.waitForTimeout(1500);
  const postSubmitText = await page.evaluate(() => document.body.innerText);
  console.log(
    "F14 — after submit, still only generic save error (no cross-field msg):",
    /Didn't save|connection's flaky/i.test(postSubmitText)
  );
  await page.screenshot({ path: `${SHOTS}/v-itin-05-endbeforestart-submit.png`, fullPage: true });

  // cancel out, leave DB clean (never actually persisted since save fails)
  await page.locator("button", { hasText: /Cancel/i }).first().click().catch(() => {});
  await ctx.close();
}

// ---------------------------------------------------------------------
// Finding 9 (P1): hidden-from-celebrant day vanishes entirely for
//   celebrant — no placeholder, day header disappears
// ---------------------------------------------------------------------
{
  const ctx = await browser.newContext({
    storageState: `${AUTH}/persona-sweep-celebrant.json`,
    viewport: { width: 375, height: 812 },
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(500);
  const text = await page.evaluate(() => document.body.innerText);
  console.log("F9 — celebrant page day headers:", (text.match(/[A-Z]+ · AUG \d+|SATURDAY|SUNDAY|MONDAY|TUESDAY/gi) || []).join(", "));
  console.log("F9 — 'Something planned' placeholder present:", /Something planned/i.test(text));
  await page.screenshot({ path: `${SHOTS}/v-itin-06-celebrant-full.png`, fullPage: true });
  await ctx.close();
}

// ---------------------------------------------------------------------
// Finding 11 (P2): add form accepts day outside trip range, no signal
// Finding 12 (P2): add form has no time fields at all
// Finding 13 (P2): page skips empty days, no now/next cue
// ---------------------------------------------------------------------
{
  const ctx = await browser.newContext({
    storageState: `${AUTH}/persona-sweep-founder.json`,
    viewport: { width: 375, height: 812 },
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");

  // F13: enumerate day sections rendered vs trip window Aug1-4
  const preText = await page.evaluate(() => document.body.innerText);
  console.log("F13 — day sections before add:", (preText.match(/AUG \d+/g) || []).join(", "));

  // F11 + F12: open add form, inspect fields, submit an out-of-range day
  await page.locator("button", { hasText: /Add an item/i }).click();
  await page.waitForTimeout(400);
  const timeFieldCount = await page.locator("input[type='datetime-local']").count();
  const dateFieldCount = await page.locator("input[type='date']").count();
  console.log("F12 — add-form datetime-local field count (should be 0):", timeFieldCount);
  console.log("F12 — add-form date-only field count:", dateFieldCount);
  await page.screenshot({ path: `${SHOTS}/v-itin-07-addform-fields.png`, fullPage: true });

  const titleInput2 = page.locator("input").first();
  await titleInput2.fill("[v-itinerary] Out Of Range Day");
  const dayInput2 = page.locator("input[type='date']").first();
  const minAttr = await dayInput2.getAttribute("min");
  const maxAttr = await dayInput2.getAttribute("max");
  console.log("F11 — date input min/max attrs (expect null/null):", minAttr, maxAttr);
  await dayInput2.fill("2026-08-10"); // trip is Aug 1-4
  await page.locator("button", { hasText: /^Save|Add it/i }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/v-itin-08-outofrange-submitted.png`, fullPage: true });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(500);
  const postText = await page.evaluate(() => document.body.innerText);
  console.log("F11 — day sections after out-of-range add:", (postText.match(/AUG \d+/g) || []).join(", "));
  console.log("F11 — out-of-range item rendered:", /Out Of Range Day/i.test(postText));
  await page.screenshot({ path: `${SHOTS}/v-itin-09-after-reload.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log("DONE");
