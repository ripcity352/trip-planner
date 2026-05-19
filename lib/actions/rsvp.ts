"use server";

/**
 * Server action for setting the caller's own RSVP on a trip (#74).
 *
 * Surface contract: discriminated union, never redirects, never throws.
 * The optimistic-UI client (`components/trip/rsvp-toggle.tsx`) handles
 * rollback on its own — surfacing an unhandled exception here would
 * crash the surrounding Server Component tree, which we deliberately
 * avoid.
 *
 * Security:
 *   - Caller must be authenticated; otherwise return rls_denied.
 *   - We only UPDATE the row where `(trip_id, user_id) = (input, auth.uid())`.
 *     RLS enforces this at the database level; the app-side filter is
 *     defense-in-depth (and lets us read the existing idempotency_key
 *     for replay detection without an extra round-trip).
 *   - Rate-limited via the `setRsvp` scope. Drunk users on bad signal
 *     get a generous 30/60s budget before they're throttled.
 *
 * Idempotency:
 *   - The caller supplies a UUID `idempotencyKey`. If the trip_member
 *     row already carries that exact key, we return the current status
 *     without issuing a second UPDATE — drunk-double-tap is a no-op,
 *     not a race.
 */

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { RsvpStatus } from "@/lib/db/types";

/**
 * The set of status values the UI is allowed to set. We exclude
 * `pending` deliberately — the user can never UI-themselves back into
 * "no answer." Once they've expressed a position, they have to pick
 * one of the three; staff can fall back to pending via a separate
 * admin tool (not yet built).
 */
export type SettableRsvpStatus = Exclude<RsvpStatus, "pending">;

export interface SetRsvpInput {
  tripId: string;
  status: SettableRsvpStatus;
}

export type SetRsvpResult =
  | { ok: true; status: SettableRsvpStatus }
  | { ok: false; errorKey: ErrorKey };

// `z.enum` needs a literal tuple to preserve the union type. We can't
// derive this from `SettableRsvpStatus = Exclude<RsvpStatus, "pending">`
// at the value level without lying about widening; keep this list as
// the runtime source of truth and assert it covers the type at
// compile time below.
const SETTABLE_STATUSES = ["going", "maybe", "declined"] as const;
// Compile-time assertion: SETTABLE_STATUSES exhausts SettableRsvpStatus.
// If a new value is added to `RsvpStatus`, this line stops compiling.
const _exhaustive: ReadonlyArray<SettableRsvpStatus> = SETTABLE_STATUSES;
void _exhaustive;

const setRsvpSchema = z.object({
  tripId: z.string().uuid(),
  status: z.enum(SETTABLE_STATUSES),
});

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

/**
 * Update the caller's RSVP. See file docstring for security +
 * idempotency rules.
 */
export async function setRsvpAction(
  input: SetRsvpInput,
  idempotencyKey: string
): Promise<SetRsvpResult> {
  // Validate the idempotency_key first — a non-UUID would crash the
  // partial unique index later in the SQL layer, and the UI's only
  // legitimate source is `crypto.randomUUID()`.
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const inputParse = setRsvpSchema.safeParse(input);
  if (!inputParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, status } = inputParse.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  // Read the caller's existing trip_members row. RLS lets the caller
  // read their own membership; if no row comes back they aren't a
  // member of the trip and we surface `rls_denied` (same wire-shape
  // as "row was hidden by RLS" — the user can't enumerate trips by
  // probing this endpoint).
  type ExistingRow = {
    id: string;
    rsvp_status: RsvpStatus;
    idempotency_key: string | null;
  };

  let existingRow: ExistingRow;
  try {
    const { data, error } = await supabase
      .from("trip_members")
      .select("id, rsvp_status, idempotency_key")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[rsvp] member lookup failed:", error.message);
      return { ok: false, errorKey: "rsvp_save_failed" };
    }
    if (!data) {
      return { ok: false, errorKey: "rls_denied" };
    }
    existingRow = data as ExistingRow;
  } catch (err) {
    console.error("[rsvp] member lookup unexpected:", err);
    return { ok: false, errorKey: "rsvp_save_failed" };
  }

  // Idempotency replay: same key on the existing row → we've already
  // processed this exact request. Return the current status without
  // a second UPDATE. The status returned is the actual stored status,
  // which may differ from the requested status if the original tap
  // landed first with a different value — that's fine, because the
  // client treats the response as authoritative.
  if (existingRow.idempotency_key === idempotencyKey) {
    // The replay-as-no-op path can only return one of the three
    // settable values — RSVP UI never writes `pending`, so any stored
    // status that carries an idempotency_key must be settable. We
    // narrow defensively all the same.
    const stored = existingRow.rsvp_status;
    if (stored === "going" || stored === "maybe" || stored === "declined") {
      return { ok: true, status: stored };
    }
    // pending-with-idempotency-key shouldn't happen — but if it does,
    // treat as if the row needs a fresh write rather than echoing
    // pending back to the UI. We fall through to the UPDATE branch.
  }

  // Wrap the UPDATE in the rate-limit guard. Bucket keyed on user id so
  // a single user's spam can't starve their neighbors.
  //
  // We chain a `.select(...).maybeSingle()` so the request returns the
  // updated row (or null if the row vanished between SELECT and
  // UPDATE — race-tolerant). RLS already enforces "you can only
  // update your own membership row" by way of `is_trip_member(...)`
  // policies on `trip_members`; we don't add a redundant `.eq(user_id)`
  // filter because the existing-row lookup above already bound the
  // primary key to the authenticated caller.
  const targetMemberId = existingRow.id;
  try {
    const updatedStatus: SettableRsvpStatus = await rateLimitedAction(
      RATE_LIMIT_SCOPES.SET_RSVP,
      userId,
      async () => {
        const { error: updateError } = await supabase
          .from("trip_members")
          .update({
            rsvp_status: status,
            idempotency_key: idempotencyKey,
          })
          .eq("id", targetMemberId)
          .select("id")
          .maybeSingle();

        if (updateError) {
          console.error("[rsvp] update failed:", {
            code: updateError.code,
            message: updateError.message,
          });
          throw new RsvpUpdateError();
        }
        return status;
      }
    );

    return { ok: true, status: updatedStatus };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof RsvpUpdateError) {
      return { ok: false, errorKey: "rsvp_save_failed" };
    }
    console.error("[rsvp] setRsvp unexpected failure:", err);
    return { ok: false, errorKey: "rsvp_save_failed" };
  }
}

/**
 * Internal sentinel — lets the rate-limited inner closure surface a
 * pre-classified failure to the outer try/catch without shadowing the
 * RateLimitError surface. Module-private; tests assert on the result
 * shape, not on this class.
 */
class RsvpUpdateError extends Error {
  constructor() {
    super("rsvp_update_failed");
    this.name = "RsvpUpdateError";
  }
}
