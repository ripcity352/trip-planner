/**
 * e2e/ride-groups.spec.ts — #581 ride groups on the arrivals manifest.
 *
 * Mirrors the m3-itinerary graceful-degradation pattern: requires the Wave 0b
 * auth fixture (STORAGE_STATE_PATH) + a live local Supabase. Tests skip
 * cleanly when the fixture is unavailable.
 *
 * Flow:
 *   1. Anonymous: /trips/<id>/arrivals → redirects to /login
 *   2. Authed member: the arrivals page renders and always offers a "start a
 *      ride" affordance (the feature is wired into the live page)
 *   3. Authed member: opening "start a ride" reveals the sheet (airport +
 *      riders + Start ride)
 *   4. Authed member: create a ride (self), see the ride card render through
 *      the server action → RLS → DB → re-render round-trip, then clear it
 */

import { test, expect } from "@playwright/test";
import { STORAGE_STATE_PATH } from "../tests/fixtures/auth";
import { firstRealTripLink } from "./_setup/fixture-trip";
import { M3_UI_STRINGS } from "../lib/copy/empty-states";
import fs from "node:fs";

function authFixtureAvailable(): boolean {
  return fs.existsSync(STORAGE_STATE_PATH);
}

// ---------------------------------------------------------------------------
// 1. Anonymous redirect
// ---------------------------------------------------------------------------

test("anonymous: /trips/<id>/arrivals redirects to /login", async ({ page }) => {
  await page.goto("/trips/test-anonymous-probe/arrivals");
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// 2-4. Authenticated ride-group flows
// ---------------------------------------------------------------------------

test.describe("authenticated ride-group flows", () => {
  test.use({
    storageState: authFixtureAvailable() ? STORAGE_STATE_PATH : undefined,
  });

  test.beforeEach(async ({}, testInfo) => {
    if (!authFixtureAvailable()) {
      testInfo.skip(
        true,
        `Auth fixture not available at ${STORAGE_STATE_PATH}. Run pnpm exec playwright test --project=setup first.`
      );
    }
  });

  async function gotoArrivals(page: import("@playwright/test").Page) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");
    const tripLink = firstRealTripLink(page);
    if (!(await tripLink.isVisible())) return null;
    const href = await tripLink.getAttribute("href");
    if (!href) return null;
    await page.goto(`${href}/arrivals`);
    await expect(
      page.getByRole("heading", { name: /who's landing when/i })
    ).toBeVisible({ timeout: 5000 });
    return href;
  }

  test("arrivals page renders and always offers a 'start a ride' entry point", async ({
    page,
  }) => {
    if (!(await gotoArrivals(page))) return;
    await expect(
      page.getByText(M3_UI_STRINGS.rideGroup_manualCta_inbound)
    ).toBeVisible({ timeout: 5000 });
  });

  test("opening 'start a ride' reveals the sheet (airport + riders + submit)", async ({
    page,
  }) => {
    if (!(await gotoArrivals(page))) return;
    await page.getByText(M3_UI_STRINGS.rideGroup_manualCta_inbound).click();
    await expect(
      page.getByRole("heading", { name: M3_UI_STRINGS.rideGroup_sheet_title })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: M3_UI_STRINGS.rideGroup_sheet_submit })
    ).toBeVisible();
  });

  test("create a ride, see it render, then clear it (full round-trip)", async ({
    page,
  }, testInfo) => {
    // Single-project only: this test MUTATES the shared fixture trip, so
    // running it under two browser projects concurrently would have each see
    // the other's ride card and race the cleanup. The render paths above
    // already cover mobile-safari.
    testInfo.skip(
      testInfo.project.name !== "chromium",
      "mutation round-trip runs on a single project to avoid cross-project races"
    );
    const href = await gotoArrivals(page);
    if (!href) return;
    const arrivalsUrl = `${href}/arrivals`;

    // Open the manual sheet, type an airport, submit (self is pre-checked).
    await page.getByText(M3_UI_STRINGS.rideGroup_manualCta_inbound).click();
    const airportInput = page.getByLabel(
      M3_UI_STRINGS.rideGroup_sheet_airport_label_inbound
    );
    await airportInput.fill("PDX");
    await page
      .getByRole("button", { name: M3_UI_STRINGS.rideGroup_sheet_submit })
      .click();
    // Give the create action time to commit, then verify PERSISTENCE via a
    // fresh server render (a reload avoids relying on the dev-server HMR
    // client refresh, which is flaky under turbopack). This exercises the
    // full create → RLS → DB → getRideGroupsByTrip → SSR round-trip.
    await expect(
      page.getByRole("button", { name: M3_UI_STRINGS.rideGroup_sheet_submit })
    ).toBeHidden({ timeout: 10000 });
    await page.goto(arrivalsUrl);

    // Flip to Full (the toggle appears once there's content) to see the card.
    // Retry the flip+assert as one unit: a bare click can fire before React
    // hydration attaches the toggle's handler (the scripted-walk hydration
    // race). toPass re-runs until the handler is live and the card shows.
    const flipToFull = async () => {
      const toggle = page.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      });
      if (await toggle.isVisible()) await toggle.click();
    };
    await expect(async () => {
      await flipToFull();
      await expect(page.getByText("ride from PDX").first()).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 10000 });

    // Clean up — the creator can clear the ride. Loop (leftover rides from a
    // prior run can't leave the assertion red); reload to re-render from the DB.
    for (let i = 0; i < 10; i++) {
      await flipToFull();
      const removeBtn = page
        .getByRole("button", { name: M3_UI_STRINGS.rideGroup_remove })
        .first();
      if (!(await removeBtn.isVisible())) break;
      await removeBtn.click();
      await page.waitForLoadState("networkidle");
      await page.goto(arrivalsUrl);
    }
    await expect(page.getByText("ride from PDX")).toHaveCount(0, { timeout: 5000 });
  });
});
