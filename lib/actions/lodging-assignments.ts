"use server";

/**
 * Server actions for lodging assignments (M3 #36).
 *
 * Surface contract:
 *   - `assignMemberToLodging(input, idempotencyKey)` creates or updates
 *     a lodging assignment. Organizer-only via RLS.
 *   - `removeLodgingAssignment(id)` deletes an assignment. Organizer-only.
 *   - The DB trigger `assert_lodging_item_kind_before_assignment` enforces
 *     that the referenced item has `kind = 'lodging'`. The action catches
 *     P0001 and maps it to `validation_failed`.
 *   - Idempotency: the unique constraint on (item_id, trip_member_id)
 *     makes assignment naturally idempotent. Upsert semantics are used
 *     (ON CONFLICT UPDATE the room_label).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { LodgingAssignment } from "@/lib/db/types";

const assignSchema = z.object({
  itemId: z.string().uuid(),
  tripMemberId: z.string().uuid(),
  roomLabel: z.string().trim().max(100).nullable().optional(),
});

export interface AssignMemberToLodgingInput {
  itemId: string;
  tripMemberId: string;
  roomLabel?: string | null;
}

export type AssignMemberToLodgingResult =
  | { ok: true; assignment: LodgingAssignment }
  | { ok: false; errorKey: ErrorKey };

export type RemoveLodgingAssignmentResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

const LODGING_COLUMNS =
  "id, item_id, trip_member_id, room_label, created_at";

/**
 * Assign a trip member to a lodging item. Organizer-only.
 * Upserts on (item_id, trip_member_id) — calling again updates the
 * room_label without creating a duplicate.
 * The DB trigger raises P0001 if item.kind != 'lodging'.
 */
export async function assignMemberToLodging(
  input: AssignMemberToLodgingInput
): Promise<AssignMemberToLodgingResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { itemId, tripMemberId, roomLabel } = parsed.data;

  try {
    const assignment = await rateLimitedAction(
      RATE_LIMIT_SCOPES.ASSIGN_LODGING,
      userId,
      async () => {
        const { data, error } = await supabase
          .from("lodging_assignments")
          .upsert(
            {
              item_id: itemId,
              trip_member_id: tripMemberId,
              room_label: roomLabel ?? null,
            },
            { onConflict: "item_id,trip_member_id" }
          )
          .select(LODGING_COLUMNS)
          .single();

        if (error) {
          if (error.code === "42501") {
            throw new LodgingError("rls_denied");
          }
          // P0001 = trigger fired — item.kind != 'lodging'
          if (error.code === "P0001") {
            throw new LodgingError("wrong_kind");
          }
          throw new LodgingError("save_failed");
        }
        return data as LodgingAssignment;
      }
    );

    return { ok: true, assignment };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof LodgingError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied"
            ? "rls_denied"
            : err.reason === "wrong_kind"
            ? "validation_failed"
            : "lodging_assign_failed",
      };
    }
    console.error("[lodging] assignMemberToLodging unexpected:", err);
    return { ok: false, errorKey: "lodging_assign_failed" };
  }
}

/**
 * Remove a lodging assignment by its id. Organizer-only via RLS.
 * Idempotent — if the row is already gone, returns ok: true.
 */
export async function removeLodgingAssignment(
  id: string
): Promise<RemoveLodgingAssignmentResult> {
  const parsedId = z.string().uuid().safeParse(id);
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
      .from("lodging_assignments")
      .delete()
      .eq("id", parsedId.data);

    if (error) {
      if (error.code === "42501") {
        return { ok: false, errorKey: "rls_denied" };
      }
      console.error("[lodging] removeLodgingAssignment failed:", error.message);
      return { ok: false, errorKey: "lodging_assign_failed" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[lodging] removeLodgingAssignment unexpected:", err);
    return { ok: false, errorKey: "lodging_assign_failed" };
  }
}

class LodgingError extends Error {
  readonly reason: "save_failed" | "rls_denied" | "wrong_kind";

  constructor(reason: "save_failed" | "rls_denied" | "wrong_kind") {
    super(`lodging_error:${reason}`);
    this.name = "LodgingError";
    this.reason = reason;
  }
}
