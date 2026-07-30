import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const URL = "http://localhost:3000/trips/sweep-trip-a/announcements";
const viewport = { width: 375, height: 812 };

const log = (...a) => console.log("[posts]", ...a);

const browser = await chromium.launch();
const founderCtx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-founder.json`, viewport });
const memberCtx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-member-going.json`, viewport });
const f = await founderCtx.newPage();
const m = await memberCtx.newPage();

// --- Founder: initial load ---
await f.goto(URL);
await f.waitForSelector("text=Announcements", { timeout: 15000 });
await f.waitForTimeout(1500);
await f.screenshot({ path: `${SHOTS}/posts-01-founder-initial.png`, fullPage: true });
log("founder url:", f.url());

// Member loads too (for realtime test later)
await m.goto(URL);
await m.waitForSelector("text=Announcements", { timeout: 15000 });
await m.waitForTimeout(1500);
await m.screenshot({ path: `${SHOTS}/posts-02-member-initial.png`, fullPage: true });
const memberHasComposer = await m.locator("#announcement-body").count();
log("member composer present (expect 0):", memberHasComposer);

// --- Founder: empty submit ---
await f.click('button:has-text("Send it")');
await f.waitForTimeout(600);
const emptyErr = await f.locator("#announcement-body-error").textContent().catch(() => null);
log("empty-submit error:", JSON.stringify(emptyErr));
await f.screenshot({ path: `${SHOTS}/posts-03-founder-empty-submit.png` });

// --- Founder: post with emoji + URL + long-ish text ---
const body1 = "[posts] Founder update 🎉🍻 — bring sunscreen. Details: https://example.com/plan?x=1&y=2 and don't be late!";
await f.fill("#announcement-body", body1);
await f.click('button:has-text("Send it")');
await f.waitForSelector(`text=bring sunscreen`, { timeout: 10000 });
await f.screenshot({ path: `${SHOTS}/posts-04-founder-posted.png`, fullPage: true });
// is the URL a link?
const linkCount = await f.locator('article a[href*="example.com"]').count();
log("URL rendered as anchor (0 = plain text):", linkCount);

// --- Realtime: does member see it without reload? ---
const rt = await m.waitForSelector("text=bring sunscreen", { timeout: 8000 }).then(() => true).catch(() => false);
log("member saw founder post via realtime within 8s:", rt);
await m.screenshot({ path: `${SHOTS}/posts-05-member-realtime.png`, fullPage: true });
if (!rt) {
  await m.reload();
  await m.waitForTimeout(2000);
  const afterReload = await m.locator("text=bring sunscreen").count();
  log("member sees post after reload:", afterReload > 0);
  await m.screenshot({ path: `${SHOTS}/posts-06-member-after-reload.png`, fullPage: true });
}

// --- Founder: double-tap submit ---
const body2 = "[posts] double-tap test " + Date.now();
await f.fill("#announcement-body", body2);
const btn = f.locator('button:has-text("Send it")');
await Promise.all([btn.click(), btn.click({ force: true }).catch(() => {})]);
await f.waitForTimeout(2500);
await f.reload();
await f.waitForTimeout(2000);
const dupes = await f.locator(`text=double-tap test`).count();
log("double-tap: occurrences after reload (expect 1):", dupes);
await f.screenshot({ path: `${SHOTS}/posts-07-founder-doubletap.png`, fullPage: true });

// --- Founder: 5001-char body ---
await f.fill("#announcement-body", "[posts] " + "x".repeat(5001));
await f.click('button:has-text("Send it")');
await f.waitForTimeout(800);
const longErr = await f.locator("#announcement-body-error").textContent().catch(() => null);
log("too-long error:", JSON.stringify(longErr));
await f.screenshot({ path: `${SHOTS}/posts-08-founder-toolong.png` });
await f.fill("#announcement-body", "");

// --- Founder: hide_from_celebrant post ---
await f.fill("#announcement-body", "[posts] surprise stuff — celebrant must not see this");
await f.click("#announcement-visibility");
await f.waitForTimeout(400);
await f.screenshot({ path: `${SHOTS}/posts-09-visibility-options.png` });
const opts = await f.locator('[role="option"]').allTextContents();
log("visibility options:", JSON.stringify(opts));
await f.locator('[role="option"]').last().click(); // hide from celebrant
await f.click('button:has-text("Send it")');
await f.waitForSelector("text=surprise stuff", { timeout: 10000 });
await f.screenshot({ path: `${SHOTS}/posts-10-founder-hidden-post.png`, fullPage: true });
const badge = await f.locator('[data-testid="visibility-badge"]').first().textContent().catch(() => null);
log("visibility badge text:", JSON.stringify(badge));

// --- Reactions: founder expands picker on the first (newest visible) card ---
const firstCard = f.locator("article").filter({ hasText: "bring sunscreen" }).first();
await firstCard.locator('button[aria-expanded]').click();
await f.waitForTimeout(400);
const pickerChips = await firstCard.locator("button[aria-pressed]").count();
log("emoji in expanded picker (expect 6):", pickerChips);
const emojiLabels = await firstCard.locator("button[aria-pressed]").allTextContents();
log("emoji set:", JSON.stringify(emojiLabels));
await f.screenshot({ path: `${SHOTS}/posts-11-reaction-picker.png`, fullPage: false });
// toggle first emoji ON
await firstCard.locator("button[aria-pressed]").first().click();
await f.waitForTimeout(1200);
await f.screenshot({ path: `${SHOTS}/posts-12-reaction-on.png` });

// member reacts with same emoji on same card
const mCard = m.locator("article").filter({ hasText: "bring sunscreen" }).first();
if (await mCard.count()) {
  await mCard.locator('button[aria-expanded]').click();
  await m.waitForTimeout(300);
  await mCard.locator("button[aria-pressed]").first().click();
  await m.waitForTimeout(1200);
  await m.screenshot({ path: `${SHOTS}/posts-13-member-reaction.png` });
}

// founder reloads — does the count show 2? does founder's own pressed state persist?
await f.reload();
await f.waitForTimeout(2000);
const fCard2 = f.locator("article").filter({ hasText: "bring sunscreen" }).first();
const chipTexts = await fCard2.locator("button[aria-pressed]").allTextContents();
const pressed = await fCard2.locator('button[aria-pressed="true"]').count();
log("after reload: visible chips:", JSON.stringify(chipTexts), "pressed count:", pressed);
await f.screenshot({ path: `${SHOTS}/posts-14-founder-reaction-persist.png`, fullPage: true });

// toggle OFF, verify count decrements
if (pressed > 0) {
  await fCard2.locator('button[aria-pressed="true"]').first().click();
  await f.waitForTimeout(1200);
  await f.screenshot({ path: `${SHOTS}/posts-15-reaction-off.png` });
}

// --- Edit/delete/pin affordances on own post? ---
const cardButtons = await f.locator("article").first().locator("button").allTextContents();
log("buttons inside first card:", JSON.stringify(cardButtons));
const menus = await f.locator('article [aria-haspopup], article button:has-text("Edit"), article button:has-text("Delete"), article button:has-text("Pin")').count();
log("edit/delete/pin affordances found:", menus);

// --- Member view of hidden post + full page state ---
await m.reload();
await m.waitForTimeout(2000);
const memberSeesHidden = await m.locator("text=surprise stuff").count();
log("member (non-celebrant) sees hide_from_celebrant post:", memberSeesHidden > 0);
await m.screenshot({ path: `${SHOTS}/posts-16-member-final.png`, fullPage: true });

// bottom nav labels
const navTexts = await f.locator("nav a").allTextContents();
log("nav labels:", JSON.stringify(navTexts));

await browser.close();
log("done");
