-- =============================================================
-- supabase/tests/poll_multi_vote_rls.test.sql
--
-- Adversarial RLS harness for poll multi-select voting (#627). Mirrors
-- supabase/tests/poll_writein_options_rls.test.sql's structure and
-- impersonation mechanism. Proves 10 cases against a LIVE local
-- Postgres — this is a local gate, not a CI gate.
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/poll_multi_vote_rls.test.sql
--
-- Expect: prints "ALL 10 POLL MULTI-VOTE RLS CASES PASSED" and exits 0.
-- Any FAILED case raises an exception, which under -v ON_ERROR_STOP=1
-- aborts the script with a non-zero exit code.
--
-- Everything runs inside one transaction and is rolled back at the end
-- — the DB is left clean.
-- =============================================================

begin;

-- ---- fixture data (seeded as postgres/owner; bypasses RLS) ----

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'mv-organizer@test.local'),   -- organizer, trip A
  ('22222222-2222-2222-2222-222222222222', 'mv-member-m@test.local'),    -- plain member M, trip A
  ('33333333-3333-3333-3333-333333333333', 'mv-celebrant-c@test.local'), -- celebrant C, trip A
  ('44444444-4444-4444-4444-444444444444', 'mv-nonmember-n@test.local'), -- non-member of A
  ('66666666-6666-6666-6666-666666666666', 'mv-other-o@test.local');     -- plain member O, trip A

insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'poll-multi-vote-rls-trip-a', 'Poll Multi-Vote RLS Trip A', '11111111-1111-1111-1111-111111111111');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('a5000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a4', '11111111-1111-1111-1111-111111111111', 'organizer', false),
  ('a5000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a4', '22222222-2222-2222-2222-222222222222', 'attendee', false),
  ('a5000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a4', '33333333-3333-3333-3333-333333333333', 'attendee', true),
  ('a5000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a4', '66666666-6666-6666-6666-666666666666', 'attendee', false);

-- Poll 1: everyone-visible, OPEN, single-choice (allow_multiple=false, default).
insert into public.polls (id, trip_id, question, visibility, created_by) values
  ('c5000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a4', 'Which night for the strip club?', 'everyone', 'a5000000-0000-0000-0000-000000000001');
insert into public.poll_options (id, poll_id, label, position) values
  ('d5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Friday', 0),
  ('d5000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', 'Saturday', 1);

-- Poll 2: everyone-visible, OPEN, MULTI-choice.
insert into public.polls (id, trip_id, question, visibility, created_by, allow_multiple) values
  ('c5000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a4', 'Which activities are you in for?', 'everyone', 'a5000000-0000-0000-0000-000000000001', true);
insert into public.poll_options (id, poll_id, label, position) values
  ('d5000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000002', 'Go-karts', 0),
  ('d5000000-0000-0000-0000-000000000004', 'c5000000-0000-0000-0000-000000000002', 'Escape room', 1),
  ('d5000000-0000-0000-0000-000000000005', 'c5000000-0000-0000-0000-000000000002', 'Axe throwing', 2);

-- Poll 3: hide_from_celebrant, OPEN, MULTI-choice — celebrant cannot vote.
insert into public.polls (id, trip_id, question, visibility, created_by, allow_multiple) values
  ('c5000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a4', 'Surprise activity picks?', 'hide_from_celebrant', 'a5000000-0000-0000-0000-000000000001', true);
insert into public.poll_options (id, poll_id, label, position) values
  ('d5000000-0000-0000-0000-000000000006', 'c5000000-0000-0000-0000-000000000003', 'Option X', 0),
  ('d5000000-0000-0000-0000-000000000007', 'c5000000-0000-0000-0000-000000000003', 'Option Y', 1);

-- Poll 4: everyone-visible, CLOSED, MULTI-choice.
insert into public.polls (id, trip_id, question, visibility, closes_on, created_by, allow_multiple) values
  ('c5000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a4', 'Closed multi poll', 'everyone', current_date - 1, 'a5000000-0000-0000-0000-000000000001', true);
insert into public.poll_options (id, poll_id, label, position) values
  ('d5000000-0000-0000-0000-000000000008', 'c5000000-0000-0000-0000-000000000004', 'Late option A', 0),
  ('d5000000-0000-0000-0000-000000000009', 'c5000000-0000-0000-0000-000000000004', 'Late option B', 1);

-- =============================================================
-- CASE 1: member M votes on the single-choice poll (Friday) — one row.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  v_count int;
begin
  perform public.cast_poll_vote('c5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001');
  select count(*) into v_count from public.poll_votes
    where poll_id = 'c5000000-0000-0000-0000-000000000001' and trip_member_id = 'a5000000-0000-0000-0000-000000000002';
  if v_count <> 1 then
    raise exception 'CASE 1 FAILED: expected 1 row after first single-choice vote, got %', v_count;
  end if;
  raise notice 'CASE 1 PASSED: single-choice poll nets exactly 1 row after first vote';
end $$;

-- =============================================================
-- CASE 2: member M switches to Saturday on the SAME single-choice
-- poll — still exactly one row, now pointing at Saturday.
-- =============================================================
do $$
declare
  v_count int;
  v_option uuid;
begin
  perform public.cast_poll_vote('c5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000002');
  select count(*) into v_count from public.poll_votes
    where poll_id = 'c5000000-0000-0000-0000-000000000001' and trip_member_id = 'a5000000-0000-0000-0000-000000000002';
  select option_id into v_option from public.poll_votes
    where poll_id = 'c5000000-0000-0000-0000-000000000001' and trip_member_id = 'a5000000-0000-0000-0000-000000000002';
  if v_count <> 1 or v_option is distinct from 'd5000000-0000-0000-0000-000000000002' then
    raise exception 'CASE 2 FAILED: expected exactly 1 row on Saturday, got count=% option=%', v_count, v_option;
  end if;
  raise notice 'CASE 2 PASSED: switching a single-choice vote replaces the prior row (still 1 row)';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: member M selects TWO options on the multi-choice poll —
-- two independent rows, neither overwriting the other.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  v_count int;
begin
  perform public.cast_poll_vote('c5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000003');
  perform public.cast_poll_vote('c5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000004');
  select count(*) into v_count from public.poll_votes
    where poll_id = 'c5000000-0000-0000-0000-000000000002' and trip_member_id = 'a5000000-0000-0000-0000-000000000002';
  if v_count <> 2 then
    raise exception 'CASE 3 FAILED: expected 2 rows after selecting 2 options on a multi-choice poll, got %', v_count;
  end if;
  raise notice 'CASE 3 PASSED: multi-choice poll accumulates independent rows (2 selections = 2 rows)';
end $$;

-- =============================================================
-- CASE 4: re-tapping an already-selected option on the multi-choice
-- poll is a no-op (idempotent add via ON CONFLICT DO NOTHING) — still
-- 2 rows, not 3 and not an error.
-- =============================================================
do $$
declare
  v_count int;
begin
  perform public.cast_poll_vote('c5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000005');
  select count(*) into v_count from public.poll_votes
    where poll_id = 'c5000000-0000-0000-0000-000000000002' and trip_member_id = 'a5000000-0000-0000-0000-000000000002';
  if v_count <> 2 then
    raise exception 'CASE 4 FAILED: re-tapping an already-selected option should be a no-op, got % rows', v_count;
  end if;
  raise notice 'CASE 4 PASSED: re-tapping an already-selected multi-choice option is idempotent (no-op)';
end $$;

-- =============================================================
-- CASE 5: retract_poll_vote un-selects one option — the OTHER
-- selection survives untouched.
-- =============================================================
do $$
declare
  v_count int;
  v_remaining uuid;
begin
  perform public.retract_poll_vote('c5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000003');
  select count(*) into v_count from public.poll_votes
    where poll_id = 'c5000000-0000-0000-0000-000000000002' and trip_member_id = 'a5000000-0000-0000-0000-000000000002';
  select option_id into v_remaining from public.poll_votes
    where poll_id = 'c5000000-0000-0000-0000-000000000002' and trip_member_id = 'a5000000-0000-0000-0000-000000000002';
  if v_count <> 1 or v_remaining is distinct from 'd5000000-0000-0000-0000-000000000004' then
    raise exception 'CASE 5 FAILED: expected 1 remaining row (escape room), got count=% option=%', v_count, v_remaining;
  end if;
  raise notice 'CASE 5 PASSED: retract removes exactly the targeted option, leaving the other selection intact';
end $$;

-- =============================================================
-- CASE 6: retracting an already-gone vote is a no-op, not an error
-- (idempotent delete).
-- =============================================================
do $$
begin
  perform public.retract_poll_vote('c5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000003');
  raise notice 'CASE 6 PASSED: retracting an already-retracted vote is a silent no-op';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 7: the celebrant CANNOT vote on a hide_from_celebrant poll —
-- cast_poll_vote raises 42501 (not a member of THIS poll's visible
-- set), never a silent success.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.cast_poll_vote('c5000000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000006', 'f3000000-0000-0000-0000-000000000007');
    raise exception 'CASE 7 FAILED: celebrant vote on hide_from_celebrant poll was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 7 PASSED: celebrant vote on hide_from_celebrant poll denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 8: a non-member cannot vote at all — cast_poll_vote's own
-- member-resolution raises 42501 before touching poll_votes.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.cast_poll_vote('c5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000008');
    raise exception 'CASE 8 FAILED: non-member vote was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 8 PASSED: non-member cast_poll_vote denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 9: voting on a CLOSED poll is denied (deadline predicate on
-- the INSERT policy) — no retroactive vote-stuffing after the poll
-- calls its outcome.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.cast_poll_vote('c5000000-0000-0000-0000-000000000004', 'd5000000-0000-0000-0000-000000000008', 'f3000000-0000-0000-0000-000000000009');
    raise exception 'CASE 9 FAILED: vote on a closed poll was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 9 PASSED: vote on a closed poll denied (%)', sqlerrm;
  end;
end $$;

-- =============================================================
-- CASE 10: member M cannot spoof another member's (O's) seat via a
-- raw INSERT bypassing cast_poll_vote — trip_member_id must be the
-- caller's own row (H1 pattern), identical to the base #390 policy.
-- =============================================================
do $$
begin
  begin
    insert into public.poll_votes (poll_id, option_id, trip_member_id, idempotency_key)
    values ('c5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000004', 'f300000a-0000-0000-0000-00000000000a');
    raise exception 'CASE 10 FAILED: spoofed trip_member_id INSERT was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 10 PASSED: spoofed trip_member_id INSERT denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 10 POLL MULTI-VOTE RLS CASES PASSED' as result;

rollback;
