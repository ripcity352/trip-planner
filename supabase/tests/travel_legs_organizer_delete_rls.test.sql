-- =============================================================
-- supabase/tests/travel_legs_organizer_delete_rls.test.sql
--
-- Adversarial RLS harness for #615 — the new "travel legs: organizer
-- delete" policy (migration 20260814010500_travel_legs_organizer_delete.sql).
-- Proves the additive policy widens exactly what it should and nothing
-- more: owner-delete still works, an organizer can delete another
-- member's leg, a plain non-owner member is still denied, and an
-- organizer of a DIFFERENT trip cannot reach into this trip
-- (is_trip_organizer is trip-scoped). Run against a LIVE local Postgres
-- — this is a local gate, not a CI gate (mirrors shopping_list_rls.test.sql).
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/travel_legs_organizer_delete_rls.test.sql
--
-- Expect: prints "ALL 4 TRAVEL LEGS ORGANIZER-DELETE RLS CASES PASSED"
-- and exits 0. Any FAILED case raises an exception, which under
-- -v ON_ERROR_STOP=1 aborts the script with a non-zero exit code.
--
-- Impersonation mechanism: identical to shopping_list_rls.test.sql —
-- `request.jwt.claims` JSON blob (sub + role) plus `set local role
-- authenticated` so grants (not just RLS) are evaluated as
-- `authenticated`, not `postgres` (BYPASSRLS).
--
-- Everything runs inside one transaction and is rolled back at the end
-- — the DB is left clean.
-- =============================================================

begin;

-- ---- fixture data (seeded as postgres/owner; bypasses RLS) ----

insert into auth.users (id, email) values
  ('71111111-1111-1111-1111-111111111111', 'td-organizer-o@test.local'),   -- organizer O, trip A
  ('72222222-2222-2222-2222-222222222222', 'td-member-m@test.local'),      -- plain member M, trip A (owns a leg)
  ('73333333-3333-3333-3333-333333333333', 'td-member-n@test.local'),      -- plain member N, trip A (owns a leg, no organizer role)
  ('74444444-4444-4444-4444-444444444444', 'td-organizer-p@test.local');   -- organizer P, trip B ONLY (not a member of A)

insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'rls-td-trip-a', 'RLS Travel-Delete Trip A', '71111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-0000000000d1', 'rls-td-trip-b', 'RLS Travel-Delete Trip B', '74444444-4444-4444-4444-444444444444');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('f1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', '71111111-1111-1111-1111-111111111111', 'organizer', false),
  ('f1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000d1', '72222222-2222-2222-2222-222222222222', 'attendee', false),
  ('f1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000d1', '73333333-3333-3333-3333-333333333333', 'attendee', false),
  ('f2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000d1', '74444444-4444-4444-4444-444444444444', 'organizer', false);

-- Two legs in trip A, owned by M and N respectively.
insert into public.travel_legs (id, trip_id, trip_member_id, kind, direction) values
  ('f3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'f1000000-0000-0000-0000-000000000002', 'flight', 'inbound'),
  ('f3000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'f1000000-0000-0000-0000-000000000003', 'flight', 'inbound');

-- =============================================================
-- CASE 1: owner M CAN delete their own leg (unchanged behavior — the
-- existing "travel legs: owner delete" policy still holds untouched).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '72222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.travel_legs where id = 'f3000000-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 1 FAILED: owner M could not delete their own leg (affected=%)', affected;
  end if;
  raise notice 'CASE 1 PASSED: owner M deleted their own leg';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Restore the leg for the remaining cases.
insert into public.travel_legs (id, trip_id, trip_member_id, kind, direction) values
  ('f3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'f1000000-0000-0000-0000-000000000002', 'flight', 'inbound');

-- =============================================================
-- CASE 2: plain member N (non-owner, non-organizer) CANNOT delete M's
-- leg — the additive organizer policy must not widen non-organizer
-- access.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '73333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.travel_legs where id = 'f3000000-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 2 FAILED: plain member N deleted another member''s leg (affected=%)', affected;
  end if;
  raise notice 'CASE 2 PASSED: plain member N''s delete of M''s leg affected 0 rows';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: trip A organizer O (non-owner) CAN delete N's leg — the new
-- "travel legs: organizer delete" policy.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '71111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.travel_legs where id = 'f3000000-0000-0000-0000-000000000002'
    returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 3 FAILED: trip A organizer O could not delete N''s leg (affected=%)', affected;
  end if;
  raise notice 'CASE 3 PASSED: trip A organizer O deleted N''s leg';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Restore N's leg for the belt-and-suspenders case.
insert into public.travel_legs (id, trip_id, trip_member_id, kind, direction) values
  ('f3000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'f1000000-0000-0000-0000-000000000003', 'flight', 'inbound');

-- =============================================================
-- CASE 4 (belt-and-suspenders): organizer P of trip B CANNOT delete
-- trip A's leg — is_trip_organizer(trip_id) is trip-scoped, so P's
-- organizer role on B does not carry into A.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '74444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.travel_legs where id = 'f3000000-0000-0000-0000-000000000002'
    returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 4 FAILED: trip B organizer P deleted trip A''s leg (affected=%)', affected;
  end if;
  raise notice 'CASE 4 PASSED: trip B organizer P''s delete of trip A''s leg affected 0 rows';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 4 TRAVEL LEGS ORGANIZER-DELETE RLS CASES PASSED' as result;

rollback;
