/**
 * e2e/shopping-list.spec.ts — Task 8b (shopping-list v2 lifecycle walk).
 *
 * Rewritten from the v1 add → claim → got-it → undo walk (spec §10) to
 * drive the v2 state machine end to end: fast-add via the quick-add
 * input, assign to another member, complete via the who-completed
 * picker, remove, re-open with a note + assign, then filter to
 * In-progress. Mirrors the seeding pattern of every other
 * shopping-list e2e — a fresh trip via service-role (rather than the
 * shared fixture trip) so the item list starts empty and the flow is
 * deterministic — then signs in as the STORAGE_STATE_PATH fixture user
 * (organizer on the seeded trip).
 *
 * v2 needs a SECOND trip member (unlike v1's single-actor claim/unclaim)
 * so the assign/who-completed pickers have someone besides the viewer to
 * pick — `seedShoppingListTrip` creates a second `auth.users` row +
 * `trip_members` row with a deterministic `display_name`, and
 * `cleanupShoppingListSeed` deletes both the trip (cascades its members)
 * and that second auth user.
 *
 * Every transition is asserted on rendered state (role + accessible
 * name / text content), never on a timeout — the app routes every
 * mutation through `callAction` + `router.refresh()` with no optimistic
 * UI (except the row like button, untouched by this walk), so
 * Playwright's auto-retrying `expect(...).toBeVisible()` is what
 * actually waits out each round trip.
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_STATE_PATH } from "../tests/fixtures/auth";
import { TEST_USER_EMAIL } from "./_setup/seed-test-user";

import { A11Y_UI_STRINGS, SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const RUN_ID = Date.now().toString(36);
const ITEM_A = `Tequila run ${RUN_ID}`;
const ITEM_B = `Poker chips ${RUN_ID}`;
const REOPEN_NOTE = `Grabbed the wrong ones ${RUN_ID}`;
/** Deterministic per-run display name for the seeded second member. */
const MEMBER_B_NAME = `Riley ${RUN_ID}`;
const MEMBER_B_EMAIL = `shopping-list-e2e-member-b-${RUN_ID}@example.com`;

test.describe("Shopping list — v2 lifecycle (add → assign → complete → remove → re-open → filter)", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    storageState: STORAGE_STATE_PATH,
  });

  let seedSlug: string;
  let seedTripId: string;
  let memberBUserId: string;

  test.beforeAll(async () => {
    test.skip(
      !SUPABASE_URL || !SERVICE_ROLE_KEY,
      "Service-role key not configured — skipping shopping-list e2e."
    );

    const seeded = await seedShoppingListTrip();
    seedSlug = seeded.slug;
    seedTripId = seeded.tripId;
    memberBUserId = seeded.memberBUserId;
  });

  test.afterAll(async () => {
    if (SUPABASE_URL && SERVICE_ROLE_KEY && seedTripId) {
      await cleanupShoppingListSeed(seedTripId, memberBUserId);
    }
  });

  test("fast-add, assign, complete via picker, remove, re-open with note, filter to in-progress", async ({
    page,
  }) => {
    test.skip(!seedSlug, "Seed did not complete — check beforeAll.");

    await page.goto(`/trips/${seedSlug}/shopping-list`);
    await expect(
      page.getByRole("heading", { name: SHOPPING_LIST_UI_STRINGS.heading })
    ).toBeVisible({ timeout: 10_000 });

    const filterGroup = page.getByRole("group", {
      name: A11Y_UI_STRINGS.shoppingListFilterGroup,
    });

    // ---- 1. Fast-add two items via the quick-add input -----------------
    const quickAdd = page.getByLabel(SHOPPING_LIST_UI_STRINGS.quickAddPlaceholder);

    await quickAdd.fill(ITEM_A);
    await quickAdd.press("Enter");
    const rowA = page.getByRole("listitem").filter({ hasText: ITEM_A });
    await expect(rowA).toBeVisible({ timeout: 10_000 });
    await expect(
      rowA.getByText(SHOPPING_LIST_UI_STRINGS.stateOpen, { exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      rowA.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.completeAction })
    ).toBeVisible();

    await quickAdd.fill(ITEM_B);
    await quickAdd.press("Enter");
    const rowB = page.getByRole("listitem").filter({ hasText: ITEM_B });
    await expect(rowB).toBeVisible({ timeout: 10_000 });
    await expect(
      rowB.getByText(SHOPPING_LIST_UI_STRINGS.stateOpen, { exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // ---- 2. Assign item A to the second member --------------------------
    await rowA
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.itemMenu_aria })
      .click();
    await page
      .getByRole("menuitem", { name: SHOPPING_LIST_UI_STRINGS.assignAction })
      .click();
    await page.getByRole("menuitem", { name: MEMBER_B_NAME }).click();

    await expect(
      rowA.getByText(
        SHOPPING_LIST_UI_STRINGS.inProgressThem_template.replace(
          "{name}",
          MEMBER_B_NAME
        )
      )
    ).toBeVisible({ timeout: 10_000 });

    // ---- 3. Complete item A via the who-completed picker -----------------
    // The viewer isn't the claimer (member B is), so the primary
    // "Completed" button opens the who-completed picker instead of
    // completing immediately (spec §6). Two elements share the
    // "Completed" accessible name on an in_progress row — the leading
    // glyph (aria-label) and the primary action button (its own text) —
    // both wired to the same `handleComplete`, so `.first()` (the glyph)
    // resolves the strict-mode ambiguity without changing behavior.
    await rowA
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.completeAction })
      .first()
      .click();
    await page.getByRole("menuitem", { name: MEMBER_B_NAME }).click();

    await expect(
      rowA.getByText(
        SHOPPING_LIST_UI_STRINGS.completedBy_template.replace(
          "{name}",
          MEMBER_B_NAME
        )
      )
    ).toBeVisible({ timeout: 10_000 });
    await expect(rowA).toContainText("✓");

    // ---- 4. Remove item B (still Open, unassigned) -----------------------
    await rowB
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.itemMenu_aria })
      .click();
    await page
      .getByRole("menuitem", { name: SHOPPING_LIST_UI_STRINGS.deleteCta })
      .click();

    // Leaves the active (Open) segment.
    await filterGroup
      .getByRole("button", {
        name: new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateOpen}`),
      })
      .click();
    await expect(
      page.getByRole("listitem").filter({ hasText: ITEM_B })
    ).toHaveCount(0, { timeout: 10_000 });

    // ---- 5. Re-open item B via the Removed filter tab --------------------
    await filterGroup
      .getByRole("button", {
        name: new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateRemoved}`),
      })
      .click();
    const removedRowB = page.getByRole("listitem").filter({ hasText: ITEM_B });
    await expect(removedRowB).toBeVisible({ timeout: 10_000 });

    await removedRowB
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
      .click();

    // The reopen form: add a note, assign to member B, confirm.
    await removedRowB
      .getByLabel(SHOPPING_LIST_UI_STRINGS.reopenNotePlaceholder)
      .fill(REOPEN_NOTE);
    await removedRowB
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.assignOpenNoOne })
      .click();
    await page.getByRole("menuitem", { name: MEMBER_B_NAME }).click();
    // The row's own (hidden-while-open) reopen button is gone while the
    // form is mounted, so this is the form's confirm button.
    await removedRowB
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
      .click();

    // Returns to active — the Removed tab no longer shows it.
    await expect(
      page.getByRole("listitem").filter({ hasText: ITEM_B })
    ).toHaveCount(0, { timeout: 10_000 });

    // Confirm the note landed in the item's Notes thread (opens the
    // detail sheet from the "All" tab).
    await filterGroup
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.filterAll })
      .click();
    const allRowB = page.getByRole("listitem").filter({ hasText: ITEM_B });
    await expect(allRowB).toBeVisible({ timeout: 10_000 });
    await allRowB
      .getByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.openDetail_template.replace(
          "{name}",
          ITEM_B
        ),
      })
      .click();
    await expect(page.getByText(REOPEN_NOTE)).toBeVisible({ timeout: 10_000 });
    // Two elements share the "Close" accessible name: the full-screen
    // backdrop button (`absolute inset-0`, first in DOM, behind the dialog)
    // and the explicit X button inside `role="dialog"`. `.first()` resolves
    // to the backdrop, whose centre is occluded by the z-10 dialog body, so
    // the click is intercepted. Scope to the dialog to target the X button.
    await page
      .getByRole("dialog")
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.sheetClose_aria })
      .click();

    // ---- 6. Filter to In-progress — only item B (item A is Completed) ----
    await filterGroup
      .getByRole("button", {
        name: new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateInProgress}`),
      })
      .click();
    await expect(
      page.getByRole("listitem").filter({ hasText: ITEM_B })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("listitem").filter({ hasText: ITEM_A })
    ).toHaveCount(0, { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function makeAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function seedShoppingListTrip(): Promise<{
  slug: string;
  tripId: string;
  memberBUserId: string;
}> {
  const admin = makeAdminClient();

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

  const slug = `shopping-list-smoke-${RUN_ID}`;

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

  // Second member — the assign / who-completed pickers need someone
  // besides the viewer to pick. A fresh `auth.users` row (deterministic,
  // per-run email so parallel runs never collide) plus its
  // `trip_members` row, with `display_name` set directly so the roster
  // renders a stable, assertable name.
  const { data: memberBAuth, error: memberBAuthErr } =
    await admin.auth.admin.createUser({
      email: MEMBER_B_EMAIL,
      email_confirm: true,
    });
  if (memberBAuthErr || !memberBAuth.user) {
    throw new Error(
      `seedShoppingListTrip: createUser (member B) — ${memberBAuthErr?.message ?? "no user returned"}`
    );
  }

  const { error: memberBErr } = await admin.from("trip_members").insert({
    trip_id: tripRow.id,
    user_id: memberBAuth.user.id,
    role: "attendee",
    rsvp_status: "going",
    display_name: MEMBER_B_NAME,
  });
  if (memberBErr) {
    throw new Error(
      `seedShoppingListTrip: insert trip_members (member B) — ${memberBErr.message}`
    );
  }

  return {
    slug,
    tripId: tripRow.id as string,
    memberBUserId: memberBAuth.user.id,
  };
}

async function cleanupShoppingListSeed(
  tripId: string,
  memberBUserId: string | undefined
): Promise<void> {
  const admin = makeAdminClient();
  const { error } = await admin.from("trips").delete().eq("id", tripId);
  if (error) {
    console.error(
      `cleanupShoppingListSeed: failed to delete trip ${tripId} — ${error.message}`
    );
  }
  if (memberBUserId) {
    const { error: userErr } = await admin.auth.admin.deleteUser(memberBUserId);
    if (userErr && !userErr.message.toLowerCase().includes("not found")) {
      console.error(
        `cleanupShoppingListSeed: failed to delete member-B user ${memberBUserId} — ${userErr.message}`
      );
    }
  }
}
