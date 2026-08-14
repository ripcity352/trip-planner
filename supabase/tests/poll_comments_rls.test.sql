-- =============================================================
-- supabase/tests/poll_comments_rls.test.sql
--
-- Adversarial RLS harness for public.poll_comments (#620, part 1/3 of
-- #616). Mirrors supabase/tests/shopping_social_rls.test.sql's comment
-- half, adapted: parent is `polls`, visibility routes through the
-- poll's OWN can_see_content(trip_id, visibility). Proves 7 cases
-- against a LIVE local Postgres — this is a local gate, not a CI gate.
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/poll_comments_rls.test.sql
--
-- Expect: prints "ALL 7 POLL COMMENT RLS CASES PASSED" and exits 0.
-- Any FAILED case raises an exception, which under -v ON_ERROR_STOP=1
-- aborts the script with a non-zero exit code.
--
-- Impersonation mechanism: identical to shopping_social_rls.test.sql —
-- set `request.jwt.claims` + `set local role authenticated` per caller.
--
-- Everything runs inside one transaction and is rolled back at the end
-- — the DB is left clean.
-- =============================================================

begin;

-- ---- fixture data (seeded as postgres/owner; bypasses RLS) ----

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'pc-organizer@test.local'),   -- organizer, trip A
  ('22222222-2222-2222-2222-222222222222', 'pc-member-m@test.local'),    -- plain member M, trip A
  ('33333333-3333-3333-3333-333333333333', 'pc-celebrant-c@test.local'), -- celebrant C, trip A
  ('44444444-4444-4444-4444-444444444444', 'pc-nonmember-n@test.local'), -- non-member of A
  ('66666666-6666-6666-6666-666666666666', 'pc-other-o@test.local');     -- plain member O, trip A

insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'poll-comments-rls-trip-a', 'Poll Comments RLS Trip A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'poll-comments-rls-trip-b', 'Poll Comments RLS Trip B', '11111111-1111-1111-1111-111111111111');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('a3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'organizer', false),
  ('a3000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-2222-2222-2222-222222222222', 'attendee', false),
  ('a3000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a2', '33333333-3333-3333-3333-333333333333', 'attendee', true),
  ('a3000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a2', '66666666-6666-6666-6666-666666666666', 'attendee', false);

-- Two polls in trip A: one everyone-visible (organizer-composed), one
-- hide_from_celebrant (also organizer-composed — "the surprise poll").
insert into public.polls (id, trip_id, question, visibility, created_by) values
  ('c3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'Steakhouse or omakase?', 'everyone', 'a3000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'Surprise activity — which one?', 'hide_from_celebrant', 'a3000000-0000-0000-0000-000000000001');

-- Baseline comment on the everyone-visible poll, authored by member O —
-- used by the author-or-organizer delete cases.
insert into public.poll_comments (id, poll_id, trip_id, author_trip_member_id, body) values
  ('e3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-000000000004', 'Omakase, obviously');

-- A comment on the HIDDEN poll (by M, the organizer) — used by the
-- celebrant-cannot-read case, and as the organizer-delete target.
insert into public.poll_comments (id, poll_id, trip_id, author_trip_member_id, body) values
  ('e3000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-000000000002', 'Keep this one quiet');

-- =============================================================
-- CASE 1: celebrant C cannot read comments on the hide_from_celebrant
-- poll (0 rows, SELECT).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  n_comments int;
begin
  select count(*) into n_comments from public.poll_comments where poll_id = 'c3000000-0000-0000-0000-000000000002';
  if n_comments <> 0 then
    raise exception 'CASE 1 FAILED: celebrant C could SELECT comments on the hide_from_celebrant poll (got % rows)', n_comments;
  end if;
  raise notice 'CASE 1 PASSED: celebrant cannot read comments on the surprise poll';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 2: non-member N fully blocked — SELECT returns 0 rows on the
-- everyone-visible poll's comments, and INSERT is denied (N has no
-- trip_members row in trip A, so no own-seat value satisfies the
-- with-check).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
declare
  n_comments int;
begin
  select count(*) into n_comments from public.poll_comments where poll_id = 'c3000000-0000-0000-0000-000000000001';
  if n_comments <> 0 then
    raise exception 'CASE 2 FAILED: non-member N could SELECT comments on a trip A poll (got % rows)', n_comments;
  end if;
  raise notice 'CASE 2a PASSED: non-member N sees 0 rows';
end $$;

do $$
begin
  begin
    insert into public.poll_comments (poll_id, trip_id, author_trip_member_id, body)
    values ('c3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-000000000004', 'Sneaky comment');
    raise exception 'CASE 2 FAILED: non-member N''s comment INSERT was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 2b PASSED: non-member N comment INSERT correctly denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: comment delete is author-or-organizer only. A plain OTHER
-- member (celebrant C — not author, not organizer) is denied (0 rows
-- affected); the author (member O) can delete their own; the organizer
-- can delete a remaining comment (M's, on the hidden poll).
-- =============================================================

-- 3a: celebrant C attempts to delete O's comment -> 0 rows affected.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.poll_comments where id = 'e3000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 3a FAILED: a plain other member deleted a comment they did not author (affected=%)', affected;
  end if;
  raise notice 'CASE 3a PASSED: plain other member cannot delete another member''s comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 3b: author O deletes their own comment -> 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.poll_comments where id = 'e3000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 3b FAILED: comment author could not delete own comment (affected=%)', affected;
  end if;
  raise notice 'CASE 3b PASSED: comment author deleted their own comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 3c: organizer deletes M's remaining comment (on the hidden poll) -> 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.poll_comments where id = 'e3000000-0000-0000-0000-000000000002' returning 1
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
-- CASE 4: child trip_id cannot diverge from the parent — a member of
-- BOTH trip A and trip B inserting a comment on a trip A poll but
-- claiming trip_id = trip B is denied.
-- =============================================================

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('b3000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'attendee', false);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.poll_comments (poll_id, trip_id, author_trip_member_id, body)
    values ('c3000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b2', 'b3000000-0000-0000-0000-000000000001', 'Cross-trip injection attempt');
    raise exception 'CASE 4 FAILED: comment INSERT with a trip_id diverging from the parent poll was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 4 PASSED: comment trip_id-divergence INSERT denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 5: two members, same comment idempotency UUID -> TWO rows exist
-- (the unique index is (poll_id, author_trip_member_id, idempotency_key)
-- — distinct authors sharing an idempotency key do not collide).
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

insert into public.poll_comments (id, poll_id, trip_id, author_trip_member_id, body, idempotency_key)
values ('e3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-000000000002', 'M''s comment', 'f1000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

insert into public.poll_comments (id, poll_id, trip_id, author_trip_member_id, body, idempotency_key)
values ('e3000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-000000000001', 'Organizer''s comment', 'f1000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  n int;
begin
  select count(*) into n from public.poll_comments
    where idempotency_key = 'f1000000-0000-0000-0000-000000000001';
  if n <> 2 then
    raise exception 'CASE 5 FAILED: expected 2 rows for shared idempotency key across 2 members, got %', n;
  end if;
  raise notice 'CASE 5 PASSED: two members with the same comment idempotency key produced 2 rows (no false 23505)';
end $$;

-- =============================================================
-- CASE 6: NO member — including the organizer — can UPDATE a comment.
-- There is no UPDATE grant at all (table-privilege level, checked
-- before any policy), so this must fail regardless of authorship.
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    update public.poll_comments set body = 'edited after the fact' where id = 'e3000000-0000-0000-0000-000000000003';
    raise exception 'CASE 6 FAILED: organizer was able to UPDATE a poll comment';
  exception
    when insufficient_privilege then
      raise notice 'CASE 6 PASSED: UPDATE denied for everyone, incl. the organizer (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 7: a member who cannot see the hide_from_celebrant poll (the
-- celebrant) is also denied INSERT on it, not just SELECT — visibility
-- gates both directions.
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.poll_comments (poll_id, trip_id, author_trip_member_id, body)
    values ('c3000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-000000000003', 'Wait, what surprise?');
    raise exception 'CASE 7 FAILED: celebrant''s comment INSERT on the hide_from_celebrant poll was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 7 PASSED: celebrant comment INSERT on the surprise poll denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 7 POLL COMMENT RLS CASES PASSED' as result;

rollback;
