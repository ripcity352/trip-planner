-- =============================================================
-- supabase/tests/itinerary_item_comments_rls.test.sql
--
-- Adversarial RLS harness for public.itinerary_item_comments. Mirrors
-- supabase/tests/poll_comments_rls.test.sql, adapted: parent is
-- `itinerary_items`, visibility routes through the item's OWN
-- can_see_content(trip_id, visibility). Proves 8 cases against a LIVE
-- local Postgres — this is a local gate, not a CI gate.
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/itinerary_item_comments_rls.test.sql
--
-- Expect: prints "ALL 8 ITEM COMMENT RLS CASES PASSED" and exits 0.
-- =============================================================

begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111112', 'ic-organizer@test.local'),
  ('22222222-2222-2222-2222-222222222223', 'ic-member-m@test.local'),
  ('33333333-3333-3333-3333-333333333334', 'ic-celebrant-c@test.local'),
  ('44444444-4444-4444-4444-444444444445', 'ic-nonmember-n@test.local'),
  ('66666666-6666-6666-6666-666666666667', 'ic-other-o@test.local');

insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'item-comments-rls-trip-a', 'Item Comments RLS Trip A', '11111111-1111-1111-1111-111111111112'),
  ('bbbbbbbb-0000-0000-0000-0000000000b3', 'item-comments-rls-trip-b', 'Item Comments RLS Trip B', '11111111-1111-1111-1111-111111111112');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111112', 'organizer', false),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', '22222222-2222-2222-2222-222222222223', 'attendee', false),
  ('a4000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a3', '33333333-3333-3333-3333-333333333334', 'attendee', true),
  ('a4000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a3', '66666666-6666-6666-6666-666666666667', 'attendee', false);

-- Two items in trip A: one everyone-visible, one hide_from_celebrant.
insert into public.itinerary_items (id, trip_id, day, title, visibility, created_by) values
  ('c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', '2026-08-16', 'Rafting', 'everyone', '11111111-1111-1111-1111-111111111112'),
  ('c4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', '2026-08-17', 'Surprise activity', 'hide_from_celebrant', '11111111-1111-1111-1111-111111111112');

-- Baseline comment on the everyone-visible item, authored by member O.
insert into public.itinerary_item_comments (id, item_id, trip_id, author_trip_member_id, body) values
  ('e4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000004', 'Bring water shoes');

-- A comment on the HIDDEN item (by M).
insert into public.itinerary_item_comments (id, item_id, trip_id, author_trip_member_id, body) values
  ('e4000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000002', 'Keep this one quiet');

-- =============================================================
-- CASE 1: celebrant C cannot read comments on the hide_from_celebrant item.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333334', 'role', 'authenticated')::text, true);

do $$
declare
  n_comments int;
begin
  select count(*) into n_comments from public.itinerary_item_comments where item_id = 'c4000000-0000-0000-0000-000000000002';
  if n_comments <> 0 then
    raise exception 'CASE 1 FAILED: celebrant C could SELECT comments on the hide_from_celebrant item (got % rows)', n_comments;
  end if;
  raise notice 'CASE 1 PASSED: celebrant cannot read comments on the surprise item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 2: non-member N fully blocked — SELECT 0 rows, INSERT denied.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444445', 'role', 'authenticated')::text, true);

do $$
declare
  n_comments int;
begin
  select count(*) into n_comments from public.itinerary_item_comments where item_id = 'c4000000-0000-0000-0000-000000000001';
  if n_comments <> 0 then
    raise exception 'CASE 2 FAILED: non-member N could SELECT comments on a trip A item (got % rows)', n_comments;
  end if;
  raise notice 'CASE 2a PASSED: non-member N sees 0 rows';
end $$;

do $$
begin
  begin
    insert into public.itinerary_item_comments (item_id, trip_id, author_trip_member_id, body)
    values ('c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000004', 'Sneaky comment');
    raise exception 'CASE 2 FAILED: non-member N''s comment INSERT was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 2b PASSED: non-member N comment INSERT correctly denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: delete is author-or-organizer only.
-- =============================================================

-- 3a: celebrant C (not author, not organizer) -> 0 rows affected.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333334', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_item_comments where id = 'e4000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 3a FAILED: a plain other member deleted a comment they did not author (affected=%)', affected;
  end if;
  raise notice 'CASE 3a PASSED: plain other member cannot delete another member''s comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 3b: author O deletes own comment -> 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666667', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_item_comments where id = 'e4000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 3b FAILED: comment author could not delete own comment (affected=%)', affected;
  end if;
  raise notice 'CASE 3b PASSED: comment author deleted their own comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 3c: organizer deletes M's remaining comment (on the hidden item) -> 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111112', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_item_comments where id = 'e4000000-0000-0000-0000-000000000002' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 3c FAILED: organizer could not delete another member''s comment (affected=%)', affected;
  end if;
  raise notice 'CASE 3c PASSED: organizer deleted another member''s comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 4: child trip_id cannot diverge from the parent item.
-- =============================================================

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('b4000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b3', '22222222-2222-2222-2222-222222222223', 'attendee', false);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222223', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.itinerary_item_comments (item_id, trip_id, author_trip_member_id, body)
    values ('c4000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b3', 'b4000000-0000-0000-0000-000000000001', 'Cross-trip injection attempt');
    raise exception 'CASE 4 FAILED: comment INSERT with a trip_id diverging from the parent item was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 4 PASSED: comment trip_id-divergence INSERT denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 5: two members, same idempotency key -> TWO rows (unique index
-- is (item_id, author_trip_member_id, idempotency_key)).
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222223', 'role', 'authenticated')::text, true);

insert into public.itinerary_item_comments (id, item_id, trip_id, author_trip_member_id, body, idempotency_key)
values ('e4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000002', 'M''s comment', 'f2000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111112', 'role', 'authenticated')::text, true);

insert into public.itinerary_item_comments (id, item_id, trip_id, author_trip_member_id, body, idempotency_key)
values ('e4000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000001', 'Organizer''s comment', 'f2000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  n int;
begin
  select count(*) into n from public.itinerary_item_comments
    where idempotency_key = 'f2000000-0000-0000-0000-000000000001';
  if n <> 2 then
    raise exception 'CASE 5 FAILED: expected 2 rows for shared idempotency key across 2 members, got %', n;
  end if;
  raise notice 'CASE 5 PASSED: two members with the same comment idempotency key produced 2 rows (no false 23505)';
end $$;

-- =============================================================
-- CASE 6: NO one can UPDATE a comment, including the organizer.
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111112', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    update public.itinerary_item_comments set body = 'edited after the fact' where id = 'e4000000-0000-0000-0000-000000000003';
    raise exception 'CASE 6 FAILED: organizer was able to UPDATE an item comment';
  exception
    when insufficient_privilege then
      raise notice 'CASE 6 PASSED: UPDATE denied for everyone, incl. the organizer (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 7: celebrant is denied INSERT on the hide_from_celebrant item too.
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333334', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.itinerary_item_comments (item_id, trip_id, author_trip_member_id, body)
    values ('c4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000003', 'Wait, what surprise?');
    raise exception 'CASE 7 FAILED: celebrant''s comment INSERT on the hide_from_celebrant item was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 7 PASSED: celebrant comment INSERT on the surprise item denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 8: happy-path positive — member M CAN read O's comment on an
-- everyone-visible item.
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222223', 'role', 'authenticated')::text, true);

do $$
declare
  n_comments int;
begin
  select count(*) into n_comments from public.itinerary_item_comments where item_id = 'c4000000-0000-0000-0000-000000000001';
  if n_comments = 0 then
    raise exception 'CASE 8 FAILED: member M could not SELECT any comments on an everyone-visible item (got 0 rows)';
  end if;
  raise notice 'CASE 8 PASSED: member M reads % comment(s) on the everyone-visible item', n_comments;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 8 ITEM COMMENT RLS CASES PASSED' as result;

rollback;
