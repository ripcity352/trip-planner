"use server";

/**
 * Server action for updating trip-level notes (M3 #78).
 *
 * Surface contract:
 *   - `setTripNotes(tripId, notes, idempotencyKey)` validates, authenticates,
 *     rate-limits under UPDATE_TRIP_NOTES, and updates trips.notes.
 *   - Organizer-only via RLS.
 *   - Idempotency is provided via the rate-limit scope; trip notes are
 *     last-write-wins (no per-row idempotency key needed — the notes
 *     column is a single mutable field, not an append-only table).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";

const setTripNotesSchema = z.object({
  tripId: z.string().uuid(),
  notes: z.string().max(10_000).nullable(),
});

export interface SetTripNotesInput {
  tripId: string;
  notes: string | null;
}

export type SetTripNotesResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

/**
 * Update (or clear) the trip-level notes. Organizer-only via RLS.
 * Passing `notes: null` clears the field.
 */
export async function setTripNotes(
  input: SetTripNotesInput
): Promise<SetTripNotesResult> {
  const parsed = setTripNotesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { tripId, notes } = parsed.data;

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.UPDATE_TRIP_NOTES,
      userId,
      async () => {
        const { error } = await supabase
          .from("trips")
          .update({ notes })
          .eq("id", tripId);

        if (error) {
          if (error.code === "42501" || error.code === "PGRST116") {
            throw new TripNotesError("rls_denied");
          }
          throw new TripNotesError("save_failed");
        }
      }
    );

    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof TripNotesError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied" ? "rls_denied" : "trip_notes_save_failed",
      };
    }
    console.error("[trip-notes] setTripNotes unexpected:", err);
    return { ok: false, errorKey: "trip_notes_save_failed" };
  }
}

class TripNotesError extends Error {
  readonly reason: "save_failed" | "rls_denied";

  constructor(reason: "save_failed" | "rls_denied") {
    super(`trip_notes_error:${reason}`);
    this.name = "TripNotesError";
    this.reason = reason;
  }
}
