-- =============================================================
-- supabase/tests/itinerary_member_write_rls.test.sql
--
-- Adversarial RLS harness for "any trip member can add/edit/delete their
-- own plan" (migration 20260814030000_itinerary_member_write.sql).
-- Proves the three additive policies widen exactly what they should and
-- nothing more: a plain member can insert an `everyone` item attributed
-- to themselves but cannot forge a hidden visibility or another user's
-- attribution; a member can update/delete only their OWN item and cannot
-- escalate visibility on update; the "itinerary: members update own"
-- with-check carries the is_trip_member(trip_id) tenant pin (CASE 10 —
-- see its comment for why this is a policy-definition check rather than
-- an end-to-end mutation test, plus CASE 11's documented residual scope
-- note); the organizer path (any-visibility insert, update/delete ANY
-- row) is untouched; a non-member of the trip is denied outright. Run
-- against a LIVE local Postgres — this is a local gate, not a CI gate
-- (mirrors travel_legs_organizer_delete_rls.test.sql).
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/itinerary_member_write_rls.test.sql
--
-- Expect: prints "ALL 10 ITINERARY MEMBER-WRITE RLS CASES PASSED (+1
-- informational)" and exits 0. Any FAILED case raises an exception,
-- which under -v ON_ERROR_STOP=1 aborts the script with a non-zero exit
-- code. CASE 11 is informational only (documents a known, narrower,
-- out-of-scope residual — see its comment) and never raises.
--
-- Impersonation mechanism: identical to travel_legs_organizer_delete_rls.
-- test.sql — `request.jwt.claims` JSON blob (sub + role) plus `set local
-- role authenticated` so grants (not just RLS) are evaluated as
-- `authenticated`, not `postgres` (BYPASSRLS).
--
-- Everything runs inside one transaction and is rolled back at the end
-- — the DB is left clean.
-- =============================================================

begin;

-- ---- fixture data (seeded as postgres/owner; bypasses RLS) ----

insert into auth.users (id, email) values
  ('81111111-1111-1111-1111-111111111111', 'im-organizer-o@test.local'),  -- organizer O, trip A
  ('82222222-2222-2222-2222-222222222222', 'im-member-m@test.local'),     -- plain member M, trip A
  ('83333333-3333-3333-3333-333333333333', 'im-member-n@test.local'),     -- plain member N, trip A
  ('84444444-4444-4444-4444-444444444444', 'im-nonmember-x@test.local');  -- NOT a member of trip A

insert into public.trips (id, slug, name, created_by) values
  ('cccccccc-0000-0000-0000-0000000000e1', 'rls-im-trip-a', 'RLS Itinerary-Member Trip A', '81111111-1111-1111-1111-111111111111'),
  -- Trip B: exists so a cross-tenant trip_id reassignment target is real
  -- (not just a dangling FK), but M is NOT a member of it (CASE 10).
  ('dddddddd-0000-0000-0000-0000000000e1', 'rls-im-trip-b', 'RLS Itinerary-Member Trip B', '81111111-1111-1111-1111-111111111111');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('f4000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000e1', '81111111-1111-1111-1111-111111111111', 'organizer', false),
  ('f4000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-0000000000e1', '82222222-2222-2222-2222-222222222222', 'attendee', false),
  ('f4000000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-0000000000e1', '83333333-3333-3333-3333-333333333333', 'attendee', false),
  ('f4000000-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-0000000000e1', '81111111-1111-1111-1111-111111111111', 'organizer', false);

-- =============================================================
-- CASE 1: plain member M CAN insert an `everyone` item attributed to
-- themselves.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '82222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with inserted as (
    insert into public.itinerary_items (id, trip_id, day, title, created_by, visibility)
    values ('f5000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000e1', '2026-09-01', 'M''s plan', '82222222-2222-2222-2222-222222222222', 'everyone')
    returning 1
  )
  select count(*) into affected from inserted;
  if affected <> 1 then
    raise exception 'CASE 1 FAILED: member M could not insert an everyone item attributed to themselves (affected=%)', affected;
  end if;
  raise notice 'CASE 1 PASSED: member M inserted an everyone item for themselves';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 2: plain member M CANNOT insert an `organizers_only` item, and
-- CANNOT insert a `hide_from_celebrant` item — the with-check's
-- visibility = 'everyone' clause denies both.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '82222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.itinerary_items (id, trip_id, day, title, created_by, visibility)
    values ('f5000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-0000000000e1', '2026-09-01', 'M''s hidden plan', '82222222-2222-2222-2222-222222222222', 'organizers_only');
  exception when insufficient_privilege then
    raised := true;
  end;
  if not raised then
    raise exception 'CASE 2a FAILED: member M inserted an organizers_only item';
  end if;
  raise notice 'CASE 2a PASSED: member M could not insert an organizers_only item';
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.itinerary_items (id, trip_id, day, title, created_by, visibility)
    values ('f5000000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-0000000000e1', '2026-09-01', 'M''s hidden plan 2', '82222222-2222-2222-2222-222222222222', 'hide_from_celebrant');
  exception when insufficient_privilege then
    raised := true;
  end;
  if not raised then
    raise exception 'CASE 2b FAILED: member M inserted a hide_from_celebrant item';
  end if;
  raise notice 'CASE 2b PASSED: member M could not insert a hide_from_celebrant item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: plain member M CANNOT insert an item attributed to ANOTHER
-- user (created_by != auth.uid()).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '82222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.itinerary_items (id, trip_id, day, title, created_by, visibility)
    values ('f5000000-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-0000000000e1', '2026-09-01', 'Forged plan', '83333333-3333-3333-3333-333333333333', 'everyone');
  exception when insufficient_privilege then
    raised := true;
  end;
  if not raised then
    raise exception 'CASE 3 FAILED: member M inserted an item forging N''s attribution';
  end if;
  raise notice 'CASE 3 PASSED: member M could not forge another member''s attribution';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 4: member M CAN update their OWN item (title change).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '82222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with updated as (
    update public.itinerary_items set title = 'M''s renamed plan'
    where id = 'f5000000-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into affected from updated;
  if affected <> 1 then
    raise exception 'CASE 4 FAILED: member M could not update their own item (affected=%)', affected;
  end if;
  raise notice 'CASE 4 PASSED: member M updated their own item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 5: member M CANNOT change their own item's visibility to
-- `organizers_only` — the with-check denies the whole update.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '82222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  raised boolean := false;
begin
  begin
    update public.itinerary_items set visibility = 'organizers_only'
    where id = 'f5000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then
    raised := true;
  end;
  if not raised then
    raise exception 'CASE 5 FAILED: member M escalated their own item''s visibility';
  end if;
  raise notice 'CASE 5 PASSED: member M could not escalate their own item''s visibility';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 6: member N (non-owner, non-organizer) CANNOT update M's item
-- (0 rows affected — no exception, just no match under RLS).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '83333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with updated as (
    update public.itinerary_items set title = 'N tries to rename M''s plan'
    where id = 'f5000000-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into affected from updated;
  if affected <> 0 then
    raise exception 'CASE 6 FAILED: member N updated M''s item (affected=%)', affected;
  end if;
  raise notice 'CASE 6 PASSED: member N''s update of M''s item affected 0 rows';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 7: member M CAN delete their OWN item; member N CANNOT delete
-- M's item (0 rows).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '83333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_items where id = 'f5000000-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 7a FAILED: member N deleted M''s item (affected=%)', affected;
  end if;
  raise notice 'CASE 7a PASSED: member N''s delete of M''s item affected 0 rows';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '82222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_items where id = 'f5000000-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 7b FAILED: member M could not delete their own item (affected=%)', affected;
  end if;
  raise notice 'CASE 7b PASSED: member M deleted their own item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 8 (regression): organizer O CAN still insert any-visibility
-- item, and update/delete ANY item — the organizer policies are
-- untouched by the additive member policies.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '81111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with inserted as (
    insert into public.itinerary_items (id, trip_id, day, title, created_by, visibility)
    values ('f5000000-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-0000000000e1', '2026-09-01', 'Organizer hidden plan', '81111111-1111-1111-1111-111111111111', 'hide_from_celebrant')
    returning 1
  )
  select count(*) into affected from inserted;
  if affected <> 1 then
    raise exception 'CASE 8a FAILED: organizer O could not insert a hide_from_celebrant item (affected=%)', affected;
  end if;
  raise notice 'CASE 8a PASSED: organizer O inserted a hide_from_celebrant item';
end $$;

-- Insert N's item (as postgres would in real life via a member action;
-- here inserted directly by organizer context is irrelevant — we just
-- need a row owned by N for O to update/delete as organizer).
do $$
declare
  affected int;
begin
  with updated as (
    update public.itinerary_items set title = 'Organizer renamed'
    where id = 'f5000000-0000-0000-0000-000000000005'
    returning 1
  )
  select count(*) into affected from updated;
  if affected <> 1 then
    raise exception 'CASE 8b FAILED: organizer O could not update their own item (affected=%)', affected;
  end if;
  raise notice 'CASE 8b PASSED: organizer O updated an item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Organizer updates/deletes an item owned by member N (not O) — proves
-- the organizer policy's "any row" reach is untouched.
insert into public.itinerary_items (id, trip_id, day, title, created_by, visibility) values
  ('f5000000-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-0000000000e1', '2026-09-01', 'N''s plan', '83333333-3333-3333-3333-333333333333', 'everyone');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '81111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with updated as (
    update public.itinerary_items set visibility = 'organizers_only'
    where id = 'f5000000-0000-0000-0000-000000000006'
    returning 1
  )
  select count(*) into affected from updated;
  if affected <> 1 then
    raise exception 'CASE 8c FAILED: organizer O could not update N''s item to organizers_only (affected=%)', affected;
  end if;
  raise notice 'CASE 8c PASSED: organizer O updated N''s item, incl. visibility escalation';
end $$;

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_items where id = 'f5000000-0000-0000-0000-000000000006'
    returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 8d FAILED: organizer O could not delete N''s item (affected=%)', affected;
  end if;
  raise notice 'CASE 8d PASSED: organizer O deleted N''s item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 9: non-member X CANNOT insert into trip A.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '84444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.itinerary_items (id, trip_id, day, title, created_by, visibility)
    values ('f5000000-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-0000000000e1', '2026-09-01', 'Non-member plan', '84444444-4444-4444-4444-444444444444', 'everyone');
  exception when insufficient_privilege then
    raised := true;
  end;
  if not raised then
    raise exception 'CASE 9 FAILED: non-member X inserted into trip A';
  end if;
  raise notice 'CASE 9 PASSED: non-member X could not insert into trip A';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 10 (cross-tenant hole — definitional check): the with-check for
-- "itinerary: members update own" must literally include
-- is_trip_member(trip_id).
--
-- IMPORTANT — why this is a definitional (pg_policy introspection) check
-- rather than an end-to-end row-mutation assertion: verified by hand
-- (docker exec probing, see PR discussion) that "member M, who is NOT a
-- member of trip B, UPDATEs their own item's trip_id to B" is ALREADY
-- denied even WITHOUT the is_trip_member(trip_id) with-check clause —
-- because Postgres's UPDATE processing additionally requires the NEW row
-- to pass the table's SELECT policy ("itinerary: members read via
-- visibility", using can_see_content()), and can_see_content() requires
-- is_trip_member(trip_id) for EVERY visibility branch (including
-- 'everyone', the only value a member's row can have). That SELECT-gate
-- interaction is real and does independently block the exact "move to a
-- trip I'm not in at all" exploit — an end-to-end test of that scenario
-- passes with or without this with-check clause and therefore CANNOT
-- distinguish fixed from unfixed. Hence: check the policy definition
-- directly, which does flip red→green with the fix, and is honest about
-- what it's proving. The clause is still correct and worth keeping —
-- explicit tenant-scoping in WITH CHECK per the insert-policy convention
-- (CLAUDE.md rule #6), not reliance on an incidental cross-policy
-- interaction that a future can_see_content() change could quietly
-- remove.
-- =============================================================
do $$
declare
  update_own_with_check text;
begin
  select pg_get_expr(polwithcheck, polrelid) into update_own_with_check
  from pg_policy
  where polname = 'itinerary: members update own'
    and polrelid = 'public.itinerary_items'::regclass;

  if update_own_with_check is null then
    raise exception 'CASE 10 FAILED: policy "itinerary: members update own" not found';
  end if;
  if update_own_with_check not ilike '%is_trip_member%' then
    raise exception 'CASE 10 FAILED: "itinerary: members update own" with-check is missing the is_trip_member(trip_id) tenant pin (with_check=%)', update_own_with_check;
  end if;
  raise notice 'CASE 10 PASSED: "itinerary: members update own" with-check includes is_trip_member(trip_id) (with_check=%)', update_own_with_check;
end $$;

-- =============================================================
-- CASE 11 (documented residual, NOT a failure — informational only):
-- the is_trip_member(trip_id) pin checks membership in the NEW trip_id,
-- not that it equals the item's ORIGINAL trip_id. A member who belongs
-- to BOTH trip A (where the item lives) and trip B can still move their
-- own item from A into B — is_trip_member(B) is true for them, so the
-- with-check (and the SELECT-gate) both allow it. This is a narrower,
-- lower-severity issue than the "arbitrary/non-member trip" hole this
-- migration closes (it can only ever move data between trips the actor
-- already legitimately belongs to — never exfiltrate into a stranger's
-- trip) and is out of scope for this fix; recorded here so it isn't
-- mistaken for coverage this migration doesn't claim. Asserted as
-- current documented behavior (raises no exception either way) rather
-- than silently unverified.
-- =============================================================
do $$
declare
  member_of_b_id uuid := '85555555-5555-5555-5555-555555555555';
begin
  insert into auth.users (id, email) values
    (member_of_b_id, 'im-member-m-tripb@test.local');
  insert into public.trips (id, slug, name, created_by) values
    ('eeeeeeee-0000-0000-0000-0000000000e1', 'rls-im-trip-b-multimember', 'RLS Itinerary-Member Trip B (multi-member)', '81111111-1111-1111-1111-111111111111');
  -- M (member of trip A already, from the fixture data above) is ALSO
  -- made a member of this new trip.
  insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
    ('f4000000-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-0000000000e1', '82222222-2222-2222-2222-222222222222', 'attendee', false);
  insert into public.itinerary_items (id, trip_id, day, title, created_by, visibility) values
    ('f5000000-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-0000000000e1', '2026-09-01', 'M''s plan (multi-member target)', '82222222-2222-2222-2222-222222222222', 'everyone');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '82222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with updated as (
    update public.itinerary_items
    set trip_id = 'eeeeeeee-0000-0000-0000-0000000000e1'
    where id = 'f5000000-0000-0000-0000-000000000009'
    returning 1
  )
  select count(*) into affected from updated;
  raise notice 'CASE 11 INFO: member M (member of both trips) moving their own item between them — affected=% (documented residual, not asserted as fixed by this migration)', affected;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 10 ITINERARY MEMBER-WRITE RLS CASES PASSED (+1 informational)' as result;

rollback;
