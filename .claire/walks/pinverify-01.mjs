import { chromium } from "@playwright/test";
const shots = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "playwright/.auth/persona-sweep-founder.json",
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/trips/sweep-trip-a/announcements");
await page.waitForSelector("form", { timeout: 15000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shots}/pinverify-01-founder-announcements.png`, fullPage: true });
// Dump all interactive controls text
const controls = await page.$$eval("button, input, [role=switch], [role=checkbox], label, select", els =>
  els.map(e => `${e.tagName}[${e.getAttribute("role")||""}] "${(e.textContent||e.getAttribute("aria-label")||"").trim().slice(0,60)}"`));
console.log("CONTROLS:\n" + controls.join("\n"));
const pinMentions = await page.$$eval("*", els =>
  els.filter(e => /pin/i.test(e.textContent||"") && e.children.length===0).map(e => `${e.tagName}: ${(e.textContent||"").trim().slice(0,80)}`));
console.log("PIN TEXT NODES:\n" + pinMentions.join("\n"));
await browser.close();
