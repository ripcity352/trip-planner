/**
 * e2e/shopping-list-social.spec.ts — P2-T7 (shopping-list PR2 social layer).
 *
 * Mirrors `e2e/shopping-list.spec.ts`'s seeding pattern: seeds its own
 * trip + item via service-role so the flow is deterministic, signs in as
 * the STORAGE_STATE_PATH fixture user, opens the item's detail sheet,
 * likes it (👍 in the sheet's full reaction strip), adds a note, then
 * deletes the note.
 *
 * Every transition is asserted on rendered state (text / aria-pressed /
 * role), never on a timeout — the reaction/note controls route through
 * `callAction` + `router.refresh()`, so Playwright's auto-retrying
 * `expect(...).toBeVisible()` / `toHaveAttribute()` is what actually
 * waits out each round trip (scripted-walk-hydration lesson: don't race
 * hydration with a raw click, assert the settled state instead).
 *
 * Uses LOCAL Supabase creds (`NEXT_PUBLIC_SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY` as configured for the local dev stack —
 * NOT `.env.local`, which holds prod creds in this worktree).
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_STATE_PATH } from "../tests/fixtures/auth";
import { TEST_USER_EMAIL } from "./_setup/seed-test-user";

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { SHOPPING_REACTION_ARIA } from "@/lib/reactions/shopping-constants";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ITEM_NAME = `Poker chips ${Date.now().toString(36)}`;
const NOTE_BODY = `Get the clay ones ${Date.now().toString(36)}`;

test.describe("Shopping list — item sheet social layer (react, note, delete note)", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    storageState: STORAGE_STATE_PATH,
  });

  let seedSlug: string;
  let seedTripId: string;

  test.beforeAll(async () => {
    test.skip(
      !SUPABASE_URL || !SERVICE_ROLE_KEY,
      "Service-role key not configured — skipping shopping-list-social e2e."
    );

    const { slug, tripId } = await seedShoppingSocialTrip();
    seedSlug = slug;
    seedTripId = tripId;
  });

  test.afterAll(async () => {
    if (SUPABASE_URL && SERVICE_ROLE_KEY && seedTripId) {
      await cleanupShoppingSocialSeed(seedTripId);
    }
  });

  test("open item, like it, add a note, then delete the note", async ({
    page,
  }) => {
    test.skip(!seedSlug, "Seed did not complete — check beforeAll.");

    await page.goto(`/trips/${seedSlug}/shopping-list`);
    await expect(
      page.getByRole("heading", { name: SHOPPING_LIST_UI_STRINGS.heading })
    ).toBeVisible({ timeout: 10_000 });

    // ---- Open the item's detail sheet -------------------------------
    const row = page.getByRole("listitem").filter({ hasText: ITEM_NAME });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row
      .getByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.openDetail_template.replace(
          "{name}",
          ITEM_NAME
        ),
      })
      .click();

    const sheetHeading = page.getByRole("heading", { name: ITEM_NAME });
    await expect(sheetHeading).toBeVisible({ timeout: 10_000 });

    // ---- React 👍 in the sheet's full reaction strip -----------------
    const reactionGroup = page.getByRole("group", {
      name: SHOPPING_LIST_UI_STRINGS.reactionsGroup_aria,
    });
    const likeButton = reactionGroup.getByRole("button", {
      name: SHOPPING_REACTION_ARIA["👍"],
    });
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });

    // ---- Add a note ----------------------------------------------------
    await page
      .getByLabel(SHOPPING_LIST_UI_STRINGS.notePlaceholder)
      .fill(NOTE_BODY);
    await page
      .getByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.noteComposerSubmit_aria,
      })
      .click();

    const noteText = page.getByText(NOTE_BODY);
    await expect(noteText).toBeVisible({ timeout: 10_000 });

    // ---- Delete the note ------------------------------------------------
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await page
      .getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.noteDelete_aria })
      .click();

    await expect(noteText).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(SHOPPING_LIST_UI_STRINGS.notesEmpty)
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedShoppingSocialTrip(): Promise<{
  slug: string;
  tripId: string;
}> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData, error: listErr } =
    await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    throw new Error(`seedShoppingSocialTrip: listUsers — ${listErr.message}`);
  }

  const testUser = listData.users.find((u) => u.email === TEST_USER_EMAIL);
  if (!testUser) {
    throw new Error(
      `seedShoppingSocialTrip: test user ${TEST_USER_EMAIL} not found. Run setup project first.`
    );
  }

  const slug = `shopping-social-smoke-${Date.now().toString(36)}`;

  const { data: tripRow, error: tripErr } = await admin
    .from("trips")
    .insert({
      slug,
      name: "Shopping Social Smoke",
      created_by: testUser.id,
      kind: "bachelor",
    })
    .select("id")
    .single();

  if (tripErr) {
    throw new Error(`seedShoppingSocialTrip: insert trips — ${tripErr.message}`);
  }

  const { data: memberRow, error: memberErr } = await admin
    .from("trip_members")
    .insert({
      trip_id: tripRow.id,
      user_id: testUser.id,
      role: "organizer",
      rsvp_status: "going",
    })
    .select("id")
    .single();

  if (memberErr) {
    throw new Error(
      `seedShoppingSocialTrip: insert trip_members — ${memberErr.message}`
    );
  }

  const { error: itemErr } = await admin.from("shopping_list_items").insert({
    trip_id: tripRow.id,
    created_by_trip_member_id: memberRow.id,
    name: ITEM_NAME,
  });

  if (itemErr) {
    throw new Error(
      `seedShoppingSocialTrip: insert shopping_list_items — ${itemErr.message}`
    );
  }

  return { slug, tripId: tripRow.id as string };
}

async function cleanupShoppingSocialSeed(tripId: string): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("trips").delete().eq("id", tripId);
  if (error) {
    console.error(
      `cleanupShoppingSocialSeed: failed to delete trip ${tripId} — ${error.message}`
    );
  }
}
