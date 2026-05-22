/**
 * Profiles data layer — point-lookup reader (W2c, #233).
 *
 * Establishes the shared-select convention for the `profiles` table:
 * explicit column list, no `select('*')`. First consumer: the
 * /account/sign-in-and-security page reading `has_password`.
 *
 * RLS (M1, `0001_init.sql:25-34`):
 *   SELECT: `to authenticated using (true)` — any authenticated user can
 *     read any profile row. The query restricts to one's own row via
 *     `.eq("id", userId)` where `userId` is server-pinned from
 *     `auth.getUser()` — never trust client-supplied ids.
 *   UPDATE: `using (auth.uid() = id) with check (auth.uid() = id)` —
 *     this gates write authorization (used by the W0 atomic setters).
 * No service-role required.
 *
 * Error handling follows the `lib/db/trips.ts` pattern:
 *   - PGRST116 (no rows) → return null
 *   - All other errors   → throw
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "./types";

/**
 * Fetch the minimal profile fields needed for identity-state derivation.
 * Returns null if the profile row does not exist (PGRST116).
 * Throws on all other errors.
 */
export async function getProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Pick<Profile, "id" | "has_password"> | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, has_password")
    .eq("id", userId)
    .single();

  if (error) {
    // PGRST116 — no rows found; not an application error
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data as Pick<Profile, "id" | "has_password">;
}
