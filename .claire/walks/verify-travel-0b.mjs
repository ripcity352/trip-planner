import { chromium } from "@playwright/test";

const SHOTS = "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "/Users/carlchang/Projects/Party Trip/playwright/.auth/persona-sweep-member-going.json";

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH,
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();

  await page.goto("http://localhost:3000/trips/sweep-trip-a/arrivals", { waitUntil: "networkidle" });

  const addBtn = page.getByRole("button", { name: /add your travel/i });
  await addBtn.click();
  await page.waitForTimeout(500);

  const kindSelect = page.locator("#leg-kind");
  if (await kindSelect.count()) {
    await kindSelect.selectOption("flight");
  }

  const airlineInput = page.getByRole("combobox", { name: /airline/i });
  await airlineInput.fill("United");
  await page.waitForTimeout(500);
  const option = page.locator('ul[aria-label="Airline suggestions"] li[role="option"]').first();
  console.log("=== airline options count ===", await option.count());
  await option.click();
  await page.waitForTimeout(200);

  // Confirm displayValue reflects selection before submit
  const airlineValBeforeSubmit = await airlineInput.inputValue();
  console.log("=== airline input value BEFORE submit ===", JSON.stringify(airlineValBeforeSubmit));

  const flightNumInput = page.getByRole("textbox", { name: /flight number/i });
  await flightNumInput.fill("1234");
  const flightValBeforeSubmit = await flightNumInput.inputValue();
  console.log("=== flight input value BEFORE submit ===", JSON.stringify(flightValBeforeSubmit));

  const notesInput = page.locator("#leg-notes");
  if (await notesInput.count()) {
    await notesInput.fill("[v-travel] create-only-check");
  }
  await page.screenshot({ path: `${SHOTS}/v-travel-b1-filled.png` });

  const saveBtn = page.getByRole("button", { name: /save it/i });
  await saveBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/v-travel-b2-after-save.png` });

  const bodyText = await page.locator("body").innerText();
  console.log("=== page contains UA 1234 right after save (no reload)? ===", bodyText.includes("UA 1234"));

  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
