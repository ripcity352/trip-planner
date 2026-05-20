/**
 * Playwright smoke for the celebrant-weighted date poll (M2 Wave 3,
 * #75 + #76).
 *
 * Scope:
 *   - Unauthenticated visit to `/trips/<slug>/dates` is bounced by
 *     the authed layout.
 *   - Authenticated multi-actor flow:
 *       1. Celebrant seeds a trip via service-role.
 *       2. Celebrant visits /trips/<slug>/dates — heading renders.
 *       3. No candidates yet — empty state copy renders.
 *
 * The two-context realtime test (celebrant flips no-go, member sees it
 * within 2s in a second tab) remains deferred. It depends on a
 * multi-browser-context harness that doesn't exist yet. The spec
 * stays as a documented TODO contract.
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_STATE_PATH } from "../tests/fixtures/auth";
import { TEST_USER_EMAIL } from "./_setup/seed-test-user";

import { M2_UI_STRINGS } from "@/lib/copy/empty-states";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ---------------------------------------------------------------------------
// Unauthenticated smoke
// ---------------------------------------------------------------------------

test.describe("Date poll — unauthenticated", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("unauthenticated visit to /trips/<slug>/dates is bounced by the authed layout", async ({
    page,
  }) => {
    await page.goto("/trips/any-slug/dates");
    await expect(
      page.getByRole("heading", { name: M2_UI_STRINGS.datePoll_heading })
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Authenticated smoke (requires storage-state fixture)
// ---------------------------------------------------------------------------

test.describe("Date poll — authenticated celebrant", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    storageState: STORAGE_STATE_PATH,
  });

  let seedSlug: string;
  let seedTripId: string;

  test.beforeAll(async () => {
    test.skip(
      !SUPABASE_URL || !SERVICE_ROLE_KEY,
      "Service-role key not configured — skipping authenticated date-poll path."
    );

    const { slug, tripId } = await seedDatePollTrip();
    seedSlug = slug;
    seedTripId = tripId;
  });

  test.afterAll(async () => {
    if (SUPABASE_URL && SERVICE_ROLE_KEY && seedTripId) {
      await cleanupDatePollSeed(seedTripId);
    }
  });

  test("authenticated user visits /dates and sees the date poll heading", async ({
    page,
  }) => {
    test.skip(!seedSlug, "Seed did not complete — check beforeAll.");

    await page.goto(`/trips/${seedSlug}/dates`);
    await expect(
      page.getByRole("heading", { name: M2_UI_STRINGS.datePoll_heading })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("no candidates yet — empty state renders", async ({ page }) => {
    test.skip(!seedSlug, "Seed did not complete — check beforeAll.");

    await page.goto(`/trips/${seedSlug}/dates`);
    await expect(
      page.getByText(M2_UI_STRINGS.datePoll_no_candidates_yet)
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Deferred: realtime multi-context test (documented TODO contract)
// ---------------------------------------------------------------------------

test.describe("Date poll — realtime (deferred)", () => {
  // Deferred — requires a multi-browser-context Playwright harness.
  // The spec stays here as a TODO contract. When the harness lands,
  // only the fixture wiring and assertion implementation are needed.
  //
  // Contract:
  //   1. Open two browser contexts (A = celebrant, B = non-celebrant member).
  //   2. Celebrant proposes a candidate window.
  //   3. Celebrant marks it "Hard pass" (no-go).
  //   4. Assert: within 2s, context B's /dates view no longer shows that window.
  //
  // See m2-execution-plan.md and the original date-poll-bach.spec.ts comments.
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedDatePollTrip(): Promise<{ slug: string; tripId: string }> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData, error: listErr } =
    await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    throw new Error(`seedDatePollTrip: listUsers — ${listErr.message}`);
  }

  const testUser = listData.users.find((u) => u.email === TEST_USER_EMAIL);
  if (!testUser) {
    throw new Error(
      `seedDatePollTrip: test user ${TEST_USER_EMAIL} not found. Run setup project first.`
    );
  }

  const slug = `date-poll-smoke-${Date.now().toString(36)}`;

  const { data: tripRow, error: tripErr } = await admin
    .from("trips")
    .insert({
      slug,
      name: "Date Poll Smoke",
      created_by: testUser.id,
      kind: "bachelor",
    })
    .select("id")
    .single();

  if (tripErr) {
    throw new Error(`seedDatePollTrip: insert trips — ${tripErr.message}`);
  }

  const { error: memberErr } = await admin.from("trip_members").insert({
    trip_id: tripRow.id,
    user_id: testUser.id,
    role: "organizer",
    is_celebrant: true,
    rsvp_status: "going",
  });

  if (memberErr) {
    throw new Error(`seedDatePollTrip: insert trip_members — ${memberErr.message}`);
  }

  return { slug, tripId: tripRow.id as string };
}

async function cleanupDatePollSeed(tripId: string): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("trips").delete().eq("id", tripId);
  if (error) {
    console.error(
      `cleanupDatePollSeed: failed to delete trip ${tripId} — ${error.message}`
    );
  }
}
