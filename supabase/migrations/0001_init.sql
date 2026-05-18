-- =============================================================
-- 0001_init.sql
-- Initial schema for the trip planner app.
-- Multi-tenant from day one: every user-scoped table joins to
-- `trips` via `trip_id`, and access is gated by RLS policies
-- that check membership in `trip_members`.
-- =============================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================
-- profiles: 1:1 with auth.users, holds public-ish user data
-- =============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- trips
-- =============================================================
create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  location    text,
  starts_at   date,
  ends_at     date,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================
-- trip_members: who belongs to a trip, and in what role
-- =============================================================
create type trip_role as enum ('organizer', 'attendee');
create type rsvp_status as enum ('pending', 'going', 'maybe', 'declined');

create table public.trip_members (
  trip_id     uuid not null references public.trips(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        trip_role not null default 'attendee',
  rsvp_status rsvp_status not null default 'pending',
  joined_at   timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user_idx on public.trip_members(user_id);

-- =============================================================
-- invites: shareable links to join a trip
-- =============================================================
create table public.invites (
  token      uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz,
  uses_left  int, -- null = unlimited
  created_at timestamptz not null default now()
);

create index invites_trip_idx on public.invites(trip_id);

-- =============================================================
-- Helper function: is the current user a member of this trip?
-- Marked stable + security definer so it can be used inside RLS
-- policies efficiently and without recursion.
-- =============================================================
create or replace function public.is_trip_member(p_trip_id uuid)
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
  );
$$;

create or replace function public.is_trip_organizer(p_trip_id uuid)
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
      and role = 'organizer'
  );
$$;

-- =============================================================
-- RLS for trips, trip_members, invites
-- =============================================================
alter table public.trips         enable row level security;
alter table public.trip_members  enable row level security;
alter table public.invites       enable row level security;

-- TRIPS
create policy "members can read their trips"
  on public.trips for select
  to authenticated
  using (public.is_trip_member(id));

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

-- TRIP_MEMBERS
create policy "members can see other members of their trips"
  on public.trip_members for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- A user can add themselves to a trip (e.g. via invite acceptance).
-- Adding *other* people is done via SECURITY DEFINER server functions.
create policy "users can add themselves to a trip"
  on public.trip_members for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own RSVP"
  on public.trip_members for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "organizers can remove members"
  on public.trip_members for delete
  to authenticated
  using (public.is_trip_organizer(trip_id) or auth.uid() = user_id);

-- INVITES
create policy "members can see invites for their trips"
  on public.invites for select
  to authenticated
  using (public.is_trip_member(trip_id));

create policy "organizers can create invites"
  on public.invites for insert
  to authenticated
  with check (public.is_trip_organizer(trip_id) and auth.uid() = created_by);

create policy "organizers can delete invites"
  on public.invites for delete
  to authenticated
  using (public.is_trip_organizer(trip_id));

-- =============================================================
-- Feature tables (created here so RLS pattern is established,
-- even if UI for them comes in later goals)
-- =============================================================

create table public.availability (
  trip_id  uuid not null references public.trips(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  date     date not null,
  status   text not null check (status in ('yes', 'no', 'maybe')),
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id, date)
);

alter table public.availability enable row level security;

create policy "members can read availability"
  on public.availability for select
  to authenticated
  using (public.is_trip_member(trip_id));

create policy "users can write their own availability"
  on public.availability for all
  to authenticated
  using (auth.uid() = user_id and public.is_trip_member(trip_id))
  with check (auth.uid() = user_id and public.is_trip_member(trip_id));

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  author_id  uuid not null references auth.users(id),
  body       text not null,
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

create index announcements_trip_idx on public.announcements(trip_id, created_at desc);

alter table public.announcements enable row level security;

create policy "members can read announcements"
  on public.announcements for select
  to authenticated
  using (public.is_trip_member(trip_id));

create policy "organizers can write announcements"
  on public.announcements for insert
  to authenticated
  with check (public.is_trip_organizer(trip_id) and auth.uid() = author_id);

create policy "organizers can update announcements"
  on public.announcements for update
  to authenticated
  using (public.is_trip_organizer(trip_id));

create policy "organizers can delete announcements"
  on public.announcements for delete
  to authenticated
  using (public.is_trip_organizer(trip_id));

create table public.itinerary_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  day        date not null,
  start_time time,
  end_time   time,
  title      text not null,
  location   text,
  address    text,
  notes      text,
  cost_cents int,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index itinerary_trip_day_idx on public.itinerary_items(trip_id, day, start_time);

alter table public.itinerary_items enable row level security;

create policy "members can read itinerary"
  on public.itinerary_items for select
  to authenticated
  using (public.is_trip_member(trip_id));

create policy "organizers can write itinerary"
  on public.itinerary_items for all
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  payer_id    uuid not null references auth.users(id),
  amount_cents int not null check (amount_cents > 0),
  description text not null,
  occurred_on date not null default current_date,
  created_at  timestamptz not null default now()
);

create table public.expense_splits (
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount_cents int not null,
  primary key (expense_id, user_id)
);

alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;

create policy "members can read expenses"
  on public.expenses for select
  to authenticated
  using (public.is_trip_member(trip_id));

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

create policy "members can write splits for expenses they own"
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

-- =============================================================
-- updated_at triggers (apply where useful)
-- =============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_updated_at();

create trigger itinerary_touch_updated_at
  before update on public.itinerary_items
  for each row execute function public.touch_updated_at();
