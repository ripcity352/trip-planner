/**
 * e2e/_setup/seed-personas.ts
 *
 * Reusable persona seeding for the sweep e2e matrix. Builds on the M4
 * shared helpers (makeAdminClient, seedUser, writeStorageState) but adds
 * a membership upsert that carries an arbitrary rsvp_status per persona
 * (seed-m4-shared's upsertMember hardcodes 'going') and a per-persona
 * Playwright storage-state file.
 *
 * NOT a test file — no describe/test/it blocks.
 */

import path from "node:path";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedUser, writeStorageState } from "./seed-m4-shared";
import type { TripRole, RsvpStatus } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Deterministic UUID (RFC 4122 v5, SHA-1) — stable idempotency keys / IDs
// across re-runs so seeds never duplicate rows.
// ---------------------------------------------------------------------------

/** Fixed namespace UUID for all sweep-seed derived identifiers. */
const SWEEP_NAMESPACE = "6f8a1c2e-4b3d-4e5f-9a0b-1c2d3e4f5a6b";

/**
 * Derives a deterministic v5-style UUID from a namespace + name. Used for
 * idempotency_key columns so a re-run collides on the partial unique index
 * instead of inserting a duplicate.
 */
export function deterministicUuid(name: string, namespace = SWEEP_NAMESPACE): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(nsBytes)
    .update(name)
    .digest();
  const bytes = hash.subarray(0, 16);
  // Set version (5) and RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Membership upsert (rsvp-aware)
// ---------------------------------------------------------------------------

export interface PersonaMembershipSpec {
  tripId: string;
  userId: string;
  role: TripRole;
  rsvp: RsvpStatus;
  isCelebrant: boolean;
  displayName: string;
}

/**
 * Upserts a trip_members row carrying an explicit rsvp_status. Idempotent on
 * (trip_id, user_id): updates role/rsvp/is_celebrant/display_name in place.
 * Returns the member id (needed for splits, votes, reactions, days, lodging).
 */
export async function upsertMemberWithRsvp(
  admin: SupabaseClient,
  spec: PersonaMembershipSpec
): Promise<string> {
  const { tripId, userId, role, rsvp, isCelebrant, displayName } = spec;

  const { data: existing, error: findError } = await admin
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) {
    throw new Error(`upsertMemberWithRsvp: lookup failed — ${findError.message}`);
  }

  if (existing) {
    const { error: updateError } = await admin
      .from("trip_members")
      .update({
        role,
        rsvp_status: rsvp,
        is_celebrant: isCelebrant,
        display_name: displayName,
      })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`upsertMemberWithRsvp: update failed — ${updateError.message}`);
    }
    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await admin
    .from("trip_members")
    .insert({
      trip_id: tripId,
      user_id: userId,
      role,
      rsvp_status: rsvp,
      is_celebrant: isCelebrant,
      display_name: displayName,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(
      `upsertMemberWithRsvp: insert failed — ${insertError?.message ?? "no row"}`
    );
  }
  return inserted.id as string;
}

// ---------------------------------------------------------------------------
// Persona seeding
// ---------------------------------------------------------------------------

export interface SeedPersonaOpts {
  tripId: string;
  email: string;
  password: string;
  role: TripRole;
  rsvp: RsvpStatus;
  isCelebrant?: boolean;
  /** 'late' seeds a late-arrival flight leg (skipped for undated trips). */
  arrival?: "late";
}

export interface SeededPersona {
  /** Slug derived from the email local-part, e.g. "sweep-founder". */
  name: string;
  email: string;
  userId: string;
  memberId: string;
  role: TripRole;
  rsvp: RsvpStatus;
  isCelebrant: boolean;
  /** Absolute path to the Playwright storage-state file. */
  storageState: string;
}

/** Derives a filesystem-safe persona slug from an email address. */
function personaSlug(email: string): string {
  return email.split("@")[0].replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

/**
 * Seeds one persona: user (confirmed, password set) + membership (with
 * rsvp_status) + a Playwright storage-state file at
 * playwright/.auth/persona-<name>.json. If arrival==='late' and the trip
 * has a start date, also seeds a late-arrival flight leg.
 *
 * Idempotent — re-running updates in place and never duplicates rows.
 */
export async function seedPersona(
  admin: SupabaseClient,
  opts: SeedPersonaOpts
): Promise<SeededPersona> {
  const { tripId, email, password, role, rsvp } = opts;
  const isCelebrant = opts.isCelebrant ?? false;
  const name = personaSlug(email);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

  const { userId, accessToken, refreshToken } = await seedUser(
    admin,
    email,
    password
  );

  const displayName = name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const memberId = await upsertMemberWithRsvp(admin, {
    tripId,
    userId,
    role,
    rsvp,
    isCelebrant,
    displayName,
  });

  if (opts.arrival === "late") {
    await seedLateArrivalLeg(admin, tripId, memberId, userId, name);
  }

  const storageState = path.resolve(
    process.cwd(),
    "playwright/.auth",
    `persona-${name}.json`
  );
  writeStorageState({
    outputPath: storageState,
    accessToken,
    refreshToken,
    baseUrl,
    supabaseUrl,
  });

  return { name, email, userId, memberId, role, rsvp, isCelebrant, storageState };
}

/**
 * Seeds a flight leg that arrives after the trip has started (a late
 * arrival). No-op when the trip has no start date. Idempotent via a
 * deterministic idempotency_key.
 */
async function seedLateArrivalLeg(
  admin: SupabaseClient,
  tripId: string,
  memberId: string,
  userId: string,
  personaName: string
): Promise<void> {
  const { data: trip, error: tripError } = await admin
    .from("trips")
    .select("starts_at")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    throw new Error(
      `seedLateArrivalLeg: trip lookup failed — ${tripError?.message ?? "no row"}`
    );
  }
  if (!trip.starts_at) {
    return; // undated trip — nothing to be "late" relative to
  }

  const start = new Date(`${trip.starts_at as string}T00:00:00Z`);
  // Arrive the evening of day 2 — after the itinerary is already underway.
  const arriveAt = new Date(start);
  arriveAt.setUTCDate(arriveAt.getUTCDate() + 1);
  arriveAt.setUTCHours(22, 30, 0, 0);
  const departAt = new Date(arriveAt);
  departAt.setUTCHours(19, 0, 0, 0);

  const idempotencyKey = deterministicUuid(`travel-leg:late:${tripId}:${memberId}`);

  const { data: existing } = await admin
    .from("travel_legs")
    .select("id")
    .eq("trip_id", tripId)
    .eq("trip_member_id", memberId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) return;

  const { error } = await admin.from("travel_legs").insert({
    trip_id: tripId,
    trip_member_id: memberId,
    kind: "flight",
    depart_at: departAt.toISOString(),
    arrive_at: arriveAt.toISOString(),
    carrier: "Late Air",
    airline_iata: "LA",
    flight_number: "LA204",
    notes: `Late arrival — ${personaName} lands after day 1.`,
    idempotency_key: idempotencyKey,
  });

  if (error) {
    throw new Error(`seedLateArrivalLeg: insert failed — ${error.message}`);
  }
}
