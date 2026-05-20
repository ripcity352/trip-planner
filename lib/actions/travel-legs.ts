"use server";

/**
 * Server actions for travel legs (M3 #37 — arrivals manifest).
 *
 * Surface contract:
 *   - `upsertTravelLeg(input, idempotencyKey)` inserts or updates the
 *     caller's own travel leg.
 *   - `deleteTravelLeg(legId)` deletes the caller's own leg.
 *   - Strictly owner-only write: `trip_member_id` is resolved server-side
 *     from auth.uid() — callers cannot create/edit legs for others.
 *   - Idempotency scope: (trip_id, trip_member_id, idempotency_key)
 *     per the strictly-user-tables ADR.
 *   - READ is trip-wide (all members see the arrivals manifest) —
 *     handled in lib/db/travel-legs.ts.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { TravelLeg } from "@/lib/db/types";

const TRAVEL_LEG_KIND = ["flight", "train", "drive", "other"] as const;

const upsertLegSchema = z.object({
  tripId: z.string().uuid(),
  kind: z.enum(TRAVEL_LEG_KIND),
  departAt: z.string().nullable().optional(),
  arriveAt: z.string().nullable().optional(),
  carrier: z.string().trim().max(100).nullable().optional(),
  confirmationCode: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  // Optional: if provided, used to update an existing leg row.
  legId: z.string().uuid().nullable().optional(),
});

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

export interface UpsertTravelLegInput {
  tripId: string;
  kind: (typeof TRAVEL_LEG_KIND)[number];
  departAt?: string | null;
  arriveAt?: string | null;
  carrier?: string | null;
  confirmationCode?: string | null;
  notes?: string | null;
  /** Provide to update an existing leg; omit to insert a new one. */
  legId?: string | null;
}

export type UpsertTravelLegResult =
  | { ok: true; leg: TravelLeg }
  | { ok: false; errorKey: ErrorKey };

export type DeleteTravelLegResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

const TRAVEL_LEG_COLUMNS =
  "id, trip_id, trip_member_id, kind, depart_at, arrive_at, carrier, confirmation_code, notes, idempotency_key, created_at";

/**
 * Insert a new travel leg or update an existing one (when legId is provided).
 * The caller's trip_member_id is resolved server-side — cannot impersonate.
 */
export async function upsertTravelLeg(
  input: UpsertTravelLegInput,
  idempotencyKey: string
): Promise<UpsertTravelLegResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = upsertLegSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { tripId, kind, departAt, arriveAt, carrier, confirmationCode, notes, legId } =
    parsed.data;

  // Resolve the caller's trip_member_id
  let tripMemberId: string;
  try {
    const { data: memberData, error: memberError } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError || !memberData) {
      return { ok: false, errorKey: "rls_denied" };
    }
    tripMemberId = (memberData as { id: string }).id;
  } catch (err) {
    console.error("[travel-legs] member lookup unexpected:", err);
    return { ok: false, errorKey: "travel_leg_save_failed" };
  }

  try {
    const leg = await rateLimitedAction(
      RATE_LIMIT_SCOPES.UPSERT_TRAVEL_LEG,
      userId,
      async () => {
        if (legId) {
          // Update existing leg (must be the owner — RLS enforces this)
          const { data, error } = await supabase
            .from("travel_legs")
            .update({
              kind,
              depart_at: departAt ?? null,
              arrive_at: arriveAt ?? null,
              carrier: carrier ?? null,
              confirmation_code: confirmationCode ?? null,
              notes: notes ?? null,
              idempotency_key: idempotencyKey,
            })
            .eq("id", legId)
            .eq("trip_member_id", tripMemberId)
            .select(TRAVEL_LEG_COLUMNS)
            .single();

          if (error) {
            if (error.code === "42501" || error.code === "PGRST116") {
              throw new TravelLegError("rls_denied");
            }
            throw new TravelLegError("save_failed");
          }
          return data as TravelLeg;
        }

        // Insert new leg
        const { data, error } = await supabase
          .from("travel_legs")
          .insert({
            trip_id: tripId,
            trip_member_id: tripMemberId,
            kind,
            depart_at: departAt ?? null,
            arrive_at: arriveAt ?? null,
            carrier: carrier ?? null,
            confirmation_code: confirmationCode ?? null,
            notes: notes ?? null,
            idempotency_key: idempotencyKey,
          })
          .select(TRAVEL_LEG_COLUMNS)
          .single();

        if (error) {
          // Idempotency replay
          if (error.code === "23505") {
            const { data: existing, error: fetchError } = await supabase
              .from("travel_legs")
              .select(TRAVEL_LEG_COLUMNS)
              .eq("trip_id", tripId)
              .eq("trip_member_id", tripMemberId)
              .eq("idempotency_key", idempotencyKey)
              .single();

            if (fetchError) throw new TravelLegError("save_failed");
            return existing as TravelLeg;
          }
          if (error.code === "42501") {
            throw new TravelLegError("rls_denied");
          }
          throw new TravelLegError("save_failed");
        }
        return data as TravelLeg;
      }
    );

    return { ok: true, leg };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof TravelLegError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied" ? "rls_denied" : "travel_leg_save_failed",
      };
    }
    console.error("[travel-legs] upsertTravelLeg unexpected:", err);
    return { ok: false, errorKey: "travel_leg_save_failed" };
  }
}

/**
 * Delete the caller's own travel leg. RLS prevents deleting another
 * member's leg. Idempotent — if the leg is already gone, returns ok: true.
 */
export async function deleteTravelLeg(
  legId: string
): Promise<DeleteTravelLegResult> {
  const parsedId = z.string().uuid().safeParse(legId);
  if (!parsedId.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }

  try {
    const { error } = await supabase
      .from("travel_legs")
      .delete()
      .eq("id", parsedId.data);

    if (error) {
      if (error.code === "42501") {
        return { ok: false, errorKey: "rls_denied" };
      }
      console.error("[travel-legs] deleteTravelLeg failed:", error.message);
      return { ok: false, errorKey: "travel_leg_delete_failed" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[travel-legs] deleteTravelLeg unexpected:", err);
    return { ok: false, errorKey: "travel_leg_delete_failed" };
  }
}

class TravelLegError extends Error {
  readonly reason: "save_failed" | "rls_denied";

  constructor(reason: "save_failed" | "rls_denied") {
    super(`travel_leg_error:${reason}`);
    this.name = "TravelLegError";
    this.reason = reason;
  }
}
