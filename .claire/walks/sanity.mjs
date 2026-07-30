import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-founder.json", viewport: { width: 375, height: 812 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/trips/sweep-trip-a", { waitUntil: "networkidle" });
console.log("URL:", p.url());
console.log("TITLE:", await p.title());
console.log("H1:", await p.locator("h1").first().textContent().catch(() => "none"));
await b.close();
