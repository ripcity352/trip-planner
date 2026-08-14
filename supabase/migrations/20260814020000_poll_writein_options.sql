-- =============================================================
-- 20260814020000_poll_writein_options.sql
-- Poll write-in options (#621, part 2/3 of #616) — Model A: extend
-- poll_options, uniform ballot. A member can add their OWN option to
-- an open, visible poll; everyone then votes on all options
-- identically (existing vote path unchanged).
--
-- Depends on: 20260710060100_polls.sql (base polls/poll_options/
-- poll_votes schema — NEVER edited here).
--
-- Collides with three DELIBERATE invariants in the base schema —
-- respected exactly, not loosened wholesale:
--   1. the 2-4 option ceiling (position CHECK 0-3) — lifted to 0-9
--      (max 10 options) as an anti-spam cap, not removed. The 2-4
--      MINIMUM for the organizer-composed ballot is unchanged
--      (enforced in create_poll_with_options, untouched here).
--   2. option immutability ("editing choices mid-vote silently
--      reframes cast votes") — NO member UPDATE/DELETE policy is
--      added. A write-in is immutable once added.
--   3. organizer-only INSERT on poll_options — kept AS-IS. This
--      migration is purely ADDITIVE: a second, narrower member INSERT
--      policy that can only ever attribute a row to the caller's own
--      seat, never a NULL (organizer-looking) row.
--
-- Adds:
--   1. poll_options.suggested_by_trip_member_id (NULL = organizer
--      option; SET = member write-in, attribution per rule #8)
--   2. position ceiling lifted 0-3 -> 0-9
--   3. add_poll_option() — SECURITY INVOKER member write-in RPC,
--      mirrors create_poll_with_options (id/position generated
--      inside, idempotency replay returns the ORIGINAL option id)
--   4. "options: members can suggest" — ADDITIVE member INSERT RLS
--      (H1 own-seat bind on suggested_by_trip_member_id)
-- =============================================================

-- =============================================================
-- 1. Extend poll_options
-- =============================================================
alter table public.poll_options
  add column suggested_by_trip_member_id uuid
    references public.trip_members(id) on delete set null;

comment on column public.poll_options.suggested_by_trip_member_id is
  '#621. NULL = original organizer option (create_poll_with_options). SET = member write-in, attributed to the suggesting trip_members row (rule #8). ON DELETE SET NULL — a departed suggester''s option survives, just loses its attribution line (never renders as an organizer option; the UI keys attribution off this column being non-null pre-departure, but a post-departure NULL simply drops the "suggested by" line rather than relabeling the option as organizer-composed).';

-- =============================================================
-- 2. Lift the position ceiling: 0-3 -> 0-9 (max 10 options/poll).
-- An anti-spam cap, not unbounded. The 2-4 MINIMUM for the
-- organizer-composed ballot is unchanged (create_poll_with_options,
-- untouched); write-ins are ADDITIVE beyond it. The composite uniques
-- (poll_id, position) and (id, poll_id) are untouched — the votes
-- pair-FK depends on the latter.
-- =============================================================
alter table public.poll_options
  drop constraint poll_options_position_check;

alter table public.poll_options
  add constraint poll_options_position_range check (position >= 0 and position <= 9);

-- =============================================================
-- 3. Idempotency: a drunk double-tap on the same write-in label
-- replays instead of double-inserting. Dedupe key: (poll_id,
-- suggester, label) — a member re-suggesting the identical label is
-- the replay case; a different label is a genuinely new suggestion.
-- Partial (suggested_by_trip_member_id is not null) so it never
-- collides with organizer-composed options (which may legitimately
-- repeat a label across polls or, in principle, within one — the
-- organizer path has no such uniqueness constraint today and this
-- migration doesn't add one).
-- =============================================================
create unique index poll_options_writein_idem
  on public.poll_options (poll_id, suggested_by_trip_member_id, label)
  where suggested_by_trip_member_id is not null;

-- =============================================================
-- 4. RLS — ADDITIVE member INSERT policy on poll_options.
-- Do NOT modify "options: organizers can insert" (kept as-is).
--
-- H1 own-seat bind: suggested_by_trip_member_id must resolve to a
-- trip_members row that is (a) the CALLER's own row (tm.user_id =
-- auth.uid()), (b) a member of the poll's trip, on (c) a poll the
-- caller can see (can_see_content), that is (d) still OPEN
-- (closes_on null or >= current_date) — mirrors the votes H1 policy
-- exactly.
--
-- Because the subquery only ever matches rows where
-- suggested_by_trip_member_id IS NOT NULL (an `in (select ...)`
-- against a NOT NULL column can never match a NULL column value —
-- `NULL IN (...)` evaluates to NULL, never TRUE), a member calling
-- with a NULL suggested_by_trip_member_id can NEVER satisfy this
-- policy. The member INSERT path can therefore never produce a
-- NULL-attributed (organizer-looking) row; that shape is only
-- reachable through "options: organizers can insert". Verified in
-- supabase/tests/poll_writein_options_rls.test.sql.
-- =============================================================
create policy "options: members can suggest"
  on public.poll_options
  for insert
  to authenticated
  with check (
    suggested_by_trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.polls p on p.trip_id = tm.trip_id
      where p.id = poll_options.poll_id
        and tm.user_id = auth.uid()
        and public.can_see_content(p.trip_id, p.visibility)
        and (p.closes_on is null or p.closes_on >= current_date)
    )
  );

-- NOTE (unchanged from the base migration): still no UPDATE/DELETE
-- policy on poll_options for anyone but the RLS-exempt SECURITY
-- DEFINER paths (none exist). Options — organizer-composed AND
-- write-in — are immutable once added.

-- =============================================================
-- 5. add_poll_option — member write-in RPC (SECURITY INVOKER)
-- =============================================================
-- Mirrors create_poll_with_options: SECURITY INVOKER so RLS (the
-- policy above) is the source of truth; id generated HERE (no
-- INSERT..RETURNING — Postgres applies the SELECT policy to
-- RETURNING); idempotency replay returns the ORIGINAL option id.
--
-- Position is computed atomically inside the same statement's
-- transaction via `select ... for update` isn't needed here: two
-- concurrent write-ins racing for the same next position would hit
-- the (poll_id, position) unique constraint and one loses with
-- 23505 (a genuine, if rare, race — the client's rate limiting and
-- the low realistic concurrency of "two people typing a write-in for
-- the same poll in the same instant" make this an acceptable
-- residual, consistent with the rest of the codebase's optimistic
-- posture on position assignment).
create or replace function public.add_poll_option(
  p_poll_id uuid,
  p_label text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_option_id uuid := gen_random_uuid();
  v_member_id uuid;
  v_next_position integer;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22004';
  end if;

  if p_label is null or length(trim(p_label)) < 1 or length(trim(p_label)) > 80 then
    raise exception 'option labels must be 1-80 characters' using errcode = '22023';
  end if;

  -- Resolve the caller's OWN trip_members row for this poll's trip.
  -- Never trust a caller-supplied member id (H1). The INSERT policy
  -- re-verifies this same binding.
  select tm.id into v_member_id
  from public.trip_members tm
  join public.polls p on p.trip_id = tm.trip_id
  where p.id = p_poll_id
    and tm.user_id = auth.uid();
  if v_member_id is null then
    raise exception 'not a member of this trip'
      using errcode = '42501';
  end if;

  -- Idempotency replay check FIRST: a same-label resubmit from the
  -- same suggester returns the existing option id without touching
  -- position math. Runs under the caller's own SELECT RLS ("options:
  -- visible with their poll"), which is fine — a poll they can insert
  -- into is one they can already see.
  select id into v_option_id
  from public.poll_options
  where poll_id = p_poll_id
    and suggested_by_trip_member_id = v_member_id
    and label = trim(p_label);
  if v_option_id is not null then
    return v_option_id;
  end if;
  -- Not a replay: v_option_id currently holds the pre-generated id
  -- from the `declare` above (still fresh, never persisted) —
  -- re-generate for clarity/defense-in-depth against any future
  -- refactor that moves the replay check earlier.
  v_option_id := gen_random_uuid();

  select coalesce(max(position) + 1, 0) into v_next_position
  from public.poll_options
  where poll_id = p_poll_id;

  if v_next_position > 9 then
    raise exception 'this poll is full' using errcode = '22023';
  end if;

  begin
    -- Gated by "options: members can suggest" — RLS is the source of
    -- truth. A poll the caller can't see, is closed, or a spoofed
    -- suggested_by all fail here with 42501, never silently.
    insert into public.poll_options (
      id, poll_id, label, position, suggested_by_trip_member_id
    )
    values (
      v_option_id,
      p_poll_id,
      trim(p_label),
      v_next_position,
      v_member_id
    );
  exception
    when unique_violation then
      -- Either the idem-dedupe index (a concurrent replay of the same
      -- label landed between our SELECT above and this INSERT) or the
      -- (poll_id, position) race described above. Re-select by the
      -- dedupe key; if that misses, this was a position race — surface
      -- the original error rather than guessing.
      select id into v_option_id
      from public.poll_options
      where poll_id = p_poll_id
        and suggested_by_trip_member_id = v_member_id
        and label = trim(p_label);
      if v_option_id is null then
        raise;
      end if;
      return v_option_id;
  end;

  return v_option_id;
end;
$$;

comment on function public.add_poll_option(uuid, text, uuid) is
  '#621. Member write-in: adds ONE option to an open, visible poll, attributed to the caller''s own seat. SECURITY INVOKER — RLS ("options: members can suggest") is the source of truth. No INSERT..RETURNING; returns the new (or, on idempotency replay, the ORIGINAL) option id.';

revoke execute on function public.add_poll_option(uuid, text, uuid) from public, anon;
grant execute on function public.add_poll_option(uuid, text, uuid) to authenticated;

-- =============================================================
-- End of 20260814020000_poll_writein_options.sql
-- =============================================================
