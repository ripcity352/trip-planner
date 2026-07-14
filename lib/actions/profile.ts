"use server";

/**
 * Server action for self-service identity editing (#368, name half of
 * #262): a member updates the display_name + phone on their OWN
 * trip_members row for one trip.
 *
 * Authz split (mirrors lib/actions/members.ts): RLS is the real gate —
 * the "users can update their own RSVP" self-row policy only matches
 * `auth.uid() = user_id`, and its #418 WITH CHECK pins role/is_celebrant
 * to their committed values, so this write can never escalate a seat.
 * The action resolves the caller's own member row (never trusts a
 * client-supplied memberId) and keeps the error mapping honest: a
 * zero-row update surfaces as `rls_denied`, never a fake success.
 *
 * Phone is normalized to E.164 server-side (lib/utils/phone.ts) — the
 * vCard export and the (trip_id, phone_e164) unique index both trust
 * that format. An empty phone CLEARS the stored one (opting out must be
 * as easy as opting in — rule 8).
 *
 * Idempotency (rule 9): mirrors setMemberRoleAction — the row's stored
 * idempotency_key is compared before writing, so a drunk double-tap
 * replays as a no-op instead of racing.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getViewerMember, updateMyMemberProfile } from "@/lib/db/trips";
import { normalizePhoneE164 } from "@/lib/utils/phone";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/utils/member-display";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

const updateMyProfileSchema = z.object({
  tripId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
  // Raw human-typed phone; normalized below. Empty string = clear it.
  phone: z.string().trim().max(32),
});

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;

export type UpdateMyProfileResult =
  | { ok: true; displayName: string; phoneE164: string | null }
  | { ok: false; errorKey: ErrorKey };

export async function updateMyProfileAction(
  input: UpdateMyProfileInput,
  idempotencyKey: string
): Promise<UpdateMyProfileResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = updateMyProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, displayName, phone } = parsed.data;

  // Empty = clear; non-empty must normalize or the input is rejected —
  // never store a half-cleaned number the vCard export would trust.
  const phoneE164 = phone === "" ? null : normalizePhoneE164(phone);
  if (phone !== "" && phoneE164 === null) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    // Resolve the caller's OWN row — the client never names a memberId.
    const viewer = await getViewerMember(supabase, tripId, userId);
    if (!viewer) {
      // Same wire-shape as "row hidden by RLS" — non-members can't
      // probe trips through this endpoint.
      return { ok: false, errorKey: "rls_denied" };
    }

    // Idempotency replay: this exact request already landed (rule 9).
    if (viewer.idempotency_key === keyParse.data) {
      return {
        ok: true,
        displayName: viewer.display_name ?? displayName,
        phoneE164: viewer.phone_e164,
      };
    }

    // Already in the requested state — nothing to write.
    if (
      viewer.display_name === displayName &&
      viewer.phone_e164 === phoneE164
    ) {
      return { ok: true, displayName, phoneE164 };
    }

    const outcome = await rateLimitedAction(
      RATE_LIMIT_SCOPES.UPDATE_MY_PROFILE,
      userId,
      () =>
        updateMyMemberProfile(
          supabase,
          tripId,
          viewer.id,
          displayName,
          phoneE164,
          keyParse.data
        )
    );

    if (outcome === "duplicate_phone") {
      // Deterministic: the (trip_id, phone_e164) unique index matched a
      // teammate's number. Explain the rule, don't bait a retry.
      return { ok: false, errorKey: "profile_phone_taken" };
    }
    if (outcome === "missing") {
      // We saw the row a moment ago but the UPDATE touched nothing —
      // RLS disagreed with the app-layer read. Surface the denial.
      return { ok: false, errorKey: "rls_denied" };
    }

    // Author names render everywhere resolveMemberName / useDisplayName
    // consume the roster (roster, announcements, expenses, arrivals) —
    // same layout-wide revalidation as setMemberRoleAction.
    revalidatePath("/trips", "layout");
    return { ok: true, displayName, phoneE164 };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[profile] updateMyProfileAction unexpected:", err);
    return { ok: false, errorKey: "profile_save_failed" };
  }
}
