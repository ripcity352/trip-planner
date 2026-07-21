/**
 * e2e/realtime-announcements.spec.ts — #349 regression: authenticated
 * Realtime delivery across clients.
 *
 * Two-context spec: client A (organizer) posts an announcement; client B
 * (celebrant), already sitting on /announcements, must see it appear
 * WITHOUT a reload. Before the #349 fix every fresh-page-load
 * subscription joined its channel with anon JWT claims (supabase-js
 * never calls `realtime.setAuth()` on INITIAL_SESSION), the
 * `TO authenticated` RLS filtered every postgres_changes frame, and B
 * stayed frozen while the channel reported SUBSCRIBED.
 *
 * Requires the M4 persona fixtures (Override B):
 *   - seed-test-organizer.ts / seed-test-celebrant.ts have run (writes
 *     the two storage states + M4_TEST_TRIP_ID)
 *   - the local Supabase stack is up (Realtime included)
 * Skips cleanly when the fixtures are absent, same as the other
 * multi-persona specs.
 */

import {
  test,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import fs from "node:fs";

import {
  asOrganizer,
  asCelebrant,
  M4_TEST_TRIP_ID,
} from "../tests/fixtures/auth";
// The URL segment is the trip SLUG, not the UUID — pages resolve via
// getTripBySlug (see app/(authed)/trips/[tripId]/announcements/page.tsx).
import { M4_TEST_TRIP_SLUG } from "./_setup/seed-m4-shared";

const org = asOrganizer();
const cel = asCelebrant();

function fixturesAvailable(): boolean {
  return (
    fs.existsSync(org.storageState) &&
    fs.existsSync(cel.storageState) &&
    M4_TEST_TRIP_ID !== ""
  );
}

test.describe("realtime announcements — cross-client delivery (#349)", () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(
      !fixturesAvailable(),
      "M4 persona fixtures not available. Run seed-test-organizer.ts + seed-test-celebrant.ts first."
    );
  });

  test("watcher sees a fresh announcement without reloading", async ({
    browser,
  }) => {
    // Unique body so the assertion can't match a leftover row from a
    // previous run against the same seeded trip.
    const body = `Realtime check ${Date.now()}: heads up, the plan moved.`;

    // Client B (celebrant) opens the announcements page FIRST — its
    // subscription is the fresh-page-load case #349 describes.
    const contextB: BrowserContext = await browser.newContext({
      storageState: cel.storageState,
    });
    const pageB: Page = await contextB.newPage();
    await pageB.goto(`/trips/${M4_TEST_TRIP_SLUG}/announcements`);
    await expect(
      pageB.getByRole("heading", { name: /announcements/i })
    ).toBeVisible({ timeout: 10_000 });
    // Give the channel a beat to reach SUBSCRIBED with the upgraded
    // token — an INSERT that lands before the join is legitimately
    // missed (Realtime has no replay), which would fail this test for
    // the wrong reason.
    await pageB.waitForTimeout(2_000);

    // Client A (organizer) posts via the composer.
    const contextA: BrowserContext = await browser.newContext({
      storageState: org.storageState,
    });
    const pageA: Page = await contextA.newPage();
    await pageA.goto(`/trips/${M4_TEST_TRIP_SLUG}/announcements`);
    // #470: the composer defaults to a collapsed "Post an update" trigger —
    // tap it to expand the real form before interacting with the textarea.
    await pageA.getByRole("button", { name: "Post an update" }).click();
    const composer = pageA.getByPlaceholder("What's the update?");
    await expect(composer).toBeVisible({ timeout: 10_000 });
    await composer.fill(body);
    await pageA.getByRole("button", { name: "Send it" }).click();
    // A's own view folds the post in via the F2 prepend (not Realtime).
    await expect(pageA.getByText(body)).toBeVisible({ timeout: 10_000 });

    // THE regression assertion: B receives the postgres_changes INSERT
    // over the authenticated channel and renders it with NO reload.
    await expect(pageB.getByText(body)).toBeVisible({ timeout: 10_000 });

    await contextA.close();
    await contextB.close();
  });
});
