/**
 * seed-test-user.ts
 *
 * Creates a deterministic test user via the Supabase Admin API and
 * generates a signed-in session for Playwright storage-state capture.
 *
 * Works against:
 *   - Local Supabase (`pnpm dlx supabase start`) — set NEXT_PUBLIC_SUPABASE_URL
 *     + SUPABASE_SERVICE_ROLE_KEY from the CLI output.
 *   - CI staging Supabase — env vars injected from GitHub secrets.
 *
 * The test user is deterministic (fixed email). If the user already
 * exists (from a prior run that didn't clean up), we reuse it.
 * Cleanup via `cleanupTestUser` in afterAll.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const TEST_USER_EMAIL =
  process.env.E2E_TEST_USER_EMAIL ?? "e2e-test@example.com";
export const TEST_USER_PASSWORD =
  process.env.E2E_TEST_USER_PASSWORD ?? "e2e-test-password-do-not-use-in-prod";

/**
 * Create (or reuse) a deterministic admin client.
 * autoRefreshToken and persistSession must be false — this client is
 * used server-side for seeding only, not for ongoing session management.
 */
function makeAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "seed-test-user: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export interface SeedResult {
  userId: string;
  email: string;
  /** Supabase access_token for the session (JWT). */
  accessToken: string;
  /** Supabase refresh_token for the session. */
  refreshToken: string;
}

/**
 * Mint or reuse the deterministic test user and produce a live session.
 *
 * Strategy:
 *   1. Try to create the user via `auth.admin.createUser` with
 *      `email_confirm: true`. If the email is already taken, Supabase
 *      returns a 422 with "User already registered" — we then look up
 *      the existing user by email via `auth.admin.listUsers`.
 *   2. Sign in with the deterministic password to obtain a real session
 *      (access_token + refresh_token). This avoids needing to intercept
 *      an actual magic-link email.
 *   3. Return the session tokens; the caller writes them into
 *      Playwright storage state.
 */
export async function seedTestUser(): Promise<SeedResult> {
  const admin = makeAdminClient();

  // Step 1: create (or find existing) user
  let userId: string;
  const { data: createData, error: createError } =
    await admin.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true,
    });

  if (createError) {
    // Supabase returns "A user with this email address has already been registered"
    // when the user exists from a prior run. Match on "already" to cover any
    // phrasing variation.
    const msg = createError.message.toLowerCase();
    if (!msg.includes("already") && !msg.includes("email address is already")) {
      throw new Error(
        `seed-test-user: createUser failed — ${createError.message}`
      );
    }
    // Look up existing user by email.
    const { data: listData, error: listError } =
      await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      throw new Error(
        `seed-test-user: listUsers failed — ${listError.message}`
      );
    }
    const existing = listData.users.find((u) => u.email === TEST_USER_EMAIL);
    if (!existing) {
      throw new Error(
        `seed-test-user: user ${TEST_USER_EMAIL} was not created but also not found in listUsers`
      );
    }
    userId = existing.id;

    // Ensure the existing user has a password set (may have been created
    // via magic-link originally).
    await admin.auth.admin.updateUserById(userId, {
      password: TEST_USER_PASSWORD,
      email_confirm: true,
    });
  } else {
    if (!createData.user) {
      throw new Error("seed-test-user: createUser returned no user object");
    }
    userId = createData.user.id;
  }

  // Step 2: sign in with password to get a real session
  const anonClient = createClient(
    SUPABASE_URL,
    // Use the anon key for sign-in — the anon key is what the browser
    // would use, so the session is browser-compatible.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: signInData, error: signInError } =
    await anonClient.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

  if (signInError) {
    throw new Error(
      `seed-test-user: signInWithPassword failed — ${signInError.message}`
    );
  }

  if (!signInData.session) {
    throw new Error("seed-test-user: signInWithPassword returned no session");
  }

  return {
    userId,
    email: TEST_USER_EMAIL,
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token,
  };
}

/**
 * Delete the test user and all their data. Call in `afterAll`.
 * Non-fatal if the user doesn't exist (idempotent cleanup).
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  const admin = makeAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !error.message.toLowerCase().includes("not found")) {
    // Log but don't throw — cleanup failure should not fail the test suite.
    console.error(`seed-test-user: cleanup failed for ${userId} — ${error.message}`);
  }
}
