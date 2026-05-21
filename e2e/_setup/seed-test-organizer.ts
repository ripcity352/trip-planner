/**
 * e2e/_setup/seed-test-organizer.ts
 *
 * M4 seed script — creates a test trip and an organizer persona for
 * cross-persona e2e testing.
 *
 * What it does:
 *   1. Creates (or reuses) a deterministic organizer test user.
 *   2. Creates (or reuses) the M4 test trip ("M4 test trip — organizer").
 *   3. Upserts a trip_members row: role='organizer', is_celebrant=false.
 *   4. Writes a Playwright storage-state file so e2e specs can log in as
 *      the organizer without a real browser sign-in flow.
 *   5. Writes M4_TEST_TRIP_ID and M4_ORGANIZER_USER_ID to
 *      `playwright/.auth/m4-env.json` for the celebrant seed to read.
 *
 * Idempotent: safe to run multiple times — will not duplicate trips or members.
 *
 * Run order: this script MUST run before seed-test-celebrant.ts because
 * the celebrant seed depends on M4_TEST_TRIP_ID (created here).
 *
 * Usage (from project root):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm tsx e2e/_setup/seed-test-organizer.ts
 *
 * Or invoke from the Playwright setup project (add to playwright.config.ts
 * globalSetup if needed for M4 wave 1+).
 *
 * NOT a test file — no describe/test/it blocks (Override C).
 */

import path from "node:path";
import fs from "node:fs";
import {
  makeAdminClient,
  seedUser,
  ensureM4TestTrip,
  upsertMember,
  writeStorageState,
} from "./seed-m4-shared";
import { STORAGE_STATE_ORGANIZER_PATH } from "../../tests/fixtures/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ORGANIZER_EMAIL =
  process.env.M4_ORGANIZER_EMAIL ?? "m4-organizer@example.com";

const ORGANIZER_PASSWORD =
  process.env.M4_ORGANIZER_PASSWORD ?? "m4-organizer-password-do-not-use";

/** Path where the organizer seed writes trip/user IDs for the celebrant seed. */
const M4_ENV_PATH = path.resolve(
  __dirname,
  "../../playwright/.auth/m4-env.json"
);

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export interface OrganizerSeedResult {
  userId: string;
  tripId: string;
  email: string;
}

/**
 * Seeds the organizer persona and returns the resolved IDs.
 * Idempotent — safe to call multiple times.
 */
export async function seedTestOrganizer(): Promise<OrganizerSeedResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "seed-test-organizer: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  const admin = makeAdminClient();

  console.log("[seed-test-organizer] Seeding organizer user...");
  const { userId, accessToken, refreshToken } = await seedUser(
    admin,
    ORGANIZER_EMAIL,
    ORGANIZER_PASSWORD
  );
  console.log(`[seed-test-organizer] Organizer user ID: ${userId}`);

  console.log("[seed-test-organizer] Ensuring M4 test trip exists...");
  const tripId = await ensureM4TestTrip(admin, userId);
  console.log(`[seed-test-organizer] Trip ID: ${tripId}`);

  console.log("[seed-test-organizer] Upserting organizer membership...");
  await upsertMember(admin, {
    tripId,
    userId,
    role: "organizer",
    isCelebrant: false,
  });

  console.log("[seed-test-organizer] Writing organizer storage state...");
  writeStorageState({
    outputPath: STORAGE_STATE_ORGANIZER_PATH,
    accessToken,
    refreshToken,
    baseUrl,
    supabaseUrl,
  });

  // Write m4-env.json so seed-test-celebrant.ts can read the trip ID
  // without needing a separate DB lookup or env var injection.
  const m4Env = {
    M4_TEST_TRIP_ID: tripId,
    M4_ORGANIZER_USER_ID: userId,
  };
  const m4EnvDir = path.dirname(M4_ENV_PATH);
  if (!fs.existsSync(m4EnvDir)) {
    fs.mkdirSync(m4EnvDir, { recursive: true });
  }
  fs.writeFileSync(M4_ENV_PATH, JSON.stringify(m4Env, null, 2), "utf-8");
  console.log(`[seed-test-organizer] m4-env.json written to: ${M4_ENV_PATH}`);

  return { userId, tripId, email: ORGANIZER_EMAIL };
}

// ---------------------------------------------------------------------------
// CLI entrypoint — run directly with `pnpm tsx`
// ---------------------------------------------------------------------------

// Detect if this file is the entry point (not imported)
const isMain = process.argv[1]?.endsWith("seed-test-organizer.ts") ||
  process.argv[1]?.endsWith("seed-test-organizer.js");

if (isMain) {
  seedTestOrganizer()
    .then(({ userId, tripId }) => {
      console.log(
        `[seed-test-organizer] Done. userId=${userId} tripId=${tripId}`
      );
      console.log(
        `[seed-test-organizer] Add to .env.local:\n  M4_ORGANIZER_USER_ID=${userId}\n  M4_TEST_TRIP_ID=${tripId}`
      );
    })
    .catch((err) => {
      console.error("[seed-test-organizer] FATAL:", err);
      process.exit(1);
    });
}
