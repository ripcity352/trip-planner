"use server";

/**
 * Server action for day-scoped attendance (#388).
 *
 * `setMemberDayAction({ tripId, date, status }, idempotencyKey)` upserts
 * the CALLER's own `trip_member_days` row for one date.
 *
 * Surface contract (same as setRsvpAction / setItemRsvp): discriminated
 * union, never redirects, never throws — the optimistic chip row
 * (`components/trip/day-attendance-chips.tsx`) owns rollback.
 *
 * Security:
 *   - trip_member_id is resolved server-side from auth.uid() — callers
 *     cannot write another member's days. RLS ("members write own days")
 *     enforces the same at the database level; the app-side resolution
 *     is defense-in-depth. (Organizer write-any RLS exists but this
 *     action deliberately does not use it — organizer day-editing is a
 *     separate surface if it's ever wanted.)
 *   - The date must fall inside [trips.starts_at, trips.ends_at]. The
 *     trip lookup itself is RLS-gated, so a non-member probing this
 *     action gets the same rls_denied as an invisible row.
 *   - Rate-limited via the dedicated `setMemberDay` scope (30/60s).
 *
 * Idempotency (rule 9): the caller supplies a UUID. If the existing
 * (trip_member_id, date) row already carries that key, the drunk
 * double-tap is a no-op — we echo the stored status.
 *
 * Statuses: the chip surface writes 'going' (opt in) and 'declined'
 * (opt out) only. 'maybe' stays in the enum for future use but has no
 * chip — a two-state toggle is the whole affordance.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { TripMemberDayStatus } from "@/lib/db/types";

export type SettableMemberDayStatus = Exclude<TripMemberDayStatus, "maybe">;

const SETTABLE_STATUSES = ["going", "declined"] as const;
// Compile-time assertion: SETTABLE_STATUSES exhausts SettableMemberDayStatus.
const _exhaustive: ReadonlyArray<SettableMemberDayStatus> = SETTABLE_STATUSES;
void _exhaustive;

// Postgres `date` shape. Range membership is checked against the trip
// row after auth — lexicographic comparison is correct for ISO dates.
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const setMemberDaySchema = z.object({
  tripId: z.string().uuid(),
  date: z.string().regex(DATE_ONLY_REGEX),
  status: z.enum(SETTABLE_STATUSES),
});

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

export interface SetMemberDayInput {
  tripId: string;
  /** ISO date — `YYYY-MM-DD`, must be inside the trip range. */
  date: string;
  status: SettableMemberDayStatus;
}

export type SetMemberDayResult =
  | { ok: true; status: SettableMemberDayStatus }
  | { ok: false; errorKey: ErrorKey };

/**
 * Upsert the caller's own attendance for one trip day. See file
 * docstring for the security + idempotency rules.
 */
export async function setMemberDayAction(
  input: SetMemberDayInput,
  idempotencyKey: string
): Promise<SetMemberDayResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const inputParse = setMemberDaySchema.safeParse(input);
  if (!inputParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, date, status } = inputParse.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  // Trip lookup — RLS hides trips the caller isn't a member of, so a
  // null here is indistinguishable from "no such trip" (no enumeration
  // oracle). The date range comes back for the in-range check.
  let tripRange: { starts_at: string | null; ends_at: string | null };
  try {
    const { data, error } = await supabase
      .from("trips")
      .select("starts_at, ends_at")
      .eq("id", tripId)
      .maybeSingle();

    if (error) {
      console.error("[member-days] trip lookup failed:", error.message);
      return { ok: false, errorKey: "member_day_save_failed" };
    }
    if (!data) {
      return { ok: false, errorKey: "rls_denied" };
    }
    tripRange = data as { starts_at: string | null; ends_at: string | null };
  } catch (err) {
    console.error("[member-days] trip lookup unexpected:", err);
    return { ok: false, errorKey: "member_day_save_failed" };
  }

  // In-range check. A trip with no dates has no days to toggle; a date
  // outside the range would create a row the UI never renders (the
  // exact staleness class the reconcile trigger clears).
  if (
    tripRange.starts_at === null ||
    tripRange.ends_at === null ||
    date < tripRange.starts_at ||
    date > tripRange.ends_at
  ) {
    return { ok: false, errorKey: "validation_failed" };
  }

  // Resolve the caller's own membership row — never taken from input.
  let tripMemberId: string;
  try {
    const { data, error } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, errorKey: "rls_denied" };
    }
    tripMemberId = (data as { id: string }).id;
  } catch (err) {
    console.error("[member-days] member lookup unexpected:", err);
    return { ok: false, errorKey: "member_day_save_failed" };
  }

  // Idempotency replay: same key on the existing (member, date) row →
  // already processed; echo the stored status without a second write.
  try {
    const { data: existing } = await supabase
      .from("trip_member_days")
      .select("status, idempotency_key")
      .eq("trip_member_id", tripMemberId)
      .eq("date", date)
      .maybeSingle();

    if (
      existing &&
      (existing as { idempotency_key: string | null }).idempotency_key ===
        idempotencyKey
    ) {
      const stored = (existing as { status: TripMemberDayStatus }).status;
      if (stored === "going" || stored === "declined") {
        // Same posture as setRsvpAction replay (#110): the original
        // write already landed, keep downstream counts fresh anyway.
        revalidatePath("/trips", "layout");
        return { ok: true, status: stored };
      }
      // stored === 'maybe' (organizer-written) — fall through to the
      // upsert so the member's tap still lands.
    }
  } catch {
    // Non-fatal — proceed to the upsert.
  }

  try {
    const result = await rateLimitedAction(
      RATE_LIMIT_SCOPES.SET_MEMBER_DAY,
      userId,
      async () => {
        // Upsert, not update: maybe/pending-RSVP members were never
        // seeded by the trigger, so their first tap inserts from empty.
        const { error } = await supabase.from("trip_member_days").upsert(
          {
            trip_member_id: tripMemberId,
            date,
            status,
            idempotency_key: idempotencyKey,
          },
          { onConflict: "trip_member_id,date" }
        );

        if (error) {
          if (error.code === "42501") {
            throw new MemberDayError("rls_denied");
          }
          console.error("[member-days] upsert failed:", {
            code: error.code,
            message: error.message,
          });
          throw new MemberDayError("save_failed");
        }
        return status;
      }
    );

    // F2: revalidate on success so the roster headcount + any dashboard
    // consumer refresh. Layout-wide (same rationale as setRsvpAction —
    // avoids a slug lookup for a path-precise revalidate).
    revalidatePath("/trips", "layout");
    return { ok: true, status: result };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof MemberDayError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied" ? "rls_denied" : "member_day_save_failed",
      };
    }
    console.error("[member-days] setMemberDayAction unexpected:", err);
    return { ok: false, errorKey: "member_day_save_failed" };
  }
}

/**
 * Module-private sentinel so the rate-limited closure can surface a
 * pre-classified failure without shadowing RateLimitError. Tests assert
 * on the result shape, not this class.
 */
class MemberDayError extends Error {
  readonly reason: "save_failed" | "rls_denied";

  constructor(reason: "save_failed" | "rls_denied") {
    super(`member_day_error:${reason}`);
    this.name = "MemberDayError";
    this.reason = reason;
  }
}
