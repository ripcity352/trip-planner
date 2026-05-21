/**
 * e2e/_setup/seed-test-celebrant.ts
 *
 * M4 seed script — creates a celebrant persona on the same trip as the
 * organizer, enabling cross-persona e2e testing.
 *
 * What it does:
 *   1. Reads the M4 test trip ID from `playwright/.auth/m4-env.json`
 *      (written by seed-test-organizer.ts) or from M4_TEST_TRIP_ID env var.
 *   2. Creates (or reuses) a deterministic celebrant test user.
 *   3. Upserts a trip_members row: role='attendee', is_celebrant=true.
 *   4. Writes a Playwright storage-state file so e2e specs can log in as
 *      the celebrant without a real browser sign-in flow.
 *   5. Appends M4_CELEBRANT_USER_ID to `playwright/.auth/m4-env.json`.
 *
 * PRECONDITION: seed-test-organizer.ts must have run first so the test
 * trip exists and m4-env.json is populated.
 *
 * Idempotent: safe to run multiple times — will not duplicate members.
 *
 * Usage (from project root):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm tsx e2e/_setup/seed-test-celebrant.ts
 *
 * NOT a test file — no describe/test/it blocks (Override C).
 */

import path from "node:path";
import fs from "node:fs";
import {
  makeAdminClient,
  seedUser,
  upsertMember,
  writeStorageState,
} from "./seed-m4-shared";
import { STORAGE_STATE_CELEBRANT_PATH } from "../../tests/fixtures/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CELEBRANT_EMAIL =
  process.env.M4_CELEBRANT_EMAIL ?? "m4-celebrant@example.com";

const CELEBRANT_PASSWORD =
  process.env.M4_CELEBRANT_PASSWORD ?? "m4-celebrant-password-do-not-use";

/** Path where the organizer seed wrote the shared trip/user IDs. */
const M4_ENV_PATH = path.resolve(
  __dirname,
  "../../playwright/.auth/m4-env.json"
);

// ---------------------------------------------------------------------------
// Trip ID resolution
// ---------------------------------------------------------------------------

/**
 * Reads the M4 test trip ID from either:
 *   1. M4_TEST_TRIP_ID environment variable (CI / manual override), or
 *   2. `playwright/.auth/m4-env.json` written by seed-test-organizer.ts.
 *
 * Throws if neither is available — the organizer seed must run first.
 */
function resolveM4TripId(): string {
  if (process.env.M4_TEST_TRIP_ID) {
    return process.env.M4_TEST_TRIP_ID;
  }

  if (fs.existsSync(M4_ENV_PATH)) {
    const raw = fs.readFileSync(M4_ENV_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed.M4_TEST_TRIP_ID) {
      return parsed.M4_TEST_TRIP_ID;
    }
  }

  throw new Error(
    "seed-test-celebrant: M4_TEST_TRIP_ID not found. " +
      "Run seed-test-organizer.ts first, or set M4_TEST_TRIP_ID in your environment."
  );
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export interface CelebrantSeedResult {
  userId: string;
  tripId: string;
  email: string;
}

/**
 * Seeds the celebrant persona and returns the resolved IDs.
 * Idempotent — safe to call multiple times.
 */
export async function seedTestCelebrant(): Promise<CelebrantSeedResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "seed-test-celebrant: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  const tripId = resolveM4TripId();

  const admin = makeAdminClient();

  console.log("[seed-test-celebrant] Seeding celebrant user...");
  const { userId, accessToken, refreshToken } = await seedUser(
    admin,
    CELEBRANT_EMAIL,
    CELEBRANT_PASSWORD
  );
  console.log(`[seed-test-celebrant] Celebrant user ID: ${userId}`);
  console.log(`[seed-test-celebrant] Using trip ID: ${tripId}`);

  console.log("[seed-test-celebrant] Upserting celebrant membership...");
  await upsertMember(admin, {
    tripId,
    userId,
    role: "attendee",
    isCelebrant: true,
  });

  console.log("[seed-test-celebrant] Writing celebrant storage state...");
  writeStorageState({
    outputPath: STORAGE_STATE_CELEBRANT_PATH,
    accessToken,
    refreshToken,
    baseUrl,
    supabaseUrl,
  });

  // Update m4-env.json with celebrant user ID so specs can read it
  if (fs.existsSync(M4_ENV_PATH)) {
    const raw = fs.readFileSync(M4_ENV_PATH, "utf-8");
    const existing = JSON.parse(raw) as Record<string, string>;
    const updated = { ...existing, M4_CELEBRANT_USER_ID: userId };
    fs.writeFileSync(M4_ENV_PATH, JSON.stringify(updated, null, 2), "utf-8");
    console.log(`[seed-test-celebrant] m4-env.json updated: ${M4_ENV_PATH}`);
  }

  return { userId, tripId, email: CELEBRANT_EMAIL };
}

// ---------------------------------------------------------------------------
// CLI entrypoint — run directly with `pnpm tsx`
// ---------------------------------------------------------------------------

const isMain = process.argv[1]?.endsWith("seed-test-celebrant.ts") ||
  process.argv[1]?.endsWith("seed-test-celebrant.js");

if (isMain) {
  seedTestCelebrant()
    .then(({ userId, tripId }) => {
      console.log(
        `[seed-test-celebrant] Done. userId=${userId} tripId=${tripId}`
      );
      console.log(
        `[seed-test-celebrant] Add to .env.local:\n  M4_CELEBRANT_USER_ID=${userId}`
      );
    })
    .catch((err) => {
      console.error("[seed-test-celebrant] FATAL:", err);
      process.exit(1);
    });
}
