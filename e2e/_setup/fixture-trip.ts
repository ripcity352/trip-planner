/**
 * fixture-trip.ts
 *
 * F10 #6 root cause: several specs navigate to `/trips` as the
 * STORAGE_STATE_PATH fixture user and grab "the first trip link" via
 * `page.locator('a[href*="/trips/"]').first()`. That selector also
 * matches the "New trip" CTA (`href="/trips/new"`), and the fixture user
 * (created fresh by `seed-test-user.ts`, deterministic email, no trips)
 * has nothing else to match — so the locator resolves to the CTA and
 * specs navigate to bogus URLs like `/trips/new/itinerary`, which 404.
 *
 * Fix at the pattern level, not per-spec:
 *   1. `ensureFixtureTrip` — called once from `auth.setup.ts` right after
 *      the fixture user's session is minted. Guarantees the fixture user
 *      is an organizer member of at least one real (non-deleted) trip,
 *      seeding one if none exists. Idempotent — reuses an existing
 *      membership on subsequent runs so repeat local runs don't
 *      accumulate trip rows.
 *   2. `firstRealTripLink` — the one correct "find a trip" locator every
 *      spec should use instead of the bare `a[href*="/trips/"]` pattern.
 *      Excludes `/trips/new` explicitly (mirrors the pattern
 *      `touch-targets.spec.ts` already used correctly).
 */

import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Trip name used when `ensureFixtureTrip` has to seed a fresh trip. */
export const FIXTURE_TRIP_NAME = "E2E Fixture Trip";

function makeAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "fixture-trip: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface FixtureTrip {
  slug: string;
  tripId: string;
}

/**
 * Ensure `userId` (the STORAGE_STATE_PATH fixture persona) is an
 * organizer member of at least one non-deleted trip. Seeds one via the
 * service-role REST/JS API if none exists yet. Safe to call on every
 * `auth.setup.ts` run — it's a no-op (one SELECT) once a trip exists.
 */
export async function ensureFixtureTrip(userId: string): Promise<FixtureTrip> {
  const admin = makeAdminClient();

  const { data: memberships, error: memberErr } = await admin
    .from("trip_members")
    .select("trip_id")
    .eq("user_id", userId);
  if (memberErr) {
    throw new Error(
      `ensureFixtureTrip: trip_members lookup failed — ${memberErr.message}`
    );
  }

  if (memberships && memberships.length > 0) {
    const tripIds = memberships.map((m) => m.trip_id as string);
    const { data: trips, error: tripsErr } = await admin
      .from("trips")
      .select("id, slug")
      .in("id", tripIds)
      .is("deleted_at", null)
      .limit(1);
    if (tripsErr) {
      throw new Error(`ensureFixtureTrip: trips lookup failed — ${tripsErr.message}`);
    }
    if (trips && trips.length > 0) {
      return { slug: trips[0].slug as string, tripId: trips[0].id as string };
    }
  }

  // No active trip yet — seed one. Unique slug so repeat seeds (e.g. a
  // prior run's trip was manually deleted) never collide.
  const slug = `e2e-fixture-${Date.now().toString(36)}`;
  const { data: trip, error: tripErr } = await admin
    .from("trips")
    .insert({
      slug,
      name: FIXTURE_TRIP_NAME,
      created_by: userId,
      kind: "bachelor",
    })
    .select("id")
    .single();
  if (tripErr) {
    throw new Error(`ensureFixtureTrip: insert trips failed — ${tripErr.message}`);
  }

  const { error: insertMemberErr } = await admin.from("trip_members").insert({
    trip_id: trip.id,
    user_id: userId,
    role: "organizer",
    rsvp_status: "going",
  });
  if (insertMemberErr) {
    throw new Error(
      `ensureFixtureTrip: insert trip_members failed — ${insertMemberErr.message}`
    );
  }

  return { slug, tripId: trip.id as string };
}

/**
 * The one correct "find a real trip" locator. Excludes `/trips/new` —
 * bare `a[href*="/trips/"]` matches the "New trip" CTA too, which is the
 * F10 #6 root cause. Every "find a trip" e2e path should use this
 * instead of hand-rolling the selector.
 */
export function firstRealTripLink(page: Page) {
  return page.locator('a[href*="/trips/"]:not([href="/trips/new"])').first();
}
