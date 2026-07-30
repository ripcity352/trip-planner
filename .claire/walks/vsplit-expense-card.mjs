import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const viewport = { width: 375, height: 812 };

const run = async (persona, file) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: `/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-${persona}.json`,
    viewport,
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/trips/sweep-trip-a/expenses");
  await page.waitForSelector("article", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${file}.png`, fullPage: true });
  // Dump text of all expense cards
  const cards = await page.locator("article").allInnerTexts();
  console.log(`=== ${persona} ===`);
  cards.forEach((c, i) => console.log(`[card ${i}] ${c.replace(/\n/g, " | ")}`));
  // Any edit affordance visible?
  const editButtons = await page.getByRole("button", { name: /edit/i }).count();
  console.log(`edit buttons: ${editButtons}`);
  await browser.close();
};

await run("member-going", "vsplit-member-going");
await run("member-declined", "vsplit-member-declined");
await run("founder", "vsplit-founder");
