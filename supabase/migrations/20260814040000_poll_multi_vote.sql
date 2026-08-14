-- =============================================================
-- 20260814040000_poll_multi_vote.sql
-- Poll multi-select voting (#627) — organizer opt-in per poll.
--
-- Depends on: 20260710060100_polls.sql (base polls/poll_options/
-- poll_votes schema), 20260710070100_vote_aggregate_only.sql
-- (own-row-only poll_votes SELECT + get_poll_vote_counts).
--
-- GAP (issue #627): the base poll primitive scope-fenced itself to
-- "ONE decision widget" and never named a vote-cardinality axis.
-- poll_votes' PK (poll_id, trip_member_id) makes multi-select
-- structurally impossible — a member can only ever have ONE row per
-- poll. This migration adds the missing axis (rule 8 — per-item
-- granular, not a uniform default): `polls.allow_multiple`, default
-- false, so every EXISTING poll keeps today's single-choice behavior
-- unchanged.
--
-- Adds:
--   1. polls.allow_multiple boolean not null default false
--   2. poll_votes PK widened: (poll_id, trip_member_id) ->
--      (poll_id, trip_member_id, option_id) — one row per (poll,
--      member, chosen option) instead of one row per (poll, member).
--      A single-choice poll still nets exactly one row per member
--      (enforced by cast_poll_vote below, not by the schema — the
--      schema alone can't distinguish "one poll, many options" from
--      "many polls, one option each").
--   3. create_poll_with_options gains p_allow_multiple (default
--      false — every existing call site keeps working unmodified).
--   4. cast_poll_vote() — SECURITY INVOKER RPC replacing the raw
--      upsert-on-PK the app layer used to do directly:
--        - single-choice: DELETE the caller's other rows for this
--          poll, then INSERT the new one (PK conflict = idempotent
--          re-tap on the same option, ON CONFLICT DO NOTHING)
--        - multi-choice: INSERT ... ON CONFLICT DO NOTHING (adds a
--          vote; a re-tap on an already-chosen option is a no-op —
--          UN-selecting is the app's separate retract path)
--   5. Drop "votes: members update own vote" — with option_id now
--      part of the PK, a "revote" is a DELETE+INSERT (different PK),
--      never an UPDATE of an existing row. The DELETE ("retract own
--      vote") and INSERT ("vote as themselves") policies already
--      cover cast_poll_vote's two statements; no replacement policy
--      needed.
-- =============================================================

-- =============================================================
-- 1. polls.allow_multiple
-- =============================================================
alter table public.polls
  add column allow_multiple boolean not null default false;

comment on column public.polls.allow_multiple is
  '#627. false (default) = single-choice, tap-to-replace (all polls before this migration). true = members may select any number of options; each is an independent add/remove.';

-- =============================================================
-- 2. Widen poll_votes PK
-- =============================================================
alter table public.poll_votes
  drop constraint poll_votes_pkey;

alter table public.poll_votes
  add primary key (poll_id, trip_member_id, option_id);

-- The old (poll_id, trip_member_id, idempotency_key) partial unique is
-- now redundant: the PK itself already dedupes (poll, member, option),
-- and cast_poll_vote's ON CONFLICT DO NOTHING on that PK is what makes
-- a double-tap idempotent — not idempotency_key. Drop it; the column
-- stays (rule 9 surface consistency + audit trail on voted_at replay).
drop index if exists public.poll_votes_idempotency_key;

comment on table public.poll_votes is
  '#390/#627. One row per (poll, member, option). Single-choice polls (allow_multiple=false) net exactly one row per member, enforced by cast_poll_vote (delete-others-then-insert), not the schema. Multi-choice polls (allow_multiple=true) allow many rows per member. Pair FK (option_id, poll_id) pins the option to the poll. Aggregate-only in UI per ADR.';

-- =============================================================
-- 3. RLS — drop the now-impossible UPDATE path
-- =============================================================
-- With option_id in the PK, changing a vote is DELETE-then-INSERT
-- (the PK itself changes), never an UPDATE of an existing row.
-- cast_poll_vote's two statements are already covered by "votes:
-- retract own vote" (delete) and "votes: members vote as themselves
-- (insert)" — both unchanged by this migration.
drop policy if exists "votes: members update own vote" on public.poll_votes;

-- =============================================================
-- 4. create_poll_with_options — add p_allow_multiple
-- =============================================================
-- Overloading via a new parameter with a default keeps every existing
-- call site (client + tests) working: p_allow_multiple defaults to
-- false, i.e. today's behavior. CREATE OR REPLACE on the same 6-arg
-- signature would break default-positional callers, so the new
-- 7th param is appended.
create or replace function public.create_poll_with_options(
  p_trip_id uuid,
  p_question text,
  p_visibility trip_visibility,
  p_closes_on date,
  p_idempotency_key uuid,
  p_options jsonb,
  p_allow_multiple boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_poll_id uuid := gen_random_uuid();
  v_member_id uuid;
  v_count integer;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22004';
  end if;

  v_count := case
    when p_options is null or jsonb_typeof(p_options) <> 'array' then 0
    else jsonb_array_length(p_options)
  end;
  -- The 2–4 invariant (see poll_options table comment).
  if v_count < 2 or v_count > 4 then
    raise exception 'a poll needs 2 to 4 options' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_options) as t(label)
    where length(trim(t.label)) = 0 or length(trim(t.label)) > 80
  ) then
    raise exception 'option labels must be 1-80 characters' using errcode = '22023';
  end if;

  -- Resolve the caller's own trip_members row for created_by. The
  -- polls INSERT policy re-verifies this binding (H1 pattern).
  select tm.id into v_member_id
  from public.trip_members tm
  where tm.trip_id = p_trip_id
    and tm.user_id = auth.uid();
  if v_member_id is null then
    raise exception 'not a member of this trip'
      using errcode = '42501';
  end if;

  begin
    insert into public.polls (
      id, trip_id, question, visibility, closes_on, created_by,
      idempotency_key, allow_multiple
    )
    values (
      v_poll_id,
      p_trip_id,
      p_question,
      coalesce(p_visibility, 'everyone'),
      p_closes_on,
      v_member_id,
      p_idempotency_key,
      coalesce(p_allow_multiple, false)
    );
  exception
    when unique_violation then
      -- Idempotency replay on polls_idempotency_key(trip_id, key): the
      -- first submit committed the poll AND its options atomically, so
      -- return the ORIGINAL id. The re-select runs under SELECT RLS;
      -- null here means an unrelated conflict — re-raise.
      select id into v_poll_id
      from public.polls
      where trip_id = p_trip_id
        and idempotency_key = p_idempotency_key;
      if v_poll_id is null then
        raise;
      end if;
      return v_poll_id;
  end;

  -- Same transaction as the poll row. The options INSERT policy's
  -- EXISTS reads polls under the caller's SELECT RLS, so an
  -- author-invisible visibility pick aborts everything 42501 here
  -- (#384 lesson) — an error, never a silent optionless orphan.
  insert into public.poll_options (poll_id, label, position)
  select
    v_poll_id,
    trim(o.label),
    (o.ord - 1)::smallint
  from jsonb_array_elements_text(p_options) with ordinality as o(label, ord);

  return v_poll_id;
end;
$$;

comment on function public.create_poll_with_options(uuid, text, trip_visibility, date, uuid, jsonb, boolean) is
  '#390/#627. Atomic poll + 2-4 options create. SECURITY INVOKER — RLS is the source of truth. p_allow_multiple defaults false (single-choice, matching every pre-#627 call site). No INSERT..RETURNING; returns the new (or, on idempotency replay, the ORIGINAL) poll id.';

revoke execute on function public.create_poll_with_options(uuid, text, trip_visibility, date, uuid, jsonb, boolean) from public, anon;
grant execute on function public.create_poll_with_options(uuid, text, trip_visibility, date, uuid, jsonb, boolean) to authenticated;

-- Drop the pre-#627 6-arg overload — the app layer always calls with
-- 7 args now; leaving the old signature around would be dead surface
-- with its own independent grants to audit.
drop function if exists public.create_poll_with_options(uuid, text, trip_visibility, date, uuid, jsonb);

-- =============================================================
-- 5. cast_poll_vote — single RPC for both cardinalities
-- =============================================================
-- SECURITY INVOKER — every statement inside still runs under the
-- caller's own RLS (H1 own-seat bind + can_see_content + deadline, on
-- both the DELETE and the INSERT). The RPC's only job is choosing
-- delete-others-then-insert (single-choice) vs plain insert
-- (multi-choice) atomically, in one round trip — the app layer used
-- to do a bare upsert; that upsert target no longer exists now that
-- option_id is part of the PK.
create or replace function public.cast_poll_vote(
  p_poll_id uuid,
  p_option_id uuid,
  p_idempotency_key uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_member_id uuid;
  v_allow_multiple boolean;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22004';
  end if;

  select tm.id, p.allow_multiple into v_member_id, v_allow_multiple
  from public.trip_members tm
  join public.polls p on p.trip_id = tm.trip_id
  where p.id = p_poll_id
    and tm.user_id = auth.uid();
  if v_member_id is null then
    raise exception 'not a member of this trip'
      using errcode = '42501';
  end if;

  if not v_allow_multiple then
    -- Replace: drop any OTHER option this member picked on this poll.
    -- Gated by "votes: retract own vote" — a closed/invisible poll
    -- fails this the same way it fails everything else here.
    delete from public.poll_votes
    where poll_id = p_poll_id
      and trip_member_id = v_member_id
      and option_id <> p_option_id;
  end if;

  -- Add this option. Gated by "votes: members vote as themselves
  -- (insert)". ON CONFLICT DO NOTHING on the (poll_id, trip_member_id,
  -- option_id) PK: a re-tap on an already-selected option (single- or
  -- multi-choice) is a no-op, not an error — the natural idempotency
  -- boundary now that option_id is part of the PK.
  insert into public.poll_votes (poll_id, option_id, trip_member_id, idempotency_key)
  values (p_poll_id, p_option_id, v_member_id, p_idempotency_key)
  on conflict (poll_id, trip_member_id, option_id) do nothing;
end;
$$;

comment on function public.cast_poll_vote(uuid, uuid, uuid) is
  '#627. Cast (or add) a vote. SECURITY INVOKER — RLS on poll_votes is the source of truth for both the DELETE and INSERT statements. Single-choice polls (allow_multiple=false) replace: delete the caller''s other rows on this poll, then insert. Multi-choice polls only insert (ON CONFLICT DO NOTHING) — unselecting is the separate retract_poll_vote path.';

revoke execute on function public.cast_poll_vote(uuid, uuid, uuid) from public, anon;
grant execute on function public.cast_poll_vote(uuid, uuid, uuid) to authenticated;

-- =============================================================
-- 6. retract_poll_vote — explicit un-select (multi-choice UI)
-- =============================================================
-- A thin SECURITY INVOKER wrapper so the app layer has one RPC-shaped
-- surface for both directions (rather than a raw .delete() call) — the
-- DELETE itself is already fully gated by "votes: retract own vote";
-- this function exists for symmetry with cast_poll_vote and a single
-- error-mapping convention (mapDbError by error.code) at the action
-- layer. Idempotent by construction: deleting an already-gone row
-- affects 0 rows, no error.
create or replace function public.retract_poll_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.poll_votes
  where poll_id = p_poll_id
    and option_id = p_option_id
    and trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.user_id = auth.uid()
    );
$$;

comment on function public.retract_poll_vote(uuid, uuid) is
  '#627. Un-select one option (multi-choice polls). SECURITY INVOKER — gated entirely by "votes: retract own vote" RLS. Deleting an already-retracted vote is a no-op, not an error.';

revoke execute on function public.retract_poll_vote(uuid, uuid) from public, anon;
grant execute on function public.retract_poll_vote(uuid, uuid) to authenticated;

-- =============================================================
-- End of 20260814040000_poll_multi_vote.sql
-- =============================================================
