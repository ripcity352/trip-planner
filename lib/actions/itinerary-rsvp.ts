"use server";

/**
 * Server action for per-item RSVP (M3 #38 — silent opt-out chip).
 *
 * Surface contract:
 *   - `setItemRsvp(itemId, status, idempotencyKey)` upserts the
 *     caller's own row in `itinerary_item_rsvps`.
 *   - Strictly user-scoped: `trip_member_id` is resolved server-side
 *     from auth.uid() — callers cannot impersonate another member.
 *   - Idempotency scope: (item_id, trip_member_id, idempotency_key)
 *     per the strictly-user-tables ADR.
 *   - Silent: no revalidatePath, no Realtime broadcast. The opt-out
 *     chip is local state confirmed by the server response.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { ItineraryItemRsvpStatus } from "@/lib/db/types";

const RSVP_STATUSES = ["going", "skipping"] as const;
const _exhaustive: ReadonlyArray<ItineraryItemRsvpStatus> = RSVP_STATUSES;
void _exhaustive;

const setItemRsvpSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(RSVP_STATUSES),
});

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

export interface SetItemRsvpInput {
  itemId: string;
  status: ItineraryItemRsvpStatus;
}

export type SetItemRsvpResult =
  | { ok: true; status: ItineraryItemRsvpStatus }
  | { ok: false; errorKey: ErrorKey };

/**
 * Upsert the caller's per-item RSVP. The caller's trip_member_id is
 * resolved server-side from auth.uid() via the itinerary item's trip.
 * Returns `rls_denied` if the caller is not a member of the item's trip.
 */
export async function setItemRsvp(
  input: SetItemRsvpInput,
  idempotencyKey: string
): Promise<SetItemRsvpResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = setItemRsvpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const { itemId, status } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  // Resolve the caller's trip_member_id for this item's trip.
  // We join through itinerary_items to find the trip_id, then look
  // up the caller's membership row.
  type MemberLookup = { id: string };

  let tripMemberId: string;
  try {
    const { data: itemData, error: itemError } = await supabase
      .from("itinerary_items")
      .select("trip_id")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError || !itemData) {
      return { ok: false, errorKey: "rls_denied" };
    }

    const { data: memberData, error: memberError } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", itemData.trip_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError || !memberData) {
      return { ok: false, errorKey: "rls_denied" };
    }

    tripMemberId = (memberData as MemberLookup).id;
  } catch (err) {
    console.error("[itinerary-rsvp] member lookup unexpected:", err);
    return { ok: false, errorKey: "item_rsvp_save_failed" };
  }

  // Idempotency check: if this exact key is already stored, return
  // the current status without a second upsert.
  try {
    const { data: existing } = await supabase
      .from("itinerary_item_rsvps")
      .select("status, idempotency_key")
      .eq("item_id", itemId)
      .eq("trip_member_id", tripMemberId)
      .maybeSingle();

    if (
      existing &&
      (existing as { idempotency_key: string | null }).idempotency_key ===
        idempotencyKey
    ) {
      return {
        ok: true,
        status: (existing as { status: ItineraryItemRsvpStatus }).status,
      };
    }
  } catch {
    // Non-fatal — proceed to upsert
  }

  try {
    const result = await rateLimitedAction(
      RATE_LIMIT_SCOPES.SET_ITEM_RSVP,
      userId,
      async () => {
        const { error } = await supabase
          .from("itinerary_item_rsvps")
          .upsert(
            {
              item_id: itemId,
              trip_member_id: tripMemberId,
              status,
              idempotency_key: idempotencyKey,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "item_id,trip_member_id" }
          );

        if (error) {
          if (error.code === "42501") {
            throw new ItemRsvpError("rls_denied");
          }
          throw new ItemRsvpError("save_failed");
        }
        return status;
      }
    );

    return { ok: true, status: result };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ItemRsvpError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied" ? "rls_denied" : "item_rsvp_save_failed",
      };
    }
    console.error("[itinerary-rsvp] setItemRsvp unexpected:", err);
    return { ok: false, errorKey: "item_rsvp_save_failed" };
  }
}

class ItemRsvpError extends Error {
  readonly reason: "save_failed" | "rls_denied";

  constructor(reason: "save_failed" | "rls_denied") {
    super(`item_rsvp_error:${reason}`);
    this.name = "ItemRsvpError";
    this.reason = reason;
  }
}
