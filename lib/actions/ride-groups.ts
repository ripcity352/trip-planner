"use server";

/**
 * Server actions for ride groups (#581 — recommend → add who you're riding
 * with). Mirrors the #574 write-on-behalf family, applied to the new
 * ride_groups / ride_group_members tables.
 *
 * Surface:
 *   - createRideGroupWithRiders(input, key) — a member starts a ride and
 *     seeds its riders in one fan-out. A rider who IS the creator self-joins
 *     (written_by NULL); everyone else is added (written_by = creator,
 *     permanent provenance — there is NO confirm). Idempotent + self-healing:
 *     a parent-replay re-selects the group and re-runs the member fan-out.
 *   - addRidersToRide(rideGroupId, memberIds, key) — add riders to an
 *     existing ride.
 *   - leaveRide(rideGroupId) — the caller opts out (deletes their own rider
 *     row). The only member lifecycle gesture.
 *   - deleteRideGroup(rideGroupId) — creator/organizer removes the ride
 *     (cascade). An emptied ride simply stops rendering (the manifest view
 *     joins members → groups, so a rider-less group returns no rows).
 *
 * Attribution can't be forged: written_by is re-derived and bound by RLS
 * (writer-binding + tenancy + target<>writer); the server resolves the
 * caller's own membership only to drop self-targets and shape the payload.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";

const RIDE_DIRECTION = ["inbound", "outbound"] as const;
const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

type RideGroupErrorReason =
  | "save_failed"
  | "save_rejected"
  | "rls_denied"
  | "delete_failed";

class RideGroupError extends Error {
  readonly reason: RideGroupErrorReason;
  constructor(reason: RideGroupErrorReason) {
    super(`ride_group_error:${reason}`);
    this.name = "RideGroupError";
    this.reason = reason;
  }
}

// #474 pattern: a coded PostgREST/PG error is a deterministic rejection;
// a codeless failure is a flaky connection worth a retry.
function saveErrorKey(reason: RideGroupErrorReason): ErrorKey {
  switch (reason) {
    case "rls_denied":
      return "rls_denied";
    case "save_rejected":
      return "ride_group_save_rejected";
    case "save_failed":
      return "ride_group_save_failed";
    case "delete_failed":
      return "ride_group_delete_failed";
  }
}

/** Resolve the caller's trip_member_id in a trip, or null if not a member. */
async function resolveMemberId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

// ---- createRideGroupWithRiders ------------------------------

const createSchema = z.object({
  tripId: z.string().uuid(),
  direction: z.enum(RIDE_DIRECTION),
  airport: z.string().trim().max(100).nullable().optional(),
  // The people to seat in the ride (may include the creator's own member id
  // when they checked themselves). Bounded — a car isn't the whole trip.
  riderTripMemberIds: z.array(z.string().uuid()).min(1).max(30),
});

export interface CreateRideGroupInput {
  tripId: string;
  direction: (typeof RIDE_DIRECTION)[number];
  airport?: string | null;
  riderTripMemberIds: string[];
}

export type CreateRideGroupResult =
  | { ok: true; rideGroupId: string; riders: number }
  | { ok: false; errorKey: ErrorKey };

export async function createRideGroupWithRiders(
  input: CreateRideGroupInput,
  idempotencyKey: string
): Promise<CreateRideGroupResult> {
  if (!IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const { tripId, direction, airport, riderTripMemberIds } = parsed.data;

  const creatorId = await resolveMemberId(supabase, tripId, userId);
  if (!creatorId) return { ok: false, errorKey: "rls_denied" };

  const riders = Array.from(new Set(riderTripMemberIds));

  try {
    const result = await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_RIDE_GROUP,
      userId,
      async () => {
        // Insert the parent ride. On idempotency replay (23505), re-select
        // the existing group and STILL run the member fan-out below — a
        // mid-crash replay must be able to backfill missing rider rows.
        let rideGroupId: string;
        const { data: created, error: createErr } = await supabase
          .from("ride_groups")
          .insert({
            trip_id: tripId,
            created_by_trip_member_id: creatorId,
            airport: airport ?? null,
            direction,
            idempotency_key: idempotencyKey,
          })
          .select("id")
          .single();

        if (createErr) {
          if (createErr.code === "23505") {
            const { data: existing, error: fetchErr } = await supabase
              .from("ride_groups")
              .select("id")
              .eq("trip_id", tripId)
              .eq("created_by_trip_member_id", creatorId)
              .eq("idempotency_key", idempotencyKey)
              .single();
            if (fetchErr || !existing) throw new RideGroupError("save_failed");
            rideGroupId = (existing as { id: string }).id;
          } else if (createErr.code === "42501") {
            throw new RideGroupError("rls_denied");
          } else {
            throw new RideGroupError(
              createErr.code ? "save_rejected" : "save_failed"
            );
          }
        } else {
          rideGroupId = (created as { id: string }).id;
        }

        const added = await fanOutRiders(
          supabase,
          rideGroupId,
          creatorId,
          riders
        );
        return { rideGroupId, riders: added };
      }
    );
    return { ok: true, ...result };
  } catch (err) {
    return toErrorResult(err, "createRideGroupWithRiders");
  }
}

// ---- addRidersToRide ----------------------------------------

const addSchema = z.object({
  rideGroupId: z.string().uuid(),
  riderTripMemberIds: z.array(z.string().uuid()).min(1).max(30),
});

export type AddRidersResult =
  | { ok: true; added: number }
  | { ok: false; errorKey: ErrorKey };

export async function addRidersToRide(
  rideGroupId: string,
  riderTripMemberIds: string[],
  idempotencyKey: string
): Promise<AddRidersResult> {
  if (!IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = addSchema.safeParse({ rideGroupId, riderTripMemberIds });
  if (!parsed.success) return { ok: false, errorKey: "validation_failed" };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  // Resolve the group's trip (RLS SELECT allows any member) so we can bind
  // the caller's own membership as written_by.
  const { data: group, error: groupErr } = await supabase
    .from("ride_groups")
    .select("trip_id")
    .eq("id", parsed.data.rideGroupId)
    .maybeSingle();
  if (groupErr || !group) return { ok: false, errorKey: "rls_denied" };

  const writerId = await resolveMemberId(
    supabase,
    (group as { trip_id: string }).trip_id,
    userId
  );
  if (!writerId) return { ok: false, errorKey: "rls_denied" };

  const riders = Array.from(new Set(parsed.data.riderTripMemberIds));

  try {
    const added = await rateLimitedAction(
      RATE_LIMIT_SCOPES.MUTATE_RIDE_GROUP,
      userId,
      () => fanOutRiders(supabase, parsed.data.rideGroupId, writerId, riders)
    );
    return { ok: true, added };
  } catch (err) {
    return toErrorResult(err, "addRidersToRide");
  }
}

// ---- leaveRide (opt-out) ------------------------------------

export type LeaveRideResult = { ok: true } | { ok: false; errorKey: ErrorKey };

export async function leaveRide(
  rideGroupId: string
): Promise<LeaveRideResult> {
  if (!z.string().uuid().safeParse(rideGroupId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.MUTATE_RIDE_GROUP,
      userId,
      async () => {
        // RLS "leave own row" restricts the delete to the caller's own rider
        // row; a non-rider matches nothing (idempotent no-op).
        const { error } = await supabase
          .from("ride_group_members")
          .delete()
          .eq("ride_group_id", rideGroupId);
        if (error) {
          if (error.code === "42501") throw new RideGroupError("rls_denied");
          throw new RideGroupError("delete_failed");
        }
      }
    );
    return { ok: true };
  } catch (err) {
    return toErrorResult(err, "leaveRide");
  }
}

// ---- deleteRideGroup ----------------------------------------

export type DeleteRideGroupResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

export async function deleteRideGroup(
  rideGroupId: string
): Promise<DeleteRideGroupResult> {
  if (!z.string().uuid().safeParse(rideGroupId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.MUTATE_RIDE_GROUP,
      userId,
      async () => {
        // RLS "creator or organizer delete" gates this; a non-authorized
        // caller matches nothing (idempotent no-op). Cascade drops members.
        const { error } = await supabase
          .from("ride_groups")
          .delete()
          .eq("id", rideGroupId);
        if (error) {
          if (error.code === "42501") throw new RideGroupError("rls_denied");
          throw new RideGroupError("delete_failed");
        }
      }
    );
    return { ok: true };
  } catch (err) {
    return toErrorResult(err, "deleteRideGroup");
  }
}

// ---- shared fan-out -----------------------------------------

/**
 * Insert one membership row per rider. A rider who IS the writer self-joins
 * (written_by NULL — the self-join RLS path); everyone else is added
 * (written_by = writer — the on-behalf path). Per-row: a 23505 (rider already
 * in the ride — the PK is the idempotency guard) counts as done; a 42501 (a
 * target that stopped being addable between load and submit) is SKIPPED so one
 * stale target can't abort the batch; any other coded error fails the call.
 */
async function fanOutRiders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rideGroupId: string,
  writerId: string,
  riderIds: string[]
): Promise<number> {
  let count = 0;
  for (const riderId of riderIds) {
    const isSelf = riderId === writerId;
    const { error } = await supabase.from("ride_group_members").insert({
      ride_group_id: rideGroupId,
      trip_member_id: riderId,
      written_by_trip_member_id: isSelf ? null : writerId,
    });
    if (!error) {
      count += 1;
      continue;
    }
    if (error.code === "23505") {
      count += 1;
      continue;
    }
    if (error.code === "42501") {
      continue;
    }
    throw new RideGroupError(error.code ? "save_rejected" : "save_failed");
  }
  return count;
}

function toErrorResult(
  err: unknown,
  where: string
): { ok: false; errorKey: ErrorKey } {
  if (err instanceof RateLimitError) return { ok: false, errorKey: "rate_limit" };
  if (err instanceof RideGroupError) {
    return { ok: false, errorKey: saveErrorKey(err.reason) };
  }
  console.error(`[ride-groups] ${where} unexpected:`, err);
  return { ok: false, errorKey: "ride_group_save_failed" };
}
