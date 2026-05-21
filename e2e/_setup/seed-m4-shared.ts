/**
 * e2e/_setup/seed-m4-shared.ts
 *
 * Shared utilities for M4 multi-persona seed scripts.
 * Used by seed-test-organizer.ts and seed-test-celebrant.ts.
 *
 * Responsibilities:
 *   - Admin client factory (service-role key, no session persistence).
 *   - Cookie injection helper for Playwright storage-state capture.
 *   - Deterministic trip lookup/creation (idempotent by name).
 *   - Idempotent trip_members upsert.
 *
 * NOT a test file — no describe/test/it blocks.
 */

import path from "node:path";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TripRole } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Deterministic test trip name — used for idempotent lookup. */
export const M4_TEST_TRIP_NAME = "M4 test trip — organizer";
export const M4_TEST_TRIP_SLUG = "m4-test-trip-organizer";

// ---------------------------------------------------------------------------
// Admin client
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client with the service-role key.
 * autoRefreshToken and persistSession must be false for server-side use.
 */
export function makeAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "seed-m4-shared: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// User seeding
// ---------------------------------------------------------------------------

export interface SeededUser {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Creates (or reuses) a deterministic test user via Supabase Admin API and
 * returns a live session.
 *
 * Idempotent: if the user already exists from a prior run, we reuse it.
 */
export async function seedUser(
  admin: SupabaseClient,
  email: string,
  password: string
): Promise<SeededUser> {
  // Step 1: create user (or find existing)
  let userId: string;

  const { data: createData, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError) {
    const msg = createError.message.toLowerCase();
    if (!msg.includes("already") && !msg.includes("email address is already")) {
      throw new Error(`seedUser: createUser failed — ${createError.message}`);
    }

    // User exists — look up by email
    const { data: listData, error: listError } =
      await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      throw new Error(`seedUser: listUsers failed — ${listError.message}`);
    }

    const existing = listData.users.find((u) => u.email === email);
    if (!existing) {
      throw new Error(
        `seedUser: user ${email} not created but also not found in listUsers`
      );
    }
    userId = existing.id;

    // Ensure password is set (user may have been created via magic-link)
    await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
  } else {
    if (!createData.user) {
      throw new Error("seedUser: createUser returned no user object");
    }
    userId = createData.user.id;
  }

  // Step 2: sign in with password to obtain a real browser-compatible session
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SERVICE_ROLE_KEY;
  const anonClient = createClient(SUPABASE_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signInData, error: signInError } =
    await anonClient.auth.signInWithPassword({ email, password });

  if (signInError) {
    throw new Error(
      `seedUser: signInWithPassword failed — ${signInError.message}`
    );
  }
  if (!signInData.session) {
    throw new Error("seedUser: signInWithPassword returned no session");
  }

  return {
    userId,
    email,
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token,
  };
}

// ---------------------------------------------------------------------------
// Trip seeding
// ---------------------------------------------------------------------------

/**
 * Ensures the M4 test trip exists (idempotent by name).
 * Returns the trip ID. The organizer seed creates it; the celebrant seed
 * finds it via M4_TEST_TRIP_ID env var (written by the organizer seed).
 */
export async function ensureM4TestTrip(
  admin: SupabaseClient,
  organizerUserId: string
): Promise<string> {
  // Check if trip already exists
  const { data: existing, error: findError } = await admin
    .from("trips")
    .select("id")
    .eq("name", M4_TEST_TRIP_NAME)
    .maybeSingle();

  if (findError) {
    throw new Error(`ensureM4TestTrip: lookup failed — ${findError.message}`);
  }

  if (existing) {
    return existing.id as string;
  }

  // Create the trip. `slug` is NOT NULL with no default in 0001_init.sql —
  // must be supplied. Deterministic per test-trip name keeps the seed
  // idempotent and human-debuggable.
  const { data: created, error: createError } = await admin
    .from("trips")
    .insert({
      name: M4_TEST_TRIP_NAME,
      slug: M4_TEST_TRIP_SLUG,
      created_by: organizerUserId,
      kind: "bachelor",
    })
    .select("id")
    .single();

  if (createError || !created) {
    throw new Error(
      `ensureM4TestTrip: insert failed — ${createError?.message ?? "no row returned"}`
    );
  }

  return created.id as string;
}

// ---------------------------------------------------------------------------
// Membership seeding
// ---------------------------------------------------------------------------

export interface MembershipSpec {
  tripId: string;
  userId: string;
  role: TripRole;
  isCelebrant: boolean;
}

/**
 * Upserts a trip_members row for the given user+trip combination.
 * Idempotent: on conflict (trip_id, user_id) updates role + is_celebrant.
 */
export async function upsertMember(
  admin: SupabaseClient,
  spec: MembershipSpec
): Promise<void> {
  const { tripId, userId, role, isCelebrant } = spec;

  // Check for existing membership
  const { data: existing, error: findError } = await admin
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) {
    throw new Error(`upsertMember: lookup failed — ${findError.message}`);
  }

  if (existing) {
    // Update to ensure role/is_celebrant are correct
    const { error: updateError } = await admin
      .from("trip_members")
      .update({ role, is_celebrant: isCelebrant })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`upsertMember: update failed — ${updateError.message}`);
    }
    return;
  }

  // Insert new member row
  const { error: insertError } = await admin.from("trip_members").insert({
    trip_id: tripId,
    user_id: userId,
    role,
    is_celebrant: isCelebrant,
    rsvp_status: "going",
  });

  if (insertError) {
    throw new Error(`upsertMember: insert failed — ${insertError.message}`);
  }
}

// ---------------------------------------------------------------------------
// Storage-state writing
// ---------------------------------------------------------------------------

/**
 * Derives the Supabase project ref from the project URL.
 * URL shape: https://<project-ref>.supabase.co
 * Local shape: http://127.0.0.1:54321 → falls back to "local"
 */
export function getProjectRef(supabaseUrl: string): string {
  const hostname = new URL(supabaseUrl).hostname;
  // Local Supabase has an IP hostname — use "local" as a stable ref
  if (/^\d/.test(hostname)) return "local";
  return hostname.split(".")[0];
}

/**
 * Writes a Playwright storage-state JSON file that injects a Supabase
 * session cookie in the format expected by @supabase/ssr middleware.
 *
 * Cookie name:  `sb-<project-ref>-auth-token`
 * Cookie value: URL-encoded JSON of the session object
 */
export function writeStorageState(opts: {
  outputPath: string;
  accessToken: string;
  refreshToken: string;
  baseUrl: string;
  supabaseUrl: string;
}): void {
  const { outputPath, accessToken, refreshToken, baseUrl, supabaseUrl } = opts;

  const projectRef = getProjectRef(supabaseUrl);
  const cookieName = `sb-${projectRef}-auth-token`;

  const session = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  const cookieValue = encodeURIComponent(session);
  const domain = new URL(baseUrl).hostname;
  const expires = Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60;

  const storageState = {
    cookies: [
      {
        name: cookieName,
        value: cookieValue,
        domain,
        path: "/",
        expires,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(storageState, null, 2), "utf-8");
  console.log(`[seed-m4] Storage state written to: ${outputPath}`);
}
