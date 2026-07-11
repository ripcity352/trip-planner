"use server";

/**
 * Server action for announcement reactions (#389 — the ack loop).
 *
 * Surface contract:
 *   - `toggleReactionAction({ announcementId, emoji, active })` sets the
 *     caller's reaction to a DESIRED END STATE (react / unreact), rather
 *     than blindly flipping. That keeps the drunk-double-tap replay
 *     idempotent: two identical calls converge (duplicate insert → 23505
 *     treated as success; duplicate delete → 0 rows, also success)
 *     instead of toggling the ack back off.
 *   - Rule-9 exception: no idempotency_key column — the natural key
 *     unique (announcement_id, trip_member_id, emoji) IS the idempotency
 *     guarantee (item_flags precedent; documented in the migration).
 *   - Strictly user-scoped: trip_member_id resolves server-side from
 *     auth.uid(); callers cannot react on behalf of others (RLS enforces
 *     the same).
 *   - Visibility is inherited from the parent announcement: the parent
 *     lookup runs under RLS, so a hidden parent resolves to no row and
 *     the action returns rls_denied before any write (RLS on
 *     announcement_reactions backstops the write itself).
 *   - F2 / #110: `revalidatePath` fires on every success branch (fresh
 *     write AND idempotent replay) so the actor's own view never depends
 *     on a realtime channel.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import { REACTION_EMOJI } from "@/lib/reactions/constants";
import type { ReactionEmoji } from "@/lib/reactions/constants";
import type { ErrorKey } from "@/lib/copy/errors";

const toggleReactionSchema = z.object({
  announcementId: z.string().uuid(),
  emoji: z.enum(REACTION_EMOJI),
  active: z.boolean(),
});

export interface ToggleReactionInput {
  announcementId: string;
  /** Typed as string at the boundary; zod narrows to the fixed set. */
  emoji: string;
  /** Desired end state: true = reacted, false = not reacted. */
  active: boolean;
}

export type ToggleReactionResult =
  | { ok: true; active: boolean }
  | { ok: false; errorKey: ErrorKey };

type ServerSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

/**
 * Resolve the parent announcement's trip and the caller's own member row.
 * The announcement select runs under RLS — a parent the caller can't see
 * (wrong trip, or hidden by visibility) resolves to null.
 */
async function resolveReactionContext(
  supabase: ServerSupabase,
  announcementId: string,
  userId: string
): Promise<{ tripId: string; tripMemberId: string } | null> {
  const { data: announcement } = await supabase
    .from("announcements")
    .select("trip_id")
    .eq("id", announcementId)
    .maybeSingle();

  if (!announcement) return null;
  const tripId = (announcement as { trip_id: string }).trip_id;

  const { data: member } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) return null;

  return { tripId, tripMemberId: (member as { id: string }).id };
}

/**
 * Set the caller's reaction on an announcement to the desired end state.
 * Idempotent in both directions (see module header). Works for every
 * role including the celebrant on announcements they can see — this is
 * the celebrant's ack channel too (rule 11).
 */
export async function toggleReactionAction(
  input: ToggleReactionInput
): Promise<ToggleReactionResult> {
  const parsed = toggleReactionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { announcementId, emoji, active } = parsed.data;

  let tripId: string;
  let tripMemberId: string;
  try {
    const context = await resolveReactionContext(
      supabase,
      announcementId,
      userId
    );
    if (!context) return { ok: false, errorKey: "rls_denied" };
    tripId = context.tripId;
    tripMemberId = context.tripMemberId;
  } catch (err) {
    console.error("[announcement-reactions] context lookup unexpected:", err);
    return { ok: false, errorKey: "reaction_save_failed" };
  }

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.TOGGLE_REACTION, userId, () =>
      active
        ? insertReaction(supabase, announcementId, tripId, tripMemberId, emoji)
        : deleteReaction(supabase, announcementId, tripMemberId, emoji)
    );

    // F2 / #110: revalidate the trips layout so the announcements feed
    // (and the dashboard link into it) stay fresh for the actor's own
    // view. Success branches only — a rejected write must not trigger a
    // cache miss.
    revalidatePath("/trips", "layout");
    return { ok: true, active };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ReactionActionError) {
      return {
        ok: false,
        errorKey:
          err.reason === "rls_denied" ? "rls_denied" : "reaction_save_failed",
      };
    }
    console.error("[announcement-reactions] toggle unexpected:", err);
    return { ok: false, errorKey: "reaction_save_failed" };
  }
}

async function insertReaction(
  supabase: ServerSupabase,
  announcementId: string,
  tripId: string,
  tripMemberId: string,
  emoji: ReactionEmoji
): Promise<void> {
  const { error } = await supabase.from("announcement_reactions").insert({
    announcement_id: announcementId,
    trip_id: tripId,
    trip_member_id: tripMemberId,
    emoji,
  });

  if (error) {
    // Natural-key replay: the reaction already exists — desired state
    // reached, treat as success (rule-9 exception, see module header).
    if (error.code === "23505") return;
    if (error.code === "42501") throw new ReactionActionError("rls_denied");
    throw new ReactionActionError("save_failed");
  }
}

async function deleteReaction(
  supabase: ServerSupabase,
  announcementId: string,
  tripMemberId: string,
  emoji: ReactionEmoji
): Promise<void> {
  const { error } = await supabase
    .from("announcement_reactions")
    .delete()
    .eq("announcement_id", announcementId)
    .eq("trip_member_id", tripMemberId)
    .eq("emoji", emoji);

  if (error) {
    if (error.code === "42501") throw new ReactionActionError("rls_denied");
    throw new ReactionActionError("save_failed");
  }
  // A 0-row delete is a successful no-op: desired state already holds.
}

class ReactionActionError extends Error {
  readonly reason: "save_failed" | "rls_denied";

  constructor(reason: "save_failed" | "rls_denied") {
    super(`reaction_action_error:${reason}`);
    this.name = "ReactionActionError";
    this.reason = reason;
  }
}
