/**
 * Date-poll data layer (M2 Wave 3).
 *
 * Read path for the celebrant-weighted date poll. Mirrors the
 * architect-signed Appendix A contract:
 *
 *   - Members see candidates + aggregate vote counts (never voter names)
 *   - Celebrants additionally see all candidates regardless of mark
 *   - The ranking algorithm lives in `rankCandidates` (pure function,
 *     unit-testable without a DB) — SQL ordering is intentionally not
 *     used so the comparator can be pinned in tests
 *
 * RLS gates every read at the database level:
 *   - `date_poll_candidates`  → members of the candidate's trip
 *   - `date_poll_celebrant_marks` → same
 *   - `date_poll_votes`       → own-row only (#420): a member reads ONLY
 *     their own vote, so per-name votes can't be reconstructed via a
 *     direct select. Aggregate counts come from the
 *     `get_date_poll_vote_counts` SECURITY DEFINER RPC (members-gated,
 *     candidate_id + counts only — no trip_member_id).
 *
 * The app layer is a thin typed wrapper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DatePollCandidate,
  DatePollCandidateView,
  DatePollCelebrantMark,
  DatePollCelebrantMarkRow,
} from "./types";

const CANDIDATE_COLUMNS =
  "id, trip_id, label, starts_on, ends_on, created_by, created_at";
const MARK_COLUMNS = "candidate_id, mark, marked_by, marked_at";

/**
 * Aggregate counts (yes / no) per candidate. Keys are candidate ids.
 * Aggregate-only by ADR — voter names are not surfaced here.
 */
export type VoteCountsByCandidate = Map<
  string,
  { yes: number; no: number }
>;

/**
 * Lists all candidates for a trip, ordered by `created_at` ascending —
 * proposers who move first show first. RLS gates to trip members.
 */
export async function listCandidates(
  supabase: SupabaseClient,
  tripId: string
): Promise<DatePollCandidate[]> {
  const { data, error } = await supabase
    .from("date_poll_candidates")
    .select(CANDIDATE_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`listCandidates failed: ${error.message}`);
  }
  return (data ?? []) as DatePollCandidate[];
}

/**
 * Reads the celebrant marks for every candidate of the given trip.
 * The marks table doesn't carry `trip_id` directly (its PK is
 * `candidate_id` for a strict one-to-one with candidates), so we
 * scope by an inner-join via `candidate_id in (...)` rather than a
 * direct eq.
 */
export async function getCelebrantMarks(
  supabase: SupabaseClient,
  tripId: string
): Promise<DatePollCelebrantMarkRow[]> {
  // First pull the candidate ids for the trip — RLS already gates this
  // to members. A second small read keeps the API surface SupabaseClient
  // (no PostgREST embeds needed).
  const { data: candidates, error: candidatesError } = await supabase
    .from("date_poll_candidates")
    .select("id")
    .eq("trip_id", tripId);

  if (candidatesError) {
    throw new Error(`getCelebrantMarks failed: ${candidatesError.message}`);
  }
  const candidateIds = (candidates ?? []).map(
    (c) => (c as { id: string }).id
  );
  if (candidateIds.length === 0) return [];

  const { data, error } = await supabase
    .from("date_poll_celebrant_marks")
    .select(MARK_COLUMNS)
    .in("candidate_id", candidateIds);

  if (error) {
    throw new Error(`getCelebrantMarks failed: ${error.message}`);
  }
  return (data ?? []) as DatePollCelebrantMarkRow[];
}

/**
 * Aggregate yes / no counts per candidate for the trip.
 *
 * Aggregate-only at the DB (#420): the raw `date_poll_votes` SELECT is
 * now own-row only (a member can't read peers' votes), so counting is
 * delegated to the `get_date_poll_vote_counts` SECURITY DEFINER RPC. It
 * spans all voters but returns candidate_id + counts only (never a
 * trip_member_id) and is gated to trip members, so per-name votes can't
 * be reconstructed from this surface.
 */
export async function getVoteCountsByCandidate(
  supabase: SupabaseClient,
  tripId: string
): Promise<VoteCountsByCandidate> {
  const { data, error } = await supabase.rpc("get_date_poll_vote_counts", {
    p_trip_id: tripId,
  });

  if (error) {
    throw new Error(`getVoteCountsByCandidate failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    candidate_id: string;
    yes_votes: number;
    no_votes: number;
  }>;
  const counts: VoteCountsByCandidate = new Map();
  for (const row of rows) {
    // Postgres returns count() as bigint; PostgREST may hand it back as a
    // string, so coerce defensively.
    counts.set(row.candidate_id, {
      yes: Number(row.yes_votes),
      no: Number(row.no_votes),
    });
  }
  return counts;
}

/**
 * Returns the caller's own vote for the given candidate, or `null` if
 * they haven't voted yet. Required for the optimistic-UI initial render.
 */
export async function getMyVote(
  supabase: SupabaseClient,
  candidateId: string,
  tripMemberId: string
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("date_poll_votes")
    .select("vote")
    .eq("candidate_id", candidateId)
    .eq("trip_member_id", tripMemberId)
    .maybeSingle();

  if (error) {
    throw new Error(`getMyVote failed: ${error.message}`);
  }
  if (!data) return null;
  return (data as { vote: boolean }).vote;
}

/**
 * Composite view-model fetch — one round-trip per resource, joined
 * in TS. We deliberately do not lean on PostgREST embeds; the explicit
 * three-call shape is easier to test (each call has a single
 * responsibility) and the network cost is negligible for the small
 * row counts this surface touches.
 *
 * The viewer's `tripMemberId` may be undefined for the pre-membership
 * preview case (logged-in user who isn't a member yet — shouldn't
 * reach this surface, but defensive).
 */
export async function getDatePollViewModel(
  supabase: SupabaseClient,
  tripId: string,
  viewerTripMemberId: string | undefined
): Promise<DatePollCandidateView[]> {
  const [candidates, marks, counts] = await Promise.all([
    listCandidates(supabase, tripId),
    getCelebrantMarks(supabase, tripId),
    getVoteCountsByCandidate(supabase, tripId),
  ]);

  const marksByCandidate = new Map<string, DatePollCelebrantMark>(
    marks.map((m) => [m.candidate_id, m.mark])
  );

  // The caller's own votes — one read across all candidates is cheaper
  // than N individual reads. RLS will return only votes the caller is
  // entitled to see.
  let myVoteByCandidate = new Map<string, boolean>();
  if (viewerTripMemberId && candidates.length > 0) {
    const { data: myVotes, error: myVotesError } = await supabase
      .from("date_poll_votes")
      .select("candidate_id, vote")
      .eq("trip_member_id", viewerTripMemberId)
      .in(
        "candidate_id",
        candidates.map((c) => c.id)
      );
    if (myVotesError) {
      throw new Error(
        `getDatePollViewModel failed: ${myVotesError.message}`
      );
    }
    myVoteByCandidate = new Map(
      ((myVotes ?? []) as Array<{ candidate_id: string; vote: boolean }>).map(
        (r) => [r.candidate_id, r.vote]
      )
    );
  }

  return candidates.map((candidate) => {
    const bucket = counts.get(candidate.id) ?? { yes: 0, no: 0 };
    const myVote = myVoteByCandidate.has(candidate.id)
      ? (myVoteByCandidate.get(candidate.id) as boolean)
      : null;
    return {
      candidate,
      mark: marksByCandidate.get(candidate.id) ?? null,
      yes_votes: bucket.yes,
      no_votes: bucket.no,
      my_vote: myVote,
    } satisfies DatePollCandidateView;
  });
}

// =============================================================
// Pure-function ranking — testable without a DB
// =============================================================

/**
 * Priority ordering for the celebrant mark. Higher = more important.
 *
 *   works              → 3  (green-light)
 *   works-with-effort  → 2  (allowed; visually flagged)
 *   null (unmarked)    → 1  (allowed; "celebrant hasn't weighed in")
 *   no-go              → 0  (vetoed; filtered before this layer)
 */
const MARK_PRIORITY: Record<
  Exclude<DatePollCelebrantMark, never> | "null",
  number
> = {
  works: 3,
  "works-with-effort": 2,
  null: 1,
  "no-go": 0,
};

function priorityOf(mark: DatePollCelebrantMark | null): number {
  if (mark === null) return MARK_PRIORITY.null;
  return MARK_PRIORITY[mark];
}

/**
 * Rank the view-model rows according to the architect-signed
 * algorithm (Appendix A.2). Pure function — does not mutate input;
 * stable on ties via `candidate.created_at` ascending.
 *
 * Caller is responsible for filtering `no-go` candidates out of a
 * member-view rendering (we keep them ranked-last here so a
 * celebrant view can still display them in the same order).
 */
export function rankCandidates(
  rows: ReadonlyArray<DatePollCandidateView>
): DatePollCandidateView[] {
  // Sort a copy — never mutate input (immutability rule).
  return [...rows].sort((a, b) => {
    const dp = priorityOf(b.mark) - priorityOf(a.mark);
    if (dp !== 0) return dp;
    const dv = b.yes_votes - a.yes_votes;
    if (dv !== 0) return dv;
    return a.candidate.created_at.localeCompare(b.candidate.created_at);
  });
}

/**
 * Filter to candidates a non-celebrant member should see. The
 * member view hides vetoed candidates outright so the celebrant's
 * hard pass isn't visible to peers.
 */
export function filterMemberVisible(
  rows: ReadonlyArray<DatePollCandidateView>
): DatePollCandidateView[] {
  return rows.filter((row) => row.mark !== "no-go");
}
