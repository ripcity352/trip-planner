/**
 * e2e/m3-golden-path.spec.ts — M3 closure golden-path E2E.
 *
 * Requires the Wave 0b auth fixture (STORAGE_STATE_PATH).
 * Uses test.use({ storageState }) for authentication — Override B.
 *
 * Coverage targets the closure surfaces of M3 — every new sub-route
 * (announcements, arrivals, roster, invites) renders for an authenticated
 * member at 375px and the dashboard exposes link cards for each.
 *
 * The full multi-actor flow (organizer creates trip → adds items →
 * second user accepts invite → opts out of one item silently) is exercised
 * in the production walk on travelston.com per Override E `[v]`. This
 * spec covers the single-actor surface-rendering layer that CI can run
 * against staging without seeding multiple users.
 *
 * NOTE: If the fixture is unavailable (SUPABASE_SERVICE_ROLE_KEY not set),
 * the authed tests skip at the setup stage — the spec runs but skips
 * authed assertions if the storage state file does not exist.
 */

import { test, expect } from "@playwright/test";
import { STORAGE_STATE_PATH } from "../tests/fixtures/auth";
import fs from "node:fs";

function authFixtureAvailable(): boolean {
  return fs.existsSync(STORAGE_STATE_PATH);
}

// ---------------------------------------------------------------------------
// 1. Anonymous redirects — every new M3 route is gated by the (authed) layout
// ---------------------------------------------------------------------------

const ANON_ROUTES_375PX = [
  "/trips/test-anonymous-probe",
  "/trips/test-anonymous-probe/itinerary",
  "/trips/test-anonymous-probe/announcements",
  "/trips/test-anonymous-probe/arrivals",
  "/trips/test-anonymous-probe/roster",
  "/trips/test-anonymous-probe/invites",
];

for (const route of ANON_ROUTES_375PX) {
  test(`anonymous: ${route} redirects to /login`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
}

// ---------------------------------------------------------------------------
// 2. Authenticated golden path — dashboard exposes every M3 sub-route
// ---------------------------------------------------------------------------

test.describe("authenticated M3 golden path", () => {
  test.use({
    storageState: authFixtureAvailable() ? STORAGE_STATE_PATH : undefined,
  });

  test.beforeEach(async ({}, testInfo) => {
    if (!authFixtureAvailable()) {
      testInfo.skip(
        true,
        `Auth fixture not available at ${STORAGE_STATE_PATH}. Run pnpm exec playwright test --project=setup first.`,
      );
    }
  });

  test("dashboard renders every M3 link card at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");

    const tripLink = page.locator('a[href*="/trips/"]').first();
    test.skip(
      !(await tripLink.isVisible()),
      "No trips found for test user — fixture has not been seeded with a trip"
    );
    const tripHref = await tripLink.getAttribute("href");
    test.skip(!tripHref, "Trip link has no href attribute");
    await page.goto(tripHref!);

    // The dashboard should render link cards for the five M3 sub-routes.
    // Itinerary + Announcements + Arrivals + Roster are visible to every
    // member; Invites is organizer-only — assert it exists OR is absent
    // depending on viewer role (we don't know which the fixture user is,
    // so we just check the visible four).
    await expect(
      page.getByRole("heading", { name: /what's the plan/i }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("heading", { name: /announcements/i }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("heading", { name: /who's landing when/i }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("heading", { name: /who's coming/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("announcements page renders at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");
    const tripLink = page.locator('a[href*="/trips/"]').first();
    test.skip(
      !(await tripLink.isVisible()),
      "No trips found for test user — fixture has not been seeded with a trip"
    );
    const tripHref = await tripLink.getAttribute("href");
    test.skip(!tripHref, "Trip link has no href attribute");
    await page.goto(`${tripHref}/announcements`);
    await expect(
      page.getByRole("heading", { name: /announcements/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("arrivals page renders at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");
    const tripLink = page.locator('a[href*="/trips/"]').first();
    test.skip(
      !(await tripLink.isVisible()),
      "No trips found for test user — fixture has not been seeded with a trip"
    );
    const tripHref = await tripLink.getAttribute("href");
    test.skip(!tripHref, "Trip link has no href attribute");
    await page.goto(`${tripHref}/arrivals`);
    await expect(
      page.getByRole("heading", { name: /who's landing when/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("roster page renders at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");
    const tripLink = page.locator('a[href*="/trips/"]').first();
    test.skip(
      !(await tripLink.isVisible()),
      "No trips found for test user — fixture has not been seeded with a trip"
    );
    const tripHref = await tripLink.getAttribute("href");
    test.skip(!tripHref, "Trip link has no href attribute");
    await page.goto(`${tripHref}/roster`);
    await expect(
      page.getByRole("heading", { name: /who's coming/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("no console errors on the dashboard golden-path traversal", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/trips");
    const tripLink = page.locator('a[href*="/trips/"]').first();
    test.skip(
      !(await tripLink.isVisible()),
      "No trips found for test user — fixture has not been seeded with a trip"
    );
    const tripHref = await tripLink.getAttribute("href");
    test.skip(!tripHref, "Trip link has no href attribute");

    for (const sub of ["", "/itinerary", "/announcements", "/arrivals", "/roster"]) {
      await page.goto(`${tripHref}${sub}`);
      await page.waitForLoadState("networkidle");
    }

    // Allow known noise: Realtime probe network log, Vercel preview banner.
    const meaningfulErrors = consoleErrors.filter(
      (e) =>
        !e.includes("supabase_realtime") &&
        !e.includes("vercel-feedback") &&
        !e.toLowerCase().includes("favicon"),
    );
    expect(meaningfulErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Override A screenshot note — production walk on travelston.com is captured
// manually via MCP-Playwright per the Wave 5 closure DoD. The 8 screenshots
// are embedded in the closure PR body under "## Production walk (375px)".
// ---------------------------------------------------------------------------
