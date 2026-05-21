-- =============================================================
-- 20260520052357_m3_itinerary_announcements.sql
-- M3 Wave 1 — Itinerary + Announcements schema + data layer.
--
-- Depends on:
--   * 0001_init.sql                               — base tables, helpers
--   * 20260519123255_m1_foundation.sql            — trip_visibility enum,
--     can_see_content(), is_trip_celebrant(), visibility cols already added
--     to itinerary_items and announcements, idempotency_key on announcements
--   * 20260519191412_m2_trip_role_co_organizer    — co_organizer enum value
--   * 20260519191413_m2_trips_and_invites.sql     — is_trip_organizer() updated
--   * 20260519202859_m2_rsvp_idempotency_scope    — trip_member idempotency
--   * 20260519204313_m2_date_poll.sql             — date poll tables
--
-- Architect-signed contract: notes/m3-execution-plan.md Appendix A.
--
-- NOTE on existing columns:
--   * itinerary_items already has: id, trip_id, day, start_time, end_time,
--     title, location, address, notes, cost_cents, currency, created_by,
--     created_at, updated_at, visibility (from m1_foundation)
--   * announcements already has: id, trip_id, author_id, body, pinned,
--     created_at, visibility, idempotency_key (from init + m1_foundation)
--
-- Adds (in dependency order):
--   1. Enums: itinerary_item_kind, travel_leg_kind, itinerary_item_rsvp_status
--   2. Extend itinerary_items (kind, activity_tag, dress_code, idempotency_key)
--   3. trips.notes
--   4. Extend announcements (created_by, idempotency_key partial unique)
--   5. lodging_assignments table
--   6. travel_legs table
--   7. itinerary_item_rsvps table
--   8. itinerary_item_member_flags table
--   9. RLS for all new/altered tables
--  10. Realtime publication — announcements
--  11. Trigger: assert_lodging_item_kind_before_assignment
-- =============================================================

-- =============================================================
-- 1. Enums
-- =============================================================

create type public.itinerary_item_kind as enum (
  'event',
  'lodging',
  'transport',
  'meal',
  'activity'
);

comment on type public.itinerary_item_kind is
  'Category of an itinerary item. Drives kind icon + lodging-assignment eligibility.';

create type public.travel_leg_kind as enum (
  'flight',
  'train',
  'drive',
  'other'
);

comment on type public.travel_leg_kind is
  'Mode of transport for a travel leg entry.';

create type public.itinerary_item_rsvp_status as enum (
  'going',
  'skipping'
);

comment on type public.itinerary_item_rsvp_status is
  'Per-item RSVP status. Absence of a row = inherits the day-level RSVP. Rows only exist when the member has explicitly opted out (skipping) or back in (going) relative to the day-level default.';

-- =============================================================
-- 2. Extend itinerary_items
-- NOTE: address, visibility already exist from m1_foundation. Do NOT re-add.
-- =============================================================

alter table public.itinerary_items
  add column kind public.itinerary_item_kind not null default 'activity';

comment on column public.itinerary_items.kind is
  'Activity category. Default: activity. Determines icon + feature eligibility (e.g. lodging assignments require kind=lodging).';

alter table public.itinerary_items
  add column activity_tag text[] not null default '{}';

comment on column public.itinerary_items.activity_tag is
  'Free-form activity tags, e.g. {\"swimming\",\"group\"}. UI renders as chips.';

alter table public.itinerary_items
  add column dress_code text;

comment on column public.itinerary_items.dress_code is
  'Optional dress code guidance, e.g. "smart casual". Displayed inline on the item card.';

alter table public.itinerary_items
  add column idempotency_key uuid;

create unique index itinerary_items_idempotency
  on public.itinerary_items (trip_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.itinerary_items.idempotency_key is
  'Client-generated UUID. Scope (trip_id, idempotency_key) — organizer acting on behalf; partial unique index prevents duplicate inserts on retry.';

-- =============================================================
-- 3. trips.notes
-- =============================================================

alter table public.trips
  add column notes text;

comment on column public.trips.notes is
  'Organizer-editable trip-level FAQ / notes. Visible to all members per the trip visibility rules. Closes #78.';

-- =============================================================
-- 4. Extend announcements
-- NOTE: visibility and idempotency_key already exist from m1_foundation.
--       The partial unique index on (trip_id, idempotency_key) was added
--       there too. We only add the new created_by column.
-- =============================================================

alter table public.announcements
  add column created_by uuid references auth.users(id);

comment on column public.announcements.created_by is
  'The auth.users.id of the organizer who posted this announcement. Distinct from author_id (which predates M3 and is preserved for backward compatibility). WITH CHECK on INSERT enforces created_by = auth.uid().';

-- =============================================================
-- 5. lodging_assignments
-- =============================================================

create table public.lodging_assignments (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.itinerary_items(id) on delete cascade,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  room_label     text,
  created_at     timestamptz not null default now(),
  unique (item_id, trip_member_id)
);

create index lodging_assignments_item_idx
  on public.lodging_assignments(item_id);

create index lodging_assignments_member_idx
  on public.lodging_assignments(trip_member_id);

comment on table public.lodging_assignments is
  'Maps a trip member to a lodging itinerary item (room assignment). Trigger assert_lodging_item_kind_before_assignment enforces item.kind = lodging.';
comment on column public.lodging_assignments.room_label is
  'Optional room descriptor, e.g. "King Suite". Organizer-supplied.';

-- =============================================================
-- 6. travel_legs
-- =============================================================

create table public.travel_legs (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips(id) on delete cascade,
  trip_member_id    uuid not null references public.trip_members(id) on delete cascade,
  kind              public.travel_leg_kind not null,
  depart_at         timestamptz,
  arrive_at         timestamptz,
  carrier           text,
  confirmation_code text,
  notes             text,
  idempotency_key   uuid,
  created_at        timestamptz not null default now()
);

create index travel_legs_trip_arrive_idx
  on public.travel_legs(trip_id, arrive_at);

create unique index travel_legs_idempotency
  on public.travel_legs (trip_id, trip_member_id, idempotency_key)
  where idempotency_key is not null;

comment on table public.travel_legs is
  'Per-member travel leg (flight, train, drive, other). Members write only their own legs. Trip-wide SELECT for all members (arrivals manifest). Sorted by arrive_at ASC.';
comment on column public.travel_legs.idempotency_key is
  'Client-generated UUID. Scope (trip_id, trip_member_id, idempotency_key) — strictly user-scoped per ADR.';

-- =============================================================
-- 7. itinerary_item_rsvps
-- =============================================================

create table public.itinerary_item_rsvps (
  item_id        uuid not null references public.itinerary_items(id) on delete cascade,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  status         public.itinerary_item_rsvp_status not null,
  idempotency_key uuid,
  updated_at     timestamptz not null default now(),
  primary key (item_id, trip_member_id)
);

create unique index itinerary_item_rsvps_idempotency
  on public.itinerary_item_rsvps (item_id, trip_member_id, idempotency_key)
  where idempotency_key is not null;

comment on table public.itinerary_item_rsvps is
  'Per-member per-item RSVP. Absence = inherits day-level RSVP. going/skipping are explicit overrides. Opt-outs are silent — not broadcast to peers. Idempotency scope: (item_id, trip_member_id, idempotency_key).';

-- =============================================================
-- 8. itinerary_item_member_flags
-- =============================================================

create table public.itinerary_item_member_flags (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.itinerary_items(id) on delete cascade,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  flag           text not null,
  note           text,
  created_at     timestamptz not null default now(),
  unique (item_id, trip_member_id, flag)
);

create index item_member_flags_item_idx
  on public.itinerary_item_member_flags(item_id);

comment on table public.itinerary_item_member_flags is
  'Per-member per-item participation flags (dietary, sober, late-arrival, etc.). flag is freeform text — NOT an enum (avoids encoding a default per CLAUDE.md rule #8). SELECT is organizer-only; members can only write (insert/delete) their own flags.';

-- =============================================================
-- 9. RLS
-- =============================================================

-- ---- 9a. itinerary_items — drop existing, recreate visibility-aware ----
-- The existing "members can read itinerary" and "organizers can write
-- itinerary" policies from 0001_init.sql are replaced. The SELECT policy
-- now routes through can_see_content() for hide_from_celebrant support.

drop policy if exists "members can read itinerary" on public.itinerary_items;
drop policy if exists "organizers can write itinerary" on public.itinerary_items;

create policy "itinerary: members read via visibility"
  on public.itinerary_items
  for select
  to authenticated
  using (public.can_see_content(trip_id, visibility));

-- INSERT pins created_by = auth.uid() (defense-in-depth — restores the
-- binding 0001_init.sql had before the M3 visibility-aware rewrite).
create policy "itinerary: organizers insert"
  on public.itinerary_items
  for insert
  to authenticated
  with check (
    public.is_trip_organizer(trip_id)
    and auth.uid() = created_by
  );

create policy "itinerary: organizers update"
  on public.itinerary_items
  for update
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

create policy "itinerary: organizers delete"
  on public.itinerary_items
  for delete
  to authenticated
  using (public.is_trip_organizer(trip_id));

-- ---- 9b. announcements — drop existing, recreate visibility-aware ----
-- Existing policies from 0001_init.sql and m1_foundation are replaced
-- to add can_see_content() on SELECT and created_by = auth.uid() on INSERT.

drop policy if exists "members can read announcements" on public.announcements;
drop policy if exists "organizers can write announcements" on public.announcements;
drop policy if exists "organizers can update announcements" on public.announcements;
drop policy if exists "organizers can delete announcements" on public.announcements;

create policy "announcements: members read via visibility"
  on public.announcements
  for select
  to authenticated
  using (public.can_see_content(trip_id, visibility));

-- author_id (legacy) AND the new created_by both bind to auth.uid().
-- The action sets both columns to the same value; the WITH CHECK locks
-- direct-client misuse.
create policy "announcements: organizers insert"
  on public.announcements
  for insert
  to authenticated
  with check (
    public.is_trip_organizer(trip_id)
    and auth.uid() = author_id
    and auth.uid() = created_by
  );

create policy "announcements: organizers update"
  on public.announcements
  for update
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

create policy "announcements: organizers delete"
  on public.announcements
  for delete
  to authenticated
  using (public.is_trip_organizer(trip_id));

-- ---- 9c. lodging_assignments ----
alter table public.lodging_assignments enable row level security;

create policy "lodging: members read"
  on public.lodging_assignments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.itinerary_items ii
      where ii.id = lodging_assignments.item_id
        and public.is_trip_member(ii.trip_id)
    )
  );

-- INSERT/UPDATE additionally pins trip_member_id.trip_id = item.trip_id
-- (defense-in-depth — prevents an organizer of trip A from assigning a
-- trip_member of trip B to their lodging item). The trigger
-- assert_lodging_item_kind_before_assignment additionally enforces
-- item.kind = 'lodging'.
create policy "lodging: organizers insert"
  on public.lodging_assignments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.itinerary_items ii
      join public.trip_members tm
        on tm.id = lodging_assignments.trip_member_id
       and tm.trip_id = ii.trip_id
      where ii.id = lodging_assignments.item_id
        and public.is_trip_organizer(ii.trip_id)
    )
  );

create policy "lodging: organizers update"
  on public.lodging_assignments
  for update
  to authenticated
  using (
    exists (
      select 1 from public.itinerary_items ii
      where ii.id = lodging_assignments.item_id
        and public.is_trip_organizer(ii.trip_id)
    )
  )
  with check (
    exists (
      select 1
      from public.itinerary_items ii
      join public.trip_members tm
        on tm.id = lodging_assignments.trip_member_id
       and tm.trip_id = ii.trip_id
      where ii.id = lodging_assignments.item_id
        and public.is_trip_organizer(ii.trip_id)
    )
  );

create policy "lodging: organizers delete"
  on public.lodging_assignments
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.itinerary_items ii
      where ii.id = lodging_assignments.item_id
        and public.is_trip_organizer(ii.trip_id)
    )
  );

-- ---- 9d. travel_legs ----
-- SELECT: all trip members can read the full arrivals manifest.
-- INSERT/UPDATE/DELETE: strictly owner-only — trip_member_id must map
-- to the caller's own membership row for the same trip.
alter table public.travel_legs enable row level security;

create policy "travel legs: members read"
  on public.travel_legs
  for select
  to authenticated
  using (public.is_trip_member(trip_id));

create policy "travel legs: owner insert"
  on public.travel_legs
  for insert
  to authenticated
  with check (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = travel_legs.trip_id
        and tm.user_id = auth.uid()
    )
  );

create policy "travel legs: owner update"
  on public.travel_legs
  for update
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = travel_legs.trip_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = travel_legs.trip_id
        and tm.user_id = auth.uid()
    )
  );

create policy "travel legs: owner delete"
  on public.travel_legs
  for delete
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = travel_legs.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- ---- 9e. itinerary_item_rsvps ----
-- SELECT: all trip members see the full rsvp set (aggregate; silent opt-outs).
-- INSERT/UPDATE/DELETE: strictly owner-only via trip_member_id.
alter table public.itinerary_item_rsvps enable row level security;

create policy "item rsvps: members read"
  on public.itinerary_item_rsvps
  for select
  to authenticated
  using (
    exists (
      select 1 from public.itinerary_items ii
      where ii.id = itinerary_item_rsvps.item_id
        and public.is_trip_member(ii.trip_id)
    )
  );

create policy "item rsvps: owner insert"
  on public.itinerary_item_rsvps
  for insert
  to authenticated
  with check (
    trip_member_id in (
      select tm.id from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = itinerary_item_rsvps.item_id
        and tm.user_id = auth.uid()
    )
  );

create policy "item rsvps: owner update"
  on public.itinerary_item_rsvps
  for update
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = itinerary_item_rsvps.item_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    trip_member_id in (
      select tm.id from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = itinerary_item_rsvps.item_id
        and tm.user_id = auth.uid()
    )
  );

create policy "item rsvps: owner delete"
  on public.itinerary_item_rsvps
  for delete
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = itinerary_item_rsvps.item_id
        and tm.user_id = auth.uid()
    )
  );

-- ---- 9f. itinerary_item_member_flags ----
-- SELECT: organizers ONLY — members cannot see other members' flags,
--   and cannot even see their own flags post-submission.
-- INSERT/DELETE: owner-only (the member writes their own flag; trip
--   membership is verified to prevent cross-trip injection).
-- No UPDATE policy — flag modification is delete + re-insert.
alter table public.itinerary_item_member_flags enable row level security;

create policy "item flags: organizers read"
  on public.itinerary_item_member_flags
  for select
  to authenticated
  using (
    exists (
      select 1 from public.itinerary_items ii
      where ii.id = itinerary_item_member_flags.item_id
        and public.is_trip_organizer(ii.trip_id)
    )
  );

create policy "item flags: owner insert"
  on public.itinerary_item_member_flags
  for insert
  to authenticated
  with check (
    trip_member_id in (
      select tm.id from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = itinerary_item_member_flags.item_id
        and tm.user_id = auth.uid()
    )
  );

create policy "item flags: owner delete"
  on public.itinerary_item_member_flags
  for delete
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.user_id = auth.uid()
        and tm.id = itinerary_item_member_flags.trip_member_id
    )
  );

-- =============================================================
-- 10. Realtime publication — announcements
-- Wrapped in DO block so migration is a no-op on bare Postgres
-- instances (CI runners) where supabase_realtime may not exist.
-- =============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.announcements';
  end if;
end
$$;

-- =============================================================
-- 11. Trigger: assert_lodging_item_kind_before_assignment
-- Raises P0001 if the referenced itinerary_item.kind <> 'lodging'.
-- Defense-in-depth on top of the application-layer guard.
-- =============================================================
create or replace function public.assert_lodging_item_kind_before_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.itinerary_item_kind;
begin
  select kind into v_kind
  from public.itinerary_items
  where id = new.item_id;

  if v_kind is null or v_kind <> 'lodging' then
    raise exception 'lodging assignment requires item.kind = lodging' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function public.assert_lodging_item_kind_before_assignment() is
  'BEFORE INSERT OR UPDATE trigger on lodging_assignments. Raises P0001 if the referenced itinerary_items.kind is not lodging. Defense-in-depth; the app layer also validates kind before calling the action.';

create trigger assert_lodging_item_kind_before_assignment_trg
  before insert or update on public.lodging_assignments
  for each row execute function public.assert_lodging_item_kind_before_assignment();

-- =============================================================
-- End of 20260520052357_m3_itinerary_announcements.sql
-- =============================================================
