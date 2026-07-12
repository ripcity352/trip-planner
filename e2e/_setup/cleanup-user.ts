/**
 * cleanup-user.ts
 *
 * Best-effort deletion of a user minted DURING a spec (e.g. the fresh
 * invitee created through the real signup form in
 * invite-instant-signup.spec.ts). Service-role admin API, mirroring
 * seed-test-user.ts's cleanup — non-fatal on failure so a cleanup hiccup
 * never fails the suite (unique per-run emails don't collide anyway).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function cleanupUserByEmail(email: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !email) return;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      console.error(`cleanup-user: listUsers failed — ${error.message}`);
      return;
    }
    const user = data.users.find((u) => u.email === email);
    if (!user) return;
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error(
        `cleanup-user: delete failed for ${email} — ${deleteError.message}`
      );
    }
  } catch (err) {
    console.error(`cleanup-user: cleanup threw for ${email} —`, err);
  }
}
