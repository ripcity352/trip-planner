-- =============================================================
-- supabase/tests/poll_writein_options_rls.test.sql
--
-- Adversarial RLS harness for poll write-in options (#621, part 2/3 of
-- #616 — Model A). Mirrors supabase/tests/poll_comments_rls.test.sql's
-- structure and impersonation mechanism. Proves 11 cases against a
-- LIVE local Postgres — this is a local gate, not a CI gate.
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/poll_writein_options_rls.test.sql
--
-- Expect: prints "ALL 11 POLL WRITE-IN OPTION RLS CASES PASSED" and
-- exits 0. Any FAILED case raises an exception, which under
-- -v ON_ERROR_STOP=1 aborts the script with a non-zero exit code.
--
-- Everything runs inside one transaction and is rolled back at the end
-- — the DB is left clean.
-- =============================================================

begin;

-- ---- fixture data (seeded as postgres/owner; bypasses RLS) ----

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'wi-organizer@test.local'),   -- organizer, trip A
  ('22222222-2222-2222-2222-222222222222', 'wi-member-m@test.local'),    -- plain member M, trip A
  ('33333333-3333-3333-3333-333333333333', 'wi-celebrant-c@test.local'), -- celebrant C, trip A
  ('44444444-4444-4444-4444-444444444444', 'wi-nonmember-n@test.local'), -- non-member of A
  ('66666666-6666-6666-6666-666666666666', 'wi-other-o@test.local');     -- plain member O, trip A

insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'poll-writein-rls-trip-a', 'Poll Write-In RLS Trip A', '11111111-1111-1111-1111-111111111111');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'organizer', false),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', '22222222-2222-2222-2222-222222222222', 'attendee', false),
  ('a4000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a3', '33333333-3333-3333-3333-333333333333', 'attendee', true),
  ('a4000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a3', '66666666-6666-6666-6666-666666666666', 'attendee', false);

-- Poll 1: everyone-visible, OPEN (no closes_on) — the happy-path poll.
insert into public.polls (id, trip_id, question, visibility, created_by) values
  ('c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'Steakhouse or omakase?', 'everyone', 'a4000000-0000-0000-0000-000000000001');
insert into public.poll_options (id, poll_id, label, position) values
  ('d4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'Steakhouse', 0),
  ('d4000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000001', 'Omakase', 1);

-- Poll 2: hide_from_celebrant, OPEN — celebrant cannot see or write.
insert into public.polls (id, trip_id, question, visibility, created_by) values
  ('c4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'Surprise activity — which one?', 'hide_from_celebrant', 'a4000000-0000-0000-0000-000000000001');
insert into public.poll_options (id, poll_id, label, position) values
  ('d4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000002', 'Escape room', 0),
  ('d4000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000002', 'Go-karts', 1);

-- Poll 3: everyone-visible, CLOSED (closes_on = yesterday).
insert into public.polls (id, trip_id, question, visibility, closes_on, created_by) values
  ('c4000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'Brunch spot?', 'everyone', current_date - 1, 'a4000000-0000-0000-0000-000000000001');
insert into public.poll_options (id, poll_id, label, position) values
  ('d4000000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000003', 'Diner', 0),
  ('d4000000-0000-0000-0000-000000000006', 'c4000000-0000-0000-0000-000000000003', 'Cafe', 1);

-- Poll 4: everyone-visible, OPEN, pre-loaded with 9 options
-- (positions 0-8) — the position-cap fixture. A 10th add should
-- succeed (position 9); an 11th should fail (position would be 10).
insert into public.polls (id, trip_id, question, visibility, created_by) values
  ('c4000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'Full poll — cap test', 'everyone', 'a4000000-0000-0000-0000-000000000001');
insert into public.poll_options (id, poll_id, label, position)
select gen_random_uuid(), 'c4000000-0000-0000-0000-000000000004', 'Option ' || g, g
from generate_series(0, 8) as g;

-- =============================================================
-- CASE 1: member M CAN add their OWN option to a visible OPEN poll.
-- The returned id resolves to a row with suggested_by = M's own seat.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  v_option_id uuid;
  v_suggested_by uuid;
begin
  select public.add_poll_option(
    'c4000000-0000-0000-0000-000000000001', 'Sunday brunch', 'f2000000-0000-0000-0000-000000000001'
  ) into v_option_id;

  select suggested_by_trip_member_id into v_suggested_by
  from public.poll_options where id = v_option_id;

  if v_suggested_by is distinct from 'a4000000-0000-0000-0000-000000000002' then
    raise exception 'CASE 1 FAILED: write-in not attributed to caller''s own seat (got %)', v_suggested_by;
  end if;
  raise notice 'CASE 1 PASSED: member M added a write-in attributed to their own seat';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 2: member M cannot spoof another member's (O's) suggested_by
-- via a raw INSERT.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.poll_options (poll_id, label, position, suggested_by_trip_member_id)
    values ('c4000000-0000-0000-0000-000000000001', 'Spoofed suggestion', 2, 'a4000000-0000-0000-0000-000000000004');
    raise exception 'CASE 2 FAILED: member M''s spoofed-suggester INSERT was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 2 PASSED: spoofed suggested_by_trip_member_id INSERT denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: member M cannot insert a NULL-attributed (organizer-looking)
-- option via the member policy. Neither policy matches: the member
-- policy's `in (select ...)` against a NOT NULL column never matches
-- NULL, and the organizer policy requires is_trip_organizer (false
-- for M).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.poll_options (poll_id, label, position, suggested_by_trip_member_id)
    values ('c4000000-0000-0000-0000-000000000001', 'Looks organizer-composed', 3, null);
    raise exception 'CASE 3 FAILED: member M''s NULL-attributed INSERT was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 3 PASSED: NULL-attributed INSERT denied for a non-organizer member (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 4: member M cannot add to a CLOSED poll (poll 3).
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.add_poll_option(
      'c4000000-0000-0000-0000-000000000003', 'Too late now', 'f2000000-0000-0000-0000-000000000002'
    );
    raise exception 'CASE 4 FAILED: add_poll_option on a CLOSED poll was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 4 PASSED: add_poll_option on a closed poll denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 5: celebrant C cannot add to a poll they can't see
-- (hide_from_celebrant, poll 2) — visibility gates INSERT too, not
-- just SELECT.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.add_poll_option(
      'c4000000-0000-0000-0000-000000000002', 'Wait, what surprise?', 'f2000000-0000-0000-0000-000000000003'
    );
    raise exception 'CASE 5 FAILED: celebrant''s add_poll_option on the hide_from_celebrant poll was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 5 PASSED: celebrant add_poll_option on the surprise poll denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 6: a non-member (N) of the trip is rejected by add_poll_option
-- itself (42501, "not a member of this trip") before any INSERT is
-- attempted.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.add_poll_option(
      'c4000000-0000-0000-0000-000000000001', 'Uninvited suggestion', 'f2000000-0000-0000-0000-000000000004'
    );
    raise exception 'CASE 6 FAILED: non-member N''s add_poll_option was NOT denied';
  exception
    when others then
      if sqlstate <> '42501' then
        raise exception 'CASE 6 FAILED: expected 42501, got % (%)', sqlstate, sqlerrm;
      end if;
      raise notice 'CASE 6 PASSED: non-member add_poll_option denied 42501 (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 7: the position cap holds. Poll 4 has 9 options (0-8) pre-
-- loaded. Member M's 10th add succeeds at position 9; the 11th add
-- (a different label, to rule out an idempotency-replay false pass)
-- fails.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  v_option_id uuid;
  v_position int;
  v_count int;
begin
  select public.add_poll_option(
    'c4000000-0000-0000-0000-000000000004', '10th option', 'f2000000-0000-0000-0000-000000000005'
  ) into v_option_id;

  select position into v_position from public.poll_options where id = v_option_id;
  if v_position <> 9 then
    raise exception 'CASE 7a FAILED: 10th option landed at position % (expected 9)', v_position;
  end if;

  select count(*) into v_count from public.poll_options where poll_id = 'c4000000-0000-0000-0000-000000000004';
  if v_count <> 10 then
    raise exception 'CASE 7a FAILED: poll 4 has % options (expected 10)', v_count;
  end if;
  raise notice 'CASE 7a PASSED: 10th write-in landed at position 9 (poll now has 10 options)';
end $$;

do $$
begin
  begin
    perform public.add_poll_option(
      'c4000000-0000-0000-0000-000000000004', '11th option — should not fit', 'f2000000-0000-0000-0000-000000000006'
    );
    raise exception 'CASE 7b FAILED: 11th add_poll_option on a full (10-option) poll was NOT denied';
  exception
    when others then
      -- #474 convention: the full-poll condition raises its OWN
      -- sqlstate (54000, program_limit_exceeded) — distinct from the
      -- label-length guard's 22023 — so the action layer can map by
      -- code alone, never message text.
      if sqlstate <> '54000' then
        raise exception 'CASE 7b FAILED: expected 54000 (poll full), got % (%)', sqlstate, sqlerrm;
      end if;
      raise notice 'CASE 7b PASSED: 11th add_poll_option denied 54000 — poll is full (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 8: organizer's create_poll_with_options path is unaffected —
-- still creates 2-4 organizer options (suggested_by NULL) within the
-- lifted 0-9 position range.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  v_poll_id uuid;
  v_count int;
  v_null_count int;
begin
  select public.create_poll_with_options(
    'aaaaaaaa-0000-0000-0000-0000000000a3',
    'Organizer-composed poll still works?',
    'everyone',
    null,
    'f2000000-0000-0000-0000-000000000007',
    '["Yes", "Obviously", "Ask again later"]'::jsonb
  ) into v_poll_id;

  select count(*) into v_count from public.poll_options where poll_id = v_poll_id;
  if v_count <> 3 then
    raise exception 'CASE 8 FAILED: organizer create_poll_with_options produced % options (expected 3)', v_count;
  end if;

  select count(*) into v_null_count from public.poll_options
    where poll_id = v_poll_id and suggested_by_trip_member_id is null;
  if v_null_count <> 3 then
    raise exception 'CASE 8 FAILED: organizer-composed options should all have NULL suggested_by (got % of 3)', v_null_count;
  end if;
  raise notice 'CASE 8 PASSED: create_poll_with_options still creates NULL-attributed organizer options';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 9: idempotency replay — a same-label resubmit from the same
-- suggester returns the ORIGINAL option id, not a new row.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

do $$
declare
  v_first uuid;
  v_replay uuid;
  v_count int;
begin
  select public.add_poll_option(
    'c4000000-0000-0000-0000-000000000001', 'Reservations at 8pm', 'f2000000-0000-0000-0000-000000000008'
  ) into v_first;
  -- Replay: same label, DIFFERENT idempotency key — still dedupes on
  -- (poll_id, suggester, label), not the key.
  select public.add_poll_option(
    'c4000000-0000-0000-0000-000000000001', 'Reservations at 8pm', 'f2000000-0000-0000-0000-000000000009'
  ) into v_replay;

  if v_first <> v_replay then
    raise exception 'CASE 9 FAILED: replay returned a different id (% vs %)', v_first, v_replay;
  end if;

  select count(*) into v_count from public.poll_options
    where poll_id = 'c4000000-0000-0000-0000-000000000001' and label = 'Reservations at 8pm';
  if v_count <> 1 then
    raise exception 'CASE 9 FAILED: replay produced % rows for the same label (expected 1)', v_count;
  end if;
  raise notice 'CASE 9 PASSED: same-label resubmit replayed the original option id';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 10: NO member — including the organizer, and including the
-- write-in's own suggester — can UPDATE a poll_options row. No UPDATE
-- policy exists at all (options are immutable once added). Table-level
-- UPDATE privilege IS granted (base schema default grants), so this is
-- filtered to 0 affected rows by RLS's default-deny (no policy => USING
-- false) rather than a permission-denied exception — unlike INSERT's
-- WITH CHECK, a bare UPDATE/DELETE with no matching policy just filters
-- silently. Confirm via row count, not an exception.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with updated as (
    update public.poll_options set label = 'edited after the fact'
    where id = 'd4000000-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into affected from updated;
  if affected <> 0 then
    raise exception 'CASE 10 FAILED: organizer was able to UPDATE a poll option (affected=%)', affected;
  end if;
  raise notice 'CASE 10 PASSED: UPDATE silently denied (0 rows) for everyone, incl. the organizer';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 11: NO member can DELETE a poll_options row, including their
-- own write-in. Same default-deny-by-filtering posture as CASE 10.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.poll_options where poll_id = 'c4000000-0000-0000-0000-000000000001'
      and suggested_by_trip_member_id = 'a4000000-0000-0000-0000-000000000002'
    returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 11 FAILED: member M was able to DELETE their own write-in (affected=%)', affected;
  end if;
  raise notice 'CASE 11 PASSED: DELETE silently denied (0 rows) for everyone, incl. the write-in''s own suggester';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 11 POLL WRITE-IN OPTION RLS CASES PASSED' as result;

rollback;
