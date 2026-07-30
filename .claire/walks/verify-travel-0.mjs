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
  await page.screenshot({ path: `${SHOTS}/v-travel-00-arrivals.png` });

  // Open Add your travel
  const addBtn = page.getByRole("button", { name: /add your travel/i });
  await addBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/v-travel-01-sheet.png` });

  // Ensure kind = flight so the AirlinePicker renders
  const kindSelect = page.locator("#leg-kind");
  if (await kindSelect.count()) {
    await kindSelect.selectOption("flight");
  }

  // Fill airline typeahead
  const airlineInput = page.getByRole("combobox", { name: /airline/i });
  await airlineInput.fill("United");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/v-travel-02-typeahead.png` });
  // pick first suggestion from the airline listbox specifically
  const option = page.locator('ul[aria-label="Airline suggestions"] li[role="option"]').first();
  if (await option.count()) {
    await option.click();
  } else {
    console.log("NO AIRLINE OPTIONS FOUND");
  }

  const flightNumInput = page.getByRole("textbox", { name: /flight number/i });
  await flightNumInput.fill("1234");

  const notesInput = page.locator("#leg-notes");
  if (await notesInput.count()) {
    await notesInput.fill("[v-travel] initial add");
  }

  await page.screenshot({ path: `${SHOTS}/v-travel-03-filled.png` });

  const saveBtn = page.getByRole("button", { name: /save it/i });
  await saveBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/v-travel-04-after-save.png` });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/v-travel-05-after-reload.png` });

  const bodyText = await page.locator("body").innerText();
  console.log("=== Contains 'UA 1234'? ===", bodyText.includes("UA 1234"));
  console.log("=== Contains 'Flight'? ===", bodyText.includes("Flight"));

  // Now open edit on the card we just made (look for our notes marker)
  const card = page.locator("article", { hasText: "[v-travel] initial add" }).first();
  const cardCount = await card.count();
  console.log("=== card found ===", cardCount);
  if (cardCount) {
    const editBtn = card.getByRole("button", { name: /edit/i });
    await editBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/v-travel-06-edit-form-prefill.png` });

    const airlineVal = await page.getByRole("combobox", { name: /airline/i }).inputValue().catch(() => "N/A");
    const flightVal = await page.getByRole("textbox", { name: /flight number/i }).inputValue().catch(() => "N/A");
    console.log("=== edit form airline field value ===", JSON.stringify(airlineVal));
    console.log("=== edit form flight field value ===", JSON.stringify(flightVal));

    // Now change ONLY notes, save
    const notesField = page.locator("#leg-notes");
    await notesField.fill("[v-travel] notes-only edit");
    const saveBtn2 = page.getByRole("button", { name: /save it/i });
    await saveBtn2.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/v-travel-07-after-notesonly-save.png` });
  }

  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
