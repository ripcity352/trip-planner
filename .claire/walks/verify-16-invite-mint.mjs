import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState:
      "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-founder.json",
  });
  const page = await context.newPage();

  // Finding [16]: MINT_INVITE fail-closed on Upstash-less shim.
  await page.goto("http://localhost:3000/trips/sweep-trip-a/invites", {
    waitUntil: "networkidle",
  });
  await page.screenshot({ path: `${SHOTS}/verify16-01-invites-page.png` });

  // Find a mint button / form. Try common label text.
  const mintButton = page.getByRole("button", { name: /mint/i }).first();
  const mintExists = await mintButton.count();
  console.log("mint button count:", mintExists);

  if (mintExists) {
    await mintButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/verify16-02-form-open.png` });

    const submitButton = page.getByRole("button", { name: /^mint it$/i });
    await submitButton.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/verify16-03-after-submit.png` });
  }

  const bodyText = await page.textContent("body");
  console.log("--- body text snippet ---");
  console.log(bodyText.slice(0, 4000));

  const hasUnconfiguredCopy = /down on this deployment/i.test(bodyText);
  console.log("has 'down on this deployment' copy:", hasUnconfiguredCopy);

  await browser.close();
})();
