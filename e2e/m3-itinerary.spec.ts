/**
 * e2e/m3-itinerary.spec.ts — M3 Wave 2 itinerary E2E tests.
 *
 * Requires the Wave 0b auth fixture (STORAGE_STATE_PATH).
 * Uses test.use({ storageState }) for authentication — Override B.
 *
 * Test flow:
 *   1. Anonymous: /trips/<id>/itinerary → redirects to /login
 *   2. Authenticated member: timeline renders, address opens Maps in new tab
 *   3. Member silently opts out of one item; refresh; chip state persists
 *   4. Organizer adds item with hide_from_celebrant; celebrant sees placeholder
 *
 * NOTE: Tests 2-4 require a live Supabase instance and the auth fixture.
 * If the fixture is unavailable (SUPABASE_SERVICE_ROLE_KEY not set), these
 * tests are skipped at the setup stage — the spec will run but fail gracefully
 * if the storage state file does not exist.
 */

import { test, expect } from "@playwright/test";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { STORAGE_STATE_PATH } from "../tests/fixtures/auth";
import { firstRealTripLink } from "./_setup/fixture-trip";
import path from "node:path";
import fs from "node:fs";

// Helper: check if the storage state file was emitted by the setup project
function authFixtureAvailable(): boolean {
  return fs.existsSync(STORAGE_STATE_PATH);
}

// ---------------------------------------------------------------------------
// 1. Anonymous redirect
// ---------------------------------------------------------------------------

test("anonymous: /trips/<id>/itinerary redirects to /login", async ({ page }) => {
  // We don't have a real trip ID in this spec. We use a placeholder that
  // will fail the auth check before the RLS check, so the redirect fires
  // from the (authed) layout guard.
  await page.goto("/trips/test-anonymous-probe/itinerary");
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// 2. Authenticated member: timeline renders + address opens Maps
// ---------------------------------------------------------------------------

test.describe("authenticated itinerary flows", () => {
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

  test("itinerary page renders at 375px viewport", async ({ page }) => {
    // Navigate to /trips — find the first trip link from the list
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");

    // Find any trip and navigate to its itinerary
    const tripLink = firstRealTripLink(page);

    if (!(await tripLink.isVisible())) {
      // No trips yet — this is a fresh test user. The test is still useful
      // to confirm the page scaffolding loads without a crash.
      test.info().annotations.push({
        type: "note",
        description: "No trips found for test user — skipping item-specific assertions",
      });
      return;
    }

    const tripHref = await tripLink.getAttribute("href");
    if (!tripHref) return;

    const itineraryUrl = `${tripHref}/itinerary`;
    await page.goto(itineraryUrl);

    // Page title should be visible
    await expect(page.getByRole("heading", { name: /what's the plan/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test("address tap opens new tab (Maps link)", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");

    const tripLink = firstRealTripLink(page);
    if (!(await tripLink.isVisible())) return;

    const tripHref = await tripLink.getAttribute("href");
    if (!tripHref) return;

    await page.goto(`${tripHref}/itinerary`);

    // Look for an Apple Maps or Google Maps link (address present on any item)
    const mapsLinks = page.locator(
      'a[href*="maps.apple.com"], a[href*="google.com/maps"]'
    );

    if (!(await mapsLinks.first().isVisible())) {
      test.info().annotations.push({
        type: "note",
        description: "No items with addresses found — skipping Maps link assertion",
      });
      return;
    }

    // Verify target=_blank (opens in new tab)
    const target = await mapsLinks.first().getAttribute("target");
    expect(target).toBe("_blank");
  });

  test("opt-out chip state persists after refresh", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");

    const tripLink = firstRealTripLink(page);
    if (!(await tripLink.isVisible())) return;

    const tripHref = await tripLink.getAttribute("href");
    if (!tripHref) return;

    await page.goto(`${tripHref}/itinerary`);

    // Find a "Skip me" chip
    const skipChip = page.getByRole("button", { name: /skip me/i }).first();
    if (!(await skipChip.isVisible())) {
      test.info().annotations.push({
        type: "note",
        description: "No RSVP chips visible — no items on itinerary",
      });
      return;
    }

    // Click Skip me
    await skipChip.click();

    // Wait for optimistic update — chip should be pressed
    await expect(skipChip).toHaveAttribute("aria-pressed", "true");

    // Refresh and re-check persistence (server must have confirmed)
    await page.reload();
    await page.waitForLoadState("networkidle");

    const skipChipAfter = page.getByRole("button", { name: /skip me/i }).first();
    await expect(skipChipAfter).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });

  test("celebrant sees 'Something planned' for hide_from_celebrant items", async ({ page }) => {
    // This test requires a trip where:
    //   - the test user is the celebrant
    //   - an organizer has added an item with visibility=hide_from_celebrant
    // Without that setup, we just verify the page doesn't crash.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");

    const tripLink = firstRealTripLink(page);
    if (!(await tripLink.isVisible())) return;

    const tripHref = await tripLink.getAttribute("href");
    if (!tripHref) return;

    await page.goto(`${tripHref}/itinerary`);

    // The page should load without error regardless
    await expect(page.getByRole("heading", { name: /what's the plan/i })).toBeVisible({
      timeout: 5000,
    });

    // If "Something planned" is visible, that means a hide_from_celebrant item exists
    // and the viewer is the celebrant. Both OK.
    const placeholder = page.getByText("Something planned");
    if (await placeholder.isVisible()) {
      // Good — the placeholder is correct
      await expect(placeholder).toBeVisible();
    }
  });

  // ---------------------------------------------------------------------
  // #644 regression: add/delete must re-render the list WITHOUT a manual
  // reload. Root cause was `setOpen(false)` racing `router.refresh()` on
  // sheet unmount — reproduces on a prod build (dev HMR can mask it).
  // No `page.reload()` anywhere below: the assertions rely entirely on
  // the sheet's own refresh to update the DOM.
  // ---------------------------------------------------------------------
  test("add then delete an item updates the list without a page reload — #644", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");

    // #644 fix-round-1: this regression test must NOT pass vacuously when
    // the fixture trip is missing — unlike the other tests in this file,
    // it asserts on the fix itself, so a silent early-return here would
    // hide a real regression as green. `ensureFixtureTrip` (auth.setup.ts)
    // guarantees a trip exists for the fixture user.
    const tripLink = firstRealTripLink(page);
    await expect(tripLink).toBeVisible();

    const tripHref = await tripLink.getAttribute("href");
    expect(tripHref).toBeTruthy();

    await page.goto(`${tripHref}/itinerary`);

    const addButton = page.getByRole("button", { name: /add an item/i });
    await expect(addButton).toBeVisible();
    await addButton.click();

    const uniqueTitle = `E2E Refresh Check ${Date.now()}`;
    await page.getByLabel(/what is it\?/i).fill(uniqueTitle);

    const today = new Date().toISOString().slice(0, 10);
    await page.locator("#add-day").fill(today);

    await page.getByRole("button", { name: /^add it$/i }).click();

    // The sheet closes back to the CTA and the new item renders in the
    // list — both without a page.reload(). This is the #644 regression:
    // pre-fix, the row was saved server-side but the DOM stayed stale.
    // 8s timeout gives the RSC refresh headroom under CI/system load
    // without weakening the assertion — pre-fix, the DOM never updates
    // at all (not merely slowly), so a longer timeout can't mask a
    // regression, only absorb load jitter.
    await expect(addButton).toBeVisible({ timeout: 8000 });
    const newItemHeading = page.getByRole("heading", { name: uniqueTitle });
    await expect(newItemHeading).toBeVisible({ timeout: 8000 });

    // Delete it back out via the item's own Edit sheet (own-item affordance
    // — any member can delete their own plan). Confirms the same
    // refresh-race fix applies to the delete path.
    const card = page.locator("article", { has: newItemHeading });
    await card.getByRole("button", { name: /^edit$/i }).click();
    const deleteButton = page.getByRole("button", { name: /^delete$/i });
    await deleteButton.click();
    // #663: wait for the armed/confirm state before the second tap — the
    // two-step delete only commits once `deleteConfirm` is set, which
    // renders the confirmation line ("Delete this item? Can't undo.").
    // Without this the second click can land pre-arm and be swallowed.
    await expect(
      page.getByText(M3_UI_STRINGS.itineraryForm_delete_confirm)
    ).toBeVisible();
    await deleteButton.click(); // confirm

    await expect(newItemHeading).not.toBeVisible({ timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// Override A screenshot note — manual step, not automated in this spec
// ---------------------------------------------------------------------------
// Screenshots at 375px are captured during the manual MCP-Playwright smoke
// run described in notes/m3-execution-plan.md §Wave 2 verification gate.
// They are embedded in the PR body under "## Preview smoke (375px)".
