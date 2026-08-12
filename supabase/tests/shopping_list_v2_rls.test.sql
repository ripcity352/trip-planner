-- =============================================================
-- supabase/tests/shopping_list_v2_rls.test.sql
--
-- Adversarial RLS + column-grant harness for the shopping-list v2
-- attribution columns (migration 20260812010000_shopping_list_v2.sql):
-- completed_by_trip_member_id, removed_by_trip_member_id, removed_at,
-- claim_assigned_by_trip_member_id. RLS itself is UNCHANGED by v2 — the
-- shipped shopping_list_items_update policy (can_see_content(trip_id,
-- visibility)) already gates every column; this harness proves the v2
-- COLUMN-SCOPED grant additivity + the existing row-visibility policy
-- both hold for the new columns, against a LIVE local Postgres.
--
-- SCOPE NOTE: same-trip TARGET validation for assign/complete (rejecting
-- a cross-trip trip_member_id written INTO an item you CAN otherwise
-- update — e.g. an organizer completing item X but naming a trip B
-- member as completed_by_trip_member_id) is deliberately ACTION-LAYER,
-- not RLS — the FK only constrains "some trip_members row", not "a
-- trip_members row in THIS item's trip". That is proven by the Task 4
-- action-layer tests, not here. This harness proves RLS's row/column
-- boundary only: which ROWS you can touch, and which COLUMNS on a row
-- you're allowed to touch.
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/shopping_list_v2_rls.test.sql
--
-- Expect: prints "ALL 4 V2 RLS CASES PASSED" and exits 0.
--
-- Impersonation mechanism matches supabase/tests/shopping_list_rls.test.sql
-- exactly: `request.jwt.claims` JSON blob (sub + role) plus
-- `set local role authenticated` so grants (not just RLS) are evaluated
-- as `authenticated`, not `postgres` (BYPASSRLS).
--
-- Everything runs inside one transaction and is rolled back at the end —
-- the DB is left clean.
-- =============================================================

begin;

-- ---- fixture data (seeded as postgres/owner; bypasses RLS) ----

insert into auth.users (id, email) values
  ('61111111-1111-1111-1111-111111111111', 'v2-organizer@test.local'),  -- organizer O, trip A
  ('62222222-2222-2222-2222-222222222222', 'v2-member-m@test.local'),   -- plain member M, trip A (creator)
  ('63333333-3333-3333-3333-333333333333', 'v2-celebrant-c@test.local'),-- celebrant C, trip A
  ('64444444-4444-4444-4444-444444444444', 'v2-member-b@test.local');   -- member of trip B ONLY (not in A)

insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'rls-v2-test-trip-a', 'RLS v2 Test Trip A', '61111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'rls-v2-test-trip-b', 'RLS v2 Test Trip B', '61111111-1111-1111-1111-111111111111');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', '61111111-1111-1111-1111-111111111111', 'organizer', false),
  ('e1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2', '62222222-2222-2222-2222-222222222222', 'attendee', false),
  ('e1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a2', '63333333-3333-3333-3333-333333333333', 'attendee', true),
  ('e2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b2', '64444444-4444-4444-4444-444444444444', 'attendee', false);

-- e3000000...0001: everyone-visibility item, created by M — used for the
-- immutable/mutable column-grant case (Case 1) and the cross-trip case (Case 2).
-- e3000000...0002: hide_from_celebrant item, ALREADY removed (removed_at set,
-- removed_by = organizer) — used for the un-remove/complete-while-hidden case
-- (Case 3) and the column-leak SELECT case (Case 4).
insert into public.shopping_list_items
  (id, trip_id, created_by_trip_member_id, name, visibility, removed_at, removed_by_trip_member_id)
values
  ('e3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-000000000002', 'Beer', 'everyone', null, null),
  ('e3000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-000000000002', 'Cake (surprise!)', 'hide_from_celebrant', '2026-08-01 00:00:00+00', 'e1000000-0000-0000-0000-000000000001');

-- =============================================================
-- CASE 1: immutable-column grant denies UPDATE; mutable v2 column succeeds.
-- Actor: member M — a trip A member who CAN see+update e3000000...0001
-- (passes can_see_content: 'everyone' visibility, same trip). Column
-- privileges are grant-enforced, independent of RLS row visibility —
-- tested here as `authenticated`, not `postgres`.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '62222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- 1a: trip_id (immutable, unchanged by v2) -> denied
do $$
begin
  begin
    update public.shopping_list_items set trip_id = 'bbbbbbbb-0000-0000-0000-0000000000b2' where id = 'e3000000-0000-0000-0000-000000000001';
    raise exception 'CASE 1a FAILED: member M was able to UPDATE trip_id';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%permission denied for column%' and sqlerrm not ilike '%permission denied for table%' then
        raise exception 'CASE 1a FAILED: got insufficient_privilege but wrong reason (got: %)', sqlerrm;
      end if;
      raise notice 'CASE 1a PASSED: trip_id UPDATE denied (%)', sqlerrm;
  end;
end $$;

-- 1b: created_by_trip_member_id (immutable) -> denied
do $$
begin
  begin
    update public.shopping_list_items set created_by_trip_member_id = 'e1000000-0000-0000-0000-000000000002' where id = 'e3000000-0000-0000-0000-000000000001';
    raise exception 'CASE 1b FAILED: member M was able to UPDATE created_by_trip_member_id';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%permission denied for column%' and sqlerrm not ilike '%permission denied for table%' then
        raise exception 'CASE 1b FAILED: got insufficient_privilege but wrong reason (got: %)', sqlerrm;
      end if;
      raise notice 'CASE 1b PASSED: created_by_trip_member_id UPDATE denied (%)', sqlerrm;
  end;
end $$;

-- 1c: visibility (immutable) -> denied
do $$
begin
  begin
    update public.shopping_list_items set visibility = 'organizers_only' where id = 'e3000000-0000-0000-0000-000000000001';
    raise exception 'CASE 1c FAILED: member M was able to UPDATE visibility';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%permission denied for column%' and sqlerrm not ilike '%permission denied for table%' then
        raise exception 'CASE 1c FAILED: got insufficient_privilege but wrong reason (got: %)', sqlerrm;
      end if;
      raise notice 'CASE 1c PASSED: visibility UPDATE denied (%)', sqlerrm;
  end;
end $$;

-- 1d: idempotency_key (immutable) -> denied
do $$
begin
  begin
    update public.shopping_list_items set idempotency_key = 'f0000000-0000-0000-0000-000000000001' where id = 'e3000000-0000-0000-0000-000000000001';
    raise exception 'CASE 1d FAILED: member M was able to UPDATE idempotency_key';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%permission denied for column%' and sqlerrm not ilike '%permission denied for table%' then
        raise exception 'CASE 1d FAILED: got insufficient_privilege but wrong reason (got: %)', sqlerrm;
      end if;
      raise notice 'CASE 1d PASSED: idempotency_key UPDATE denied (%)', sqlerrm;
  end;
end $$;

-- 1e: completed_by_trip_member_id (MUTABLE v2 column, in the extended grant)
-- -> SUCCEEDS, and the write is actually applied.
update public.shopping_list_items
  set completed_by_trip_member_id = 'e1000000-0000-0000-0000-000000000002'
  where id = 'e3000000-0000-0000-0000-000000000001';

do $$
declare
  r record;
begin
  select * into r from public.shopping_list_items where id = 'e3000000-0000-0000-0000-000000000001';
  if r.completed_by_trip_member_id is distinct from 'e1000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'CASE 1e FAILED: mutable v2 column completed_by_trip_member_id UPDATE did not apply (row: %)', r;
  end if;
  raise notice 'CASE 1e PASSED: mutable v2 column completed_by_trip_member_id UPDATE succeeded';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 2: member of trip B (not a member of trip A) cannot UPDATE any v2
-- column on trip A's item — RLS can_see_content() USING clause filters
-- the row out entirely (0 rows affected, no error, row unchanged).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '64444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with updated as (
    update public.shopping_list_items
      set completed_by_trip_member_id = 'e2000000-0000-0000-0000-000000000001',
          removed_at = now(),
          claimed_by_trip_member_id = 'e2000000-0000-0000-0000-000000000001',
          claim_assigned_by_trip_member_id = 'e2000000-0000-0000-0000-000000000001'
      where id = 'e3000000-0000-0000-0000-000000000001'
      returning 1
  )
  select count(*) into affected from updated;
  if affected <> 0 then
    raise exception 'CASE 2 FAILED: trip B member updated a trip A item (affected=%)', affected;
  end if;
  raise notice 'CASE 2 PASSED: trip B member''s UPDATE of trip A item affected 0 rows';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Verify the row is genuinely unchanged (checked as organizer O, who CAN see it).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '61111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  r record;
begin
  select * into r from public.shopping_list_items where id = 'e3000000-0000-0000-0000-000000000001';
  if r.completed_by_trip_member_id is distinct from 'e1000000-0000-0000-0000-000000000002'::uuid -- still Case 1e's write, not trip B member's
     or r.removed_at is not null
     or r.claimed_by_trip_member_id is not null
     or r.claim_assigned_by_trip_member_id is not null then
    raise exception 'CASE 2 FAILED: trip A item was mutated by trip B member''s no-op UPDATE (row: %)', r;
  end if;
  raise notice 'CASE 2 PASSED: trip A item row confirmed unchanged after trip B member''s denied UPDATE';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: celebrant C cannot un-remove / complete a hide_from_celebrant
-- item (e3000000...0002, already removed). Both SELECT and UPDATE are
-- filtered by can_see_content() -> 0 rows affected, no error.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '63333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with updated as (
    update public.shopping_list_items
      set removed_at = null, -- attempted un-remove
          completed_by_trip_member_id = 'e1000000-0000-0000-0000-000000000003' -- attempted complete-as-self
      where id = 'e3000000-0000-0000-0000-000000000002'
      returning 1
  )
  select count(*) into affected from updated;
  if affected <> 0 then
    raise exception 'CASE 3 FAILED: celebrant C un-removed/completed a hide_from_celebrant item (affected=%)', affected;
  end if;
  raise notice 'CASE 3 PASSED: celebrant''s UPDATE of hidden item affected 0 rows';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Verify the row is unchanged (checked as organizer O).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '61111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  r record;
begin
  select * into r from public.shopping_list_items where id = 'e3000000-0000-0000-0000-000000000002';
  if r.removed_at is null or r.completed_by_trip_member_id is not null then
    raise exception 'CASE 3 FAILED: hidden item was mutated by celebrant''s denied UPDATE (row: %)', r;
  end if;
  raise notice 'CASE 3 PASSED: hidden item row confirmed still removed / not completed';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 4: celebrant C cannot SELECT the 4 new v2 columns on the same
-- hide_from_celebrant item — confirms the new columns don't leak via any
-- policy/grant path distinct from the row-visibility policy already
-- proven in shopping_list_rls.test.sql Case 2.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '63333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  n int;
begin
  select count(*) into n
  from public.shopping_list_items
  where id = 'e3000000-0000-0000-0000-000000000002';
  -- (selecting the 4 new columns explicitly, not just count(*), to prove
  -- they carry no separate grant/policy path that would leak the row)
  perform completed_by_trip_member_id, removed_by_trip_member_id, removed_at, claim_assigned_by_trip_member_id
    from public.shopping_list_items
    where id = 'e3000000-0000-0000-0000-000000000002';
  if n <> 0 then
    raise exception 'CASE 4 FAILED: celebrant C could SELECT the hidden item (got % rows)', n;
  end if;
  raise notice 'CASE 4 PASSED: celebrant SELECT of hidden item''s v2 columns returns 0 rows';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 4 V2 RLS CASES PASSED' as result;

rollback;
