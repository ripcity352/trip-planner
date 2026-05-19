-- =============================================================
-- 20260519204313_m2_date_poll.sql
-- M2 Wave 3 — Celebrant-weighted date poll + Realtime votes.
-- Closes #75 (celebrant-weighted poll) + #76 (reusable PulsePoll).
--
-- Depends on:
--   * 0001_init.sql                              — is_trip_member()
--   * 20260519123255_m1_foundation.sql           — is_celebrant, helpers
--   * 20260519191412_m2_trip_role_co_organizer   — co_organizer enum
--   * 20260519191413_m2_trips_and_invites.sql    — is_trip_organizer()
--
-- Architect-signed contract: notes/m2-execution-plan.md → Appendix A.
--
-- Adds (in dependency order, atomic in one migration per project
-- discipline — RLS lives next to the tables it gates):
--   1. `date_poll_celebrant_mark` enum
--   2. `date_poll_candidates` table + trip-id index + CHECK
--      (ends_on >= starts_on)
--   3. `date_poll_celebrant_marks` table (PK on candidate_id — exactly
--      one mark per candidate)
--   4. `date_poll_votes` table (composite PK + idempotency partial
--      unique for replay safety)
--   5. RLS for all three tables. The WITH CHECK on date_poll_votes
--      binds `trip_member_id` to `auth.uid()` so vote stuffing on a
--      peer's behalf is structurally impossible (Wave 2a sec-review
--      H1 finding).
--   6. `assert_candidate_not_vetoed_before_vote` trigger — INSERT/
--      UPDATE on date_poll_votes raises P0001 if the celebrant mark
--      is 'no-go'. Defense-in-depth on top of the app-layer filter
--      that hides vetoed candidates from the member view-model.
--   7. Realtime publication adds — wrapped in DO blocks so the
--      migration is a no-op when `supabase_realtime` doesn't exist
--      (CI test runners without realtime configured).
-- =============================================================

-- =============================================================
-- 1. Enum: date_poll_celebrant_mark
-- =============================================================
create type public.date_poll_celebrant_mark as enum (
  'works',
  'works-with-effort',
  'no-go'
);

comment on type public.date_poll_celebrant_mark is
  'Celebrant chip values for the date poll. `works`/`works-with-effort` permit voting; `no-go` vetoes the candidate (member voters cannot see it).';

-- =============================================================
-- 2. date_poll_candidates — proposed date windows
-- =============================================================
-- Organizers and the celebrant can propose. Max 4 active candidates
-- per trip is enforced at the action layer (cheap; promote to a check
-- function later if needed).
create table public.date_poll_candidates (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index date_poll_candidates_trip_idx
  on public.date_poll_candidates(trip_id);

comment on table public.date_poll_candidates is
  'Proposed date windows for a trip. Max 4 per trip (app-level cap). Celebrant or organizers can write.';
comment on column public.date_poll_candidates.label is
  'Human-readable window label, e.g. "Last weekend of June".';

-- =============================================================
-- 3. date_poll_celebrant_marks — celebrant's per-candidate chip
-- =============================================================
-- Exactly one mark per candidate (candidate_id is the PK). The marked_by
-- column tracks who set it (always the celebrant; column kept for
-- audit / future co-celebrant scenarios).
create table public.date_poll_celebrant_marks (
  candidate_id uuid primary key
    references public.date_poll_candidates(id) on delete cascade,
  mark public.date_poll_celebrant_mark not null,
  marked_by uuid not null references auth.users(id),
  marked_at timestamptz not null default now()
);

comment on table public.date_poll_celebrant_marks is
  'Celebrant chip per candidate. PK on candidate_id — exactly one mark per candidate. Upsert semantics from the action layer.';

-- =============================================================
-- 4. date_poll_votes — member yes/no per candidate
-- =============================================================
-- Composite PK (candidate_id, trip_member_id) guarantees one vote per
-- member per candidate regardless of replay. The optional
-- idempotency_key column + partial unique covers the network-flake
-- retry path explicitly so client-side queue replay is a no-op.
create table public.date_poll_votes (
  candidate_id uuid not null
    references public.date_poll_candidates(id) on delete cascade,
  trip_member_id uuid not null
    references public.trip_members(id) on delete cascade,
  vote boolean not null,
  voted_at timestamptz not null default now(),
  idempotency_key uuid,
  primary key (candidate_id, trip_member_id)
);

create unique index date_poll_votes_idempotency_key
  on public.date_poll_votes (candidate_id, trip_member_id, idempotency_key)
  where idempotency_key is not null;

comment on table public.date_poll_votes is
  'Member yes/no per candidate. One row per (candidate, member). Idempotency partial unique on (candidate_id, trip_member_id, idempotency_key) for client-side replay safety.';

-- =============================================================
-- 5a. RLS — date_poll_candidates
-- =============================================================
alter table public.date_poll_candidates enable row level security;

create policy "candidates: members can read"
  on public.date_poll_candidates
  for select
  using (public.is_trip_member(trip_id));

-- Organizers OR the celebrant can propose. `is_celebrant` is a column
-- on trip_members; we check it via a sub-EXISTS rather than a helper
-- (it's the only RLS use of `is_celebrant` so far — promoting it to a
-- helper now would be premature).
create policy "candidates: organizers or celebrant can insert"
  on public.date_poll_candidates
  for insert
  with check (
    public.is_trip_organizer(trip_id)
    or exists (
      select 1 from public.trip_members tm
      where tm.trip_id = date_poll_candidates.trip_id
        and tm.user_id = auth.uid()
        and tm.is_celebrant
    )
  );

create policy "candidates: organizers can update"
  on public.date_poll_candidates
  for update
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

create policy "candidates: organizers can delete"
  on public.date_poll_candidates
  for delete
  using (public.is_trip_organizer(trip_id));

-- =============================================================
-- 5b. RLS — date_poll_celebrant_marks
-- =============================================================
alter table public.date_poll_celebrant_marks enable row level security;

create policy "marks: members can read"
  on public.date_poll_celebrant_marks
  for select
  using (
    exists (
      select 1 from public.date_poll_candidates c
      where c.id = date_poll_celebrant_marks.candidate_id
        and public.is_trip_member(c.trip_id)
    )
  );

-- The celebrant is the only writer. The WITH CHECK joins to
-- trip_members on the candidate's trip and binds `is_celebrant = true`
-- to `auth.uid()`. No helper function for this — it's specific enough
-- that hand-inlining is clearer than wrapping.
create policy "marks: celebrant can insert"
  on public.date_poll_celebrant_marks
  for insert
  with check (
    exists (
      select 1
      from public.date_poll_candidates c
      join public.trip_members tm on tm.trip_id = c.trip_id
      where c.id = date_poll_celebrant_marks.candidate_id
        and tm.user_id = auth.uid()
        and tm.is_celebrant
    )
  );

create policy "marks: celebrant can update"
  on public.date_poll_celebrant_marks
  for update
  using (
    exists (
      select 1
      from public.date_poll_candidates c
      join public.trip_members tm on tm.trip_id = c.trip_id
      where c.id = date_poll_celebrant_marks.candidate_id
        and tm.user_id = auth.uid()
        and tm.is_celebrant
    )
  )
  with check (
    exists (
      select 1
      from public.date_poll_candidates c
      join public.trip_members tm on tm.trip_id = c.trip_id
      where c.id = date_poll_celebrant_marks.candidate_id
        and tm.user_id = auth.uid()
        and tm.is_celebrant
    )
  );

-- =============================================================
-- 5c. RLS — date_poll_votes
-- =============================================================
alter table public.date_poll_votes enable row level security;

-- Members of the candidate's trip can read all votes (aggregate-only is
-- enforced at the application layer; per-name visibility is reserved
-- for a future voter-opt-in column).
create policy "votes: members can read"
  on public.date_poll_votes
  for select
  using (
    exists (
      select 1 from public.date_poll_candidates c
      where c.id = date_poll_votes.candidate_id
        and public.is_trip_member(c.trip_id)
    )
  );

-- CRITICAL: bind trip_member_id to the caller's own trip_members row.
-- Without this clause, any member could pass a spoofed trip_member_id
-- in the request body and stuff votes on behalf of others. The Wave
-- 2a security review's H1 finding flagged this pattern explicitly.
create policy "votes: members vote as themselves (insert)"
  on public.date_poll_votes
  for insert
  with check (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.date_poll_candidates c on c.trip_id = tm.trip_id
      where c.id = date_poll_votes.candidate_id
        and tm.user_id = auth.uid()
    )
  );

create policy "votes: members update own vote"
  on public.date_poll_votes
  for update
  using (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.date_poll_candidates c on c.trip_id = tm.trip_id
      where c.id = date_poll_votes.candidate_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.date_poll_candidates c on c.trip_id = tm.trip_id
      where c.id = date_poll_votes.candidate_id
        and tm.user_id = auth.uid()
    )
  );

-- =============================================================
-- 6. Trigger: assert_candidate_not_vetoed_before_vote
-- =============================================================
-- Defense-in-depth: the app layer hides vetoed candidates from the
-- member view-model, but the trigger guarantees a stray INSERT/UPDATE
-- against a 'no-go' candidate fails at the DB. Returns the generic
-- 'validation_failed' message to the user (the action layer maps
-- P0001 → validation_failed) so the celebrant's marks aren't
-- enumerable through error probing.
create or replace function public.assert_candidate_not_vetoed_before_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mark public.date_poll_celebrant_mark;
begin
  select mark into v_mark
  from public.date_poll_celebrant_marks
  where candidate_id = new.candidate_id;

  if v_mark = 'no-go' then
    raise exception 'candidate is vetoed by celebrant' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function public.assert_candidate_not_vetoed_before_vote() is
  'BEFORE INSERT/UPDATE trigger on date_poll_votes. Raises P0001 if the candidate is vetoed (mark = no-go). Defense-in-depth on top of the app-layer filter.';

create trigger assert_candidate_not_vetoed_before_vote_trg
  before insert or update on public.date_poll_votes
  for each row execute function public.assert_candidate_not_vetoed_before_vote();

-- =============================================================
-- 7. Realtime publication adds
-- =============================================================
-- The `supabase_realtime` publication ships with hosted Supabase
-- projects but may not exist on a bare-bones local Postgres (the
-- CI matrix can vary). Guard each addition so this migration is a
-- no-op when the publication is absent.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.date_poll_candidates';
    execute 'alter publication supabase_realtime add table public.date_poll_celebrant_marks';
    execute 'alter publication supabase_realtime add table public.date_poll_votes';
  end if;
end
$$;

-- =============================================================
-- End of 20260519204313_m2_date_poll.sql
-- =============================================================
