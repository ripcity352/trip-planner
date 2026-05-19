-- =============================================================
-- 20260519191413_m2_trips_and_invites.sql
-- M2 — Trip creation + invite flow (closes #72, #73).
--
-- Depends on:
--   * 20260519191412_m2_trip_role_co_organizer.sql for the
--     `co_organizer` enum value (split out because Postgres can't use a
--     just-added enum value in the same transaction — SQLSTATE 55P04).
--
-- Adds:
--   1. `is_trip_organizer()` updated to include `co_organizer`
--   2. `idempotency_key` on `trip_members` + partial unique index
--   3. `accept_invite(p_token, p_idempotency_key)` SECURITY DEFINER fn
--   4. `invite_preview(p_token)` SECURITY DEFINER STABLE fn — bucketed
--      attendee count to avoid enumeration oracles
--   5. `create_trip_with_organizer(...)` SECURITY DEFINER fn — atomic
--      trip insert + organizer membership insert in one transaction
--
-- RLS notes: this migration does NOT add new tables. Access control on
-- `trip_members` and `invites` is unchanged from M1; the new SECURITY
-- DEFINER functions are the *only* writers that bypass RLS (atomically
-- inserting an organizer membership at trip creation; the accept-invite
-- path needs to read invites that the caller can't SELECT under M1's
-- "organizers only" policy).
-- =============================================================

-- =============================================================
-- 1. Update is_trip_organizer() to include co_organizer
-- =============================================================
-- Roles add micro-affordances, not gates — but the actual access-control
-- gate widens to include co-organizers in M2.
create or replace function public.is_trip_organizer(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.role in ('organizer', 'co_organizer')
  );
$$;

comment on function public.is_trip_organizer(uuid) is
  'True if auth.uid() is an organizer or co-organizer for the given trip. Used by every organizer-gated RLS policy.';

-- =============================================================
-- 2. Idempotency key on trip_members
-- =============================================================
-- Drunk-user-on-bad-signal double-tap on the accept-invite path: the
-- partial unique guarantees two replays with the same key resolve to
-- the same row, never a duplicate insert. Scope is per-trip — the row
-- doesn't exist yet on the first call so a (trip_member_id,
-- idempotency_key) scope would be unenforceable here.
alter table public.trip_members
  add column if not exists idempotency_key uuid;

create unique index if not exists trip_members_idempotency_key
  on public.trip_members (trip_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.trip_members.idempotency_key is
  'Client-generated UUID for accept_invite replay safety. Scope (trip_id, idempotency_key) — partial unique only when set.';

-- =============================================================
-- 3. accept_invite SECURITY DEFINER function
-- =============================================================
-- Atomic accept-invite path. RLS prevents anon callers from reading
-- `invites` directly, so we go through this function (security definer)
-- to look up the token. The row lock serializes concurrent accepts so
-- two callers can't both win the last `uses_left`.
create or replace function public.accept_invite(
  p_token uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite record;
  v_existing_member_id uuid;
  v_new_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  -- Lock the invite row to serialize concurrent accepts.
  select * into v_invite
  from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  if v_invite.uses_left is not null and v_invite.uses_left <= 0 then
    raise exception 'invite_exhausted' using errcode = 'P0001';
  end if;

  -- Idempotency: same (trip, key) returns the existing row without
  -- inserting again or decrementing uses_left.
  select id into v_existing_member_id
  from public.trip_members
  where trip_id = v_invite.trip_id
    and idempotency_key = p_idempotency_key;

  if v_existing_member_id is not null then
    return v_existing_member_id;
  end if;

  -- Re-claim path: caller is already a member (perhaps via a different
  -- code path) — return their existing row, don't double-insert.
  select id into v_existing_member_id
  from public.trip_members
  where trip_id = v_invite.trip_id
    and user_id = v_user_id;

  if v_existing_member_id is not null then
    return v_existing_member_id;
  end if;

  insert into public.trip_members (
    trip_id, user_id, role, idempotency_key, rsvp_status
  )
  values (
    v_invite.trip_id, v_user_id, 'attendee', p_idempotency_key, 'pending'
  )
  returning id into v_new_member_id;

  if v_invite.uses_left is not null then
    update public.invites
    set uses_left = uses_left - 1
    where token = p_token;
  end if;

  return v_new_member_id;
end;
$$;

comment on function public.accept_invite(uuid, uuid) is
  'Idempotent accept-invite. Returns trip_members.id. Errors: invite_not_found (P0002), invite_expired / invite_exhausted (P0001).';

grant execute on function public.accept_invite(uuid, uuid) to authenticated;

-- =============================================================
-- 4. invite_preview SECURITY DEFINER STABLE function
-- =============================================================
-- Logged-out-safe preview. Returns no rows for any invite that is
-- expired, exhausted, or attached to a deleted trip. `attendee_count`
-- is BUCKETED — exposing the raw integer turns a single-use invite into
-- an enumeration oracle ("each forward increments the count by 1, I
-- can map the recipients").
create or replace function public.invite_preview(p_token uuid)
returns table(
  trip_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  host_display_name text,
  attendee_count_bucket text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_invite record;
begin
  select
    i.trip_id     as trip_id,
    i.created_by  as created_by,
    t.name        as trip_name,
    t.starts_at   as trip_starts_at,
    t.ends_at     as trip_ends_at
  into v_invite
  from public.invites i
  join public.trips t on t.id = i.trip_id
  where i.token = p_token
    and (i.expires_at is null or i.expires_at > now())
    and (i.uses_left is null or i.uses_left > 0)
    and t.deleted_at is null;

  if not found then
    return;
  end if;

  return query
  select
    v_invite.trip_name::text,
    -- trips.starts_at / ends_at are `date` columns from 0001_init.sql;
    -- cast to timestamptz at midnight UTC so the function signature can
    -- stay aligned with feature tables that ship `timestamptz` natively.
    (v_invite.trip_starts_at::timestamptz) as starts_at,
    (v_invite.trip_ends_at::timestamptz)   as ends_at,
    coalesce(
      (
        select tm.display_name
        from public.trip_members tm
        where tm.trip_id = v_invite.trip_id
          and tm.user_id = v_invite.created_by
        limit 1
      ),
      (
        select p.display_name
        from public.profiles p
        where p.id = v_invite.created_by
      ),
      'a friend'
    )::text as host_display_name,
    case
      when ac.cnt <= 1  then 'just-getting-started'
      when ac.cnt <= 5  then 'small-crew'
      when ac.cnt <= 15 then 'full-house'
      else                   'big-group'
    end::text as attendee_count_bucket
  from (
    select count(*)::int as cnt
    from public.trip_members
    where trip_id = v_invite.trip_id
  ) ac;
end;
$$;

comment on function public.invite_preview(uuid) is
  'Logged-out-safe invite preview. Bucketed attendee count to prevent enumeration. NULL/empty if expired, exhausted, or trip soft-deleted.';

grant execute on function public.invite_preview(uuid) to anon, authenticated;

-- =============================================================
-- 5. create_trip_with_organizer SECURITY DEFINER function
-- =============================================================
-- Atomically inserts the trip + organizer membership. Two separate
-- INSERTs from app code would leave a window where a trip exists with
-- no organizer (and therefore no member can see it under RLS). One
-- function + one transaction closes that window. Creator is `organizer`,
-- NOT `celebrant` — per M2 DoD the celebrant flag is set in a later step.
create or replace function public.create_trip_with_organizer(
  p_slug text,
  p_name text,
  p_description text,
  p_location text,
  p_starts_at date,
  p_ends_at date,
  p_vibe_tags text[]
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip public.trips;
begin
  if v_user_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  insert into public.trips (
    slug, name, description, location, starts_at, ends_at,
    vibe_tags, created_by, kind
  )
  values (
    p_slug, p_name, p_description, p_location, p_starts_at, p_ends_at,
    coalesce(p_vibe_tags, '{}'::text[]), v_user_id, 'bachelor'
  )
  returning * into v_trip;

  insert into public.trip_members (
    trip_id, user_id, role, rsvp_status, is_celebrant
  )
  values (
    v_trip.id, v_user_id, 'organizer', 'going', false
  );

  return v_trip;
end;
$$;

comment on function public.create_trip_with_organizer(text, text, text, text, date, date, text[]) is
  'Atomic trip creation + organizer membership. Creator is organizer (NOT celebrant). Returns the inserted trips row.';

grant execute on function public.create_trip_with_organizer(text, text, text, text, date, date, text[]) to authenticated;

-- =============================================================
-- End of 20260519191413_m2_trips_and_invites.sql
-- =============================================================
