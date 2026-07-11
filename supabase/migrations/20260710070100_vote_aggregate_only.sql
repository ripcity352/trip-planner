-- =============================================================
-- 20260710070100_vote_aggregate_only.sql
-- Make poll_votes AND date_poll_votes aggregate-only at the DB (#420).
--
-- Depends on:
--   * 20260519123255_m1_foundation.sql   — is_trip_member(), can_see_content()
--   * 20260519204313_m2_date_poll.sql     — date_poll_votes + its SELECT policy
--   * 20260710060100_polls.sql            — poll_votes + its SELECT policy
--
-- GAP (notes/decisions.md "#420 — votes aggregate-only at the DB"):
-- Both vote tables enforced aggregate-only display in the app view-models,
-- but their RLS SELECT policies granted ROW-LEVEL read (including
-- trip_member_id) to every member who could see the parent poll. A member
-- using the browser Supabase client could select('*') and join
-- trip_members to reconstruct per-name votes ("Dave voted omakase") —
-- defeating the aggregate-only / voter-opt-in privacy rule the poll UIs
-- promise. The aggregate-only invariant lived only in the app layer.
--
-- FIX — close the gap at the source of truth (RLS), for BOTH tables:
--   1. Restrict per-vote SELECT to the voter's OWN row (trip_member_id =
--      one of the caller's trip_members rows). A direct select('*') now
--      returns only your own vote — no cross-member name reconstruction.
--      This also keeps 'my vote' working (it IS the own-row read).
--   2. Expose aggregate counts through a per-table set-returning function
--      that returns per-option / per-candidate counts WITHOUT
--      trip_member_id, re-checking visibility so a viewer only aggregates
--      over polls/candidates they may see.
--
-- Why SECURITY DEFINER functions and NOT a security_invoker view:
--   Requirement (1) restricts the base-table SELECT to own-row only. A
--   security_invoker view (or invoker function) re-applies that same RLS
--   to its own reads, so it would only ever see the CALLER's own vote —
--   producing a per-caller count of 1, never the real aggregate. To count
--   across all voters the aggregate path must bypass the base-table SELECT
--   RLS, which is exactly what SECURITY DEFINER does. The
--   celebrant-hidden-poll invariant is preserved explicitly INSIDE the
--   function: can_see_content(trip_id, visibility) (polls) /
--   is_trip_member(trip_id) (date poll) is re-checked against auth.uid()
--   (both are SECURITY DEFINER helpers that read the caller's identity),
--   so a hidden poll contributes ZERO rows and ZERO aggregate to the
--   celebrant, and a non-member gets nothing. The functions return only
--   ids + counts — never a trip_member_id — so there is no per-name leak
--   even though they run definer. EXECUTE is trimmed to authenticated
--   (see the revoke/grant pair per function), matching the
--   create_poll_with_options precedent.
-- =============================================================

-- =============================================================
-- 1a. poll_votes — own-row-only SELECT
-- =============================================================
-- Replace the row-level "readable with their poll" grant with an
-- own-row grant. Dropping + recreating a POLICY (not a table/column) is
-- the intended change here, not a destructive schema edit.
drop policy if exists "votes: readable with their poll" on public.poll_votes;

-- A member may read ONLY their own vote rows. trip_member_id must be one
-- of the caller's own trip_members rows; every other member's vote is
-- invisible at the DB. Aggregates come from get_poll_vote_counts() below.
create policy "votes: read own vote only"
  on public.poll_votes
  for select
  to authenticated
  using (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.user_id = auth.uid()
    )
  );

-- =============================================================
-- 1b. date_poll_votes — own-row-only SELECT
-- =============================================================
drop policy if exists "votes: members can read" on public.date_poll_votes;

create policy "votes: read own vote only"
  on public.date_poll_votes
  for select
  using (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.user_id = auth.uid()
    )
  );

-- =============================================================
-- 2a. get_poll_vote_counts — per-option aggregate for a trip
-- =============================================================
-- Returns one row per option (votes = 0 for un-voted options via the
-- LEFT JOIN) for every poll of the trip the caller can see. SECURITY
-- DEFINER to count across all voters (base-table SELECT is now own-row
-- only); can_see_content() re-gates visibility for the CALLER so
-- hide_from_celebrant polls contribute nothing to the celebrant and a
-- non-member gets no rows. No trip_member_id is returned — aggregate only.
create or replace function public.get_poll_vote_counts(p_trip_id uuid)
returns table (
  poll_id uuid,
  option_id uuid,
  votes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.poll_id,
    o.id as option_id,
    count(v.trip_member_id) as votes
  from public.poll_options o
  join public.polls p on p.id = o.poll_id
  left join public.poll_votes v
    on v.option_id = o.id and v.poll_id = o.poll_id
  where p.trip_id = p_trip_id
    and public.can_see_content(p.trip_id, p.visibility)
  group by o.poll_id, o.id;
$$;

comment on function public.get_poll_vote_counts(uuid) is
  '#420. Per-option vote counts for a trip''s visible polls. SECURITY DEFINER so counts span all voters (poll_votes SELECT is own-row only); can_see_content() re-gates celebrant-hidden polls per caller. Returns ids + counts only — never trip_member_id.';

revoke execute on function public.get_poll_vote_counts(uuid) from public, anon;
grant execute on function public.get_poll_vote_counts(uuid) to authenticated;

-- =============================================================
-- 2b. get_date_poll_vote_counts — per-candidate yes/no aggregate
-- =============================================================
-- One row per candidate (yes/no both 0 when un-voted via the LEFT JOIN)
-- for every candidate of the trip, gated to trip members. The date poll
-- has no visibility axis (candidates are member-readable; the celebrant
-- veto is a per-candidate 'no-go' mark filtered in the app view-model,
-- not an RLS gate), so membership is the correct aggregate gate here.
create or replace function public.get_date_poll_vote_counts(p_trip_id uuid)
returns table (
  candidate_id uuid,
  yes_votes bigint,
  no_votes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as candidate_id,
    count(v.trip_member_id) filter (where v.vote) as yes_votes,
    count(v.trip_member_id) filter (where not v.vote) as no_votes
  from public.date_poll_candidates c
  left join public.date_poll_votes v on v.candidate_id = c.id
  where c.trip_id = p_trip_id
    and public.is_trip_member(c.trip_id)
  group by c.id;
$$;

comment on function public.get_date_poll_vote_counts(uuid) is
  '#420. Per-candidate yes/no vote counts for a trip. SECURITY DEFINER so counts span all voters (date_poll_votes SELECT is own-row only); is_trip_member() gates non-members per caller. Returns candidate_id + counts only — never trip_member_id.';

revoke execute on function public.get_date_poll_vote_counts(uuid) from public, anon;
grant execute on function public.get_date_poll_vote_counts(uuid) to authenticated;

-- =============================================================
-- End of 20260710070100_vote_aggregate_only.sql
-- =============================================================
