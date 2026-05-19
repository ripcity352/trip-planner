-- =============================================================
-- 20260519123255_m1_foundation.sql
-- M1 Foundation migration — single dependency-ordered file.
-- Closes #20, #21, #22, #23, #24, #25, #26, #66, #67, #70.
--
-- Four-hat review log (see notes/m1-execution-plan.md Wave 2):
--   * Hat 1 (ARCHITECT)         — sections 1..15 ordering + helpers
--   * Hat 2 (DATABASE-REVIEWER) — security_definer/search_path, comments,
--                                 partial-index audit, supporting indexes
--   * Hat 3 (SECURITY-REVIEWER) — RLS rewrite for every touched table,
--                                 helper-only auth checks, security_invoker
--                                 on the visible-rsvp view
--   * Hat 4 (CODE-REVIEWER)     — types.ts + trips.ts companion edits,
--                                 notes/database-workflow.md append,
--                                 verification chain
--
-- IMPORTANT: Re-applies are not expected (migrations are append-only). For
-- local dev `supabase db reset` re-runs from scratch, so each create/alter
-- here is written assuming a clean DB at section 0 (after 0001_init.sql).
-- =============================================================

-- =============================================================
-- 1. Extensions (citext for case-insensitive email; pgcrypto already on)
-- =============================================================
create extension if not exists "citext";

-- =============================================================
-- 2. trip_kind enum + is_template (issue #20)
-- =============================================================
create type trip_kind as enum ('bachelor');

alter table public.trips
  add column kind trip_kind not null default 'bachelor',
  add column is_template boolean not null default false;

comment on column public.trips.kind is
  'Trip variant. Only `bachelor` ships in M1; future variants (bachelorette, birthday, generic) extend the enum.';
comment on column public.trips.is_template is
  'True for seed/template trips used to clone defaults; templates are not real trips and should be excluded from member-facing lists.';

-- =============================================================
-- 3. soft-delete + archive columns on trips (issue #26)
-- =============================================================
alter table public.trips
  add column deleted_at timestamptz,
  add column archived_at timestamptz;

comment on column public.trips.deleted_at is
  'Soft delete. Non-organizers do not see rows where deleted_at is not null (enforced by RLS).';
comment on column public.trips.archived_at is
  'Archived = read-only/past trip surfaced under a separate filter; not the same as deleted.';

-- =============================================================
-- 4. vibe_tags (column lands here; UI/filter logic deferred per #30)
-- =============================================================
alter table public.trips
  add column vibe_tags text[] not null default '{}';

comment on column public.trips.vibe_tags is
  'Soft tags describing the trip vibe (e.g. {"low-key","outdoorsy"}). Filter/UI deferred (#30); column lands now so we do not run a follow-up migration.';

-- =============================================================
-- 5. is_celebrant on trip_members + partial unique (issue #21)
-- =============================================================
alter table public.trip_members
  add column is_celebrant boolean not null default false;

comment on column public.trip_members.is_celebrant is
  'Marks the celebrant (groom for a bachelor trip). At most one per trip — enforced by trip_members_one_celebrant partial unique index.';

create unique index trip_members_one_celebrant
  on public.trip_members(trip_id)
  where is_celebrant;

-- =============================================================
-- 6. Synthetic PK + accountless attendees on trip_members (#23, #66)
-- =============================================================
-- Add the new surrogate uuid, swap the PK, then loosen user_id and add
-- the new identifier columns. Order matters because composite PK references
-- (trip_id, user_id) — drop it AFTER the new PK candidate exists.

alter table public.trip_members
  add column id uuid not null default gen_random_uuid();

alter table public.trip_members
  drop constraint trip_members_pkey;

alter table public.trip_members
  add primary key (id);

alter table public.trip_members
  alter column user_id drop not null;

alter table public.trip_members
  add column display_name text,
  add column phone_e164   text,
  add column email        citext;

comment on column public.trip_members.id is
  'Surrogate PK so feature tables can FK to a single trip_members.id regardless of whether the member is an auth user, an email, or a phone number.';
comment on column public.trip_members.user_id is
  'Nullable — accountless attendees (invited by email/phone before they sign in) have user_id IS NULL until they claim the seat.';
comment on column public.trip_members.display_name is
  'Friendly name for accountless attendees; overrides profiles.display_name in UI when set.';
comment on column public.trip_members.phone_e164 is
  'E.164-formatted phone (e.g. +14155551212). One per trip via partial unique index.';
comment on column public.trip_members.email is
  'citext — case-insensitive equality. One per trip via partial unique index.';

-- Partial unique constraints — only enforce when value is non-null. citext
-- handles case-insensitivity for email; no lower() needed.
create unique index trip_members_unique_user
  on public.trip_members(trip_id, user_id)
  where user_id is not null;

create unique index trip_members_unique_email
  on public.trip_members(trip_id, email)
  where email is not null;

create unique index trip_members_unique_phone
  on public.trip_members(trip_id, phone_e164)
  where phone_e164 is not null;

-- A member must have at least one identifier so we can talk to them.
alter table public.trip_members
  add constraint trip_members_has_identity
  check (user_id is not null or email is not null or phone_e164 is not null);

-- Drop the now-stale user-id-only index from 0001_init.sql; the partial
-- unique index above subsumes it for user_id-based lookups.
drop index if exists public.trip_members_user_idx;
create index trip_members_user_idx
  on public.trip_members(user_id)
  where user_id is not null;

-- =============================================================
-- 7. Visibility enum + helpers (issue #21, #22)
-- =============================================================
-- Define is_trip_celebrant FIRST because can_see_content depends on it.
create type trip_visibility as enum (
  'everyone',
  'organizers_only',
  'hide_from_celebrant',
  'custom'
);

comment on type trip_visibility is
  'Per-content visibility axis. content_visibility_grants join table for custom audiences is deferred (see notes/decisions.md amendment); custom falls back to membership for M1.';

create or replace function public.is_trip_celebrant(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members
    where trip_id = p_trip_id
      and user_id = auth.uid()
      and is_celebrant = true
  );
$$;

comment on function public.is_trip_celebrant(uuid) is
  'True if auth.uid() is the celebrant for the given trip. Used by hide_from_celebrant visibility.';

-- can_see_content: RLS helper that maps a (trip, visibility) pair to a
-- boolean for the calling user. Used by every content-table SELECT policy.
create or replace function public.can_see_content(
  p_trip_id uuid,
  p_visibility trip_visibility
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_visibility
    when 'everyone'             then public.is_trip_member(p_trip_id)
    when 'organizers_only'      then public.is_trip_organizer(p_trip_id)
    when 'hide_from_celebrant'  then public.is_trip_member(p_trip_id)
                                  and not public.is_trip_celebrant(p_trip_id)
    when 'custom'               then public.is_trip_member(p_trip_id)
  end;
$$;

comment on function public.can_see_content(uuid, trip_visibility) is
  'RLS helper. everyone=any member; organizers_only=organizer; hide_from_celebrant=member AND not the celebrant; custom=falls back to membership for M1.';

-- Visibility column on content tables (CLAUDE.md rule #7). Every user-
-- content table ships with this axis from day one so we never have to
-- migrate-then-backfill a default. Defaults to 'everyone'; per-row
-- overrides drive SELECT visibility via can_see_content().
alter table public.announcements
  add column visibility trip_visibility not null default 'everyone';

alter table public.itinerary_items
  add column visibility trip_visibility not null default 'everyone';

alter table public.expenses
  add column visibility trip_visibility not null default 'everyone';

comment on column public.announcements.visibility is
  'Per-row visibility. SELECT RLS routes through can_see_content(trip_id, visibility).';
comment on column public.itinerary_items.visibility is
  'Per-row visibility. SELECT RLS routes through can_see_content(trip_id, visibility).';
comment on column public.expenses.visibility is
  'Per-row visibility. SELECT RLS routes through can_see_content(trip_id, visibility).';

-- =============================================================
-- 8. is_trip_member_by_member_id helper (for FK-retargeted tables)
-- =============================================================
create or replace function public.is_trip_member_by_member_id(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members me
    join public.trip_members target on target.trip_id = me.trip_id
    where target.id = p_member_id
      and me.user_id = auth.uid()
  );
$$;

comment on function public.is_trip_member_by_member_id(uuid) is
  'True if auth.uid() is a member of the same trip as the trip_member row with the given id. Lets FK-retargeted tables check membership without exposing trip_id.';

-- =============================================================
-- 9. Declining-RSVP visibility view (issue #70)
-- =============================================================
-- Per-row redaction: non-organizers must not see other members' declined
-- status. The view returns null for rsvp_status in that case and is the
-- ONLY way app code should read RSVP — direct selects on trip_members are
-- still possible but flagged by review.
--
-- security_invoker = true so RLS on trip_members runs against the caller,
-- not the view owner.
create or replace view public.trip_members_visible_rsvp
  with (security_invoker = true)
as
select
  tm.id,
  tm.trip_id,
  tm.user_id,
  tm.is_celebrant,
  tm.display_name,
  tm.phone_e164,
  tm.email,
  case
    when tm.rsvp_status = 'declined'
         and not public.is_trip_organizer(tm.trip_id)
         and tm.user_id is distinct from auth.uid()
      then null
    else tm.rsvp_status
  end as rsvp_status,
  tm.joined_at
from public.trip_members tm
where public.is_trip_member(tm.trip_id);

comment on view public.trip_members_visible_rsvp is
  'RSVP read-side view. Redacts declined status from non-organizers. App code should prefer this over trip_members for member rosters.';

-- =============================================================
-- 10. trip_member_days table + auto-seed trigger (issue #67)
-- =============================================================
create type trip_member_day_status as enum ('going', 'maybe', 'declined');

create table public.trip_member_days (
  id              uuid primary key default gen_random_uuid(),
  trip_member_id  uuid not null references public.trip_members(id) on delete cascade,
  date            date not null,
  status          trip_member_day_status not null default 'going',
  idempotency_key uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.trip_member_days is
  'Per-day attendance for each trip member. Auto-seeded from RSVP=going via trigger.';

create unique index trip_member_days_one_per_day
  on public.trip_member_days(trip_member_id, date);

create unique index trip_member_days_idempotency
  on public.trip_member_days(trip_member_id, idempotency_key)
  where idempotency_key is not null;

create trigger trip_member_days_touch_updated_at
  before update on public.trip_member_days
  for each row execute function public.touch_updated_at();

-- Auto-seed: when a member goes from non-going → going (or is inserted as
-- going), populate trip_member_days for the full [starts_at, ends_at]
-- range. ON CONFLICT DO NOTHING preserves any per-day overrides already
-- stored.
create or replace function public.seed_trip_member_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts date;
  v_ends   date;
begin
  if new.rsvp_status <> 'going' then
    return new;
  end if;

  -- Only seed on first set-to-going (insert) or transition (update).
  if tg_op = 'UPDATE' and old.rsvp_status = 'going' then
    return new;
  end if;

  select starts_at, ends_at into v_starts, v_ends
  from public.trips
  where id = new.trip_id;

  if v_starts is null or v_ends is null then
    return new; -- no date range yet — nothing to seed.
  end if;

  insert into public.trip_member_days (trip_member_id, date, status)
  select new.id, d::date, 'going'
  from generate_series(v_starts, v_ends, interval '1 day') as d
  on conflict (trip_member_id, date) do nothing;

  return new;
end;
$$;

comment on function public.seed_trip_member_days() is
  'AFTER INSERT/UPDATE trigger on trip_members. When rsvp_status becomes going, seeds trip_member_days rows for the trip''s date range.';

create trigger trip_members_seed_days_insert
  after insert on public.trip_members
  for each row execute function public.seed_trip_member_days();

create trigger trip_members_seed_days_update
  after update of rsvp_status on public.trip_members
  for each row execute function public.seed_trip_member_days();

-- Date-change re-seed: organizer often creates a trip without dates,
-- collects RSVPs first, THEN sets starts_at/ends_at. The trigger above
-- only fires on rsvp_status change, so without this we'd seed nothing.
-- On any date change (NULL→date or date→date), fan out trip_member_days
-- rows for every going member across the new range. on conflict makes
-- the trigger idempotent; we do NOT delete rows outside the new range
-- so existing attendance choices survive a date shuffle.
create or replace function public.seed_trip_member_days_for_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.starts_at is not null and new.ends_at is not null then
    insert into public.trip_member_days (trip_member_id, date, status)
    select tm.id, d.date::date, 'going'::trip_member_day_status
    from public.trip_members tm
    cross join generate_series(new.starts_at::timestamp, new.ends_at::timestamp, interval '1 day') as d(date)
    where tm.trip_id = new.id and tm.rsvp_status = 'going'
    on conflict (trip_member_id, date) do nothing;
  end if;
  return new;
end;
$$;

comment on function public.seed_trip_member_days_for_trip() is
  'AFTER UPDATE OF starts_at, ends_at on trips. Fans out trip_member_days for every going member across the new range. Idempotent via on conflict; does not delete rows outside the new range.';

create trigger trips_seed_member_days_on_date_change
  after update of starts_at, ends_at on public.trips
  for each row execute function public.seed_trip_member_days_for_trip();

-- =============================================================
-- 11. FK retargeting: availability + expense_splits (issue #66)
-- =============================================================
-- We retarget identity-of-member columns from auth.users(id) → trip_members(id).
-- Author columns (announcements.author_id, expenses.payer_id,
-- itinerary_items.created_by) remain on auth.users — they record who
-- *acted*, not who is on the trip.
--
-- No production data → drop columns directly, no backfill needed.
-- Drop the existing user_id-referencing policies first; they get
-- re-created against trip_member_id in section 14.

drop policy if exists "members can read availability"          on public.availability;
drop policy if exists "users can write their own availability" on public.availability;
drop policy if exists "members can read expense splits"        on public.expense_splits;
drop policy if exists "members can write splits for expenses they own" on public.expense_splits;

-- availability: PK was (trip_id, user_id, date)
alter table public.availability
  drop constraint availability_pkey;

alter table public.availability
  drop column user_id,
  drop column trip_id;

alter table public.availability
  add column trip_member_id uuid not null references public.trip_members(id) on delete cascade;

alter table public.availability
  add primary key (trip_member_id, date);

comment on column public.availability.trip_member_id is
  'FK to trip_members.id. RLS uses is_trip_member_by_member_id.';

-- expense_splits: PK was (expense_id, user_id)
alter table public.expense_splits
  drop constraint expense_splits_pkey;

alter table public.expense_splits
  drop column user_id;

alter table public.expense_splits
  add column trip_member_id uuid not null references public.trip_members(id) on delete cascade;

alter table public.expense_splits
  add primary key (expense_id, trip_member_id);

comment on column public.expense_splits.trip_member_id is
  'FK to trip_members.id. RLS goes through expenses.trip_id.';

-- Supporting indexes for new FKs (every FK should have one).
create index availability_trip_member_idx on public.availability(trip_member_id);
create index expense_splits_trip_member_idx on public.expense_splits(trip_member_id);

-- =============================================================
-- 12. Currency on money fields (issue #25)
-- =============================================================
alter table public.expenses
  add column currency char(3) not null default 'USD';

alter table public.expense_splits
  add column currency char(3) not null default 'USD';

alter table public.itinerary_items
  add column currency char(3) not null default 'USD';

comment on column public.expenses.currency is
  'ISO 4217 currency code. Defaults USD; convention is every money column ships with a sibling currency.';
comment on column public.expense_splits.currency is
  'Mirrors expenses.currency; ships per-row so we can mix currencies later.';
comment on column public.itinerary_items.currency is
  'ISO 4217 currency code for cost_cents.';

-- =============================================================
-- 13. Idempotency keys on mutation-heavy tables (issue #24)
-- =============================================================
alter table public.announcements
  add column idempotency_key uuid;

create unique index announcements_idempotency
  on public.announcements(trip_id, idempotency_key)
  where idempotency_key is not null;

alter table public.expenses
  add column idempotency_key uuid;

create unique index expenses_idempotency
  on public.expenses(trip_id, idempotency_key)
  where idempotency_key is not null;

alter table public.availability
  add column idempotency_key uuid;

create unique index availability_idempotency
  on public.availability(trip_member_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.announcements.idempotency_key is
  'Client-generated UUID. Scope (trip_id, idempotency_key) because organizers may post on behalf of others.';
comment on column public.expenses.idempotency_key is
  'Client-generated UUID. Scope (trip_id, idempotency_key) — same reason as announcements.';
comment on column public.availability.idempotency_key is
  'Client-generated UUID. Scope (trip_member_id, idempotency_key) — availability is strictly user-scoped.';

-- =============================================================
-- 14. RLS rewrite — drop all touched policies + recreate against helpers
-- =============================================================
-- Drop every policy on every table we touched, then recreate so no stale
-- policy references a dropped column (e.g. availability.user_id) or
-- misses the soft-delete filter.

-- ---- trips ----------------------------------------------------
drop policy if exists "members can read their trips"        on public.trips;
drop policy if exists "anyone authenticated can create a trip" on public.trips;
drop policy if exists "organizers can update their trips"   on public.trips;
drop policy if exists "organizers can delete their trips"   on public.trips;

alter table public.trips enable row level security;

create policy "members can read their trips"
  on public.trips for select
  to authenticated
  using (
    public.is_trip_member(id)
    and deleted_at is null
  );

create policy "anyone authenticated can create a trip"
  on public.trips for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "organizers can update their trips"
  on public.trips for update
  to authenticated
  using (public.is_trip_organizer(id))
  with check (public.is_trip_organizer(id));

create policy "organizers can delete their trips"
  on public.trips for delete
  to authenticated
  using (public.is_trip_organizer(id));

-- ---- trip_members --------------------------------------------
drop policy if exists "members can see other members of their trips" on public.trip_members;
drop policy if exists "users can add themselves to a trip"           on public.trip_members;
drop policy if exists "users can update their own RSVP"              on public.trip_members;
drop policy if exists "organizers can remove members"                on public.trip_members;

alter table public.trip_members enable row level security;

create policy "members can see other members of their trips"
  on public.trip_members for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- Self-add still allowed (invite-accept path). Organizer-added accountless
-- attendees go through a SECURITY DEFINER server function and don't hit RLS.
create policy "users can add themselves to a trip"
  on public.trip_members for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own RSVP"
  on public.trip_members for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "organizers can update any trip member"
  on public.trip_members for update
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

create policy "organizers can remove members"
  on public.trip_members for delete
  to authenticated
  using (public.is_trip_organizer(trip_id) or auth.uid() = user_id);

-- ---- invites --------------------------------------------------
-- Policies are unchanged but re-enable RLS defensively.
alter table public.invites enable row level security;

-- ---- availability --------------------------------------------
drop policy if exists "members can read availability"        on public.availability;
drop policy if exists "users can write their own availability" on public.availability;

alter table public.availability enable row level security;

create policy "members can read availability"
  on public.availability for select
  to authenticated
  using (public.is_trip_member_by_member_id(trip_member_id));

create policy "members write own availability"
  on public.availability for all
  to authenticated
  using (
    public.is_trip_member_by_member_id(trip_member_id)
    and exists (
      select 1 from public.trip_members tm
      where tm.id = trip_member_id and tm.user_id = auth.uid()
    )
  )
  with check (
    public.is_trip_member_by_member_id(trip_member_id)
    and exists (
      select 1 from public.trip_members tm
      where tm.id = trip_member_id and tm.user_id = auth.uid()
    )
  );

-- ---- announcements ------------------------------------------
drop policy if exists "members can read announcements"     on public.announcements;
drop policy if exists "organizers can write announcements" on public.announcements;
drop policy if exists "organizers can update announcements" on public.announcements;
drop policy if exists "organizers can delete announcements" on public.announcements;

alter table public.announcements enable row level security;

create policy "members can read announcements"
  on public.announcements for select
  to authenticated
  using (public.can_see_content(trip_id, visibility));

create policy "organizers can write announcements"
  on public.announcements for insert
  to authenticated
  with check (public.is_trip_organizer(trip_id) and auth.uid() = author_id);

create policy "organizers can update announcements"
  on public.announcements for update
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

create policy "organizers can delete announcements"
  on public.announcements for delete
  to authenticated
  using (public.is_trip_organizer(trip_id));

-- ---- itinerary_items ----------------------------------------
drop policy if exists "members can read itinerary"  on public.itinerary_items;
drop policy if exists "organizers can write itinerary" on public.itinerary_items;

alter table public.itinerary_items enable row level security;

create policy "members can read itinerary"
  on public.itinerary_items for select
  to authenticated
  using (public.can_see_content(trip_id, visibility));

create policy "organizers can write itinerary"
  on public.itinerary_items for all
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

-- ---- expenses + expense_splits ------------------------------
drop policy if exists "members can read expenses"             on public.expenses;
drop policy if exists "members can write expenses they pay"   on public.expenses;
drop policy if exists "members can read expense splits"       on public.expense_splits;
drop policy if exists "members can write splits for expenses they own" on public.expense_splits;

alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;

create policy "members can read expenses"
  on public.expenses for select
  to authenticated
  using (public.can_see_content(trip_id, visibility));

create policy "members can write expenses they pay"
  on public.expenses for insert
  to authenticated
  with check (public.is_trip_member(trip_id) and auth.uid() = payer_id);

create policy "members can read expense splits"
  on public.expense_splits for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_member(e.trip_id)
    )
  );

create policy "payers can write splits for their expenses"
  on public.expense_splits for all
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and e.payer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and e.payer_id = auth.uid()
    )
  );

-- ---- trip_member_days ---------------------------------------
alter table public.trip_member_days enable row level security;

-- SELECT: any member of the trip can read ALL trip_member_days rows for
-- that trip (so attendees can see who's around on which day, build a
-- "Thursday roster" view, etc.). Writes are still owner/organizer-only.
drop policy if exists "members read own days; organizers read all" on public.trip_member_days;

create policy "members can read days for their trips"
  on public.trip_member_days for select
  to authenticated
  using (
    public.is_trip_member(
      (select tm.trip_id from public.trip_members tm where tm.id = trip_member_id)
    )
  );

-- INSERT/UPDATE/DELETE: owning member writes their own row; organizer
-- can write any row in the same trip.
create policy "members write own days"
  on public.trip_member_days for all
  to authenticated
  using (public.is_trip_member_by_member_id(trip_member_id)
         and exists (
           select 1 from public.trip_members tm
           where tm.id = trip_member_id and tm.user_id = auth.uid()
         ))
  with check (public.is_trip_member_by_member_id(trip_member_id)
              and exists (
                select 1 from public.trip_members tm
                where tm.id = trip_member_id and tm.user_id = auth.uid()
              ));

create policy "organizers write any days for their trip"
  on public.trip_member_days for all
  to authenticated
  using (
    public.is_trip_organizer(
      (select tm.trip_id from public.trip_members tm where tm.id = trip_member_id)
    )
  )
  with check (
    public.is_trip_organizer(
      (select tm.trip_id from public.trip_members tm where tm.id = trip_member_id)
    )
  );

-- =============================================================
-- End of 20260519123255_m1_foundation.sql
-- =============================================================
