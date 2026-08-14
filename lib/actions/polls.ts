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
import {
  POLL_COMMENT_COLUMNS,
  POLL_COMMENT_NO_ROW,
  PollCommentDbError,
  deleteComment as deletePollCommentRow,
} from "@/lib/db/poll-comments";
import type { ErrorKey } from "@/lib/copy/errors";
import type { PollComment, TripVisibility } from "@/lib/db/types";

type ServerSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

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
  // "custom" is deliberately excluded: no content_visibility_grants join
  // exists for polls, so can_see_content('custom') falls back to
  // is_trip_member — i.e. "everyone" with the illusion of restriction.
  // The composer already offers only these three; the action enforces it.
  visibility: z
    .enum(["everyone", "organizers_only", "hide_from_celebrant"])
    .optional()
    .default("everyone"),
});

const CAST_VOTE_SCHEMA = z.object({
  pollId: z.string().uuid(),
  optionId: z.string().uuid(),
});

// #621 — poll write-in options (part 2/3 of #616). Same 1-80 label
// bound as an organizer option (mirrored by the DB-side check in
// add_poll_option).
const ADD_POLL_OPTION_SCHEMA = z.object({
  pollId: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
});

// #620 — poll comments (part 1/3 of #616).
const POST_COMMENT_SCHEMA = z.object({
  pollId: z.string().uuid(),
  body: z.string().trim().min(1).max(500),
});

const DELETE_COMMENT_SCHEMA = z.object({
  commentId: z.string().uuid(),
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
  // "custom" is intentionally absent: polls have no
  // content_visibility_grants join, so can_see_content('custom') falls
  // back to "everyone" — an illusion of restriction. The action's zod
  // enum enforces this too.
  visibility?: Exclude<TripVisibility, "custom">;
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

// #621 — poll write-in options.
export interface AddPollOptionInput {
  pollId: string;
  label: string;
}

export type AddPollOptionResult =
  | { ok: true; optionId: string }
  | { ok: false; errorKey: ErrorKey };

// #620 — poll comments.
export interface PostPollCommentInput {
  pollId: string;
  body: string;
}

export type PostPollCommentResult =
  | { ok: true; comment: PollComment }
  | { ok: false; errorKey: ErrorKey };

export interface DeletePollCommentInput {
  commentId: string;
}

export type DeletePollCommentResult =
  | { ok: true }
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

// =============================================================
// addPollOptionAction (#621, part 2/3 of #616)
// =============================================================

/**
 * Member action: add ONE write-in option to an open, visible poll via
 * the `add_poll_option` RPC (SECURITY INVOKER — RLS's "options:
 * members can suggest" policy gates it, H1-bound to the caller's own
 * seat). Idempotent on (poll_id, suggester, label) at the DB — a
 * same-label resubmit replays the ORIGINAL option id.
 *
 * Error mapping is by `error.code` ONLY — never message text (#474
 * convention): 42501 -> rls_denied (not a member, poll invisible, poll
 * closed, or a bad seat bind — RLS collapses all of these to one
 * code); 22004 -> validation_failed (missing idempotency key, should
 * never happen client-side); 22023 -> validation_failed (bad label —
 * already caught by the zod schema, so this is a defense-in-depth
 * path); 54000 (program_limit_exceeded) -> the deterministic
 * `poll_option_full` (the 10-option cap) — a DISTINCT sqlstate from
 * 22023 specifically so this mapping never has to parse the message.
 */
export async function addPollOptionAction(
  input: AddPollOptionInput,
  idempotencyKey: string
): Promise<AddPollOptionResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = ADD_POLL_OPTION_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { pollId, label } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.ADD_POLL_OPTION,
      userId,
      async () => {
        const { data, error } = await supabase.rpc("add_poll_option", {
          p_poll_id: pollId,
          p_label: label,
          p_idempotency_key: idempotencyKey,
        });

        if (error || !data) {
          console.error("[polls] addPollOption failed:", {
            code: error?.code,
            message: error?.message,
          });
          if (error?.code === "54000") {
            return { ok: false as const, errorKey: "poll_option_full" as const };
          }
          return {
            ok: false as const,
            errorKey: error
              ? mapDbError(error)
              : ("poll_option_add_failed" as const),
          };
        }

        // F2 / #400: revalidate only on a genuine success.
        revalidatePath("/trips", "layout");
        return { ok: true as const, optionId: data as string };
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[polls] addPollOption unexpected:", err);
    return { ok: false, errorKey: "poll_option_add_failed" };
  }
}

// =============================================================
// Poll comments (#620, part 1/3 of #616)
//
// A flat thread on each poll, visibility inherited from the poll's own
// can_see_content(). Same envelope shape as the vote actions above
// (discriminated union, zod at the boundary, rate-limited, idempotent),
// but the error split follows the shopping-comment precedent
// (lib/actions/shopping-item-comments.ts): `save_rejected` (deterministic
// server rejection, e.g. a CHECK constraint) vs `save_failed` (codeless/
// transient) are distinct copy, not both collapsed into the generic
// `mapDbError` "validation_failed" bucket.
// =============================================================

type PollCommentErrorReason = "rls_denied" | "save_rejected" | "save_failed";

class PollCommentActionError extends Error {
  readonly reason: PollCommentErrorReason;
  constructor(reason: PollCommentErrorReason) {
    super(`poll_comment_action_error:${reason}`);
    this.name = "PollCommentActionError";
    this.reason = reason;
  }
}

function pollCommentErrorKey(reason: PollCommentErrorReason): ErrorKey {
  switch (reason) {
    case "rls_denied":
      return "rls_denied";
    case "save_rejected":
      return "poll_comment_save_rejected";
    case "save_failed":
      return "poll_comment_save_failed";
  }
}

/**
 * Resolve the parent poll's trip and the caller's own member row. The
 * poll select runs under RLS — a poll the caller can't see (wrong trip,
 * non-member, or hidden by visibility) resolves to null. Mirrors
 * `resolveCommentContext` in shopping-item-comments.ts, kept as a local
 * copy since the two files intentionally have no shared import
 * (different table, different write shape).
 */
async function resolvePollCommentContext(
  supabase: ServerSupabase,
  pollId: string,
  userId: string
): Promise<{ tripId: string; tripMemberId: string } | null> {
  const { data: poll } = await supabase
    .from("polls")
    .select("trip_id")
    .eq("id", pollId)
    .maybeSingle();

  if (!poll) return null;
  const tripId = (poll as { trip_id: string }).trip_id;

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
 * Post a comment to a poll's thread. Idempotent on
 * (poll_id, author_trip_member_id, idempotency_key) — a drunk
 * double-tap replays the existing row instead of inserting a
 * duplicate. Revalidates on success only (F2 — matches
 * createPollAction / castPollVoteAction above); the client additionally
 * calls `router.refresh()` after a confirmed success (#349 — the
 * comment thread must not depend on the Realtime channel landing the
 * INSERT).
 */
export async function postPollCommentAction(
  input: PostPollCommentInput,
  idempotencyKey: string
): Promise<PostPollCommentResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = POST_COMMENT_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { pollId, body } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const context = await resolvePollCommentContext(supabase, pollId, userId);
  if (!context) return { ok: false, errorKey: "rls_denied" };
  const { tripId, tripMemberId } = context;

  try {
    const comment = await rateLimitedAction(
      RATE_LIMIT_SCOPES.MUTATE_POLL_COMMENT,
      userId,
      async () => {
        const { data, error } = await supabase
          .from("poll_comments")
          .insert({
            poll_id: pollId,
            trip_id: tripId,
            author_trip_member_id: tripMemberId,
            body,
            idempotency_key: idempotencyKey,
          })
          .select(POLL_COMMENT_COLUMNS)
          .single();

        if (error) {
          if (error.code === "23505") {
            const { data: existing, error: fetchErr } = await supabase
              .from("poll_comments")
              .select(POLL_COMMENT_COLUMNS)
              .eq("poll_id", pollId)
              .eq("author_trip_member_id", tripMemberId)
              .eq("idempotency_key", idempotencyKey)
              .single();
            if (fetchErr || !existing) {
              throw new PollCommentActionError("save_failed");
            }
            return existing as PollComment;
          }
          if (error.code === "42501") {
            throw new PollCommentActionError("rls_denied");
          }
          throw new PollCommentActionError(
            error.code ? "save_rejected" : "save_failed"
          );
        }
        return data as PollComment;
      }
    );
    // F2: revalidate only on a genuine success.
    revalidatePath("/trips", "layout");
    return { ok: true, comment };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof PollCommentActionError) {
      return { ok: false, errorKey: pollCommentErrorKey(err.reason) };
    }
    console.error("[polls] postPollComment unexpected:", err);
    return { ok: false, errorKey: "poll_comment_save_failed" };
  }
}

/**
 * Delete a comment. RLS (DELETE policy) restricts this to the comment's
 * author or an organizer. A no-row match (already gone — double-tapped
 * delete, or someone else beat the caller to it) converges to
 * `{ ok: true }` — the desired end state (gone) already holds, mirroring
 * `deleteShoppingComment`'s precedent. `idempotencyKey` is validated for
 * shape (rule 9 surface consistency with every other action in this
 * file) but unused for the write itself — a DELETE is naturally
 * idempotent via the no-row convergence above, so there is no
 * idempotency_key column to persist it against.
 */
export async function deletePollCommentAction(
  input: DeletePollCommentInput,
  idempotencyKey: string
): Promise<DeletePollCommentResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = DELETE_COMMENT_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { commentId } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.MUTATE_POLL_COMMENT,
      userId,
      () => deletePollCommentRow(supabase, commentId)
    );
    // F2: revalidate only on a genuine success.
    revalidatePath("/trips", "layout");
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    // Already gone — a double-tapped delete converges to success rather
    // than falling into the shared NO_ROW->rls_denied collapse below.
    if (
      err instanceof PollCommentDbError &&
      err.code === POLL_COMMENT_NO_ROW
    ) {
      return { ok: true };
    }
    if (err instanceof PollCommentDbError && err.code === "42501") {
      return { ok: false, errorKey: "rls_denied" };
    }
    console.error("[polls] deletePollComment unexpected:", err);
    return { ok: false, errorKey: "poll_comment_delete_failed" };
  }
}
