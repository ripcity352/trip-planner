// [verify-travel] Repro attempt for: editing a travel leg wipes airline+flight
import { chromium } from "@playwright/test";

const SHOTS =
  "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots";
const AUTH = "playwright/.auth/persona-sweep-member-going.json";
const URL = "http://localhost:3000/trips/sweep-trip-a/arrivals";
const NOTE1 = "[verify-travel] leg v1";
const NOTE2 = "[verify-travel] leg v2 notes-only edit";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 375, height: 812 },
});
const page = await ctx.newPage();

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/verify-travel-${name}.png`, fullPage: true });
}

await page.goto(URL);
await page.getByText("Who's landing when").waitFor({ timeout: 15000 });
await shot("01-manifest-initial");

// If a leg for me already exists, the CTA may say Edit instead — handle add path.
const addBtn = page.getByRole("button", { name: "Add your travel" });
await addBtn.first().click();
await page.getByPlaceholder("Type your airline").waitFor({ timeout: 10000 });
await shot("02-add-form");

// Airline typeahead: type "United", pick option containing "United Airlines"
await page.getByPlaceholder("Type your airline").fill("United");
await page.waitForTimeout(400);
const opt = page.getByText(/United Airlines/i).first();
await opt.click();
await page.waitForTimeout(200);

// Flight number input — find input near the picker; try label/placeholder heuristics
let fno = page.getByLabel(/flight number/i);
if ((await fno.count()) === 0) fno = page.getByPlaceholder(/flight/i);
if ((await fno.count()) === 0) {
  // dump inputs for debugging
  const inputs = await page.locator("input, textarea").evaluateAll((els) =>
    els.map((e) => ({
      name: e.getAttribute("name"),
      id: e.id,
      ph: e.getAttribute("placeholder"),
      aria: e.getAttribute("aria-label"),
    }))
  );
  console.log("INPUTS:", JSON.stringify(inputs, null, 2));
}
await fno.first().fill("1234");

await page.getByLabel("Notes").fill(NOTE1);
await shot("03-add-filled");
await page.getByRole("button", { name: "Save it" }).click();
await page.getByText(NOTE1).waitFor({ timeout: 15000 });

// Reload to verify persistence + render
await page.reload();
await page.getByText("Who's landing when").waitFor({ timeout: 15000 });
await shot("04-manifest-after-add");
const body = await page.textContent("body");
console.log("CARD_SHOWS_UA_1234:", /UA\s*1234/.test(body));

// Edit my leg: find the card containing NOTE1, click its Edit
const card = page.locator("li, div", { hasText: NOTE1 });
await page.getByRole("button", { name: "Edit" }).first().click();
await page.getByPlaceholder("Type your airline").waitFor({ timeout: 10000 });
await shot("05-edit-form-prefill");
const airlineVal = await page.getByPlaceholder("Type your airline").inputValue();
const fnoVal = await page
  .getByLabel(/flight number/i)
  .first()
  .inputValue()
  .catch(() => "(not found)");
console.log("EDIT_PREFILL_airline:", JSON.stringify(airlineVal), "flightNumber:", JSON.stringify(fnoVal));

// Notes-only change, save
await page.getByLabel("Notes").fill(NOTE2);
await page.getByRole("button", { name: "Save it" }).click();
await page.getByText(NOTE2).waitFor({ timeout: 15000 });
await shot("06-after-notes-only-edit");

await browser.close();
console.log("DONE");
