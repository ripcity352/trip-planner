"use server";

/**
 * Server actions for the celebrant-weighted date poll (M2 Wave 3).
 *
 * Closes #75 (celebrant-weighted poll) + #76 (reusable PulsePoll).
 * The contract is documented in `notes/m2-execution-plan.md` §
 * Appendix A.5. Every action:
 *
 *   - returns a discriminated union — never throws to the caller
 *   - validates input with zod at the boundary
 *   - is rate-limited via `lib/rate-limit` (CREATE_TRIP for
 *     organizer-y writes; CAST_DATE_VOTE for the high-tap vote path)
 *   - is idempotent on a client-supplied UUID key (drunk-double-tap
 *     surface)
 *
 * RLS is the authoritative gate; the action layer is defense-in-depth.
 * Errors from the DB are mapped through `mapDbError` so a hostile
 * caller can't enumerate vetoed candidates through error probing
 * (P0001 from the trigger collapses to the generic `validation_failed`
 * key — see `mapDbError`).
 *
 * F2 / #110: `proposeDateCandidatesAction` and `setCelebrantMarkAction`
 * call `revalidatePath` on success so the organizer/celebrant's own view
 * never depends on the Realtime channel — see notes/decisions.md
 * "F2 — the #110 mutation contract extends…". `castDateVoteAction` is
 * deliberately left out: the member-vote UI is already fully optimistic
 * (mirrors `RsvpToggle`), and it's the highest-tap path on this page —
 * see the F2 PR body for the full reasoning. `lockInCandidateAction` is
 * unwired stretch scope with no UI consumer, so there's no "actor's own
 * view" to fix.
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
import type {
  DatePollCelebrantMark,
  Trip,
} from "@/lib/db/types";

// =============================================================
// Constants
// =============================================================

// `MAX_CANDIDATES_PER_TRIP` lives in `./date-poll-constants` because
// Next.js `"use server"` modules can only export async functions —
// re-exporting a non-async const here would fail the App Router
// compile. Importing from the shared module instead means both the
// action layer and the UI (e.g. `_live-region.tsx`) share one source
// of truth without a magic-literal mismatch.
import { MAX_CANDIDATES_PER_TRIP } from "./date-poll-constants";

// =============================================================
// zod schemas
// =============================================================

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();
const UUID_SCHEMA = z.string().uuid();

const CANDIDATE_SCHEMA = z.object({
  label: z.string().trim().min(1).max(80),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const PROPOSE_INPUT_SCHEMA = z.object({
  tripId: UUID_SCHEMA,
  candidates: z.array(CANDIDATE_SCHEMA).min(1).max(MAX_CANDIDATES_PER_TRIP),
});

const SET_MARK_INPUT_SCHEMA = z.object({
  candidateId: UUID_SCHEMA,
  mark: z.enum(["works", "works-with-effort", "no-go"] as const),
});

const VOTE_INPUT_SCHEMA = z.object({
  candidateId: UUID_SCHEMA,
  vote: z.boolean(),
});

// =============================================================
// Result types
// =============================================================

export interface ProposeDateCandidatesInput {
  tripId: string;
  candidates: Array<{ label: string; starts_on: string; ends_on: string }>;
}

export type ProposeDateCandidatesResult =
  | { ok: true; created: number }
  | { ok: false; errorKey: ErrorKey };

export interface SetCelebrantMarkInput {
  candidateId: string;
  mark: DatePollCelebrantMark;
}

export type SetCelebrantMarkResult =
  | { ok: true; mark: DatePollCelebrantMark }
  | { ok: false; errorKey: ErrorKey };

export interface CastDateVoteInput {
  candidateId: string;
  vote: boolean;
}

export type CastDateVoteResult =
  | { ok: true; vote: boolean }
  | { ok: false; errorKey: ErrorKey };

export type LockInCandidateResult =
  | { ok: true; trip: Trip }
  | { ok: false; errorKey: ErrorKey };

// =============================================================
// Error mapping
// =============================================================

/**
 * Map Postgres / Supabase error shapes to user-facing `ErrorKey`s.
 *
 * Anti-enumeration: P0001 from `assert_candidate_not_vetoed_before_vote`
 * collapses to `validation_failed`, not a "celebrant vetoed this" key
 * — surfacing the distinction would let a non-celebrant member probe
 * the celebrant's marks by attempting votes.
 *
 * 42501 (RLS / insufficient_privilege) → `rls_denied`.
 * 23xxx (constraint, including idempotency replays) → `validation_failed`
 *   for safety; the action layer special-cases idempotency replays
 *   higher up.
 */
function mapDbError(error: {
  message?: string;
  code?: string;
} | null): ErrorKey {
  if (!error) return "network";
  if (error.code === "42501") return "rls_denied";
  if (error.code === "P0001") return "validation_failed";
  // 23xxx — integrity constraint violations (unique, foreign-key,
  // check). Surfacing as `validation_failed` is the safest default;
  // the user's intended write is structurally invalid.
  if (error.code?.startsWith("23")) return "validation_failed";
  return "network";
}

// =============================================================
// proposeDateCandidates
// =============================================================

/**
 * Organizer / celebrant action: propose 1..4 candidate date windows.
 * App-level cap (MAX_CANDIDATES_PER_TRIP) enforced as a pre-flight
 * COUNT(*) — concurrent inserts above the cap are accepted (no race
 * guarantee at the cap) but the UI surfaces the cap clearly. A future
 * wave can promote this to a check function if a real race appears.
 *
 * Idempotency: we don't carry an idempotency_key on `date_poll_candidates`
 * (no column). The action is naturally idempotent through the unique
 * `(trip_id, label, starts_on, ends_on)` tuple plus the cap — the
 * organizer surface is low-tap; the drunk-double-tap surface is the
 * vote path.
 */
export async function proposeDateCandidatesAction(
  input: ProposeDateCandidatesInput,
  idempotencyKey: string
): Promise<ProposeDateCandidatesResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = PROPOSE_INPUT_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, candidates } = parsed.data;

  // Cross-field validation: ends_on >= starts_on. Cheap to check here
  // rather than letting the DB raise 23514 and re-mapping.
  for (const c of candidates) {
    if (c.ends_on < c.starts_on) {
      return { ok: false, errorKey: "validation_failed" };
    }
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_TRIP,
      userId,
      async () => {
        // Cap pre-flight. The COUNT is gated by RLS to trip members —
        // a non-member sees 0, but they couldn't INSERT anyway.
        const { count, error: countError } = await supabase
          .from("date_poll_candidates")
          .select("id", { count: "exact", head: true })
          .eq("trip_id", tripId);

        if (countError) {
          return {
            ok: false as const,
            errorKey: mapDbError(countError),
          };
        }
        const existing = count ?? 0;
        if (existing + candidates.length > MAX_CANDIDATES_PER_TRIP) {
          return {
            ok: false as const,
            errorKey: "validation_failed",
          };
        }

        // Bulk insert in one round-trip. RLS WITH CHECK enforces
        // organizer-or-celebrant on each row.
        const { error: insertError, data } = await supabase
          .from("date_poll_candidates")
          .insert(
            candidates.map((c) => ({
              trip_id: tripId,
              label: c.label,
              starts_on: c.starts_on,
              ends_on: c.ends_on,
              created_by: userId,
            }))
          )
          .select("id");

        if (insertError) {
          console.error("[date-poll] propose candidates failed:", {
            code: insertError.code,
            message: insertError.message,
          });
          return {
            ok: false as const,
            errorKey: mapDbError(insertError),
          };
        }

        // F2 / #110: revalidate only on a genuine success — every other
        // branch above already returned `ok: false`.
        revalidatePath("/trips", "layout");
        return { ok: true as const, created: (data ?? []).length };
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[date-poll] proposeDateCandidates unexpected:", err);
    return { ok: false, errorKey: "network" };
  }
}

// =============================================================
// setCelebrantMark
// =============================================================

/**
 * Celebrant-only action: upsert the celebrant chip for a candidate.
 * RLS WITH CHECK is the authoritative gate (only the celebrant of the
 * candidate's trip can write).
 *
 * Upsert semantics: we PK on `candidate_id` so a re-mark replaces the
 * row. The `idempotencyKey` parameter is currently advisory (no column
 * on the marks table) — the upsert is naturally idempotent.
 */
export async function setCelebrantMarkAction(
  input: SetCelebrantMarkInput,
  idempotencyKey: string
): Promise<SetCelebrantMarkResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = SET_MARK_INPUT_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { candidateId, mark } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_TRIP,
      userId,
      async () => {
        const { error } = await supabase
          .from("date_poll_celebrant_marks")
          .upsert(
            {
              candidate_id: candidateId,
              mark,
              marked_by: userId,
              marked_at: new Date().toISOString(),
            },
            { onConflict: "candidate_id" }
          );

        if (error) {
          console.error("[date-poll] setCelebrantMark failed:", {
            code: error.code,
            message: error.message,
          });
          return {
            ok: false as const,
            errorKey: mapDbError(error),
          };
        }

        // F2 / #110: revalidate only on a genuine success.
        revalidatePath("/trips", "layout");
        return { ok: true as const, mark };
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[date-poll] setCelebrantMark unexpected:", err);
    return { ok: false, errorKey: "network" };
  }
}

// =============================================================
// castDateVote
// =============================================================

/**
 * Member-only action: cast a yes/no vote on a candidate. RLS WITH CHECK
 * binds `trip_member_id` to the caller's own `trip_members` row on the
 * candidate's trip — vote stuffing is structurally impossible.
 *
 * The trigger `assert_candidate_not_vetoed_before_vote` raises P0001
 * if the candidate is vetoed; we collapse that to `validation_failed`
 * so the celebrant's marks aren't enumerable through error probing.
 *
 * Idempotency: the partial unique on `(candidate_id, trip_member_id,
 * idempotency_key)` makes replay a no-op. The composite PK on
 * `(candidate_id, trip_member_id)` makes vote-changes safe — same
 * member voting again upserts the row.
 */
export async function castDateVoteAction(
  input: CastDateVoteInput,
  idempotencyKey: string
): Promise<CastDateVoteResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = VOTE_INPUT_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { candidateId, vote } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.CAST_DATE_VOTE,
      userId,
      async () => {
        // Look up the caller's trip_member row for the candidate's
        // trip. RLS on date_poll_candidates returns the row if the
        // caller is a member; an empty result is rls_denied territory.
        const { data: candidate, error: candidateError } = await supabase
          .from("date_poll_candidates")
          .select("trip_id")
          .eq("id", candidateId)
          .maybeSingle();
        if (candidateError) {
          return {
            ok: false as const,
            errorKey: mapDbError(candidateError),
          };
        }
        if (!candidate) {
          return { ok: false as const, errorKey: "rls_denied" };
        }
        const { trip_id: tripId } = candidate as { trip_id: string };

        const { data: member, error: memberError } = await supabase
          .from("trip_members")
          .select("id")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .maybeSingle();
        if (memberError) {
          return {
            ok: false as const,
            errorKey: mapDbError(memberError),
          };
        }
        if (!member) {
          return { ok: false as const, errorKey: "rls_denied" };
        }
        const { id: tripMemberId } = member as { id: string };

        // Upsert on the composite PK so vote-changes are a single
        // round-trip. The idempotency partial unique fires when the
        // same key replays, which is a no-op (no error, no row
        // change). RLS WITH CHECK + trigger gate the write.
        const { error: upsertError } = await supabase
          .from("date_poll_votes")
          .upsert(
            {
              candidate_id: candidateId,
              trip_member_id: tripMemberId,
              vote,
              idempotency_key: idempotencyKey,
              voted_at: new Date().toISOString(),
            },
            { onConflict: "candidate_id,trip_member_id" }
          );

        if (upsertError) {
          console.error("[date-poll] castDateVote failed:", {
            code: upsertError.code,
            message: upsertError.message,
          });
          return {
            ok: false as const,
            errorKey: mapDbError(upsertError),
          };
        }
        return { ok: true as const, vote };
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    console.error("[date-poll] castDateVote unexpected:", err);
    return { ok: false, errorKey: "network" };
  }
}

// =============================================================
// lockInCandidate — STRETCH (deferred if time-boxed)
// =============================================================

/**
 * Organizer-only: lock in a candidate by writing its starts_on /
 * ends_on into `trips.starts_at` / `ends_at`. RLS on `trips` allows
 * organizers to update; we additionally bind the update via the
 * candidate's `trip_id`.
 *
 * Stretch action — not wired into the page in Wave 3. Documented
 * in the PR body as deferred follow-up. Implementing the action
 * surface now keeps the API contract complete; the UI consumer is
 * deferred.
 */
export async function lockInCandidateAction(
  candidateId: string
): Promise<LockInCandidateResult> {
  const parsed = UUID_SCHEMA.safeParse(candidateId);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }

  try {
    const { data: candidate, error: candidateError } = await supabase
      .from("date_poll_candidates")
      .select("trip_id, starts_on, ends_on")
      .eq("id", candidateId)
      .maybeSingle();
    if (candidateError) {
      return { ok: false, errorKey: mapDbError(candidateError) };
    }
    if (!candidate) {
      return { ok: false, errorKey: "rls_denied" };
    }
    const c = candidate as {
      trip_id: string;
      starts_on: string;
      ends_on: string;
    };

    const { data: updated, error: updateError } = await supabase
      .from("trips")
      .update({ starts_at: c.starts_on, ends_at: c.ends_on })
      .eq("id", c.trip_id)
      .select("*")
      .maybeSingle();
    if (updateError) {
      return { ok: false, errorKey: mapDbError(updateError) };
    }
    if (!updated) {
      return { ok: false, errorKey: "rls_denied" };
    }
    return { ok: true, trip: updated as Trip };
  } catch (err) {
    console.error("[date-poll] lockInCandidate unexpected:", err);
    return { ok: false, errorKey: "network" };
  }
}
