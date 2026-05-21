/**
 * tests/fixtures/auth.ts
 *
 * Single source of truth for auth storage-state paths and multi-persona
 * helpers introduced in M4.
 *
 * M3 (single persona):
 *   `e2e/_setup/auth.setup.ts` writes `STORAGE_STATE_PATH`.
 *   Specs use `test.use({ storageState: STORAGE_STATE_PATH })`.
 *
 * M4 (multi-persona, Override B):
 *   `e2e/_setup/seed-test-organizer.ts` writes `STORAGE_STATE_ORGANIZER_PATH`.
 *   `e2e/_setup/seed-test-celebrant.ts` writes `STORAGE_STATE_CELEBRANT_PATH`.
 *   Both seed scripts ensure their test user is a member of M4_TEST_TRIP_ID.
 *   Specs that need cross-persona e2e call `asOrganizer()` / `asCelebrant()`
 *   and use the returned `storageState` path:
 *
 *     const org = asOrganizer();
 *     test.use({ storageState: org.storageState });
 *
 * Back-compat: M3 `STORAGE_STATE_PATH` is unchanged — all existing specs
 * that use it continue to work without modification.
 */

import path from "node:path";
import type { TripRole } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// M3 back-compat — single-persona storage state (do NOT remove)
// ---------------------------------------------------------------------------

/**
 * Absolute path to the Playwright storage-state file emitted by the M3
 * `setup` project. Gitignored under `playwright/.auth/`.
 */
export const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  "../../playwright/.auth/storage-state.json"
);

// ---------------------------------------------------------------------------
// M4 paths — organizer + celebrant personas
// ---------------------------------------------------------------------------

/**
 * Storage-state file for the organizer persona.
 * Written by `e2e/_setup/seed-test-organizer.ts`.
 */
export const STORAGE_STATE_ORGANIZER_PATH = path.resolve(
  __dirname,
  "../../playwright/.auth/storage-state-organizer.json"
);

/**
 * Storage-state file for the celebrant persona.
 * Written by `e2e/_setup/seed-test-celebrant.ts`.
 */
export const STORAGE_STATE_CELEBRANT_PATH = path.resolve(
  __dirname,
  "../../playwright/.auth/storage-state-celebrant.json"
);

// ---------------------------------------------------------------------------
// M4 user IDs — sourced from env vars written by the seed scripts.
// Empty strings before seeding; valid UUIDs after `seed-test-*.ts` runs.
// ---------------------------------------------------------------------------

/** Supabase auth UID for the organizer test user. */
export const ORGANIZER_USER_ID: string =
  process.env.M4_ORGANIZER_USER_ID ?? "";

/** Supabase auth UID for the celebrant test user. */
export const CELEBRANT_USER_ID: string =
  process.env.M4_CELEBRANT_USER_ID ?? "";

// ---------------------------------------------------------------------------
// M4 shared trip — both personas are members of the same trip.
// Populated by seed-test-organizer.ts; read by seed-test-celebrant.ts
// and all M4+ e2e specs via M4_TEST_TRIP_ID env var.
// ---------------------------------------------------------------------------

/** Supabase trip ID shared by all M4 cross-persona e2e tests. */
export const M4_TEST_TRIP_ID: string = process.env.M4_TEST_TRIP_ID ?? "";

// ---------------------------------------------------------------------------
// Role constants — document the expected DB state for each persona
// ---------------------------------------------------------------------------

/** trip_members.role value for the organizer test user. */
export const ORGANIZER_ROLE: TripRole = "organizer";

/** trip_members.is_celebrant value for the organizer test user. */
export const ORGANIZER_IS_CELEBRANT = false as const;

/**
 * trip_members.role value for the celebrant test user.
 * "attendee" maps to the TripRole union; is_celebrant=true distinguishes
 * the celebrant from a regular attendee.
 */
export const CELEBRANT_ROLE: TripRole = "attendee";

/** trip_members.is_celebrant value for the celebrant test user. */
export const CELEBRANT_IS_CELEBRANT = true as const;

// ---------------------------------------------------------------------------
// PersonaContext — return type for asOrganizer() / asCelebrant()
// ---------------------------------------------------------------------------

/**
 * Describes a resolved test persona: storage-state path + expected DB
 * membership state. Pass `storageState` to `test.use({ storageState })`.
 */
export interface PersonaContext {
  /** Path to the Playwright storage-state JSON for this persona. */
  storageState: string;
  /** Supabase auth UID (empty string if seeding hasn't run yet). */
  userId: string;
  /** The M4 shared test trip ID (empty string if seeding hasn't run yet). */
  tripId: string;
  /** Expected trip_members.role for this persona. */
  role: TripRole;
  /** Expected trip_members.is_celebrant for this persona. */
  isCelebrant: boolean;
}

// ---------------------------------------------------------------------------
// Helpers — call in e2e specs to get the right persona context
// ---------------------------------------------------------------------------

/**
 * Returns the organizer persona context.
 *
 * Usage in e2e spec:
 *   const org = asOrganizer();
 *   test.use({ storageState: org.storageState });
 */
export function asOrganizer(): PersonaContext {
  return {
    storageState: STORAGE_STATE_ORGANIZER_PATH,
    userId: ORGANIZER_USER_ID,
    tripId: M4_TEST_TRIP_ID,
    role: ORGANIZER_ROLE,
    isCelebrant: ORGANIZER_IS_CELEBRANT,
  };
}

/**
 * Returns the celebrant persona context.
 *
 * Usage in e2e spec:
 *   const cel = asCelebrant();
 *   test.use({ storageState: cel.storageState });
 */
export function asCelebrant(): PersonaContext {
  return {
    storageState: STORAGE_STATE_CELEBRANT_PATH,
    userId: CELEBRANT_USER_ID,
    tripId: M4_TEST_TRIP_ID,
    role: CELEBRANT_ROLE,
    isCelebrant: CELEBRANT_IS_CELEBRANT,
  };
}
