/**
 * e2e/shopping-list.spec.ts — Task 8 (shopping-list PR1).
 *
 * Mirrors the date-poll-bach.spec.ts pattern: seeds its own trip via
 * service-role (rather than reusing the shared fixture trip) so the
 * item list starts empty and the flow is deterministic, then signs in
 * as the STORAGE_STATE_PATH fixture user (organizer on the seeded
 * trip) to drive the full add → claim → got-it → undo round trip.
 *
 * Every transition is asserted on rendered state (text / checkbox
 * checked-ness), never on a timeout — each mutating control routes
 * through `callAction` + `router.refresh()` with no optimistic UI, so
 * Playwright's auto-retrying `expect(...).toBeVisible()` /
 * `toBeChecked()` is what actually waits out the round trip.
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_STATE_PATH } from "../tests/fixtures/auth";
import { TEST_USER_EMAIL } from "./_setup/seed-test-user";

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ITEM_NAME = `Tequila run ${Date.now().toString(36)}`;

test.describe("Shopping list — authenticated add → claim → got-it → undo", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    storageState: STORAGE_STATE_PATH,
  });

  let seedSlug: string;
  let seedTripId: string;

  test.beforeAll(async () => {
    test.skip(
      !SUPABASE_URL || !SERVICE_ROLE_KEY,
      "Service-role key not configured — skipping shopping-list e2e."
    );

    const { slug, tripId } = await seedShoppingListTrip();
    seedSlug = slug;
    seedTripId = tripId;
  });

  test.afterAll(async () => {
    if (SUPABASE_URL && SERVICE_ROLE_KEY && seedTripId) {
      await cleanupShoppingListSeed(seedTripId);
    }
  });

  test("add an item, claim it, mark got it, then undo", async ({ page }) => {
    test.skip(!seedSlug, "Seed did not complete — check beforeAll.");

    await page.goto(`/trips/${seedSlug}/shopping-list`);
    await expect(
      page.getByRole("heading", { name: SHOPPING_LIST_UI_STRINGS.heading })
    ).toBeVisible({ timeout: 10_000 });

    // ---- Add an item -----------------------------------------------
    await page
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.addCta })
      .click();

    await page
      .getByLabel(SHOPPING_LIST_UI_STRINGS.nameLabel)
      .fill(ITEM_NAME);

    await page
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.submitCta })
      .click();

    const row = page.getByRole("listitem").filter({ hasText: ITEM_NAME });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // ---- Claim it -----------------------------------------------------
    await row
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.claimCta })
      .click();

    await expect(
      row.getByText(SHOPPING_LIST_UI_STRINGS.claimedByYou)
    ).toBeVisible({ timeout: 10_000 });

    // ---- Mark got it — moves under the "Got it" divider, struck ------
    const gotItCheckbox = row.getByRole("checkbox", {
      name: SHOPPING_LIST_UI_STRINGS.gotIt,
    });
    await gotItCheckbox.click();
    await expect(gotItCheckbox).toBeChecked({ timeout: 10_000 });

    const dividerHeading = page.getByText(
      SHOPPING_LIST_UI_STRINGS.gotItDivider,
      { exact: true }
    );
    await expect(dividerHeading).toBeVisible({ timeout: 10_000 });

    // The row re-renders under the divider once bought=true: re-locate
    // it (React key is stable, but grab a fresh handle post-refresh)
    // and assert the struck-through name style + claim is read-only
    // (no "Off your plate." unclaim control under the divider).
    const boughtRow = page.getByRole("listitem").filter({ hasText: ITEM_NAME });
    await expect(boughtRow.getByText(ITEM_NAME)).toHaveClass(/line-through/, {
      timeout: 10_000,
    });
    await expect(
      boughtRow.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.unclaim })
    ).toHaveCount(0);

    // ---- Undo got it — returns to the active list ---------------------
    const boughtCheckbox = boughtRow.getByRole("checkbox", {
      name: SHOPPING_LIST_UI_STRINGS.gotIt,
    });
    await boughtCheckbox.click();
    await expect(boughtCheckbox).not.toBeChecked({ timeout: 10_000 });

    const activeRow = page.getByRole("listitem").filter({ hasText: ITEM_NAME });
    await expect(activeRow.getByText(ITEM_NAME)).not.toHaveClass(
      /line-through/,
      { timeout: 10_000 }
    );
    // Claim survived the got-it round trip (gap-E: independent columns)
    // and is editable again now that the row is back in the active list.
    await expect(
      activeRow.getByText(SHOPPING_LIST_UI_STRINGS.claimedByYou)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      activeRow.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.unclaim })
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedShoppingListTrip(): Promise<{
  slug: string;
  tripId: string;
}> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData, error: listErr } =
    await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    throw new Error(`seedShoppingListTrip: listUsers — ${listErr.message}`);
  }

  const testUser = listData.users.find((u) => u.email === TEST_USER_EMAIL);
  if (!testUser) {
    throw new Error(
      `seedShoppingListTrip: test user ${TEST_USER_EMAIL} not found. Run setup project first.`
    );
  }

  const slug = `shopping-list-smoke-${Date.now().toString(36)}`;

  const { data: tripRow, error: tripErr } = await admin
    .from("trips")
    .insert({
      slug,
      name: "Shopping List Smoke",
      created_by: testUser.id,
      kind: "bachelor",
    })
    .select("id")
    .single();

  if (tripErr) {
    throw new Error(`seedShoppingListTrip: insert trips — ${tripErr.message}`);
  }

  const { error: memberErr } = await admin.from("trip_members").insert({
    trip_id: tripRow.id,
    user_id: testUser.id,
    role: "organizer",
    rsvp_status: "going",
  });

  if (memberErr) {
    throw new Error(
      `seedShoppingListTrip: insert trip_members — ${memberErr.message}`
    );
  }

  return { slug, tripId: tripRow.id as string };
}

async function cleanupShoppingListSeed(tripId: string): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("trips").delete().eq("id", tripId);
  if (error) {
    console.error(
      `cleanupShoppingListSeed: failed to delete trip ${tripId} — ${error.message}`
    );
  }
}
