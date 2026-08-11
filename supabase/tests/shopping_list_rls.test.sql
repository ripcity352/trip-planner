-- =============================================================
-- supabase/tests/shopping_list_rls.test.sql
--
-- Adversarial RLS harness for public.shopping_list_items (spec §9,
-- docs/superpowers/specs/2026-08-11-shopping-list-design.md). Proves the
-- 8 access-control cases against a LIVE local Postgres — this is a local
-- gate, not a CI gate (CI has no live Postgres; mirrors the repo's
-- existing live-REST embed smoke, which no-ops in CI).
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/shopping_list_rls.test.sql
--
-- Expect: prints "ALL 8 RLS CASES PASSED" and exits 0. Any FAILED case
-- raises an exception, which under -v ON_ERROR_STOP=1 aborts the script
-- with a non-zero exit code.
--
-- Impersonation mechanism (verified via `\sf auth.uid` against this repo's
-- local image before writing this file):
--   auth.uid() reads, in order: current_setting('request.jwt.claim.sub')
--   (singular — PostgREST's own pre-parsed claim) OR
--   current_setting('request.jwt.claims')::jsonb ->> 'sub' (the full JWT
--   claims blob PostgREST sets from the Authorization header). We drive
--   impersonation via the canonical `request.jwt.claims` JSON blob (what a
--   real PostgREST request sets), plus `set local role authenticated` so
--   grants (not just RLS) are evaluated as the `authenticated` role, not
--   `postgres` (which bypasses RLS entirely via BYPASSRLS).
--
-- Everything runs inside one transaction and is rolled back at the end —
-- the DB is left clean.
-- =============================================================

begin;

-- ---- fixture data (seeded as postgres/owner; bypasses RLS) ----

-- auth.users rows FIRST (id is the only NOT NULL column; FK target for
-- both trips.created_by and trip_members.user_id)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rls-organizer@test.local'), -- organizer, trip A
  ('22222222-2222-2222-2222-222222222222', 'rls-member-m@test.local'),  -- plain member M, trip A
  ('33333333-3333-3333-3333-333333333333', 'rls-celebrant-c@test.local'), -- celebrant C, trip A
  ('44444444-4444-4444-4444-444444444444', 'rls-nonmember-n@test.local'), -- non-member of A, member of B only
  ('55555555-5555-5555-5555-555555555555', 'rls-dual-d@test.local');   -- dual-trip member D (A + B)

-- Trips
insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'rls-test-trip-a', 'RLS Test Trip A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'rls-test-trip-b', 'RLS Test Trip B', '11111111-1111-1111-1111-111111111111');

-- trip_members
insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'organizer', false),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', '22222222-2222-2222-2222-222222222222', 'attendee', false),
  ('a1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-333333333333', 'attendee', true),
  ('a1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000a', '55555555-5555-5555-5555-555555555555', 'attendee', false),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', '44444444-4444-4444-4444-444444444444', 'attendee', false),
  ('b1000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b', '55555555-5555-5555-5555-555555555555', 'attendee', false);

-- shopping_list_items in trip A: two created by M, one created by the
-- organizer (used by Case 4's chained reassign-then-delete escalation —
-- M must never be able to delete an item M did not create).
insert into public.shopping_list_items (id, trip_id, created_by_trip_member_id, name, visibility) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'Ice (2 bags)', 'everyone'),
  ('c1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'Stripper cake (surprise!)', 'hide_from_celebrant'),
  ('c1000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'Poker chips', 'everyone');

-- ---- impersonation sanity check ----
-- As member M: SELECT the everyone-visibility row should return 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  n int;
begin
  select count(*) into n from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'SANITY CHECK FAILED: member M could not see own trip''s everyone-visibility item (got % rows)', n;
  end if;
end $$;

-- Reset, then as non-member N: same SELECT should return 0 rows. If it
-- still returns 1, impersonation is not actually distinguishing users.
reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
declare
  n int;
begin
  select count(*) into n from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'SANITY CHECK FAILED: non-member N could see trip A item (got % rows) — impersonation is broken, cannot trust any assertion below', n;
  end if;
  raise notice 'SANITY CHECK PASSED: member sees own-trip row, non-member sees 0 rows — impersonation works';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 1: member M can insert/claim/toggle/amend; non-member N fully blocked
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

-- M inserts a new item as self
insert into public.shopping_list_items (id, trip_id, created_by_trip_member_id, name)
values ('c1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'Sunscreen');

-- M claims it (update claimed_by), toggles bought, amends name
update public.shopping_list_items set claimed_by_trip_member_id = 'a1000000-0000-0000-0000-000000000002' where id = 'c1000000-0000-0000-0000-000000000003';
update public.shopping_list_items set bought = true where id = 'c1000000-0000-0000-0000-000000000003';
update public.shopping_list_items set name = 'Sunscreen (SPF 50)' where id = 'c1000000-0000-0000-0000-000000000003';

do $$
declare
  r record;
begin
  select * into r from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000003';
  if r.claimed_by_trip_member_id is distinct from 'a1000000-0000-0000-0000-000000000002'::uuid
     or r.bought is distinct from true
     or r.name is distinct from 'Sunscreen (SPF 50)' then
    raise exception 'CASE 1 FAILED: member M insert/claim/toggle/amend did not all apply (row: %)', r;
  end if;
  raise notice 'CASE 1a PASSED: member M insert + claim + toggle + amend all succeeded';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Non-member N: SELECT returns 0 rows (already proven by sanity check, re-assert on this new row)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
declare
  n int;
begin
  select count(*) into n from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000003';
  if n <> 0 then
    raise exception 'CASE 1 FAILED: non-member N could SELECT a trip A item (got % rows)', n;
  end if;
end $$;

-- Non-member N: INSERT with-check denied — N has no trip_members row in trip A,
-- so no created_by_trip_member_id value can satisfy the insert policy.
do $$
begin
  begin
    insert into public.shopping_list_items (id, trip_id, created_by_trip_member_id, name)
    values ('c1000000-0000-0000-0000-000000000099', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'Sneaky item');
    raise exception 'CASE 1 FAILED: non-member N''s INSERT into trip A was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 1b PASSED: non-member N INSERT correctly denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 2: celebrant C cannot SELECT the hide_from_celebrant row
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  n int;
begin
  select count(*) into n from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000002';
  if n <> 0 then
    raise exception 'CASE 2 FAILED: celebrant C could SELECT the hide_from_celebrant row (got % rows)', n;
  end if;
  raise notice 'CASE 2 PASSED: celebrant cannot see the surprise row';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: non-celebrant member M UPDATE ... SET visibility='everyone' on the
-- surprise row -> DENIED at the column-privilege layer.
--
-- RED-direction note (not committed): if the shopping_list migration's
-- column-scoped grant were widened to `grant update on public.shopping_list_items`
-- (full-table, dropping the column list) OR `visibility` were added to the
-- column list, this case would FAIL — the UPDATE would silently succeed and
-- a member could spoil their own surprise. We do NOT apply that grant change
-- here; this is a description of the failure mode the column grant prevents.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    update public.shopping_list_items set visibility = 'everyone' where id = 'c1000000-0000-0000-0000-000000000002';
    raise exception 'CASE 3 FAILED: member M was able to UPDATE visibility on the surprise row';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%permission denied for column%' and sqlerrm not ilike '%permission denied for table%' then
        raise exception 'CASE 3 FAILED: got insufficient_privilege but wrong reason (expected column/table permission denied, got: %)', sqlerrm;
      end if;
      raise notice 'CASE 3 PASSED: visibility UPDATE denied at column-privilege layer (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 4 (spec §9 #4): member M UPDATE ... SET created_by_trip_member_id=<self>
-- -> DENIED (created_by not in the column-scoped update grant -> immutable),
-- THEN M's DELETE of another member's item -> DENIED (0 rows). This chains
-- the full escalation the spec describes: M tries to reassign ownership of
-- an item M did NOT create (the organizer's "Poker chips", c1000000...0006)
-- to self, so the follow-on delete would succeed if the reassignment had
-- gone through. Because it never applies, M is still a non-creator/
-- non-organizer for that row when the delete is attempted.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    update public.shopping_list_items
      set created_by_trip_member_id = 'a1000000-0000-0000-0000-000000000002'
      where id = 'c1000000-0000-0000-0000-000000000006';
    raise exception 'CASE 4 FAILED: member M was able to UPDATE created_by_trip_member_id';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%permission denied for column%' and sqlerrm not ilike '%permission denied for table%' then
        raise exception 'CASE 4 FAILED: got insufficient_privilege but wrong reason (got: %)', sqlerrm;
      end if;
      raise notice 'CASE 4a PASSED: created_by_trip_member_id UPDATE denied (%)', sqlerrm;
  end;
end $$;

-- Chained half: the reassignment above never applied, so M is still not the
-- creator (and not the organizer) of c1000000...0006. M's DELETE of that
-- item must match 0 rows — the delete policy's USING clause filters it out
-- silently (no error, just zero rows affected).
do $$
declare
  affected int;
begin
  delete from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000006';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'CASE 4 FAILED: member M was able to DELETE an item M did not create (affected=%)', affected;
  end if;
  raise notice 'CASE 4b PASSED: member M''s DELETE of another member''s item affected 0 rows (reassign-then-delete escalation blocked)';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 5: dual-trip member D UPDATE ... SET trip_id=<trip B> -> DENIED
-- (trip_id immutable via the same column-scoped grant)
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    update public.shopping_list_items
      set trip_id = 'bbbbbbbb-0000-0000-0000-00000000000b'
      where id = 'c1000000-0000-0000-0000-000000000001';
    raise exception 'CASE 5 FAILED: dual-trip member D was able to UPDATE trip_id';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%permission denied for column%' and sqlerrm not ilike '%permission denied for table%' then
        raise exception 'CASE 5 FAILED: got insufficient_privilege but wrong reason (got: %)', sqlerrm;
      end if;
      raise notice 'CASE 5 PASSED: trip_id UPDATE denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 6: celebrant C UPDATE ... RETURNING on the surprise row -> 0 rows
-- (celebrant can't see it, so the UPDATE's USING clause filters it out
-- entirely — not a column-permission error, a genuine 0-row update)
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with updated as (
    update public.shopping_list_items
      set bought = true
      where id = 'c1000000-0000-0000-0000-000000000002'
      returning 1
  )
  select count(*) into affected from updated;
  if affected <> 0 then
    raise exception 'CASE 6 FAILED: celebrant C''s UPDATE on the surprise row affected % rows (expected 0)', affected;
  end if;
  raise notice 'CASE 6 PASSED: celebrant UPDATE on surprise row affects 0 rows';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 7: two different members, same idempotency UUID -> TWO rows exist
-- (unique index is (trip_id, created_by_trip_member_id, idempotency_key),
-- so distinct creators with the same idempotency_key do not collide)
-- =============================================================

-- M inserts with a shared idempotency key
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

insert into public.shopping_list_items (id, trip_id, created_by_trip_member_id, name, idempotency_key)
values ('c1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'Charcoal', 'd0000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

-- organizer inserts with the SAME idempotency key (different creator)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

insert into public.shopping_list_items (id, trip_id, created_by_trip_member_id, name, idempotency_key)
values ('c1000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'Lighter fluid', 'd0000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  n int;
begin
  select count(*) into n from public.shopping_list_items
    where idempotency_key = 'd0000000-0000-0000-0000-000000000001';
  if n <> 2 then
    raise exception 'CASE 7 FAILED: expected 2 rows for shared idempotency key across 2 members, got %', n;
  end if;
  raise notice 'CASE 7 PASSED: two members with the same idempotency key produced 2 rows (no false 23505)';
end $$;

-- =============================================================
-- CASE 8: delete: creator M can delete own item; organizer can delete M's
-- item; a plain OTHER member (celebrant C, not creator, not organizer)
-- cannot delete.
-- =============================================================

-- 8a: creator M deletes own item (c1000000...0003, "Sunscreen (SPF 50)")
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000003' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 8a FAILED: creator M could not delete own item (affected=%)', affected;
  end if;
  raise notice 'CASE 8a PASSED: creator M deleted own item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 8b: plain OTHER member (celebrant C — visible on the everyone-visibility
-- item, not creator, not organizer) cannot delete M's remaining item (c1000000...0001)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 8b FAILED: plain other member (celebrant C) was able to delete another member''s item (affected=%)', affected;
  end if;
  raise notice 'CASE 8b PASSED: plain other member cannot delete another member''s item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 8c: organizer deletes M's item (c1000000...0001, still present)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.shopping_list_items where id = 'c1000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 8c FAILED: organizer could not delete another member''s item (affected=%)', affected;
  end if;
  raise notice 'CASE 8c PASSED: organizer deleted M''s item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 8 RLS CASES PASSED' as result;

rollback;
