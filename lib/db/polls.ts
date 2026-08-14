/**
 * Polls data layer (#390 — generic poll primitive).
 *
 * Read path for the announcements-page decision widget. Mirrors the
 * date-poll data layer:
 *
 *   - Members see polls + aggregate vote counts (never voter names —
 *     aggregate-only ADR; per-name visibility is reserved for a future
 *     voter-opt-in surface)
 *   - The viewer's own choice(s) (`my_option_ids`) ride along for the
 *     highlighted-chip initial render
 *   - Assembly is a pure function (`buildPollViews`) — unit-testable
 *     without a DB
 *
 * RLS gates every read at the database level:
 *   - `polls`        → can_see_content(trip_id, visibility)
 *   - `poll_options` → visible with their poll
 *   - `poll_votes`   → own-row only (#420): a member reads ONLY their own
 *                      vote, so per-name votes can't be reconstructed via
 *                      a direct select. Aggregate counts come from the
 *                      `get_poll_vote_counts` SECURITY DEFINER RPC, which
 *                      re-checks can_see_content so the celebrant stays
 *                      fully blind to hide_from_celebrant polls' votes.
 *
 * The app layer is a thin typed wrapper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type {
  MyPollVote,
  Poll,
  PollOption,
  PollOptionView,
  PollView,
  PollVoteCount,
} from "./types";

const POLL_COLUMNS =
  "id, trip_id, question, visibility, closes_on, created_by, idempotency_key, created_at, allow_multiple";
// #621 — suggested_by_trip_member_id rides along for write-in
// attribution (resolved to a display name in buildPollViews).
const OPTION_COLUMNS =
  "id, poll_id, label, position, suggested_by_trip_member_id";
// Own-vote read (#420): only the viewer's own poll → option pair. Never
// selects trip_member_id of other members — the own-row RLS blocks it.
const MY_VOTE_COLUMNS = "poll_id, option_id";

/**
 * Lists all polls the viewer can see for a trip, newest first (the
 * announcements-page feed order). RLS applies the visibility axis.
 */
export async function listPolls(
  supabase: SupabaseClient,
  tripId: string
): Promise<Poll[]> {
  const { data, error } = await supabase
    .from("polls")
    .select(POLL_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listPolls failed: ${error.message}`);
  }
  return (data ?? []) as Poll[];
}

/**
 * Count of OPEN polls the viewer can see (RLS applies the visibility
 * axis) — the dashboard Announcements-card discoverability line. Head
 * count only, zero row payload.
 *
 * Open mirrors `isPollClosed` (#211 date-only register): no deadline,
 * or `closes_on >= today` (a poll stays open THROUGH its close date).
 * `todayIso` is `YYYY-MM-DD`, computed once by the caller.
 */
export async function countOpenPolls(
  supabase: SupabaseClient,
  tripId: string,
  todayIso: string
): Promise<number> {
  const { count, error } = await supabase
    .from("polls")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .or(`closes_on.is.null,closes_on.gte.${todayIso}`);

  if (error) {
    throw new Error(`countOpenPolls failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Composite view-model fetch — one round-trip per resource, joined in
 * TS (same deliberate no-PostgREST-embeds shape as the date poll: each
 * call has a single responsibility, and the row counts on this surface
 * are tiny — polls × options ≤ a few dozen for a real trip).
 *
 * `viewerTripMemberId` may be undefined for a viewer without a member
 * row (shouldn't reach this surface, but defensive) — their views come
 * back with `my_option_ids: []`.
 *
 * `memberMap` (#621) resolves write-in attribution — trip_members.id ->
 * display_name, same contract as `enrichPollComments`'s memberMap.
 * Optional/defaulted to an empty map so existing callers (and the
 * client-side PulsePoll refetch, which may not have a fresh roster
 * handy) don't break; a miss just falls back to "Someone".
 */
export async function getPollsViewModel(
  supabase: SupabaseClient,
  tripId: string,
  viewerTripMemberId: string | undefined,
  memberMap: ReadonlyMap<string, string | null> = new Map()
): Promise<PollView[]> {
  const polls = await listPolls(supabase, tripId);
  if (polls.length === 0) return [];

  const pollIds = polls.map((p) => p.id);

  // Aggregate counts come from the SECURITY DEFINER RPC (#420) — it spans
  // all voters while re-checking can_see_content, so the celebrant stays
  // blind to hidden polls. The viewer's own votes come from the own-row
  // poll_votes read (all a member can now see of that table). Options
  // ride along for order + labels.
  const [optionsResult, countsResult, myVotesResult] = await Promise.all([
    supabase
      .from("poll_options")
      .select(OPTION_COLUMNS)
      .in("poll_id", pollIds)
      .order("position", { ascending: true }),
    supabase.rpc("get_poll_vote_counts", { p_trip_id: tripId }),
    viewerTripMemberId
      ? supabase
          .from("poll_votes")
          .select(MY_VOTE_COLUMNS)
          .eq("trip_member_id", viewerTripMemberId)
          .in("poll_id", pollIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (optionsResult.error) {
    throw new Error(
      `getPollsViewModel failed: ${optionsResult.error.message}`
    );
  }
  if (countsResult.error) {
    throw new Error(`getPollsViewModel failed: ${countsResult.error.message}`);
  }
  if (myVotesResult.error) {
    throw new Error(
      `getPollsViewModel failed: ${myVotesResult.error.message}`
    );
  }

  return buildPollViews(
    polls,
    (optionsResult.data ?? []) as PollOption[],
    (countsResult.data ?? []) as PollVoteCount[],
    (myVotesResult.data ?? []) as MyPollVote[],
    memberMap
  );
}

// =============================================================
// Pure helpers — testable without a DB
// =============================================================

/**
 * Assemble the view-model. Pure — does not mutate inputs. Options are
 * re-sorted by `position` defensively.
 *
 * Aggregate-only per ADR (#420): `counts` is the per-option tally from
 * the `get_poll_vote_counts` RPC (never carries a trip_member_id), and
 * `myVotes` is the viewer's OWN votes from the own-row read. The two
 * sources are kept separate at the DB so peers' votes never reach the
 * client — this function only maps them onto the view-model.
 *
 * `memberMap` (#621, defaults to empty) resolves each write-in
 * option's `suggested_by_display_name`: a NULL suggester (organizer
 * option) maps to `null` (no attribution line); a non-null suggester
 * resolves via the map, falling back to the shared "Someone" author
 * fallback on a miss (departed member) — same convention as
 * `enrichPollComments`.
 *
 * #627: `myVotes` may carry more than one row per poll_id (a
 * multi-choice poll) — every one of them is folded onto
 * `my_option_ids` / marks its option `is_my_vote`, regardless of the
 * poll's `allow_multiple` flag (a single-choice poll's own data never
 * has more than one row per poll, by construction of `cast_poll_vote`).
 */
export function buildPollViews(
  polls: ReadonlyArray<Poll>,
  options: ReadonlyArray<PollOption>,
  counts: ReadonlyArray<PollVoteCount>,
  myVotes: ReadonlyArray<MyPollVote>,
  memberMap: ReadonlyMap<string, string | null> = new Map()
): PollView[] {
  const countsByOption = new Map<string, number>();
  for (const c of counts) {
    countsByOption.set(c.option_id, c.votes);
  }
  const myOptionsByPoll = new Map<string, string[]>();
  for (const v of myVotes) {
    const existing = myOptionsByPoll.get(v.poll_id) ?? [];
    myOptionsByPoll.set(v.poll_id, [...existing, v.option_id]);
  }

  return polls.map((poll) => {
    const pollOptions = options
      .filter((o) => o.poll_id === poll.id)
      // Sort a copy — filter already returns a fresh array, but keep
      // the comparator explicit (immutability rule).
      .sort((a, b) => a.position - b.position);
    const myOptionIds = myOptionsByPoll.get(poll.id) ?? [];
    const myOptionIdSet = new Set(myOptionIds);

    const optionViews: PollOptionView[] = pollOptions.map((option) => ({
      option,
      votes: countsByOption.get(option.id) ?? 0,
      is_my_vote: myOptionIdSet.has(option.id),
      suggested_by_display_name: option.suggested_by_trip_member_id
        ? (memberMap.get(option.suggested_by_trip_member_id) ??
          M3_UI_STRINGS.announcements_author_fallback)
        : null,
    }));

    return {
      poll,
      options: optionViews,
      // #627: a raw vote-row count, not a distinct-voter count — on a
      // multi-choice poll one member picking 2 options contributes 2
      // here. Deliberate: "{count} votes in" is a literal count of
      // ballots cast, not a headcount; a distinct-voter figure would
      // need its own query and isn't asked for by the copy today.
      total_votes: optionViews.reduce((sum, o) => sum + o.votes, 0),
      my_option_ids: myOptionIds,
    } satisfies PollView;
  });
}

/**
 * Date-only deadline semantics (#211 register — no TZ games): a poll
 * stays open THROUGH `closes_on` (inclusive) and is closed once
 * `today > closes_on`. Both arguments are ISO `YYYY-MM-DD` strings, so
 * lexicographic comparison is correct.
 */
export function isPollClosed(
  closesOn: string | null,
  todayIso: string
): boolean {
  if (closesOn === null) return false;
  return todayIso > closesOn;
}

/**
 * The option(s) with the most votes — one element for a clean winner,
 * several for a tie, empty when nobody voted (the closed-state UI says
 * so plainly instead of crowning a zero-vote "winner").
 */
export function leadingOptions(view: PollView): PollOptionView[] {
  const max = Math.max(0, ...view.options.map((o) => o.votes));
  if (max === 0) return [];
  return view.options.filter((o) => o.votes === max);
}
