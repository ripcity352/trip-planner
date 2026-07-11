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
 *
 * Authz split (accurate — do not overstate): RLS gates WHO can touch a
 * trip_members row ("organizers can update any trip member" UPDATE
 * policy + "organizers can remove members" DELETE policy, M1). These
 * actions gate WHAT may change — the settable role values and the
 * founder/celebrant/self/expense-ties protections live HERE ONLY. The
 * M1 UPDATE policies carry no WITH CHECK on role, so a direct-PostgREST
 * caller inside the policy scope is not blocked from hostile role
 * writes at the DB layer today. DB-layer hardening is tracked in #418;
 * until it lands, this action layer is the load-bearing guard for
 * role-value and seat-protection invariants.
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

export type SetMemberRoleInput = z.infer<typeof setMemberRoleSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

export type SetMemberRoleResult =
  | { ok: true; role: SettableMemberRole }
  | { ok: false; errorKey: ErrorKey };

export type RemoveMemberResult =
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
