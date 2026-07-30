import { chromium } from "@playwright/test";
const shots = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: "playwright/.auth/persona-sweep-founder.json", viewport: { width: 375, height: 812 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/trips/sweep-trip-a/announcements");
await p.waitForSelector("article", { timeout: 15000 });
const cards = await p.locator("article").count();
// look for any edit/delete/overflow affordance inside cards
const controls = await p.locator("article button, article a, article [role=menu], article [aria-haspopup]").evaluateAll(els =>
  els.map(e => ({ tag: e.tagName, label: e.getAttribute("aria-label") || e.textContent.trim().slice(0,40) })));
console.log("cards:", cards);
console.log("interactive elems in cards:", JSON.stringify(controls, null, 1));
const editish = controls.filter(c => /edit|delete|remove|more|overflow|menu|…|\.\.\./i.test(c.label));
console.log("edit/delete-ish controls:", editish.length);
await p.screenshot({ path: shots + "/verify-posts-no-edit-delete.png", fullPage: true });
await b.close();
