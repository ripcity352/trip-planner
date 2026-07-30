import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const viewport = { width: 375, height: 812 };

async function walk(persona, name) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: `/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-${persona}.json`,
    viewport,
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/trips/sweep-trip-a/announcements");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/verify-${name}-viewport.png` });
  await page.screenshot({ path: `${SHOTS}/verify-${name}-full.png`, fullPage: true });

  // Measure vertical positions of key elements
  const info = await page.evaluate(() => {
    const results = [];
    const grab = (label, el) => {
      if (!el) { results.push({ label, top: null }); return; }
      const r = el.getBoundingClientRect();
      results.push({ label, top: Math.round(r.top + window.scrollY), height: Math.round(r.height) });
    };
    // poll cards
    document.querySelectorAll("ul li").forEach((li) => {
      const t = li.textContent || "";
      if (t.length > 0 && li.querySelector("button")) {
        // skip
      }
    });
    const all = [...document.querySelectorAll("h1,h2,h3,article,section,form,ul,textarea,button")];
    for (const el of all) {
      const txt = (el.textContent || "").slice(0, 60).replace(/\s+/g, " ");
      const r = el.getBoundingClientRect();
      if (r.height > 0) results.push({ tag: el.tagName, top: Math.round(r.top + window.scrollY), h: Math.round(r.height), txt });
    }
    return { docHeight: document.body.scrollHeight, results: results.slice(0, 60) };
  });
  console.log(`=== ${name} === docHeight=${info.docHeight}`);
  for (const r of info.results) console.log(`${String(r.top).padStart(6)} h=${String(r.h).padStart(5)} ${r.tag} ${r.txt}`);
  await browser.close();
}

await walk("founder", "founder");
await walk("member-going", "member");
