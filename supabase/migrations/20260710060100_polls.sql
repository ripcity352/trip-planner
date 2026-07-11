-- =============================================================
-- 20260710060100_polls.sql
-- Generic poll primitive (#390) — polls + poll_options + poll_votes.
--
-- Depends on:
--   * 0001_init.sql                      — is_trip_member()
--   * 20260519123255_m1_foundation.sql   — trip_visibility, can_see_content()
--   * 20260519191413_m2_trips_and_invites.sql — is_trip_organizer()
--
-- Mirrors the M2 date-poll migration (20260519204313_m2_date_poll.sql)
-- end-to-end: RLS in the same migration, vote WITH CHECK binds
-- trip_member_id to auth.uid() (the Wave 2a H1 anti-vote-stuffing
-- pattern), idempotency partial uniques, guarded Realtime publication
-- adds. The atomic-create RPC mirrors create_expense_with_splits
-- (the expenses correctable-money migration, #383/#384): SECURITY
-- INVOKER, id generated inside, no
-- INSERT..RETURNING, idempotency replay returns the ORIGINAL id.
--
-- Scope fence (#390): ONE decision widget — question + 2–4 options +
-- optional deadline. No comments, no suggestion box, organizer-composed.
--
-- Adds (in dependency order):
--   1. `polls` table            — rule 7 visibility column, rule 9
--                                 idempotency (trip_id scope: organizer
--                                 acting on behalf of the trip)
--   2. `poll_options` table     — 2–4 invariant (see comment), position
--                                 CHECK 0–3, composite unique for the
--                                 votes pair-FK
--   3. `poll_votes` table       — single choice per member, revotable
--                                 (PK poll_id + trip_member_id), pair FK
--                                 so a vote can't point at another
--                                 poll's option
--   4. RLS for all three tables
--   5. `create_poll_with_options()` atomic-create RPC (enforces the
--      2–4 count — a plain CHECK can't count sibling rows)
--   6. Guarded Realtime publication adds (PulsePoll subscriptions)
-- =============================================================

-- =============================================================
-- 1. polls
-- =============================================================
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  question text not null,
  -- Rule 7: visibility axis on every user-content table.
  visibility trip_visibility not null default 'everyone',
  -- Optional deadline. Date-only register (#211) — no timestamps, no
  -- timezone games. Votes are accepted THROUGH closes_on (inclusive);
  -- the poll is closed once current_date > closes_on. current_date
  -- evaluates in the DB timezone (UTC on Supabase) — acceptable drift
  -- for a "last call for votes" deadline per the date-only register.
  closes_on date,
  -- Attendee identity goes through trip_member_id (M1 FK convention).
  -- Deliberate deviation from the author-column exception
  -- (announcements.author_id → auth.users): #390 specifies the poll
  -- author as a trip_member_id so the "asked by" attribution survives
  -- the claim-the-seat flow like every other attendee reference.
  created_by uuid not null references public.trip_members(id) on delete cascade,
  -- Rule 9 idempotency. Scope (trip_id, idempotency_key): organizer
  -- acting on behalf of the trip (same scope class as announcements /
  -- expenses — see notes/database-workflow.md §Idempotency-key scope).
  idempotency_key uuid,
  created_at timestamptz not null default now()
);

create index polls_trip_idx on public.polls(trip_id);

create unique index polls_idempotency_key
  on public.polls (trip_id, idempotency_key)
  where idempotency_key is not null;

comment on table public.polls is
  '#390 generic decision poll. One question, 2-4 options (poll_options), optional date-only deadline. Organizer-composed this round.';
comment on column public.polls.closes_on is
  'Date-only deadline. Votes accepted through closes_on inclusive; closed once current_date > closes_on. NULL = open-ended.';
comment on column public.polls.created_by is
  'trip_members.id of the composing organizer. trip_member_id (not auth.users) so attribution survives the claim-the-seat flow.';

-- =============================================================
-- 2. poll_options
-- =============================================================
-- INVARIANT (enforced in create_poll_with_options, NOT here): every
-- poll has between 2 and 4 options. A table-level CHECK cannot count
-- sibling rows, so the DB-side guarantee lives in the atomic-create
-- RPC (the only write path — see the INSERT policy comment below) plus
-- the position CHECK, which caps the ceiling at 4 structurally.
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  position smallint not null,
  check (position >= 0 and position <= 3),
  unique (poll_id, position),
  -- Composite unique so poll_votes can pair-FK (option_id, poll_id) —
  -- structurally impossible to vote for another poll's option.
  unique (id, poll_id)
);

comment on table public.poll_options is
  '#390. 2-4 options per poll — count invariant enforced by create_poll_with_options() (a CHECK cannot count siblings); position CHECK 0-3 caps the ceiling.';

-- =============================================================
-- 3. poll_votes
-- =============================================================
-- Single choice, revotable: PK (poll_id, trip_member_id) — one row per
-- member per poll; a revote upserts option_id on the same row. The
-- pair FK to poll_options(id, poll_id) guarantees the chosen option
-- belongs to the voted poll. Optional idempotency_key + partial unique
-- mirrors date_poll_votes (client replay is a no-op).
create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  voted_at timestamptz not null default now(),
  idempotency_key uuid,
  primary key (poll_id, trip_member_id),
  foreign key (option_id, poll_id)
    references public.poll_options(id, poll_id) on delete cascade
);

create unique index poll_votes_idempotency_key
  on public.poll_votes (poll_id, trip_member_id, idempotency_key)
  where idempotency_key is not null;

create index poll_votes_option_idx on public.poll_votes(option_id);

comment on table public.poll_votes is
  '#390. One row per (poll, member) — single choice, revotable via upsert. Pair FK (option_id, poll_id) pins the option to the poll. Aggregate-only in UI per ADR.';

-- =============================================================
-- 4a. RLS — polls
-- =============================================================
alter table public.polls enable row level security;

-- Rule 7: SELECT routes through can_see_content(trip_id, visibility) —
-- hide_from_celebrant polls are fully invisible to the celebrant
-- (rows AND, via the join-through policies below, options and votes).
create policy "polls: visibility-gated read"
  on public.polls
  for select
  to authenticated
  using (public.can_see_content(trip_id, visibility));

-- Organizer-only composer this round (#390 scope fence; member-created
-- polls are an open question recorded in the PR). created_by is bound
-- to the caller's OWN trip_members row — an organizer can't attribute
-- a poll to someone else (the H1 anti-spoofing pattern).
create policy "polls: organizers can insert"
  on public.polls
  for insert
  to authenticated
  with check (
    public.is_trip_organizer(trip_id)
    and created_by in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = polls.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- Organizer UPDATE/DELETE mirror date_poll_candidates — no UI consumer
-- this round (the deadline closes a poll; a close/edit surface can land
-- without a new migration).
create policy "polls: organizers can update"
  on public.polls
  for update
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

create policy "polls: organizers can delete"
  on public.polls
  for delete
  to authenticated
  using (public.is_trip_organizer(trip_id));

-- =============================================================
-- 4b. RLS — poll_options
-- =============================================================
alter table public.poll_options enable row level security;

-- Options inherit the parent poll's visibility: the EXISTS runs under
-- the caller's polls SELECT RLS AND re-checks can_see_content, so a
-- hide_from_celebrant poll's options are invisible to the celebrant.
create policy "options: visible with their poll"
  on public.poll_options
  for select
  to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_options.poll_id
        and public.can_see_content(p.trip_id, p.visibility)
    )
  );

-- INSERT is organizer-only via the parent poll. In practice the only
-- write path is create_poll_with_options() (SECURITY INVOKER — this
-- policy still gates it); the policy exists so RLS, not the RPC, is
-- the source of truth. NOTE (#384 lesson, load-bearing): this EXISTS
-- reads public.polls under the caller's SELECT RLS, so options for an
-- author-invisible poll fail 42501 — which is what makes the RPC abort
-- atomically instead of committing an optionless orphan.
create policy "options: organizers can insert"
  on public.poll_options
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.polls p
      where p.id = poll_options.poll_id
        and public.is_trip_organizer(p.trip_id)
    )
  );

-- NOTE: no UPDATE/DELETE policies on poll_options. Options are
-- immutable once asked — editing choices mid-vote silently reframes
-- votes already cast. When "edit a draft poll" becomes a feature, add
-- explicit policies here so it doesn't land without RLS coverage.

-- =============================================================
-- 4c. RLS — poll_votes
-- =============================================================
alter table public.poll_votes enable row level security;

-- SELECT posture — MIRRORS date_poll_votes ("votes: members can read"):
-- date_poll_votes grants row-level SELECT to every member of the
-- candidate's trip and relies on aggregate-only UI (per-name visibility
-- is reserved for a future voter-opt-in column). Same posture here,
-- routed through can_see_content because polls carry a visibility axis:
-- members who can see the poll can read its vote rows; the celebrant is
-- fully blind to hide_from_celebrant polls' votes at the DB level.
create policy "votes: readable with their poll"
  on public.poll_votes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_votes.poll_id
        and public.can_see_content(p.trip_id, p.visibility)
    )
  );

-- CRITICAL (H1 pattern, mirrored from date_poll_votes): bind
-- trip_member_id to the caller's own trip_members row — vote stuffing
-- on a peer's behalf is structurally impossible. can_see_content in
-- the join means you can only vote on polls you can see (a celebrant
-- can't probe hide_from_celebrant polls; rule 11 — the celebrant votes
-- like anyone on polls he CAN see). The closes_on predicate enforces
-- the deadline at the DB (votes accepted through closes_on inclusive).
create policy "votes: members vote as themselves (insert)"
  on public.poll_votes
  for insert
  to authenticated
  with check (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.polls p on p.trip_id = tm.trip_id
      where p.id = poll_votes.poll_id
        and tm.user_id = auth.uid()
        and public.can_see_content(p.trip_id, p.visibility)
        and (p.closes_on is null or p.closes_on >= current_date)
    )
  );

create policy "votes: members update own vote"
  on public.poll_votes
  for update
  to authenticated
  using (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.polls p on p.trip_id = tm.trip_id
      where p.id = poll_votes.poll_id
        and tm.user_id = auth.uid()
        and public.can_see_content(p.trip_id, p.visibility)
        and (p.closes_on is null or p.closes_on >= current_date)
    )
  )
  with check (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.polls p on p.trip_id = tm.trip_id
      where p.id = poll_votes.poll_id
        and tm.user_id = auth.uid()
        and public.can_see_content(p.trip_id, p.visibility)
        and (p.closes_on is null or p.closes_on >= current_date)
    )
  );

-- Own-row DELETE = retract a choice (absent row is "hasn't voted" —
-- unambiguous for single-choice, unlike date_poll_votes' yes/no where
-- DELETE was deliberately omitted). Deadline predicate applies: no
-- retracting after the poll closes (that would change a called outcome).
create policy "votes: members retract own vote"
  on public.poll_votes
  for delete
  to authenticated
  using (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.polls p on p.trip_id = tm.trip_id
      where p.id = poll_votes.poll_id
        and tm.user_id = auth.uid()
        and public.can_see_content(p.trip_id, p.visibility)
        and (p.closes_on is null or p.closes_on >= current_date)
    )
  );

-- =============================================================
-- 5. create_poll_with_options — atomic create RPC
-- =============================================================
-- Mirrors create_expense_with_splits (#383/#384): SECURITY INVOKER so
-- RLS stays the source of truth; id generated HERE (no INSERT..RETURNING
-- — Postgres applies the SELECT policy to RETURNING, which would abort
-- creation of any poll hidden from its own author); options written in
-- the same transaction (a failure rolls the poll back too — never an
-- optionless orphan); idempotency replay returns the ORIGINAL poll id.
-- This is where the 2–4 option-count invariant is enforced DB-side.
create or replace function public.create_poll_with_options(
  p_trip_id uuid,
  p_question text,
  p_visibility trip_visibility,
  p_closes_on date,
  p_idempotency_key uuid,
  p_options jsonb  -- JSON array of option labels, in display order
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
      id, trip_id, question, visibility, closes_on, created_by, idempotency_key
    )
    values (
      v_poll_id,
      p_trip_id,
      p_question,
      coalesce(p_visibility, 'everyone'),
      p_closes_on,
      v_member_id,
      p_idempotency_key
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

comment on function public.create_poll_with_options(uuid, text, trip_visibility, date, uuid, jsonb) is
  '#390. Atomic poll + 2-4 options create. SECURITY INVOKER — RLS is the source of truth. No INSERT..RETURNING; returns the new (or, on idempotency replay, the ORIGINAL) poll id.';

-- SECURITY INVOKER, but still trim the default PUBLIC execute grant:
-- only signed-in users have any business calling this.
revoke execute on function public.create_poll_with_options(uuid, text, trip_visibility, date, uuid, jsonb) from public, anon;
grant execute on function public.create_poll_with_options(uuid, text, trip_visibility, date, uuid, jsonb) to authenticated;

-- =============================================================
-- 6. Realtime publication adds
-- =============================================================
-- Guarded like the date-poll migration — no-op when the
-- supabase_realtime publication doesn't exist (bare CI Postgres).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.polls';
    execute 'alter publication supabase_realtime add table public.poll_options';
    execute 'alter publication supabase_realtime add table public.poll_votes';
  end if;
end
$$;

-- =============================================================
-- End of 20260710060100_polls.sql
-- =============================================================
