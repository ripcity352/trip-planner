"use server";

/**
 * Server actions for organizer member management (#386).
 *
 *   - `setMemberRoleAction(input, idempotencyKey)` — flips a member
 *     between attendee and co_organizer.
 *   - `removeMemberAction(input, idempotencyKey)` — removes a member
 *     from the trip. Deletes are idempotent by nature: the key is
 *     validated per rule 9 but not persisted, and a target that is
 *     already gone returns ok.
 *   - `setCelebrantAction(input, idempotencyKey)` — FOUNDER-only
 *     assign/reassign/clear of the celebrant seat via the
 *     `set_trip_celebrant` SECURITY DEFINER RPC (the #418 pins make
 *     is_celebrant unwritable through the base table for every
 *     non-founder writer).
 *
 * Authz split: RLS gates WHO can touch a trip_members row ("organizers
 * can update any trip member" UPDATE policy + "organizers can remove
 * members" DELETE policy). As of #418 (migration
 * 20260710070000_trip_members_rls_hardening) those policies ALSO carry
 * WITH CHECK constraints that pin the settable role set
 * ({attendee, co_organizer}, never 'organizer'), forbid non-founders
 * from mutating the founder row or flipping is_celebrant, and make the
 * founder/celebrant seats undeletable — so a direct-PostgREST caller can
 * no longer self-escalate or delete a protected seat. These actions
 * mirror those invariants with warm rule-explaining copy and add the
 * app-only checks (self-removal + expense-ties) that aren't
 * privilege-escalation vectors.
 *
 * Guards (#386 — deterministic rejections, warm rule-explaining copy):
 *   - can't remove yourself (`member_remove_self`)
 *   - can't remove the celebrant (`member_remove_celebrant`)
 *   - can't change the celebrant's role (`member_role_celebrant`)
 *   - the ORIGINAL organizer (role='organizer') can't be demoted or
 *     removed (`member_organizer_locked`)
 *   - can't remove a member with expense ties — splits cascade with the
 *     member row and would break sum(splits) == amount_cents
 *     (`member_remove_has_expenses`; fix-first on PR #416)
 *
 * Removed member's content: authored rows (announcements, itinerary
 * items, expenses) key on auth.users and survive removal — display
 * falls back via `resolveMemberName` ("Guest"/"Someone"). Rows keyed on
 * trip_member_id (travel legs, lodging assignments, item RSVPs, member
 * flags, date votes) cascade by schema design — they are participation,
 * not authored content. Expense splits WOULD cascade too, which is
 * exactly why the ties guard refuses removal instead.
 *
 * Idempotency: `setMemberRoleAction` mirrors `setRsvpAction` — the
 * target row's stored idempotency_key is compared before writing, so a
 * drunk double-tap is a no-op, not a race.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  deleteTripMember,
  getTripMemberById,
  getViewerMember,
  setTripCelebrant,
  updateTripMemberRole,
} from "@/lib/db/trips";
import { memberHasExpenseTies } from "@/lib/db/expenses";
import { isOrganizerRole } from "@/lib/utils/expense-visibility";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripMember, TripRole } from "@/lib/db/types";

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

/**
 * Roles this action may assign. `organizer` (the founder seat) is
 * excluded at the schema level — it is assigned exactly once, by
 * `create_trip_with_organizer`, never through the roster.
 */
const SETTABLE_ROLES = ["attendee", "co_organizer"] as const;
export type SettableMemberRole = Extract<
  TripRole,
  (typeof SETTABLE_ROLES)[number]
>;
// Compile-time assertion: SETTABLE_ROLES stays inside TripRole.
const _exhaustive: ReadonlyArray<SettableMemberRole> = SETTABLE_ROLES;
void _exhaustive;

const setMemberRoleSchema = z.object({
  tripId: z.string().uuid(),
  memberId: z.string().uuid(),
  role: z.enum(SETTABLE_ROLES),
});

const removeMemberSchema = z.object({
  tripId: z.string().uuid(),
  memberId: z.string().uuid(),
});

// Celebrant assignment: memberId null = clear the seat entirely.
const setCelebrantSchema = z.object({
  tripId: z.string().uuid(),
  memberId: z.string().uuid().nullable(),
});

export type SetMemberRoleInput = z.infer<typeof setMemberRoleSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
export type SetCelebrantInput = z.infer<typeof setCelebrantSchema>;

export type SetMemberRoleResult =
  | { ok: true; role: SettableMemberRole }
  | { ok: false; errorKey: ErrorKey };

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

export type SetCelebrantResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

/**
 * Shared preamble: authenticate, verify the caller is an organizer of
 * the trip, and fetch the target row. Returns either the context needed
 * to proceed or the ErrorKey to short-circuit with.
 */
async function loadManageContext(
  supabase: SupabaseClient,
  tripId: string,
  memberId: string,
  userId: string
): Promise<
  | { ok: true; viewerMemberId: string; target: TripMember | null }
  | { ok: false; errorKey: ErrorKey }
> {
  const viewer = await getViewerMember(supabase, tripId, userId);
  if (!viewer || !isOrganizerRole(viewer.role)) {
    // Same wire-shape as "row hidden by RLS" — non-members can't probe
    // rosters through this endpoint.
    return { ok: false, errorKey: "rls_denied" };
  }

  const target = await getTripMemberById(supabase, tripId, memberId);
  return { ok: true, viewerMemberId: viewer.id, target };
}

export async function setMemberRoleAction(
  input: SetMemberRoleInput,
  idempotencyKey: string
): Promise<SetMemberRoleResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = setMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, memberId, role } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    const ctx = await loadManageContext(supabase, tripId, memberId, userId);
    if (!ctx.ok) {
      return ctx;
    }
    if (!ctx.target) {
      return { ok: false, errorKey: "rls_denied" };
    }
    const target = ctx.target;

    // Guards — deterministic, rule-explaining rejections (#386).
    if (target.is_celebrant) {
      return { ok: false, errorKey: "member_role_celebrant" };
    }
    if (target.role === "organizer") {
      return { ok: false, errorKey: "member_organizer_locked" };
    }

    // The founder branch above means target.role is now settable.
    const currentRole = target.role as SettableMemberRole;

    // Idempotency replay: this exact request already landed. Return the
    // stored role without a second write (drunk double-tap = no-op).
    if (target.idempotency_key === keyParse.data) {
      return { ok: true, role: currentRole };
    }

    // Already in the requested state — nothing to write.
    if (currentRole === role) {
      return { ok: true, role };
    }

    const updated = await rateLimitedAction(
      RATE_LIMIT_SCOPES.SET_MEMBER_ROLE,
      userId,
      () => updateTripMemberRole(supabase, memberId, role, keyParse.data)
    );
    if (!updated) {
      // RLS swallowed the write — app check and policy disagree, which
      // means the caller isn't actually allowed to do this.
      return { ok: false, errorKey: "rls_denied" };
    }

    revalidatePath("/trips", "layout");
    return { ok: true, role };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[members] setMemberRoleAction unexpected:", err);
    return { ok: false, errorKey: "member_role_save_failed" };
  }
}

/**
 * Assign, reassign, or clear the trip's celebrant (guest of honor).
 *
 * FOUNDER-only — the strictest gate in the roster. The RLS #418 WITH
 * CHECK pins deliberately make `is_celebrant` unwritable through the
 * base table for everyone, so the write goes through the
 * `set_trip_celebrant` SECURITY DEFINER RPC, which re-checks the
 * founder gate (role='organizer' — the is_trip_founder predicate) and
 * trip membership in-function.
 *
 * Idempotency: the RPC is naturally idempotent — clear-then-set of a
 * flag converges on replay, so (like removeMemberAction / the delete
 * path) the key is validated per rule 9 but not persisted. A drunk
 * double-tap lands on the same end state.
 */
export async function setCelebrantAction(
  input: SetCelebrantInput,
  idempotencyKey: string
): Promise<SetCelebrantResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = setCelebrantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, memberId } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    // FOUNDER gate — stricter than loadManageContext's organizer check.
    // Same wire-shape as an RLS-hidden row: non-founders never see the
    // affordance (rule 11), so a forged call gets the generic denial.
    const viewer = await getViewerMember(supabase, tripId, userId);
    if (!viewer || viewer.role !== "organizer") {
      return { ok: false, errorKey: "rls_denied" };
    }

    if (memberId !== null) {
      const target = await getTripMemberById(supabase, tripId, memberId);
      if (!target) {
        return { ok: false, errorKey: "rls_denied" };
      }
      // The founder row never wears the sash (mirrors the RPC's guard —
      // the UI never offers this; a forged call gets the generic denial).
      if (target.role === "organizer") {
        return { ok: false, errorKey: "rls_denied" };
      }
      // Already the celebrant — replay/double-tap no-op, skip the write.
      if (target.is_celebrant) {
        return { ok: true };
      }
    }

    await rateLimitedAction(RATE_LIMIT_SCOPES.SET_CELEBRANT, userId, () =>
      setTripCelebrant(supabase, tripId, memberId)
    );

    revalidatePath("/trips", "layout");
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    // The RPC raises 42501 with these markers when its in-function
    // checks fail — surface them as the honest denial, not a retry hint.
    if (
      err instanceof Error &&
      (err.message.includes("caller is not the trip founder") ||
        err.message.includes("target is not a member of this trip") ||
        err.message.includes("the founder cannot be the celebrant"))
    ) {
      return { ok: false, errorKey: "rls_denied" };
    }
    console.error("[members] setCelebrantAction unexpected:", err);
    return { ok: false, errorKey: "celebrant_save_failed" };
  }
}

export async function removeMemberAction(
  input: RemoveMemberInput,
  idempotencyKey: string
): Promise<RemoveMemberResult> {
  // Deletes are idempotent by nature; the key is validated per rule 9
  // but not persisted (mirrors deleteExpenseAction).
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, memberId } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    const ctx = await loadManageContext(supabase, tripId, memberId, userId);
    if (!ctx.ok) {
      return ctx;
    }
    if (!ctx.target) {
      // Already gone — a double-tap on a slow connection. Success.
      return { ok: true };
    }
    const target = ctx.target;

    // Guards — deterministic, rule-explaining rejections (#386).
    if (target.id === ctx.viewerMemberId) {
      return { ok: false, errorKey: "member_remove_self" };
    }
    if (target.is_celebrant) {
      return { ok: false, errorKey: "member_remove_celebrant" };
    }
    if (target.role === "organizer") {
      return { ok: false, errorKey: "member_organizer_locked" };
    }

    // Money invariant (fix-first on PR #416): expense_splits cascade
    // with the member row; deleting a tied member would silently break
    // sum(splits) == amount_cents. Refuse — settle/edit expenses first.
    // Split-rewrite-on-removal is deliberately out of scope.
    const hasTies = await memberHasExpenseTies(
      supabase,
      tripId,
      memberId,
      target.user_id
    );
    if (hasTies) {
      return { ok: false, errorKey: "member_remove_has_expenses" };
    }

    const deletedCount = await rateLimitedAction(
      RATE_LIMIT_SCOPES.REMOVE_MEMBER,
      userId,
      () => deleteTripMember(supabase, memberId)
    );
    if (deletedCount === 0) {
      // We saw the row a moment ago but the DELETE touched nothing —
      // RLS disagreed with the app-layer check. Surface the denial.
      return { ok: false, errorKey: "rls_denied" };
    }

    revalidatePath("/trips", "layout");
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[members] removeMemberAction unexpected:", err);
    return { ok: false, errorKey: "member_remove_failed" };
  }
}
