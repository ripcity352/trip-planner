import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth";
const vp = { width: 375, height: 812 };
const browser = await chromium.launch();

async function run(persona, tag, fn) {
  const ctx = await browser.newContext({ storageState: `${AUTH}/persona-sweep-${persona}.json`, viewport: vp });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log(`[${tag} pageerror]`, String(e).slice(0, 300)));
  await fn(page, (n) => page.screenshot({ path: `${SHOTS}/home-${n}.png`, fullPage: true }),
    async () => (await page.evaluate(() => document.body.innerText)));
  await ctx.close();
}

// ---- FOUNDER on the poll ----
await run("founder", "founder", async (page, shot, text) => {
  await page.goto("http://localhost:3000/trips/sweep-trip-b/dates", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot("30-poll-founder-initial");
  // aria-pressed state of vote buttons
  const states = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map(b => ({ t: b.innerText.trim(), p: b.getAttribute("aria-pressed") }))
      .filter(b => b.p !== null || /I'm in|Skip me|Lock/.test(b.t)));
  console.log("FOUNDER BUTTONS:", JSON.stringify(states));

  // vote "Skip me" on first window (change vote if already in)
  const w1skip = page.getByRole("button", { name: "Skip me" }).first();
  await w1skip.click();
  await page.waitForTimeout(1500);
  console.log("\nAFTER SKIP W1:\n", (await text()).slice(0, 900));
  await shot("31-poll-founder-skip-w1");

  // flip back to I'm in
  await page.getByRole("button", { name: "I'm in" }).first().click();
  await page.waitForTimeout(1500);
  await shot("32-poll-founder-back-in");
  console.log("\nAFTER BACK IN:\n", (await text()).slice(0, 900));

  // double-tap I'm in quickly (idempotency)
  await page.getByRole("button", { name: "I'm in" }).first().click({ force: true }).catch(() => {});
  await page.getByRole("button", { name: "I'm in" }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log("\nAFTER DOUBLE TAP:\n", (await text()).slice(0, 500));

  // reload persistence
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const pressed = await page.evaluate(() =>
    [...document.querySelectorAll("button[aria-pressed]")].map(b => ({ t: b.innerText.trim(), p: b.getAttribute("aria-pressed") })));
  console.log("\nAFTER RELOAD PRESSED:", JSON.stringify(pressed));
  await shot("33-poll-founder-reload");

  // Add a window — open, empty submit, then valid
  await page.getByRole("button", { name: /add a window/i }).click();
  await page.waitForTimeout(600);
  await shot("34-poll-add-window-open");
  console.log("\nADD WINDOW FORM:\n", (await text()).slice(0, 1200));
  const btns = await page.evaluate(() => [...document.querySelectorAll("button")].map(b => b.innerText.trim()).filter(Boolean));
  console.log("BUTTONS NOW:", JSON.stringify(btns));
  const inputs = await page.evaluate(() => [...document.querySelectorAll("input, textarea")].map(i => ({ name: i.name, type: i.type, ph: i.placeholder })));
  console.log("INPUTS:", JSON.stringify(inputs));
});

await browser.close();
