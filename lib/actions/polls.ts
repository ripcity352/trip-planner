"use server";

/**
 * Server actions for the generic poll primitive (#390).
 *
 * Scope fence: ONE decision widget — question + 2–4 options + optional
 * date-only deadline. Organizer composer only this round.
 *
 * Every action (mirroring the date-poll action contract):
 *   - returns a discriminated union — never throws to the caller
 *   - validates input with zod at the boundary
 *   - is rate-limited (CREATE_POLL / CAST_POLL_VOTE buckets)
 *   - is idempotent on a client-supplied UUID key (rule 9)
 *
 * RLS is the authoritative gate; this layer is defense-in-depth.
 *
 * F2 / #400: EVERY mutation revalidates on success — no action is
 * F2-exempt (the #400 lesson: the optimistic chip never covers the
 * aggregate tally on the actor's own page). The client additionally
 * refetches its own view via PulsePoll's `refetch`.
 *
 * There is deliberately no closePollAction — the deadline closes a
 * poll (DB-enforced in the vote policies), and the organizer picks it
 * at compose time. An early-close affordance is follow-up scope; the
 * RLS UPDATE policy for it already exists.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import { isPollClosed } from "@/lib/db/polls";
import type { ErrorKey } from "@/lib/copy/errors";
import type { TripVisibility } from "@/lib/db/types";

// =============================================================
// zod schemas
// =============================================================

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();
const ISO_DATE_SCHEMA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The 2–4 invariant (scope fence). Mirrored by the DB-side check in
 * create_poll_with_options — this is the friendly early rejection. */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

const CREATE_POLL_SCHEMA = z.object({
  tripId: z.string().uuid(),
  question: z.string().trim().min(1).max(280),
  options: z
    .array(z.string().trim().min(1).max(80))
    .min(MIN_OPTIONS)
    .max(MAX_OPTIONS),
  closesOn: ISO_DATE_SCHEMA.nullish(),
  visibility: z
    .enum(["everyone", "organizers_only", "hide_from_celebrant", "custom"])
    .optional()
    .default("everyone"),
});

const CAST_VOTE_SCHEMA = z.object({
  pollId: z.string().uuid(),
  optionId: z.string().uuid(),
});

// =============================================================
// Types
// =============================================================

export interface CreatePollInput {
  tripId: string;
  question: string;
  options: string[];
  /** ISO date `YYYY-MM-DD`; omit/null for an open-ended poll. */
  closesOn?: string | null;
  visibility?: TripVisibility;
}

export type CreatePollResult =
  | { ok: true; pollId: string }
  | { ok: false; errorKey: ErrorKey };

export interface CastPollVoteInput {
  pollId: string;
  optionId: string;
}

export type CastPollVoteResult =
  | { ok: true; optionId: string }
  | { ok: false; errorKey: ErrorKey };

// =============================================================
// Error mapping (same shape as the date-poll actions)
// =============================================================

function mapDbError(error: {
  message?: string;
  code?: string;
} | null): ErrorKey {
  if (!error) return "network";
  if (error.code === "42501") return "rls_denied";
  if (error.code === "P0001") return "validation_failed";
  // 22xxx — data exceptions (the RPC's 22023 option-count / 22004
  // missing-key guards land here).
  if (error.code?.startsWith("22")) return "validation_failed";
  // 23xxx — integrity constraint violations (pair FK, uniques).
  if (error.code?.startsWith("23")) return "validation_failed";
  return "network";
}

/** Server-side "today" in UTC — matches the DB's current_date (UTC on
 * Supabase) so the app-level deadline check and the RLS predicate
 * can't disagree. Date-only register; acceptable drift per the ADR. */
function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================================
// createPollAction
// =============================================================

/**
 * Organizer action: create a poll with 2–4 options atomically via the
 * `create_poll_with_options` RPC (SECURITY INVOKER — RLS gates it).
 * Idempotent on (trip_id, idempotency_key); a replay returns the
 * ORIGINAL poll id.
 *
 * `hide_from_celebrant` by a celebrant-organizer is rejected up front
 * (`poll_visibility_self_hidden`) — the #384-class deterministic
 * rejection, mirroring the expenses visibility guard.
 */
export async function createPollAction(
  input: CreatePollInput,
  idempotencyKey: string
): Promise<CreatePollResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = CREATE_POLL_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, question, options, closesOn, visibility } = parsed.data;

  // A poll born closed is nonsense — closes_on must be today or later.
  if (closesOn && closesOn < todayIsoUtc()) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_POLL,
      userId,
      async () => {
        // #384-class guard: a celebrant-organizer picking
        // hide_from_celebrant would create a poll invisible to its own
        // author. Deterministic rejection with honest copy.
        if (visibility === "hide_from_celebrant") {
          const { data: isCelebrant, error: celebrantError } =
            await supabase.rpc("is_trip_celebrant", { p_trip_id: tripId });
          if (celebrantError) {
            return {
              ok: false as const,
              errorKey: mapDbError(celebrantError),
            };
          }
          if (isCelebrant === true) {
            return {
              ok: false as const,
              errorKey: "poll_visibility_self_hidden" as const,
            };
          }
        }

        const { data, error } = await supabase.rpc(
          "create_poll_with_options",
          {
            p_trip_id: tripId,
            p_question: question,
            p_visibility: visibility,
            p_closes_on: closesOn ?? null,
            p_idempotency_key: idempotencyKey,
            p_options: options,
          }
        );

        if (error || !data) {
          console.error("[polls] createPoll failed:", {
            code: error?.code,
            message: error?.message,
          });
          return {
            ok: false as const,
            errorKey: error ? mapDbError(error) : ("poll_create_failed" as const),
          };
        }

        // F2 / #400: revalidate only on a genuine success.
        revalidatePath("/trips", "layout");
        return { ok: true as const, pollId: data as string };
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[polls] createPoll unexpected:", err);
    return { ok: false, errorKey: "poll_create_failed" };
  }
}

// =============================================================
// castPollVoteAction
// =============================================================

/**
 * Member action: cast (or switch) a single-choice vote. Upsert on the
 * (poll_id, trip_member_id) PK — a revote lands on the same row. RLS
 * WITH CHECK binds trip_member_id to the caller's own trip_members row
 * (H1 pattern — vote stuffing is structurally impossible) and enforces
 * the closes_on deadline at the DB; the checks here are the friendly
 * early rejections.
 */
export async function castPollVoteAction(
  input: CastPollVoteInput,
  idempotencyKey: string
): Promise<CastPollVoteResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = CAST_VOTE_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { pollId, optionId } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.CAST_POLL_VOTE,
      userId,
      async () => {
        // RLS-gated read: an invisible poll (non-member, or celebrant
        // vs hide_from_celebrant) comes back empty — rls_denied.
        const { data: poll, error: pollError } = await supabase
          .from("polls")
          .select("trip_id, closes_on")
          .eq("id", pollId)
          .maybeSingle();
        if (pollError) {
          return { ok: false as const, errorKey: mapDbError(pollError) };
        }
        if (!poll) {
          return { ok: false as const, errorKey: "rls_denied" as const };
        }
        const { trip_id: tripId, closes_on: closesOn } = poll as {
          trip_id: string;
          closes_on: string | null;
        };

        if (isPollClosed(closesOn, todayIsoUtc())) {
          return { ok: false as const, errorKey: "poll_closed" as const };
        }

        // Resolve the caller's OWN member row — never trust a
        // caller-supplied trip_member_id (H1).
        const { data: member, error: memberError } = await supabase
          .from("trip_members")
          .select("id")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .maybeSingle();
        if (memberError) {
          return { ok: false as const, errorKey: mapDbError(memberError) };
        }
        if (!member) {
          return { ok: false as const, errorKey: "rls_denied" as const };
        }
        const { id: tripMemberId } = member as { id: string };

        // Upsert on the PK so a revote is a single round-trip. The
        // idempotency partial unique makes a same-key replay a no-op;
        // the pair FK (option_id, poll_id) refuses cross-poll options.
        const { error: upsertError } = await supabase
          .from("poll_votes")
          .upsert(
            {
              poll_id: pollId,
              option_id: optionId,
              trip_member_id: tripMemberId,
              idempotency_key: idempotencyKey,
              voted_at: new Date().toISOString(),
            },
            { onConflict: "poll_id,trip_member_id" }
          );

        if (upsertError) {
          console.error("[polls] castPollVote failed:", {
            code: upsertError.code,
            message: upsertError.message,
          });
          return { ok: false as const, errorKey: mapDbError(upsertError) };
        }

        // F2 / #400: revalidate only on a genuine success — the voter's
        // own aggregate tally must never depend on the Realtime channel.
        revalidatePath("/trips", "layout");
        return { ok: true as const, optionId };
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[polls] castPollVote unexpected:", err);
    return { ok: false, errorKey: "poll_vote_failed" };
  }
}
