import { chromium } from "@playwright/test";
const shots = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: "playwright/.auth/persona-sweep-member-going.json", viewport: { width: 375, height: 812 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/trips/sweep-trip-a/expenses");
await p.waitForSelector("text=/dinner/i", { timeout: 15000 }).catch(() => {});
await p.screenshot({ path: shots + "/verif-split-1-expenses.png", fullPage: true });
const body = await p.textContent("body");
console.log("HAS_GROUP_DINNER:", /group dinner/i.test(body));
console.log("HAS_EDIT_BTN:", await p.locator("button:has-text('Edit'), a:has-text('Edit')").count());
// look for any opt-out-ish affordance
console.log("OPTOUT_AFFORDANCE:", await p.locator("text=/i'm out|opt out|remove me|leave this/i").count());
// tap the group dinner card to see if it expands with any self-serve control
const card = p.locator("text=/group dinner/i").first();
if (await card.count()) { await card.click().catch(()=>{}); await p.waitForTimeout(800); }
await p.screenshot({ path: shots + "/verif-split-2-card-tapped.png", fullPage: true });
console.log("BUTTONS:", (await p.locator("button").allTextContents()).join(" | "));
await b.close();
