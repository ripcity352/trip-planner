/**
 * markPasswordSet — atomic write helper for the `profiles.has_password`
 * shadow column (#244).
 *
 * Background: M5 / W0 D7 (trip-readiness) introduced the `has_password`
 * shadow column so the account-security page can detect State A vs State
 * B without inspecting `auth.users.identities`. Each successful password
 * mutation must follow up with `UPDATE profiles SET has_password = true`
 * inside the SAME closure as the auth mutation, so the write only
 * happens after auth succeeds.
 *
 * Before this helper, four server actions inlined the same 6-line block:
 *   - signUpAction
 *   - changePasswordAction
 *   - setPasswordViaRecoveryAction
 *   - setPasswordAction
 *
 * This helper preserves the EXACT PostgREST chain
 * (`.from("profiles").update({has_password:true}).eq("id",userId).select().single()`)
 * so the existing per-action assertions in
 * `tests/unit/has-password-writes.test.ts` stay green.
 *
 * The `context` argument is a short tag (e.g. `"auth:signUp"`,
 * `"account-security:changePassword"`) used to flavor the error log so
 * operators can grep for the failing call site.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type MarkPasswordSetResult = { ok: true } | { ok: false };

export async function markPasswordSet(
  supabase: SupabaseClient,
  userId: string,
  context: string,
): Promise<MarkPasswordSetResult> {
  const { error } = await supabase
    .from("profiles")
    .update({ has_password: true })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    // TODO: surface to Sentry once observability layer settles
    console.error(`[${context}] has_password write failed`, {
      code: (error as { code?: string }).code,
    });
    return { ok: false };
  }

  return { ok: true };
}
