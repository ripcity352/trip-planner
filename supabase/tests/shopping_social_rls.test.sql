-- =============================================================
-- supabase/tests/shopping_social_rls.test.sql
--
-- Adversarial RLS harness for the shopping-list social layer —
-- public.shopping_item_reactions + public.shopping_item_comments (spec
-- §12.3/§12.7, docs/superpowers/specs/2026-08-11-shopping-list-design.md).
-- Proves the 6 access-control cases against a LIVE local Postgres — this
-- is a local gate, not a CI gate (mirrors shopping_list_rls.test.sql).
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/shopping_social_rls.test.sql
--
-- Expect: prints "ALL 6 SOCIAL RLS CASES PASSED" and exits 0. Any FAILED
-- case raises an exception, which under -v ON_ERROR_STOP=1 aborts the
-- script with a non-zero exit code.
--
-- Impersonation mechanism: identical to shopping_list_rls.test.sql — set
-- `request.jwt.claims` + `set local role authenticated` per caller.
--
-- Everything runs inside one transaction and is rolled back at the end —
-- the DB is left clean.
-- =============================================================

begin;

-- ---- fixture data (seeded as postgres/owner; bypasses RLS) ----

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'social-organizer@test.local'), -- organizer, trip A
  ('22222222-2222-2222-2222-222222222222', 'social-member-m@test.local'),  -- plain member M, trip A
  ('33333333-3333-3333-3333-333333333333', 'social-celebrant-c@test.local'), -- celebrant C, trip A
  ('44444444-4444-4444-4444-444444444444', 'social-nonmember-n@test.local'), -- non-member of A
  ('66666666-6666-6666-6666-666666666666', 'social-other-o@test.local'); -- plain member O, trip A (not celebrant, not organizer)

insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'social-rls-trip-a', 'Social RLS Trip A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'social-rls-trip-b', 'Social RLS Trip B', '11111111-1111-1111-1111-111111111111');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'organizer', false),
  ('a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-2222-2222-2222-222222222222', 'attendee', false),
  ('a2000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a1', '33333333-3333-3333-3333-333333333333', 'attendee', true),
  ('a2000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a1', '66666666-6666-6666-6666-666666666666', 'attendee', false);

-- shopping_list_items in trip A: one everyone-visible (M's), one
-- hide_from_celebrant (M's, "the surprise item").
insert into public.shopping_list_items (id, trip_id, created_by_trip_member_id, name, visibility) values
  ('c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000002', 'Ice (2 bags)', 'everyone'),
  ('c2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000002', 'Stripper cake (surprise!)', 'hide_from_celebrant');

-- Baseline reaction + comment on the everyone-visible item, both authored
-- by member O — used by the author-or-organizer / own-row delete cases.
insert into public.shopping_item_reactions (id, item_id, trip_id, trip_member_id, emoji) values
  ('d2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000004', '👍');

insert into public.shopping_item_comments (id, item_id, trip_id, author_trip_member_id, body) values
  ('e2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000004', 'Get the crushed kind');

-- A reaction + comment on the HIDDEN item (both by M, the item's
-- creator) — used by the celebrant-cannot-read case.
insert into public.shopping_item_reactions (id, item_id, trip_id, trip_member_id, emoji) values
  ('d2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000002', '🔥');

insert into public.shopping_item_comments (id, item_id, trip_id, author_trip_member_id, body) values
  ('e2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000002', 'Order from the usual spot');

-- =============================================================
-- CASE 1: celebrant C cannot read reactions/comments on the
-- hide_from_celebrant item (0 rows each, SELECT).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  n_reactions int;
  n_comments int;
begin
  select count(*) into n_reactions from public.shopping_item_reactions where item_id = 'c2000000-0000-0000-0000-000000000002';
  select count(*) into n_comments from public.shopping_item_comments where item_id = 'c2000000-0000-0000-0000-000000000002';
  if n_reactions <> 0 then
    raise exception 'CASE 1 FAILED: celebrant C could SELECT reactions on the hide_from_celebrant item (got % rows)', n_reactions;
  end if;
  if n_comments <> 0 then
    raise exception 'CASE 1 FAILED: celebrant C could SELECT comments on the hide_from_celebrant item (got % rows)', n_comments;
  end if;
  raise notice 'CASE 1 PASSED: celebrant cannot read reactions or comments on the surprise item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 2: non-member N fully blocked — SELECT returns 0 rows on the
-- everyone-visible item's social rows, and INSERT is denied for both
-- tables (N has no trip_members row in trip A, so no own-seat value
-- satisfies the with-check).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
declare
  n_reactions int;
  n_comments int;
begin
  select count(*) into n_reactions from public.shopping_item_reactions where item_id = 'c2000000-0000-0000-0000-000000000001';
  select count(*) into n_comments from public.shopping_item_comments where item_id = 'c2000000-0000-0000-0000-000000000001';
  if n_reactions <> 0 then
    raise exception 'CASE 2 FAILED: non-member N could SELECT reactions on a trip A item (got % rows)', n_reactions;
  end if;
  if n_comments <> 0 then
    raise exception 'CASE 2 FAILED: non-member N could SELECT comments on a trip A item (got % rows)', n_comments;
  end if;
  raise notice 'CASE 2a PASSED: non-member N sees 0 rows for both tables';
end $$;

do $$
begin
  begin
    insert into public.shopping_item_reactions (item_id, trip_id, trip_member_id, emoji)
    values ('c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000004', '❤️');
    raise exception 'CASE 2 FAILED: non-member N''s reaction INSERT was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 2b PASSED: non-member N reaction INSERT correctly denied (%)', sqlerrm;
  end;
end $$;

do $$
begin
  begin
    insert into public.shopping_item_comments (item_id, trip_id, author_trip_member_id, body)
    values ('c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000004', 'Sneaky note');
    raise exception 'CASE 2 FAILED: non-member N''s comment INSERT was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 2c PASSED: non-member N comment INSERT correctly denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: comment delete is author-or-organizer only. A plain OTHER
-- member (celebrant C — visible on the everyone item, not the author,
-- not the organizer) is denied (0 rows affected); the author (member O)
-- can delete their own; the organizer can delete a remaining comment.
-- =============================================================

-- 3a: celebrant C (plain other member here — not author, not organizer)
-- attempts to delete O's comment -> 0 rows affected.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.shopping_item_comments where id = 'e2000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 3a FAILED: a plain other member deleted a comment they did not author (affected=%)', affected;
  end if;
  raise notice 'CASE 3a PASSED: plain other member cannot delete another member''s comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 3b: author O deletes their own comment on the hidden item -> 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.shopping_item_comments where id = 'e2000000-0000-0000-0000-000000000001' returning 1
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
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.shopping_item_comments where id = 'e2000000-0000-0000-0000-000000000002' returning 1
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
-- CASE 4: reaction delete is own-row only. A plain OTHER member
-- (celebrant C) cannot delete O's reaction; O can delete their own.
-- =============================================================

-- 4a: celebrant C attempts to delete O's reaction -> 0 rows.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.shopping_item_reactions where id = 'd2000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 4a FAILED: a plain other member deleted a reaction that was not their own (affected=%)', affected;
  end if;
  raise notice 'CASE 4a PASSED: plain other member cannot delete another member''s reaction';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 4b: reaction owner O deletes their own reaction -> 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.shopping_item_reactions where id = 'd2000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 4b FAILED: reaction owner could not delete own reaction (affected=%)', affected;
  end if;
  raise notice 'CASE 4b PASSED: reaction owner deleted their own reaction';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 5: child trip_id cannot diverge from the parent — a member of
-- BOTH trip A and trip B inserting a reaction/comment on a trip A item
-- but claiming trip_id = trip B is denied (the with-check's own-seat
-- clause requires a trip_members row in the CLAIMED trip_id, and the
-- pinned EXISTS requires the parent item to live in that same trip_id —
-- neither holds when trip_id disagrees with the parent, so the insert
-- fails regardless of which sub-clause is checked first).
-- =============================================================

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'attendee', false);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.shopping_item_reactions (item_id, trip_id, trip_member_id, emoji)
    values ('c2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'b2000000-0000-0000-0000-000000000001', '🍻');
    raise exception 'CASE 5 FAILED: reaction INSERT with a trip_id diverging from the parent item was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 5a PASSED: reaction trip_id-divergence INSERT denied (%)', sqlerrm;
  end;
end $$;

do $$
begin
  begin
    insert into public.shopping_item_comments (item_id, trip_id, author_trip_member_id, body)
    values ('c2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'b2000000-0000-0000-0000-000000000001', 'Cross-trip injection attempt');
    raise exception 'CASE 5 FAILED: comment INSERT with a trip_id diverging from the parent item was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 5b PASSED: comment trip_id-divergence INSERT denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 6: two members, same comment idempotency UUID -> TWO rows exist
-- (the unique index is (item_id, author_trip_member_id, idempotency_key)
-- — distinct authors sharing an idempotency key do not collide).
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

insert into public.shopping_item_comments (id, item_id, trip_id, author_trip_member_id, body, idempotency_key)
values ('e2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000002', 'M''s note', 'f0000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

insert into public.shopping_item_comments (id, item_id, trip_id, author_trip_member_id, body, idempotency_key)
values ('e2000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000001', 'Organizer''s note', 'f0000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  n int;
begin
  select count(*) into n from public.shopping_item_comments
    where idempotency_key = 'f0000000-0000-0000-0000-000000000001';
  if n <> 2 then
    raise exception 'CASE 6 FAILED: expected 2 rows for shared idempotency key across 2 members, got %', n;
  end if;
  raise notice 'CASE 6 PASSED: two members with the same comment idempotency key produced 2 rows (no false 23505)';
end $$;

-- =============================================================
select 'ALL 6 SOCIAL RLS CASES PASSED' as result;

rollback;
