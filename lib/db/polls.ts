/**
 * Polls data layer (#390 — generic poll primitive).
 *
 * Read path for the announcements-page decision widget. Mirrors the
 * date-poll data layer:
 *
 *   - Members see polls + aggregate vote counts (never voter names —
 *     aggregate-only ADR; per-name visibility is reserved for a future
 *     voter-opt-in surface)
 *   - The viewer's own choice (`my_option_id`) rides along for the
 *     highlighted-chip initial render
 *   - Assembly is a pure function (`buildPollViews`) — unit-testable
 *     without a DB
 *
 * RLS gates every read at the database level:
 *   - `polls`        → can_see_content(trip_id, visibility)
 *   - `poll_options` → visible with their poll
 *   - `poll_votes`   → readable with their poll (celebrant fully blind
 *                      to hide_from_celebrant polls' votes)
 *
 * The app layer is a thin typed wrapper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Poll, PollOption, PollOptionView, PollView, PollVote } from "./types";

const POLL_COLUMNS =
  "id, trip_id, question, visibility, closes_on, created_by, idempotency_key, created_at";
const OPTION_COLUMNS = "id, poll_id, label, position";
const VOTE_COLUMNS =
  "poll_id, option_id, trip_member_id, voted_at, idempotency_key";

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
 * Composite view-model fetch — one round-trip per resource, joined in
 * TS (same deliberate no-PostgREST-embeds shape as the date poll: each
 * call has a single responsibility, and the row counts on this surface
 * are tiny — polls × options ≤ a few dozen for a real trip).
 *
 * `viewerTripMemberId` may be undefined for a viewer without a member
 * row (shouldn't reach this surface, but defensive) — their views come
 * back with `my_option_id: null`.
 */
export async function getPollsViewModel(
  supabase: SupabaseClient,
  tripId: string,
  viewerTripMemberId: string | undefined
): Promise<PollView[]> {
  const polls = await listPolls(supabase, tripId);
  if (polls.length === 0) return [];

  const pollIds = polls.map((p) => p.id);

  const [optionsResult, votesResult] = await Promise.all([
    supabase
      .from("poll_options")
      .select(OPTION_COLUMNS)
      .in("poll_id", pollIds)
      .order("position", { ascending: true }),
    supabase.from("poll_votes").select(VOTE_COLUMNS).in("poll_id", pollIds),
  ]);

  if (optionsResult.error) {
    throw new Error(
      `getPollsViewModel failed: ${optionsResult.error.message}`
    );
  }
  if (votesResult.error) {
    throw new Error(`getPollsViewModel failed: ${votesResult.error.message}`);
  }

  return buildPollViews(
    polls,
    (optionsResult.data ?? []) as PollOption[],
    (votesResult.data ?? []) as PollVote[],
    viewerTripMemberId
  );
}

// =============================================================
// Pure helpers — testable without a DB
// =============================================================

/**
 * Assemble the view-model. Pure — does not mutate inputs. Options are
 * re-sorted by `position` defensively; votes aggregate to counts only
 * (aggregate-only ADR), plus the viewer's own choice.
 */
export function buildPollViews(
  polls: ReadonlyArray<Poll>,
  options: ReadonlyArray<PollOption>,
  votes: ReadonlyArray<PollVote>,
  viewerTripMemberId: string | undefined
): PollView[] {
  const countsByOption = new Map<string, number>();
  const myOptionByPoll = new Map<string, string>();
  for (const v of votes) {
    countsByOption.set(v.option_id, (countsByOption.get(v.option_id) ?? 0) + 1);
    if (viewerTripMemberId && v.trip_member_id === viewerTripMemberId) {
      myOptionByPoll.set(v.poll_id, v.option_id);
    }
  }

  return polls.map((poll) => {
    const pollOptions = options
      .filter((o) => o.poll_id === poll.id)
      // Sort a copy — filter already returns a fresh array, but keep
      // the comparator explicit (immutability rule).
      .sort((a, b) => a.position - b.position);
    const myOptionId = myOptionByPoll.get(poll.id) ?? null;

    const optionViews: PollOptionView[] = pollOptions.map((option) => ({
      option,
      votes: countsByOption.get(option.id) ?? 0,
      is_my_vote: option.id === myOptionId,
    }));

    return {
      poll,
      options: optionViews,
      total_votes: optionViews.reduce((sum, o) => sum + o.votes, 0),
      my_option_id: myOptionId,
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
